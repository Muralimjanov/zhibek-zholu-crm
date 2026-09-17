import { Loader2 } from 'lucide-react';
import * as React from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import type { UserRole } from '@/api/types';
import { useAuth } from '@/auth/AuthProvider';
import { EmptyState } from '@/components/app';
import { Button } from '@/components/ui/button';
import { AppShell } from '@/layout/AppShell';
import { NAV, homeFor } from '@/layout/nav';
import { ConsentsPage } from '@/pages/auth/ConsentsPage';
import { LegalPage } from '@/pages/auth/LegalPage';
import { LoginPage } from '@/pages/auth/LoginPage';

const DashboardPage = React.lazy(() => import('@/pages/DashboardPage'));
const ReportsPage = React.lazy(() => import('@/pages/ReportsPage'));
const BookingsPage = React.lazy(() => import('@/pages/sales/BookingsPage'));
const ContractsPage = React.lazy(() => import('@/pages/sales/ContractsPage'));
const ContractDetailPage = React.lazy(() => import('@/pages/sales/ContractDetailPage'));
const AnalyticsPage = React.lazy(() => import('@/pages/sales/AnalyticsPage'));
const ShiftsPage = React.lazy(() => import('@/pages/staff/ShiftsPage'));
const DayOffsPage = React.lazy(() => import('@/pages/staff/DayOffsPage'));
const TeamPage = React.lazy(() => import('@/pages/staff/TeamPage'));
const PayrollPage = React.lazy(() => import('@/pages/finance/PayrollPage'));
const AccountingPage = React.lazy(() => import('@/pages/finance/AccountingPage'));
const ApprovalsPage = React.lazy(() => import('@/pages/admin/ApprovalsPage'));
const BackupsPage = React.lazy(() => import('@/pages/admin/BackupsPage'));
const ProfilePage = React.lazy(() => import('@/pages/ProfilePage'));

function FullScreenLoader() {
  return (
    <div className="grid min-h-dvh place-items-center" role="status" aria-label="Загрузка">
      <Loader2 className="size-6 animate-spin text-primary" />
    </div>
  );
}

function PageLoader() {
  return (
    <div className="grid min-h-60 place-items-center" role="status" aria-label="Загрузка">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  );
}

/** Route guard by role; the API enforces the same rules. */
function RoleRoute({ path, children }: { path: string; children: React.ReactNode }) {
  const { user } = useAuth();
  const item = NAV.find((n) => n.to === path);
  if (item && user && !item.roles.includes(user.role as UserRole)) {
    return <EmptyState title="Раздел недоступен" description="У вашей роли нет доступа к этому разделу." action={<Button asChild variant="outline"><a href="/">На главную</a></Button>} />;
  }
  return <React.Suspense fallback={<PageLoader />}>{children}</React.Suspense>;
}

function Protected() {
  const { status, consentsAccepted } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <FullScreenLoader />;
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!consentsAccepted) return <ConsentsPage />;
  return <AppShell />;
}

function Home() {
  const { user } = useAuth();
  return <Navigate to={user ? homeFor(user.role) : '/login'} replace />;
}

function LoginRoute() {
  const { status, user } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <FullScreenLoader />;
  if (status === 'authenticated' && user) {
    const from = (location.state as { from?: string } | null)?.from;
    // Only return to a deep link the signed-in role may open (another user may have left it).
    const section = from && NAV.find((n) => from === n.to || from.startsWith(`${n.to}/`));
    const allowed = from && section && section.roles.includes(user.role);
    return <Navigate to={allowed ? from : homeFor(user.role)} replace />;
  }
  return <LoginPage />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/legal/:type" element={<LegalPage />} />
      <Route element={<Protected />}>
        <Route index element={<Home />} />
        <Route path="/dashboard" element={<RoleRoute path="/dashboard"><DashboardPage /></RoleRoute>} />
        <Route path="/reports" element={<RoleRoute path="/reports"><ReportsPage /></RoleRoute>} />
        <Route path="/bookings" element={<RoleRoute path="/bookings"><BookingsPage /></RoleRoute>} />
        <Route path="/contracts" element={<RoleRoute path="/contracts"><ContractsPage /></RoleRoute>} />
        <Route path="/contracts/:id" element={<RoleRoute path="/contracts"><ContractDetailPage /></RoleRoute>} />
        <Route path="/analytics" element={<RoleRoute path="/analytics"><AnalyticsPage /></RoleRoute>} />
        <Route path="/shifts" element={<RoleRoute path="/shifts"><ShiftsPage /></RoleRoute>} />
        <Route path="/day-offs" element={<RoleRoute path="/day-offs"><DayOffsPage /></RoleRoute>} />
        <Route path="/team" element={<RoleRoute path="/team"><TeamPage /></RoleRoute>} />
        <Route path="/payroll" element={<RoleRoute path="/payroll"><PayrollPage /></RoleRoute>} />
        <Route path="/accounting" element={<RoleRoute path="/accounting"><AccountingPage /></RoleRoute>} />
        <Route path="/approvals" element={<RoleRoute path="/approvals"><ApprovalsPage /></RoleRoute>} />
        <Route path="/backups" element={<RoleRoute path="/backups"><BackupsPage /></RoleRoute>} />
        <Route path="/profile" element={<RoleRoute path="/profile"><ProfilePage /></RoleRoute>} />
        <Route path="*" element={<EmptyState title="Страница не найдена" description="Проверьте адрес или вернитесь на главную." action={<Button asChild variant="outline"><a href="/">На главную</a></Button>} />} />
      </Route>
    </Routes>
  );
}
