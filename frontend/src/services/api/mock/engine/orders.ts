import { type Ctx, errors, now, audit, assertPermission, assertAuth, hasPermission, nextId, nextDocNumber, clone, userName, currentBranch } from './context';
import { syncTableStatus } from './tables';
import { onOrderConfirmed, reverseForOrderItem } from './p2/inventory';
import type { Order, OrderItem, OrderItemStatus, OrderStatus, OrderListParams, CreateOrderRequest, NewOrderItemInput, CancelItemRequest, OrderStatusHistory, Ticket, TicketStatus, PrepLocation } from '@/types';
import { deriveOrderStatus, deriveTicketStatus, canTransitionItem, isOrderActive, isAtLeast } from '@/utils/orderStatus';
import { round2 } from '@/utils/money';
import type { DbTicket } from '../db';

/**
 * An order, scoped to the caller's branch — see the note on `findBill`. Every mutation on this
 * screen resolves its order through here, so the predicate has to live here rather than at each
 * call site, where one missed copy is a cross-branch write.
 */
function findOrder(ctx: Ctx, id: number): Order {
  const o = ctx.db.orders.find((x) => x.id === Number(id) && x.branchId === ctx.branchId);
  if (!o) throw errors.notFound('Order not found');
  return o;
}

function addHistory(ctx: Ctx, o: Order, from: OrderStatus | null, to: OrderStatus, note?: string): void {
  ctx.db.orderHistory.push({ id: nextId(ctx.db, 'history'), orderId: o.id, fromStatus: from, toStatus: to, changedBy: ctx.user?.id ?? null, changedByName: ctx.user?.fullName ?? null, changedAt: now(), note: note ?? null });
}

/** ORDER_PKG.recalculate — subtotal, derived status, table sync, event. */
export function recalculate(ctx: Ctx, o: Order): void {
  const active = o.items.filter((i) => i.status !== 'CANCELLED');
  o.subtotal = round2(active.reduce((a, i) => a + i.lineTotal, 0));
  o.itemCount = active.reduce((a, i) => a + i.quantity, 0);
  const next = deriveOrderStatus(o.status, o.items.map((i) => i.status));
  if (next !== o.status) {
    addHistory(ctx, o, o.status, next, 'derived from items');
    o.status = next;
    if (next === 'CANCELLED' && !o.cancelledAt) o.cancelledAt = now();
  }
  o.updatedAt = now();
  syncTableStatus(ctx, o.tableId);
  ctx.emit('orders', 'order.updated', o.id);
}

export function setOrderStatus(ctx: Ctx, id: number, status: OrderStatus, note?: string): void {
  const o = findOrder(ctx, id);
  if (o.status === status) return;
  addHistory(ctx, o, o.status, status, note);
  o.status = status;
  if (status === 'COMPLETED') o.completedAt = now();
  o.updatedAt = now();
  syncTableStatus(ctx, o.tableId);
  ctx.emit('orders', 'order.status', o.id);
}

export function hydrateOrder(ctx: Ctx, o: Order): Order {
  const bill = ctx.db.bills.find((b) => b.orderId === o.id && b.status !== 'VOID');
  return { ...clone(o), waiterName: userName(ctx.db, o.waiterId), billId: bill?.id ?? null };
}

