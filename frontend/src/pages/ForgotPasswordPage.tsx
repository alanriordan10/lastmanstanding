import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import toast from 'react-hot-toast';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSubmitted(true);
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-900 px-4">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-2xl bg-green-500/20 text-3xl">
            📧
          </div>
          <h1 className="text-2xl font-bold text-white">Check your email</h1>
          <p className="text-gray-400 text-sm leading-relaxed">
            If an account exists for <span className="text-white font-medium">{email}</span>, we've
            sent a password reset link. It expires in 1 hour.
          </p>
          <p className="text-xs text-gray-500">
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
            ← Back to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-900 px-4">
      <div className="w-full max-w-md space-y-8">

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-2xl bg-brand-600 text-2xl font-bold text-white shadow-lg">
            LMS
          </div>
          <h1 className="text-2xl font-bold text-white">Forgot your password?</h1>
          <p className="text-sm text-gray-400">
            Enter your email and we'll send you a reset link.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
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
            Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}
