/**
 * PRODUCTION-CRITICAL BEHAVIOUR — asserted against the ENGINE, not the screens.
 *
 * Every case below calls the engine function the API dispatcher routes to, with a context
 * carrying a real seeded user, exactly as a direct HTTP request would arrive. That is the point:
 * a hidden button proves nothing. The question that matters in service is what happens when the
 * request is sent anyway — by a stale tab, a mis-scoped token, a curl, or a second cashier who
 * pressed the same key at the same moment.
 *
 * THE ERROR CONTRACT (`errors` in ./context.ts) — these are asserted, never assumed:
 *   400 field validation   401 unauthenticated   403 forbidden   404 not found
 *   409 conflict           422 business rule
 * A rejected FIELD is 400; a rejected OPERATION is 422; a state that cannot accept the request
 * at all is 409. Several expectations in this file were written the other way round first and
 * were corrected against the engine source, not the other way round.
 *
 * The seed (`../db.ts`) ships zero customers, zero stock, zero recipes and one branch. Everything
 * these tests need is therefore built through the real engine functions with the real permissions,
 * so nothing here depends on demo data keeping its shape.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createSeedDb, type MockDb } from '../db';
import type { Ctx } from './context';
import * as auth from './auth';
import * as menu from './menu';
import * as orders from './orders';
import * as tables from './tables';
import * as billing from './billing';
import * as inventory from './p2/inventory';
import * as crm from './p2/crm';
import * as branches from './p2/branches';
import { ROLE_PERMISSIONS, ROLE_MAX_DISCOUNT } from '@/config/permissions';
import { deriveOrderStatus, isOrderActive } from '@/utils/orderStatus';
import { calculateBill } from '@/utils/billing';
import type { MenuItemInput, InventoryItemInput, TableInput } from '@/types';
import { ApiError } from '../../client';

let db: MockDb;

/** Per-request context — the mock equivalent of API_PKG.set_context. */
const ctx = (username: string | null, branchId = 1): Ctx => ({
  db,
  user: username ? db.users.find((u) => u.username === username)! : null,
  branchId,
  emit: () => {},
});

const expectStatus = (fn: () => unknown, status: number) => {
  let err: unknown = null;
  try { fn(); } catch (e) { err = e; }
  expect(err, `expected ApiError ${status}, got ${String(err)}`).toBeInstanceOf(ApiError);
  expect((err as ApiError).status).toBe(status);
};

/** `LoginRequest` requires `rememberMe`; nothing here depends on the longer expiry. */
const login = (username: string, password: string) => auth.login(ctx(null), { username, password, rememberMe: false });

const item = (code: string) => db.items.find((i) => i.code === code)!.id;
const invItem = (code: string) => db.p2.invItems.find((i) => i.code === code)!;
const qtyOf = (id: number) => db.p2.invItems.find((i) => i.id === id)!.currentQty;
const userId = (username: string) => db.users.find((u) => u.username === username)!.id;

/** A table with no active order — `createOrder` refuses a second one (allowMultipleOrdersPerTable = false). */
const freeTable = () => db.tables.find((t) => !t.isDeleted && t.isActive && !t.isVip
  && !db.orders.some((o) => o.tableId === t.id && isOrderActive(o.status)))!.id;

/**
 * A confirmed order and its OPEN bill.
 *
 * Default lines are BG01 Chicken Burger (₹350) + IN03 Garlic Naan (₹90), both on tax group 1
 * (GST 5 % = CGST 2.5 + SGST 2.5). Neither is touched by a seeded offer — the four demo offers
 * cover cocktails (time-gated), Craft IPA, pizzas and an expired dessert offer — so the arithmetic
 * in this file depends on nothing but the tax group and the branch settings, and does not drift
 * with the clock.
 */
function openBill(lines: { code: string; quantity: number }[] = [{ code: 'BG01', quantity: 1 }, { code: 'IN03', quantity: 1 }]) {
  const waiter = ctx('waiter1');
  const order = orders.confirmOrder(waiter, orders.createOrder(waiter, {
    tableId: freeTable(), guestCount: 2, items: lines.map((l) => ({ menuItemId: item(l.code), quantity: l.quantity })),
  }).id);
  const cashier = ctx('cashier');
  return { waiter, order, cashier, bill: billing.createBill(cashier, order.id) };
}

const newMenuItem = (name = 'Smuggled dish'): MenuItemInput => ({
  name, categoryId: 1, price: 100, prepLocation: 'KITCHEN', taxGroupId: 1,
  isVeg: true, isPopular: false, isAvailable: true, isActive: true,
});
const newInventoryItem = (name = 'Smuggled ingredient'): InventoryItemInput => ({
  name, categoryId: 1, unitId: 2, minQty: 1, reorderLevel: 2, costPrice: 100, allowNegative: false, isActive: true,
});
const newTable = (floorId: number, number: string): TableInput => ({ floorId, number, capacity: 4, isActive: true });

beforeEach(() => { db = createSeedDb(); });

// ---------------------------------------------------------------------------
// 1. Authentication and the session boundary
// ---------------------------------------------------------------------------
/**
 * RULE: no identity, no data. `assertAuth` runs before `assertPermission`, so an anonymous caller
 * is refused 401 and never 403 — a 403 would confirm that the endpoint exists and that the only
 * thing missing is a grant. A login returns the permissions the role really holds, because the
 * client renders its entire navigation from that list and a wrong list is a wrong shift.
 */
