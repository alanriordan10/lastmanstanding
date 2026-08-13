import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import api from '../api';
import type { Competition } from '../types';
import SeoMeta from '../components/SeoMeta';

interface SurvivorRow {
  participantId: number;
  userId: number;
  username: string;
  entryNumber: number;
  status: 'ACTIVE' | 'ELIMINATED' | 'WINNER';
  eliminatedWeek: number | null;
  lifelineUsed: boolean;
  lifelineUsedWeek: number | null;
  picks: Record<number, { teamShortName: string; outcome: string; source: string; useLifeline?: boolean } | null>;
}

interface GameweekMeta {
  id: number;
  weekNumber: number;
  status: string;
  voided?: boolean;
  voidReason?: string | null;
}

const PAGE_SIZE = 25;
const isGameweekRevealed = (status?: string | null) => String(status ?? '').toUpperCase() !== 'UPCOMING';
const isResolvedOutcome = (outcome?: string | null) => {
  const normalized = String(outcome ?? '').toUpperCase();
  return normalized !== '' && normalized !== 'PENDING';
};

export default function SurvivorTablePage() {
  const { id } = useParams<{ id: string }>();
  const compId = Number(id);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'ELIMINATED' | 'WINNER'>('ALL');
  const [eliminatedWeekFilter, setEliminatedWeekFilter] = useState<'ALL' | number>('ALL');
  const [page, setPage] = useState(1);
  const [mobileMode, setMobileMode] = useState<'table' | 'compact'>('table');
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const { data: comp } = useQuery<Competition>({
    queryKey: ['competition', compId],
    queryFn: () => api.get(`/competitions/${compId}`).then((r) => r.data),
    staleTime: (query) => (query.state.data as Competition | undefined)?.status === 'COMPLETED' ? Infinity : 30_000,
  });

  const { data: tableData, isLoading } = useQuery<{ gameweeks: GameweekMeta[]; rows: SurvivorRow[] }>({
    queryKey: ['survivor-table', compId],
    queryFn: () => api.get(`/competitions/${compId}/survivor-table`).then((r) => r.data),
    staleTime: comp?.status === 'COMPLETED' ? Infinity : 30_000,
    refetchInterval: (query) => {
      if (comp?.status === 'COMPLETED') return false;
      const data = query.state.data as { gameweeks: GameweekMeta[]; rows: SurvivorRow[] } | undefined;
      const hasLiveWeek = data?.gameweeks?.some((gw) => gw.status === 'IN_PROGRESS');
      return hasLiveWeek ? 300_000 : false;
    },
  });

  const gameweeks = tableData?.gameweeks ?? [];
  const rows = tableData?.rows ?? [];
  const userEntryCounts = useMemo(() => {
    const counts = new Map<number, number>();
    rows.forEach((r) => counts.set(r.userId, (counts.get(r.userId) ?? 0) + 1));
    return counts;
  }, [rows]);
  const displayName = (row: SurvivorRow) =>
    (userEntryCounts.get(row.userId) ?? 0) > 1
      ? `${row.username} • Entry #${row.entryNumber ?? 1}`
      : row.username;
  const eliminatedWeeks = useMemo(
    () => Array.from(new Set(rows.map((r) => r.eliminatedWeek).filter((w): w is number => w != null))).sort((a, b) => a - b),
    [rows],
  );

  const filtered = useMemo(() => rows.filter((r) => {
    const identity = displayName(r);
    const matchSearch = !search || identity.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'ALL' || r.status === statusFilter;
    const matchEliminatedWeek = eliminatedWeekFilter === 'ALL' || r.eliminatedWeek === eliminatedWeekFilter;
    return matchSearch && matchStatus && matchEliminatedWeek;
  }), [rows, search, statusFilter, eliminatedWeekFilter, userEntryCounts]);

  const counts = {
    ALL: rows.length,
    ACTIVE: rows.filter((r) => r.status === 'ACTIVE').length,
    ELIMINATED: rows.filter((r) => r.status === 'ELIMINATED').length,
    WINNER: rows.filter((r) => r.status === 'WINNER').length,
  };

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const rank = (r: SurvivorRow) => {
      return r.status === 'WINNER' ? 0 : r.status === 'ACTIVE' ? 1 : 2;
    };
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (a.status === 'ELIMINATED' && b.status === 'ELIMINATED') {
      return (b.eliminatedWeek ?? 0) - (a.eliminatedWeek ?? 0);
    }
    if (a.username !== b.username) return a.username.localeCompare(b.username);
    return (a.entryNumber ?? 1) - (b.entryNumber ?? 1);
  }), [filtered]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const clubAccent = comp?.clubPrimaryColor ?? null;
  const clubSupport = comp?.clubSecondaryColor ?? comp?.clubPrimaryColor ?? null;

  const handleSearch = (v: string) => { setSearch(v); setPage(1); };
  const handleStatusFilter = (s: typeof statusFilter) => { setStatusFilter(s); setPage(1); };
  const handleEliminatedWeekFilter = (week: 'ALL' | number) => { setEliminatedWeekFilter(week); setPage(1); };
  const toggleExpanded = (participantId: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(participantId)) next.delete(participantId);
      else next.add(participantId);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <SeoMeta
        title={`${comp?.name ? `${comp.name} Survivor Table` : 'Survivor Table'} | Last Man Standing`}
        description="View the current survivor table, active entries, eliminations, and pick history for this competition."
        canonicalPath={`/competitions/${compId}/survivor-table`}
        noindex
      />
      {/* Header */}
      <div
        className="relative overflow-hidden rounded-[1.75rem] border border-white/8 px-4 py-5 shadow-[0_28px_70px_rgba(2,6,23,0.42)] sm:px-6 sm:py-6"
        style={{
          background: clubAccent
            ? `radial-gradient(circle at top left, ${clubAccent}2e, transparent 24rem), radial-gradient(circle at 88% 18%, ${clubSupport ?? clubAccent}20, transparent 16rem), linear-gradient(135deg,rgba(15,23,42,0.96),rgba(8,15,30,0.94))`
            : 'radial-gradient(circle at top left, rgba(56,189,248,0.18), transparent 24rem), linear-gradient(135deg, rgba(15,23,42,0.96), rgba(8,15,30,0.94))',
          ...(clubAccent ? { borderTopColor: clubAccent, borderTopWidth: '3px' } : {}),
        }}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link to={`/competitions/${compId}`} className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-brand-200/85 hover:text-white">
              <span>←</span> Competition
            </Link>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-white">Survivor Table</h1>
            {comp && <p className="mt-2 text-sm text-gray-300">{comp.name}</p>}
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <ResultHeroStat label="Active" value={String(counts.ACTIVE)} accent="text-green-300" />
            <ResultHeroStat label="Out" value={String(counts.ELIMINATED)} accent="text-red-300" />
            <ResultHeroStat label="Winner" value={String(counts.WINNER)} accent="text-yellow-300" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search participant…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="input-field w-full pl-8 pr-8 text-sm"
          />
          {search && (
            <button onClick={() => handleSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-lg leading-none">×</button>
          )}
        </div>
        <div className="inline-flex flex-wrap gap-1 rounded-2xl border border-white/8 bg-black/10 p-1">
          {(['ALL', 'ACTIVE', 'ELIMINATED', 'WINNER'] as const).map((s) => (
            <button
              key={s}
              onClick={() => handleStatusFilter(s)}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                statusFilter === s ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
              style={statusFilter === s && clubAccent ? { backgroundColor: clubAccent } : undefined}
            >
              {s} ({counts[s]})
            </button>
          ))}
        </div>
        <div className="w-full sm:w-auto sm:min-w-[180px]">
          <select
            value={eliminatedWeekFilter === 'ALL' ? 'ALL' : String(eliminatedWeekFilter)}
            onChange={(e) => {
              const val = e.target.value;
              handleEliminatedWeekFilter(val === 'ALL' ? 'ALL' : Number(val));
            }}
            className="input-field w-full text-sm"
          >
            <option value="ALL">Eliminated: All weeks</option>
            {eliminatedWeeks.map((week) => (
              <option key={week} value={String(week)}>Eliminated: GW{week}</option>
            ))}
          </select>
        </div>
        <div className="inline-flex rounded-lg bg-surface-700 p-1 sm:hidden">
          <button
            onClick={() => setMobileMode('compact')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              mobileMode === 'compact' ? 'bg-brand-600 text-white' : 'text-gray-400'
            }`}
          >
            📱 Compact
          </button>
          <button
            onClick={() => setMobileMode('table')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              mobileMode === 'table' ? 'bg-brand-600 text-white' : 'text-gray-400'
            }`}
          >
            📊 Table
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        </div>
      ) : !gameweeks.length ? (
        <div className="card text-center py-16">
          <p className="text-gray-400">No data available yet</p>
        </div>
      ) : (
        <>
          {/* Results info */}
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>
              {sorted.length === rows.length
                ? `${rows.length} participant${rows.length !== 1 ? 's' : ''}`
                : `${sorted.length} of ${rows.length} participants`}
              {totalPages > 1 && ` — page ${currentPage} of ${totalPages}`}
            </span>
            {(search || statusFilter !== 'ALL' || eliminatedWeekFilter !== 'ALL') && (
              <button
                onClick={() => { handleSearch(''); handleStatusFilter('ALL'); handleEliminatedWeekFilter('ALL'); }}
                className="text-brand-400 hover:text-brand-300 underline"
                style={clubAccent ? { color: clubAccent } : undefined}
              >
                Clear filters
              </button>
            )}
          </div>

          {mobileMode === 'compact' && (
            <div className="sm:hidden space-y-2">
              {paginated.length === 0 ? (
                <div className="card py-8 text-center text-gray-400">No participants found</div>
              ) : paginated.map((row) => {
                const isOpen = expandedRows.has(row.participantId);
                const latestVisiblePick = [...gameweeks]
                  .reverse()
                  .map((gw) => ({ gw, pick: row.picks[gw.weekNumber] }))
                  .find((item) => isGameweekRevealed(item.gw.status) && item.pick != null);
                const latestResolvedPick = [...gameweeks]
                  .reverse()
                  .map((gw) => ({ gw, pick: row.picks[gw.weekNumber] }))
                  .find((item) => isGameweekRevealed(item.gw.status) && item.pick != null && isResolvedOutcome(item.pick.outcome));
                return (
                  <div key={row.participantId} className="rounded-xl border border-white/10 bg-white/[0.03]">
                    <button
                      type="button"
                      onClick={() => toggleExpanded(row.participantId)}
                      className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-100 truncate">{displayName(row)}</p>
                        <p className="text-xs text-gray-400">
                          {row.status}
                          {row.status === 'ELIMINATED' && row.eliminatedWeek ? ` · GW${row.eliminatedWeek}` : ''}
                          {latestVisiblePick?.pick ? ` · ${latestVisiblePick.pick.teamShortName}` : ''}
                        </p>
                      </div>
                      <span className="text-gray-500 text-xs">{isOpen ? '▲' : '▼'}</span>
                    </button>
                    {isOpen && (
                      <div className="border-t border-white/10 px-3 py-2 text-xs text-gray-300 space-y-1.5">
                        {comp?.lifelineEnabled && (
                          <p>
                            Lifeline:
                            <span className={row.lifelineUsed ? 'text-amber-300 ml-1' : 'text-emerald-300 ml-1'}>
                              {row.lifelineUsed ? `Used${row.lifelineUsedWeek ? ` · GW${row.lifelineUsedWeek}` : ''}` : 'Available'}
                            </span>
                          </p>
                        )}
                        <p>Last resolved pick: <span className="text-gray-100">{latestResolvedPick?.pick ? `${latestResolvedPick.pick.teamShortName} (${latestResolvedPick.pick.outcome})` : '—'}</span></p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div
            className={`overflow-x-auto rounded-2xl border border-white/8 bg-white/[0.03] max-h-[70vh] shadow-[0_20px_50px_rgba(2,6,23,0.34)] ${mobileMode === 'compact' ? 'hidden sm:block' : ''}`}
            style={clubAccent ? { borderColor: `${clubAccent}2f` } : undefined}
          >
            <table className="w-full text-sm min-w-max">
              <thead className="sticky top-0 z-20">
                <tr
                  className="border-b border-gray-700/50 bg-surface-800"
                  style={clubAccent ? { boxShadow: `inset 0 -1px 0 ${clubAccent}22` } : undefined}
                >
                  <th
                    className="text-left py-3 px-4 font-semibold text-gray-300 sticky left-0 bg-surface-800/95 z-10 min-w-[140px]"
                    style={clubAccent ? { borderLeft: `3px solid ${clubAccent}` } : undefined}
                  >
                    Participant
                  </th>
                  {gameweeks.map((gw) => (
                    <th key={gw.id} className="py-3 px-3 font-semibold text-gray-300 text-center min-w-[80px]">
                      <div>GW{gw.weekNumber}</div>
                      <div className={`text-[10px] font-normal mt-0.5 ${
                        gw.status === 'VOIDED' ? 'text-brand-400' :
                        gw.status === 'COMPLETED' ? 'text-green-500' :
                        gw.status === 'IN_PROGRESS' ? 'text-yellow-400' :
                        gw.status === 'LOCKED' ? 'text-blue-400' : 'text-gray-500'
                      }`}>{gw.status}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/30">
                {paginated.length === 0 ? (
                  <tr>
                    <td colSpan={gameweeks.length + 1} className="py-12 text-center text-gray-400">
                      No participants found
                    </td>
                  </tr>
                ) : paginated.map((row) => {
                    return (
                  <tr
                    key={row.participantId}
                    className={`transition-colors ${
                      row.status === 'WINNER' ? 'bg-yellow-600/10 hover:bg-yellow-600/15' :
                      row.status === 'ACTIVE' ? 'hover:bg-surface-700/40' :
                      'opacity-60 hover:opacity-80 hover:bg-surface-700/30'
                    }`}
                  >
                    <td className="py-3 px-4 sticky left-0 bg-surface-900/95 z-10">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-200 truncate max-w-[130px]">{displayName(row)}</span>
                        {row.status === 'WINNER' && <span className="text-sm shrink-0">🏆</span>}
                        {row.status === 'ELIMINATED' && (
                          <span className="text-[10px] text-red-400 shrink-0">GW{row.eliminatedWeek}</span>
                        )}
                      </div>
                      {comp?.lifelineEnabled && (
                        <div className="mt-1">
                          {row.lifelineUsed ? (
                            <span className="inline-flex items-center rounded-full border border-amber-400/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-200">
                              Lifeline used{row.lifelineUsedWeek ? ` · GW${row.lifelineUsedWeek}` : ''}
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-medium text-emerald-200">
                              Lifeline available
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    {gameweeks.map((gw) => {
                      const pick = row.picks[gw.weekNumber];
                      // Hide selections for upcoming gameweeks — don't reveal other players' picks
                      if (gw.status === 'UPCOMING') {
                        return (
                          <td key={gw.id} className="py-3 px-3 text-center">
                            <span className="text-gray-500 text-sm" title="Picks hidden until gameweek locks">🔒</span>
                          </td>
                        );
                      }
                      if (!pick) {
                        if (gw.status === 'VOIDED') {
                          return <td key={gw.id} className="py-3 px-3 text-center"><span className="text-brand-300 text-xs font-semibold">void</span></td>;
                        }
                        const eliminatedBefore = row.eliminatedWeek !== null && gw.weekNumber > row.eliminatedWeek;
                        return (
                          <td key={gw.id} className="py-3 px-3 text-center">
                            {eliminatedBefore ? (
                              <span className="text-gray-700 text-base">—</span>
                            ) : (
                              <span className="text-gray-500 text-xs italic">no pick</span>
                            )}
                          </td>
                        );
                      }
                      return (
                        <td key={gw.id} className="py-3 px-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded ${cellClass(pick.outcome)}`}>
                              {pick.teamShortName}
                            </span>
                            {pick.outcome !== 'PENDING' && (
                              <>
                                <span className={`inline-flex sm:hidden items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
                                  pick.outcome === 'ADVANCE'
                                    ? 'bg-green-600/15 text-green-300'
                                    : pick.outcome === 'ELIMINATED'
                                    ? 'bg-red-600/15 text-red-300'
                                    : 'bg-yellow-600/15 text-yellow-300'
                                }`}>
                                  {pick.outcome === 'ADVANCE'
                                    ? '✓'
                                    : pick.outcome === 'ELIMINATED'
                                    ? '✕'
                                    : '↷'}
                                </span>
                                <span className={`hidden sm:inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[9px] font-medium leading-none ${
                                  pick.outcome === 'ADVANCE'
                                    ? 'bg-green-600/15 text-green-300'
                                    : pick.outcome === 'ELIMINATED'
                                    ? 'bg-red-600/15 text-red-300'
                                    : 'bg-yellow-600/15 text-yellow-300'
                                }`}>
                                  {pick.outcome === 'ADVANCE'
                                    ? 'Advanced'
                                    : pick.outcome === 'ELIMINATED'
                                    ? 'Out'
                                    : 'Postponed'}
                                </span>
                              </>
                            )}
                            {pick.source === 'AUTO' && (
                              <span className="inline-flex items-center justify-center rounded-full bg-surface-700 px-2 py-0.5 text-[9px] text-gray-400 italic leading-none">auto</span>
                            )}
                            {pick.useLifeline && (
                              <span className="inline-flex items-center justify-center rounded-full bg-cyan-500/20 px-2 py-0.5 text-[9px] text-cyan-200 leading-none">lifeline</span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <p className="text-sm text-gray-400">
                Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, sorted.length)} of {sorted.length}
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(1)} disabled={currentPage === 1}
                  className="px-2 py-1 text-xs rounded bg-surface-700 hover:bg-surface-600 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed">«</button>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                  className="px-3 py-1 text-xs rounded bg-surface-700 hover:bg-surface-600 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed">← Prev</button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                  .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                    if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('...');
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, idx) => p === '...'
                    ? <span key={`e${idx}`} className="px-2 text-xs text-gray-500">…</span>
                    : <button key={p} onClick={() => setPage(p as number)}
                        className={`px-2.5 py-1 text-xs rounded transition ${currentPage === p ? 'bg-brand-600 text-white font-medium' : 'bg-surface-700 hover:bg-surface-600 text-gray-300'}`}
                        style={currentPage === p && clubAccent ? { backgroundColor: clubAccent } : undefined}>{p}</button>
                  )}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                  className="px-3 py-1 text-xs rounded bg-surface-700 hover:bg-surface-600 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed">Next →</button>
                <button onClick={() => setPage(totalPages)} disabled={currentPage === totalPages}
                  className="px-2 py-1 text-xs rounded bg-surface-700 hover:bg-surface-600 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed">»</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-flex items-center justify-center rounded-full bg-green-600/15 px-2 py-1 text-[10px] font-medium leading-none text-green-300">Advanced</span>
          Advanced
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-flex items-center justify-center rounded-full bg-red-600/15 px-2 py-1 text-[10px] font-medium leading-none text-red-300">Out</span>
          Eliminated
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-flex items-center justify-center rounded-full bg-yellow-600/15 px-2 py-1 text-[10px] font-medium leading-none text-yellow-300">Postponed</span>
          Postponed / Bye
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-6 h-5 rounded bg-gray-600/20 text-gray-400 text-center leading-5 font-semibold text-[10px]">LIV</span>
          Pending
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-gray-500 text-sm">🔒</span>
          Picks hidden (not yet locked)
        </span>
      </div>
    </div>
  );
}

function ResultHeroStat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.045] px-3 py-2 text-center backdrop-blur-sm">
      <div className={`text-lg font-black ${accent}`}>{value}</div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">{label}</div>
    </div>
  );
}

function cellClass(outcome: string): string {
  switch (outcome) {
    case 'ADVANCE': return 'bg-green-600/25 text-green-300';
    case 'ELIMINATED': return 'bg-red-600/25 text-red-300';
    case 'POSTPONED_ADVANCE': return 'bg-yellow-600/25 text-yellow-300';
    case 'PENDING': return 'bg-surface-700 text-gray-400';
    default: return 'bg-surface-700 text-gray-400';
  }
}

function outcomeIcon(outcome: string): string {
  switch (outcome) {
    case 'ADVANCE': return '✓';
    case 'ELIMINATED': return '✗';
    case 'POSTPONED_ADVANCE': return '↷';
    default: return '';
  }
}
