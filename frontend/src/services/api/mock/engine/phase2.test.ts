/**
 * Phase 2 business rules against the mock engine (the same rules the 09* PL/SQL packages implement):
 * stock deduction & reversal (idempotent), unit conversion, purchase order → GRN → stock,
 * loyalty earn / redeem / reversal, cover credit, VIP minimum-spend shortfall, room charge,
 * notifications and branch isolation.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createSeedDb, type MockDb } from '../db';
import type { Ctx } from './context';
import * as orders from './orders';
import * as billing from './billing';
import * as inventory from './p2/inventory';
import * as purchasing from './p2/purchasing';
import * as crm from './p2/crm';
import * as guests from './p2/guests';
import * as branches from './p2/branches';
import * as notify from './p2/notify';
import { seedTransactions } from './seedTransactions';
import { seedPhase2Transactions } from './seedPhase2';
import { ApiError } from '../../client';

let db: MockDb;
const ctx = (username: string | null, branchId = 1): Ctx => ({ db, user: username ? db.users.find((u) => u.username === username)! : null, branchId, emit: () => {} });
const item = (code: string) => db.items.find((i) => i.code === code)!.id;
const inv = (name: string) => db.p2.invItems.find((i) => i.name.toLowerCase().includes(name.toLowerCase()))!;
/** Local calendar date, matching the engine (never UTC — the business day is local). */
const ymd = (offsetDays = 0) => { const d = new Date(Date.now() + offsetDays * 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const qtyOf = (id: number) => db.p2.invItems.find((i) => i.id === id)!.currentQty;
const expectApi = (fn: () => unknown, status: number) => {
  let err: unknown = null;
  try { fn(); } catch (e) { err = e; }
  expect(err, `expected ApiError ${status}`).toBeInstanceOf(ApiError);
  expect((err as ApiError).status).toBe(status);
};
/** A free (available, non-VIP) table — the seed already occupies a few. */
const freeTable = () => db.tables.find((t) => !t.isDeleted && t.isActive && !t.isVip && t.status === 'AVAILABLE' && !db.orders.some((o) => o.tableId === t.id && !['PAID', 'COMPLETED', 'CANCELLED'].includes(o.status)))!.id;
/** Take an order from draft to a finalized bill so tender rules can be exercised. */
function billFor(lines: { code: string; quantity: number }[]) {
  const w = ctx('waiter1');
  const o = orders.confirmOrder(w, orders.createOrder(w, { tableId: freeTable(), guestCount: 2, items: lines.map((l) => ({ menuItemId: item(l.code), quantity: l.quantity })) }).id);
  orders.requestBill(w, o.id);
  const c = ctx('cashier');
  const bill = billing.createBill(c, o.id);
  return { order: o, bill: billing.finalizeBill(c, bill.id), cashier: c };
}

beforeEach(() => {
  db = createSeedDb();
  seedTransactions(ctx(null));        // Phase 1 demo orders/bills
  seedPhase2Transactions(ctx(null));  // opening stock, recipes, POs, customers, bookings, second branch
});

// The seeds swallow their own errors so the demo app still boots; assert here that they actually ran,
// otherwise every downstream expectation would fail for a confusing reason.
describe('seed integrity', () => {
  it('leaves opening stock, recipes, purchase orders, customers and a second branch', () => {
    expect(db.p2.invItems.every((i) => i.currentQty > 0), 'opening stock posted').toBe(true);
    expect(db.p2.recipes.length).toBeGreaterThan(0);
    expect(db.p2.purchaseOrders.length).toBeGreaterThan(0);
    expect(db.p2.customers.length).toBeGreaterThan(0);
    expect(db.p2.bottleService.length).toBeGreaterThan(0);
    expect(db.p2.branches.some((b) => b.code === 'HYD')).toBe(true);
    expect(db.bills.length).toBeGreaterThan(0);
  });
});

describe('inventory: deduction, reversal and idempotency', () => {
  it('deducts recipe ingredients when an order is confirmed, converting units', () => {
    const beef = inv('chicken breast');                       // recipe uses grams, stock is kept in kilograms
    const before = qtyOf(beef.id);
    const w = ctx('waiter1');
    const o = orders.confirmOrder(w, orders.createOrder(w, { tableId: freeTable(), items: [{ menuItemId: item('BG01'), quantity: 2 }] }).id);
    const after = qtyOf(beef.id);
    expect(after).toBeLessThan(before);
    // 150 g + 5% wastage, twice → 0.315 kg
    expect(Number((before - after).toFixed(3))).toBe(0.315);
    expect(db.p2.movements.filter((m) => m.refType === 'ORDER_ITEM' && m.type === 'SALE_CONSUMPTION').length).toBeGreaterThan(0);
    // the same order confirmed twice must not deduct twice (idempotency key per order item + ingredient)
    const movementCount = db.p2.movements.length;
    inventory.onOrderConfirmed(w, o.id);
    expect(db.p2.movements.length).toBe(movementCount);
    expect(qtyOf(beef.id)).toBe(after);
  });

  it('reverses stock when an item is cancelled and never double-reverses', () => {
    const beef = inv('chicken breast');
    const before = qtyOf(beef.id);
    const w = ctx('waiter1');
    const o = orders.confirmOrder(w, orders.createOrder(w, { tableId: freeTable(), items: [{ menuItemId: item('BG01'), quantity: 1 }] }).id);
    expect(qtyOf(beef.id)).toBeLessThan(before);
    const m = ctx('manager');
    const mgr = db.users.find((u) => u.username === 'manager')!;
    orders.cancelItem(m, o.id, o.items[0].id, { reason: 'Guest changed mind', approvedByUserId: mgr.id, approvalPin: mgr.approvalPin! });
    expect(qtyOf(beef.id)).toBeCloseTo(before, 6);
    const reversals = db.p2.movements.filter((x) => x.type === 'CONSUMPTION_REVERSAL').length;
    inventory.reverseForOrderItem(m, o.items[0].id);
    expect(db.p2.movements.filter((x) => x.type === 'CONSUMPTION_REVERSAL').length).toBe(reversals);
  });

  it('honours the branch stock deduction mode', () => {
    const a = ctx('admin');
    db.branch.stockDeductionMode = 'MANUAL';
    const beef = inv('chicken breast');
    const before = qtyOf(beef.id);
    const w = ctx('waiter1');
    const o = orders.confirmOrder(w, orders.createOrder(w, { tableId: freeTable(), items: [{ menuItemId: item('BG01'), quantity: 1 }] }).id);
    expect(qtyOf(beef.id)).toBe(before);            // nothing deducted yet
    expectApi(() => inventory.deductManual(ctx('waiter1'), o.id), 403);
    inventory.deductManual(a, o.id);
    expect(qtyOf(beef.id)).toBeLessThan(before);
  });

  it('blocks negative stock unless the item allows it, and records manual adjustments', () => {
    const a = ctx('admin');
    const target = inv('chicken breast');
    expectApi(() => inventory.manualMovement(a, { invItemId: target.id, type: 'ADJUSTMENT', qty: -99999, reason: 'Overdraw' }), 422);
    const updated = inventory.manualMovement(a, { invItemId: target.id, type: 'WASTAGE', qty: -1, reason: 'Spoiled' });
    expect(updated.currentQty).toBe(qtyOf(target.id));
    expect(db.p2.movements.some((m) => m.type === 'WASTAGE' && m.reason === 'Spoiled')).toBe(true);
  });
});

describe('purchasing: PO workflow and goods receipt', () => {
  it('walks DRAFT → SENT → APPROVED → ORDERED → RECEIVED and increases stock', () => {
    const a = ctx('admin');
    const target = inv('chicken breast');
    const before = qtyOf(target.id);
    const po = purchasing.savePo(a, null, { supplierId: 1, items: [{ invItemId: target.id, qty: 10, unitId: target.unitId, unitPrice: 300, taxPercent: 0 }] });
    expect(po.status).toBe('DRAFT');
    expect(po.poNumber).toMatch(/^PO-\d{8}-\d{4}$/);
    expectApi(() => purchasing.receiveGoods(a, po.id, { items: [] }), 422);          // cannot receive a draft
    expect(purchasing.transitionPo(a, po.id, 'SEND').status).toBe('SENT');
    expect(purchasing.transitionPo(a, po.id, 'APPROVE').status).toBe('APPROVED');
    expect(purchasing.transitionPo(a, po.id, 'ORDER').status).toBe('ORDERED');
    const full = purchasing.getPo(a, po.id);
    const received = purchasing.receiveGoods(a, po.id, { invoiceNo: 'INV-1', items: full.items.map((i) => ({ poItemId: i.id, receivedQty: i.qty, damagedQty: 0 })) });
    expect(received.status).toBe('RECEIVED');
    expect(qtyOf(target.id)).toBe(before + 10);
    expect(db.p2.movements.some((m) => m.type === 'PURCHASE' && m.refType === 'GRN')).toBe(true);
    // a fully received PO is closed — no further receipts, so stock cannot be added twice
    const before2 = qtyOf(target.id);
    expectApi(() => purchasing.receiveGoods(a, po.id, { items: full.items.map((i) => ({ poItemId: i.id, receivedQty: 1, damagedQty: 0 })) }), 422);
    expect(qtyOf(target.id)).toBe(before2);
  });

  it('records a partial receipt as PARTIALLY_RECEIVED', () => {
    const a = ctx('admin');
    const target = inv('chicken breast');
    const po = purchasing.savePo(a, null, { supplierId: 1, items: [{ invItemId: target.id, qty: 10, unitId: target.unitId, unitPrice: 300, taxPercent: 0 }] });
    purchasing.transitionPo(a, po.id, 'SEND'); purchasing.transitionPo(a, po.id, 'APPROVE'); purchasing.transitionPo(a, po.id, 'ORDER');
    const full = purchasing.getPo(a, po.id);
    const out = purchasing.receiveGoods(a, po.id, { items: [{ poItemId: full.items[0].id, receivedQty: 4, damagedQty: 0 }] });
    expect(out.status).toBe('PARTIALLY_RECEIVED');
  });
});

describe('CRM & loyalty', () => {
  it('earns points on closing a bill and reverses them when the payment is reversed', () => {
    const a = ctx('admin');
    const c = crm.saveCustomer(a, null, { fullName: 'Test Guest', phone: '+910000000001', consentMarketing: false });
    const { order, bill, cashier } = billFor([{ code: 'BG01', quantity: 1 }]);
    crm.attachToOrder(cashier, order.id, c.id);
    const paid = billing.addPayment(cashier, bill.id, { method: 'CASH', amount: bill.grandTotal });
    expect(paid.paymentStatus).toBe('PAID');
    const closed = billing.closeBill(cashier, bill.id);
    expect(closed.loyaltyPointsEarned).toBeGreaterThan(0);
    const acct = crm.accountJson(a, c.id);
    expect(acct.pointsBalance).toBe(closed.loyaltyPointsEarned);
    expect(crm.customerHistory(a, c.id).visits.length).toBe(1);
  });

  it('redeems points as a payment within the program caps', () => {
    const a = ctx('admin');
    const c = crm.saveCustomer(a, null, { fullName: 'Loyal Guest', phone: '+910000000002', consentMarketing: false });
    crm.adjust(a, c.id, 5000, 'Seed balance');
    const { order, bill, cashier } = billFor([{ code: 'BG01', quantity: 2 }]);
    crm.attachToOrder(cashier, order.id, c.id);
    const p = db.p2.loyaltyProgram;
    const maxPts = Math.floor((bill.grandTotal * p.maxRedeemPercent) / 100 / p.pointValue);
    expectApi(() => crm.redeemOnBill(cashier, bill.id, maxPts + 500, billing.refreshPaymentStatus), 400);
    const after = crm.redeemOnBill(cashier, bill.id, maxPts, billing.refreshPaymentStatus);
    expect(after.payments.some((x) => x.method === 'LOYALTY')).toBe(true);
    expect(after.balanceDue).toBeLessThan(bill.grandTotal);
    // reversing the loyalty payment returns the points
    const balBefore = crm.accountJson(a, c.id).pointsBalance;
    const pay = after.payments.find((x) => x.method === 'LOYALTY')!;
    billing.reversePayment(ctx('manager'), after.id, pay.id, 'wrong customer');
    expect(crm.accountJson(a, c.id).pointsBalance).toBe(balBefore + maxPts);
  });

  it('anonymises a deleted customer but keeps the visit history', () => {
    const a = ctx('admin');
    const c = crm.saveCustomer(a, null, { fullName: 'Erase Me', phone: '+910000000003', email: 'erase@example.com', consentMarketing: true });
    const { order, bill, cashier } = billFor([{ code: 'BG01', quantity: 1 }]);
    crm.attachToOrder(cashier, order.id, c.id);
    billing.addPayment(cashier, bill.id, { method: 'CASH', amount: bill.grandTotal });
    billing.closeBill(cashier, bill.id);
    const visitsBefore = db.p2.customerVisits.filter((v) => v.customerId === c.id).length;
    expect(visitsBefore).toBe(1);
    crm.deleteCustomer(a, c.id);
    expect(db.p2.customerVisits.filter((v) => v.customerId === c.id).length).toBe(visitsBefore);   // history kept for reporting
    const row = db.p2.customers.find((x) => x.id === c.id)!;
    expect(row.fullName).not.toContain('Erase');
    expect(row.email).toBeNull();
    expect(row.consentMarketing).toBe(false);
    expect(crm.listCustomers(a, {}).some((x) => x.id === c.id)).toBe(false);
  });
});

describe('club, VIP and room charges', () => {
  it('applies cover credit as a payment, capped at the unused credit', () => {
    const host = ctx('host');
    const entry = guests.checkIn(host, { guestName: 'Credit Guest', guests: 2, entryType: 'WALK_IN', coverTypeId: 3, paymentMethod: 'CASH' });
    expect(entry.remainingCredit).toBeGreaterThan(0);
    // a bill larger than the credit, so the credit is consumed in full and a balance remains
    const { bill, cashier } = billFor([{ code: 'BG01', quantity: 8 }]);
    expect(bill.grandTotal).toBeGreaterThan(entry.remainingCredit);
    const after = guests.redeemCover(cashier, bill.id, entry.id, 999999, billing.refreshPaymentStatus);
    const applied = after.payments.find((p) => p.method === 'COVER_CREDIT')!;
    expect(applied.amount).toBe(entry.remainingCredit);            // capped at the unused credit, never overdrawn
    expect(after.balanceDue).toBe(bill.grandTotal - applied.amount);
    expect(guests.listEntries(host, {}).find((e) => e.id === entry.id)!.remainingCredit).toBe(0);
    expectApi(() => guests.redeemCover(cashier, bill.id, entry.id, undefined, billing.refreshPaymentStatus), 400);
  });

  /** Seats a fresh VIP booking with one cheap item so the table is far below its minimum spend. */
  const vipBillUnderMinimum = () => {
    const a = ctx('admin');
    const today = ymd();
    const vipTable = db.tables.find((t) => t.isVip && t.status === 'AVAILABLE' && !db.p2.vipReservations.some((v) => v.tableId === t.id && v.date === today && ['BOOKED', 'SEATED'].includes(v.status)))!;
    const v = guests.saveVip(a, null, { tableId: vipTable.id, guestName: 'Big Spender', date: today, guests: 4, minSpend: 50000, depositAmount: 0, depositPaid: false });
    const seated = guests.transitionVip(a, v.id, 'SEAT');
    const w = ctx('waiter1');
    orders.addItems(w, seated.orderId!, [{ menuItemId: item('BG01'), quantity: 1 }]);
    orders.confirmOrder(w, seated.orderId!);
    const c = ctx('cashier');
    return billing.finalizeBill(c, billing.createBill(c, seated.orderId!).id);
  };

  it('charges the VIP minimum-spend difference on the bill', () => {
    const bill = vipBillUnderMinimum();
    expect(bill.minSpendShortfall).toBeGreaterThan(0);
    expect(bill.grandTotal).toBeGreaterThanOrEqual(50000);         // the shortfall pulls the total up to the minimum
  });

  it('waives the VIP shortfall when the branch rule says so', () => {
    db.branch.minSpendShortfallMode = 'WAIVE';
    const bill = vipBillUnderMinimum();
    expect(bill.minSpendShortfall).toBe(0);
    expect(bill.grandTotal).toBeLessThan(50000);
  });

  it('charges a flat fee when the branch rule says so', () => {
    db.branch.minSpendShortfallMode = 'FLAT_FEE';
    db.branch.minSpendFlatFee = 2500;
    const bill = vipBillUnderMinimum();
    expect(bill.minSpendShortfall).toBe(2500);
  });

  it('posts a room charge only for an occupied room', () => {
    const c0 = ctx('cashier');
    expect(guests.verifyRoom(c0, '211').found).toBe(true);
    expect(guests.verifyRoom(c0, '211').checkedIn).toBe(true);
    expect(guests.verifyRoom(c0, '210').checkedIn).toBe(false);    // rooms ending in 0 are vacant in the simulator
    expect(guests.verifyRoom(c0, '999').found).toBe(false);
    const { bill, cashier } = billFor([{ code: 'BG01', quantity: 1 }]);
    expectApi(() => guests.postToRoom(cashier, bill.id, { roomNo: '210', guestName: 'Nobody' }, billing.refreshPaymentStatus), 422);
    const after = guests.postToRoom(cashier, bill.id, { roomNo: '211', guestName: 'Hotel Guest' }, billing.refreshPaymentStatus);
    expect(after.paymentStatus).toBe('PAID');
    expect(guests.listRoomCharges(cashier, {}).some((r) => r.roomNo === '211' && r.status === 'POSTED')).toBe(true);
    expect(db.p2.roomCharges.some((r) => r.roomNo === '210' && r.status === 'FAILED')).toBe(true);
  });

  it('rejects double-booking a VIP table for the same date', () => {
    const a = ctx('admin');
    const vipTable = db.tables.find((t) => t.isVip)!;
    const date = ymd(30);
    guests.saveVip(a, null, { tableId: vipTable.id, guestName: 'First', date, guests: 2, depositPaid: false });
    expectApi(() => guests.saveVip(a, null, { tableId: vipTable.id, guestName: 'Second', date, guests: 2, depositPaid: false }), 409);
  });
});

describe('reservations', () => {
  it('rejects overlapping bookings on the same table and seats into an order', () => {
    const host = ctx('host');
    const t = db.tables.find((x) => x.id === freeTable())!;
    const date = ymd(5);
    const r = guests.saveReservation(host, null, { guestName: 'Overlap A', phone: '+910000000004', date, time: '20:00', durationMin: 120, guests: 2, tableId: t.id });
    expectApi(() => guests.saveReservation(host, null, { guestName: 'Overlap B', phone: '+910000000005', date, time: '21:00', durationMin: 60, guests: 2, tableId: t.id }), 409);
    guests.transitionReservation(host, r.id, 'CONFIRM');
    const seated = guests.transitionReservation(host, r.id, 'SEAT', t.id);
    expect(seated.status).toBe('SEATED');
    expect(seated.orderId).toBeTruthy();
    expect(db.orders.find((o) => o.id === seated.orderId)!.reservationId).toBe(r.id);
  });
});

describe('notifications & branch isolation', () => {
  it('raises a low-stock alert once while the item stays low, and clears it when restocked', () => {
    const a = ctx('admin');
    const target = inv('grey goose');
    const lowOnes = () => notify.list(a, true).items.filter((n) => n.type === 'LOW_STOCK' && n.entityId === target.id);
    inventory.manualMovement(a, { invItemId: target.id, type: 'ADJUSTMENT', qty: -(qtyOf(target.id) - 1), reason: 'Drain to low' });
    expect(lowOnes().length).toBe(1);
    notify.list(a, false);                                        // running the checks again must not duplicate
    expect(lowOnes().length).toBe(1);
    inventory.manualMovement(a, { invItemId: target.id, type: 'ADJUSTMENT', qty: 50, reason: 'Restocked' });
    expect(lowOnes().length).toBe(0);                             // the dedupe key is resolved on restock
  });

  it('keeps every list scoped to the active branch', () => {
    const a = ctx('admin');
    const hyd = branches.listBranches(a).find((b) => b.code === 'HYD');
    expect(hyd, 'second branch seeded').toBeTruthy();
    const other = ctx('admin', hyd!.id);
    expect(inventory.listItems(a, {}).length).toBeGreaterThan(0);
    expect(inventory.listItems(other, {}).length).toBe(0);         // stock belongs to branch 1
    expect(orders.listOrders(other, {}).length).toBe(0);
    expect(guests.listReservations(other, {}).length).toBe(0);
    // a user without access to a branch cannot act on it
    const waiter = db.users.find((u) => u.username === 'waiter1')!;
    expect(branches.userCanAccess(a, waiter.id, hyd!.id)).toBe(false);
    expect(branches.userCanAccess(a, waiter.id, 1)).toBe(true);
  });
});
