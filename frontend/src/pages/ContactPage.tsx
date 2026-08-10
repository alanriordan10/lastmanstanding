import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { useState } from 'react';
import api from '../api';
import SeoMeta from '../components/SeoMeta';

const SUPPORT_EMAIL = 'support@runlastmanstanding.com';

function buildMailto(subject: string, body: string) {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function buildGmailCompose(subject: string, body: string) {
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(SUPPORT_EMAIL)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export default function ContactPage() {
  const { user } = useAuth();
  const username = user?.username ?? 'Guest';
  const email = user?.email ?? 'unknown';
  const role = user?.role ?? 'USER';
  const [issueType, setIssueType] = useState<'BUG' | 'PAYMENT' | 'ACCOUNT' | 'OTHER'>('BUG');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [competitionName, setCompetitionName] = useState('');
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const bugSubject = '[Support] Bug report';
  const bugBody = `Hi support team,

I found an issue in Last Man Standing.

User: ${username}
Email: ${email}
Role: ${role}
Page URL:
What happened:
What I expected:
Steps to reproduce:
Screenshot/video links:
`;

  const paymentSubject = '[Support] Payment issue';
  const paymentBody = `Hi support team,

I need help with a payment issue.

User: ${username}
Email: ${email}
Role: ${role}
Competition name:
Payment mode (Free/Manual):
What happened:
Any reference IDs or organiser receipt details:
`;

  const copyText = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Could not copy ${label.toLowerCase()}`);
    }
  };

  const submitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error('Sign in to submit an in-app support request, or use the support email below.');
      return;
    }
    if (!subject.trim() || !message.trim()) {
      toast.error('Subject and message are required');
      return;
    }
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('issueType', issueType);
      formData.append('subject', subject.trim());
      formData.append('message', message.trim());
      if (competitionName.trim()) formData.append('competitionName', competitionName.trim());
      formData.append('pageUrl', window.location.href);
      if (screenshotFile) formData.append('screenshot', screenshotFile);

      await api.post('/support/tickets', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Support request submitted');
      setSubject('');
      setMessage('');
      setCompetitionName('');
      setScreenshotFile(null);
      setIssueType('BUG');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Could not submit support request');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <SeoMeta
        title="Contact Support | Last Man Standing"
        description="Get help with competition setup, payments, account issues, and bug reports for Last Man Standing."
        canonicalPath="/contact"
      />
      <section className="relative overflow-hidden rounded-[1.85rem] border border-white/8 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.18),transparent_24rem),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(8,15,30,0.94))] px-5 py-6 shadow-[0_30px_75px_rgba(2,6,23,0.48)] sm:px-6">
        <div className="inline-flex rounded-full border border-brand-400/25 bg-brand-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-200">
          Support
        </div>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">Contact Us</h1>
        <p className="mt-2 text-sm text-gray-300">
          Need help with payments, joining competitions, or account issues? Contact support and include the key details below.
        </p>
      </section>

      <section className="card space-y-4">
        <form onSubmit={submitTicket} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-gray-200">Send from app</h2>
          {!user ? <p className="rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">Sign in to submit an in-app ticket, or email support directly using the details below.</p> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-gray-400">Issue type</label>
              <select value={issueType} onChange={(e) => setIssueType(e.target.value as any)} className="input-field text-sm">
                <option value="BUG">Bug</option>
                <option value="PAYMENT">Payment</option>
                <option value="ACCOUNT">Account</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-400">Competition (optional)</label>
              <input value={competitionName} onChange={(e) => setCompetitionName(e.target.value)} className="input-field text-sm" placeholder="Competition name" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-400">Subject</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className="input-field text-sm" placeholder="Short summary" maxLength={180} required />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-400">Message</label>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} className="input-field text-sm min-h-[120px]" placeholder="Describe what happened and what you expected" maxLength={5000} required />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-400">Screenshot (optional, image up to 5MB)</label>
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-gray-300 transition hover:border-white/20 hover:bg-white/[0.08]">
              <span className="truncate">{screenshotFile ? screenshotFile.name : 'Choose screenshot file...'}</span>
              <span className="shrink-0 rounded-lg border border-white/10 bg-surface-700 px-2.5 py-1 text-xs text-gray-200">Choose file</span>
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  if (file && file.size > 5 * 1024 * 1024) {
                    toast.error('Screenshot must be 5MB or less');
                    e.currentTarget.value = '';
                    setScreenshotFile(null);
                    return;
                  }
                  setScreenshotFile(file);
                }}
              />
            </label>
            {screenshotFile && (
              <div className="mt-1 flex items-center justify-between">
                <p className="text-xs text-gray-400">Attached: {screenshotFile.name}</p>
                <button
                  type="button"
                  onClick={() => setScreenshotFile(null)}
                  className="text-xs text-gray-400 underline hover:text-gray-200"
                >
                  Remove
                </button>
              </div>
            )}
          </div>
          <button type="submit" disabled={submitting} className="btn-primary w-full sm:w-auto">
            {submitting ? 'Sending…' : 'Send support request'}
          </button>
        </form>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <p className="text-xs uppercase tracking-[0.14em] text-gray-400">Support email</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <a href={`mailto:${SUPPORT_EMAIL}`} className="inline-block text-base font-semibold text-brand-300 hover:text-brand-200">
              {SUPPORT_EMAIL}
            </a>
            <button
              type="button"
              onClick={() => copyText('Support email', SUPPORT_EMAIL)}
              className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-gray-300 hover:bg-white/[0.08]"
            >
              Copy
            </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-gray-200">
            <p className="font-semibold">Report a bug</p>
            <p className="mt-1 text-xs text-gray-400">Prefills a support email with useful debugging fields.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={buildMailto(bugSubject, bugBody)}
                className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-gray-200 hover:bg-white/[0.08]"
              >
                Open email app
              </a>
              <a
                href={buildGmailCompose(bugSubject, bugBody)}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-gray-200 hover:bg-white/[0.08]"
              >
                Open Gmail
              </a>
              <button
                type="button"
                onClick={() => copyText('Bug template', bugBody)}
                className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-gray-200 hover:bg-white/[0.08]"
              >
                Copy template
              </button>
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-gray-200">
            <p className="font-semibold">Payment support</p>
            <p className="mt-1 text-xs text-gray-400">Use for manual payment confirmation issues.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={buildMailto(paymentSubject, paymentBody)}
                className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-gray-200 hover:bg-white/[0.08]"
              >
                Open email app
              </a>
              <a
                href={buildGmailCompose(paymentSubject, paymentBody)}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-gray-200 hover:bg-white/[0.08]"
              >
                Open Gmail
              </a>
              <button
                type="button"
                onClick={() => copyText('Payment template', paymentBody)}
                className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-gray-200 hover:bg-white/[0.08]"
              >
                Copy template
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
          Include competition name, screenshot, and exact time of issue for faster support.
        </div>
      </section>
    </div>
  );
}
