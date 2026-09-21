import type { RoleCode } from '@/types';
import { primaryRole } from './roleHome';

/**
 * WORKSPACES — presentation, not permission.
 * ==========================================
 *
 * The product is used by four audiences with genuinely different jobs, and the reference boards
 * draw them differently. A workspace names one of those audiences so a shared screen can present
 * itself appropriately without being forked:
 *
 *   `admin`       the owner's back office. Its design is signed off and **must not change**.
 *   `manager`     the floor manager's command centre — the six manager boards.
 *   `operations`  waiter, cashier, kitchen, bar and host: in-service tools, used standing up.
 *   `guest`       the customer's QR menu. No staff chrome ever reaches it.
 *
 * TWO RULES THAT MATTER MORE THAN THE REST
 * ----------------------------------------
 *
 * 1. **A workspace is derived from the signed-in role, never from the URL.** `/admin/suppliers` is
 *    a route that an admin and a manager both reach; the prefix says where the screen lives, not
 *    who is looking at it. Deriving presentation from the path would have given the manager the
 *    admin's design on two thirds of their screens and the manager's design to the admin on none.
 *
 * 2. **A workspace grants nothing.** It selects a surface, a layout variant and a rail. Every
 *    capability still comes from `hasPermission`, which is a mirror of what the server enforces.
 *    If switching workspace could ever change what a request is allowed to do, this file would be
 *    a privilege-escalation bug rather than a styling helper — so nothing here is ever consulted
 *    by a guard, a mutation or an API call, and the read-only presentations below are driven by
 *    the *absence of a permission*, not by the workspace.
 */

export type Workspace = 'admin' | 'manager' | 'operations' | 'guest';

const BY_ROLE: Record<RoleCode, Workspace> = {
  SUPER_ADMIN: 'admin',
  ADMIN: 'admin',
  MANAGER: 'manager',
  CASHIER: 'operations',
  HOST: 'operations',
  WAITER: 'operations',
  KITCHEN: 'operations',
  BAR: 'operations',
};

/**
 * The workspace for a set of roles.
 *
 * Uses the same privilege ordering as `homeForRoles`, so someone who is both an admin and a
 * manager gets the admin workspace — the same account lands on the admin dashboard, and a person
 * whose home screen is the back office should not find the rest of the product restyled around
 * them. No roles at all (a signed-out visitor on the public menu) is a guest.
 */
export function workspaceForRoles(roles: RoleCode[] | undefined | null): Workspace {
  const primary = roles?.length ? primaryRole(roles) : undefined;
  return primary ? BY_ROLE[primary] : 'guest';
}
