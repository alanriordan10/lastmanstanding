import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import SeoMeta from '../components/SeoMeta';

const UPDATED_AT = '9 June 2026';
const SUPPORT_EMAIL = 'support@lastmanstanding.com';

export default function AccountDeletionPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 text-gray-200">
      <SeoMeta
        title="Delete Account | Last Man Standing"
        description="How to request deletion of your Last Man Standing account and associated data."
        canonicalPath="/account-deletion"
      />

      <section className="relative overflow-hidden rounded-[1.85rem] border border-white/8 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.18),transparent_24rem),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(8,15,30,0.94))] px-5 py-6 shadow-[0_30px_75px_rgba(2,6,23,0.48)] sm:px-6">
        <div className="inline-flex rounded-full border border-brand-400/25 bg-brand-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-200">
          Account data
        </div>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">Delete Your Last Man Standing Account</h1>
        <p className="mt-2 text-sm text-gray-300">Last updated: {UPDATED_AT}</p>
      </section>

      <section className="card space-y-5 text-sm leading-6 text-gray-300">
        <p>
          This page explains how users of the Last Man Standing app can request deletion of their account and associated data.
        </p>

        <InfoSection title="How to request account deletion">
          <ol className="list-decimal space-y-2 pl-5">
            <li>Open the Last Man Standing app or website and sign in.</li>
            <li>Go to <span className="font-semibold text-white">Profile</span>.</li>
            <li>Open <span className="font-semibold text-white">Delete Account</span> in the danger zone.</li>
            <li>Confirm the deletion request.</li>
          </ol>
          <p className="mt-3">
            If you cannot sign in, contact support at <a href={`mailto:${SUPPORT_EMAIL}`} className="text-brand-200 hover:text-brand-100">{SUPPORT_EMAIL}</a> or use the <Link to="/contact" className="text-brand-200 hover:text-brand-100">Contact page</Link>. Include the email address or username linked to your account.
          </p>
        </InfoSection>

        <InfoSection title="Data deleted">
          <p>When an account deletion request is completed, we delete or anonymise personal account data where possible, including:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Account profile details such as username, email address, avatar, and authentication data.</li>
            <li>Notification tokens and device notification preferences.</li>
            <li>Personal support request details where they are no longer required.</li>
          </ul>
        </InfoSection>

        <InfoSection title="Data that may be kept">
          <p>Some records may be retained where needed for competition integrity, payment records, fraud prevention, legal obligations, or audit history. This may include:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Competition entries, picks, gameweek results, survivor table history, and winner records.</li>
            <li>Payment references, payment status, Stripe identifiers, refunds, and accounting records.</li>
            <li>Club admin audit logs and security records.</li>
          </ul>
          <p className="mt-3">Where retained records are no longer required to identify you personally, we anonymise them where practical.</p>
        </InfoSection>

        <InfoSection title="Retention period">
          <p>
            Account deletion requests are normally processed promptly. Some retained payment, audit, legal, security, or competition integrity records may be kept for up to 7 years where required by law, accounting rules, dispute handling, or operational integrity.
          </p>
        </InfoSection>

        <InfoSection title="Partial data deletion requests">
          <p>
            You can request deletion of some data without deleting your whole account by contacting support at <a href={`mailto:${SUPPORT_EMAIL}`} className="text-brand-200 hover:text-brand-100">{SUPPORT_EMAIL}</a> or using the <Link to="/contact" className="text-brand-200 hover:text-brand-100">Contact page</Link>. For example, you can request removal of notification tokens, avatar/profile details, or support ticket attachments where deletion is legally and operationally possible.
          </p>
        </InfoSection>
      </section>
    </div>
  );
}

function InfoSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.035] p-4">
      <h2 className="text-base font-bold text-white">{title}</h2>
      <div className="mt-2 space-y-2">{children}</div>
    </div>
  );
}
