/**
 * MOCK ENGINE — organisation / branches / outlets / user-branch access (mirror of BRANCH_PKG).
 * Branch isolation: every engine list filters by ctx.branchId; the client validates X-Branch-Id via userCanAccess.
 */
import { type Ctx, errors, audit, assertAuth, assertPermission, nextId, clone, toUser } from '../context';
import type { BranchSummary, BranchCreateInput, Outlet, OutletInput, User, Branch, ID } from '@/types';

export function allBranches(ctx: Ctx): Branch[] { return [ctx.db.branch, ...ctx.db.p2.branches]; }

export function userCanAccess(ctx: Ctx, userId: ID, branchId: ID): boolean {
  const u = ctx.db.users.find((x) => x.id === userId);
  if (!u) return false;
  if (u.roles.includes('SUPER_ADMIN')) return allBranches(ctx).some((b) => b.id === branchId);
  return ctx.db.p2.userBranches.some((ub) => ub.userId === userId && ub.branchId === branchId);
}

export function userBranchIds(ctx: Ctx, userId: ID): ID[] {
  const u = ctx.db.users.find((x) => x.id === userId);
  if (u?.roles.includes('SUPER_ADMIN')) return allBranches(ctx).map((b) => b.id);
  return ctx.db.p2.userBranches.filter((ub) => ub.userId === userId).sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.branchId - b.branchId).map((ub) => ub.branchId);
}

/** Any authenticated user — returns only the branches they may work in (needed by the header switcher). */
export function listBranches(ctx: Ctx): BranchSummary[] {
  const me = assertAuth(ctx);
  return allBranches(ctx).filter((b) => userCanAccess(ctx, me.id, b.id)).map((b) => ({
    id: b.id, code: b.code, businessName: b.businessName, name: b.name, city: b.city ?? null, orgName: ctx.db.p2.organizations[0]?.name ?? 'Nexovo Hospitality', isActive: true,
    outletCount: ctx.db.p2.outlets.filter((o) => o.branchId === b.id).length, tableCount: ctx.db.tables.filter((t) => t.branchId === b.id && !t.isDeleted).length, isCurrent: b.id === ctx.branchId,
  }));
}

export function saveBranch(ctx: Ctx, id: ID | null, body: BranchCreateInput): BranchSummary[] {
  const me = assertPermission(ctx, 'branches:manage');
  const code = String(body.code ?? '').trim().toUpperCase(), biz = String(body.businessName ?? '').trim(), name = String(body.name ?? '').trim();
  if (!code || !biz || !name) throw errors.validation('Code, business name and branch name are required', 'code');
  if (allBranches(ctx).some((b) => b.id !== id && b.code === code)) throw errors.conflict('Branch code already exists');
  if (id == null) {
    const b: Branch = { ...clone(ctx.db.branch), id: nextId(ctx.db, 'branch') + 1, code, businessName: biz, name, address: body.address ?? null, city: body.city ?? null, phone: body.phone ?? null, gstNumber: body.gstNumber ?? null, logoUrl: null, welcomeMessage: `Welcome to ${biz} ${name}` };
    ctx.db.p2.branches.push(b);
    // usable immediately: default floor + copied tax groups (branch-scoped in the mock via the shared taxGroups list)
    ctx.db.floors.push({ id: nextId(ctx.db, 'floor'), branchId: b.id, code: 'MAIN', name: 'Main Dining', displayOrder: 1, isActive: true, isDeleted: false });
    if (!ctx.db.p2.userBranches.some((ub) => ub.userId === me.id && ub.branchId === b.id)) ctx.db.p2.userBranches.push({ userId: me.id, branchId: b.id, isDefault: false });
    audit(ctx, 'BRANCH_CREATED', 'BRANCHES', b.id, null, body);
  } else {
    const b = allBranches(ctx).find((x) => x.id === id);
    if (!b) throw errors.notFound('Branch not found');
    Object.assign(b, { code, businessName: biz, name, address: body.address ?? b.address, city: body.city ?? b.city, phone: body.phone ?? b.phone, gstNumber: body.gstNumber ?? b.gstNumber });
    audit(ctx, 'BRANCH_UPDATED', 'BRANCHES', b.id, null, body);
  }
  return listBranches(ctx);
}

export function listOutlets(ctx: Ctx): Outlet[] {
  assertPermission(ctx, 'branches:view');
  return ctx.db.p2.outlets.filter((o) => o.branchId === ctx.branchId).map((o) => ({ ...clone(o), floorCount: ctx.db.floors.filter((f) => f.branchId === ctx.branchId && !f.isDeleted && (f as { outletId?: ID }).outletId === o.id).length }));
}

export function saveOutlet(ctx: Ctx, id: ID | null, body: OutletInput): Outlet[] {
  assertPermission(ctx, 'branches:manage');
  const code = String(body.code ?? '').trim().toUpperCase(), name = String(body.name ?? '').trim();
  if (!code || !name) throw errors.validation('Outlet code and name are required', 'name');
  if (!['RESTAURANT', 'BAR', 'CLUB', 'CAFE', 'LOUNGE', 'ROOM_SERVICE', 'BANQUET'].includes(body.outletType)) throw errors.validation('Invalid outlet type', 'outletType');
  if (ctx.db.p2.outlets.some((o) => o.branchId === ctx.branchId && o.id !== id && o.code === code)) throw errors.conflict('Outlet code already exists');
  if (id == null) ctx.db.p2.outlets.push({ id: nextId(ctx.db, 'outlet'), branchId: ctx.branchId, code, name, outletType: body.outletType, isActive: body.isActive ?? true, floorCount: 0 });
  else { const o = ctx.db.p2.outlets.find((x) => x.id === id && x.branchId === ctx.branchId); if (!o) throw errors.notFound('Outlet not found'); Object.assign(o, { code, name, outletType: body.outletType, isActive: body.isActive ?? true }); }
  audit(ctx, 'OUTLET_SAVED', 'OUTLETS', id, null, body);
  return listOutlets(ctx);
}

export function setUserBranches(ctx: Ctx, userId: ID, branchIds: ID[]): User {
  assertPermission(ctx, 'users:manage');
  const u = ctx.db.users.find((x) => x.id === Number(userId) && !x.isDeleted);
  if (!u) throw errors.notFound('User not found');
  const ids = [...new Set((branchIds ?? []).map(Number))].filter((b) => allBranches(ctx).some((x) => x.id === b));
  ctx.db.p2.userBranches = ctx.db.p2.userBranches.filter((ub) => ub.userId !== u.id);
  ids.forEach((b, i) => ctx.db.p2.userBranches.push({ userId: u.id, branchId: b, isDefault: i === 0 }));
  audit(ctx, 'USER_BRANCHES_SET', 'USERS', u.id, null, ids);
  return toUser(ctx.db, u);
}
