import { describe, it, expect } from 'vitest';
import { workspaceForRoles } from './workspace';
import { routeSurface, surfaceClass, MANAGER_SURFACE_OVERRIDES, DARK_SURFACE, PAPER_CONTENT, PAPER_SHELL } from './surfaces';
import type { RoleCode } from '@/types';

/**
 * THE §4 BOUNDARY, AS A TEST.
 *
 * The admin design is signed off. Presentation is selected by a workspace derived from the
 * signed-in role, and the whole safety of that arrangement rests on two claims:
 *
 *   1. the admin resolution is IDENTICAL to what it was before workspaces existed, and
 *   2. a workspace can never change what anyone is allowed to do.
 *
 * Claim 1 is easy to break silently — someone adds a route to the manager overlay, fat-fingers the
 * table it goes in, and the admin's screen flips. These tests make that a red build rather than a
 * regression someone notices in a screenshot three days later.
 */

/** Every route the management shell serves, including the parameterised document screens. */
const ROUTES = [
  '/admin', '/admin/orders', '/admin/orders/12', '/admin/tables', '/admin/floors', '/admin/qr',
  '/admin/menu/items', '/admin/menu/categories', '/admin/offers',
  '/admin/inventory', '/admin/inventory/items', '/admin/inventory/items/3', '/admin/inventory/movements',
  '/admin/recipes', '/admin/recipes/7',
  '/admin/suppliers', '/admin/suppliers/2', '/admin/purchases', '/admin/purchases/new', '/admin/purchases/9',
  '/admin/customers', '/admin/customers/5', '/admin/loyalty', '/admin/reservations',
  '/admin/club', '/admin/vip', '/admin/bottle-service', '/admin/room-charges',
  '/admin/reports', '/admin/reports/advanced', '/admin/branches',
  '/admin/users', '/admin/roles', '/admin/audit', '/admin/settings', '/admin/notifications', '/admin/more',
  '/manager', '/manager/live', '/host', '/profile',
];

describe('workspaceForRoles', () => {
  it('maps each role to its audience', () => {
    expect(workspaceForRoles(['SUPER_ADMIN'])).toBe('admin');
    expect(workspaceForRoles(['ADMIN'])).toBe('admin');
    expect(workspaceForRoles(['MANAGER'])).toBe('manager');
    expect(workspaceForRoles(['WAITER'])).toBe('operations');
    expect(workspaceForRoles(['CASHIER'])).toBe('operations');
    expect(workspaceForRoles(['KITCHEN'])).toBe('operations');
    expect(workspaceForRoles(['BAR'])).toBe('operations');
    expect(workspaceForRoles(['HOST'])).toBe('operations');
  });

  /*
   * MULTI-ROLE ACCOUNTS. Real installations hand one person two hats — an owner who also runs the
   * floor, a manager who covers the till. The workspace follows the SAME privilege order as
   * `homeForRoles`, so the person's shell matches the dashboard they were just sent to. An account
   * that lands on the admin dashboard must not then find the rest of the product restyled.
   */
  it('gives a multi-role account the workspace of its highest role, matching its home screen', () => {
    expect(workspaceForRoles(['MANAGER', 'ADMIN'])).toBe('admin');
    expect(workspaceForRoles(['ADMIN', 'MANAGER'])).toBe('admin');
    expect(workspaceForRoles(['WAITER', 'MANAGER'])).toBe('manager');
    expect(workspaceForRoles(['MANAGER', 'CASHIER'])).toBe('manager');
    expect(workspaceForRoles(['CASHIER', 'WAITER'])).toBe('operations');
    expect(workspaceForRoles(['KITCHEN', 'BAR'])).toBe('operations');
  });

  it('treats an account with no roles as a guest', () => {
    expect(workspaceForRoles([])).toBe('guest');
    expect(workspaceForRoles(undefined)).toBe('guest');
    expect(workspaceForRoles(null)).toBe('guest');
    // A role the mapping has never heard of must not silently become an admin.
    expect(workspaceForRoles(['NOT_A_ROLE' as RoleCode])).toBe('guest');
  });
});

