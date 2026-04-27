import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import api from '../api';
import type { Competition, GameweekSelectionsData, Fixture } from '../types';
import { format } from 'date-fns';

interface GameweekSelection {
  userId: number;
  username: string;
  teamId: number;
  teamName: string;
  teamShortName: string;
  source: string;
  outcome: string;
}

function parseDate(value: string | number[]): Date {
  if (Array.isArray(value)) {
    const [y, mo, d, h = 0, mi = 0, s = 0] = value as number[];
    return new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  }
  const str = (value.endsWith('Z') || value.includes('+')) ? value : value + 'Z';
  return new Date(str);
}

export default function GameweekResultsPage() {
  const { id, gwId } = useParams<{ id: string; gwId: string }>();
  const compId = Number(id);
  const gameweekId = Number(gwId);
  
  // ALL HOOKS MUST BE DECLARED BEFORE ANY EARLY RETURNS
  const [searchQuery, setSearchQuery] = useState('');
  const [filterOutcome, setFilterOutcome] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'cards' | 'table' | 'byteam'>('cards');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 24; // Show 24 cards per page (4x6 grid on desktop)

  const { data: comp } = useQuery<Competition>({
    queryKey: ['competition', compId],
    queryFn: () => api.get(`/competitions/${compId}`).then((r) => r.data),
  });

  const { data: selectionsData, isLoading: selectionsLoading, error: selectionsError } = useQuery<GameweekSelectionsData>({
    queryKey: ['gameweekSelections', compId, gameweekId],
    queryFn: () => api.get(`/competitions/${compId}/gameweeks/${gameweekId}/selections`).then((r) => {
      // Handle old API format (array) or new format (object with selections)
      if (Array.isArray(r.data)) {
        return { selections: r.data, byeGranted: false, weekNumber: 0 };
      }
      return r.data;
    }),
  });

  const { data: fixtures } = useQuery<Fixture[]>({
    queryKey: ['fixtures', compId],
    queryFn: () => api.get(`/competitions/${compId}/fixtures?weeks=99`).then((r) =>
      Array.isArray(r.data) ? r.data : []
    ),
  });

  // Reset to page 1 when filters change (must be declared before any early returns)
  useEffect(() => {
    setCurrentPage(1);
  }, [filterOutcome, searchQuery]);

  // NOW we can do early returns AFTER all hooks
  if (selectionsLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  // Handle selections error (403, 404, etc.)
  if (selectionsError) {
    const errorStatus = (selectionsError as any)?.response?.status;
    const errorMsg = (selectionsError as any)?.response?.data?.message || 'Failed to load results';
    return (
      <div className="space-y-4">
        <Link to={`/competitions/${compId}`} className="text-sm text-brand-400 hover:text-brand-300">
          ← Back to competition
        </Link>
        <div className="card py-16 text-center">
          <div className="text-4xl mb-3">{errorStatus === 403 ? '🔒' : '❌'}</div>
          <p className="text-lg font-medium text-red-400">{errorMsg}</p>
          {errorStatus === 403 && (
            <p className="mt-2 text-gray-400 text-sm">
              This gameweek may not be locked yet, or you may not have permission to view it.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (!selectionsData || !comp) {
    return <div className="card py-16 text-center"><p className="text-red-400">Results not available</p></div>;
  }

  // Extract selections and metadata from wrapper
  const selections = selectionsData.selections || [];
  const byeGranted = selectionsData.byeGranted || false;

  // All data processing and derived state goes here (after early returns are done)
  const safeFixtures = Array.isArray(fixtures) ? fixtures : [];
  const gameweekFixtures = safeFixtures.filter(f => f.gameweekId === gameweekId);
  const weekNumber = gameweekFixtures[0]?.weekNumber || 'N/A';
  const gameweekStatus = gameweekFixtures[0]?.gameweekStatus || 'UNKNOWN';

  // Handle empty selections (might happen if no picks were made or data issue)
  const safeSelections = Array.isArray(selections) ? selections : [];

  const advanced = safeSelections.filter(s => s.outcome === 'ADVANCE' || s.outcome === 'POSTPONED_ADVANCE');
  const eliminated = safeSelections.filter(s => s.outcome === 'ELIMINATED');
  const pending = safeSelections.filter(s => s.outcome === 'PENDING');

  // Special case: All participants eliminated in this gameweek
  const allEliminated = safeSelections.length > 0 && eliminated.length === safeSelections.length;

  // Filter and search
  let filteredSelections = safeSelections;
  if (filterOutcome !== 'ALL') {
    if (filterOutcome === 'ADVANCE') {
      filteredSelections = advanced;
    } else if (filterOutcome === 'ELIMINATED') {
      filteredSelections = eliminated;
    } else if (filterOutcome === 'PENDING') {
      filteredSelections = pending;
    }
  }
  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase();
    filteredSelections = filteredSelections.filter(s => s.username.toLowerCase().includes(query));
  }

  // Pagination
  const totalPages = Math.ceil(filteredSelections.length / itemsPerPage);
  const start = (currentPage - 1) * itemsPerPage;
  const paginatedSelections = filteredSelections.slice(start, start + itemsPerPage);

  // Group by team
  const byTeam = filteredSelections.reduce((acc, sel) => {
    const key = sel.teamShortName;
    if (!acc[key]) acc[key] = [];
    acc[key].push(sel);
    return acc;
  }, {} as Record<string, GameweekSelection[]>);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-[1.75rem] border border-white/8 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.18),transparent_24rem),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(8,15,30,0.94))] px-4 py-5 shadow-[0_28px_70px_rgba(2,6,23,0.42)] sm:px-6 sm:py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link to={`/competitions/${compId}`} className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-brand-200/85 hover:text-white">
              <span>←</span> {comp.name}
            </Link>
            <h1 className="text-3xl font-black tracking-tight text-white">Gameweek {weekNumber} Results</h1>
            <p className="mt-2 text-sm text-gray-300">
              {safeSelections.length} pick{safeSelections.length !== 1 ? 's' : ''} processed for this round
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <ResultStatCard label="Picked" value={String(safeSelections.length)} accent="text-white" />
            <ResultStatCard label="Advanced" value={String(advanced.length)} accent="text-green-300" />
            <ResultStatCard label="Out" value={String(eliminated.length)} accent="text-red-300" />
          </div>
        </div>
      </div>

      {/* Bye Granted Banner */}
      {byeGranted && (
        <div className="card bg-yellow-600/10 border-yellow-600/30">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🎁</span>
            <div>
              <h3 className="font-semibold text-yellow-400">All Participants Granted Bye</h3>
              <p className="text-sm text-gray-300 mt-1">
                All remaining participants would have been eliminated in this gameweek. To keep the competition 
                fair and exciting, everyone was granted a <strong>bye</strong> and advanced to the next gameweek.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Warning: All Eliminated */}
      {allEliminated && !byeGranted && (
        <div className="card bg-red-600/10 border-red-600/30">
          <div className="flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <h3 className="font-semibold text-red-400">All Participants Eliminated</h3>
              <p className="text-sm text-gray-300 mt-1">
                All remaining participants were eliminated in this gameweek. In a normal scenario, they would all 
                receive a "bye" to continue, but the competition has ended with no winner.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* No picks message */}
      {safeSelections.length === 0 && (
        <div className="card py-16 text-center">
          <div className="text-4xl mb-3">📭</div>
          <p className="text-gray-400">No picks found for this gameweek</p>
        </div>
      )}

      {/* Summary Stats — clickable to filter, all scoped to THIS gameweek */}
      {safeSelections.length > 0 && (
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {/* Picks this GW */}
        <button
          onClick={() => setFilterOutcome('ALL')}
          className={`card text-center p-3 sm:p-4 transition-all cursor-pointer ${
            filterOutcome === 'ALL'
              ? 'ring-2 ring-gray-400 bg-gray-500/10'
              : 'hover:bg-surface-600/50 opacity-70 hover:opacity-100'
          }`}
        >
          <div className="text-2xl font-bold text-gray-200">{safeSelections.length}</div>
          <div className="text-xs sm:text-sm text-gray-400 mt-1">Picked</div>
          {filterOutcome === 'ALL' && <div className="mt-1 text-[10px] text-gray-500">● active</div>}
        </button>

        {/* Advanced this GW */}
        <button
          onClick={() => setFilterOutcome(filterOutcome === 'ADVANCE' ? 'ALL' : 'ADVANCE')}
          className={`card text-center p-3 sm:p-4 transition-all cursor-pointer ${
            filterOutcome === 'ADVANCE'
              ? 'ring-2 ring-green-500 bg-green-500/10'
              : 'hover:bg-surface-600/50 opacity-70 hover:opacity-100'
          }`}
        >
          <div className="text-2xl font-bold text-green-400">{advanced.length}</div>
          <div className="text-xs sm:text-sm text-gray-400 mt-1">Advanced</div>
          {filterOutcome === 'ADVANCE' && <div className="mt-1 text-[10px] text-green-600">● active</div>}
        </button>

        {/* Eliminated this GW */}
        <button
          onClick={() => setFilterOutcome(filterOutcome === 'ELIMINATED' ? 'ALL' : 'ELIMINATED')}
          className={`card text-center p-3 sm:p-4 transition-all cursor-pointer ${
            filterOutcome === 'ELIMINATED'
              ? 'ring-2 ring-red-500 bg-red-500/10'
              : 'hover:bg-surface-600/50 opacity-70 hover:opacity-100'
          }`}
        >
          <div className="text-2xl font-bold text-red-400">{eliminated.length}</div>
          <div className="text-xs sm:text-sm text-gray-400 mt-1">Eliminated</div>
          {filterOutcome === 'ELIMINATED' && <div className="mt-1 text-[10px] text-red-600">● active</div>}
        </button>

        {/* Pending — only show if results not yet fully processed */}
        {pending.length > 0 && (
          <button
            onClick={() => setFilterOutcome(filterOutcome === 'PENDING' ? 'ALL' : 'PENDING')}
            className={`card text-center p-3 sm:p-4 col-span-3 transition-all cursor-pointer ${
              filterOutcome === 'PENDING'
                ? 'ring-2 ring-yellow-500 bg-yellow-500/10'
                : 'hover:bg-surface-600/50 opacity-70 hover:opacity-100'
            }`}
          >
            <div className="text-2xl font-bold text-yellow-400">{pending.length}</div>
            <div className="text-xs sm:text-sm text-gray-400 mt-1">Pending</div>
            {filterOutcome === 'PENDING' && <div className="mt-1 text-[10px] text-yellow-600">● active</div>}
          </button>
        )}
      </div>
      )}

      {/* Search + View Controls - show if we have selections */}
      {safeSelections.length > 0 && (
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        {/* Search */}
        <input
          type="text"
          placeholder="Search participants..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="input-field w-full sm:max-w-xs text-sm"
        />

        <div className="flex items-center gap-3 flex-wrap">
          {/* Active filter label */}
          {filterOutcome !== 'ALL' && (
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1.5 ${
              filterOutcome === 'ADVANCE' ? 'bg-green-500/20 text-green-400' :
              filterOutcome === 'ELIMINATED' ? 'bg-red-500/20 text-red-400' :
              'bg-yellow-500/20 text-yellow-400'
            }`}>
              {filterOutcome === 'ADVANCE' ? 'Advanced' : filterOutcome === 'ELIMINATED' ? 'Eliminated' : 'Pending'}
              <button onClick={() => setFilterOutcome('ALL')} className="hover:opacity-70 leading-none">×</button>
            </span>
          )}

          {/* View mode toggle */}
          <div className="inline-flex rounded-lg bg-surface-700 p-1">
            <button
              onClick={() => setViewMode('cards')}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                viewMode === 'cards' ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
              title="Card view"
            >
              📇 Cards
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                viewMode === 'table' ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
              title="Table view"
            >
              📊 Table
            </button>
            <button
              onClick={() => setViewMode('byteam')}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                viewMode === 'byteam' ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
              title="Group by team"
            >
              👥 By Team
            </button>
          </div>
        </div>
      </div>
      )}

      {/* Result count when filtered/searched */}
      {(filterOutcome !== 'ALL' || searchQuery) && safeSelections.length > 0 && (
        <p className="text-sm text-gray-400 -mt-1">
          Showing <span className="text-white font-medium">{filteredSelections.length}</span> of {safeSelections.length} participants
          {searchQuery && <span> matching <span className="text-white">"{searchQuery}"</span></span>}
        </p>
      )}

      {/* Results Display - Changes based on view mode */}
      {safeSelections.length > 0 && viewMode === 'cards' && (
        <div className="space-y-4">
          {filteredSelections.length === 0 ? (
            <div className="card text-center py-12">
              <p className="text-gray-400">No participants found</p>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {paginatedSelections.map((sel) => (
                  <SelectionCard key={sel.userId} selection={sel} fixtures={gameweekFixtures} />
                ))}
              </div>
              
              {/* Pagination */}
              {totalPages > 1 && (
                <Pagination 
                  currentPage={currentPage} 
                  totalPages={totalPages} 
                  onPageChange={setCurrentPage}
                  totalItems={filteredSelections.length}
                  itemsPerPage={itemsPerPage}
                />
              )}
            </>
          )}
        </div>
      )}

      {viewMode === 'table' && (
        <div className="card overflow-hidden">
          {filteredSelections.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-400">No participants found</p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-gray-700/50 sm:hidden">
                {paginatedSelections.map((sel) => {
                  const fixture = gameweekFixtures.find(
                    (f) => f.homeTeamId === sel.teamId || f.awayTeamId === sel.teamId
                  );
                  const isHome = fixture?.homeTeamId === sel.teamId;
                  const opponent = isHome ? fixture?.awayTeamShortName : fixture?.homeTeamShortName;
                  const score = fixture?.status === 'FINISHED'
                    ? `${fixture.scoreHome}-${fixture.scoreAway}`
                    : fixture?.status === 'POSTPONED'
                    ? 'PP'
                    : '-';

                  return (
                    <div key={sel.userId} className="px-4 py-3 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-sm text-gray-100 truncate">{sel.username}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            Picked <span className="text-gray-200 font-medium">{sel.teamShortName}</span>
                            {opponent ? <span> vs {opponent}</span> : null}
                          </p>
                        </div>
                        <OutcomeBadge outcome={sel.outcome} />
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500">
                          {sel.source === 'AUTO' ? 'Auto-picked' : 'Self-picked'}
                        </span>
                        <span className="font-medium text-gray-300">Score: {score}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-700 text-left text-gray-400">
                      <th className="py-3 px-4">Participant</th>
                      <th className="py-3 px-4">Pick</th>
                      <th className="py-3 px-4">Opponent</th>
                      <th className="py-3 px-4 text-center">Score</th>
                      <th className="py-3 px-4">Pick Type</th>
                      <th className="py-3 px-4">Outcome</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedSelections.map((sel) => {
                      const fixture = gameweekFixtures.find(
                        (f) => f.homeTeamId === sel.teamId || f.awayTeamId === sel.teamId
                      );
                      const isHome = fixture?.homeTeamId === sel.teamId;
                      const opponent = isHome ? fixture?.awayTeamShortName : fixture?.homeTeamShortName;
                      const score = fixture?.status === 'FINISHED'
                        ? `${fixture.scoreHome}-${fixture.scoreAway}`
                        : fixture?.status === 'POSTPONED'
                        ? 'PP'
                        : '-';
                      
                      return (
                        <tr key={sel.userId} className="border-b border-gray-700/50 hover:bg-surface-700/30">
                          <td className="py-3 px-4 font-medium text-gray-200">{sel.username}</td>
                          <td className="py-3 px-4 text-gray-200">{sel.teamShortName}</td>
                          <td className="py-3 px-4 text-gray-400">{opponent || '—'}</td>
                          <td className="py-3 px-4 text-center font-medium text-white">{score}</td>
                          <td className="py-3 px-4">
                            {sel.source === 'AUTO' ? (
                              <span className="text-xs text-yellow-400">Auto</span>
                            ) : (
                              <span className="text-xs text-gray-500">Self</span>
                            )}
                          </td>
                          <td className="py-3 px-4"><OutcomeBadge outcome={sel.outcome} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="border-t border-gray-700 pt-4">
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

      {viewMode === 'byteam' && (
        <div className="card space-y-3">
          {Object.keys(byTeam).length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-400">No participants found</p>
            </div>
          ) : (
            Object.entries(byTeam)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([teamName, picks]: [string, GameweekSelection[]]) => {
                const fixture = gameweekFixtures.find(
                  (f) => f.homeTeamShortName === teamName || f.awayTeamShortName === teamName
                );
                const result = fixture?.status === 'FINISHED'
                  ? `${fixture.scoreHome}-${fixture.scoreAway}`
                  : fixture?.status === 'POSTPONED'
                  ? 'POSTPONED'
                  : 'Scheduled';
                
                return (
                  <div key={teamName} className="bg-surface-700/50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-gray-200">{teamName}</h3>
                        {fixture && (
                          <p className="text-xs text-gray-400 mt-1">
                            {fixture.homeTeamShortName} vs {fixture.awayTeamShortName} • {result}
                          </p>
                        )}
                      </div>
                      <span className="text-sm text-gray-400">{picks.length} pick{picks.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {picks.map((sel) => (
                        <span
                          key={sel.userId}
                          className={`text-xs px-2.5 py-1 rounded font-medium ${
                            sel.outcome === 'ADVANCE' || sel.outcome === 'POSTPONED_ADVANCE'
                              ? 'bg-green-600/20 text-green-400'
                              : sel.outcome === 'ELIMINATED'
                              ? 'bg-red-600/20 text-red-400'
                              : 'bg-yellow-600/20 text-yellow-400'
                          }`}
                        >
                          {sel.username}
                          {sel.source === 'AUTO' && ' (auto)'}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })
          )}
        </div>
      )}

      {/* Fixtures for Reference */}
      {gameweekFixtures.length > 0 && (
        <section className="card">
          <h2 className="text-lg font-semibold mb-4">Fixtures</h2>
          <div className="space-y-2">
            {gameweekFixtures
              .sort((a, b) => parseDate(a.kickoffAt).getTime() - parseDate(b.kickoffAt).getTime())
              .map((f) => (
                <div key={f.id} className="bg-surface-700/50 rounded-lg px-4 py-3 text-sm">
                  <div className="sm:hidden space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-gray-200">{f.homeTeamShortName}</span>
                      <div className="flex items-center justify-center min-w-[60px]">
                        {f.status === 'FINISHED' ? (
                          <span className="font-bold text-white">{f.scoreHome} - {f.scoreAway}</span>
                        ) : f.status === 'POSTPONED' ? (
                          <span className="badge-yellow text-xs">PP</span>
                        ) : (
                          <span className="text-gray-400 text-xs">{format(parseDate(f.kickoffAt), 'HH:mm')}</span>
                        )}
                      </div>
                      <span className="font-medium text-gray-200">{f.awayTeamShortName}</span>
                    </div>
                    <div className="text-center text-xs text-gray-400">
                      {f.homeTeamName} vs {f.awayTeamName}
                    </div>
                  </div>

                  <div className="hidden sm:grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                    <span className="text-gray-200 text-right">{f.homeTeamName}</span>
                    <div className="flex items-center justify-center min-w-[60px]">
                      {f.status === 'FINISHED' ? (
                        <span className="font-bold text-white">{f.scoreHome} - {f.scoreAway}</span>
                      ) : f.status === 'POSTPONED' ? (
                        <span className="badge-yellow text-xs">PP</span>
                      ) : (
                        <span className="text-gray-400 text-xs">{format(parseDate(f.kickoffAt), 'HH:mm')}</span>
                      )}
                    </div>
                    <span className="text-gray-200">{f.awayTeamName}</span>
                  </div>
                </div>
              ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SelectionCard({ selection, fixtures }: { selection: GameweekSelection; fixtures: Fixture[] }) {
  // Find the fixture for this team
  const fixture = fixtures.find(
    (f) => f.homeTeamId === selection.teamId || f.awayTeamId === selection.teamId
  );

  const isHome = fixture?.homeTeamId === selection.teamId;
  const opponent = isHome ? fixture?.awayTeamShortName : fixture?.homeTeamShortName;
  const score = fixture?.status === 'FINISHED' 
    ? `${fixture.scoreHome}-${fixture.scoreAway}` 
    : fixture?.status === 'POSTPONED' 
    ? 'PP' 
    : '-';

  return (
    <div
      className={`rounded-lg border p-3 ${
        selection.outcome === 'ADVANCE' || selection.outcome === 'POSTPONED_ADVANCE'
          ? 'border-green-500/30 bg-green-500/5'
          : selection.outcome === 'ELIMINATED'
          ? 'border-red-500/30 bg-red-500/5'
          : 'border-yellow-500/30 bg-yellow-500/5'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="font-semibold text-gray-200">{selection.username}</div>
        <OutcomeBadge outcome={selection.outcome} />
      </div>
      <div className="text-sm space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-gray-400">Picked:</span>
          <span className="font-medium text-gray-200">
            {selection.teamShortName}
            {selection.source === 'AUTO' && <span className="text-xs text-yellow-400 ml-1">(auto)</span>}
          </span>
        </div>
        {opponent && (
          <div className="flex items-center justify-between">
            <span className="text-gray-400">vs</span>
            <span className="text-gray-300">{opponent}</span>
          </div>
        )}
        {fixture && (
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Score:</span>
            <span className="font-medium text-gray-200">{score}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  if (outcome === 'ADVANCE') {
    return (
      <span className="badge-green text-xs whitespace-nowrap">
        <span className="sm:hidden">✓</span>
        <span className="hidden sm:inline">✓ Advance</span>
      </span>
    );
  }
  if (outcome === 'POSTPONED_ADVANCE') {
    return (
      <span className="badge-yellow text-xs whitespace-nowrap">
        <span className="sm:hidden">↷</span>
        <span className="hidden sm:inline">PP Advance</span>
      </span>
    );
  }
  if (outcome === 'ELIMINATED') {
    return (
      <span className="badge-red text-xs whitespace-nowrap">
        <span className="sm:hidden">✕</span>
        <span className="hidden sm:inline">✕ Out</span>
      </span>
    );
  }
  return (
    <span className="badge-gray text-xs whitespace-nowrap">
      <span className="sm:hidden">…</span>
      <span className="hidden sm:inline">Pending</span>
    </span>
  );
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

  // Generate page numbers to show (with ellipsis for large page counts)
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 7;

    if (totalPages <= maxVisible) {
      // Show all pages
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      // Show first, last, current, and surrounding pages
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
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3">
      <div className="text-sm text-gray-400">
        Showing {startItem}-{endItem} of {totalItems} participants
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

function ResultStatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.045] px-3 py-2 text-center backdrop-blur-sm">
      <div className={`text-lg font-black ${accent}`}>{value}</div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">{label}</div>
    </div>
  );
}
