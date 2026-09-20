/**
 * MOCK ENGINE — customers (consent-aware CRM) and loyalty ledger (mirror of CUSTOMER_PKG + LOYALTY_PKG).
 */
import { type Ctx, errors, now, audit, assertPermission, nextId, nextDocNumber, clone } from '../context';
import type { Customer, CustomerInput, CustomerHistory, LoyaltyAccount, LoyaltyProgram, LoyaltyProgramInput, LoyaltyTxnType, Bill, Order, ID } from '@/types';
import { round2 } from '@/utils/money';

// ------------------------------------------------------------ customers
function hydrateCustomer(ctx: Ctx, c: Ctx['db']['p2']['customers'][number]): Customer {
  const { orgId: _o, isDeleted: _d, ...base } = c;
  const acc = ctx.db.p2.loyaltyAccounts.find((a) => a.customerId === c.id);
  return { ...clone(base), averageSpend: c.totalVisits > 0 ? round2(c.totalSpend / c.totalVisits) : 0, loyaltyPoints: acc?.pointsBalance ?? 0, loyaltyTier: acc?.tier ?? null };
}

export function listCustomers(ctx: Ctx, q: { search?: string; limit?: number }): Customer[] {
  assertPermission(ctx, 'customers:view');
  const s = (q.search ?? '').toLowerCase();
  return ctx.db.p2.customers.filter((c) => !c.isDeleted)
    .filter((c) => !s || c.fullName.toLowerCase().includes(s) || c.phone.includes(s) || (c.email ?? '').toLowerCase().includes(s))
    .sort((a, b) => (b.lastVisitAt ?? '').localeCompare(a.lastVisitAt ?? '') || a.fullName.localeCompare(b.fullName))
    .slice(0, q.limit ?? 100).map((c) => hydrateCustomer(ctx, c));
}

export function getCustomer(ctx: Ctx, id: ID): Customer {
  assertPermission(ctx, 'customers:view');
  const c = ctx.db.p2.customers.find((x) => x.id === Number(id) && !x.isDeleted);
  if (!c) throw errors.notFound('Customer not found');
  return hydrateCustomer(ctx, c);
}

export function saveCustomer(ctx: Ctx, id: ID | null, body: CustomerInput): Customer {
  assertPermission(ctx, 'customers:manage');
  const fullName = String(body.fullName ?? '').trim();
  const phone = String(body.phone ?? '').replace(/[^0-9+]/g, '');
  if (!fullName) throw errors.validation('Name is required', 'fullName');
  if (phone.length < 8) throw errors.validation('A valid phone number is required', 'phone');
  if (ctx.db.p2.customers.some((c) => !c.isDeleted && c.id !== id && c.phone === phone)) throw errors.conflict('A customer with this phone number already exists');
  const consent = !!body.consentMarketing;
  let c: Ctx['db']['p2']['customers'][number];
  if (id == null) {
    c = { id: nextId(ctx.db, 'customer'), orgId: 1, fullName, phone, email: body.email || null, birthday: body.birthday || null, anniversary: body.anniversary || null, tags: body.tags || null, notes: body.notes || null, consentMarketing: consent, consentAt: consent ? now() : null, totalVisits: 0, totalSpend: 0, averageSpend: 0, lastVisitAt: null, loyaltyPoints: 0, loyaltyTier: null, createdAt: now(), isDeleted: false };
    ctx.db.p2.customers.push(c);
  } else {
    const f = ctx.db.p2.customers.find((x) => x.id === id && !x.isDeleted);
    if (!f) throw errors.notFound('Customer not found');
    Object.assign(f, { fullName, phone, email: body.email || null, birthday: body.birthday || null, anniversary: body.anniversary || null, tags: body.tags || null, notes: body.notes || null, consentAt: consent && !f.consentMarketing ? now() : consent ? f.consentAt : null, consentMarketing: consent });
    c = f;
  }
  audit(ctx, id == null ? 'CUSTOMER_CREATED' : 'CUSTOMER_UPDATED', 'CUSTOMERS', c.id);   // no PII in audit
  return hydrateCustomer(ctx, c);
}

