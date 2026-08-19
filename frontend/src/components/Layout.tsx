import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useInactivityLogout } from '../hooks/useInactivityLogout';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, isAdmin, isClubAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const canAccessClubAdmin = isClubAdmin;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  useInactivityLogout({ onLogout: handleLogout });

  const navItemClass =
    'inline-flex h-9 items-center justify-center gap-1 rounded-xl border border-white/12 bg-white/[0.035] px-2.5 text-[11px] font-medium text-gray-300 transition-all hover:-translate-y-[1px] hover:border-white/22 hover:bg-white/[0.08] hover:text-white sm:shrink-0 sm:w-auto sm:gap-1.5 sm:px-3.5 sm:text-sm';
  const navTextClass = 'inline';
  const navClass = (active: boolean) =>
    `${navItemClass} ${active ? 'border-sky-300/50 bg-sky-400/12 text-sky-100 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.24),0_8px_18px_rgba(56,189,248,0.10)]' : ''}`;
  const mobileNavClass = (active: boolean) =>
    `inline-flex h-9 w-full min-w-0 items-center justify-center gap-1 rounded-lg border px-1 text-[10px] font-medium leading-none transition-all ${
      active
        ? 'border-sky-300/50 bg-sky-400/12 text-sky-100 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.24),0_8px_18px_rgba(56,189,248,0.10)]'
        : 'border-white/10 bg-white/[0.02] text-gray-300 hover:border-white/18 hover:bg-white/[0.05] hover:text-white'
    }`;
  const mobileNavCount = (isAdmin ? 1 : 0) + (canAccessClubAdmin ? 1 : 0) + 3;
  const mobileNavGridClass = mobileNavCount <= 4 ? 'grid-cols-4' : 'grid-cols-5';
  const themeButtonLabel = theme === 'system' ? 'Theme: system' : theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode';
  // Icon/label show the mode you'll SWITCH TO (matches themeButtonLabel), not the current mode.
  const themeIcon = theme === 'light'
    ? (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 shrink-0">
        <path d="M21 14.1A8.5 8.5 0 0 1 9.9 3a1 1 0 0 0-1.2 1.2A10.5 10.5 0 1 0 19.8 15.3a1 1 0 0 0 1.2-1.2Z"/>
      </svg>
    )
    : (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 shrink-0">
        <path d="M12 2a1 1 0 0 1 1 1v1.1a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1Zm0 16a6 6 0 1 0 0-12 6 6 0 0 0 0 12Zm9-7a1 1 0 0 1 0 2h-1.1a1 1 0 1 1 0-2H21ZM5.1 12a1 1 0 0 1-1 1H3a1 1 0 1 1 0-2h1.1a1 1 0 0 1 1 1Zm12.02 6.61a1 1 0 0 1 1.41 0l.78.78a1 1 0 0 1-1.41 1.41l-.78-.78a1 1 0 0 1 0-1.41ZM4.7 4.7a1 1 0 0 1 1.41 0l.78.78A1 1 0 1 1 5.48 6.9L4.7 6.12a1 1 0 0 1 0-1.41Zm13.2 1.42a1 1 0 0 1 0-1.42l.78-.78a1 1 0 1 1 1.41 1.41l-.78.79a1 1 0 0 1-1.41 0ZM6.9 18.52a1 1 0 1 1-1.42 1.41l-.78-.78a1 1 0 0 1 1.41-1.41l.79.78Z"/>
      </svg>
    );

  // ── Public nav (logged-out) ───────────────────────────────────────────
  if (!user) {
    return (
      <div className="min-h-screen bg-surface-900">
        <nav className="panel-shell sticky top-0 z-50 rounded-none border-x-0 border-t-0 backdrop-blur-xl">
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
              <button type="button" onClick={toggleTheme} className={`${navItemClass} px-2.5 sm:px-2.5`} aria-label={themeButtonLabel} title={themeButtonLabel}>
                {themeIcon}
              </button>
              <Link to="/login" className={navClass(location.pathname.startsWith('/login'))}>Sign in</Link>
              <Link
                to="/signup"
                className="inline-flex h-9 items-center justify-center gap-1 rounded-xl border border-sky-300/40 bg-sky-400/14 px-3.5 text-[11px] font-semibold text-sky-100 transition-all hover:-translate-y-[1px] hover:border-sky-200/55 hover:bg-sky-400/20 sm:px-4 sm:text-sm"
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
      <nav className="panel-shell sticky top-0 z-50 rounded-none border-x-0 border-t-0 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col items-stretch gap-2 px-3 py-3 sm:px-6 lg:px-8">
          {/* Logo */}
          <div className="flex items-center justify-between gap-2">
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
          <div className="flex items-center gap-2 lg:hidden">
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/20 bg-white/[0.08] text-[11px] font-medium text-gray-200 transition-all hover:border-white/30 hover:bg-white/[0.12]"
              aria-label={themeButtonLabel}
              title={themeButtonLabel}
            >
              {themeIcon}
            </button>
            <button
              onClick={handleLogout}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-red-300/30 bg-red-500/[0.10] text-[11px] font-medium text-red-200 transition-all hover:border-red-200/45 hover:bg-red-500/16"
              aria-label="Log out"
              title="Log out"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 shrink-0">
                <path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5v-2H5V5h5V3Zm7.3 5.3-1.4 1.4 1.3 1.3H9v2h8.2l-1.3 1.3 1.4 1.4 3.7-3.7-3.7-3.7Z" />
              </svg>
              <span className="sr-only">Log out</span>
            </button>
          </div>
          </div>

          {/* Mobile nav */}
          <div className="w-full space-y-2 lg:hidden">
            <div className={`grid ${mobileNavGridClass} gap-1`}>
              {isAdmin ? (
                <Link to="/admin" className={mobileNavClass(location.pathname.startsWith('/admin'))} aria-label="Admin Panel">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 shrink-0">
                    <path d="M12 2 3 7v6c0 5 3.8 8.7 9 9 5.2-.3 9-4 9-9V7l-9-5Zm0 2.2 7 3.9V13c0 3.7-2.7 6.6-7 7-4.3-.4-7-3.3-7-7V8.1l7-3.9Z" />
                  </svg>
                  <span className="min-w-0 truncate">Admin</span>
                </Link>
              ) : null}
              {canAccessClubAdmin ? (
                <Link to="/club-admin" className={mobileNavClass(location.pathname.startsWith('/club-admin'))} aria-label="Club Admin">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 shrink-0">
                    <path d="M4 20h16v-2H4v2Zm2-3h3v-6H6v6Zm4 0h4V7h-4v10Zm5 0h3v-9h-3v9ZM4 10l8-6 8 6v2H4v-2Z" />
                  </svg>
                  <span className="min-w-0 truncate">Club</span>
                </Link>
              ) : null}
              <Link to="/competitions" className={mobileNavClass(location.pathname.startsWith('/competitions'))} aria-label="Competitions">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 shrink-0">
                  <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm5.7 7H15a15.4 15.4 0 0 0-1.1-3.1A8 8 0 0 1 17.7 9ZM12 4.3A13.2 13.2 0 0 1 13.1 9h-2.2A13.2 13.2 0 0 1 12 4.3ZM4.3 15A8.1 8.1 0 0 1 4 13h3a17 17 0 0 0 .3 2H4.3Zm0-6A8.1 8.1 0 0 1 8.1 5.9 15.4 15.4 0 0 0 7 9H4.3ZM12 19.7A13.2 13.2 0 0 1 10.9 15h2.2a13.2 13.2 0 0 1-1.1 4.7ZM10.5 13A15.1 15.1 0 0 1 10 10h4a15.1 15.1 0 0 1-.5 3h-3Zm-1.6 6.1A8 8 0 0 1 4.3 15H7a15.4 15.4 0 0 0 1.9 4.1Zm5.1 0A15.4 15.4 0 0 0 17 15h2.7a8 8 0 0 1-5.7 4.1ZM16.7 13a17 17 0 0 0 .3-2h3a8.1 8.1 0 0 1-.3 2h-3Z" />
                </svg>
                <span className="min-w-0 truncate">Comps</span>
              </Link>
              <Link to="/profile" className={mobileNavClass(location.pathname.startsWith('/profile'))} aria-label="Profile">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 shrink-0 text-gray-300">
                  <path d="M12 12c2.761 0 5-2.239 5-5s-2.239-5-5-5-5 2.239-5 5 2.239 5 5 5zm0 2c-4.418 0-8 3.582-8 8h2c0-3.309 2.691-6 6-6s6 2.691 6 6h2c0-4.418-3.582-8-8-8z" />
                </svg>
                <span className="min-w-0 truncate">Me</span>
              </Link>
              <Link to="/contact" className={mobileNavClass(location.pathname.startsWith('/contact'))} aria-label="Contact support">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 shrink-0">
                  <path d="M2 5a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H8l-5 4v-4a3 3 0 0 1-1-2V5Zm3-1a1 1 0 0 0-1 1v11h2v2.17L7.59 17H19a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H5Z" />
                </svg>
                <span className="min-w-0 truncate">Help</span>
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
            <div className="flex items-center gap-1 sm:gap-3 sm:border-l sm:border-white/10 sm:pl-4">
              <div className="hidden items-center gap-1 sm:flex">
                <button
                  type="button"
                  onClick={toggleTheme}
                  className={`${navItemClass} px-2.5 sm:px-2.5`}
                  aria-label={themeButtonLabel}
                  title={themeButtonLabel}
                >
                  {themeIcon}
                </button>
              </div>
              <Link to="/profile" className={navClass(location.pathname.startsWith('/profile'))} aria-label="Profile">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 shrink-0 text-gray-300 sm:h-5 sm:w-5">
                  <path d="M12 12c2.761 0 5-2.239 5-5s-2.239-5-5-5-5 2.239-5 5 2.239 5 5 5zm0 2c-4.418 0-8 3.582-8 8h2c0-3.309 2.691-6 6-6s6 2.691 6 6h2c0-4.418-3.582-8-8-8z" />
                </svg>
                <span className="hidden max-w-[160px] truncate sm:inline">{user?.username ?? 'Profile'}</span>
                <span className="sm:hidden">Me</span>
              </Link>
              <button
                onClick={handleLogout}
                className="inline-flex h-9 items-center justify-center gap-1 rounded-xl border border-red-300/20 bg-red-500/[0.08] px-2.5 text-[11px] font-medium text-red-200 transition-all hover:border-red-200/35 hover:bg-red-500/14 hover:text-red-100 sm:shrink-0 sm:w-auto sm:gap-1.5 sm:px-3.5 sm:text-sm sm:whitespace-nowrap"
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
