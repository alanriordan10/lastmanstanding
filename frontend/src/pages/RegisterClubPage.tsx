import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import api from '../api';
import type { AuthResponse } from '../types';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

interface RegisterClubResponse {
  auth: { userId: number; email: string; username: string; role: string; accessToken: string; refreshToken: string };
  clubId: number;
  clubName: string;
}

export default function RegisterClubPage() {
  const navigate = useNavigate();
  const { loginWithData } = useAuth();

  const [clubName, setClubName] = useState('');
  const [clubDescription, setClubDescription] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);

  const mutation = useMutation({
    mutationFn: () => api.post<RegisterClubResponse>('/auth/register-club', {
      clubName,
      clubDescription: clubDescription || null,
      username,
      email,
      password,
    }),
    onSuccess: (response) => {
      const { auth, clubName: name } = response.data;
      loginWithData(auth);
      toast.success(`Welcome! "${name}" is ready. Start creating competitions.`, { duration: 5000 });
      navigate('/club-admin');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Registration failed. Please try again.');
    },
  });

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clubName.trim()) { toast.error('Club name is required'); return; }
    setStep(2);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) { toast.error('Passwords do not match'); return; }
    if (password.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    mutation.mutate();
  };

  return (
    <div className="min-h-screen bg-surface-900 flex flex-col">
      {/* Top bar */}
      <nav className="border-b border-gray-700/50 bg-surface-800/80 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold">LMS</div>
          <span className="text-lg font-bold hidden sm:block">Last Man Standing</span>
        </Link>
        <div className="text-sm text-gray-400">
          Already have an account?{' '}
          <Link to="/login" className="text-brand-400 hover:text-brand-300 font-medium">Sign in</Link>
        </div>
      </nav>

      <div className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-lg">

          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-600/20 border border-brand-500/30 text-3xl mb-4">
              🏠
            </div>
            <h1 className="text-3xl font-bold text-white">Register Your Club</h1>
            <p className="text-gray-400 mt-2">
              Set up your club in minutes and start running Last Man Standing competitions.
            </p>
          </div>

          {/* Step indicator */}
          <div className="flex items-center justify-center gap-3 mb-8">
            {[1, 2].map((s) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                  step === s
                    ? 'bg-brand-600 text-white scale-110'
                    : s < step
                    ? 'bg-green-600 text-white'
                    : 'bg-surface-700 text-gray-500'
                }`}>
                  {s < step ? '✓' : s}
                </div>
                <span className={`text-sm hidden sm:block ${step === s ? 'text-white font-medium' : 'text-gray-500'}`}>
                  {s === 1 ? 'Club Details' : 'Your Account'}
                </span>
                {s < 2 && <div className="w-8 h-px bg-gray-700 mx-1" />}
              </div>
            ))}
          </div>

          {/* Step 1: Club Details */}
          {step === 1 && (
            <form onSubmit={handleNext} className="card space-y-5">
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
                  placeholder="A short description of your club or competition rules…"
                  rows={3}
                  maxLength={300}
                />
              </div>

              {/* What you get */}
              <div className="rounded-xl bg-brand-600/10 border border-brand-500/20 p-4 space-y-2">
                <p className="text-sm font-semibold text-brand-400">What you get as a Club Admin:</p>
                <ul className="space-y-1.5">
                  {[
                    'Create unlimited Last Man Standing competitions',
                    'Set entry fees, rules and missed pick behaviour',
                    'Manage participants — remove or declare winners',
                    'View full survivor tables and results history',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-gray-300">
                      <span className="text-green-400 shrink-0 mt-0.5">✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <button type="submit" className="btn-primary w-full">
                Continue →
              </button>
            </form>
          )}

          {/* Step 2: Account Details */}
          {step === 2 && (
            <form onSubmit={handleSubmit} className="card space-y-5">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-gray-400 hover:text-white transition-colors text-sm"
                >
                  ← Back
                </button>
                <div>
                  <h2 className="text-lg font-semibold text-gray-100">Create your account</h2>
                  <p className="text-sm text-gray-400">
                    This will be the admin account for <span className="text-white font-medium">"{clubName}"</span>
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">
                    Username <span className="text-red-400">*</span>
                  </label>
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="input-field"
                    placeholder="yourname"
                    required
                    minLength={3}
                    maxLength={30}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">
                    Email <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input-field"
                    placeholder="you@example.com"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Password <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-field pr-12"
                    placeholder="Min. 6 characters"
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-sm"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Confirm Password <span className="text-red-400">*</span>
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`input-field ${confirmPassword && confirmPassword !== password ? 'border-red-500' : ''}`}
                  placeholder="Repeat your password"
                  required
                />
                {confirmPassword && confirmPassword !== password && (
                  <p className="text-xs text-red-400 mt-1">Passwords do not match</p>
                )}
              </div>

              <button
                type="submit"
                disabled={mutation.isPending || (!!confirmPassword && confirmPassword !== password)}
                className="btn-primary w-full disabled:opacity-50"
              >
                {mutation.isPending ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    Creating your club…
                  </span>
                ) : (
                  '🏠 Create Club & Account'
                )}
              </button>

              <p className="text-xs text-center text-gray-500">
                By registering you agree to our terms of service. Your account will have Club Admin access immediately.
              </p>
            </form>
          )}

          <p className="text-center text-sm text-gray-500 mt-6">
            Just want to play?{' '}
            <Link to="/signup" className="text-brand-400 hover:text-brand-300">Sign up as a player →</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
