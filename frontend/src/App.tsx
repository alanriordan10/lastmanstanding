import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import api from './api';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const SignupPage = lazy(() => import('./pages/SignupPage'));
const LandingPage = lazy(() => import('./pages/LandingPage'));
const RegisterClubPage = lazy(() => import('./pages/RegisterClubPage'));
const CreateClubPage = lazy(() => import('./pages/CreateClubPage'));
const OAuth2CallbackPage = lazy(() => import('./pages/OAuth2CallbackPage'));
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
const ContactPage = lazy(() => import('./pages/ContactPage'));
const FaqPage = lazy(() => import('./pages/FaqPage'));
const UserGuidePage = lazy(() => import('./pages/UserGuidePage'));
const BlogIndexPage = lazy(() => import('./pages/BlogIndexPage'));
const BlogPostPage = lazy(() => import('./pages/BlogPostPage'));
const GuidesIndexPage = lazy(() => import('./pages/GuidesIndexPage'));
const GuidePage = lazy(() => import('./pages/GuidePage'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));
const TermsPage = lazy(() => import('./pages/TermsPage'));
const ServicesPage = lazy(() => import('./pages/ServicesPage'));
const PricingPage = lazy(() => import('./pages/PricingPage'));
const RefundPolicyPage = lazy(() => import('./pages/RefundPolicyPage'));
const AccountDeletionPage = lazy(() => import('./pages/AccountDeletionPage'));
const AuthDiagnosticsPage = lazy(() => import('@/pages/AuthDiagnosticsPage'));
const AdminCompetitionDebugPage = lazy(() => import('./pages/AdminCompetitionDebugPage').then(m => ({ default: m.AdminCompetitionDebugPage })));
const AdminSurvivorTablePage = lazy(() => import('./pages/AdminCompetitionDebugPage').then(m => ({ default: m.AdminSurvivorTablePage })));
const AdminGameweekSelectionsPage = lazy(() => import('./pages/AdminCompetitionDebugPage').then(m => ({ default: m.AdminGameweekSelectionsPage })));
const AdminGameweekResultsPage = lazy(() => import('./pages/AdminCompetitionDebugPage').then(m => ({ default: m.AdminGameweekResultsPage })));

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

function CompetitionsCrashFallback() {
  return (
    <div className="card py-10 text-center space-y-3">
      <div className="text-3xl">⚠️</div>
      <p className="text-red-400 font-medium">Competitions failed to load</p>
      <p className="text-xs text-gray-500">Try reloading this page. If it keeps happening, clear site data and sign in again.</p>
      <div className="flex justify-center gap-2">
        <button onClick={() => window.location.reload()} className="btn-primary text-sm">Reload</button>
      </div>
    </div>
  );
}

function reportClientError(error: Error, componentStack?: string) {
  void api.post('/client-errors', {
    source: 'frontend',
    page: 'competitions',
    message: error.message,
    stack: error.stack ?? null,
    componentStack: componentStack ?? null,
    path: window.location.pathname + window.location.search,
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString(),
  }).catch(() => {
    // Swallow reporting failures so users only see the original crash fallback.
  });
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
        <Route path="/create-club" element={<CreateClubPage />} />
        <Route path="/oauth2/callback" element={<OAuth2CallbackPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
        <Route path="/faq" element={<Layout><FaqPage /></Layout>} />
        <Route path="/guide" element={<Layout><UserGuidePage /></Layout>} />
        <Route path="/blog" element={<Layout><BlogIndexPage /></Layout>} />
        <Route path="/blog/:slug" element={<Layout><BlogPostPage /></Layout>} />
        <Route path="/guides" element={<Layout><GuidesIndexPage /></Layout>} />
        <Route path="/guides/:slug" element={<Layout><GuidePage /></Layout>} />
        <Route path="/services" element={<Layout><ServicesPage /></Layout>} />
        <Route path="/pricing" element={<Layout><PricingPage /></Layout>} />
        <Route path="/refund-policy" element={<Layout><RefundPolicyPage /></Layout>} />
        <Route path="/privacy" element={<Layout><PrivacyPage /></Layout>} />
        <Route path="/terms" element={<Layout><TermsPage /></Layout>} />
        <Route path="/contact" element={<Layout><ContactPage /></Layout>} />
        <Route path="/account-deletion" element={<Layout><AccountDeletionPage /></Layout>} />
        <Route path="/auth-diagnostics" element={<Layout><AuthDiagnosticsPage /></Layout>} />
        <Route path="/invite/:code" element={<InviteRedirect />} />
        <Route
          path="/competitions"
          element={
            <Layout>
              <ErrorBoundary
                fallback={<CompetitionsCrashFallback />}
                onError={(error, info) => reportClientError(error, info.componentStack ?? undefined)}
              >
                <CompetitionsPage />
              </ErrorBoundary>
            </Layout>
          }
        />
        <Route path="/competitions/:id" element={<Layout><CompetitionHomePage /></Layout>} />
        <Route path="/competitions/:id/survivor-table" element={<Layout><SurvivorTablePage /></Layout>} />
        <Route path="/admin/competitions/:id/survivor-table" element={<Layout><AdminSurvivorTablePage /></Layout>} />
        <Route path="/admin/competitions/:id/gameweeks/:gwId/selections" element={<Layout><AdminGameweekSelectionsPage /></Layout>} />
        <Route path="/admin/competitions/:id/gameweeks/:gwId/results" element={<Layout><AdminGameweekResultsPage /></Layout>} />

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
                  <Route path="/admin/competitions/:id/debug" element={<AdminCompetitionDebugPage />} />
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
