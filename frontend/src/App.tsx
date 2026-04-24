import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import LandingPage from './pages/LandingPage';
import RegisterClubPage from './pages/RegisterClubPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import CompetitionsPage from './pages/CompetitionsPage';
import CompetitionHomePage from './pages/CompetitionHomePage';
import GameweekSelectionsPage from './pages/GameweekSelectionsPage';
import GameweekResultsPage from './pages/GameweekResultsPage';
import AdminPage from './pages/AdminPage';
import ClubAdminPage from './pages/ClubAdminPage';
import SurvivorTablePage from './pages/SurvivorTablePage';
import ProfilePage from './pages/ProfilePage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="flex h-screen items-center justify-center"><Spinner /></div>;
  if (!user) return <Navigate to="/login" />;
  return <>{children}</>;
}

function Spinner() {
  return <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />;
}

export default function App() {
  const { user } = useAuth();

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={user ? <Navigate to="/competitions" /> : <LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/register-club" element={<RegisterClubPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* Protected routes */}
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="/competitions" element={<CompetitionsPage />} />
                <Route path="/competitions/:id" element={<CompetitionHomePage />} />
                <Route path="/competitions/:id/gameweeks/:gwId/selections" element={<GameweekSelectionsPage />} />
                <Route path="/competitions/:id/gameweeks/:gwId/results" element={<GameweekResultsPage />} />
                <Route path="/competitions/:id/survivor-table" element={<SurvivorTablePage />} />
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
  );
}
