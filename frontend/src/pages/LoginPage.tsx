import { useState, useEffect } from 'react';
import { Link, useNavigate, Navigate, useSearchParams } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../api';
import toast from 'react-hot-toast';
import SocialAuthButtons from '../components/SocialAuthButtons';
import SeoMeta from '../components/SeoMeta';

function prettyIp(ip?: string | null): string | null {
  if (!ip) return null;
  if (ip === '127.0.0.1' || ip === '0:0:0:0:0:0:0:1' || ip === '::1' || ip === 'localhost') return 'localhost';
  if (ip.startsWith('::ffff:')) {
    const v4 = ip.substring(7);
    if (v4 === '127.0.0.1') return 'localhost';
    return v4;
  }
  return ip;
}

type LoginStatus =
  | { kind: 'idle' }
  | { kind: 'error'; message: string; attemptsRemaining: number }
  | { kind: 'locked'; retryAfterSeconds: number; message: string };

export default function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('returnTo');
  const decodedReturnTo = returnTo ? decodeURIComponent(returnTo) : null;
  const isCreateClubReturn = decodedReturnTo === '/create-club';
  const hideClubCta = isCreateClubReturn;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<LoginStatus>({ kind: 'idle' });

  useEffect(() => {
    const error = searchParams.get('error');
    if (error) {
      toast.error(`Sign in failed: ${error}`, { duration: 6000 });
    }
  }, [searchParams]);

  if (user) return <Navigate to={returnTo || '/competitions'} replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus({ kind: 'idle' });
    try {
      await login(email, password);
      const stored = localStorage.getItem('user');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed.lastLoginAt) {
            const date = new Date(parsed.lastLoginAt);
            if (!Number.isNaN(date.getTime())) {
              const relative = formatDistanceToNow(date, { addSuffix: true });
              const ip = prettyIp(parsed.lastLoginIp);
              toast(`Last sign-in: ${relative}${ip ? ` from ${ip}` : ''}`, {
                icon: '🕒',
                duration: 5000,
              });
            }
          }
        } catch {
          // ignore parse errors
        }
      }
      navigate(returnTo || '/competitions');
    } catch (err: any) {
      const responseStatus = err.response?.status;
      if (responseStatus === 429) {
        const retryAfter = Number(err.response?.headers?.['retry-after']) || 60;
        const message = err.response?.data?.message || 'Too many attempts. Please wait and try again.';
        setStatus({ kind: 'locked', retryAfterSeconds: retryAfter, message });
      } else {
        const message = err.response?.data?.message || 'Invalid credentials';
        const remaining = err.response?.data?.attemptsRemaining;
        setStatus({
          kind: 'error',
          message,
          attemptsRemaining: typeof remaining === 'number' ? remaining : 0,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const inputInvalid = status.kind === 'error' || status.kind === 'locked';

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.12),transparent_36rem),linear-gradient(180deg,#0a1224_0%,#0b1322_100%)] px-4 py-10">

      <SeoMeta
        title="Sign In | Last Man Standing"
        description="Sign in to manage picks, view results, and run football survivor pool competitions."
        canonicalPath="/login"
        noindex
      />
      <div className="relative grid w-full max-w-6xl gap-6 lg:grid-cols-[1.08fr_0.92fr]">
        <section className="relative overflow-hidden rounded-[2.1rem] border border-white/8 bg-[linear-gradient(145deg,rgba(15,23,42,0.84),rgba(8,15,30,0.8))] px-6 py-8 shadow-[0_22px_56px_rgba(2,6,23,0.42)] backdrop-blur-sm sm:px-8 sm:py-10">
          <div className="inline-flex rounded-full border border-brand-300/25 bg-brand-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-100">
            Member access
          </div>
          <div className="mt-6 flex h-20 w-20 items-center justify-center overflow-hidden rounded-3xl bg-transparent p-0 shadow-[0_10px_24px_rgba(2,6,23,0.35)]">
            <img src="/app-logo.png?v=20260511" alt="Last Man Standing logo" className="h-full w-full rounded-2xl object-cover" />
          </div>
          <h1 className="mt-6 text-4xl font-black tracking-tight text-slate-100 sm:text-[44px]">Welcome Back</h1>
          <p className="mt-3 max-w-lg text-sm leading-6 text-slate-300 sm:text-[16px]">
            {isCreateClubReturn
              ? 'Sign in to continue your club setup. We will take you straight back to Create Club.'
              : 'Sign in to manage your picks, review results, and stay ahead of the next lock.'}
          </p>
          <div className="mt-8 grid grid-cols-3 gap-3 sm:gap-4">
            <AuthMetric label="Picks" value="Live" />
            <AuthMetric label="Results" value="Fast" />
            <AuthMetric label="Alerts" value="Ready" />
          </div>
        </section>

        <div className="w-full space-y-5 lg:space-y-6">
        <form
          onSubmit={handleSubmit}
          className="rounded-[1.4rem] border border-white/10 bg-[linear-gradient(150deg,rgba(15,23,42,0.84),rgba(9,16,34,0.88))] p-5 shadow-[0_20px_50px_rgba(2,6,23,0.42)] backdrop-blur-md sm:p-6"
        >
          {isCreateClubReturn ? (
            <div className="mb-4 rounded-xl border border-cyan-400/35 bg-cyan-500/10 px-3.5 py-2.5 text-sm text-cyan-100">
              Continue club setup: once you sign in, you will land on <span className="font-semibold">Create Club</span>.
            </div>
          ) : null}
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-gray-300">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="password" className="text-sm font-medium text-gray-300">
                Password
              </label>
              <Link to="/forgot-password" className="text-xs text-brand-400 hover:text-brand-300 transition-colors">
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`input-field pr-12 ${inputInvalid ? 'border-red-500/60 focus:border-red-400 focus:ring-red-400' : ''}`}
                placeholder="••••••••"
                autoComplete="current-password"
                aria-invalid={inputInvalid}
                aria-describedby={status.kind !== 'idle' ? 'login-status' : undefined}
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute inset-y-0 right-3 text-sm font-medium text-gray-400 transition hover:text-white"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <LoginStatusLine status={status} />
          </div>
          <div className="h-4" />
          <button type="submit" disabled={loading || status.kind === 'locked'} className="btn-primary w-full">
            {loading ? 'Signing in…' : status.kind === 'locked' ? 'Locked out' : isCreateClubReturn ? 'Sign In & Continue to Create Club' : 'Sign In'}
          </button>
        </form>
        <div className="rounded-[1.4rem] border border-white/10 bg-[linear-gradient(150deg,rgba(15,23,42,0.84),rgba(9,16,34,0.88))] p-5 shadow-[0_20px_50px_rgba(2,6,23,0.42)] backdrop-blur-md sm:p-6">
          <SocialAuthButtons mode="login" continuationHint={isCreateClubReturn ? 'to continue to Create Club' : undefined} />
        </div>

        <p className="text-center text-sm text-gray-400">
          Don't have an account?{' '}
          <Link to="/signup" className="font-medium text-brand-400 hover:text-brand-300">
            Sign up
          </Link>
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs font-semibold text-gray-500">
          <Link to="/guide" className="hover:text-brand-300">User guide</Link>
          <Link to="/faq" className="hover:text-brand-300">FAQ</Link>
          <Link to="/privacy" className="hover:text-brand-300">Privacy</Link>
          <Link to="/terms" className="hover:text-brand-300">Terms</Link>
        </div>

        <div className="text-center">
          <a
            href="https://play.google.com/store/apps/details?id=com.lastmanstanding.app"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-xs font-semibold text-gray-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
          >
            <span>📱</span>
            <span>Using Android? Get the app on Google Play</span>
          </a>
        </div>

        {!hideClubCta ? (
          <div className="rounded-[1.4rem] border border-brand-300/25 bg-[linear-gradient(145deg,rgba(14,165,233,0.14),rgba(15,23,42,0.9))] p-5 shadow-[0_18px_42px_rgba(2,6,23,0.34)]">
            <div className="inline-flex rounded-full border border-brand-300/25 bg-brand-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-brand-100">
              Running a club?
            </div>
            <h2 className="mt-3 text-xl font-black tracking-tight text-white">Create your club</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Use your existing account to create a club, launch competitions, invite members, and manage payments from one admin area.
            </p>
            <Link to="/create-club" className="mt-4 inline-flex w-full items-center justify-center rounded-xl border border-brand-300/35 bg-brand-500/15 px-4 py-3 text-sm font-black text-brand-100 transition hover:bg-brand-500/25 hover:text-white">
              Create club
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  </div>
  );
}

function LoginStatusLine({ status }: { status: LoginStatus }) {
  if (status.kind === 'idle') return null;
  const id = 'login-status';
  if (status.kind === 'locked') {
    const minutes = Math.ceil(status.retryAfterSeconds / 60);
    return (
      <p id={id} role="alert" className="mt-2 text-xs font-medium text-red-300">
        ⚠️ {status.message} Try again in {minutes} minute{minutes === 1 ? '' : 's'}.
      </p>
    );
  }
  if (status.attemptsRemaining <= 2) {
    return (
      <p id={id} role="alert" className="mt-2 text-xs font-medium text-amber-300">
        ⚠️ {status.message} {status.attemptsRemaining} attempt{status.attemptsRemaining === 1 ? '' : 's'} remaining before lockout.
      </p>
    );
  }
  return (
    <p id={id} role="alert" className="mt-2 text-xs font-medium text-red-300">
      {status.message}
    </p>
  );
}

function AuthMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 text-center backdrop-blur-sm">
      <div className="text-lg font-black text-slate-100">{value}</div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</div>
    </div>
  );
}