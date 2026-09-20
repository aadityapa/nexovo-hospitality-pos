import type { ID } from './common';
import type { Permission } from '@/config/permissions';

export type RoleCode = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'WAITER' | 'CASHIER' | 'KITCHEN' | 'BAR' | 'HOST';

export interface User {
  id: ID;
  username: string;
  email?: string | null;
  fullName: string;
  phone?: string | null;
  /** home branch */
  branchId: ID;
  /** Phase 2: branches the user may switch to (SUPER_ADMIN → all) */
  branchIds?: ID[];
  /** Phase 2: branch the current session is scoped to */
  currentBranchId?: ID;
  roles: RoleCode[];
  permissions: Permission[];
  isActive: boolean;
  maxDiscountPercent: number;
  lastLoginAt?: string | null;
  createdAt?: string;
}

export interface UserInput {
  username: string;
  fullName: string;
  email?: string;
  phone?: string;
  password?: string;
  roles: RoleCode[];
  isActive: boolean;
  approvalPin?: string;
  /** Phase 2: branch access (defaults to the home branch) */
  branchIds?: ID[];
}

export interface Role {
  id: ID;
  code: RoleCode;
  name: string;
  description?: string | null;
  maxDiscountPercent: number;
  isSystem: boolean;
  permissions: Permission[];
  userCount?: number;
}

/** Minimal directory entry of users who can approve cancellations / discounts (visible to all staff). */
export interface Approver {
  id: ID;
  fullName: string;
  role: string;
  maxDiscountPercent: number;
}

/** Lightweight staff directory entry (id / name / role) for pickers such as host or promoter. */
export interface StaffMember { id: ID; fullName: string; role: string }

export interface PermissionDef {
  code: Permission;
  module: string;
  description: string;
}

export interface LoginRequest {
  username: string;
  password: string;
  rememberMe: boolean;
}

export interface LoginResponse {
  token: string;
  expiresAt: string;
  user: User;
}

export interface AuditLog {
  id: ID;
  userId?: ID | null;
  userName?: string | null;
  action: string;
  entity: string;
  entityId?: ID | null;
  oldValue?: string | null;
  newValue?: string | null;
  createdAt: string;
}
