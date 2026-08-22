import { Navigate } from 'react-router-dom';
import CompetitionHomePage from './CompetitionHomePage';
import SurvivorTablePage from './SurvivorTablePage';
import GameweekSelectionsPage from './GameweekSelectionsPage';
import GameweekResultsPage from './GameweekResultsPage';
import { useAuth } from '../context/AuthContext';

function AdminOnly({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/competitions" replace />;
  return <>{children}</>;
}

export function AdminCompetitionDebugPage() {
  return <AdminOnly><CompetitionHomePage readOnly /></AdminOnly>;
}

export function AdminSurvivorTablePage() {
  return <AdminOnly><SurvivorTablePage readOnly /></AdminOnly>;
}

export function AdminGameweekSelectionsPage() {
  return <AdminOnly><GameweekSelectionsPage readOnly /></AdminOnly>;
}

export function AdminGameweekResultsPage() {
  return <AdminOnly><GameweekResultsPage readOnly /></AdminOnly>;
}
