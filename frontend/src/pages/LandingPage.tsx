import { Link } from 'react-router-dom';
import SeoMeta from '../components/SeoMeta';

export default function LandingPage() {
  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Last Man Standing',
    url: window.location.origin,
    logo: `${window.location.origin}/app-logo.png`,
  };

  const softwareSchema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Last Man Standing',
    alternateName: 'Last Man Standing Software',
    applicationCategory: 'SportsApplication',
    applicationSubCategory: 'Competition Management Software',
    operatingSystem: 'Web, iOS, Android',
    url: window.location.origin,
    description:
      'Last man standing software for running football survivor pool competitions. Manage picks, lifelines, results, payments and standings for clubs, GAA groups, workplaces and friend groups.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'EUR',
      availability: 'https://schema.org/InStock',
      description: 'First competition for every club is free.',
    },
    publisher: {
      '@type': 'Organization',
      name: 'Last Man Standing',
    },
  };

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'How does a last man standing competition work?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Each player picks one team per gameweek. If the team wins or draws they advance. If it loses they are eliminated. The last player still in wins the pot.',
        },
      },
      {
        '@type': 'Question',
        name: 'Can I use this software to run last man standing competitions for my club?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes. The first competition for every club is free and additional competitions can be added with one-off slot purchases. The software handles picks, lifelines, results, and standings automatically.',
        },
      },
      {
        '@type': 'Question',
        name: 'How does the lifeline feature work?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'If enabled, each entry can play one lifeline before a gameweek starts. A win or draw survives the round; a loss still eliminates.',
        },
      },
      {
        '@type': 'Question',
        name: 'Can clubs track payments?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes. Clubs can use free competitions or manual/offline payment tracking. Stripe integration is also available.',
        },
      },
      {
        '@type': 'Question',
        name: 'Do you support GAA survivor pools and football survivor pools?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes. The software supports Premier League and World Cup fixtures. You can run a survivor pool for any football competition the fixtures cover.',
        },
      },
    ],
  };

  return (
    <div className="min-h-screen text-white flex flex-col">
      <SeoMeta
        title="Last Man Standing Software for Clubs | Football Survivor Pool App"
        description="Run Last Man Standing competitions for clubs, workplaces, and private groups. Manage picks, lifelines, results, survivor tables, and entry payment tracking in one app."
        canonicalPath="/"
        jsonLd={[organizationSchema, softwareSchema, faqSchema]}
      />
      {/* Navbar */}
      <nav className="sticky top-0 z-50 flex items-center justify-between border-b border-white/8 bg-[linear-gradient(180deg,rgba(8,15,30,0.92),rgba(8,15,30,0.78))] px-6 py-4 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-brand-300/25 shadow-[0_10px_28px_rgba(56,189,248,0.18)]">
              <img src="/app-logo.png?v=20260511" alt="Last Man Standing logo" className="h-full w-full object-cover" />
            </div>
          <div>
            <span className="block text-lg font-black tracking-tight">Last Man Standing</span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-200/75">Survivor pool</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/login" className="text-sm text-gray-400 hover:text-white transition-colors">Sign in</Link>
          <Link to="/create-club" className="btn-primary text-sm px-4 py-2">
            Create Club
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-4 py-20 text-center">
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-brand-600/10 rounded-full blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-4xl space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-600/20 px-3 py-1.5 text-sm font-medium text-brand-300">
            Club competition management software
          </div>

          <h1 className="text-5xl sm:text-6xl font-black leading-tight tracking-tight">
            Last Man Standing App
            <span className="text-brand-400"> for Football Competitions</span>
          </h1>

          <p className="text-xl text-gray-300 max-w-xl mx-auto leading-relaxed">
            Create and manage club football survivor competitions in minutes. Track entries, picks, lifelines, reminders, results, and standings in one place.
          </p>

          <div className="grid gap-3 pt-4 sm:grid-cols-2">
            <Link
              to="/create-club"
              className="rounded-2xl border border-brand-300/35 bg-brand-500/15 px-5 py-4 text-left transition hover:bg-brand-500/25"
            >
              <span className="block text-[11px] font-black uppercase tracking-[0.14em] text-brand-200">Already have an account?</span>
              <span className="mt-1 block text-lg font-black text-white">Sign in & create a club</span>
              <span className="mt-1 block text-sm text-gray-300">Use your existing account and add club admin tools.</span>
            </Link>
            <Link
              to="/register-club"
              className="rounded-2xl border border-white/10 bg-white/[0.05] px-5 py-4 text-left transition hover:bg-white/[0.09]"
            >
              <span className="block text-[11px] font-black uppercase tracking-[0.14em] text-gray-400">New club admin?</span>
              <span className="mt-1 block text-lg font-black text-white">Create account & club</span>
              <span className="mt-1 block text-sm text-gray-300">Set up your login and club together.</span>
            </Link>
          </div>

          <div className="flex justify-center pt-1">
            <Link
              to="/login"
              className="px-5 py-2 text-sm text-gray-400 transition hover:text-white"
            >
              Just playing? Sign in to enter competitions
            </Link>
          </div>

          {/* Platform availability */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-1">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-sm text-gray-300">
              <span className="text-base">🌐</span>
              <span><strong className="text-white">Web app</strong> — works in any browser, no install needed</span>
            </div>
            <span className="text-gray-600 hidden sm:block">+</span>
            <a
              href="https://play.google.com/store/apps/details?id=com.lastmanstanding.app"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-sm text-gray-300 hover:border-white/25 hover:bg-white/[0.09] transition-colors"
            >
              <span className="text-base">📱</span>
              <span><strong className="text-white">Android app</strong> — download on Google Play</span>
            </a>
          </div>
          <p className="text-xs text-gray-500">
            Both platforms share the same account — use whichever suits you. iPhone users can use the web app.
          </p>
          <div className="grid grid-cols-3 gap-3 pt-6 max-w-2xl mx-auto">
            <LandingMetric label="Setup" value="2 min" />
            <LandingMetric label="Format" value="Knockout" />
            <LandingMetric label="Clubs" value="Private or Public" />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-4 border-t border-gray-800">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Everything You Need to Run a Survivor Pool</h2>
          <div className="grid sm:grid-cols-3 gap-8">
            {[
              { icon: '⚙️', title: 'Set Rules That Fit Your Competition', desc: 'Configure lock times, entry limits, missed-pick behavior, and optional lifeline rules for each competition.' },
              { icon: '💳', title: 'Manage Entries and Payment Status', desc: 'Run your first competition free, then expand with fixed-price €29 competition slots while tracking entries and manual/offline payments.' },
              { icon: '📊', title: 'Track Results and Survivor Table Live', desc: 'Reveal all picks after lock, process outcomes quickly, and keep the full survivor table visible to players.' },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="rounded-2xl border border-white/8 bg-white/[0.035] p-6 text-center space-y-3 shadow-[0_20px_50px_rgba(2,6,23,0.28)]">
                <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-slate-900 text-2xl">
                  {icon}
                </div>
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Product details */}
      <section className="py-20 px-4 bg-surface-800/50 border-t border-gray-800">
        <div className="max-w-5xl mx-auto">
          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="card space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-200">What we sell</p>
              <h2 className="text-3xl font-semibold text-white">Software for club organisers</h2>
              <p className="text-sm leading-6 text-gray-300">
                Last Man Standing provides web and mobile software that helps clubs and private groups create competitions, invite participants, manage entries, track picks, send reminders, publish results, and view standings.
              </p>
              <p className="text-sm leading-6 text-gray-300">
                The platform does not provide sportsbook betting, casino gaming, odds wagering, a betting exchange, or betting against the platform.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link to="/services" className="btn-primary">View services</Link>
                <Link to="/pricing" className="btn-secondary">Pricing</Link>
                <Link to="/refund-policy" className="btn-secondary">Refund policy</Link>
              </div>
            </div>
            <div className="card space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Payment model</p>
              <p className="text-sm leading-6 text-gray-300">
                The first competition for each club is free. After that, each additional competition uses one fixed-price competition slot at €29.
              </p>
              <p className="text-sm leading-6 text-gray-300">
                This keeps costs predictable with no per-player platform cut. Entry fees are collected outside the app when manual payment tracking is used.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Rules */}
      <section className="py-20 px-4 bg-surface-800/50 border-t border-gray-800">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">The Rules</h2>
          <div className="grid sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
            {[
              { icon: '✅', text: 'Pick exactly 1 Premier League team per gameweek' },
              { icon: '🏆', text: "Your team wins → you advance to next week" },
              { icon: '❌', text: 'If your pick loses, that entry is eliminated' },
              { icon: '🔒', text: 'Once used, you can\'t pick that team again' },
              { icon: '⏰', text: 'Picks lock when the first game of the week kicks off' },
              { icon: '🥇', text: 'The last active entry is shown as the winner' },
            ].map(({ icon, text }) => (
              <div key={text} className="flex items-start gap-3 rounded-2xl border border-white/8 bg-white/[0.035] p-4 shadow-[0_16px_40px_rgba(2,6,23,0.22)]">
                <span className="text-xl shrink-0">{icon}</span>
                <span className="text-sm text-gray-300">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 border-t border-gray-800 text-center">
        <div className="max-w-xl mx-auto space-y-6">
          <h2 className="text-3xl font-bold">Ready to run your next survivor pool?</h2>
          <p className="text-gray-400">
            Whether it's your pub, GAA club, workplace or WhatsApp group — set up your Last Man Standing competition in minutes.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Link
              to="/create-club"
              className="inline-flex justify-center btn-primary text-base px-8 py-3 rounded-xl"
            >
              Sign in & create club
            </Link>
            <Link
              to="/register-club"
              className="inline-flex justify-center rounded-xl border border-gray-600 px-8 py-3 text-base text-gray-300 transition hover:border-gray-400 hover:text-white"
            >
              Create account & club
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-6 px-4 text-center text-xs text-gray-600">
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded border border-brand-300/25">
            <img src="/app-logo.png?v=20260511" alt="Last Man Standing logo" className="h-full w-full object-cover" />
          </div>
          <span className="font-medium text-gray-400">Last Man Standing</span>
        </div>
        <div className="mb-2">
          <Link to="/services" className="text-gray-400 hover:text-white transition-colors">Services</Link>
          <span className="text-gray-700">·</span>
          <Link to="/pricing" className="text-gray-400 hover:text-white transition-colors">Pricing</Link>
          <span className="text-gray-700">·</span>
          <Link to="/refund-policy" className="text-gray-400 hover:text-white transition-colors">Refunds</Link>
          <span className="text-gray-700">·</span>
          <Link to="/contact" className="text-gray-400 hover:text-white transition-colors">Contact</Link>
          <span className="text-gray-700">·</span>
          <Link to="/faq" className="text-gray-400 hover:text-white transition-colors">FAQ</Link>
          <span className="text-gray-700">·</span>
          <Link to="/privacy" className="text-gray-400 hover:text-white transition-colors">Privacy</Link>
          <span className="text-gray-700">·</span>
          <Link to="/terms" className="text-gray-400 hover:text-white transition-colors">Terms</Link>
          <span className="text-gray-700">·</span>
          <Link to="/account-deletion" className="text-gray-400 hover:text-white transition-colors">Delete Account</Link>
        </div>
        <p>Premier League survival game · © {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}

function LandingMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.045] px-3 py-3 backdrop-blur-sm">
      <div className="text-sm font-black text-white sm:text-base">{value}</div>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">{label}</div>
    </div>
  );
}
