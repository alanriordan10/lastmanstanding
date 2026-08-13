import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../api';
import type { AuthResponse } from '../types';
import { useAuth } from '../context/AuthContext';

interface CreateClubResponse {
  auth: AuthResponse;
  clubId: number;
  clubName: string;
}

export default function CreateClubPage() {
  const navigate = useNavigate();
  const { loginWithData, user, isLoading } = useAuth();
  const [clubName, setClubName] = useState('');
  const [clubDescription, setClubDescription] = useState('');

  const createClubMutation = useMutation({
    mutationFn: () => api.post<CreateClubResponse>('/auth/create-club', {
      clubName: clubName.trim(),
      clubDescription: clubDescription.trim() || null,
    }),
    onSuccess: (response) => {
      const { auth, clubName: name } = response.data;
      loginWithData(auth);
      toast.success(`Welcome! "${name}" is ready. Start creating competitions.`, { duration: 5000 });
      navigate('/club-admin');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Club creation failed. Please try again.');
    },
  });

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center"><Spinner /></div>;
  }

  if (!user) {
    return <Navigate to={`/login?returnTo=${encodeURIComponent('/create-club')}`} replace />;
  }

  if (user.role === 'CLUB_ADMIN') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 gap-6">
        <div className="w-full max-w-md rounded-[1.75rem] border border-amber-400/30 bg-[linear-gradient(145deg,rgba(120,53,15,0.22),rgba(8,15,30,0.9))] p-8 text-center shadow-[0_24px_60px_rgba(2,6,23,0.44)]">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15 border border-amber-400/30 text-3xl">🏠</div>
          <h1 className="text-2xl font-black tracking-tight text-white mb-2">You already manage a club</h1>
          <p className="text-sm text-gray-300 leading-6 mb-6">
            Your account is already set up as a Club Admin. You can only manage one club per account. Head to your Club Admin area to manage competitions, members, and payments.
          </p>
          <Link
            to="/club-admin"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-amber-400/35 bg-amber-500/15 px-4 py-3 text-sm font-black text-amber-100 transition hover:bg-amber-500/25 hover:text-white"
          >
            Go to Club Admin →
          </Link>
          <Link
            to="/competitions"
            className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-gray-400 transition hover:text-white"
          >
            Back to Competitions
          </Link>
        </div>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clubName.trim()) {
      toast.error('Club name is required');
      return;
    }
    createClubMutation.mutate();
  };

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="border-b border-white/8 bg-[linear-gradient(180deg,rgba(8,15,30,0.92),rgba(8,15,30,0.78))] backdrop-blur-xl px-6 py-4 flex items-center justify-between">
        <Link to="/competitions" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-brand-300/25 bg-white shadow-[0_10px_28px_rgba(56,189,248,0.18)]">
            <img src="/app-logo.png?v=20260511" alt="Last Man Standing logo" className="h-full w-full object-cover" />
          </div>
          <div className="hidden sm:block">
            <span className="block text-lg font-black tracking-tight">Last Man Standing</span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-200/75">Club setup</span>
          </div>
        </Link>
        <Link to="/competitions" className="rounded-lg border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-200 transition hover:bg-white/[0.1] hover:text-white">
          Cancel setup
        </Link>
      </nav>

      <div className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-5xl grid gap-6 lg:grid-cols-[1fr_1.05fr]">
          <section className="relative overflow-hidden rounded-[1.9rem] border border-white/8 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.22),transparent_24rem),radial-gradient(circle_at_85%_16%,rgba(250,204,21,0.08),transparent_18rem),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(8,15,30,0.94))] px-6 py-8 shadow-[0_30px_75px_rgba(2,6,23,0.48)]">
            <div className="inline-flex rounded-full border border-brand-400/25 bg-brand-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-200">
              Existing account
            </div>
            <div className="mt-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-brand-300/25 bg-gradient-to-br from-brand-500 to-cyan-400 text-3xl font-black text-slate-950 shadow-[0_10px_28px_rgba(56,189,248,0.18)]">
              🏠
            </div>
            <h1 className="mt-6 text-4xl font-black tracking-tight text-white">Create Your Club</h1>
            <p className="mt-3 max-w-md text-sm leading-6 text-gray-300 sm:text-[15px]">
              Use your signed-in account to launch a club, create competitions, invite members, and manage payments.
            </p>
            <div className="mt-8 grid grid-cols-3 gap-3">
              <SetupMetric label="Account" value="Signed in" />
              <SetupMetric label="Setup" value="One form" />
              <SetupMetric label="Admin" value="Instant" />
            </div>
          </section>

           <form onSubmit={handleSubmit} className="card w-full max-w-lg lg:max-w-none mx-auto space-y-5">
             <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5">
               <span className="text-emerald-400 text-base leading-none">✓</span>
               <p className="text-sm text-emerald-200">
                 Signed in as <span className="font-semibold">{user.email}</span>
               </p>
             </div>
             <div>
               <h2 className="text-lg font-semibold text-gray-100">Tell us about your club</h2>
               <p className="text-sm text-gray-400 mt-1">This is how your club will appear to participants.</p>
             </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Club Name <span className="text-red-400">*</span>
              </label>
              <input
                value={clubName}
                onChange={(e) => setClubName(e.target.value)}
                className="input-field"
                placeholder="e.g. St. Nicholas GAA, The Red Lion Pub"
                required
                maxLength={80}
                autoFocus
              />
              <p className="text-xs text-gray-500 mt-1">Must be unique across the platform.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Description <span className="text-gray-500 font-normal">(optional)</span>
              </label>
              <textarea
                value={clubDescription}
                onChange={(e) => setClubDescription(e.target.value)}
                className="input-field"
                placeholder="A short description of your club or competition rules..."
                rows={3}
                maxLength={300}
              />
            </div>

            <div className="rounded-xl bg-brand-600/10 border border-brand-500/20 p-4 space-y-2">
              <p className="text-sm font-semibold text-brand-400">What you get as a Club Admin:</p>
              <ul className="space-y-1.5">
                {[
                  'Create unlimited Last Man Standing competitions',
                  'Set entry fees, rules and missed pick behaviour',
                  'Manage participants, payments, and winners',
                  'View survivor tables and results history',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-gray-300">
                    <span className="text-green-400 shrink-0 mt-0.5">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <button type="submit" disabled={createClubMutation.isPending} className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
                {createClubMutation.isPending ? 'Creating club...' : 'Create Club'}
              </button>
              <Link to="/competitions" className="rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 text-center text-sm font-semibold text-gray-200 transition hover:bg-white/[0.1] hover:text-white">
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />;
}

function SetupMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.045] px-3 py-2.5 text-center backdrop-blur-sm">
      <div className="text-sm font-black text-white sm:text-base">{value}</div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">{label}</div>
    </div>
  );
}
