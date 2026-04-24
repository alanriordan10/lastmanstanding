import { Link } from 'react-router-dom';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-surface-900 text-white flex flex-col">
      {/* Navbar */}
      <nav className="border-b border-gray-700/50 bg-surface-800/80 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold">LMS</div>
          <span className="text-lg font-bold">Last Man Standing</span>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/login" className="text-sm text-gray-400 hover:text-white transition-colors">Sign in</Link>
          <Link to="/register-club" className="btn-primary text-sm px-4 py-2">
            Register Your Club
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-4 py-20 relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-brand-600/10 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-3xl mx-auto space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-600/20 border border-brand-500/30 text-brand-400 text-sm font-medium">
            ⚽ Premier League Survival Game
          </div>

          <h1 className="text-5xl sm:text-6xl font-extrabold leading-tight">
            Last Man
            <span className="text-brand-400"> Standing</span>
          </h1>

          <p className="text-xl text-gray-300 max-w-xl mx-auto leading-relaxed">
            Pick one Premier League team each gameweek. If they win — you survive.
            If they draw or lose — you're out. Last player standing wins.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Link
              to="/register-club"
              className="btn-primary text-base px-8 py-3 rounded-xl shadow-lg shadow-brand-600/20 hover:shadow-brand-600/40 transition-shadow"
            >
              🏠 Register Your Club — Free
            </Link>
            <Link
              to="/login"
              className="px-8 py-3 rounded-xl border border-gray-600 text-gray-300 hover:border-gray-400 hover:text-white transition-colors text-base"
            >
              Sign in to play →
            </Link>
          </div>

          <p className="text-xs text-gray-500">No credit card required · Set up in 2 minutes</p>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-4 border-t border-gray-800">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
          <div className="grid sm:grid-cols-3 gap-8">
            {[
              { icon: '🏠', title: 'Register Your Club', desc: 'Sign up in 2 minutes. Name your club, create your account and get instant Club Admin access.' },
              { icon: '🏆', title: 'Create Competitions', desc: 'Set up Last Man Standing competitions for your members. Configure entry fees, rules and lock times.' },
              { icon: '⚽', title: 'Invite & Play', desc: 'Share your competition link. Players pick one team per gameweek. Last one standing wins the pot.' },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="text-center space-y-3">
                <div className="text-5xl">{icon}</div>
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
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
              { icon: '❌', text: 'Your team draws or loses → you\'re eliminated' },
              { icon: '🔒', text: 'Once used, you can\'t pick that team again' },
              { icon: '⏰', text: 'Picks lock when the first game of the week kicks off' },
              { icon: '🥇', text: 'Last survivor wins the competition' },
            ].map(({ icon, text }) => (
              <div key={text} className="flex items-start gap-3 bg-surface-700/50 rounded-xl p-4 border border-gray-700/50">
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
          <h2 className="text-3xl font-bold">Ready to run your own competition?</h2>
          <p className="text-gray-400">
            Whether it's your pub, GAA club, workplace or WhatsApp group — set up your Last Man Standing competition in minutes.
          </p>
          <Link
            to="/register-club"
            className="inline-flex btn-primary text-base px-10 py-3 rounded-xl"
          >
            🏠 Get Started Free
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-6 px-4 text-center text-xs text-gray-600">
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-brand-600 text-[10px] font-bold">LMS</div>
          <span className="font-medium text-gray-400">Last Man Standing</span>
        </div>
        <p>Premier League survival game · © {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}
