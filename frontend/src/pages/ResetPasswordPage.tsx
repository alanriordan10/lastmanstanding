import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { postPublicAuth } from '../api';
import toast from 'react-hot-toast';
import SeoMeta from '../components/SeoMeta';
import { PasswordStrengthMeter, isPasswordStrongEnough, validatePasswordStrength } from '../components/PasswordStrengthMeter';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const params = useParams<{ token?: string }>();
  const navigate = useNavigate();
  const hashToken = (() => {
    const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
    if (!hash) return '';
    const parsed = new URLSearchParams(hash);
    return parsed.get('token') ?? '';
  })();
  const token = searchParams.get('token') ?? params.token ?? hashToken;
  const seoMeta = (
    <SeoMeta
      title="Reset Password | Last Man Standing"
      description="Set a new password for your Last Man Standing account using your secure reset link."
      canonicalPath="/reset-password"
      noindex
    />
  );

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.1),transparent_34rem),linear-gradient(180deg,#0a1220_0%,#09101d_100%)] px-4 py-10">
        {seoMeta}
        <div className="rounded-[1.9rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(248,113,113,0.1),transparent_24rem),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(8,15,30,0.94))] px-6 py-8 text-center shadow-[0_30px_75px_rgba(2,6,23,0.48)]">
          <p className="text-red-400 font-medium">Invalid or missing reset token.</p>
          <Link to="/forgot-password" className="text-brand-400 hover:text-brand-300 text-sm">
            Request a new reset link
          </Link>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error('Passwords do not match');
      return;
    }
    if (password.length < 8) {
       toast.error('Password must be at least 8 characters');
       return;
     }
     if (!await validatePasswordStrength(password, undefined, undefined, 2)) {
       toast.error('Please choose a stronger password.');
       return;
     }
    setLoading(true);
    try {
      await postPublicAuth('/auth/reset-password', { token, newPassword: password });
      toast.success('Password updated! Please log in with your new password.');
      navigate('/login');
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Invalid or expired reset link. Please request a new one.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.1),transparent_34rem),linear-gradient(180deg,#0a1220_0%,#09101d_100%)] px-4 py-10">
      {seoMeta}
      <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative overflow-hidden rounded-[1.9rem] border border-white/12 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.16),transparent_24rem),linear-gradient(135deg,rgba(17,27,46,0.94),rgba(10,17,32,0.9))] px-6 py-8 shadow-[0_18px_42px_rgba(2,6,23,0.34)]">
          <div className="inline-flex rounded-full border border-sky-300/35 bg-sky-400/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-100">
            Secure reset
          </div>
          <div className="mt-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-sky-300/35 bg-gradient-to-br from-sky-400 to-cyan-300 text-xl font-black text-slate-950 shadow-[0_8px_20px_rgba(56,189,248,0.2)]">
            LMS
          </div>
          <h1 className="mt-6 text-4xl font-black tracking-tight text-white">Set a new password</h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-gray-300 sm:text-[15px]">
            Choose a strong new password and get back into your account securely.
          </p>
        </section>
        <div className="w-full space-y-6">
        <form onSubmit={handleSubmit} className="card !border-white/12 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              New password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
                placeholder="••••••••"
                className="input-field pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 text-sm"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <PasswordStrengthMeter password={password} minScore={2} />
          </div>

           <div>
             <label className="block text-sm font-medium text-gray-300 mb-1.5">
               Confirm new password
             </label>
             <div className="relative">
               <input
                 type={showConfirmPassword ? 'text' : 'password'}
                 value={confirm}
                 onChange={(e) => setConfirm(e.target.value)}
                 required
                 placeholder="••••••••"
                 className="input-field pr-10"
               />
               <button
                 type="button"
                 onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                 className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 text-sm"
               >
                 {showConfirmPassword ? 'Hide' : 'Show'}
               </button>
             </div>
             {!confirm && password && (
               <p className="mt-1.5 text-xs text-amber-300">Please confirm your password</p>
             )}
             {confirm && password !== confirm && (
               <p className="mt-1.5 text-xs text-red-400">Passwords do not match</p>
             )}
           </div>

           <button
             type="submit"
             disabled={loading || password !== confirm || password.length < 8 || (!!password && !isPasswordStrongEnough(password, undefined, undefined, 2))}
             className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
           >
             {loading ? 'Updating…' : 'Update password'}
           </button>

           {password && password.length >= 8 && confirm && password === confirm && (!!password && !isPasswordStrongEnough(password, undefined, undefined, 2)) && (
             <p className="mt-2 text-xs text-amber-300">Password needs to be stronger. Try adding more variety (mix of uppercase, lowercase, numbers, and symbols).</p>
           )}
        </form>

        <p className="text-center text-sm text-gray-400">
          <Link to="/login" className="text-brand-400 hover:text-brand-300 font-medium transition-colors">
            ← Back to sign in
          </Link>
        </p>
        </div>
      </div>
    </div>
  );
}
