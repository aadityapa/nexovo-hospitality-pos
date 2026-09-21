/**
 * End-to-end business workflow against the mock engine (same rules the PL/SQL packages implement):
 * LOGIN → CREATE ORDER → ADD ITEMS → CONFIRM → KITCHEN/BAR RECEIVE → STATUS UPDATES → REQUEST BILL
 * → GENERATE BILL → DISCOUNT (cap + approval) → PAYMENTS (split, no overpayment) → CLOSE.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { createSeedDb, type MockDb } from '../db';
import type { Ctx } from './context';
import * as auth from './auth';
import * as orders from './orders';
import * as billing from './billing';
import * as menu from './menu';
import * as reports from './reports';
import { ApiError } from '../../client';

let db: MockDb;
const ctx = (username: string | null): Ctx => ({ db, user: username ? db.users.find((u) => u.username === username)! : null, branchId: 1, emit: () => {} });
const item = (code: string) => db.items.find((i) => i.code === code)!.id;
const table = (n: string) => db.tables.find((t) => t.number === n)!.id;
const expectApi = (fn: () => unknown, status: number) => {
  let err: unknown = null;
  try { fn(); } catch (e) { err = e; }
  expect(err, `expected ApiError ${status}`).toBeInstanceOf(ApiError);
  expect((err as ApiError).status).toBe(status);
};

/**
 * The clock is pinned before the seed is built.
 *
 * The seed carries a real Happy Hour offer (16:00–19:00, 20% off cocktails). Every expectation
 * below that involves money — subtotal, service charge, tax, the discount cap — is only correct
 * when that offer is NOT live, so running the suite between 4 and 7 in the afternoon made it fail
 * on arithmetic that was perfectly right. The bug was the test's dependence on wall-clock time,
 * not the billing engine, so the clock is fixed rather than the numbers.
 *
 * 11:00 is deliberately outside every time-windowed offer in the seed.
 */
const FIXED_CLOCK = new Date(2026, 0, 14, 11, 0, 0);   // Wednesday, 11:00 local
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(FIXED_CLOCK);
  db = createSeedDb();
});
afterAll(() => { vi.useRealTimers(); });

describe('authentication & RBAC', () => {
  it('logs in with valid credentials and rejects invalid ones', () => {
    const res = auth.login(ctx(null), { username: 'waiter1', password: 'Waiter@123', rememberMe: false });
    expect(res.user.roles).toEqual(['WAITER']);
    expect(res.user.permissions).toContain('orders:create');
    expect(res.user.permissions).not.toContain('reports:view');
    expect(auth.resolveSession(ctx(null), res.token)?.username).toBe('waiter1');
    expectApi(() => auth.login(ctx(null), { username: 'waiter1', password: 'wrong', rememberMe: false }), 401);
  });
  it('enforces permissions on the backend, not just the UI', () => {
    expectApi(() => reports.dashboard(ctx('waiter1'), '2020-01-01', '2030-01-01'), 403);
    expectApi(() => menu.saveItem(ctx('kitchen'), null, { name: 'x', categoryId: 1, price: 1, prepLocation: 'KITCHEN', taxGroupId: 1, isVeg: true, isPopular: false, isAvailable: true, isActive: true }), 403);
    expectApi(() => orders.listTickets(ctx('waiter1'), 'KITCHEN'), 403);
    expectApi(() => orders.createOrder(ctx(null), { tableId: table('1'), items: [] }), 401);
  });
});

