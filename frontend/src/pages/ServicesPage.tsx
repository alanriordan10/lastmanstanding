import { Link } from 'react-router-dom';
import SeoMeta from '../components/SeoMeta';

const serviceCards = [
  {
    title: 'Competition setup',
    body: 'Club organisers can create football survivor competitions, configure entry limits, visibility, missed-pick rules, lifelines, fixture source, and start date.',
  },
  {
    title: 'Participant management',
    body: 'Organisers can invite players, add participants, manage multiple entries per user, confirm manual payments, and remove entries where required.',
  },
  {
    title: 'Picks, reminders, and results',
    body: 'Players make one team selection per gameweek before lock. The app tracks used teams, sends reminders where enabled, reveals selections after lock, and shows standings/results.',
  },
  {
    title: 'Payments support',
    body: 'Every club gets one free competition. Additional competitions use fixed-price €29 competition slots, and admins can still mark entries as paid after collecting payment outside the app.',
  },
];

export default function ServicesPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 text-gray-200">
      <SeoMeta
        title="Products and Services | Last Man Standing"
        description="Last Man Standing provides competition management software for clubs and private groups running football survivor competitions."
        canonicalPath="/services"
      />

      <section className="relative overflow-hidden rounded-[1.85rem] border border-white/8 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.18),transparent_24rem),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(8,15,30,0.94))] px-5 py-6 shadow-[0_30px_75px_rgba(2,6,23,0.48)] sm:px-6">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-brand-200">Products and services</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">Competition management software for clubs</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-300">
          Last Man Standing helps clubs and private groups create, administer, and track football survivor competitions. The service provides software tools for organisers and players; it does not provide sportsbook betting, casino gaming, wagering, odds, or betting against the platform.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {serviceCards.map((card) => (
          <article key={card.title} className="card">
            <h2 className="text-lg font-black text-white">{card.title}</h2>
            <p className="mt-2 text-sm leading-6 text-gray-300">{card.body}</p>
          </article>
        ))}
      </section>

      <section className="card space-y-4 text-sm leading-6 text-gray-300">
        <h2 className="text-xl font-black text-white">What the platform does not do</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            'No sportsbook betting or odds wagering.',
            'No casino games or games against the platform.',
            'No platform-set odds or risk-taking on sports outcomes.',
            'No betting market, exchange, or bookmaker service.',
          ].map((item) => (
            <div key={item} className="rounded-2xl border border-white/8 bg-white/[0.035] p-4 text-gray-300">{item}</div>
          ))}
        </div>
        <p>
          Clubs are responsible for their own competition rules and for ensuring their use of the platform complies with local laws. Any entry fees are collected outside the app and manually tracked by the organiser, and the platform does not take a per-player cut.
        </p>
      </section>

      <section className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-black text-white">Need payment or setup details?</h2>
          <p className="mt-1 text-sm text-gray-400">Review pricing, refund policy, and contact information.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/pricing" className="btn-secondary">Pricing</Link>
          <Link to="/refund-policy" className="btn-secondary">Refund policy</Link>
          <Link to="/contact" className="btn-primary">Contact support</Link>
        </div>
      </section>
    </div>
  );
}
