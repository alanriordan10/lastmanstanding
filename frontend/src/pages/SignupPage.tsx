import { useEffect, useState } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api';
import toast from 'react-hot-toast';
import SocialAuthButtons from '../components/SocialAuthButtons';

type UsernameCheckState = 'idle' | 'checking' | 'available' | 'taken' | 'error';
type EmailCheckState = 'idle' | 'checking' | 'available' | 'taken' | 'error';

export default function SignupPage() {
  const { signup, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<UsernameCheckState>('idle');
  const [usernameMessage, setUsernameMessage] = useState('');
  const [emailStatus, setEmailStatus] = useState<EmailCheckState>('idle');
  const [emailMessage, setEmailMessage] = useState('');

  useEffect(() => {
    const normalized = username.trim();
    if (!normalized || normalized.length < 3) {
      setUsernameStatus('idle');
      setUsernameMessage('');
      return;
    }
    if (/\s/.test(normalized)) {
      setUsernameStatus('error');
      setUsernameMessage('Username cannot contain spaces');
      return;
    }

    let cancelled = false;
    setUsernameStatus('checking');
    setUsernameMessage('');

    const timer = window.setTimeout(async () => {
      try {
        const { data } = await api.get<{ available: boolean; message: string }>('/auth/username-availability', {
          params: { username: normalized },
        });
        if (cancelled) return;
        setUsernameStatus(data.available ? 'available' : 'taken');
        setUsernameMessage(data.message);
      } catch (err: any) {
        if (cancelled) return;
        setUsernameStatus('error');
        setUsernameMessage(err.response?.data?.message || 'Could not verify username right now');
      }
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [username]);

  if (user) return <Navigate to="/competitions" replace />;

  const checkUsernameAvailability = async () => {
    const normalized = username.trim();
    if (/\s/.test(normalized)) {
      setUsernameStatus('error');
      setUsernameMessage('Username cannot contain spaces');
      return false;
    }
    if (normalized.length < 3) {
      setUsernameStatus('idle');
      setUsernameMessage('');
      return true;
    }

    setUsernameStatus('checking');
    setUsernameMessage('');

    try {
      const { data } = await api.get<{ available: boolean; message: string }>('/auth/username-availability', {
        params: { username: normalized },
      });
      setUsernameStatus(data.available ? 'available' : 'taken');
      setUsernameMessage(data.message);
      return data.available;
    } catch (err: any) {
      setUsernameStatus('error');
      setUsernameMessage(err.response?.data?.message || 'Could not verify username right now');
      return false;
    }
  };

  const checkEmailAvailability = async () => {
    const normalized = email.trim();
    if (!normalized) {
      setEmailStatus('idle');
      setEmailMessage('');
      return true;
    }

    setEmailStatus('checking');
    setEmailMessage('');

    try {
      const { data } = await api.get<{ available: boolean; message: string }>('/auth/email-availability', {
        params: { email: normalized },
      });
      setEmailStatus(data.available ? 'available' : 'taken');
      setEmailMessage(data.message);
      return data.available;
    } catch (err: any) {
      setEmailStatus('error');
      setEmailMessage(err.response?.data?.message || 'Could not verify email right now');
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    const usernameAvailable = await checkUsernameAvailability();
    if (!usernameAvailable) {
      if (usernameStatus !== 'taken') {
        toast.error('Please fix the username before creating your account.');
      }
      return;
    }
    const emailAvailable = await checkEmailAvailability();
    if (!emailAvailable) {
      if (emailStatus !== 'taken') {
        toast.error('Please fix the email before creating your account.');
      }
      return;
    }
    setLoading(true);
    try {
      await signup(email.trim(), username.trim(), password);
      navigate('/competitions');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      
      <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative overflow-hidden rounded-[1.9rem] border border-white/8 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.22),transparent_24rem),radial-gradient(circle_at_85%_16%,rgba(250,204,21,0.08),transparent_18rem),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(8,15,30,0.94))] px-6 py-8 shadow-[0_30px_75px_rgba(2,6,23,0.48)]">
          <div className="inline-flex rounded-full border border-brand-400/25 bg-brand-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-200">
            Player signup
          </div>
          <div className="mt-6 flex h-20 w-20 items-center justify-center overflow-hidden rounded-3xl bg-transparent p-0 shadow-[0_10px_24px_rgba(2,6,23,0.35)]">
            <img src="/app-logo.png?v=20260511" alt="Last Man Standing logo" className="h-full w-full rounded-2xl object-cover" />
          </div>
          <h1 className="mt-6 text-4xl font-black tracking-tight text-white">Create Account</h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-gray-300 sm:text-[15px]">
            Join competitions, track your survival run, and get ready for the next gameweek lock.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-3">
            <SignupMetric label="Join" value="Fast" />
            <SignupMetric label="Play" value="Live" />
            <SignupMetric label="Compete" value="Weekly" />
          </div>
        </section>

        <div className="w-full space-y-6">
        <form onSubmit={handleSubmit} className="card space-y-5">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-gray-300">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setEmailStatus('idle');
                setEmailMessage('');
              }}
              onBlur={checkEmailAvailability}
              className={`input-field ${
                emailStatus === 'available'
                  ? 'border-green-500/60 focus:border-green-400'
                  : emailStatus === 'taken' || emailStatus === 'error'
                  ? 'border-red-500/60 focus:border-red-400'
                  : ''
              }`}
              placeholder="you@example.com"
              autoComplete="email"
            />
            {emailStatus !== 'idle' && (
              <p
                className={`mt-1 text-xs ${
                  emailStatus === 'available'
                    ? 'text-green-400'
                    : emailStatus === 'checking'
                    ? 'text-gray-400'
                    : 'text-red-400'
                }`}
              >
                {emailStatus === 'checking' ? 'Checking email…' : emailMessage}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="username" className="mb-1.5 block text-sm font-medium text-gray-300">
              Username
            </label>
            <input
              id="username"
              type="text"
              required
              minLength={3}
              maxLength={30}
              value={username}
              onChange={(e) => {
                setUsername(e.target.value.replace(/\s+/g, ''));
                setUsernameStatus('idle');
                setUsernameMessage('');
              }}
              onBlur={checkUsernameAvailability}
              className={`input-field ${
                usernameStatus === 'available'
                  ? 'border-green-500/60 focus:border-green-400'
                  : usernameStatus === 'taken' || usernameStatus === 'error'
                  ? 'border-red-500/60 focus:border-red-400'
                  : ''
              }`}
              placeholder="yourname"
              autoComplete="username"
            />
            {usernameStatus !== 'idle' && (
              <p
                className={`mt-1 text-xs ${
                  usernameStatus === 'available'
                    ? 'text-green-400'
                    : usernameStatus === 'checking'
                    ? 'text-gray-400'
                    : 'text-red-400'
                }`}
              >
                {usernameStatus === 'checking' ? 'Checking username…' : usernameMessage}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-gray-300">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field pr-12"
                placeholder="Minimum 8 characters"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-sm"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="confirmPassword" className="mb-1.5 block text-sm font-medium text-gray-300">
              Confirm Password
            </label>
            <div className="relative">
              <input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={`input-field pr-12 ${confirmPassword && confirmPassword !== password ? 'border-red-500/60 focus:border-red-400' : ''}`}
                placeholder="Repeat your password"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-sm"
              >
                {showConfirmPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {confirmPassword && confirmPassword !== password && (
              <p className="mt-1 text-xs text-red-400">Passwords do not match</p>
            )}
          </div>
          <button
            type="submit"
            disabled={
              loading ||
              usernameStatus === 'checking' ||
              usernameStatus === 'taken' ||
              emailStatus === 'checking' ||
              emailStatus === 'taken' ||
              (!!confirmPassword && confirmPassword !== password)
            }
            className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>
        <div className="card">
          <SocialAuthButtons mode="signup" />
        </div>
        <div className="rounded-2xl border border-cyan-400/25 bg-cyan-500/[0.08] px-4 py-3.5">
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm leading-5 text-cyan-100">
            <span>Planning to run competitions for a club?</span>
            <Link to="/register-club" className="font-semibold text-cyan-200 underline decoration-cyan-300/60 underline-offset-2 hover:text-white">
              Create your club
            </Link>
          </p>
        </div>

        <p className="text-center text-sm text-gray-400">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand-400 hover:text-brand-300">
            Sign in
          </Link>
        </p>
        </div>
      </div>
    </div>
  );
}

function SignupMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.045] px-3 py-2.5 text-center backdrop-blur-sm">
      <div className="text-lg font-black text-white">{value}</div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">{label}</div>
    </div>
  );
}
