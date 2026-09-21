import { type Ctx, errors, now, audit, assertPermission, hasPermission, nextId, nextDocNumber, clone, userName, userMaxDiscount, currentBranch } from './context';
import { setOrderStatus } from './orders';
import { syncTableStatus } from './tables';
import { onBillClosed as inventoryOnBillClosed } from './p2/inventory';
import { recordVisit, earnForBill, reverseRedemption } from './p2/crm';
import { shortfallForOrder, vipOnBillClosed, reverseCoverRedemption, reverseRoomCharge } from './p2/guests';
import type { Bill, BillListParams, AddDiscountRequest, AddPaymentRequest, Receipt, PaymentStatus, BillStatus, Discount } from '@/types';
import { calculateBill, discountPercentOf } from '@/utils/billing';
import { bestOfferForLine } from '@/utils/offers';
import { round2 } from '@/utils/money';

/**
 * A bill, scoped to the caller's branch.
 *
 * The branch predicate is the point. Every LIST path already filtered on `ctx.branchId`, but this
 * by-id lookup did not — so a cashier signed in to branch 2 who knew (or guessed) a branch-1 bill
 * id could read it, and because `addPayment`, `addDiscount` and `reversePayment` all resolve the
 * bill through here, they could take money against another branch's bill. Filtering on the list
 * and trusting the id on the write is the classic shape of this bug.
 *
 * NOT FOUND rather than FORBIDDEN, deliberately: a caller with no business seeing this row should
 * not learn from the error that it exists.
 */
function findBill(ctx: Ctx, id: number): Bill {
  const b = ctx.db.bills.find((x) => x.id === Number(id) && x.branchId === ctx.branchId);
  if (!b) throw errors.notFound('Bill not found');
  return b;
}

function hydrate(ctx: Ctx, b: Bill): Bill {
  const customer = b.customerId ? ctx.db.p2.customers.find((c) => c.id === b.customerId) : undefined;
  return { ...clone(b), cashierName: userName(ctx.db, b.cashierId), customerName: customer?.fullName ?? null, balanceDue: round2(b.grandTotal - b.paidAmount), discountTotal: round2(b.itemDiscountTotal + b.orderDiscountTotal) };
}

/** BILLING_PKG.calculate — delegates to the shared pure engine. */
export function calculate(ctx: Ctx, b: Bill): void {
  const branch = currentBranch(ctx);
  const res = calculateBill({
    lines: b.items.map((i) => ({ key: i.id, quantity: i.quantity, unitPrice: i.unitPrice, itemDiscount: i.discountAmount, taxRates: ctx.db.taxGroups.find((t) => t.id === i.taxGroupId)?.rates ?? [] })),
    orderDiscounts: b.discounts.filter((d) => !d.isVoided).map((d) => ({ key: d.id, type: d.discountType === 'FLAT' ? 'FLAT' : 'PERCENTAGE', value: d.value })),
    serviceChargePercent: b.serviceChargePercent,
    taxOnServiceCharge: branch.taxOnServiceCharge,
    roundingMode: branch.roundingMode,
  });
  for (const l of res.lines) {
    const it = b.items.find((i) => i.id === l.key)!;
    it.lineTotal = l.lineTotal; it.taxableAmount = l.taxableAmount; it.taxPercent = l.taxPercent; it.taxAmount = l.taxAmount;
  }
  for (const d of res.discounts) { const disc = b.discounts.find((x) => x.id === d.key); if (disc) disc.amount = d.amount; }
  // Phase 2: VIP minimum-spend shortfall (branch rule; non-taxable, added before rounding — mirrors BILLING_PKG.calculate)
  const shortfall = shortfallForOrder(ctx, b.orderId, res.netAmount);
  const raw = round2(res.netAmount + res.serviceChargeAmount + res.taxTotal + shortfall);
  const mode = branch.roundingMode;
  const grand = mode === 'NEAREST' ? Math.round(raw) : mode === 'UP' ? Math.ceil(raw) : mode === 'DOWN' ? Math.floor(raw) : raw;
  Object.assign(b, { subtotal: res.subtotal, itemDiscountTotal: res.itemDiscountTotal, orderDiscountTotal: res.orderDiscountTotal, discountTotal: round2(res.itemDiscountTotal + res.orderDiscountTotal), serviceChargeAmount: res.serviceChargeAmount, taxLines: res.taxLines, taxTotal: res.taxTotal, minSpendShortfall: shortfall, roundOff: round2(grand - raw), grandTotal: grand });
  refreshPaymentStatus(ctx, b);
}

