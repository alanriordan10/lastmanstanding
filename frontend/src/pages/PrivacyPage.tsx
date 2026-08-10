import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import SeoMeta from '../components/SeoMeta';

const UPDATED_AT = '9 June 2026';

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 text-gray-200">
      <SeoMeta
        title="Privacy Policy | Last Man Standing"
        description="Privacy policy for the Last Man Standing football survivor competition app."
        canonicalPath="/privacy"
      />

      <section className="relative overflow-hidden rounded-[1.85rem] border border-white/8 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.18),transparent_24rem),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(8,15,30,0.94))] px-5 py-6 shadow-[0_30px_75px_rgba(2,6,23,0.48)] sm:px-6">
        <div className="inline-flex rounded-full border border-brand-400/25 bg-brand-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-200">
          Legal
        </div>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">Privacy Policy</h1>
        <p className="mt-2 text-sm text-gray-300">Last updated: {UPDATED_AT}</p>
      </section>

      <section className="card space-y-5 text-sm leading-6 text-gray-300">
        <p>
          Last Man Standing helps users create, join, and manage football survivor competitions. This policy explains what data we collect, why we collect it, and how users can contact us.
        </p>

        <PolicySection title="Information We Collect">
          <p>We collect account information such as username, email address, password authentication data, role, and optional profile details.</p>
          <p>We collect competition data such as club membership, competition entries, picks, lifeline usage, payment status, results, audit logs, and support requests.</p>
          <p>If enabled, we collect push notification tokens so reminders and result notifications can be sent to your device.</p>
        </PolicySection>

        <PolicySection title="Payments">
          <p>For manual payment tracking, we store payment status, entry scope, and related metadata required to help organisers confirm competition entry payment. Payment collection happens outside the app.</p>
        </PolicySection>

        <PolicySection title="How We Use Information">
          <p>We use information to authenticate users, run competitions, process entries, show results, send reminders, support club admins, prevent misuse, and investigate support requests.</p>
        </PolicySection>

        <PolicySection title="Sharing">
          <p>We share data only where needed to operate the service, including infrastructure providers, payment processors, email/push providers, and legal or security obligations.</p>
        </PolicySection>

        <PolicySection title="Retention">
          <p>We keep account, competition, payment, and audit information for as long as needed to operate competitions, support users, meet legal obligations, and preserve competition integrity.</p>
        </PolicySection>

        <PolicySection title="Your Choices">
          <p>You can update profile details, opt in or out of notifications where supported, and request account deletion from the profile page. Some records may be retained where required for payment, audit, legal, or competition integrity reasons.</p>
        </PolicySection>

        <PolicySection title="Contact">
          <p>
            For privacy questions, contact us through the <Link to="/contact" className="text-brand-200 hover:text-brand-100">Contact page</Link>.
          </p>
        </PolicySection>
      </section>
    </div>
  );
}

function PolicySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.035] p-4">
      <h2 className="text-base font-bold text-white">{title}</h2>
      <div className="mt-2 space-y-2">{children}</div>
    </div>
  );
}