export function listOrders(ctx: Ctx, q: OrderListParams): Order[] {
  const me = assertPermission(ctx, 'orders:view');
  const all = hasPermission(ctx, 'orders:view:all');
  const statuses = q.status ? (Array.isArray(q.status) ? q.status : String(q.status).split(',')) as OrderStatus[] : null;
  const s = (q.search ?? '').toLowerCase();
  const myTables = new Set(ctx.db.tables.filter((t) => t.assignedWaiterId === me.id).map((t) => t.id));
  return ctx.db.orders
    .filter((o) => o.branchId === ctx.branchId)
    .filter((o) => !statuses || statuses.includes(o.status))
    .filter((o) => !q.active || isOrderActive(o.status))
    .filter((o) => !q.tableId || o.tableId === Number(q.tableId))
    .filter((o) => !q.waiterId || o.waiterId === Number(q.waiterId))
    .filter((o) => !q.location || o.items.some((i) => i.prepLocation === q.location))
    .filter((o) => !q.from || o.createdAt >= q.from)
    .filter((o) => !q.to || o.createdAt <= q.to)
    .filter((o) => !s || o.orderNumber.toLowerCase().includes(s) || o.tableName.toLowerCase().includes(s))
    .filter((o) => all || o.waiterId === me.id || myTables.has(o.tableId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((o) => hydrateOrder(ctx, o));
}

export function getOrder(ctx: Ctx, id: number): Order {
  assertPermission(ctx, 'orders:view');
  return hydrateOrder(ctx, findOrder(ctx, id));
}

function buildItems(ctx: Ctx, o: Order, inputs: NewOrderItemInput[], batchNo: number): OrderItem[] {
  if (!inputs?.length) throw errors.validation('At least one item is required', 'items');
  return inputs.map((inp) => {
    const qty = Number(inp.quantity);
    if (!Number.isFinite(qty) || qty <= 0 || qty > 999) throw errors.validation('Quantity must be between 1 and 999', 'quantity');
    const mi = ctx.db.items.find((x) => x.id === Number(inp.menuItemId) && !x.isDeleted && x.isActive && x.branchId === o.branchId);
    if (!mi) throw errors.validation(`Menu item ${inp.menuItemId} is not available`, 'menuItemId');
    if (!mi.isAvailable) throw errors.business(`${mi.name} is currently unavailable`);
    const tax = ctx.db.taxGroups.find((t) => t.id === mi.taxGroupId);
    const isBottle = ctx.db.p2.bottleService.some((b) => b.menuItemId === mi.id && b.isActive);
    // Rule 4: snapshot name & price
    return {
      id: nextId(ctx.db, 'orderItem'), orderId: o.id, menuItemId: mi.id, batchNo, itemName: mi.name, unitPrice: mi.price, quantity: qty,
      lineTotal: round2(mi.price * qty), prepLocation: mi.prepLocation, taxGroupId: mi.taxGroupId, taxPercent: tax?.totalPercent ?? 0,
      status: 'NEW' as OrderItemStatus, notes: inp.notes?.trim().slice(0, 300) || null, addedAt: now(), startedAt: null, readyAt: null, servedAt: null,
      cancelledAt: null, cancelledBy: null, approvedBy: null, cancelReason: null, isBottleService: isBottle, stockDeducted: false,
    };
  });
}

export function createOrder(ctx: Ctx, body: CreateOrderRequest): Order {
  const me = assertPermission(ctx, 'orders:create');
  const t = ctx.db.tables.find((x) => x.id === Number(body.tableId) && !x.isDeleted && x.isActive && x.branchId === ctx.branchId);
  if (!t) throw errors.validation('Table is invalid', 'tableId');
  const existing = ctx.db.orders.find((o) => o.tableId === t.id && isOrderActive(o.status));
  if (existing && !currentBranch(ctx).allowMultipleOrdersPerTable) throw errors.conflict('This table already has an active order. Add items to it instead.');
  const o: Order = {
    id: nextId(ctx.db, 'order'), orderNumber: nextDocNumber(ctx.db, 'ORD'), branchId: ctx.branchId, tableId: t.id, tableName: t.name, tableNumber: t.number, floorName: t.floorName,
    waiterId: me.id, waiterName: me.fullName, orderType: 'DINE_IN', status: 'DRAFT', guestCount: Number(body.guestCount ?? 1) || 1, notes: body.notes?.trim() || null,
    subtotal: 0, itemCount: 0, items: [], billId: null, customerId: null, customerName: null, reservationId: null, vipResId: null,
    createdAt: now(), confirmedAt: null, billRequestedAt: null, completedAt: null, cancelledAt: null, cancelReason: null, updatedAt: now(),
  };
  // Validate and build the items BEFORE touching the database, so a rejected line leaves no orphan
  // draft behind (the engine stays atomic even when called outside the dispatcher's rollback).
  const initialItems = body.items?.length ? buildItems(ctx, o, body.items, 1) : [];
  ctx.db.orders.push(o);
  addHistory(ctx, o, null, 'DRAFT', 'order created');
  o.items.push(...initialItems);
  recalculate(ctx, o);
  audit(ctx, 'ORDER_CREATED', 'ORDERS', o.id, null, { tableId: t.id, items: body.items?.length ?? 0 });
  ctx.emit('orders', 'order.created', o.id);
  return hydrateOrder(ctx, o);
}

export function updateOrder(ctx: Ctx, id: number, body: { guestCount?: number; notes?: string }): Order {
  assertPermission(ctx, 'orders:create');
  const o = findOrder(ctx, id);
  if (!isOrderActive(o.status)) throw errors.business('Order is closed');
  if (body.guestCount != null) o.guestCount = Math.max(1, Number(body.guestCount));
  if (body.notes !== undefined) o.notes = body.notes?.trim() || null;
  o.updatedAt = now();
  ctx.emit('orders', 'order.updated', o.id);
  return hydrateOrder(ctx, o);
}

/** TICKET_PKG.route_batch — split batch into KOT / BOT. One master order, routed items. */
function routeBatch(ctx: Ctx, o: Order, batchNo: number): void {
  const locs: PrepLocation[] = ['KITCHEN', 'BAR'];
  for (const loc of locs) {
    if (!o.items.some((i) => i.batchNo === batchNo && i.prepLocation === loc && i.status !== 'CANCELLED')) continue;
    const t: DbTicket = { id: nextId(ctx.db, 'ticket'), ticketNumber: nextDocNumber(ctx.db, loc === 'BAR' ? 'BOT' : 'KOT'), orderId: o.id, batchNo, location: loc, createdAt: now() };
    ctx.db.tickets.push(t);
    ctx.emit(loc === 'BAR' ? 'bar' : 'kitchen', 'ticket.created', o.id);
  }
}

export function addItems(ctx: Ctx, id: number, items: NewOrderItemInput[]): Order {
  assertPermission(ctx, 'orders:create');
  const o = findOrder(ctx, id);
  if (isAtLeast(o.status, 'BILL_REQUESTED')) throw errors.business('Cannot add items after the bill has been requested');
  const maxBatch = Math.max(0, ...o.items.map((i) => i.batchNo));
  const batch = o.status === 'DRAFT' ? Math.max(1, maxBatch) : maxBatch + 1;
  o.items.push(...buildItems(ctx, o, items, batch));
  if (o.status !== 'DRAFT') { routeBatch(ctx, o, batch); onOrderConfirmed(ctx, o.id); }   // Section 22: new items routed immediately (+ Phase 2 stock deduction)
  recalculate(ctx, o);
  audit(ctx, 'ORDER_ITEMS_ADDED', 'ORDERS', o.id, null, items);
  return hydrateOrder(ctx, o);
}

export function updateItem(ctx: Ctx, id: number, itemId: number, body: { quantity?: number; notes?: string }): Order {
  assertPermission(ctx, 'orders:create');
  const o = findOrder(ctx, id);
  const it = o.items.find((i) => i.id === Number(itemId));
  if (!it) throw errors.notFound('Order item not found');
  if (o.status !== 'DRAFT' || it.status !== 'NEW') throw errors.business('Only draft items can be edited. Use cancellation instead.');
  if (body.quantity != null) {
    const q = Number(body.quantity);
    if (!Number.isFinite(q) || q <= 0) throw errors.validation('Quantity must be positive', 'quantity');
    it.quantity = q; it.lineTotal = round2(it.unitPrice * q);
  }
  if (body.notes !== undefined) it.notes = body.notes?.trim().slice(0, 300) || null;
  recalculate(ctx, o);
  return hydrateOrder(ctx, o);
}

export function cancelItem(ctx: Ctx, id: number, itemId: number, body: CancelItemRequest): Order {
  const me = assertPermission(ctx, 'orders:cancel:item');
  if (!body.reason?.trim()) throw errors.validation('Cancellation reason is required', 'reason');
  const o = findOrder(ctx, id);
  const it = o.items.find((i) => i.id === Number(itemId));
  if (!it) throw errors.notFound('Order item not found');
  if (it.status === 'CANCELLED' || it.status === 'SERVED') throw errors.business(`Item is already ${it.status.toLowerCase()}`);
  if (isAtLeast(o.status, 'BILLED')) throw errors.business('Cannot cancel items on a billed order');

  let approvedBy: number | null = null;
  const needsApproval = !(o.status === 'DRAFT' && it.status === 'NEW');
  if (needsApproval) {
    if (hasPermission(ctx, 'orders:cancel')) approvedBy = me.id;
    else {
      const approver = ctx.db.users.find((u) => u.id === Number(body.approvedByUserId) && u.isActive && !u.isDeleted);
      if (!approver || !hasPermission(ctx, 'orders:cancel', approver) || !approver.approvalPin || approver.approvalPin !== body.approvalPin) {
        throw errors.forbidden('Manager approval (valid PIN) is required to cancel a confirmed item');
      }
      approvedBy = approver.id;
    }
  }
  const from = it.status;
  Object.assign(it, { status: 'CANCELLED', cancelledAt: now(), cancelledBy: me.id, approvedBy, cancelReason: body.reason.trim().slice(0, 300) });
  reverseForOrderItem(ctx, it.id);   // Phase 2: stock reversal (idempotent)
  audit(ctx, 'ORDER_ITEM_CANCELLED', 'ORDER_ITEMS', it.id, from, `CANCELLED: ${body.reason}`);
  recalculate(ctx, o);
  ctx.emit(it.prepLocation === 'BAR' ? 'bar' : 'kitchen', 'item.cancelled', it.id);
  return hydrateOrder(ctx, o);
}

export function confirmOrder(ctx: Ctx, id: number): Order {
  assertPermission(ctx, 'orders:confirm');
  const o = findOrder(ctx, id);
  if (o.status !== 'DRAFT') throw errors.conflict(`Only draft orders can be confirmed (current: ${o.status})`);
  if (!o.items.some((i) => i.status === 'NEW')) throw errors.validation('Add at least one item before confirming');
  addHistory(ctx, o, 'DRAFT', 'CONFIRMED', 'confirmed by waiter');
  o.status = 'CONFIRMED'; o.confirmedAt = now();
  routeBatch(ctx, o, 1);   // Section 17
  onOrderConfirmed(ctx, o.id);   // Phase 2: recipe / bottle stock deduction when mode = ON_CONFIRM
  recalculate(ctx, o);
  audit(ctx, 'ORDER_CONFIRMED', 'ORDERS', o.id);
  ctx.emit('orders', 'order.confirmed', o.id);
  return hydrateOrder(ctx, o);
}

export function cancelOrder(ctx: Ctx, id: number, reason: string): Order {
  const o = findOrder(ctx, id);
  const me = o.status === 'DRAFT' ? assertPermission(ctx, 'orders:create') : assertPermission(ctx, 'orders:cancel');
  if (!reason?.trim()) throw errors.validation('Cancellation reason is required', 'reason');
  if (isAtLeast(o.status, 'PAID')) throw errors.business('Paid orders cannot be cancelled. Use refund.');
  for (const it of o.items) {
    if (it.status === 'CANCELLED') continue;
    Object.assign(it, { status: 'CANCELLED', cancelledAt: now(), cancelledBy: me.id, approvedBy: me.id, cancelReason: `Order cancelled: ${reason.trim().slice(0, 250)}` });
    reverseForOrderItem(ctx, it.id);   // Phase 2
  }
  const bill = ctx.db.bills.find((b) => b.orderId === o.id && (b.status === 'OPEN' || b.status === 'FINALIZED') && b.paidAmount === 0);
  if (bill) bill.status = 'VOID';
  addHistory(ctx, o, o.status, 'CANCELLED', reason);
  Object.assign(o, { status: 'CANCELLED', cancelledAt: now(), cancelReason: reason.trim().slice(0, 300), updatedAt: now() });
  syncTableStatus(ctx, o.tableId);
  audit(ctx, 'ORDER_CANCELLED', 'ORDERS', o.id, null, reason);
  ctx.emit('orders', 'order.cancelled', o.id);
  ctx.emit('kitchen', 'order.cancelled', o.id);
  ctx.emit('bar', 'order.cancelled', o.id);
  return hydrateOrder(ctx, o);
}

export function requestBill(ctx: Ctx, id: number): Order {
  assertPermission(ctx, 'orders:request-bill');
  const o = findOrder(ctx, id);
  if (o.status === 'DRAFT') throw errors.business('Confirm the order before requesting the bill');
  if (isAtLeast(o.status, 'BILL_REQUESTED')) throw errors.conflict('Bill already requested');
  addHistory(ctx, o, o.status, 'BILL_REQUESTED', 'bill requested');
  o.status = 'BILL_REQUESTED'; o.billRequestedAt = now(); o.updatedAt = now();
  syncTableStatus(ctx, o.tableId);
  audit(ctx, 'BILL_REQUESTED', 'ORDERS', o.id);
  ctx.emit('orders', 'order.bill_requested', o.id);
  ctx.emit('bills', 'order.bill_requested', o.id);
  return hydrateOrder(ctx, o);
}

/** Shared by waiter (SERVED only), kitchen and bar. */
export function setItemStatus(ctx: Ctx, itemId: number, status: OrderItemStatus, location: PrepLocation | null): Order {
  assertAuth(ctx);
  const o = ctx.db.orders.find((x) => x.items.some((i) => i.id === Number(itemId)));
  const it = o?.items.find((i) => i.id === Number(itemId));
  if (!o || !it) throw errors.notFound('Order item not found');
  if (location && it.prepLocation !== location) throw errors.forbidden(`Item does not belong to ${location}`);
  if (!location) {
    assertPermission(ctx, 'orders:item:status');
    if (status !== 'SERVED' && !hasPermission(ctx, 'kitchen:update') && !hasPermission(ctx, 'bar:update')) throw errors.forbidden('Waiters can only mark items as served');
  }
  if (status === 'CANCELLED') throw errors.business('Use the cancellation endpoint');
  if (!canTransitionItem(it.status, status)) throw errors.conflict(`Invalid item transition ${it.status} → ${status}`);
  it.status = status;
  if (status === 'PREPARING') it.startedAt = now();
  if (status === 'READY') it.readyAt = now();
  if (status === 'SERVED') it.servedAt = now();
  recalculate(ctx, o);
  ctx.emit(it.prepLocation === 'BAR' ? 'bar' : 'kitchen', 'item.status', it.id);
  return hydrateOrder(ctx, o);
}

export function history(ctx: Ctx, id: number): OrderStatusHistory[] {
  assertPermission(ctx, 'orders:view');
  findOrder(ctx, id);
  return ctx.db.orderHistory.filter((h) => h.orderId === Number(id)).map(clone);
}

// ------------------------------------------------------------ tickets (no prices — Section 4)
function buildTicket(ctx: Ctx, t: DbTicket): Ticket {
  const o = findOrder(ctx, t.orderId);
  const items = o.items.filter((i) => i.batchNo === t.batchNo && i.prepLocation === t.location);
  return {
    id: t.id, ticketNumber: t.ticketNumber, orderId: o.id, orderNumber: o.orderNumber, batchNo: t.batchNo, tableName: o.tableName, tableNumber: o.tableNumber,
    waiterName: userName(ctx.db, o.waiterId), location: t.location, status: deriveTicketStatus(items.map((i) => i.status)), orderNotes: o.notes ?? null, createdAt: t.createdAt,
    items: items.map((i) => ({ id: i.id, orderId: i.orderId, itemName: i.itemName, quantity: i.quantity, notes: i.notes ?? null, status: i.status, prepLocation: i.prepLocation, addedAt: i.addedAt, startedAt: i.startedAt ?? null, readyAt: i.readyAt ?? null, servedAt: i.servedAt ?? null, cancelReason: i.cancelReason ?? null })),
  };
}

export function listTickets(ctx: Ctx, location: PrepLocation, status?: TicketStatus): Ticket[] {
  assertPermission(ctx, location === 'BAR' ? 'bar:view' : 'kitchen:view');
  return ctx.db.tickets
    .filter((t) => t.location === location)
    .map((t) => buildTicket(ctx, t))
    .filter((t) => (status ? t.status === status : ['NEW', 'PREPARING', 'READY'].includes(t.status)))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function ticketItemStatus(ctx: Ctx, location: PrepLocation, itemId: number, status: OrderItemStatus): Ticket {
  assertPermission(ctx, location === 'BAR' ? 'bar:update' : 'kitchen:update');
  setItemStatus(ctx, itemId, status, location);
  const o = ctx.db.orders.find((x) => x.items.some((i) => i.id === Number(itemId)))!;
  const it = o.items.find((i) => i.id === Number(itemId))!;
  const t = ctx.db.tickets.find((x) => x.orderId === o.id && x.batchNo === it.batchNo && x.location === location);
  if (!t) throw errors.notFound('Ticket not found');
  return buildTicket(ctx, t);
}
