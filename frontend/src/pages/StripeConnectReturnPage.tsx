import { Link } from 'react-router-dom';
import SeoMeta from '../components/SeoMeta';
import { useAuth } from '../context/AuthContext';

export default function StripeConnectReturnPage() {
  const { user, isAdmin, isClubAdmin } = useAuth();
  const canAccessClubAdmin = Boolean(user && (isAdmin || isClubAdmin));

  return (
    <div className="min-h-screen bg-surface-900 px-4 py-10 text-gray-100">
      <SeoMeta
        title="Stripe Connect Return | Last Man Standing"
        description="Return page after Stripe Connect onboarding for Last Man Standing club admins."
      />
      <div className="mx-auto flex min-h-[70vh] max-w-xl items-center justify-center">
        <div className="card w-full space-y-5 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-brand-300/25 bg-brand-500/10 text-2xl">✓</div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-brand-200">Stripe Connect</p>
            <h1 className="mt-2 text-3xl font-black text-white">Return to Club Admin</h1>
            <p className="mt-3 text-sm leading-6 text-gray-400">
              Stripe has sent you back after onboarding. If you are using the mobile app, it should reopen automatically once Android App Links are verified.
            </p>
          </div>
          <div className="rounded-xl border border-sky-400/20 bg-sky-500/10 px-4 py-3 text-left text-xs leading-5 text-sky-100/90">
            If setup still says incomplete, open Club Admin and refresh Stripe status. Stripe only enables charges and payouts after all required account details are complete.
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link to={canAccessClubAdmin ? '/club-admin' : '/login'} className="btn-primary">
              {canAccessClubAdmin ? 'Open Club Admin' : 'Sign in'}
            </Link>
            <Link to="/competitions" className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-bold text-gray-300 hover:bg-white/[0.08]">
              Go to Competitions
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
