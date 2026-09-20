import { type Ctx, errors, now, audit, assertPermission, nextId, clone, userName, currentBranch } from './context';
import type { Floor, FloorInput, DiningTable, TableInput, TableStatus, Branch, BranchInput } from '@/types';
import { tableStatusForOrder, isOrderActive } from '@/utils/orderStatus';

const rnd = (len = 12) => Array.from({ length: len }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');

// ------------------------------------------------------------ branch (current context branch)
export function getBranch(ctx: Ctx): Branch { return clone(currentBranch(ctx)); }

export function updateBranch(ctx: Ctx, body: BranchInput): Branch {
  assertPermission(ctx, 'settings:manage');
  if (body.serviceChargePercent != null && (body.serviceChargePercent < 0 || body.serviceChargePercent > 100)) throw errors.validation('Service charge must be 0–100', 'serviceChargePercent');
  if (body.roundingMode && !['NEAREST', 'UP', 'DOWN', 'NONE'].includes(body.roundingMode)) throw errors.validation('Invalid rounding mode', 'roundingMode');
  if (body.stockDeductionMode && !['ON_CONFIRM', 'ON_BILL_CLOSE', 'MANUAL'].includes(body.stockDeductionMode)) throw errors.validation('Invalid stock deduction mode', 'stockDeductionMode');
  if (body.minSpendShortfallMode && !['CHARGE_DIFFERENCE', 'WAIVE', 'FLAT_FEE'].includes(body.minSpendShortfallMode)) throw errors.validation('Invalid minimum-spend rule', 'minSpendShortfallMode');
  const b = currentBranch(ctx);
  const old = clone(b);
  Object.assign(b, body);
  audit(ctx, 'SETTINGS_UPDATED', 'BRANCHES', b.id, old, body);
  return clone(b);
}

// ------------------------------------------------------------ floors (branch-scoped)
export function listFloors(ctx: Ctx): Floor[] {
  assertPermission(ctx, 'tables:view');
  return ctx.db.floors.filter((f) => !f.isDeleted && f.branchId === ctx.branchId).sort((a, b) => a.displayOrder - b.displayOrder)
    .map((f) => ({ id: f.id, branchId: f.branchId, code: f.code, name: f.name, displayOrder: f.displayOrder, isActive: f.isActive, tableCount: ctx.db.tables.filter((t) => t.floorId === f.id && !t.isDeleted).length }));
}

export function saveFloor(ctx: Ctx, id: number | null, body: FloorInput): Floor {
  assertPermission(ctx, 'tables:manage');
  const name = String(body.name ?? '').trim();
  if (!name) throw errors.validation('Floor name is required', 'name');
  const code = (body.code?.trim() || name.toUpperCase().replace(/[^A-Z0-9]/g, '')).slice(0, 20);
  if (ctx.db.floors.some((f) => !f.isDeleted && f.id !== id && f.branchId === ctx.branchId && f.code === code)) throw errors.conflict('Floor code already exists');
  let f: MockFloor;
  if (id == null) {
    f = { id: nextId(ctx.db, 'floor'), branchId: ctx.branchId, code, name, displayOrder: body.displayOrder ?? ctx.db.floors.filter((x) => x.branchId === ctx.branchId).length + 1, isActive: body.isActive ?? true, isDeleted: false };
    ctx.db.floors.push(f);
    audit(ctx, 'FLOOR_CREATED', 'FLOORS', f.id, null, body);
  } else {
    const found = ctx.db.floors.find((x) => x.id === id && !x.isDeleted);
    if (!found) throw errors.notFound('Floor not found');
    Object.assign(found, { code, name, displayOrder: body.displayOrder ?? found.displayOrder, isActive: body.isActive ?? true });
    ctx.db.tables.filter((t) => t.floorId === id).forEach((t) => { t.floorName = name; });
    f = found;
    audit(ctx, 'FLOOR_UPDATED', 'FLOORS', f.id, null, body);
  }
  ctx.emit('tables', 'floor.saved', f.id);
  return listFloors(ctx).find((x) => x.id === f.id)!;
}
type MockFloor = Ctx['db']['floors'][number];

export function deleteFloor(ctx: Ctx, id: number): null {
  assertPermission(ctx, 'tables:manage');
  const f = ctx.db.floors.find((x) => x.id === id && !x.isDeleted);
  if (!f) throw errors.notFound('Floor not found');
  const cnt = ctx.db.tables.filter((t) => t.floorId === id && !t.isDeleted).length;
  if (cnt > 0) throw errors.business(`Floor still has ${cnt} tables`);
  f.isDeleted = true; f.isActive = false;
  audit(ctx, 'FLOOR_DELETED', 'FLOORS', id);
  ctx.emit('tables', 'floor.deleted', id);
  return null;
}

// ------------------------------------------------------------ tables
export function hydrateTable(ctx: Ctx, t: DiningTable): DiningTable {
  const order = ctx.db.orders.find((o) => o.tableId === t.id && isOrderActive(o.status));
  return {
    ...clone(t),
    assignedWaiterName: t.assignedWaiterId ? userName(ctx.db, t.assignedWaiterId) : null,
    activeOrderId: order?.id ?? null,
    activeOrderNumber: order?.orderNumber ?? null,
    activeOrderStatus: order?.status ?? null,
    activeOrderTotal: order?.subtotal ?? null,
    occupiedSince: order?.createdAt ?? null,
  };
}

export function listTables(ctx: Ctx, q: { floorId?: number; status?: TableStatus; search?: string; waiterId?: number }): DiningTable[] {
  assertPermission(ctx, 'tables:view');
  const s = (q.search ?? '').toLowerCase();
  const floorOrder = new Map(ctx.db.floors.map((f) => [f.id, f.displayOrder]));
  return ctx.db.tables
    .filter((t) => !t.isDeleted && t.branchId === ctx.branchId)
    .filter((t) => !q.floorId || t.floorId === Number(q.floorId))
    .filter((t) => !q.status || t.status === q.status)
    .filter((t) => !q.waiterId || t.assignedWaiterId === Number(q.waiterId))
    .filter((t) => !s || t.name.toLowerCase().includes(s) || t.number.toLowerCase().includes(s))
    .sort((a, b) => (floorOrder.get(a.floorId) ?? 0) - (floorOrder.get(b.floorId) ?? 0) || a.number.localeCompare(b.number, undefined, { numeric: true }))
    .map((t) => hydrateTable(ctx, t));
}

export function getTable(ctx: Ctx, id: number): DiningTable {
  assertPermission(ctx, 'tables:view');
  const t = ctx.db.tables.find((x) => x.id === id && !x.isDeleted);
  if (!t) throw errors.notFound('Table not found');
  return hydrateTable(ctx, t);
}

export function saveTable(ctx: Ctx, id: number | null, body: TableInput): DiningTable {
  assertPermission(ctx, 'tables:manage');
  const number = String(body.number ?? '').trim();
  const capacity = Number(body.capacity ?? 4);
  if (!number) throw errors.validation('Table number is required', 'number');
  if (!Number.isInteger(capacity) || capacity <= 0) throw errors.validation('Capacity must be a positive whole number', 'capacity');
  const floor = ctx.db.floors.find((f) => f.id === Number(body.floorId) && !f.isDeleted && f.branchId === ctx.branchId);
  if (!floor) throw errors.validation('Floor is invalid', 'floorId');
  if (ctx.db.tables.some((t) => !t.isDeleted && t.id !== id && t.branchId === ctx.branchId && t.number.toLowerCase() === number.toLowerCase())) throw errors.conflict(`Table number "${number}" already exists`);
  const name = body.name?.trim() || `Table ${number}`;
  const vip = { isVip: !!body.isVip, minSpendDefault: Math.max(0, Number(body.minSpendDefault ?? 0)), depositDefault: Math.max(0, Number(body.depositDefault ?? 0)) };
  let t: MockTable;
  if (id == null) {
    t = { id: nextId(ctx.db, 'table'), branchId: ctx.branchId, floorId: floor.id, floorName: floor.name, number, name, capacity, publicCode: rnd(), qrVersion: 1, status: 'AVAILABLE', statusOverride: false, assignedWaiterId: null, assignedWaiterName: null, activeOrderId: null, activeOrderNumber: null, activeOrderStatus: null, activeOrderTotal: null, occupiedSince: null, isActive: body.isActive ?? true, isDeleted: false, createdAt: now(), ...vip };
    ctx.db.tables.push(t);
    audit(ctx, 'TABLE_CREATED', 'DINING_TABLES', t.id, null, body);
  } else {
    const found = ctx.db.tables.find((x) => x.id === id && !x.isDeleted && x.branchId === ctx.branchId);
    if (!found) throw errors.notFound('Table not found');
    Object.assign(found, { floorId: floor.id, floorName: floor.name, number, name, capacity, isActive: body.isActive ?? true, ...vip });
    t = found;
    audit(ctx, 'TABLE_UPDATED', 'DINING_TABLES', t.id, null, body);
  }
  ctx.emit('tables', 'table.saved', t.id);
  return hydrateTable(ctx, t);
}
type MockTable = Ctx['db']['tables'][number];

export function deleteTable(ctx: Ctx, id: number): null {
  assertPermission(ctx, 'tables:manage');
  const t = ctx.db.tables.find((x) => x.id === id && !x.isDeleted);
  if (!t) throw errors.notFound('Table not found');
  if (ctx.db.orders.some((o) => o.tableId === id && isOrderActive(o.status))) throw errors.business('Table has an active order and cannot be deleted');
  t.isDeleted = true; t.isActive = false;
  audit(ctx, 'TABLE_DELETED', 'DINING_TABLES', id);
  ctx.emit('tables', 'table.deleted', id);
  return null;
}

export function overrideStatus(ctx: Ctx, id: number, status: TableStatus, reason: string): DiningTable {
  assertPermission(ctx, 'tables:status:override');
  const t = ctx.db.tables.find((x) => x.id === id && !x.isDeleted);
  if (!t) throw errors.notFound('Table not found');
  const valid: TableStatus[] = ['AVAILABLE', 'OCCUPIED', 'ORDERING', 'PREPARING', 'READY', 'BILLING', 'PAYMENT_PENDING', 'CLOSED'];
  if (!valid.includes(status)) throw errors.validation('Invalid status', 'status');
  const old = t.status;
  t.status = status;
  t.statusOverride = status !== 'AVAILABLE';
  if (status === 'AVAILABLE') syncTableStatus(ctx, id);
  audit(ctx, 'TABLE_STATUS_OVERRIDE', 'DINING_TABLES', id, old, `${status} (${reason || 'no reason'})`);
  ctx.emit('tables', 'table.status', id);
  return hydrateTable(ctx, t);
}

export function assignWaiter(ctx: Ctx, id: number, waiterId: number | null): DiningTable {
  assertPermission(ctx, 'tables:manage');
  const t = ctx.db.tables.find((x) => x.id === id && !x.isDeleted);
  if (!t) throw errors.notFound('Table not found');
  if (waiterId != null && !ctx.db.users.some((u) => u.id === waiterId && !u.isDeleted)) throw errors.validation('Waiter not found', 'waiterId');
  t.assignedWaiterId = waiterId;
  audit(ctx, 'TABLE_ASSIGNED', 'DINING_TABLES', id, null, String(waiterId));
  ctx.emit('tables', 'table.assigned', id);
  return hydrateTable(ctx, t);
}

export function regenerateQr(ctx: Ctx, id: number): DiningTable {
  assertPermission(ctx, 'qr:manage');
  const t = ctx.db.tables.find((x) => x.id === id && !x.isDeleted);
  if (!t) throw errors.notFound('Table not found');
  t.publicCode = rnd(); t.qrVersion += 1;
  audit(ctx, 'TABLE_QR_REGENERATED', 'DINING_TABLES', id);
  return hydrateTable(ctx, t);
}

/** TABLE_PKG.sync_status_from_order equivalent — called by the order engine after every change. */
export function syncTableStatus(ctx: Ctx, tableId: number): void {
  const t = ctx.db.tables.find((x) => x.id === tableId);
  if (!t || t.statusOverride) return;
  const order = ctx.db.orders.find((o) => o.tableId === tableId && isOrderActive(o.status));
  const bill = order ? ctx.db.bills.find((b) => b.orderId === order.id && b.status !== 'VOID') : undefined;
  const next = tableStatusForOrder(order?.status ?? null, bill ? bill.grandTotal - bill.paidAmount : 0);
  if (t.status !== next) { t.status = next; ctx.emit('tables', 'table.status', tableId); }
}