export function refreshPaymentStatus(ctx: Ctx, b: Bill): void {
  const paid = round2(b.payments.filter((p) => p.status === 'SUCCESS').reduce((a, p) => a + p.amount, 0));
  const reversed = b.payments.filter((p) => p.status === 'REVERSED').reduce((a, p) => a + p.amount, 0);
  b.paidAmount = paid;
  b.balanceDue = round2(b.grandTotal - paid);
  let ps: PaymentStatus = 'UNPAID';
  if (paid >= b.grandTotal && b.grandTotal > 0) ps = 'PAID';
  else if (paid === 0 && reversed > 0) ps = 'REFUNDED';
  else if (paid > 0) ps = 'PARTIALLY_PAID';
  else if (b.grandTotal === 0 && ['FINALIZED', 'PAID', 'CLOSED'].includes(b.status)) ps = 'PAID';
  b.paymentStatus = ps;
  if (ps === 'PAID' && !b.paidAt) b.paidAt = now();
  if (ps !== 'PAID') b.paidAt = null;
  if (b.status === 'FINALIZED' || b.status === 'PAID') {
    b.status = ps === 'PAID' ? 'PAID' : 'FINALIZED';
    setOrderStatus(ctx, b.orderId, ps === 'PAID' ? 'PAID' : 'BILLED', `payment status ${ps}`);
  }
  syncTableStatus(ctx, b.tableId);
}

export function listBills(ctx: Ctx, q: BillListParams): Bill[] {
  assertPermission(ctx, 'billing:view');
  const s = (q.search ?? '').toLowerCase();
  return ctx.db.bills
    .filter((b) => b.branchId === ctx.branchId)
    .filter((b) => !q.status || b.status === q.status)
    .filter((b) => !q.paymentStatus || b.paymentStatus === q.paymentStatus)
    .filter((b) => !q.from || b.createdAt >= q.from)
    .filter((b) => !q.to || b.createdAt <= q.to)
    .filter((b) => !s || b.billNumber.toLowerCase().includes(s) || b.orderNumber.toLowerCase().includes(s) || b.tableName.toLowerCase().includes(s))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((b) => hydrate(ctx, b));
}

export function getBill(ctx: Ctx, id: number): Bill {
  assertPermission(ctx, 'billing:view');
  return hydrate(ctx, findBill(ctx, id));
}

export function createBill(ctx: Ctx, orderId: number): Bill {
  const me = assertPermission(ctx, 'billing:create');
  const o = ctx.db.orders.find((x) => x.id === Number(orderId));
  if (!o) throw errors.notFound('Order not found');
  const existing = ctx.db.bills.find((b) => b.orderId === o.id && b.status !== 'VOID');
  if (existing) return hydrate(ctx, existing);   // idempotent
  if (['DRAFT', 'CANCELLED', 'COMPLETED'].includes(o.status)) throw errors.business(`Order in status ${o.status} cannot be billed`);
  const offers = ctx.db.offers.filter((x) => !x.isDeleted && x.branchId === o.branchId);
  const b: Bill = {
    id: nextId(ctx.db, 'bill'), billNumber: nextDocNumber(ctx.db, 'BILL'), branchId: o.branchId, orderId: o.id, orderNumber: o.orderNumber, tableId: o.tableId, tableName: o.tableName, tableNumber: o.tableNumber,
    waiterName: userName(ctx.db, o.waiterId), cashierId: me.id, cashierName: me.fullName, status: 'OPEN', paymentStatus: 'UNPAID',
    items: o.items.filter((i) => i.status !== 'CANCELLED').map((i) => {
      const mi = ctx.db.items.find((m) => m.id === i.menuItemId);
      const best = bestOfferForLine(offers, { id: i.menuItemId, categoryId: mi?.categoryId ?? -1 }, i.unitPrice, i.quantity);
      // Rule 5: snapshot from ORDER_ITEMS (historical prices)
      return { id: nextId(ctx.db, 'billItem'), orderItemId: i.id, itemName: i.itemName, quantity: i.quantity, unitPrice: i.unitPrice, lineTotal: i.lineTotal, discountAmount: best.amount, taxableAmount: 0, taxGroupId: i.taxGroupId, taxPercent: 0, taxAmount: 0, offerId: best.offer?.id ?? null, notes: i.notes ?? null, prepLocation: i.prepLocation };
    }),
    subtotal: 0, itemDiscountTotal: 0, orderDiscountTotal: 0, discountTotal: 0, serviceChargePercent: currentBranch(ctx).serviceChargePercent, serviceChargeAmount: 0,
    taxLines: [], taxTotal: 0, minSpendShortfall: 0, roundOff: 0, grandTotal: 0, paidAmount: 0, balanceDue: 0, discounts: [], payments: [], notes: null,
    customerId: o.customerId ?? null, loyaltyPointsEarned: 0,
    createdAt: now(), finalizedAt: null, paidAt: null, closedAt: null,
  };
  ctx.db.bills.push(b);
  calculate(ctx, b);
  audit(ctx, 'BILL_CREATED', 'BILLS', b.id, null, `order ${o.orderNumber}`);
  ctx.emit('bills', 'bill.created', b.id);
  return hydrate(ctx, b);
}