describe('authentication and the session boundary', () => {
  it('refuses an unauthenticated caller with 401 on protected reads', () => {
    expectStatus(() => orders.listOrders(ctx(null), {}), 401);
    expectStatus(() => billing.listBills(ctx(null), {}), 401);
    expectStatus(() => inventory.listItems(ctx(null), {}), 401);
    expectStatus(() => tables.listTables(ctx(null), {}), 401);
    expectStatus(() => menu.listItems(ctx(null), {}), 401);
    expectStatus(() => auth.me(ctx(null)), 401);
  });

  /* 401 before 403: the refusal must not leak which grant would have been enough. */
  it('refuses an unauthenticated write with 401, not 403', () => {
    expectStatus(() => menu.saveItem(ctx(null), null, newMenuItem()), 401);
    expectStatus(() => inventory.saveItem(ctx(null), null, newInventoryItem()), 401);
    expectStatus(() => billing.addPayment(ctx(null), 1, { method: 'CASH', amount: 1 }), 401);
  });

  it('returns exactly the permissions the role holds on a valid login', () => {
    const res = login('cashier', 'Cashier@123');
    expect(res.user.username).toBe('cashier');
    expect(res.user.roles).toEqual(['CASHIER']);
    expect([...res.user.permissions].sort()).toEqual([...ROLE_PERMISSIONS.CASHIER].sort());
    expect(res.user.maxDiscountPercent).toBe(ROLE_MAX_DISCOUNT.CASHIER);
    expect(res.user.isActive).toBe(true);
    expect(res.token).toMatch(/^[0-9a-f]{48}$/);          // 24 random bytes, hex
  });

  it('gives each seeded role its own grant list, so one login is not another', () => {
    const permsOf = (username: string, password: string) => login(username, password).user.permissions;
    expect(permsOf('waiter1', 'Waiter@123')).toContain('orders:create');
    expect(permsOf('waiter1', 'Waiter@123')).not.toContain('billing:pay');
    expect(permsOf('kitchen', 'Kitchen@123')).toContain('kitchen:update');
    expect(permsOf('kitchen', 'Kitchen@123')).not.toContain('bar:update');
    expect(permsOf('host', 'Host@123')).toContain('reservations:manage');
    expect(permsOf('host', 'Host@123')).not.toContain('billing:create');
  });

  /* A wrong password and a disabled account are both 401 — a disabled account must not be
     distinguishable from a wrong password by status code alone. */
  it('rejects a wrong password and a disabled account with 401', () => {
    expectStatus(() => login('cashier', 'wrong'), 401);
    expectStatus(() => login('nobody', 'Cashier@123'), 401);
    db.users.find((u) => u.username === 'kitchen')!.isActive = false;
    expectStatus(() => login('kitchen', 'Kitchen@123'), 401);
  });

  it('stops resolving a token the moment the session is revoked', () => {
    const { token } = login('waiter1', 'Waiter@123');
    expect(auth.resolveSession(ctx(null), token)?.username).toBe('waiter1');
    auth.logout(ctx('waiter1'), token);
    expect(auth.resolveSession(ctx(null), token)).toBeNull();
  });

  /* Deactivating a user revokes their live sessions — otherwise a dismissed member of staff keeps
     working until their token expires, which for `rememberMe` is thirty days. */
  it('revokes live sessions when the account is deactivated', () => {
    const { token } = login('waiter2', 'Waiter@123');
    auth.setUserStatus(ctx('admin'), userId('waiter2'), false);
    expect(auth.resolveSession(ctx(null), token)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. Server-enforced authorisation
// ---------------------------------------------------------------------------
/**
 * RULE: the write path carries its own guard. Reading a screen is not permission to change what
 * is on it, and the UI hiding a control is not enforcement. For each module below a role that can
 * legitimately READ is refused 403 on the WRITE, which is the request an out-of-date tab or a
 * hand-built call actually sends.
 */
describe('server-enforced authorisation across modules', () => {
  it('menu: a waiter may read the menu but not change it', () => {
    const w = ctx('waiter1');
    expect(menu.listItems(w, {}).length).toBeGreaterThan(0);
    expectStatus(() => menu.saveItem(w, null, newMenuItem()), 403);
    expectStatus(() => menu.deleteItem(w, item('BG01')), 403);
    expect(db.items.some((i) => i.name === 'Smuggled dish'), 'nothing was written').toBe(false);
  });

  it('inventory: kitchen staff may count and adjust stock but not create or edit items', () => {
    const k = ctx('kitchen');
    expect(inventory.listItems(k, {}).length).toBeGreaterThan(0);
    // `inventory:adjust` and `inventory:manage` are different grants and the kitchen holds only the first.
    const chicken = invItem('CHK-BRST');
    expect(inventory.manualMovement(k, { invItemId: chicken.id, type: 'OPENING_STOCK', qty: 5, reason: 'Counted in' }).currentQty).toBe(5);
    expectStatus(() => inventory.saveItem(k, null, newInventoryItem()), 403);
    expectStatus(() => inventory.deleteItem(k, chicken.id), 403);
  });

  it('tables: a cashier may see the floor but not re-plan it', () => {
    const c = ctx('cashier');
    expect(tables.listTables(c, {}).length).toBeGreaterThan(0);
    expectStatus(() => tables.saveTable(c, null, newTable(1, 'X99')), 403);
    expectStatus(() => tables.overrideStatus(c, db.tables[0].id, 'CLOSED', 'closing early'), 403);
    expect(db.tables.some((t) => t.number === 'X99')).toBe(false);
  });

  it('billing: a cashier may take money but not give it back', () => {
    const { bill, cashier } = openBill();
    const finalized = billing.finalizeBill(cashier, bill.id);
    const paid = billing.addPayment(cashier, finalized.id, { method: 'CASH', amount: finalized.grandTotal });
    const payment = paid.payments[0];
    // `billing:refund` is a manager grant; the cashier who took the money cannot reverse it alone.
    expect(billing.getBill(cashier, bill.id).id).toBe(bill.id);
    expectStatus(() => billing.reversePayment(cashier, bill.id, payment.id, 'Guest complained'), 403);
    expect(billing.getBill(cashier, bill.id).payments[0].status, 'payment untouched').toBe('SUCCESS');
    // …and a manager can.
    expect(billing.reversePayment(ctx('manager'), bill.id, payment.id, 'Guest complained').payments[0].status).toBe('REVERSED');
  });

  it('orders: a waiter may void their own draft but not cancel a confirmed order', () => {
    const w = ctx('waiter1');
    const draft = orders.createOrder(w, { tableId: freeTable(), items: [{ menuItemId: item('BG01'), quantity: 1 }] });
    expect(orders.cancelOrder(w, draft.id, 'Guest left').status).toBe('CANCELLED');     // `orders:create` covers a draft
    const confirmed = orders.confirmOrder(w, orders.createOrder(w, { tableId: freeTable(), items: [{ menuItemId: item('BG01'), quantity: 1 }] }).id);
    expect(orders.getOrder(w, confirmed.id).id).toBe(confirmed.id);                     // the read still works
    expectStatus(() => orders.cancelOrder(w, confirmed.id, 'Changed mind'), 403);       // the write does not
    expect(orders.getOrder(w, confirmed.id).status).toBe('CONFIRMED');
  });

  it('branches: a manager may switch branch but not create one', () => {
    const m = ctx('manager');
    expect(branches.listBranches(m).length).toBeGreaterThan(0);
    expectStatus(() => branches.saveBranch(m, null, { code: 'ROGUE', businessName: 'Rogue Co', name: 'Rogue' }), 403);
    expect(db.p2.branches.length).toBe(0);
  });

  /* The grant table itself, so a silent widening of a role fails here and not in service. */
  it('keeps the grants that the refusals above depend on', () => {
    expect(ROLE_PERMISSIONS.WAITER).not.toContain('menu:manage');
    expect(ROLE_PERMISSIONS.WAITER).not.toContain('orders:cancel');
    expect(ROLE_PERMISSIONS.KITCHEN).toContain('inventory:adjust');
    expect(ROLE_PERMISSIONS.KITCHEN).not.toContain('inventory:manage');
    expect(ROLE_PERMISSIONS.CASHIER).not.toContain('tables:manage');
    expect(ROLE_PERMISSIONS.CASHIER).not.toContain('billing:refund');
    expect(ROLE_PERMISSIONS.MANAGER).toContain('billing:refund');
    expect(ROLE_PERMISSIONS.MANAGER).not.toContain('branches:manage');
  });
});

// ---------------------------------------------------------------------------
// 3. Branch isolation
// ---------------------------------------------------------------------------
/**
 * RULE: one database, many outlets. Every branch-scoped list filters on `ctx.branchId`, so a
 * cashier working the Hyderabad till never sees a Bengaluru table, order or bill. Getting this
 * wrong does not look like a bug on screen — it looks like a second outlet's takings appearing in
 * this outlet's day-end.
 *
 * Customers and loyalty accounts are deliberately ORGANISATION-wide (`orgId`, no branchId on the
 * row): a guest is the same guest at every outlet, and that is asserted explicitly below rather
 * than pretended to be branch-scoped.
 */
describe('branch isolation', () => {
  /** A second branch, created through the real engine; `saveBranch` also seeds it a Main Dining floor. */
  const secondBranch = () => {
    const created = branches.saveBranch(ctx('admin'), null, { code: 'HYD', businessName: 'The Saffron Lounge', name: 'Hyderabad', city: 'Hyderabad' });
    return created.find((b) => b.code === 'HYD')!.id;
  };

  it('does not show branch 1 orders, tables, bills, menu, stock or floors to branch 2', () => {
    const { order, bill } = openBill();
    const a1 = ctx('admin', 1);
    const a2 = ctx('admin', secondBranch());

    expect(orders.listOrders(a1, {}).some((o) => o.id === order.id)).toBe(true);
    expect(orders.listOrders(a2, {}), 'orders are branch-scoped').toEqual([]);
    expect(billing.listBills(a1, {}).some((b) => b.id === bill.id)).toBe(true);
    expect(billing.listBills(a2, {}), 'bills are branch-scoped').toEqual([]);
    expect(tables.listTables(a1, {}).length).toBe(22);
    expect(tables.listTables(a2, {}), 'branch 2 has no tables yet').toEqual([]);
    expect(menu.listItems(a1, {}).length).toBeGreaterThan(0);
    expect(menu.listItems(a2, {}), 'the menu belongs to a branch').toEqual([]);
    expect(menu.listCategories(a2), 'so do its categories').toEqual([]);
    expect(inventory.listItems(a2, {}), 'stock belongs to a branch').toEqual([]);
    expect(tables.listFloors(a1).length).toBe(3);
    expect(tables.listFloors(a2).length, 'only the floor saveBranch created').toBe(1);
  });

  it('does not show branch 2 data to branch 1 either — the filter is not one-directional', () => {
    const b2 = secondBranch();
    const a2 = ctx('admin', b2);
    const floor = tables.listFloors(a2)[0].id;
    const hydTable = tables.saveTable(a2, null, newTable(floor, 'H1'));
    const hydOrder = orders.createOrder(a2, { tableId: hydTable.id, items: [] });

    expect(tables.listTables(a2, {}).map((t) => t.number)).toEqual(['H1']);
    expect(tables.listTables(ctx('admin', 1), {}).some((t) => t.number === 'H1')).toBe(false);
    expect(orders.listOrders(a2, {}).map((o) => o.id)).toEqual([hydOrder.id]);
    expect(orders.listOrders(ctx('admin', 1), {}).some((o) => o.id === hydOrder.id)).toBe(false);
  });

  /* The menu is branch-scoped on the WRITE path too: `buildItems` matches the menu item's branch
     against the order's, so a branch-1 dish cannot be sold on a branch-2 ticket. 400, not 404 —
     the engine treats it as a rejected field on the request (`errors.validation(..., 'menuItemId')`). */
  it('refuses to put another branch\'s menu item on an order', () => {
    const b2 = secondBranch();
    const a2 = ctx('admin', b2);
    const floor = tables.listFloors(a2)[0].id;
    const hydTable = tables.saveTable(a2, null, newTable(floor, 'H2'));
    const hydOrder = orders.createOrder(a2, { tableId: hydTable.id, items: [] });
    expectStatus(() => orders.addItems(a2, hydOrder.id, [{ menuItemId: item('BG01'), quantity: 1 }]), 400);
    expect(orders.getOrder(a2, hydOrder.id).items).toEqual([]);
  });

  /* Branch MEMBERSHIP is a separate question from branch SCOPE, and `userCanAccess` is its
     authority — the dispatcher calls it before it will honour an X-Branch-Id (mockClient.ts:274).
     The engine functions themselves trust `ctx.branchId`, so this is the check that matters. */
  it('knows which staff may work in which branch', () => {
    const b2 = secondBranch();
    const a = ctx('admin');
    expect(branches.userCanAccess(a, userId('cashier'), 1)).toBe(true);
    expect(branches.userCanAccess(a, userId('cashier'), b2)).toBe(false);
    expect(branches.userCanAccess(a, userId('superadmin'), b2), 'super admin reaches every branch').toBe(true);
    expect(branches.listBranches(ctx('cashier')).map((b) => b.id)).toEqual([1]);
  });

  /*
   * ORGANISATION-WIDE BY DESIGN — not a hole in the isolation.
   *
   * `customers` carries `orgId`, not `branchId`, and `crm.listCustomers` / `accountJson` have no
   * branch predicate: one guest, one loyalty balance, every outlet. Asserting a branch filter here
   * would be a test that passes by describing the wrong system.
   */
  it('shares customers and loyalty balances across branches, deliberately', () => {
    const b2 = secondBranch();
    const guest = crm.saveCustomer(ctx('manager', 1), null, { fullName: 'Org Wide Guest', phone: '+919000011111', consentMarketing: false });
    crm.adjust(ctx('manager', 1), guest.id, 500, 'Goodwill at the main branch');

    expect(crm.listCustomers(ctx('manager', b2), {}).some((c) => c.id === guest.id), 'same guest at every outlet').toBe(true);
    expect(crm.getAccount(ctx('manager', b2), guest.id).pointsBalance, 'one balance, not one per branch').toBe(500);
    crm.adjust(ctx('admin', b2), guest.id, 250, 'Topped up at the second branch');
    expect(crm.getAccount(ctx('manager', 1), guest.id).pointsBalance).toBe(750);
  });

  /*
   * BY-ID LOOKUPS ARE BRANCH-CHECKED TOO.
   *
   * This started life as a pinned KNOWN GAP: isolation was enforced on the LIST paths only, so a
   * context on another branch that knew (or guessed) an id could read a row belonging to a branch
   * it was not working in — and because `addPayment`, `addDiscount` and `reversePayment` all
   * resolve their bill through `findBill`, it could TAKE MONEY against another branch's bill. The
   * dispatcher validated only that the caller may use the branch they claim (`userCanAccess`,
   * mockClient.ts); nothing re-checked that the row belonged to it.
   *
   * `findBill`, `findOrder`, `getTable` and `getItem` now carry the predicate. The error is 404
   * and not 403 on purpose: a caller with no business seeing a row should not learn from the
   * error that it exists.
   */
  it('refuses a by-id read of another branch, not just the list', () => {
    const { bill, order } = openBill();
    const a2 = ctx('admin', secondBranch());
    expect(billing.listBills(a2, {}), 'the list is clean').toEqual([]);
    expectStatus(() => billing.getBill(a2, bill.id), 404);
    expectStatus(() => orders.getOrder(a2, order.id), 404);
    expectStatus(() => tables.getTable(a2, order.tableId), 404);
  });

  /* The write paths matter more than the reads: this is the one that was taking money. */
  it('refuses a payment, a discount and a reversal against another branch’s bill', () => {
    const { bill } = openBill();
    const a2 = ctx('admin', secondBranch());
    expectStatus(() => billing.addPayment(a2, bill.id, { method: 'CASH', amount: 100 }), 404);
    expectStatus(() => billing.addDiscount(a2, bill.id, { discountType: 'PERCENTAGE', value: 5, reason: 'Cross-branch attempt' }), 404);
    // Nothing was written: the bill is exactly as the first branch left it.
    const fresh = billing.getBill(ctx('admin', 1), bill.id);
    expect(fresh.paidAmount).toBe(bill.paidAmount);
    expect(fresh.grandTotal).toBe(bill.grandTotal);
  });
});

// ---------------------------------------------------------------------------
// 4. Order transitions
// ---------------------------------------------------------------------------
/**
 * RULE: the order status is DERIVED from its lines, never typed in. `deriveOrderStatus` is the
 * state machine (mirroring ORDER_PKG.derive_status) and the engine must agree with it after every
 * change, because the floor screen, the KDS and the table colour all read that one field. A
 * cancelled line is excluded from the counts: a table whose only outstanding dish was voided is
 * ready to be served, not stuck waiting for a plate nobody is cooking.
 */
describe('order transitions and derived status', () => {
  /** Two kitchen lines on one confirmed order, and the live derived status. */
  const twoLineOrder = () => {
    const w = ctx('waiter1');
    const o = orders.confirmOrder(w, orders.createOrder(w, {
      tableId: freeTable(), items: [{ menuItemId: item('BG01'), quantity: 1 }, { menuItemId: item('ST01'), quantity: 1 }],
    }).id);
    return { w, id: o.id, lines: orders.getOrder(w, o.id).items };
  };
  const statusOf = (id: number) => orders.getOrder(ctx('waiter1'), id).status;

  it('walks DRAFT → CONFIRMED → IN_PROGRESS → PARTIALLY_READY → READY → SERVED', () => {
    const { id, lines } = twoLineOrder();
    const k = ctx('kitchen');
    expect(statusOf(id)).toBe('CONFIRMED');

    orders.ticketItemStatus(k, 'KITCHEN', lines[0].id, 'PREPARING');
    expect(statusOf(id)).toBe('IN_PROGRESS');
    orders.ticketItemStatus(k, 'KITCHEN', lines[0].id, 'READY');
    expect(statusOf(id), 'the second line is still in the kitchen').toBe('PARTIALLY_READY');
    orders.ticketItemStatus(k, 'KITCHEN', lines[1].id, 'READY');
    expect(statusOf(id)).toBe('READY');

    const w = ctx('waiter1');
    orders.setItemStatus(w, lines[0].id, 'SERVED', null);
    orders.setItemStatus(w, lines[1].id, 'SERVED', null);
    expect(statusOf(id)).toBe('SERVED');
  });

  it('agrees with deriveOrderStatus at every step, not only at the end', () => {
    const { id, lines } = twoLineOrder();
    const k = ctx('kitchen');
    const check = (expected: string) => {
      const live = orders.getOrder(ctx('waiter1'), id);
      expect(live.status).toBe(expected);
      // the engine's stored status must be what the pure state machine derives from the same lines
      expect(deriveOrderStatus('CONFIRMED', live.items.map((i) => i.status))).toBe(live.status);
    };
    check('CONFIRMED');
    orders.ticketItemStatus(k, 'KITCHEN', lines[0].id, 'PREPARING'); check('IN_PROGRESS');
    orders.ticketItemStatus(k, 'KITCHEN', lines[0].id, 'READY'); check('PARTIALLY_READY');
    orders.ticketItemStatus(k, 'KITCHEN', lines[1].id, 'PREPARING'); check('PARTIALLY_READY');
    orders.ticketItemStatus(k, 'KITCHEN', lines[1].id, 'READY'); check('READY');
  });

  /* An impossible item transition is 409, not 400: the field is valid, the current STATE cannot
     accept it. Asserted rather than assumed — `setItemStatus` throws `errors.conflict`. */
  it('refuses an item transition the state machine does not allow, with 409', () => {
    const { id, lines } = twoLineOrder();
    const k = ctx('kitchen');
    expectStatus(() => orders.ticketItemStatus(k, 'KITCHEN', lines[0].id, 'SERVED'), 409);   // NEW → SERVED skips the pass
    orders.ticketItemStatus(k, 'KITCHEN', lines[0].id, 'READY');
    orders.setItemStatus(ctx('waiter1'), lines[0].id, 'SERVED', null);
    expectStatus(() => orders.ticketItemStatus(k, 'KITCHEN', lines[0].id, 'PREPARING'), 409); // SERVED is terminal
    expect(orders.getOrder(ctx('waiter1'), id).items[0].status).toBe('SERVED');
  });

  it('refuses to confirm twice (409) and to bill a draft (422)', () => {
    const w = ctx('waiter1');
    const draft = orders.createOrder(w, { tableId: freeTable(), items: [{ menuItemId: item('BG01'), quantity: 1 }] });
    expectStatus(() => orders.requestBill(w, draft.id), 422);          // a business rule, not a state clash
    const confirmed = orders.confirmOrder(w, draft.id);
    expectStatus(() => orders.confirmOrder(w, confirmed.id), 409);     // the state cannot accept it
    orders.requestBill(w, confirmed.id);
    expectStatus(() => orders.requestBill(w, confirmed.id), 409);
    expectStatus(() => orders.addItems(w, confirmed.id, [{ menuItemId: item('ST01'), quantity: 1 }]), 422);
  });

  it('refuses to confirm an order with nothing on it', () => {
    const w = ctx('waiter1');
    const empty = orders.createOrder(w, { tableId: freeTable(), items: [] });
    expectStatus(() => orders.confirmOrder(w, empty.id), 400);
  });

  /* The rule that matters at the pass: a voided dish must not hold the table hostage. */
  it('excludes a cancelled line from readiness, so the table is not held by a voided dish', () => {
    const { id, lines } = twoLineOrder();
    const m = ctx('manager');
    orders.cancelItem(m, id, lines[1].id, { reason: 'Out of stock' });
    expect(statusOf(id), 'one live line, still NEW').toBe('CONFIRMED');
    orders.ticketItemStatus(ctx('kitchen'), 'KITCHEN', lines[0].id, 'READY');
    expect(statusOf(id), 'the cancelled line does not count toward readiness').toBe('READY');

    const live = orders.getOrder(ctx('waiter1'), id);
    expect(live.items.map((i) => i.status)).toEqual(['READY', 'CANCELLED']);
    expect(deriveOrderStatus('CONFIRMED', ['READY', 'CANCELLED'])).toBe('READY');
    expect(live.itemCount, 'and it is off the count').toBe(1);
    expect(live.subtotal, 'and off the money').toBe(350);
  });

  /* Cancelling a confirmed line is an approval act: a waiter needs a manager PIN, and `hasPermission`
     is checked against the APPROVER, not the caller. */
  it('requires manager approval before a waiter can void a confirmed line', () => {
    const { w, id, lines } = twoLineOrder();
    expectStatus(() => orders.cancelItem(w, id, lines[0].id, { reason: 'Guest changed mind' }), 403);
    expectStatus(() => orders.cancelItem(w, id, lines[0].id, { reason: 'Guest changed mind', approvedByUserId: userId('manager'), approvalPin: '9999' }), 403);
    expectStatus(() => orders.cancelItem(w, id, lines[0].id, { reason: '  ' }), 400);
    const ok = orders.cancelItem(w, id, lines[0].id, { reason: 'Guest changed mind', approvedByUserId: userId('manager'), approvalPin: '1234' });
    expect(ok.items[0].status).toBe('CANCELLED');
    expect(ok.items[0].approvedBy).toBe(userId('manager'));
  });
});

// ---------------------------------------------------------------------------
// 5. Stock movements and reversals
// ---------------------------------------------------------------------------
/**
 * RULE: stock only ever moves through `applyMovement`, and every movement is a ledger row carrying
 * the balance before and after. A movement changes the balance by exactly its quantity; a reversal
 * puts back exactly what was taken; a movement that would drive the balance negative is refused and
 * changes nothing. A stock figure that drifts by a fraction is worse than no stock figure — it is
 * trusted, and it is wrong.
 */
describe('stock movements, reversals and the negative-stock guard', () => {
  /** Opening count through the real engine; the seed ships every item at zero. */
  const openWith = (code: string, qty: number) => {
    const it = invItem(code);
    inventory.manualMovement(ctx('admin'), { invItemId: it.id, type: 'OPENING_STOCK', qty, unitCost: it.costPrice, reason: 'Opening count' });
    return it;
  };

  it('moves the balance by exactly the quantity, and records before/after on the row', () => {
    const chicken = openWith('CHK-BRST', 20);
    expect(qtyOf(chicken.id)).toBe(20);

    inventory.manualMovement(ctx('admin'), { invItemId: chicken.id, type: 'ADJUSTMENT', qty: -2.5, reason: 'Recount' });
    expect(qtyOf(chicken.id)).toBe(17.5);
    // WASTAGE is always signed negative by the engine whatever sign the caller sends.
    inventory.manualMovement(ctx('admin'), { invItemId: chicken.id, type: 'WASTAGE', qty: 1, reason: 'Spoiled' });
    expect(qtyOf(chicken.id)).toBe(16.5);

    /*
     * CORRECTED EXPECTATION. This first asserted `['WASTAGE','ADJUSTMENT','OPENING_STOCK']` —
     * newest first — which is what `listMovements` advertises but not what it returns here.
     * It sorts on `createdAt` descending (p2/inventory.ts:174) and `now()` (context.ts:21) has
     * only millisecond resolution, so three movements posted inside one tick carry an IDENTICAL
     * timestamp; `Array.prototype.sort` is stable, and stable-sorting equal keys preserves
     * insertion order, i.e. oldest first. The ordering of same-millisecond rows is therefore not
     * something a caller may rely on, so each row is identified by what it IS, not by position.
     */
    const rows = inventory.listMovements(ctx('admin'), { invItemId: chicken.id });
    expect(rows.map((m) => m.type).sort()).toEqual(['ADJUSTMENT', 'OPENING_STOCK', 'WASTAGE']);
    const wastage = rows.find((m) => m.type === 'WASTAGE')!;
    expect(wastage.qty).toBe(-1);
    expect(wastage.qtyBefore).toBe(17.5);
    expect(wastage.qtyAfter).toBe(16.5);
    const adjustment = rows.find((m) => m.type === 'ADJUSTMENT')!;
    expect(adjustment.qty).toBe(-2.5);
    expect(adjustment.qtyBefore).toBe(20);
    expect(adjustment.qtyAfter).toBe(17.5);
  });

  it('refuses a movement that would drive the balance negative and leaves it untouched', () => {
    const chicken = openWith('CHK-BRST', 20);
    const movementsBefore = db.p2.movements.length;
    // A rejected OPERATION is 422 — the quantity itself is a valid field.
    expectStatus(() => inventory.manualMovement(ctx('admin'), { invItemId: chicken.id, type: 'ADJUSTMENT', qty: -20.0001, reason: 'Overdraw' }), 422);
    expect(qtyOf(chicken.id), 'balance untouched').toBe(20);
    expect(db.p2.movements.length, 'no ledger row written').toBe(movementsBefore);
    // …and exactly emptying it is allowed, so the guard is `< 0`, not `<= 0`.
    inventory.manualMovement(ctx('admin'), { invItemId: chicken.id, type: 'ADJUSTMENT', qty: -20, reason: 'Emptied' });
    expect(qtyOf(chicken.id)).toBe(0);
  });

  it('allows an item flagged allowNegative to go below zero, and only that item', () => {
    const chicken = openWith('CHK-BRST', 5);
    db.p2.invItems.find((i) => i.id === chicken.id)!.allowNegative = true;
    inventory.manualMovement(ctx('admin'), { invItemId: chicken.id, type: 'ADJUSTMENT', qty: -8, reason: 'Sold ahead of the delivery' });
    expect(qtyOf(chicken.id)).toBe(-3);
    const buns = openWith('BUN-BRIO', 5);
    expectStatus(() => inventory.manualMovement(ctx('admin'), { invItemId: buns.id, type: 'ADJUSTMENT', qty: -8, reason: 'Same again' }), 422);
    expect(qtyOf(buns.id)).toBe(5);
  });

  it('deducts a recipe on confirmation and restores the exact balance when the line is voided', () => {
    const chicken = openWith('CHK-BRST', 20);
    // 200 g per portion, no wastage; stock is kept in KG, so the engine must convert 400 g → 0.4 kg.
    inventory.saveRecipe(ctx('admin'), item('BG01'), { yieldQty: 1, ingredients: [{ invItemId: chicken.id, qty: 200, unitId: 1, wastagePct: 0 }] });

    const w = ctx('waiter1');
    const o = orders.confirmOrder(w, orders.createOrder(w, { tableId: freeTable(), items: [{ menuItemId: item('BG01'), quantity: 2 }] }).id);
    expect(qtyOf(chicken.id), '2 × 200 g = 0.4 kg').toBe(19.6);
    const consumption = db.p2.movements.filter((m) => m.type === 'SALE_CONSUMPTION');
    expect(consumption).toHaveLength(1);
    expect(consumption[0].qty).toBe(-0.4);

    const line = orders.getOrder(w, o.id).items[0];
    orders.cancelItem(ctx('manager'), o.id, line.id, { reason: 'Sent back' });
    expect(qtyOf(chicken.id), 'the reversal restores the balance exactly').toBe(20);
    const reversals = db.p2.movements.filter((m) => m.type === 'CONSUMPTION_REVERSAL');
    expect(reversals).toHaveLength(1);
    expect(reversals[0].qty).toBe(0.4);
  });

  it('never reverses the same line twice', () => {
    const chicken = openWith('CHK-BRST', 20);
    inventory.saveRecipe(ctx('admin'), item('BG01'), { yieldQty: 1, ingredients: [{ invItemId: chicken.id, qty: 200, unitId: 1, wastagePct: 0 }] });
    const w = ctx('waiter1');
    const o = orders.confirmOrder(w, orders.createOrder(w, { tableId: freeTable(), items: [{ menuItemId: item('BG01'), quantity: 1 }] }).id);
    const line = orders.getOrder(w, o.id).items[0];
    orders.cancelItem(ctx('manager'), o.id, line.id, { reason: 'Sent back' });

    const rows = db.p2.movements.length;
    inventory.reverseForOrderItem(ctx('manager'), line.id);
    expect(db.p2.movements.length, 'the second reversal is a no-op').toBe(rows);
    expect(qtyOf(chicken.id)).toBe(20);
  });

  it('refuses a movement with no quantity or no reason', () => {
    const chicken = openWith('CHK-BRST', 5);
    expectStatus(() => inventory.manualMovement(ctx('admin'), { invItemId: chicken.id, type: 'ADJUSTMENT', qty: 0, reason: 'Nothing' }), 400);
    expectStatus(() => inventory.manualMovement(ctx('admin'), { invItemId: chicken.id, type: 'ADJUSTMENT', qty: 1, reason: '   ' }), 400);
    expect(qtyOf(chicken.id)).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// 6. Financial calculation and rounding
// ---------------------------------------------------------------------------
/**
 * RULE: the printed bill must reconcile to the paisa, and the engine must agree with
 * `utils/billing.ts` — the one calculator both the mock backend and the screens use. Every figure
 * below is asserted as an exact number with its derivation written out; `toBeCloseTo` would hide
 * precisely the drift that produces a till that does not balance at the end of the night.
 *
 * Branch settings in the seed: service charge 5 %, tax NOT charged on service charge,
 * rounding NEAREST.
 */
describe('financial calculation and rounding', () => {
  it('computes an undiscounted bill exactly', () => {
    /*
     * 1 × BG01 350.00 (GST 5 %) + 1 × IN03 90.00 (GST 5 %)
     *   subtotal        440.00
     *   service charge  440.00 × 5 %              =  22.00
     *   tax   line 1    350.00 × 2.5 % × 2        =  17.50
     *         line 2     90.00 × 2.5 % × 2        =   4.50
     *   raw             440 + 22 + 22             = 484.00
     *   NEAREST         484.00  → round-off 0.00
     */
    const { bill } = openBill();
    expect(bill.subtotal).toBe(440);
    expect(bill.itemDiscountTotal).toBe(0);
    expect(bill.orderDiscountTotal).toBe(0);
    expect(bill.serviceChargePercent).toBe(5);
    expect(bill.serviceChargeAmount).toBe(22);
    expect(bill.taxTotal).toBe(22);
    expect(bill.taxLines).toEqual([
      { code: 'CGST', name: 'CGST', percent: 2.5, taxableAmount: 440, amount: 11 },
      { code: 'SGST', name: 'SGST', percent: 2.5, taxableAmount: 440, amount: 11 },
    ]);
    expect(bill.roundOff).toBe(0);
    expect(bill.grandTotal).toBe(484);
    expect(bill.balanceDue).toBe(484);
    expect(bill.minSpendShortfall, 'no VIP minimum on an ordinary table').toBe(0);
  });

  it('computes a discounted bill exactly, including the round-off', () => {
    /*
     * Same two lines, less a 10 % order discount.
     *   after item discounts   440.00
     *   order discount         440.00 × 10 %                     =  44.00
     *   net                    396.00
     *   service charge         396.00 × 5 %                      =  19.80
     *   discount share  line 1 44 × 350/440 = 35.00 → taxable 315.00
     *                   line 2 44 ×  90/440 =  9.00 → taxable  81.00
     *   tax             line 1 315 × 2.5 % = 7.88 (7.875 rounds half-up) × 2 = 15.76
     *                   line 2  81 × 2.5 % = 2.03 (2.025 rounds half-up) × 2 =  4.06
     *                   total                                    =  19.82
     *   raw                    396 + 19.80 + 19.82               = 435.62
     *   NEAREST                436.00 → round-off +0.38
     */
    const { bill, cashier } = openBill();
    const discounted = billing.addDiscount(ctx('manager'), bill.id, { discountType: 'PERCENTAGE', value: 10, reason: 'Regular guest' });

    expect(discounted.subtotal).toBe(440);
    expect(discounted.orderDiscountTotal).toBe(44);
    expect(discounted.discountTotal).toBe(44);
    expect(discounted.serviceChargeAmount).toBe(19.8);
    expect(discounted.taxLines.map((t) => t.amount)).toEqual([9.91, 9.91]);   // 7.88 + 2.03 per code
    expect(discounted.taxTotal).toBe(19.82);
    expect(discounted.roundOff).toBe(0.38);
    expect(discounted.grandTotal).toBe(436);
    expect(discounted.balanceDue).toBe(436);

    // …and it reconciles: net + service charge + tax + round-off = the amount the guest is asked to pay.
    const net = discounted.subtotal - discounted.discountTotal;
    expect(net + discounted.serviceChargeAmount + discounted.taxTotal + discounted.roundOff).toBe(discounted.grandTotal);

    // The finalized bill keeps the same figures — finalizing recalculates and must not move them.
    const finalized = billing.finalizeBill(cashier, bill.id);
    expect(finalized.grandTotal).toBe(436);
    expect(finalized.taxTotal).toBe(19.82);
  });

  /* The engine delegates to `calculateBill`; feeding that pure function the same inputs must give
     the same figures the hard-coded arithmetic above predicts. */
  it('agrees with utils/billing.ts given the same inputs', () => {
    const gst5 = db.taxGroups.find((t) => t.code === 'GST5')!.rates;
    const res = calculateBill({
      lines: [
        { key: 'a', quantity: 1, unitPrice: 350, itemDiscount: 0, taxRates: gst5 },
        { key: 'b', quantity: 1, unitPrice: 90, itemDiscount: 0, taxRates: gst5 },
      ],
      orderDiscounts: [{ key: 'd', type: 'PERCENTAGE', value: 10 }],
      serviceChargePercent: 5,
      taxOnServiceCharge: false,
      roundingMode: 'NEAREST',
    });
    expect(res.subtotal).toBe(440);
    expect(res.orderDiscountTotal).toBe(44);
    expect(res.netAmount).toBe(396);
    expect(res.serviceChargeAmount).toBe(19.8);
    expect(res.taxTotal).toBe(19.82);
    expect(res.rawTotal).toBe(435.62);
    expect(res.grandTotal).toBe(436);
    expect(res.roundOff).toBe(0.38);
  });

  /* Rounding is a branch setting, and each mode has to be the mode it claims. */
  it('honours the branch rounding mode', () => {
    const rounded = (mode: 'NEAREST' | 'UP' | 'DOWN' | 'NONE') => {
      db = createSeedDb();
      db.branch.roundingMode = mode;
      const { bill } = openBill();
      return billing.addDiscount(ctx('manager'), bill.id, { discountType: 'PERCENTAGE', value: 10, reason: 'Regular guest' });
    };
    expect(rounded('NEAREST').grandTotal).toBe(436);
    expect(rounded('UP').grandTotal).toBe(436);
    expect(rounded('DOWN').grandTotal).toBe(435);
    expect(rounded('NONE').grandTotal).toBe(435.62);
    expect(rounded('DOWN').roundOff).toBe(-0.62);
  });

  /* Item prices are snapshot onto the order line, so re-pricing the menu mid-service cannot move
     a bill that is already open. */
  it('bills the price that was snapshot on the order, not the current menu price', () => {
    const { bill, cashier } = openBill();
    const burger = db.items.find((i) => i.code === 'BG01')!;
    menu.saveItem(ctx('admin'), burger.id, { ...newMenuItem(burger.name), categoryId: burger.categoryId, code: burger.code, price: 999, prepLocation: 'KITCHEN', taxGroupId: burger.taxGroupId });
    expect(db.items.find((i) => i.code === 'BG01')!.price).toBe(999);
    expect(billing.finalizeBill(cashier, bill.id).grandTotal, 'the open bill is unmoved').toBe(484);
  });
});

// ---------------------------------------------------------------------------
// 7. Discounts and approval
// ---------------------------------------------------------------------------
/**
 * RULE: a discount cap is a financial control, and it is enforced by the server. `ROLE_MAX_DISCOUNT`
 * gives the cashier 10 % and the manager 30 %; above the cap the request needs a named approver who
 * (a) holds `orders:approve-discount`, (b) has a cap large enough themselves, and (c) supplies their
 * own PIN. Note the status: exceeding the cap is 403 FORBIDDEN, not 422 — the engine treats it as
 * "you are not permitted to do this", which is what `addDiscount` throws.
 */
describe('discount caps and manager approval', () => {
  it('keeps the seeded caps the rest of this block depends on', () => {
    expect(ROLE_MAX_DISCOUNT.CASHIER).toBe(10);
    expect(ROLE_MAX_DISCOUNT.MANAGER).toBe(30);
    expect(ROLE_MAX_DISCOUNT.WAITER).toBe(0);
    // the engine reads the cap off the role row, not off the constant — they must agree
    expect(db.roles.find((r) => r.code === 'CASHIER')!.maxDiscountPercent).toBe(10);
  });

  it('applies a discount inside the caller\'s cap and reflects it in the total', () => {
    const { bill, cashier } = openBill();
    const out = billing.addDiscount(cashier, bill.id, { discountType: 'PERCENTAGE', value: 10, reason: 'Service delay' });
    expect(out.discounts).toHaveLength(1);
    expect(out.discounts[0].amount).toBe(44);
    expect(out.discounts[0].appliedBy).toBe(userId('cashier'));
    expect(out.discounts[0].approvedBy, 'inside the cap needs no approver').toBeNull();
    expect(out.grandTotal).toBe(436);                                   // 484 undiscounted
  });

  it('refuses a discount above the caller\'s cap with 403 and changes nothing', () => {
    const { bill, cashier } = openBill();
    expectStatus(() => billing.addDiscount(cashier, bill.id, { discountType: 'PERCENTAGE', value: 15, reason: 'Friend of the house' }), 403);
    const untouched = billing.getBill(cashier, bill.id);
    expect(untouched.discounts, 'no discount row was written').toEqual([]);
    expect(untouched.grandTotal).toBe(484);
  });

  /* The cap is on the EFFECTIVE percentage, so a flat amount cannot be used to walk around it:
     ₹100 off ₹440 is 22.7 %, well past the cashier's 10 %. */
  it('measures a flat discount as a percentage of the bill before capping it', () => {
    const { bill, cashier } = openBill();
    expectStatus(() => billing.addDiscount(cashier, bill.id, { discountType: 'FLAT', value: 100, reason: 'Regular' }), 403);
    const ok = billing.addDiscount(cashier, bill.id, { discountType: 'FLAT', value: 40, reason: 'Regular' });   // 9.1 %
    expect(ok.orderDiscountTotal).toBe(40);
  });

  it('accepts the same discount with a valid manager approval', () => {
    const { bill, cashier } = openBill();
    const out = billing.addDiscount(cashier, bill.id, {
      discountType: 'PERCENTAGE', value: 15, reason: 'Friend of the house',
      approvedByUserId: userId('manager'), approvalPin: '1234',
    });
    expect(out.discounts[0].approvedBy).toBe(userId('manager'));
    expect(out.orderDiscountTotal).toBe(66);                            // 440 × 15 %
  });

  it('rejects an approval with the wrong PIN, an approver who cannot approve, or one whose own cap is too small', () => {
    const { bill, cashier } = openBill();
    const approve = (by: string, pin: string, value = 15) => () => billing.addDiscount(cashier, bill.id, {
      discountType: 'PERCENTAGE', value, reason: 'Friend of the house', approvedByUserId: userId(by), approvalPin: pin,
    });
    expectStatus(approve('manager', '0000'), 403);                      // wrong PIN
    expectStatus(approve('waiter1', '1234'), 403);                      // no `orders:approve-discount`, and no PIN at all
    expectStatus(approve('manager', '1234', 40), 403);                  // 40 % is past the manager's own 30 % cap
    expect(billing.getBill(cashier, bill.id).discounts).toEqual([]);
    // an admin (cap 100 %) can authorise the 40 %
    expect(billing.addDiscount(cashier, bill.id, {
      discountType: 'PERCENTAGE', value: 40, reason: 'Owner\'s table', approvedByUserId: userId('admin'), approvalPin: '1234',
    }).orderDiscountTotal).toBe(176);
  });

  /* A discount is a financial act: the reason is what makes it auditable, and the engine requires
     it rather than the form. */
  it('validates the discount body itself with 400', () => {
    const { bill, cashier } = openBill();
    expectStatus(() => billing.addDiscount(cashier, bill.id, { discountType: 'PERCENTAGE', value: 5, reason: '  ' }), 400);
    expectStatus(() => billing.addDiscount(cashier, bill.id, { discountType: 'PERCENTAGE', value: 0, reason: 'Nothing' }), 400);
    expectStatus(() => billing.addDiscount(ctx('admin'), bill.id, { discountType: 'PERCENTAGE', value: 101, reason: 'Too much' }), 400);
    expectStatus(() => billing.addDiscount(ctx('admin'), bill.id, { discountType: 'FLAT', value: 10_000, reason: 'Too much' }), 400);
  });

  it('refuses a role with no billing:discount grant at all, and refuses a closed bill', () => {
    const { bill, cashier } = openBill();
    expectStatus(() => billing.addDiscount(ctx('waiter1'), bill.id, { discountType: 'PERCENTAGE', value: 5, reason: 'Nope' }), 403);
    billing.finalizeBill(cashier, bill.id);
    expectStatus(() => billing.addDiscount(cashier, bill.id, { discountType: 'PERCENTAGE', value: 5, reason: 'Too late' }), 422);
  });

  it('removes a discount and restores the original total', () => {
    const { bill, cashier } = openBill();
    const applied = billing.addDiscount(cashier, bill.id, { discountType: 'PERCENTAGE', value: 10, reason: 'Service delay' });
    const removed = billing.removeDiscount(cashier, bill.id, applied.discounts[0].id);
    expect(removed.orderDiscountTotal).toBe(0);
    expect(removed.grandTotal).toBe(484);
    expect(removed.discounts[0].isVoided, 'voided, never deleted').toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 8. Split payments and refunds
// ---------------------------------------------------------------------------
/**
 * RULE: a bill is PAID when the money is all there, and not a moment before. Two cards and a
 * handful of cash must settle to exactly zero; a part payment must leave the bill open and the
 * table in PAYMENT_PENDING; a reversal must give back exactly one payment and refuse to give it
 * back twice. `paidAmount` is recomputed from the SUCCESS payments every time — nothing is
 * incremented in place, so a repeated call cannot drift the figure.
 */
describe('split payments, settlement and refunds', () => {
  /** A finalized ₹484 bill (the undiscounted two-line bill above). */
  const finalized = () => {
    const { bill, cashier, order } = openBill();
    return { order, cashier, bill: billing.finalizeBill(cashier, bill.id) };
  };

  it('settles a bill exactly with two partial payments', () => {
    const { bill, cashier } = finalized();
    expect(bill.grandTotal).toBe(484);

    const first = billing.addPayment(cashier, bill.id, { method: 'CASH', amount: 200 });
    expect(first.paidAmount).toBe(200);
    expect(first.balanceDue).toBe(284);
    expect(first.paymentStatus).toBe('PARTIALLY_PAID');
    expect(first.status, 'still open for money').toBe('FINALIZED');
    expect(first.paidAt, 'not paid, so no paid-at timestamp').toBeNull();

    const second = billing.addPayment(cashier, bill.id, { method: 'CARD', amount: 284 });
    expect(second.paidAmount).toBe(484);
    expect(second.balanceDue).toBe(0);
    expect(second.paymentStatus).toBe('PAID');
    expect(second.status).toBe('PAID');
    expect(second.paidAt).not.toBeNull();
    expect(second.payments.map((p) => p.amount)).toEqual([200, 284]);
  });

  it('will not accept more than the balance due', () => {
    const { bill, cashier } = finalized();
    billing.addPayment(cashier, bill.id, { method: 'CASH', amount: 400 });
    // a rejected FIELD (the amount) is 400
    expectStatus(() => billing.addPayment(cashier, bill.id, { method: 'CASH', amount: 100 }), 400);
    expectStatus(() => billing.addPayment(cashier, bill.id, { method: 'CASH', amount: 0 }), 400);
    expectStatus(() => billing.addPayment(cashier, bill.id, { method: 'BITCOIN' as never, amount: 10 }), 400);
    expect(billing.getBill(cashier, bill.id).paidAmount, 'nothing extra was taken').toBe(400);
  });

  it('will not take money on a bill that is still open, and will not close one that is not paid', () => {
    const { bill, cashier } = openBill();
    expectStatus(() => billing.addPayment(cashier, bill.id, { method: 'CASH', amount: 100 }), 422);
    const f = billing.finalizeBill(cashier, bill.id);
    billing.addPayment(cashier, f.id, { method: 'CASH', amount: 100 });
    expectStatus(() => billing.closeBill(cashier, f.id), 422);
    expect(billing.getBill(cashier, f.id).status).toBe('FINALIZED');
  });

  it('reverses exactly one payment and refuses to reverse it twice', () => {
    const { bill, cashier } = finalized();
    billing.addPayment(cashier, bill.id, { method: 'CASH', amount: 200 });
    const paid = billing.addPayment(cashier, bill.id, { method: 'CARD', amount: 284 });
    const card = paid.payments.find((p) => p.method === 'CARD')!;

    const m = ctx('manager');
    const reversed = billing.reversePayment(m, bill.id, card.id, 'Card charged in error');
    expect(reversed.paidAmount, 'exactly the card payment came off').toBe(200);
    expect(reversed.balanceDue).toBe(284);
    expect(reversed.paymentStatus).toBe('PARTIALLY_PAID');
    expect(reversed.status).toBe('FINALIZED');
    expect(reversed.payments.find((p) => p.id === card.id)!.status).toBe('REVERSED');
    expect(reversed.payments.find((p) => p.id === card.id)!.reversalReason).toBe('Card charged in error');
    expect(reversed.payments, 'reversed, never deleted').toHaveLength(2);

    // a second reversal is a state clash, not a permission problem: 409
    expectStatus(() => billing.reversePayment(m, bill.id, card.id, 'Again'), 409);
    expect(billing.getBill(cashier, bill.id).paidAmount, 'the amount did not move a second time').toBe(200);

    // reversing the rest leaves the bill fully refunded
    const cash = paid.payments.find((p) => p.method === 'CASH')!;
    const empty = billing.reversePayment(m, bill.id, cash.id, 'Refunded in full');
    expect(empty.paidAmount).toBe(0);
    expect(empty.paymentStatus).toBe('REFUNDED');
    expect(empty.balanceDue).toBe(484);
  });

  it('requires a reason for a reversal and a payment that exists', () => {
    const { bill, cashier } = finalized();
    const p = billing.addPayment(cashier, bill.id, { method: 'CASH', amount: 484 }).payments[0];
    const m = ctx('manager');
    expectStatus(() => billing.reversePayment(m, bill.id, p.id, '   '), 400);
    expectStatus(() => billing.reversePayment(m, bill.id, 999_999, 'Ghost payment'), 404);
    expect(billing.getBill(cashier, bill.id).paymentStatus).toBe('PAID');
  });

  /* Re-opening a CLOSED bill is an admin act; a manager holds `billing:refund` but not
     `billing:edit-paid`, so the closed day cannot be edited from the floor. */
  it('refuses to reverse a payment on a closed bill without billing:edit-paid', () => {
    const { bill, cashier } = finalized();
    const p = billing.addPayment(cashier, bill.id, { method: 'CASH', amount: 484 }).payments[0];
    billing.closeBill(cashier, bill.id);
    expectStatus(() => billing.reversePayment(ctx('manager'), bill.id, p.id, 'Too late'), 403);
    // an admin can, and the bill drops back out of CLOSED rather than being edited in place
    const reopened = billing.reversePayment(ctx('admin'), bill.id, p.id, 'Chargeback');
    expect(reopened.status).toBe('FINALIZED');
    expect(reopened.closedAt).toBeNull();
    expect(reopened.paidAmount).toBe(0);
  });

  it('marks a complimentary settlement as a manager act', () => {
    const { bill, cashier } = finalized();
    // the cashier can take cash but not write the bill off
    expectStatus(() => billing.addPayment(cashier, bill.id, { method: 'COMPLIMENTARY', amount: 484 }), 403);
    expect(billing.addPayment(ctx('manager'), bill.id, { method: 'COMPLIMENTARY', amount: 484 }).paymentStatus).toBe('PAID');
  });
});

// ---------------------------------------------------------------------------
// 9. Idempotence
// ---------------------------------------------------------------------------
/**
 * RULE: the same request twice must not cost the guest twice. Tablets lose signal, cashiers press
 * the key again, a realtime reconnect replays a call — the engine guards the operations where a
 * repeat would create money or stock out of nothing, and those guards are asserted here by calling
 * the engine function a second time directly, which is what a retry actually looks like.
 */
describe('idempotence of the money and stock hooks', () => {
  it('returns the existing bill instead of opening a second one for the same order', () => {
    const { order, cashier, bill } = openBill();
    const again = billing.createBill(cashier, order.id);
    expect(again.id).toBe(bill.id);
    expect(db.bills.filter((b) => b.orderId === order.id)).toHaveLength(1);
  });

  /* Loyalty earn is the named example: points are posted once per bill, guarded by an EARN
     transaction already carrying that billId (`earnForBill` in p2/crm.ts). */
  it('earns loyalty points once per bill, however many times the hook runs', () => {
    const guest = crm.saveCustomer(ctx('manager'), null, { fullName: 'Repeat Guest', phone: '+919000022222', consentMarketing: false });
    const { order, bill, cashier } = openBill();
    crm.attachToOrder(cashier, order.id, guest.id);
    const f = billing.finalizeBill(cashier, bill.id);
    billing.addPayment(cashier, f.id, { method: 'CASH', amount: 484 });
    const closed = billing.closeBill(cashier, f.id);

    // programme: 10 points per ₹100 on money actually paid → floor(484 / 100 × 10) = 48
    expect(closed.loyaltyPointsEarned).toBe(48);
    expect(crm.getAccount(ctx('manager'), guest.id).pointsBalance).toBe(48);

    const row = db.bills.find((b) => b.id === f.id)!;
    crm.earnForBill(ctx('cashier'), row);
    crm.earnForBill(ctx('cashier'), row);
    expect(crm.getAccount(ctx('manager'), guest.id).pointsBalance, 'the guard held').toBe(48);
    expect(db.p2.loyaltyTxns.filter((t) => t.billId === f.id && t.type === 'EARN')).toHaveLength(1);
  });

  it('records the visit once, so the guest\'s spend is not doubled', () => {
    const guest = crm.saveCustomer(ctx('manager'), null, { fullName: 'Visit Guest', phone: '+919000033333', consentMarketing: false });
    const { order, bill, cashier } = openBill();
    crm.attachToOrder(cashier, order.id, guest.id);
    const f = billing.finalizeBill(cashier, bill.id);
    billing.addPayment(cashier, f.id, { method: 'CASH', amount: 484 });
    billing.closeBill(cashier, f.id);

    crm.recordVisit(cashier, db.bills.find((b) => b.id === f.id)!);
    expect(db.p2.customerVisits.filter((v) => v.billId === f.id)).toHaveLength(1);
    const row = crm.getCustomer(ctx('manager'), guest.id);
    expect(row.totalVisits).toBe(1);
    expect(row.totalSpend).toBe(484);
  });

  it('closes a bill once — a repeat is a no-op, not a second close', () => {
    const { bill, cashier } = openBill();
    const f = billing.finalizeBill(cashier, bill.id);
    billing.addPayment(cashier, f.id, { method: 'CASH', amount: 484 });
    const closed = billing.closeBill(cashier, f.id);
    const again = billing.closeBill(cashier, f.id);
    expect(again.status).toBe('CLOSED');
    expect(again.closedAt).toBe(closed.closedAt);
    expect(db.audit.filter((a) => a.action === 'BILL_CLOSED' && a.entityId === f.id)).toHaveLength(1);
  });

  it('refuses a duplicate stock movement carrying an idempotency key it has already seen', () => {
    const chicken = invItem('CHK-BRST');
    inventory.applyMovement(ctx('admin'), chicken.id, 'OPENING_STOCK', 12, 320, 'MANUAL', null, 'OPENING:TEST', 'Opening count');
    expect(qtyOf(chicken.id)).toBe(12);
    const rows = db.p2.movements.length;
    const repeat = inventory.applyMovement(ctx('admin'), chicken.id, 'OPENING_STOCK', 12, 320, 'MANUAL', null, 'OPENING:TEST', 'Opening count');
    expect(repeat, 'the engine returns null rather than posting again').toBeNull();
    expect(qtyOf(chicken.id)).toBe(12);
    expect(db.p2.movements.length).toBe(rows);
  });

  it('deducts an order line once even if the confirmation hook runs again', () => {
    const chicken = invItem('CHK-BRST');
    inventory.manualMovement(ctx('admin'), { invItemId: chicken.id, type: 'OPENING_STOCK', qty: 20, reason: 'Opening count' });
    inventory.saveRecipe(ctx('admin'), item('BG01'), { yieldQty: 1, ingredients: [{ invItemId: chicken.id, qty: 200, unitId: 1, wastagePct: 0 }] });
    const w = ctx('waiter1');
    const o = orders.confirmOrder(w, orders.createOrder(w, { tableId: freeTable(), items: [{ menuItemId: item('BG01'), quantity: 1 }] }).id);
    expect(qtyOf(chicken.id)).toBe(19.8);

    const rows = db.p2.movements.length;
    inventory.onOrderConfirmed(w, o.id);
    inventory.onOrderConfirmed(w, o.id);
    expect(db.p2.movements.length).toBe(rows);
    expect(qtyOf(chicken.id)).toBe(19.8);
  });
});
