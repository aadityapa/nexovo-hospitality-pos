/**
 * Permission codes — mirror of PERMISSIONS table (database/07_seed.sql + 10_phase2_seed.sql) and docs/RBAC.md.
 * The backend is the source of truth; this list powers route guards and UI affordances.
 */
export const PERMISSIONS = [
  // Phase 1
  'dashboard:view', 'reports:view', 'audit:view',
  'users:view', 'users:manage', 'roles:view', 'roles:manage', 'settings:view', 'settings:manage',
  'menu:view', 'menu:manage', 'menu:availability',
  'offers:view', 'offers:manage',
  'tables:view', 'tables:manage', 'tables:status:override', 'qr:view', 'qr:manage',
  'orders:view', 'orders:view:all', 'orders:create', 'orders:confirm', 'orders:cancel', 'orders:cancel:item',
  'orders:request-bill', 'orders:item:status', 'orders:approve-discount',
  'kitchen:view', 'kitchen:update', 'bar:view', 'bar:update',
  'billing:view', 'billing:create', 'billing:discount', 'billing:pay', 'billing:refund', 'billing:close', 'billing:edit-paid',
  // Phase 2
  'inventory:view', 'inventory:manage', 'inventory:adjust',
  'recipes:view', 'recipes:manage',
  'suppliers:view', 'suppliers:manage',
  'purchases:view', 'purchases:manage', 'purchases:approve', 'purchases:receive',
  'customers:view', 'customers:manage',
  /*
   * LOYALTY IS THREE PERMISSIONS, NOT TWO.
   *
   * `loyalty:manage` used to mean both "adjust this member's points" and "rewrite the programme's
   * rules" — two jobs with very different blast radii. Adjusting points is a daily service
   * gesture, audited and reversible, that a floor manager has to be able to make at the table.
   * Changing the earn rate, the redemption value or the expiry window silently re-prices every
   * point every member holds, retrospectively.
   *
   *   loyalty:view       see the programme and permitted member information
   *   loyalty:manage     supported member operations, including point adjustments
   *   loyalty:configure  edit programme rules: earning, redemption, tiers, expiry, limits
   *
   * Managers keep `view` and `manage`. They do not get `configure` by default. See
   * `database/11_migration_loyalty_configure.sql` for how existing installations are upgraded and
   * `docs/RBAC.md` for what happens to custom roles.
   */
  'loyalty:view', 'loyalty:manage', 'loyalty:configure', 'loyalty:redeem',
  'reservations:view', 'reservations:manage',
  'club:view', 'club:manage',
  'vip:view', 'vip:manage',
  'room-charge:post',
  'branches:view', 'branches:manage',
  'notifications:view', 'notifications:manage',
  'reports:advanced',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type RoleCodeKey = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'WAITER' | 'CASHIER' | 'KITCHEN' | 'BAR' | 'HOST';

const ALL: Permission[] = [...PERMISSIONS];

/** Role → permissions (seed defaults). Used by the mock backend; ORDS returns permissions with the user. */
export const ROLE_PERMISSIONS: Record<RoleCodeKey, Permission[]> = {
  SUPER_ADMIN: ALL,
  ADMIN: ALL,
  MANAGER: [
    'dashboard:view', 'reports:view', 'settings:view',
    'menu:view', 'menu:availability', 'offers:view', 'offers:manage',
    'tables:view', 'tables:manage', 'tables:status:override',
    'orders:view', 'orders:view:all', 'orders:create', 'orders:confirm', 'orders:cancel', 'orders:cancel:item',
    'orders:request-bill', 'orders:item:status', 'orders:approve-discount',
    'kitchen:view', 'kitchen:update', 'bar:view', 'bar:update',
    'billing:view', 'billing:create', 'billing:discount', 'billing:pay', 'billing:refund', 'billing:close',
    'inventory:view', 'inventory:adjust', 'inventory:manage', 'recipes:view', 'recipes:manage', 'suppliers:view',
    'purchases:view', 'purchases:manage', 'purchases:approve', 'purchases:receive',
    // Member operations yes, programme configuration no — see the note on the permission list.
    'customers:view', 'customers:manage', 'loyalty:view', 'loyalty:manage', 'loyalty:redeem',
    'reservations:view', 'reservations:manage', 'club:view', 'club:manage', 'vip:view', 'vip:manage',
    'room-charge:post', 'branches:view', 'notifications:view', 'notifications:manage', 'reports:advanced',
  ],
  WAITER: [
    'menu:view', 'offers:view', 'tables:view',
    'orders:view', 'orders:create', 'orders:confirm', 'orders:cancel:item', 'orders:request-bill', 'orders:item:status',
    'customers:view', 'customers:manage', 'reservations:view', 'notifications:view', 'vip:view',
  ],
  CASHIER: [
    'menu:view', 'offers:view', 'tables:view', 'orders:view', 'orders:view:all',
    'billing:view', 'billing:create', 'billing:discount', 'billing:pay', 'billing:close',
    'customers:view', 'customers:manage', 'loyalty:view', 'loyalty:redeem', 'room-charge:post', 'notifications:view', 'club:view',
  ],
  KITCHEN: ['kitchen:view', 'kitchen:update', 'inventory:view', 'inventory:adjust', 'notifications:view'],
  BAR: ['bar:view', 'bar:update', 'inventory:view', 'inventory:adjust', 'notifications:view'],
  HOST: [
    'tables:view', 'menu:view', 'orders:view', 'orders:view:all', 'orders:create', 'orders:confirm',
    'customers:view', 'customers:manage', 'reservations:view', 'reservations:manage',
    'club:view', 'club:manage', 'vip:view', 'vip:manage', 'notifications:view',
  ],
};

export const ROLE_MAX_DISCOUNT: Record<RoleCodeKey, number> = {
  SUPER_ADMIN: 100, ADMIN: 100, MANAGER: 30, WAITER: 0, CASHIER: 10, KITCHEN: 0, BAR: 0, HOST: 0,
};

export const ROLE_LABELS: Record<RoleCodeKey, string> = {
  SUPER_ADMIN: 'Super Admin', ADMIN: 'Admin', MANAGER: 'Manager', WAITER: 'Waiter',
  CASHIER: 'Cashier', KITCHEN: 'Kitchen Staff', BAR: 'Bar Staff', HOST: 'Host / Door',
};

export const PERMISSION_MODULES: Record<string, string> = {
  dashboard: 'Dashboard', reports: 'Reports', audit: 'Audit', users: 'Users', roles: 'Roles', settings: 'Settings',
  menu: 'Menu', offers: 'Offers', tables: 'Tables', qr: 'QR Codes', orders: 'Orders', kitchen: 'Kitchen', bar: 'Bar', billing: 'Billing',
  inventory: 'Inventory', recipes: 'Recipes', suppliers: 'Suppliers', purchases: 'Purchasing', customers: 'Customers', loyalty: 'Loyalty',
  reservations: 'Reservations', club: 'Club entry', vip: 'VIP tables', 'room-charge': 'Room charges', branches: 'Branches', notifications: 'Notifications',
};

/**
 * Human wording for the permissions whose code is not self-explanatory. The role editor prints
 * these beside the switch, because "loyalty:manage" and "loyalty:configure" look interchangeable
 * and are not.
 */
export const PERMISSION_LABELS: Partial<Record<Permission, string>> = {
  'loyalty:view': 'View the programme and member information',
  'loyalty:manage': 'Member operations, including point adjustments',
  'loyalty:configure': 'Edit programme rules, earning, redemption, tiers, expiry and limits',
  'loyalty:redeem': 'Redeem points against a bill',
};

export function permissionModule(code: Permission): string {
  return code.split(':')[0];
}
