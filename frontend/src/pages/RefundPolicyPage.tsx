import { Link } from 'react-router-dom';
import SeoMeta from '../components/SeoMeta';

const UPDATED_AT = '27 July 2026';

export default function RefundPolicyPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 text-gray-200">
      <SeoMeta
        title="Refund Policy | Last Man Standing"
        description="Refund and cancellation policy for Last Man Standing platform access and competition payments."
        canonicalPath="/refund-policy"
      />

      <section className="relative overflow-hidden rounded-[1.85rem] border border-white/8 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.18),transparent_24rem),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(8,15,30,0.94))] px-5 py-6 shadow-[0_30px_75px_rgba(2,6,23,0.48)] sm:px-6">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-brand-200">Refunds and cancellations</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">Refund Policy</h1>
        <p className="mt-2 text-sm text-gray-300">Last updated: {UPDATED_AT}</p>
      </section>

      <section className="card space-y-4 text-sm leading-6 text-gray-300">
        <PolicySection title="Platform access">
          <p>Every club gets one free competition. After the free competition is used, each additional competition slot is currently priced at €29 and is purchased via Stripe Checkout.</p>
        </PolicySection>

        <PolicySection title="Competition entry/admin fees">
          <p>Competition entry/admin fees are configured by the club organiser. Refund decisions for organiser-configured competition payments are handled by the relevant club organiser unless otherwise required by law.</p>
          <p>For manually collected entry fees, refund requests should be sent to the organiser with the competition name, payment date, and account email.</p>
        </PolicySection>

        <PolicySection title="Competitions already started">
          <p>Once a competition or gameweek has started, refunds may be limited because entries, picks, standings, and results may already have been processed.</p>
        </PolicySection>

        <PolicySection title="Failed, duplicate, or incorrect payments">
          <p>For duplicate payments, failed confirmations, or incorrect charges, contact support as soon as possible. We will review payment references and work with the organiser or payment provider where appropriate.</p>
        </PolicySection>

        <PolicySection title="Contact for refunds">
          <p>
            Contact <a href="mailto:support@runlastmanstanding.com" className="text-brand-200 hover:text-brand-100">support@runlastmanstanding.com</a> or use the <Link to="/contact" className="text-brand-200 hover:text-brand-100">Contact page</Link>.
          </p>
        </PolicySection>
      </section>
    </div>
  );
}

function PolicySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.035] p-4">
      <h2 className="text-base font-bold text-white">{title}</h2>
      <div className="mt-2 space-y-2">{children}</div>
    </div>
  );
}
