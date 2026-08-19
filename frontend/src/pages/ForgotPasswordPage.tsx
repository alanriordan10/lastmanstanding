import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getErrorMessage, postPublicAuth } from '../api';
import toast from 'react-hot-toast';
import SeoMeta from '../components/SeoMeta';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const seoMeta = (
    <SeoMeta
      title="Forgot Password | Last Man Standing"
      description="Request a secure password reset email for your Last Man Standing account."
      canonicalPath="/forgot-password"
      noindex
    />
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await postPublicAuth('/auth/forgot-password', { email });
      setSubmitted(true);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not send reset email. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.1),transparent_34rem),linear-gradient(180deg,#0a1220_0%,#09101d_100%)] px-4 py-10">
        {seoMeta}
        <div className="w-full max-w-lg rounded-[1.9rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.16),transparent_24rem),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(8,15,30,0.94))] px-6 py-8 text-center shadow-[0_30px_75px_rgba(2,6,23,0.48)]">
          <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-2xl border border-green-400/20 bg-green-500/15 text-3xl">
            📧
          </div>
          <h1 className="mt-6 text-3xl font-black tracking-tight text-white">Check your email</h1>
          <p className="mt-3 text-gray-300 text-sm leading-relaxed">
            If an account exists for <span className="text-white font-medium">{email}</span>, we've
            sent a password reset link. It expires in 1 hour.
          </p>
          <p className="mt-3 text-xs text-gray-500">
            Didn't receive it? Check your spam folder or{' '}
            <button
              onClick={() => setSubmitted(false)}
              className="text-brand-400 hover:text-brand-300 underline"
            >
              try again
            </button>
            .
          </p>
          <Link to="/login" className="block text-sm text-brand-400 hover:text-brand-300 transition-colors">
            ← Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.1),transparent_34rem),linear-gradient(180deg,#0a1220_0%,#09101d_100%)] px-4 py-10">
      {seoMeta}
      <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative overflow-hidden rounded-[1.9rem] border border-white/12 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.16),transparent_24rem),linear-gradient(135deg,rgba(17,27,46,0.94),rgba(10,17,32,0.9))] px-6 py-8 shadow-[0_18px_42px_rgba(2,6,23,0.34)]">
          <div className="inline-flex rounded-full border border-sky-300/35 bg-sky-400/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-100">
            Recovery
          </div>
          <div className="mt-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-sky-300/35 bg-gradient-to-br from-sky-400 to-cyan-300 text-xl font-black text-slate-950 shadow-[0_8px_20px_rgba(56,189,248,0.2)]">
            LMS
          </div>
          <h1 className="mt-6 text-4xl font-black tracking-tight text-white">Forgot password?</h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-gray-300 sm:text-[15px]">
            Enter your email and we will send a reset link so you can get back into your competitions quickly.
          </p>
        </section>
        <div className="w-full space-y-6">
        <form onSubmit={handleSubmit} className="card !border-white/12 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Email address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              placeholder="you@example.com"
              className="input-field"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full"
          >
            {loading ? 'Sending…' : 'Send reset link'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-400">
          Remembered it?{' '}
          <Link to="/login" className="text-brand-400 hover:text-brand-300 font-medium transition-colors">
            Back to sign in
          </Link>
        </p>
        </div>
      </div>
    </div>
  );
}