describe('the admin surface resolution is frozen', () => {
  it('resolves identically with no workspace and with the admin workspace', () => {
    for (const route of ROUTES) {
      expect(routeSurface(route)).toEqual(routeSurface(route, 'admin'));
    }
  });

  /*
   * The overlay is consulted ONLY for managers. `operations` (host, who also uses this shell) and
   * `guest` must fall through to the frozen table, or a host would inherit manager styling on
   * screens the manager boards restyled.
   */
  it('applies the manager overlay to nobody but the manager', () => {
    for (const { route, admin, manager } of MANAGER_SURFACE_OVERRIDES) {
      const concrete = route.replace(/:[^/]+/g, '1');
      expect(routeSurface(concrete, 'manager')).toEqual(manager);
      expect(routeSurface(concrete, 'admin')).toEqual(admin);
      expect(routeSurface(concrete, 'operations')).toEqual(admin);
      expect(routeSurface(concrete, 'guest')).toEqual(admin);
    }
  });

  it('changes the manager only on the routes the boards actually differ on', () => {
    /* Matched by PATTERN, not by string. `/admin/orders/:id` has to cover `/admin/orders/12`;
       comparing concrete paths silently passed every document screen and made this assertion
       look green while testing nothing. */
    const matches = (pattern: string, path: string) => {
      const p = pattern.split('/').filter(Boolean);
      const q = path.split('/').filter(Boolean);
      return p.length === q.length && p.every((seg, i) => (seg.startsWith(':') ? !!q[i] : seg === q[i]));
    };
    const overridden = (path: string) => MANAGER_SURFACE_OVERRIDES.some((o) => matches(o.route, path));

    for (const route of ROUTES) {
      if (overridden(route)) continue;
      expect({ route, ...routeSurface(route, 'manager') }).toEqual({ route, ...routeSurface(route, 'admin') });
    }
  });

  /* Every override must be a real difference. A no-op entry is dead weight that reads as a
     deliberate decision, which is worse than no entry at all. */
  it('declares no override that matches the admin it overrides', () => {
    for (const { route, admin, manager } of MANAGER_SURFACE_OVERRIDES) {
      expect({ route, ...manager }).not.toEqual({ route, ...admin });
    }
  });

  /*
   * THE THEME TOGGLE WINS.
   *
   * This asserts the rule the whole light theme depends on: under `light`, no island is applied
   * at all. When `surfaceClass` returned `chrome-dark` for a dark-declared route under the light
   * theme, every operational screen stayed charcoal in light mode while the light-theme tokens
   * painted on top of it — light gold on near-black at 3.31:1. A dark-theme sweep cannot see
   * that; only walking BOTH themes does.
   */
  describe('surfaceClass', () => {
    it('applies no island under the light theme, whatever the route declared', () => {
      expect(surfaceClass('dark', 'light')).toBeUndefined();
      expect(surfaceClass('light', 'light')).toBeUndefined();
    });

    it('applies the paper island only for a light route inside the dark theme', () => {
      expect(surfaceClass('light', 'dark')).toBe('chrome-light');
      expect(surfaceClass('dark', 'dark')).toBeUndefined();
    });

    it('never returns chrome-dark from the route table', () => {
      for (const want of ['dark', 'light'] as const) {
        for (const theme of ['dark', 'light'] as const) {
          expect(surfaceClass(want, theme)).not.toBe('chrome-dark');
        }
      }
    });
  });

  it('only ever resolves to one of the three declared surfaces', () => {
    const known = [DARK_SURFACE, PAPER_CONTENT, PAPER_SHELL];
    for (const route of ROUTES) {
      for (const ws of ['admin', 'manager', 'operations', 'guest'] as const) {
        expect(known).toContainEqual(routeSurface(route, ws));
      }
    }
  });
});
