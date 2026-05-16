import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createPortal } from 'react-dom';
import { type CSSProperties, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import api from '../api';
import type { Competition, AuditLog, Participant, Club } from '../types';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import AddParticipantPanel from '../components/AddParticipantPanel';
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
  const [statusTone, setStatusTone] = useState<'ok' | 'info' | 'warn' | 'error'>('ok');
  const [statusMessage, setStatusMessage] = useState('All systems nominal');

  const tabs = [
    { key: 'competitions', label: 'Competitions' },
    { key: 'clubs', label: 'Clubs' },
    { key: 'users', label: 'Users' },
    { key: 'sync', label: 'Fixture Sync' },
    { key: 'simulate', label: 'Simulate Results' },
    { key: 'testdata', label: 'Test Data' },
    { key: 'audit', label: 'Audit Log' },
  ] as const;

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ tone: 'ok' | 'info' | 'warn' | 'error'; message: string }>).detail;
      if (!detail) return;
      setStatusTone(detail.tone);
      setStatusMessage(detail.message);
    };
    window.addEventListener('admin-status', handler);
    return () => window.removeEventListener('admin-status', handler);
  }, []);

  if (!isAdmin) {
    return (
      <div className="card py-16 text-center">
        <p className="text-red-400 text-lg font-medium">Access denied</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[1.85rem] border border-white/8 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.18),transparent_24rem),radial-gradient(circle_at_85%_16%,rgba(248,113,113,0.10),transparent_18rem),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(8,15,30,0.94))] px-5 py-5 shadow-[0_30px_75px_rgba(2,6,23,0.48)] sm:px-6 sm:py-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex rounded-full border border-brand-400/25 bg-brand-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-200">
              Control room
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">Admin Panel</h1>
            <p className="mt-2 text-sm leading-6 text-gray-300 sm:text-[15px]">
              Manage competitions, clubs, users, fixtures, simulations, and audit trails from one operational dashboard.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <AdminHeroStat label="Competitions" value="Live" accent="text-brand-200" />
            <AdminHeroStat label="Sync" value="Data" accent="text-cyan-200" />
            <AdminHeroStat label="Audit" value="Tracked" accent="text-yellow-200" />
          </div>
        </div>
      </section>

      <div className="rounded-2xl border border-white/8 bg-white/[0.035] px-4 py-3 text-xs text-gray-300">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex h-2 w-2 rounded-full ${
                statusTone === 'error'
                  ? 'bg-red-400'
                  : statusTone === 'warn'
                  ? 'bg-yellow-400'
                  : statusTone === 'info'
                  ? 'bg-brand-400'
                  : 'bg-green-400'
              }`}
            />
            <span className="font-semibold text-gray-200">Status</span>
            <span className="text-gray-400">{statusMessage}</span>
          </div>
          <span className="text-gray-500">Admin tooling is ready for operations.</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="sm:hidden">
        <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Admin section</label>
        <div className="mt-2">
          <AdminSelect
            value={tab}
            onChange={(next) => setTab(next as typeof tab)}
            options={tabs.map((t) => ({ value: t.key, label: t.label }))}
          />
        </div>
      </div>

      <div className="hidden sm:flex gap-2 overflow-x-auto rounded-2xl border border-white/8 bg-black/10 p-1.5">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-xl px-4 py-2.5 text-sm font-medium transition-all whitespace-nowrap ${
              tab === t.key
                ? 'bg-[linear-gradient(135deg,rgba(56,189,248,0.18),rgba(14,165,233,0.08))] text-white shadow-[0_12px_30px_rgba(14,165,233,0.12)]'
                : 'text-gray-400 hover:bg-white/[0.05] hover:text-white'
            }`}
          >
            {t.label}
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

function AdminHeroStat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/8 bg-white/[0.045] px-3 py-2 text-center backdrop-blur-sm">
      <div className={`text-base sm:text-lg font-black leading-tight ${accent}`}>{value}</div>
      <div className="mt-0.5 text-[8px] sm:text-[10px] font-semibold uppercase tracking-[0.06em] sm:tracking-[0.18em] text-gray-400 leading-tight break-words">
        <span className="sm:hidden">
          {label === 'Competitions' ? 'Comps' : label === 'Fixture Sync' ? 'Sync' : label}
        </span>
        <span className="hidden sm:inline">{label}</span>
      </div>
    </div>
  );
}

type AdminSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

function AdminSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  className,
  menuClassName,
}: {
  value: string;
  onChange: (nextValue: string) => void;
  options: AdminSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  menuClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});

  const selected = options.find((opt) => opt.value === value);
  const displayLabel = selected?.label ?? placeholder ?? 'Select';

  const updatePosition = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const top = rect.bottom + 8;
    const left = rect.left;
    setMenuStyle({
      position: 'fixed',
      top,
      left,
      width: rect.width,
      zIndex: 60,
    });
  }, []);

  useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleScroll = () => updatePosition();
    const handleResize = () => updatePosition();
    document.addEventListener('mousedown', handleClick);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [open, updatePosition]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
          if (event.key === 'Enter' || event.key === ' ') setOpen((prev) => !prev);
        }}
        className={`input-field flex items-center justify-between gap-2 text-left ${className ?? ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={value ? 'text-gray-100' : 'text-gray-500'}>{displayLabel}</span>
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08Z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            className={`max-h-64 overflow-auto rounded-xl border border-white/10 bg-surface-900/95 shadow-[0_20px_45px_rgba(2,6,23,0.45)] backdrop-blur ${menuClassName ?? ''}`}
            style={menuStyle}
          >
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={opt.value === value}
                disabled={opt.disabled}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  if (opt.disabled) return;
                  const scrollTop = window.scrollY;
                  onChange(opt.value);
                  setOpen(false);
                  requestAnimationFrame(() => {
                    window.scrollTo({ top: scrollTop, behavior: 'auto' });
                  });
                }}
                className={`w-full px-3 py-2 text-left text-sm transition ${
                  opt.value === value
                    ? 'bg-brand-600/20 text-white'
                    : 'text-gray-200 hover:bg-white/[0.06]'
                } ${opt.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {opt.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}

// ── Competitions Tab ────────────────────────────────────────────────

function CompetitionsTab() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingComp, setEditingComp] = useState<Competition | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [entryFee, setEntryFee] = useState('0');
  const [maxEntriesPerUser, setMaxEntriesPerUser] = useState('1');
  const [prizePool, setPrizePool] = useState('');
  const [missedPickMode, setMissedPickMode] = useState('ELIMINATE');
  const [postponedConsumesTeam, setPostponedConsumesTeam] = useState(true);
  const [lifelineEnabled, setLifelineEnabled] = useState(false);
  const [passFeeToParticipant, setPassFeeToParticipant] = useState(false);
  const [paymentMode, setPaymentMode] = useState<'FREE' | 'MANUAL' | 'STRIPE'>('FREE');
  const [manualPaymentPolicy, setManualPaymentPolicy] = useState<'STRICT' | 'LENIENT'>('STRICT');
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>('PRIVATE');
  const [startDate, setStartDate] = useState('');
  const [clubId, setClubId] = useState<string>('');
  const [status, setStatus] = useState<'UPCOMING' | 'ACTIVE' | 'COMPLETED'>('UPCOMING');
  const [bulkPrefix, setBulkPrefix] = useState('Load Test');
  const [bulkCount, setBulkCount] = useState(100);
  const [bulkStartDate, setBulkStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [bulkClubId, setBulkClubId] = useState<string>('');
  const [bulkDeletePrefix, setBulkDeletePrefix] = useState('Load Test');
  const [bulkDeleteUpcomingOnly, setBulkDeleteUpcomingOnly] = useState(true);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);

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

  const resetForm = () => {
    setEditingComp(null);
    setShowForm(false);
    setName('');
    setDescription('');
    setEntryFee('0');
    setMaxEntriesPerUser('1');
    setPrizePool('');
    setMissedPickMode('ELIMINATE');
    setPostponedConsumesTeam(true);
    setLifelineEnabled(false);
    setPassFeeToParticipant(false);
    setPaymentMode('FREE');
    setManualPaymentPolicy('STRICT');
    setVisibility('PRIVATE');
    setStartDate('');
    setClubId('');
    setStatus('UPCOMING');
  };

  const populateForm = (competition: Competition) => {
    setEditingComp(competition);
    setShowForm(true);
    setName(competition.name);
    setDescription(competition.description ?? '');
    setEntryFee(String(competition.entryFee ?? 0));
    setMaxEntriesPerUser(String(competition.maxEntriesPerUser ?? 1));
    setPrizePool(competition.prizePool != null ? String(competition.prizePool) : '');
    setMissedPickMode(competition.missedPickMode);
    setPostponedConsumesTeam(competition.postponedConsumesTeam);
    setLifelineEnabled(Boolean(competition.lifelineEnabled));
    setPassFeeToParticipant(Boolean(competition.passFeeToParticipant));
    setPaymentMode((competition.paymentMode ?? 'FREE') as 'FREE' | 'MANUAL' | 'STRIPE');
    setManualPaymentPolicy((competition.manualPaymentPolicy ?? 'STRICT') as 'STRICT' | 'LENIENT');
    setVisibility((competition.visibility ?? 'PRIVATE') as 'PUBLIC' | 'PRIVATE');
    setStartDate(competition.startDate);
    setClubId(competition.clubId != null ? String(competition.clubId) : 'none');
    setStatus((competition.status ?? 'UPCOMING') as 'UPCOMING' | 'ACTIVE' | 'COMPLETED');
  };

  const competitionPayload = {
    name,
    description,
    entryFee: parseFloat(entryFee) || 0,
    maxEntriesPerUser: Math.max(1, parseInt(maxEntriesPerUser, 10) || 1),
    prizePool: prizePool ? parseFloat(prizePool) : null,
    missedPickMode,
    postponedConsumesTeam,
    lifelineEnabled,
    passFeeToParticipant,
    paymentMode,
    manualPaymentPolicy,
    visibility,
    startDate,
    status,
    clubId: clubId === '' ? null : clubId === 'none' ? 0 : Number(clubId),
  };

  const createMutation = useMutation({
    mutationFn: () =>
      api.post('/admin/competitions', {
        name,
        description: description || null,
        entryFee: parseFloat(entryFee) || 0,
        maxEntriesPerUser: Math.max(1, parseInt(maxEntriesPerUser, 10) || 1),
        prizePool: prizePool ? parseFloat(prizePool) : null,
        missedPickMode,
        postponedConsumesTeam,
        lifelineEnabled,
        passFeeToParticipant,
        paymentMode,
        manualPaymentPolicy,
        visibility,
        startDate,
        clubId: clubId ? Number(clubId) : null,
      }),
    onSuccess: (response) => {
      const created = response.data as Competition;
      toast.success(created.joinCode
        ? `Competition created! Join code: ${created.joinCode}`
        : created.visibility === 'PUBLIC'
          ? 'Competition created! Public competitions do not use a join code.'
          : 'Competition created!');
      queryClient.setQueryData<Competition[]>(['admin', 'competitions'], (old) =>
        old ? [response.data, ...old] : [response.data]
      );
      queryClient.invalidateQueries({ queryKey: ['admin', 'competitions'] });
      queryClient.invalidateQueries({ queryKey: ['competitions'] });
      resetForm();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to create');
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editingComp) throw new Error('No competition selected for edit');
      return api.put(`/admin/competitions/${editingComp.id}`, competitionPayload);
    },
    onSuccess: (response) => {
      const updated = response.data as Competition;
      toast.success(`"${updated.name}" updated`);
      queryClient.setQueryData<Competition[]>(['admin', 'competitions'], (old) =>
        old ? old.map((competition) => competition.id === updated.id ? updated : competition) : [updated]
      );
      queryClient.invalidateQueries({ queryKey: ['admin', 'competitions'] });
      queryClient.invalidateQueries({ queryKey: ['competitions'] });
      resetForm();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to update competition');
    },
  });

  const bulkCreateMutation = useMutation({
    mutationFn: async () => {
      return api.post('/admin/competitions/bulk-create', {
        prefix: (bulkPrefix || 'Load Test').trim(),
        count: Math.max(1, Math.min(500, bulkCount)),
        startDate: bulkStartDate,
        clubId: bulkClubId ? Number(bulkClubId) : null,
      }, {
        timeout: 120_000,
      }).then((r) => r.data as { requested: number; created: number; failed: number; errors?: string[] });
    },
    onSuccess: (result) => {
      const failedMessage = result.failed > 0 ? ` (${result.failed} failed)` : '';
      toast.success(`Created ${result.created}/${result.requested} competitions${failedMessage}`);
      if (result.failed > 0 && result.errors?.length) {
        toast.error(`Bulk create had failures. First: ${result.errors[0]}`);
      }
      queryClient.invalidateQueries({ queryKey: ['admin', 'competitions'] });
      queryClient.invalidateQueries({ queryKey: ['competitions'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Bulk create failed');
    },
  });

  const bulkDeleteCandidates = (competitions ?? []).filter((c) => {
    const matchesPrefix = c.name.toLowerCase().startsWith((bulkDeletePrefix || '').trim().toLowerCase());
    if (!matchesPrefix) return false;
    if (bulkDeleteUpcomingOnly) return c.status === 'UPCOMING';
    return true;
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async () => {
      return api.delete('/admin/competitions/bulk-delete', {
        timeout: 120_000,
        data: {
          prefix: (bulkDeletePrefix || '').trim(),
          upcomingOnly: bulkDeleteUpcomingOnly,
        },
      }).then((r) => r.data as { matched: number; deleted: number; failed: number; errors?: string[] });
    },
    onSuccess: (result) => {
      if (result.failed === 0) {
        toast.success(`Deleted ${result.deleted}/${result.matched} competitions`);
      } else if (result.deleted > 0) {
        const firstError = result.errors?.[0] ? ` First error: ${result.errors[0]}` : '';
        toast(`Deleted ${result.deleted}/${result.matched} competitions. ${result.failed} failed.${firstError}`, {
          icon: '⚠️',
          duration: 6000,
        });
      } else {
        const firstError = result.errors?.[0] ? ` First error: ${result.errors[0]}` : '';
        toast.error(`Bulk delete failed for ${result.matched} competitions.${firstError}`);
      }
      queryClient.invalidateQueries({ queryKey: ['admin', 'competitions'] });
      queryClient.invalidateQueries({ queryKey: ['competitions'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Bulk delete failed');
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Manage Competitions</h2>
          <p className="mt-1 text-sm text-gray-400">Create new pools, inspect invite settings, and manage the full competition roster.</p>
        </div>
        <button
          onClick={() => {
            if (showForm && !editingComp) {
              resetForm();
              return;
            }
            if (editingComp) {
              resetForm();
              return;
            }
            setShowForm(true);
          }}
          className="btn-primary"
        >
          {editingComp ? 'Cancel Edit' : showForm ? 'Cancel' : '+ New Competition'}
        </button>
      </div>

      <div className="card space-y-4">
        <div>
          <h3 className="text-base font-semibold text-white">Bulk Create Competitions</h3>
          <p className="mt-1 text-sm text-gray-400">Generate hundreds of upcoming competitions for load and layout testing.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-300">Name Prefix</label>
            <input
              value={bulkPrefix}
              onChange={(e) => setBulkPrefix(e.target.value)}
              className="input-field"
              placeholder="Load Test"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-300">Count</label>
            <input
              type="number"
              min={1}
              max={500}
              value={bulkCount}
              onChange={(e) => setBulkCount(Number(e.target.value) || 1)}
              className="input-field"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-300">Start Date</label>
            <input
              type="date"
              value={bulkStartDate}
              min={new Date().toISOString().split('T')[0]}
              onChange={(e) => setBulkStartDate(e.target.value)}
              className="input-field [color-scheme:dark]"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-300">Club (optional)</label>
            <AdminSelect
              value={bulkClubId}
              onChange={(next) => setBulkClubId(next)}
              options={[
                { value: '', label: 'No Club' },
                ...(clubs ?? []).map((club) => ({ value: String(club.id), label: club.name })),
              ]}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {[100, 250, 500].map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setBulkCount(preset)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                bulkCount === preset ? 'bg-brand-600 text-white' : 'bg-surface-700 text-gray-300 hover:bg-surface-600'
              }`}
            >
              {preset}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-gray-500">Creates competitions named like "{(bulkPrefix || 'Load Test').trim()} 001, 002, …"</p>
          <button
            type="button"
            onClick={() => bulkCreateMutation.mutate()}
            disabled={bulkCreateMutation.isPending || bulkCount < 1}
            className="btn-primary w-full sm:w-auto disabled:opacity-60"
          >
            {bulkCreateMutation.isPending ? 'Creating…' : `Create ${Math.max(1, Math.min(500, bulkCount))} Competitions`}
          </button>
        </div>
      </div>

      <div className="card space-y-4 border-red-500/30">
        <div>
          <h3 className="text-base font-semibold text-white">Bulk Delete Competitions</h3>
          <p className="mt-1 text-sm text-gray-400">Delete competitions by name prefix (useful for cleaning up load-test data).</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-300">Name Prefix</label>
            <input
              value={bulkDeletePrefix}
              onChange={(e) => setBulkDeletePrefix(e.target.value)}
              className="input-field"
              placeholder="Load Test"
            />
          </div>
          <label className="flex items-center gap-3 self-end pb-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={bulkDeleteUpcomingOnly}
              onChange={(e) => setBulkDeleteUpcomingOnly(e.target.checked)}
              className="h-4 w-4 rounded border-gray-600 bg-surface-700 text-brand-500"
            />
            Upcoming only
          </label>
        </div>
        <div className="rounded-lg border border-red-500/20 bg-red-500/8 px-3 py-2 text-sm text-red-200">
          {bulkDeleteCandidates.length} competition{bulkDeleteCandidates.length === 1 ? '' : 's'} match this delete rule.
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-gray-500">This permanently deletes matching competitions and related data.</p>
          <button
            type="button"
            onClick={() => {
              if (!bulkDeleteCandidates.length) return;
              setBulkDeleteConfirmOpen(true);
            }}
            disabled={bulkDeleteMutation.isPending || bulkDeleteCandidates.length === 0}
            className="w-full rounded-lg border border-red-500/40 bg-red-600/20 px-4 py-2.5 text-sm font-semibold text-red-100 transition hover:bg-red-600/30 disabled:opacity-50 sm:w-auto"
          >
            {bulkDeleteMutation.isPending ? 'Deleting…' : `Delete ${bulkDeleteCandidates.length} Competitions`}
          </button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={bulkDeleteConfirmOpen}
        onClose={() => setBulkDeleteConfirmOpen(false)}
        onConfirm={() => bulkDeleteMutation.mutate()}
        title={`Delete ${bulkDeleteCandidates.length} competitions?`}
        message={`This will permanently delete all competitions matching "${bulkDeletePrefix}"${bulkDeleteUpcomingOnly ? ' (upcoming only)' : ''}.`}
        items={[
          'This action cannot be undone',
          'All related participant and pick data will be removed',
        ]}
        confirmText="Yes, Delete All"
        variant="danger"
        isPending={bulkDeleteMutation.isPending}
      />

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/70 px-4 py-10 sm:py-12">
          <div className="w-full max-w-4xl rounded-2xl border border-white/10 bg-surface-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <h2 className="font-semibold text-gray-200">{editingComp ? `Edit ${editingComp.name}` : 'New Competition'}</h2>
                <p className="text-xs text-gray-500">
                  {editingComp ? 'Update competition settings, fees, timing, and visibility.' : 'Set up a new competition and its entry settings.'}
                </p>
              </div>
              <button
                type="button"
                onClick={resetForm}
                className="rounded-md border border-white/10 px-3 py-1.5 text-xs font-medium text-gray-300 transition hover:bg-white/10"
              >
                Close
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (editingComp) {
                  updateMutation.mutate();
                  return;
                }
                createMutation.mutate();
              }}
              className="space-y-4 p-5"
            >
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white">{editingComp ? `Edit ${editingComp.name}` : 'New Competition'}</h3>
              <p className="text-sm text-gray-400">
                {editingComp ? 'Update competition settings, fees, timing, and visibility.' : 'Set up a new competition and its entry settings.'}
              </p>
            </div>
            {editingComp && (
              <span className="badge-blue self-start sm:self-auto">Editing</span>
            )}
          </div>
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
                  min={editingComp ? undefined : new Date().toISOString().split('T')[0]}
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
            <div className="sm:col-span-2">
              <label className="mb-2 block text-sm font-medium text-gray-300">Visibility</label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { value: 'PRIVATE', label: 'Private', icon: '🔐', desc: 'Hidden from browse. Join by code or invite link.' },
                  { value: 'PUBLIC', label: 'Public', icon: '🌍', desc: 'Visible in the main competitions list.' },
                ] as const).map(opt => (
                  <button key={opt.value} type="button"
                    onClick={() => setVisibility(opt.value)}
                    className={`flex items-center gap-3 rounded-lg border p-3 text-left text-xs transition-colors ${
                      visibility === opt.value
                        ? 'border-brand-500 bg-brand-600/20 text-white'
                        : 'border-gray-600 bg-surface-700 text-gray-400 hover:border-gray-500'
                    }`}>
                    <span className="text-xl">{opt.icon}</span>
                    <span>
                      <span className="block font-semibold">{opt.label}</span>
                      <span className="block leading-tight">{opt.desc}</span>
                    </span>
                  </button>
                ))}
              </div>
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
                <div className="mt-2 space-y-2">
                  <p className="text-xs text-yellow-400/80">
                    💡 Players register themselves then pay you directly. Confirm their payment in the Participants panel.
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
              <AdminSelect
                value={missedPickMode}
                onChange={(next) => setMissedPickMode(next)}
                options={[
                  { value: 'ELIMINATE', label: 'Eliminate' },
                  { value: 'AUTO_ASSIGN', label: 'Auto-Assign' },
                ]}
              />
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
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">Club (optional)</label>
              <AdminSelect
                value={clubId}
                onChange={(next) => setClubId(next)}
                options={[
                  { value: editingComp ? 'none' : '', label: 'No Club' },
                  ...(clubs ?? []).map((club) => ({ value: String(club.id), label: club.name })),
                ]}
              />
            </div>
            {editingComp && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">Status</label>
                <AdminSelect
                  value={status}
                  onChange={(next) => setStatus(next as 'UPCOMING' | 'ACTIVE' | 'COMPLETED')}
                  options={[
                    { value: 'UPCOMING', label: 'Upcoming' },
                    { value: 'ACTIVE', label: 'Active' },
                    { value: 'COMPLETED', label: 'Completed' },
                  ]}
                />
              </div>
            )}
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
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
            <button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
              className="btn-primary"
            >
              {editingComp
                ? (updateMutation.isPending ? 'Saving…' : 'Save Changes')
                : (createMutation.isPending ? 'Creating…' : 'Create Competition')}
            </button>
            <button type="button" onClick={resetForm} className="btn-secondary">
              Cancel
            </button>
          </div>
            </form>
          </div>
        </div>
      )}

      {competitions && competitions.length > 0 && (
        <div className="card overflow-hidden">
          {/* Mobile: table-safe card rows */}
          <div className="md:hidden overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                {competitions.map((c) => (
                  <CompetitionRow key={c.id} comp={c} onEdit={populateForm} />
                ))}
              </tbody>
            </table>
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
                  <CompetitionRow key={c.id} comp={c} onEdit={populateForm} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function CompetitionRow({ comp, onEdit }: { comp: Competition; onEdit: (competition: Competition) => void }) {
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
      {/* ── Mobile card row (hidden on md+) ── */}
      <tr className="md:hidden border-b border-gray-700/50">
        <td colSpan={6} className="p-4">
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-white truncate">{comp.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{comp.startDate}</p>
                {comp.visibility === 'PRIVATE' && comp.joinCode && (
                  <p className="mt-1 inline-flex items-center gap-1 rounded-md border border-brand-500/30 bg-brand-500/10 px-2 py-0.5 font-mono text-[11px] tracking-[0.12em] text-brand-200">
                    {comp.joinCode}
                  </p>
                )}
              </div>
              <span className={statusBadge}>{comp.status}</span>
            </div>
            <div className="flex gap-4 text-xs text-gray-400">
              <span>👥 {comp.participantCount} players</span>
              <span>⚙️ {comp.missedPickMode}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => onEdit(comp)}
                className="text-xs px-3 py-1.5 rounded bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-300 transition">
                Edit
              </button>
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
          </div>
        </td>
      </tr>
      {showParticipants && (
        <tr className="md:hidden border-b border-gray-700/50">
          <td colSpan={6} className="p-0">
            <ParticipantsPanel competitionId={comp.id} competitionName={comp.name} />
          </td>
        </tr>
      )}

      {/* ── Desktop table row (hidden below md) ── */}
      <tr className="hidden md:table-row border-b border-gray-700/50">
        <td className="py-3 px-4 font-medium">
          <div className="min-w-0">
            <div className="truncate">{comp.name}</div>
            {comp.visibility === 'PRIVATE' && comp.joinCode && (
              <div className="mt-1 inline-flex items-center gap-1 rounded-md border border-brand-500/30 bg-brand-500/10 px-2 py-0.5 font-mono text-[11px] tracking-[0.12em] text-brand-200">
                {comp.joinCode}
              </div>
            )}
          </div>
        </td>
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
          <button onClick={() => onEdit(comp)}
            className="text-sm px-3 py-1 rounded bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-300 transition">
            Edit
          </button>
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
    mutationFn: (participantId: number) => api.delete(`/admin/competitions/${competitionId}/participants/${participantId}`),
    onSuccess: () => {
      toast.success('Participant removed');
      queryClient.invalidateQueries({ queryKey: ['admin', 'participants', competitionId] });
      queryClient.invalidateQueries({ queryKey: ['competitions'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Remove failed'),
  });

  const declareWinnerMutation = useMutation({
    mutationFn: (participantId: number) => api.post(`/admin/competitions/${competitionId}/declare-winner/${participantId}`, {}),
    onSuccess: (_, participantId) => {
      const winner = participants?.find(p => p.id === participantId);
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
  const entryCountByUserId = new Map<number, number>();
  participants.forEach((participant) => {
    entryCountByUserId.set(participant.userId, (entryCountByUserId.get(participant.userId) ?? 0) + 1);
  });
  const participantLabel = (p: Participant) =>
    (entryCountByUserId.get(p.userId) ?? 0) > 1
      ? `${p.username} • Entry #${p.entryNumber ?? 1}`
      : p.username;

  // Filter + search (plain JS, no hooks after early returns)
  let filtered = participants;
  if (statusFilter !== 'ALL') {
    filtered = filtered.filter(p => p.status === statusFilter);
  }
  if (search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter(p => participantLabel(p).toLowerCase().includes(q));
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
              <div
                key={p.id}
                className={`px-4 py-3 text-sm border-l-2 ${
                  p.status === 'ACTIVE'
                    ? 'border-green-400/80 bg-green-400/15'
                    : p.status === 'ELIMINATED'
                    ? 'border-red-400/80 bg-red-400/15'
                    : 'border-yellow-300/80 bg-yellow-300/15'
                }`}
              >
                <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-[1fr_auto] items-center gap-[2px] pr-2">
                    <div className="min-w-0">
                      <span className="font-medium text-gray-200 truncate block">{participantLabel(p)}</span>
                    </div>
                    <div className="flex flex-nowrap items-center gap-1 justify-self-end">
                      {p.status === 'ACTIVE' && counts.ACTIVE > 1 && (
                        <button
                          onClick={() => setWinnerDialogUser(p)}
                          disabled={declareWinnerMutation.isPending}
                          className="text-[10px] px-1.5 py-1 rounded bg-yellow-600/20 hover:bg-yellow-600/40 text-yellow-300 transition"
                          title="Declare as winner and end competition"
                          aria-label="Declare winner"
                        >
                          <span className="sm:hidden">🏆</span>
                          <span className="hidden sm:inline">🏆 Winner</span>
                        </button>
                      )}
                      <button
                        onClick={() => setRemoveDialogUser(p)}
                        disabled={removeMutation.isPending}
                        className="text-[10px] px-1 py-[3px] rounded bg-red-600/20 hover:bg-red-600/40 text-red-300 transition"
                        aria-label="Remove participant"
                      >
                        <span className="sm:hidden">🗑️</span>
                        <span className="hidden sm:inline">Remove</span>
                      </button>
                    </div>
                  </div>
                  <div className="hidden sm:flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                    <span>Joined {parseDate(p.joinedAt).toLocaleDateString()}</span>
                    {p.eliminatedWeek && (
                      <span className="text-xs text-gray-500">GW{p.eliminatedWeek}</span>
                    )}
                    {p.status === 'ACTIVE' && counts.ACTIVE > 1 && (
                      <span className="text-yellow-500/80">Eligible to be declared winner</span>
                    )}
                  </div>
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
        isOpen={winnerDialogUser !== null}
        onClose={() => setWinnerDialogUser(null)}
        onConfirm={() => winnerDialogUser && declareWinnerMutation.mutate(winnerDialogUser.id)}
        icon="🏆"
        variant="warning"
        title={`Declare ${winnerDialogUser ? participantLabel(winnerDialogUser) : 'participant'} as Winner?`}
        message={`This will end "${competitionName}" and crown this participant as the champion.`}
        items={[
          `${winnerDialogUser ? participantLabel(winnerDialogUser) : 'This participant'} will be marked as WINNER`,
          'All other active participants will be eliminated',
          'The competition will be marked as COMPLETED',
        ]}
        confirmText="Yes, Declare Winner"
      />

      {/* Remove Participant Dialog */}
      <ConfirmDialog
        isOpen={removeDialogUser !== null}
        onClose={() => setRemoveDialogUser(null)}
        onConfirm={() => removeDialogUser && removeMutation.mutate(removeDialogUser.id)}
        variant="danger"
        title={`Remove ${removeDialogUser ? participantLabel(removeDialogUser) : 'participant'}?`}
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
      <SectionIntro
        eyebrow="Club network"
        title="Manage Clubs"
        description="Create clubs, assign club admins, and keep the ownership structure tidy before competitions go live."
      />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
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
              <AdminSelect
                value={clubAdminUserId}
                onChange={(next) => setClubAdminUserId(next)}
                options={[
                  { value: '', label: 'No admin yet (assign later)' },
                  ...eligibleUsers.map((u) => ({
                    value: String(u.id),
                    label: `${u.username} (${u.email})${u.role === 'CLUB_ADMIN' ? ' — already a Club Admin' : ''}`,
                  })),
                ]}
              />
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
          <AdminSelect
            value={assignUserId}
            onChange={(next) => setAssignUserId(next)}
            options={[
              { value: '', label: 'Select a user…' },
              ...eligibleUsers.map((u) => ({
                value: String(u.id),
                label: `${u.username} (${u.email})${u.role === 'CLUB_ADMIN' ? ' — Club Admin' : ''}`,
              })),
            ]}
            className="h-10"
          />
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
              <AdminSelect
                value={String(pageSize)}
                onChange={(next) => { setPageSize(Number(next)); setCurrentPage(1); }}
                options={[5, 10, 20, 50].map((n) => ({ value: String(n), label: String(n) }))}
                className="h-9 w-24 text-xs"
              />
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
      <SectionIntro
        eyebrow="Access control"
        title="Manage Users"
        description="Create accounts, adjust roles, and suspend or remove users from the platform safely."
      />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
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
              <AdminSelect
                value={role}
                onChange={(next) => setRole(next as 'USER' | 'CLUB_ADMIN' | 'ADMIN')}
                options={[
                  { value: 'USER', label: 'User' },
                  { value: 'CLUB_ADMIN', label: 'Club Admin' },
                  { value: 'ADMIN', label: 'Admin' },
                ]}
              />
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
              <AdminSelect
                value={String(pageSize)}
                onChange={(next) => { setPageSize(Number(next)); setCurrentPage(1); }}
                options={[10, 20, 50, 100].map((n) => ({ value: String(n), label: String(n) }))}
                className="h-9 w-24 text-xs"
              />
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
                  <AdminSelect
                    value={u.role}
                    onChange={(next) => changeRoleMutation.mutate({ userId: u.id, newRole: next })}
                    options={[
                      { value: 'USER', label: 'USER' },
                      { value: 'CLUB_ADMIN', label: 'CLUB_ADMIN' },
                      { value: 'ADMIN', label: 'ADMIN' },
                    ]}
                    className="h-9 w-32 text-xs"
                  />
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
                      <AdminSelect
                        value={u.role}
                        onChange={(next) => changeRoleMutation.mutate({ userId: u.id, newRole: next })}
                        options={[
                          { value: 'USER', label: 'USER' },
                          { value: 'CLUB_ADMIN', label: 'CLUB_ADMIN' },
                          { value: 'ADMIN', label: 'ADMIN' },
                        ]}
                        className="h-9 w-32 text-xs"
                      />
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
    onMutate: () => {
      window.dispatchEvent(new CustomEvent('admin-status', {
        detail: { tone: 'info', message: 'Triggering fixture sync...' },
      }));
    },
    onSuccess: () => {
      toast.success('Sync triggered successfully!');
      window.dispatchEvent(new CustomEvent('admin-status', {
        detail: { tone: 'ok', message: 'Fixture sync triggered' },
      }));
    },
    onError: () => {
      toast.error('Sync failed');
      window.dispatchEvent(new CustomEvent('admin-status', {
        detail: { tone: 'error', message: 'Fixture sync failed' },
      }));
    },
  });

  return (
    <div className="space-y-6">
      <SectionIntro
        eyebrow="Operations"
        title="Fixture Sync"
        description="Trigger a manual provider sync when you need fresh teams, fixtures, or result updates immediately."
      />
      <div className="card space-y-4">
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
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');

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
    onMutate: () => {
      window.dispatchEvent(new CustomEvent('admin-status', {
        detail: { tone: 'info', message: 'Processing gameweek simulation...' },
      }));
    },
    onSuccess: (response) => {
      const data = response.data;
      if (data.newStatus === 'PROCESSING') {
        // Async processing started — poll until done
        toast.success('Processing started…', { duration: 3000 });
        const poll = setInterval(async () => {
          try {
            const gws = await api.get(`/admin/competitions/${selectedCompId}/gameweeks`);
            const gw = gws.data?.find((g: any) => g.id === Number(selectedGwId));
            if (gw && gw.status !== 'LOCKED' && gw.status !== 'IN_PROGRESS') {
              clearInterval(poll);
              toast.success(`Gameweek ${data.gameweekId} processing complete! Status: ${gw.status}` +
                (gw.activeParticipants !== undefined ? ` — ${gw.activeParticipants} active remaining.` : ''), { duration: 5000 });
              window.dispatchEvent(new CustomEvent('admin-status', {
                detail: { tone: 'ok', message: 'Processing complete' },
              }));
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
        window.dispatchEvent(new CustomEvent('admin-status', {
          detail: { tone: 'ok', message: 'Processing complete' },
        }));
        queryClient.invalidateQueries({ queryKey: ['admin', 'gameweeks', selectedCompId] });
        queryClient.invalidateQueries({ queryKey: ['admin', 'participants'] });
        queryClient.invalidateQueries({ queryKey: ['admin', 'competitions'] });
        queryClient.invalidateQueries({ queryKey: ['competitions'] });
        setFixtureResults({});
      }
    },
    onError: (err: any) => {
      window.dispatchEvent(new CustomEvent('admin-status', {
        detail: { tone: 'error', message: 'Simulation failed' },
      }));
      toast.error(err.response?.data?.message || 'Simulation failed');
    },
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
    onMutate: () => {
      window.dispatchEvent(new CustomEvent('admin-status', {
        detail: { tone: 'info', message: 'Processing gameweek simulation...' },
      }));
    },
    onSuccess: (response) => {
      const data = response.data;
      // The backend processes results asynchronously — poll until the gameweek status changes
      toast.success('Processing started…', { duration: 3000 });
      const poll = setInterval(async () => {
        try {
          const gws = await api.get(`/admin/competitions/${selectedCompId}/gameweeks`);
          const gw = gws.data?.find((g: any) => g.id === Number(selectedGwId));
          if (gw && gw.status !== 'LOCKED' && gw.status !== 'IN_PROGRESS') {
            clearInterval(poll);
            toast.success(`GW${data.gameweekId} processing complete! Status: ${gw.status}` +
              (gw.activeParticipants !== undefined ? ` — ${gw.activeParticipants} active remaining.` : ''), { duration: 5000 });
            window.dispatchEvent(new CustomEvent('admin-status', {
              detail: { tone: 'ok', message: 'Processing complete' },
            }));
            queryClient.invalidateQueries({ queryKey: ['admin', 'gameweeks', selectedCompId] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'participants'] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'competitions'] });
            queryClient.invalidateQueries({ queryKey: ['competitions'] });
            setFixtureResults({});
          }
        } catch { clearInterval(poll); }
      }, 2000);
      setTimeout(() => clearInterval(poll), 120_000);
    },
    onError: (err: any) => {
      window.dispatchEvent(new CustomEvent('admin-status', {
        detail: { tone: 'error', message: 'Simulation failed' },
      }));
      toast.error(err.response?.data?.message || 'Bulk simulation failed');
    },
  });

  return (
    <div className="space-y-6">
      <SectionIntro
        eyebrow="Scenario testing"
        title="Simulate Gameweek Results"
        description="Stress-test eliminations, byes, and downstream status changes before real match results arrive."
      />

      <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-gray-300">
        <span className="font-semibold text-gray-200">Density</span>
        <div className="inline-flex rounded-lg border border-white/10 bg-white/[0.02] p-1">
          {(['comfortable', 'compact'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setDensity(mode)}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                density === mode ? 'bg-brand-600/30 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {mode === 'comfortable' ? 'Comfortable' : 'Compact'}
            </button>
          ))}
        </div>
      </div>

      {/* Step 1: Select Competition */}
      <div className="card space-y-4">
        <h3 className="font-semibold text-gray-200">1. Select Competition</h3>
        <AdminSelect
          value={selectedCompId}
          onChange={(next) => {
            setSelectedCompId(next);
            setSelectedGwId('');
            setFixtureResults({});
          }}
          options={[
            { value: '', label: 'Choose a competition…' },
            ...(competitions ?? []).map((c) => ({
              value: String(c.id),
              label: `${c.name} (${c.status}) — ${c.participantCount} participants`,
            })),
          ]}
        />
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
            <AdminSelect
              value={selectedGwId}
              onChange={(next) => {
                setSelectedGwId(next);
                setFixtureResults({});
              }}
              options={[
                { value: '', label: 'Choose a gameweek…' },
                ...gameweeks.map((gw) => ({
                  value: String(gw.id),
                  label: `GW${gw.weekNumber} — ${gw.status} — ${gw.fixtures.length} fixtures — Locks: ${parseDate(gw.lockAt).toLocaleString()}`,
                })),
              ]}
            />
          )}
        </div>
      )}

      {/* Step 3: Set Fixture Results */}
      {selectedGameweek && (
        <div className="card space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="font-semibold text-gray-200">
              3. Set Fixture Results for GW{selectedGameweek.weekNumber}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleRandomiseAll}
                className="btn-secondary w-full sm:w-auto text-xs"
                title="Randomly generate results for all fixtures"
              >
                🎲 Randomise All
              </button>
              <button
                onClick={() => bulkMutation.mutate()}
                disabled={bulkMutation.isPending || !selectedGwId}
                className="btn-primary w-full sm:w-auto text-xs disabled:opacity-40"
                title="Randomise all fixtures and immediately process results"
              >
                {bulkMutation.isPending ? '⏳ Processing…' : '⚡ Randomise & Process All'}
              </button>
              <button
                onClick={handleClearAll}
                className="text-xs px-3 py-1.5 rounded border border-white/10 text-gray-300 hover:bg-white/[0.04] transition w-full sm:w-auto"
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
            <div className={density === 'compact' ? 'space-y-2' : 'space-y-3'}>
              {selectedGameweek.fixtures.map((fixture) => {
                const result = fixtureResults[fixture.id] || { status: '', scoreHome: '', scoreAway: '' };
                const hasResult = !!result.status;
                return (
                  <div key={fixture.id} className={`rounded-lg transition-colors ${
                    hasResult ? 'bg-brand-600/10 border border-brand-600/30' : 'bg-surface-700/50'
                  } ${density === 'compact' ? 'p-3 space-y-2' : 'p-4 space-y-3'}`}>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
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
                      <span className="text-xs text-gray-500 sm:text-right">
                        {parseDate(fixture.kickoffAt).toLocaleString(undefined, {
                          day: '2-digit', month: '2-digit', year: 'numeric',
                          hour: '2-digit', minute: '2-digit', hour12: false
                        })}
                      </span>
                    </div>

                    {/* Quick Actions */}
                    <div className={`flex flex-wrap gap-2 ${density === 'compact' ? 'text-[11px]' : 'text-xs'}`}>
                      <button
                        onClick={() => handleQuickWin(fixture, 'home')}
                        className="text-xs px-2.5 py-1 rounded bg-green-600/20 hover:bg-green-600/40 text-green-400 transition w-full sm:w-auto"
                      >
                        {fixture.homeTeamShortName} Win
                      </button>
                      <button
                        onClick={() => handleQuickDraw(fixture)}
                        className="text-xs px-2.5 py-1 rounded bg-gray-600/20 hover:bg-gray-600/40 text-gray-400 transition w-full sm:w-auto"
                      >
                        Draw
                      </button>
                      <button
                        onClick={() => handleQuickWin(fixture, 'away')}
                        className="text-xs px-2.5 py-1 rounded bg-green-600/20 hover:bg-green-600/40 text-green-400 transition w-full sm:w-auto"
                      >
                        {fixture.awayTeamShortName} Win
                      </button>
                      <button
                        onClick={() => handlePostpone(fixture)}
                        className="text-xs px-2.5 py-1 rounded bg-orange-600/20 hover:bg-orange-600/40 text-orange-400 transition w-full sm:w-auto"
                      >
                        Postpone
                      </button>
                      <button
                        onClick={() => randomiseFixture(fixture)}
                        className="text-xs px-2.5 py-1 rounded bg-brand-600/20 hover:bg-brand-600/40 text-brand-400 transition w-full sm:w-auto sm:ml-auto"
                        title="Generate a random result for this fixture"
                      >
                        🎲
                      </button>
                    </div>

                    {/* Manual Entry */}
                    <div className={`grid grid-cols-1 gap-3 sm:grid-cols-3 ${density === 'compact' ? 'text-xs' : 'text-sm'}`}>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Status</label>
                        <AdminSelect
                          value={result.status}
                          onChange={(next) => handleSetResult(fixture.id, 'status', next)}
                          options={[
                            { value: '', label: '—' },
                            { value: 'FINISHED', label: 'FINISHED' },
                            { value: 'POSTPONED', label: 'POSTPONED' },
                            { value: 'CANCELLED', label: 'CANCELLED' },
                          ]}
                          className="text-sm py-2"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Home Score</label>
                        <input
                          type="number"
                          min="0"
                          value={result.scoreHome}
                          onChange={(e) => handleSetResult(fixture.id, 'scoreHome', e.target.value)}
                          className="input-field text-sm py-2"
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
                          className="input-field text-sm py-2"
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
    onMutate: () => {
      window.dispatchEvent(new CustomEvent('admin-status', {
        detail: { tone: 'info', message: 'Generating test data...' },
      }));
    },
    onSuccess: (response: any) => {
      const data = response.data;
      toast.success(
        `Created ${data.usersCreated} users, added ${data.participantsAdded} participants, created ${data.picksCreated} picks!`,
        { duration: 5000 }
      );
      window.dispatchEvent(new CustomEvent('admin-status', {
        detail: { tone: 'ok', message: 'Test data generated' },
      }));
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      queryClient.invalidateQueries({ queryKey: ['competitions'] });
    },
    onError: (err: any) => {
      window.dispatchEvent(new CustomEvent('admin-status', {
        detail: { tone: 'error', message: 'Test data generation failed' },
      }));
      toast.error(err.response?.data?.message || 'Generation failed');
    },
  });

  const cleanupMutation = useMutation({
    mutationFn: () => api.delete('/admin/test/cleanup', { timeout: 120_000 }),
    onMutate: () => {
      window.dispatchEvent(new CustomEvent('admin-status', {
        detail: { tone: 'warn', message: 'Cleaning up test data...' },
      }));
    },
    onSuccess: (response: any) => {
      toast.success(`Deleted ${response.data.usersDeleted} test users`);
      window.dispatchEvent(new CustomEvent('admin-status', {
        detail: { tone: 'ok', message: 'Test data cleanup complete' },
      }));
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      queryClient.invalidateQueries({ queryKey: ['competitions'] });
    },
    onError: (err: any) => {
      window.dispatchEvent(new CustomEvent('admin-status', {
        detail: { tone: 'error', message: 'Test data cleanup failed' },
      }));
      toast.error(err.response?.data?.message || 'Cleanup failed');
    },
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
            <AdminSelect
              value={selectedCompId}
              onChange={(next) => setSelectedCompId(next)}
              options={[
                { value: '', label: 'Choose a competition…' },
                ...(competitions ?? []).map((c) => ({
                  value: String(c.id),
                  label: `${c.name} (${c.status}) — ${c.participantCount} participants`,
                })),
              ]}
            />
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
  const [query, setQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [entityFilter, setEntityFilter] = useState('all');
  const [adminFilter, setAdminFilter] = useState('all');
  const [fieldFilter, setFieldFilter] = useState('all');
  const [entityIdFilter, setEntityIdFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(0);
  const [pageInput, setPageInput] = useState('1');
  const [pageSize, setPageSize] = useState(50);
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');

  useEffect(() => {
    setPage(0);
  }, [actionFilter, entityFilter, adminFilter, fieldFilter, entityIdFilter, dateFrom, dateTo, query, pageSize]);
  const auditParams = useMemo(() => {
    const params: Record<string, string> = {
      page: String(page),
      size: String(pageSize),
    };
    if (actionFilter !== 'all') params.action = actionFilter;
    if (entityFilter !== 'all') params.entityType = entityFilter;
    if (adminFilter !== 'all') params.username = adminFilter;
    if (fieldFilter !== 'all') params.fieldName = fieldFilter;
    if (entityIdFilter.trim()) params.entityId = entityIdFilter.trim();
    if (dateFrom) params.from = dateFrom;
    if (dateTo) params.to = dateTo;
    return params;
  }, [actionFilter, entityFilter, adminFilter, fieldFilter, entityIdFilter, dateFrom, dateTo, page, pageSize]);
  const { data, isLoading } = useQuery<{ content: AuditLog[]; totalPages?: number; number?: number; totalElements?: number }>({
    queryKey: ['audit', auditParams],
    queryFn: () => api.get('/admin/audit', { params: auditParams }).then((r) => r.data),
  });
  useEffect(() => {
    if (isLoading) {
      window.dispatchEvent(new CustomEvent('admin-status', {
        detail: { tone: 'info', message: 'Loading audit log...' },
      }));
      return;
    }
    window.dispatchEvent(new CustomEvent('admin-status', {
      detail: { tone: 'ok', message: 'Audit log ready' },
    }));
  }, [isLoading]);
  useEffect(() => {
    setPageInput(String((data?.number ?? page) + 1));
  }, [data?.number, page]);
  const totalPages = data?.totalPages ?? 1;
  const currentPage = data?.number ?? page;

  const logs = data?.content ?? [];
  const actions = useMemo(
    () => Array.from(new Set(logs.map((log) => log.action).filter((value): value is string => Boolean(value)))).sort(),
    [logs]
  );
  const entities = useMemo(
    () => Array.from(new Set(logs.map((log) => log.entityType).filter((value): value is string => Boolean(value)))).sort(),
    [logs]
  );
  const admins = useMemo(
    () => Array.from(new Set(logs.map((log) => log.username).filter((value): value is string => Boolean(value)))).sort(),
    [logs]
  );
  const fields = useMemo(
    () => Array.from(new Set(logs.map((log) => log.fieldName).filter((value): value is string => Boolean(value)))).sort(),
    [logs]
  );
  const filteredLogs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return logs.filter((log) => {
      if (!q) return true;
      const haystack = [
        log.username,
        log.action,
        log.entityType,
        String(log.entityId ?? ''),
        log.fieldName,
        log.oldValue,
        log.newValue,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [logs, query]);
  const totalElements = data?.totalElements ?? logs.length;

  const activeFilters = [
    actionFilter !== 'all' ? { key: 'action', label: `Action: ${actionFilter}`, onClear: () => setActionFilter('all') } : null,
    entityFilter !== 'all' ? { key: 'entity', label: `Entity: ${entityFilter}`, onClear: () => setEntityFilter('all') } : null,
    adminFilter !== 'all' ? { key: 'admin', label: `Admin: ${adminFilter}`, onClear: () => setAdminFilter('all') } : null,
    fieldFilter !== 'all' ? { key: 'field', label: `Field: ${fieldFilter}`, onClear: () => setFieldFilter('all') } : null,
    entityIdFilter.trim() ? { key: 'entityId', label: `Entity ID: ${entityIdFilter.trim()}`, onClear: () => setEntityIdFilter('') } : null,
    dateFrom ? { key: 'from', label: `From: ${dateFrom}`, onClear: () => setDateFrom('') } : null,
    dateTo ? { key: 'to', label: `To: ${dateTo}`, onClear: () => setDateTo('') } : null,
    query.trim() ? { key: 'query', label: `Search: ${query.trim()}`, onClear: () => setQuery('') } : null,
  ].filter(Boolean) as { key: string; label: string; onClear: () => void }[];

  if (isLoading) {
    return <div className="flex justify-center py-10"><div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" /></div>;
  }

  return (
    <div className="space-y-6">
      <SectionIntro
        eyebrow="Traceability"
        title="Audit Log"
        description="Review who changed what, when it happened, and how entity values moved over time."
      />
      <div className="card space-y-4">
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_repeat(3,13rem)]">
            <div className="lg:col-span-1">
              <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 mb-2">
                Search
              </label>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search admin, action, entity, field, values"
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 mb-2">
                Action
              </label>
              <AdminSelect
                value={actionFilter}
                onChange={(next) => setActionFilter(next)}
                options={[
                  { value: 'all', label: 'All actions' },
                  ...actions.map((action) => ({ value: action, label: action })),
                ]}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 mb-2">
                Entity
              </label>
              <AdminSelect
                value={entityFilter}
                onChange={(next) => setEntityFilter(next)}
                options={[
                  { value: 'all', label: 'All entities' },
                  ...entities.map((entity) => ({ value: entity, label: entity })),
                ]}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 mb-2">
                Admin
              </label>
              <AdminSelect
                value={adminFilter}
                onChange={(next) => setAdminFilter(next)}
                options={[
                  { value: 'all', label: 'All admins' },
                  ...admins.map((admin) => ({ value: admin, label: admin })),
                ]}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_10rem_10rem_10rem]">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 mb-2">
                Field
              </label>
              <AdminSelect
                value={fieldFilter}
                onChange={(next) => setFieldFilter(next)}
                options={[
                  { value: 'all', label: 'All fields' },
                  ...fields.map((field) => ({ value: field, label: field })),
                ]}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 mb-2">
                Entity ID
              </label>
              <input
                value={entityIdFilter}
                onChange={(e) => setEntityIdFilter(e.target.value)}
                placeholder="e.g. 42"
                className="input-field"
                inputMode="numeric"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 mb-2">
                From
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 mb-2">
                To
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="input-field"
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setActionFilter('all');
                  setEntityFilter('all');
                  setAdminFilter('all');
                  setFieldFilter('all');
                  setEntityIdFilter('');
                  setDateFrom('');
                  setDateTo('');
                }}
                className="w-full px-3 py-2 rounded-lg border border-white/10 text-xs font-semibold text-gray-300 hover:bg-white/[0.04]"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs text-gray-400">{totalElements} entries</span>
            <div className="flex items-center gap-3">
              <label className="text-[11px] uppercase tracking-[0.16em] text-gray-500">
                Page size
              </label>
              <AdminSelect
                value={String(pageSize)}
                onChange={(next) => setPageSize(Number(next))}
                options={['25', '50', '100'].map((val) => ({ value: val, label: val }))}
                className="h-9 w-24 text-xs"
              />
              <span className="text-[11px] text-gray-500">Server-side filters applied</span>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs text-gray-300">
            <span className="font-semibold text-gray-200">Density</span>
            <div className="inline-flex rounded-lg border border-white/10 bg-white/[0.02] p-1">
              {(['comfortable', 'compact'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setDensity(mode)}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                    density === mode ? 'bg-brand-600/30 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {mode === 'comfortable' ? 'Comfortable' : 'Compact'}
                </button>
              ))}
            </div>
          </div>
          {activeFilters.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {activeFilters.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  onClick={filter.onClear}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-gray-300 hover:bg-white/[0.08]"
                >
                  {filter.label}
                  <span className="text-gray-500">×</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setActionFilter('all');
                  setEntityFilter('all');
                  setAdminFilter('all');
                  setFieldFilter('all');
                  setEntityIdFilter('');
                  setDateFrom('');
                  setDateTo('');
                }}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs text-gray-400 hover:bg-white/[0.04]"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
        <div className="overflow-hidden rounded-xl border border-white/8">
          {filteredLogs.length === 0 ? (
            <p className="text-gray-400 py-8 text-center">No audit entries yet</p>
          ) : (
            <>
              <div className={`divide-y divide-gray-700/50 sm:hidden ${density === 'compact' ? 'text-[11px]' : 'text-xs'}`}>
                {filteredLogs.map((log) => (
                  <div key={log.id} className={`${density === 'compact' ? 'py-2 space-y-1.5' : 'py-3 space-y-2'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs text-gray-500">
                          {parseDate(log.createdAt).toLocaleString(undefined, {
                            day: '2-digit', month: '2-digit', year: 'numeric',
                            hour: '2-digit', minute: '2-digit', hour12: false
                          })}
                        </p>
                        <p className="mt-1 text-sm text-gray-100 truncate">{log.username ?? '—'}</p>
                      </div>
                      <span className="badge-blue shrink-0">{log.action}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <div className="text-gray-500 uppercase tracking-[0.14em]">Entity</div>
                        <div className="mt-1 text-gray-300">{log.entityType} #{log.entityId}</div>
                      </div>
                      <div>
                        <div className="text-gray-500 uppercase tracking-[0.14em]">Field</div>
                        <div className="mt-1 text-gray-300">{log.fieldName ?? '—'}</div>
                      </div>
                    </div>
                    <div className="text-xs text-gray-400 break-words">
                      {log.oldValue && <span className="text-red-400">{log.oldValue}</span>}
                      {log.oldValue && log.newValue && <span className="mx-1">→</span>}
                      {log.newValue && <span className="text-green-400">{log.newValue}</span>}
                      {!log.oldValue && !log.newValue && '—'}
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden sm:block overflow-x-auto">
                <table className={`w-full ${density === 'compact' ? 'text-xs' : 'text-sm'}`}>
                  <thead>
                    <tr className="border-b border-gray-700 text-left text-gray-400">
                      <th className={density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'}>Time</th>
                      <th className={density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'}>Admin</th>
                      <th className={density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'}>Action</th>
                      <th className={density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'}>Entity</th>
                      <th className={density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'}>Field</th>
                      <th className={density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'}>Old → New</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.map((log) => (
                      <tr key={log.id} className="border-b border-gray-700/50">
                        <td className={`${density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'} text-gray-400 whitespace-nowrap`}>
                          {parseDate(log.createdAt).toLocaleString(undefined, {
                            day: '2-digit', month: '2-digit', year: 'numeric',
                            hour: '2-digit', minute: '2-digit', hour12: false
                          })}
                        </td>
                        <td className={density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'}>{log.username ?? '—'}</td>
                        <td className={density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'}><span className="badge-blue">{log.action}</span></td>
                        <td className={`${density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'} text-gray-400`}>{log.entityType} #{log.entityId}</td>
                        <td className={`${density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'} text-gray-400`}>{log.fieldName ?? '—'}</td>
                        <td className={`${density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'} text-gray-400`}>
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
            </>
          )}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-gray-500">Page {currentPage + 1} of {totalPages}</div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPage(0)}
              disabled={currentPage <= 0}
              className="px-3 py-2 rounded-lg border border-white/10 text-xs font-semibold text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/[0.04]"
            >
              First
            </button>
            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(prev - 1, 0))}
              disabled={currentPage <= 0}
              className="px-3 py-2 rounded-lg border border-white/10 text-xs font-semibold text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/[0.04]"
            >
              Previous
            </button>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Go to</span>
              <input
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                onBlur={() => {
                  const parsed = Number(pageInput);
                  if (!Number.isFinite(parsed)) return;
                  const target = Math.min(Math.max(Math.floor(parsed) - 1, 0), Math.max(totalPages - 1, 0));
                  setPage(target);
                }}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.currentTarget.blur();
                }}
                className="input-field h-9 w-16 text-xs text-center"
                inputMode="numeric"
              />
            </div>
            <button
              type="button"
              onClick={() => setPage((prev) => Math.min(prev + 1, totalPages - 1))}
              disabled={currentPage >= totalPages - 1}
              className="px-3 py-2 rounded-lg border border-white/10 text-xs font-semibold text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/[0.04]"
            >
              Next
            </button>
            <button
              type="button"
              onClick={() => setPage(Math.max(totalPages - 1, 0))}
              disabled={currentPage >= totalPages - 1}
              className="px-3 py-2 rounded-lg border border-white/10 text-xs font-semibold text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/[0.04]"
            >
              Last
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionIntro({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.035] px-4 py-4 shadow-[0_16px_40px_rgba(2,6,23,0.28)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-200/80">{eyebrow}</div>
      <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-gray-400">{description}</p>
    </div>
  );
}
