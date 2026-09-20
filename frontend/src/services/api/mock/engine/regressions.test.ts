/**
 * Focused regression coverage for the three functional defects fixed during the redesign.
 *
 * Each block states the rule being protected and — where a previously passing expectation had
 * to change — why the OLD expectation was wrong, with the authority it contradicted. A green
 * test is not on its own evidence that an expectation is correct, so the authority is named.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createSeedDb, type MockDb } from '../db';
import type { Ctx } from './context';
import * as orders from './orders';
import * as billing from './billing';
import * as guests from './p2/guests';
import { deriveOrderStatus } from '@/utils/orderStatus';
import { ApiError } from '../../client';

let db: MockDb;
const ctx = (username: string | null): Ctx => ({ db, user: username ? db.users.find((u) => u.username === username)! : null, branchId: 1, emit: () => {} });
const item = (code: string) => db.items.find((i) => i.code === code)!.id;
const table = (n: string) => db.tables.find((t) => t.number === n)!.id;
const ymd = (d = new Date()) => d.toISOString().slice(0, 10);
const round2 = (n: number) => Math.round(n * 100) / 100;

beforeEach(() => { db = createSeedDb(); });

// ---------------------------------------------------------------------------
// 1. Atomic order creation
// ---------------------------------------------------------------------------
/**
 * Defect: `createOrder` pushed the order row into the database and only then validated the
 * requested lines. A rejected line (unavailable item, bad quantity) therefore left an orphan
 * DRAFT behind. The visible symptom was a *second* create attempt on the same table failing
 * with 409 "table already has an active order" instead of repeating the real 422 — the caller
 * was blocked by the wreckage of its own rejected request.
 *
 * Fix: build and validate every line BEFORE the order row is inserted, so the engine is atomic
 * on its own and does not depend on the dispatcher's rollback.
 */
