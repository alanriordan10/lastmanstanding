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

  return (
    <div className="min-h-screen bg-surface-900">
      {/* ── Navbar ─────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-gray-700/50 bg-surface-800/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-3 py-3 sm:px-6 lg:px-8">
          {/* Logo */}
          <Link to="/competitions" className="flex items-center gap-2 shrink-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold">
              LMS
            </div>
            <span className="hidden text-lg font-bold sm:block">Last Man Standing</span>
          </Link>

          {/* Nav links + user */}
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            {isAdmin && (
              <Link to="/admin" className="text-sm font-medium text-gray-400 hover:text-white transition-colors px-1" aria-label="Admin Panel">
                Admin
              </Link>
            )}
            {isClubAdmin && (
              <Link to="/club-admin" className="text-sm font-medium text-gray-400 hover:text-white transition-colors px-1" aria-label="Club Admin">
                My Club
              </Link>
            )}
            <Link
              to="/competitions"
              className="text-sm font-medium text-gray-400 hover:text-white transition-colors px-1"
            >
              Competitions
            </Link>


            <div className="flex items-center gap-2 sm:gap-3 border-l border-gray-700 pl-2 sm:pl-4 min-w-0">
              <Link to="/profile" className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors truncate max-w-[160px]">
                {/* simple user icon */}
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 text-gray-300">
                  <path d="M12 12c2.761 0 5-2.239 5-5s-2.239-5-5-5-5 2.239-5 5 2.239 5 5 5zm0 2c-4.418 0-8 3.582-8 8h2c0-3.309 2.691-6 6-6s6 2.691 6 6h2c0-4.418-3.582-8-8-8z" />
                </svg>
                <span className="truncate">{user?.username ?? 'Profile'}</span>
              </Link>
              <button
                onClick={handleLogout}
                className="text-sm font-medium text-red-400 hover:text-red-300 transition-colors whitespace-nowrap"
                aria-label="Log out"
              >
                Logout
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
