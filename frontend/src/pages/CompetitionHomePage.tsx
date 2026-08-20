import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import api from '../api';
import type { Competition, GameweekSelectionsData, MyStatus, Fixture, Participant, PickHistoryItem } from '../types';
import type { AuthResponse } from '../types';
import toast from 'react-hot-toast';
import { formatDistanceToNow, isPast } from 'date-fns';
import clsx from 'clsx';
import html2canvas from 'html2canvas';
import { useCountdown } from '../hooks/useCountdown';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { usePushNotifications } from '../hooks/usePushNotifications';
import ConfirmDialog from '../components/ConfirmDialog';
import { MetricCard, StatusPill } from '../components/ui-primitives';
import SeoMeta from '../components/SeoMeta';

interface PickStat {
  teamId: number;
  teamName: string;
  teamShortName: string;
  pickCount: number;
  totalPicks: number;
  percentage: number;
}

type RiskLabel = 'Safe' | 'Balanced' | 'Differential';
type GameweekDisplayMode = 'cards' | 'route';

interface TeamRisk {
  label: RiskLabel;
  score: number;
  lowConfidence: boolean;
  source: 'odds' | 'crowd' | 'fallback';
  marketChance?: number | null;
  pickShare?: number | null;
  explanation: string;
}

function riskLabelText(risk: TeamRisk): string {
  if (risk.label === 'Safe') return 'Low risk';
  if (risk.label === 'Balanced') return 'Medium risk';
  return 'High risk';
}

function buildRiskExplanation(label: RiskLabel, hasOdds: boolean, marketChance?: number | null, pickShare?: number | null): string {
  const marketText = marketChance != null ? `Market gives this pick about ${marketChance}% to win.` : null;
  const crowdText = pickShare != null ? `${pickShare}% of players are on this team.` : null;
  const labelText = label === 'Safe'
    ? 'Safer profile: market strength is doing most of the work.'
    : label === 'Balanced'
      ? 'Balanced profile: playable, but not a free pass.'
      : 'Differential profile: higher upside if the crowd avoids it, but more knockout risk.';
  if (marketText && crowdText) return `${labelText} ${marketText} ${crowdText}`;
  if (marketText) return `${labelText} ${marketText}`;
  if (crowdText) return `${labelText} No live odds yet, so this uses pick share. ${crowdText}`;
  return hasOdds ? labelText : 'Limited data: waiting for odds or crowd data.';
}

function parseDate(value: string | number[]): Date {
  if (Array.isArray(value)) {
    const [y, mo, d, h = 0, mi = 0, s = 0] = value as number[];
    return new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  }
  const str = (value.endsWith('Z') || value.includes('+')) ? value : value + 'Z';
  return new Date(str);
}

function formatLockBadgeLabel(value: string | number[]): string {
  return `Locks ${formatDistanceToNow(parseDate(value), { addSuffix: true })
    .replace(/\bin about\b/i, 'in')
    .replace(/\babout\b\s*/i, '')}`;
}

