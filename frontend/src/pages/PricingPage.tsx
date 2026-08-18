import { Link } from 'react-router-dom';
import SeoMeta from '../components/SeoMeta';

export default function PricingPage() {
  const origin = window.location.origin;
  const serviceSchema = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: 'Last Man Standing Competition Platform',
    serviceType: 'Competition management software',
    provider: {
      '@type': 'Organization',
      name: 'Last Man Standing',
      url: origin,
    },
    areaServed: 'Worldwide',
    url: `${origin}/pricing`,
    offers: [
      {
        '@type': 'Offer',
        name: 'First competition',
        price: '0',
        priceCurrency: 'EUR',
        description: 'Every club gets the first competition free.',
      },
      {
        '@type': 'Offer',
        name: 'Additional competition slot',
        price: '29',
        priceCurrency: 'EUR',
        description: 'Each additional competition requires one slot credit.',
      },
    ],
  };

  const pricingFaqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'How much does Last Man Standing cost?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Every club gets the first competition free. After that, each additional competition requires one paid competition slot.',
        },
      },
      {
        '@type': 'Question',
        name: 'Do competition slots expire?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'No. Competition slots are one-off credits that can be purchased in advance and used later.',
        },
      },
      {
        '@type': 'Question',
        name: 'Can I run free competitions?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes. Organisers can create free competitions or use manual payment tracking depending on their setup.',
        },
      },
    ],
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 text-gray-200">
      <SeoMeta
        title="Pricing & Competition Slots | Last Man Standing"
        description="See Last Man Standing pricing: first competition free for every club, then one paid slot per additional competition. Compare free and manual payment modes."
        canonicalPath="/pricing"
        jsonLd={[serviceSchema, pricingFaqSchema]}
      />

      <section className="relative overflow-hidden rounded-[1.85rem] border border-white/8 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.18),transparent_24rem),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(8,15,30,0.94))] px-5 py-6 shadow-[0_30px_75px_rgba(2,6,23,0.48)] sm:px-6">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-brand-200">Pricing</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">Platform Pricing</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-300">
          Platform access is currently free. If paid platform plans are introduced in future, pricing will be shown before purchase.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <article className="card border-brand-400/25 bg-brand-500/10">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-brand-200">Current platform access</p>
          <h2 className="mt-2 text-3xl font-black text-white">Free</h2>
          <p className="mt-2 text-sm leading-6 text-gray-300">Create a club, configure competitions, invite participants, manage picks, and view standings without a platform subscription fee.</p>
        </article>
        <article className="card">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-gray-400">Competition payments</p>
          <h2 className="mt-2 text-2xl font-black text-white">Configured by organiser</h2>
          <p className="mt-2 text-sm leading-6 text-gray-300">Club organisers may configure free competitions or manual/offline payment tracking.</p>
        </article>
      </section>

      <section className="card space-y-4">
        <h2 className="text-xl font-black text-white">Competition slots</h2>
        <p className="text-sm leading-6 text-gray-300">
          Every club gets its <strong className="text-white">first competition free</strong>. After that, each additional competition requires one <strong className="text-white">competition slot</strong> — a one-off credit purchased through the Club Admin page.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-green-500/25 bg-green-500/10 p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-green-300">First competition</p>
            <p className="mt-1 text-2xl font-black text-white">Free</p>
            <p className="mt-1 text-sm text-gray-300">Included for every club. No card required.</p>
          </div>
          <div className="rounded-2xl border border-brand-400/25 bg-brand-500/10 p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-brand-200">Additional competitions</p>
            <p className="mt-1 text-2xl font-black text-white">1 slot per competition</p>
            <p className="mt-1 text-sm text-gray-300">Slots are bought once-off, do not expire, and can be stocked up in advance. Pricing is shown at checkout.</p>
          </div>
        </div>
        <p className="text-xs text-gray-500">
          Slots are purchased from the Club Admin screen via Stripe Checkout. A slot is consumed when a competition is created and is not refunded if the competition is later deleted.{' '}
          <Link to="/faq" className="text-brand-400 hover:text-brand-300">See the FAQ for more detail →</Link>
        </p>
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
