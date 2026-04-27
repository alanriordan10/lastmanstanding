import { useState, useRef, useEffect } from 'react';
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import api from '../api';
import toast from 'react-hot-toast';

interface UserResult {
  id: number;
  username: string;
  email: string;
  role: string;
}

interface Props {
  competitionId: number;
  /** Base API path — '/admin' or '/club-admin' */
  apiBase: string;
  /** Cache keys to invalidate after adding a participant */
  invalidateKeys: QueryKey[];
  onClose: () => void;
}

export default function AddParticipantPanel({ competitionId, apiBase, invalidateKeys, onClose }: Props) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'search' | 'guest'>('search');

  // Search state
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Guest state
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');

  const invalidate = () => {
    invalidateKeys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
  };

  const addMutation = useMutation({
    mutationFn: (body: { userId?: number; guestUsername?: string; guestEmail?: string }) =>
      api.post(`${apiBase}/competitions/${competitionId}/add-participant`, body),
    onSuccess: (_, vars) => {
      toast.success(vars.guestUsername
        ? `Guest "${vars.guestUsername}" added to competition`
        : 'Participant added to competition');
      invalidate();
      onClose();
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to add participant'),
  });

  // Debounced search
  useEffect(() => {
    if (mode !== 'search') return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.get(`${apiBase}/users/search?q=${encodeURIComponent(query)}`);
        setResults(res.data);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, mode, apiBase]);

  return (
    <div className="mt-4 rounded-2xl border border-brand-500/25 bg-[linear-gradient(135deg,rgba(56,189,248,0.08),rgba(8,15,30,0.3))] p-4 shadow-[0_18px_45px_rgba(2,6,23,0.24)] backdrop-blur-sm space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold uppercase tracking-[0.16em] text-white">Add Participant</h4>
          <p className="mt-1 text-xs text-gray-400">Search for an existing user or create a guest entry for this competition.</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none">×</button>
      </div>

      {/* Mode toggle */}
      <div className="inline-flex rounded-2xl border border-white/8 bg-black/10 p-1">
        <button
          onClick={() => setMode('search')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            mode === 'search' ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          🔍 Find existing user
        </button>
        <button
          onClick={() => setMode('guest')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            mode === 'guest' ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          👤 Add as guest
        </button>
      </div>

      {/* Search existing user */}
      {mode === 'search' && (
        <div className="space-y-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or email…"
            className="input-field text-sm"
            autoFocus
          />
          {searching && (
            <p className="text-xs text-gray-400">Searching…</p>
          )}
          {!searching && query.length >= 2 && results.length === 0 && (
            <p className="text-xs text-gray-400">No users found — try adding as a guest instead.</p>
          )}
          {results.length > 0 && (
            <ul className="divide-y divide-white/8 rounded-2xl border border-white/8 overflow-hidden bg-white/[0.03]">
              {results.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-100 truncate">{u.username}</p>
                    <p className="text-xs text-gray-400 truncate">{u.email}</p>
                  </div>
                  <button
                    onClick={() => addMutation.mutate({ userId: u.id })}
                    disabled={addMutation.isPending}
                    className="shrink-0 text-xs px-3 py-1.5 rounded-lg bg-brand-600/20 hover:bg-brand-600/40 text-brand-400 transition"
                  >
                    {addMutation.isPending ? '…' : 'Add'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Add as guest */}
      {mode === 'guest' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-400">
            Creates a new account for someone who doesn't want to sign up themselves. They can set a password later using "Forgot Password" if they ever want to log in.
          </p>
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">Name / Username *</label>
            <input
              type="text"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="e.g. John Murphy"
              className="input-field text-sm"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">Email (optional)</label>
            <input
              type="email"
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
              placeholder="john@example.com"
              className="input-field text-sm"
            />
            <p className="mt-1 text-xs text-gray-500">
              Leave blank to generate a placeholder email. Add a real email if they want result notifications.
            </p>
          </div>
          <button
            onClick={() => addMutation.mutate({ guestUsername: guestName, guestEmail: guestEmail || undefined })}
            disabled={addMutation.isPending || !guestName.trim()}
            className="btn-primary text-sm w-full"
          >
            {addMutation.isPending ? 'Adding…' : 'Create guest & add to competition'}
          </button>
        </div>
      )}
    </div>
  );
}
