import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useMemo } from 'react';
import api from '../api';
import type { GameweekSelection, GameweekSelectionsData, GameweekResponse } from '../types';
import clsx from 'clsx';

export default function GameweekSelectionsPage() {
  const { id, gwId } = useParams<{ id: string; gwId: string }>();
  const compId = Number(id);
  const gameweekId = Number(gwId);
  
  // ALL HOOKS MUST BE DECLARED BEFORE ANY EARLY RETURNS
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'byteam'>('table');
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'RESOLVED' | 'LIVE'>('ALL');
  const itemsPerPage = 50;

  const { data: selectionsData, isLoading, error } = useQuery<GameweekSelectionsData>({
    queryKey: ['selections', compId, gameweekId],
    queryFn: () =>
      api.get(`/competitions/${compId}/gameweeks/${gameweekId}/selections`).then((r) => {
        if (Array.isArray(r.data)) {
          return { selections: r.data, byeGranted: false, weekNumber: 0 };
        }
        return r.data;
      }),
    retry: false,
    // Poll every 5 minutes only if at least one pick is still pending (game in play).
    // Once all picks are resolved there is nothing left to update.
    refetchInterval: (query) => {
      const data = query.state.data as GameweekSelectionsData | undefined;
      const hasInPlay = data?.selections?.some((s) => s.outcome === 'PENDING');
      return hasInPlay ? 5 * 60 * 1000 : false;
    },
  });

  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['selections', compId, gameweekId] });
    setRefreshing(false);
  };
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, viewMode]);

  const selections = selectionsData?.selections || [];
  const byeGranted = selectionsData?.byeGranted || false;
  const userEntryCounts = useMemo(() => {
    const entriesByUser = new Map<number, Set<string>>();
    selections.forEach((s) => {
      const entries = entriesByUser.get(s.userId) ?? new Set<string>();
      entries.add(s.participantId != null ? `participant:${s.participantId}` : `entry:${s.entryNumber ?? 1}`);
      entriesByUser.set(s.userId, entries);
    });
    return new Map(Array.from(entriesByUser.entries()).map(([userId, entries]) => [userId, entries.size]));
  }, [selections]);
  const displayName = (s: GameweekSelection) =>
    (userEntryCounts.get(s.userId) ?? 0) > 1
      ? `${s.username} • Entry #${s.entryNumber ?? 1}`
      : s.username;

  // NOW we can do early returns AFTER all hooks
  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="rounded-[1.75rem] border border-white/8 bg-surface-800/50 px-4 py-5 sm:px-6 sm:py-6">
          <div className="h-3 w-24 rounded bg-surface-700" />
          <div className="mt-3 h-8 w-60 rounded bg-surface-700" />
          <div className="mt-3 h-4 w-40 rounded bg-surface-700" />
        </div>
        <div className="card p-4">
          <div className="h-5 w-44 rounded bg-surface-700" />
          <div className="mt-4 grid gap-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="h-12 rounded bg-surface-700/80" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    const errMsg = (error as any)?.response?.data?.message || 'Cannot view selections yet';
    return (
      <div className="space-y-4">
        <Link to={`/competitions/${compId}`} className="text-sm text-gray-400 hover:text-white">
          ← Back to competition
        </Link>
        <div className="card py-16 text-center">
          <div className="text-4xl mb-3">🔒</div>
          <p className="text-lg font-medium text-yellow-400">{errMsg}</p>
          <p className="mt-2 text-gray-400">
            Selections become visible after the gameweek locks
          </p>
        </div>
      </div>
    );
  }

  // All data processing AFTER early returns (regular JavaScript, not hooks)
  const pendingCount  = selections.filter((s) => s.outcome === 'PENDING').length;
  const resolvedCount = selections.filter((s) => s.outcome !== 'PENDING').length;
  const isLive = pendingCount > 0 && resolvedCount > 0;

  // Filter with search
  let filteredSelections = selections;
  if (statusFilter === 'RESOLVED') {
    filteredSelections = filteredSelections.filter((s) => s.outcome !== 'PENDING');
  } else if (statusFilter === 'LIVE') {
    filteredSelections = filteredSelections.filter((s) => s.outcome === 'PENDING');
  }
  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase();
    filteredSelections = filteredSelections.filter(s => 
      displayName(s).toLowerCase().includes(query) ||
      s.teamName.toLowerCase().includes(query) ||
      s.teamShortName.toLowerCase().includes(query)
    );
  }

  // Pagination for table view
  const totalPages = Math.ceil(filteredSelections.length / itemsPerPage);
  const start = (currentPage - 1) * itemsPerPage;
  const paginatedSelections = filteredSelections.slice(start, start + itemsPerPage);

  // Group by team
  const byTeam = new Map<string, GameweekSelection[]>();
  filteredSelections.forEach((s) => {
    const key = `${s.teamId}-${s.teamShortName}`;
    const arr = byTeam.get(key) ?? [];
    arr.push(s);
    byTeam.set(key, arr);
  });

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-[1.75rem] border border-white/8 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.18),transparent_24rem),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(8,15,30,0.94))] px-4 py-5 shadow-[0_28px_70px_rgba(2,6,23,0.42)] sm:px-6 sm:py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link to={`/competitions/${compId}`} className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-brand-200/85 hover:text-white">
              <span>←</span> Competition
            </Link>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-white">Gameweek Selections</h1>
            <p className="mt-2 text-sm text-gray-300">{selections.length} picks revealed</p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <MiniStat label="Picks" value={String(selections.length)} accent="text-white" isActive={statusFilter === 'ALL'} onClick={() => setStatusFilter('ALL')} />
            <MiniStat label="Resolved" value={String(resolvedCount)} accent="text-green-300" isActive={statusFilter === 'RESOLVED'} onClick={() => setStatusFilter('RESOLVED')} />
            <MiniStat label="Live" value={String(pendingCount)} accent="text-yellow-300" isActive={statusFilter === 'LIVE'} onClick={() => setStatusFilter('LIVE')} />
          </div>
        </div>
      </div>

      {/* Live results banner */}
      {isLive && (
        <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="inline-block h-2 w-2 rounded-full bg-green-400 animate-pulse shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-green-400">Gameweek in progress — live results</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {resolvedCount} of {selections.length} picks resolved · {pendingCount} still playing · auto-refreshes every 5 mins
              </p>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="shrink-0 text-xs px-3 py-1.5 rounded-lg bg-green-500/20 hover:bg-green-500/30 text-green-400 transition disabled:opacity-50"
          >
            {refreshing ? '⏳' : '🔄 Refresh'}
          </button>
        </div>
      )}

      {/* Bye Granted Banner */}
      {byeGranted && (
        <div className="card bg-yellow-600/10 border-yellow-600/30">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🎁</span>
            <div>
              <h3 className="font-semibold text-yellow-400">All Participants Granted Bye</h3>
              <p className="text-sm text-gray-300 mt-1">
                All remaining participants would have been eliminated in this gameweek. Everyone was granted 
                a <strong>bye</strong> and advanced to the next gameweek.
              </p>
            </div>
          </div>
        </div>
      )}

      {selections.length === 0 ? (
        <div className="card py-12 text-center">
          <p className="text-gray-400">No picks for this gameweek</p>
        </div>
      ) : (
        <>
          {/* Search and view controls (show only if many participants) */}
          {selections.length > 20 && (
            <div className="card">
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <input
                  type="text"
                  placeholder="Search by participant or team..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input-field w-full sm:w-auto sm:flex-1 sm:max-w-xs text-sm"
                />

                <div className="inline-flex rounded-2xl border border-white/8 bg-black/10 p-1">
                  <button
                    onClick={() => setViewMode('table')}
                    className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                      viewMode === 'table' ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    📊 Table
                  </button>
                  <button
                    onClick={() => setViewMode('byteam')}
                    className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                      viewMode === 'byteam' ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    👥 By Team
                  </button>
                </div>
              </div>

              {searchQuery && (
                <div className="text-sm text-gray-400 mt-2">
                  Showing {filteredSelections.length} of {selections.length} participants
                </div>
              )}
              {statusFilter !== 'ALL' && !searchQuery && (
                <div className="text-sm text-gray-400 mt-2">
                  Showing {filteredSelections.length} {statusFilter === 'LIVE' ? 'live' : 'resolved'} pick{filteredSelections.length !== 1 ? 's' : ''}
                </div>
              )}
            </div>
          )}

          {/* Table view */}
          {viewMode === 'table' && (
            <div className="card overflow-hidden">
              {filteredSelections.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-400">No participants found{searchQuery ? ` matching "${searchQuery}"` : ''}</p>
                </div>
              ) : (
                <>
                  {/* ── Mobile: card list ── */}
                  <div className="divide-y divide-gray-700/50 sm:hidden">
                    {paginatedSelections.sort((a, b) => displayName(a).localeCompare(displayName(b))).map((s) => (
                      <div key={`${s.participantId ?? s.userId}-${s.teamId}`} className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{displayName(s)}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{s.teamName}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {s.source === 'AUTO' && <span className="badge-yellow text-xs">Auto</span>}
                          {s.useLifeline && <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-200">Lifeline</span>}
                          <OutcomeBadge outcome={s.outcome} />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* ── Desktop: table ── */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-700 text-left text-gray-400">
                          <th className="py-3 px-4">Player</th>
                          <th className="py-3 px-4">Team Picked</th>
                          <th className="py-3 px-4">Pick Type</th>
                          <th className="py-3 px-4">Outcome</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedSelections.sort((a, b) => displayName(a).localeCompare(displayName(b))).map((s) => (
                          <tr key={`${s.participantId ?? s.userId}-${s.teamId}`} className="border-b border-gray-700/50 hover:bg-surface-700/30">
                            <td className="py-3 px-4 font-medium">{displayName(s)}</td>
                            <td className="py-3 px-4">
                              <span className="font-semibold">{s.teamShortName}</span>
                              <span className="text-gray-400 ml-2 text-xs">{s.teamName}</span>
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                {s.source === 'AUTO'
                                  ? <span className="badge-yellow text-xs">Auto</span>
                                  : <span className="badge-gray text-xs">Self</span>}
                                {s.useLifeline ? <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-200">Lifeline</span> : null}
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <OutcomeBadge outcome={s.outcome} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {totalPages > 1 && (
                    <div className="border-t border-gray-700 px-4 py-3">
                      <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        onPageChange={setCurrentPage}
                        totalItems={filteredSelections.length}
                        itemsPerPage={itemsPerPage}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Grouped by team view */}
          {viewMode === 'byteam' && (
            <div className="card space-y-3">
              <h2 className="text-lg font-semibold">Picks by Team</h2>
              {byTeam.size === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-400">No participants found</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {Array.from(byTeam.entries())
                    .sort(([, a], [, b]) => b.length - a.length)
                    .map(([key, picks]) => (
                      <div key={key} className="bg-surface-700/50 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="font-semibold text-gray-200">{picks[0].teamShortName}</h3>
                          <span className="text-sm text-gray-400">{picks.length} pick{picks.length !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {picks.map((p) => (
                            <span
                              key={`${p.participantId ?? p.userId}-${p.teamId}`}
                              className={`text-xs px-2.5 py-1 rounded font-medium ${
                                p.outcome === 'ADVANCE' || p.outcome === 'POSTPONED_ADVANCE'
                                  ? 'bg-green-600/20 text-green-400'
                                  : p.outcome === 'ELIMINATED'
                                  ? 'bg-red-600/20 text-red-400'
                                  : 'bg-yellow-600/20 text-yellow-400'
                              }`}
                            >
                              {displayName(p)}
                              {p.source === 'AUTO' && ' (auto)'}
                              {p.useLifeline && ' (lifeline)'}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MiniStat({
  label,
  value,
  accent,
  isActive = false,
  onClick,
}: {
  label: string;
  value: string;
  accent: string;
  isActive?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'rounded-2xl border px-3 py-2 text-center backdrop-blur-sm transition-all',
        onClick ? 'hover:border-white/20 hover:bg-white/[0.07]' : 'cursor-default',
        isActive ? 'border-white/20 bg-white/[0.09] shadow-[0_0_0_1px_rgba(255,255,255,0.05)]' : 'border-white/8 bg-white/[0.045]',
      )}
      aria-pressed={onClick ? isActive : undefined}
    >
      <div className={`text-lg font-black ${accent}`}>{value}</div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">{label}</div>
    </button>
  );
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  switch (outcome) {
    case 'ADVANCE':
      return (
        <span className="badge-green text-xs whitespace-nowrap">
          <span className="sm:hidden">✓</span>
          <span className="hidden sm:inline">✓ Win</span>
        </span>
      );
    case 'ELIMINATED':
      return (
        <span className="badge-red text-xs whitespace-nowrap">
          <span className="sm:hidden">✕</span>
          <span className="hidden sm:inline">✕ Out</span>
        </span>
      );
    case 'POSTPONED_ADVANCE':
      return (
        <span className="badge-yellow text-xs whitespace-nowrap">
          <span className="sm:hidden">↷</span>
          <span className="hidden sm:inline">PP</span>
        </span>
      );
    case 'PENDING':
      return (
        <span className="badge-gray text-xs whitespace-nowrap">
          <span className="sm:hidden">…</span>
          <span className="hidden sm:inline">⏳ Playing</span>
        </span>
      );
    default:
      return <span className="badge-gray text-xs">{outcome}</span>;
  }
}

function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  itemsPerPage,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems: number;
  itemsPerPage: number;
}) {
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 7;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('...');
      
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      
      for (let i = start; i <= end; i++) {
        if (i !== 1 && i !== totalPages) pages.push(i);
      }
      
      if (currentPage < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }

    return pages;
  };

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
      <div className="text-sm text-gray-400">
        Showing {startItem}-{endItem} of {totalItems}
      </div>
      
      <div className="flex items-center gap-2 sm:hidden">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="px-3 py-1 text-sm rounded bg-surface-700 hover:bg-surface-600 text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          ← Prev
        </button>
        <span className="text-sm text-gray-400">
          {currentPage} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="px-3 py-1 text-sm rounded bg-surface-700 hover:bg-surface-600 text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          Next →
        </button>
      </div>

      <div className="hidden sm:flex items-center gap-2">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="px-3 py-1 text-sm rounded bg-surface-700 hover:bg-surface-600 text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          ← Prev
        </button>

        <div className="flex gap-1">
          {getPageNumbers().map((page, idx) => (
            typeof page === 'number' ? (
              <button
                key={idx}
                onClick={() => onPageChange(page)}
                className={`px-3 py-1 text-sm rounded transition ${
                  currentPage === page
                    ? 'bg-brand-600 text-white font-medium'
                    : 'bg-surface-700 hover:bg-surface-600 text-gray-300'
                }`}
              >
                {page}
              </button>
            ) : (
              <span key={idx} className="px-2 py-1 text-gray-500">
                {page}
              </span>
            )
          ))}
        </div>

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="px-3 py-1 text-sm rounded bg-surface-700 hover:bg-surface-600 text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
