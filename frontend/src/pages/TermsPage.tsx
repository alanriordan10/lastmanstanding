import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import SeoMeta from '../components/SeoMeta';

const UPDATED_AT = '9 June 2026';

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 text-gray-200">
      <SeoMeta
        title="Terms of Service | Last Man Standing"
        description="Terms of service for the Last Man Standing football survivor competition app."
        canonicalPath="/terms"
      />

      <section className="relative overflow-hidden rounded-[1.85rem] border border-white/8 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.18),transparent_24rem),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(8,15,30,0.94))] px-5 py-6 shadow-[0_30px_75px_rgba(2,6,23,0.48)] sm:px-6">
        <div className="inline-flex rounded-full border border-brand-400/25 bg-brand-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-200">
          Legal
        </div>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">Terms of Service</h1>
        <p className="mt-2 text-sm text-gray-300">Last updated: {UPDATED_AT}</p>
      </section>

      <section className="card space-y-5 text-sm leading-6 text-gray-300">
        <p>
          These terms apply when you use Last Man Standing to create, join, or manage football survivor competitions.
        </p>

        <TermsSection title="Competition Rules">
          <p>Each competition may have its own settings, including entry fee, payment mode, maximum entries, lifeline availability, missed-pick rules, fixture source, and visibility.</p>
          <p>Participants are responsible for making valid picks before the gameweek lock. Once a gameweek is locked, picks may be restricted or revealed according to competition rules.</p>
        </TermsSection>

        <TermsSection title="Club Admins">
          <p>Club admins are responsible for configuring competitions accurately, managing entries, confirming manual payments, and communicating local rules to participants.</p>
        </TermsSection>

        <TermsSection title="Payments and Prizes">
          <p>Stripe may be used for online card payments. Manual payments are managed by the club admin. Prize pools and payouts are the responsibility of the relevant club or competition organizer.</p>
        </TermsSection>

        <TermsSection title="Acceptable Use">
          <p>Do not misuse the service, attempt to access another user&apos;s account, manipulate competitions, submit misleading payment information, or interfere with app availability.</p>
        </TermsSection>

        <TermsSection title="Service Availability">
          <p>We aim to keep the service available, but football data providers, payment providers, hosting services, and mobile platforms can affect availability and timing.</p>
        </TermsSection>

        <TermsSection title="Contact">
          <p>
            For support or questions, use the <Link to="/contact" className="text-brand-200 hover:text-brand-100">Contact page</Link>.
          </p>
        </TermsSection>
      </section>
    </div>
  );
}

function TermsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.035] p-4">
      <h2 className="text-base font-bold text-white">{title}</h2>
      <div className="mt-2 space-y-2">{children}</div>
    </div>
  );
}
