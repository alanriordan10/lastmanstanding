import { Navigate, useParams } from 'react-router-dom';
import CompetitionHomePage from './CompetitionHomePage';
import SurvivorTablePage from './SurvivorTablePage';
import GameweekSelectionsPage from './GameweekSelectionsPage';
import GameweekResultsPage from './GameweekResultsPage';
import AdminDebugPanel from '../components/AdminDebugPanel';
import { useAuth } from '../context/AuthContext';

function AdminOnly({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/competitions" replace />;
  return <>{children}</>;
}

export function AdminCompetitionDebugPage() {
  const { id } = useParams<{ id: string }>();
  const compId = Number(id);
  return (
    <AdminOnly>
      <div className="space-y-8">
        <CompetitionHomePage readOnly />
        <AdminDebugPanel compId={compId} />
      </div>
    </AdminOnly>
  );
}

export function AdminSurvivorTablePage() {
  const { id } = useParams<{ id: string }>();
  const compId = Number(id);
  return (
    <AdminOnly>
      <div className="space-y-8">
        <SurvivorTablePage readOnly />
        <AdminDebugPanel compId={compId} />
      </div>
    </AdminOnly>
  );
}

export function AdminGameweekSelectionsPage() {
  const { id } = useParams<{ id: string }>();
  const compId = Number(id);
  return (
    <AdminOnly>
      <div className="space-y-8">
        <GameweekSelectionsPage readOnly />
        <AdminDebugPanel compId={compId} />
      </div>
    </AdminOnly>
  );
}

export function AdminGameweekResultsPage() {
  const { id } = useParams<{ id: string }>();
  const compId = Number(id);
  return (
    <AdminOnly>
      <div className="space-y-8">
        <GameweekResultsPage readOnly />
        <AdminDebugPanel compId={compId} />
      </div>
    </AdminOnly>
  );
}
