import { type Ctx, errors, now, toUser, audit, assertAuth, assertPermission, nextId, userPermissions, userMaxDiscount } from './context';
import type { LoginRequest, LoginResponse, User, UserInput, Role, PermissionDef, Paginated, AuditLog, Approver, StaffMember } from '@/types';
import { PERMISSIONS, type Permission } from '@/config/permissions';
import type { DbUser } from '../db';

const rndToken = () => {
  const bytes = new Uint8Array(24);
  if (typeof globalThis.crypto?.getRandomValues === 'function') globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};

export function login(ctx: Ctx, body: LoginRequest): LoginResponse {
  const username = String(body?.username ?? '').trim().toLowerCase();
  const password = String(body?.password ?? '');
  if (!username || !password) throw errors.validation('Username and password are required');
  const u = ctx.db.users.find((x) => !x.isDeleted && (x.username.toLowerCase() === username || x.email.toLowerCase() === username));
  if (!u || u.password !== password) throw errors.unauthorized('Invalid username or password');
  if (!u.isActive) throw errors.unauthorized('Account is disabled. Contact your administrator.');
  const token = rndToken();
  const expiresAt = new Date(Date.now() + (body.rememberMe ? 30 * 24 : 24) * 3600 * 1000).toISOString();
  ctx.db.sessions.push({ token, userId: u.id, expiresAt, revoked: false });
  u.lastLoginAt = now();
  ctx.user = u;
  audit(ctx, 'LOGIN', 'USERS', u.id);
  return { token, expiresAt, user: toUser(ctx.db, u) };
}

export function logout(ctx: Ctx, token: string | null): null {
  const s = ctx.db.sessions.find((x) => x.token === token);
  if (s) s.revoked = true;
  if (ctx.user) audit(ctx, 'LOGOUT', 'USERS', ctx.user.id);
  return null;
}

export function resolveSession(ctx: Ctx, token: string | null): DbUser | null {
  if (!token) return null;
  const s = ctx.db.sessions.find((x) => x.token === token && !x.revoked && new Date(x.expiresAt).getTime() > Date.now());
  if (!s) return null;
  const u = ctx.db.users.find((x) => x.id === s.userId && x.isActive && !x.isDeleted);
  return u ?? null;
}

export function me(ctx: Ctx): User {
  return toUser(ctx.db, assertAuth(ctx), ctx.branchId);
}

export function forgotPassword(ctx: Ctx, email: string): null {
  audit(ctx, 'PASSWORD_RESET_REQUESTED', 'USERS', null, null, email);
  return null;
}

