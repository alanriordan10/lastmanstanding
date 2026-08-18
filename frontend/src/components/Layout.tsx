import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useInactivityLogout } from '../hooks/useInactivityLogout';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, isAdmin, isClubAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const canAccessClubAdmin = isClubAdmin;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  useInactivityLogout({ onLogout: handleLogout });

  const navItemClass =
    'inline-flex h-8 items-center justify-center gap-1 rounded-xl border border-white/8 bg-white/[0.03] px-2 text-[10px] font-medium text-gray-300 transition-all hover:border-white/15 hover:bg-white/[0.08] hover:text-white sm:h-8 sm:shrink-0 sm:w-auto sm:gap-1.5 sm:px-3 sm:text-sm';
  const navTextClass = 'inline';
  const navClass = (active: boolean) =>
    `${navItemClass} ${active ? 'border-brand-400/40 bg-brand-500/12 text-brand-100' : ''}`;

  // ── Public nav (logged-out) ───────────────────────────────────────────
  if (!user) {
    return (
      <div className="min-h-screen bg-surface-900">
        <nav className="sticky top-0 z-50 border-b border-white/8 bg-[linear-gradient(180deg,rgba(8,15,30,0.92),rgba(8,15,30,0.78))] backdrop-blur-xl">
          <div className="mx-auto flex max-w-7xl flex-col items-stretch gap-3 px-3 py-3 md:flex-row md:items-center md:justify-between sm:px-6 lg:px-8">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2 shrink-0">
              <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-brand-300/25 bg-white shadow-[0_10px_28px_rgba(56,189,248,0.18)]">
                <img src="/app-logo.png?v=20260511" alt="Last Man Standing logo" className="h-full w-full object-cover" />
              </div>
              <div className="hidden lg:block">
                <span className="block text-lg font-black tracking-tight text-white">Last Man Standing</span>
                <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-200/75">Survivor pool</span>
              </div>
            </Link>
            {/* Public links */}
            <div className="flex flex-wrap items-center gap-1 sm:gap-2 md:justify-end">
              <Link to="/faq" className={navClass(location.pathname.startsWith('/faq'))}>FAQ</Link>
              <Link to="/contact" className={navClass(location.pathname.startsWith('/contact'))}>Contact</Link>
              <Link to="/login" className={navClass(location.pathname.startsWith('/login'))}>Log in</Link>
              <Link
                to="/signup"
                className="inline-flex h-8 items-center justify-center gap-1 rounded-xl border border-brand-400/40 bg-brand-500/15 px-3 text-[10px] font-semibold text-brand-100 transition-all hover:bg-brand-500/25 sm:px-4 sm:text-sm"
              >
                Sign up
              </Link>
            </div>
          </div>
        </nav>
        <main className="mx-auto max-w-7xl px-3 py-6 sm:px-6 sm:py-8 lg:px-8">
          {children}
        </main>
      </div>
    );
  }

  // ── Authenticated nav ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-surface-900">
      {/* ── Navbar ──────────────────────────────────────────────�� */}
      <nav className="sticky top-0 z-50 border-b border-white/8 bg-[linear-gradient(180deg,rgba(8,15,30,0.92),rgba(8,15,30,0.78))] backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col items-stretch gap-2 px-3 py-3 sm:px-6 lg:px-8">
          {/* Logo */}
          <div className="flex items-center justify-between gap-3">
          <Link to="/competitions" className="flex min-w-0 items-center gap-2 shrink-0">
            <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-brand-300/25 bg-white shadow-[0_10px_28px_rgba(56,189,248,0.18)]">
              <img src="/app-logo.png?v=20260511" alt="Last Man Standing logo" className="h-full w-full object-cover" />
            </div>
            <div className="hidden min-w-0 md:block lg:hidden">
              <span className="block text-base font-black tracking-tight text-white">Last Man Standing</span>
              <span className="block text-[9px] font-semibold uppercase tracking-[0.16em] text-brand-200/70">Survivor pool</span>
            </div>
            <div className="hidden min-w-0 lg:block">
              <span className="block text-lg font-black tracking-tight text-white">Last Man Standing</span>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-200/75">Survivor pool</span>
            </div>
          </Link>
          <button
            onClick={handleLogout}
            className="inline-flex h-8 items-center justify-center gap-1 rounded-xl border border-red-400/20 bg-red-500/[0.08] px-2 text-[10px] font-medium text-red-300 transition-all hover:border-red-400/35 hover:bg-red-500/12 lg:hidden"
            aria-label="Log out"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 shrink-0">
              <path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5v-2H5V5h5V3Zm7.3 5.3-1.4 1.4 1.3 1.3H9v2h8.2l-1.3 1.3 1.4 1.4 3.7-3.7-3.7-3.7Z" />
            </svg>
            <span>Out</span>
          </button>
          </div>

          {/* Mobile nav */}
          <div className="w-full space-y-2 lg:hidden">
            <div className="flex flex-wrap items-center gap-1.5 md:justify-end">
              {canAccessClubAdmin ? (
                <Link to="/club-admin" className={`${navClass(location.pathname.startsWith('/club-admin'))} min-w-[6rem] justify-center`} aria-label="Club Admin">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 shrink-0">
                    <path d="M4 20h16v-2H4v2Zm2-3h3v-6H6v6Zm4 0h4V7h-4v10Zm5 0h3v-9h-3v9ZM4 10l8-6 8 6v2H4v-2Z" />
                  </svg>
                  <span>Club</span>
                </Link>
              ) : null}
              <Link to="/competitions" className={`${navClass(location.pathname.startsWith('/competitions'))} min-w-[6rem] justify-center`} aria-label="Competitions">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 shrink-0">
                  <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm5.7 7H15a15.4 15.4 0 0 0-1.1-3.1A8 8 0 0 1 17.7 9ZM12 4.3A13.2 13.2 0 0 1 13.1 9h-2.2A13.2 13.2 0 0 1 12 4.3ZM4.3 15A8.1 8.1 0 0 1 4 13h3a17 17 0 0 0 .3 2H4.3Zm0-6A8.1 8.1 0 0 1 8.1 5.9 15.4 15.4 0 0 0 7 9H4.3ZM12 19.7A13.2 13.2 0 0 1 10.9 15h2.2a13.2 13.2 0 0 1-1.1 4.7ZM10.5 13A15.1 15.1 0 0 1 10 10h4a15.1 15.1 0 0 1-.5 3h-3Zm-1.6 6.1A8 8 0 0 1 4.3 15H7a15.4 15.4 0 0 0 1.9 4.1Zm5.1 0A15.4 15.4 0 0 0 17 15h2.7a8 8 0 0 1-5.7 4.1ZM16.7 13a17 17 0 0 0 .3-2h3a8.1 8.1 0 0 1-.3 2h-3Z" />
                </svg>
                <span>Comps</span>
              </Link>
              <Link to="/profile" className={`${navClass(location.pathname.startsWith('/profile'))} min-w-[6rem] justify-center`} aria-label="Profile">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 shrink-0 text-gray-300">
                  <path d="M12 12c2.761 0 5-2.239 5-5s-2.239-5-5-5-5 2.239-5 5 2.239 5 5 5zm0 2c-4.418 0-8 3.582-8 8h2c0-3.309 2.691-6 6-6s6 2.691 6 6h2c0-4.418-3.582-8-8-8z" />
                </svg>
                <span>Me</span>
              </Link>
            </div>
            <div className="flex flex-wrap items-center gap-1 border-t border-white/8 pt-1.5 text-[11px] text-gray-400 md:justify-end">
              {isAdmin && (
                <Link
                  to="/admin"
                  className="rounded-md px-2 py-1 transition hover:bg-white/[0.05] hover:text-white"
                  aria-label="Admin Panel"
                >
                  Admin
                </Link>
              )}
              <Link
                to="/contact"
                className="rounded-md px-2 py-1 transition hover:bg-white/[0.05] hover:text-white"
                aria-label="Contact support"
              >
                Help
              </Link>
              <Link
                to="/blog"
                className="rounded-md px-2 py-1 transition hover:bg-white/[0.05] hover:text-white"
                aria-label="Blog"
              >
                Blog
              </Link>
              <Link
                to="/faq"
                className="rounded-md px-2 py-1 transition hover:bg-white/[0.05] hover:text-white"
                aria-label="Frequently asked questions"
              >
                FAQ
              </Link>
            </div>
          </div>

          {/* Desktop nav links + user */}
          <div className="hidden w-full items-center justify-end gap-1 overflow-visible pb-1 lg:flex lg:flex-nowrap lg:gap-x-4 lg:pb-0">
            {isAdmin && (
              <Link to="/admin" className={`${navClass(location.pathname.startsWith('/admin'))} hidden sm:inline-flex`} aria-label="Admin Panel">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 shrink-0">
                  <path d="M12 2 3 7v6c0 5 3.8 8.7 9 9 5.2-.3 9-4 9-9V7l-9-5Zm0 2.2 7 3.9V13c0 3.7-2.7 6.6-7 7-4.3-.4-7-3.3-7-7V8.1l7-3.9Z" />
                </svg>
                <span className={`${navTextClass} hidden sm:inline`}>Admin</span>
                <span className="sm:hidden">Admin</span>
              </Link>
            )}
            {canAccessClubAdmin && (
              <Link to="/club-admin" className={`${navClass(location.pathname.startsWith('/club-admin'))} sm:whitespace-nowrap`} aria-label="Club Admin">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 shrink-0">
                  <path d="M4 20h16v-2H4v2Zm2-3h3v-6H6v6Zm4 0h4V7h-4v10Zm5 0h3v-9h-3v9ZM4 10l8-6 8 6v2H4v-2Z" />
                </svg>
                <span className="hidden sm:inline">My Club</span>
                <span className="sm:hidden">Club</span>
              </Link>
            )}
            <Link
              to="/competitions"
              className={navClass(location.pathname.startsWith('/competitions'))}
              aria-label="Competitions"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 shrink-0">
                <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm5.7 7H15a15.4 15.4 0 0 0-1.1-3.1A8 8 0 0 1 17.7 9ZM12 4.3A13.2 13.2 0 0 1 13.1 9h-2.2A13.2 13.2 0 0 1 12 4.3ZM4.3 15A8.1 8.1 0 0 1 4 13h3a17 17 0 0 0 .3 2H4.3Zm0-6A8.1 8.1 0 0 1 8.1 5.9 15.4 15.4 0 0 0 7 9H4.3ZM12 19.7A13.2 13.2 0 0 1 10.9 15h2.2a13.2 13.2 0 0 1-1.1 4.7ZM10.5 13A15.1 15.1 0 0 1 10 10h4a15.1 15.1 0 0 1-.5 3h-3Zm-1.6 6.1A8 8 0 0 1 4.3 15H7a15.4 15.4 0 0 0 1.9 4.1Zm5.1 0A15.4 15.4 0 0 0 17 15h2.7a8 8 0 0 1-5.7 4.1ZM16.7 13a17 17 0 0 0 .3-2h3a8.1 8.1 0 0 1-.3 2h-3Z" />
              </svg>
              <span className="hidden sm:inline">Competitions</span>
              <span className="sm:hidden">Comps</span>
            </Link>
            <Link to="/contact" className={navClass(location.pathname.startsWith('/contact'))} aria-label="Contact support">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 shrink-0">
                <path d="M2 5a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H8l-5 4v-4a3 3 0 0 1-1-2V5Zm3-1a1 1 0 0 0-1 1v11h2v2.17L7.59 17H19a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H5Z" />
              </svg>
              <span className="hidden sm:inline">Contact</span>
              <span className="sm:hidden">Help</span>
            </Link>
             <Link to="/blog" className={navClass(location.pathname.startsWith('/blog'))} aria-label="Blog">
               <span className="hidden sm:inline">Blog</span>
               <span className="sm:hidden">Blog</span>
             </Link>
             <Link to="/faq" className={navClass(location.pathname.startsWith('/faq'))} aria-label="Frequently asked questions">
               <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 shrink-0">
                 <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 17a1.25 1.25 0 1 1 1.25-1.25A1.25 1.25 0 0 1 12 19Zm1.7-7.4-.6.4a2.2 2.2 0 0 0-1.1 1.9V14h-2v-.1a4.2 4.2 0 0 1 1.9-3.5l.6-.4a1.7 1.7 0 0 0 .8-1.5 1.8 1.8 0 0 0-3.6 0H8a3.8 3.8 0 0 1 7.6 0 3.7 3.7 0 0 1-1.9 3.1Z" />
               </svg>
               <span className="hidden sm:inline">FAQ</span>
               <span className="sm:hidden">FAQ</span>
             </Link>


            <div className="flex items-center gap-1 sm:gap-3 sm:border-l sm:border-white/8 sm:pl-4">
              <Link to="/profile" className={navClass(location.pathname.startsWith('/profile'))} aria-label="Profile">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 shrink-0 text-gray-300 sm:h-5 sm:w-5">
                  <path d="M12 12c2.761 0 5-2.239 5-5s-2.239-5-5-5-5 2.239-5 5 2.239 5 5 5zm0 2c-4.418 0-8 3.582-8 8h2c0-3.309 2.691-6 6-6s6 2.691 6 6h2c0-4.418-3.582-8-8-8z" />
                </svg>
                <span className="hidden max-w-[160px] truncate sm:inline">{user?.username ?? 'Profile'}</span>
                <span className="sm:hidden">Me</span>
              </Link>
              <button
                onClick={handleLogout}
                className="inline-flex h-8 items-center justify-center gap-1 rounded-xl border border-red-400/15 bg-red-500/[0.05] px-2 text-[10px] font-medium text-red-300 transition-all hover:border-red-400/30 hover:bg-red-500/10 hover:text-red-200 sm:h-8 sm:shrink-0 sm:w-auto sm:gap-1.5 sm:px-3 sm:text-sm sm:whitespace-nowrap"
                aria-label="Log out"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 shrink-0">
                  <path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5v-2H5V5h5V3Zm7.3 5.3-1.4 1.4 1.3 1.3H9v2h8.2l-1.3 1.3 1.4 1.4 3.7-3.7-3.7-3.7Z" />
                </svg>
                <span className="hidden sm:inline">Logout</span>
                <span className="sm:hidden">Out</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* ── Main Content ──────────────────────────────────────── */}
      <main className="mx-auto max-w-7xl px-3 py-6 sm:px-6 sm:py-8 lg:px-8">
        {children}
      </main>
    </div>
  );
}
