import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../api';
import type { Participant, AuditLog } from '../types';

interface DebugPickRow {
  pickId: number;
  participantId: number;
  userId: number;
  username: string;
  entryNumber: number | null;
  gameweekId: number;
  weekNumber: number;
  teamId: number;
  teamShortName: string;
  teamName: string;
  source: string;
  locked: boolean;
  useLifeline: boolean;
  outcome: string | null;
  resolvedAt: string | null;
}

interface DebugSummary {
  competitionId: number;
  competitionName: string;
  competitionStatus: string;
  cacheHit: boolean;
  totalPicks: number;
  totalAuditEntries: number;
  participants: Participant[];
  picks: DebugPickRow[];
  auditLogs: AuditLog[];
}

export default function AdminDebugPanel({ compId }: { compId: number }) {
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading, error, refetch, isFetching } = useQuery<DebugSummary>({
    queryKey: ['admin', 'debug-summary', compId],
    queryFn: () => api.get(`/admin/competitions/${compId}/debug-summary`).then(r => r.data),
    enabled: expanded,
    staleTime: 30_000,
  });

  return (
    <section className="rounded-2xl border border-amber-400/30 bg-amber-400/[0.04] shadow-[0_18px_42px_rgba(245,158,11,0.12)]">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300">Admin debug panel</p>
          <h2 className="mt-1 text-lg font-black text-white">Raw state dump</h2>
          <p className="mt-0.5 text-xs text-gray-400">
            Full participant list, every pick (incl. unresolved), and the audit trail — for diagnosing user-reported issues.
          </p>
        </div>
        <span className="text-xs font-semibold text-amber-200">{expanded ? '▾ Hide' : '▸ Show'}</span>
      </button>

      {expanded && (
        <div className="border-t border-amber-400/20 px-5 py-4 space-y-5">
          {isLoading && <div className="text-sm text-gray-400 animate-pulse">Loading debug summary…</div>}
          {error && (
            <div className="text-sm text-red-300">
              Failed to load debug summary. {(error as any)?.response?.data?.message ?? ''}
            </div>
          )}
          {data && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-300">
                <span className="rounded-full border border-white/10 bg-black/15 px-2.5 py-1">
                  {data.participants.length} participants
                </span>
                <span className="rounded-full border border-white/10 bg-black/15 px-2.5 py-1">
                  {data.totalPicks} picks
                </span>
                <span className="rounded-full border border-white/10 bg-black/15 px-2.5 py-1">
                  {data.totalAuditEntries} audit entries
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 ${data.cacheHit
                    ? 'border border-yellow-400/30 bg-yellow-400/10 text-yellow-200'
                    : 'border border-emerald-400/30 bg-emerald-400/10 text-emerald-200'}`}
                  title={data.cacheHit
                    ? 'This competition is currently cached in Caffeine'
                    : 'Not currently in Caffeine (freshly fetched or evicted)'}
                >
                  cache {data.cacheHit ? 'HIT' : 'MISS'}
                </span>
                <button
                  type="button"
                  onClick={() => refetch()}
                  disabled={isFetching}
                  className="ml-auto rounded-lg border border-white/10 bg-surface-700 px-2.5 py-1 text-xs text-gray-200 hover:bg-surface-600 disabled:opacity-50"
                >
                  {isFetching ? 'Refreshing…' : '↻ Refresh'}
                </button>
              </div>

              <DebugParticipantsTable participants={data.participants} />
              <DebugPicksTable picks={data.picks} />
              <DebugAuditTable logs={data.auditLogs} />
            </>
          )}
        </div>
      )}
    </section>
  );
}

function paymentTone(state: string | null | undefined) {
  switch (state) {
    case 'PAID': return 'bg-emerald-400/10 text-emerald-200 border-emerald-400/30';
    case 'AWAITING_PAYMENT': return 'bg-amber-400/10 text-amber-200 border-amber-400/30';
    case 'NOT_REQUIRED':
    case null:
    case undefined: return 'bg-slate-400/10 text-slate-200 border-slate-400/25';
    default: return 'bg-slate-400/10 text-slate-200 border-slate-400/25';
  }
}

function outcomeTone(outcome: string | null | undefined) {
  switch (outcome) {
    case 'ADVANCE': return 'bg-emerald-400/10 text-emerald-200 border-emerald-400/30';
    case 'ELIMINATED': return 'bg-red-400/10 text-red-200 border-red-400/30';
    case 'POSTPONED_ADVANCE': return 'bg-cyan-400/10 text-cyan-200 border-cyan-400/30';
    case 'PENDING':
    case null:
    case undefined: return 'bg-slate-400/10 text-slate-200 border-slate-400/25';
    default: return 'bg-slate-400/10 text-slate-200 border-slate-400/25';
  }
}

function DebugParticipantsTable({ participants }: { participants: Participant[] }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-200">Participants</h3>
      <div className="mt-2 overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full text-xs">
          <thead className="bg-black/20 text-gray-400">
            <tr>
              <th className="px-3 py-2 text-left">Username</th>
              <th className="px-3 py-2 text-left">Entry</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Payment</th>
              <th className="px-3 py-2 text-left">Eliminated GW</th>
              <th className="px-3 py-2 text-left">Reason</th>
              <th className="px-3 py-2 text-left">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {participants.map(p => (
              <tr key={p.id} className="text-gray-200">
                <td className="px-3 py-1.5 font-medium">{p.username}</td>
                <td className="px-3 py-1.5 text-gray-400">{p.entryNumber ?? '—'}</td>
                <td className="px-3 py-1.5">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${p.status === 'ACTIVE' ? 'bg-emerald-400/10 text-emerald-200 border-emerald-400/30'
                    : p.status === 'WINNER' ? 'bg-yellow-400/10 text-yellow-200 border-yellow-400/30'
                    : 'bg-red-400/10 text-red-200 border-red-400/30'}`}>
                    {p.status}
                  </span>
                </td>
                <td className="px-3 py-1.5">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${paymentTone(p.paymentState)}`}>
                    {p.paymentState ?? 'NOT_REQUIRED'}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-gray-400">{p.eliminatedWeek ?? '—'}</td>
                <td className="px-3 py-1.5 text-gray-400">{p.eliminationReason ?? '—'}</td>
                <td className="px-3 py-1.5 text-gray-400">{p.joinedAt?.slice(0, 16).replace('T', ' ') ?? '—'}</td>
              </tr>
            ))}
            {participants.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-3 text-center text-gray-500">No participants yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DebugPicksTable({ picks }: { picks: DebugPickRow[] }) {
  const sorted = [...picks].sort((a, b) => {
    if (a.weekNumber !== b.weekNumber) return a.weekNumber - b.weekNumber;
    return a.username.localeCompare(b.username);
  });
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-200">All picks ({picks.length})</h3>
      <div className="mt-2 max-h-96 overflow-auto rounded-lg border border-white/10">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-black/40 text-gray-400 backdrop-blur">
            <tr>
              <th className="px-3 py-2 text-left">GW</th>
              <th className="px-3 py-2 text-left">Username</th>
              <th className="px-3 py-2 text-left">Entry</th>
              <th className="px-3 py-2 text-left">Team</th>
              <th className="px-3 py-2 text-left">Source</th>
              <th className="px-3 py-2 text-left">Locked</th>
              <th className="px-3 py-2 text-left">Lifeline</th>
              <th className="px-3 py-2 text-left">Outcome</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {sorted.map(p => (
              <tr key={p.pickId} className="text-gray-200">
                <td className="px-3 py-1.5 text-gray-400">GW{p.weekNumber}</td>
                <td className="px-3 py-1.5 font-medium">{p.username}</td>
                <td className="px-3 py-1.5 text-gray-400">{p.entryNumber ?? '—'}</td>
                <td className="px-3 py-1.5">
                  <span className="font-semibold text-white">{p.teamShortName}</span>
                  <span className="ml-1 text-gray-500">{p.teamName}</span>
                </td>
                <td className="px-3 py-1.5">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${p.source === 'AUTO'
                    ? 'bg-cyan-400/10 text-cyan-200 border-cyan-400/30'
                    : 'bg-slate-400/10 text-slate-200 border-slate-400/25'}`}>
                    {p.source}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-gray-400">{p.locked ? '🔒' : '—'}</td>
                <td className="px-3 py-1.5 text-gray-400">{p.useLifeline ? '✨' : '—'}</td>
                <td className="px-3 py-1.5">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${outcomeTone(p.outcome)}`}>
                    {p.outcome ?? 'PENDING'}
                  </span>
                </td>
              </tr>
            ))}
            {picks.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-3 text-center text-gray-500">No picks in this competition yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DebugAuditTable({ logs }: { logs: AuditLog[] }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-200">
        Audit trail ({logs.length})
      </h3>
      <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-white/10">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-black/40 text-gray-400 backdrop-blur">
            <tr>
              <th className="px-3 py-2 text-left">When</th>
              <th className="px-3 py-2 text-left">User</th>
              <th className="px-3 py-2 text-left">Entity</th>
              <th className="px-3 py-2 text-left">Action</th>
              <th className="px-3 py-2 text-left">Field</th>
              <th className="px-3 py-2 text-left">Old</th>
              <th className="px-3 py-2 text-left">New</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {logs.map(l => (
              <tr key={l.id} className="text-gray-200">
                <td className="px-3 py-1.5 text-gray-400 whitespace-nowrap">{l.createdAt?.slice(0, 16).replace('T', ' ') ?? '—'}</td>
                <td className="px-3 py-1.5">{l.username ?? '—'}</td>
                <td className="px-3 py-1.5 text-gray-400">
                  {l.entityType}#{l.entityId}
                </td>
                <td className="px-3 py-1.5 font-mono text-[10px] text-amber-200">{l.action}</td>
                <td className="px-3 py-1.5 text-gray-400">{l.fieldName ?? '—'}</td>
                <td className="px-3 py-1.5 text-gray-400 max-w-[12rem] truncate" title={l.oldValue ?? ''}>{l.oldValue ?? '—'}</td>
                <td className="px-3 py-1.5 text-gray-400 max-w-[12rem] truncate" title={l.newValue ?? ''}>{l.newValue ?? '—'}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-3 text-center text-gray-500">No audit entries recorded yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
