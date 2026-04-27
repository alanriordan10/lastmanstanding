import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import type { Competition, Club, Participant } from '../types';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import ConfirmDialog from '../components/ConfirmDialog';
import AddParticipantPanel from '../components/AddParticipantPanel';

function parseDate(value: string | number[]): Date {
  if (Array.isArray(value)) {
    const [y, m, d, h = 0, mi = 0, s = 0] = value as number[];
    return new Date(Date.UTC(y, m - 1, d, h, mi, s));
  }
  // Backend sends LocalDateTime without timezone — treat as UTC by appending Z
  const str = (value.endsWith('Z') || value.includes('+')) ? value : value + 'Z';
  return new Date(str);
}

export default function ClubAdminPage() {
  const { isClubAdmin, isAdmin, loginWithToken } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [managingComp, setManagingComp] = useState<Competition | null>(null);
  const [deletingComp, setDeletingComp] = useState<Competition | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [entryFee, setEntryFee] = useState('0');
  const [missedPickMode, setMissedPickMode] = useState('ELIMINATE');
  const [postponedConsumesTeam, setPostponedConsumesTeam] = useState(true);
  const [passFeeToParticipant, setPassFeeToParticipant] = useState(false);
  const [paymentMode, setPaymentMode] = useState<'FREE' | 'MANUAL' | 'STRIPE'>('FREE');
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>('PRIVATE');
  const [prizePool, setPrizePool] = useState('');
  const [startDate, setStartDate] = useState('');
  const [showAssignAdmin, setShowAssignAdmin] = useState(false);
  const [adminSearchQuery, setAdminSearchQuery] = useState('');
  const [adminSearchResults, setAdminSearchResults] = useState<{id: number; username: string; email: string}[]>([]);
  const [adminSearching, setAdminSearching] = useState(false);
  const adminDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Competition list controls
  const [compSearch, setCompSearch] = useState('');
  const [compStatusFilter, setCompStatusFilter] = useState<'ALL' | 'UPCOMING' | 'ACTIVE' | 'COMPLETED'>('ALL');
  const [compPage, setCompPage] = useState(1);
  const COMP_PAGE_SIZE = 8;

  const { data: myClub, isLoading: clubLoading, error: clubError } = useQuery<Club>({
    queryKey: ['club-admin', 'my-club'],
    queryFn: () => api.get('/club-admin/my-club').then((r) => r.data),
    enabled: isClubAdmin || isAdmin,
    retry: false,
  });

  const { data: competitions, isLoading } = useQuery<Competition[]>({
    queryKey: ['club-admin', 'competitions'],
    queryFn: () => api.get('/club-admin/competitions').then((r) => Array.isArray(r.data) ? r.data : []),
    enabled: !!myClub,
    staleTime: 0,
  });

  const createMutation = useMutation({
    mutationFn: () => api.post('/club-admin/competitions', {
      name,
      description: description || null,
      entryFee: parseFloat(entryFee) || 0,
      prizePool: prizePool ? parseFloat(prizePool) : null,
      missedPickMode,
      postponedConsumesTeam,
      passFeeToParticipant,
      paymentMode,
      visibility,
      startDate,
    }),
    onSuccess: (response) => {
      const created = response.data as Competition;
      toast.success(created.joinCode
        ? `Competition created! Join code: ${created.joinCode}`
        : 'Competition created!');
      queryClient.setQueryData<Competition[]>(['club-admin', 'competitions'], (old) =>
        old ? [response.data, ...old] : [response.data]
      );
      queryClient.invalidateQueries({ queryKey: ['club-admin', 'competitions'] });
      queryClient.invalidateQueries({ queryKey: ['competitions'] });
      setShowForm(false);
      setName('');
      setDescription('');
      setEntryFee('0');
      setStartDate('');
      setMissedPickMode('ELIMINATE');
      setPostponedConsumesTeam(true);
      setPassFeeToParticipant(false);
      setPaymentMode('FREE');
      setVisibility('PRIVATE');
      setPrizePool('');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to create competition'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/club-admin/competitions/${id}`),
    onSuccess: (_, deletedId) => {
      toast.success('Competition deleted');
      queryClient.setQueryData<Competition[]>(['club-admin', 'competitions'], (old) =>
        old ? old.filter((c) => c.id !== deletedId) : []
      );
      queryClient.invalidateQueries({ queryKey: ['club-admin', 'competitions'] });
      queryClient.invalidateQueries({ queryKey: ['competitions'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Delete failed'),
  });

  const assignAdminMutation = useMutation({
    mutationFn: (userId: number) => api.put('/club-admin/my-club/assign-admin', { userId }),
    onSuccess: () => {
      toast.success('Club admin updated successfully');
      queryClient.invalidateQueries({ queryKey: ['club-admin', 'my-club'] });
      setShowAssignAdmin(false);
      setAdminSearchQuery('');
      setAdminSearchResults([]);
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to assign admin'),
  });

  // Debounced user search for assign admin
  useEffect(() => {
    if (!showAssignAdmin) return;
    if (adminDebounceRef.current) clearTimeout(adminDebounceRef.current);
    if (adminSearchQuery.trim().length < 2) { setAdminSearchResults([]); return; }
    adminDebounceRef.current = setTimeout(async () => {
      setAdminSearching(true);
      try {
        const res = await api.get(`/club-admin/users/search?q=${encodeURIComponent(adminSearchQuery)}`);
        setAdminSearchResults(res.data);
      } catch {
        setAdminSearchResults([]);
      } finally {
        setAdminSearching(false);
      }
    }, 300);
    return () => { if (adminDebounceRef.current) clearTimeout(adminDebounceRef.current); };
  }, [adminSearchQuery, showAssignAdmin]);

  if (!isClubAdmin && !isAdmin) {
    return (
      <div className="card py-16 text-center">
        <p className="text-red-400 text-lg font-medium">Access denied</p>
      </div>
    );
  }

  if (clubLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  if (clubError || !myClub) {
    const is403 = (clubError as any)?.response?.status === 403;
    // If 403, refresh role from server so the nav link disappears automatically
    if (is403) {
      const token = localStorage.getItem('accessToken');
      if (token) loginWithToken(token).catch(() => {});
    }
    return (
      <div className="card py-16 text-center space-y-3">
        <div className="text-4xl">{is403 ? '🔒' : '🏠'}</div>
        <p className="text-lg font-medium text-gray-300">
          {is403 ? 'Club admin access revoked' : 'No club assigned'}
        </p>
        <p className="text-sm text-gray-400">
          {is403
            ? 'Your club admin role has been transferred to another user. Please log out and back in to refresh your session.'
            : "You haven't been assigned as admin of a club yet. Ask a super admin to assign you."}
        </p>
        {is403 && (
          <button
            onClick={() => { localStorage.clear(); window.location.href = '/login'; }}
            className="btn-primary mx-auto mt-2"
          >
            Log out & sign in again
          </button>
        )}
        {!is403 && (
          <p className="text-xs text-gray-500">
            If you were just assigned, try logging out and back in to refresh your session.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="relative overflow-hidden rounded-[1.85rem] border border-white/8 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.18),transparent_24rem),radial-gradient(circle_at_85%_16%,rgba(250,204,21,0.10),transparent_18rem),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(8,15,30,0.94))] px-5 py-5 shadow-[0_30px_75px_rgba(2,6,23,0.48)] sm:px-6 sm:py-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex rounded-full border border-brand-400/25 bg-brand-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-200">
              Club control
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">Club Admin</h1>
            <p className="mt-2 text-sm leading-6 text-gray-300 sm:text-[15px]">
              Running <span className="font-semibold text-white">{myClub.name}</span>
              {myClub.description && <span className="text-gray-400"> — {myClub.description}</span>}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <AdminHeroStat label="Competitions" value={String(competitions?.length ?? 0)} accent="text-brand-200" />
            <AdminHeroStat label="Upcoming" value={String(competitions?.filter((c) => c.status === 'UPCOMING').length ?? 0)} accent="text-cyan-200" />
            <AdminHeroStat label="Active" value={String(competitions?.filter((c) => c.status === 'ACTIVE').length ?? 0)} accent="text-green-200" />
          </div>
        </div>
        <div className="relative mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs uppercase tracking-[0.16em] text-gray-400">
            Admin: <span className="text-gray-200">{myClub.clubAdminUsername ?? '—'}</span>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="btn-primary w-full sm:w-auto">
            {showForm ? 'Cancel' : '+ New Competition'}
          </button>
        </div>
      </section>

      {/* Club settings card */}
      <div className="card space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-gray-200">Club Settings</h2>
            <p className="mt-1 text-xs text-gray-400">
              Transfer admin access or review club-level ownership details.
            </p>
          </div>
          <button
            onClick={() => { setShowAssignAdmin((v) => !v); setAdminSearchQuery(''); setAdminSearchResults([]); }}
            className="w-full sm:w-auto text-xs px-3 py-1.5 rounded-xl border border-white/10 bg-white/[0.04] text-gray-300 transition hover:border-white/15 hover:bg-white/[0.08]"
          >
            {showAssignAdmin ? '✕ Cancel' : '👤 Assign New Admin'}
          </button>
        </div>

        {showAssignAdmin && (
          <div className="rounded-lg border border-brand-500/30 bg-brand-500/5 p-4 space-y-3">
            <p className="text-xs text-gray-400">
              Search for a user to transfer club admin to. They will be promoted to Club Admin role and you will remain as a regular user.
            </p>
            <input
              type="text"
              value={adminSearchQuery}
              onChange={(e) => setAdminSearchQuery(e.target.value)}
              placeholder="Search by username or email…"
              className="input-field text-sm"
              autoFocus
            />
            {adminSearching && <p className="text-xs text-gray-400">Searching…</p>}
            {!adminSearching && adminSearchQuery.length >= 2 && adminSearchResults.length === 0 && (
              <p className="text-xs text-gray-400">No users found.</p>
            )}
            {adminSearchResults.length > 0 && (
              <ul className="divide-y divide-gray-700/50 rounded-lg border border-gray-700 overflow-hidden">
                {adminSearchResults.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-3 px-3 py-2.5 bg-surface-700/50">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-100 truncate">{u.username}</p>
                      <p className="text-xs text-gray-400 truncate">{u.email}</p>
                    </div>
                    <button
                      onClick={() => assignAdminMutation.mutate(u.id)}
                      disabled={assignAdminMutation.isPending}
                      className="shrink-0 text-xs px-3 py-1.5 rounded-lg bg-brand-600/20 hover:bg-brand-600/40 text-brand-400 transition"
                    >
                      {assignAdminMutation.isPending ? '…' : 'Assign'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Create form */}
      {showForm && (
        <form
          onSubmit={(e) => { e.preventDefault(); createMutation.mutate(); }}
          className="card space-y-4"
        >
          <h2 className="font-semibold text-gray-200">New Competition</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">Name *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-field"
                required
                placeholder="e.g. Spring 2026 Survivor"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">Start Date *</label>
              <div className="relative">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="input-field w-full pr-10 [color-scheme:dark] cursor-pointer"
                  required
                  min={new Date().toISOString().split('T')[0]}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                The first gameweek will start from the next unstarted PL week on or after this date.
              </p>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-2 block text-sm font-medium text-gray-300">Visibility</label>
              <div className="grid gap-2 sm:grid-cols-2">
                {([
                  { value: 'PRIVATE', label: 'Private', icon: '🔐', desc: 'Hidden from browse. Join by code or invite link.' },
                  { value: 'PUBLIC', label: 'Public', icon: '🌍', desc: 'Visible in the main competitions list.' },
                ] as const).map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setVisibility(opt.value)}
                    className={`flex items-center gap-3 rounded-lg border p-3 text-left text-xs transition-colors ${
                      visibility === opt.value
                        ? 'border-brand-500 bg-brand-600/20 text-white'
                        : 'border-gray-600 bg-surface-700 text-gray-400 hover:border-gray-500'
                    }`}
                  >
                    <span className="text-xl">{opt.icon}</span>
                    <span>
                      <span className="block font-semibold">{opt.label}</span>
                      <span className="block leading-tight">{opt.desc}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-2 block text-sm font-medium text-gray-300">Payment Mode</label>
              <div className="grid gap-2 sm:grid-cols-3">
                {([
                  { value: 'FREE', label: 'Free', icon: '🎉', desc: 'No entry fee' },
                  { value: 'MANUAL', label: 'Manual', icon: '💸', desc: 'Revolut / cash / bank transfer — you mark players as paid' },
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
                  💡 Players join for free — you confirm their payment manually in the Participants panel and then mark them as paid to activate their entry.
                </p>
              )}
            </div>

            {paymentMode !== 'FREE' && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">Entry Fee (€)</label>
                <input type="number" min="0" step="5" value={entryFee}
                  onChange={(e) => setEntryFee(e.target.value)} className="input-field" />
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
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">Prize Pool (€) <span className="text-gray-500 font-normal">— optional</span></label>
              <input
                type="number"
                min="0"
                step="10"
                value={prizePool}
                onChange={(e) => setPrizePool(e.target.value)}
                className="input-field"
                placeholder="e.g. 200"
              />
              <p className="mt-1 text-xs text-gray-500">Set a fixed prize amount to display on the competition card.</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">Missed Pick Rule</label>
              <select value={missedPickMode} onChange={(e) => setMissedPickMode(e.target.value)} className="input-field">
                <option value="ELIMINATE">Eliminate (no pick = out)</option>
                <option value="AUTO_ASSIGN">Auto-Assign (pick best available)</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-300">Description</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)}
                className="input-field" placeholder="Optional description" />
            </div>
            <div className="sm:col-span-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={postponedConsumesTeam}
                  onChange={(e) => setPostponedConsumesTeam(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-600 bg-surface-700 text-brand-500" />
                <span className="text-sm text-gray-300">
                  Postponed match counts as used pick
                  <span className="ml-1 text-xs text-gray-500">(recommended)</span>
                </span>
              </label>
            </div>
            {paymentMode === 'STRIPE' && parseFloat(entryFee) > 0 && (
              <div className="sm:col-span-2">
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
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
            <button type="submit" disabled={createMutation.isPending} className="btn-primary w-full sm:w-auto">
              {createMutation.isPending ? 'Creating…' : 'Create Competition'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary w-full sm:w-auto">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Competitions list */}
      {isLoading ? (
        <div className="flex justify-center py-10">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        </div>
      ) : !competitions?.length ? (
        <div className="card py-12 text-center">
          <div className="text-4xl mb-3">🏆</div>
          <p className="text-gray-400">No competitions yet for this club.</p>
          <button onClick={() => setShowForm(true)} className="mt-4 btn-primary text-sm">
            Create your first competition →
          </button>
        </div>
      ) : (() => {
        // Filter + search
        let filtered = competitions;
        if (compSearch.trim()) {
          const q = compSearch.toLowerCase();
          filtered = filtered.filter(c => c.name.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q));
        }
        if (compStatusFilter !== 'ALL') filtered = filtered.filter(c => c.status === compStatusFilter);

        const totalPages = Math.max(1, Math.ceil(filtered.length / COMP_PAGE_SIZE));
        const page = Math.min(compPage, totalPages);
        const paginated = filtered.slice((page - 1) * COMP_PAGE_SIZE, page * COMP_PAGE_SIZE);

        const counts = {
          ALL: competitions.length,
          UPCOMING: competitions.filter(c => c.status === 'UPCOMING').length,
          ACTIVE: competitions.filter(c => c.status === 'ACTIVE').length,
          COMPLETED: competitions.filter(c => c.status === 'COMPLETED').length,
        };

        return (
          <div className="space-y-3">
            {/* Filter bar */}
            <div className="flex flex-col sm:flex-row gap-2">
              {/* Search */}
              <div className="relative flex-1">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={compSearch}
                  onChange={e => { setCompSearch(e.target.value); setCompPage(1); }}
                  placeholder="Search competitions…"
                  className="input-field w-full pl-9 text-sm"
                />
                {compSearch && (
                  <button onClick={() => { setCompSearch(''); setCompPage(1); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-lg">×</button>
                )}
              </div>

              {/* Status pills */}
              <div className="-mx-1 overflow-x-auto pb-1 sm:mx-0 sm:overflow-visible">
                <div className="inline-flex min-w-max rounded-lg bg-surface-700 p-0.5 self-start shrink-0">
                {(['ALL', 'UPCOMING', 'ACTIVE', 'COMPLETED'] as const).map(s => (
                  counts[s] > 0 || s === 'ALL' ? (
                    <button key={s} onClick={() => { setCompStatusFilter(s); setCompPage(1); }}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${compStatusFilter === s ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                      {s === 'ALL' ? `All (${counts.ALL})` : `${s.charAt(0) + s.slice(1).toLowerCase()} (${counts[s]})`}
                    </button>
                  ) : null
                ))}
                </div>
              </div>
            </div>

            {/* Result info */}
            {(compSearch || compStatusFilter !== 'ALL') && (
              <p className="text-xs text-gray-500">{filtered.length} competition{filtered.length !== 1 ? 's' : ''} {compSearch ? `matching "${compSearch}"` : ''}</p>
            )}

            {filtered.length === 0 ? (
              <div className="card py-8 text-center text-gray-400 text-sm">
                No competitions match your filters.{' '}
                <button onClick={() => { setCompSearch(''); setCompStatusFilter('ALL'); }} className="text-brand-400 hover:text-brand-300 underline">Clear filters</button>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {paginated.map((comp) => (
                    <div key={comp.id} className="card p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={
                              comp.status === 'ACTIVE' ? 'badge-green' :
                              comp.status === 'UPCOMING' ? 'badge-blue' : 'badge-gray'
                            }>{comp.status}</span>
                            {comp.visibility === 'PRIVATE' && <span className="badge-yellow">Private</span>}
                            <h3 className="font-semibold text-gray-100 truncate">{comp.name}</h3>
                          </div>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
                          <span>Starts {format(parseDate(comp.startDate), 'MMM d, yyyy')}</span>
                          <span>{comp.participantCount} players ({comp.activeCount} active)</span>
                          {comp.entryFee > 0 && <span className="text-brand-400 font-semibold">€{comp.entryFee}</span>}
                        </div>
                        {comp.visibility === 'PRIVATE' && comp.joinCode && (
                          <div className="mt-2 inline-flex w-fit items-center gap-2 rounded-lg border border-brand-500/25 bg-brand-500/8 px-2.5 py-1 text-[11px] text-brand-200">
                            <span className="font-semibold uppercase tracking-[0.12em] text-brand-300">Invite code</span>
                            <span className="rounded bg-brand-500/12 px-1.5 py-0.5 font-mono text-[12px] font-semibold tracking-[0.14em] text-white">
                              {comp.joinCode}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 sm:shrink-0 sm:justify-end">
                        {comp.joinCode && (
                          <button
                            onClick={() => {
                              const inviteUrl = `${window.location.origin}/competitions?code=${encodeURIComponent(comp.joinCode ?? '')}`;
                              navigator.clipboard.writeText(inviteUrl).then(() => {
                                toast.success(`Invite link copied for ${comp.name}`);
                              }).catch(() => toast.error('Could not copy invite link'));
                            }}
                            className="text-xs px-3 py-1.5 rounded-lg bg-brand-600/15 hover:bg-brand-600/30 text-brand-300 transition"
                          >
                            Copy Invite
                          </button>
                        )}
                        <Link to={`/competitions/${comp.id}`} className="btn-secondary text-xs px-3 py-1.5">View</Link>
                        <button
                          onClick={() => setManagingComp(managingComp?.id === comp.id ? null : comp)}
                            className="text-xs px-3 py-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 text-gray-300 transition"
                          >
                            {managingComp?.id === comp.id ? 'Close ▲' : 'Participants ▼'}
                          </button>
                          <button
                            onClick={() => setDeletingComp(comp)}
                            disabled={deleteMutation.isPending}
                            className="text-xs px-3 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/40 text-red-400 transition"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      {managingComp?.id === comp.id && <ParticipantsPanel competitionId={comp.id} paymentMode={comp.paymentMode} />}
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-gray-400">
                      Showing {(page - 1) * COMP_PAGE_SIZE + 1}–{Math.min(page * COMP_PAGE_SIZE, filtered.length)} of {filtered.length}
                    </p>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setCompPage(1)} disabled={page === 1} className="px-2 py-1 text-xs rounded bg-surface-700 hover:bg-surface-600 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed">«</button>
                      <button onClick={() => setCompPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 text-xs rounded bg-surface-700 hover:bg-surface-600 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed">← Prev</button>
                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                        .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                          if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('...');
                          acc.push(p);
                          return acc;
                        }, [])
                        .map((p, idx) => p === '...'
                          ? <span key={`e${idx}`} className="px-2 text-xs text-gray-500">…</span>
                          : <button key={p} onClick={() => setCompPage(p as number)}
                              className={`px-3 py-1 text-xs rounded transition ${page === p ? 'bg-brand-600 text-white font-medium' : 'bg-surface-700 hover:bg-surface-600 text-gray-300'}`}>{p}</button>
                        )}
                      <button onClick={() => setCompPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1 text-xs rounded bg-surface-700 hover:bg-surface-600 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed">Next →</button>
                      <button onClick={() => setCompPage(totalPages)} disabled={page === totalPages} className="px-2 py-1 text-xs rounded bg-surface-700 hover:bg-surface-600 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed">»</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })()}

      {/* Delete Competition Dialog */}
      <ConfirmDialog
        isOpen={!!deletingComp}
        onClose={() => setDeletingComp(null)}
        onConfirm={() => deletingComp && deleteMutation.mutate(deletingComp.id)}
        variant="danger"
        title={`Delete "${deletingComp?.name}"?`}
        message="This will permanently remove the competition and all associated data."
        items={[
          'All participants will be removed',
          'All picks and results will be deleted',
        ]}
        confirmText="Yes, Delete"
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}

function AdminHeroStat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.045] px-3 py-2 text-center backdrop-blur-sm">
      <div className={`text-lg font-black ${accent}`}>{value}</div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">{label}</div>
    </div>
  );
}

function ParticipantsPanel({ competitionId, paymentMode }: { competitionId: number; paymentMode?: string }) {
  const queryClient = useQueryClient();
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [winnerDialogUser, setWinnerDialogUser] = useState<Participant | null>(null);
  const [removeDialogUser, setRemoveDialogUser] = useState<Participant | null>(null);
  const [unmarkDialogUser, setUnmarkDialogUser] = useState<Participant | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'ELIMINATED' | 'WINNER'>('ALL');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const isManual = paymentMode === 'MANUAL';

  const { data: participants, isLoading } = useQuery<Participant[]>({
    queryKey: ['club-admin', 'participants', competitionId],
    queryFn: () => api.get(`/club-admin/competitions/${competitionId}/participants`).then((r) => r.data),
    staleTime: 30_000,
  });

  const { data: paidUserIds } = useQuery<number[]>({
    queryKey: ['club-admin', 'paid-users', String(competitionId)],
    queryFn: () => api.get(`/club-admin/competitions/${competitionId}/paid-users`).then((r) => r.data),
    enabled: isManual,
    staleTime: 30_000,
  });

  const paidSet = new Set(paidUserIds ?? []);

  const removeMutation = useMutation({
    mutationFn: (userId: number) =>
      api.delete(`/club-admin/competitions/${competitionId}/participants/${userId}`),
    onSuccess: () => {
      toast.success('Participant removed');
      queryClient.invalidateQueries({ queryKey: ['club-admin', 'participants', competitionId] });
      queryClient.invalidateQueries({ queryKey: ['club-admin', 'competitions'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Remove failed'),
  });

  const markPaidMutation = useMutation<void, any, number>({
    mutationFn: (userId: number) =>
      api.post(`/club-admin/competitions/${competitionId}/mark-paid/${String(userId)}`),
    onMutate: async (userId) => {
      await queryClient.cancelQueries({ queryKey: ['club-admin', 'paid-users', String(competitionId)] });
      const previous = queryClient.getQueryData<number[]>(['club-admin', 'paid-users', String(competitionId)]);
      queryClient.setQueryData<number[]>(['club-admin', 'paid-users', String(competitionId)],
        (old) => old ? [...old, userId] : [userId]);
      return { previous };
    },
    onSuccess: () => toast.success('✓ Payment confirmed'),
    onError: (err: any, _userId, context: any) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(['club-admin', 'paid-users', String(competitionId)], context.previous);
      }
      toast.error(err.response?.data?.message || 'Failed to confirm payment');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['club-admin', 'paid-users', String(competitionId)] });
    },
  });

  const unmarkPaidMutation = useMutation<void, any, number>({
    mutationFn: (userId: number) =>
      api.post(`/club-admin/competitions/${competitionId}/unmark-paid/${String(userId)}`),
    onMutate: async (userId) => {
      await queryClient.cancelQueries({ queryKey: ['club-admin', 'paid-users', String(competitionId)] });
      const previous = queryClient.getQueryData<number[]>(['club-admin', 'paid-users', String(competitionId)]);
      queryClient.setQueryData<number[]>(['club-admin', 'paid-users', String(competitionId)],
        (old) => old ? old.filter(id => id !== userId) : []);
      return { previous };
    },
    onSuccess: () => toast.success('✓ Payment reverted'),
    onError: (err: any, _userId, context: any) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(['club-admin', 'paid-users', String(competitionId)], context.previous);
      }
      toast.error(err.response?.data?.message || 'Failed to revert payment');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['club-admin', 'paid-users', String(competitionId)] });
    },
  });

  const declareWinnerMutation = useMutation({
    mutationFn: (userId: number) =>
      api.post(`/club-admin/competitions/${competitionId}/declare-winner/${userId}`, {}),
    onSuccess: (_, variables) => {
      const winner = participants?.find(p => p.userId === (variables as number));
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
      queryClient.invalidateQueries({ queryKey: ['club-admin', 'participants', competitionId] });
      queryClient.invalidateQueries({ queryKey: ['club-admin', 'competitions'] });
      queryClient.invalidateQueries({ queryKey: ['competitions'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to declare winner'),
  });

  if (isLoading) {
    return (
      <div className="mt-3 pt-3 border-t border-gray-700/50 flex justify-center py-4">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  const activeCount = participants?.filter(p => p.status === 'ACTIVE').length ?? 0;
  const unpaidCount = isManual ? (participants?.filter(p => !paidSet.has(p.userId)).length ?? 0) : 0;

  // Filter
  const filtered = (participants ?? []).filter(p => {
    const matchesSearch = !search.trim() ||
      p.username.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const statusCounts = {
    ALL: participants?.length ?? 0,
    ACTIVE: participants?.filter(p => p.status === 'ACTIVE').length ?? 0,
    ELIMINATED: participants?.filter(p => p.status === 'ELIMINATED').length ?? 0,
    WINNER: participants?.filter(p => p.status === 'WINNER').length ?? 0,
  };

  return (
    <div className="mt-3 pt-3 border-t border-gray-700/50 space-y-3">
      {/* Header row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Participants ({participants?.length ?? 0})
          {isManual && unpaidCount > 0 && (
            <span className="ml-2 text-yellow-400 normal-case font-normal">· {unpaidCount} awaiting payment</span>
          )}
        </h4>
        <button
          onClick={() => setShowAddPanel((v) => !v)}
          className="w-full sm:w-auto text-xs px-2.5 py-1 rounded-lg bg-brand-600/20 hover:bg-brand-600/40 text-brand-400 transition font-medium"
        >
          {showAddPanel ? '✕ Cancel' : '+ Add'}
        </button>
      </div>

      {isManual && (
        <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-3 py-2 text-xs text-yellow-300">
          💸 <strong>Manual payment competition</strong> — click <strong>Confirm Payment</strong> once you've received each player's money.
        </div>
      )}

      {showAddPanel && (
        <AddParticipantPanel
          competitionId={competitionId}
          apiBase="/club-admin"
          invalidateKeys={[
            ['club-admin', 'participants', String(competitionId)],
            ['club-admin', 'competitions'],
            ['competitions'],
          ]}
          onClose={() => setShowAddPanel(false)}
        />
      )}

      {(participants?.length ?? 0) > 0 && (
        <div className="flex flex-col sm:flex-row gap-2">
          {/* Search */}
          <div className="relative flex-1">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search by name…"
              className="w-full pl-8 pr-8 py-1.5 text-xs rounded-lg bg-surface-700 border border-gray-600/50 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-brand-500"
            />
            {search && (
              <button onClick={() => { setSearch(''); setPage(1); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">×</button>
            )}
          </div>
          {/* Status filter pills */}
          <div className="-mx-1 overflow-x-auto pb-1 sm:mx-0 sm:overflow-visible">
            <div className="inline-flex min-w-max rounded-lg bg-surface-700 p-0.5 shrink-0">
            {(['ALL', 'ACTIVE', 'ELIMINATED', 'WINNER'] as const).map(s => (
              statusCounts[s] > 0 || s === 'ALL' ? (
                <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
                  className={`px-2 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${statusFilter === s ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                  {s === 'ALL' ? `All (${statusCounts.ALL})` : `${s.charAt(0) + s.slice(1).toLowerCase()} (${statusCounts[s]})`}
                </button>
              ) : null
            ))}
            </div>
          </div>
        </div>
      )}

      {/* Results info */}
      {(search || statusFilter !== 'ALL') && (
        <p className="text-xs text-gray-500">
          {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          {search ? ` for "${search}"` : ''}
          {' '}
          <button onClick={() => { setSearch(''); setStatusFilter('ALL'); setPage(1); }} className="text-brand-400 hover:text-brand-300 underline">Clear</button>
        </p>
      )}

      {!participants?.length ? (
        <p className="text-xs text-gray-500 italic">No participants yet</p>
      ) : filtered.length === 0 ? (
        <p className="text-xs text-gray-500 italic">No participants match your filters</p>
      ) : (
        <>
          <div className="divide-y divide-gray-700/30">
            {paginated.map((p) => (
              <div key={p.id} className="py-3 text-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="text-gray-200 font-medium">{p.username}</span>
                      <span className={
                        p.status === 'ACTIVE' ? 'badge-green' :
                        p.status === 'ELIMINATED' ? 'badge-red' : 'badge-yellow'
                      }>{p.status}</span>
                      {p.eliminatedWeek && (
                        <span className="text-xs text-gray-500">GW{p.eliminatedWeek}</span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                      {isManual && (
                        paidSet.has(p.userId)
                          ? <span className="text-green-400">Payment confirmed</span>
                          : <span className="text-yellow-400">Awaiting payment</span>
                      )}
                      {p.status === 'ACTIVE' && activeCount > 1 && (
                        <span className="text-yellow-500/80">Still eligible to win</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:ml-2 sm:shrink-0">
                  {isManual && (
                    paidSet.has(p.userId) ? (
                      <span className="text-xs text-green-400 font-medium flex items-center gap-1">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                        Paid
                      </span>
                    ) : (
                      <button
                        onClick={() => markPaidMutation.mutate(p.userId)}
                        disabled={markPaidMutation.isPending}
                        className="text-xs px-2.5 py-1.5 rounded bg-green-600/20 hover:bg-green-600/40 text-green-400 transition font-medium"
                      >
                        💸 Confirm
                      </button>
                    )
                  )}
                  {isManual && paidSet.has(p.userId) && (
                    <button
                      onClick={() => setUnmarkDialogUser(p)}
                      disabled={unmarkPaidMutation.isPending}
                      className="text-xs px-2.5 py-1.5 rounded bg-red-600/20 hover:bg-red-600/40 text-red-400 transition"
                    >
                      ↩️ Revert
                    </button>
                  )}
                  {p.status === 'ACTIVE' && activeCount > 1 && (
                    <button
                      onClick={() => setWinnerDialogUser(p)}
                      disabled={declareWinnerMutation.isPending}
                      className="text-xs px-2.5 py-1.5 rounded bg-yellow-600/20 hover:bg-yellow-600/40 text-yellow-400 transition"
                    >
                      🏆 Winner
                    </button>
                  )}
                  <button
                    onClick={() => setRemoveDialogUser(p)}
                    disabled={removeMutation.isPending}
                    className="text-xs px-2.5 py-1.5 rounded bg-red-600/20 hover:bg-red-600/40 text-red-400 transition"
                  >
                    Remove
                  </button>
                </div>
              </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex flex-col gap-3 pt-1 border-t border-gray-700/30 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-gray-500">
                {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                  className="px-2.5 py-1 text-xs rounded bg-surface-700 hover:bg-surface-600 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed">← Prev</button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                  .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                    if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('...');
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, idx) => p === '...'
                    ? <span key={`e${idx}`} className="px-1 text-xs text-gray-500">…</span>
                    : <button key={p} onClick={() => setPage(p as number)}
                        className={`px-2.5 py-1 text-xs rounded transition ${currentPage === p ? 'bg-brand-600 text-white font-medium' : 'bg-surface-700 hover:bg-surface-600 text-gray-300'}`}>{p}</button>
                  )}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                  className="px-2.5 py-1 text-xs rounded bg-surface-700 hover:bg-surface-600 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed">Next →</button>
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
        message="This will end the competition and crown this participant as the champion."
        items={[
          `${winnerDialogUser?.username} will be marked as WINNER`,
          'All other active participants will be eliminated',
          'The competition will be marked as COMPLETED',
        ]}
        confirmText="Yes, Declare Winner"
      />

      {/* Revert Payment Dialog */}
      <ConfirmDialog
        isOpen={!!unmarkDialogUser}
        onClose={() => setUnmarkDialogUser(null)}
        onConfirm={() => unmarkDialogUser && unmarkPaidMutation.mutate(unmarkDialogUser.userId)}
        icon="↩️"
        variant="danger"
        title={`Revert payment for ${unmarkDialogUser?.username}?`}
        message="This will mark their manual payment as unconfirmed. Use this if you confirmed by mistake."
        items={[
          'The payment status will be reverted (keeps audit trail)',
          'You can confirm the payment again later if received',
        ]}
        confirmText="Yes, Revert Payment"
        isPending={unmarkPaidMutation.isPending}
      />

      {/* Remove Participant Dialog */}
      <ConfirmDialog
        isOpen={!!removeDialogUser}
        onClose={() => setRemoveDialogUser(null)}
        onConfirm={() => removeDialogUser && removeMutation.mutate(removeDialogUser.userId)}
        variant="danger"
        title={`Remove ${removeDialogUser?.username}?`}
        message="This will remove the participant and delete all their picks and results for this competition."
        confirmText="Yes, Remove"
      />
    </div>
  );
}