export function addDiscount(ctx: Ctx, id: number, body: AddDiscountRequest): Bill {
  const me = assertPermission(ctx, 'billing:discount');
  const b = findBill(ctx, id);
  if (b.status !== 'OPEN') throw errors.business('Discounts can only be applied to an open bill');
  if (!['PERCENTAGE', 'FLAT'].includes(body.discountType)) throw errors.validation('Invalid discount type', 'discountType');
  const value = Number(body.value);
  if (!Number.isFinite(value) || value <= 0) throw errors.validation('Discount value must be positive', 'value');
  if (!body.reason?.trim()) throw errors.validation('Discount reason is required', 'reason');
  const base = round2(b.subtotal - b.itemDiscountTotal);
  if (body.discountType === 'PERCENTAGE' && value > 100) throw errors.validation('Percentage cannot exceed 100', 'value');
  if (body.discountType === 'FLAT' && value > base) throw errors.validation('Discount cannot exceed bill amount', 'value');
  const pct = discountPercentOf(body.discountType, value, base);
  const cap = userMaxDiscount(ctx.db, me);
  let approvedBy: number | null = null;
  if (pct > cap + 1e-9) {
    const approver = ctx.db.users.find((u) => u.id === Number(body.approvedByUserId) && u.isActive && !u.isDeleted);
    if (!approver || !hasPermission(ctx, 'orders:approve-discount', approver) || userMaxDiscount(ctx.db, approver) < pct || !approver.approvalPin || approver.approvalPin !== body.approvalPin) {
      throw errors.forbidden(`Discount of ${pct.toFixed(1)}% exceeds your limit of ${cap}%. Manager approval required.`);
    }
    approvedBy = approver.id;
  }
  const d: Discount = { id: nextId(ctx.db, 'discount'), billId: b.id, discountType: body.discountType, value, amount: 0, reason: body.reason.trim().slice(0, 300), offerId: null, appliedBy: me.id, appliedByName: me.fullName, approvedBy, approvedByName: approvedBy ? userName(ctx.db, approvedBy) : null, isVoided: false, createdAt: now() };
  b.discounts.push(d);
  calculate(ctx, b);
  audit(ctx, 'DISCOUNT_APPLIED', 'BILLS', b.id, null, `${body.discountType} ${value} (${body.reason})`);
  ctx.emit('bills', 'bill.updated', b.id);
  return hydrate(ctx, b);
}

export function removeDiscount(ctx: Ctx, id: number, discountId: number): Bill {
  const me = assertPermission(ctx, 'billing:discount');
  const b = findBill(ctx, id);
  if (b.status !== 'OPEN') throw errors.business('Bill is no longer open');
  const d = b.discounts.find((x) => x.id === Number(discountId));
  if (!d) throw errors.notFound('Discount not found');
  d.isVoided = true;
  calculate(ctx, b);
  audit(ctx, 'DISCOUNT_VOIDED', 'DISCOUNTS', d.id, null, `by ${me.fullName}`);
  ctx.emit('bills', 'bill.updated', b.id);
  return hydrate(ctx, b);
}

export function finalizeBill(ctx: Ctx, id: number): Bill {
  assertPermission(ctx, 'billing:create');
  const b = findBill(ctx, id);
  if (b.status !== 'OPEN') throw errors.conflict(`Bill is already ${b.status.toLowerCase()}`);
  calculate(ctx, b);
  b.status = 'FINALIZED'; b.finalizedAt = now();
  setOrderStatus(ctx, b.orderId, 'BILLED', `bill ${b.billNumber} finalized`);
  refreshPaymentStatus(ctx, b);
  audit(ctx, 'BILL_FINALIZED', 'BILLS', b.id);
  ctx.emit('bills', 'bill.finalized', b.id);
  return hydrate(ctx, b);
}

