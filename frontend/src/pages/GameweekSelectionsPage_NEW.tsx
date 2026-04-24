import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useState, useMemo, useEffect } from 'react';
import api from '../api';
import type { GameweekSelection } from '../types';

export default function GameweekSelectionsPage() {
  const { id, gwId } = useParams<{ id: string; gwId: string }>();
  const compId = Number(id);
  const gameweekId = Number(gwId);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'byteam'>('table');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  const { data: selections, isLoading, error } = useQuery<GameweekSelection[]>({
    queryKey: ['selections', compId, gameweekId],
    queryFn: () =>
      api.get(`/competitions/${compId}/gameweeks/${gameweekId}/selections`).then((r) => r.data),
    retry: false,
  });

  // Filter with search
  const filteredSelections = useMemo(() => {
    if (!selections) return [];
    if (!searchQuery.trim()) return selections;
    
    const query = searchQuery.toLowerCase();
    return selections.filter(s => 
      s.username.toLowerCase().includes(query) ||
      s.teamName.toLowerCase().includes(query) ||
      s.teamShortName.toLowerCase().includes(query)
    );
  }, [selections, searchQuery]);

  // Pagination for table view
  const totalPages = Math.ceil(filteredSelections.length / itemsPerPage);
  const paginatedSelections = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredSelections.slice(start, start + itemsPerPage);
  }, [filteredSelections, currentPage]);

  // Reset page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  // Group by team
  const byTeam = useMemo(() => {
    const map = new Map<string, GameweekSelection[]>();
    filteredSelections.forEach((s) => {
      const key = `${s.teamId}-${s.teamShortName}`;
      const arr = map.get(key) ?? [];
      arr.push(s);
      map.set(key, arr);
    });
    return map;
  }, [filteredSelections]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
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

  return (
    <div className="space-y-6">
      <div>
        <Link to={`/competitions/${compId}`} className="text-sm text-gray-400 hover:text-white">
          ← Back to competition
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Gameweek Selections</h1>
        <p className="mt-1 text-gray-400">{selections?.length ?? 0} picks revealed</p>
      </div>

      {!selections?.length ? (
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

                <div className="inline-flex rounded-lg bg-surface-700 p-1">
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
            </div>
          )}

          {/* Table view */}
          {viewMode === 'table' && (
            <div className="card overflow-hidden">
              {filteredSelections.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-400">No participants found matching "{searchQuery}"</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-700 text-left text-gray-400">
                          <th className="py-3 px-4">Player</th>
                          <th className="py-3 px-4">Team Picked</th>
                          <th className="py-3 px-4">Source</th>
                          <th className="py-3 px-4">Outcome</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedSelections.sort((a, b) => a.username.localeCompare(b.username)).map((s) => (
                          <tr
                            key={s.userId}
                            className="border-b border-gray-700/50 hover:bg-surface-700/30"
                          >
                            <td className="py-3 px-4 font-medium">{s.username}</td>
                            <td className="py-3 px-4">
                              <span className="font-semibold">{s.teamShortName}</span>
                              <span className="text-gray-400 ml-2 text-xs hidden sm:inline">{s.teamName}</span>
                            </td>
                            <td className="py-3 px-4">
                              {s.source === 'AUTO' ? (
                                <span className="badge-yellow text-xs">Auto</span>
                              ) : (
                                <span className="badge-gray text-xs">User</span>
                              )}
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
                              key={p.userId}
                              className={`text-xs px-2.5 py-1 rounded font-medium ${
                                p.outcome === 'ADVANCE' || p.outcome === 'POSTPONED_ADVANCE'
                                  ? 'bg-green-600/20 text-green-400'
                                  : p.outcome === 'ELIMINATED'
                                  ? 'bg-red-600/20 text-red-400'
                                  : 'bg-yellow-600/20 text-yellow-400'
                              }`}
                            >
                              {p.username}
                              {p.source === 'AUTO' && ' (auto)'}
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

function OutcomeBadge({ outcome }: { outcome: string }) {
  if (outcome === 'ADVANCE' || outcome === 'POSTPONED_ADVANCE') {
    return <span className="badge-green text-xs">✓</span>;
  }
  if (outcome === 'ELIMINATED') {
    return <span className="badge-red text-xs">✕</span>;
  }
  return <span className="badge-yellow text-xs">?</span>;
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
      
      <div className="flex items-center gap-2">
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
