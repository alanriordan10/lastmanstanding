import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api';
import toast from 'react-hot-toast';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-900 px-4">
        <div className="text-center space-y-4">
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
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, newPassword: password });
      toast.success('Password updated! Please log in with your new password.');
      navigate('/login');
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Invalid or expired reset link. Please request a new one.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-900 px-4">
      <div className="w-full max-w-md space-y-8">

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-2xl bg-brand-600 text-2xl font-bold text-white shadow-lg">
            LMS
          </div>
          <h1 className="text-2xl font-bold text-white">Set a new password</h1>
          <p className="text-sm text-gray-400">Must be at least 8 characters.</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
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
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Confirm new password
            </label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              placeholder="••••••••"
              className="input-field"
            />
            {confirm && password !== confirm && (
              <p className="mt-1.5 text-xs text-red-400">Passwords do not match</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || password !== confirm || password.length < 8}
            className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Updating…' : 'Update password'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-400">
          <Link to="/login" className="text-brand-400 hover:text-brand-300 font-medium transition-colors">
            ← Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}
