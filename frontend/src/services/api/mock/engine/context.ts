import { ApiError } from '../../client';
import type { MockDb, DbUser } from '../db';
import type { Permission } from '@/config/permissions';
import type { User, RoleCode } from '@/types';
import type { RealtimeTopic } from '@/services/realtime/types';

/** Per-request context (equivalent of API_PKG.set_context + SEC_PKG in Oracle). */
export interface Ctx {
  db: MockDb;
  user: DbUser | null;
  /** Phase 2: branch the request is scoped to (validated against USER_BRANCHES by the client) */
  branchId: number;
  emit: (topic: RealtimeTopic, type: string, entityId?: number | null) => void;
}

/** Branch record for the current context (branch 1 lives in db.branch, others in db.p2.branches). */
export function currentBranch(ctx: Ctx) {
  return ctx.branchId === ctx.db.branch.id ? ctx.db.branch : (ctx.db.p2.branches.find((b) => b.id === ctx.branchId) ?? ctx.db.branch);
}

export const now = (): string => new Date().toISOString();

export const errors = {
  validation: (message: string, field?: string) => new ApiError(400, message, [{ field, message, code: 'VALIDATION' }]),
  unauthorized: (message = 'Authentication required') => new ApiError(401, message),
  forbidden: (message = 'You do not have permission to perform this action') => new ApiError(403, message),
  notFound: (message = 'Resource not found') => new ApiError(404, message),
  conflict: (message: string) => new ApiError(409, message),
  business: (message: string) => new ApiError(422, message),
};

export function nextId(db: MockDb, key: string): number {
  db.seq[key] = (db.seq[key] ?? 0) + 1;
  return db.seq[key];
}

/** ORD-YYYYMMDD-0001 — NUMBERING_PKG equivalent (single-threaded in the browser). */
export function nextDocNumber(db: MockDb, type: 'ORD' | 'BILL' | 'PAY' | 'KOT' | 'BOT' | 'PO' | 'GRN' | 'RES' | 'ENT' | 'VIP'): string {
  const d = new Date();
  const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const cur = db.docSeq[type];
  const last = cur && cur.date === date ? cur.last : 0;
  db.docSeq[type] = { date, last: last + 1 };
  return `${type}-${date}-${String(last + 1).padStart(4, '0')}`;
}

export function userPermissions(db: MockDb, u: DbUser): Permission[] {
  const set = new Set<Permission>();
  for (const r of u.roles) db.roles.find((x) => x.code === r)?.permissions.forEach((p) => set.add(p));
  return [...set];
}

export function userMaxDiscount(db: MockDb, u: DbUser): number {
  return Math.max(0, ...u.roles.map((r) => db.roles.find((x) => x.code === r)?.maxDiscountPercent ?? 0));
}

export function hasPermission(ctx: Ctx, p: Permission, u: DbUser | null = ctx.user): boolean {
  return !!u && userPermissions(ctx.db, u).includes(p);
}

export function assertAuth(ctx: Ctx): DbUser {
  if (!ctx.user) throw errors.unauthorized();
  return ctx.user;
}

export function assertPermission(ctx: Ctx, p: Permission): DbUser {
  const u = assertAuth(ctx);
  if (!hasPermission(ctx, p, u)) throw errors.forbidden(`Missing permission: ${p}`);
  return u;
}

export function toUser(db: MockDb, u: DbUser, currentBranchId?: number): User {
  const branchIds = u.roles.includes('SUPER_ADMIN')
    ? [db.branch.id, ...db.p2.branches.map((b) => b.id)]
    : db.p2.userBranches.filter((ub) => ub.userId === u.id).sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.branchId - b.branchId).map((ub) => ub.branchId);
  return {
    id: u.id, username: u.username, email: u.email, fullName: u.fullName, phone: u.phone, branchId: u.branchId,
    branchIds: branchIds.length ? branchIds : [u.branchId], currentBranchId: currentBranchId ?? u.branchId,
    roles: u.roles as RoleCode[], permissions: userPermissions(db, u), isActive: u.isActive,
    maxDiscountPercent: userMaxDiscount(db, u), lastLoginAt: u.lastLoginAt ?? null, createdAt: u.createdAt,
  };
}

export function audit(ctx: Ctx, action: string, entity: string, entityId?: number | null, oldValue?: unknown, newValue?: unknown): void {
  const str = (v: unknown) => (v === undefined || v === null ? null : typeof v === 'string' ? v : JSON.stringify(v));
  ctx.db.audit.unshift({ id: nextId(ctx.db, 'audit'), userId: ctx.user?.id ?? null, userName: ctx.user?.fullName ?? null, action, entity, entityId: entityId ?? null, oldValue: str(oldValue), newValue: str(newValue), createdAt: now() });
  if (ctx.db.audit.length > 2000) ctx.db.audit.length = 2000;
}

export function userName(db: MockDb, id?: number | null): string {
  return db.users.find((u) => u.id === id)?.fullName ?? '—';
}

export const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
