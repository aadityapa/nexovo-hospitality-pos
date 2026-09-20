import { useEffect, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuthStore, isSessionExpired } from '@/store/authStore';
import { homeForRoles } from '@/config/roleHome';
import type { Permission } from '@/config/permissions';
import { EmptyState, Button } from '@/components/ui';

/** Redirects to /login when unauthenticated (session expiry included). */
export function ProtectedRoute() {
  const { token, user, clear } = useAuthStore();
  const loc = useLocation();
  const invalid = !token || !user || isSessionExpired();
  // never mutate the store during render — that would update other subscribed components mid-render
  useEffect(() => { if (invalid && token) clear(); }, [invalid, token, clear]);
  if (invalid) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  return <Outlet />;
}

/** Route-level RBAC. Renders a 403 state instead of silently redirecting so users understand why. */
export function RequirePermission({ permission, mode = 'any', children }: { permission: Permission | Permission[]; mode?: 'any' | 'all'; children?: ReactNode }) {
  const allowed = useAuthStore((s) => s.hasPermission(permission, mode));
  const user = useAuthStore((s) => s.user);
  if (!allowed) return <Forbidden home={user ? homeForRoles(user.roles) : '/login'} />;
  return children ? <>{children}</> : <Outlet />;
}

export function Forbidden({ home }: { home: string }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <EmptyState icon={<ShieldAlert className="h-6 w-6" />} title="Access denied" description="Your role does not have permission to view this page." action={<Button onClick={() => window.location.assign(home)}>Go to my dashboard</Button>} />
    </div>
  );
}

/** Root redirect: send authenticated users to their role home. */
export function RoleHomeRedirect() {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  if (!token || !user) return <Navigate to="/login" replace />;
  return <Navigate to={homeForRoles(user.roles)} replace />;
}
