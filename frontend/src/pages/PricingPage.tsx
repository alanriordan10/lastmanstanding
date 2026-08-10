import { Link } from 'react-router-dom';
import SeoMeta from '../components/SeoMeta';

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 text-gray-200">
      <SeoMeta
        title="Pricing | Last Man Standing"
        description="Pricing and payment information for Last Man Standing competition management software."
        canonicalPath="/pricing"
      />

      <section className="relative overflow-hidden rounded-[1.85rem] border border-white/8 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.18),transparent_24rem),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(8,15,30,0.94))] px-5 py-6 shadow-[0_30px_75px_rgba(2,6,23,0.48)] sm:px-6">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-brand-200">Pricing</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">Platform Pricing</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-300">
          Platform access is currently free. If paid platform plans are introduced in future, pricing will be shown before purchase.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <article className="card border-brand-400/25 bg-brand-500/10">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-brand-200">Current platform access</p>
          <h2 className="mt-2 text-3xl font-black text-white">Free</h2>
          <p className="mt-2 text-sm leading-6 text-gray-300">Create a club, configure competitions, invite participants, manage picks, and view standings without a platform subscription fee.</p>
        </article>
        <article className="card">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-gray-400">Competition payments</p>
          <h2 className="mt-2 text-2xl font-black text-white">Configured by organiser</h2>
          <p className="mt-2 text-sm leading-6 text-gray-300">Club organisers may configure free competitions or manual/offline payment tracking.</p>
        </article>
      </section>

      <section className="card space-y-3 text-sm leading-6 text-gray-300">
        <h2 className="text-xl font-black text-white">Payment modes</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/8 bg-white/[0.035] p-4"><strong className="text-white">Free</strong><p className="mt-1 text-gray-400">No entry payment is collected through the platform.</p></div>
          <div className="rounded-2xl border border-white/8 bg-white/[0.035] p-4"><strong className="text-white">Manual</strong><p className="mt-1 text-gray-400">The organiser tracks payment outside the app and marks entries as paid.</p></div>
        </div>
        <p>
          Last Man Standing does not provide sportsbook betting, casino games, wagering, odds, or betting against the platform. Entry fees are collected outside the app when manual payment tracking is used.
        </p>
      </section>

      <section className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-300">Questions about pricing or payment support?</p>
        <Link to="/contact" className="btn-primary">Contact support</Link>
      </section>
    </div>
  );
}
