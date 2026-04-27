import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import api from '../api';
import type { Competition, MyStatus, Fixture } from '../types';
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

  const { data: comp, isLoading: compLoading } = useQuery<Competition>({
    queryKey: ['competition', compId],
    queryFn: () => api.get(`/competitions/${compId}`).then((r) => r.data),
    staleTime: 30_000,
  });

  const { data: myStatus, isLoading: statusLoading } = useQuery<MyStatus>({
    queryKey: ['myStatus', compId],
    queryFn: () => api.get(`/competitions/${compId}/me`).then((r) => r.data),
    retry: false,
    staleTime: 30_000,
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
      const inProgress = data?.some((f) => f.gameweekStatus === 'IN_PROGRESS');
      return inProgress ? 300_000 : false;
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

  const isParticipant = !!myStatus;
  const isEliminated = myStatus?.participant.status === 'ELIMINATED';
  const isWinner = myStatus?.participant.status === 'WINNER';
  const paymentState = myStatus?.participant.paymentState;
  const awaitingPayment = paymentState === 'AWAITING_PAYMENT';

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

  const toggleWeek = (wn: number) => {
    setCollapsedWeeks((prev) => {
      const next = new Set(prev);
      next.has(wn) ? next.delete(wn) : next.add(wn);
      return next;
    });
  };


  const handlePick = (gwId: number, teamId: number, lockAt: string) => {
    if (!isParticipant || isEliminated || isWinner) return;
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
    actionTitle = `Eliminated in Gameweek ${myStatus?.participant.eliminatedWeek}`;
    actionBody = 'You can no longer make picks, but fixtures, selections, and results stay available so you can follow the rest of the competition.';
    actionMeta = latestResolvedPick ? `Latest resolved pick: ${latestResolvedPick.teamShortName} in GW${latestResolvedPick.weekNumber}.` : null;
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


  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link to="/competitions" className="text-sm text-gray-400 hover:text-white mb-2 inline-block">
            ← Back to competitions
          </Link>
          <h1 className="text-3xl font-bold">{comp.name}</h1>
          {comp.description && <p className="mt-1 text-gray-400">{comp.description}</p>}
        </div>
        <div className="flex gap-2 flex-wrap items-start">
          <span className={comp.status === 'ACTIVE' ? 'badge-green' : comp.status === 'UPCOMING' ? 'badge-blue' : 'badge-gray'}>
            {comp.status}
          </span>
          {isEliminated && <span className="badge-red">ELIMINATED</span>}
          {isWinner && <span className="badge-green">🏆 WINNER</span>}
          {/* Share / Invite */}
          <div className="relative" data-share-menu>
            <button
              onClick={() => setShareOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 text-gray-300 transition border border-gray-600/50"
            >
              📨 Invite
            </button>
            {shareOpen && (
              <div className="absolute left-0 right-auto top-full mt-1 z-50 w-[min(20rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] rounded-xl border border-gray-700 bg-surface-800 shadow-xl p-3 space-y-2 sm:left-auto sm:right-0 sm:w-64 sm:max-w-64">
                <p className="text-xs font-semibold text-gray-300 mb-1">Share this competition</p>
                {/* Copy link */}
                <button
                  onClick={() => {
                    const url = `${window.location.origin}/competitions/${compId}`;
                    navigator.clipboard.writeText(url).then(() => {
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
                  href={`https://wa.me/?text=${encodeURIComponent(`Join me in ${comp.name} on Last Man Standing!\n${window.location.origin}/competitions/${compId}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setShareOpen(false)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-green-700/30 hover:bg-green-700/50 text-green-300 text-xs transition"
                >
                  <span>💬</span> Share on WhatsApp
                </a>
                {/* Email */}
                <a
                  href={`mailto:?subject=${encodeURIComponent(`Join ${comp.name} — Last Man Standing`)}&body=${encodeURIComponent(`Hi,\n\nI'd like to invite you to join my Last Man Standing competition: ${comp.name}.\n${comp.entryFee > 0 ? `Entry fee: €${comp.entryFee}\n` : ''}${comp.description ? `\n${comp.description}\n` : ''}\nSign up and join here:\n${window.location.origin}/competitions/${compId}\n\nGood luck!`)}`}
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
          >
            📊 Survivor Table
          </Link>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <ActionPanel
          tone={actionTone}
          title={actionTitle}
          body={actionBody}
          meta={actionMeta}
          cta={!isParticipant && comp.status === 'UPCOMING' ? (
            <Link to={`/competitions?join=${compId}`} className="btn-primary w-full sm:w-auto text-sm">
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

        <section className="card p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-100">Rules & Status</h2>
              <p className="mt-1 text-xs text-gray-400">The key competition settings at a glance.</p>
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
              detail={comp.status === 'ACTIVE' ? `${comp.activeCount ?? 0} still active` : comp.winnerUsername ? `Winner: ${comp.winnerUsername}` : 'Registration overview'}
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
      </div>

      {isParticipant && !isEliminated && !isWinner && myStatus.picks.length === 0 && (
        <section className="card p-4 sm:p-5">
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

      {showReminderSetup && (
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
              <div key={wn} className={clsx('card overflow-hidden', {
                'border-brand-500/40': myPickForGw && !isCompleted,
                'border-gray-700/30 opacity-75': isCompleted,
              })}>
                {/* ── Gameweek header — clickable toggle ── */}
                <button
                  onClick={() => toggleWeek(wn)}
                  className="w-full flex items-start justify-between text-left group"
                  aria-expanded={!isCollapsed}
                  aria-controls={`gw-${wn}-fixtures`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 min-w-0">
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
                  <div className="flex items-center gap-3 shrink-0 ml-2">
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
                      <div className="flex items-center gap-3">
                        <Link
                          to={`/competitions/${compId}/gameweeks/${gwId}/selections`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs text-brand-400 hover:text-brand-300 hidden sm:inline"
                        >
                          All selections →
                        </Link>
                        {isCompleted && (
                          <Link
                            to={`/competitions/${compId}/gameweeks/${gwId}/results`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs text-green-400 hover:text-green-300 hidden sm:inline font-medium"
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
                    {/* Show message if user was eliminated before this gameweek */}
                    {isEliminated && myStatus?.participant.eliminatedWeek != null && wn > myStatus.participant.eliminatedWeek && (
                      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm">
                        <p className="text-red-400 font-medium">
                          ⚠️ You were eliminated in Gameweek {myStatus.participant.eliminatedWeek} and cannot make picks for this gameweek.
                        </p>
                      </div>
                    )}
                    {gwFixtures
                      .sort((a, b) => parseDate(a.kickoffAt).getTime() - parseDate(b.kickoffAt).getTime())
                      .map((f) => {
                        // Check if user can pick for THIS specific gameweek
                        // Cannot pick if: not a participant, eliminated, winner, locked, OR eliminated in an earlier gameweek
                        const eliminatedBeforeThisGw = isEliminated && 
                          myStatus?.participant.eliminatedWeek != null && 
                          wn > myStatus.participant.eliminatedWeek;
                        const canPickThisGw = isParticipant && !isEliminated && !isWinner && !isLocked && !eliminatedBeforeThisGw;
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
                            className="grid grid-cols-[1fr_auto_1fr] items-start gap-2 rounded-lg bg-surface-700/50 px-3 py-2.5"
                          >
                            <TeamButton
                              name={f.homeTeamName}
                              shortName={f.homeTeamShortName}
                              isMyPick={homeIsMyPick}
                              isUsed={homeUsed}
                              isClickable={canPickThisGw && !homeUsed}
                              align="right"
                              pickStat={homeStat}
                              onClick={() => handlePick(gwId, f.homeTeamId, lockAt)}
                            />
                          <div className="flex flex-col items-center min-w-[52px] sm:min-w-[72px] pt-2">
                            {f.status === 'FINISHED' ? (
                              <span className="font-bold text-white text-xs sm:text-sm">{f.scoreHome} - {f.scoreAway}</span>
                            ) : f.status === 'POSTPONED' ? (
                              <span className="badge-yellow text-xs">PP</span>
                            ) : f.status === 'IN_PLAY' ? (
                              <span className="text-green-400 text-xs font-bold animate-pulse">LIVE</span>
                            ) : (
                              <>
                              <span className="text-gray-400 text-[10px] sm:text-xs">{formatKickoffDate(f.kickoffAt)}</span>
                                <span className="text-gray-300 text-[10px] sm:text-xs font-medium">{formatKickoffTime(f.kickoffAt)}</span>
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
                  .map((pick) => (
                    <div key={pick.pickId} className="py-3 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs uppercase tracking-[0.14em] text-gray-500">Gameweek {pick.weekNumber}</p>
                          <p className="mt-1 text-sm font-semibold text-gray-100">{pick.teamShortName}</p>
                          <p className="text-xs text-gray-400 truncate">{pick.teamName}</p>
                        </div>
                        <OutcomeBadge outcome={pick.outcome} />
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500">
                          {pick.source === 'AUTO' ? 'Auto-picked' : 'Self-picked'}
                        </span>
                        {pick.source === 'AUTO' ? <span className="badge-yellow text-[10px]">Auto</span> : <span className="badge-gray text-[10px]">Self</span>}
                      </div>
                    </div>
                  ))}
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
                      .map((pick) => (
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
                          <OutcomeBadge outcome={pick.outcome} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TeamButton({
  name, shortName, isMyPick, isUsed, isClickable, align, pickStat, onClick,
}: {
  name: string; shortName: string; isMyPick: boolean; isUsed: boolean;
  isClickable: boolean; align: 'left' | 'right'; pickStat?: PickStat; onClick: () => void;
}) {
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
        'flex flex-col gap-0.5 rounded-lg px-1.5 sm:px-3 py-2 w-full transition-all',
        align === 'right' ? 'items-end text-right' : 'items-start text-left',
        isMyPick && 'bg-brand-600 border-2 border-brand-400 text-white font-bold shadow-lg shadow-brand-900/50',
        isUsed && !isMyPick && 'bg-transparent text-gray-700 cursor-not-allowed',
        isClickable && !isMyPick && 'bg-surface-600/50 border border-gray-600 hover:border-brand-500 hover:bg-brand-500/10 text-gray-200 cursor-pointer font-medium',
        !isClickable && !isUsed && !isMyPick && 'bg-transparent text-gray-400 cursor-default font-medium',
      )}
      aria-pressed={isMyPick}
      aria-label={`Pick ${name}`}
    >
      {/* Team name row */}
      <div className={clsx('flex items-center gap-1 sm:gap-2 w-full', align === 'right' ? 'flex-row-reverse' : 'flex-row')}>
        <span className={clsx('font-bold text-xs shrink-0', isMyPick ? 'text-white' : isUsed ? 'line-through' : '')}>{shortName}</span>
        <span className="hidden sm:block truncate text-xs font-normal opacity-90 flex-1">{name}</span>
        {isMyPick && <span className="text-xs shrink-0 font-bold">✓</span>}
        {isUsed && !isMyPick && <span className="hidden sm:inline text-[10px] text-gray-600 shrink-0">used</span>}
      </div>
      {/* Pick stat bar — shown after gameweek locks */}
      {pickStat && (
        <div className="w-full mt-2 space-y-1">
          <div className={clsx('w-full h-2 rounded-full overflow-hidden bg-surface-500', align === 'right' && 'scale-x-[-1]')}>
            <div
              className={clsx('h-2 rounded-full transition-all duration-700', isMyPick ? 'bg-white/80' : 'bg-brand-500')}
              style={{ width: `${Math.max(pickStat.percentage, 2)}%` }}
            />
          </div>
          <div className={clsx('flex w-full', align === 'right' ? 'justify-end' : 'justify-start')}>
            <div className={clsx(
              'inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full',
              isMyPick ? 'bg-white/20 text-white' : 'bg-brand-500/20 text-brand-300'
            )}>
              {pickStat.percentage}%
              <span className={clsx('font-normal', isMyPick ? 'text-white/60' : 'text-gray-400')}>
                · {pickStat.pickCount} {pickStat.pickCount === 1 ? 'player' : 'players'}
              </span>
            </div>
          </div>
        </div>
      )}
    </button>
  );
}

function ActionPanel({
  tone,
  title,
  body,
  meta,
  cta,
}: {
  tone: 'brand' | 'warning' | 'danger' | 'success';
  title: string;
  body: string;
  meta?: string | null;
  cta?: ReactNode;
}) {
  const toneClasses = {
    brand: 'border-brand-500/30 bg-brand-500/10 text-brand-300',
    warning: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300',
    danger: 'border-red-500/30 bg-red-500/10 text-red-300',
    success: 'border-green-500/30 bg-green-500/10 text-green-300',
  } as const;

  return (
    <section className="card p-4 sm:p-5">
      <div className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${toneClasses[tone]}`}>
        Next step
      </div>
      <h2 className="mt-3 text-xl font-semibold text-gray-100">{title}</h2>
      <p className="mt-2 text-sm text-gray-300">{body}</p>
      {meta && <p className="mt-2 text-xs text-gray-500">{meta}</p>}
      {cta && <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">{cta}</div>}
    </section>
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
    <div className="rounded-xl border border-gray-700/50 bg-surface-700/40 px-3 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">{label}</div>
      <div className={`mt-1 text-sm font-semibold ${accent}`}>{value}</div>
      <div className="mt-1 text-xs text-gray-400">{detail}</div>
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
