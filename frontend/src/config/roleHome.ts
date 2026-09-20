import type { RoleCode } from '@/types';

/** Post-login landing route per role (first matching role wins, ordered by privilege). */
const ROLE_HOME: Record<RoleCode, string> = {
  SUPER_ADMIN: '/admin',
  ADMIN: '/admin',
  MANAGER: '/manager',
  WAITER: '/waiter',
  CASHIER: '/cashier',
  KITCHEN: '/kitchen',
  BAR: '/bar',
  HOST: '/host',
};

const PRIORITY: RoleCode[] = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'CASHIER', 'HOST', 'WAITER', 'KITCHEN', 'BAR'];

export function homeForRoles(roles: RoleCode[]): string {
  const primary = PRIORITY.find((r) => roles.includes(r));
  return primary ? ROLE_HOME[primary] : '/login';
}

export function primaryRole(roles: RoleCode[]): RoleCode | undefined {
  return PRIORITY.find((r) => roles.includes(r));
}
