import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import api from '../api';
import type { Competition } from '../types';

interface SurvivorRow {
  userId: number;
  username: string;
  status: 'ACTIVE' | 'ELIMINATED' | 'WINNER';
  eliminatedWeek: number | null;
  picks: Record<number, { teamShortName: string; outcome: string; source: string } | null>;
}

interface GameweekMeta {
  id: number;
  weekNumber: number;
  status: string;
}

const PAGE_SIZE = 25;

export default function SurvivorTablePage() {
  const { id } = useParams<{ id: string }>();
  const compId = Number(id);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'ELIMINATED' | 'WINNER'>('ALL');
  const [page, setPage] = useState(1);

  const { data: comp } = useQuery<Competition>({
    queryKey: ['competition', compId],
    queryFn: () => api.get(`/competitions/${compId}`).then((r) => r.data),
    staleTime: 30_000,
  });

  const { data: tableData, isLoading } = useQuery<{ gameweeks: GameweekMeta[]; rows: SurvivorRow[] }>({
    queryKey: ['survivor-table', compId],
    queryFn: () => api.get(`/competitions/${compId}/survivor-table`).then((r) => r.data),
    staleTime: 30_000,
    refetchInterval: 300_000,
  });

  const gameweeks = tableData?.gameweeks ?? [];
  const rows = tableData?.rows ?? [];

  const filtered = useMemo(() => rows.filter((r) => {
    const matchSearch = !search || r.username.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'ALL' || r.status === statusFilter;
    return matchSearch && matchStatus;
  }), [rows, search, statusFilter]);

  const counts = {
    ALL: rows.length,
    ACTIVE: rows.filter((r) => r.status === 'ACTIVE').length,
    ELIMINATED: rows.filter((r) => r.status === 'ELIMINATED').length,
    WINNER: rows.filter((r) => r.status === 'WINNER').length,
  };

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const rank = (r: SurvivorRow) => r.status === 'WINNER' ? 0 : r.status === 'ACTIVE' ? 1 : 2;
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (a.status === 'ELIMINATED' && b.status === 'ELIMINATED') {
      return (b.eliminatedWeek ?? 0) - (a.eliminatedWeek ?? 0);
    }
    return a.username.localeCompare(b.username);
  }), [filtered]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleSearch = (v: string) => { setSearch(v); setPage(1); };
  const handleStatusFilter = (s: typeof statusFilter) => { setStatusFilter(s); setPage(1); };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <Link to={`/competitions/${compId}`} className="text-sm text-gray-400 hover:text-white">
            ← Back to competition
          </Link>
          <h1 className="mt-2 text-2xl font-bold">Survivor Table</h1>
          {comp && <p className="text-sm text-gray-400 mt-1">{comp.name}</p>}
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-brand-400">{counts.ACTIVE}</p>
          <p className="text-xs text-gray-400">still active</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
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
        <div className="inline-flex rounded-lg bg-surface-700 p-1 flex-wrap gap-1">
          {(['ALL', 'ACTIVE', 'ELIMINATED', 'WINNER'] as const).map((s) => (
            <button
              key={s}
              onClick={() => handleStatusFilter(s)}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                statusFilter === s ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {s} ({counts[s]})
            </button>
          ))}
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
            {(search || statusFilter !== 'ALL') && (
              <button
                onClick={() => { handleSearch(''); handleStatusFilter('ALL'); }}
                className="text-brand-400 hover:text-brand-300 underline"
              >
                Clear filters
              </button>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-700/50 max-h-[70vh]">
            <table className="w-full text-sm min-w-max">
              <thead className="sticky top-0 z-20">
                <tr className="border-b border-gray-700/50 bg-surface-800">
                  <th className="text-left py-3 px-4 font-semibold text-gray-300 sticky left-0 bg-surface-800/95 z-10 min-w-[140px]">
                    Participant
                  </th>
                  {gameweeks.map((gw) => (
                    <th key={gw.id} className="py-3 px-3 font-semibold text-gray-300 text-center min-w-[80px]">
                      <div>GW{gw.weekNumber}</div>
                      <div className={`text-[10px] font-normal mt-0.5 ${
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
                ) : paginated.map((row) => (
                  <tr
                    key={row.userId}
                    className={`transition-colors ${
                      row.status === 'WINNER' ? 'bg-yellow-600/10 hover:bg-yellow-600/15' :
                      row.status === 'ACTIVE' ? 'hover:bg-surface-700/40' :
                      'opacity-60 hover:opacity-80 hover:bg-surface-700/30'
                    }`}
                  >
                    <td className="py-3 px-4 sticky left-0 bg-surface-900/95 z-10">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-200 truncate max-w-[110px]">{row.username}</span>
                        {row.status === 'WINNER' && <span className="text-sm shrink-0">🏆</span>}
                        {row.status === 'ELIMINATED' && (
                          <span className="text-[10px] text-red-400 shrink-0">GW{row.eliminatedWeek}</span>
                        )}
                      </div>
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
                              <span className="text-[10px]">{outcomeIcon(pick.outcome)}</span>
                            )}
                            {pick.source === 'AUTO' && (
                              <span className="text-[9px] text-gray-500 italic">auto</span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
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
                        className={`px-2.5 py-1 text-xs rounded transition ${currentPage === p ? 'bg-brand-600 text-white font-medium' : 'bg-surface-700 hover:bg-surface-600 text-gray-300'}`}>{p}</button>
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
      <div className="flex flex-wrap gap-4 text-xs text-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-6 h-5 rounded bg-green-600/20 text-green-400 text-center leading-5 font-semibold text-[10px]">MCY</span>
          Advanced
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-6 h-5 rounded bg-red-600/20 text-red-400 text-center leading-5 font-semibold text-[10px]">ARS</span>
          Eliminated
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-6 h-5 rounded bg-yellow-600/20 text-yellow-400 text-center leading-5 font-semibold text-[10px]">CHE</span>
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
