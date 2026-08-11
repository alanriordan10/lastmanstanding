import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import type { Competition, Club, Participant } from '../types';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import ConfirmDialog from '../components/ConfirmDialog';
import AddParticipantPanel from '../components/AddParticipantPanel';

function parseDate(value: unknown): Date | null {
  if (Array.isArray(value)) {
    const [y, m, d, h = 0, mi = 0, s = 0] = value as number[];
    const dt = new Date(Date.UTC(y, m - 1, d, h, mi, s));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Backend sends LocalDateTime without timezone — treat as UTC by appending Z
  const str = (trimmed.endsWith('Z') || trimmed.includes('+')) ? trimmed : `${trimmed}Z`;
  const dt = new Date(str);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function formatDateSafe(value: unknown, pattern: string, fallback = '—'): string {
  const dt = parseDate(value);
  if (!dt) return fallback;
  try {
    return format(dt, pattern);
  } catch {
    return fallback;
  }
}

export default function ClubAdminPage() {
  const { isClubAdmin, isAdmin, loginWithToken } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingComp, setEditingComp] = useState<Competition | null>(null);
  const [managingComp, setManagingComp] = useState<Competition | null>(null);
  const [deletingComp, setDeletingComp] = useState<Competition | null>(null);
  const [announcingComp, setAnnouncingComp] = useState<Competition | null>(null);
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementMessage, setAnnouncementMessage] = useState('');
  const [pausingComp, setPausingComp] = useState<Competition | null>(null);
  const [resumingComp, setResumingComp] = useState<Competition | null>(null);
  const [pauseReason, setPauseReason] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [entryFee, setEntryFee] = useState('0');
  const [maxEntriesPerUser, setMaxEntriesPerUser] = useState('1');
  const [fixtureCompetitionCode, setFixtureCompetitionCode] = useState<'PL' | 'WC'>('PL');
  const [missedPickMode, setMissedPickMode] = useState('ELIMINATE');
  const [postponedConsumesTeam, setPostponedConsumesTeam] = useState(true);
  const [lifelineEnabled, setLifelineEnabled] = useState(false);
  const [passFeeToParticipant, setPassFeeToParticipant] = useState(false);
  const [paymentMode, setPaymentMode] = useState<'FREE' | 'MANUAL' | 'STRIPE'>('FREE');
  const [manualPaymentPolicy, setManualPaymentPolicy] = useState<'STRICT' | 'LENIENT'>('STRICT');
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>('PRIVATE');
  const [prizePool, setPrizePool] = useState('');
  const [startDate, setStartDate] = useState('');
  const [status, setStatus] = useState<'UPCOMING' | 'ACTIVE' | 'COMPLETED'>('UPCOMING');
  const [showAssignAdmin, setShowAssignAdmin] = useState(false);
  const [adminSearchQuery, setAdminSearchQuery] = useState('');
  const [adminSearchResults, setAdminSearchResults] = useState<{id: number; username: string; email: string}[]>([]);
  const [adminSearching, setAdminSearching] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(true);
  const adminDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checklistUserToggledRef = useRef(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

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

  type BillingStatus = {
    freeCompetitionUsed: boolean;
    paidCredits: number;
    canCreateNow: boolean;
    paymentRequired: boolean;
  };

  const { data: billing } = useQuery<BillingStatus>({
    queryKey: ['club-admin', 'billing'],
    queryFn: () => api.get('/club-admin/my-club/billing').then((r) => r.data),
    enabled: !!myClub,
    staleTime: 0,
  });

  const slotCheckoutMutation = useMutation({
    mutationFn: () => api.post('/club-admin/my-club/billing/checkout').then((r) => r.data as { url: string }),
    onSuccess: (data) => {
      if (data?.url) {
        window.location.href = data.url;
      } else {
        toast.error('Could not start checkout');
      }
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Could not start checkout'),
  });

  // Surface the result of a returning Stripe slot-purchase checkout.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const billingResult = params.get('billing');
    if (!billingResult) return;
    if (billingResult === 'success') {
      toast.success('Payment received — a competition slot has been added to your club.');
      queryClient.invalidateQueries({ queryKey: ['club-admin', 'billing'] });
    } else if (billingResult === 'cancel') {
      toast('Checkout cancelled — no charge was made.');
    }
    params.delete('billing');
    const newSearch = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (newSearch ? `?${newSearch}` : ''));
  }, [queryClient]);

  const pauseMutation = useMutation({
    mutationFn: () => api.post(`/club-admin/competitions/${pausingComp?.id}/pause`, { reason: pauseReason.trim() }),
    onSuccess: () => {
      toast.success(`${pausingComp?.name ?? 'Competition'} paused`);
      setPausingComp(null);
      setPauseReason('');
      queryClient.invalidateQueries({ queryKey: ['club-admin', 'competitions'] });
      queryClient.invalidateQueries({ queryKey: ['competitions'] });
    },
    onError: (error: any) => toast.error(error.response?.data?.message ?? 'Could not pause competition'),
  });

  const resumeMutation = useMutation({
    mutationFn: (competitionId: number) => api.post(`/club-admin/competitions/${competitionId}/resume`),
    onSuccess: () => {
      toast.success('Competition resumed. Original fixture and lock times remain unchanged.');
      setResumingComp(null);
      queryClient.invalidateQueries({ queryKey: ['club-admin', 'competitions'] });
      queryClient.invalidateQueries({ queryKey: ['competitions'] });
    },
    onError: (error: any) => toast.error(error.response?.data?.message ?? 'Could not resume competition'),
  });

  const announcementMutation = useMutation({
    mutationFn: () => api.post(`/club-admin/competitions/${announcingComp?.id}/announcements`, {
      title: announcementTitle.trim(),
      message: announcementMessage.trim(),
    }),
    onSuccess: () => {
      toast.success(`Announcement sent to ${announcingComp?.name ?? 'competition'} participants`);
      setAnnouncingComp(null);
      setAnnouncementTitle('');
      setAnnouncementMessage('');
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
    },
    onError: (error: any) => toast.error(error.response?.data?.message ?? 'Could not send announcement'),
  });

  const resetCompetitionForm = () => {
    setEditingComp(null);
    setShowForm(false);
    setName('');
    setDescription('');
    setEntryFee('0');
    setMaxEntriesPerUser('1');
    setFixtureCompetitionCode('PL');
    setMissedPickMode('ELIMINATE');
    setPostponedConsumesTeam(true);
    setLifelineEnabled(false);
    setPassFeeToParticipant(false);
    setPaymentMode('FREE');
    setManualPaymentPolicy('STRICT');
    setVisibility('PRIVATE');
    setPrizePool('');
    setStartDate('');
    setStatus('UPCOMING');
  };

  useEffect(() => {
    if (!showForm) return;
    requestAnimationFrame(() => {
      nameInputRef.current?.focus();
    });
  }, [showForm, editingComp]);

  const populateCompetitionForm = (competition: Competition) => {
    setEditingComp(competition);
    setShowForm(true);
    setName(competition.name);
    setDescription(competition.description ?? '');
    setEntryFee(String(competition.entryFee ?? 0));
    setMaxEntriesPerUser(String(competition.maxEntriesPerUser ?? 1));
    setFixtureCompetitionCode((competition.fixtureCompetitionCode ?? 'PL') as 'PL' | 'WC');
    setMissedPickMode(competition.missedPickMode);
    setPostponedConsumesTeam(competition.postponedConsumesTeam);
    setLifelineEnabled(Boolean(competition.lifelineEnabled));
    setPassFeeToParticipant(false);
    setPaymentMode(competition.paymentMode === 'STRIPE' ? 'MANUAL' : (competition.paymentMode ?? 'FREE') as 'FREE' | 'MANUAL');
    setManualPaymentPolicy((competition.manualPaymentPolicy ?? 'STRICT') as 'STRICT' | 'LENIENT');
    setVisibility((competition.visibility ?? 'PRIVATE') as 'PUBLIC' | 'PRIVATE');
    setPrizePool(competition.prizePool != null ? String(competition.prizePool) : '');
    setStartDate(competition.startDate);
    setStatus((competition.status ?? 'UPCOMING') as 'UPCOMING' | 'ACTIVE' | 'COMPLETED');
  };

  const competitionPayload = {
    name,
    description,
    entryFee: parseFloat(entryFee) || 0,
    maxEntriesPerUser: Math.max(1, parseInt(maxEntriesPerUser, 10) || 1),
    fixtureCompetitionCode,
    prizePool: prizePool ? parseFloat(prizePool) : null,
    missedPickMode,
    postponedConsumesTeam,
    lifelineEnabled,
    passFeeToParticipant,
    paymentMode,
    manualPaymentPolicy,
    visibility,
    startDate: startDate || null,
    status,
  };

  const createMutation = useMutation({
    mutationFn: () => api.post('/club-admin/competitions', {
      name,
      description: description || null,
      entryFee: parseFloat(entryFee) || 0,
      maxEntriesPerUser: Math.max(1, parseInt(maxEntriesPerUser, 10) || 1),
      fixtureCompetitionCode,
      prizePool: prizePool ? parseFloat(prizePool) : null,
      missedPickMode,
      postponedConsumesTeam,
      lifelineEnabled,
      passFeeToParticipant,
      paymentMode,
      manualPaymentPolicy,
      visibility,
      startDate,
    }),
    onSuccess: (response) => {
      const created = response.data as Competition;
      toast.success(created.joinCode
        ? `Competition created! Join code: ${created.joinCode}`
        : created.visibility === 'PUBLIC'
          ? 'Competition created! Public competitions do not use a join code.'
          : 'Competition created!');
      queryClient.setQueryData<Competition[]>(['club-admin', 'competitions'], (old) =>
        old ? [response.data, ...old] : [response.data]
      );
      queryClient.invalidateQueries({ queryKey: ['club-admin', 'competitions'] });
      queryClient.invalidateQueries({ queryKey: ['competitions'] });
      queryClient.invalidateQueries({ queryKey: ['club-admin', 'billing'] });
      resetCompetitionForm();
    },
    onError: (err: any) => {
      if (err.response?.status === 402) {
        toast.error(err.response?.data?.message || 'Payment required to create another competition');
        queryClient.invalidateQueries({ queryKey: ['club-admin', 'billing'] });
        return;
      }
      toast.error(err.response?.data?.message || 'Failed to create competition');
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editingComp) throw new Error('No competition selected for edit');
      return api.put(`/club-admin/competitions/${editingComp.id}`, competitionPayload);
    },
    onSuccess: (response) => {
      const updated = response.data as Competition;
      toast.success(`"${updated.name}" updated`);
      queryClient.setQueryData<Competition[]>(['club-admin', 'competitions'], (old) =>
        old ? old.map((competition) => competition.id === updated.id ? updated : competition) : [updated]
      );
      queryClient.invalidateQueries({ queryKey: ['club-admin', 'competitions'] });
      queryClient.invalidateQueries({ queryKey: ['competitions'] });
      resetCompetitionForm();
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to update competition'),
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

  const [brandingPrimary, setBrandingPrimary] = useState('');
  const [brandingSecondary, setBrandingSecondary] = useState('');
  const [brandingLogoUrl, setBrandingLogoUrl] = useState('');
  const [showBrandingForm, setShowBrandingForm] = useState(false);

  // Initialise branding fields when club data loads
  useEffect(() => {
    if (myClub) {
      setBrandingPrimary(myClub.primaryColor ?? '');
      setBrandingSecondary(myClub.secondaryColor ?? '');
      setBrandingLogoUrl(myClub.logoUrl ?? '');
    }
  }, [myClub]);

  const brandingMutation = useMutation({
    mutationFn: () => api.put('/club-admin/my-club/branding', {
      primaryColor: brandingPrimary || null,
      secondaryColor: brandingSecondary || null,
      logoUrl: brandingLogoUrl || null,
    }),
    onSuccess: () => {
      toast.success('Club branding saved');
      queryClient.invalidateQueries({ queryKey: ['club-admin', 'my-club'] });
      setShowBrandingForm(false);
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to save branding'),
  });

  const hexColorPattern = /^#[0-9a-fA-F]{6}$/;
  const brandingPreviewPrimary = hexColorPattern.test(brandingPrimary) ? brandingPrimary : '#6366f1';
  const brandingPreviewSecondary = hexColorPattern.test(brandingSecondary) ? brandingSecondary : '#a5b4fc';

  const hasCompetitions = (competitions?.length ?? 0) > 0;
  const hasManualCompetition = (competitions ?? []).some((c) => c.paymentMode === 'MANUAL');
  const onboardingSteps = [
    { label: 'Club created', done: true },
    { label: 'Create competition', done: hasCompetitions },
    { label: 'Configure manual payments', done: !hasCompetitions ? false : hasManualCompetition },
  ];
  const checklistDoneCount = onboardingSteps.filter((s) => s.done).length;

  useEffect(() => {
    if (checklistUserToggledRef.current) return;
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
    if (isMobile) {
      setChecklistOpen(false);
      return;
    }
    setChecklistOpen(checklistDoneCount < onboardingSteps.length);
  }, [checklistDoneCount, onboardingSteps.length]);

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
            <AdminHeroStat
              label={(
                <>
                  <span className="sm:hidden">Comps</span>
                  <span className="hidden sm:inline">Competitions</span>
                </>
              )}
              value={String(competitions?.length ?? 0)}
              accent="text-brand-200"
            />
            <AdminHeroStat label="Upcoming" value={String(competitions?.filter((c) => c.status === 'UPCOMING').length ?? 0)} accent="text-cyan-200" />
            <AdminHeroStat label="Active" value={String(competitions?.filter((c) => c.status === 'ACTIVE').length ?? 0)} accent="text-green-200" />
          </div>
        </div>
        <div className="relative mt-5 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="text-xs uppercase tracking-[0.16em] text-gray-400">
            Admin: <span className="text-gray-200">{myClub.clubAdminUsername ?? '—'}</span>
          </div>
          <div className="flex flex-col items-stretch gap-3 xl:items-end">
            {billing && (
              <div className="w-full max-w-[540px] rounded-2xl border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] px-4 py-3.5 shadow-[0_16px_36px_rgba(2,6,23,0.24)] backdrop-blur-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className={`mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border text-base font-black shadow-inner ${
                      !billing.freeCompetitionUsed
                        ? 'border-emerald-400/30 bg-emerald-500/12 text-emerald-200'
                        : billing.paidCredits > 0
                          ? 'border-brand-400/30 bg-brand-500/12 text-brand-100'
                          : 'border-amber-400/30 bg-amber-500/12 text-amber-100'
                    }`}>
                      {!billing.freeCompetitionUsed ? '1' : billing.paidCredits}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">
                          {!billing.freeCompetitionUsed ? 'Free competition' : 'Slot credits'}
                        </div>
                        {!billing.freeCompetitionUsed && (
                          <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-100">
                            Included
                          </span>
                        )}
                        {billing.freeCompetitionUsed && billing.paidCredits > 0 && (
                          <span className="rounded-full border border-brand-400/25 bg-brand-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-100">
                            Ready to use
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-base font-semibold text-white">
                        {!billing.freeCompetitionUsed
                          ? 'Your first competition is ready to launch'
                          : `${billing.paidCredits} credit${billing.paidCredits === 1 ? '' : 's'} available`}
                      </div>
                      <p className="mt-1 text-xs leading-5 text-gray-400 sm:max-w-[320px]">
                        {!billing.freeCompetitionUsed
                          ? 'Your club includes one free competition. Extra competitions can be added later with slot credits.'
                          : billing.paidCredits > 0
                            ? 'Keep credits on hand so you can create another competition whenever you need it.'
                            : 'You have used your free competition. Purchase a slot to create another competition.'}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:min-w-[190px] sm:items-end">
                    {billing.freeCompetitionUsed && (
                      <button
                        onClick={() => slotCheckoutMutation.mutate()}
                        disabled={slotCheckoutMutation.isPending}
                        className="btn-secondary h-10 w-full whitespace-nowrap px-4 text-[13px] sm:w-auto sm:min-w-[190px]"
                      >
                        {slotCheckoutMutation.isPending
                          ? 'Redirecting…'
                          : billing.paidCredits > 0
                            ? 'Buy another slot (€29)'
                            : 'Buy competition slot (€29)'}
                      </button>
                    )}
                    {billing.freeCompetitionUsed && (
                      <span className="text-[11px] text-gray-500 sm:text-right">
                        1 slot credit = 1 extra competition
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
            <button
              onClick={() => {
                if (editingComp || showForm) {
                  resetCompetitionForm();
                  return;
                }
                if (billing && !billing.canCreateNow) {
                  toast.error('Your free competition has been used. Buy a competition slot to create another.');
                  return;
                }
                setShowForm(true);
              }}
              className="btn-primary w-full whitespace-nowrap xl:min-w-[220px] xl:w-auto"
            >
              {editingComp ? 'Cancel Edit' : showForm ? 'Cancel' : '+ New Competition'}
            </button>
          </div>
        </div>
      </section>

      <div className="card space-y-3">
        <button
          type="button"
          onClick={() => {
            checklistUserToggledRef.current = true;
            setChecklistOpen((v) => !v);
          }}
          className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5 text-left"
          aria-expanded={checklistOpen}
        >
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-gray-200">Setup Checklist</h2>
            <p className="mt-0.5 text-xs text-gray-500">Core club and payments setup progress.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-gray-300">
              {checklistDoneCount}/{onboardingSteps.length}
            </span>
            <span className="text-gray-400">{checklistOpen ? '▾' : '▸'}</span>
          </div>
        </button>
        {checklistOpen && (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              {onboardingSteps.map((step) => (
                <div
                  key={step.label}
                  className={`rounded-lg border px-3 py-2 text-xs ${
                    step.done
                      ? 'border-green-400/25 bg-green-500/10 text-green-200'
                      : 'border-amber-400/25 bg-amber-500/10 text-amber-200'
                  }`}
                >
                  <span className="mr-1.5">{step.done ? '✓' : '•'}</span>{step.label}
                </div>
              ))}
            </div>
            <Link
              to="/guide"
              className="inline-flex w-full items-center justify-center rounded-lg border border-brand-300/25 bg-brand-500/10 px-3 py-2 text-xs font-semibold text-brand-100 transition hover:bg-brand-500/20 sm:w-auto"
            >
              Read club admin guide
            </Link>
          </>
        )}
      </div>

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

      {/* Club Branding card */}
      <div className="card space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-gray-200">Club Branding</h2>
            <p className="mt-1 text-xs text-gray-400">
              Set a logo and colour scheme that appears on your competition pages.
            </p>
          </div>
          <button
            onClick={() => setShowBrandingForm((v) => !v)}
            className="w-full sm:w-auto text-xs px-3 py-1.5 rounded-xl border border-white/10 bg-white/[0.04] text-gray-300 transition hover:border-white/15 hover:bg-white/[0.08]"
          >
            {showBrandingForm ? '✕ Cancel' : '🎨 Edit Branding'}
          </button>
        </div>

        {/* Preview strip */}
        {(myClub?.primaryColor || myClub?.logoUrl) && !showBrandingForm && (
          <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
            {myClub.logoUrl && (
              <img src={myClub.logoUrl} alt="Club logo" className="h-10 w-10 rounded-full object-cover border border-white/20" />
            )}
            <div className="flex items-center gap-2">
              {myClub.primaryColor && (
                <span className="flex items-center gap-1.5 text-xs text-gray-300">
                  <span className="h-4 w-4 rounded-full border border-white/20" style={{ backgroundColor: myClub.primaryColor }} />
                  {myClub.primaryColor}
                </span>
              )}
              {myClub.secondaryColor && (
                <span className="flex items-center gap-1.5 text-xs text-gray-300">
                  <span className="h-4 w-4 rounded-full border border-white/20" style={{ backgroundColor: myClub.secondaryColor }} />
                  {myClub.secondaryColor}
                </span>
              )}
            </div>
          </div>
        )}

        {showBrandingForm && (
          <div className="rounded-lg border border-brand-500/30 bg-brand-500/5 p-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-300">Primary Colour</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={brandingPrimary || '#6366f1'}
                    onChange={(e) => setBrandingPrimary(e.target.value)}
                    className="h-9 w-9 cursor-pointer rounded border border-white/20 bg-transparent p-0.5"
                  />
                  <input
                    type="text"
                    value={brandingPrimary}
                    onChange={(e) => setBrandingPrimary(e.target.value)}
                    placeholder="#6366f1"
                    maxLength={7}
                    className="input-field flex-1 text-sm font-mono"
                  />
                  {brandingPrimary && (
                    <button onClick={() => setBrandingPrimary('')} className="text-xs text-gray-500 hover:text-gray-300">✕</button>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-300">Secondary Colour <span className="text-gray-500">(optional)</span></label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={brandingSecondary || '#a5b4fc'}
                    onChange={(e) => setBrandingSecondary(e.target.value)}
                    className="h-9 w-9 cursor-pointer rounded border border-white/20 bg-transparent p-0.5"
                  />
                  <input
                    type="text"
                    value={brandingSecondary}
                    onChange={(e) => setBrandingSecondary(e.target.value)}
                    placeholder="#a5b4fc"
                    maxLength={7}
                    className="input-field flex-1 text-sm font-mono"
                  />
                  {brandingSecondary && (
                    <button onClick={() => setBrandingSecondary('')} className="text-xs text-gray-500 hover:text-gray-300">✕</button>
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-300">Club Logo <span className="text-gray-500">(PNG, JPG, SVG — max 500 KB)</span></label>
              <div className="flex items-center gap-3">
                {brandingLogoUrl && (
                  <img src={brandingLogoUrl} alt="Logo preview" className="h-12 w-12 rounded-full object-cover border border-white/20 shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                )}
                <label className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-gray-300 hover:border-white/20 hover:bg-white/[0.07] transition">
                    <span>📁</span>
                    <span>{brandingLogoUrl ? 'Replace logo…' : 'Choose file…'}</span>
                  </div>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 500 * 1024) { toast.error('Logo must be under 500 KB'); return; }
                      const reader = new FileReader();
                      reader.onload = () => setBrandingLogoUrl(reader.result as string);
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
                {brandingLogoUrl && (
                  <button onClick={() => setBrandingLogoUrl('')} className="text-xs text-gray-500 hover:text-gray-300 shrink-0">✕ Remove</button>
                )}
              </div>
            </div>
            <div
              className="overflow-hidden rounded-2xl border p-3"
              style={{
                borderColor: `${brandingPreviewPrimary}66`,
                background: `linear-gradient(135deg, ${brandingPreviewPrimary}14, rgba(15,23,42,0.78) 46%, ${brandingPreviewSecondary}12)`,
              }}
            >
              <div className="flex items-center gap-3">
                {brandingLogoUrl ? (
                  <img src={brandingLogoUrl} alt="Live branding logo preview" className="h-11 w-11 rounded-xl border border-white/20 object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                ) : (
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl border bg-surface-900 text-[10px] font-black uppercase" style={{ borderColor: `${brandingPreviewPrimary}66`, color: brandingPreviewPrimary }}>
                    Logo
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: brandingPreviewPrimary }}>Live preview</p>
                  <p className="mt-0.5 truncate text-base font-black text-white">{myClub?.name ?? 'Your Club'}</p>
                </div>
              </div>
              <div className="mt-3 rounded-2xl border p-3" style={{ borderColor: `${brandingPreviewSecondary}55`, backgroundColor: `${brandingPreviewSecondary}20` }}>
                <p className="text-lg font-black text-white">Sample Competition</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="rounded-full border px-2.5 py-1 text-[10px] font-black tracking-wide" style={{ borderColor: `${brandingPreviewPrimary}66`, color: brandingPreviewPrimary }}>ACTIVE</span>
                  <span className="rounded-full border px-2.5 py-1 text-[10px] font-black tracking-wide" style={{ borderColor: `${brandingPreviewSecondary}66`, color: brandingPreviewSecondary }}>PUBLIC</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Players</p>
                    <p className="mt-1 text-lg font-black text-white">42</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Prize</p>
                    <p className="mt-1 text-lg font-black" style={{ color: brandingPreviewPrimary }}>€200</p>
                  </div>
                </div>
              </div>
            </div>
            <button
              onClick={() => brandingMutation.mutate()}
              disabled={brandingMutation.isPending}
              className="btn-primary w-full sm:w-auto"
            >
              {brandingMutation.isPending ? 'Saving…' : 'Save Branding'}
            </button>
          </div>
        )}
      </div>

      {/* Create/Edit form (modal) */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/70 px-4 py-10 sm:py-12"
          onClick={resetCompetitionForm}
        >
          <div className="w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (editingComp) {
                  updateMutation.mutate();
                  return;
                }
                createMutation.mutate();
              }}
              ref={formRef}
              className="card space-y-4 border border-white/10 shadow-[0_30px_80px_rgba(2,6,23,0.55)]"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-semibold text-gray-200">{editingComp ? `Edit ${editingComp.name}` : 'New Competition'}</h2>
                  <p className="text-sm text-gray-400">
                    {editingComp ? 'Update prize money, entry settings, timing, and visibility.' : 'Create a new club competition and configure how players join.'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {editingComp && <span className="badge-blue">Editing</span>}
                  <button
                    type="button"
                    onClick={resetCompetitionForm}
                    className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-gray-300 transition hover:bg-white/[0.08] hover:text-white"
                    aria-label="Close competition editor"
                  >
                    ✕
                  </button>
                </div>
              </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">Name *</label>
              <input
                ref={nameInputRef}
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
                  min={editingComp ? undefined : new Date().toISOString().split('T')[0]}
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
              <div className="grid gap-2 sm:grid-cols-2">
                {([
                  { value: 'FREE', label: 'Free', icon: '🎉', desc: 'No entry fee' },
                  { value: 'MANUAL', label: 'Manual', icon: '💸', desc: 'Revolut / cash / bank transfer — you mark players as paid' },
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
                <div className="mt-2 space-y-2">
                  <p className="text-xs text-yellow-400/80">
                    💡 Players join for free — you confirm their payment manually in the Participants panel and then mark them as paid to activate their entry.
                  </p>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">Manual Payment Policy</label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => setManualPaymentPolicy('STRICT')}
                        className={`rounded-lg border px-3 py-2 text-left text-xs transition ${
                          manualPaymentPolicy === 'STRICT'
                            ? 'border-brand-500 bg-brand-600/20 text-white'
                            : 'border-gray-600 bg-surface-700 text-gray-300 hover:border-gray-500'
                        }`}
                      >
                        Strict
                        <span className="block text-[11px] text-gray-400">Unpaid cannot pick and are removed at lock.</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setManualPaymentPolicy('LENIENT')}
                        className={`rounded-lg border px-3 py-2 text-left text-xs transition ${
                          manualPaymentPolicy === 'LENIENT'
                            ? 'border-brand-500 bg-brand-600/20 text-white'
                            : 'border-gray-600 bg-surface-700 text-gray-300 hover:border-gray-500'
                        }`}
                      >
                        Lenient
                        <span className="block text-[11px] text-gray-400">Allow picks while still awaiting payment.</span>
                      </button>
                    </div>
                  </div>
                </div>
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
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[50, 100, 200, 500].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setPrizePool(String(preset))}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      prizePool === String(preset) ? 'bg-brand-600 text-white' : 'bg-surface-700 hover:bg-surface-600 text-gray-300'
                    }`}
                  >
                    €{preset}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-gray-500">Set a fixed prize amount to display on the competition card.</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">Fixture Source</label>
              <select
                value={fixtureCompetitionCode}
                onChange={(e) => setFixtureCompetitionCode(e.target.value as 'PL' | 'WC')}
                className="input-field"
              >
                <option value="PL">Premier League</option>
                <option value="WC">World Cup</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">Missed Pick Rule</label>
              <select value={missedPickMode} onChange={(e) => setMissedPickMode(e.target.value)} className="input-field">
                <option value="ELIMINATE">Eliminate (no pick = out)</option>
                <option value="AUTO_ASSIGN">Auto-Assign (pick best available)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">Max Entries Per User</label>
              <input
                type="number"
                min="1"
                max="10"
                step="1"
                value={maxEntriesPerUser}
                onChange={(e) => setMaxEntriesPerUser(e.target.value)}
                className="input-field"
              />
              <p className="mt-1 text-xs text-gray-500">Set to `2` to allow users to enter twice.</p>
            </div>
            {editingComp && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">Status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value as 'UPCOMING' | 'ACTIVE' | 'COMPLETED')} className="input-field">
                  <option value="UPCOMING">Upcoming</option>
                  <option value="ACTIVE">Active</option>
                  <option value="COMPLETED">Completed</option>
                </select>
              </div>
            )}
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
            <div className="sm:col-span-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={lifelineEnabled}
                  onChange={(e) => setLifelineEnabled(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-600 bg-surface-700 text-brand-500"
                />
                <span className="text-sm text-gray-300">
                  Enable one lifeline per entry
                  <span
                    className="ml-2 inline-flex items-center justify-center h-4 w-4 rounded-full border border-gray-500/50 text-[10px] text-gray-300"
                    title="Each entry can use this once before lock. It turns a draw into survival, but not a loss."
                    aria-label="Lifeline setting help"
                  >
                    i
                  </span>
                </span>
              </label>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
            <button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="btn-primary w-full sm:w-auto">
              {editingComp
                ? (updateMutation.isPending ? 'Saving…' : 'Save Changes')
                : (createMutation.isPending ? 'Creating & syncing fixtures…' : 'Create Competition')}
            </button>
            <button type="button" onClick={resetCompetitionForm} className="btn-secondary w-full sm:w-auto">
              Cancel
            </button>
          </div>
            </form>
          </div>
        </div>
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
                            {comp.paused && <span className="badge-yellow">Paused</span>}
                            {comp.visibility === 'PRIVATE'
                              ? <span className="badge-yellow">Private</span>
                              : <span className="badge-gray">Public</span>}
                            <h3 className="font-semibold text-gray-100 truncate">{comp.name}</h3>
                          </div>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
                          <span>Starts {formatDateSafe(comp.startDate, 'MMM d, yyyy')}</span>
                          <span>{comp.participantCount} players ({comp.activeCount} active)</span>
                          {comp.entryFee > 0 && <span className="text-brand-400 font-semibold">€{comp.entryFee}</span>}
                        </div>
                        {comp.paused && comp.pauseReason && (
                          <div className="mt-2 rounded-lg border border-yellow-400/20 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-100">
                            <span className="font-semibold">Paused:</span> {comp.pauseReason}
                          </div>
                        )}
                        {comp.visibility === 'PRIVATE' && comp.joinCode ? (
                          <div className="mt-2 inline-flex w-fit items-center gap-2 rounded-lg border border-brand-500/25 bg-brand-500/8 px-2.5 py-1 text-[11px] text-brand-200">
                            <span className="font-semibold uppercase tracking-[0.12em] text-brand-300">Invite code</span>
                            <span className="select-all rounded bg-brand-500/12 px-1.5 py-0.5 font-mono text-[12px] font-semibold tracking-[0.14em] text-white cursor-text">
                              {comp.joinCode}
                            </span>
                          </div>
                        ) : (
                          <div className="mt-2 inline-flex w-fit items-center rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-gray-300">
                            Public - no invite code required.
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 sm:shrink-0 sm:justify-end">
                        {comp.joinCode ? (
                          <button
                            onClick={() => {
                              const inviteUrl = `${window.location.origin}/invite/${encodeURIComponent(comp.joinCode ?? '')}`;
                              navigator.clipboard.writeText(inviteUrl).then(() => {
                                toast.success(`Invite link copied for ${comp.name}`);
                              }).catch(() => toast.error('Could not copy invite link'));
                            }}
                            className="text-xs px-3 py-1.5 rounded-lg bg-brand-600/15 hover:bg-brand-600/30 text-brand-300 transition"
                          >
                            Copy Invite
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              const inviteUrl = `${window.location.origin}/competitions/${comp.id}`;
                              navigator.clipboard.writeText(inviteUrl).then(() => {
                                toast.success(`Public link copied for ${comp.name}`);
                              }).catch(() => toast.error('Could not copy public link'));
                            }}
                            className="text-xs px-3 py-1.5 rounded-lg bg-brand-600/15 hover:bg-brand-600/30 text-brand-300 transition"
                          >
                            Copy Public Link
                          </button>
                        )}
                        <button
                          onClick={() => populateCompetitionForm(comp)}
                          className="text-xs px-3 py-1.5 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-300 transition"
                        >
                          Edit
                        </button>
                        <Link to={`/competitions/${comp.id}`} className="btn-secondary text-xs px-3 py-1.5">View</Link>
                        <button
                          onClick={() => setManagingComp(managingComp?.id === comp.id ? null : comp)}
                            className="text-xs px-3 py-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 text-gray-300 transition"
                          >
                            {managingComp?.id === comp.id ? 'Close ▲' : 'Participants ▼'}
                          </button>
                          {comp.status !== 'COMPLETED' && (
                            <button
                              onClick={() => {
                                if (comp.paused) {
                                  setResumingComp(comp);
                                } else {
                                  setPausingComp(comp);
                                  setPauseReason('');
                                }
                              }}
                              disabled={resumeMutation.isPending}
                              className="text-xs px-3 py-1.5 rounded-lg border border-yellow-400/20 bg-yellow-500/10 text-yellow-200 transition hover:bg-yellow-500/20 disabled:opacity-40"
                            >
                              {comp.paused ? 'Resume' : 'Pause'}
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setAnnouncingComp(comp);
                              setAnnouncementTitle('');
                              setAnnouncementMessage('');
                            }}
                            className="text-xs px-3 py-1.5 rounded-lg border border-amber-400/20 bg-amber-500/10 text-amber-200 transition hover:bg-amber-500/20"
                          >
                            Announce
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

      <ConfirmDialog
        isOpen={resumingComp !== null}
        onClose={() => { if (!resumeMutation.isPending) setResumingComp(null); }}
        onConfirm={() => { if (resumingComp) resumeMutation.mutate(resumingComp.id); }}
        title={`Resume ${resumingComp?.name ?? 'competition'}?`}
        message="Players will be able to join, pay and make picks again, provided the original gameweek lock time has not passed."
        items={[
          'Gameweek lock times remain fixed to the first fixture kickoff and will not change.',
          'If a lock passed while paused, picks for that gameweek remain closed after resume.',
          'Automatic processing, reminders and fixture syncing will restart.',
        ]}
        confirmText="Resume competition"
        variant="success"
        icon="▶"
        isPending={resumeMutation.isPending}
        irreversible={false}
      />

      {pausingComp && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-lg rounded-3xl border border-yellow-400/20 bg-surface-900 p-5 shadow-2xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-yellow-300">Pause competition</p>
            <h2 className="mt-1 text-xl font-black text-white">Pause {pausingComp.name}?</h2>
            <p className="mt-2 text-sm leading-5 text-gray-400">Joining, payments, picks, reminders and automatic processing will stop. Fixture kickoff and gameweek lock times remain unchanged.</p>
            <label className="mt-4 block">
              <span className="text-xs font-semibold text-gray-300">Reason shown to participants</span>
              <textarea value={pauseReason} onChange={(event) => setPauseReason(event.target.value)} maxLength={500} rows={4} placeholder="For example: Awaiting a corrected fixture result" className="input mt-1 w-full resize-none" />
              <span className="mt-1 block text-right text-[11px] text-gray-500">{pauseReason.length}/500</span>
            </label>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setPausingComp(null)} className="btn-secondary flex-1">Cancel</button>
              <button type="button" onClick={() => pauseMutation.mutate()} disabled={pauseMutation.isPending || !pauseReason.trim()} className="flex-1 rounded-xl border border-yellow-400/30 bg-yellow-500/15 px-4 py-2 text-sm font-bold text-yellow-100 disabled:opacity-40">
                {pauseMutation.isPending ? 'Pausing…' : 'Pause competition'}
              </button>
            </div>
          </div>
        </div>
      )}

      {announcingComp && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-surface-900 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-300">Competition announcement</p>
                <h2 className="mt-1 text-xl font-black text-white">Message {announcingComp.name}</h2>
                <p className="mt-1 text-sm text-gray-400">Saved in participants’ inboxes and sent by push when enabled.</p>
              </div>
              <button type="button" onClick={() => setAnnouncingComp(null)} className="rounded-full border border-white/10 px-3 py-1.5 text-gray-300">×</button>
            </div>
            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="text-xs font-semibold text-gray-300">Title</span>
                <input value={announcementTitle} onChange={(event) => setAnnouncementTitle(event.target.value)} maxLength={120} placeholder="Fixture update" className="input mt-1 w-full" />
                <span className="mt-1 block text-right text-[11px] text-gray-500">{announcementTitle.length}/120</span>
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-gray-300">Message</span>
                <textarea value={announcementMessage} onChange={(event) => setAnnouncementMessage(event.target.value)} maxLength={2000} rows={5} placeholder="Tell participants what they need to know…" className="input mt-1 w-full resize-none" />
                <span className="mt-1 block text-right text-[11px] text-gray-500">{announcementMessage.length}/2000</span>
              </label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setAnnouncingComp(null)} className="btn-secondary flex-1">Cancel</button>
                <button type="button" onClick={() => announcementMutation.mutate()} disabled={announcementMutation.isPending || !announcementTitle.trim() || !announcementMessage.trim()} className="btn-primary flex-1 disabled:opacity-40">
                  {announcementMutation.isPending ? 'Sending…' : 'Send announcement'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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

function AdminHeroStat({ label, value, accent }: { label: ReactNode; value: string; accent: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.045] px-3 py-2 text-center backdrop-blur-sm">
      <div className={`text-lg font-black ${accent}`}>{value}</div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">{label}</div>
    </div>
  );
}

function ParticipantsPanel({ competitionId, paymentMode }: { competitionId: number; paymentMode?: string }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'PARTICIPANTS' | 'PAYMENTS'>('PARTICIPANTS');
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [winnerDialogUser, setWinnerDialogUser] = useState<Participant | null>(null);
  const [removeDialogUser, setRemoveDialogUser] = useState<Participant | null>(null);
  const [mobileActionUserId, setMobileActionUserId] = useState<number | null>(null);
  const actionButtonRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  const mobileToolbarRef = useRef<HTMLDivElement | null>(null);
  const [search, setSearch] = useState('');
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'ELIMINATED' | 'WINNER'>('ALL');
  const [viewMode, setViewMode] = useState<'ALL' | 'AWAITING' | 'PAID'>('ALL');
  const [awaitingCollapsed, setAwaitingCollapsed] = useState(true);
  const [paidCollapsed, setPaidCollapsed] = useState(true);
  const [mobileOpsOpen, setMobileOpsOpen] = useState(false);
  const [manualHintDismissed, setManualHintDismissed] = useState(false);
  const [bulkConfirming, setBulkConfirming] = useState(false);
  const [page, setPage] = useState(1);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const PAGE_SIZE = 20;
  const isManual = paymentMode === 'MANUAL';
  const manualHintKey = `club-admin-manual-hint-dismissed-${competitionId}`;

  useEffect(() => {
    try {
      setManualHintDismissed(localStorage.getItem(manualHintKey) === '1');
    } catch {
      setManualHintDismissed(false);
    }
  }, [manualHintKey]);

  useEffect(() => {
    if (mobileActionUserId == null && !mobileFiltersOpen && !mobileActionsOpen) return;

    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      const insidePanel = panelRef.current?.contains(target) ?? false;
      const insideToolbar = mobileToolbarRef.current?.contains(target) ?? false;
      if (!insidePanel) setMobileActionUserId(null);
      if (!insideToolbar) {
        setMobileFiltersOpen(false);
        setMobileActionsOpen(false);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileActionUserId(null);
    };

    const onScroll = () => {
      setMobileActionUserId(null);
      setMobileFiltersOpen(false);
      setMobileActionsOpen(false);
    };

    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScroll, true);

    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [mobileActionUserId, mobileFiltersOpen, mobileActionsOpen]);

  const { data: participants, isLoading } = useQuery<Participant[]>({
    queryKey: ['club-admin', 'participants', competitionId],
    queryFn: () => api.get(`/club-admin/competitions/${competitionId}/participants`).then((r) => r.data),
    staleTime: 30_000,
  });

  const { data: paidParticipantIds } = useQuery<number[]>({
    queryKey: ['club-admin', 'paid-participants', String(competitionId)],
    queryFn: () => api.get(`/club-admin/competitions/${competitionId}/paid-participants`).then((r) => r.data),
    enabled: isManual,
    staleTime: 30_000,
  });

  const paidSet = new Set(paidParticipantIds ?? []);

  const removeMutation = useMutation({
    mutationFn: (participantId: number) =>
      api.delete(`/club-admin/competitions/${competitionId}/participants/${participantId}`),
    onSuccess: () => {
      toast.success('Participant removed');
      queryClient.invalidateQueries({ queryKey: ['club-admin', 'participants', competitionId] });
      queryClient.invalidateQueries({ queryKey: ['club-admin', 'competitions'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Remove failed'),
  });

  const markPaidMutation = useMutation<void, any, number>({
    mutationFn: (participantId: number) =>
      api.post(`/club-admin/competitions/${competitionId}/participants/${String(participantId)}/mark-paid`),
    onMutate: async (participantId) => {
      await queryClient.cancelQueries({ queryKey: ['club-admin', 'paid-participants', String(competitionId)] });
      const previous = queryClient.getQueryData<number[]>(['club-admin', 'paid-participants', String(competitionId)]);
      queryClient.setQueryData<number[]>(['club-admin', 'paid-participants', String(competitionId)],
        (old) => old ? [...old, participantId] : [participantId]);
      return { previous };
    },
    onError: (err: any, _participantId, context: any) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(['club-admin', 'paid-participants', String(competitionId)], context.previous);
      }
      toast.error(err.response?.data?.message || 'Failed to confirm payment');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['club-admin', 'paid-participants', String(competitionId)] });
    },
  });

  const unmarkPaidMutation = useMutation<void, any, number>({
    mutationFn: (participantId: number) =>
      api.post(`/club-admin/competitions/${competitionId}/participants/${String(participantId)}/unmark-paid`),
    onMutate: async (participantId) => {
      await queryClient.cancelQueries({ queryKey: ['club-admin', 'paid-participants', String(competitionId)] });
      const previous = queryClient.getQueryData<number[]>(['club-admin', 'paid-participants', String(competitionId)]);
      queryClient.setQueryData<number[]>(['club-admin', 'paid-participants', String(competitionId)],
        (old) => old ? old.filter(id => id !== participantId) : []);
      return { previous };
    },
    onError: (err: any, _participantId, context: any) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(['club-admin', 'paid-participants', String(competitionId)], context.previous);
      }
      toast.error(err.response?.data?.message || 'Failed to revert payment');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['club-admin', 'paid-participants', String(competitionId)] });
    },
  });

  const declareWinnerMutation = useMutation({
    mutationFn: (participantId: number) =>
      api.post(`/club-admin/competitions/${competitionId}/declare-winner/${participantId}`, {}),
    onSuccess: (_, variables) => {
      const winner = participants?.find(p => p.id === (variables as number));
      toast.success(
        <div className="flex items-center gap-3">
          <span className="text-2xl">🏆</span>
          <div>
            <p className="font-semibold">{winner ? participantLabel(winner) : 'Participant'} is the Winner!</p>
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
  const unpaidCount = isManual ? (participants?.filter(p => !paidSet.has(p.id)).length ?? 0) : 0;
  const entryCountByUserId = new Map<number, number>();
  (participants ?? []).forEach((participant) => {
    entryCountByUserId.set(participant.userId, (entryCountByUserId.get(participant.userId) ?? 0) + 1);
  });
  const participantLabel = (p: Participant) =>
    (entryCountByUserId.get(p.userId) ?? 0) > 1
      ? `${p.username} • Entry #${p.entryNumber ?? 1}`
      : p.username;

  // Filter
  const filtered = (participants ?? []).filter(p => {
    const matchesSearch = !search.trim() ||
      participantLabel(p).toLowerCase().includes(search.toLowerCase());
    const matchesStatus = activeTab === 'PAYMENTS'
      ? true
      : statusFilter === 'ALL' || p.status === statusFilter;
    const matchesView =
      !isManual || viewMode === 'ALL'
        ? true
        : viewMode === 'PAID'
          ? paidSet.has(p.id)
          : !paidSet.has(p.id);
    return matchesSearch && matchesStatus && matchesView;
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
  const awaitingParticipants = (participants ?? []).filter((p) => !paidSet.has(p.id));
  const paidParticipants = (participants ?? []).filter((p) => paidSet.has(p.id));

  const exportPaymentsCsv = () => {
    const rows = (participants ?? []).map((p) => ({
      username: p.username,
      status: p.status,
      payment_status: isManual ? (paidSet.has(p.id) ? 'PAID' : 'AWAITING_PAYMENT') : (p.paymentState ?? 'NOT_REQUIRED'),
      joined_at: p.joinedAt,
    }));
    const header = 'username,status,payment_status,joined_at';
    const lines = rows.map((r) => [r.username, r.status, r.payment_status, r.joined_at]
      .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `competition-${competitionId}-payments.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Payments export generated');
  };

  const confirmAllAwaiting = async () => {
    if (!awaitingParticipants.length) return;
    setBulkConfirming(true);
    try {
      const targets = awaitingParticipants.slice(0, 200).map((p) => p.id);
      const response = await api.post(
        `/club-admin/competitions/${competitionId}/mark-paid-participants-batch`,
        { participantIds: targets },
        { timeout: 30_000 },
      );
      const created = Number(response.data?.created ?? 0);
      const alreadyPaid = Number(response.data?.alreadyPaid ?? 0);
      const invalid = Number(response.data?.invalid ?? 0);
      toast.success(
        `Bulk update complete: ${created} created` +
        (alreadyPaid ? `, ${alreadyPaid} already paid` : '') +
        (invalid ? `, ${invalid} skipped` : '')
      );
      queryClient.invalidateQueries({ queryKey: ['club-admin', 'paid-participants', String(competitionId)] });
      queryClient.invalidateQueries({ queryKey: ['club-admin', 'participants', competitionId] });
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Bulk confirmation failed');
    } finally {
      setBulkConfirming(false);
    }
  };

  const applyMobileViewMode = (mode: 'ALL' | 'AWAITING' | 'PAID') => {
    const currentY = window.scrollY;
    setViewMode(mode);
    setPage(1);
    setMobileFiltersOpen(false);
    requestAnimationFrame(() => {
      window.scrollTo({ top: currentY });
    });
  };

  const clearAllFilters = () => {
    setStatusFilter('ALL');
    setViewMode('ALL');
    setSearch('');
    setPage(1);
    setMobileFiltersOpen(false);
  };

  const confirmPayment = (p: Participant) => {
    markPaidMutation.mutate(p.id, {
      onSuccess: () => {
        setMobileActionUserId(null);
        actionButtonRefs.current[p.id]?.focus();
        toast.success('✓ Payment confirmed');
      },
    });
  };

  const revertPayment = (p: Participant) => {
    unmarkPaidMutation.mutate(p.id, {
      onSuccess: () => {
        setMobileActionUserId(null);
        actionButtonRefs.current[p.id]?.focus();
        toast.success('✓ Payment reverted');
      },
    });
  };

  return (
    <div ref={panelRef} className="mt-3 pt-3 border-t border-gray-700/40 space-y-4">
      <div className="inline-flex rounded-lg bg-surface-800 p-0.5 border border-white/10">
        <button
          type="button"
          onClick={() => setActiveTab('PARTICIPANTS')}
          className={`px-3 h-9 text-xs rounded-md ${activeTab === 'PARTICIPANTS' ? 'bg-brand-600 text-white' : 'text-gray-300 hover:text-white'}`}
        >
          Participants
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('PAYMENTS')}
          className={`px-3 h-9 text-xs rounded-md ${activeTab === 'PAYMENTS' ? 'bg-brand-600 text-white' : 'text-gray-300 hover:text-white'}`}
        >
          Payments
        </button>
      </div>

      {/* Header row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          {activeTab === 'PAYMENTS' ? 'Payments' : 'Participants'} ({participants?.length ?? 0})
          {isManual && unpaidCount > 0 && (
            <span className="ml-2 text-amber-300/80 normal-case font-normal">· {unpaidCount} awaiting payment</span>
          )}
        </h4>
        {activeTab === 'PARTICIPANTS' && (
          <button
            onClick={() => setShowAddPanel((v) => !v)}
            className="w-full sm:w-auto text-xs px-3 h-9 rounded-md bg-brand-600/15 hover:bg-brand-600/25 text-brand-300 transition font-medium"
          >
            {showAddPanel ? '✕ Cancel' : '+ Add'}
          </button>
        )}
      </div>

      {isManual && !manualHintDismissed && (
        <div className="rounded-lg border px-3 py-2 text-xs sm:bg-amber-500/8 sm:border-amber-400/20 sm:text-amber-200 bg-white/[0.02] border-white/10 text-gray-300">
          <div className="flex items-start justify-between gap-2">
            <span>💸 <strong>Manual payment competition</strong> — click <strong>Confirm Payment</strong> once you've received each player's money.</span>
            <button
              type="button"
              onClick={() => {
                setManualHintDismissed(true);
                try { localStorage.setItem(manualHintKey, '1'); } catch {}
              }}
              className="sm:hidden shrink-0 text-[11px] rounded border border-white/15 px-1.5 py-0.5 text-gray-400"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {(participants?.length ?? 0) > 0 && activeTab === 'PARTICIPANTS' && (
        <div ref={mobileToolbarRef} className="sm:hidden sticky top-2 z-20 rounded-lg border border-white/10 bg-surface-800/95 backdrop-blur px-2 py-2 space-y-2">
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search by name…"
              className="w-full pl-3 pr-8 h-9 text-xs rounded-lg bg-surface-800 border border-gray-600/50 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-brand-500"
            />
            {search && (
              <button onClick={() => { setSearch(''); setPage(1); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">×</button>
            )}
          </div>
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-7">
              <label className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-gray-500">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value as typeof statusFilter); setPage(1); }}
                className="w-full h-8 rounded-md border border-white/10 bg-surface-700 px-2 text-xs text-gray-200"
              >
                <option value="ALL">All ({statusCounts.ALL})</option>
                <option value="ACTIVE">Active ({statusCounts.ACTIVE})</option>
                <option value="ELIMINATED">Eliminated ({statusCounts.ELIMINATED})</option>
                <option value="WINNER">Winner ({statusCounts.WINNER})</option>
              </select>
            </div>
            <div className="col-span-5">
              <label className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-gray-500">Payment</label>
              <select
                value={viewMode}
                onChange={(e) => applyMobileViewMode(e.target.value as 'ALL' | 'AWAITING' | 'PAID')}
                disabled={!isManual}
                className="w-full h-8 rounded-md border border-white/10 bg-surface-700 px-2 text-xs text-gray-200 disabled:opacity-40"
              >
                <option value="ALL">All</option>
                <option value="AWAITING">Awaiting</option>
                <option value="PAID">Paid</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setShowAddPanel((v) => !v)}
              className="w-full h-9 rounded-md border border-white/10 bg-white/[0.04] px-2 text-xs text-gray-200"
            >
              {showAddPanel ? 'Close add panel' : 'Add participant'}
            </button>
            <button
              type="button"
              onClick={exportPaymentsCsv}
              className="w-full h-9 rounded-md border border-white/10 bg-white/[0.03] px-2 text-xs text-gray-300"
            >
              Export CSV
            </button>
          </div>
          {(statusFilter !== 'ALL' || (isManual && viewMode !== 'ALL') || search.trim()) && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="w-full h-8 rounded-md border border-brand-400/25 bg-brand-500/10 px-2 text-xs text-brand-200"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
        <div className="hidden sm:flex sm:flex-row sm:items-center sm:justify-between sm:gap-2">
          <div className="text-xs text-gray-300">
            <span className="font-semibold">Payments ops:</span>{' '}
            {isManual
              ? `${paidSet.size} paid · ${(participants?.length ?? 0) - paidSet.size} awaiting`
              : 'Use payment status badges to track confirmation.'}
          </div>
          <div className="flex gap-2">
            {isManual && (
              <div className="inline-flex rounded-lg bg-surface-700 p-0.5">
                {(['ALL', 'AWAITING', 'PAID'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => { setViewMode(mode); setPage(1); }}
                    className={`px-2 py-1 text-xs rounded-md ${viewMode === mode ? 'bg-brand-600 text-white' : 'text-gray-300 hover:text-white'}`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={exportPaymentsCsv}
              className="text-xs px-3 h-9 rounded-md border border-white/10 bg-white/[0.03] text-gray-300 hover:bg-white/[0.06]"
            >
              Export CSV
            </button>
          </div>
        </div>
        <div className="sm:hidden space-y-2">
          <button
            type="button"
            onClick={() => setMobileOpsOpen((v) => !v)}
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 h-9 text-left text-xs text-gray-200"
          >
            Payments ops: {paidSet.size} paid · {(participants?.length ?? 0) - paidSet.size} awaiting
            <span className="float-right text-gray-400">{mobileOpsOpen ? 'Hide' : 'Show'}</span>
          </button>
          {mobileOpsOpen && (
            <div className="space-y-2">
              {isManual && (
                <div className="inline-flex rounded-lg bg-surface-700 p-0.5">
                  {(['ALL', 'AWAITING', 'PAID'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => { setViewMode(mode); setPage(1); }}
                      className={`px-2 py-1 text-xs rounded-md ${viewMode === mode ? 'bg-brand-600 text-white' : 'text-gray-300 hover:text-white'}`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={exportPaymentsCsv}
                className="w-full text-xs px-3 h-9 rounded-md border border-white/10 bg-white/[0.03] text-gray-300 hover:bg-white/[0.06]"
              >
                Export CSV
              </button>
            </div>
          )}
        </div>
      </div>

      {activeTab === 'PAYMENTS' && isManual && (
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-amber-400/20 bg-amber-500/6 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <h5 className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-200">Awaiting Payment</h5>
              <div className="flex items-center gap-2">
                {awaitingParticipants.length > 0 && !awaitingCollapsed && (
                  <button
                    type="button"
                    onClick={confirmAllAwaiting}
                    disabled={bulkConfirming}
                    className="text-[11px] px-2 py-0.5 rounded border border-green-300/40 text-green-200 hover:bg-green-400/10 disabled:opacity-50"
                  >
                    {bulkConfirming ? 'Confirming…' : 'Confirm all'}
                  </button>
                )}
                <span className="text-xs text-amber-300">{awaitingParticipants.length}</span>
                <button
                  type="button"
                  onClick={() => setAwaitingCollapsed((v) => !v)}
                  className="text-[11px] px-2 py-0.5 rounded border border-amber-300/30 text-amber-200 hover:bg-amber-400/10"
                >
                  {awaitingCollapsed ? 'Expand' : 'Collapse'}
                </button>
              </div>
            </div>
            {awaitingCollapsed ? (
              <p className="text-xs text-amber-100/70">Collapsed</p>
            ) : awaitingParticipants.length === 0 ? (
              <p className="text-xs text-amber-100/80">No one waiting for payment.</p>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {awaitingParticipants.slice(0, 50).map((p) => (
                  <div key={`await-${p.id}`} className="flex items-center justify-between rounded-md border border-amber-300/20 bg-black/20 px-2 py-1.5">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-amber-100 truncate">{participantLabel(p)}</p>
                      <p className="text-[11px] text-amber-200/80">{p.status}</p>
                    </div>
                    <button
                      onClick={() => confirmPayment(p)}
                      disabled={markPaidMutation.isPending}
                      className="text-[11px] px-2 py-1 rounded bg-green-600/20 hover:bg-green-600/40 text-green-300"
                    >
                      Confirm
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-green-400/20 bg-green-500/6 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <h5 className="text-xs font-semibold uppercase tracking-[0.14em] text-green-200">Paid</h5>
              <div className="flex items-center gap-2">
                <span className="text-xs text-green-300">{paidParticipants.length}</span>
                <button
                  type="button"
                  onClick={() => setPaidCollapsed((v) => !v)}
                  className="text-[11px] px-2 py-0.5 rounded border border-green-300/30 text-green-200 hover:bg-green-400/10"
                >
                  {paidCollapsed ? 'Expand' : 'Collapse'}
                </button>
              </div>
            </div>
            {paidCollapsed ? (
              <p className="text-xs text-green-100/70">Collapsed</p>
            ) : paidParticipants.length === 0 ? (
              <p className="text-xs text-green-100/80">No confirmed payments yet.</p>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {paidParticipants.slice(0, 50).map((p) => (
                  <div key={`paid-${p.id}`} className="flex items-center justify-between rounded-md border border-green-300/20 bg-black/20 px-2 py-1.5">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-green-100 truncate">{participantLabel(p)}</p>
                      <p className="text-[11px] text-green-200/80">{p.status}</p>
                    </div>
                    <button
                      onClick={() => revertPayment(p)}
                      disabled={unmarkPaidMutation.isPending}
                      className="text-[11px] px-2 py-1 rounded bg-red-600/20 hover:bg-red-600/40 text-red-300"
                    >
                      Revert
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'PARTICIPANTS' && showAddPanel && (
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
        <div className="hidden sm:flex sm:flex-row gap-2">
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
              className="w-full pl-8 pr-8 h-9 text-xs rounded-lg bg-surface-800 border border-gray-600/50 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-brand-500"
            />
            {search && (
              <button onClick={() => { setSearch(''); setPage(1); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">×</button>
            )}
          </div>
          {/* Status filter pills */}
          {activeTab === 'PARTICIPANTS' && (
            <div className="-mx-1 overflow-x-auto pb-1 sm:mx-0 sm:overflow-visible">
              <div className="inline-flex min-w-max rounded-lg bg-surface-800 p-0.5 shrink-0 border border-white/10">
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
          )}
        </div>
      )}

      {/* Results info */}
      {(search || (activeTab === 'PARTICIPANTS' && statusFilter !== 'ALL')) && (
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
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="text-gray-200 font-medium">{participantLabel(p)}</span>
                      <span className={
                        p.status === 'ACTIVE'
                          ? 'badge-green sm:opacity-100 opacity-80'
                          : p.status === 'ELIMINATED'
                            ? 'badge-red sm:opacity-100 opacity-80'
                            : 'badge-yellow sm:opacity-100 opacity-80'
                      }>{p.status}</span>
                      {p.eliminatedWeek && (
                        <span className="hidden sm:inline text-xs text-gray-500">GW{p.eliminatedWeek}</span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                      {isManual && (
                        paidSet.has(p.id)
                          ? <span className="text-green-400 sm:text-green-400 text-gray-400">Payment confirmed</span>
                          : <span className="text-yellow-400 sm:text-yellow-400 text-gray-400">Awaiting payment</span>
                      )}
                      {p.status === 'ACTIVE' && activeCount > 1 && (
                        <span className="hidden sm:inline text-yellow-500/80">Still eligible to win</span>
                      )}
                    </div>
                  </div>
                  <div className="hidden sm:flex sm:flex-wrap sm:items-center sm:gap-2 sm:ml-2 sm:shrink-0">
                  {isManual && (
                    paidSet.has(p.id) ? (
                      <span className="text-xs text-green-400 font-medium flex items-center gap-1">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                        Paid
                      </span>
                    ) : (
                      <button
                        onClick={() => confirmPayment(p)}
                        disabled={markPaidMutation.isPending}
                        className="text-xs px-3 h-9 rounded-md bg-green-600/15 hover:bg-green-600/25 text-green-300 transition font-medium"
                      >
                        💸 Confirm
                      </button>
                    )
                  )}
                  {isManual && paidSet.has(p.id) && (
                    <button
                      onClick={() => revertPayment(p)}
                      disabled={unmarkPaidMutation.isPending}
                      className="text-xs px-3 h-9 rounded-md bg-rose-600/15 hover:bg-rose-600/25 text-rose-300 transition"
                    >
                      ↩️ Revert
                    </button>
                  )}
                  {activeTab === 'PARTICIPANTS' && p.status === 'ACTIVE' && activeCount > 1 && (
                    <button
                      onClick={() => setWinnerDialogUser(p)}
                      disabled={declareWinnerMutation.isPending}
                      className="text-xs px-3 h-9 rounded-md bg-amber-600/15 hover:bg-amber-600/25 text-amber-300 transition"
                    >
                      🏆 Winner
                    </button>
                  )}
                  {activeTab === 'PARTICIPANTS' && (
                    <button
                      onClick={() => setRemoveDialogUser(p)}
                      disabled={removeMutation.isPending}
                      className="text-xs px-3 h-9 rounded-md border border-rose-400/30 bg-rose-600/10 hover:bg-rose-600/18 text-rose-300 transition"
                    >
                      Remove
                    </button>
                  )}
                </div>
                  <div className="sm:hidden">
                    <button
                      type="button"
                      ref={(el) => { actionButtonRefs.current[p.id] = el; }}
                      onClick={() => setMobileActionUserId((id) => (id === p.id ? null : p.id))}
                      className="w-full h-9 rounded-md border border-white/10 bg-white/[0.03] px-3 text-xs text-gray-300 flex items-center justify-between"
                    >
                      <span>Manage</span>
                      <span className="text-gray-500">{mobileActionUserId === p.id ? '▲' : '▼'}</span>
                    </button>
                    {mobileActionUserId === p.id && (
                      <div className="mt-2 grid grid-cols-1 gap-2">
                        {isManual && (
                          paidSet.has(p.id) ? (
                            <button
                              type="button"
                              onClick={() => revertPayment(p)}
                              disabled={unmarkPaidMutation.isPending}
                              className="w-full h-9 rounded-md bg-rose-600/15 px-2 text-xs text-rose-300"
                            >
                              Revert payment
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => confirmPayment(p)}
                              disabled={markPaidMutation.isPending}
                              className="w-full h-9 rounded-md bg-green-600/15 px-2 text-xs text-green-300"
                            >
                              Confirm payment
                            </button>
                          )
                        )}
                        {p.status === 'ACTIVE' && activeCount > 1 && (
                          <button
                            type="button"
                            onClick={() => setWinnerDialogUser(p)}
                            disabled={declareWinnerMutation.isPending}
                            className="w-full h-9 rounded-md bg-amber-600/15 px-2 text-xs text-amber-300"
                          >
                            Declare winner
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setRemoveDialogUser(p)}
                          disabled={removeMutation.isPending}
                          className="w-full h-9 rounded-md border border-rose-400/30 bg-rose-600/10 px-2 text-xs text-rose-300"
                        >
                          Remove participant
                        </button>
                      </div>
                    )}
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
        onConfirm={() => winnerDialogUser && declareWinnerMutation.mutate(winnerDialogUser.id)}
        icon="🏆"
        variant="warning"
        title={`Declare ${winnerDialogUser ? participantLabel(winnerDialogUser) : 'participant'} as Winner?`}
        message="This will end the competition and crown this participant as the champion."
        items={[
          `${winnerDialogUser ? participantLabel(winnerDialogUser) : 'This participant'} will be marked as WINNER`,
          'All other active participants will be eliminated',
          'The competition will be marked as COMPLETED',
        ]}
        confirmText="Yes, Declare Winner"
      />

      {/* Remove Participant Dialog */}
      <ConfirmDialog
        isOpen={!!removeDialogUser}
        onClose={() => setRemoveDialogUser(null)}
        onConfirm={() => removeDialogUser && removeMutation.mutate(removeDialogUser.id)}
        variant="danger"
        title={`Remove ${removeDialogUser ? participantLabel(removeDialogUser) : 'participant'}?`}
        message="This will remove the participant and delete all their picks and results for this competition."
        confirmText="Yes, Remove"
      />

    </div>
  );
}
