import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api';
import toast from 'react-hot-toast';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { useNavigate } from 'react-router-dom';

export default function ProfilePage() {
  const { user, loginWithData, logout } = useAuth();
  const navigate = useNavigate();
  const [optIn, setOptIn] = useState(user?.emailResultsOptIn ?? false);
  const [saving, setSaving] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteToken, setDeleteToken] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [deleteSectionOpen, setDeleteSectionOpen] = useState(false);
  const { isSupported, permission, isSubscribed, subscribe, unsubscribe, notify } = usePushNotifications();

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

  const handleDeleteAccount = async () => {
    if (deleteConfirmText.trim().toUpperCase() !== 'DELETE ACCOUNT') {
      toast.error('Please type DELETE ACCOUNT to confirm.');
      return;
    }
    if (!deleteToken) {
      toast.error('Please verify your password first.');
      return;
    }
    setShowDeleteConfirmModal(true);
  };

  const handleVerifyDeletePassword = async () => {
    if (!deletePassword.trim()) {
      toast.error('Enter your password to continue.');
      return;
    }
    try {
      const { data } = await api.post('/auth/delete-token', { password: deletePassword });
      setDeleteToken(data.deleteToken);
      toast.success('Password verified. You can now confirm account deletion.');
    } catch (err: any) {
      setDeleteToken(null);
      toast.error(err?.response?.data?.message || 'Password verification failed.');
    }
  };

  const confirmDeleteAccount = async () => {
    setDeleting(true);
    try {
      await api.delete('/auth/me', {
        data: {
          deleteToken,
          confirmText: deleteConfirmText,
        },
      });
      logout();
      toast.success('Account deleted.');
      navigate('/login');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not delete account.');
    } finally {
      setShowDeleteConfirmModal(false);
      setDeleting(false);
    }
  };

  const initials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : '??';

  const roleBadge: Record<string, { label: string; cls: string }> = {
    ADMIN:      { label: 'Admin',      cls: 'badge-red' },
    CLUB_ADMIN: { label: 'Club Admin', cls: 'badge-purple' },
    USER:       { label: 'Member',     cls: 'badge-brand' },
  };
  const badge = roleBadge[user?.role ?? 'USER'] ?? roleBadge.USER;

  const handleBrowserAlertsToggle = async () => {
    try {
      if (isSubscribed) {
        await unsubscribe();
        toast.success('Browser alerts turned off');
        return;
      }

      const ok = await subscribe();
      if (!ok) {
        toast.error(permission === 'denied' ? 'Browser notifications are blocked for this site.' : 'Could not enable browser alerts.');
        return;
      }

      notify('Last Man Standing alerts enabled', 'You will receive reminder alerts here when they are available.', '/competitions');
      toast.success('Browser alerts enabled');
    } catch {
      toast.error('Could not update browser alerts.');
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">

      {/* ── Header card ─────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-[1.9rem] border border-white/8 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.22),transparent_24rem),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(8,15,30,0.94))] p-8 shadow-[0_30px_75px_rgba(2,6,23,0.48)]">
        {/* decorative blob */}
        <div className="pointer-events-none absolute -top-10 -right-10 h-48 w-48 rounded-full bg-brand-500/10 blur-3xl" />

        <div className="mb-5 inline-flex rounded-full border border-brand-400/25 bg-brand-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-200">
          Account centre
        </div>

        <div className="flex items-center gap-5">
          {/* Avatar */}
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-brand-300/25 bg-gradient-to-br from-brand-500 to-cyan-400 text-2xl font-black text-slate-950 shadow-[0_10px_28px_rgba(56,189,248,0.18)]">
            {initials}
          </div>

          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-white truncate">{user?.username}</h1>
            <p className="text-sm text-gray-400 truncate">{user?.email}</p>
            <span className={`mt-2 inline-block ${badge.cls}`}>
              {badge.label}
            </span>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-3">
          <ProfileMetric label="Role" value={badge.label} />
          <ProfileMetric label="Email" value={optIn ? 'On' : 'Off'} />
          <ProfileMetric label="Alerts" value={isSubscribed ? 'On' : 'Off'} />
        </div>
      </div>

      {/* ── Notification preferences ────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.035] divide-y divide-white/8 shadow-[0_20px_50px_rgba(2,6,23,0.34)]">
        {/* Section header */}
        <div className="px-6 py-4">
          <h2 className="text-base font-semibold text-white">Notifications</h2>
          <p className="text-xs text-gray-500 mt-0.5">Turn on reminders before picks lock and updates after results are processed.</p>
        </div>

        {/* Email results toggle row */}
        <div className="flex items-center justify-between gap-4 px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-700 text-lg">
              📧
            </div>
            <div>
              <p className="text-sm font-medium text-gray-100">Email reminders and result updates</p>
              <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                Get pick reminders before a gameweek locks and email updates after results are processed.
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

        {/* Browser alerts row */}
        <div className="flex items-center justify-between gap-4 px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-700 text-lg">
              🔔
            </div>
            <div>
              <p className="text-sm font-medium text-gray-100">Browser alerts</p>
              <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                Get on-device alerts when browser notifications are supported and enabled for this site.
              </p>
              <p className={`mt-1.5 text-xs font-medium ${isSubscribed ? 'text-green-400' : 'text-gray-500'}`}>
                {isSubscribed ? '● Enabled on this device' : permission === 'denied' ? '○ Blocked by browser settings' : '○ Disabled on this device'}
              </p>
              {!isSupported && (
                <p className="mt-1 text-xs text-yellow-400/80">This browser does not support notifications.</p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {isSubscribed && (
              <button
                type="button"
                onClick={() => notify('Reminder preview', 'This is how your Last Man Standing browser alerts will appear.', '/competitions')}
                className="hidden rounded-lg border border-gray-600/50 bg-surface-700 px-3 py-2 text-xs text-gray-300 transition hover:bg-surface-600 sm:inline-flex"
              >
                Test
              </button>
            )}

            <button
              onClick={handleBrowserAlertsToggle}
              disabled={!isSupported}
              role="switch"
              aria-checked={isSubscribed}
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent
                transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2
                focus:ring-offset-surface-800
                ${isSubscribed ? 'bg-brand-500' : 'bg-gray-600'}
                ${!isSupported ? 'cursor-not-allowed opacity-40' : ''}`}
            >
              <span
                className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md
                  transition duration-200 ease-in-out
                  ${isSubscribed ? 'translate-x-5' : 'translate-x-0'}`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* ── Danger zone ────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-red-500/30 bg-red-500/[0.06] shadow-[0_20px_50px_rgba(2,6,23,0.34)]">
        <button
          type="button"
          onClick={() => setDeleteSectionOpen((v) => !v)}
          className="flex w-full items-center justify-between border-b border-red-500/20 px-6 py-4 text-left"
          aria-expanded={deleteSectionOpen}
          aria-controls="delete-account-panel"
        >
          <div>
            <h2 className="text-base font-semibold text-red-200">Delete Account</h2>
            <p className="mt-0.5 text-xs text-red-200/70">
              Permanently close your account and remove login access.
            </p>
          </div>
          <span className="text-xs font-medium text-red-200">{deleteSectionOpen ? 'Hide' : 'Show'}</span>
        </button>
        {deleteSectionOpen && (
        <div id="delete-account-panel" className="space-y-4 px-6 py-5">
          <ul className="space-y-1 text-xs text-red-100/85">
            <li>You will lose login access immediately.</li>
            <li>Your profile details will be anonymised.</li>
            <li>Historical competition records remain for integrity.</li>
          </ul>
          <div>
            <label className="mb-1 block text-xs font-medium text-red-100">Password</label>
            <div className="flex gap-2">
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => {
                  setDeletePassword(e.target.value);
                  setDeleteToken(null);
                }}
                placeholder="Enter your password"
                className="w-full rounded-lg border border-white/15 bg-surface-800 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-red-400/50 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleVerifyDeletePassword}
                className="shrink-0 rounded-lg border border-white/15 bg-surface-700 px-3 py-2 text-xs text-gray-200 hover:bg-surface-600"
              >
                Verify
              </button>
            </div>
            <p className={`mt-1 text-xs ${deleteToken ? 'text-green-400' : 'text-gray-500'}`}>
              {deleteToken ? 'Password verified for 5 minutes.' : 'Verify password before final delete.'}
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-red-100">Type DELETE ACCOUNT to confirm</label>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE ACCOUNT"
              className="w-full rounded-lg border border-white/15 bg-surface-800 px-3 py-2 text-sm uppercase tracking-[0.06em] text-white placeholder:text-gray-500 focus:border-red-400/50 focus:outline-none"
            />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-red-300">This action cannot be undone.</p>
          <button
            type="button"
            onClick={handleDeleteAccount}
            disabled={deleting}
            className="inline-flex rounded-lg border border-red-400/40 bg-red-500/15 px-4 py-2 text-sm font-medium text-red-100 transition hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleting ? 'Deleting account…' : 'Delete Account Permanently'}
          </button>
        </div>
        )}
      </div>

      {showDeleteConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-surface-900 p-5 shadow-2xl">
            <h3 className="text-lg font-semibold text-white">Confirm account deletion</h3>
            <p className="mt-2 text-sm text-gray-300">
              This permanently closes your account and immediately signs you out.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirmModal(false)}
                disabled={deleting}
                className="rounded-lg border border-white/15 px-3 py-2 text-sm text-gray-300 hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteAccount}
                disabled={deleting}
                className="rounded-lg border border-red-400/40 bg-red-500/20 px-3 py-2 text-sm font-medium text-red-100 hover:bg-red-500/30 disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Yes, delete account'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function ProfileMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.045] px-3 py-2.5 text-center backdrop-blur-sm">
      <div className="text-sm font-black text-white sm:text-base">{value}</div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">{label}</div>
    </div>
  );
}
