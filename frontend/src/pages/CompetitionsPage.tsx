import { useQuery, useMutation, useQueryClient, useQueries } from '@tanstack/react-query';
import { useState, useRef, useEffect, useCallback, useMemo, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api';
import type { Competition, Club, MyCompetition, GameweekResponse, PickResponse } from '../types';
import { useAuth } from '../context/AuthContext';
import type { AxiosError } from 'axios';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import PaymentModal from '../components/PaymentModal';
import ErrorBoundary from '../components/ErrorBoundary';
import { FilterPill, MetricCard } from '../components/ui-primitives';

function parseDate(value: string | number[]): Date {
  if (Array.isArray(value)) {
    const [y, m, d, h = 0, mi = 0, s = 0] = value as number[];
    return new Date(Date.UTC(y, m - 1, d, h, mi, s));
  }
  const str = (value.endsWith('Z') || value.includes('+')) ? value : value + 'Z';
  return new Date(str);
}

function normalizeCompetition(raw: any): Competition | null {
  const candidate = raw?.competition ?? raw;
  if (!candidate || typeof candidate !== 'object') return null;
  if (typeof candidate.id !== 'number' || typeof candidate.name !== 'string' || typeof candidate.status !== 'string') {
    return null;
  }
  return {
    description: '',
    entryFee: 0,
    prizePool: 0,
    missedPickMode: 'ELIMINATE',
    postponedConsumesTeam: true,
    createdByUsername: '',
    participantCount: 0,
    activeCount: 0,
    ...candidate,
  } satisfies Competition;
}

function competitionCardStyle(comp: Competition): CSSProperties | undefined {
  const primary = comp.clubPrimaryColor;
  const secondary = comp.clubSecondaryColor ?? comp.clubPrimaryColor;
  if (!primary) return undefined;
  return {
    borderTopColor: primary,
    borderTopWidth: '3px',
    backgroundImage: `radial-gradient(circle at top right, ${primary}16, transparent 12rem), radial-gradient(circle at 18% 100%, ${secondary}10, transparent 10rem)`,
  };
}

function competitionAccentBadgeStyle(color?: string | null): CSSProperties | undefined {
  if (!color) return undefined;
  return {
    borderColor: `${color}3d`,
    backgroundColor: `${color}16`,
    color,
  };
}

function competitionPrimaryButtonStyle(color?: string | null): CSSProperties | undefined {
  if (!color) return undefined;
  return {
    backgroundColor: color,
    borderColor: color,
    color: '#ffffff',
  };
}

function isPickLockSoon(comp: Competition, withinHours = 24): boolean {
  const source = comp.firstGameweekDate ?? comp.startDate;
  if (!source) return false;
  const lockAt = parseDate(source).getTime();
  const msUntilLock = lockAt - Date.now();
  return msUntilLock > 0 && msUntilLock <= withinHours * 60 * 60 * 1000;
}

function getCompetitionActionHint(comp: Competition, mine?: MyCompetition, requiresPick = false): string | null {
  if (!mine) return null;
  if (mine.paymentState === 'AWAITING_PAYMENT') {
    return comp.paymentMode === 'MANUAL'
      ? 'Action needed: pay the organiser to activate your entry.'
      : 'Action needed: complete payment to confirm your entry.';
  }
  if (comp.status === 'UPCOMING' && (mine.myStatus === 'ACTIVE' || mine.myStatus === 'WINNER') && isPickLockSoon(comp) && requiresPick) {
    return 'Action needed: review your pick before the gameweek locks.';
  }
  return null;
}

interface SurvivorTableProgressResponse {
  gameweeks: Array<{ weekNumber: number; status: string }>;
  rows: Array<{
    userId: number;
    status: 'ACTIVE' | 'ELIMINATED' | 'WINNER';
    picks: Record<number, { outcome: string } | null>;
  }>;
}

function deriveLiveActiveCount(data: SurvivorTableProgressResponse | undefined): number | null {
  if (!data) return null;
  return data.rows.filter((row) => row.status === 'ACTIVE' || row.status === 'WINNER').length;
}

export default function CompetitionsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdminOrClubAdmin = user?.role === 'ADMIN' || user?.role === 'CLUB_ADMIN';
  const [searchParams, setSearchParams] = useSearchParams();
  const joinParam = searchParams.get('join');
  const joinCodeParam = searchParams.get('code')?.trim().toUpperCase() ?? '';

  const [selectedClub, setSelectedClub] = useState<Club | null>(null);
  const [payingComp, setPayingComp] = useState<Competition | null>(null);
  const [viewMode, setViewMode] = useState<'available' | 'mine' | 'past'>(() => {
    if (typeof window === 'undefined') return 'available';
    const saved = window.localStorage.getItem('lms.competitions.viewMode');
    return saved === 'mine' || saved === 'past' || saved === 'available' ? saved : 'available';
  });

  // Filter / sort / view state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'UPCOMING' | 'ACTIVE'>('ALL');
  const [feeFilter, setFeeFilter] = useState<'ALL' | 'FREE' | 'PAID'>('ALL');
  const [startWindow, setStartWindow] = useState<'ALL' | '7' | '14' | '30'>('ALL');
  const [sortBy, setSortBy] = useState<'date' | 'players' | 'name'>('date');
  const [listView, setListView] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [mineFilter, setMineFilter] = useState<'ALL' | 'NEEDS_ACTION' | 'PICK_DUE' | 'AWAITING_PAYMENT' | 'UPCOMING' | 'ACTIVE' | 'ELIMINATED' | 'FINISHED'>(() => {
    if (typeof window === 'undefined') return 'ALL';
    const saved = window.localStorage.getItem('lms.competitions.mineFilter');
    return saved === 'ALL' || saved === 'NEEDS_ACTION' || saved === 'PICK_DUE' || saved === 'AWAITING_PAYMENT' || saved === 'UPCOMING' || saved === 'ACTIVE' || saved === 'ELIMINATED' || saved === 'FINISHED'
      ? saved
      : 'ALL';
  });
  const [compactMineView, setCompactMineView] = useState(() => {
    if (typeof window === 'undefined') return false;
    const saved = window.localStorage.getItem('lms.competitions.compactMineView');
    return saved == null ? true : saved === 'true';
  });
  const [expandedMineRows, setExpandedMineRows] = useState<Set<number>>(new Set());
  const [showMineAdvancedFilters, setShowMineAdvancedFilters] = useState(false);
  const [mineSections, setMineSections] = useState({
    needsAction: false,
    active: false,
    eliminated: true,
    finished: true,
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [remainingPage, setRemainingPage] = useState(1);
  const [joinCodeInput, setJoinCodeInput] = useState(joinCodeParam);
  const [recentJoinSuccess, setRecentJoinSuccess] = useState<{ name: string; payment: 'PAID' | 'MANUAL' | 'FREE' } | null>(null);
  const PAGE_SIZE = 12;
  const FEATURED_LIMIT = 6;
  const REMAINING_PAGE_SIZE = 20;

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
    setRemainingPage(1);
  }, [search, statusFilter, feeFilter, startWindow, sortBy, selectedClub, viewMode]);

  useEffect(() => {
    setJoinCodeInput(joinCodeParam);
  }, [joinCodeParam]);
  useEffect(() => {
    window.localStorage.setItem('lms.competitions.viewMode', viewMode);
  }, [viewMode]);
  useEffect(() => {
    window.localStorage.setItem('lms.competitions.mineFilter', mineFilter);
  }, [mineFilter]);
  useEffect(() => {
    window.localStorage.setItem('lms.competitions.compactMineView', String(compactMineView));
  }, [compactMineView]);

  const { data: clubs } = useQuery<Club[]>({
    queryKey: ['clubs'],
    queryFn: () => api.get('/competitions/clubs').then((r) => Array.isArray(r.data) ? r.data : []),
    staleTime: 60_000,
  });

  const { data: competitions, isLoading, error } = useQuery<Competition[]>({
    queryKey: ['competitions', 'upcoming', selectedClub?.id ?? null],
    queryFn: () => {
      const params = selectedClub ? `?clubId=${selectedClub.id}` : '';
      return api.get(`/competitions/upcoming${params}`).then((r) => Array.isArray(r.data) ? r.data : []);
    },
    staleTime: 30_000,
  });

  const { data: myCompetitionsData, isLoading: myLoading, error: myError, isFetching: myFetching } = useQuery<MyCompetition[]>({
    queryKey: ['competitions', 'my', 'details'],
    queryFn: () => api.get('/competitions/my/details').then((r) => Array.isArray(r.data) ? r.data : []),
    staleTime: 30_000,
  });

  const { data: joinedIds } = useQuery<number[]>({
    queryKey: ['competitions', 'my'],
    queryFn: () => api.get('/competitions/my').then((r) => Array.isArray(r.data) ? r.data : []),
    staleTime: 30_000,
  });

  const { data: pastCompetitions, isLoading: pastLoading, error: pastError } = useQuery<Competition[]>({
    queryKey: ['competitions', 'past', selectedClub?.id ?? null],
    queryFn: () => {
      const params = selectedClub ? `?clubId=${selectedClub.id}` : '';
      return api.get(`/competitions/past${params}`).then((r) => Array.isArray(r.data) ? r.data : []);
    },
    enabled: viewMode === 'past' && isAdminOrClubAdmin,
  });

  const {
    data: joinCodeCompetition,
    error: joinCodeError,
    isLoading: joinCodeLoading,
    isFetched: joinCodeFetched,
  } = useQuery<Competition | null>({
    queryKey: ['competitions', 'code', joinCodeParam],
    queryFn: () => api.get(`/competitions/code/${encodeURIComponent(joinCodeParam)}`).then((r) => normalizeCompetition(r.data)),
    enabled: !!joinCodeParam,
    staleTime: 30_000,
    retry: false,
  });

  useEffect(() => {
    if (!joinParam && !joinCodeCompetition?.id) return;
    setViewMode('available');
    setSearch('');
    setStatusFilter('ALL');
    setSelectedClub(null);
    setCurrentPage(1);
  }, [joinParam, joinCodeCompetition?.id]);

  const highlightedCompetitionId = joinParam
    ? Number(joinParam)
    : joinCodeCompetition?.id ?? null;

  const joinMutation = useMutation({
    mutationFn: (id: number) => api.post(`/competitions/${id}/join`),
    onSuccess: (_, id) => {
      const comp = competitions?.find(c => c.id === id);
      if (comp?.paymentMode === 'MANUAL') {
        setRecentJoinSuccess({ name: comp.name, payment: 'MANUAL' });
        toast(
          `You've registered for ${comp.name}! Please pay €${comp.entryFee} to the organiser. Your entry will be activated once payment is confirmed.`,
          { icon: '💸', duration: 8000 }
        );
      } else {
        setRecentJoinSuccess({ name: comp?.name ?? 'competition', payment: 'FREE' });
        toast.success('Joined competition!');
      }
      queryClient.invalidateQueries({ queryKey: ['competitions'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to join'),
  });

  const handleJoin = (comp: Competition) => {
    if (comp.entryFee > 0 && comp.paymentMode === 'STRIPE') {
      setPayingComp(comp);
    } else {
      // FREE or MANUAL — join directly
      joinMutation.mutate(comp.id);
    }
  };

  const joinedSet      = new Set(joinedIds ?? []);
  const allComps       = useMemo(() => {
    const base = competitions ?? [];
    if (!joinCodeCompetition || base.some((c) => c.id === joinCodeCompetition.id)) {
      return base;
    }
    return [joinCodeCompetition, ...base];
  }, [competitions, joinCodeCompetition]);
  const myComps = useMemo(() => {
    const source = myCompetitionsData ?? [];
    const deduped = new Map<number, MyCompetition>();
    for (const mc of source) {
      const id = mc?.competition?.id;
      if (typeof id !== 'number') continue;
      if (!deduped.has(id)) {
        deduped.set(id, mc);
      }
    }
    return Array.from(deduped.values());
  }, [myCompetitionsData]);
  useEffect(() => {
    if (myComps.length > 8) {
      setCompactMineView(true);
    }
  }, [myComps.length]);
  const paymentActionCount = myComps.filter((mc) => mc.paymentState === 'AWAITING_PAYMENT').length;
  const finishedComps  = myComps.filter((mc) => mc.competition.status === 'COMPLETED');
  const activeComps    = myComps.filter((mc) => mc.competition.status !== 'COMPLETED' && (mc.myStatus === 'ACTIVE' || mc.myStatus === 'WINNER'));
  const eliminatedComps = myComps.filter((mc) => mc.competition.status !== 'COMPLETED' && mc.myStatus === 'ELIMINATED');

  // All useMemo hooks must be called before any early return
  const filteredAvailable = useMemo(() => {
    let list = allComps.filter((c) => !joinedSet.has(c.id) && c.status === 'UPCOMING');
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q) || c.clubName?.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q));
    }
    if (statusFilter !== 'ALL') list = list.filter(c => c.status === statusFilter);
    if (feeFilter !== 'ALL') {
      list = list.filter(c => feeFilter === 'FREE' ? (c.entryFee ?? 0) === 0 : (c.entryFee ?? 0) > 0);
    }
    if (startWindow !== 'ALL') {
      const days = Number(startWindow);
      const now = new Date();
      const cutoff = new Date(now);
      cutoff.setDate(now.getDate() + days);
      list = list.filter((c) => {
        const rawDate = c.firstGameweekDate ?? c.startDate;
        if (!rawDate) return false;
        const start = parseDate(rawDate);
        return start >= now && start <= cutoff;
      });
    }
    switch (sortBy) {
      case 'players': list = [...list].sort((a, b) => b.participantCount - a.participantCount); break;
      case 'name':    list = [...list].sort((a, b) => a.name.localeCompare(b.name)); break;
      case 'date':
      default:
        list = [...list].sort((a, b) => {
          const da = a.firstGameweekDate ?? a.startDate ?? '';
          const db = b.firstGameweekDate ?? b.startDate ?? '';
          return da.localeCompare(db);
        });
    }
    if (highlightedCompetitionId) {
      list = [...list].sort((a, b) => {
        if (a.id === highlightedCompetitionId) return -1;
        if (b.id === highlightedCompetitionId) return 1;
        return 0;
      });
    }
    return list;
  }, [allComps, joinedSet, search, statusFilter, feeFilter, startWindow, sortBy, highlightedCompetitionId]);

  const searchedMine = useMemo(() => {
    if (!search.trim()) return myComps;
    const q = search.toLowerCase();
    return myComps.filter((mc) => mc.competition.name.toLowerCase().includes(q) || mc.competition.clubName?.toLowerCase().includes(q));
  }, [myComps, search]);

  const upcomingMineCandidates = myComps.filter(
    (mc) => mc.competition.status === 'UPCOMING' && (mc.myStatus === 'ACTIVE' || mc.myStatus === 'WINNER')
  );
  const upcomingMinePickChecks = useQueries({
    queries: upcomingMineCandidates.map((mc) => ({
      queryKey: ['competition', mc.competition.id, 'mine-needs-action-pick-check'],
      queryFn: async () => {
        const currentGw = await api.get<GameweekResponse>(`/competitions/${mc.competition.id}/gameweeks/current`).then((r) => r.data);
        if (!currentGw || currentGw.status !== 'UPCOMING') {
          return { competitionId: mc.competition.id, requiresPick: false };
        }
        try {
          await api.get<PickResponse>(`/competitions/${mc.competition.id}/gameweeks/${currentGw.id}/my-pick`);
          return { competitionId: mc.competition.id, requiresPick: false };
        } catch {
          return { competitionId: mc.competition.id, requiresPick: true };
        }
      },
      staleTime: 30_000,
    })),
  });
  const requiresPickByCompetitionId = new Map<number, boolean>();
  upcomingMinePickChecks.forEach((q) => {
    if (q.data) requiresPickByCompetitionId.set(q.data.competitionId, q.data.requiresPick);
  });
  const hasPickDueAction = (mc: MyCompetition) =>
    mc.competition.status === 'UPCOMING' &&
    (mc.myStatus === 'ACTIVE' || mc.myStatus === 'WINNER') &&
    isPickLockSoon(mc.competition) &&
    requiresPickByCompetitionId.get(mc.competition.id) === true;

  const filteredMine = useMemo(() => {
    if (mineFilter === 'ALL') return searchedMine;
    return searchedMine.filter((mc) => {
      const pickDue = hasPickDueAction(mc);
      const awaiting = mc.paymentState === 'AWAITING_PAYMENT';
      const isCompleted = mc.competition.status === 'COMPLETED';
      const isEliminated = mc.myStatus === 'ELIMINATED';
      if (mineFilter === 'NEEDS_ACTION') return !isCompleted && !isEliminated && (pickDue || awaiting);
      if (mineFilter === 'PICK_DUE') return !isCompleted && !isEliminated && pickDue;
      if (mineFilter === 'AWAITING_PAYMENT') return !isCompleted && !isEliminated && awaiting;
      if (mineFilter === 'UPCOMING') return mc.competition.status === 'UPCOMING' && (mc.myStatus === 'ACTIVE' || mc.myStatus === 'WINNER') && !(pickDue || awaiting);
      if (mineFilter === 'FINISHED') return mc.competition.status === 'COMPLETED';
      if (mineFilter === 'ELIMINATED') return mc.competition.status !== 'COMPLETED' && mc.myStatus === 'ELIMINATED';
      return mc.competition.status === 'ACTIVE' && (mc.myStatus === 'ACTIVE' || mc.myStatus === 'WINNER');
    });
  }, [searchedMine, mineFilter, requiresPickByCompetitionId]);

  const filteredPast = useMemo(() => {
    let list = pastCompetitions ?? [];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q) || c.clubName?.toLowerCase().includes(q));
    }
    return list;
  }, [pastCompetitions, search]);

  const isMineNeedsAction = useCallback((mc: MyCompetition) => {
    // Keep section buckets mutually exclusive: eliminated/finished competitions
    // should not also appear in Needs Action.
    if (mc.competition.status === 'COMPLETED' || mc.myStatus === 'ELIMINATED') {
      return false;
    }
    return mc.paymentState === 'AWAITING_PAYMENT' || hasPickDueAction(mc);
  }, [requiresPickByCompetitionId]);
  const mineNeedsActionCount = useMemo(
    () => searchedMine.filter((mc) => isMineNeedsAction(mc)),
    [searchedMine, isMineNeedsAction]
  );
  const mineActiveCount = useMemo(
    () => searchedMine.filter((mc) => mc.competition.status === 'ACTIVE' && (mc.myStatus === 'ACTIVE' || mc.myStatus === 'WINNER') && !isMineNeedsAction(mc)),
    [searchedMine, isMineNeedsAction]
  );
  const mineUpcomingCount = useMemo(
    () => searchedMine.filter((mc) => mc.competition.status === 'UPCOMING' && (mc.myStatus === 'ACTIVE' || mc.myStatus === 'WINNER') && !isMineNeedsAction(mc)),
    [searchedMine, isMineNeedsAction]
  );
  const mineEliminatedCount = useMemo(
    () => searchedMine.filter((mc) => mc.competition.status !== 'COMPLETED' && mc.myStatus === 'ELIMINATED'),
    [searchedMine]
  );
  const mineFinishedCount = useMemo(
    () => searchedMine.filter((mc) => mc.competition.status === 'COMPLETED'),
    [searchedMine]
  );
  const mineNeedsAction = useMemo(
    () => filteredMine.filter((mc) => isMineNeedsAction(mc)),
    [filteredMine, isMineNeedsAction]
  );
  const mineActive = useMemo(
    () => filteredMine.filter((mc) => mc.competition.status === 'ACTIVE' && (mc.myStatus === 'ACTIVE' || mc.myStatus === 'WINNER') && !isMineNeedsAction(mc)),
    [filteredMine, isMineNeedsAction]
  );
  const mineUpcoming = useMemo(
    () => filteredMine.filter((mc) => mc.competition.status === 'UPCOMING' && (mc.myStatus === 'ACTIVE' || mc.myStatus === 'WINNER') && !isMineNeedsAction(mc)),
    [filteredMine, isMineNeedsAction]
  );
  const mineEliminated = useMemo(
    () => filteredMine.filter((mc) => mc.competition.status !== 'COMPLETED' && mc.myStatus === 'ELIMINATED'),
    [filteredMine]
  );
  const mineFinished = useMemo(
    () => filteredMine.filter((mc) => mc.competition.status === 'COMPLETED'),
    [filteredMine]
  );

  const totalPages = Math.max(1, Math.ceil(filteredAvailable.length / PAGE_SIZE));
  const page = Math.min(currentPage, totalPages);
  const paginatedAvailable = filteredAvailable.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const myCompetitionById = new Map(myComps.map((mc) => [mc.competition.id, mc]));
  const activeCountForHeader = useMemo(() => {
    const fromVisible = allComps.filter((c) => c.status === 'ACTIVE').length;
    const extraJoinedPrivate = myComps.filter(
      (mc) => mc.competition.status === 'ACTIVE' && !allComps.some((c) => c.id === mc.competition.id),
    ).length;
    return fromVisible + extraJoinedPrivate;
  }, [allComps, myComps]);
  const openCountForHeader = useMemo(() => {
    const fromVisible = allComps.filter((c) => c.status === 'UPCOMING').length;
    const extraJoinedPrivate = myComps.filter(
      (mc) => mc.competition.status === 'UPCOMING' && !allComps.some((c) => c.id === mc.competition.id),
    ).length;
    return fromVisible + extraJoinedPrivate;
  }, [allComps, myComps]);
  const needsActionAvailable = filteredAvailable.filter((c) => {
    const mine = myCompetitionById.get(c.id);
    if (!mine) return false;
    if (mine.paymentState === 'AWAITING_PAYMENT') return true;
    if (c.status === 'UPCOMING' && (mine.myStatus === 'ACTIVE' || mine.myStatus === 'WINNER')) return hasPickDueAction(mine);
    return false;
  });
  const needsActionAvailableLimited = needsActionAvailable.slice(0, FEATURED_LIMIT);
  const needsActionIds = new Set(needsActionAvailableLimited.map((c) => c.id));
  const liveAvailable = filteredAvailable.filter((c) => joinedSet.has(c.id) && c.status === 'ACTIVE' && !needsActionIds.has(c.id));
  const liveAvailableLimited = liveAvailable.slice(0, FEATURED_LIMIT);
  const featuredIds = new Set([...needsActionIds, ...liveAvailableLimited.map((c) => c.id)]);
  const remainingAvailable = filteredAvailable.filter((c) => !featuredIds.has(c.id));
  const remainingTotalPages = Math.max(1, Math.ceil(remainingAvailable.length / REMAINING_PAGE_SIZE));
  const remainingSafePage = Math.min(remainingPage, remainingTotalPages);
  const paginatedRemainingAvailable = remainingAvailable.slice(
    (remainingSafePage - 1) * REMAINING_PAGE_SIZE,
    remainingSafePage * REMAINING_PAGE_SIZE,
  );

  const sorted      = [...allComps].sort((a, b) => (joinedSet.has(a.id) ? 0 : 1) - (joinedSet.has(b.id) ? 0 : 1));
  const joinedComps = sorted.filter((c) => joinedSet.has(c.id));
  const otherComps  = sorted.filter((c) => !joinedSet.has(c.id));

  const showClubFilter = clubs && clubs.length > 0 && (viewMode === 'available' || (viewMode === 'past' && user?.role === 'ADMIN'));
  const activeFilterCount =
    (statusFilter !== 'ALL' ? 1 : 0) +
    (feeFilter !== 'ALL' ? 1 : 0) +
    (startWindow !== 'ALL' ? 1 : 0) +
    (sortBy !== 'date' ? 1 : 0) +
    (selectedClub ? 1 : 0) +
    (listView ? 1 : 0);

  const joinCodeStatus = (joinCodeError as AxiosError | null)?.response?.status;

  const submitJoinCode = () => {
    const normalized = joinCodeInput.trim().toUpperCase();
    if (!normalized) return;
    const next = new URLSearchParams(searchParams);
    next.set('code', normalized);
    next.delete('join');
    setSearchParams(next, { replace: false });
    setViewMode('available');
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* ── Page header ── */}
      <div className="relative overflow-hidden rounded-[1.75rem] border border-white/8 bg-[radial-gradient(circle_at_10%_0%,rgba(251,191,36,0.18),transparent_28rem),radial-gradient(circle_at_85%_15%,rgba(56,189,248,0.18),transparent_24rem),linear-gradient(135deg,rgba(15,23,42,0.92),rgba(8,15,30,0.9))] px-4 py-5 shadow-[0_28px_70px_rgba(2,6,23,0.42)] sm:px-6 sm:py-6">
        <div className="absolute right-0 top-0 h-24 w-24 translate-x-8 -translate-y-8 rounded-full bg-amber-300/15 blur-2xl" />
        <div className="absolute inset-0 opacity-[0.08] pointer-events-none" style={{
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.5) 0.5px, transparent 0.5px)',
          backgroundSize: '12px 12px',
        }} />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex rounded-full border border-brand-400/25 bg-brand-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-200">
              Matchday hub
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">Competitions</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-gray-300 sm:text-[15px]">
              Find public pools, return to your active runs, or jump straight in with an invite code. Every surface here is tuned around the next pick.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <MetricCard label="Live" value={String(activeCountForHeader)} />
            <MetricCard label="Open" value={String(openCountForHeader)} />
            <MetricCard label="Yours" value={String(myComps.length)} />
          </div>
        </div>
      </div>

      {/* ── Navigation + controls ── */}
      <div className="rounded-2xl border border-white/10 bg-[linear-gradient(135deg,rgba(30,41,59,0.72),rgba(15,23,42,0.8))] p-3 shadow-[0_24px_55px_rgba(2,6,23,0.38)] sm:p-4">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 rounded-2xl border border-white/10 bg-[linear-gradient(135deg,rgba(30,41,59,0.72),rgba(15,23,42,0.78))] p-1.5 overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] lg:flex lg:flex-wrap">
            <ModeTab
              active={viewMode === 'available'}
              onClick={() => setViewMode('available')}
              label="Available"
              hint="Open to join"
              count={filteredAvailable.length}
              isLoading={isLoading}
            />
            <ModeTab
              active={viewMode === 'mine'}
              onClick={() => setViewMode('mine')}
              label="My Competitions"
              hint="Your entries"
              count={myComps.length}
              isLoading={myLoading || myFetching}
            />
            {isAdminOrClubAdmin && (
              <ModeTab
                active={viewMode === 'past'}
                onClick={() => setViewMode('past')}
                label="Past"
                hint="Finished comps"
                count={pastCompetitions?.length}
                isLoading={viewMode === 'past' && pastLoading}
                className="col-span-2 lg:col-span-1"
              />
            )}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={viewMode === 'mine' ? 'Search your competitions…' : 'Search competitions…'}
                className="input-field w-full pl-9 pr-10 text-sm"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-lg">×</button>
              )}
            </div>

            {viewMode === 'available' && (
              <div className="flex w-full flex-col gap-2 sm:ml-auto sm:w-auto sm:flex-row sm:items-center">
                <div className="flex w-full items-center gap-2 rounded-xl border border-brand-500/20 bg-brand-500/[0.07] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:min-w-[17rem]">
                  <input
                    type="text"
                    value={joinCodeInput}
                    onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        submitJoinCode();
                      }
                    }}
                    placeholder="Enter join code"
                    className="min-w-0 flex-1 bg-transparent px-2 py-1 text-xs text-gray-100 outline-none placeholder:text-gray-500"
                  />
                  <button
                    type="button"
                    onClick={submitJoinCode}
                    className="rounded-lg bg-gradient-to-r from-brand-500 to-cyan-400 px-2.5 py-1.5 text-xs font-semibold text-slate-950 transition hover:from-brand-400 hover:to-cyan-300"
                  >
                    Unlock
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setShowFilters((v) => !v)}
                  className={`inline-flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition sm:w-auto sm:justify-start ${
                    showFilters || activeFilterCount > 0
                      ? 'border-brand-500/40 bg-brand-500/10 text-brand-300'
                      : 'border-gray-600/50 bg-surface-700 text-gray-300 hover:bg-surface-600'
                  }`}
                >
                  <span>Refine</span>
                  {activeFilterCount > 0 && (
                    <span className="inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-white/10 px-1 text-[10px] font-bold">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>

          {viewMode === 'available' && (showFilters || activeFilterCount > 0) && (
            <div className="grid gap-3 rounded-xl border border-white/10 bg-[linear-gradient(135deg,rgba(15,23,42,0.72),rgba(2,6,23,0.62))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:grid-cols-[1.4fr_1fr_1fr_1fr_auto] sm:items-end">
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">Status</p>
                <div className="-mx-1 overflow-x-auto pb-1 sm:mx-0 sm:overflow-visible">
                  <div className="inline-flex min-w-max rounded-lg bg-surface-700 p-0.5">
                    {(['ALL', 'UPCOMING', 'ACTIVE'] as const).map(s => (
                      <button key={s} onClick={() => setStatusFilter(s)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${statusFilter === s ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                        {s === 'ALL' ? `All (${competitions?.length ?? 0})` : s === 'UPCOMING' ? `Upcoming (${competitions?.filter(c => c.status === 'UPCOMING').length ?? 0})` : `Active (${competitions?.filter(c => c.status === 'ACTIVE').length ?? 0})`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">Entry fee</label>
                <div className="flex flex-wrap gap-2">
                  {([
                    { value: 'ALL', label: 'Any' },
                    { value: 'FREE', label: 'Free' },
                    { value: 'PAID', label: 'Paid' },
                  ] as const).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setFeeFilter(option.value)}
                      className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                        feeFilter === option.value
                          ? 'border-brand-500/40 bg-brand-500/10 text-brand-300'
                          : 'border-gray-600/50 bg-surface-700 text-gray-300 hover:bg-surface-600'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">Starts in</label>
                <div className="flex flex-wrap gap-2">
                  {([
                    { value: 'ALL', label: 'Anytime' },
                    { value: '7', label: '7 days' },
                    { value: '14', label: '14 days' },
                    { value: '30', label: '30 days' },
                  ] as const).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setStartWindow(option.value)}
                      className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                        startWindow === option.value
                          ? 'border-brand-500/40 bg-brand-500/10 text-brand-300'
                          : 'border-gray-600/50 bg-surface-700 text-gray-300 hover:bg-surface-600'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">Sort</label>
                <div className="flex flex-wrap gap-2">
                  {([
                    { value: 'date', label: 'Soonest' },
                    { value: 'players', label: 'Players' },
                    { value: 'name', label: 'A-Z' },
                  ] as const).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setSortBy(option.value)}
                      className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                        sortBy === option.value
                          ? 'border-brand-500/40 bg-brand-500/10 text-brand-300'
                          : 'border-gray-600/50 bg-surface-700 text-gray-300 hover:bg-surface-600'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {showClubFilter && (
                <div>
                  <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">Club</label>
                  <div className="w-full sm:w-44">
                    <ErrorBoundary fallback={null}>
                      <ClubTypeahead clubs={clubs!} selected={selectedClub} onSelect={setSelectedClub} />
                    </ErrorBoundary>
                  </div>
                </div>
              )}

              <div className="flex items-end justify-between gap-3 sm:justify-end">
                <div className="inline-flex rounded-lg bg-surface-700 p-0.5">
                  <button onClick={() => setListView(false)}
                    className={`p-2 rounded-md transition-colors ${!listView ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'}`} title="Grid view">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
                      <path d="M1 2.5A1.5 1.5 0 012.5 1h3A1.5 1.5 0 017 2.5v3A1.5 1.5 0 015.5 7h-3A1.5 1.5 0 011 5.5v-3zm8 0A1.5 1.5 0 0110.5 1h3A1.5 1.5 0 0115 2.5v3A1.5 1.5 0 0113.5 7h-3A1.5 1.5 0 019 5.5v-3zm-8 8A1.5 1.5 0 012.5 9h3A1.5 1.5 0 017 10.5v3A1.5 1.5 0 015.5 15h-3A1.5 1.5 0 011 13.5v-3zm8 0A1.5 1.5 0 0110.5 9h3A1.5 1.5 0 0115 10.5v3A1.5 1.5 0 0113.5 15h-3A1.5 1.5 0 019 13.5v-3z"/>
                    </svg>
                  </button>
                  <button onClick={() => setListView(true)}
                    className={`p-2 rounded-md transition-colors ${listView ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'}`} title="List view">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
                      <path fillRule="evenodd" d="M2.5 12a.5.5 0 01.5-.5h10a.5.5 0 010 1H3a.5.5 0 01-.5-.5zm0-4a.5.5 0 01.5-.5h10a.5.5 0 010 1H3a.5.5 0 01-.5-.5zm0-4a.5.5 0 01.5-.5h10a.5.5 0 010 1H3a.5.5 0 01-.5-.5z"/>
                    </svg>
                  </button>
                </div>

                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter('ALL');
                      setFeeFilter('ALL');
                      setStartWindow('ALL');
                      setSortBy('date');
                      setSelectedClub(null);
                      setListView(false);
                    }}
                    className="text-xs text-gray-400 underline-offset-2 hover:text-white hover:underline"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          )}

          {(search || (viewMode === 'available' && (statusFilter !== 'ALL' || feeFilter !== 'ALL' || startWindow !== 'ALL' || selectedClub || sortBy !== 'date'))) && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
              {viewMode === 'available' && (
                <span>
                  {filteredAvailable.length} result{filteredAvailable.length !== 1 ? 's' : ''}
                </span>
              )}
              {search && <span className="rounded-full bg-surface-700 px-2 py-1 text-gray-300">Search: {search}</span>}
              {viewMode === 'available' && statusFilter !== 'ALL' && <span className="rounded-full bg-surface-700 px-2 py-1 text-gray-300">Status: {statusFilter.toLowerCase()}</span>}
              {viewMode === 'available' && feeFilter !== 'ALL' && <span className="rounded-full bg-surface-700 px-2 py-1 text-gray-300">Fee: {feeFilter.toLowerCase()}</span>}
              {viewMode === 'available' && startWindow !== 'ALL' && <span className="rounded-full bg-surface-700 px-2 py-1 text-gray-300">Starts in: {startWindow} days</span>}
              {viewMode === 'available' && selectedClub && <span className="rounded-full bg-surface-700 px-2 py-1 text-gray-300">Club: {selectedClub.name}</span>}
            </div>
          )}

          {recentJoinSuccess && (
            <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-3 py-2 text-xs text-green-200">
              Entry confirmed for <strong>{recentJoinSuccess.name}</strong>.
              {recentJoinSuccess.payment === 'MANUAL' && ' Awaiting organiser payment confirmation.'}
              {recentJoinSuccess.payment === 'PAID' && ' Payment complete and entry confirmed.'}
              {' '}
              <button onClick={() => setRecentJoinSuccess(null)} className="underline">Dismiss</button>
            </div>
          )}

          {paymentActionCount > 0 && viewMode === 'available' && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              Action needed: {paymentActionCount} competition{paymentActionCount > 1 ? 's' : ''} awaiting payment confirmation.
              {' '}
              <button onClick={() => setViewMode('mine')} className="underline">Open My Competitions</button>
            </div>
          )}
        </div>
      </div>

      {/* ── My Competitions — summary strip ── */}
      {viewMode === 'mine' && myComps.length > 0 && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <FilterStatTile label="Needs action" value={mineNeedsActionCount.length} color="text-amber-300" isActive={mineFilter === 'NEEDS_ACTION'} onClick={() => setMineFilter((current) => current === 'NEEDS_ACTION' ? 'ALL' : 'NEEDS_ACTION')} />
            <FilterStatTile label="Upcoming" value={mineUpcomingCount.length} color="text-blue-300" isActive={mineFilter === 'UPCOMING'} onClick={() => setMineFilter((current) => current === 'UPCOMING' ? 'ALL' : 'UPCOMING')} />
            <FilterStatTile label="In play" value={mineActiveCount.length} color="text-green-400" isActive={mineFilter === 'ACTIVE'} onClick={() => setMineFilter((current) => current === 'ACTIVE' ? 'ALL' : 'ACTIVE')} />
            <FilterStatTile label="Eliminated" value={mineEliminatedCount.length} color="text-red-400" isActive={mineFilter === 'ELIMINATED'} onClick={() => setMineFilter((current) => current === 'ELIMINATED' ? 'ALL' : 'ELIMINATED')} />
            <FilterStatTile label="Finished" value={mineFinishedCount.length} color="text-gray-400" isActive={mineFilter === 'FINISHED'} onClick={() => setMineFilter((current) => current === 'FINISHED' ? 'ALL' : 'FINISHED')} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(['ALL', 'PICK_DUE', 'AWAITING_PAYMENT'] as const).map((f) => (
              <FilterPill
                key={f}
                active={mineFilter === f}
                onClick={() => setMineFilter((current) => current === f ? 'ALL' : f)}
              >
                {f === 'ALL' ? 'All' : f === 'PICK_DUE' ? 'Pick due' : 'Awaiting payment'}
              </FilterPill>
            ))}
            <button
              type="button"
              onClick={() => setShowMineAdvancedFilters((v) => !v)}
              className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-gray-300 sm:hidden"
            >
              {showMineAdvancedFilters ? 'Less filters' : 'More filters'}
            </button>
          </div>

          <div className={`${showMineAdvancedFilters ? 'flex' : 'hidden'} flex-wrap items-center gap-2 sm:flex`}>
            <button
              type="button"
              onClick={() => setCompactMineView((v) => !v)}
              className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-gray-300 sm:ml-auto"
            >
              {compactMineView ? 'Card view' : 'Compact view'}
            </button>
            <button
              type="button"
              onClick={() => setMineSections({ needsAction: false, active: false, eliminated: false, finished: false })}
              className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-gray-300"
            >
              Expand all
            </button>
            <button
              type="button"
              onClick={() => setMineSections({ needsAction: true, active: true, eliminated: true, finished: true })}
              className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-gray-300"
            >
              Collapse all
            </button>
            <button
              type="button"
              onClick={() => {
                setMineFilter('ALL');
                setSearch('');
              }}
              className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-gray-300"
            >
              Reset
            </button>
          </div>

          {(mineFilter !== 'ALL' || search) && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
              {mineFilter !== 'ALL' && (
                <span className="rounded-full bg-surface-700 px-2 py-1 text-gray-300">
                  Showing: {mineFilter.toLowerCase()}
                </span>
              )}
              {search && <span className="rounded-full bg-surface-700 px-2 py-1 text-gray-300">Search: {search}</span>}
              {mineFilter !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => setMineFilter('ALL')}
                  className="text-gray-400 underline-offset-2 hover:text-white hover:underline"
                >
                  Clear filter
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Available ── */}
      {viewMode === 'available' && (
        isLoading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message="Failed to load competitions" />
        ) : filteredAvailable.length === 0 ? (
          search || statusFilter !== 'ALL'
            ? <EmptyState icon="🔍" title="No competitions match your search" action={<button onClick={() => { setSearch(''); setStatusFilter('ALL'); }} className="text-brand-400 hover:text-brand-300 underline text-sm">Clear filters</button>} />
            : <EmptyState icon="🏆" title="No competitions available yet" subtitle="Check back soon — new competitions are added regularly" />
        ) : (
          <div className="space-y-4">
            {!!joinCodeParam && (
            <div className={`rounded-2xl border px-3 py-2.5 text-xs sm:text-sm ${
                joinCodeCompetition
                  ? 'border-brand-500/30 bg-brand-500/10 text-brand-100'
                  : joinCodeError
                  ? 'border-red-500/30 bg-red-500/10 text-red-200'
                  : 'border-gray-700/60 bg-surface-800/70 text-gray-300'
              }`}>
                {joinCodeCompetition
                  ? `Invite unlocked: ${joinCodeCompetition.name}`
                  : joinCodeStatus === 401 || joinCodeStatus === 403
                  ? `That invite is being blocked by authentication.`
                  : joinCodeStatus && joinCodeStatus >= 500
                  ? `Invite lookup failed on the server (${joinCodeStatus}).`
                  : (joinCodeError || (joinCodeFetched && !joinCodeLoading))
                  ? `Invite code ${joinCodeParam} was not found.`
                  : `Checking invite code ${joinCodeParam}…`}
              </div>
            )}
            {listView ? (
              <CompListView comps={paginatedAvailable} joinedSet={joinedSet} onJoin={(c) => handleJoin(c)} isPending={joinMutation.isPending} />
            ) : (
              <div className="space-y-5">
                {needsActionAvailableLimited.length > 0 && (
                  <Section label={`Needs Action (${needsActionAvailable.length})`} icon="!" iconColor="bg-amber-500">
                    <CompGrid>
                      {needsActionAvailableLimited.map((c) => (
                        (() => {
                          const mine = myCompetitionById.get(c.id);
                          const actionHint = getCompetitionActionHint(c, mine);
                          return (
                        <CompetitionCard
                          key={c.id}
                          comp={c}
                          joined={joinedSet.has(c.id)}
                          onJoin={() => handleJoin(c)}
                          isPending={joinMutation.isPending}
                          actionHint={actionHint}
                          isHighlighted={c.id === highlightedCompetitionId}
                          onClearHighlight={() => {
                            const next = new URLSearchParams(searchParams);
                            next.delete('join');
                            setSearchParams(next, { replace: true });
                          }}
                        />
                          );
                        })()
                      ))}
                    </CompGrid>
                  </Section>
                )}

                {liveAvailableLimited.length > 0 && (
                  <Section label={`Live (${liveAvailable.length})`} icon="●" iconColor="bg-green-600">
                    <CompGrid>
                      {liveAvailableLimited.map((c) => (
                        <CompetitionCard
                          key={c.id}
                          comp={c}
                          joined={joinedSet.has(c.id)}
                          onJoin={() => handleJoin(c)}
                          isPending={joinMutation.isPending}
                          isHighlighted={c.id === highlightedCompetitionId}
                          onClearHighlight={() => {
                            const next = new URLSearchParams(searchParams);
                            next.delete('join');
                            setSearchParams(next, { replace: true });
                          }}
                        />
                      ))}
                    </CompGrid>
                  </Section>
                )}

                <Section label={`All Competitions (${remainingAvailable.length})`}>
                  {remainingAvailable.length > 0 ? (
                    <>
                      <CompListView comps={paginatedRemainingAvailable} joinedSet={joinedSet} onJoin={(c) => handleJoin(c)} isPending={joinMutation.isPending} />
                      <Pagination page={remainingSafePage} totalPages={remainingTotalPages} total={remainingAvailable.length} pageSize={REMAINING_PAGE_SIZE} onPage={setRemainingPage} />
                    </>
                  ) : (
                    <div className="card px-4 py-3 text-sm text-gray-400">No other competitions match the current filters.</div>
                  )}
                </Section>
              </div>
            )}
            {listView && (
              <Pagination page={page} totalPages={totalPages} total={filteredAvailable.length} pageSize={PAGE_SIZE} onPage={setCurrentPage} />
            )}
          </div>
        )
      )}

      {/* ── Mine ── */}
      {viewMode === 'mine' && (
        myLoading ? (
          <LoadingState />
        ) : myError ? (
          <ErrorState message="Failed to load your competitions" />
        ) : !myComps.length ? (
          <EmptyState icon="🏆" title="You haven't joined any competitions yet"
            action={<button onClick={() => setViewMode('available')} className="text-brand-400 hover:text-brand-300 underline text-sm">Browse available competitions</button>}
          />
        ) : filteredMine.length === 0 ? (
          <EmptyState icon="🔍" title="No competitions match your search" action={<button onClick={() => setSearch('')} className="text-brand-400 hover:text-brand-300 underline text-sm">Clear search</button>} />
        ) : (
          <div className="space-y-8">
            {mineNeedsAction.length > 0 && (
              <Section label={`Needs Action (${mineNeedsAction.length})`} icon="!" iconColor="bg-amber-500" collapsible collapsed={mineSections.needsAction} onToggle={() => setMineSections((s) => ({ ...s, needsAction: !s.needsAction }))}>
                {compactMineView
                  ? <div className="space-y-2">{mineNeedsAction.map((mc) => <MyCompetitionRow key={mc.competition.id} myComp={mc} expanded={expandedMineRows.has(mc.competition.id)} onToggleExpand={() => setExpandedMineRows((prev) => { const next = new Set(prev); if (next.has(mc.competition.id)) next.delete(mc.competition.id); else next.add(mc.competition.id); return next; })} actionHint={getCompetitionActionHint(mc.competition, mc, hasPickDueAction(mc))} />)}</div>
                  : <CompGrid>{mineNeedsAction.map((mc) => <MyCompetitionCard key={mc.competition.id} myComp={mc} actionHint={getCompetitionActionHint(mc.competition, mc, hasPickDueAction(mc))} />)}</CompGrid>}
              </Section>
            )}
            {mineActive.length > 0 && (
              <Section label={`Active (${mineActive.length})`} icon="✓" iconColor="bg-green-600" collapsible collapsed={mineSections.active} onToggle={() => setMineSections((s) => ({ ...s, active: !s.active }))}>
                {compactMineView
                  ? <div className="space-y-2">{mineActive.map((mc) => <MyCompetitionRow key={mc.competition.id} myComp={mc} expanded={expandedMineRows.has(mc.competition.id)} onToggleExpand={() => setExpandedMineRows((prev) => { const next = new Set(prev); if (next.has(mc.competition.id)) next.delete(mc.competition.id); else next.add(mc.competition.id); return next; })} actionHint={getCompetitionActionHint(mc.competition, mc, hasPickDueAction(mc))} />)}</div>
                  : <CompGrid>{mineActive.map((mc) => <MyCompetitionCard key={mc.competition.id} myComp={mc} actionHint={getCompetitionActionHint(mc.competition, mc, hasPickDueAction(mc))} />)}</CompGrid>}
              </Section>
            )}
            {mineUpcoming.length > 0 && (mineFilter === 'ALL' || mineFilter === 'UPCOMING') && (
              <Section label={`Upcoming (${mineUpcoming.length})`} icon="○" iconColor="bg-blue-500">
                {compactMineView
                  ? <div className="space-y-2">{mineUpcoming.map((mc) => <MyCompetitionRow key={mc.competition.id} myComp={mc} expanded={expandedMineRows.has(mc.competition.id)} onToggleExpand={() => setExpandedMineRows((prev) => { const next = new Set(prev); if (next.has(mc.competition.id)) next.delete(mc.competition.id); else next.add(mc.competition.id); return next; })} actionHint={getCompetitionActionHint(mc.competition, mc, hasPickDueAction(mc))} />)}</div>
                  : <CompGrid>{mineUpcoming.map((mc) => <MyCompetitionCard key={mc.competition.id} myComp={mc} actionHint={getCompetitionActionHint(mc.competition, mc, hasPickDueAction(mc))} />)}</CompGrid>}
              </Section>
            )}
            {mineEliminated.length > 0 && (
              <Section label={`Eliminated (${mineEliminated.length})`} icon="✕" iconColor="bg-gray-600" collapsible collapsed={mineSections.eliminated} onToggle={() => setMineSections((s) => ({ ...s, eliminated: !s.eliminated }))}>
                {compactMineView
                  ? <div className="space-y-2">{mineEliminated.map((mc) => <MyCompetitionRow key={mc.competition.id} myComp={mc} expanded={expandedMineRows.has(mc.competition.id)} onToggleExpand={() => setExpandedMineRows((prev) => { const next = new Set(prev); if (next.has(mc.competition.id)) next.delete(mc.competition.id); else next.add(mc.competition.id); return next; })} actionHint={getCompetitionActionHint(mc.competition, mc, hasPickDueAction(mc))} />)}</div>
                  : <CompGrid>{mineEliminated.map((mc) => <MyCompetitionCard key={mc.competition.id} myComp={mc} actionHint={getCompetitionActionHint(mc.competition, mc, hasPickDueAction(mc))} />)}</CompGrid>}
              </Section>
            )}
            {mineFinished.length > 0 && (
              <Section label={`Finished (${mineFinished.length})`} icon="🏁" iconColor="bg-gray-700" collapsible collapsed={mineSections.finished} onToggle={() => setMineSections((s) => ({ ...s, finished: !s.finished }))}>
                {compactMineView
                  ? <div className="space-y-2">{mineFinished.map((mc) => <MyCompetitionRow key={mc.competition.id} myComp={mc} expanded={expandedMineRows.has(mc.competition.id)} onToggleExpand={() => setExpandedMineRows((prev) => { const next = new Set(prev); if (next.has(mc.competition.id)) next.delete(mc.competition.id); else next.add(mc.competition.id); return next; })} actionHint={getCompetitionActionHint(mc.competition, mc, hasPickDueAction(mc))} />)}</div>
                  : <CompGrid>{mineFinished.map((mc) => <MyCompetitionCard key={mc.competition.id} myComp={mc} actionHint={getCompetitionActionHint(mc.competition, mc, hasPickDueAction(mc))} />)}</CompGrid>}
              </Section>
            )}
          </div>
        )
      )}

      {/* ── Past (admin only) ── */}
      {viewMode === 'past' && isAdminOrClubAdmin && (
        <>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-gray-300">
          Showing completed competitions from the last 3 months.
        </div>
        {pastLoading ? (
          <LoadingState />
        ) : pastError ? (
          <ErrorState message="Failed to load past competitions" />
        ) : filteredPast.length === 0 ? (
          search
            ? <EmptyState icon="🔍" title="No competitions match your search" action={<button onClick={() => setSearch('')} className="text-brand-400 hover:text-brand-300 underline text-sm">Clear search</button>} />
            : <EmptyState icon="📋" title="No completed competitions in the last 3 months" subtitle="Only recently completed competitions are shown here." />
        ) : (
          <CompGrid>{filteredPast.map((c) => <PastCompetitionCard key={c.id} comp={c} />)}</CompGrid>
        )}
        </>
      )}

      {payingComp && (
        <PaymentModal
          competition={payingComp}
          onSuccess={() => {
            setRecentJoinSuccess({ name: payingComp.name, payment: 'PAID' });
            setPayingComp(null);
            toast.success(`Payment complete. Joined ${payingComp.name}!`);
            queryClient.invalidateQueries({ queryKey: ['competitions'] });
          }}
          onClose={() => setPayingComp(null)}
        />
      )}
    </div>
  );
}

/* ── Compact list view ───────────────────────────────────────────────────── */

function CompListView({ comps, joinedSet, onJoin, isPending }: {
  comps: Competition[]; joinedSet: Set<number>; onJoin: (c: Competition) => void; isPending: boolean;
}) {
  return (
    <div className="card overflow-hidden divide-y divide-gray-700/50">
      {comps.map((c) => {
        const joined = joinedSet.has(c.id);
        const dateStr = c.firstGameweekDate ?? c.startDate;
        return (
          <div key={c.id} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-700/30 transition-colors">
            {/* Status dot */}
            <span className={`shrink-0 w-2 h-2 rounded-full ${c.status === 'ACTIVE' ? 'bg-green-400' : 'bg-blue-400'}`} />

            {/* Main info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm text-white truncate">{c.name}</span>
                {c.clubLogoUrl && <img src={c.clubLogoUrl} alt="" className="h-5 w-5 rounded-md object-cover border border-white/15 shrink-0" />}
                {c.clubName && <span className="badge-yellow badge-soft shrink-0">{c.clubName}</span>}
                {joined && <span className="badge-brand shrink-0">Joined</span>}
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                {dateStr && <span>{format(parseDate(dateStr), 'MMM d, yyyy')}</span>}
                <span>{c.participantCount} players{c.status === 'ACTIVE' ? ` · ${c.activeCount} surviving` : ''}</span>
                <span className={c.entryFee > 0 ? 'text-brand-400 font-medium' : 'text-green-400'}>{c.entryFee > 0 ? `€${c.entryFee}` : 'Free'}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="shrink-0 flex gap-2">
              <Link to={`/competitions/${c.id}`} className="text-xs px-3 py-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 text-gray-300 transition">
                {joined ? 'Open' : 'View'}
              </Link>
              {!joined && c.status === 'UPCOMING' && (
                <button onClick={() => onJoin(c)} disabled={isPending}
                  className="text-xs px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white transition">
                  {c.entryFee > 0 ? `Join €${c.entryFee}` : 'Join'}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Pagination ──────────────────────────────────────────────────────────── */

function Pagination({ page, totalPages, total, pageSize, onPage }: {
  page: number; totalPages: number; total: number; pageSize: number; onPage: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
      <p className="text-sm text-gray-400">
        Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
      </p>
      <div className="flex items-center gap-1">
        <button onClick={() => onPage(1)} disabled={page === 1} className="px-2 py-1 text-xs rounded bg-surface-700 hover:bg-surface-600 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed">«</button>
        <button onClick={() => onPage(page - 1)} disabled={page === 1} className="px-3 py-1 text-xs rounded bg-surface-700 hover:bg-surface-600 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed">← Prev</button>
        {Array.from({ length: totalPages }, (_, i) => i + 1)
          .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
          .reduce<(number | '...')[]>((acc, p, idx, arr) => {
            if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('...');
            acc.push(p);
            return acc;
          }, [])
          .map((p, idx) => p === '...'
            ? <span key={`e${idx}`} className="px-2 text-xs text-gray-500">…</span>
            : <button key={p} onClick={() => onPage(p as number)}
                className={`px-3 py-1 text-xs rounded transition ${page === p ? 'bg-brand-600 text-white font-medium' : 'bg-surface-700 hover:bg-surface-600 text-gray-300'}`}>{p}</button>
          )}
        <button onClick={() => onPage(page + 1)} disabled={page === totalPages} className="px-3 py-1 text-xs rounded bg-surface-700 hover:bg-surface-600 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed">Next →</button>
        <button onClick={() => onPage(totalPages)} disabled={page === totalPages} className="px-2 py-1 text-xs rounded bg-surface-700 hover:bg-surface-600 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed">»</button>
      </div>
    </div>
  );
}

/* ── Layout helpers ──────────────────────────────────────────────────────── */

function ModeTab({
  active,
  onClick,
  label,
  hint,
  count,
  isLoading,
  className = '',
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint: string;
  count?: number;
  isLoading?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`group flex min-w-0 items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left transition-all sm:px-4 ${className} ${
        active
          ? 'border-brand-400/35 bg-[linear-gradient(135deg,rgba(56,189,248,0.22),rgba(14,165,233,0.1))] text-white shadow-[0_16px_36px_rgba(14,165,233,0.16)]'
          : 'border-white/10 bg-transparent text-gray-300 hover:bg-white/[0.06] hover:text-white'
      }`}
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold tracking-tight">{label}</span>
        <span className={`block truncate text-[11px] ${active ? 'text-brand-100/80' : 'text-gray-500 group-hover:text-gray-300'}`}>{hint}</span>
      </span>
      <span className="shrink-0">
        {isLoading ? (
          <span className={`inline-flex h-5 w-8 animate-pulse rounded-full ${active ? 'bg-white/20' : 'bg-surface-700'}`} />
        ) : (
          <CountBadge count={count ?? 0} active={active} />
        )}
      </span>
    </button>
  );
}

function CountBadge({ count, active }: { count: number; active: boolean }) {
  return (
    <span className={`inline-flex items-center justify-center min-w-[1.5rem] h-6 px-2 rounded-full text-[11px] font-bold ${
      active ? 'bg-white/20 text-white' : 'bg-white/8 text-gray-300'
    }`}>{count}</span>
  );
}

function StatTile({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="card p-3 sm:p-4 text-center">
      <div className={`text-2xl sm:text-3xl font-bold ${color}`}>{value}</div>
      <div className="mt-0.5 text-xs sm:text-sm text-gray-400">{label}</div>
    </div>
  );
}

function FilterStatTile({
  label,
  value,
  color,
  isActive,
  onClick,
}: {
  label: string;
  value: number;
  color: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border p-3 text-center transition-all sm:p-4 ${
        isActive
          ? 'border-brand-400/40 bg-[linear-gradient(135deg,rgba(56,189,248,0.2),rgba(14,165,233,0.08))] shadow-[0_12px_28px_rgba(14,165,233,0.13)]'
          : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]'
      }`}
    >
      <div className={`text-2xl font-bold sm:text-3xl ${color}`}>{value}</div>
      <div className={`mt-0.5 text-xs sm:text-sm ${isActive ? 'text-brand-200' : 'text-gray-400'}`}>{label}</div>
    </button>
  );
}

function Section({
  label,
  icon,
  iconColor,
  children,
  collapsible = false,
  collapsed = false,
  onToggle,
}: {
  label?: string;
  icon?: string;
  iconColor?: string;
  children: React.ReactNode;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  return (
    <section className="space-y-3 sm:space-y-4">
      {label && (
        collapsible ? (
          <button
            type="button"
            onClick={onToggle}
            className="flex w-full items-center justify-between gap-2 text-left text-sm font-semibold text-gray-300 sm:text-base"
          >
            <span className="flex items-center gap-2">
              {icon && <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${iconColor} text-xs text-white`}>{icon}</span>}
              {label}
            </span>
            <span className="text-gray-400">{collapsed ? 'Show' : 'Hide'}</span>
          </button>
        ) : (
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-300 sm:text-base">
            {icon && <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${iconColor} text-xs text-white`}>{icon}</span>}
            {label}
          </h2>
        )
      )}
      {!collapsed && children}
    </section>
  );
}

function CompGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:gap-5 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}

function EmptyState({ icon, title, subtitle, action }: { icon: string; title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="card text-center py-16">
      <div className="text-4xl mb-3">{icon}</div>
      <p className="text-base font-medium text-gray-300">{title}</p>
      {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/* ── Survivor progress bar ───────────────────────────────────────────────── */

function SurvivorBar({ active, total }: { active: number; total: number }) {
  if (!total) return null;
  const pct = Math.round((active / total) * 100);
  return (
    <div className="mt-3">
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>{active} surviving</span>
        <span>{total} started</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-surface-600 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pct > 50 ? 'bg-green-500' : pct > 25 ? 'bg-yellow-500' : 'bg-red-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ── Cards ───────────────────────────────────────────────────────────────── */

function CompetitionCard({ comp, joined, onJoin, isPending, actionHint, isHighlighted = false, onClearHighlight }: {
  comp: Competition; joined: boolean; onJoin: () => void; isPending: boolean; actionHint?: string | null; isHighlighted?: boolean; onClearHighlight?: () => void;
}) {
  const prizePool = comp.prizePool ?? 0;
  const clubAccent = comp.clubPrimaryColor ?? null;
  const clubSupport = comp.clubSecondaryColor ?? comp.clubPrimaryColor ?? null;
  const { data: liveProgress } = useQuery<SurvivorTableProgressResponse>({
    queryKey: ['survivor-table-progress', comp.id],
    queryFn: () => api.get(`/competitions/${comp.id}/survivor-table`).then((r) => r.data),
    enabled: comp.status === 'ACTIVE',
    staleTime: 30_000,
    refetchInterval: (query) => {
      const data = query.state.data as SurvivorTableProgressResponse | undefined;
      const hasInProgress = data?.gameweeks?.some((gw) => gw.status === 'IN_PROGRESS');
      return hasInProgress ? 60_000 : 300_000;
    },
  });
  const liveActiveCount = deriveLiveActiveCount(liveProgress);
  const effectiveActiveCount = liveActiveCount ?? comp.activeCount ?? comp.participantCount;

  return (
    <div
      className={`card flex flex-col p-4 sm:p-5 transition-colors ${isHighlighted ? 'border-brand-400 shadow-[0_0_0_1px_rgba(56,189,248,0.45),0_18px_40px_rgba(8,15,30,0.28)]' : joined ? 'border-brand-500/60 hover:border-brand-400/80' : 'hover:border-gray-600'}`}
      style={competitionCardStyle(comp)}
    >
      <div className="min-h-[24px]">
        {isHighlighted && (
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-brand-400/30 bg-brand-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-200">
            <span>Selected to join</span>
            <button
              type="button"
              onClick={onClearHighlight}
              className="rounded-full px-1 text-brand-100/80 transition hover:bg-white/10 hover:text-white"
              aria-label="Clear selected competition"
            >
              ×
            </button>
          </div>
        )}
      </div>
      {/* Status + joined badge */}
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="flex flex-wrap gap-2">
          <span className={comp.status === 'UPCOMING' ? 'badge-blue' : comp.status === 'ACTIVE' ? 'badge-green' : 'badge-gray'}>
            {comp.status}
          </span>
          {comp.visibility === 'PRIVATE'
            ? <span className="badge-yellow">Private</span>
            : <span className="badge-gray">Public</span>}
        </div>
        <div className="flex items-start">
          {joined ? (
          <span className="badge-brand inline-flex items-center gap-1">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Joined
          </span>
          ) : null}
        </div>
      </div>

      <h3 className="text-lg sm:text-xl font-bold leading-snug line-clamp-2">{comp.name}</h3>
      <div className="mt-1.5 min-h-[20px] flex items-center gap-1.5">
        {comp.clubLogoUrl && <img src={comp.clubLogoUrl} alt="" className="h-5 w-5 rounded-md object-cover border border-white/15 shrink-0" />}
        {comp.clubName && (
          <span
            className="inline-flex max-w-full truncate badge-yellow badge-soft align-top"
            style={competitionAccentBadgeStyle(clubSupport)}
          >
            {comp.clubName}
          </span>
        )}
      </div>
      {comp.visibility === 'PRIVATE' && comp.joinCode ? (
        <div
          className="mt-1 inline-flex w-fit items-center gap-2 rounded-lg border border-brand-500/25 bg-brand-500/8 px-2.5 py-1 text-[11px] text-brand-200"
          style={competitionAccentBadgeStyle(clubAccent)}
        >
          <span className="font-semibold uppercase tracking-[0.12em] text-brand-300" style={clubAccent ? { color: clubAccent } : undefined}>Invite code</span>
          <span
            className="rounded bg-brand-500/12 px-1.5 py-0.5 font-mono text-[12px] font-semibold tracking-[0.14em] text-white"
            style={clubAccent ? { backgroundColor: `${clubAccent}24` } : undefined}
          >
            {comp.joinCode}
          </span>
        </div>
      ) : (
        <div className="mt-1 inline-flex w-fit items-center rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-gray-300">
          Public - no invite code required.
        </div>
      )}
      {actionHint ? (
        <div className="mt-2 rounded-lg border border-amber-400/35 bg-amber-400/10 px-2.5 py-2 text-xs text-amber-100">
          {actionHint}
        </div>
      ) : null}
      <div className="mt-2 min-h-[34px]">
        {comp.description ? (
          <p className="text-xs text-gray-400 line-clamp-2">{comp.description}</p>
        ) : (
          <div aria-hidden="true" className="h-8" />
        )}
      </div>

      {/* Metadata grid */}
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs text-gray-400">
        <div className="min-h-[36px]">
          <span className="block text-gray-500">First Gameweek</span>
          <span className="text-gray-200 font-medium">
            {comp.firstGameweekDate
              ? format(parseDate(comp.firstGameweekDate), 'MMM d, yyyy')
              : comp.startDate
              ? format(parseDate(comp.startDate), 'MMM d, yyyy')
              : '—'}
          </span>
        </div>
        <div className="min-h-[36px]">
          <span className="block text-gray-500">Entry</span>
          <span className={`font-bold text-sm ${comp.entryFee > 0 ? 'text-brand-400' : 'text-green-400'}`}>
            {comp.entryFee > 0 ? `€${comp.entryFee}` : 'Free'}
          </span>
          {comp.paymentMode === 'MANUAL' && (
            <span className="block text-xs text-yellow-400/80 mt-0.5">💸 Pay organiser directly</span>
          )}
        </div>
        <div className="min-h-[36px]">
          <span className="block text-gray-500">Missed Pick</span>
          <span className="text-gray-200">{comp.missedPickMode === 'AUTO_ASSIGN' ? 'Auto-Assign' : 'Eliminate'}</span>
        </div>
        <div className="min-h-[36px]">
          <span className="block text-gray-500">Players</span>
          <div className="min-h-[28px]">
            <span className="block text-gray-200">
              {comp.participantCount ?? 0}
            </span>
            {comp.winnerUsername ? (
              <span className="block text-yellow-400 truncate">🏆 {comp.winnerUsername}</span>
            ) : comp.status === 'ACTIVE' ? (
              <span className="block text-gray-500">{effectiveActiveCount} active</span>
            ) : (
              <div aria-hidden="true" className="h-5" />
            )}
          </div>
        </div>
        {prizePool > 0 && (
          <div className="min-h-[36px]">
            <span className="block text-gray-500">Prize Pool</span>
            <span className="text-yellow-400 font-bold">€{prizePool}</span>
          </div>
        )}
      </div>

      {/* Survivor bar for active competitions */}
      <div className="min-h-[30px]">
        {comp.status === 'ACTIVE' && comp.participantCount > 0 && (
          <SurvivorBar active={effectiveActiveCount} total={comp.participantCount} />
        )}
      </div>

      {/* Actions pinned to bottom */}
      <div className="mt-auto pt-4 flex flex-col gap-2 sm:flex-row">
        <Link to={`/competitions/${comp.id}`} className="btn-secondary flex-1 text-center text-sm py-2">
          {joined ? 'Open →' : 'View'}
        </Link>
        {!joined && comp.status === 'UPCOMING' && (
          <button
            onClick={onJoin}
            disabled={isPending}
            className="btn-primary flex-1 text-sm py-2"
            style={competitionPrimaryButtonStyle(clubAccent)}
          >
            {comp.paymentMode === 'MANUAL'
              ? `Register · €${comp.entryFee} to organiser`
              : comp.entryFee > 0 ? `Join · €${comp.entryFee}` : 'Join Free'}
          </button>
        )}
        {!joined && comp.status === 'ACTIVE' && (
          <span className="flex-1 inline-flex min-h-[40px] items-center justify-center rounded-lg border border-gray-700/60 bg-surface-800/60 text-xs text-gray-500 italic">In progress</span>
        )}
      </div>
    </div>
  );
}

function MyCompetitionCard({ myComp, actionHint }: { myComp: MyCompetition; actionHint?: string | null }) {
  const comp = myComp.competition;
  const myStatus = myComp.myStatus;
  const paymentState = myComp.paymentState;
  const eliminatedWeek = myComp.eliminatedWeek;
  const clubSupport = comp.clubSecondaryColor ?? comp.clubPrimaryColor ?? null;
  const { data: liveProgress } = useQuery<SurvivorTableProgressResponse>({
    queryKey: ['survivor-table-progress', comp.id],
    queryFn: () => api.get(`/competitions/${comp.id}/survivor-table`).then((r) => r.data),
    enabled: comp.status === 'ACTIVE',
    staleTime: 30_000,
    refetchInterval: (query) => {
      const data = query.state.data as SurvivorTableProgressResponse | undefined;
      const hasInProgress = data?.gameweeks?.some((gw) => gw.status === 'IN_PROGRESS');
      return hasInProgress ? 60_000 : 300_000;
    },
  });
  const liveActiveCount = deriveLiveActiveCount(liveProgress);
  const effectiveActiveCount = liveActiveCount ?? comp.activeCount ?? comp.participantCount;
  const urgencyDueSoon = useMemo(() => {
    if (myStatus !== 'ACTIVE' || comp.status !== 'UPCOMING') return false;
    const source = comp.firstGameweekDate ?? comp.startDate;
    if (!source) return false;
    const dt = parseDate(source);
    const ms = dt.getTime() - Date.now();
    return ms > 0 && ms <= 24 * 60 * 60 * 1000;
  }, [myStatus, comp.status, comp.firstGameweekDate, comp.startDate]);

  return (
    <Link
      to={`/competitions/${comp.id}`}
      className="card flex flex-col p-3.5 sm:p-4.5 group transition-all hover:border-gray-600 block"
      style={competitionCardStyle(comp)}
    >
      <div className="flex flex-wrap gap-2 items-center mb-2.5">
        <span className={comp.status === 'UPCOMING' ? 'badge-blue' : comp.status === 'ACTIVE' ? 'badge-green' : 'badge-gray'}>
          {comp.status === 'COMPLETED' ? 'FINISHED' : comp.status}
        </span>
        {myStatus === 'WINNER'     && <span className="badge-yellow">🏆 Winner</span>}
        {myStatus === 'ELIMINATED' && <span className="badge-red">Eliminated</span>}
        {paymentState === 'AWAITING_PAYMENT' && <span className="badge-yellow">Awaiting payment</span>}
        {paymentState === 'PAID' && comp.paymentMode && comp.paymentMode !== 'FREE' && <span className="badge-green">Paid</span>}
        {urgencyDueSoon && <span className="badge-yellow">Due soon</span>}
      </div>

      <h3 className="text-base sm:text-lg font-bold leading-snug line-clamp-2">{comp.name}</h3>
      <div className="mt-1 min-h-[18px] flex items-center gap-1.5">
        {comp.clubLogoUrl && <img src={comp.clubLogoUrl} alt="" className="h-5 w-5 rounded-md object-cover border border-white/15 shrink-0" />}
        {comp.clubName && (
          <span
            className="inline-flex max-w-full truncate badge-yellow badge-soft align-top"
            style={competitionAccentBadgeStyle(clubSupport)}
          >
            {comp.clubName}
          </span>
        )}
      </div>
      {actionHint && (
        <div className="mt-2 rounded-lg border border-amber-400/40 bg-amber-500/12 px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-300">Action required</div>
          <div className="mt-0.5 text-xs text-amber-100">{actionHint}</div>
        </div>
      )}
      <div className="mt-1.5 min-h-[32px]">
        {comp.description ? (
          <p className="text-xs text-gray-400 line-clamp-2">{comp.description}</p>
        ) : (
          <div aria-hidden="true" className="h-8" />
        )}
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-gray-400">
        <div className="min-h-[36px]">
          <span className="block text-gray-500">Players</span>
          <span className="text-gray-200 font-medium">{comp.participantCount}</span>
        </div>
        <div className="min-h-[36px]">
          <span className="block text-gray-500">Surviving</span>
          {comp.status === 'ACTIVE' ? (
            <span className="text-green-400 font-medium">{effectiveActiveCount}</span>
          ) : (
            <div aria-hidden="true" className="h-5" />
          )}
        </div>
        <div className="min-h-[36px]">
          <span className="block text-gray-500">Eliminated GW</span>
          {eliminatedWeek ? (
            <span className="text-red-400 font-medium">{eliminatedWeek}</span>
          ) : (
            <div aria-hidden="true" className="h-5" />
          )}
        </div>
        <div className="min-h-[36px]">
          <span className="block text-gray-500">Your Status</span>
          <span className={`font-medium ${
            myStatus === 'WINNER' ? 'text-yellow-400' :
            myStatus === 'ELIMINATED' ? 'text-red-400' :
            'text-green-400'
          }`}>
            {myStatus === 'WINNER' ? 'Winner' : myStatus === 'ELIMINATED' ? 'Eliminated' : 'Active'}
          </span>
        </div>
        <div className="min-h-[36px]">
          <span className="block text-gray-500">Payment</span>
          <span className={`font-medium ${
            paymentState === 'PAID' ? 'text-green-400' :
            paymentState === 'AWAITING_PAYMENT' ? 'text-yellow-400' :
            'text-gray-300'
          }`}>
            {paymentState === 'PAID' ? 'Paid' : paymentState === 'AWAITING_PAYMENT' ? 'Awaiting' : 'Not needed'}
          </span>
        </div>
        {comp.winnerUsername && (
          <div className="col-span-2">
            <span className="block text-gray-500">Winner</span>
            <span className="text-yellow-400 font-medium">🏆 {comp.winnerUsername}</span>
          </div>
        )}
      </div>

      <div className="min-h-[30px]">
        {comp.status === 'ACTIVE' && comp.participantCount > 0 && (
          <SurvivorBar active={effectiveActiveCount} total={comp.participantCount} />
        )}
      </div>

      <div className="mt-auto pt-3">
        <div className="btn-secondary w-full text-center text-sm py-2 group-hover:bg-surface-600">
          View Competition →
        </div>
      </div>
    </Link>
  );
}

function MyCompetitionRow({
  myComp,
  actionHint,
  expanded,
  onToggleExpand,
}: {
  myComp: MyCompetition;
  actionHint?: string | null;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const comp = myComp.competition;
  const isFinished = comp.status === 'COMPLETED';
  const isAwaitingPayment = myComp.paymentState === 'AWAITING_PAYMENT';
  const isDueSoon = (() => {
    if (myComp.myStatus !== 'ACTIVE' || comp.status !== 'UPCOMING') return false;
    const source = comp.firstGameweekDate ?? comp.startDate;
    if (!source) return false;
    const ms = parseDate(source).getTime() - Date.now();
    return ms > 0 && ms <= 24 * 60 * 60 * 1000;
  })();

  return (
    <div className="card px-3.5 py-3" style={competitionCardStyle(comp)}>
      <div className="flex items-center gap-3">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${isFinished ? 'bg-gray-500' : myComp.myStatus === 'ELIMINATED' ? 'bg-red-500' : myComp.myStatus === 'WINNER' ? 'bg-yellow-400' : 'bg-green-500'}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-[15px] font-semibold text-white">{comp.name}</p>
          {comp.clubName && <span className="hidden rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-gray-300 sm:inline-flex">{comp.clubName}</span>}
        </div>
        <p className="mt-1 text-xs text-gray-400">
          {isFinished ? 'Finished' : myComp.myStatus === 'ELIMINATED' ? 'Eliminated' : myComp.myStatus === 'WINNER' ? 'Winner' : 'Active'}
          {isAwaitingPayment ? ' · Awaiting payment' : ''}
          {isDueSoon ? ' · Pick due soon' : ''}
        </p>
        {actionHint && <p className="mt-1 text-xs font-medium text-amber-300">Action required: {actionHint}</p>}
      </div>
      <button type="button" onClick={onToggleExpand} className="shrink-0 rounded-md border border-white/10 px-2 py-1 text-xs text-gray-300 hover:bg-white/10">
        {expanded ? 'Less' : 'Details'}
      </button>
      <Link to={`/competitions/${comp.id}`} className="shrink-0 text-xs text-gray-300 underline-offset-2 hover:text-white hover:underline">Open</Link>
      </div>
      {expanded && (
        <div className="mt-2.5 grid grid-cols-2 gap-2.5 border-t border-white/10 pt-2.5 text-xs text-gray-300">
          <span>Players: {comp.participantCount}</span>
          <span>Status: {isFinished ? 'Finished' : myComp.myStatus}</span>
          <span>Payment: {myComp.paymentState}</span>
          <span>Entry: {comp.entryFee > 0 ? `€${comp.entryFee}` : 'Free'}</span>
        </div>
      )}
    </div>
  );
}

function PastCompetitionCard({ comp }: { comp: Competition }) {
  const clubSupport = comp.clubSecondaryColor ?? comp.clubPrimaryColor ?? null;
  return (
    <Link
      to={`/competitions/${comp.id}`}
      className="card flex flex-col p-3.5 sm:p-4.5 group transition-all hover:border-gray-600 block"
      style={competitionCardStyle(comp)}
    >
      <div className="mb-2.5"><span className="badge-gray">FINISHED</span></div>
      <h3 className="text-base sm:text-lg font-bold leading-snug line-clamp-2">{comp.name}</h3>
      <div className="mt-1 min-h-[18px] flex items-center gap-1.5">
        {comp.clubLogoUrl && <img src={comp.clubLogoUrl} alt="" className="h-5 w-5 rounded-md object-cover border border-white/15 shrink-0" />}
        {comp.clubName && (
          <span
            className="inline-flex max-w-full truncate badge-yellow badge-soft align-top"
            style={competitionAccentBadgeStyle(clubSupport)}
          >
            {comp.clubName}
          </span>
        )}
      </div>
      <div className="mt-1.5 min-h-[32px]">
        {comp.description ? (
          <p className="text-xs text-gray-400 line-clamp-2">{comp.description}</p>
        ) : (
          <span className="block text-transparent select-none text-xs">placeholder text</span>
        )}
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-gray-400">
        <div className="min-h-[36px]">
          <span className="block text-gray-500">Started</span>
          <span className="text-gray-200">
            {comp.firstGameweekDate
              ? format(parseDate(comp.firstGameweekDate), 'MMM d, yyyy')
              : comp.startDate
              ? format(parseDate(comp.startDate), 'MMM d, yyyy')
              : '—'}
          </span>
        </div>
        <div className="min-h-[36px]">
          <span className="block text-gray-500">Players</span>
          <span className="text-gray-200">{comp.participantCount}</span>
        </div>
        <div className="col-span-2">
          <span className="block text-gray-500">Winner</span>
          {comp.winnerUsername
            ? <span className="text-yellow-400 font-semibold">🏆 {comp.winnerUsername}</span>
            : <span className="text-gray-500 italic">No winner</span>
          }
        </div>
      </div>

      <div className="mt-auto pt-3">
        <div className="btn-secondary w-full text-center text-sm py-2 group-hover:bg-surface-600">View Results →</div>
      </div>
    </Link>
  );
}

/* ── ClubTypeahead ───────────────────────────────────────────────────────── */

function ClubTypeahead({ clubs, selected, onSelect }: { clubs: Club[]; selected: Club | null; onSelect: (club: Club | null) => void }) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const onSelectRef = useRef(onSelect);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  const safeClubs = Array.isArray(clubs) ? clubs : [];
  const filtered = safeClubs.filter((c) => c?.name != null && c.name.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (isOpen && listRef.current) {
      const el = listRef.current.children[highlightIndex] as HTMLElement;
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIndex, isOpen]);

  const handleSelect = useCallback((club: Club | null) => {
    onSelectRef.current(club);
    setQuery('');
    setIsOpen(false);
    inputRef.current?.blur();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) { setIsOpen(true); setHighlightIndex(0); e.preventDefault(); return; }
    if (!isOpen) return;
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setHighlightIndex((i) => Math.min(i + 1, filtered.length)); break;
      case 'ArrowUp':   e.preventDefault(); setHighlightIndex((i) => Math.max(i - 1, 0)); break;
      case 'Enter':     e.preventDefault(); highlightIndex === 0 ? handleSelect(null) : handleSelect(filtered[highlightIndex - 1]); break;
      case 'Escape':    setIsOpen(false); setQuery(''); break;
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={isOpen ? query : selected?.name ?? ''}
          onChange={(e) => { setQuery(e.target.value); setHighlightIndex(0); if (!isOpen) setIsOpen(true); }}
          onFocus={() => { setIsOpen(true); setQuery(''); setHighlightIndex(0); }}
          onKeyDown={handleKeyDown}
          placeholder="Filter by club…"
          className="input-field w-full pr-8 text-sm"
          role="combobox" aria-expanded={isOpen} aria-haspopup="listbox" aria-autocomplete="list" aria-label="Filter by club"
        />
        {selected && (
          <button onClick={(e) => { e.stopPropagation(); handleSelect(null); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-lg leading-none" aria-label="Clear club filter">
            ×
          </button>
        )}
      </div>
      {isOpen && (
        <ul ref={listRef} role="listbox"
          className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-lg border border-gray-600 bg-surface-700 shadow-xl">
          <li role="option" aria-selected={highlightIndex === 0}
            className={`px-4 py-2.5 text-sm cursor-pointer transition-colors ${highlightIndex === 0 ? 'bg-brand-600/30 text-white' : 'text-gray-300 hover:bg-surface-600'} ${!selected ? 'font-semibold' : ''}`}
            onMouseEnter={() => setHighlightIndex(0)} onClick={() => handleSelect(null)}>
            All Clubs
          </li>
          {filtered.length === 0
            ? <li className="px-4 py-3 text-sm text-gray-500 text-center">No clubs match "{query}"</li>
            : filtered.map((club, i) => (
              <li key={club.id} role="option" aria-selected={highlightIndex === i + 1}
                className={`px-4 py-2.5 text-sm cursor-pointer transition-colors ${highlightIndex === i + 1 ? 'bg-brand-600/30 text-white' : 'text-gray-300 hover:bg-surface-600'} ${selected?.id === club.id ? 'font-semibold' : ''}`}
                onMouseEnter={() => setHighlightIndex(i + 1)} onClick={() => handleSelect(club)}>
                {club.name}
                {club.description && <span className="ml-2 text-xs text-gray-500">{club.description}</span>}
              </li>
            ))
          }
        </ul>
      )}
    </div>
  );
}

/* ── Shared states ───────────────────────────────────────────────────────── */

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="card text-center py-16">
      <div className="text-4xl mb-3">⚠️</div>
      <p className="text-lg font-medium text-red-400">{message}</p>
    </div>
  );
}
