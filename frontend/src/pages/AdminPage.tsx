import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import api from '../api';
import type { Competition, AuditLog, Participant, Club } from '../types';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import ErrorBoundary from '../components/ErrorBoundary';
import ConfirmDialog from '../components/ConfirmDialog';

function parseDate(value: string | number[]): Date {
  if (Array.isArray(value)) {
    const [y, mo, d, h = 0, mi = 0, s = 0] = value as number[];
    return new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  }
  const str = (value.endsWith('Z') || value.includes('+')) ? value : value + 'Z';
  return new Date(str);
}

export default function AdminPage() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'competitions' | 'clubs' | 'users' | 'sync' | 'simulate' | 'testdata' | 'audit'>('competitions');

  if (!isAdmin) {
    return (
      <div className="card py-16 text-center">
        <p className="text-red-400 text-lg font-medium">Access denied</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Admin Panel</h1>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-700 pb-2 overflow-x-auto">
        {(['competitions', 'clubs', 'users', 'sync', 'simulate', 'testdata', 'audit'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
              tab === t
                ? 'bg-surface-700 text-white border-b-2 border-brand-500'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {t === 'competitions' ? 'Competitions' :
             t === 'clubs' ? 'Clubs' :
             t === 'users' ? 'Users' :
             t === 'sync' ? 'Fixture Sync' :
             t === 'simulate' ? 'Simulate Results' :
             t === 'testdata' ? 'Test Data' :
             'Audit Log'}
          </button>
        ))}
      </div>

      {tab === 'competitions' && <ErrorBoundary><CompetitionsTab /></ErrorBoundary>}
      {tab === 'clubs' && <ErrorBoundary><ClubsTab /></ErrorBoundary>}
      {tab === 'users' && <ErrorBoundary><UsersTab /></ErrorBoundary>}
      {tab === 'sync' && <ErrorBoundary><SyncTab /></ErrorBoundary>}
      {tab === 'simulate' && <ErrorBoundary><SimulateTab /></ErrorBoundary>}
      {tab === 'testdata' && <ErrorBoundary><TestDataTab /></ErrorBoundary>}
      {tab === 'audit' && <ErrorBoundary><AuditTab /></ErrorBoundary>}
    </div>
  );
}

// ── Competitions Tab ────────────────────────────────────────────────