describe('order lifecycle', () => {
  it('runs the full flow end-to-end', () => {
    const w = ctx('waiter1');
    // create draft with kitchen + bar items (price snapshot)
    let o = orders.createOrder(w, { tableId: table('4'), guestCount: 2, items: [{ menuItemId: item('BG01'), quantity: 2, notes: 'No onion' }, { menuItemId: item('CK01'), quantity: 1 }] });
    expect(o.status).toBe('DRAFT');
    expect(o.orderNumber).toMatch(/^ORD-\d{8}-\d{4}$/);
    expect(o.subtotal).toBe(2 * 350 + 450);
    // Rule 2: one active order per table
    expectApi(() => orders.createOrder(w, { tableId: table('4'), items: [] }), 409);
    // confirm → routed to KOT + BOT, table ORDERING
    o = orders.confirmOrder(w, o.id);
    expect(o.status).toBe('CONFIRMED');
    expect(db.tickets.filter((t) => t.orderId === o.id).map((t) => t.location).sort()).toEqual(['BAR', 'KITCHEN']);
    expect(db.tables.find((t) => t.id === o.tableId)!.status).toBe('ORDERING');
    // menu price change must not affect the order (Rule 4)
    const burger = db.items.find((i) => i.code === 'BG01')!;
    menu.saveItem(ctx('admin'), burger.id, { name: burger.name, categoryId: burger.categoryId, price: 999, prepLocation: 'KITCHEN', taxGroupId: burger.taxGroupId, isVeg: false, isPopular: true, isAvailable: true, isActive: true });
    expect(orders.getOrder(w, o.id).items.find((i) => i.menuItemId === burger.id)!.unitPrice).toBe(350);
    // kitchen sees only kitchen items, no prices
    const kot = orders.listTickets(ctx('kitchen'), 'KITCHEN');
    expect(kot).toHaveLength(1);
    expect(kot[0].items.map((i) => i.itemName)).toEqual(['Chicken Burger']);
    expect(JSON.stringify(kot)).not.toContain('unitPrice');
    // kitchen cannot touch bar items; waiter cannot mark preparing
    const barItem = o.items.find((i) => i.prepLocation === 'BAR')!;
    const kItem = o.items.find((i) => i.prepLocation === 'KITCHEN')!;
    expectApi(() => orders.ticketItemStatus(ctx('kitchen'), 'KITCHEN', barItem.id, 'PREPARING'), 403);
    expectApi(() => orders.setItemStatus(w, kItem.id, 'PREPARING', null), 403);
    orders.ticketItemStatus(ctx('kitchen'), 'KITCHEN', kItem.id, 'PREPARING');
    expect(orders.getOrder(w, o.id).status).toBe('IN_PROGRESS');
    orders.ticketItemStatus(ctx('kitchen'), 'KITCHEN', kItem.id, 'READY');
    expect(orders.getOrder(w, o.id).status).toBe('PARTIALLY_READY');
    orders.ticketItemStatus(ctx('bar'), 'BAR', barItem.id, 'PREPARING');
    orders.ticketItemStatus(ctx('bar'), 'BAR', barItem.id, 'READY');
    expect(orders.getOrder(w, o.id).status).toBe('READY');
    // add items later → new batch routed immediately (Section 22)
    o = orders.addItems(w, o.id, [{ menuItemId: item('ST03'), quantity: 1 }]);
    expect(Math.max(...o.items.map((i) => i.batchNo))).toBe(2);
    expect(db.tickets.filter((t) => t.orderId === o.id && t.location === 'KITCHEN')).toHaveLength(2);
    expect(o.status).toBe('PARTIALLY_READY');
    const fries = o.items.find((i) => i.batchNo === 2)!;
    // waiter cancelling a confirmed item needs manager PIN
    expectApi(() => orders.cancelItem(w, o.id, fries.id, { reason: 'changed mind' }), 403);
    expectApi(() => orders.cancelItem(w, o.id, fries.id, { reason: 'changed mind', approvedByUserId: 3, approvalPin: '0000' }), 403);
    o = orders.cancelItem(w, o.id, fries.id, { reason: 'changed mind', approvedByUserId: 3, approvalPin: '1234' });
    expect(o.items.find((i) => i.id === fries.id)!.status).toBe('CANCELLED');
    expect(o.items.find((i) => i.id === fries.id)!.approvedBy).toBe(3);
    expect(o.items).toHaveLength(3);   // history kept
    // serve everything
    for (const it of o.items.filter((i) => i.status === 'READY')) orders.setItemStatus(w, it.id, 'SERVED', null);
    expect(orders.getOrder(w, o.id).status).toBe('SERVED');
    // request bill → no more items
    o = orders.requestBill(w, o.id);
    expect(o.status).toBe('BILL_REQUESTED');
    expectApi(() => orders.addItems(w, o.id, [{ menuItemId: item('ST03'), quantity: 1 }]), 422);
    expect(db.tables.find((t) => t.id === o.tableId)!.status).toBe('BILLING');

    // ---- cashier
    const c = ctx('cashier');
    let b = billing.createBill(c, o.id);
    expect(b.billNumber).toMatch(/^BILL-\d{8}-\d{4}$/);
    expect(b.items).toHaveLength(2);                                   // cancelled item excluded
    expect(billing.createBill(c, o.id).id).toBe(b.id);                 // idempotent
    expect(b.subtotal).toBe(1150);
    expect(b.serviceChargeAmount).toBe(57.5);
    // cashier cap 10% → 20% needs manager approval
    expectApi(() => billing.addDiscount(c, b.id, { discountType: 'PERCENTAGE', value: 20, reason: 'vip' }), 403);
    b = billing.addDiscount(c, b.id, { discountType: 'PERCENTAGE', value: 20, reason: 'vip', approvedByUserId: 3, approvalPin: '1234' });
    expect(b.orderDiscountTotal).toBe(230);
    expect(b.discounts[0].approvedBy).toBe(3);
    b = billing.removeDiscount(c, b.id, b.discounts[0].id);
    b = billing.addDiscount(c, b.id, { discountType: 'FLAT', value: 100, reason: 'regular' });
    expect(b.orderDiscountTotal).toBe(100);
    // payment before finalize is rejected
    expectApi(() => billing.addPayment(c, b.id, { method: 'CASH', amount: 100 }), 422);
    b = billing.finalizeBill(c, b.id);
    expect(b.status).toBe('FINALIZED');
    expect(orders.getOrder(c, o.id).status).toBe('BILLED');
    expectApi(() => billing.addDiscount(c, b.id, { discountType: 'FLAT', value: 10, reason: 'late' }), 422);
    // overpayment rejected, split payment accepted
    expectApi(() => billing.addPayment(c, b.id, { method: 'CASH', amount: b.grandTotal + 1 }), 400);
    expectApi(() => billing.closeBill(c, b.id), 422);
    b = billing.addPayment(c, b.id, { method: 'CASH', amount: 500 });
    expect(b.paymentStatus).toBe('PARTIALLY_PAID');
    expect(b.balanceDue).toBe(b.grandTotal - 500);
    expectApi(() => billing.addPayment(c, b.id, { method: 'COMPLIMENTARY', amount: 10 }), 403);
    b = billing.addPayment(c, b.id, { method: 'UPI', amount: b.balanceDue, reference: 'UPI123' });
    expect(b.paymentStatus).toBe('PAID');
    expect(b.status).toBe('PAID');
    expect(b.payments.map((p) => p.paymentNumber).every((n) => /^PAY-\d{8}-\d{4}$/.test(n))).toBe(true);
    expect(orders.getOrder(c, o.id).status).toBe('PAID');
    // close → order COMPLETED, table AVAILABLE
    b = billing.closeBill(c, b.id);
    expect(b.status).toBe('CLOSED');
    expect(orders.getOrder(c, o.id).status).toBe('COMPLETED');
    expect(db.tables.find((t) => t.id === o.tableId)!.status).toBe('AVAILABLE');
    // receipt totals match bill; reversal keeps the record
    const r = billing.receipt(c, b.id);
    expect(r.bill.grandTotal).toBe(b.grandTotal);
    expectApi(() => billing.reversePayment(c, b.id, b.payments[0].id, 'oops'), 403);   // cashier lacks billing:refund
    const rb = billing.reversePayment(ctx('admin'), b.id, b.payments[0].id, 'wrong tender');
    expect(rb.payments[0].status).toBe('REVERSED');
    expect(rb.payments).toHaveLength(2);
    expect(rb.paymentStatus).toBe('PARTIALLY_PAID');
    // audit trail
    expect(db.audit.map((a) => a.action)).toEqual(expect.arrayContaining(['ORDER_CREATED', 'ORDER_CONFIRMED', 'ORDER_ITEM_CANCELLED', 'BILL_REQUESTED', 'BILL_CREATED', 'DISCOUNT_APPLIED', 'BILL_FINALIZED', 'PAYMENT_RECEIVED', 'BILL_CLOSED', 'PAYMENT_REVERSED', 'MENU_PRICE_CHANGED']));
  });

  it('validates quantities, availability and transitions', () => {
    const w = ctx('waiter1');
    expectApi(() => orders.createOrder(w, { tableId: table('2'), items: [{ menuItemId: item('BG01'), quantity: 0 }] }), 400);
    menu.setAvailability(ctx('manager'), item('BG01'), false);
    expectApi(() => orders.createOrder(w, { tableId: table('2'), items: [{ menuItemId: item('BG01'), quantity: 1 }] }), 422);
    const o = orders.createOrder(w, { tableId: table('2'), items: [{ menuItemId: item('CK01'), quantity: 1 }] });
    expectApi(() => orders.requestBill(w, o.id), 422);          // draft cannot request bill
    orders.confirmOrder(w, o.id);
    expectApi(() => orders.confirmOrder(w, o.id), 409);          // already confirmed
    const it = orders.getOrder(w, o.id).items[0];
    expectApi(() => orders.ticketItemStatus(ctx('bar'), 'BAR', it.id, 'SERVED'), 409);   // NEW → SERVED invalid
  });

  it('manager can cancel a confirmed order; paid orders cannot be cancelled', () => {
    const w = ctx('waiter1');
    const o = orders.confirmOrder(w, orders.createOrder(w, { tableId: table('6'), items: [{ menuItemId: item('IN01'), quantity: 1 }] }).id);
    expectApi(() => orders.cancelOrder(w, o.id, 'no show'), 403);
    const cancelled = orders.cancelOrder(ctx('manager'), o.id, 'no show');
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.items.every((i) => i.status === 'CANCELLED')).toBe(true);
    expect(db.tables.find((t) => t.id === o.tableId)!.status).toBe('AVAILABLE');
  });
});