export function deleteCustomer(ctx: Ctx, id: ID): null {
  assertPermission(ctx, 'customers:manage');
  const c = ctx.db.p2.customers.find((x) => x.id === Number(id) && !x.isDeleted);
  if (!c) throw errors.notFound('Customer not found');
  // soft delete + anonymise (privacy)
  Object.assign(c, { isDeleted: true, fullName: 'Deleted customer', phone: `DEL-${c.id}`, email: null, birthday: null, anniversary: null, notes: null, tags: null, consentMarketing: false });
  audit(ctx, 'CUSTOMER_DELETED', 'CUSTOMERS', c.id);
  return null;
}

export function customerHistory(ctx: Ctx, id: ID): CustomerHistory {
  const customer = getCustomer(ctx, id);
  const visits = ctx.db.p2.customerVisits.filter((v) => v.customerId === customer.id).sort((a, b) => b.visitedAt.localeCompare(a.visitedAt)).map((v) => ({ id: v.id, orderId: v.orderId ?? null, orderNumber: ctx.db.orders.find((o) => o.id === v.orderId)?.orderNumber ?? null, billId: v.billId ?? null, billNumber: ctx.db.bills.find((b) => b.id === v.billId)?.billNumber ?? null, amount: v.amount, visitedAt: v.visitedAt }));
  const favs = new Map<string, number>();
  ctx.db.orders.filter((o) => o.customerId === customer.id).flatMap((o) => o.items).filter((i) => i.status !== 'CANCELLED').forEach((i) => favs.set(i.itemName, (favs.get(i.itemName) ?? 0) + i.quantity));
  const acc = ensureAccount(ctx, customer.id);
  return {
    customer, visits,
    favouriteItems: [...favs.entries()].map(([itemName, quantity]) => ({ itemName, quantity })).sort((a, b) => b.quantity - a.quantity).slice(0, 5),
    loyalty: accountJson(ctx, customer.id),
    loyaltyTransactions: ctx.db.p2.loyaltyTxns.filter((t) => t.accountId === acc.accountId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(({ accountId: _a, paymentId: _p, refLtxId: _r, ...t }) => clone(t)),
  };
}

export function attachToOrder(ctx: Ctx, orderId: ID, customerId: ID | null): Order {
  assertPermission(ctx, 'customers:view');
  const o = ctx.db.orders.find((x) => x.id === Number(orderId));
  if (!o || ['COMPLETED', 'CANCELLED'].includes(o.status)) throw errors.notFound('Active order not found');
  const c = customerId ? ctx.db.p2.customers.find((x) => x.id === Number(customerId) && !x.isDeleted) : null;
  if (customerId && !c) throw errors.notFound('Customer not found');
  o.customerId = c?.id ?? null; o.customerName = c?.fullName ?? null; o.updatedAt = now();
  ctx.db.bills.filter((b) => b.orderId === o.id && b.status !== 'VOID').forEach((b) => { b.customerId = c?.id ?? null; });
  audit(ctx, 'ORDER_CUSTOMER_SET', 'ORDERS', o.id, null, String(customerId));
  ctx.emit('orders', 'order.updated', o.id);
  return clone(o);
}

/** hook: bill closed */
export function recordVisit(ctx: Ctx, bill: Bill): void {
  const order = ctx.db.orders.find((o) => o.id === bill.orderId);
  const custId = bill.customerId ?? order?.customerId ?? null;
  if (!custId) return;
  if (ctx.db.p2.customerVisits.some((v) => v.billId === bill.id)) return;
  const c = ctx.db.p2.customers.find((x) => x.id === custId);
  if (!c) return;
  ctx.db.p2.customerVisits.push({ id: nextId(ctx.db, 'visit'), customerId: custId, branchId: bill.branchId, orderId: bill.orderId, billId: bill.id, visitedAt: now(), amount: bill.grandTotal });
  c.totalVisits += 1; c.totalSpend = round2(c.totalSpend + bill.grandTotal); c.lastVisitAt = now();
  if (!bill.customerId) bill.customerId = custId;
}

// ------------------------------------------------------------ loyalty
export function program(ctx: Ctx): LoyaltyProgram {
  const p = ctx.db.p2.loyaltyProgram;
  const out = ctx.db.p2.loyaltyAccounts.reduce((a, x) => a + x.pointsBalance, 0);
  return { ...clone(p), memberCount: ctx.db.p2.loyaltyAccounts.length, outstandingPoints: out, outstandingValue: round2(out * p.pointValue) };
}

export function saveProgram(ctx: Ctx, body: LoyaltyProgramInput): LoyaltyProgram {
  assertPermission(ctx, 'loyalty:manage');
  const p = ctx.db.p2.loyaltyProgram;
  const next = { ...p, ...Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined && v !== null)) } as LoyaltyProgram;
  if (next.pointsPer100 < 0 || next.pointValue < 0 || next.minRedeemPoints < 0 || next.maxRedeemPercent < 0 || next.maxRedeemPercent > 100 || next.expiryDays < 0) throw errors.validation('Program values must be non-negative (max redeem ≤ 100 %)');
  Object.assign(p, next);
  audit(ctx, 'LOYALTY_PROGRAM_UPDATED', 'LOYALTY_PROGRAMS', p.id, null, body);
  return program(ctx);
}