function CompetitionsTab() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [entryFee, setEntryFee] = useState('0');
  const [prizePool, setPrizePool] = useState('');
  const [missedPickMode, setMissedPickMode] = useState('ELIMINATE');
  const [postponedConsumesTeam, setPostponedConsumesTeam] = useState(true);
  const [passFeeToParticipant, setPassFeeToParticipant] = useState(false);
  const [paymentMode, setPaymentMode] = useState<'FREE' | 'MANUAL' | 'STRIPE'>('FREE');
  const [startDate, setStartDate] = useState('');
  const [clubId, setClubId] = useState<string>('');

  const { data: clubs } = useQuery<Club[]>({
    queryKey: ['admin', 'clubs'],
    queryFn: () => api.get('/admin/clubs').then((r) =>
      Array.isArray(r.data) ? r.data : []
    ),
  });

  const { data: competitions } = useQuery<Competition[]>({
    queryKey: ['admin', 'competitions'],
    queryFn: () => api.get('/admin/competitions').then((r) =>
      Array.isArray(r.data) ? r.data : []
    ),
    staleTime: 0,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post('/admin/competitions', {
        name,
        description: description || null,
        entryFee: parseFloat(entryFee) || 0,
        prizePool: prizePool ? parseFloat(prizePool) : null,
        missedPickMode,
        postponedConsumesTeam,
        passFeeToParticipant,
        paymentMode,
        startDate,
        clubId: clubId ? Number(clubId) : null,
      }),
    onSuccess: (response) => {
      toast.success('Competition created!');
      queryClient.setQueryData<Competition[]>(['admin', 'competitions'], (old) =>
        old ? [response.data, ...old] : [response.data]
      );
      queryClient.invalidateQueries({ queryKey: ['admin', 'competitions'] });
      queryClient.invalidateQueries({ queryKey: ['competitions'] });
      setShowForm(false);
      setName('');
      setDescription('');
      setEntryFee('0');
      setPrizePool('');
      setStartDate('');
      setPassFeeToParticipant(false);
      setPaymentMode('FREE');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to create');
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Manage Competitions</h2>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          {showForm ? 'Cancel' : '+ New Competition'}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
          className="card space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="input-field" required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">Start Date</label>
              <div className="relative">
                <input
                  type="date"
                  value={startDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                  className="input-field w-full pr-10 [color-scheme:dark] cursor-pointer"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                The first gameweek starts from the next unstarted PL week on or after this date.
              </p>
            </div>

            {/* Payment Mode */}
            <div className="sm:col-span-2">
              <label className="mb-2 block text-sm font-medium text-gray-300">Payment Mode</label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { value: 'FREE',   label: 'Free',   icon: '🎉', desc: 'No entry fee' },
                  { value: 'MANUAL', label: 'Manual', icon: '💸', desc: 'Revolut / cash / bank transfer' },
                  { value: 'STRIPE', label: 'Online', icon: '💳', desc: 'Players pay by card via Stripe' },
                ] as const).map(opt => (
                  <button key={opt.value} type="button"
                    onClick={() => {
                      setPaymentMode(opt.value);
                      if (opt.value === 'FREE') { setEntryFee('0'); setPassFeeToParticipant(false); }
                    }}
                    className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-xs transition-colors ${
                      paymentMode === opt.value
                        ? 'border-brand-500 bg-brand-600/20 text-white'
                        : 'border-gray-600 bg-surface-700 text-gray-400 hover:border-gray-500'
                    }`}>
                    <span className="text-xl">{opt.icon}</span>
                    <span className="font-semibold">{opt.label}</span>
                    <span className="text-center leading-tight">{opt.desc}</span>
                  </button>
                ))}
              </div>
              {paymentMode === 'MANUAL' && (
                <p className="mt-2 text-xs text-yellow-400/80">
                  💡 Players register themselves then pay you directly. Confirm their payment in the Participants panel.
                </p>
              )}
            </div>

            {paymentMode !== 'FREE' && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">Entry Fee (€)</label>
                <input
                  type="number" min="0" step="5" value={entryFee}
                  onChange={(e) => setEntryFee(e.target.value)} className="input-field"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[5, 10, 20, 50].map((preset) => (
                    <button key={preset} type="button" onClick={() => setEntryFee(String(preset))}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                        entryFee === String(preset) ? 'bg-brand-600 text-white' : 'bg-surface-700 hover:bg-surface-600 text-gray-300'
                      }`}>€{preset}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Prize Pool — always visible */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">
                Prize Pool (€)
                <span className="ml-1 text-xs font-normal text-gray-500">— optional, leave blank to auto-calculate from entry fees</span>
              </label>
              <input
                type="number" min="0" step="5" value={prizePool}
                placeholder={paymentMode !== 'FREE' && entryFee ? 'e.g. 200' : 'Optional'}
                onChange={(e) => setPrizePool(e.target.value)}
                className="input-field"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[50, 100, 200, 500].map((preset) => (
                  <button key={preset} type="button" onClick={() => setPrizePool(String(preset))}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      prizePool === String(preset) ? 'bg-brand-600 text-white' : 'bg-surface-700 hover:bg-surface-600 text-gray-300'
                    }`}>€{preset}</button>
                ))}
                {prizePool && (
                  <button type="button" onClick={() => setPrizePool('')}
                    className="px-2.5 py-1 rounded text-xs font-medium bg-surface-700 hover:bg-surface-600 text-gray-400">
                    Clear
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">Missed Pick Mode</label>
              <select value={missedPickMode} onChange={(e) => setMissedPickMode(e.target.value)} className="input-field">
                <option value="ELIMINATE">Eliminate</option>
                <option value="AUTO_ASSIGN">Auto-Assign</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">Club (optional)</label>
              <select value={clubId} onChange={(e) => setClubId(e.target.value)} className="input-field">
                <option value="">No Club</option>
                {clubs?.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-300">Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="input-field" rows={2} />
            </div>
            <div className="sm:col-span-2 space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={postponedConsumesTeam}
                  onChange={(e) => setPostponedConsumesTeam(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-600 bg-surface-700 text-brand-500" />
                <span className="text-sm text-gray-300">
                  Postponed fixture consumes team pick
                  <span className="ml-1 text-xs text-gray-500">(recommended)</span>
                </span>
              </label>
              {paymentMode === 'STRIPE' && parseFloat(entryFee) > 0 && (
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={passFeeToParticipant}
                    onChange={(e) => setPassFeeToParticipant(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded border-gray-600 bg-surface-700 text-brand-500" />
                  <span className="text-sm text-gray-300">
                    Pass Stripe processing fee to participant
                    <span className="ml-1 text-xs text-gray-500">— player pays slightly more so you receive exactly €{entryFee}</span>
                    {passFeeToParticipant && (
                      <span className="block mt-1 text-xs text-yellow-400">
                        e.g. player pays ~€{((parseFloat(entryFee) + 0.25) / (1 - 0.015)).toFixed(2)}, you receive €{entryFee}
                      </span>
                    )}
                  </span>
                </label>
              )}
            </div>
          </div>
          <button type="submit" disabled={createMutation.isPending} className="btn-primary">
            {createMutation.isPending ? 'Creating…' : 'Create Competition'}
          </button>
        </form>
      )}

      {competitions && competitions.length > 0 && (
        <div className="card overflow-hidden">
          {/* Mobile: card list */}
          <div className="divide-y divide-gray-700/50 md:hidden">
            {competitions.map((c) => (
              <CompetitionRow key={c.id} comp={c} />
            ))}
          </div>
          {/* md+: scrollable table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 text-left text-gray-400">
                  <th className="py-3 px-4 whitespace-nowrap">Name</th>
                  <th className="py-3 px-4 whitespace-nowrap">Status</th>
                  <th className="py-3 px-4 whitespace-nowrap">Start</th>
                  <th className="py-3 px-4 whitespace-nowrap">Players</th>
                  <th className="py-3 px-4 whitespace-nowrap">Mode</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {competitions.map((c) => (
                  <CompetitionRow key={c.id} comp={c} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function CompetitionRow({ comp }: { comp: Competition }) {
  const queryClient = useQueryClient();
  const [showParticipants, setShowParticipants] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/admin/competitions/${comp.id}`),
    onSuccess: () => {
      toast.success(`"${comp.name}" deleted`);
      queryClient.setQueryData<Competition[]>(['admin', 'competitions'], (old) =>
        old ? old.filter((c) => c.id !== comp.id) : []
      );
      queryClient.invalidateQueries({ queryKey: ['admin', 'competitions'] });
      queryClient.invalidateQueries({ queryKey: ['competitions'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Delete failed'),
  });

  const syncMutation = useMutation({
    mutationFn: () => api.post(`/admin/competitions/${comp.id}/sync-fixtures`),
    onSuccess: (res) => {
      toast.success(res.data.message ?? 'Fixtures synced!');
      queryClient.invalidateQueries({ queryKey: ['fixtures', comp.id] });
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Sync failed'),
  });

  const statusBadge = comp.status === 'ACTIVE' ? 'badge-green' :
    comp.status === 'COMPLETED' ? 'badge-gray' :
    comp.status === 'UPCOMING' ? 'badge-blue' : 'badge-yellow';

  return (
    <>
      {/* ── Mobile card (hidden on md+) ── */}
      <div className="md:hidden p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium text-white truncate">{comp.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">{comp.startDate}</p>
          </div>
          <span className={statusBadge}>{comp.status}</span>
        </div>
        <div className="flex gap-4 text-xs text-gray-400">
          <span>👥 {comp.participantCount} players</span>
          <span>⚙️ {comp.missedPickMode}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}
            className="text-xs px-3 py-1.5 rounded bg-brand-600/20 hover:bg-brand-600/40 text-brand-400 transition">
            {syncMutation.isPending ? '⏳' : '🔄 Sync'}
          </button>
          <button onClick={() => setShowParticipants(!showParticipants)}
            className="text-xs px-3 py-1.5 rounded bg-surface-700 hover:bg-surface-600 text-gray-300 transition">
            {showParticipants ? 'Hide' : 'Manage'}
          </button>
          <button onClick={() => setDeleteOpen(true)} disabled={deleteMutation.isPending}
            className="text-xs px-3 py-1.5 rounded bg-red-600/20 hover:bg-red-600/40 text-red-400 transition">
            {deleteMutation.isPending ? '…' : 'Delete'}
          </button>
        </div>
        {showParticipants && (
          <ParticipantsPanel competitionId={comp.id} competitionName={comp.name} />
        )}
      </div>

      {/* ── Desktop table row (hidden below md) ── */}
      <tr className="hidden md:table-row border-b border-gray-700/50">
        <td className="py-3 px-4 font-medium">{comp.name}</td>
        <td className="py-3 px-4"><span className={statusBadge}>{comp.status}</span></td>
        <td className="py-3 px-4 text-gray-400 whitespace-nowrap">{comp.startDate}</td>
        <td className="py-3 px-4">
          {comp.participantCount}
          {comp.status === 'COMPLETED' && comp.activeCount > 0 && (
            <span className="text-xs text-yellow-400 ml-1">(Winner)</span>
          )}
          {comp.status === 'COMPLETED' && comp.activeCount === 0 && (
            <span className="text-xs text-gray-500 ml-1">(No winner)</span>
          )}
        </td>
        <td className="py-3 px-4 text-gray-400 whitespace-nowrap">{comp.missedPickMode}</td>
        <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
          <button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}
            className="text-sm px-3 py-1 rounded bg-brand-600/20 hover:bg-brand-600/40 text-brand-400 transition"
            title="Re-sync fixtures from provider">
            {syncMutation.isPending ? '⏳' : '🔄 Sync'}
          </button>
          <button onClick={() => setShowParticipants(!showParticipants)}
            className="text-sm px-3 py-1 rounded bg-surface-700 hover:bg-surface-600 text-gray-300 transition">
            {showParticipants ? 'Hide' : 'Manage'}
          </button>
          <button onClick={() => setDeleteOpen(true)} disabled={deleteMutation.isPending}
            className="text-sm px-3 py-1 rounded bg-red-600/20 hover:bg-red-600/40 text-red-400 transition">
            {deleteMutation.isPending ? '…' : 'Delete'}
          </button>
        </td>
      </tr>
      {showParticipants && (
        <tr className="hidden md:table-row">
          <td colSpan={6} className="p-0">
            <ParticipantsPanel competitionId={comp.id} competitionName={comp.name} />
          </td>
        </tr>
      )}

      <ConfirmDialog
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => deleteMutation.mutate()}
        variant="danger"
        title={`Delete "${comp.name}"?`}
        message="This will permanently remove the competition and all associated data."
        items={[
          'All participants will be removed',
          'All picks and results will be deleted',
          'All fixtures and gameweeks will be deleted',
        ]}
        confirmText="Yes, Delete"
        isPending={deleteMutation.isPending}
      />
    </>
  );
}

function ParticipantsPanel({ competitionId, competitionName }: { competitionId: number; competitionName: string }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'ELIMINATED' | 'WINNER'>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [winnerDialogUser, setWinnerDialogUser] = useState<Participant | null>(null);
  const [removeDialogUser, setRemoveDialogUser] = useState<Participant | null>(null);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const PAGE_SIZE = 20;

  const { data: participants, isLoading } = useQuery<Participant[]>({
    queryKey: ['admin', 'participants', competitionId],
    queryFn: () => api.get(`/admin/competitions/${competitionId}/participants`).then((r) =>
      Array.isArray(r.data) ? r.data : []
    ),
  });

  const removeMutation = useMutation({
    mutationFn: (userId: number) => api.delete(`/admin/competitions/${competitionId}/participants/${userId}`),
    onSuccess: () => {
      toast.success('Participant removed');
      queryClient.invalidateQueries({ queryKey: ['admin', 'participants', competitionId] });
      queryClient.invalidateQueries({ queryKey: ['competitions'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Remove failed'),
  });

  const declareWinnerMutation = useMutation({
    mutationFn: (userId: number) => api.post(`/admin/competitions/${competitionId}/declare-winner/${userId}`, {}),
    onSuccess: (_, userId) => {
      const winner = participants?.find(p => p.userId === userId);
      toast.success(
        <div className="flex items-center gap-3">
          <span className="text-2xl">🏆</span>
          <div>
            <p className="font-semibold">{winner?.username} is the Winner!</p>
            <p className="text-sm opacity-80">Competition has been completed.</p>
          </div>
        </div>,
        { duration: 5000, style: { background: '#713f12', border: '1px solid #a16207', color: '#fef9c3' } }
      );
      queryClient.invalidateQueries({ queryKey: ['admin', 'participants', competitionId] });
      queryClient.invalidateQueries({ queryKey: ['competitions'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'competitions'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to declare winner'),
  });


  if (isLoading) {
    return (
      <div className="flex justify-center py-6 bg-surface-800/50">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  if (!participants || participants.length === 0) {
    return (
      <div className="py-6 text-center text-gray-400 bg-surface-800/50">
        No participants yet
      </div>
    );
  }

  // Counts for filter buttons
  const counts = {
    ALL: participants.length,
    ACTIVE: participants.filter(p => p.status === 'ACTIVE').length,
    ELIMINATED: participants.filter(p => p.status === 'ELIMINATED').length,
    WINNER: participants.filter(p => p.status === 'WINNER').length,
  };

  // Filter + search (plain JS, no hooks after early returns)
  let filtered = participants;
  if (statusFilter !== 'ALL') {
    filtered = filtered.filter(p => p.status === statusFilter);
  }
  if (search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter(p => p.username.toLowerCase().includes(q));
  }

  // Pagination
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Reset to page 1 whenever search/filter changes
  const setFilter = (f: typeof statusFilter) => { setStatusFilter(f); setCurrentPage(1); };
  const setQ = (q: string) => { setSearch(q); setCurrentPage(1); };

  return (
    <div className="bg-surface-800/50 border-t border-gray-700/50">

      {/* Header row */}
      <div className="px-4 py-3 border-b border-gray-700/30 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-gray-300">
            Participants ({participants.length})
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddPanel((v) => !v)}
              className="text-xs px-3 py-1.5 rounded-lg bg-brand-600/20 hover:bg-brand-600/40 text-brand-400 transition"
            >
              {showAddPanel ? '✕ Cancel' : '+ Add Participant'}
            </button>
            {/* Search */}
            <input
              type="text"
              placeholder="Search username…"
              value={search}
              onChange={(e) => setQ(e.target.value)}
              className="px-2.5 py-1 text-xs rounded bg-surface-700 border border-gray-600 text-gray-200
                         placeholder-gray-500 focus:outline-none focus:border-brand-500 w-36 sm:w-48"
            />
          </div>
        </div>

        {showAddPanel && (
          <AddParticipantPanel
            competitionId={competitionId}
            apiBase="/admin"
            invalidateKeys={[['admin', 'participants', competitionId], ['competitions']]}
            onClose={() => setShowAddPanel(false)}
          />
        )}

        {/* Status filter pills */}
        <div className="flex flex-wrap gap-2">
          {(['ALL', 'ACTIVE', 'ELIMINATED', 'WINNER'] as const).map((s) => (
            counts[s] > 0 || s === 'ALL' ? (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                  statusFilter === s
                    ? s === 'ACTIVE'    ? 'bg-green-600 text-white'
                    : s === 'ELIMINATED' ? 'bg-red-600 text-white'
                    : s === 'WINNER'    ? 'bg-yellow-500 text-black'
                    : 'bg-brand-600 text-white'
                    : 'bg-surface-700 text-gray-400 hover:text-white'
                }`}
              >
                {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()} ({counts[s]})
              </button>
            ) : null
          ))}

          {/* Result count when filtered */}
          {(statusFilter !== 'ALL' || search) && (
            <span className="text-xs text-gray-500 self-center ml-1">
              {filtered.length} shown
            </span>
          )}
        </div>
      </div>

      {/* Participant rows */}
      {filtered.length === 0 ? (
        <div className="py-6 text-center text-gray-500 text-sm">
          No participants match your filter
        </div>
      ) : (
        <>
          <div className="divide-y divide-gray-700/30">
            {paginated.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-medium text-gray-200 truncate">{p.username}</span>
                  <span className={
                    p.status === 'ACTIVE'    ? 'badge-green' :
                    p.status === 'ELIMINATED' ? 'badge-red'   : 'badge-yellow'
                  }>
                    {p.status}
                  </span>
                  {p.eliminatedWeek && (
                    <span className="text-xs text-gray-500 shrink-0">GW{p.eliminatedWeek}</span>
                  )}
                  <span className="text-xs text-gray-500 shrink-0 hidden sm:inline">
                    joined {parseDate(p.joinedAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  {p.status === 'ACTIVE' && counts.ACTIVE > 1 && (
                    <button
                      onClick={() => setWinnerDialogUser(p)}
                      disabled={declareWinnerMutation.isPending}
                      className="text-xs px-2.5 py-1 rounded bg-yellow-600/20 hover:bg-yellow-600/40 text-yellow-400 transition"
                      title="Declare as winner and end competition"
                    >
                      🏆 Declare Winner
                    </button>
                  )}
                  <button
                    onClick={() => setRemoveDialogUser(p)}
                    disabled={removeMutation.isPending}
                    className="text-xs px-2.5 py-1 rounded bg-red-600/20 hover:bg-red-600/40 text-red-400 transition"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-700/30 text-xs text-gray-400">
              <span>
                {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-2.5 py-1 rounded bg-surface-700 hover:bg-surface-600 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  ← Prev
                </button>
                {/* Page numbers — show up to 7 */}
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(n => n === 1 || n === totalPages || Math.abs(n - currentPage) <= 2)
                  .reduce<(number | '...')[]>((acc, n, i, arr) => {
                    if (i > 0 && n - (arr[i - 1] as number) > 1) acc.push('...');
                    acc.push(n);
                    return acc;
                  }, [])
                  .map((item, idx) =>
                    item === '...' ? (
                      <span key={`e${idx}`} className="px-2 py-1 text-gray-600">…</span>
                    ) : (
                      <button
                        key={item}
                        onClick={() => setCurrentPage(item as number)}
                        className={`px-2.5 py-1 rounded transition ${
                          currentPage === item
                            ? 'bg-brand-600 text-white font-medium'
                            : 'bg-surface-700 hover:bg-surface-600'
                        }`}
                      >
                        {item}
                      </button>
                    )
                  )}
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-2.5 py-1 rounded bg-surface-700 hover:bg-surface-600 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Declare Winner Dialog */}
      <ConfirmDialog
        isOpen={!!winnerDialogUser}
        onClose={() => setWinnerDialogUser(null)}
        onConfirm={() => winnerDialogUser && declareWinnerMutation.mutate(winnerDialogUser.userId)}
        icon="🏆"
        variant="warning"
        title={`Declare ${winnerDialogUser?.username} as Winner?`}
        message={`This will end "${competitionName}" and crown this participant as the champion.`}
        items={[
          `${winnerDialogUser?.username} will be marked as WINNER`,
          'All other active participants will be eliminated',
          'The competition will be marked as COMPLETED',
        ]}
        confirmText="Yes, Declare Winner"
      />

      {/* Remove Participant Dialog */}
      <ConfirmDialog
        isOpen={!!removeDialogUser}
        onClose={() => setRemoveDialogUser(null)}
        onConfirm={() => removeDialogUser && removeMutation.mutate(removeDialogUser.userId)}
        variant="danger"
        title={`Remove ${removeDialogUser?.username}?`}
        message={`This will remove them from "${competitionName}" and delete all their picks and results.`}
        confirmText="Yes, Remove"
      />
    </div>
  );
}

// ── Clubs Tab ───────────────────────────────────────────────────────

function ClubsTab() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [clubAdminUserId, setClubAdminUserId] = useState('');
  const [assigningClub, setAssigningClub] = useState<Club | null>(null);
  const [assignUserId, setAssignUserId] = useState('');
  const [deletingClub, setDeletingClub] = useState<Club | null>(null);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { data: clubs, isLoading } = useQuery<Club[]>({
    queryKey: ['admin', 'clubs'],
    queryFn: () => api.get('/admin/clubs').then((r) => Array.isArray(r.data) ? r.data : []),
  });

  const { data: users } = useQuery<AdminUser[]>({
    queryKey: ['admin', 'users'],
    queryFn: () => api.get('/admin/users').then((r) => Array.isArray(r.data) ? r.data : []),
  });

  const eligibleUsers = (users ?? []).filter((u) => u.role !== 'ADMIN');

  const createMutation = useMutation({
    mutationFn: () => api.post('/admin/clubs', {
      name, description: description || null,
      clubAdminUserId: clubAdminUserId ? Number(clubAdminUserId) : null,
    }),
    onSuccess: () => {
      toast.success('Club created!');
      queryClient.invalidateQueries({ queryKey: ['admin', 'clubs'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['clubs'] });
      setShowForm(false);
      setName(''); setDescription(''); setClubAdminUserId('');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to create club'),
  });

  const assignAdminMutation = useMutation({
    mutationFn: ({ clubId, userId }: { clubId: number; userId: number }) =>
      api.put(`/admin/clubs/${clubId}`, { clubAdminUserId: userId }),
    onSuccess: () => {
      toast.success('Club admin assigned!');
      queryClient.invalidateQueries({ queryKey: ['admin', 'clubs'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setAssigningClub(null); setAssignUserId('');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to assign admin'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/clubs/${id}`),
    onSuccess: () => {
      toast.success('Club deleted');
      queryClient.invalidateQueries({ queryKey: ['admin', 'clubs'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['clubs'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Delete failed'),
  });

  const filtered = (clubs ?? []).filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.description ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (c.clubAdminUsername ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(currentPage, totalPages);
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const handleSearch = (q: string) => { setSearch(q); setCurrentPage(1); };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Manage Clubs</h2>
          <p className="text-sm text-gray-400 mt-1">Each club can have a Club Admin who manages its competitions independently.</p>
        </div>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Search clubs…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="input-field w-auto min-w-[180px]"
          />
          <button onClick={() => setShowForm(!showForm)} className="btn-primary whitespace-nowrap">
            {showForm ? 'Cancel' : '+ New Club'}
          </button>
        </div>
      </div>

      {/* Create form */}
      {showForm && (
        <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(); }} className="card space-y-4">
          <h3 className="font-semibold text-gray-200">Onboard New Club</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">Club Name *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="input-field" required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">Description</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} className="input-field" placeholder="Optional" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-300">
                Assign Club Admin
                <span className="ml-2 text-xs text-gray-500 font-normal">— this user will manage the club's competitions</span>
              </label>
              <select value={clubAdminUserId} onChange={(e) => setClubAdminUserId(e.target.value)} className="input-field">
                <option value="">No admin yet (assign later)</option>
                {eligibleUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.username} ({u.email}){u.role === 'CLUB_ADMIN' ? ' — already a Club Admin' : ''}
                  </option>
                ))}
              </select>
              {clubAdminUserId && (
                <p className="mt-1 text-xs text-yellow-400">This user will be promoted to Club Admin role automatically.</p>
              )}
            </div>
          </div>
          <button type="submit" disabled={createMutation.isPending} className="btn-primary">
            {createMutation.isPending ? 'Creating…' : 'Create Club'}
          </button>
        </form>
      )}

      {/* Assign Admin panel */}
      {assigningClub && (
        <div className="card border-brand-500/40 space-y-4">
          <h3 className="font-semibold text-gray-200">Assign Admin to "{assigningClub.name}"</h3>
          <select value={assignUserId} onChange={(e) => setAssignUserId(e.target.value)} className="input-field" autoFocus>
            <option value="">Select a user…</option>
            {eligibleUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.username} ({u.email}){u.role === 'CLUB_ADMIN' ? ' — Club Admin' : ''}
              </option>
            ))}
          </select>
          <div className="flex gap-3">
            <button
              onClick={() => assignAdminMutation.mutate({ clubId: assigningClub.id, userId: Number(assignUserId) })}
              disabled={!assignUserId || assignAdminMutation.isPending}
              className="btn-primary"
            >
              {assignAdminMutation.isPending ? 'Assigning…' : 'Assign'}
            </button>
            <button onClick={() => { setAssigningClub(null); setAssignUserId(''); }} className="btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-10">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        </div>
      ) : !filtered.length ? (
        <div className="card py-12 text-center">
          <div className="text-4xl mb-3">🏠</div>
          <p className="text-gray-400">{search ? `No clubs match "${search}"` : 'No clubs yet. Create one to get started.'}</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          {/* Table header bar */}
          <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-gray-700">
            <span className="text-sm text-gray-400">
              {filtered.length} club{filtered.length !== 1 ? 's' : ''}
              {search && ` matching "${search}"`}
            </span>
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <span>Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                className="rounded bg-surface-700 border border-gray-600 px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-brand-500"
              >
                {[5, 10, 20, 50].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>

          {/* Mobile: card list */}
          <div className="divide-y divide-gray-700/50 sm:hidden">
            {paginated.map((club) => (
              <div key={club.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-white truncate">{club.name}</p>
                    {club.description && <p className="text-xs text-gray-400 mt-0.5 truncate">{club.description}</p>}
                  </div>
                  {club.clubAdminUsername
                    ? <span className="badge-blue shrink-0">{club.clubAdminUsername}</span>
                    : <span className="text-gray-600 italic text-xs shrink-0">No admin</span>
                  }
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => { setAssigningClub(club); setAssignUserId(String(club.clubAdminId ?? '')); }}
                    className="text-xs px-2.5 py-1 rounded bg-surface-700 hover:bg-surface-600 text-gray-300 transition"
                  >
                    {club.clubAdminUsername ? 'Change Admin' : 'Assign Admin'}
                  </button>
                  <button
                    onClick={() => setDeletingClub(club)}
                    disabled={deleteMutation.isPending}
                    className="text-xs px-2.5 py-1 rounded bg-red-600/20 hover:bg-red-600/40 text-red-400 transition"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 text-left text-gray-400">
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4">Club Admin</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((club) => (
                  <tr key={club.id} className="border-b border-gray-700/50 hover:bg-surface-700/30">
                    <td className="py-3 px-4 font-medium">{club.name}</td>
                    <td className="py-3 px-4 text-gray-400">{club.description || '—'}</td>
                    <td className="py-3 px-4">
                      {club.clubAdminUsername
                        ? <span className="badge-blue">{club.clubAdminUsername}</span>
                        : <span className="text-gray-600 italic text-xs">None</span>
                      }
                    </td>
                    <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                      <button
                        onClick={() => { setAssigningClub(club); setAssignUserId(String(club.clubAdminId ?? '')); }}
                        className="text-xs px-2.5 py-1 rounded bg-surface-700 hover:bg-surface-600 text-gray-300 transition"
                      >
                        {club.clubAdminUsername ? 'Change Admin' : 'Assign Admin'}
                      </button>
                      <button
                        onClick={() => setDeletingClub(club)}
                        disabled={deleteMutation.isPending}
                        className="text-xs px-2.5 py-1 rounded bg-red-600/20 hover:bg-red-600/40 text-red-400 transition"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination footer */}
          {totalPages > 1 && (
            <div className="border-t border-gray-700 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
              <p className="text-sm text-gray-400">
                Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of {filtered.length}
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => setCurrentPage(1)} disabled={page === 1}
                  className="px-2 py-1 text-xs rounded bg-surface-700 hover:bg-surface-600 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition">«</button>
                <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                  className="px-3 py-1 text-xs rounded bg-surface-700 hover:bg-surface-600 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition">← Prev</button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                  .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                    if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('...');
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, idx) =>
                    p === '...' ? (
                      <span key={`e-${idx}`} className="px-2 py-1 text-xs text-gray-500">…</span>
                    ) : (
                      <button key={p} onClick={() => setCurrentPage(p as number)}
                        className={`px-3 py-1 text-xs rounded transition ${page === p ? 'bg-brand-600 text-white font-medium' : 'bg-surface-700 hover:bg-surface-600 text-gray-300'}`}>
                        {p}
                      </button>
                    )
                  )}
                <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="px-3 py-1 text-xs rounded bg-surface-700 hover:bg-surface-600 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition">Next →</button>
                <button onClick={() => setCurrentPage(totalPages)} disabled={page === totalPages}
                  className="px-2 py-1 text-xs rounded bg-surface-700 hover:bg-surface-600 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition">»</button>
              </div>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deletingClub}
        onClose={() => setDeletingClub(null)}
        onConfirm={() => deletingClub && deleteMutation.mutate(deletingClub.id)}
        variant="danger"
        title={`Delete "${deletingClub?.name}"?`}
        message="The club will be removed. Its competitions will not be deleted."
        confirmText="Yes, Delete Club"
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}


// ── Users Tab ───────────────────────────────────────────────────────

interface AdminUser {
  id: number;
  email: string;
  username: string;
  role: 'USER' | 'CLUB_ADMIN' | 'ADMIN';
  disabled: boolean;
  createdAt: string;
}

function UsersTab() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'USER' | 'CLUB_ADMIN' | 'ADMIN'>('USER');
  const [search, setSearch] = useState('');
  const [deletingUser, setDeletingUser] = useState<AdminUser | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { data: users, isLoading } = useQuery<AdminUser[]>({
    queryKey: ['admin', 'users'],
    queryFn: () => api.get('/admin/users').then((r) => Array.isArray(r.data) ? r.data : []),
  });

  const createMutation = useMutation({
    mutationFn: () => api.post('/admin/users', { email, username, password, role }),
    onSuccess: () => {
      toast.success('User created!');
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setShowForm(false);
      setEmail(''); setUsername(''); setPassword(''); setRole('USER');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to create user'),
  });

  const toggleDisabledMutation = useMutation({
    mutationFn: (userId: number) => api.put(`/admin/users/${userId}/toggle-disabled`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }); toast.success('User updated'); },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to update'),
  });

  const changeRoleMutation = useMutation({
    mutationFn: ({ userId, newRole }: { userId: number; newRole: string }) =>
      api.put(`/admin/users/${userId}/role`, { role: newRole }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }); toast.success('Role updated'); },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to update role'),
  });

  const deleteMutation = useMutation({
    mutationFn: (userId: number) => api.delete(`/admin/users/${userId}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }); toast.success('User deleted'); },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to delete user'),
  });

  const filtered = (users ?? []).filter((u) =>
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(currentPage, totalPages);
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  // Reset to page 1 when search changes
  const handleSearch = (q: string) => { setSearch(q); setCurrentPage(1); };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h2 className="text-xl font-semibold">Manage Users</h2>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Search users..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="input-field w-auto min-w-[200px]"
            aria-label="Search users"
          />
          <button onClick={() => setShowForm(!showForm)} className="btn-primary whitespace-nowrap">
            {showForm ? 'Cancel' : '+ Add User'}
          </button>
        </div>
      </div>

      {showForm && (
        <form
          onSubmit={(e) => { e.preventDefault(); createMutation.mutate(); }}
          className="card space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input-field" required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">Username</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} className="input-field" required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input-field" required minLength={6} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value as 'USER' | 'CLUB_ADMIN' | 'ADMIN')} className="input-field">
                <option value="USER">User</option>
                <option value="CLUB_ADMIN">Club Admin</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
          </div>
          <button type="submit" disabled={createMutation.isPending} className="btn-primary">
            {createMutation.isPending ? 'Creating…' : 'Create User'}
          </button>
        </form>
      )}

      {isLoading ? (
        <div className="flex justify-center py-10">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        </div>
      ) : !filtered.length ? (
        <div className="card py-12 text-center">
          <p className="text-gray-400">{search ? `No users match "${search}"` : 'No users found'}</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          {/* Table header bar */}
          <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-gray-700">
            <span className="text-sm text-gray-400">
              {filtered.length} user{filtered.length !== 1 ? 's' : ''}
              {search && ` matching "${search}"`}
            </span>
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <span>Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                className="rounded bg-surface-700 border border-gray-600 px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-brand-500"
              >
                {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>

          {/* ── Mobile: card list ── */}
          <div className="divide-y divide-gray-700/50 sm:hidden">
            {paginated.map((u) => (
              <div key={u.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-white truncate">{u.username}</p>
                    <p className="text-xs text-gray-400 truncate">{u.email}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{parseDate(u.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    {u.disabled ? <span className="badge-red">Disabled</span> : <span className="badge-green">Active</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    value={u.role}
                    onChange={(e) => changeRoleMutation.mutate({ userId: u.id, newRole: e.target.value })}
                    className="rounded bg-surface-700 border border-gray-600 px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-brand-500"
                  >
                    <option value="USER">USER</option>
                    <option value="CLUB_ADMIN">CLUB_ADMIN</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                  <button
                    onClick={() => toggleDisabledMutation.mutate(u.id)}
                    disabled={toggleDisabledMutation.isPending}
                    className={`text-xs px-2.5 py-1 rounded transition ${
                      u.disabled
                        ? 'bg-green-600/20 hover:bg-green-600/40 text-green-400'
                        : 'bg-yellow-600/20 hover:bg-yellow-600/40 text-yellow-400'
                    }`}
                  >
                    {u.disabled ? 'Enable' : 'Disable'}
                  </button>
                  <button
                    onClick={() => setDeletingUser(u)}
                    disabled={deleteMutation.isPending}
                    className="text-xs px-2.5 py-1 rounded bg-red-600/20 hover:bg-red-600/40 text-red-400 transition"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* ── Desktop: table ── */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 text-left text-gray-400">
                  <th className="py-3 px-4">Username</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Joined</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((u) => (
                  <tr key={u.id} className="border-b border-gray-700/50 hover:bg-surface-700/30">
                    <td className="py-3 px-4 font-medium">{u.username}</td>
                    <td className="py-3 px-4 text-gray-400">{u.email}</td>
                    <td className="py-3 px-4">
                      <select
                        value={u.role}
                        onChange={(e) => changeRoleMutation.mutate({ userId: u.id, newRole: e.target.value })}
                        className="rounded bg-surface-700 border border-gray-600 px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-brand-500"
                      >
                        <option value="USER">USER</option>
                        <option value="CLUB_ADMIN">CLUB_ADMIN</option>
                        <option value="ADMIN">ADMIN</option>
                      </select>
                    </td>
                    <td className="py-3 px-4">
                      {u.disabled ? <span className="badge-red">Disabled</span> : <span className="badge-green">Active</span>}
                    </td>
                    <td className="py-3 px-4 text-gray-400 whitespace-nowrap">
                      {parseDate(u.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => toggleDisabledMutation.mutate(u.id)}
                          disabled={toggleDisabledMutation.isPending}
                          className={`text-xs px-2.5 py-1 rounded transition ${
                            u.disabled
                              ? 'bg-green-600/20 hover:bg-green-600/40 text-green-400'
                              : 'bg-yellow-600/20 hover:bg-yellow-600/40 text-yellow-400'
                          }`}
                        >
                          {u.disabled ? 'Enable' : 'Disable'}
                        </button>
                        <button
                          onClick={() => setDeletingUser(u)}
                          disabled={deleteMutation.isPending}
                          className="text-xs px-2.5 py-1 rounded bg-red-600/20 hover:bg-red-600/40 text-red-400 transition"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination footer */}
          {totalPages > 1 && (
            <div className="border-t border-gray-700 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
              <p className="text-sm text-gray-400">
                Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of {filtered.length}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={page === 1}
                  className="px-2 py-1 text-xs rounded bg-surface-700 hover:bg-surface-600 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  «
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 text-xs rounded bg-surface-700 hover:bg-surface-600 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  ← Prev
                </button>

                {/* Page number buttons */}
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                  .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                    if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('...');
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, idx) =>
                    p === '...' ? (
                      <span key={`ellipsis-${idx}`} className="px-2 py-1 text-xs text-gray-500">…</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setCurrentPage(p as number)}
                        className={`px-3 py-1 text-xs rounded transition ${
                          page === p
                            ? 'bg-brand-600 text-white font-medium'
                            : 'bg-surface-700 hover:bg-surface-600 text-gray-300'
                        }`}
                      >
                        {p}
                      </button>
                    )
                  )}

                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1 text-xs rounded bg-surface-700 hover:bg-surface-600 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  Next →
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={page === totalPages}
                  className="px-2 py-1 text-xs rounded bg-surface-700 hover:bg-surface-600 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  »
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deletingUser}
        onClose={() => setDeletingUser(null)}
        onConfirm={() => deletingUser && deleteMutation.mutate(deletingUser.id)}
        variant="danger"
        title={`Delete "${deletingUser?.username}"?`}
        message="This will permanently remove the user account and all their competition data."
        confirmText="Yes, Delete User"
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}


// ── Sync Tab ────────────────────────────────────────────────────────

function SyncTab() {
  const syncMutation = useMutation({
    mutationFn: () => api.post('/admin/fixtures/import/sync'),
    onSuccess: () => toast.success('Sync triggered successfully!'),
    onError: () => toast.error('Sync failed'),
  });

  return (
    <div className="card space-y-4">
      <h2 className="text-xl font-semibold">Fixture Sync</h2>
      <p className="text-gray-400">
        Manually trigger a sync of teams, fixtures, and results from the data provider.
        This normally runs automatically every 15 minutes.
      </p>
      <button
        onClick={() => syncMutation.mutate()}
        disabled={syncMutation.isPending}
        className="btn-primary"
      >
        {syncMutation.isPending ? 'Syncing…' : 'Trigger Sync Now'}
      </button>
    </div>
  );
}

// ── Simulate Tab ────────────────────────────────────────────────────

interface Fixture {
  id: number;
  gameweekId: number;
  weekNumber: number;
  homeTeamId: number;
  homeTeamName: string;
  homeTeamShortName: string;
  awayTeamId: number;
  awayTeamName: string;
  awayTeamShortName: string;
  kickoffAt: string | number[];
  status: string;
  scoreHome: number | null;
  scoreAway: number | null;
  hasOverride: boolean;
  gameweekLockAt: string | number[];
  gameweekStatus: string;
}

interface GameweekWithFixtures {
  id: number;
  weekNumber: number;
  status: string;
  lockAt: string | number[];
  startsAt: string | number[];
  fixtures: Fixture[];
}

function SimulateTab() {
  const queryClient = useQueryClient();
  const [selectedCompId, setSelectedCompId] = useState<string>('');
  const [selectedGwId, setSelectedGwId] = useState<string>('');
  const [fixtureResults, setFixtureResults] = useState<Record<number, { status: string; scoreHome: string; scoreAway: string }>>({});
  const [skipAutoComplete, setSkipAutoComplete] = useState(false);

  const { data: competitions } = useQuery<Competition[]>({
    queryKey: ['admin', 'competitions'],
    queryFn: () => api.get('/admin/competitions').then((r) => Array.isArray(r.data) ? r.data : []),
  });

  const { data: gameweeks, isLoading: gwLoading } = useQuery<GameweekWithFixtures[]>({
    queryKey: ['admin', 'gameweeks', selectedCompId],
    queryFn: () => api.get(`/admin/competitions/${selectedCompId}/gameweeks`).then((r) => r.data),
    enabled: !!selectedCompId,
  });

  const selectedGameweek = gameweeks?.find((gw) => gw.id === Number(selectedGwId));
  const selectedCompetition = competitions?.find((c) => c.id === Number(selectedCompId));

  const simulateMutation = useMutation({
    mutationFn: () => {
      const payload: Record<string, any> = {};
      Object.entries(fixtureResults).forEach(([fixtureId, result]) => {
        if (result.status || result.scoreHome || result.scoreAway) {
          payload[fixtureId] = {
            status: result.status || null,
            scoreHome: result.scoreHome ? parseInt(result.scoreHome, 10) : null,
            scoreAway: result.scoreAway ? parseInt(result.scoreAway, 10) : null,
          };
        }
      });
      return api.post(`/admin/competitions/${selectedCompId}/gameweeks/${selectedGwId}/simulate`, { 
        fixtures: payload,
        skipAutoComplete: skipAutoComplete
      });
    },
    onSuccess: (response) => {
      const data = response.data;
      if (data.newStatus === 'PROCESSING') {
        // Async processing started — poll until done
        toast.success('Processing started…', { duration: 3000 });
        const poll = setInterval(async () => {
          try {
            const gws = await api.get(`/admin/competitions/${selectedCompId}/gameweeks`);
            const gw = gws.data?.find((g: any) => g.id === selectedGwId);
            if (gw && gw.status !== 'LOCKED' && gw.status !== 'IN_PROGRESS') {
              clearInterval(poll);
              toast.success(`Gameweek ${data.gameweekId} processing complete! Status: ${gw.status}`, { duration: 5000 });
              queryClient.invalidateQueries({ queryKey: ['admin', 'gameweeks', selectedCompId] });
              queryClient.invalidateQueries({ queryKey: ['admin', 'participants'] });
              queryClient.invalidateQueries({ queryKey: ['admin', 'competitions'] });
              queryClient.invalidateQueries({ queryKey: ['competitions'] });
              setFixtureResults({});
            }
          } catch { clearInterval(poll); }
        }, 2000);
        // Safety — stop polling after 2 minutes
        setTimeout(() => clearInterval(poll), 120_000);
      } else {
        let message = `Gameweek ${data.gameweekId} processed! Status: ${data.newStatus}.`;
        if (data.competitionStatus) message += ` Competition: ${data.competitionStatus}.`;
        if (data.activeParticipants !== undefined && data.activeParticipants >= 0) {
          message += ` ${data.activeParticipants} active participant${data.activeParticipants !== 1 ? 's' : ''} remaining.`;
        }
        toast.success(message, { duration: 6000 });
        queryClient.invalidateQueries({ queryKey: ['admin', 'gameweeks', selectedCompId] });
        queryClient.invalidateQueries({ queryKey: ['admin', 'participants'] });
        queryClient.invalidateQueries({ queryKey: ['admin', 'competitions'] });
        queryClient.invalidateQueries({ queryKey: ['competitions'] });
        setFixtureResults({});
      }
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Simulation failed'),
  });

  const handleSetResult = (fixtureId: number, field: 'status' | 'scoreHome' | 'scoreAway', value: string) => {
    setFixtureResults((prev) => ({
      ...prev,
      [fixtureId]: { ...prev[fixtureId], [field]: value },
    }));
  };

  const handleQuickWin = (fixture: Fixture, team: 'home' | 'away') => {
    setFixtureResults((prev) => ({
      ...prev,
      [fixture.id]: {
        status: 'FINISHED',
        scoreHome: team === 'home' ? '2' : '1',
        scoreAway: team === 'away' ? '2' : '1',
      },
    }));
  };

  const handleQuickDraw = (fixture: Fixture) => {
    setFixtureResults((prev) => ({
      ...prev,
      [fixture.id]: { status: 'FINISHED', scoreHome: '1', scoreAway: '1' },
    }));
  };

  const handlePostpone = (fixture: Fixture) => {
    setFixtureResults((prev) => ({
      ...prev,
      [fixture.id]: { status: 'POSTPONED', scoreHome: '', scoreAway: '' },
    }));
  };

  /** Randomise a single fixture — ~45% home win, ~25% away win, ~30% draw */
  const randomiseFixture = (fixture: Fixture) => {
    const roll = Math.random();
    let scoreHome: number;
    let scoreAway: number;
    if (roll < 0.45) {
      // Home win
      scoreHome = Math.floor(Math.random() * 4) + 1;
      scoreAway = Math.floor(Math.random() * scoreHome);
    } else if (roll < 0.70) {
      // Away win
      scoreAway = Math.floor(Math.random() * 4) + 1;
      scoreHome = Math.floor(Math.random() * scoreAway);
    } else {
      // Draw
      const goals = Math.floor(Math.random() * 4);
      scoreHome = goals;
      scoreAway = goals;
    }
    setFixtureResults((prev) => ({
      ...prev,
      [fixture.id]: {
        status: 'FINISHED',
        scoreHome: String(scoreHome),
        scoreAway: String(scoreAway),
      },
    }));
  };

  const handleRandomiseAll = () => {
    if (!selectedGameweek) return;
    selectedGameweek.fixtures.forEach(randomiseFixture);
  };

  const handleClearAll = () => setFixtureResults({});

  // Randomise all then immediately submit
  const bulkMutation = useMutation({
    mutationFn: () => {
      if (!selectedGameweek) throw new Error('No gameweek selected');
      // Build random results for every fixture
      const payload: Record<string, any> = {};
      selectedGameweek.fixtures.forEach((fixture) => {
        const roll = Math.random();
        let scoreHome: number, scoreAway: number;
        if (roll < 0.45) { scoreHome = Math.floor(Math.random() * 4) + 1; scoreAway = Math.floor(Math.random() * scoreHome); }
        else if (roll < 0.70) { scoreAway = Math.floor(Math.random() * 4) + 1; scoreHome = Math.floor(Math.random() * scoreAway); }
        else { const g = Math.floor(Math.random() * 4); scoreHome = g; scoreAway = g; }
        payload[fixture.id] = { status: 'FINISHED', scoreHome, scoreAway };
      });
      return api.post(`/admin/competitions/${selectedCompId}/gameweeks/${selectedGwId}/simulate`, {
        fixtures: payload,
        skipAutoComplete: skipAutoComplete,
      });
    },
    onSuccess: (response) => {
      const data = response.data;
      let message = `GW${data.gameweekId} processed! ${data.activeParticipants ?? 0} active remaining.`;
      toast.success(message, { duration: 5000 });
      queryClient.invalidateQueries({ queryKey: ['admin', 'gameweeks', selectedCompId] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'participants'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'competitions'] });
      queryClient.invalidateQueries({ queryKey: ['competitions'] });
      setFixtureResults({});
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Bulk simulation failed'),
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Simulate Gameweek Results</h2>
        <p className="text-sm text-gray-400 mt-1">
          Test the elimination logic by setting fixture results and processing the gameweek.
        </p>
      </div>

      {/* Step 1: Select Competition */}
      <div className="card space-y-4">
        <h3 className="font-semibold text-gray-200">1. Select Competition</h3>
        <select
          value={selectedCompId}
          onChange={(e) => {
            setSelectedCompId(e.target.value);
            setSelectedGwId('');
            setFixtureResults({});
          }}
          className="input-field"
        >
          <option value="">Choose a competition…</option>
          {competitions?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.status}) — {c.participantCount} participants
            </option>
          ))}
        </select>
      </div>

      {/* Step 2: Select Gameweek */}
      {selectedCompId && (
        <div className="card space-y-4">
          <h3 className="font-semibold text-gray-200">2. Select Gameweek</h3>
          {gwLoading ? (
            <div className="flex justify-center py-4">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
            </div>
          ) : !gameweeks?.length ? (
            <p className="text-gray-400 text-sm">No gameweeks found for this competition.</p>
          ) : (
            <select
              value={selectedGwId}
              onChange={(e) => {
                setSelectedGwId(e.target.value);
                setFixtureResults({});
              }}
              className="input-field"
            >
              <option value="">Choose a gameweek…</option>
              {gameweeks.map((gw) => (
                <option key={gw.id} value={gw.id}>
                  GW{gw.weekNumber} — {gw.status} — {gw.fixtures.length} fixtures — Locks: {parseDate(gw.lockAt).toLocaleString()}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Step 3: Set Fixture Results */}
      {selectedGameweek && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-200">
              3. Set Fixture Results for GW{selectedGameweek.weekNumber}
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRandomiseAll}
                className="text-xs px-3 py-1.5 rounded bg-brand-600/20 hover:bg-brand-600/40 text-brand-400 transition font-medium"
                title="Randomly generate results for all fixtures"
              >
                🎲 Randomise All
              </button>
              <button
                onClick={() => bulkMutation.mutate()}
                disabled={bulkMutation.isPending || !selectedGwId}
                className="text-xs px-3 py-1.5 rounded bg-green-600/20 hover:bg-green-600/40 text-green-400 transition font-medium disabled:opacity-40"
                title="Randomise all fixtures and immediately process results"
              >
                {bulkMutation.isPending ? '⏳ Processing…' : '⚡ Randomise & Process All'}
              </button>
              <button
                onClick={handleClearAll}
                className="text-xs px-3 py-1.5 rounded bg-gray-600/20 hover:bg-gray-600/40 text-gray-400 transition"
                title="Clear all results"
              >
                ✕ Clear All
              </button>
              <span className={`text-xs px-2 py-1 rounded ${
                selectedGameweek.status === 'COMPLETED' ? 'bg-green-600/20 text-green-400' :
                selectedGameweek.status === 'IN_PROGRESS' ? 'bg-yellow-600/20 text-yellow-400' :
                selectedGameweek.status === 'LOCKED' ? 'bg-blue-600/20 text-blue-400' :
                'bg-gray-600/20 text-gray-400'
              }`}>
                {selectedGameweek.status}
              </span>
            </div>
          </div>

          {selectedGameweek.fixtures.length === 0 ? (
            <p className="text-gray-400 text-sm">No fixtures in this gameweek.</p>
          ) : (
            <div className="space-y-3">
              {selectedGameweek.fixtures.map((fixture) => {
                const result = fixtureResults[fixture.id] || { status: '', scoreHome: '', scoreAway: '' };
                const hasResult = !!result.status;
                return (
                  <div key={fixture.id} className={`rounded-lg p-4 space-y-3 transition-colors ${
                    hasResult ? 'bg-brand-600/10 border border-brand-600/30' : 'bg-surface-700/50'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 text-sm">
                        <span className="font-medium text-gray-200">{fixture.homeTeamName}</span>
                        {/* Live result preview */}
                        {hasResult && result.status === 'FINISHED' ? (
                          <span className="font-bold text-white bg-surface-700 px-2 py-0.5 rounded text-xs">
                            {result.scoreHome} - {result.scoreAway}
                          </span>
                        ) : hasResult && result.status === 'POSTPONED' ? (
                          <span className="badge-yellow text-xs">PP</span>
                        ) : (
                          <span className="text-gray-500 text-xs">vs</span>
                        )}
                        <span className="font-medium text-gray-200">{fixture.awayTeamName}</span>
                        {fixture.hasOverride && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-600/20 text-yellow-400">
                            Override
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500">
                        {parseDate(fixture.kickoffAt).toLocaleString(undefined, {
                          day: '2-digit', month: '2-digit', year: 'numeric',
                          hour: '2-digit', minute: '2-digit', hour12: false
                        })}
                      </span>
                    </div>

                    {/* Quick Actions */}
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleQuickWin(fixture, 'home')}
                        className="text-xs px-2.5 py-1 rounded bg-green-600/20 hover:bg-green-600/40 text-green-400 transition"
                      >
                        {fixture.homeTeamShortName} Win
                      </button>
                      <button
                        onClick={() => handleQuickDraw(fixture)}
                        className="text-xs px-2.5 py-1 rounded bg-gray-600/20 hover:bg-gray-600/40 text-gray-400 transition"
                      >
                        Draw
                      </button>
                      <button
                        onClick={() => handleQuickWin(fixture, 'away')}
                        className="text-xs px-2.5 py-1 rounded bg-green-600/20 hover:bg-green-600/40 text-green-400 transition"
                      >
                        {fixture.awayTeamShortName} Win
                      </button>
                      <button
                        onClick={() => handlePostpone(fixture)}
                        className="text-xs px-2.5 py-1 rounded bg-orange-600/20 hover:bg-orange-600/40 text-orange-400 transition"
                      >
                        Postpone
                      </button>
                      <button
                        onClick={() => randomiseFixture(fixture)}
                        className="text-xs px-2.5 py-1 rounded bg-brand-600/20 hover:bg-brand-600/40 text-brand-400 transition ml-auto"
                        title="Generate a random result for this fixture"
                      >
                        🎲
                      </button>
                    </div>

                    {/* Manual Entry */}
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Status</label>
                        <select
                          value={result.status}
                          onChange={(e) => handleSetResult(fixture.id, 'status', e.target.value)}
                          className="w-full px-2 py-1 text-sm rounded bg-surface-800 border border-gray-600 text-gray-200 focus:outline-none focus:border-brand-500"
                        >
                          <option value="">—</option>
                          <option value="FINISHED">FINISHED</option>
                          <option value="POSTPONED">POSTPONED</option>
                          <option value="CANCELLED">CANCELLED</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Home Score</label>
                        <input
                          type="number"
                          min="0"
                          value={result.scoreHome}
                          onChange={(e) => handleSetResult(fixture.id, 'scoreHome', e.target.value)}
                          className="w-full px-2 py-1 text-sm rounded bg-surface-800 border border-gray-600 text-gray-200 focus:outline-none focus:border-brand-500"
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Away Score</label>
                        <input
                          type="number"
                          min="0"
                          value={result.scoreAway}
                          onChange={(e) => handleSetResult(fixture.id, 'scoreAway', e.target.value)}
                          className="w-full px-2 py-1 text-sm rounded bg-surface-800 border border-gray-600 text-gray-200 focus:outline-none focus:border-brand-500"
                          placeholder="0"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Submit Button */}
          {selectedGameweek.fixtures.length > 0 && (
            <div className="pt-4 border-t border-gray-700 space-y-4">
              {/* Warning about auto-completion */}
              {selectedCompetition && selectedCompetition.participantCount > 1 && (
                <div className="bg-yellow-600/10 border border-yellow-600/30 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <span className="text-yellow-400 text-lg">⚠️</span>
                    <div className="text-sm text-yellow-200">
                      <p className="font-semibold mb-1">Auto-Completion Behavior</p>
                      <p className="text-yellow-300/90">
                        In "Last Man Standing", competitions automatically end when only 1 participant remains (winner) or all are eliminated.
                        If your simulation eliminates enough people, the competition will be marked as <strong>COMPLETED</strong>.
                      </p>
                      <p className="text-yellow-300/90 mt-2">
                        Current participants: <strong>{selectedCompetition.participantCount}</strong> 
                        {selectedCompetition.activeCount !== undefined && selectedCompetition.activeCount !== selectedCompetition.participantCount && (
                          <span> ({selectedCompetition.activeCount} active)</span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Skip auto-complete checkbox for testing */}
              <label className="flex items-start gap-3 text-sm text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={skipAutoComplete}
                  onChange={(e) => setSkipAutoComplete(e.target.checked)}
                  className="mt-0.5 rounded border-gray-600 text-brand-500 focus:ring-brand-500 focus:ring-offset-surface-800"
                />
                <div>
                  <span className="font-medium">Skip auto-complete (for testing multiple gameweeks)</span>
                  <p className="text-xs text-gray-400 mt-0.5">
                    When checked, the competition won't auto-complete even if only 1 participant remains. 
                    Use this to test multiple gameweeks in sequence.
                  </p>
                </div>
              </label>

              <button
                onClick={() => simulateMutation.mutate()}
                disabled={simulateMutation.isPending || Object.keys(fixtureResults).length === 0}
                className="btn-primary w-full"
              >
                {simulateMutation.isPending ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Processing…
                  </span>
                ) : (
                  `Process Results & Eliminate Participants`
                )}
              </button>

              {/* Processing overlay */}
              {simulateMutation.isPending && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-6">
                  <div className="h-16 w-16 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
                  <div className="text-center space-y-2">
                    <p className="text-xl font-bold text-white">Processing Gameweek Results…</p>
                    <p className="text-gray-300 text-sm">Evaluating picks, resolving eliminations. Please wait.</p>
                  </div>
                </div>
              )}
              {Object.keys(fixtureResults).length === 0 && (
                <p className="text-xs text-yellow-400 mt-2 text-center">
                  Set at least one fixture result to continue
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Instructions */}
      <div className="card bg-blue-600/10 border-blue-600/30">
        <h4 className="font-semibold text-blue-400 mb-2">ℹ️ How it works</h4>
        <ul className="text-sm text-gray-300 space-y-1 list-disc list-inside">
          <li>Select a competition and gameweek that hasn't been completed yet</li>
          <li>Use quick buttons or manually set scores/status for each fixture</li>
          <li>Click "Process Results" to apply overrides, lock picks, and determine eliminations</li>
          <li>Participants who picked losing/drawing teams will be eliminated immediately</li>
          <li><strong>Auto-completion:</strong> Competition automatically ends when ≤1 participant remains (unless you check "Skip auto-complete")</li>
          <li>Use "Skip auto-complete" checkbox to test multiple gameweeks sequentially</li>
          <li>Check the Participants panel in Competitions tab to see results</li>
        </ul>
      </div>
    </div>
  );
}

// ── Test Data Tab ───────────────────────────────────────────────────

function TestDataTab() {
  const queryClient = useQueryClient();
  const [selectedCompId, setSelectedCompId] = useState<string>('');
  const [userCount, setUserCount] = useState<number>(100);
  const [gameweeks, setGameweeks] = useState<string>('3,4,5,6');
  const [cleanupDialogOpen, setCleanupDialogOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useState<ReturnType<typeof setInterval> | null>(null);

  const { data: competitions } = useQuery<Competition[]>({
    queryKey: ['admin', 'competitions'],
    queryFn: () => api.get('/admin/competitions').then((r) => Array.isArray(r.data) ? r.data : []),
  });

  const generateMutation = useMutation({
    mutationFn: () => {
      const gwArray = gameweeks.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
      return api.post('/admin/test/generate', {
        competitionId: Number(selectedCompId),
        userCount: userCount,
        gameweeksToSeedPicks: gwArray,
      }, { timeout: 120_000 }); // 2 min — large batches take time over Supabase pooler
    },
    onSuccess: (response: any) => {
      const data = response.data;
      toast.success(
        `Created ${data.usersCreated} users, added ${data.participantsAdded} participants, created ${data.picksCreated} picks!`,
        { duration: 5000 }
      );
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      queryClient.invalidateQueries({ queryKey: ['competitions'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Generation failed'),
  });

  const cleanupMutation = useMutation({
    mutationFn: () => api.delete('/admin/test/cleanup', { timeout: 120_000 }),
    onSuccess: (response: any) => {
      toast.success(`Deleted ${response.data.usersDeleted} test users`);
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      queryClient.invalidateQueries({ queryKey: ['competitions'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Cleanup failed'),
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Generate Test Data</h2>
        <p className="text-sm text-gray-400 mt-1">
          Create hundreds of test users to test UI scaling and performance.
        </p>
      </div>

      {/* Generate Section */}
      <div className="card space-y-4">
        <h3 className="font-semibold text-gray-200">1. Generate Test Users</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-2">Select Competition</label>
            <select
              value={selectedCompId}
              onChange={(e) => setSelectedCompId(e.target.value)}
              className="input-field"
            >
              <option value="">Choose a competition…</option>
              {competitions?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.status}) — {c.participantCount} participants
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">Number of Test Users</label>
            <input
              type="number"
              min="10"
              max="500"
              step="10"
              value={userCount}
              onChange={(e) => setUserCount(Number(e.target.value))}
              className="input-field"
            />
            <p className="text-xs text-gray-500 mt-1">
              Recommended: 50-200 for testing. Higher numbers may take longer to generate.
            </p>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">
              Gameweeks to Seed Picks (comma-separated)
            </label>
            <input
              type="text"
              value={gameweeks}
              onChange={(e) => setGameweeks(e.target.value)}
              placeholder="e.g., 3,4,5,6"
              className="input-field"
            />
            <p className="text-xs text-gray-500 mt-1">
              Creates random picks for these gameweeks so you can simulate results without mass elimination.
            </p>
          </div>

          <div className="bg-blue-600/10 border border-blue-600/30 rounded-lg p-3">
            <h4 className="text-sm font-semibold text-blue-400 mb-2">ℹ️ What this does</h4>
            <ul className="text-xs text-gray-300 space-y-1 list-disc list-inside">
              <li>Creates {userCount} users with usernames: testuser001, testuser002, etc.</li>
              <li>All users have password: <code className="bg-surface-700 px-1 rounded">password123</code></li>
              <li>Joins all users to the selected competition</li>
              <li>Creates random picks for specified gameweeks (locked and ready to simulate)</li>
              <li>Distributes picks across all 20 teams randomly</li>
            </ul>
          </div>

          <button
            onClick={() => {
              setElapsed(0);
              const interval = setInterval(() => setElapsed(s => s + 1), 1000);
              timerRef[0] = interval;
              generateMutation.mutate(undefined, {
                onSettled: () => {
                  clearInterval(interval);
                  timerRef[0] = null;
                }
              });
            }}
            disabled={!selectedCompId || generateMutation.isPending || userCount < 1}
            className="btn-primary w-full"
          >
            {generateMutation.isPending ? (
              <span className="flex items-center justify-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Generating {userCount} users… ({elapsed}s)
              </span>
            ) : (
              `Generate ${userCount} Test Users`
            )}
          </button>

          {/* Full-screen overlay while generating */}
          {generateMutation.isPending && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-6">
              <div className="h-16 w-16 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
              <div className="text-center space-y-2">
                <p className="text-xl font-bold text-white">Generating {userCount} users…</p>
                <p className="text-gray-300 text-sm">This may take 30–60 seconds. Please wait.</p>
                <p className="text-brand-400 font-mono text-lg">{elapsed}s elapsed</p>
              </div>
              <div className="w-64 h-2 rounded-full bg-surface-700 overflow-hidden">
                <div
                  className="h-full bg-brand-500 rounded-full transition-all duration-1000"
                  style={{ width: `${Math.min((elapsed / 60) * 100, 95)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Cleanup Section */}
      <div className="card space-y-4 bg-red-600/5 border-red-600/30">
        <h3 className="font-semibold text-red-400">2. Cleanup Test Users</h3>
        <p className="text-sm text-gray-400">
          Remove all test users (username like 'testuser%') and their associated data (picks, participations).
        </p>

        <div className="bg-yellow-600/10 border border-yellow-600/30 rounded-lg p-3">
          <p className="text-xs text-yellow-300">
            ⚠️ <strong>Warning:</strong> This will permanently delete all users with usernames starting with "testuser"
            and all their picks and competition participations. This action cannot be undone.
          </p>
        </div>

        <button
          onClick={() => setCleanupDialogOpen(true)}
          disabled={cleanupMutation.isPending}
          className="px-4 py-2 rounded bg-red-600/20 hover:bg-red-600/40 text-red-400 transition font-medium w-full"
        >
          {cleanupMutation.isPending ? 'Cleaning up...' : 'Delete All Test Users'}
        </button>

        <ConfirmDialog
          isOpen={cleanupDialogOpen}
          onClose={() => setCleanupDialogOpen(false)}
          onConfirm={() => cleanupMutation.mutate()}
          variant="danger"
          icon="🧹"
          title="Delete All Test Users?"
          message='All users with usernames starting with "testuser" and all their data will be permanently removed.'
          items={[
            'All testuser accounts deleted',
            'All their picks and results deleted',
            'All their competition participations removed',
          ]}
          confirmText="Yes, Delete All"
          isPending={cleanupMutation.isPending}
        />
      </div>

      {/* Usage Instructions */}
      <div className="card bg-green-600/10 border-green-600/30">
        <h4 className="font-semibold text-green-400 mb-2">✅ How to test scaling</h4>
        <ol className="text-sm text-gray-300 space-y-2 list-decimal list-inside">
          <li>Select "Premier League Survivor 2026" competition</li>
          <li>Set user count to 100-200</li>
          <li>Set gameweeks to "3,4,5" (creates picks for GW3-5)</li>
          <li>Click "Generate Test Users"</li>
          <li>Wait for success message (~10-30 seconds for 200 users)</li>
          <li>Go to Simulate Results → Select GW3 → Process results</li>
          <li>View Results page → See pagination, search, filters in action!</li>
          <li>Test Table view vs. Cards view vs. By Team view</li>
          <li>When done testing: Click "Delete All Test Users" to cleanup</li>
        </ol>
      </div>
    </div>
  );
}

// ── Audit Tab ───────────────────────────────────────────────────────

function AuditTab() {
  const { data, isLoading } = useQuery<{ content: AuditLog[] }>({
    queryKey: ['audit'],
    queryFn: () => api.get('/admin/audit?page=0&size=50').then((r) => r.data),
  });

  if (isLoading) {
    return <div className="flex justify-center py-10"><div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" /></div>;
  }

  const logs = data?.content ?? [];

  return (
    <div className="card overflow-hidden">
      <h2 className="text-xl font-semibold mb-4">Audit Log</h2>
      {logs.length === 0 ? (
        <p className="text-gray-400 py-8 text-center">No audit entries yet</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-left text-gray-400">
                <th className="py-3 px-4">Time</th>
                <th className="py-3 px-4">Admin</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Entity</th>
                <th className="py-3 px-4">Field</th>
                <th className="py-3 px-4">Old → New</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-gray-700/50">
                  <td className="py-3 px-4 text-gray-400 whitespace-nowrap">
                    {parseDate(log.createdAt).toLocaleString(undefined, {
                      day: '2-digit', month: '2-digit', year: 'numeric',
                      hour: '2-digit', minute: '2-digit', hour12: false
                    })}
                  </td>
                  <td className="py-3 px-4">{log.username ?? '—'}</td>
                  <td className="py-3 px-4"><span className="badge-blue">{log.action}</span></td>
                  <td className="py-3 px-4 text-gray-400">{log.entityType} #{log.entityId}</td>
                  <td className="py-3 px-4 text-gray-400">{log.fieldName ?? '—'}</td>
                  <td className="py-3 px-4 text-gray-400">
                    {log.oldValue && <span className="text-red-400">{log.oldValue}</span>}
                    {log.oldValue && log.newValue && <span className="mx-1">→</span>}
                    {log.newValue && <span className="text-green-400">{log.newValue}</span>}
                    {!log.oldValue && !log.newValue && '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
