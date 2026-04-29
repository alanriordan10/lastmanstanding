import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const SignupPage = lazy(() => import('./pages/SignupPage'));
const LandingPage = lazy(() => import('./pages/LandingPage'));
const RegisterClubPage = lazy(() => import('./pages/RegisterClubPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const CompetitionsPage = lazy(() => import('./pages/CompetitionsPage'));
const CompetitionHomePage = lazy(() => import('./pages/CompetitionHomePage'));
const GameweekSelectionsPage = lazy(() => import('./pages/GameweekSelectionsPage'));
const GameweekResultsPage = lazy(() => import('./pages/GameweekResultsPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const ClubAdminPage = lazy(() => import('./pages/ClubAdminPage'));
const SurvivorTablePage = lazy(() => import('./pages/SurvivorTablePage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="flex h-screen items-center justify-center"><Spinner /></div>;
  if (!user) return <Navigate to="/login" />;
  return <>{children}</>;
}

function Spinner() {
  return <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />;
}

function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner />
    </div>
  );
}

function InviteRedirect() {
  const { code } = useParams();
  if (!code) return <Navigate to="/competitions" replace />;
  const normalized = code.trim().toUpperCase();
  return <Navigate to={`/competitions?code=${encodeURIComponent(normalized)}`} replace />;
}

export default function App() {
  const { user } = useAuth();

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={user ? <Navigate to="/competitions" /> : <LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/register-club" element={<RegisterClubPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/invite/:code" element={<InviteRedirect />} />
        <Route path="/competitions" element={<Layout><CompetitionsPage /></Layout>} />
        <Route path="/competitions/:id" element={<Layout><CompetitionHomePage /></Layout>} />
        <Route path="/competitions/:id/survivor-table" element={<Layout><SurvivorTablePage /></Layout>} />

        {/* Protected routes */}
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Layout>
                <Routes>
                  <Route path="/competitions/:id/gameweeks/:gwId/selections" element={<GameweekSelectionsPage />} />
                  <Route path="/competitions/:id/gameweeks/:gwId/results" element={<GameweekResultsPage />} />
                  <Route path="/admin" element={<AdminPage />} />
                  <Route path="/club-admin" element={<ClubAdminPage />} />
                  <Route path="/profile" element={<ProfilePage />} />
                  <Route path="*" element={<Navigate to="/competitions" />} />
                </Routes>
              </Layout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </Suspense>
  );
}