export function ensureAccount(ctx: Ctx, customerId: ID) {
  let a = ctx.db.p2.loyaltyAccounts.find((x) => x.customerId === customerId);
  if (!a) { a = { accountId: nextId(ctx.db, 'loyaltyAccount'), customerId, pointsBalance: 0, lifetimePoints: 0, tier: 'SILVER' }; ctx.db.p2.loyaltyAccounts.push(a); }
  return a;
}

export function accountJson(ctx: Ctx, customerId: ID): LoyaltyAccount {
  const a = ensureAccount(ctx, Number(customerId));
  const p = ctx.db.p2.loyaltyProgram;
  return { accountId: a.accountId, customerId: a.customerId, pointsBalance: a.pointsBalance, lifetimePoints: a.lifetimePoints, tier: a.tier, pointValue: p.pointValue, balanceValue: round2(a.pointsBalance * p.pointValue), minRedeemPoints: p.minRedeemPoints, maxRedeemPercent: p.maxRedeemPercent };
}

export function getAccount(ctx: Ctx, customerId: ID): LoyaltyAccount {
  assertPermission(ctx, 'loyalty:view');
  if (!ctx.db.p2.customers.some((c) => c.id === Number(customerId) && !c.isDeleted)) throw errors.notFound('Customer not found');
  return accountJson(ctx, Number(customerId));
}

function postTxn(ctx: Ctx, accountId: ID, type: LoyaltyTxnType, points: number, amountRef: number | null, billId: ID | null, paymentId: ID | null, refLtxId: ID | null, notes: string, expiresAt: string | null): void {
  const a = ctx.db.p2.loyaltyAccounts.find((x) => x.accountId === accountId)!;
  ctx.db.p2.loyaltyTxns.push({ id: nextId(ctx.db, 'loyaltyTxn'), accountId, type, points, amountRef, billId, paymentId, refLtxId, notes, expiresAt, createdAt: now() });
  a.pointsBalance += points; a.lifetimePoints += Math.max(points, 0);
  a.tier = a.lifetimePoints >= 5000 ? 'PLATINUM' : a.lifetimePoints >= 2000 ? 'GOLD' : 'SILVER';
}

/** hook: bill closed — earn on money actually paid (not on points redeemed / complimentary) */
export function earnForBill(ctx: Ctx, bill: Bill): void {
  const p = ctx.db.p2.loyaltyProgram;
  if (!p.isActive) return;
  const order = ctx.db.orders.find((o) => o.id === bill.orderId);
  const custId = bill.customerId ?? order?.customerId ?? null;
  if (!custId) return;
  const acc = ensureAccount(ctx, custId);
  if (ctx.db.p2.loyaltyTxns.some((t) => t.billId === bill.id && t.type === 'EARN')) return;
  const base = bill.payments.filter((x) => x.status === 'SUCCESS' && !['LOYALTY', 'COMPLIMENTARY'].includes(x.method)).reduce((a, x) => a + x.amount, 0);
  const points = Math.floor((base / 100) * p.pointsPer100);
  if (points <= 0) return;
  postTxn(ctx, acc.accountId, 'EARN', points, base, bill.id, null, null, `Earned on ${bill.billNumber}`, new Date(Date.now() + p.expiryDays * 86400000).toISOString());
  bill.loyaltyPointsEarned = points;
  audit(ctx, 'LOYALTY_EARN', 'BILLS', bill.id, null, `${points} points`);
}

