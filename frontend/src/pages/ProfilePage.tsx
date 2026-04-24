import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api';
import toast from 'react-hot-toast';

export default function ProfilePage() {
  const { user, loginWithData } = useAuth();
  const [optIn, setOptIn] = useState(user?.emailResultsOptIn ?? false);
  const [saving, setSaving] = useState(false);

  const handleToggle = async () => {
    const newValue = !optIn;
    setSaving(true);
    try {
      await api.put('/auth/email-preferences', { emailResultsOptIn: newValue });
      setOptIn(newValue);
      if (user) loginWithData({ ...user, emailResultsOptIn: newValue });
      toast.success(newValue ? 'Result emails enabled' : 'Result emails turned off');
    } catch {
      toast.error('Failed to update preference. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const initials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : '??';

  const roleBadge: Record<string, { label: string; cls: string }> = {
    ADMIN:      { label: 'Admin',      cls: 'bg-red-500/20 text-red-400 border border-red-500/30' },
    CLUB_ADMIN: { label: 'Club Admin', cls: 'bg-purple-500/20 text-purple-400 border border-purple-500/30' },
    USER:       { label: 'Member',     cls: 'bg-brand-500/20 text-brand-400 border border-brand-500/30' },
  };
  const badge = roleBadge[user?.role ?? 'USER'] ?? roleBadge.USER;

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">

      {/* ── Header card ─────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600/30 via-surface-800 to-surface-800 border border-gray-700/60 p-8">
        {/* decorative blob */}
        <div className="pointer-events-none absolute -top-10 -right-10 h-48 w-48 rounded-full bg-brand-500/10 blur-3xl" />

        <div className="flex items-center gap-5">
          {/* Avatar */}
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-2xl font-bold text-white shadow-lg">
            {initials}
          </div>

          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-white truncate">{user?.username}</h1>
            <p className="text-sm text-gray-400 truncate">{user?.email}</p>
            <span className={`mt-2 inline-block rounded-full px-3 py-0.5 text-xs font-semibold ${badge.cls}`}>
              {badge.label}
            </span>
          </div>
        </div>
      </div>

      {/* ── Notification preferences ────────────────────────── */}
      <div className="rounded-2xl bg-surface-800 border border-gray-700/60 divide-y divide-gray-700/50">
        {/* Section header */}
        <div className="px-6 py-4">
          <h2 className="text-base font-semibold text-white">Notifications</h2>
          <p className="text-xs text-gray-500 mt-0.5">Choose how you want to be kept up to date</p>
        </div>

        {/* Email results toggle row */}
        <div className="flex items-center justify-between gap-4 px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-700 text-lg">
              📧
            </div>
            <div>
              <p className="text-sm font-medium text-gray-100">Gameweek result emails</p>
              <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                Get an email after each gameweek with your pick outcome and competition standing.
              </p>
              <p className={`mt-1.5 text-xs font-medium ${optIn ? 'text-green-400' : 'text-gray-500'}`}>
                {optIn ? '● Enabled' : '○ Disabled'}
              </p>
            </div>
          </div>

          {/* Toggle */}
          <button
            onClick={handleToggle}
            disabled={saving}
            role="switch"
            aria-checked={optIn}
            className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent
              transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2
              focus:ring-offset-surface-800
              ${optIn ? 'bg-brand-500' : 'bg-gray-600'}
              ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <span
              className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md
                transition duration-200 ease-in-out
                ${optIn ? 'translate-x-5' : 'translate-x-0'}`}
            />
          </button>
        </div>
      </div>

    </div>
  );
}
