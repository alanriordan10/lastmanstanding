import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useMemo } from 'react';
import api from '../api';
import type { Competition, MyStatus, Fixture } from '../types';
import toast from 'react-hot-toast';
import { formatDistanceToNow, isPast } from 'date-fns';
import clsx from 'clsx';
import { useCountdown } from '../hooks/useCountdown';

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
    // Poll every 5 mins when a gameweek is in progress
    refetchInterval: (query) => {
      const data = query.state.data as Fixture[] | undefined;
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
              <div className="absolute right-0 top-full mt-1 z-50 w-64 rounded-xl border border-gray-700 bg-surface-800 shadow-xl p-3 space-y-2">
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

      {/* ── Eliminated Banner ── */}
      {isEliminated && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-center">
          <p className="text-lg font-semibold text-red-400">
            You were eliminated in Gameweek {myStatus?.participant.eliminatedWeek}
          </p>
          <p className="text-sm text-gray-400 mt-1">You can still view picks after each gameweek locks</p>
        </div>
      )}
      {isWinner && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-center">
          <p className="text-2xl font-bold text-green-400">🏆 Congratulations! You won!</p>
        </div>
      )}

      {/* ── Not joined notice ── */}
      {!isParticipant && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 text-center">
          {comp.status === 'UPCOMING' ? (
            <p className="text-sm text-yellow-300">
              You haven't joined this competition yet.{' '}
              <Link to="/competitions" className="underline hover:text-yellow-200">
                Go back to join →
              </Link>
            </p>
          ) : (
            <p className="text-sm text-yellow-300">
              This competition has already started — you can view fixtures and results but cannot make picks.
            </p>
          )}
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
          <p className="text-gray-400">No fixtures available yet</p>
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
                  className="w-full flex items-center justify-between text-left group"
                  aria-expanded={!isCollapsed}
                  aria-controls={`gw-${wn}-fixtures`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
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
                    {/* Show pick summary in header when collapsed */}
                    {isCollapsed && myPickForGw && (
                      <span className="text-xs sm:text-sm text-gray-400 truncate">
                        — <span className={clsx('font-semibold', {
                          'text-green-400': myPickForGw.outcome === 'ADVANCE',
                          'text-red-400': myPickForGw.outcome === 'ELIMINATED',
                          'text-yellow-400': myPickForGw.outcome === 'POSTPONED_ADVANCE',
                          'text-brand-400': myPickForGw.outcome === 'PENDING',
                        })}>
                          {myPickForGw.teamShortName}
                        </span>
                        {myPickForGw.outcome !== 'PENDING' && (
                          <span className="ml-1 hidden sm:inline"><OutcomeBadge outcome={myPickForGw.outcome} /></span>
                        )}
                      </span>
                    )}
                    {isCollapsed && !myPickForGw && isParticipant && !isEliminated && !isWinner && !isLocked && (
                      <span className="text-xs text-yellow-400 italic hidden sm:inline">— no pick yet</span>
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
            <div id="pick-history" className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700 text-gray-400 text-left">
                    <th className="py-3 px-4">GW</th>
                    <th className="py-3 px-4">Team</th>
                    <th className="py-3 px-4">Source</th>
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
                        {pick.source === 'AUTO' ? <span className="badge-yellow">Auto</span> : <span className="badge-gray">User</span>}
                      </td>
                      <td className="py-3 px-4">
                        <OutcomeBadge outcome={pick.outcome} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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

