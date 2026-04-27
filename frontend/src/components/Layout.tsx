import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useInactivityLogout } from '../hooks/useInactivityLogout';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, isAdmin, isClubAdmin } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  useInactivityLogout({ onLogout: handleLogout });

  const navItemClass =
    'inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.03] px-2.5 text-[11px] font-medium text-gray-300 transition-all hover:border-white/15 hover:bg-white/[0.08] hover:text-white sm:h-8 sm:w-auto sm:px-3 sm:text-sm';
  const navTextClass = 'inline';

  return (
    <div className="min-h-screen bg-surface-900">
      {/* ── Navbar ─────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-white/8 bg-[linear-gradient(180deg,rgba(8,15,30,0.92),rgba(8,15,30,0.78))] backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-3 py-3 sm:px-6 lg:px-8">
          {/* Logo */}
          <Link to="/competitions" className="flex items-center gap-2 shrink-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-brand-300/25 bg-gradient-to-br from-brand-500 to-cyan-400 text-[11px] font-black text-slate-950 shadow-[0_10px_28px_rgba(56,189,248,0.18)]">
              LMS
            </div>
            <div className="hidden sm:block">
              <span className="block text-lg font-black tracking-tight text-white">Last Man Standing</span>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-200/75">Survivor pool</span>
            </div>
          </Link>

          {/* Nav links + user */}
          <div className="ml-auto flex items-center justify-end gap-1 sm:gap-x-4">
            {isAdmin && (
              <Link to="/admin" className={navItemClass} aria-label="Admin Panel">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 shrink-0">
                  <path d="M12 2 3 7v6c0 5 3.8 8.7 9 9 5.2-.3 9-4 9-9V7l-9-5Zm0 2.2 7 3.9V13c0 3.7-2.7 6.6-7 7-4.3-.4-7-3.3-7-7V8.1l7-3.9Z" />
                </svg>
                <span className={`${navTextClass} hidden sm:inline`}>Admin</span>
                <span className="sm:hidden">Admin</span>
              </Link>
            )}
            {isClubAdmin && (
              <Link to="/club-admin" className={`${navItemClass} sm:whitespace-nowrap`} aria-label="Club Admin">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 shrink-0">
                  <path d="M4 20h16v-2H4v2Zm2-3h3v-6H6v6Zm4 0h4V7h-4v10Zm5 0h3v-9h-3v9ZM4 10l8-6 8 6v2H4v-2Z" />
                </svg>
                <span className="hidden sm:inline">My Club</span>
                <span className="sm:hidden">Club</span>
              </Link>
            )}
            <Link
              to="/competitions"
              className={navItemClass}
              aria-label="Competitions"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 shrink-0">
                <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm5.7 7H15a15.4 15.4 0 0 0-1.1-3.1A8 8 0 0 1 17.7 9ZM12 4.3A13.2 13.2 0 0 1 13.1 9h-2.2A13.2 13.2 0 0 1 12 4.3ZM4.3 15A8.1 8.1 0 0 1 4 13h3a17 17 0 0 0 .3 2H4.3Zm0-6A8.1 8.1 0 0 1 8.1 5.9 15.4 15.4 0 0 0 7 9H4.3ZM12 19.7A13.2 13.2 0 0 1 10.9 15h2.2a13.2 13.2 0 0 1-1.1 4.7ZM10.5 13A15.1 15.1 0 0 1 10 10h4a15.1 15.1 0 0 1-.5 3h-3Zm-1.6 6.1A8 8 0 0 1 4.3 15H7a15.4 15.4 0 0 0 1.9 4.1Zm5.1 0A15.4 15.4 0 0 0 17 15h2.7a8 8 0 0 1-5.7 4.1ZM16.7 13a17 17 0 0 0 .3-2h3a8.1 8.1 0 0 1-.3 2h-3Z" />
              </svg>
              <span className="hidden sm:inline">Competitions</span>
              <span className="sm:hidden">Comps</span>
            </Link>


            <div className="flex items-center gap-1 sm:gap-3 sm:border-l sm:border-white/8 sm:pl-4">
              <Link to="/profile" className={navItemClass} aria-label="Profile">
                {/* simple user icon */}
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 shrink-0 text-gray-300 sm:h-5 sm:w-5">
                  <path d="M12 12c2.761 0 5-2.239 5-5s-2.239-5-5-5-5 2.239-5 5 2.239 5 5 5zm0 2c-4.418 0-8 3.582-8 8h2c0-3.309 2.691-6 6-6s6 2.691 6 6h2c0-4.418-3.582-8-8-8z" />
                </svg>
                <span className="hidden max-w-[160px] truncate sm:inline">{user?.username ?? 'Profile'}</span>
                <span className="sm:hidden">Me</span>
              </Link>
              <button
                onClick={handleLogout}
                className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-red-400/15 bg-red-500/[0.05] px-2.5 text-[11px] font-medium text-red-300 transition-all hover:border-red-400/30 hover:bg-red-500/10 hover:text-red-200 sm:h-8 sm:w-auto sm:px-3 sm:text-sm sm:whitespace-nowrap"
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