describe('regression: rejected order creation leaves no trace', () => {
  const expectStatus = (fn: () => unknown, status: number) => {
    let err: unknown = null;
    try { fn(); } catch (e) { err = e; }
    expect(err, `expected ApiError ${status}`).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(status);
  };

  it('rolls back completely when a line is rejected (unavailable item)', () => {
    const w = ctx('waiter1');
    const t = table('2');
    const unavailable = db.items.find((i) => i.code === 'BG01')!;
    unavailable.isAvailable = false;

    const ordersBefore = db.orders.length;
    const itemsBefore = db.orders.reduce((a, o) => a + o.items.length, 0);
    const auditBefore = db.audit.length;
    const tableStatusBefore = db.tables.find((x) => x.id === t)!.status;
    const stockBefore = db.p2.invItems.map((s) => `${s.id}:${s.currentQty}`);
    const movementsBefore = db.p2.movements.length;

    expectStatus(() => orders.createOrder(w, { tableId: t, items: [{ menuItemId: unavailable.id, quantity: 1 }] }), 422);

    expect(db.orders.length, 'no order row').toBe(ordersBefore);
    expect(db.orders.reduce((a, o) => a + o.items.length, 0), 'no order items').toBe(itemsBefore);
    expect(db.audit.length, 'no ORDER_CREATED audit entry').toBe(auditBefore);
    expect(db.tables.find((x) => x.id === t)!.status, 'table untouched').toBe(tableStatusBefore);
    expect(db.p2.invItems.map((s) => `${s.id}:${s.currentQty}`), 'stock quantities unchanged').toEqual(stockBefore);
    expect(db.p2.movements.length, 'no stock movement recorded').toBe(movementsBefore);
  });

  it('rolls back completely when a line has an invalid quantity', () => {
    const w = ctx('waiter1');
    const before = db.orders.length;
    expectStatus(() => orders.createOrder(w, { tableId: table('3'), items: [{ menuItemId: item('CK01'), quantity: 0 }] }), 400);
    expect(db.orders.length).toBe(before);
  });

  it('the table is still free afterwards — the failed attempt does not self-block', () => {
    const w = ctx('waiter1');
    const t = table('5');
    db.items.find((i) => i.code === 'BG01')!.isAvailable = false;
    // First attempt fails on the unavailable line…
    expectStatus(() => orders.createOrder(w, { tableId: t, items: [{ menuItemId: item('BG01'), quantity: 1 }] }), 422);
    // …and the retry with a good line must succeed, not report a 409 conflict with the orphan.
    const ok = orders.createOrder(w, { tableId: t, items: [{ menuItemId: item('CK01'), quantity: 1 }] });
    expect(ok.status).toBe('DRAFT');
    expect(ok.items).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 2. VIP minimum-spend shortfall reconciles everywhere it is shown
// ---------------------------------------------------------------------------
/**
 * Defect: the engine computed `minSpendShortfall` and folded it into `grandTotal`, but neither
 * the bill summary nor the receipt rendered a line for it. The totals were arithmetically right
 * and visually unexplainable — the guest saw a grand total larger than the sum of the printed
 * lines, which is exactly the situation that produces disputes at the table.
 *
 * Fix: both surfaces now render the shortfall as its own line. The tests below prove the number
 * reconciles; `src/features/billing/vipShortfall.test.tsx` renders the two components and proves
 * the labelled row and the formatted amount are actually on screen.
 */
describe('regression: VIP minimum-spend shortfall', () => {
  const vipBillUnderMinimum = (minSpend = 50000) => {
    const a = ctx('admin');
    const today = ymd();
    const vipTable = db.tables.find((t) => t.isVip && t.status === 'AVAILABLE'
      && !db.p2.vipReservations.some((v) => v.tableId === t.id && v.date === today && ['BOOKED', 'SEATED'].includes(v.status)))!;
    const v = guests.saveVip(a, null, { tableId: vipTable.id, guestName: 'Shortfall Guest', date: today, guests: 4, minSpend, depositAmount: 0, depositPaid: false });
    const seated = guests.transitionVip(a, v.id, 'SEAT');
    const w = ctx('waiter1');
    orders.addItems(w, seated.orderId!, [{ menuItemId: item('BG01'), quantity: 1 }]);
    orders.confirmOrder(w, seated.orderId!);
    const c = ctx('cashier');
    return billing.finalizeBill(c, billing.createBill(c, seated.orderId!).id);
  };

  it('reconciles: net + service charge + tax + shortfall + rounding = grand total', () => {
    const bill = vipBillUnderMinimum();
    const net = round2(bill.subtotal - bill.discountTotal);
    const shortfall = bill.minSpendShortfall ?? 0;

    expect(shortfall).toBeGreaterThan(0);
    // The shortfall is explicitly NON-taxable: adding it must not have moved the tax total.
    const taxOfLines = round2(bill.taxLines.reduce((a, t) => a + t.amount, 0));
    expect(taxOfLines).toBe(bill.taxTotal);
    // Every component of the printed bill adds up to the amount the guest is asked to pay.
    expect(round2(net + bill.serviceChargeAmount + bill.taxTotal + shortfall + bill.roundOff)).toBe(bill.grandTotal);
    // …and the point of the rule: the guest ends up at or above the committed minimum.
    expect(bill.grandTotal).toBeGreaterThanOrEqual(50000);
  });

  it('is absent (zero) once the table clears its minimum, so the line never shows spuriously', () => {
    const bill = vipBillUnderMinimum(1);       // minimum of 1 is cleared by any order
    expect(bill.minSpendShortfall ?? 0).toBe(0);
  });

  // The presentation half of this defect — that both surfaces actually RENDER a labelled row
  // with the formatted amount — is covered by `src/features/billing/vipShortfall.test.tsx`,
  // which renders the real components under happy-dom. A source-text check was used here
  // before and was deliberately removed: matching a property name in a file proves nothing
  // about what a guest sees.
});

// ---------------------------------------------------------------------------
// 3. Mixed SERVED / READY derives READY
// ---------------------------------------------------------------------------
/**
 * WHY THE OLD TEST EXPECTATION WAS WRONG
 *
 * `orderStatus.test.ts` asserted `deriveOrderStatus('READY', ['SERVED','READY']) === 'PARTIALLY_READY'`.
 * The authority for this state machine is `ORDER_PKG.derive_status` in
 * `database/04_pkg_orders.sql`, which evaluates, in order:
 *
 *     IF l_served = l_total            THEN RETURN 'SERVED';
 *     IF l_ready + l_served = l_total  THEN RETURN 'READY';          <-- this branch
 *     IF l_ready + l_served > 0        THEN RETURN 'PARTIALLY_READY';
 *
 * For ['SERVED','READY']: served=1, ready=1, total=2 → served ≠ total, but ready+served = total,
 * so the database returns READY. PARTIALLY_READY is reserved for orders that still have work
 * outstanding in the kitchen (a NEW or PREPARING line). The old expectation therefore described
 * behaviour the backend never had: with both transports pointing at the same PL/SQL, an order
 * whose last item had just been served to the table would have been shown as still cooking.
 *
 * The test was corrected, not the implementation — the TypeScript already matched the database.
 * Passing is not the evidence here; agreement with the quoted PL/SQL is.
 */
describe('regression: deriveOrderStatus mirrors ORDER_PKG.derive_status', () => {
  it('returns READY when nothing is left in the kitchen (every line READY or SERVED)', () => {
    expect(deriveOrderStatus('READY', ['SERVED', 'READY'])).toBe('READY');
    expect(deriveOrderStatus('IN_PROGRESS', ['READY', 'READY'])).toBe('READY');
    expect(deriveOrderStatus('IN_PROGRESS', ['SERVED', 'READY', 'READY'])).toBe('READY');
  });

  it('returns PARTIALLY_READY only while work is still outstanding', () => {
    expect(deriveOrderStatus('IN_PROGRESS', ['SERVED', 'PREPARING'])).toBe('PARTIALLY_READY');
    expect(deriveOrderStatus('IN_PROGRESS', ['READY', 'NEW'])).toBe('PARTIALLY_READY');
  });

  it('keeps the earlier branches of the PL/SQL cascade intact', () => {
    expect(deriveOrderStatus('READY', ['SERVED', 'SERVED'])).toBe('SERVED');
    expect(deriveOrderStatus('CONFIRMED', ['PREPARING', 'NEW'])).toBe('IN_PROGRESS');
    expect(deriveOrderStatus('CONFIRMED', ['NEW', 'NEW'])).toBe('CONFIRMED');
    // CANCELLED lines are excluded from the counts, exactly as the SQL's WHERE clause does.
    expect(deriveOrderStatus('IN_PROGRESS', ['CANCELLED', 'READY'])).toBe('READY');
    expect(deriveOrderStatus('IN_PROGRESS', ['CANCELLED', 'CANCELLED'])).toBe('CANCELLED');
    // Terminal / pre-service statuses are returned untouched.
    expect(deriveOrderStatus('DRAFT', ['NEW'])).toBe('DRAFT');
    expect(deriveOrderStatus('BILLED', ['SERVED'])).toBe('BILLED');
  });

  it('matches the live engine: serving the last outstanding line moves the order to READY', () => {
    const w = ctx('waiter1');
    const o = orders.confirmOrder(w, orders.createOrder(w, {
      tableId: table('7'),
      items: [{ menuItemId: item('BG01'), quantity: 1 }, { menuItemId: item('CK01'), quantity: 1 }],
    }).id);
    const lines = orders.getOrder(w, o.id).items;
    const kitchenLine = lines.find((l) => l.prepLocation === 'KITCHEN')!;
    const barLine = lines.find((l) => l.prepLocation === 'BAR')!;

    orders.ticketItemStatus(ctx('kitchen'), 'KITCHEN', kitchenLine.id, 'PREPARING');
    orders.ticketItemStatus(ctx('kitchen'), 'KITCHEN', kitchenLine.id, 'READY');
    expect(orders.getOrder(w, o.id).status, 'one line still in the bar').toBe('PARTIALLY_READY');

    orders.ticketItemStatus(ctx('bar'), 'BAR', barLine.id, 'READY');
    orders.ticketItemStatus(ctx('bar'), 'BAR', barLine.id, 'SERVED');
    // SERVED + READY, nothing outstanding → READY (not PARTIALLY_READY).
    expect(orders.getOrder(w, o.id).status).toBe('READY');
  });
});