/** Format a kickoff date in the browser's local timezone — e.g. "Apr 26" */
function formatKickoffDate(value: string | number[]): string {
  const d = parseDate(value);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Format a kickoff time in the browser's local timezone — e.g. "15:00" */
function formatKickoffTime(value: string | number[]): string {
  const d = parseDate(value);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
}

function hasPendingResultProcessing(fixtures: Fixture[] | undefined): boolean {
  if (!fixtures || fixtures.length === 0) return false;

  const byGameweek = new Map<number, Fixture[]>();
  for (const fixture of fixtures) {
    const list = byGameweek.get(fixture.gameweekId) ?? [];
    list.push(fixture);
    byGameweek.set(fixture.gameweekId, list);
  }

  for (const gameweekFixtures of byGameweek.values()) {
    const allResolved = gameweekFixtures.every((fixture) =>
      fixture.status === 'FINISHED' || fixture.status === 'POSTPONED' || fixture.status === 'CANCELLED'
    );
    if (allResolved && gameweekFixtures[0]?.gameweekStatus !== 'COMPLETED') {
      return true;
    }
  }

  return false;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function impliedFromDecimalOdds(home?: number | null, draw?: number | null, away?: number | null) {
  if (!home || !draw || !away || home <= 1 || draw <= 1 || away <= 1) return null;
  const h = 1 / home;
  const d = 1 / draw;
  const a = 1 / away;
  const total = h + d + a;
  if (total <= 0) return null;
  return {
    home: h / total,
    draw: d / total,
    away: a / total,
  };
}

function calculateTeamRisk(fixture: Fixture, side: 'home' | 'away', pickStat?: PickStat, gameweekStatus?: string): TeamRisk | null {
  if (gameweekStatus !== 'UPCOMING') return null;
  if (fixture.status === 'FINISHED' || fixture.status === 'POSTPONED' || fixture.status === 'CANCELLED') return null;
  const implied = side === 'home' ? fixture.oddsImpliedHome : fixture.oddsImpliedAway;
  const impliedFromOdds = impliedFromDecimalOdds(fixture.oddsHomeWin, fixture.oddsDraw, fixture.oddsAwayWin);
  const pRaw = implied ?? (side === 'home' ? impliedFromOdds?.home ?? NaN : impliedFromOdds?.away ?? NaN);
  const hasOdds = Number.isFinite(pRaw);
  const p = clamp01(hasOdds ? pRaw : NaN);

  if (!Number.isFinite(p) && !pickStat) {
    return null;
  }

  const oddsRisk = Number.isFinite(p) ? (1 - p) * 100 : null;
  const crowdRisk = pickStat ? (100 - pickStat.percentage) : null;
  const combinedRisk = oddsRisk == null
    ? crowdRisk
    : crowdRisk == null
      ? oddsRisk
      : (oddsRisk * 0.75) + (crowdRisk * 0.25);
  if (combinedRisk == null) return null;

  const rounded = Math.round(combinedRisk);
  const marketChance = Number.isFinite(p) ? Math.round(p * 100) : null;
  const pickShare = pickStat?.percentage ?? null;
  const label: RiskLabel = rounded <= 33 ? 'Safe' : rounded <= 66 ? 'Balanced' : 'Differential';
  return {
    label,
    score: rounded,
    lowConfidence: !hasOdds,
    source: hasOdds ? 'odds' : 'crowd',
    marketChance,
    pickShare,
    explanation: buildRiskExplanation(label, hasOdds, marketChance, pickShare),
  };
}

/** Fetches pick stats for a list of locked gameweek IDs, returning a Map<gwId, stats[]> */
function usePickStatsMap(compId: number, gwIds: number[]): { map: Map<number, PickStat[]>; isLoading: boolean } {
  const results = useQueries({
    queries: gwIds.map(gwId => ({
      queryKey: ['pick-stats', compId, gwId],
      queryFn: () => api.get(`/competitions/${compId}/gameweeks/${gwId}/pick-stats`).then(r => r.data as PickStat[]),
      staleTime: 60_000,
    })),
  });
  return useMemo(() => {
    const map = new Map<number, PickStat[]>();
    gwIds.forEach((gwId, i) => {
      const data = results[i]?.data;
      if (data) map.set(gwId, data);
    });
    return { map, isLoading: results.some((result) => result.isLoading && result.data === undefined) };
  }, [results, gwIds]);
}

export default function CompetitionHomePage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const compId = Number(id);
  const { user, loginWithData } = useAuth();
  const { resolvedTheme } = useTheme();
  // Base layer under the club-colour washes in the hero. The light theme needs a
  // light base, otherwise the club branding gradient sits on dark navy and the
  // light-theme CSS override has to clobber it entirely (losing the branding).
  const heroBaseGradient = resolvedTheme === 'light'
    ? 'linear-gradient(135deg,#ffffff,#eaf3fc)'
    : 'linear-gradient(135deg,rgba(15,23,42,0.98),rgba(8,15,30,0.94))';
  const { isSupported: browserAlertsSupported, isSubscribed: browserAlertsEnabled, subscribe, notify, permission } = usePushNotifications();

  // ── ALL hooks must be declared before any early returns ──────────
  const [collapsedWeeks, setCollapsedWeeks] = useState<Set<number>>(new Set());
  const [initialised, setInitialised] = useState(false);
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileInsightsOpen, setMobileInsightsOpen] = useState(false);
  const [mobileRulesOpen, setMobileRulesOpen] = useState(false);
  const [mobileReminderOpen, setMobileReminderOpen] = useState(false);
  const [snapshotSharing, setSnapshotSharing] = useState(false);
  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null);
  const [lifelineForGwId, setLifelineForGwId] = useState<number | null>(null);
  const [lifelineClearedForGwId, setLifelineClearedForGwId] = useState<number | null>(null);
  const [gameweekDisplayMode, setGameweekDisplayMode] = useState<GameweekDisplayMode>('cards');
  const [resetOpenConfirmOpen, setResetOpenConfirmOpen] = useState(false);
  const [joinedOptimistically, setJoinedOptimistically] = useState(false);
  const gameweekSnapshotRef = useRef<HTMLDivElement | null>(null);

  // Close share dropdown on outside click
  useEffect(() => {
    if (!shareOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-share-menu]')) setShareOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [shareOpen]);

  // Refresh user data on mount to ensure latest notification preferences are displayed
  useEffect(() => {
    // Silently refresh user data from server to pick up any changes made on other pages (e.g., profile updates)
    api.get<AuthResponse>('/auth/me').then(({ data }) => {
      loginWithData(data);
    }).catch(() => {
      // Ignore errors - use cached data if refresh fails
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem('lms.sidebarCollapsed');
    if (stored !== null) {
      setSidebarCollapsed(stored === 'true');
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem('lms.sidebarCollapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    const stored = window.localStorage.getItem('lms.web.gameweekDisplayMode');
    if (stored === 'cards' || stored === 'route') {
      setGameweekDisplayMode(stored);
    }
  }, []);

  const updateGameweekDisplayMode = (mode: GameweekDisplayMode) => {
    setGameweekDisplayMode(mode);
    window.localStorage.setItem('lms.web.gameweekDisplayMode', mode);
  };

  const { data: comp, isLoading: compLoading } = useQuery<Competition>({
    queryKey: ['competition', compId],
    queryFn: () => api.get(`/competitions/${compId}`).then((r) => r.data),
    staleTime: (query) => (query.state.data as Competition | undefined)?.status === 'COMPLETED' ? Infinity : 30_000,
    refetchInterval: (query) => {
      const competition = query.state.data as Competition | undefined;
      if (competition?.status === 'COMPLETED') return false;
      return hasPendingResultProcessing(queryClient.getQueryData<Fixture[]>(['fixtures', compId])) ? 300_000 : false;
    },
  });

  const { data: myEntries = [] } = useQuery<Participant[]>({
    queryKey: ['myEntries', compId],
    queryFn: () => api.get(`/competitions/${compId}/my-entries`).then((r) => Array.isArray(r.data) ? r.data : []),
    retry: false,
    staleTime: comp?.status === 'COMPLETED' ? Infinity : 30_000,
  });

  useEffect(() => {
    if (!myEntries.length) {
      setSelectedEntryId(null);
      return;
    }
    setSelectedEntryId((current) => {
      if (current && myEntries.some((entry) => entry.id === current)) return current;
      return myEntries[0].id;
    });
  }, [myEntries]);

  const { data: myStatus, isLoading: statusLoading } = useQuery<MyStatus>({
    queryKey: ['myStatus', compId, selectedEntryId],
    queryFn: () => api.get(`/competitions/${compId}/me`, {
      params: selectedEntryId ? { entryId: selectedEntryId } : undefined,
    }).then((r) => r.data),
    retry: false,
    staleTime: comp?.status === 'COMPLETED' ? Infinity : 30_000,
    refetchInterval: () => comp?.status === 'COMPLETED'
      ? false
      : hasPendingResultProcessing(queryClient.getQueryData<Fixture[]>(['fixtures', compId])) ? 300_000 : false,
  });

  const { data: fixtures, isLoading: fixturesLoading } = useQuery<Fixture[]>({
    queryKey: ['fixtures', compId],
    queryFn: () => api.get(`/competitions/${compId}/fixtures?weeks=99`).then((r) => r.data),
    staleTime: comp?.status === 'COMPLETED' ? Infinity : 30_000,
    // Keep polling for newly created upcoming competitions until fixtures appear,
    // then fall back to low-frequency polling only while a gameweek is live.
    refetchInterval: (query) => {
      if (comp?.status === 'COMPLETED') return false;
      const data = query.state.data as Fixture[] | undefined;
      if (comp?.status === 'UPCOMING' && (!data || data.length === 0)) {
        return 15_000;
      }
      const live = data?.some((f) => f.status === 'IN_PLAY');
      if (live) {
        return 300_000;
      }
      const inProgress = data?.some((f) => f.gameweekStatus === 'IN_PROGRESS');
      return inProgress ? 300_000 : false;
    },
  });

  const latestCompletedGwId = useMemo(() => {
    if (!fixtures || fixtures.length === 0) return null;
    const completedByWeek = new Map<number, number>();
    fixtures.forEach((f) => {
      if (f.gameweekStatus === 'COMPLETED') {
        completedByWeek.set(f.weekNumber, f.gameweekId);
      }
    });
    if (completedByWeek.size === 0) return null;
    const latestWeek = Math.max(...completedByWeek.keys());
    return completedByWeek.get(latestWeek) ?? null;
  }, [fixtures]);

  const latestNarrativeGwId = useMemo(() => {
    if (!fixtures || fixtures.length === 0) return null;
    const candidateByWeek = new Map<number, number>();
    fixtures.forEach((f) => {
      if ((f.gameweekStatus === 'IN_PROGRESS' || f.gameweekStatus === 'COMPLETED')
        && (f.status === 'FINISHED' || f.status === 'POSTPONED' || f.status === 'CANCELLED')) {
        candidateByWeek.set(f.weekNumber, f.gameweekId);
      }
    });
    if (candidateByWeek.size === 0) return null;
    const latestWeek = Math.max(...candidateByWeek.keys());
    return candidateByWeek.get(latestWeek) ?? null;
  }, [fixtures]);

  const { data: latestCompletedSelections } = useQuery<GameweekSelectionsData>({
    queryKey: ['gameweekSelections', compId, latestCompletedGwId],
    queryFn: () => api.get(`/competitions/${compId}/gameweeks/${latestCompletedGwId}/selections`).then((r) => r.data),
    enabled: !!latestCompletedGwId,
    staleTime: comp?.status === 'COMPLETED' ? Infinity : 30_000,
  });

  const { data: latestNarrativeSelections } = useQuery<GameweekSelectionsData>({
    queryKey: ['gameweekSelections', compId, latestNarrativeGwId],
    queryFn: () => api.get(`/competitions/${compId}/gameweeks/${latestNarrativeGwId}/selections`).then((r) => r.data),
    enabled: !!latestNarrativeGwId,
    staleTime: comp?.status === 'COMPLETED' ? Infinity : 30_000,
    refetchInterval: (query) => {
      if (comp?.status === 'COMPLETED') return false;
      const data = query.state.data as GameweekSelectionsData | undefined;
      const hasPending = data?.selections?.some((s) => s.outcome === 'PENDING');
      return hasPending ? 300_000 : false;
    },
  });

  // Collect gameweek IDs that are locked/in-progress/completed — for pick stats
  const lockedGwIds = useMemo(() => {
    if (!fixtures) return [];
    const seen = new Set<number>();
    const ids: number[] = [];
    for (const f of fixtures) {
      if (!seen.has(f.gameweekId) &&
          (f.gameweekStatus === 'LOCKED' || f.gameweekStatus === 'IN_PROGRESS' || f.gameweekStatus === 'COMPLETED')) {
        seen.add(f.gameweekId);
        ids.push(f.gameweekId);
      }
    }
    return ids;
  }, [fixtures]);

  const { map: pickStatsByGwId } = usePickStatsMap(compId, lockedGwIds);
  const resolvedGwIdsForBye = useMemo(() => {
    if (!fixtures) return [] as number[];
    const seen = new Set<number>();
    const ids: number[] = [];
    for (const f of fixtures) {
      if ((f.gameweekStatus === 'IN_PROGRESS' || f.gameweekStatus === 'COMPLETED') && !seen.has(f.gameweekId)) {
        seen.add(f.gameweekId);
        ids.push(f.gameweekId);
      }
    }
    return ids;
  }, [fixtures]);
  const byeStatusResults = useQueries({
    queries: resolvedGwIdsForBye.map((gwId) => ({
      queryKey: ['gameweekSelections', compId, gwId],
      queryFn: () => api.get<GameweekSelectionsData | GameweekSelectionsData['selections']>(`/competitions/${compId}/gameweeks/${gwId}/selections`).then((r) => {
        if (Array.isArray(r.data)) return { selections: r.data, byeGranted: false, weekNumber: 0 } as GameweekSelectionsData;
        return r.data;
      }),
      staleTime: comp?.status === 'COMPLETED' ? Infinity : 30_000,
      enabled: Number.isFinite(compId),
    })),
  });
  const byeGrantedByGwId = useMemo(() => {
    const map = new Map<number, boolean>();
    resolvedGwIdsForBye.forEach((gwId, index) => {
      const data = byeStatusResults[index]?.data as GameweekSelectionsData | undefined;
      if (data) map.set(gwId, Boolean(data.byeGranted));
    });
    return map;
  }, [byeStatusResults, resolvedGwIdsForBye]);
  const resultsProcessing = hasPendingResultProcessing(fixtures);
  const openSelectionIds = useMemo(() => {
    if (!myStatus || !fixtures?.length) return [];
    const fixtureByGameweekId = new Map(fixtures.map((fixture) => [fixture.gameweekId, fixture]));
    return myStatus.picks
      .filter((pick) => {
        const gwFixture = fixtureByGameweekId.get(pick.gameweekId);
        if (!gwFixture) return false;
        if (gwFixture.gameweekStatus !== 'UPCOMING') return false;
        return parseDate(gwFixture.gameweekLockAt).getTime() > Date.now();
      })
      .map((pick) => pick.pickId);
  }, [fixtures, myStatus]);
  const openSelectionCount = openSelectionIds.length;

  const joinMutation = useMutation({
    mutationFn: () => api.post(`/competitions/${compId}/join`),
    onSuccess: () => {
      setJoinedOptimistically(true);
      const competitionName = comp?.name ?? 'competition';
      if ((comp?.entryFee ?? 0) > 0 && comp?.paymentMode !== 'FREE') {
        toast(`You've registered for ${competitionName}. Please pay the organiser directly.`, { icon: '💸', duration: 8000 });
      } else {
        toast.success('Joined competition!');
      }
      queryClient.invalidateQueries({ queryKey: ['competition', compId] });
      queryClient.invalidateQueries({ queryKey: ['myEntries', compId] });
      queryClient.invalidateQueries({ queryKey: ['myStatus', compId] });
      queryClient.invalidateQueries({ queryKey: ['competitions', 'my', 'details'] });
      queryClient.invalidateQueries({ queryKey: ['competitions', 'upcoming'] });
      queryClient.invalidateQueries({ queryKey: ['competitions'] });
    },
    onError: (err: any) => {
      setJoinedOptimistically(false);
      toast.error(err.response?.data?.message || 'Failed to join competition');
    },
  });

  const handleDirectJoin = () => {
    if (!comp) return;
    joinMutation.mutate();
  };

  const hasParticipantRecord = Boolean(myStatus?.participant);

  useEffect(() => {
    setJoinedOptimistically(false);
  }, [compId]);

  useEffect(() => {
    if (hasParticipantRecord && joinedOptimistically) {
      setJoinedOptimistically(false);
    }
  }, [hasParticipantRecord, joinedOptimistically]);

  const pickMutation = useMutation({
    mutationFn: ({ gwId, teamId, useLifeline }: { gwId: number; teamId: number; useLifeline: boolean }) =>
      api.post(`/competitions/${compId}/gameweeks/${gwId}/pick`, {
        teamId,
        entryId: selectedEntryId ?? undefined,
        useLifeline,
      }),
    onMutate: async ({ gwId, teamId, useLifeline }) => {
      // Cancel any in-flight refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: ['myStatus', compId, selectedEntryId] });

      // Snapshot the previous value for rollback
      const previous = queryClient.getQueryData<MyStatus>(['myStatus', compId, selectedEntryId]);

      // Find team details from fixtures cache
      const fixturesData = queryClient.getQueryData<Fixture[]>(['fixtures', compId]);
      const fixture = fixturesData?.find(
        (f) => f.homeTeamId === teamId || f.awayTeamId === teamId
      );
      const teamName = fixture
        ? fixture.homeTeamId === teamId ? fixture.homeTeamName : fixture.awayTeamName
        : '';
      const teamShortName = fixture
        ? fixture.homeTeamId === teamId ? fixture.homeTeamShortName : fixture.awayTeamShortName
        : '';

      // Optimistically update myStatus immediately
      if (previous) {
        const existingPickIndex = previous.picks.findIndex((p) => p.gameweekId === gwId);
        const newPick = {
          pickId: -1, // temporary
          gameweekId: gwId,
          weekNumber: fixturesData?.find((f) => f.gameweekId === gwId)?.weekNumber ?? 0,
          teamId,
          teamName,
          teamShortName,
          locked: false,
          source: 'USER' as const,
          useLifeline,
          outcome: 'PENDING' as const,
          pickedAt: new Date().toISOString(),
          resolvedAt: null,
        };
        const updatedPicks =
          existingPickIndex >= 0
            ? previous.picks.map((p, i) => (i === existingPickIndex ? newPick : p))
            : [...previous.picks, newPick];

        queryClient.setQueryData<MyStatus>(['myStatus', compId, selectedEntryId], {
          ...previous,
          picks: updatedPicks,
          usedTeamIds: [...(previous.usedTeamIds ?? []).filter((id) => {
            // Remove the previously picked team for this gw from usedTeamIds if changing pick
            if (existingPickIndex >= 0) {
              return id !== previous.picks[existingPickIndex].teamId;
            }
            return true;
          }), teamId],
        });
      }

      return { previous };
    },
    onSuccess: (_data, variables) => {
      if (variables.useLifeline) {
        setLifelineClearedForGwId(null);
        setLifelineForGwId(variables.gwId);
      } else {
        setLifelineForGwId((current) => (current === variables.gwId ? null : current));
        setLifelineClearedForGwId(variables.gwId);
      }
      // Refresh in background to get the real server state
      queryClient.invalidateQueries({ queryKey: ['myStatus', compId, selectedEntryId] });
      queryClient.invalidateQueries({ queryKey: ['competitions', 'my', 'details'] });
      queryClient.invalidateQueries({ queryKey: ['competitions', 'upcoming'] });
    },
    onError: (err: any, _vars, context) => {
      // Roll back to previous state on error
      if (context?.previous) {
        queryClient.setQueryData(['myStatus', compId, selectedEntryId], context.previous);
      }
      toast.error(err.response?.data?.message || 'Failed to save pick');
    },
  });

  const resetOpenSelectionsMutation = useMutation({
    mutationFn: (_count: number) => api.delete(`/competitions/${compId}/picks/open`),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['myStatus', compId, selectedEntryId] });
      const previous = queryClient.getQueryData<MyStatus>(['myStatus', compId, selectedEntryId]);
      if (previous && openSelectionIds.length > 0) {
        const remainingPicks = previous.picks.filter((pick) => !openSelectionIds.includes(pick.pickId));
        queryClient.setQueryData<MyStatus>(['myStatus', compId, selectedEntryId], {
          ...previous,
          picks: remainingPicks,
          usedTeamIds: Array.from(new Set(remainingPicks.map((pick) => pick.teamId))),
        });
      }
      return { previous };
    },
    onSuccess: (_data, count: number) => {
      toast.success(count === 1 ? 'Reset 1 open selection' : `Reset ${count} open selections`);
      queryClient.invalidateQueries({ queryKey: ['myStatus', compId, selectedEntryId] });
      queryClient.invalidateQueries({ queryKey: ['competitions', 'my', 'details'] });
      queryClient.invalidateQueries({ queryKey: ['competitions', 'upcoming'] });
    },
    onError: (err: any, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['myStatus', compId, selectedEntryId], context.previous);
      }
      toast.error(err.response?.data?.message || 'Could not reset open selections');
    },
  });

  // Once fixtures load, expand the active/current gameweek by default (all others collapsed)
  useEffect(() => {
    if (!fixtures || fixtures.length === 0 || initialised) return;
    const collapsed = new Set<number>();
    
    // Get unique week numbers sorted
    const weekNumbers = [...new Set(fixtures.map(f => f.weekNumber))].sort((a, b) => a - b);
    
    // Find the current/active gameweek (first non-completed one)
    let currentWeek = weekNumbers.find(wn => {
      const gwFixture = fixtures.find(f => f.weekNumber === wn);
      return gwFixture && gwFixture.gameweekStatus !== 'COMPLETED';
    });
    
    // If all completed or no active found, default to the last one
    if (!currentWeek && weekNumbers.length > 0) {
      currentWeek = weekNumbers[weekNumbers.length - 1];
    }
    
    // Collapse all except the current/active gameweek
    weekNumbers.forEach((wn) => {
      if (wn !== currentWeek) collapsed.add(wn);
    });
    
    setCollapsedWeeks(collapsed);
    setInitialised(true);
  }, [fixtures, initialised]);

  // Compute next lock date from fixtures (needed for useCountdown hook which must be before early returns)
  const nextLockDateForHook = useMemo(() => {
    if (comp?.status === 'COMPLETED' || !fixtures || fixtures.length === 0) return null;
    const sortedByWeek = [...new Set(fixtures.map(f => f.weekNumber))].sort((a, b) => a - b);
    for (const wn of sortedByWeek) {
      const f = fixtures.find(fx => fx.weekNumber === wn);
      if (!f) continue;
      if (f.gameweekStatus === 'UPCOMING' || f.gameweekStatus === 'LOCKED') {
        const d = parseDate(f.gameweekLockAt);
        if (!isPast(d)) return d;
      }
    }
    return null;
  }, [comp?.status, fixtures]);

  // Hook must be called unconditionally — before any early returns
  const countdown = useCountdown(nextLockDateForHook);

  useEffect(() => {
    if (comp?.status !== 'UPCOMING' && shareOpen) {
      setShareOpen(false);
    }
  }, [comp?.status, shareOpen]);

  if (compLoading || statusLoading) {
    return (
      <div className="space-y-8 animate-pulse">
        {/* Header skeleton */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="h-3 w-24 bg-surface-600 rounded" />
            <div className="h-8 w-64 bg-surface-600 rounded" />
            <div className="h-4 w-32 bg-surface-700 rounded" />
          </div>
          <div className="h-10 w-32 bg-surface-600 rounded-lg" />
        </div>
        {/* Stats skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-4 space-y-2">
              <div className="h-3 w-16 bg-surface-600 rounded" />
              <div className="h-6 w-10 bg-surface-600 rounded" />
            </div>
          ))}
        </div>
        {/* Gameweek skeleton */}
        <div className="card p-4 space-y-4">
          <div className="h-5 w-32 bg-surface-600 rounded" />
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex justify-between items-center py-2 border-b border-gray-700/50">
              <div className="h-4 w-28 bg-surface-700 rounded" />
              <div className="h-4 w-16 bg-surface-700 rounded" />
              <div className="h-4 w-16 bg-surface-700 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!comp) {
    return <div className="card py-16 text-center"><p className="text-red-400">Competition not found</p></div>;
  }

  const participant = myStatus?.participant;
  const selectedEntryNumber = participant?.entryNumber ?? myEntries.find((entry) => entry.id === selectedEntryId)?.entryNumber ?? null;
  const selectedEntryLabel = myEntries.length > 1 && selectedEntryNumber ? `Entry #${selectedEntryNumber}` : null;
  const isParticipant = !!participant;
  const hasConfirmedParticipation = isParticipant || joinedOptimistically;
  const maxEntriesPerUser = Math.max(1, comp.maxEntriesPerUser ?? 1);
  const canAddAnotherEntry = comp.status === 'UPCOMING' && myEntries.length > 0 && myEntries.length < maxEntriesPerUser;
  const additionalEntriesRemaining = Math.max(maxEntriesPerUser - myEntries.length, 0);
  const isEliminated = participant?.status === 'ELIMINATED';
  const isWinner = participant?.status === 'WINNER';
  const canInvite = comp.status === 'UPCOMING';
  const paymentState = participant?.paymentState;
  const awaitingPayment = paymentState === 'AWAITING_PAYMENT';
  const strictManualPayment = comp.paymentMode === 'MANUAL' && comp.manualPaymentPolicy !== 'LENIENT';
  const joinPath = comp.joinCode
    ? `/invite/${encodeURIComponent(comp.joinCode)}`
    : `/competitions?join=${encodeURIComponent(String(compId))}`;
  const joinLink = `${window.location.origin}${joinPath}`;
  const shareText = comp.joinCode
    ? `Join me in ${comp.name} on Last Man Standing! Use code ${comp.joinCode}.`
    : `Join me in ${comp.name} on Last Man Standing!`;
  const shareMessage = comp.joinCode
    ? `Join me in ${comp.name} on Last Man Standing!\nUse code ${comp.joinCode}\n${joinLink}`
    : `Join me in ${comp.name} on Last Man Standing!\n${joinLink}`;
  const qrUrl = comp.joinCode
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(joinLink)}`
    : null;

  const handleNativeShare = async () => {
    if (!navigator.share) {
      try {
        await navigator.clipboard.writeText(joinLink);
        toast.success('Link copied!');
        setShareOpen(false);
      } catch {
        toast.error('Could not copy');
      }
      return;
    }
    try {
      await navigator.share({
        title: comp.name,
        text: shareText,
        url: joinLink,
      });
      setShareOpen(false);
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        toast.error('Share failed');
      }
    }
  };

  const prefetchGameweekViews = (gwId: number) => {
    void queryClient.prefetchQuery({
      queryKey: ['selections', compId, gwId],
      queryFn: () =>
        api.get(`/competitions/${compId}/gameweeks/${gwId}/selections`).then((r) => {
          if (Array.isArray(r.data)) return { selections: r.data, byeGranted: false, weekNumber: 0 };
          return r.data;
        }),
      staleTime: comp?.status === 'COMPLETED' ? Infinity : 30_000,
    });
    void queryClient.prefetchQuery({
      queryKey: ['gameweekSelections', compId, gwId],
      queryFn: () =>
        api.get(`/competitions/${compId}/gameweeks/${gwId}/selections`).then((r) => {
          if (Array.isArray(r.data)) return { selections: r.data, byeGranted: false, weekNumber: 0 };
          return r.data;
        }),
      staleTime: comp?.status === 'COMPLETED' ? Infinity : 30_000,
    });
    void queryClient.prefetchQuery({
      queryKey: ['fixtures', compId, gwId],
      queryFn: () => api.get(`/competitions/${compId}/gameweeks/${gwId}/fixtures`).then((r) => (Array.isArray(r.data) ? r.data : [])),
      staleTime: comp?.status === 'COMPLETED' ? Infinity : 30_000,
    });
  };

  // Build a map of gameweekId -> pick for this user
  const pickByGwId = new Map<number, { teamId: number; teamName: string; teamShortName: string; locked: boolean; useLifeline?: boolean; outcome: string }>();
  myStatus?.picks.forEach((p) => {
    pickByGwId.set(p.gameweekId, {
      teamId: p.teamId,
      teamName: p.teamName,
      teamShortName: p.teamShortName,
      locked: p.locked,
      useLifeline: p.useLifeline,
      outcome: p.outcome,
    });
  });
  const savedLifelineGameweekId = myStatus?.picks.find((p) => p.useLifeline)?.gameweekId ?? null;
  const effectiveLifelineGameweekId = lifelineForGwId ?? (lifelineClearedForGwId != null ? null : savedLifelineGameweekId);

  // Group fixtures by gameweek — store real lockAt and status from backend
  const fixturesByWeek = new Map<number, { gwId: number; lockAt: string; gwStatus: string; gwVoided: boolean; gwVoidReason?: string | null; fixtures: Fixture[] }>();
  fixtures?.forEach((f) => {
    if (!fixturesByWeek.has(f.weekNumber)) {
      fixturesByWeek.set(f.weekNumber, {
        gwId: f.gameweekId,
        lockAt: f.gameweekLockAt,
        gwStatus: f.gameweekStatus,
        gwVoided: Boolean(f.gameweekVoided),
        gwVoidReason: f.gameweekVoidReason,
        fixtures: [],
      });
    }
    fixturesByWeek.get(f.weekNumber)!.fixtures.push(f);
  });
  const fixtureMetaByGwId = new Map<number, { gwStatus: string; lockAt: string }>();
  fixturesByWeek.forEach((gw) => {
    fixtureMetaByGwId.set(gw.gwId, { gwStatus: gw.gwStatus, lockAt: gw.lockAt });
  });

  // Split team usage into consumed vs reserved:
  // consumed = already in locked/in-progress/completed rounds
  // reserved = selected in future upcoming rounds
  const consumedTeamIds = new Set<number>();
  const reservedTeamIds = new Set<number>();
  myStatus?.picks.forEach((p) => {
    const gwMeta = fixtureMetaByGwId.get(p.gameweekId);
    const isUpcoming = gwMeta?.gwStatus === 'UPCOMING';
    if (isUpcoming && !p.locked) {
      reservedTeamIds.add(p.teamId);
    } else {
      consumedTeamIds.add(p.teamId);
    }
  });
  const sortedWeeks = [...fixturesByWeek.keys()].sort((a, b) => a - b);
  const liveOutcomeByGwTeam = new Map<string, string>();
  if (fixtures) {
    for (const f of fixtures) {
      const gwId = f.gameweekId;
      if (f.status === 'POSTPONED' || f.status === 'CANCELLED') {
        liveOutcomeByGwTeam.set(`${gwId}:${f.homeTeamId}`, 'POSTPONED_ADVANCE');
        liveOutcomeByGwTeam.set(`${gwId}:${f.awayTeamId}`, 'POSTPONED_ADVANCE');
        continue;
      }
      if (f.status !== 'FINISHED' || f.scoreHome == null || f.scoreAway == null) continue;
      if (f.scoreHome > f.scoreAway) {
        liveOutcomeByGwTeam.set(`${gwId}:${f.homeTeamId}`, 'ADVANCE');
        liveOutcomeByGwTeam.set(`${gwId}:${f.awayTeamId}`, 'ELIMINATED');
      } else if (f.scoreHome < f.scoreAway) {
        liveOutcomeByGwTeam.set(`${gwId}:${f.homeTeamId}`, 'ELIMINATED');
        liveOutcomeByGwTeam.set(`${gwId}:${f.awayTeamId}`, 'ADVANCE');
      } else {
        liveOutcomeByGwTeam.set(`${gwId}:${f.homeTeamId}`, 'ELIMINATED');
        liveOutcomeByGwTeam.set(`${gwId}:${f.awayTeamId}`, 'ELIMINATED');
      }
    }
  }
  const effectivePickOutcome = (pick: { outcome: string; gameweekId: number; teamId: number }) => {
    if (pick.outcome !== 'PENDING') return pick.outcome;
    return liveOutcomeByGwTeam.get(`${pick.gameweekId}:${pick.teamId}`) ?? 'PENDING';
  };
  const derivedEliminatedWeek =
    participant?.eliminatedWeek
    ?? myStatus?.picks
      ?.filter((p) => effectivePickOutcome(p) === 'ELIMINATED')
      ?.sort((a, b) => a.weekNumber - b.weekNumber)?.[0]?.weekNumber
    ?? null;
  const pickHistoryOutcome = (pick: { outcome: string; gameweekId: number; teamId: number; weekNumber: number }) => {
    if (derivedEliminatedWeek != null && pick.weekNumber > derivedEliminatedWeek) {
      return 'OUT';
    }
    return effectivePickOutcome(pick);
  };
  const uniqueTeamIds = new Set<number>();
  const teamLogoById = new Map<number, string | null | undefined>();
  fixtures?.forEach((f) => {
    uniqueTeamIds.add(f.homeTeamId);
    uniqueTeamIds.add(f.awayTeamId);
    teamLogoById.set(f.homeTeamId, f.homeTeamLogoUrl);
    teamLogoById.set(f.awayTeamId, f.awayTeamLogoUrl);
  });
  const totalTeamsCount = uniqueTeamIds.size;
  const remainingTeamsCount = totalTeamsCount > 0 ? Math.max(totalTeamsCount - consumedTeamIds.size, 0) : null;

  const upcomingWeek = sortedWeeks
    .map((wn) => ({ weekNumber: wn, data: fixturesByWeek.get(wn)! }))
    .find(({ data }) => {
      const lockDate = parseDate(data.lockAt);
      return data.gwStatus === 'UPCOMING' && !isPast(lockDate);
    });

  const inProgressWeek = sortedWeeks
    .map((wn) => ({ weekNumber: wn, data: fixturesByWeek.get(wn)! }))
    .find(({ data }) => data.gwStatus === 'IN_PROGRESS');

  const openWeekWithoutPick = isParticipant && !isEliminated && !isWinner
    ? sortedWeeks
        .map((wn) => ({ weekNumber: wn, data: fixturesByWeek.get(wn)! }))
        .find(({ data }) => {
          const lockDate = parseDate(data.lockAt);
          return data.gwStatus === 'UPCOMING' && !isPast(lockDate) && !pickByGwId.has(data.gwId);
        })
    : undefined;

  const openWeekWithPick = isParticipant && !isEliminated && !isWinner
    ? sortedWeeks
        .map((wn) => ({ weekNumber: wn, data: fixturesByWeek.get(wn)! }))
        .find(({ data }) => {
          const lockDate = parseDate(data.lockAt);
          return data.gwStatus === 'UPCOMING' && !isPast(lockDate) && pickByGwId.has(data.gwId);
        })
    : undefined;

  const latestResolvedPick = myStatus?.picks
    .filter((p) => p.outcome !== 'PENDING')
    .sort((a, b) => b.weekNumber - a.weekNumber)[0];

  const latestCompletedWeek = [...sortedWeeks]
    .reverse()
    .map((weekNumber) => ({ weekNumber, data: fixturesByWeek.get(weekNumber)! }))
    .find(({ data }) => data.gwStatus === 'COMPLETED');

  const latestNarrativeWeek = [...sortedWeeks]
    .reverse()
    .map((weekNumber) => ({ weekNumber, data: fixturesByWeek.get(weekNumber)! }))
    .find(({ data }) =>
      (data.gwStatus === 'IN_PROGRESS' || data.gwStatus === 'COMPLETED')
      && data.fixtures.some((fixture) =>
        fixture.status === 'FINISHED' || fixture.status === 'POSTPONED' || fixture.status === 'CANCELLED'
      )
    ) ?? latestCompletedWeek;
  const pulseLatestWeek = inProgressWeek ?? latestCompletedWeek;

  const latestNarrativeTeamIds = new Set<number>();
  latestNarrativeWeek?.data.fixtures.forEach((fixture) => {
    latestNarrativeTeamIds.add(fixture.homeTeamId);
    latestNarrativeTeamIds.add(fixture.awayTeamId);
  });

  const latestNarrativeStats = latestNarrativeWeek && !latestNarrativeWeek.data.gwVoided
    ? [...(pickStatsByGwId.get(latestNarrativeWeek.data.gwId) ?? [])]
        .filter((stat) => latestNarrativeTeamIds.has(stat.teamId))
        .sort((a, b) => b.pickCount - a.pickCount)
    : [];

  const liveInsightWeek = inProgressWeek
    ?? [...sortedWeeks]
        .reverse()
        .map((weekNumber) => ({ weekNumber, data: fixturesByWeek.get(weekNumber)! }))
        .find(({ data }) => data.gwStatus === 'LOCKED');

  const liveInsightTeamIds = new Set<number>();
  liveInsightWeek?.data.fixtures.forEach((fixture) => {
    liveInsightTeamIds.add(fixture.homeTeamId);
    liveInsightTeamIds.add(fixture.awayTeamId);
  });

  const liveInsightStats = liveInsightWeek
    ? [...(pickStatsByGwId.get(liveInsightWeek.data.gwId) ?? [])]
        .filter((stat) => liveInsightTeamIds.has(stat.teamId))
        .sort((a, b) => b.pickCount - a.pickCount)
    : [];

  const narrativeTeamResults = new Map<number, 'WIN' | 'LOSS' | 'DRAW' | 'POSTPONED'>();
  if (latestNarrativeWeek && !latestNarrativeWeek.data.gwVoided) {
    latestNarrativeWeek.data.fixtures.forEach((fixture) => {
      if (fixture.status === 'POSTPONED' || fixture.status === 'CANCELLED') {
        narrativeTeamResults.set(fixture.homeTeamId, 'POSTPONED');
        narrativeTeamResults.set(fixture.awayTeamId, 'POSTPONED');
        return;
      }
      if (fixture.status !== 'FINISHED' || fixture.scoreHome == null || fixture.scoreAway == null) {
        return;
      }
      if (fixture.scoreHome > fixture.scoreAway) {
        narrativeTeamResults.set(fixture.homeTeamId, 'WIN');
        narrativeTeamResults.set(fixture.awayTeamId, 'LOSS');
      } else if (fixture.scoreHome < fixture.scoreAway) {
        narrativeTeamResults.set(fixture.homeTeamId, 'LOSS');
        narrativeTeamResults.set(fixture.awayTeamId, 'WIN');
      } else {
        narrativeTeamResults.set(fixture.homeTeamId, 'DRAW');
        narrativeTeamResults.set(fixture.awayTeamId, 'DRAW');
      }
    });
  }

  const mostBackedTeam = latestNarrativeStats[0];
  const crowdReadTeam = liveInsightStats[0] ?? mostBackedTeam;
  const losingPickedTeam = latestNarrativeStats.find((stat) => narrativeTeamResults.get(stat.teamId) === 'LOSS');
  const contrarianSurvivor = [...latestNarrativeStats]
    .reverse()
    .find((stat) => {
      const result = narrativeTeamResults.get(stat.teamId);
      return stat.pickCount > 0 && (result === 'WIN' || result === 'POSTPONED');
    });
  const survivingPickedTeams = latestNarrativeStats.filter((stat) => {
    const result = narrativeTeamResults.get(stat.teamId);
    return result === 'WIN' || result === 'POSTPONED';
  });
  const losingPickedTeams = latestNarrativeStats.filter((stat) => narrativeTeamResults.get(stat.teamId) === 'LOSS');
  const totalResolvedPicks = latestNarrativeStats.reduce((sum, stat) => sum + stat.pickCount, 0);
  const survivingResolvedPicks = survivingPickedTeams.reduce((sum, stat) => sum + stat.pickCount, 0);
  const computedWeeklySurvivalRate = totalResolvedPicks > 0
    ? Math.round((survivingResolvedPicks / totalResolvedPicks) * 100)
    : null;
  const latestSelections = latestNarrativeSelections?.selections ?? latestCompletedSelections?.selections ?? [];
  const resolvedSelections = latestSelections.filter((sel) => sel.outcome !== 'PENDING');
  const gwPickedCount = resolvedSelections.length;
  const gwPendingSelectionCount = Math.max(latestSelections.length - resolvedSelections.length, 0);
  const gwAdvancedCount = resolvedSelections.filter((sel) => sel.outcome === 'ADVANCE' || sel.outcome === 'POSTPONED_ADVANCE').length;
  const gwEliminatedFromSelections = resolvedSelections.filter((sel) => sel.outcome === 'ELIMINATED').length;
  const gwSurvivalFromSelections = gwPickedCount > 0
    ? Math.round((gwAdvancedCount / gwPickedCount) * 100)
    : null;
  const gwActiveAtStart = latestNarrativeSelections?.activeAtStart ?? latestCompletedSelections?.activeAtStart ?? null;
  const gwAdvancedThisWeek = latestNarrativeSelections?.advancedThisWeek ?? latestCompletedSelections?.advancedThisWeek ?? null;
  const gwEliminatedThisWeek = latestNarrativeSelections?.eliminatedThisWeek ?? latestCompletedSelections?.eliminatedThisWeek ?? null;
  const gwSurvivalFromBackend = (gwActiveAtStart != null && gwAdvancedThisWeek != null && gwActiveAtStart > 0)
    ? Math.round((gwAdvancedThisWeek / gwActiveAtStart) * 100)
    : null;
  const narrativeWeekLabel = latestNarrativeWeek ? `Gameweek ${latestNarrativeWeek.weekNumber}` : null;
  const narrativeWeekInProgress = latestNarrativeWeek?.data.gwStatus === 'IN_PROGRESS';
  const narrativeWeekVoided = Boolean(latestNarrativeWeek?.data.gwVoided);
  const narrativeWeekByeGranted = Boolean((latestNarrativeSelections?.byeGranted ?? latestCompletedSelections?.byeGranted) && !narrativeWeekVoided);
  let weeklySurvivalRate = narrativeWeekInProgress
    ? (gwSurvivalFromSelections ?? computedWeeklySurvivalRate)
    : (gwSurvivalFromBackend ?? gwSurvivalFromSelections ?? computedWeeklySurvivalRate);
  let weeklyPickedCount = narrativeWeekInProgress
    ? (gwPickedCount || totalResolvedPicks || 0)
    : (gwActiveAtStart ?? (gwPickedCount || totalResolvedPicks || 0));
  let weeklyAdvancedCount = narrativeWeekInProgress
    ? (gwAdvancedCount || survivingResolvedPicks || 0)
    : (gwAdvancedThisWeek ?? (gwAdvancedCount || survivingResolvedPicks || 0));
  let weeklyEliminatedCount = narrativeWeekInProgress
    ? (gwEliminatedFromSelections || (weeklyPickedCount > 0 ? Math.max(weeklyPickedCount - weeklyAdvancedCount, 0) : 0))
    : (gwEliminatedThisWeek ?? (weeklyPickedCount > 0 ? Math.max(weeklyPickedCount - weeklyAdvancedCount, 0) : 0));
  if (narrativeWeekVoided) {
    weeklyPickedCount = gwActiveAtStart ?? (comp.activeCount ?? 0);
    weeklyAdvancedCount = weeklyPickedCount;
    weeklyEliminatedCount = 0;
    weeklySurvivalRate = weeklyPickedCount > 0 ? 100 : null;
  }
  const biggestCasualty = narrativeWeekVoided ? null : weeklyEliminatedCount > 0 ? losingPickedTeam : null;
  const doomedPickedTeams = narrativeWeekVoided ? [] : weeklyEliminatedCount > 0 ? losingPickedTeams : [];
  const weekSelectionsForChanges = latestNarrativeSelections?.selections ?? latestCompletedSelections?.selections ?? [];
  const lifelinesPlayedThisWeek = narrativeWeekVoided ? 0 : weekSelectionsForChanges.filter((selection) => selection.useLifeline).length;
  const baseEliminatedCount = Math.max((comp.participantCount ?? 0) - (comp.activeCount ?? 0), 0);
  const liveWeekExtraEliminations = latestNarrativeWeek?.data.gwStatus === 'IN_PROGRESS' ? gwEliminatedFromSelections : 0;
  const effectiveEliminatedCount = Math.min(baseEliminatedCount + liveWeekExtraEliminations, comp.participantCount ?? 0);
  const effectiveActiveCount = Math.max((comp.participantCount ?? 0) - effectiveEliminatedCount, 0);
  const survivalRate = comp.participantCount > 0
    ? Math.max(Math.round((effectiveActiveCount / comp.participantCount) * 100), effectiveActiveCount > 0 ? 1 : 0)
    : 0;
  const narrativeFixtureCount = latestNarrativeWeek?.data.fixtures.length ?? 0;
  const narrativeResolvedFixtureCount = latestNarrativeWeek?.data.fixtures.filter((fixture) =>
    fixture.status === 'FINISHED' || fixture.status === 'POSTPONED' || fixture.status === 'CANCELLED'
  ).length ?? 0;
  const narrativePendingFixtureCount = Math.max(narrativeFixtureCount - narrativeResolvedFixtureCount, 0);

  const hasWinner = comp?.status === 'COMPLETED'
    || (comp.activeCount === 1 && (comp.participantCount ?? 0) > 1);
  const copyVariantSeed = Number(comp.id ?? 0) + (pulseLatestWeek?.weekNumber ?? latestNarrativeWeek?.weekNumber ?? 0);
  const pickCopyVariant = (options: string[], offset: number) => options[(Math.abs(copyVariantSeed + offset) % options.length)];

  let storylineTitle = pickCopyVariant([
    'Competition pressure is building',
    'The margins are tightening',
    'Every round is starting to matter more',
    'The field is entering pressure time',
  ], 101);
  let storylineBody = comp.status === 'UPCOMING'
    ? pickCopyVariant([
        'Registration is open and the first real pressure point is the next lock.',
        'Entries are still open, but urgency begins at the next lock deadline.',
        'The competition is open; the first true decision point is the upcoming lock.',
      ], 102)
    : pickCopyVariant([
        'The next pick window is where this competition starts to separate cautious players from survivors.',
        'The next lock is where this field starts splitting into survivors and exits.',
        'From the next pick onward, small calls start creating real separation.',
      ], 103);

  if (narrativeWeekVoided && latestNarrativeWeek) {
    storylineTitle = `Gameweek ${latestNarrativeWeek.weekNumber} was voided`;
    storylineBody = latestNarrativeWeek.data.gwVoidReason
      || 'The competition was paused when this gameweek locked. No results were applied, nobody was eliminated, and all active entries move on.';
  } else if (hasWinner) {
    storylineTitle = isWinner ? 'You won this competition' : 'We have a winner';
    const winnerName = comp.winnerUsername ?? (isWinner ? 'You' : 'One player');
    storylineBody = comp.activeCount === 1
      ? `${winnerName} is the last survivor standing after ${latestNarrativeWeek ? `Gameweek ${latestNarrativeWeek.weekNumber}` : 'the final gameweek'}. Every round survived, every pick paid off.`
      : `${winnerName} made it through every round to claim the title. This competition is over.`;
  } else if (latestNarrativeWeek && biggestCasualty) {
    const wn = latestNarrativeWeek.weekNumber;
    const bigLoss = biggestCasualty.pickCount >= 3;
    const titleOptions = bigLoss
      ? [
          narrativeWeekInProgress ? `Gameweek ${wn} is shaking the field` : `Gameweek ${wn} shook the field`,
          narrativeWeekInProgress ? `Gameweek ${wn} has a costly upset` : `Gameweek ${wn} had a costly upset`,
          narrativeWeekInProgress ? `Gameweek ${wn} is catching the crowd out` : `Gameweek ${wn} caught the crowd out`,
          narrativeWeekInProgress ? `Gameweek ${wn} is making its mark` : `Gameweek ${wn} made its mark`,
          narrativeWeekInProgress ? `Gameweek ${wn} is punishing the popular pick` : `Gameweek ${wn} punished the popular pick`,
          narrativeWeekInProgress ? `Gameweek ${wn} is exposing the bandwagon` : `Gameweek ${wn} exposed the bandwagon`,
          narrativeWeekInProgress ? `Gameweek ${wn} is turning safe picks risky` : `Gameweek ${wn} turned safe picks risky`,
          narrativeWeekInProgress ? `Gameweek ${wn} is hitting the favourites hard` : `Gameweek ${wn} hit the favourites hard`,
          narrativeWeekInProgress ? `Gameweek ${wn} is opening the trap door` : `Gameweek ${wn} opened the trap door`,
          narrativeWeekInProgress ? `Gameweek ${wn} is rewriting the table` : `Gameweek ${wn} rewrote the table`,
          narrativeWeekInProgress ? `Gameweek ${wn} is testing the crowd` : `Gameweek ${wn} tested the crowd`,
          narrativeWeekInProgress ? `Gameweek ${wn} is turning popular picks sour` : `Gameweek ${wn} turned popular picks sour`,
          narrativeWeekInProgress ? `Gameweek ${wn} is delivering a heavy blow` : `Gameweek ${wn} delivered a heavy blow`,
          narrativeWeekInProgress ? `Gameweek ${wn} is cutting deep` : `Gameweek ${wn} cut deep`,
          narrativeWeekInProgress ? `Gameweek ${wn} is punishing confidence` : `Gameweek ${wn} punished confidence`,
          narrativeWeekInProgress ? `Gameweek ${wn} is creating damage` : `Gameweek ${wn} created damage`,
          narrativeWeekInProgress ? `Gameweek ${wn} is breaking the pack` : `Gameweek ${wn} broke the pack`,
          narrativeWeekInProgress ? `Gameweek ${wn} is making survival expensive` : `Gameweek ${wn} made survival expensive`,
          narrativeWeekInProgress ? `Gameweek ${wn} is catching the obvious pick` : `Gameweek ${wn} caught the obvious pick`,
          narrativeWeekInProgress ? `Gameweek ${wn} is changing the mood` : `Gameweek ${wn} changed the mood`,
        ]
      : [
          narrativeWeekInProgress ? `Gameweek ${wn} has an early casualty` : `Gameweek ${wn} had a casualty`,
          narrativeWeekInProgress ? `Gameweek ${wn} is claiming victims` : `Gameweek ${wn} claimed a victim`,
          narrativeWeekInProgress ? `Gameweek ${wn} is stinging a few` : `Gameweek ${wn} stung a few`,
          narrativeWeekInProgress ? `Gameweek ${wn} is taking its toll` : `Gameweek ${wn} took its toll`,
          narrativeWeekInProgress ? `Gameweek ${wn} is trimming the field` : `Gameweek ${wn} trimmed the field`,
          narrativeWeekInProgress ? `Gameweek ${wn} is catching out a small group` : `Gameweek ${wn} caught out a small group`,
          narrativeWeekInProgress ? `Gameweek ${wn} is costing a few entries` : `Gameweek ${wn} cost a few entries`,
          narrativeWeekInProgress ? `Gameweek ${wn} is nudging players out` : `Gameweek ${wn} nudged players out`,
          narrativeWeekInProgress ? `Gameweek ${wn} is making quiet damage` : `Gameweek ${wn} made quiet damage`,
          narrativeWeekInProgress ? `Gameweek ${wn} is thinning the edges` : `Gameweek ${wn} thinned the edges`,
          narrativeWeekInProgress ? `Gameweek ${wn} is punishing the wrong call` : `Gameweek ${wn} punished the wrong call`,
          narrativeWeekInProgress ? `Gameweek ${wn} is proving awkward` : `Gameweek ${wn} proved awkward`,
          narrativeWeekInProgress ? `Gameweek ${wn} is taking names` : `Gameweek ${wn} took names`,
          narrativeWeekInProgress ? `Gameweek ${wn} is making every pick count` : `Gameweek ${wn} made every pick count`,
          narrativeWeekInProgress ? `Gameweek ${wn} is showing no free passes` : `Gameweek ${wn} showed no free passes`,
          narrativeWeekInProgress ? `Gameweek ${wn} is catching loose picks` : `Gameweek ${wn} caught loose picks`,
          narrativeWeekInProgress ? `Gameweek ${wn} is removing the unlucky` : `Gameweek ${wn} removed the unlucky`,
          narrativeWeekInProgress ? `Gameweek ${wn} is adding pressure` : `Gameweek ${wn} added pressure`,
          narrativeWeekInProgress ? `Gameweek ${wn} is creating small cracks` : `Gameweek ${wn} created small cracks`,
          narrativeWeekInProgress ? `Gameweek ${wn} is keeping everyone honest` : `Gameweek ${wn} kept everyone honest`,
        ];
    storylineTitle = pickCopyVariant(titleOptions, 104);
    storylineBody = pickCopyVariant([
      `${biggestCasualty.pickCount} player${biggestCasualty.pickCount === 1 ? '' : 's'} trusted ${biggestCasualty.teamShortName} and paid for it. ${effectiveActiveCount} survivor${effectiveActiveCount === 1 ? '' : 's'} remain.`,
      `${biggestCasualty.teamShortName} caught ${biggestCasualty.pickCount} entries out, leaving ${effectiveActiveCount} survivor${effectiveActiveCount === 1 ? '' : 's'} in contention.`,
      `${biggestCasualty.pickCount} picks on ${biggestCasualty.teamShortName} turned into exits. The field is now down to ${effectiveActiveCount}.`,
      `${biggestCasualty.teamShortName} became the danger pick for ${biggestCasualty.pickCount} entr${biggestCasualty.pickCount === 1 ? 'y' : 'ies'}. ${effectiveActiveCount} still stand.`,
      `${biggestCasualty.pickCount} entr${biggestCasualty.pickCount === 1 ? 'y' : 'ies'} went with ${biggestCasualty.teamShortName}; the survivor count is now ${effectiveActiveCount}.`,
      `The biggest damage came from ${biggestCasualty.teamShortName}, where ${biggestCasualty.pickCount} pick${biggestCasualty.pickCount === 1 ? '' : 's'} failed to hold.`,
      `${biggestCasualty.teamShortName} carried the biggest risk this week, taking ${biggestCasualty.pickCount} entr${biggestCasualty.pickCount === 1 ? 'y' : 'ies'} with them.`,
      `${biggestCasualty.pickCount} player${biggestCasualty.pickCount === 1 ? '' : 's'} were on the wrong side of ${biggestCasualty.teamShortName}. ${effectiveActiveCount} remain alive.`,
      `${biggestCasualty.teamShortName} was the costly call, cutting the field to ${effectiveActiveCount} survivor${effectiveActiveCount === 1 ? '' : 's'}.`,
      `${biggestCasualty.pickCount} pick${biggestCasualty.pickCount === 1 ? '' : 's'} backed ${biggestCasualty.teamShortName}; that choice changed the shape of the table.`,
      `${biggestCasualty.teamShortName} caused the main swing, with ${biggestCasualty.pickCount} entr${biggestCasualty.pickCount === 1 ? 'y' : 'ies'} falling away.`,
      `${biggestCasualty.pickCount} player${biggestCasualty.pickCount === 1 ? '' : 's'} trusted the same route through. ${biggestCasualty.teamShortName} did not deliver.`,
      `The crowd pressure landed on ${biggestCasualty.teamShortName}; ${biggestCasualty.pickCount} entr${biggestCasualty.pickCount === 1 ? 'y' : 'ies'} paid the price.`,
      `${biggestCasualty.teamShortName} was the round's trap door, leaving ${effectiveActiveCount} survivor${effectiveActiveCount === 1 ? '' : 's'} still in play.`,
      `${biggestCasualty.pickCount} entr${biggestCasualty.pickCount === 1 ? 'y' : 'ies'} were exposed by ${biggestCasualty.teamShortName}, and the field tightened again.`,
      `${biggestCasualty.teamShortName} turned confidence into exits for ${biggestCasualty.pickCount} player${biggestCasualty.pickCount === 1 ? '' : 's'}.`,
      `${biggestCasualty.pickCount} pick${biggestCasualty.pickCount === 1 ? '' : 's'} on ${biggestCasualty.teamShortName} failed, leaving ${effectiveActiveCount} to fight on.`,
      `${biggestCasualty.teamShortName} delivered the week's biggest setback, removing ${biggestCasualty.pickCount} entr${biggestCasualty.pickCount === 1 ? 'y' : 'ies'}.`,
      `${biggestCasualty.pickCount} player${biggestCasualty.pickCount === 1 ? '' : 's'} followed ${biggestCasualty.teamShortName}; the competition now has ${effectiveActiveCount} survivor${effectiveActiveCount === 1 ? '' : 's'}.`,
      `${biggestCasualty.teamShortName} was the pick that hurt most, and ${effectiveActiveCount} entr${effectiveActiveCount === 1 ? 'y is' : 'ies are'} still alive.`,
    ], 105);
  } else if (latestNarrativeWeek && weeklySurvivalRate != null && weeklySurvivalRate < 50) {
    storylineTitle = narrativeWeekInProgress && narrativeWeekLabel ? `${narrativeWeekLabel} has early damage` : `${narrativeWeekLabel} was chaos`;
    storylineBody = narrativeWeekInProgress
      ? `${weeklyEliminatedCount} ${weeklyEliminatedCount === 1 ? 'entry has' : 'entries have'} been eliminated from resolved picks so far. ${narrativePendingFixtureCount} fixture${narrativePendingFixtureCount === 1 ? '' : 's'} and ${gwPendingSelectionCount} pick${gwPendingSelectionCount === 1 ? '' : 's'} remain unresolved.`
      : pickCopyVariant([
          `${weeklyEliminatedCount} players went out in the latest week. Only ${weeklySurvivalRate}% survived the round.`,
          `Eliminations hit hard this round: ${weeklyEliminatedCount} exits and a ${weeklySurvivalRate}% survival rate.`,
          `The round was severe, with ${weeklyEliminatedCount} knocked out and just ${weeklySurvivalRate}% getting through.`,
        ], 105);
  } else if (latestNarrativeWeek && weeklySurvivalRate != null && weeklySurvivalRate >= 50 && weeklySurvivalRate <= 70) {
    storylineTitle = narrativeWeekInProgress && narrativeWeekLabel ? `${narrativeWeekLabel} is taking shape` : `${narrativeWeekLabel} tightened the race`;
    storylineBody = narrativeWeekInProgress
      ? `${weeklyAdvancedCount} advanced and ${weeklyEliminatedCount} went out from the picks resolved so far. The remaining fixtures can still change the round.`
      : pickCopyVariant([
          `Survival dipped to ${weeklySurvivalRate}%. The middle of the pack is starting to thin out.`,
          `${weeklySurvivalRate}% survived the round, and the mid-pack is beginning to break up.`,
          `A ${weeklySurvivalRate}% survival week has started to separate the pack.`,
        ], 106);
  } else if (latestNarrativeWeek && weeklySurvivalRate != null && weeklySurvivalRate >= 85) {
    storylineTitle = narrativeWeekInProgress && narrativeWeekLabel ? `${narrativeWeekLabel} is steady so far` : `${narrativeWeekLabel} was steady`;
    storylineBody = narrativeWeekInProgress
      ? `${weeklyAdvancedCount} of ${weeklyPickedCount} resolved picks have advanced so far. ${narrativePendingFixtureCount} fixture${narrativePendingFixtureCount === 1 ? '' : 's'} remain unresolved.`
      : pickCopyVariant([
          `${weeklySurvivalRate}% made it through. The real shakeups are still ahead.`,
          `${weeklySurvivalRate}% advanced, so the major swings are likely still to come.`,
          `Most of the field survived (${weeklySurvivalRate}%), with bigger pressure points still ahead.`,
        ], 107);
  } else if (latestNarrativeWeek && doomedPickedTeams.length === 0 && survivingPickedTeams.length > 0) {
    storylineTitle = narrativeWeekInProgress && narrativeWeekLabel ? `${narrativeWeekLabel} is sparing the field` : `${narrativeWeekLabel} spared the field`;
    storylineBody = pickCopyVariant([
      `No picked teams lost in the latest week. The standings stayed tight with ${effectiveActiveCount} still alive.`,
      `The latest week produced no picked-team losses, so ${effectiveActiveCount} players remain in a tight race.`,
      `No selected teams fell this round, keeping ${effectiveActiveCount} entries alive and tightly grouped.`,
    ], 108);
  } else if (latestNarrativeWeek && contrarianSurvivor) {
    storylineTitle = narrativeWeekInProgress && narrativeWeekLabel ? `${narrativeWeekLabel} is rewarding nerve` : `${narrativeWeekLabel} rewarded nerve`;
    storylineBody = pickCopyVariant([
      `${contrarianSurvivor.pickCount} player${contrarianSurvivor.pickCount === 1 ? '' : 's'} backed ${contrarianSurvivor.teamShortName} and came through when the crowd did not.`,
      `${contrarianSurvivor.teamShortName} rewarded a small group of ${contrarianSurvivor.pickCount} who went against the main trend.`,
      `A minority call on ${contrarianSurvivor.teamShortName} kept ${contrarianSurvivor.pickCount} player${contrarianSurvivor.pickCount === 1 ? '' : 's'} alive while others slipped.`,
    ], 109);
  } else if (latestNarrativeWeek && mostBackedTeam) {
    storylineTitle = narrativeWeekInProgress && narrativeWeekLabel ? `${narrativeWeekLabel} is following the crowd` : `${narrativeWeekLabel} followed the crowd`;
    storylineBody = pickCopyVariant([
      `${mostBackedTeam.pickCount} players backed ${mostBackedTeam.teamShortName}. The table is still tightening with ${effectiveActiveCount} left standing.`,
      `${mostBackedTeam.teamShortName} drew ${mostBackedTeam.pickCount} picks, and the field remains compact at ${effectiveActiveCount} survivors.`,
      `The crowd leaned on ${mostBackedTeam.teamShortName} (${mostBackedTeam.pickCount} picks), with ${effectiveActiveCount} still in the race.`,
    ], 110);
  } else if (isEliminated) {
    storylineTitle = `Your run ended in Gameweek ${participant?.eliminatedWeek}`;
    storylineBody = 'You are out of this competition now, but you can still follow every remaining fixture, upset, and survivor.';
  } else if (inProgressWeek) {
    const livePick = pickByGwId.get(inProgressWeek.data.gwId);
    storylineTitle = `Gameweek ${inProgressWeek.weekNumber} is underway`;
    storylineBody = livePick
      ? `${livePick.teamShortName} is already locked in. This round is now about survival, not the next pick.`
      : 'This round is already live. Watch the current results before thinking about the next gameweek.';
  } else if (openWeekWithoutPick) {
    storylineTitle = `Your next decision is Gameweek ${openWeekWithoutPick.weekNumber}`;
    storylineBody = 'You still have time to pick, but every unused team choice gets more valuable from here.';
  } else if (openWeekWithPick) {
    storylineTitle = `Gameweek ${openWeekWithPick.weekNumber} is loaded`;
    storylineBody = 'Your pick is in. Now the tension shifts to whether the crowd follows you or walks into a trap.';
  }

  const spotlightCards = [
    {
      eyebrow: 'Knockout pressure',
      title: comp.status === 'UPCOMING'
        ? `${comp.participantCount ?? 0} entered`
        : effectiveActiveCount === 1
        ? '1 survivor remains'
        : `${effectiveEliminatedCount} out, ${effectiveActiveCount} alive`,
      detail: comp.status === 'UPCOMING'
        ? (comp.participantCount ?? 0) > 0
          ? 'No eliminations yet. Knockout pressure begins when the first fixtures lock.'
          : 'No entrants yet. Knockout pressure begins once players join.'
        : effectiveActiveCount === 1
        ? 'One player has made it through every round.'
        : comp.participantCount > 0
        ? `${survivalRate}% of the field is still standing.`
        : 'The field will tighten as results come in.',
      accent: effectiveEliminatedCount > 0 ? 'text-yellow-300' : 'text-brand-200',
    },
    {
      eyebrow: isEliminated ? 'Your run' : 'Your runway',
      title: isEliminated
        ? `Eliminated in GW${participant?.eliminatedWeek}`
        : isParticipant
        ? remainingTeamsCount !== null ? `${remainingTeamsCount} teams left to use` : 'Tracking available teams'
        : upcomingWeek ? `Gameweek ${upcomingWeek.weekNumber} is next` : 'Watch the next lock',
      detail: isEliminated
        ? 'There is no next pick for this entry, but you can still track the remaining survivors.'
        : isParticipant
        ? `${consumedTeamIds.size} team${consumedTeamIds.size === 1 ? '' : 's'} already burned from your pool${reservedTeamIds.size > 0 ? `, ${reservedTeamIds.size} reserved` : ''}.`
        : comp.status === 'UPCOMING'
        ? 'Join early so your first pick is not rushed.'
        : 'Entries are closed, but the drama is still live.',
      accent: 'text-cyan-200',
    },
  ];

  const toggleWeek = (wn: number) => {
    setCollapsedWeeks((prev) => {
      const next = new Set(prev);
      next.has(wn) ? next.delete(wn) : next.add(wn);
      return next;
    });
  };


  const handlePick = (gwId: number, teamId: number, lockAt: string) => {
    if (comp.paused) {
      toast.error('This competition is paused. Picks will reopen when the organiser resumes it.');
      return;
    }
    if (!isParticipant || isEliminated || isWinner) return;
    if (awaitingPayment && strictManualPayment) {
      toast.error('Your entry is awaiting payment confirmation. Picks are disabled until marked as paid.');
      return;
    }
    if (isPast(parseDate(lockAt))) return;
    const useLifeline = effectiveLifelineGameweekId === gwId;
    const currentPick = pickByGwId.get(gwId);
    if (currentPick?.teamId === teamId && Boolean(currentPick.useLifeline) === useLifeline) return;
    pickMutation.mutate({ gwId, teamId, useLifeline });
  };

  const sidebarAccentColor = comp.clubPrimaryColor ?? comp.clubSecondaryColor ?? null;

  let actionTone: 'brand' | 'warning' | 'danger' | 'success' = 'brand';
  let actionMeta: string | null = null;

  if (comp.paused) {
    actionTone = 'warning';
    actionMeta = 'Joining, payments, picks, reminders and automatic processing will resume when the competition is unpaused.';
  } else if (!isParticipant) {
    if (comp.status === 'UPCOMING') {
      actionTone = 'warning';
      actionMeta = upcomingWeek
        ? `Next lock: Gameweek ${upcomingWeek.weekNumber} ${formatDistanceToNow(parseDate(upcomingWeek.data.lockAt), { addSuffix: true })}`
        : null;
    } else {
      actionTone = 'warning';
    }
  } else if (awaitingPayment) {
    actionTone = 'warning';
    actionMeta = comp.paymentMode === 'MANUAL'
      ? 'If you have already paid, the organiser still needs to mark you as paid.'
      : null;
  } else if (isWinner) {
    actionTone = 'success';
    actionMeta = latestResolvedPick ? `Winning path included ${latestResolvedPick.teamShortName} in GW${latestResolvedPick.weekNumber}.` : null;
  } else if (isEliminated) {
    actionTone = 'danger';
    actionMeta = latestResolvedPick ? `Latest resolved pick: ${latestResolvedPick.teamShortName} in GW${latestResolvedPick.weekNumber}.` : null;
  } else if (inProgressWeek) {
    actionTone = 'brand';
    actionMeta = 'The next pick window will open after the current round is completed.';
  } else if (openWeekWithoutPick) {
    actionTone = countdown.totalSeconds < 7200 ? 'warning' : 'brand';
    actionMeta = `Locks ${formatDistanceToNow(parseDate(openWeekWithoutPick.data.lockAt), { addSuffix: true })}`;
  } else if (openWeekWithPick) {
    actionTone = 'success';
    actionMeta = `Locks ${formatDistanceToNow(parseDate(openWeekWithPick.data.lockAt), { addSuffix: true })}`;
  } else if (upcomingWeek) {
    actionTone = 'brand';
    actionMeta = `Next scheduled lock is for Gameweek ${upcomingWeek.weekNumber}.`;
  }

  const showReminderSetup =
    !comp.paused &&
    !!user &&
    isParticipant &&
    !isEliminated &&
    !isWinner &&
    !!openWeekWithoutPick &&
    openWeekWithoutPick.data.gwStatus === 'UPCOMING';

  const handleEnableBrowserAlerts = async () => {
    const ok = await subscribe();
    if (!ok) {
      toast.error(permission === 'denied' ? 'Browser notifications are blocked for this site.' : 'Could not enable browser alerts.');
      return;
    }

    notify(
      'Pick reminders enabled',
      `Browser alerts are on for ${comp.name}.`,
      `/competitions/${compId}`
    );
    toast.success('Browser alerts enabled');
  };

  const sidebarStatusLabel = comp.paused
    ? 'Paused'
    : !isParticipant
    ? (comp.status === 'UPCOMING' ? 'Not joined' : 'Viewer')
    : awaitingPayment
    ? 'Pending payment'
    : isWinner
    ? 'Winner'
    : isEliminated
    ? `Out in GW${participant?.eliminatedWeek}`
    : inProgressWeek
    ? `GW${inProgressWeek.weekNumber} live`
    : openWeekWithoutPick
    ? `Pick due GW${openWeekWithoutPick.weekNumber}`
    : openWeekWithPick
    ? `Pick saved GW${openWeekWithPick.weekNumber}`
    : 'Active';

  const sidebarSummary = comp.paused
    ? (comp.pauseReason || 'The organiser has temporarily paused this competition.')
    : !isParticipant
    ? (comp.status === 'UPCOMING'
        ? 'Join the competition and complete the entry flow before the next lock.'
        : 'You can follow results and selections, but new entries are closed.')
    : awaitingPayment
    ? (comp.paymentMode === 'MANUAL'
        ? 'Your place is registered. The organiser still needs to confirm payment.'
        : 'Your entry exists, but payment has not fully settled yet.')
    : isWinner
    ? 'You have already won this competition. Use the quick actions below to review the final table and results.'
    : isEliminated
    ? 'You are out of this run. There is no next pick, but you can still track every remaining fixture and survivor.'
    : inProgressWeek
    ? 'The current gameweek is live. Focus on the active fixtures before the next pick window opens.'
    : openWeekWithoutPick
    ? 'You still need to choose a team for the next open gameweek.'
    : openWeekWithPick
    ? 'Your selection is saved. You can still change it until the lock time.'
    : 'No immediate action is needed right now.';

  const sidebarMeta = comp.paused
    ? 'No joining, payment, pick or automatic gameweek action is required until play resumes.'
    : awaitingPayment
    ? actionMeta
    : isEliminated || isWinner
    ? actionMeta
    : inProgressWeek
    ? actionMeta
    : openWeekWithoutPick
    ? `Deadline: ${formatDistanceToNow(parseDate(openWeekWithoutPick.data.lockAt), { addSuffix: true })}`
    : openWeekWithPick
    ? `Next lock: ${formatDistanceToNow(parseDate(openWeekWithPick.data.lockAt), { addSuffix: true })}`
    : actionMeta;
  const secondaryMeta = actionMeta && actionMeta !== sidebarMeta ? actionMeta : null;
  const lifelineStatusLabel = !comp.lifelineEnabled
    ? 'Lifeline disabled'
    : !isParticipant
      ? 'Lifeline enabled'
      : participant?.lifelineUsed
        ? `Lifeline used${participant.lifelineUsedWeek ? ` · GW ${participant.lifelineUsedWeek}` : ''}`
        : 'Lifeline available';
  const lifelineStatusToneClass = !comp.lifelineEnabled
    ? 'border-white/10 bg-black/20 text-gray-300'
    : !isParticipant
      ? 'border-cyan-400/30 bg-cyan-500/10 text-cyan-100'
      : participant?.lifelineUsed
        ? 'border-amber-400/30 bg-amber-500/10 text-amber-100'
        : 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100';
  // Keep the skeleton short-lived: fixtures define the narrative structure.
  // Pick stats and selections can fill in without blocking the whole pulse area.
  const narrativeFirstLoad = fixturesLoading;
  const snapshotShareMode: 'live' | 'recap' | null = latestNarrativeWeek
    ? (latestNarrativeWeek.data.gwStatus === 'COMPLETED' ? 'recap' : 'live')
    : null;
  const snapshotShareTitle = snapshotShareMode === 'live' ? 'Live Update' : 'Recap';
  const snapshotShareButtonLabel = snapshotShareMode === 'live' ? 'Share Live Snapshot' : 'Share Gameweek Snapshot';
  const competitionShareUrl = `${window.location.origin}/competitions/${compId}`;
  const snapshotCardClassName = resolvedTheme === 'light'
    ? 'rounded-[1.5rem] border border-slate-200 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.14),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(236,244,252,0.96))] p-4 sm:p-5 shadow-[0_20px_44px_rgba(41,66,99,0.12)]'
    : 'rounded-[1.5rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.18),transparent_28%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(8,15,30,0.94))] p-4 sm:p-5 shadow-[0_20px_44px_rgba(2,8,23,0.35)]';
  const snapshotMetricClassName = resolvedTheme === 'light'
    ? 'rounded-xl border border-slate-200 bg-white/90 px-3 py-2 shadow-sm shadow-slate-200/60'
    : 'rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 shadow-sm shadow-black/10';
  const snapshotFooterTextClassName = resolvedTheme === 'light' ? 'text-slate-500' : 'text-gray-400';
  const snapshotSubcopyClassName = resolvedTheme === 'light' ? 'text-slate-600' : 'text-slate-300';

  const buildGameweekSnapshotMessage = () => {
    const weekLabel = narrativeWeekLabel ?? 'Latest gameweek';
    const mostPicked = mostBackedTeam ? `${mostBackedTeam.teamShortName} (${mostBackedTeam.pickCount})` : 'No picks yet';
    const weeklySurvival = weeklySurvivalRate != null ? `${weeklySurvivalRate}%` : `${survivalRate}%`;
    return [
      `${comp.name} - ${weekLabel} ${snapshotShareTitle}`,
      '',
      storylineTitle,
      storylineBody,
      '',
      `This week: ${weeklyEliminatedCount} out, ${weeklyAdvancedCount} advanced`,
      narrativeWeekByeGranted ? 'Bye granted: all active entries advanced this gameweek' : null,
      `Still alive: ${effectiveActiveCount}/${comp.participantCount}`,
      `Survival rate: ${weeklySurvival}`,
      `Most picked: ${mostPicked}`,
      comp.winnerUsername ? `Winner: ${comp.winnerUsername}` : null,
      '',
      competitionShareUrl,
      'Shared from Last Man Standing',
    ].filter(Boolean).join('\n');
  };

  const onShareGameweekSnapshot = async () => {
    if (!snapshotShareMode || narrativeFirstLoad || snapshotSharing) return;
    const message = buildGameweekSnapshotMessage();
    const shareTitle = `${comp.name} ${snapshotShareTitle.toLowerCase()}`;
    setSnapshotSharing(true);
    try {
      const snapshotNode = gameweekSnapshotRef.current;
      let shareFile: File | null = null;

      if (snapshotNode) {
        const canvas = await html2canvas(snapshotNode, {
          backgroundColor: resolvedTheme === 'light' ? '#eef4fc' : '#0f172a',
          scale: Math.min(window.devicePixelRatio || 1, 2),
          useCORS: true,
        });
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png', 0.92));
        if (blob) {
          shareFile = new File([blob], `lms-${(narrativeWeekLabel ?? 'gameweek').replace(/\s+/g, '-').toLowerCase()}-snapshot.png`, {
            type: 'image/png',
          });
        }
      }

      if (navigator.share) {
        if (shareFile && typeof navigator.canShare === 'function' && navigator.canShare({ files: [shareFile] })) {
          await navigator.share({
            title: shareTitle,
            text: message,
            files: [shareFile],
          });
          return;
        }
        await navigator.share({
          title: shareTitle,
          text: message,
          url: competitionShareUrl,
        });
        return;
      }

      await navigator.clipboard.writeText(message);
      toast.success('Snapshot summary copied to clipboard');
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        try {
          await navigator.clipboard.writeText(message);
          toast.success('Snapshot summary copied to clipboard');
        } catch {
          toast.error('Could not share snapshot right now');
        }
      }
    } finally {
      setSnapshotSharing(false);
    }
  };

  const emailReminderEnabled = user?.notificationPickReminders ?? user?.emailResultsOptIn ?? false;

  const reminderPanel = showReminderSetup ? (
    <section className="card p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <h2 className="text-lg font-semibold text-gray-100">Reminder setup</h2>
          <p className="mt-2 text-sm text-gray-300">
            You have not picked for Gameweek {openWeekWithoutPick.weekNumber} yet. Turn on reminders now so you are less likely to miss the lock.
          </p>
          <p className="mt-2 text-xs text-gray-400">
            Picks lock {formatDistanceToNow(parseDate(openWeekWithoutPick.data.lockAt), { addSuffix: true })}.
          </p>
        </div>

        <div className="grid w-full gap-3 sm:w-[22rem]">
          <div className="panel-shell px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">Email reminders</p>
            <p className="mt-1 text-sm text-gray-100">{emailReminderEnabled ? 'Enabled' : 'Disabled'}</p>
            <p className="mt-1 text-xs text-gray-400">
              Uses your profile setting for pick deadline reminder emails.
            </p>
            {!emailReminderEnabled && (
              <Link to="/profile" className="mt-3 inline-flex text-xs font-medium text-brand-400 hover:text-brand-300">
                Turn on in profile →
              </Link>
            )}
          </div>

          <div className="panel-shell px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">Browser alerts</p>
            <p className="mt-1 text-sm text-gray-100">
              {!browserAlertsSupported ? 'Not supported here' : browserAlertsEnabled ? 'Enabled on this device' : 'Disabled on this device'}
            </p>
            <p className="mt-1 text-xs text-gray-400">
              Best for quick on-device nudges when this browser supports notifications.
            </p>
            {browserAlertsSupported && !browserAlertsEnabled && (
              <button
                type="button"
                onClick={handleEnableBrowserAlerts}
                className="mt-3 inline-flex rounded-lg bg-brand-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-brand-500"
              >
                Enable browser alerts
              </button>
            )}
          </div>
          </div>
        </div>
    </section>
  ) : null;

  const openWeekForAction = inProgressWeek ? undefined : openWeekWithoutPick ?? openWeekWithPick ?? upcomingWeek;
  const openWeekNumber = openWeekForAction?.weekNumber ?? null;
  const openWeekTargetId = openWeekNumber ? `gw-card-${openWeekNumber}` : null;

  const handleScrollToOpenWeek = () => {
    if (openWeekNumber != null) {
      setCollapsedWeeks((prev) => {
        const next = new Set(prev);
        next.delete(openWeekNumber);
        return next;
      });
    }
    if (openWeekTargetId) {
      const target = document.getElementById(openWeekTargetId);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const stateBanner = (() => {
    if (comp.paused) {
      return {
        tone: 'warn' as const,
        eyebrow: 'Paused',
        title: 'Competition temporarily paused',
        detail: comp.pauseReason || 'The organiser will resume this competition when it is ready to continue.',
        ctaLabel: '',
        ctaKind: 'none' as const,
      };
    }
    if (!hasConfirmedParticipation && comp.status === 'UPCOMING') {
      return {
        tone: 'brand' as const,
        eyebrow: 'Next Step',
        title: pickCopyVariant(['Join this competition', 'Enter this competition', 'Register for this competition'], 219),
        detail: comp.entryFee > 0
          ? pickCopyVariant([
              `Entry is €${comp.entryFee}. Join now to secure your spot before lock.`,
              `Entry costs €${comp.entryFee}. Register now so you are ready before the next lock.`,
              `€${comp.entryFee} entry. Join early to avoid missing the first decision window.`,
            ], 220)
          : pickCopyVariant([
              'Free entry. Join now to secure your spot before lock.',
              'No entry fee. Register now so your place is set before lock.',
              'Free to join. Enter now so you are ready when picks open.',
            ], 221),
        ctaLabel: 'Join competition',
        ctaKind: 'join' as const,
      };
    }
    if (canAddAnotherEntry) {
      return {
        tone: 'brand' as const,
        eyebrow: 'Extra Entry',
        title: additionalEntriesRemaining === 1 ? 'You can add one more entry' : `You can add ${additionalEntriesRemaining} more entries`,
        detail: `This competition allows up to ${maxEntriesPerUser} entries per user. Add another entry before lock to increase your coverage.`,
        ctaLabel: 'Add another entry',
        ctaKind: 'join' as const,
      };
    }
    if (awaitingPayment && strictManualPayment) {
      return {
        tone: 'warn' as const,
        eyebrow: 'Action Needed',
        title: pickCopyVariant(['Awaiting payment confirmation', 'Payment confirmation pending', 'Waiting for organiser payment approval'], 222),
        detail: pickCopyVariant([
          'Your entry is registered, but picks stay locked until the organiser marks payment as received.',
          'Registration is recorded, but pick access remains locked until payment is confirmed.',
          'You are entered, but selections unlock only after organiser payment confirmation.',
        ], 223),
        ctaLabel: '',
        ctaKind: 'none' as const,
      };
    }
    if (openWeekForAction && !isEliminated && !isWinner) {
      const actionWeekNumber = openWeekForAction.weekNumber;
      return {
        tone: 'brand' as const,
        eyebrow: 'Next Step',
        title: pickCopyVariant([
          `Gameweek ${actionWeekNumber} is open`,
          `Gameweek ${actionWeekNumber} is ready`,
          `Gameweek ${actionWeekNumber} decision window is live`,
        ], 224),
        detail: openWeekWithoutPick
          ? pickCopyVariant([
              'You still need to choose a team before lock.',
              'A team selection is still required before this round locks.',
              'Pick is outstanding. Choose your team before deadline.',
            ], 225)
          : pickCopyVariant([
              'Your pick is in. You can still update it before lock.',
              'Selection saved. You may still change it before lock time.',
              'Pick submitted. Edits are still allowed until deadline.',
            ], 226),
        ctaLabel: 'Jump to picks',
        ctaKind: 'pick' as const,
      };
    }
    if (isWinner) {
      return {
        tone: 'success' as const,
        eyebrow: 'Status',
        title: 'You won this competition',
        detail: 'Your run is complete and confirmed. Review results and sharing options below.',
        ctaLabel: '',
        ctaKind: 'none' as const,
      };
    }
    if (isEliminated) {
      return {
        tone: 'muted' as const,
        eyebrow: 'Status',
        title: 'Your run has ended',
        detail: 'You are eliminated in this competition. You can still follow weekly results and leaderboard movement.',
        ctaLabel: '',
        ctaKind: 'none' as const,
      };
    }
    return null;
  })();

  const crowdReadTeamName = crowdReadTeam?.teamName ?? crowdReadTeam?.teamShortName ?? 'the crowd pick';
  const crowdReadTitle = crowdReadTeam
    ? pickCopyVariant([
        `${crowdReadTeam.teamShortName} carried the weight`,
        `${crowdReadTeam.teamShortName} drew the crowd`,
        `${crowdReadTeam.teamShortName} became the safe lane`,
        `${crowdReadTeam.teamShortName} pulled most of the picks`,
        `${crowdReadTeam.teamShortName} was the crowd play`,
        `${crowdReadTeam.teamShortName} led the pick board`,
        `${crowdReadTeam.teamShortName} became the popular route`,
        `${crowdReadTeam.teamShortName} took the spotlight`,
        `${crowdReadTeam.teamShortName} attracted the pack`,
        `${crowdReadTeam.teamShortName} was the main lean`,
        `${crowdReadTeam.teamShortName} became the obvious call`,
        `${crowdReadTeam.teamShortName} shaped the round`,
        `${crowdReadTeam.teamShortName} owned the crowd share`,
        `${crowdReadTeam.teamShortName} was where players gathered`,
        `${crowdReadTeam.teamShortName} became the common path`,
        `${crowdReadTeam.teamShortName} carried the room`,
        `${crowdReadTeam.teamShortName} drew the heaviest backing`,
        `${crowdReadTeam.teamShortName} was the table's favourite`,
        `${crowdReadTeam.teamShortName} became the consensus pick`,
        `${crowdReadTeam.teamShortName} set the weekly tone`,
      ], 201)
    : pickCopyVariant([
        'Waiting for the first crowd signal',
        'Crowd pattern will appear after lock',
        'No crowd trend yet',
        'Waiting for picks to settle',
        'The crowd has not converged yet',
        'No main pick has formed yet',
        'The pick board is still quiet',
        'No shared direction yet',
        'Crowd movement is still pending',
        'Waiting for a popular route',
        'No dominant pick to read yet',
        'The field has not shown its hand',
        'Pick pressure has not formed yet',
        'No crowd lean available yet',
        'The main trend is still hidden',
        'Waiting for the first big lean',
        'No team has taken the crowd yet',
        'The weekly pattern is still open',
        'No consensus choice yet',
        'The crowd read is still loading',
      ], 202);
  const crowdReadDetail = crowdReadTeam
    ? liveInsightWeek && liveInsightWeek.data.gwStatus !== 'COMPLETED'
      ? pickCopyVariant([
          `${crowdReadTeam.pickCount} players are currently riding with ${crowdReadTeamName} in Gameweek ${liveInsightWeek.weekNumber}, accounting for ${crowdReadTeam.percentage}% of tracked picks.`,
          `${crowdReadTeamName} leads the live board in Gameweek ${liveInsightWeek.weekNumber}: ${crowdReadTeam.pickCount} picks (${crowdReadTeam.percentage}%).`,
          `${crowdReadTeam.pickCount} active entries have lined up behind ${crowdReadTeamName} this week, representing ${crowdReadTeam.percentage}% of tracked picks.`,
          `The live crowd is leaning toward ${crowdReadTeamName}, with ${crowdReadTeam.pickCount} entries already committed.`,
          `${crowdReadTeamName} is carrying the current pressure point for ${crowdReadTeam.pickCount} players.`,
          `${crowdReadTeam.pickCount} live picks sit on ${crowdReadTeamName}, making it the round's main watch.`,
          `The strongest live lane is ${crowdReadTeamName}, backed by ${crowdReadTeam.pickCount} entries.`,
          `${crowdReadTeamName} has become the in-play consensus with ${crowdReadTeam.pickCount} picks.`,
          `Most of the visible live movement is on ${crowdReadTeamName}.`,
          `${crowdReadTeamName} is the team carrying the largest active pick share.`,
          `${crowdReadTeam.pickCount} players are exposed to ${crowdReadTeamName} while this week unfolds.`,
          `Gameweek ${liveInsightWeek.weekNumber} is currently centred on ${crowdReadTeamName}.`,
          `${crowdReadTeamName} has the largest live pick cluster on the board.`,
          `${crowdReadTeam.pickCount} tracked entries have made ${crowdReadTeamName} the current crowd call.`,
          `The biggest live concentration belongs to ${crowdReadTeamName}.`,
          `${crowdReadTeamName} is the current result that could move the most players.`,
          `The live board has ${crowdReadTeamName} as the clearest shared position.`,
          `${crowdReadTeamName} is where the active field has gathered most heavily.`,
          `${crowdReadTeam.pickCount} entries are waiting on ${crowdReadTeamName} this gameweek.`,
          `The active crowd story is ${crowdReadTeamName}, with ${crowdReadTeam.pickCount} picks attached.`,
        ], 203)
      : pickCopyVariant([
          `${crowdReadTeam.pickCount} players backed ${crowdReadTeamName} in the latest resolved week, accounting for ${crowdReadTeam.percentage}% of tracked picks.`,
          `In the latest completed week, ${crowdReadTeamName} drew ${crowdReadTeam.pickCount} picks (${crowdReadTeam.percentage}% of tracked entries).`,
          `${crowdReadTeamName} was the dominant pick last resolved round with ${crowdReadTeam.pickCount} selections (${crowdReadTeam.percentage}%).`,
          `${crowdReadTeamName} led the week with ${crowdReadTeam.pickCount} tracked picks.`,
          `${crowdReadTeam.pickCount} entries lined up behind ${crowdReadTeamName}, making it the clearest crowd move.`,
          `The biggest cluster formed around ${crowdReadTeamName}, with ${crowdReadTeam.pickCount} picks recorded.`,
          `${crowdReadTeamName} absorbed the most pressure this week with ${crowdReadTeam.pickCount} selections.`,
          `The room leaned toward ${crowdReadTeamName}; ${crowdReadTeam.pickCount} players made that call.`,
          `${crowdReadTeamName} was the shared answer for ${crowdReadTeam.pickCount} entries.`,
          `A clear crowd lane formed on ${crowdReadTeamName}, drawing ${crowdReadTeam.pickCount} tracked picks.`,
          `${crowdReadTeam.pickCount} players chose ${crowdReadTeamName}, setting the main pressure point.`,
          `${crowdReadTeamName} became the pick to watch after taking ${crowdReadTeam.pickCount} selections.`,
          `The field's strongest lean was ${crowdReadTeamName}, backed by ${crowdReadTeam.pickCount}.`,
          `${crowdReadTeamName} carried the largest share of picks and now defines the round's crowd story.`,
          `${crowdReadTeam.pickCount} picks made ${crowdReadTeamName} the weekly benchmark.`,
          `The crowd's main position landed on ${crowdReadTeamName}, with ${crowdReadTeam.pickCount} entries committed.`,
          `${crowdReadTeamName} was the biggest collective call, pulling ${crowdReadTeam.pickCount} players into the same lane.`,
          `No other team drew more attention than ${crowdReadTeamName}, which had ${crowdReadTeam.pickCount} picks.`,
          `${crowdReadTeamName} became the round's common ground for ${crowdReadTeam.pickCount} entries.`,
          `${crowdReadTeam.pickCount} players made ${crowdReadTeamName} the crowd's headline pick.`,
        ], 204)
    : pickCopyVariant([
        'Once a gameweek locks, this area highlights where the crowd moved together.',
        'After lock, this tracks which team absorbed the largest share of picks.',
        'As soon as picks finalize, this card will show the crowd\'s main position.',
        'When entries commit, the strongest pick trend will appear here.',
        'This card waits for a locked gameweek before reading the field.',
        'The first clear crowd movement will be summarized here.',
        'Once selections are visible, the main team lean will be shown.',
        'This insight needs locked picks before it can identify the crowd route.',
        'After the deadline, the most popular selection will surface here.',
        'The field has not produced a readable trend yet.',
        'When the round settles, this will show where the largest group went.',
        'This panel will highlight the team carrying the most pick pressure.',
        'No pick cluster is available yet, but the trend will appear after lock.',
        'The crowd read starts once enough selections are locked in.',
        'This is where the weekly consensus pick will be tracked.',
        'The app is waiting for a meaningful pick pattern.',
        'No crowd lane can be measured until the week locks.',
        'Once picks are revealed, this card will show the dominant route.',
        'The first major backing pattern will appear here.',
        'This panel turns active when the field starts moving together.',
      ], 205);
  const knockoutTeamName = biggestCasualty?.teamName ?? biggestCasualty?.teamShortName ?? 'the danger team';
  const knockoutTitle = biggestCasualty
    ? pickCopyVariant([
        `${biggestCasualty.teamShortName} was the trapdoor`,
        `${biggestCasualty.teamShortName} triggered the biggest hit`,
        `${biggestCasualty.teamShortName} turned costly`,
        `${biggestCasualty.teamShortName} caused the key wipeout`,
        `${biggestCasualty.teamShortName} punished the field`,
        `${biggestCasualty.teamShortName} delivered the damage`,
        `${biggestCasualty.teamShortName} became the exit route`,
        `${biggestCasualty.teamShortName} created the biggest swing`,
        `${biggestCasualty.teamShortName} hurt the most entries`,
        `${biggestCasualty.teamShortName} broke the pack`,
        `${biggestCasualty.teamShortName} caused the sharpest drop`,
        `${biggestCasualty.teamShortName} was the costly mistake`,
        `${biggestCasualty.teamShortName} changed the table`,
        `${biggestCasualty.teamShortName} exposed the risk`,
        `${biggestCasualty.teamShortName} became the week's blow`,
        `${biggestCasualty.teamShortName} cut into the field`,
        `${biggestCasualty.teamShortName} made the biggest dent`,
        `${biggestCasualty.teamShortName} caught players out`,
        `${biggestCasualty.teamShortName} caused the main exit wave`,
        `${biggestCasualty.teamShortName} was the knockout point`,
      ], 206)
    : pickCopyVariant([
        'No major casualty yet',
        'No clear knockout swing yet',
        'No mass exit team yet',
        'No major trapdoor so far',
        'No big wipeout yet',
        'No knockout wave yet',
        'No team has broken the field',
        'No damaging pick yet',
        'No heavy exit source yet',
        'No single blow has landed',
        'No major field cut yet',
        'No sharp elimination trend',
        'No costly team stands out',
        'No clear danger pick yet',
        'No decisive setback yet',
        'No elimination cluster yet',
        'No big table shift yet',
        'No trapdoor has opened yet',
        'No knockout headline yet',
        'No heavy damage recorded',
      ], 207);
  const knockoutDetail = biggestCasualty
    ? pickCopyVariant([
        `${biggestCasualty.pickCount} entries went out backing ${knockoutTeamName}. This is the kind of swing that changes a competition fast.`,
        `${knockoutTeamName} eliminated ${biggestCasualty.pickCount} entries in one hit, creating the sharpest shift of the round.`,
        `${biggestCasualty.pickCount} players were knocked out on ${knockoutTeamName}, a swing large enough to reshape the leaderboard quickly.`,
        `${knockoutTeamName} created the round's biggest damage with ${biggestCasualty.pickCount} exits.`,
        `${biggestCasualty.pickCount} entries trusted ${knockoutTeamName} and left the race.`,
        `${knockoutTeamName} was the pick that hurt most, removing ${biggestCasualty.pickCount}.`,
        `${biggestCasualty.pickCount} selections on ${knockoutTeamName} became eliminations.`,
        `The biggest knockout source was ${knockoutTeamName}, with ${biggestCasualty.pickCount} exits.`,
        `${knockoutTeamName} turned into the danger result for ${biggestCasualty.pickCount} players.`,
        `${biggestCasualty.pickCount} runs ended because ${knockoutTeamName} did not deliver.`,
        `${knockoutTeamName} caused the clearest table shift, taking out ${biggestCasualty.pickCount}.`,
        `${biggestCasualty.pickCount} entries were exposed by the ${knockoutTeamName} pick.`,
        `${knockoutTeamName} became the week's knockout marker with ${biggestCasualty.pickCount} failed picks.`,
        `${biggestCasualty.pickCount} players went down on the same call: ${knockoutTeamName}.`,
        `${knockoutTeamName} produced the main elimination cluster of the round.`,
        `${biggestCasualty.pickCount} picks on ${knockoutTeamName} changed the survivor picture.`,
        `${knockoutTeamName} delivered the blow that removed ${biggestCasualty.pickCount} entries.`,
        `${biggestCasualty.pickCount} players backed ${knockoutTeamName}; none of those picks survived.`,
        `${knockoutTeamName} was the round's hardest lesson for ${biggestCasualty.pickCount} entries.`,
        `${biggestCasualty.pickCount} exits came through ${knockoutTeamName}, the biggest hit on the board.`,
      ], 208)
    : latestCompletedWeek
      ? pickCopyVariant([
          'The latest resolved week did not produce a clear mass-casualty team.',
          'No single team drove a major elimination wave in the latest completed week.',
          'The latest resolved round spread losses without one obvious knockout team.',
          'The field moved, but not through one standout trapdoor.',
          'No team was responsible for a dominant exit wave this round.',
          'The damage was spread across the board rather than tied to one pick.',
          'The round had no single team that clearly broke the field.',
          'Eliminations were distributed instead of concentrated on one call.',
          'No obvious knockout source separated from the rest.',
          'The latest completed week avoided a single mass-casualty moment.',
          'No one pick became the clear table breaker.',
          'The field tightened without one headline knockout team.',
          'There was no clear trapdoor team in the latest result set.',
          'The latest round produced movement, but no dominant exit source.',
          'No single result owned the elimination story this time.',
          'The knockout damage stayed spread out.',
          'No team carried enough exits to become the main blow.',
          'The latest week did not create a clear danger-team headline.',
          'The survivor count changed without one obvious culprit.',
          'The round avoided a concentrated wipeout.',
        ], 209)
      : pickCopyVariant([
          'Once results land, this surfaces the team that took the most players down.',
          'When fixtures resolve, this card highlights the team behind the largest exits.',
          'As results come in, this will track the round\'s biggest elimination source.',
          'The first clear knockout blow will be shown here.',
          'This card waits for a result strong enough to move the field.',
          'No knockout detail is available until selections resolve.',
          'The biggest elimination source will appear here after the week settles.',
          'This panel tracks where the damage comes from.',
          'When a team causes exits, the details will show here.',
          'The main trapdoor is still waiting to be identified.',
          'This card turns active once eliminations can be attributed.',
          'The next major casualty will be summarized here.',
          'No exit source has separated from the pack yet.',
          'The round has not produced a clear knockout story yet.',
          'This insight will name the team behind the biggest hit.',
          'Once picks fail, the main source of damage will appear.',
          'The elimination pattern is not readable yet.',
          'This is where the biggest failed pick gets called out.',
          'No knockout wave has formed yet.',
          'The field has not produced a clear danger team yet.',
        ], 210);
  const contrarianTeamName = contrarianSurvivor?.teamName ?? contrarianSurvivor?.teamShortName ?? 'the low-owned pick';
  const contrarianTitle = contrarianSurvivor
    ? pickCopyVariant([
        `${contrarianSurvivor.teamShortName} rewarded nerve`,
        `${contrarianSurvivor.teamShortName} paid off for the brave`,
        `${contrarianSurvivor.teamShortName} delivered a contrarian win`,
        `${contrarianSurvivor.teamShortName} proved the sharp play`,
        `${contrarianSurvivor.teamShortName} gave outsiders an edge`,
        `${contrarianSurvivor.teamShortName} backed the bold`,
        `${contrarianSurvivor.teamShortName} rewarded the minority`,
        `${contrarianSurvivor.teamShortName} created separation`,
        `${contrarianSurvivor.teamShortName} helped the brave survive`,
        `${contrarianSurvivor.teamShortName} made the unpopular pick pay`,
        `${contrarianSurvivor.teamShortName} became the smart outsider`,
        `${contrarianSurvivor.teamShortName} gave a small group daylight`,
        `${contrarianSurvivor.teamShortName} beat the crowd path`,
        `${contrarianSurvivor.teamShortName} gave low ownership value`,
        `${contrarianSurvivor.teamShortName} rewarded the risk takers`,
        `${contrarianSurvivor.teamShortName} broke from the pack`,
        `${contrarianSurvivor.teamShortName} delivered against the trend`,
        `${contrarianSurvivor.teamShortName} made the brave look sharp`,
        `${contrarianSurvivor.teamShortName} gave outsiders a lift`,
        `${contrarianSurvivor.teamShortName} proved the quiet route`,
      ], 211)
    : pickCopyVariant([
        'No contrarian hero yet',
        'No low-owned breakout yet',
        'No outsider pick has separated yet',
        'No clear contrarian edge yet',
        'Waiting for a bold low-owned win',
        'No brave pick has paid off yet',
        'No minority route has broken through',
        'No low-owned survivor story yet',
        'No unpopular pick has created value',
        'No sharp outsider call yet',
        'Waiting for someone to beat the crowd',
        'No quiet route has worked yet',
        'No bold pick has separated the field',
        'No low-owned team has rewarded trust',
        'No contrarian move to report yet',
        'No outsider edge is visible yet',
        'No small-group pick has landed yet',
        'No anti-crowd win yet',
        'No hidden value pick yet',
        'Waiting for the brave call',
      ], 212);
  const contrarianDetail = contrarianSurvivor
    ? pickCopyVariant([
        `Only ${contrarianSurvivor.pickCount} player${contrarianSurvivor.pickCount === 1 ? '' : 's'} trusted ${contrarianTeamName}, and they stayed alive.`,
        `${contrarianTeamName} was backed by just ${contrarianSurvivor.pickCount} player${contrarianSurvivor.pickCount === 1 ? '' : 's'}, and that minority call survived.`,
        `A small group of ${contrarianSurvivor.pickCount} player${contrarianSurvivor.pickCount === 1 ? '' : 's'} went with ${contrarianTeamName} and gained ground by staying in.`,
        `${contrarianTeamName} kept ${contrarianSurvivor.pickCount} low-owned entr${contrarianSurvivor.pickCount === 1 ? 'y' : 'ies'} alive.`,
        `${contrarianSurvivor.pickCount} player${contrarianSurvivor.pickCount === 1 ? '' : 's'} avoided the crowd and got rewarded by ${contrarianTeamName}.`,
        `The unpopular route through ${contrarianTeamName} worked for ${contrarianSurvivor.pickCount}.`,
        `${contrarianTeamName} gave a small group survival while the wider field looked elsewhere.`,
        `Only ${contrarianSurvivor.pickCount} backed ${contrarianTeamName}, making it the sharpest low-owned success.`,
        `${contrarianTeamName} became the quiet edge for ${contrarianSurvivor.pickCount} survivor${contrarianSurvivor.pickCount === 1 ? '' : 's'}.`,
        `${contrarianSurvivor.pickCount} player${contrarianSurvivor.pickCount === 1 ? '' : 's'} took the less crowded path and survived.`,
        `${contrarianTeamName} rewarded the players willing to step away from the main trend.`,
        `The low-owned play was ${contrarianTeamName}, and ${contrarianSurvivor.pickCount} entr${contrarianSurvivor.pickCount === 1 ? 'y' : 'ies'} benefited.`,
        `${contrarianTeamName} created a small but useful separation point.`,
        `${contrarianSurvivor.pickCount} player${contrarianSurvivor.pickCount === 1 ? '' : 's'} found value away from the crowd with ${contrarianTeamName}.`,
        `The bold call on ${contrarianTeamName} kept ${contrarianSurvivor.pickCount} survivor${contrarianSurvivor.pickCount === 1 ? '' : 's'} moving.`,
        `${contrarianTeamName} turned a quiet pick into a meaningful edge.`,
        `A minority pick on ${contrarianTeamName} gave ${contrarianSurvivor.pickCount} entr${contrarianSurvivor.pickCount === 1 ? 'y' : 'ies'} breathing room.`,
        `${contrarianTeamName} proved that the least crowded route can still be the right one.`,
        `${contrarianSurvivor.pickCount} player${contrarianSurvivor.pickCount === 1 ? '' : 's'} survived by trusting ${contrarianTeamName} when few others did.`,
        `${contrarianTeamName} delivered the round's best low-owned survival story.`,
      ], 213)
    : pickCopyVariant([
        'When a low-owned team gets players through, it shows up here as the smartest unpopular move.',
        'This card lights up when a minority pick survives and creates separation.',
        'If a low-owned choice breaks right, this is where that edge appears.',
        'The first clear knockout blow will be shown here.',
        'This card waits for a result strong enough to move the field.',
        'No knockout detail is available until selections resolve.',
        'The biggest elimination source will appear here after the week settles.',
        'This panel tracks where the damage comes from.',
        'When a team causes exits, the details will show here.',
        'The main trapdoor is still waiting to be identified.',
        'This card turns active once eliminations can be attributed.',
        'The next major casualty will be summarized here.',
        'No exit source has separated from the pack yet.',
        'The round has not produced a clear knockout story yet.',
        'This insight will name the team behind the biggest hit.',
        'Once picks fail, the main source of damage will appear.',
        'The elimination pattern is not readable yet.',
        'This is where the biggest failed pick gets called out.',
        'No knockout wave has formed yet.',
        'The field has not produced a clear danger team yet.',
      ], 214);

  const insightPanels = [
    { eyebrow: 'Crowd read', title: crowdReadTitle, detail: crowdReadDetail, tone: 'brand' as const },
    { eyebrow: 'Knockout blow', title: knockoutTitle, detail: knockoutDetail, tone: 'danger' as const },
    { eyebrow: 'Contrarian edge', title: contrarianTitle, detail: contrarianDetail, tone: 'success' as const },
  ];


  return (
    <div className="space-y-8">
      <SeoMeta
        title={`${comp.name} | Last Man Standing`}
        description={`View fixtures, picks, standings, reminders, and competition updates for ${comp.name}.`}
        canonicalPath={`/competitions/${compId}`}
        noindex
      />
      {/* ── Header ── */}
      <section
        className="competition-hero-shell relative overflow-hidden rounded-[1.9rem] border border-white/15 px-5 py-5 shadow-[0_22px_52px_rgba(2,6,23,0.34)] sm:px-6 sm:py-6 lg:px-8 lg:py-7"
        data-club-branded={comp.clubPrimaryColor ? '' : undefined}
        style={{
          background: comp.clubPrimaryColor
            ? resolvedTheme === 'light'
              ? `radial-gradient(135deg,#ffffff,#eaf3fc)`
              : `radial-gradient(135deg,rgba(15,23,42,0.98),rgba(8,15,30,0.94))`
            : undefined,
          ...(comp.clubPrimaryColor ? {
            borderTopColor: comp.clubPrimaryColor,
            borderTopWidth: '3px',
            ...(comp.clubSecondaryColor ? {
              borderRightColor: comp.clubSecondaryColor,
              borderRightWidth: resolvedTheme === 'light' ? '4px' : '2px',
              boxShadow: resolvedTheme === 'light'
                ? `0 0 0 1px ${comp.clubSecondaryColor}18 inset`
                : undefined,
            } : {}),
          } : {}),
        }}
      >
        {/* Club logo — top right corner (mobile/tablet only; desktop is in the right column) */}
        {comp.clubLogoUrl && (
          <img
            src={comp.clubLogoUrl}
            alt={comp.clubName ?? 'Club logo'}
            className="absolute right-5 top-5 h-16 w-16 rounded-2xl object-cover border border-white/20 shadow-lg sm:h-20 sm:w-20 lg:hidden"
          />
        )}
        <div className="absolute inset-y-0 right-0 hidden w-1/3 bg-[linear-gradient(180deg,transparent,rgba(255,255,255,0.02),transparent)] lg:block" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <Link to="/competitions" className="mb-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-sky-200/90 transition hover:text-white">
              <span>←</span> Competition lobby
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone={comp.status === 'ACTIVE' ? 'success' : comp.status === 'UPCOMING' ? 'info' : 'neutral'}>
                {comp.status}
              </StatusPill>
              {selectedEntryLabel && <StatusPill tone="neutral">{selectedEntryLabel}</StatusPill>}
              {myEntries.length > 1 && (
                <label className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.08] px-3 py-1 text-[11px] font-semibold text-gray-200">
                  <span className="uppercase tracking-[0.14em] text-gray-400">Entry</span>
                  <select
                    value={selectedEntryId ?? ''}
                    onChange={(e) => setSelectedEntryId(Number(e.target.value))}
                    className="bg-transparent text-white outline-none"
                  >
                    {myEntries.map((entry) => (
                      <option key={entry.id} value={entry.id} className="bg-surface-800 text-white">
                        #{entry.entryNumber ?? 1}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {isEliminated && <StatusPill tone="danger">Eliminated</StatusPill>}
              {isWinner && <StatusPill tone="warn">🏆 Winner</StatusPill>}
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-5xl">{comp.name}</h1>
            {comp.description && <p className="mt-2 max-w-xl text-sm leading-6 text-gray-300 sm:text-[15px] lg:text-base">{comp.description}</p>}
            <div className="mt-4 grid max-w-xl grid-cols-3 gap-2 sm:gap-3 lg:gap-4">
              <MetricCard label="Players" value={String(comp.participantCount ?? 0)} />
              <MetricCard label="Active" value={String(inProgressWeek ? effectiveActiveCount : (comp.activeCount ?? 0))} />
              <MetricCard label="Prize" value={comp.prizePool && comp.prizePool > 0 ? `€${comp.prizePool}` : comp.entryFee > 0 ? `€${comp.entryFee}` : 'Free'} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="chip-muted">{sidebarStatusLabel}</span>
              {sidebarMeta && <span className="chip-muted text-gray-300">{sidebarMeta}</span>}
              {secondaryMeta && <span className="rounded-full border border-sky-300/35 bg-sky-400/14 px-3 py-1.5 text-sky-100">{secondaryMeta}</span>}
              <span className={clsx('rounded-full border px-3 py-1.5', lifelineStatusToneClass)}>
                {lifelineStatusLabel}
              </span>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 items-stretch sm:flex-row sm:flex-wrap lg:w-auto lg:flex-col lg:items-end">
          {/* Logo inline in this column on desktop */}
          {comp.clubLogoUrl && (
            <img
              src={comp.clubLogoUrl}
              alt={comp.clubName ?? 'Club logo'}
              className="hidden lg:block h-24 w-24 rounded-2xl object-cover border border-white/20 shadow-lg mb-2"
            />
          )}
          {/* Share / Invite */}
          {canInvite && (
          <div className="relative w-full sm:w-auto" data-share-menu>
            <button
              onClick={() => setShareOpen((v) => !v)}
              data-club-branded={comp.clubPrimaryColor ? '' : undefined}
              className="inline-flex w-full items-center justify-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-white/[0.11] hover:bg-white/[0.16] text-white transition border border-white/25 sm:w-auto sm:py-1.5"
                style={comp.clubSecondaryColor ? {
                borderColor: `${comp.clubSecondaryColor}${resolvedTheme === 'light' ? 'aa' : '66'}`,
                backgroundColor: `${comp.clubSecondaryColor}${resolvedTheme === 'light' ? '35' : '18'}`,
                color: resolvedTheme === 'light' ? comp.clubSecondaryColor : comp.clubSecondaryColor,
                boxShadow: resolvedTheme === 'light' ? `0 0 0 1px ${comp.clubSecondaryColor}22 inset` : undefined,
              } : comp.clubPrimaryColor ? {
                borderColor: `${comp.clubPrimaryColor}44`,
                backgroundColor: `${comp.clubPrimaryColor}14`,
                color: comp.clubPrimaryColor,
              } : undefined}
            >
              📨 Invite
            </button>
            {shareOpen && (
              <div className="absolute left-0 right-auto top-full mt-1 z-50 w-[min(20rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] rounded-xl border border-white/15 bg-surface-800 shadow-[0_14px_30px_rgba(2,6,23,0.42)] p-3 space-y-2 sm:left-auto sm:right-0 sm:w-64 sm:max-w-64">
                <p className="text-sm font-semibold text-gray-300 mb-1">Share this competition</p>
                {comp.joinCode ? (
                  <div className="rounded-lg border border-brand-500/20 bg-brand-500/10 px-3 py-2 text-xs text-brand-100">
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-300">Join code</span>
                    <span className="mt-1 block text-sm font-bold tracking-[0.14em]">{comp.joinCode}</span>
                  </div>
                ) : (
                  <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-300">
                    Public competition — no join code needed.
                  </div>
                )}
                {comp.joinCode && qrUrl && (
                  <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-300">
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">QR invite</span>
                    <img
                      src={qrUrl}
                      alt="Invite QR code"
                      className="mt-2 h-36 w-36 rounded-lg border border-white/10 bg-white p-1"
                      loading="lazy"
                    />
                  </div>
                )}
                <button
                  onClick={handleNativeShare}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-brand-600/20 hover:bg-brand-600/35 text-brand-100 text-sm transition"
                >
                  <span>📲</span> Share
                </button>
                {/* Copy link */}
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(joinLink).then(() => {
                      toast.success('Link copied!');
                      setShareOpen(false);
                    }).catch(() => toast.error('Could not copy'));
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-700 hover:bg-surface-600 text-gray-200 text-sm transition"
                >
                  <span>🔗</span> Copy link
                </button>
                {/* WhatsApp */}
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(shareMessage)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setShareOpen(false)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-green-700/30 hover:bg-green-700/50 text-green-300 text-sm transition"
                >
                  <span>💬</span> Share on WhatsApp
                </a>
                {/* Email */}
                <a
                  href={`mailto:?subject=${encodeURIComponent(`Join ${comp.name} — Last Man Standing`)}&body=${encodeURIComponent(`Hi,\n\nI'd like to invite you to join my Last Man Standing competition: ${comp.name}.\n${comp.entryFee > 0 ? `Entry fee: €${comp.entryFee}\n` : ''}${comp.description ? `\n${comp.description}\n` : ''}${comp.joinCode ? `\nJoin code: ${comp.joinCode}\n` : ''}\nSign up and join here:\n${joinLink}\n\nGood luck!`)}`}
                  onClick={() => setShareOpen(false)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-700 hover:bg-surface-600 text-gray-200 text-sm transition"
                >
                  <span>✉️</span> Send via Email
                </a>
                <button onClick={() => setShareOpen(false)} className="w-full text-sm text-gray-500 hover:text-gray-300 pt-1">Dismiss</button>
              </div>
            )}
          </div>
          )}
        </div>
          </div>
        {comp.paused && (
          <div className="relative mt-5 rounded-2xl border border-yellow-400/30 bg-yellow-500/10 px-4 py-3 text-yellow-50">
            <div className="flex items-start gap-3">
              <span className="text-xl">⏸</span>
              <div>
                <p className="font-bold">Competition paused</p>
                <p className="mt-1 text-sm leading-5 text-yellow-100/80">{comp.pauseReason || 'The organiser has temporarily paused this competition.'}</p>
                <p className="mt-1 text-xs text-yellow-200/60">Joining, payments, picks, reminders and automatic gameweek processing are temporarily stopped. Fixture kickoff and gameweek lock times remain unchanged.</p>
              </div>
            </div>
          </div>
        )}
        <div className="relative mt-6 grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
          <div
            className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm"
            data-club-accent={comp.clubPrimaryColor ? '' : undefined}
            style={comp.clubPrimaryColor ? { borderLeftColor: comp.clubPrimaryColor, borderLeftWidth: '3px' } : undefined}
          >
            {narrativeFirstLoad ? (
              <CompetitionPulseSkeleton />
            ) : (
              <>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-200/80">
              {comp.clubLogoUrl && (
                <img src={comp.clubLogoUrl} alt="" className="h-6 w-6 rounded-md object-cover border border-white/20" />
              )}
              <span>{comp.clubName ? comp.clubName : 'Competition'} Pulse</span>
              {pulseLatestWeek && <span className="text-gray-500">•</span>}
              {pulseLatestWeek && <span className="text-yellow-200/90">Latest: GW{pulseLatestWeek.weekNumber}</span>}
            </div>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-3xl">{storylineTitle}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-300 sm:text-[15px]">{storylineBody}</p>
            {hasWinner && comp.winnerUsername && (
              <div className="mt-3 inline-flex items-center gap-2 rounded-xl border border-yellow-400/30 bg-yellow-400/10 px-4 py-2 text-sm font-semibold text-yellow-200">
                <span>🏆</span>
                <span>{isWinner ? 'You are the winner!' : `Winner: ${comp.winnerUsername}`}</span>
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-black/15 px-3 py-1.5 text-xs font-medium text-gray-200">
                {effectiveEliminatedCount} eliminated
              </span>
              <span className="rounded-full border border-white/10 bg-black/15 px-3 py-1.5 text-xs font-medium text-gray-200">
                {survivalRate}% survival rate
              </span>
              {weeklySurvivalRate != null && (
                <span className="rounded-full border border-white/10 bg-black/15 px-3 py-1.5 text-xs font-medium text-gray-200">
                  <span className="block">{narrativeWeekInProgress ? `Resolved picks: ${weeklySurvivalRate}% advanced` : `GW survival ${weeklySurvivalRate}%`}</span>
                  {weeklyPickedCount > 0 && (
                    <span className="block text-gray-400">{weeklyAdvancedCount} adv · {weeklyEliminatedCount} out{narrativeWeekInProgress && gwPendingSelectionCount > 0 ? ` · ${gwPendingSelectionCount} pending` : ''}</span>
                  )}
                  {narrativeWeekInProgress && narrativeFixtureCount > 0 && (
                    <span className="block text-gray-500">{narrativeResolvedFixtureCount} fixtures resolved · {narrativePendingFixtureCount} to play</span>
                  )}
                </span>
              )}
              {mostBackedTeam && (
                <span className="rounded-full border border-white/10 bg-black/15 px-3 py-1.5 text-xs font-medium text-gray-200">
                  Crowd pick: {mostBackedTeam.teamShortName} {mostBackedTeam.percentage}%
                </span>
              )}
            </div>
              </>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {narrativeFirstLoad ? <CompetitionSpotlightSkeleton /> : spotlightCards.map((card) => (
              <NarrativeCard
                key={card.eyebrow}
                eyebrow={card.eyebrow}
                title={card.title}
                detail={card.detail}
                accent={card.accent}
              />
            ))}
          </div>
        </div>
      </section>

      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setMobileInsightsOpen((v) => !v)}
          className="w-full flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left text-sm font-semibold text-gray-200"
          aria-expanded={mobileInsightsOpen}
          aria-controls="mobile-insights"
        >
          <span>Competition insights</span>
          <span className="text-gray-400">{mobileInsightsOpen ? 'Hide' : 'Show'}</span>
        </button>
        {mobileInsightsOpen && (
          <section id="mobile-insights" className="mt-4 grid gap-4">
            {insightPanels.map((panel) => (
              <InsightPanel
                key={panel.eyebrow}
                eyebrow={panel.eyebrow}
                title={panel.title}
                detail={panel.detail}
                tone={panel.tone}
              />
            ))}
          </section>
        )}
      </div>

      <section className="hidden lg:grid gap-4 lg:grid-cols-3">
        {insightPanels.map((panel) => (
          <InsightPanel
            key={panel.eyebrow}
            eyebrow={panel.eyebrow}
            title={panel.title}
            detail={panel.detail}
            tone={panel.tone}
          />
        ))}
      </section>

      <section className="rounded-[1.35rem] border border-white/10 bg-white/[0.03] px-4 py-4 sm:px-5">
        {narrativeFirstLoad ? (
          <CompetitionSnapshotSkeleton />
        ) : snapshotShareMode ? (
          <>
            <div
              ref={gameweekSnapshotRef}
              className={snapshotCardClassName}
            >
              <div className="mb-4 h-1.5 rounded-full bg-[linear-gradient(90deg,rgba(56,189,248,0.95),rgba(14,165,233,0.7),rgba(34,197,94,0.65))]" />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className={resolvedTheme === 'light' ? 'text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700' : 'text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-200'}>What Changed This Gameweek</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <h2 className={resolvedTheme === 'light' ? 'text-lg font-semibold text-slate-900' : 'text-lg font-semibold text-white'}>
                      {narrativeWeekLabel ?? 'Latest gameweek'} snapshot
                    </h2>
                    <span className={clsx(
                      'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                      snapshotShareMode === 'live'
                        ? 'border-sky-400/35 bg-sky-500/15 text-sky-200'
                        : 'border-emerald-400/35 bg-emerald-500/15 text-emerald-200'
                    )}>
                      {snapshotShareMode === 'live' ? 'Live update' : 'Recap'}
                    </span>
                    {narrativeWeekByeGranted && (
                      <span className="inline-flex items-center rounded-full border border-amber-400/35 bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-200">
                        🎁 Bye granted
                      </span>
                    )}
                  </div>
                  <p className={clsx('mt-2 max-w-2xl text-sm leading-6', snapshotSubcopyClassName)}>
                    A shareable snapshot of the latest round: the headline result, the biggest pressure point, and the number of survivors still standing.
                  </p>
                </div>
                <div className={clsx('inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-medium', resolvedTheme === 'light' ? 'border-slate-200 bg-white/90 text-slate-600' : 'border-white/10 bg-white/[0.06] text-gray-300')}>
                  Shared snapshot
                </div>
              </div>
              {narrativeWeekByeGranted && (
                <p className={clsx('mt-2 text-xs', resolvedTheme === 'light' ? 'text-amber-700/90' : 'text-amber-200/90')}>
                  Everyone who was still active advanced this round by bye.
                </p>
              )}
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className={snapshotMetricClassName}>
                  <div className={resolvedTheme === 'light' ? 'text-[11px] uppercase tracking-[0.14em] text-slate-500' : 'text-[11px] uppercase tracking-[0.14em] text-gray-400'}>New eliminations</div>
                  <div className={clsx('mt-1 text-base font-bold', resolvedTheme === 'light' ? 'text-red-600' : 'text-red-300')}>{weeklyEliminatedCount}</div>
                </div>
                <div className={snapshotMetricClassName}>
                  <div className={resolvedTheme === 'light' ? 'text-[11px] uppercase tracking-[0.14em] text-slate-500' : 'text-[11px] uppercase tracking-[0.14em] text-gray-400'}>Most picked</div>
                  <div className={clsx('mt-1 text-base font-bold', resolvedTheme === 'light' ? 'text-slate-900' : 'text-white')}>
                    {mostBackedTeam ? `${mostBackedTeam.teamShortName} (${mostBackedTeam.pickCount})` : 'No picks yet'}
                  </div>
                </div>
                <div className={snapshotMetricClassName}>
                  <div className={resolvedTheme === 'light' ? 'text-[11px] uppercase tracking-[0.14em] text-slate-500' : 'text-[11px] uppercase tracking-[0.14em] text-gray-400'}>Lifelines played</div>
                  <div className={clsx('mt-1 text-base font-bold', resolvedTheme === 'light' ? 'text-amber-700' : 'text-amber-300')}>
                    {comp.lifelineEnabled ? lifelinesPlayedThisWeek : 'Lifeline off'}
                  </div>
                </div>
                <div className={snapshotMetricClassName}>
                  <div className={resolvedTheme === 'light' ? 'text-[11px] uppercase tracking-[0.14em] text-slate-500' : 'text-[11px] uppercase tracking-[0.14em] text-gray-400'}>Entries remaining</div>
                  <div className={clsx('mt-1 text-base font-bold', resolvedTheme === 'light' ? 'text-emerald-700' : 'text-emerald-300')}>{effectiveActiveCount}</div>
                </div>
              </div>
              <div className={clsx('mt-4 flex flex-col gap-2 border-t pt-3 text-[11px] sm:flex-row sm:items-center sm:justify-between', resolvedTheme === 'light' ? 'border-slate-200 text-slate-500' : 'border-white/10 text-gray-400')}>
                <span className="inline-flex items-center gap-2">
                  <span className={clsx('inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-full border', resolvedTheme === 'light' ? 'border-slate-200 bg-white' : 'border-white/10 bg-white/90')}>
                    <img src="/app-logo.png?v=20260511" alt="Last Man Standing" className="h-full w-full object-cover" />
                  </span>
                  <span>{comp.name}</span>
                </span>
                <span className={snapshotFooterTextClassName}>Last Man Standing · runlastmanstanding.com · Share snapshot</span>
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={onShareGameweekSnapshot}
                disabled={snapshotSharing}
                className="inline-flex items-center gap-2 rounded-lg border border-brand-400/35 bg-brand-500/12 px-3 py-2 text-xs font-semibold text-brand-200 transition hover:bg-brand-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {snapshotSharing ? 'Preparing snapshot...' : snapshotShareButtonLabel}
              </button>
            </div>
          </>
        ) : (
          <div className={clsx(snapshotCardClassName, 'flex flex-col items-start gap-3')}>
            <div className={resolvedTheme === 'light' ? 'text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700' : 'text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-200'}>
              What Changed This Gameweek
            </div>
            <h2 className={resolvedTheme === 'light' ? 'text-lg font-semibold text-slate-900' : 'text-lg font-semibold text-white'}>
              Snapshot appears after kickoff
            </h2>
            <p className={clsx('max-w-2xl text-sm leading-6', snapshotSubcopyClassName)}>
              A shareable snapshot will appear once the competition has started and the first gameweek begins to resolve.
            </p>
            <div className={clsx('inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-medium', resolvedTheme === 'light' ? 'border-slate-200 bg-white/90 text-slate-600' : 'border-white/10 bg-white/[0.06] text-gray-300')}>
              Not available yet
            </div>
          </div>
        )}
      </section>

      {stateBanner && (
        <section className={clsx(
          'rounded-[1.35rem] border px-4 py-4 sm:px-5',
          stateBanner.tone === 'warn' && 'border-amber-400/35 bg-amber-500/10',
          stateBanner.tone === 'success' && 'border-green-400/35 bg-green-500/10',
          stateBanner.tone === 'muted' && 'border-white/10 bg-white/[0.03]',
          stateBanner.tone === 'brand' && 'border-brand-400/35 bg-brand-500/10'
        )}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className={clsx('text-[11px] font-semibold uppercase tracking-[0.14em]', stateBanner.tone === 'warn' ? 'text-amber-300' : 'text-brand-200')}>{stateBanner.eyebrow}</div>
              <h2 className="mt-1 text-lg font-semibold text-white">{stateBanner.title}</h2>
              <p className="mt-1 text-sm text-gray-200">{stateBanner.detail}</p>
            </div>
            {stateBanner.ctaKind === 'join' ? (
              <button type="button" onClick={handleDirectJoin} disabled={joinMutation.isPending} className="btn-primary w-full sm:w-auto disabled:cursor-not-allowed disabled:opacity-60">
                {joinMutation.isPending ? 'Joining...' : comp.entryFee > 0 && comp.paymentMode !== 'FREE' ? `Register · €${comp.entryFee} to organiser` : 'Join competition'}
              </button>
            ) : stateBanner.ctaKind === 'pick' ? (
              <button type="button" onClick={handleScrollToOpenWeek} className="btn-primary w-full sm:w-auto">{stateBanner.ctaLabel}</button>
            ) : null}
          </div>
        </section>
      )}

      {resultsProcessing && (
        <section className="rounded-[1.35rem] border border-yellow-500/30 bg-yellow-500/10 px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-yellow-300">Processing Update</div>
              <h2 className="mt-1 text-lg font-semibold text-white">Simulated results are still being finalized</h2>
              <p className="mt-1 text-sm text-gray-300">
                Fixture outcomes are in, but eliminations and survivor counts are still syncing. This page will refresh automatically when processing completes.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 self-start rounded-full border border-yellow-400/30 bg-black/10 px-3 py-1.5 text-xs font-medium text-yellow-200">
              <span className="h-2 w-2 animate-pulse rounded-full bg-yellow-300" />
              Updating
            </div>
          </div>
        </section>
      )}

      <div className="hidden lg:flex justify-end">
        <button
          type="button"
          onClick={() => setSidebarCollapsed((prev) => !prev)}
          className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-sm font-semibold text-gray-200 transition hover:border-white/30 hover:bg-white/[0.11] hover:text-white"
          aria-pressed={sidebarCollapsed}
          aria-label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
        >
          <span className="text-sm">{sidebarCollapsed ? '▸' : '▾'}</span>
          {sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
        </button>
      </div>

      <div className={clsx(
        'grid gap-6',
        sidebarCollapsed
          ? 'lg:grid-cols-1'
          : 'lg:grid-cols-[minmax(0,1fr)_420px] xl:grid-cols-[minmax(0,1fr)_480px] 2xl:grid-cols-[minmax(0,1fr)_520px]'
      )}>
        <div className="order-2 space-y-8 lg:order-1">
          {sidebarCollapsed && (
            <ActionPanel
              tone={actionTone}
              title="Status & Actions"
              statusLabel={sidebarStatusLabel}
              body={sidebarSummary}
              meta={sidebarMeta}
              resolvedTheme={resolvedTheme}
              accentColor={sidebarAccentColor}
              cta={!hasConfirmedParticipation && comp.status === 'UPCOMING' ? (
                <button
                  type="button"
                  onClick={handleDirectJoin}
                  disabled={joinMutation.isPending || joinedOptimistically}
                  className="btn-primary w-full sm:w-auto text-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {joinMutation.isPending ? 'Joining...' : comp.entryFee > 0 && comp.paymentMode !== 'FREE' ? `Register · €${comp.entryFee} to organiser` : 'Join competition'}
                </button>
              ) : (
                <Link
                  to={`/competitions/${compId}/survivor-table`}
                  className="btn-secondary w-full sm:w-auto text-sm text-center"
                >
                  Open survivor table
                </Link>
              )}
            />
          )}
          {comp.status !== 'COMPLETED' && isParticipant && !isEliminated && !isWinner && myStatus.picks.length === 0 && (
            <section className="card p-4 sm:p-5 hidden lg:block">
              <h2 className="text-lg font-semibold text-gray-100">Your first pick</h2>
              <p className="mt-2 text-sm text-gray-300">
                Pick one team from the next open gameweek. Once you use a team, you cannot use it again later in the competition.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <SummaryTile
                  label="Step 1"
                  value="Open the next week"
                  detail={openWeekWithoutPick ? `Gameweek ${openWeekWithoutPick.weekNumber} is the next one to complete.` : 'The next upcoming gameweek appears at the top of the fixtures list.'}
                />
                <SummaryTile
                  label="Step 2"

                  value="Choose one team"
                  detail="Tap either side of a fixture to save your selection instantly."
                />
                <SummaryTile
                  label="Step 3"
                  value="Check the lock time"
                  detail={nextLockDateForHook ? `Picks close ${formatDistanceToNow(nextLockDateForHook, { addSuffix: true })}.` : 'Make your pick before the gameweek locks.'}
                />
              </div>
            </section>
          )}

          {reminderPanel && (
            <div className="lg:hidden">
                <button
                type="button"
                onClick={() => setMobileReminderOpen((v) => !v)}
                  className="w-full flex min-h-[44px] items-center justify-between rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3 text-left text-sm font-semibold text-gray-200"
                aria-expanded={mobileReminderOpen}
                aria-controls="mobile-reminder"
              >
                <span>Reminder setup</span>
                <span className="text-gray-400">{mobileReminderOpen ? 'Hide' : 'Show'}</span>
              </button>
              {mobileReminderOpen && (
                <section
                  id="mobile-reminder"
                  className="mt-4"
                  data-club-branded={sidebarAccentColor ? '' : undefined}
                  style={sidebarAccentColor ? {
                    borderColor: resolvedTheme === 'light' ? `${sidebarAccentColor}44` : `${sidebarAccentColor}2f`,
                  } : undefined}
                >
                  {reminderPanel}
                </section>
              )}
            </div>
          )}

          {/* ── Next Lock Countdown ── */}
          {nextLockDateForHook && !countdown.expired && (
            <div className={clsx(
              'rounded-xl border px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3',
              countdown.totalSeconds < 1800
                ? 'border-red-500/40 bg-red-500/10'
                : countdown.totalSeconds < 7200
                ? 'border-yellow-500/40 bg-yellow-500/10'
                : 'border-brand-500/30 bg-brand-500/10'
            )}>
              <div>
                <p className={clsx('text-sm font-medium', countdown.totalSeconds < 1800 ? 'text-red-400' : countdown.totalSeconds < 7200 ? 'text-yellow-400' : 'text-brand-400')}>
                  {countdown.totalSeconds < 1800 ? '⚠️ Picks lock very soon!' : '⏰ Next gameweek lock'}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {nextLockDateForHook.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}{', '}
                  {nextLockDateForHook.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}
                </p>
              </div>
              <div className="flex items-center gap-2 font-mono text-2xl font-bold">
                {countdown.days > 0 && (
                  <>
                    <CountdownUnit value={countdown.days} label="d" />
                    <span className="text-gray-500">:</span>
                  </>
                )}
                <CountdownUnit value={countdown.hours} label="h" urgent={countdown.totalSeconds < 3600} />
                <span className="text-gray-500">:</span>
                <CountdownUnit value={countdown.minutes} label="m" urgent={countdown.totalSeconds < 1800} />
                <span className="text-gray-500">:</span>
                <CountdownUnit value={countdown.seconds} label="s" urgent={countdown.totalSeconds < 1800} />
              </div>
            </div>
          )}

          {/* ── Fixtures with inline pick selection ── */}
          {fixturesLoading ? (
            <div className="space-y-3 animate-pulse">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="card p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="h-5 w-28 bg-surface-600 rounded" />
                    <div className="h-5 w-20 bg-surface-600 rounded" />
                  </div>
                  {[...Array(3)].map((_, j) => (
                    <div key={j} className="flex justify-between items-center py-2 border-b border-gray-700/40">
                      <div className="h-4 w-24 bg-surface-700 rounded" />
                      <div className="h-4 w-12 bg-surface-700 rounded" />
                      <div className="h-4 w-24 bg-surface-700 rounded" />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : !sortedWeeks.length ? (
            <div className="card text-center py-10">
              <p className="text-gray-300 font-medium">
                {comp?.status === 'UPCOMING' ? 'Fixtures are syncing…' : 'No fixtures available yet'}
              </p>
              {comp?.status === 'UPCOMING' && (
                <p className="mt-2 text-sm text-gray-500">
                  This page will update automatically as soon as the first gameweeks are ready.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 gw-pref-shell sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-brand-200">Preference</div>
                  <div className="mt-1 text-base font-black text-white">Gameweek display</div>
                </div>
                <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:min-w-[18rem]">
                    <div className="grid w-full grid-cols-2 gw-pref-track">
                    {(['cards', 'route'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => updateGameweekDisplayMode(mode)}
                        className={clsx(
                          'flex min-h-[42px] w-full items-center justify-center rounded-xl px-3 py-2 text-center text-sm font-black transition sm:px-4',
                          gameweekDisplayMode === mode
                            ? 'border border-brand-300/50 bg-brand-500/25 text-brand-100 shadow-sm shadow-brand-950/30'
                            : 'text-slate-400 hover:text-slate-200'
                        )}
                      >
                        {mode === 'cards' ? 'Cards' : 'My Route'}
                      </button>
                    ))}
                  </div>
                  {isParticipant && openSelectionCount > 0 && (
                    <div className="flex w-full flex-col items-stretch gap-1.5">
                      <button
                        type="button"
                        onClick={() => setResetOpenConfirmOpen(true)}
                        disabled={resetOpenSelectionsMutation.isPending}
                        className="reset-picks-btn"
                      >
                        <span className="text-sm leading-none">↺</span>
                        {resetOpenSelectionsMutation.isPending ? 'Resetting…' : 'Reset open picks'}
                      </button>
                      <p className="px-1 text-center text-[11px] leading-4 text-slate-500 sm:text-right">
                        Clears open weeks across {myEntries.length > 1 ? `all ${myEntries.length} entries` : 'your entry'}.
                      </p>
                    </div>
                  )}
                </div>
              </div>
              {sortedWeeks.map((wn) => {
                const gwData = fixturesByWeek.get(wn)!;
                const gwId = gwData.gwId;
                const gwFixtures = gwData.fixtures;
                const lockAt = gwData.lockAt;
                const gwStatus = gwData.gwStatus;
                const gwVoided = gwData.gwVoided;

                const isLocked = gwStatus === 'LOCKED' || gwStatus === 'IN_PROGRESS' || gwStatus === 'COMPLETED' || isPast(parseDate(lockAt));
                const isCompleted = gwStatus === 'COMPLETED' || gwFixtures.every(f => f.status === 'FINISHED' || f.status === 'POSTPONED' || f.status === 'CANCELLED');
                const isCollapsed = collapsedWeeks.has(wn);
                const byeGrantedForGw = Boolean(byeGrantedByGwId.get(gwId));
                const savedPickForGw = pickByGwId.get(gwId);
                const myPickForGw = savedPickForGw
                  ? { ...savedPickForGw, outcome: effectivePickOutcome({ ...savedPickForGw, gameweekId: gwId }) }
                  : undefined;
                const fixtureCount = gwFixtures.length;
                const resolvedFixtureCount = gwFixtures.filter((f) => f.status === 'FINISHED' || f.status === 'POSTPONED' || f.status === 'CANCELLED').length;
                const routeMode = gameweekDisplayMode === 'route';

                return (
                  <div
                    id={`gw-card-${wn}`}
                    key={wn}
                    className={clsx('card relative overflow-hidden transition-[border-color,box-shadow] duration-200', {
                      'border-sky-300/45': myPickForGw && !isCompleted,
                      'border-white/15 opacity-75': isCompleted,
                      'border-amber-400/35': !myPickForGw && !isCompleted && !isLocked && isParticipant && !isEliminated && !isWinner,
                    })}
                    data-club-branded={comp.clubPrimaryColor ? '' : undefined}
                    style={comp.clubPrimaryColor ? {
                      borderColor: resolvedTheme === 'light' ? `${comp.clubPrimaryColor}55` : `${comp.clubPrimaryColor}40`,
                      boxShadow: resolvedTheme === 'light'
                        ? `0 0 0 1px ${comp.clubPrimaryColor}14, 0 6px 16px ${(comp.clubSecondaryColor ?? comp.clubPrimaryColor)}0d`
                        : `0 0 0 1px ${comp.clubPrimaryColor}10`,
                    } : undefined}
                  >
                    {comp.clubPrimaryColor && (
                      <div
                        className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
                        style={{
                          backgroundImage: `linear-gradient(90deg, ${comp.clubPrimaryColor}, ${comp.clubSecondaryColor ?? comp.clubPrimaryColor})`,
                          boxShadow: `0 0 0 1px ${comp.clubSecondaryColor ?? comp.clubPrimaryColor}28`,
                        }}
                      />
                    )}
                    {/* ── Gameweek header — clickable toggle ── */}
                    <button
                      onClick={() => toggleWeek(wn)}
                      className="w-full flex items-start justify-between gap-2 text-left group rounded-lg -m-1.5 p-1.5 transition-colors hover:bg-white/[0.03]"
                      aria-expanded={!isCollapsed}
                      aria-controls={`gw-${wn}-fixtures`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex min-w-0 items-center gap-2 overflow-hidden sm:gap-3">
                          <h3 className="text-lg font-semibold shrink-0">Gameweek {wn}</h3>
                          {gwVoided ? (
                            <span className="badge-brand shrink-0 text-xs">Voided</span>
                          ) : isCompleted ? (
                            <span className="badge-gray shrink-0 text-xs">Completed</span>
                          ) : isLocked ? (
                            <span className="badge-red shrink-0 text-xs">🔒 Locked</span>
                          ) : (
                            <span className="badge-yellow shrink-0 text-xs">
                              {formatLockBadgeLabel(lockAt)}
                            </span>
                          )}
                          {byeGrantedForGw && !gwVoided && (
                            <span className="inline-flex items-center rounded-full border border-amber-400/35 bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-200 shrink-0">
                              🎁 BYE
                            </span>
                          )}
                          {isCollapsed && !myPickForGw && isParticipant && !isEliminated && !isWinner && !isLocked && (
                            <span className="hidden truncate text-xs text-yellow-400 italic sm:inline">— no pick yet</span>
                          )}
                        </div>

                        {myPickForGw && (
                          <div className="mt-1 flex items-center gap-1.5 overflow-hidden text-xs text-gray-400 sm:text-sm">
                            <span className="shrink-0">{isCollapsed ? 'Selected:' : 'Your pick:'}</span>
                            <span className={clsx('truncate font-semibold', {
                              'text-green-400': myPickForGw.outcome === 'ADVANCE',
                              'text-red-400': myPickForGw.outcome === 'ELIMINATED',
                              'text-yellow-400': myPickForGw.outcome === 'POSTPONED_ADVANCE',
                              'text-brand-400': myPickForGw.outcome === 'PENDING',
                            })}>
                              {myPickForGw.teamShortName}
                            </span>
                            {myPickForGw.outcome !== 'PENDING' && <span className="shrink-0"><OutcomeBadge outcome={myPickForGw.outcome} /></span>}
                          </div>
                        )}
                        {isCollapsed && !myPickForGw && isParticipant && !isEliminated && !isWinner && !isLocked && (
                          <div className="mt-1 truncate text-xs text-yellow-400 italic sm:hidden">— no pick yet</div>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3 ml-2">
                        {!isCollapsed && isLocked && (
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              to={`/competitions/${compId}/gameweeks/${gwId}/selections`}
                              onClick={(e) => e.stopPropagation()}
                              onMouseEnter={() => prefetchGameweekViews(gwId)}
                              onFocus={() => prefetchGameweekViews(gwId)}
                              className="text-xs text-brand-400 hover:text-brand-300 hidden sm:inline whitespace-nowrap"
                            >
                              All selections →
                            </Link>
                            {isCompleted && (
                              <Link
                                to={`/competitions/${compId}/gameweeks/${gwId}/results`}
                                onClick={(e) => e.stopPropagation()}
                                onMouseEnter={() => prefetchGameweekViews(gwId)}
                                onFocus={() => prefetchGameweekViews(gwId)}
                                className="text-xs text-green-400 hover:text-green-300 hidden sm:inline font-medium whitespace-nowrap"
                              >
                                📊 Results →
                              </Link>
                            )}
                          </div>
                        )}
                        {/* Chevron */}
                        <svg
                          className={clsx('w-5 h-5 text-gray-400 group-hover:text-gray-200 transition-transform duration-200', {
                            'rotate-180': !isCollapsed,
                          })}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>

                    {routeMode && (
                      <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-black">
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-slate-400">{fixtureCount} fixtures</span>
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-slate-400">{resolvedFixtureCount}/{fixtureCount} resolved</span>
                        {myPickForGw ? (
                          <span className="rounded-full border border-brand-400/30 bg-brand-500/15 px-2.5 py-1 text-brand-100">Pick: {myPickForGw.teamShortName}</span>
                        ) : (
                          <span className="rounded-full border border-yellow-400/30 bg-yellow-500/15 px-2.5 py-1 text-yellow-200">No pick</span>
                        )}
                        {effectiveLifelineGameweekId === gwId ? <span className="rounded-full border border-cyan-400/30 bg-cyan-500/15 px-2.5 py-1 text-cyan-100">Lifeline</span> : null}
                      </div>
                    )}

                    {/* Selections/Results links on mobile when expanded */}
                    {!isCollapsed && isLocked && (
                      <div className="mt-2 sm:hidden flex gap-3">
                        <Link
                          to={`/competitions/${compId}/gameweeks/${gwId}/selections`}
                          onMouseEnter={() => prefetchGameweekViews(gwId)}
                          onFocus={() => prefetchGameweekViews(gwId)}
                          className="text-xs text-brand-400 hover:text-brand-300"
                        >
                          View all selections →
                        </Link>
                        {isCompleted && (
                          <Link
                            to={`/competitions/${compId}/gameweeks/${gwId}/results`}
                            onMouseEnter={() => prefetchGameweekViews(gwId)}
                            onFocus={() => prefetchGameweekViews(gwId)}
                            className="text-xs text-green-400 hover:text-green-300 font-medium"
                          >
                            📊 Results →
                          </Link>
                        )}
                      </div>
                    )}

                    {/* ── Fixture rows — collapsible ── */}
                    {!isCollapsed && (() => {
                      const eliminatedBeforeThisGw = isEliminated && participant?.eliminatedWeek != null && wn > participant.eliminatedWeek;
                      const lifelineUnavailable = isEliminated || eliminatedBeforeThisGw;
                      const lifelineUsedThisGameweek = Boolean(participant?.lifelineUsed && participant?.lifelineUsedWeek === wn);
                      const lifelineUsedInAnotherGameweek = Boolean(participant?.lifelineUsed && !lifelineUsedThisGameweek);
                      const lifelineDisabled = comp.paused || gwVoided || isCompleted || lifelineUnavailable || isLocked || gwStatus !== 'UPCOMING' || lifelineUsedInAnotherGameweek;
                      return (
                      <div id={`gw-${wn}-fixtures`} className="space-y-2 mt-4">
                        {comp.lifelineEnabled && isParticipant && !isWinner && (
                          <div className="rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-3 py-2 text-xs sm:text-sm">
                            {lifelineUsedInAnotherGameweek ? (
                              <p className="text-cyan-200">
                                Lifeline already used{participant.lifelineUsedWeek ? ` in Gameweek ${participant.lifelineUsedWeek}` : ''}.
                              </p>
                            ) : lifelineUnavailable ? (
                              <p className="text-cyan-200/80">
                                Lifeline unavailable because this entry is eliminated.
                              </p>
                            ) : (
                              <label className={clsx('inline-flex items-center gap-2 text-cyan-100', lifelineDisabled && 'opacity-60')}>
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 rounded border-cyan-400/40 bg-transparent disabled:cursor-not-allowed"
                                  checked={effectiveLifelineGameweekId === gwId}
                                  disabled={lifelineDisabled}
                                  onChange={(e) => {
                                    const nextChecked = e.target.checked;
                                    if (nextChecked) {
                                      setLifelineClearedForGwId(null);
                                      setLifelineForGwId(gwId);
                                    } else {
                                      setLifelineForGwId(null);
                                      setLifelineClearedForGwId(gwId);
                                    }

                                    const currentPick = pickByGwId.get(gwId);
                                    if (currentPick) {
                                      pickMutation.mutate({ gwId, teamId: currentPick.teamId, useLifeline: nextChecked });
                                    }
                                  }}
                                />
                                Use lifeline for this gameweek
                                <span
                                  className="inline-flex items-center justify-center h-4 w-4 rounded-full border border-cyan-300/40 text-[10px] text-cyan-200"
                                  title="One-time per entry. Works only if this pick draws. It does not protect a loss."
                                  aria-label="Lifeline help"
                                >
                                  i
                                </span>
                              </label>
                            )}
                          </div>
                        )}
                        {/* Show message if user was eliminated before this gameweek (only for non-completed gameweeks) */}
                        {eliminatedBeforeThisGw && gwStatus !== 'COMPLETED' && (
                          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm">
                            <p className="text-red-400 font-medium">
                              ⚠️ {selectedEntryLabel ?? 'This entry'} was eliminated in Gameweek {participant.eliminatedWeek} and cannot make picks for this gameweek.
                            </p>
                          </div>
                        )}
                        {routeMode ? (
                          <MyRoutePanel
                            teams={uniqueTeamsForFixtures(gwFixtures, gwStatus, (teamId) => pickStatsByGwId.get(gwId)?.find((s) => s.teamId === teamId))}
                            currentPick={myPickForGw ?? null}
                            currentGameweekId={gwId}
                            consumedTeamIds={consumedTeamIds}
                            reservedTeamIds={reservedTeamIds}
                            pickHistory={myStatus?.picks ?? []}
                            showReserved={gwStatus === 'UPCOMING'}
                            canPick={!comp.paused && !gwVoided && !isCompleted && isParticipant && !isEliminated && !isWinner && !(awaitingPayment && strictManualPayment) && !isLocked && !(isEliminated && participant?.eliminatedWeek != null && wn > participant.eliminatedWeek)}
                            saving={pickMutation.isPending}
                            lifelineChecked={effectiveLifelineGameweekId === gwId}
                            onPick={(team) => handlePick(gwId, team.teamId, lockAt)}
                          />
                        ) : gwFixtures
                          .sort((a, b) => parseDate(a.kickoffAt).getTime() - parseDate(b.kickoffAt).getTime())
                          .map((f) => {
                            // Check if user can pick for THIS specific gameweek
                            // Cannot pick if: not a participant, eliminated, winner, locked, OR eliminated in an earlier gameweek
                            const eliminatedBeforeThisGw = isEliminated &&
                              participant?.eliminatedWeek != null &&
                              wn > participant.eliminatedWeek;
                            const canPickThisGw = !comp.paused && !gwVoided && !isCompleted && isParticipant && !isEliminated && !isWinner && !(awaitingPayment && strictManualPayment) && !isLocked && !eliminatedBeforeThisGw;
                            const homeIsMyPick = myPickForGw?.teamId === f.homeTeamId;
                            const awayIsMyPick = myPickForGw?.teamId === f.awayTeamId;
                            const homeUsed = consumedTeamIds.has(f.homeTeamId) && !homeIsMyPick;
                            const awayUsed = consumedTeamIds.has(f.awayTeamId) && !awayIsMyPick;
                            const showReservedForThisGw = gwStatus === 'UPCOMING';
                            const homeReserved = showReservedForThisGw && reservedTeamIds.has(f.homeTeamId) && !homeIsMyPick && !homeUsed;
                            const awayReserved = showReservedForThisGw && reservedTeamIds.has(f.awayTeamId) && !awayIsMyPick && !awayUsed;
                            const gwStats = pickStatsByGwId.get(gwId);
                            const homeStat = gwStats?.find(s => s.teamId === f.homeTeamId);
                            const awayStat = gwStats?.find(s => s.teamId === f.awayTeamId);
                            const homeRisk = calculateTeamRisk(f, 'home', homeStat, gwStatus);
                            const awayRisk = calculateTeamRisk(f, 'away', awayStat, gwStatus);

                            const pickedRisk = homeIsMyPick ? homeRisk : awayIsMyPick ? awayRisk : null;
                            const pickedStat = homeIsMyPick ? homeStat : awayIsMyPick ? awayStat : undefined;
                            const pickedTeamName = homeIsMyPick ? f.homeTeamName : awayIsMyPick ? f.awayTeamName : null;

                            return (
                              <div key={f.id} className="space-y-0">
                                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-xl bg-surface-700/50 px-3 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] transition-colors duration-150 hover:bg-surface-700/56 sm:rounded-lg sm:gap-3 sm:px-4 sm:py-2.5 lg:gap-4">
                                  <TeamButton
                                    name={f.homeTeamName}
                                  logoUrl={f.homeTeamLogoUrl}
                                  shortName={f.homeTeamShortName}
                                  isMyPick={homeIsMyPick}
                                  isUsed={homeUsed}
                                  isReserved={homeReserved}
                                  isClickable={canPickThisGw && !homeUsed && !homeReserved}
                                  align="right"
                                  pickStat={homeStat}
                                  risk={homeRisk}
                                  accentColor={comp.clubPrimaryColor}
                                  accentSecondaryColor={comp.clubSecondaryColor}
                                  onClick={() => handlePick(gwId, f.homeTeamId, lockAt)}
                                />
                                  <div className="flex flex-col items-center justify-center min-w-[58px] px-1 sm:min-w-[80px] lg:min-w-[96px]">
                                {f.status === 'FINISHED' ? (
                                  <span className="font-black text-white text-2xl leading-none sm:text-sm sm:font-bold lg:text-base">{f.scoreHome} - {f.scoreAway}</span>
                                ) : f.status === 'POSTPONED' ? (
                                  <span className="badge-yellow text-xs">PP</span>
                                ) : f.status === 'IN_PLAY' ? (
                                  <>
                                    <span className="font-black text-white text-2xl leading-none sm:text-sm sm:font-bold lg:text-base">
                                      {f.scoreHome != null && f.scoreAway != null ? `${f.scoreHome} - ${f.scoreAway}` : 'LIVE'}
                                    </span>
                                    <span className="text-green-400 text-[10px] font-bold animate-pulse uppercase tracking-[0.16em] lg:text-xs">
                                      Live
                                    </span>
                                  </>
                                ) : (
                                  <>
                                  <span className="text-gray-400 text-[10px] sm:text-xs lg:text-sm">{formatKickoffDate(f.kickoffAt)}</span>
                                    <span className="text-gray-300 text-[10px] sm:text-xs lg:text-sm font-medium">{formatKickoffTime(f.kickoffAt)}</span>
                                  </>
                                )}
                                </div>
                                  <TeamButton
                                    name={f.awayTeamName}
                                  logoUrl={f.awayTeamLogoUrl}
                                  shortName={f.awayTeamShortName}
                                  isMyPick={awayIsMyPick}
                                  isUsed={awayUsed}
                                  isReserved={awayReserved}
                                  isClickable={canPickThisGw && !awayUsed && !awayReserved}
                                  align="left"
                                  pickStat={awayStat}
                                  risk={awayRisk}
                                  accentColor={comp.clubPrimaryColor}
                                  accentSecondaryColor={comp.clubSecondaryColor}
                                  onClick={() => handlePick(gwId, f.awayTeamId, lockAt)}
                                  />
                                </div>
                                {pickedRisk && pickedTeamName ? <PickInsightPanel teamName={pickedTeamName} risk={pickedRisk} pickStat={pickedStat} /> : null}
                              </div>
                            );
                          })}
                      </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Pick History ── */}
          {myStatus && myStatus.picks.length > 0 && (
            <div className="card overflow-hidden">
              <button
                onClick={() => setHistoryCollapsed((c) => !c)}
                className="w-full flex items-center justify-between text-left group"
                aria-expanded={!historyCollapsed}
                aria-controls="pick-history"
              >
                <div>
                  <h2 className="text-xl font-bold">My Pick History</h2>
                  {selectedEntryLabel && <p className="mt-1 text-xs text-gray-400">{selectedEntryLabel}</p>}
                </div>
                <svg
                  className={clsx('w-5 h-5 text-gray-400 group-hover:text-gray-200 transition-transform duration-200', {
                    'rotate-180': !historyCollapsed,
                  })}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {!historyCollapsed && (
                <div id="pick-history" className="mt-4">
                  <div className="divide-y divide-gray-700/50 sm:hidden">
                    {myStatus.picks
                      .sort((a, b) => a.weekNumber - b.weekNumber)
                      .map((pick) => {
                        const outcome = pickHistoryOutcome(pick);
                        return (
                        <div key={pick.pickId} className="py-3 space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs uppercase tracking-[0.14em] text-gray-500">Gameweek {pick.weekNumber}</p>
                              <p className="mt-1 inline-flex min-w-0 items-center gap-1.5 text-sm font-semibold text-gray-100">
                                <RouteTeamLogo
                                  teamName={pick.teamName}
                                  shortName={pick.teamShortName}
                                  logoUrl={teamLogoById.get(pick.teamId) ?? null}
                                  size="sm"
                                />
                                <span className="truncate">{pick.teamShortName}</span>
                              </p>
                              <p className="text-xs text-gray-400 truncate">{pick.teamName}</p>
                            </div>
                            <OutcomeBadge outcome={outcome} />
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-500">
                              {pick.source === 'AUTO' ? 'Auto-picked' : 'Self-picked'}
                            </span>
                            <div className="flex items-center gap-2">
                              {pick.useLifeline ? <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-200">Lifeline</span> : null}
                              {pick.source === 'AUTO' ? <span className="badge-yellow">Auto</span> : <span className="badge-gray">Self</span>}
                            </div>
                          </div>
                        </div>
                      )})}
                  </div>

                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-700 text-gray-400 text-left">
                          <th className="py-3 px-4">GW</th>
                          <th className="py-3 px-4">Team</th>
                          <th className="py-3 px-4">Pick Type</th>
                          <th className="py-3 px-4">Outcome</th>
                        </tr>
                      </thead>
                      <tbody>
                        {myStatus.picks
                          .sort((a, b) => a.weekNumber - b.weekNumber)
                          .map((pick) => {
                          const outcome = pickHistoryOutcome(pick);
                          return (
                          <tr key={pick.pickId} className="border-b border-gray-700/50 hover:bg-surface-700/30">
                            <td className="py-3 px-4 font-medium">{pick.weekNumber}</td>
                            <td className="py-3 px-4">
                              <div className="inline-flex max-w-full items-center gap-2 min-w-0">
                                <RouteTeamLogo
                                  teamName={pick.teamName}
                                  shortName={pick.teamShortName}
                                  logoUrl={teamLogoById.get(pick.teamId) ?? null}
                                  size="sm"
                                />
                                <span className="font-semibold truncate">{pick.teamShortName}</span>
                                <span className="text-gray-400 text-xs truncate">{pick.teamName}</span>
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                {pick.source === 'AUTO' ? <span className="badge-yellow">Auto</span> : <span className="badge-gray">Self</span>}
                                {pick.useLifeline ? <span className="text-xs px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-200">Lifeline</span> : null}
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <OutcomeBadge outcome={outcome} />
                            </td>
                          </tr>
                        )})}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <aside
          className={clsx(
            'order-1 space-y-4 lg:order-2 lg:sticky lg:top-24 lg:transition-all lg:duration-300 lg:ease-out lg:overflow-hidden',
            sidebarCollapsed
              ? 'lg:max-h-0 lg:opacity-0 lg:translate-y-2 lg:pointer-events-none'
              : 'lg:max-h-[2000px] lg:opacity-100 lg:translate-y-0'
          )}
          aria-hidden={sidebarCollapsed}
        >
            <ActionPanel
              tone={actionTone}
              title="Status & Actions"
              statusLabel={sidebarStatusLabel}
              body={sidebarSummary}
              meta={sidebarMeta}
              resolvedTheme={resolvedTheme}
              accentColor={sidebarAccentColor}
              cta={!hasConfirmedParticipation && comp.status === 'UPCOMING' ? (
                <button
                  type="button"
                  onClick={handleDirectJoin}
                  disabled={joinMutation.isPending || joinedOptimistically}
                  className="btn-primary w-full sm:w-auto text-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {joinMutation.isPending ? 'Joining...' : comp.entryFee > 0 && comp.paymentMode !== 'FREE' ? `Register · €${comp.entryFee} to organiser` : 'Join competition'}
                </button>
              ) : (
                <Link
                  to={`/competitions/${compId}/survivor-table`}
                  className="btn-secondary w-full sm:w-auto text-sm text-center"
                >
                  Open survivor table
                </Link>
              )}
            />

            {reminderPanel && <div className="hidden lg:block">{reminderPanel}</div>}

            <section
              className="card relative overflow-hidden p-4 sm:p-5 hidden lg:block"
              data-club-branded={sidebarAccentColor ? '' : undefined}
              style={sidebarAccentColor ? {
                borderColor: resolvedTheme === 'light' ? `${sidebarAccentColor}44` : `${sidebarAccentColor}2f`,
              } : undefined}
            >
              {sidebarAccentColor && (
                <div
                  className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px"
                  style={{
                    backgroundImage: `linear-gradient(90deg, ${sidebarAccentColor}, ${sidebarAccentColor}c0)`,
                  }}
                />
              )}
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-gray-100">Rules & Status</h2>
                  <p className="mt-1 text-xs text-gray-400">The competition contract, payment state, and team-pool picture in one panel.</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <SummaryTile
                  label="Entry"
                  value={comp.entryFee > 0 ? `€${comp.entryFee}` : 'Free'}
                  detail={
                    awaitingPayment && comp.entryFee > 0 && comp.paymentMode !== 'FREE'
                      ? 'Awaiting organiser confirmation'
                      : paymentState === 'PAID'
                      ? 'Payment settled'
                      : comp.entryFee > 0 && comp.paymentMode !== 'FREE'
                      ? 'Pay organiser directly'
                      : 'No payment required'
                  }
                  accent={comp.entryFee > 0 ? 'text-brand-400' : 'text-green-400'}
                />
                <SummaryTile
                  label="Prize Pool"
                  value={comp.prizePool && comp.prizePool > 0 ? `€${comp.prizePool}` : 'TBD'}
                  detail={comp.prizePool && comp.prizePool > 0 ? 'Visible to all players' : 'No fixed amount set'}
                  accent={comp.prizePool && comp.prizePool > 0 ? 'text-yellow-400' : 'text-gray-300'}
                />
                <SummaryTile
                  label="Missed Pick"
                  value={comp.missedPickMode === 'AUTO_ASSIGN' ? 'Auto-Assign' : 'Eliminate'}
                  detail={comp.missedPickMode === 'AUTO_ASSIGN' ? 'Best available team is used' : 'No pick means you are out'}
                />
                <SummaryTile
                  label="Postponed Match"
                  value={comp.postponedConsumesTeam ? 'Counts as used' : 'Can be reused'}
                  detail={comp.postponedConsumesTeam ? 'That team is still burned' : 'The pick does not consume the team'}
                />
                <SummaryTile
                  label="Players"
                  value={String(comp.participantCount ?? 0)}
                  detail={comp.status === 'ACTIVE' ? `${inProgressWeek ? effectiveActiveCount : (comp.activeCount ?? 0)} still active` : comp.winnerUsername ? `Winner: ${comp.winnerUsername}` : 'Registration overview'}
                />
                <SummaryTile
                  label="Your Team Pool"
                  value={isParticipant ? `${consumedTeamIds.size} used${reservedTeamIds.size > 0 ? ` · ${reservedTeamIds.size} reserved` : ''}` : 'Join to track'}
                  detail={isParticipant && remainingTeamsCount !== null ? `${remainingTeamsCount} teams still available` : 'Usage updates after each pick'}
                />
                {comp.lifelineEnabled && (
                  <SummaryTile
                    label="Lifeline"
                    value={
                      !isParticipant
                        ? 'Enabled'
                        : participant?.lifelineUsed
                        ? `Used${participant.lifelineUsedWeek ? ` · GW${participant.lifelineUsedWeek}` : ''}`
                        : 'Available'
                    }
                    detail={
                      !isParticipant
                        ? 'One-time draw protection per entry'
                        : participant?.lifelineUsed
                        ? 'Already consumed for this entry'
                        : 'Can be used once before lock'
                    }
                    accent={!isParticipant ? 'text-cyan-300' : participant?.lifelineUsed ? 'text-amber-300' : 'text-emerald-300'}
                  />
                )}
                {isParticipant && (
                  <SummaryTile
                    label="Payment"
                    value={paymentState === 'PAID' ? 'Paid' : paymentState === 'AWAITING_PAYMENT' ? 'Awaiting' : 'Not needed'}
                    detail={paymentState === 'AWAITING_PAYMENT' ? 'Entry still needs payment confirmation' : paymentState === 'PAID' ? 'Entry is confirmed' : 'No payment required'}
                    accent={paymentState === 'PAID' ? 'text-green-400' : paymentState === 'AWAITING_PAYMENT' ? 'text-yellow-400' : 'text-gray-300'}
                  />
                )}
              </div>
            </section>
            <div className="lg:hidden">
              <button
                type="button"
                onClick={() => setMobileRulesOpen((v) => !v)}
                className="w-full flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left text-sm font-semibold text-gray-200"
                aria-expanded={mobileRulesOpen}
                aria-controls="mobile-rules"
              >
                <span>Rules & Status</span>
                <span className="text-gray-400">{mobileRulesOpen ? 'Hide' : 'Show'}</span>
              </button>
              {mobileRulesOpen && (
                <section
                  id="mobile-rules"
                  className="mt-4 card relative overflow-hidden p-4 sm:p-5"
                  data-club-branded={sidebarAccentColor ? '' : undefined}
                  style={sidebarAccentColor ? {
                    borderColor: resolvedTheme === 'light' ? `${sidebarAccentColor}44` : `${sidebarAccentColor}2f`,
                  } : undefined}
                >
                  {sidebarAccentColor && (
                    <div
                      className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px"
                      style={{
                        backgroundImage: `linear-gradient(90deg, ${sidebarAccentColor}, ${sidebarAccentColor}c0)`,
                      }}
                    />
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-100">Rules & Status</h2>
                      <p className="mt-1 text-xs text-gray-400">The competition contract, payment state, and team-pool picture in one panel.</p>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <SummaryTile
                      label="Entry"
                      value={comp.entryFee > 0 ? `€${comp.entryFee}` : 'Free'}
                      detail={
                        awaitingPayment && comp.entryFee > 0 && comp.paymentMode !== 'FREE'
                          ? 'Awaiting organiser confirmation'
                          : paymentState === 'PAID'
                          ? 'Payment settled'
                          : comp.entryFee > 0 && comp.paymentMode !== 'FREE'
                          ? 'Pay organiser directly'
                          : 'No payment required'
                      }
                      accent={comp.entryFee > 0 ? 'text-brand-400' : 'text-green-400'}
                    />
                    <SummaryTile
                      label="Prize Pool"
                      value={comp.prizePool && comp.prizePool > 0 ? `€${comp.prizePool}` : 'TBD'}
                      detail={comp.prizePool && comp.prizePool > 0 ? 'Visible to all players' : 'No fixed amount set'}
                      accent={comp.prizePool && comp.prizePool > 0 ? 'text-yellow-400' : 'text-gray-300'}
                    />
                    <SummaryTile
                      label="Missed Pick"
                      value={comp.missedPickMode === 'AUTO_ASSIGN' ? 'Auto-Assign' : 'Eliminate'}
                      detail={comp.missedPickMode === 'AUTO_ASSIGN' ? 'Best available team is used' : 'No pick means you are out'}
                    />
                    <SummaryTile
                      label="Postponed Match"
                      value={comp.postponedConsumesTeam ? 'Counts as used' : 'Can be reused'}
                      detail={comp.postponedConsumesTeam ? 'That team is still burned' : 'The pick does not consume the team'}
                    />
                    <SummaryTile
                      label="Players"
                      value={String(comp.participantCount ?? 0)}
                      detail={comp.status === 'ACTIVE' ? `${inProgressWeek ? effectiveActiveCount : (comp.activeCount ?? 0)} still active` : comp.winnerUsername ? `Winner: ${comp.winnerUsername}` : 'Registration overview'}
                    />
                    <SummaryTile
                      label="Your Team Pool"
                      value={isParticipant ? `${consumedTeamIds.size} used${reservedTeamIds.size > 0 ? ` · ${reservedTeamIds.size} reserved` : ''}` : 'Join to track'}
                      detail={isParticipant && remainingTeamsCount !== null ? `${remainingTeamsCount} teams still available` : 'Usage updates after each pick'}
                    />
                    {comp.lifelineEnabled && (
                      <SummaryTile
                        label="Lifeline"
                        value={
                          !isParticipant
                            ? 'Enabled'
                            : participant?.lifelineUsed
                            ? `Used${participant.lifelineUsedWeek ? ` · GW${participant.lifelineUsedWeek}` : ''}`
                            : 'Available'
                        }
                        detail={
                          !isParticipant
                            ? 'One-time draw protection per entry'
                            : participant?.lifelineUsed
                            ? 'Already consumed for this entry'
                            : 'Can be used once before lock'
                        }
                        accent={!isParticipant ? 'text-cyan-300' : participant?.lifelineUsed ? 'text-amber-300' : 'text-emerald-300'}
                      />
                    )}
                    {isParticipant && (
                      <SummaryTile
                        label="Payment"
                        value={paymentState === 'PAID' ? 'Paid' : paymentState === 'AWAITING_PAYMENT' ? 'Awaiting' : 'Not needed'}
                        detail={paymentState === 'AWAITING_PAYMENT' ? 'Entry still needs payment confirmation' : paymentState === 'PAID' ? 'Entry is confirmed' : 'No payment required'}
                        accent={paymentState === 'PAID' ? 'text-green-400' : paymentState === 'AWAITING_PAYMENT' ? 'text-yellow-400' : 'text-gray-300'}
                      />
                    )}
                  </div>
                </section>
              )}
            </div>
        </aside>
      </div>

      <ConfirmDialog
        isOpen={resetOpenConfirmOpen}
        onClose={() => {
          if (!resetOpenSelectionsMutation.isPending) setResetOpenConfirmOpen(false);
        }}
        onConfirm={() => resetOpenSelectionsMutation.mutate(openSelectionCount)}
        title={`Reset ${openSelectionCount} open pick${openSelectionCount === 1 ? '' : 's'}?`}
        message="This clears only selections for gameweeks that are still open. Locked, in-progress, and completed weeks are left unchanged."
        items={[
          myEntries.length > 1 ? `Applies across all ${myEntries.length} entries in this competition.` : 'Applies to your entry in this competition.',
          'You can re-pick any cleared open weeks straight away.',
        ]}
        confirmText="Reset open picks"
        variant="danger"
        icon="↺"
        isPending={resetOpenSelectionsMutation.isPending}
        irreversible={false}
      />
    </div>
  );
}

function NarrativeCard({
  eyebrow,
  title,
  detail,
  accent,
}: {
  eyebrow: string;
  title: string;
  detail: string;
  accent: string;
}) {
  return (
    <div className="rounded-[1.35rem] border border-white/8 bg-white/[0.045] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">{eyebrow}</div>
      <div className={clsx('mt-2 text-lg font-black tracking-tight', accent)}>{title}</div>
      <p className="mt-2 text-sm leading-6 text-gray-400">{detail}</p>
    </div>
  );
}

function InsightPanel({
  eyebrow,
  title,
  detail,
  tone,
}: {
  eyebrow: string;
  title: string;
  detail: string;
  tone: 'brand' | 'danger' | 'success';
}) {
  const toneClasses = {
    brand: 'border-brand-500/20 bg-brand-500/[0.08] text-brand-200',
    danger: 'border-red-500/20 bg-red-500/[0.08] text-red-200',
    success: 'border-green-500/20 bg-green-500/[0.08] text-green-200',
  } as const;

  return (
    <div className={clsx('rounded-[1.4rem] border p-4 sm:p-5', toneClasses[tone])}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-70">{eyebrow}</div>
      <h3 className="mt-2 text-lg font-semibold tracking-tight text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-gray-300">{detail}</p>
    </div>
  );
}

function PickInsightPanel({ teamName, risk, pickStat }: { teamName: string; risk: TeamRisk; pickStat?: PickStat }) {
  return (
    <div className="mx-1 -mt-1 rounded-b-2xl border border-t-0 border-sky-300/20 bg-sky-950/30 px-4 pb-3 pt-3 shadow-inner shadow-sky-950/20 sm:mx-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-200">Why this pick?</p>
        <span className={clsx(
          'rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em]',
          risk.label === 'Safe' && 'bg-green-500/20 text-green-100',
          risk.label === 'Balanced' && 'bg-yellow-500/20 text-yellow-100',
          risk.label === 'Differential' && 'bg-cyan-500/20 text-cyan-100',
        )}>{riskLabelText(risk)}</span>
      </div>
      <h4 className="mt-2 truncate text-sm font-black text-white">{teamName}</h4>
      <p className="mt-1 text-xs leading-5 text-slate-300">{risk.explanation}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {risk.marketChance != null ? <InsightMetric value={`${risk.marketChance}%`} label="market win" /> : null}
        {pickStat ? <InsightMetric value={`${pickStat.percentage}%`} label={`${pickStat.pickCount} picked`} /> : null}
        <InsightMetric value={String(risk.score)} label="risk score" />
      </div>
    </div>
  );
}

function InsightMetric({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-full bg-white/10 px-3 py-1.5">
      <span className="text-xs font-black text-white">{value}</span>
      <span className="ml-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">{label}</span>
    </div>
  );
}


type RouteTeam = {
  teamId: number;
  teamName: string;
  teamShortName: string;
  logoUrl?: string | null;
  opponentShortName: string;
  opponentName: string;
  venueLabel: string;
  risk?: TeamRisk | null;
};

type RouteCurrentPick = {
  teamId: number;
  teamName: string;
  teamShortName: string;
  outcome: string;
  useLifeline?: boolean;
} | null;

function uniqueTeamsForFixtures(fixtures: Fixture[], gameweekStatus: string, getPickStat: (teamId: number, teamShortName: string, teamName: string) => PickStat | null | undefined): RouteTeam[] {
  const map = new Map<number, RouteTeam>();
  for (const fixture of fixtures) {
    const homeStat = getPickStat(fixture.homeTeamId, fixture.homeTeamShortName, fixture.homeTeamName);
    const awayStat = getPickStat(fixture.awayTeamId, fixture.awayTeamShortName, fixture.awayTeamName);
    map.set(fixture.homeTeamId, {
      teamId: fixture.homeTeamId,
      teamName: fixture.homeTeamName,
      teamShortName: fixture.homeTeamShortName,
      logoUrl: fixture.homeTeamLogoUrl,
      opponentShortName: fixture.awayTeamShortName,
      opponentName: fixture.awayTeamName,
      venueLabel: 'vs',
      risk: calculateTeamRisk(fixture, 'home', homeStat ?? undefined, gameweekStatus),
    });
    map.set(fixture.awayTeamId, {
      teamId: fixture.awayTeamId,
      teamName: fixture.awayTeamName,
      teamShortName: fixture.awayTeamShortName,
      logoUrl: fixture.awayTeamLogoUrl,
      opponentShortName: fixture.homeTeamShortName,
      opponentName: fixture.homeTeamName,
      venueLabel: '@',
      risk: calculateTeamRisk(fixture, 'away', awayStat ?? undefined, gameweekStatus),
    });
  }
  return [...map.values()].sort((a, b) => a.teamShortName.localeCompare(b.teamShortName));
}

function MyRoutePanel({
  teams,
  currentPick,
  currentGameweekId,
  consumedTeamIds,
  reservedTeamIds,
  pickHistory,
  showReserved,
  canPick,
  saving,
  lifelineChecked,
  onPick,
}: {
  teams: RouteTeam[];
  currentPick: RouteCurrentPick;
  currentGameweekId: number;
  consumedTeamIds: Set<number>;
  reservedTeamIds: Set<number>;
  pickHistory: PickHistoryItem[];
  showReserved: boolean;
  canPick: boolean;
  saving: boolean;
  lifelineChecked: boolean;
  onPick: (team: RouteTeam) => void;
}) {
  const currentPickFixture = currentPick ? teams.find((team) => team.teamId === currentPick.teamId) : null;
  const routeTeamById = new Map(teams.map((team) => [team.teamId, team]));
  const historyTeam = (pick: PickHistoryItem): RouteTeam => routeTeamById.get(pick.teamId) ?? {
    teamId: pick.teamId,
    teamName: pick.teamName,
    teamShortName: pick.teamShortName,
    logoUrl: null,
    opponentShortName: '—',
    opponentName: 'Not in this gameweek',
    venueLabel: '',
  };
  const usedTeams = pickHistory
    .filter((pick) => consumedTeamIds.has(pick.teamId) && pick.gameweekId !== currentGameweekId)
    .map(historyTeam)
    .filter((team, index, all) => all.findIndex((candidate) => candidate.teamId === team.teamId) === index);
  const reservedTeams = pickHistory
    .filter((pick) => reservedTeamIds.has(pick.teamId) && pick.gameweekId !== currentGameweekId)
    .map(historyTeam)
    .filter((team, index, all) => all.findIndex((candidate) => candidate.teamId === team.teamId) === index);
  const availableTeams = teams.filter((team) => {
    const picked = currentPick?.teamId === team.teamId;
    const used = consumedTeamIds.has(team.teamId) && !picked;
    const reserved = showReserved && reservedTeamIds.has(team.teamId) && !picked;
    return picked || (!used && !reserved);
  });

  return (
    <div className="route-shell">
      <div className="rounded-2xl border border-sky-300/25 bg-sky-500/10 p-4">
        <div className="text-[10px] font-black uppercase tracking-[0.14em] text-sky-200">Your route</div>
        {currentPick ? (
          <>
            <div className="mt-2 inline-flex max-w-full items-center gap-2 overflow-hidden">
              <RouteTeamLogo teamName={currentPick.teamName} shortName={currentPick.teamShortName} logoUrl={currentPickFixture?.logoUrl} size="lg" />
              <div className="truncate text-3xl font-black text-white">{currentPick.teamShortName}</div>
            </div>
            <div className="mt-1 text-sm font-bold text-slate-300">
              {currentPick.teamName}{currentPick.outcome && currentPick.outcome !== 'PENDING' ? ` · ${currentPick.outcome.replace(/_/g, ' ')}` : ''}
            </div>
            {currentPickFixture ? (
              <div className="mt-2 text-xs font-black text-sky-200">
                {currentPickFixture.venueLabel} {currentPickFixture.opponentShortName} · {currentPickFixture.opponentName}
              </div>
            ) : null}
            {currentPickFixture?.risk ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span
                  className={clsx(
                    'inline-flex max-w-full items-center gap-1 rounded-full px-2 py-1 text-[10px] font-black whitespace-nowrap overflow-hidden sm:px-1.5 sm:py-0.5 sm:text-[9px] sm:font-semibold',
                    currentPickFixture.risk.label === 'Safe' && 'bg-green-500/20 text-green-200',
                    currentPickFixture.risk.label === 'Balanced' && 'bg-yellow-500/20 text-yellow-200',
                    currentPickFixture.risk.label === 'Differential' && 'bg-cyan-500/20 text-cyan-200',
                  )}
                  title={
                    currentPickFixture.risk.source === 'fallback'
                      ? 'Risk estimate based on limited data (no live odds yet)'
                      : currentPickFixture.risk.lowConfidence
                      ? 'Risk estimate based on partial odds data'
                      : 'Risk based on current market odds and crowd data'
                  }
                >
                  <span className="truncate">{riskLabelText(currentPickFixture.risk)}</span>
                  {currentPickFixture.risk.source === 'fallback' && (
                    <span className="font-normal opacity-70 truncate">· no odds yet</span>
                  )}
                  {currentPickFixture.risk.source !== 'fallback' && currentPickFixture.risk.lowConfidence && (
                    <span className="font-normal opacity-70 truncate">· estimate</span>
                  )}
                </span>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className="mt-2 text-lg font-black text-yellow-200">No pick yet</div>
            <div className="mt-1 text-sm text-slate-300">{canPick ? 'Choose from the available teams below.' : 'No pick can be made for this gameweek.'}</div>
          </>
        )}
        {lifelineChecked ? <div className="mt-3 inline-flex rounded-full bg-cyan-500/20 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-cyan-100">Lifeline selected</div> : null}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
          <div className="text-xl font-black text-white">{availableTeams.length}</div>
          <div className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Available here</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
          <div className="text-xl font-black text-white">{usedTeams.length}</div>
          <div className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Already used</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
          <div className="text-xl font-black text-white">{reservedTeams.length}</div>
          <div className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Reserved</div>
        </div>
      </div>

      {usedTeams.length > 0 ? (
        <div className="mt-4">
          <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-300">Used before</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {usedTeams.map((team) => <span key={team.teamId} className="inline-flex items-center gap-1.5 rounded-full border border-yellow-400/30 bg-yellow-500/10 px-3 py-1.5 text-xs font-black text-yellow-200 line-through"><RouteTeamLogo teamName={team.teamName} shortName={team.teamShortName} logoUrl={team.logoUrl} size="xs" />{team.teamShortName}</span>)}
          </div>
        </div>
      ) : null}

      {reservedTeams.length > 0 ? (
        <div className="mt-4">
          <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-300">Reserved in another gameweek</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {reservedTeams.map((team) => <span key={team.teamId} className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-black text-cyan-200"><RouteTeamLogo teamName={team.teamName} shortName={team.teamShortName} logoUrl={team.logoUrl} size="xs" />{team.teamShortName}</span>)}
          </div>
        </div>
      ) : null}

      <div className="mt-4">
        <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-300">Available teams this gameweek</div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {availableTeams.map((team) => {
            const picked = currentPick?.teamId === team.teamId;
            const disabled = (!canPick || saving) && !picked;
            return (
              <button
                key={team.teamId}
                type="button"
                disabled={disabled}
                onClick={() => onPick(team)}
                className={clsx(
                  'min-w-0 overflow-hidden rounded-xl border px-3 py-2.5 text-left transition',
                  picked ? 'border-sky-200 bg-sky-600 text-white shadow-md shadow-sky-950/30' : 'route-team-tile',
                  disabled && 'cursor-not-allowed opacity-55'
                )}
              >
                <div className="flex min-w-0 items-center gap-1.5">
                  <RouteTeamLogo teamName={team.teamName} shortName={team.teamShortName} logoUrl={team.logoUrl} size="lg" />
                  <div className="truncate text-base font-black leading-tight">{team.teamShortName}</div>
                </div>
                <div className={clsx('mt-1 truncate text-[10px] font-bold', picked ? 'text-white/85' : 'text-slate-400')}>{picked ? 'Picked' : `${team.venueLabel} ${team.opponentShortName}`}</div>
                {team.risk ? (
                  <div className="mt-1">
                    <span
                      className={clsx(
                        'inline-flex max-w-full items-center gap-1 rounded-full px-2 py-1 text-[10px] font-black whitespace-nowrap overflow-hidden',
                        team.risk.label === 'Safe' && (picked ? 'bg-white/18 text-white' : 'bg-green-500/20 text-green-200'),
                        team.risk.label === 'Balanced' && (picked ? 'bg-white/18 text-white' : 'bg-yellow-500/20 text-yellow-200'),
                        team.risk.label === 'Differential' && (picked ? 'bg-white/18 text-white' : 'bg-cyan-500/20 text-cyan-200'),
                      )}
                    >
                      <span className="truncate">{riskLabelText(team.risk)}</span>
                    </span>
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function RouteTeamLogo({
  teamName,
  shortName,
  logoUrl,
  size = 'sm',
}: {
  teamName: string;
  shortName: string;
  logoUrl?: string | null;
  size?: 'xs' | 'sm' | 'lg';
}) {
  const [logoFailed, setLogoFailed] = useState(false);
  const trimmedLogoUrl = typeof logoUrl === 'string' ? logoUrl.trim() : '';
  const showLogo = !!trimmedLogoUrl && !logoFailed;
  const fallback = shortName.slice(0, 1).toUpperCase();
  const sizeClass = size === 'lg' ? 'h-7 w-7 text-[10px]' : size === 'xs' ? 'h-3.5 w-3.5 text-[7px]' : 'h-4 w-4 text-[8px]';

  if (showLogo) {
    return (
      <img
        src={trimmedLogoUrl}
        alt={`${teamName} crest`}
        className={clsx('shrink-0 rounded-full border border-white/20 object-cover', sizeClass)}
        loading="lazy"
        onError={() => setLogoFailed(true)}
      />
    );
  }

  return (
    <span
      className={clsx('inline-flex shrink-0 items-center justify-center rounded-full border border-white/20 bg-slate-700 font-black text-slate-300', sizeClass)}
      aria-hidden="true"
    >
      {fallback}
    </span>
  );
}

function TeamButton({
  name, logoUrl, shortName, isMyPick, isUsed, isReserved, isClickable, align, pickStat, risk, accentColor, accentSecondaryColor, onClick,
}: {
  name: string;
  logoUrl?: string | null;
  shortName: string;
  isMyPick: boolean;
  isUsed: boolean;
  isReserved?: boolean;
  isClickable: boolean; align: 'left' | 'right'; pickStat?: PickStat; risk?: TeamRisk | null; accentColor?: string | null; accentSecondaryColor?: string | null; onClick: () => void;
}) {
  const showStatusPill = isMyPick || (isUsed && !isMyPick) || (!!isReserved && !isMyPick && !isUsed);
  const statusPillLabel = isMyPick ? 'Picked' : isUsed ? 'Used' : isReserved ? 'Resvd' : '';
  const [logoFailed, setLogoFailed] = useState(false);
  const trimmedLogoUrl = typeof logoUrl === 'string' ? logoUrl.trim() : '';
  const showLogo = !!trimmedLogoUrl && !logoFailed;
  const logoAlt = `${name} crest`;
  const logoFallback = shortName.slice(0, 1).toUpperCase();
  const teamAccentColor = accentColor ?? null;
  const teamAccentColor2 = accentSecondaryColor ?? accentColor ?? null;

  return (
    <button
      onClick={onClick}
      disabled={!isClickable && !isMyPick}
      title={
        isUsed ? `${name} — already used this competition` :
        isReserved ? `${name} — reserved by a future pick` :
        isMyPick ? `${name} — your pick${isClickable ? ' (click to change)' : ''}` :
        name
      }

      className={clsx(
        'relative flex h-full flex-col justify-center gap-0.5 rounded-xl px-2 py-2.5 sm:rounded-lg sm:px-3 lg:px-4 sm:py-0.5 w-full min-w-0 overflow-hidden transition-all min-h-[74px] sm:min-h-[30px] lg:min-h-[32px]',
        align === 'right' ? 'items-center sm:items-end sm:text-right' : 'items-center sm:items-start sm:text-left',
        isMyPick && 'bg-brand-600/85 border border-brand-300 text-white font-bold shadow-md shadow-brand-900/25',
        isUsed && !isMyPick && 'bg-transparent text-amber-300 cursor-not-allowed',
        isReserved && !isUsed && !isMyPick && 'bg-transparent text-cyan-300',
        isClickable && !isMyPick && 'bg-transparent sm:bg-surface-600/50 sm:border sm:border-white/10 hover:bg-white/[0.04] text-gray-200 cursor-pointer font-medium',
        !isClickable && !isUsed && !isMyPick && 'bg-transparent text-gray-400 cursor-default font-medium',
      )}
      aria-pressed={isMyPick}
      aria-label={`Pick ${name}`}
    >
      {teamAccentColor && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{
            backgroundImage: `linear-gradient(90deg, ${teamAccentColor}, ${teamAccentColor2})`,
          }}
        />
      )}
      {/* Mobile: app-style centered team column */}
      <div className="flex sm:hidden w-full min-w-0 flex-col items-center justify-center text-center">
        <div className={clsx('flex max-w-full min-w-0 items-center justify-center gap-1.5', align === 'right' ? 'flex-row-reverse' : 'flex-row')}>
          {showLogo ? (
            <img
              src={trimmedLogoUrl}
              alt={logoAlt}
              className="h-5 w-5 shrink-0 rounded-full border border-white/25 object-cover"
              loading="lazy"
              onError={() => setLogoFailed(true)}
            />
          ) : (
            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/20 bg-slate-700 text-[9px] font-black text-slate-300">
              {logoFallback}
            </span>
          )}
            <span className={clsx('shrink-0 font-black text-base leading-tight', isMyPick ? 'text-white' : isUsed ? 'line-through text-amber-200' : '')}>
            {shortName}
          </span>
        </div>
        <div className="mt-0.5 min-h-[16px] flex items-center justify-center">
          {showStatusPill ? (
            <span
              className={clsx(
                'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.08em]',
                isMyPick ? 'bg-white/18 text-white' : 'bg-amber-500/20 text-amber-200',
                isReserved && !isUsed && !isMyPick && 'bg-cyan-500/20 text-cyan-200',
              )}
            >
              {statusPillLabel}
            </span>
          ) : (
            // Reserve the same vertical space even when there's no status pill.
            <span className="invisible inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.08em]">Label</span>
          )}
        </div>
        <span className={clsx('max-w-[7.5rem] truncate text-xs leading-tight text-gray-400', isMyPick && 'text-white/70', isUsed && !isMyPick && 'text-amber-200/75 line-through')}>
          {name}
        </span>
      </div>
      {/* Desktop */}
      {pickStat ? (
        align === 'right' ? (
          <div className="hidden sm:flex w-full items-center gap-2 text-right">
            <span className={clsx('w-[3.9rem] shrink-0 text-xs font-bold text-left', isMyPick ? 'text-white' : isUsed ? 'text-amber-200' : isReserved ? 'text-cyan-200' : 'text-gray-400')}>
              {showStatusPill ? statusPillLabel : ''}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs lg:text-sm font-normal opacity-90 text-right">
              {name}
            </span>
            <span className="shrink-0 flex items-center gap-1.5">
              <span className={clsx('w-[3ch] shrink-0 font-bold sm:text-sm', isMyPick ? 'text-white' : '')}>{shortName}</span>
              {showLogo ? (
                <img
                  src={trimmedLogoUrl}
                  alt={logoAlt}
                  className="h-4 w-4 rounded-full border border-white/20 object-cover"
                  loading="lazy"
                  onError={() => setLogoFailed(true)}
                />
              ) : (
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/20 bg-slate-700 text-[8px] font-black text-slate-300">
                  {logoFallback}
                </span>
              )}
            </span>
          </div>
        ) : (
          <div className="hidden sm:flex w-full items-center gap-2 text-left">
            <span className="shrink-0 flex items-center gap-1.5">
              {showLogo ? (
                <img
                  src={trimmedLogoUrl}
                  alt={logoAlt}
                  className="h-4 w-4 rounded-full border border-white/20 object-cover"
                  loading="lazy"
                  onError={() => setLogoFailed(true)}
                />
              ) : (
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/20 bg-slate-700 text-[8px] font-black text-slate-300">
                  {logoFallback}
                </span>
              )}
              <span className={clsx('text-left font-bold sm:text-sm', isMyPick ? 'text-white' : '')}>{shortName}</span>
            </span>
            <span className="shrink-0 text-[10px] text-gray-500">·</span>
            <span className="min-w-0 flex-1 truncate text-xs lg:text-sm font-normal opacity-90">
              {name}
            </span>
            <span className={clsx('w-[3.9rem] shrink-0 text-xs font-bold text-right', isMyPick ? 'text-white' : isUsed ? 'text-amber-200' : isReserved ? 'text-cyan-200' : 'text-gray-400')}>
              {showStatusPill ? statusPillLabel : ''}
            </span>
          </div>
        )
      ) : align === 'right' ? (
        <div className="hidden sm:grid h-full w-full place-items-center">
          <div className="grid w-full max-w-[18rem] grid-cols-[3.5ch_minmax(0,1fr)_auto] items-center gap-2">
            <span className="text-left text-xs font-bold text-gray-400">
              {showStatusPill ? statusPillLabel : ''}
            </span>
            <span className="truncate text-center text-xs lg:text-sm font-normal opacity-90">
              {name}
            </span>
            <span className="shrink-0 flex items-center gap-1.5">
              <span className={clsx('text-right font-bold sm:text-sm', isMyPick ? 'text-white' : '')}>{shortName}</span>
              {showLogo ? (
                <img
                  src={trimmedLogoUrl}
                  alt={logoAlt}
                  className="h-4 w-4 rounded-full border border-white/20 object-cover"
                  loading="lazy"
                  onError={() => setLogoFailed(true)}
                />
              ) : (
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/20 bg-slate-700 text-[8px] font-black text-slate-300">
                  {logoFallback}
                </span>
              )}
            </span>
          </div>
        </div>
      ) : (
        <div className="hidden sm:grid h-full w-full place-items-center">
          <div className="grid w-full max-w-[18rem] grid-cols-[auto_minmax(0,1fr)_3.5ch] items-center gap-2">
            <span className="shrink-0 flex items-center gap-1.5">
              {showLogo ? (
                <img
                  src={trimmedLogoUrl}
                  alt={logoAlt}
                  className="h-4 w-4 rounded-full border border-white/20 object-cover"
                  loading="lazy"
                  onError={() => setLogoFailed(true)}
                />
              ) : (
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/20 bg-slate-700 text-[8px] font-black text-slate-300">
                  {logoFallback}
                </span>
              )}
              <span className={clsx('text-left font-bold sm:text-sm', isMyPick ? 'text-white' : '')}>{shortName}</span>
            </span>
            <span className="truncate text-center text-xs lg:text-sm font-normal opacity-90">
              {name}
            </span>
            <span className="text-right text-xs font-bold text-gray-400">
              {showStatusPill ? statusPillLabel : ''}
            </span>
          </div>
        </div>
      )}
      {/* Pick stat bar — shown after gameweek locks */}
      {pickStat || risk ? (
        <div className="w-full mt-2 min-h-[24px] sm:mt-1.5 sm:min-h-[20px]">
          <div className={clsx('flex w-full gap-1.5 flex-wrap justify-center', align === 'right' ? 'sm:justify-end' : 'sm:justify-start')}>
            {risk && (
              <div
                className={clsx(
                  'inline-flex max-w-full items-center gap-1 rounded-full px-2 py-1 text-[10px] font-black whitespace-nowrap overflow-hidden sm:px-1.5 sm:py-0.5 sm:text-[9px] sm:font-semibold',
                  risk.label === 'Safe' && 'bg-green-500/20 text-green-200',
                  risk.label === 'Balanced' && 'bg-yellow-500/20 text-yellow-200',
                  risk.label === 'Differential' && 'bg-cyan-500/20 text-cyan-200',
                )}
                title={
                  risk.source === 'fallback'
                    ? 'Risk estimate based on limited data (no live odds yet)'
                    : risk.lowConfidence
                    ? 'Risk estimate based on partial odds data'
                    : 'Risk based on current market odds and crowd data'
                }
              >
                <span className="truncate">{riskLabelText(risk)}</span>
                {risk.source === 'fallback' && (
                  <span className="font-normal opacity-70 truncate">· no odds yet</span>
                )}
                {risk.source !== 'fallback' && risk.lowConfidence && (
                  <span className="font-normal opacity-70 truncate">· estimate</span>
                )}
              </div>
            )}
            {pickStat && (
              <div
                className={clsx(
                  'inline-flex w-full max-w-[8rem] items-center justify-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black whitespace-nowrap sm:w-auto sm:max-w-full sm:justify-start sm:px-1.5 sm:py-0.5',
                  isMyPick ? 'bg-white/18 text-white' : 'bg-white/10 text-gray-200',
                )}
                style={accentColor && !isMyPick ? { border: `1px solid ${accentColor}44`, color: '#cbd5e1' } : undefined}
              >
                <span>{pickStat.percentage}%</span>
                <span className={clsx('font-semibold whitespace-nowrap', isMyPick ? 'text-white/75' : 'text-gray-300')}>
                  · {pickStat.pickCount} {pickStat.pickCount === 1 ? 'player' : 'players'}
                </span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="w-full mt-1.5 min-h-[20px]" />
      )}
    </button>
  );
}


function CompetitionPulseSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="flex items-center gap-2">
        <div className="h-6 w-6 rounded-md bg-white/10" />
        <div className="h-3 w-40 rounded bg-white/10" />
        <div className="h-3 w-20 rounded bg-white/10" />
      </div>
      <div className="mt-4 h-8 w-4/5 rounded bg-white/10" />
      <div className="mt-3 h-4 w-full rounded bg-white/10" />
      <div className="mt-2 h-4 w-3/4 rounded bg-white/10" />
      <div className="mt-4 flex flex-wrap gap-2">
        <div className="h-8 w-28 rounded-full bg-white/10" />
        <div className="h-8 w-32 rounded-full bg-white/10" />
        <div className="h-8 w-40 rounded-full bg-white/10" />
      </div>
    </div>
  );
}

function CompetitionSpotlightSkeleton() {
  return <>{[0, 1, 2].map((item) => (
    <div key={item} className="animate-pulse rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <div className="h-3 w-28 rounded bg-white/10" />
      <div className="mt-3 h-5 w-2/3 rounded bg-white/10" />
      <div className="mt-3 h-4 w-full rounded bg-white/10" />
      <div className="mt-2 h-4 w-4/5 rounded bg-white/10" />
    </div>
  ))}</>;
}

function CompetitionSnapshotSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-3 w-44 rounded bg-white/10" />
      <div className="mt-2 h-5 w-56 rounded bg-white/10" />
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="rounded-xl border border-white/10 bg-black/15 px-3 py-3">
            <div className="h-3 w-24 rounded bg-white/10" />
            <div className="mt-2 h-5 w-16 rounded bg-white/10" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ...existing code...
function ActionPanel({
  tone,
  title,
  statusLabel,
  body,
  meta,
  cta,
  accentColor,
  resolvedTheme,
}: {
  tone: 'brand' | 'warning' | 'danger' | 'success';
  title: string;
  statusLabel: string;
  body: string;
  meta?: string | null;
  cta?: ReactNode;
  accentColor?: string | null;
  resolvedTheme: 'light' | 'dark';
}) {
  const toneClasses = {
    brand: 'border-brand-500/30 bg-brand-500/10 text-brand-300',
    warning: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300',
    danger: 'border-red-500/30 bg-red-500/10 text-red-300',
    success: 'border-green-500/30 bg-green-500/10 text-green-300',
  } as const;

  const panelStyle = accentColor ? {
    ...(tone === 'brand' ? {
      borderColor: resolvedTheme === 'light' ? `${accentColor}55` : `${accentColor}40`,
      backgroundImage: resolvedTheme === 'light'
        ? `radial-gradient(circle at top right, ${accentColor}2e, transparent 13rem), radial-gradient(circle at bottom left, ${accentColor}12, transparent 10rem)`
        : `radial-gradient(circle at top right, ${accentColor}18, transparent 13rem)`,
      boxShadow: resolvedTheme === 'light'
        ? `0 0 0 1px ${accentColor}24, 0 8px 18px ${accentColor}0d`
        : undefined,
    } : {}),
  } : undefined;

  return (
    <section className="card relative overflow-hidden p-4 sm:p-5" data-club-branded={accentColor ? '' : undefined} style={panelStyle}>
      {accentColor && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px"
          style={{
            backgroundImage: `linear-gradient(90deg, ${accentColor}, ${accentColor}c0)`,
          }}
        />
      )}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">Next Action</div>
          <h2 className="mt-2 text-lg font-semibold tracking-tight text-white">{title}</h2>
          <p className="mt-1 text-sm font-medium text-gray-400">{statusLabel}</p>
        </div>
        <div
          className={`inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${toneClasses[tone]}`}
          style={tone === 'brand' && accentColor ? {
            borderColor: resolvedTheme === 'light' ? `${accentColor}bb` : `${accentColor}55`,
            backgroundColor: resolvedTheme === 'light' ? `${accentColor}42` : `${accentColor}22`,
            color: accentColor,
          } : undefined}
        >
          {tone === 'danger' ? 'Urgent' : tone === 'warning' ? 'Attention' : tone === 'success' ? 'Ready' : 'Live'}
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-gray-300">{body}</p>
      {meta && (
        <p
          className="mt-3 rounded-xl border border-white/8 bg-black/10 px-3 py-2 text-xs text-gray-400"
          style={tone === 'brand' && accentColor ? {
            borderColor: resolvedTheme === 'light' ? `${accentColor}88` : `${accentColor}2f`,
            backgroundColor: resolvedTheme === 'light' ? `${accentColor}14` : undefined,
          } : undefined}
        >
          {meta}
        </p>
      )}
      {cta && <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">{cta}</div>}
    </section>
  );
}
// ...existing code...

function SummaryTile({
  label,
  value,
  detail,
  accent = 'text-gray-100',
}: {
  label: string;
  value: string;
  detail: string;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.04] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">{label}</div>
      <div className={`mt-1 text-sm font-semibold ${accent}`}>{value}</div>
      <div className="mt-1 text-xs leading-5 text-gray-400">{detail}</div>
    </div>
  );
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  switch (outcome) {
    case 'ADVANCE': return <span className="badge-green">✓ Advanced</span>;
    case 'ELIMINATED': return <span className="badge-red">✗ Eliminated</span>;
    case 'OUT': return <span className="badge-red">○ Out</span>;
    case 'POSTPONED_ADVANCE': return <span className="badge-yellow">↷ Postponed</span>;
    case 'PENDING': return <span className="badge-gray">⏳ Pending</span>;
    default: return <span className="badge-gray">{outcome}</span>;
  }
}

function CountdownUnit({ value, label, urgent = false }: { value: number; label: string; urgent?: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <span className={clsx('tabular-nums leading-none', urgent ? 'text-red-400' : 'text-white')}>
        {String(value).padStart(2, '0')}
      </span>
      <span className="text-[9px] text-gray-500 uppercase tracking-widest mt-0.5">{label}</span>
    </div>
  );
}
