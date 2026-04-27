import { useState } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function SignupPage() {
  const { signup, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/competitions" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signup(email, username, password);
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
          <div className="mt-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-brand-300/25 bg-gradient-to-br from-brand-500 to-cyan-400 text-xl font-black text-slate-950 shadow-[0_10px_28px_rgba(56,189,248,0.18)]">
            LMS
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
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
              placeholder="you@example.com"
              autoComplete="email"
            />
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
              onChange={(e) => setUsername(e.target.value)}
              className="input-field"
              placeholder="yourname"
              autoComplete="username"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-gray-300">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
              placeholder="Minimum 8 characters"
              autoComplete="new-password"
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

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