export function redeemOnBill(ctx: Ctx, billId: ID, points: number, refreshBill: (ctx: Ctx, bill: Bill) => void): Bill {
  const me = assertPermission(ctx, 'loyalty:redeem');
  const p = ctx.db.p2.loyaltyProgram;
  if (!p.isActive) throw errors.business('Loyalty program is inactive');
  const bill = ctx.db.bills.find((b) => b.id === Number(billId));
  if (!bill) throw errors.notFound('Bill not found');
  if (bill.status !== 'FINALIZED') throw errors.business('Finalize the bill before redeeming points');
  const order = ctx.db.orders.find((o) => o.id === bill.orderId);
  const custId = bill.customerId ?? order?.customerId ?? null;
  if (!custId) throw errors.business('Attach a customer to the order to redeem points');
  const pts = Number(points);
  if (!(pts > 0)) throw errors.validation('Points must be positive', 'points');
  if (pts < p.minRedeemPoints) throw errors.validation(`Minimum redemption is ${p.minRedeemPoints} points`, 'points');
  const acc = ensureAccount(ctx, custId);
  if (pts > acc.pointsBalance) throw errors.validation(`Customer has only ${acc.pointsBalance} points`, 'points');
  const value = round2(pts * p.pointValue);
  const maxValue = round2((bill.grandTotal * p.maxRedeemPercent) / 100);
  if (value > maxValue) throw errors.validation(`Points can cover at most ${p.maxRedeemPercent}% of the bill (₹${maxValue})`, 'points');
  const balance = round2(bill.grandTotal - bill.paidAmount);
  if (value > balance) throw errors.validation(`Redemption value ₹${value} exceeds balance due ₹${balance}`, 'points');
  const payment = { id: nextId(ctx.db, 'payment'), paymentNumber: nextDocNumber(ctx.db, 'PAY'), billId: bill.id, method: 'LOYALTY' as const, amount: value, reference: `${pts} pts`, status: 'SUCCESS' as const, receivedBy: me.id, receivedByName: me.fullName, createdAt: now(), reversedAt: null, reversalReason: null };
  bill.payments.push(payment);
  postTxn(ctx, acc.accountId, 'REDEEM', -pts, value, bill.id, payment.id, null, `Redeemed on ${bill.billNumber}`, null);
  refreshBill(ctx, bill);
  audit(ctx, 'LOYALTY_REDEEM', 'BILLS', bill.id, null, `${pts} points = ₹${value}`);
  ctx.emit('bills', 'payment.received', bill.id);
  return clone(bill);
}

/** hook: payment reversed */
export function reverseRedemption(ctx: Ctx, paymentId: ID): void {
  for (const t of ctx.db.p2.loyaltyTxns.filter((x) => x.paymentId === paymentId && x.type === 'REDEEM')) {
    postTxn(ctx, t.accountId, 'REVERSAL', -t.points, t.amountRef ?? null, t.billId ?? null, paymentId, t.id, 'Payment reversed', null);
  }
}

export function adjust(ctx: Ctx, customerId: ID, points: number, notes: string): LoyaltyAccount {
  assertPermission(ctx, 'loyalty:manage');
  const pts = Number(points);
  if (!pts) throw errors.validation('Points must be non-zero', 'points');
  if (!notes?.trim()) throw errors.validation('A note is required', 'notes');
  if (!ctx.db.p2.customers.some((c) => c.id === Number(customerId) && !c.isDeleted)) throw errors.notFound('Customer not found');
  const acc = ensureAccount(ctx, Number(customerId));
  if (acc.pointsBalance + pts < 0) throw errors.validation('Balance cannot go negative', 'points');
  postTxn(ctx, acc.accountId, 'PROMO', pts, null, null, null, null, notes.trim(), null);
  audit(ctx, 'LOYALTY_ADJUST', 'CUSTOMERS', Number(customerId), null, `${pts} — ${notes}`);
  return accountJson(ctx, Number(customerId));
}