// ---------------------------------------------------------------- users
export function listApprovers(ctx: Ctx): Approver[] {
  assertAuth(ctx);
  return ctx.db.users
    .filter((u) => u.isActive && !u.isDeleted && !!u.approvalPin && userPermissions(ctx.db, u).includes('orders:approve-discount'))
    .map((u) => ({ id: u.id, fullName: u.fullName, role: u.roles.map((r) => ctx.db.roles.find((x) => x.code === r)?.name ?? r).join(', '), maxDiscountPercent: userMaxDiscount(ctx.db, u) }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

/** Lightweight staff directory for pickers (host / promoter). Any authenticated staff may call this. */
export function listStaff(ctx: Ctx, q: { role?: string }): StaffMember[] {
  assertAuth(ctx);
  return ctx.db.users
    .filter((u) => u.isActive && !u.isDeleted && u.branchId === ctx.branchId && (!q.role || u.roles.some((r) => r === q.role || r === 'MANAGER' || r === 'ADMIN')))
    .map((u) => ({ id: u.id, fullName: u.fullName, role: u.roles.map((r) => ctx.db.roles.find((x) => x.code === r)?.name ?? r).join(', ') }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

export function listUsers(ctx: Ctx, q: { search?: string; role?: string; status?: string }): User[] {
  assertPermission(ctx, 'users:view');
  const s = (q.search ?? '').toLowerCase();
  return ctx.db.users
    .filter((u) => !u.isDeleted)
    // Phase 2: only staff with access to the current branch (super admins always listed)
    .filter((u) => u.roles.includes('SUPER_ADMIN') || u.branchId === ctx.branchId || ctx.db.p2.userBranches.some((ub) => ub.userId === u.id && ub.branchId === ctx.branchId))
    .filter((u) => !s || u.fullName.toLowerCase().includes(s) || u.username.includes(s) || u.email.toLowerCase().includes(s))
    .filter((u) => !q.role || u.roles.includes(q.role as DbUser['roles'][number]))
    .filter((u) => !q.status || (q.status === 'ACTIVE' ? u.isActive : !u.isActive))
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
    .map((u) => toUser(ctx.db, u));
}

export function saveUser(ctx: Ctx, id: number | null, body: UserInput): User {
  assertPermission(ctx, 'users:manage');
  const username = String(body.username ?? '').trim().toLowerCase();
  if (!username) throw errors.validation('Username is required', 'username');
  if (!body.fullName?.trim()) throw errors.validation('Full name is required', 'fullName');
  if (!body.roles?.length) throw errors.validation('At least one role is required', 'roles');
  if (body.roles.some((r) => !ctx.db.roles.find((x) => x.code === r))) throw errors.validation('Invalid role', 'roles');
  const dup = ctx.db.users.find((u) => !u.isDeleted && u.id !== id && (u.username === username || (body.email && u.email.toLowerCase() === body.email.toLowerCase())));
  if (dup) throw errors.conflict('Username or email already exists');
  let u: DbUser;
  if (id == null) {
    if (!body.password || body.password.length < 6) throw errors.validation('Password must be at least 6 characters', 'password');
    u = { id: nextId(ctx.db, 'user'), username, email: body.email ?? '', fullName: body.fullName.trim(), phone: body.phone ?? '', branchId: ctx.branchId, roles: body.roles, password: body.password, approvalPin: body.approvalPin || undefined, isActive: body.isActive ?? true, isDeleted: false, createdAt: now() };
    ctx.db.users.push(u);
    ctx.db.p2.userBranches.push({ userId: u.id, branchId: ctx.branchId, isDefault: true });
    audit(ctx, 'USER_CREATED', 'USERS', u.id);
  } else {
    const found = ctx.db.users.find((x) => x.id === id && !x.isDeleted);
    if (!found) throw errors.notFound('User not found');
    u = found;
    Object.assign(u, { username, email: body.email ?? '', fullName: body.fullName.trim(), phone: body.phone ?? '', roles: body.roles, isActive: body.isActive ?? u.isActive });
    if (body.password) { if (body.password.length < 6) throw errors.validation('Password must be at least 6 characters', 'password'); u.password = body.password; }
    if (body.approvalPin) u.approvalPin = body.approvalPin;
    audit(ctx, 'USER_UPDATED', 'USERS', u.id);
  }
  return toUser(ctx.db, u);
}

export function setUserStatus(ctx: Ctx, id: number, isActive: boolean): User {
  const me = assertPermission(ctx, 'users:manage');
  if (me.id === id && !isActive) throw errors.business('You cannot deactivate your own account');
  const u = ctx.db.users.find((x) => x.id === id && !x.isDeleted);
  if (!u) throw errors.notFound('User not found');
  u.isActive = isActive;
  if (!isActive) ctx.db.sessions.filter((s) => s.userId === id).forEach((s) => { s.revoked = true; });
  audit(ctx, 'USER_STATUS', 'USERS', id, null, isActive ? 'Y' : 'N');
  return toUser(ctx.db, u);
}

export function setPassword(ctx: Ctx, id: number, password: string): null {
  assertPermission(ctx, 'users:manage');
  if (!password || password.length < 6) throw errors.validation('Password must be at least 6 characters', 'password');
  const u = ctx.db.users.find((x) => x.id === id && !x.isDeleted);
  if (!u) throw errors.notFound('User not found');
  u.password = password;
  audit(ctx, 'USER_PASSWORD_CHANGED', 'USERS', id);
  return null;
}

// ---------------------------------------------------------------- roles
export function listRoles(ctx: Ctx): Role[] {
  assertPermission(ctx, 'roles:view');
  return ctx.db.roles.map((r) => ({ ...r, userCount: ctx.db.users.filter((u) => !u.isDeleted && u.roles.includes(r.code)).length }));
}

export function listPermissions(ctx: Ctx): PermissionDef[] {
  assertPermission(ctx, 'roles:view');
  return PERMISSIONS.map((code) => ({ code, module: code.split(':')[0], description: code }));
}

export function updateRole(ctx: Ctx, id: number, body: { permissions?: Permission[]; maxDiscountPercent?: number }): Role[] {
  assertPermission(ctx, 'roles:manage');
  const r = ctx.db.roles.find((x) => x.id === id);
  if (!r) throw errors.notFound('Role not found');
  if (r.code === 'SUPER_ADMIN') throw errors.business('Super Admin role cannot be modified');
  if (body.maxDiscountPercent != null) {
    if (body.maxDiscountPercent < 0 || body.maxDiscountPercent > 100) throw errors.validation('Max discount must be 0–100', 'maxDiscountPercent');
    r.maxDiscountPercent = body.maxDiscountPercent;
  }
  if (body.permissions) {
    if (body.permissions.some((p) => !PERMISSIONS.includes(p))) throw errors.validation('Invalid permission', 'permissions');
    r.permissions = [...new Set(body.permissions)];
  }
  audit(ctx, 'ROLE_UPDATED', 'ROLES', id, null, body);
  // refresh permissions of the current user object if affected
  if (ctx.user) ctx.user = { ...ctx.user };
  return listRoles(ctx);
}

export function listAudit(ctx: Ctx, q: { entity?: string; from?: string; to?: string; page?: number; pageSize?: number }): Paginated<AuditLog> {
  assertPermission(ctx, 'audit:view');
  const page = Math.max(1, Number(q.page ?? 1));
  const pageSize = Math.min(200, Math.max(1, Number(q.pageSize ?? 50)));
  const rows = ctx.db.audit
    .filter((a) => !q.entity || a.entity === q.entity)
    .filter((a) => !q.from || a.createdAt >= q.from)
    .filter((a) => !q.to || a.createdAt <= q.to);
  return { items: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize };
}

export function permissionsOf(ctx: Ctx, u: DbUser): Permission[] { return userPermissions(ctx.db, u); }
