import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import api from '../api';
import type { Competition, GameweekSelectionsData, MyStatus, Fixture } from '../types';
import toast from 'react-hot-toast';
import { formatDistanceToNow, isPast } from 'date-fns';
import clsx from 'clsx';
import { useCountdown } from '../hooks/useCountdown';
import { useAuth } from '../context/AuthContext';
import { usePushNotifications } from '../hooks/usePushNotifications';

interface PickStat {
  teamId: number;
  teamName: string;
  teamShortName: string;
  pickCount: number;
  totalPicks: number;
  percentage: number;
}

function parseDate(value: string | number[]): Date {
  if (Array.isArray(value)) {
    const [y, mo, d, h = 0, mi = 0, s = 0] = value as number[];
    return new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  }
  const str = (value.endsWith('Z') || value.includes('+')) ? value : value + 'Z';
  return new Date(str);
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

/** Fetches pick stats for a list of locked gameweek IDs, returning a Map<gwId, stats[]> */
function usePickStatsMap(compId: number, gwIds: number[]): Map<number, PickStat[]> {
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
    return map;
  }, [results, gwIds]);
}

export default function CompetitionHomePage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const compId = Number(id);
  const { user } = useAuth();
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

  useEffect(() => {
    const stored = window.localStorage.getItem('lms.sidebarCollapsed');
    if (stored !== null) {
      setSidebarCollapsed(stored === 'true');
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem('lms.sidebarCollapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  const { data: comp, isLoading: compLoading } = useQuery<Competition>({
    queryKey: ['competition', compId],
    queryFn: () => api.get(`/competitions/${compId}`).then((r) => r.data),
    staleTime: 30_000,
    refetchInterval: () => hasPendingResultProcessing(queryClient.getQueryData<Fixture[]>(['fixtures', compId])) ? 3_000 : false,
  });

  const { data: myStatus, isLoading: statusLoading } = useQuery<MyStatus>({
    queryKey: ['myStatus', compId],
    queryFn: () => api.get(`/competitions/${compId}/me`).then((r) => r.data),
    retry: false,
    staleTime: 30_000,
    refetchInterval: () => hasPendingResultProcessing(queryClient.getQueryData<Fixture[]>(['fixtures', compId])) ? 3_000 : false,
  });

  const { data: fixtures, isLoading: fixturesLoading } = useQuery<Fixture[]>({
    queryKey: ['fixtures', compId],
    queryFn: () => api.get(`/competitions/${compId}/fixtures?weeks=99`).then((r) => r.data),
    staleTime: 30_000,
    // Keep polling for newly created upcoming competitions until fixtures appear,
    // then fall back to low-frequency polling only while a gameweek is live.
    refetchInterval: (query) => {
      const data = query.state.data as Fixture[] | undefined;
      if (comp?.status === 'UPCOMING' && (!data || data.length === 0)) {
        return 3_000;
      }
      const live = data?.some((f) => f.status === 'IN_PLAY');
      if (live) {
        return 60_000;
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
    staleTime: 30_000,
  });

  const { data: latestNarrativeSelections } = useQuery<GameweekSelectionsData>({
    queryKey: ['gameweekSelections', compId, latestNarrativeGwId],
    queryFn: () => api.get(`/competitions/${compId}/gameweeks/${latestNarrativeGwId}/selections`).then((r) => r.data),
    enabled: !!latestNarrativeGwId,
    staleTime: 30_000,
    refetchInterval: (query) => {
      const data = query.state.data as GameweekSelectionsData | undefined;
      const hasPending = data?.selections?.some((s) => s.outcome === 'PENDING');
      return hasPending ? 60_000 : false;
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

  const pickStatsByGwId = usePickStatsMap(compId, lockedGwIds);
  const resultsProcessing = hasPendingResultProcessing(fixtures);

  const pickMutation = useMutation({
    mutationFn: ({ gwId, teamId }: { gwId: number; teamId: number }) =>
      api.post(`/competitions/${compId}/gameweeks/${gwId}/pick`, { teamId }),
    onMutate: async ({ gwId, teamId }) => {
      // Cancel any in-flight refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: ['myStatus', compId] });

      // Snapshot the previous value for rollback
      const previous = queryClient.getQueryData<MyStatus>(['myStatus', compId]);

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
          outcome: 'PENDING' as const,
          pickedAt: new Date().toISOString(),
          resolvedAt: null,
        };
        const updatedPicks =
          existingPickIndex >= 0
            ? previous.picks.map((p, i) => (i === existingPickIndex ? newPick : p))
            : [...previous.picks, newPick];

        queryClient.setQueryData<MyStatus>(['myStatus', compId], {
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
    onSuccess: () => {
      toast.success('Pick saved!');
      // Refresh in background to get the real server state
      queryClient.invalidateQueries({ queryKey: ['myStatus', compId] });
    },
    onError: (err: any, _vars, context) => {
      // Roll back to previous state on error
      if (context?.previous) {
        queryClient.setQueryData(['myStatus', compId], context.previous);
      }
      toast.error(err.response?.data?.message || 'Failed to save pick');
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
    if (!fixtures || fixtures.length === 0) return null;
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
  }, [fixtures]);

  // Hook must be called unconditionally — before any early returns
  const countdown = useCountdown(nextLockDateForHook);

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
  const isParticipant = !!participant;
  const isEliminated = participant?.status === 'ELIMINATED';
  const isWinner = participant?.status === 'WINNER';
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

  // Build a map of gameweekId -> pick for this user
  const pickByGwId = new Map<number, { teamId: number; teamName: string; teamShortName: string; locked: boolean; outcome: string }>();
  myStatus?.picks.forEach((p) => {
    pickByGwId.set(p.gameweekId, {
      teamId: p.teamId,
      teamName: p.teamName,
      teamShortName: p.teamShortName,
      locked: p.locked,
      outcome: p.outcome,
    });
  });

  // All teams used across the whole competition (cannot pick again)
  const usedTeamIds = new Set(myStatus?.usedTeamIds ?? []);

  // Group fixtures by gameweek — store real lockAt and status from backend
  const fixturesByWeek = new Map<number, { gwId: number; lockAt: string; gwStatus: string; fixtures: Fixture[] }>();
  fixtures?.forEach((f) => {
    if (!fixturesByWeek.has(f.weekNumber)) {
      fixturesByWeek.set(f.weekNumber, {
        gwId: f.gameweekId,
        lockAt: f.gameweekLockAt,
        gwStatus: f.gameweekStatus,
        fixtures: [],
      });
    }
    fixturesByWeek.get(f.weekNumber)!.fixtures.push(f);
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
  const uniqueTeamIds = new Set<number>();
  fixtures?.forEach((f) => {
    uniqueTeamIds.add(f.homeTeamId);
    uniqueTeamIds.add(f.awayTeamId);
  });
  const totalTeamsCount = uniqueTeamIds.size;
  const remainingTeamsCount = totalTeamsCount > 0 ? Math.max(totalTeamsCount - usedTeamIds.size, 0) : null;

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

  const latestNarrativeStats = latestNarrativeWeek
    ? [...(pickStatsByGwId.get(latestNarrativeWeek.data.gwId) ?? [])].sort((a, b) => b.pickCount - a.pickCount)
    : [];

  const liveInsightWeek = inProgressWeek
    ?? [...sortedWeeks]
        .reverse()
        .map((weekNumber) => ({ weekNumber, data: fixturesByWeek.get(weekNumber)! }))
        .find(({ data }) => data.gwStatus === 'LOCKED');

  const liveInsightStats = liveInsightWeek
    ? [...(pickStatsByGwId.get(liveInsightWeek.data.gwId) ?? [])].sort((a, b) => b.pickCount - a.pickCount)
    : [];

  const narrativeTeamResults = new Map<number, 'WIN' | 'LOSS' | 'DRAW' | 'POSTPONED'>();
  if (latestNarrativeWeek) {
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
  const biggestCasualty = latestNarrativeStats.find((stat) => narrativeTeamResults.get(stat.teamId) === 'LOSS');
  const contrarianSurvivor = [...latestNarrativeStats]
    .reverse()
    .find((stat) => {
      const result = narrativeTeamResults.get(stat.teamId);
      return stat.pickCount > 0 && (result === 'WIN' || result === 'DRAW' || result === 'POSTPONED');
    });
  const survivingPickedTeams = latestNarrativeStats.filter((stat) => {
    const result = narrativeTeamResults.get(stat.teamId);
    return result === 'WIN' || result === 'DRAW' || result === 'POSTPONED';
  });
  const doomedPickedTeams = latestNarrativeStats.filter((stat) => narrativeTeamResults.get(stat.teamId) === 'LOSS');
  const totalResolvedPicks = latestNarrativeStats.reduce((sum, stat) => sum + stat.pickCount, 0);
  const survivingResolvedPicks = survivingPickedTeams.reduce((sum, stat) => sum + stat.pickCount, 0);
  const computedWeeklySurvivalRate = totalResolvedPicks > 0
    ? Math.round((survivingResolvedPicks / totalResolvedPicks) * 100)
    : null;
  const latestSelections = latestNarrativeSelections?.selections ?? latestCompletedSelections?.selections ?? [];
  const resolvedSelections = latestSelections.filter((sel) => sel.outcome !== 'PENDING');
  const gwPickedCount = resolvedSelections.length;
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
  const weeklySurvivalRate = narrativeWeekInProgress
    ? (gwSurvivalFromSelections ?? computedWeeklySurvivalRate)
    : (gwSurvivalFromBackend ?? gwSurvivalFromSelections ?? computedWeeklySurvivalRate);
  const weeklyPickedCount = narrativeWeekInProgress
    ? (gwPickedCount || totalResolvedPicks || 0)
    : (gwActiveAtStart ?? (gwPickedCount || totalResolvedPicks || 0));
  const weeklyAdvancedCount = narrativeWeekInProgress
    ? (gwAdvancedCount || survivingResolvedPicks || 0)
    : (gwAdvancedThisWeek ?? (gwAdvancedCount || survivingResolvedPicks || 0));
  const weeklyEliminatedCount = narrativeWeekInProgress
    ? (gwEliminatedFromSelections || (weeklyPickedCount > 0 ? Math.max(weeklyPickedCount - weeklyAdvancedCount, 0) : 0))
    : (gwEliminatedThisWeek ?? (weeklyPickedCount > 0 ? Math.max(weeklyPickedCount - weeklyAdvancedCount, 0) : 0));
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

  const hasWinner = comp.status === 'COMPLETED'
    || (comp.activeCount === 1 && (comp.participantCount ?? 0) > 1);

  let storylineTitle = 'Competition pressure is building';
  let storylineBody = comp.status === 'UPCOMING'
    ? 'Registration is open and the first real pressure point is the next lock.'
    : 'The next pick window is where this competition starts to separate cautious players from survivors.';

  if (hasWinner) {
    const winnerLabel = isWinner ? 'You won this competition' : 'We have a winner';
    storylineTitle = winnerLabel;
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
        ]
      : [
          narrativeWeekInProgress ? `Gameweek ${wn} has an early casualty` : `Gameweek ${wn} had a casualty`,
          narrativeWeekInProgress ? `Gameweek ${wn} is claiming victims` : `Gameweek ${wn} claimed a victim`,
          narrativeWeekInProgress ? `Gameweek ${wn} is stinging a few` : `Gameweek ${wn} stung a few`,
          narrativeWeekInProgress ? `Gameweek ${wn} is taking its toll` : `Gameweek ${wn} took its toll`,
        ];
    storylineTitle = titleOptions[wn % titleOptions.length];
    storylineBody = `${biggestCasualty.pickCount} player${biggestCasualty.pickCount === 1 ? '' : 's'} trusted ${biggestCasualty.teamShortName} and paid for it. ${effectiveActiveCount} survivor${effectiveActiveCount === 1 ? '' : 's'} remain.`;
  } else if (latestNarrativeWeek && weeklySurvivalRate != null && weeklySurvivalRate < 50) {
    storylineTitle = narrativeWeekInProgress && narrativeWeekLabel ? `${narrativeWeekLabel} is chaos` : `${narrativeWeekLabel} was chaos`;
    storylineBody = `${weeklyEliminatedCount} players went out in the latest week. Only ${weeklySurvivalRate}% survived the round.`;
  } else if (latestNarrativeWeek && weeklySurvivalRate != null && weeklySurvivalRate >= 50 && weeklySurvivalRate <= 70) {
    storylineTitle = narrativeWeekInProgress && narrativeWeekLabel ? `${narrativeWeekLabel} is tightening the race` : `${narrativeWeekLabel} tightened the race`;
    storylineBody = `Survival dipped to ${weeklySurvivalRate}%. The middle of the pack is starting to thin out.`;
  } else if (latestNarrativeWeek && weeklySurvivalRate != null && weeklySurvivalRate >= 85) {
    storylineTitle = narrativeWeekInProgress && narrativeWeekLabel ? `${narrativeWeekLabel} is steady so far` : `${narrativeWeekLabel} was steady`;
    storylineBody = `${weeklySurvivalRate}% made it through. The real shakeups are still ahead.`;
  } else if (latestNarrativeWeek && doomedPickedTeams.length === 0 && survivingPickedTeams.length > 0) {
    storylineTitle = narrativeWeekInProgress && narrativeWeekLabel ? `${narrativeWeekLabel} is sparing the field` : `${narrativeWeekLabel} spared the field`;
    storylineBody = `No picked teams lost in the latest week. The standings stayed tight with ${effectiveActiveCount} still alive.`;
  } else if (latestNarrativeWeek && contrarianSurvivor) {
    storylineTitle = narrativeWeekInProgress && narrativeWeekLabel ? `${narrativeWeekLabel} is rewarding nerve` : `${narrativeWeekLabel} rewarded nerve`;
    storylineBody = `${contrarianSurvivor.pickCount} player${contrarianSurvivor.pickCount === 1 ? '' : 's'} backed ${contrarianSurvivor.teamShortName} and came through when the crowd did not.`;
  } else if (latestNarrativeWeek && mostBackedTeam) {
    storylineTitle = narrativeWeekInProgress && narrativeWeekLabel ? `${narrativeWeekLabel} is following the crowd` : `${narrativeWeekLabel} followed the crowd`;
    storylineBody = `${mostBackedTeam.pickCount} players backed ${mostBackedTeam.teamShortName}. The table is still tightening with ${effectiveActiveCount} left standing.`;
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
        ? `${usedTeamIds.size} team${usedTeamIds.size === 1 ? '' : 's'} already burned from your pool.`
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
    if (!isParticipant || isEliminated || isWinner) return;
    if (awaitingPayment && strictManualPayment) {
      toast.error('Your entry is awaiting payment confirmation. Picks are disabled until marked as paid.');
      return;
    }
    if (isPast(parseDate(lockAt))) return;
    pickMutation.mutate({ gwId, teamId });
  };

  let actionTone: 'brand' | 'warning' | 'danger' | 'success' = 'brand';
  let actionTitle = 'Competition overview';
  let actionBody = 'Review the rules, then expand the next gameweek when you are ready.';
  let actionMeta: string | null = null;

  if (!isParticipant) {
    if (comp.status === 'UPCOMING') {
      actionTone = 'warning';
      actionTitle = comp.paymentMode === 'MANUAL' ? 'Register and pay the organiser' : comp.entryFee > 0 ? 'Join before the next lock' : 'Join this competition';
      actionBody = comp.paymentMode === 'MANUAL'
        ? `Registration is open. Entry is €${comp.entryFee} and the organiser confirms payment manually.`
        : comp.entryFee > 0
        ? `Entry is €${comp.entryFee}. Join before the next gameweek locks so you can make your first pick.`
        : 'Registration is still open. Join now so you can make your first pick before the next lock.';
      actionMeta = upcomingWeek
        ? `Next lock: Gameweek ${upcomingWeek.weekNumber} ${formatDistanceToNow(parseDate(upcomingWeek.data.lockAt), { addSuffix: true })}`
        : null;
    } else {
      actionTone = 'warning';
      actionTitle = 'Viewing only';
      actionBody = 'This competition has already started. You can follow fixtures, selections, and results, but new entries are closed.';
    }
  } else if (awaitingPayment) {
    actionTone = 'warning';
    actionTitle = 'Awaiting payment confirmation';
    actionBody = comp.paymentMode === 'MANUAL'
      ? 'You are registered, but your entry is still waiting for the organiser to confirm payment before everything is fully settled.'
      : 'Your entry is not fully settled yet. Please check your payment status.';
    actionMeta = comp.paymentMode === 'MANUAL'
      ? 'If you have already paid, the organiser still needs to mark you as paid.'
      : null;
  } else if (isWinner) {
    actionTone = 'success';
    actionTitle = 'You won this competition';
    actionBody = 'You can still review every gameweek, inspect the survivor table, and share the result with other players.';
    actionMeta = latestResolvedPick ? `Winning path included ${latestResolvedPick.teamShortName} in GW${latestResolvedPick.weekNumber}.` : null;
  } else if (isEliminated) {
    actionTone = 'danger';
    actionTitle = `Eliminated in Gameweek ${participant?.eliminatedWeek}`;
    actionBody = 'You can no longer make picks, but fixtures, selections, and results stay available so you can follow the rest of the competition.';
    actionMeta = latestResolvedPick ? `Latest resolved pick: ${latestResolvedPick.teamShortName} in GW${latestResolvedPick.weekNumber}.` : null;
  } else if (inProgressWeek) {
    const livePick = pickByGwId.get(inProgressWeek.data.gwId);
    actionTone = 'brand';
    actionTitle = `Gameweek ${inProgressWeek.weekNumber} is underway`;
    actionBody = livePick
      ? `${livePick.teamShortName} is locked in for the live round. Follow the current fixtures before the next pick window opens.`
      : 'This gameweek is already in progress, so there is no next pick to make right now.';
    actionMeta = 'The next pick window will open after the current round is completed.';
  } else if (openWeekWithoutPick) {
    actionTone = countdown.totalSeconds < 7200 ? 'warning' : 'brand';
    actionTitle = `Pick needed for Gameweek ${openWeekWithoutPick.weekNumber}`;
    actionBody = 'You have not selected a team for the next open gameweek yet. Expand that gameweek below and choose before it locks.';
    actionMeta = `Locks ${formatDistanceToNow(parseDate(openWeekWithoutPick.data.lockAt), { addSuffix: true })}`;
  } else if (openWeekWithPick) {
    const openPick = pickByGwId.get(openWeekWithPick.data.gwId);
    actionTone = 'success';
    actionTitle = `Your pick is in for Gameweek ${openWeekWithPick.weekNumber}`;
    actionBody = openPick
      ? `${openPick.teamShortName} is currently selected. You can still change it until the lock time if you want.`
      : 'Your next pick is already saved.';
    actionMeta = `Locks ${formatDistanceToNow(parseDate(openWeekWithPick.data.lockAt), { addSuffix: true })}`;
  } else if (upcomingWeek) {
    actionTone = 'brand';
    actionTitle = 'Waiting for the next gameweek';
    actionBody = 'The current open gameweek is already handled. Check back when the next fixtures unlock or when results are processed.';
    actionMeta = `Next scheduled lock is for Gameweek ${upcomingWeek.weekNumber}.`;
  }

  const showReminderSetup =
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

  const sidebarStatusLabel = !isParticipant
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

  const sidebarSummary = !isParticipant
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

  const sidebarMeta = awaitingPayment
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
          <div className="rounded-xl border border-gray-700/50 bg-surface-800/70 px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">Email reminders</p>
            <p className="mt-1 text-sm text-gray-100">{user?.emailResultsOptIn ? 'Enabled' : 'Disabled'}</p>
            <p className="mt-1 text-xs text-gray-400">
              Uses your profile notification setting for lock reminders and result updates.
            </p>
            {!user?.emailResultsOptIn && (
              <Link to="/profile" className="mt-3 inline-flex text-xs font-medium text-brand-400 hover:text-brand-300">
                Turn on in profile →
              </Link>
            )}
          </div>

          <div className="rounded-xl border border-gray-700/50 bg-surface-800/70 px-3 py-3">
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

  const mobileNextAction = (() => {
    if (!isParticipant && comp.status === 'UPCOMING') {
      return { kind: 'join' as const, label: 'Go to join flow', meta: comp.entryFee > 0 ? `Entry €${comp.entryFee}` : 'Free entry' };
    }
    if (awaitingPayment && comp.paymentMode === 'MANUAL') {
      return { kind: 'pending' as const, label: 'Awaiting organiser confirmation', meta: 'You are registered but not yet marked paid' };
    }
    if (openWeekForAction && !isEliminated && !isWinner && !awaitingPayment) {
      return { kind: 'pick' as const, label: `Open Gameweek ${openWeekForAction.weekNumber}`, meta: 'Review or make your pick' };
    }
    return null;
  })();

  const insightPanels = [
    {
      eyebrow: 'Crowd read',
      title: crowdReadTeam ? `${crowdReadTeam.teamShortName} carried the weight` : 'Waiting for the first crowd signal',
      detail: crowdReadTeam
        ? liveInsightWeek && liveInsightWeek.data.gwStatus !== 'COMPLETED'
          ? `${crowdReadTeam.pickCount} players are currently riding with ${crowdReadTeam.teamName} in Gameweek ${liveInsightWeek.weekNumber}, accounting for ${crowdReadTeam.percentage}% of tracked picks.`
          : `${crowdReadTeam.pickCount} players backed ${crowdReadTeam.teamName} in the latest resolved week, accounting for ${crowdReadTeam.percentage}% of tracked picks.`
        : 'Once a gameweek locks, this area highlights where the crowd moved together.',
      tone: 'brand' as const,
    },
    {
      eyebrow: 'Knockout blow',
      title: biggestCasualty ? `${biggestCasualty.teamShortName} was the trapdoor` : 'No major casualty yet',
      detail: biggestCasualty
        ? `${biggestCasualty.pickCount} entries went out backing ${biggestCasualty.teamName}. This is the kind of swing that changes a competition fast.`
        : latestCompletedWeek
        ? 'The latest resolved week did not produce a clear mass-casualty team.'
        : 'Once results land, this surfaces the team that took the most players down.',
      tone: 'danger' as const,
    },
    {
      eyebrow: 'Contrarian edge',
      title: contrarianSurvivor ? `${contrarianSurvivor.teamShortName} rewarded nerve` : 'No contrarian hero yet',
      detail: contrarianSurvivor
        ? `Only ${contrarianSurvivor.pickCount} player${contrarianSurvivor.pickCount === 1 ? '' : 's'} trusted ${contrarianSurvivor.teamName}, and they stayed alive.`
        : 'When a low-owned team gets players through, it shows up here as the smartest unpopular move.',
      tone: 'success' as const,
    },
  ];


  return (
    <div className="space-y-8 pb-24 lg:pb-0">
      {/* ── Header ── */}
      <section
        className="relative overflow-hidden rounded-[1.9rem] border border-white/8 px-5 py-5 shadow-[0_30px_75px_rgba(2,6,23,0.48)] sm:px-6 sm:py-6 lg:px-8 lg:py-7"
        style={{
          background: comp.clubPrimaryColor
            ? `radial-gradient(circle at top left, ${comp.clubPrimaryColor}38, transparent 24rem), radial-gradient(circle at 85% 18%, ${comp.clubSecondaryColor ?? comp.clubPrimaryColor}22, transparent 18rem), linear-gradient(135deg,rgba(15,23,42,0.98),rgba(8,15,30,0.94))`
            : undefined,
          ...(comp.clubPrimaryColor ? { borderTopColor: comp.clubPrimaryColor, borderTopWidth: '3px' } : {}),
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
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl">
            <Link to="/competitions" className="mb-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-brand-200/85 transition hover:text-white">
              <span>←</span> Competition lobby
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              <span className={comp.status === 'ACTIVE' ? 'badge-green' : comp.status === 'UPCOMING' ? 'badge-blue' : 'badge-gray'}>
                {comp.status}
              </span>
              {isEliminated && <span className="badge-red">ELIMINATED</span>}
              {isWinner && <span className="badge-green">🏆 WINNER</span>}
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-5xl">{comp.name}</h1>
            {comp.description && <p className="mt-2 max-w-xl text-sm leading-6 text-gray-300 sm:text-[15px] lg:text-base">{comp.description}</p>}
            <div className="mt-4 grid max-w-xl grid-cols-3 gap-2 sm:gap-3 lg:gap-4">
              <HeroStat label="Players" value={String(comp.participantCount ?? 0)} />
              <HeroStat label="Active" value={String(inProgressWeek ? effectiveActiveCount : (comp.activeCount ?? 0))} />
              <HeroStat label="Prize" value={comp.prizePool && comp.prizePool > 0 ? `€${comp.prizePool}` : comp.entryFee > 0 ? `€${comp.entryFee}` : 'Free'} />
            </div>
          </div>
          <div className="flex gap-2 flex-wrap items-start lg:flex-col lg:items-end">
          {/* Logo inline in this column on desktop */}
          {comp.clubLogoUrl && (
            <img
              src={comp.clubLogoUrl}
              alt={comp.clubName ?? 'Club logo'}
              className="hidden lg:block h-24 w-24 rounded-2xl object-cover border border-white/20 shadow-lg mb-2"
            />
          )}
          {/* Share / Invite */}
          <div className="relative" data-share-menu>
            <button
              onClick={() => setShareOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 text-gray-300 transition border border-gray-600/50"
              style={comp.clubPrimaryColor ? {
                borderColor: `${comp.clubPrimaryColor}44`,
                backgroundColor: `${comp.clubPrimaryColor}14`,
                color: comp.clubPrimaryColor,
              } : undefined}
            >
              📨 Invite
            </button>
            {shareOpen && (
              <div className="absolute left-0 right-auto top-full mt-1 z-50 w-[min(20rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] rounded-xl border border-gray-700 bg-surface-800 shadow-xl p-3 space-y-2 sm:left-auto sm:right-0 sm:w-64 sm:max-w-64">
                <p className="text-xs font-semibold text-gray-300 mb-1">Share this competition</p>
                {comp.joinCode ? (
                  <div className="rounded-lg border border-brand-500/20 bg-brand-500/10 px-3 py-2 text-xs text-brand-100">
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-300">Join code</span>
                    <span className="mt-1 block text-sm font-bold tracking-[0.22em]">{comp.joinCode}</span>
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
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-brand-600/20 hover:bg-brand-600/35 text-brand-100 text-xs transition"
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
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-700 hover:bg-surface-600 text-gray-200 text-xs transition"
                >
                  <span>🔗</span> Copy link
                </button>
                {/* WhatsApp */}
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(shareMessage)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setShareOpen(false)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-green-700/30 hover:bg-green-700/50 text-green-300 text-xs transition"
                >
                  <span>💬</span> Share on WhatsApp
                </a>
                {/* Email */}
                <a
                  href={`mailto:?subject=${encodeURIComponent(`Join ${comp.name} — Last Man Standing`)}&body=${encodeURIComponent(`Hi,\n\nI'd like to invite you to join my Last Man Standing competition: ${comp.name}.\n${comp.entryFee > 0 ? `Entry fee: €${comp.entryFee}\n` : ''}${comp.description ? `\n${comp.description}\n` : ''}${comp.joinCode ? `\nJoin code: ${comp.joinCode}\n` : ''}\nSign up and join here:\n${joinLink}\n\nGood luck!`)}`}
                  onClick={() => setShareOpen(false)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-700 hover:bg-surface-600 text-gray-200 text-xs transition"
                >
                  <span>✉️</span> Send via Email
                </a>
                <button onClick={() => setShareOpen(false)} className="w-full text-xs text-gray-500 hover:text-gray-300 pt-1">Dismiss</button>
              </div>
            )}
          </div>
          {/* Survivor Table */}
          <Link
            to={`/competitions/${compId}/survivor-table`}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 text-gray-300 transition border border-gray-600/50"
            style={comp.clubSecondaryColor ? {
              borderColor: `${comp.clubSecondaryColor}44`,
              backgroundColor: `${comp.clubSecondaryColor}12`,
              color: comp.clubSecondaryColor,
            } : undefined}
          >
            📊 Survivor Table
          </Link>
        </div>
        </div>
        <div className="relative mt-6 grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
          <div
            className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm"
            style={comp.clubPrimaryColor ? { borderLeftColor: comp.clubPrimaryColor, borderLeftWidth: '3px' } : undefined}
          >
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-200/80">
              {comp.clubLogoUrl && (
                <img src={comp.clubLogoUrl} alt="" className="h-6 w-6 rounded-md object-cover border border-white/20" />
              )}
              <span>{comp.clubName ? comp.clubName : 'Competition'} Pulse</span>
              {latestCompletedWeek && <span className="text-gray-500">•</span>}
              {latestCompletedWeek && <span className="text-yellow-200/90">Latest: GW{latestCompletedWeek.weekNumber}</span>}
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
                  <span className="block">GW survival {weeklySurvivalRate}%</span>
                  {weeklyPickedCount > 0 && (
                    <span className="block text-gray-400">{weeklyAdvancedCount} adv · {weeklyEliminatedCount} out</span>
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
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {spotlightCards.map((card) => (
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

      {isParticipant && awaitingPayment && strictManualPayment && (
        <section className="rounded-[1.35rem] border border-amber-400/35 bg-amber-500/10 px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300">Entry Pending Payment</div>
              <h2 className="mt-1 text-lg font-semibold text-white">Picks are locked until payment is confirmed</h2>
              <p className="mt-1 text-sm text-gray-200">
                Your entry is registered, but the club admin still needs to confirm your payment before you can make selections.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 self-start rounded-full border border-amber-300/35 bg-black/10 px-3 py-1.5 text-xs font-medium text-amber-100">
              <span className="h-2 w-2 rounded-full bg-amber-300" />
              Awaiting confirmation
            </div>
          </div>
        </section>
      )}

      {openWeekForAction && !isEliminated && !isWinner && !awaitingPayment && (
        <section className="card p-4 sm:p-5 lg:hidden">
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Next pick</p>
              <h2 className="mt-1 text-lg font-semibold text-white">Gameweek {openWeekForAction.weekNumber}</h2>
              <p className="mt-1 text-sm text-gray-300">
                {openWeekWithoutPick
                  ? 'You still need to choose a team before the lock.'
                  : openWeekWithPick
                  ? 'Your pick is in. You can change it until lock.'
                  : 'Fixtures are open. Jump down to make a pick.'}
              </p>
            </div>
            {openWeekForAction.data?.lockAt && (
              <p className="text-xs text-gray-400">
                Locks {formatDistanceToNow(parseDate(openWeekForAction.data.lockAt), { addSuffix: true })}
              </p>
            )}
            <button
              type="button"
              onClick={handleScrollToOpenWeek}
              className="btn-primary w-full"
            >
              Jump to picks
            </button>
          </div>
        </section>
      )}

      {openWeekForAction && !isEliminated && !isWinner && awaitingPayment && strictManualPayment && (
        <section className="card p-4 sm:p-5 lg:hidden border border-amber-400/35 bg-amber-500/10">
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300">Next pick</p>
              <h2 className="mt-1 text-lg font-semibold text-white">Waiting for payment confirmation</h2>
              <p className="mt-1 text-sm text-gray-200">
                You can’t make a pick yet. Once the club admin confirms payment, this section will unlock automatically.
              </p>
            </div>
            <div className="text-xs text-amber-100/90">
              If you have already paid, ask the organiser to mark you as paid.
            </div>
          </div>
        </section>
      )}

      {resultsProcessing && (
        <section className="rounded-[1.35rem] border border-yellow-500/30 bg-yellow-500/10 px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-yellow-300">Processing Update</div>
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
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-gray-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
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
              accentColor={comp.clubPrimaryColor}
              cta={!isParticipant && comp.status === 'UPCOMING' ? (
                <Link to={joinPath} className="btn-primary w-full sm:w-auto text-sm">
                  Go to join flow
                </Link>
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
          {isParticipant && !isEliminated && !isWinner && myStatus.picks.length === 0 && (
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
                className="w-full flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left text-sm font-semibold text-gray-200"
                aria-expanded={mobileReminderOpen}
                aria-controls="mobile-reminder"
              >
                <span>Reminder setup</span>
                <span className="text-gray-400">{mobileReminderOpen ? 'Hide' : 'Show'}</span>
              </button>
              {mobileReminderOpen && (
                <div id="mobile-reminder" className="mt-4">
                  {reminderPanel}
                </div>
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
              {sortedWeeks.map((wn) => {
                const gwData = fixturesByWeek.get(wn)!;
                const gwId = gwData.gwId;
                const gwFixtures = gwData.fixtures;
                const lockAt = gwData.lockAt;
                const gwStatus = gwData.gwStatus;

                const isLocked = gwStatus === 'LOCKED' || gwStatus === 'IN_PROGRESS' || gwStatus === 'COMPLETED' || isPast(parseDate(lockAt));
                const isCompleted = gwStatus === 'COMPLETED' || gwFixtures.every(f => f.status === 'FINISHED' || f.status === 'POSTPONED' || f.status === 'CANCELLED');
                const isCollapsed = collapsedWeeks.has(wn);
                const myPickForGw = pickByGwId.get(gwId);

                return (
                  <div
                    id={`gw-card-${wn}`}
                    key={wn}
                    className={clsx('card overflow-hidden', {
                      'border-brand-500/40': myPickForGw && !isCompleted,
                      'border-gray-700/30 opacity-75': isCompleted,
                    })}
                    style={myPickForGw && !isCompleted && comp.clubPrimaryColor ? {
                      borderColor: `${comp.clubPrimaryColor}66`,
                      boxShadow: `0 0 0 1px ${comp.clubPrimaryColor}20`,
                    } : undefined}
                  >
                    {/* ── Gameweek header — clickable toggle ── */}
                    <button
                      onClick={() => toggleWeek(wn)}
                      className="w-full flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 text-left group"
                      aria-expanded={!isCollapsed}
                      aria-controls={`gw-${wn}-fixtures`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-3 min-w-0">
                          <h3 className="text-lg font-semibold shrink-0">Gameweek {wn}</h3>
                          {isCompleted ? (
                            <span className="badge-gray text-xs">Completed</span>
                          ) : isLocked ? (
                            <span className="badge-red text-xs">🔒 Locked</span>
                          ) : (
                            <span className="badge-yellow text-xs">
                              Locks {formatDistanceToNow(parseDate(lockAt), { addSuffix: true })}
                            </span>
                          )}
                          {/* Desktop collapsed summary */}
                          {isCollapsed && myPickForGw && (
                            <span className="hidden sm:inline text-sm text-gray-400 truncate">
                              — <span className={clsx('font-semibold', {
                                'text-green-400': myPickForGw.outcome === 'ADVANCE',
                                'text-red-400': myPickForGw.outcome === 'ELIMINATED',
                                'text-yellow-400': myPickForGw.outcome === 'POSTPONED_ADVANCE',
                                'text-brand-400': myPickForGw.outcome === 'PENDING',
                              })}>
                                {myPickForGw.teamShortName}
                              </span>
                              {myPickForGw.outcome !== 'PENDING' && (
                                <span className="ml-1"><OutcomeBadge outcome={myPickForGw.outcome} /></span>
                              )}
                            </span>
                          )}
                          {isCollapsed && !myPickForGw && isParticipant && !isEliminated && !isWinner && !isLocked && (
                            <span className="hidden sm:inline text-xs text-yellow-400 italic">— no pick yet</span>
                          )}
                        </div>

                        {isCollapsed && myPickForGw && (
                          <div className="sm:hidden mt-1 text-xs text-gray-400">
                            Selected:{' '}
                            <span className={clsx('font-semibold', {
                              'text-green-400': myPickForGw.outcome === 'ADVANCE',
                              'text-red-400': myPickForGw.outcome === 'ELIMINATED',
                              'text-yellow-400': myPickForGw.outcome === 'POSTPONED_ADVANCE',
                              'text-brand-400': myPickForGw.outcome === 'PENDING',
                            })}>
                              {myPickForGw.teamShortName}
                            </span>
                          </div>
                        )}
                        {isCollapsed && !myPickForGw && isParticipant && !isEliminated && !isWinner && !isLocked && (
                          <div className="sm:hidden mt-1 text-xs text-yellow-400 italic">No pick yet</div>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3 ml-2">
                        {!isCollapsed && myPickForGw && (
                          <span className="text-sm text-gray-300 hidden sm:inline">
                            Your pick:{' '}
                            <span className={clsx('font-bold', {
                              'text-green-400': myPickForGw.outcome === 'ADVANCE',
                              'text-red-400': myPickForGw.outcome === 'ELIMINATED',
                              'text-yellow-400': myPickForGw.outcome === 'POSTPONED_ADVANCE',
                              'text-brand-400': myPickForGw.outcome === 'PENDING',
                            })}>{myPickForGw.teamShortName}</span>
                            {myPickForGw.outcome !== 'PENDING' && (
                              <span className="ml-1"><OutcomeBadge outcome={myPickForGw.outcome} /></span>
                            )}
                          </span>
                        )}
                        {!isCollapsed && isLocked && (
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              to={`/competitions/${compId}/gameweeks/${gwId}/selections`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-xs text-brand-400 hover:text-brand-300 hidden sm:inline whitespace-nowrap"
                            >
                              All selections →
                            </Link>
                            {isCompleted && (
                              <Link
                                to={`/competitions/${compId}/gameweeks/${gwId}/results`}
                                onClick={(e) => e.stopPropagation()}
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

                    {/* Selections/Results links on mobile when expanded */}
                    {!isCollapsed && isLocked && (
                      <div className="mt-2 sm:hidden flex gap-3">
                        <Link
                          to={`/competitions/${compId}/gameweeks/${gwId}/selections`}
                          className="text-xs text-brand-400 hover:text-brand-300"
                        >
                          View all selections →
                        </Link>
                        {isCompleted && (
                          <Link
                            to={`/competitions/${compId}/gameweeks/${gwId}/results`}
                            className="text-xs text-green-400 hover:text-green-300 font-medium"
                          >
                            📊 Results →
                          </Link>
                        )}
                      </div>
                    )}

                    {/* ── Fixture rows — collapsible ── */}
                    {!isCollapsed && (
                      <div id={`gw-${wn}-fixtures`} className="space-y-2 mt-4">
                        {/* Show message if user was eliminated before this gameweek (only for non-completed gameweeks) */}
                        {isEliminated && participant?.eliminatedWeek != null && wn > participant.eliminatedWeek && gwStatus !== 'COMPLETED' && (
                          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm">
                            <p className="text-red-400 font-medium">
                              ⚠️ You were eliminated in Gameweek {participant.eliminatedWeek} and cannot make picks for this gameweek.
                            </p>
                          </div>
                        )}
                        {gwFixtures
                          .sort((a, b) => parseDate(a.kickoffAt).getTime() - parseDate(b.kickoffAt).getTime())
                          .map((f) => {
                            // Check if user can pick for THIS specific gameweek
                            // Cannot pick if: not a participant, eliminated, winner, locked, OR eliminated in an earlier gameweek
                            const eliminatedBeforeThisGw = isEliminated &&
                              participant?.eliminatedWeek != null &&
                              wn > participant.eliminatedWeek;
                            const canPickThisGw = isParticipant && !isEliminated && !isWinner && !(awaitingPayment && strictManualPayment) && !isLocked && !eliminatedBeforeThisGw;
                            const homeIsMyPick = myPickForGw?.teamId === f.homeTeamId;
                            const awayIsMyPick = myPickForGw?.teamId === f.awayTeamId;
                            const homeUsed = usedTeamIds.has(f.homeTeamId) && !homeIsMyPick;
                            const awayUsed = usedTeamIds.has(f.awayTeamId) && !awayIsMyPick;
                            const gwStats = pickStatsByGwId.get(gwId);
                            const homeStat = gwStats?.find(s => s.teamId === f.homeTeamId);
                            const awayStat = gwStats?.find(s => s.teamId === f.awayTeamId);

                            return (
                              <div
                                key={f.id}
                                className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-lg bg-surface-700/50 px-3 py-2 sm:gap-3 sm:px-4 sm:py-2.5 lg:gap-4"
                              >
                                <TeamButton
                                  name={f.homeTeamName}
                                  shortName={f.homeTeamShortName}
                                  isMyPick={homeIsMyPick}
                                  isUsed={homeUsed}
                                  isClickable={canPickThisGw && !homeUsed}
                                  align="right"
                                  pickStat={homeStat}
                                  accentColor={comp.clubSecondaryColor}
                                  onClick={() => handlePick(gwId, f.homeTeamId, lockAt)}
                                />
                                <div className="flex flex-col items-center justify-center min-w-[80px] sm:min-w-[80px] lg:min-w-[96px] px-1">
                                {f.status === 'FINISHED' ? (
                                  <span className="font-bold text-white text-xs sm:text-sm lg:text-base">{f.scoreHome} - {f.scoreAway}</span>
                                ) : f.status === 'POSTPONED' ? (
                                  <span className="badge-yellow text-xs">PP</span>
                                ) : f.status === 'IN_PLAY' ? (
                                  <>
                                    <span className="font-bold text-white text-xs sm:text-sm lg:text-base">
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
                                  shortName={f.awayTeamShortName}
                                  isMyPick={awayIsMyPick}
                                  isUsed={awayUsed}
                                  isClickable={canPickThisGw && !awayUsed}
                                  align="left"
                                  pickStat={awayStat}
                                  accentColor={comp.clubSecondaryColor}
                                  onClick={() => handlePick(gwId, f.awayTeamId, lockAt)}
                                />
                              </div>
                            );
                          })}
                      </div>
                    )}
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
                <h2 className="text-xl font-bold">My Pick History</h2>
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
                        const outcome = effectivePickOutcome(pick);
                        return (
                        <div key={pick.pickId} className="py-3 space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs uppercase tracking-[0.14em] text-gray-500">Gameweek {pick.weekNumber}</p>
                              <p className="mt-1 text-sm font-semibold text-gray-100">{pick.teamShortName}</p>
                              <p className="text-xs text-gray-400 truncate">{pick.teamName}</p>
                            </div>
                            <OutcomeBadge outcome={outcome} />
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-500">
                              {pick.source === 'AUTO' ? 'Auto-picked' : 'Self-picked'}
                            </span>
                            {pick.source === 'AUTO' ? <span className="badge-yellow text-[10px]">Auto</span> : <span className="badge-gray text-[10px]">Self</span>}
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
                          const outcome = effectivePickOutcome(pick);
                          return (
                          <tr key={pick.pickId} className="border-b border-gray-700/50 hover:bg-surface-700/30">
                            <td className="py-3 px-4 font-medium">{pick.weekNumber}</td>
                            <td className="py-3 px-4">
                              <span className="font-semibold">{pick.teamShortName}</span>
                              <span className="text-gray-400 ml-2 text-xs">{pick.teamName}</span>
                            </td>
                            <td className="py-3 px-4">
                              {pick.source === 'AUTO' ? <span className="badge-yellow">Auto</span> : <span className="badge-gray">Self</span>}
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
              accentColor={comp.clubPrimaryColor}
              cta={!isParticipant && comp.status === 'UPCOMING' ? (
                <Link to={joinPath} className="btn-primary w-full sm:w-auto text-sm">
                  Go to join flow
                </Link>
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

            <section className="card p-4 sm:p-5 hidden lg:block">
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
                    awaitingPayment && comp.paymentMode === 'MANUAL'
                      ? 'Awaiting organiser confirmation'
                      : paymentState === 'PAID'
                      ? 'Payment settled'
                      : comp.paymentMode === 'MANUAL'
                      ? 'Pay organiser directly'
                      : comp.paymentMode === 'STRIPE'
                      ? 'Paid online'
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
                  value={isParticipant ? `${usedTeamIds.size} used` : 'Join to track'}
                  detail={isParticipant && remainingTeamsCount !== null ? `${remainingTeamsCount} teams still available` : 'Usage updates after each pick'}
                />
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
                <section id="mobile-rules" className="mt-4 card p-4 sm:p-5">
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
                        awaitingPayment && comp.paymentMode === 'MANUAL'
                          ? 'Awaiting organiser confirmation'
                          : paymentState === 'PAID'
                          ? 'Payment settled'
                          : comp.paymentMode === 'MANUAL'
                          ? 'Pay organiser directly'
                          : comp.paymentMode === 'STRIPE'
                          ? 'Paid online'
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
                      value={isParticipant ? `${usedTeamIds.size} used` : 'Join to track'}
                      detail={isParticipant && remainingTeamsCount !== null ? `${remainingTeamsCount} teams still available` : 'Usage updates after each pick'}
                    />
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

      {mobileNextAction && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-slate-950/95 px-3 py-2 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-4xl items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] uppercase tracking-[0.14em] text-gray-400">Next action</p>
              <p className="truncate text-xs text-gray-200">{mobileNextAction.meta}</p>
            </div>
            {mobileNextAction.kind === 'join' ? (
              <Link to={joinPath} className="btn-primary shrink-0 px-3 py-2 text-xs">
                {mobileNextAction.label}
              </Link>
            ) : mobileNextAction.kind === 'pick' ? (
              <button type="button" onClick={handleScrollToOpenWeek} className="btn-primary shrink-0 px-3 py-2 text-xs">
                {mobileNextAction.label}
              </button>
            ) : (
              <span className="shrink-0 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-300">
                {mobileNextAction.label}
              </span>
            )}
          </div>
        </div>
      )}
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
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">{eyebrow}</div>
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
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-70">{eyebrow}</div>
      <h3 className="mt-2 text-lg font-semibold tracking-tight text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-gray-300">{detail}</p>
    </div>
  );
}

function TeamButton({
  name, shortName, isMyPick, isUsed, isClickable, align, pickStat, accentColor, onClick,
}: {
  name: string; shortName: string; isMyPick: boolean; isUsed: boolean;
  isClickable: boolean; align: 'left' | 'right'; pickStat?: PickStat; accentColor?: string | null; onClick: () => void;
}) {
  const showStatusPill = isMyPick || (isUsed && !isMyPick);
  const statusPillLabel = isMyPick ? 'Picked' : 'Used';

  return (
    <button
      onClick={onClick}
      disabled={!isClickable && !isMyPick}
      title={
        isUsed ? `${name} — already used this competition` :
        isMyPick ? `${name} — your pick${isClickable ? ' (click to change)' : ''}` :
        name
      }
      className={clsx(
        'flex h-full flex-col justify-center gap-0.5 rounded-lg px-1.5 sm:px-3 lg:px-4 py-0.5 sm:py-0.5 w-full min-w-0 transition-all min-h-[28px] sm:min-h-[30px] lg:min-h-[32px]',
        align === 'right' ? 'items-end text-right' : 'items-start text-left',
        isMyPick && 'bg-brand-600/85 border-2 border-brand-300 text-white font-bold shadow-md shadow-brand-900/25',
        isUsed && !isMyPick && 'bg-transparent text-gray-700 cursor-not-allowed',
        isClickable && !isMyPick && 'bg-surface-600/50 border border-gray-600 hover:border-gray-500 hover:bg-white/[0.04] text-gray-200 cursor-pointer font-medium',
        !isClickable && !isUsed && !isMyPick && 'bg-transparent text-gray-400 cursor-default font-medium',
      )}
      aria-pressed={isMyPick}
      aria-label={`Pick ${name}`}
    >
      {/* Team name row */}
      {/* Mobile: centered within each box */}
      <div className={clsx('flex sm:hidden w-full items-center gap-1', align === 'right' ? 'justify-end' : 'justify-start')}>
        <span className={clsx('font-bold text-xs', isMyPick ? 'text-white' : isUsed ? 'line-through' : '')}>
          {shortName}
        </span>
        {showStatusPill && (
          <span
            className={clsx(
              'inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em]',
              isMyPick ? 'bg-white/18 text-white' : 'bg-gray-500/22 text-gray-400',
            )}
          >
            {statusPillLabel}
          </span>
        )}
      </div>
      {/* Desktop */}
      {pickStat ? (
        align === 'right' ? (
          <div className="hidden sm:grid w-full items-center gap-2 grid-cols-[auto_1fr_auto] text-right">
            <span className={clsx('text-xs font-bold justify-self-start', isMyPick ? 'text-white' : 'text-gray-400')}>
              {showStatusPill ? statusPillLabel : ''}
            </span>
            <span className="truncate text-xs lg:text-sm font-normal opacity-90 justify-self-end">
              {name}
            </span>
            <span className={clsx('font-bold sm:text-sm', isMyPick ? 'text-white' : isUsed ? 'line-through' : '')} style={{ width: '3ch' }}>
              {shortName}
            </span>
          </div>
        ) : (
          <div className="hidden sm:grid w-full items-center gap-2 grid-cols-[auto_auto_1fr_auto] text-left">
            <span className={clsx('font-bold sm:text-sm', isMyPick ? 'text-white' : isUsed ? 'line-through' : '')} style={{ width: '3ch' }}>
              {shortName}
            </span>
            <span className="text-[10px] text-gray-500">·</span>
            <span className="truncate text-xs lg:text-sm font-normal opacity-90">
              {name}
            </span>
            <span className={clsx('text-xs font-bold justify-self-end', isMyPick ? 'text-white' : 'text-gray-400')}>
              {showStatusPill ? statusPillLabel : ''}
            </span>
          </div>
        )
      ) : align === 'right' ? (
        <div className="hidden sm:grid h-full w-full place-items-center">
          <div className="grid w-full max-w-[18rem] grid-cols-[3.5ch_minmax(0,1fr)_3ch] items-center gap-2">
            <span className="text-left text-xs font-bold text-gray-400">
              {showStatusPill ? statusPillLabel : ''}
            </span>
            <span className="truncate text-center text-xs lg:text-sm font-normal opacity-90">
              {name}
            </span>
            <span className={clsx('text-right font-bold sm:text-sm', isMyPick ? 'text-white' : isUsed ? 'line-through' : '')}>
              {shortName}
            </span>
          </div>
        </div>
      ) : (
        <div className="hidden sm:grid h-full w-full place-items-center">
          <div className="grid w-full max-w-[18rem] grid-cols-[3ch_minmax(0,1fr)_3.5ch] items-center gap-2">
            <span className={clsx('text-left font-bold sm:text-sm', isMyPick ? 'text-white' : isUsed ? 'line-through' : '')}>
              {shortName}
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
      {pickStat ? (
        <div className="w-full mt-1.5 min-h-[20px]">
          <div className={clsx('flex w-full', align === 'right' ? 'justify-end' : 'justify-start')}>
            <div
              className={clsx(
                'inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap',
                isMyPick ? 'bg-white/16 text-white/90' : 'bg-white/8 text-gray-300',
              )}
              style={accentColor && !isMyPick ? { border: `1px solid ${accentColor}44`, color: '#cbd5e1' } : undefined}
            >
              {pickStat.percentage}%
              <span className={clsx('font-normal whitespace-nowrap', isMyPick ? 'text-white/60' : 'text-gray-400')}>
                · {pickStat.pickCount} {pickStat.pickCount === 1 ? 'player' : 'players'}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="w-full mt-1.5 min-h-[20px]" />
      )}
    </button>
  );
}

function ActionPanel({
  tone,
  title,
  statusLabel,
  body,
  meta,
  cta,
  accentColor,
}: {
  tone: 'brand' | 'warning' | 'danger' | 'success';
  title: string;
  statusLabel: string;
  body: string;
  meta?: string | null;
  cta?: ReactNode;
  accentColor?: string | null;
}) {
  const toneClasses = {
    brand: 'border-brand-500/30 bg-brand-500/10 text-brand-300',
    warning: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300',
    danger: 'border-red-500/30 bg-red-500/10 text-red-300',
    success: 'border-green-500/30 bg-green-500/10 text-green-300',
  } as const;

  return (
    <section
      className="card p-4 sm:p-5"
      style={tone === 'brand' && accentColor ? {
        borderTopColor: accentColor,
        borderTopWidth: '3px',
        backgroundImage: `radial-gradient(circle at top right, ${accentColor}18, transparent 13rem)`,
      } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Next Action</div>
          <h2 className="mt-2 text-lg font-semibold tracking-tight text-white">{title}</h2>
          <p className="mt-1 text-sm font-medium text-gray-400">{statusLabel}</p>
        </div>
        <div
          className={`inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${toneClasses[tone]}`}
          style={tone === 'brand' && accentColor ? {
            borderColor: `${accentColor}55`,
            backgroundColor: `${accentColor}22`,
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
          style={tone === 'brand' && accentColor ? { borderColor: `${accentColor}2f` } : undefined}
        >
          {meta}
        </p>
      )}
      {cta && <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">{cta}</div>}
    </section>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.045] px-3 py-2.5 backdrop-blur-sm">
      <div className="text-lg font-black text-white">{value}</div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">{label}</div>
    </div>
  );
}

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