export function addPayment(ctx: Ctx, id: number, body: AddPaymentRequest): Bill {
  const me = assertPermission(ctx, 'billing:pay');
  const b = findBill(ctx, id);
  if (b.status === 'OPEN') throw errors.business('Finalize the bill before accepting payment');
  if (b.status === 'CLOSED' || b.status === 'VOID') throw errors.business(`Bill is ${b.status.toLowerCase()}`);
  if (!['CASH', 'UPI', 'CARD', 'COMPLIMENTARY'].includes(body.method)) throw errors.validation('Invalid payment method', 'method');
  const amount = round2(Number(body.amount));
  if (!Number.isFinite(amount) || amount <= 0) throw errors.validation('Amount must be positive', 'amount');
  const balance = round2(b.grandTotal - b.paidAmount);
  if (amount > balance + 0.005) throw errors.validation(`Amount ₹${amount} exceeds balance due ₹${balance}`, 'amount');
  if (body.method === 'COMPLIMENTARY' && !hasPermission(ctx, 'orders:approve-discount')) throw errors.forbidden('Complimentary settlement requires manager authorization');
  b.payments.push({ id: nextId(ctx.db, 'payment'), paymentNumber: nextDocNumber(ctx.db, 'PAY'), billId: b.id, method: body.method, amount, reference: body.reference?.trim() || null, status: 'SUCCESS', receivedBy: me.id, receivedByName: me.fullName, createdAt: now(), reversedAt: null, reversalReason: null });
  refreshPaymentStatus(ctx, b);
  audit(ctx, 'PAYMENT_RECEIVED', 'PAYMENTS', b.payments[b.payments.length - 1].id, null, `${body.method} ${amount}`);
  ctx.emit('bills', 'payment.received', b.id);
  return hydrate(ctx, b);
}

export function reversePayment(ctx: Ctx, id: number, paymentId: number, reason: string): Bill {
  const me = assertPermission(ctx, 'billing:refund');
  if (!reason?.trim()) throw errors.validation('Reversal reason is required', 'reason');
  const b = findBill(ctx, id);
  const p = b.payments.find((x) => x.id === Number(paymentId));
  if (!p) throw errors.notFound('Payment not found');
  if (p.status === 'REVERSED') throw errors.conflict('Payment already reversed');
  if (b.status === 'CLOSED' && !hasPermission(ctx, 'billing:edit-paid')) throw errors.forbidden('Reversing a payment on a closed bill requires admin authorization');
  // Rule 7: never delete — reverse
  p.status = 'REVERSED'; p.reversedAt = now(); p.reversalReason = reason.trim().slice(0, 300);
  // Phase 2: non-cash tenders are unwound in their own ledgers
  if (p.method === 'LOYALTY') reverseRedemption(ctx, p.id);
  else if (p.method === 'ROOM_CHARGE') reverseRoomCharge(ctx, p.id);
  else if (p.method === 'COVER_CREDIT') reverseCoverRedemption(ctx, p.id);
  if (b.status === 'CLOSED') { b.status = 'PAID'; b.closedAt = null; }
  refreshPaymentStatus(ctx, b);
  audit(ctx, 'PAYMENT_REVERSED', 'PAYMENTS', p.id, 'SUCCESS', `REVERSED by ${me.fullName}: ${reason}`);
  ctx.emit('bills', 'payment.reversed', b.id);
  return hydrate(ctx, b);
}

export function closeBill(ctx: Ctx, id: number): Bill {
  assertPermission(ctx, 'billing:close');
  const b = findBill(ctx, id);
  if (b.status === 'CLOSED') return hydrate(ctx, b);
  if (b.paymentStatus !== 'PAID') throw errors.business(`Bill must be fully paid before closing. Balance: ₹${round2(b.grandTotal - b.paidAmount)}`);
  b.status = 'CLOSED' as BillStatus; b.closedAt = now();
  setOrderStatus(ctx, b.orderId, 'COMPLETED', 'bill closed');
  // Phase 2 hooks (idempotent): stock (mode ON_BILL_CLOSE), CRM visit, loyalty points, VIP completion
  inventoryOnBillClosed(ctx, b.orderId);
  recordVisit(ctx, b);
  earnForBill(ctx, b);
  vipOnBillClosed(ctx, b.orderId);
  syncTableStatus(ctx, b.tableId);
  audit(ctx, 'BILL_CLOSED', 'BILLS', b.id);
  ctx.emit('bills', 'bill.closed', b.id);
  return hydrate(ctx, b);
}

export function receipt(ctx: Ctx, id: number): Receipt {
  assertPermission(ctx, 'billing:view');
  const b = findBill(ctx, id);
  const br = [ctx.db.branch, ...ctx.db.p2.branches].find((x) => x.id === b.branchId) ?? ctx.db.branch;
  return { business: { name: br.businessName, branchName: br.name, address: [br.address, br.city].filter(Boolean).join(', '), phone: br.phone, gstNumber: br.gstNumber, logoUrl: br.logoUrl, footer: br.receiptFooter, currency: br.currency }, bill: hydrate(ctx, b), printedAt: now() };
}
