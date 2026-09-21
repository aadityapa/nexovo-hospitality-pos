import { useEffect, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuthStore, isSessionExpired } from '@/store/authStore';
import { homeForRoles } from '@/config/roleHome';
import type { Permission } from '@/config/permissions';
import { Button } from '@/components/ui';

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

/**
 * The permission wall.
 *
 * Composed rather than assembled from `EmptyState`, because this is the one screen in the product
 * whose entire job is a single sentence and a way out. The reference board draws it as a large
 * disc, a heading, one line of explanation and one gold action — no card, no chrome, centred in
 * whatever space the layout gives it.
 *
 * `window.location.assign` rather than a router navigation is deliberate: a 403 usually means the
 * cached queries for this area are for a role that cannot read them, and a full document load is
 * the cheapest way to be certain the operator lands somewhere consistent.
 */
export function Forbidden({ home }: { home: string }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <span
          className="mx-auto h-24 w-24 rounded-full grid place-items-center bg-neutral-100 ring-1 ring-inset ring-neutral-200"
          aria-hidden
        >
          <span className="h-16 w-16 rounded-full grid place-items-center bg-surface-raised ring-1 ring-inset ring-neutral-200 shadow-card">
            <ShieldAlert className="h-7 w-7 text-neutral-500" />
          </span>
        </span>
        <h1 className="mt-6 text-heading sm:text-display font-semibold tracking-[-0.02em] text-neutral-900">Access denied</h1>
        <p className="mt-2 text-[13px] text-neutral-500 leading-relaxed">
          Your role does not have permission to view this page.
        </p>
        <Button className="mt-6" onClick={() => window.location.assign(home)}>Go to my dashboard</Button>
      </div>
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
