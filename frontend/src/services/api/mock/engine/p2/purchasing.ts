/**
 * MOCK ENGINE — suppliers, purchase orders, goods receipts (mirror of SUPPLIER_PKG + PURCHASE_PKG).
 */
import { type Ctx, errors, now, audit, assertPermission, nextId, nextDocNumber, clone } from '../context';
import { applyMovement, convertQty } from './inventory';
import { createNotification, resolveDedupe } from './notify';
import type { Supplier, SupplierInput, SupplierHistory, SupplierStatus, PurchaseOrder, PurchaseOrderInput, PoAction, PoStatus, ReceiveGoodsInput, ID } from '@/types';
import { round2 } from '@/utils/money';

const round4 = (n: number) => Math.round(n * 10000) / 10000;

function hydrateSupplier(ctx: Ctx, s: Supplier & { isDeleted?: boolean }): Supplier {
  const { isDeleted: _d, ...base } = s;
  const pos = ctx.db.p2.purchaseOrders.filter((p) => p.supplierId === s.id);
  const received = round2(pos.flatMap((p) => p.receipts).reduce((a, g) => a + g.totalAmount, 0));
  const paid = round2(ctx.db.p2.supplierPayments.filter((p) => p.supplierId === s.id).reduce((a, p) => a + p.amount, 0));
  const lastReceipt = pos.flatMap((p) => p.receipts).reduce<string | null>((a, g) => (!a || g.receivedAt > a ? g.receivedAt : a), null);
  return { ...clone(base), totalPurchased: received, totalPaid: paid, outstanding: round2(received - paid), poCount: pos.filter((p) => p.status !== 'CANCELLED').length, openPoCount: pos.filter((p) => ['SENT', 'APPROVED', 'ORDERED', 'PARTIALLY_RECEIVED'].includes(p.status)).length, lastReceiptAt: lastReceipt };
}

export function listSuppliers(ctx: Ctx, q: { search?: string; status?: SupplierStatus }): Supplier[] {
  assertPermission(ctx, 'suppliers:view');
  const s = (q.search ?? '').toLowerCase();
  return ctx.db.p2.suppliers.filter((x) => !x.isDeleted && x.branchId === ctx.branchId).filter((x) => !q.status || x.status === q.status)
    .filter((x) => !s || x.name.toLowerCase().includes(s) || x.code.toLowerCase().includes(s) || (x.contactPerson ?? '').toLowerCase().includes(s))
    .map((x) => hydrateSupplier(ctx, x)).sort((a, b) => a.name.localeCompare(b.name));
}

export function getSupplier(ctx: Ctx, id: ID): Supplier {
  const s = ctx.db.p2.suppliers.find((x) => x.id === Number(id) && !x.isDeleted);
  if (!s) throw errors.notFound('Supplier not found');
  return hydrateSupplier(ctx, s);
}

export function saveSupplier(ctx: Ctx, id: ID | null, body: SupplierInput): Supplier {
  assertPermission(ctx, 'suppliers:manage');
  const name = String(body.name ?? '').trim();
  if (!name) throw errors.validation('Supplier name is required', 'name');
  if (!['ACTIVE', 'INACTIVE', 'BLOCKED'].includes(body.status)) throw errors.validation('Invalid status', 'status');
  const terms = Number(body.paymentTermsDays ?? 30);
  if (terms < 0) throw errors.validation('Payment terms cannot be negative', 'paymentTermsDays');
  const code = body.code?.trim() || `SUP-${Date.now().toString(36).toUpperCase()}`;
  if (ctx.db.p2.suppliers.some((x) => !x.isDeleted && x.id !== id && x.branchId === ctx.branchId && x.code.toLowerCase() === code.toLowerCase())) throw errors.conflict('Supplier code already exists');
  const data = { code, name, contactPerson: body.contactPerson ?? null, phone: body.phone ?? null, email: body.email ?? null, address: body.address ?? null, gstNumber: body.gstNumber ?? null, paymentTermsDays: terms, status: body.status };
  let s: Ctx['db']['p2']['suppliers'][number];
  if (id == null) { s = { id: nextId(ctx.db, 'supplier'), branchId: ctx.branchId, ...data, totalPurchased: 0, totalPaid: 0, outstanding: 0, poCount: 0, openPoCount: 0, lastReceiptAt: null, createdAt: now(), isDeleted: false }; ctx.db.p2.suppliers.push(s); }
  else { const f = ctx.db.p2.suppliers.find((x) => x.id === id && !x.isDeleted); if (!f) throw errors.notFound('Supplier not found'); Object.assign(f, data); s = f; }
  ctx.db.p2.invItems.filter((i) => i.supplierId === s.id).forEach((i) => { i.supplierName = s.name; });
  audit(ctx, id == null ? 'SUPPLIER_CREATED' : 'SUPPLIER_UPDATED', 'SUPPLIERS', s.id, null, body);
  return hydrateSupplier(ctx, s);
}

export function deleteSupplier(ctx: Ctx, id: ID): null {
  assertPermission(ctx, 'suppliers:manage');
  const s = ctx.db.p2.suppliers.find((x) => x.id === Number(id) && !x.isDeleted);
  if (!s) throw errors.notFound('Supplier not found');
  const open = ctx.db.p2.purchaseOrders.filter((p) => p.supplierId === s.id && ['SENT', 'APPROVED', 'ORDERED', 'PARTIALLY_RECEIVED'].includes(p.status)).length;
  if (open > 0) throw errors.business(`Supplier has ${open} open purchase order(s)`);
  s.isDeleted = true; s.status = 'INACTIVE';
  audit(ctx, 'SUPPLIER_DELETED', 'SUPPLIERS', s.id);
  return null;
}

export function supplierHistory(ctx: Ctx, id: ID): SupplierHistory {
  assertPermission(ctx, 'suppliers:view');
  const supplier = getSupplier(ctx, id);
  const pos = ctx.db.p2.purchaseOrders.filter((p) => p.supplierId === supplier.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return {
    supplier,
    purchaseOrders: pos.map((p) => ({ id: p.id, poNumber: p.poNumber, status: p.status, grandTotal: p.grandTotal, createdAt: p.createdAt, expectedDate: p.expectedDate ?? null })),
    receipts: pos.flatMap((p) => p.receipts.map((g) => ({ id: g.id, grnNumber: g.grnNumber, poNumber: p.poNumber, invoiceNo: g.invoiceNo ?? null, amount: g.totalAmount, receivedAt: g.receivedAt }))).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)),
    payments: ctx.db.p2.supplierPayments.filter((p) => p.supplierId === supplier.id).map(({ supplierId: _s, poId, ...p }) => ({ ...clone(p), poNumber: ctx.db.p2.purchaseOrders.find((x) => x.id === poId)?.poNumber ?? null })).sort((a, b) => b.paidAt.localeCompare(a.paidAt)),
  };
}

export function addSupplierPayment(ctx: Ctx, id: ID, body: { amount: number; method?: string; reference?: string; poId?: ID; notes?: string }): SupplierHistory {
  assertPermission(ctx, 'purchases:manage');
  const s = getSupplier(ctx, id);
  const amount = Number(body.amount);
  if (!(amount > 0)) throw errors.validation('Amount must be positive', 'amount');
  ctx.db.p2.supplierPayments.push({ id: nextId(ctx.db, 'supplierPayment'), supplierId: s.id, poId: body.poId ?? null, amount: round2(amount), method: body.method ?? 'BANK', reference: body.reference ?? null, notes: body.notes ?? null, paidAt: now() });
  audit(ctx, 'SUPPLIER_PAYMENT', 'SUPPLIERS', s.id, null, `${body.method ?? 'BANK'} ${amount}`);
  return supplierHistory(ctx, s.id);
}

// ------------------------------------------------------------ purchase orders
function findPo(ctx: Ctx, id: ID): PurchaseOrder {
  const p = ctx.db.p2.purchaseOrders.find((x) => x.id === Number(id) && x.branchId === ctx.branchId);
  if (!p) throw errors.notFound('Purchase order not found');
  return p;
}

function recalc(p: PurchaseOrder): void {
  p.subtotal = round2(p.items.reduce((a, i) => a + i.qty * i.unitPrice, 0));
  p.taxTotal = round2(p.items.reduce((a, i) => a + (i.qty * i.unitPrice * i.taxPercent) / 100, 0));
  p.grandTotal = round2(p.subtotal + p.taxTotal);
}

export function listPos(ctx: Ctx, q: { status?: PoStatus; supplierId?: ID; search?: string }): PurchaseOrder[] {
  assertPermission(ctx, 'purchases:view');
  const s = (q.search ?? '').toLowerCase();
  return ctx.db.p2.purchaseOrders.filter((p) => p.branchId === ctx.branchId).filter((p) => !q.status || p.status === q.status).filter((p) => !q.supplierId || p.supplierId === Number(q.supplierId))
    .filter((p) => !s || p.poNumber.toLowerCase().includes(s) || p.supplierName.toLowerCase().includes(s)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(clone);
}

export function getPo(ctx: Ctx, id: ID): PurchaseOrder { assertPermission(ctx, 'purchases:view'); return clone(findPo(ctx, id)); }

export function savePo(ctx: Ctx, id: ID | null, body: PurchaseOrderInput): PurchaseOrder {
  const me = assertPermission(ctx, 'purchases:manage');
  const supplier = ctx.db.p2.suppliers.find((s) => s.id === Number(body.supplierId) && !s.isDeleted && s.status === 'ACTIVE');
  if (!supplier) throw errors.validation('Select an active supplier', 'supplierId');
  if (!body.items?.length) throw errors.validation('Add at least one item', 'items');
  const items = body.items.map((l) => {
    const inv = ctx.db.p2.invItems.find((i) => i.id === Number(l.invItemId) && !i.isDeleted);
    if (!inv) throw errors.validation('Inventory item not found', 'items');
    const qty = Number(l.qty), price = Number(l.unitPrice ?? 0), tax = Number(l.taxPercent ?? 0);
    if (!(qty > 0)) throw errors.validation('Quantity must be positive', 'items');
    if (price < 0) throw errors.validation('Price cannot be negative', 'items');
    const unitId = l.unitId ? Number(l.unitId) : inv.unitId;
    const unit = ctx.db.p2.units.find((u) => u.id === unitId)!;
    return { id: nextId(ctx.db, 'poItem'), invItemId: inv.id, itemName: inv.name, itemCode: inv.code, qty, unitId, unitCode: unit.code, unitPrice: price, taxPercent: tax, lineTotal: round2(qty * price * (1 + tax / 100)), receivedQty: 0, pendingQty: qty };
  });
  let p: PurchaseOrder;
  if (id == null) {
    p = { id: nextId(ctx.db, 'po'), poNumber: nextDocNumber(ctx.db, 'PO'), branchId: ctx.branchId, supplierId: supplier.id, supplierName: supplier.name, supplierCode: supplier.code, status: 'DRAFT', expectedDate: body.expectedDate ?? null, subtotal: 0, taxTotal: 0, grandTotal: 0, notes: body.notes ?? null, createdByName: me.fullName, approvedByName: null, createdAt: now(), items, receipts: [] };
    ctx.db.p2.purchaseOrders.push(p);
  } else {
    p = findPo(ctx, id);
    if (!['DRAFT', 'SENT'].includes(p.status)) throw errors.business('Only draft or sent purchase orders can be edited');
    Object.assign(p, { supplierId: supplier.id, supplierName: supplier.name, supplierCode: supplier.code, expectedDate: body.expectedDate ?? null, notes: body.notes ?? null, items });
  }
  recalc(p);
  audit(ctx, id == null ? 'PO_CREATED' : 'PO_UPDATED', 'PURCHASE_ORDERS', p.id, null, body);
  return clone(p);
}

export function transitionPo(ctx: Ctx, id: ID, action: PoAction, reason?: string): PurchaseOrder {
  const p = findPo(ctx, id);
  const from = p.status;
  switch (action) {
    case 'SEND': assertPermission(ctx, 'purchases:manage'); if (p.status !== 'DRAFT') throw errors.conflict('Only drafts can be sent'); p.status = 'SENT'; p.sentAt = now();
      createNotification(ctx, 'PO_APPROVAL', 'INFO', 'Purchase order awaiting approval', `${p.poNumber} · ${p.supplierName} · ₹${p.grandTotal}`, 'PURCHASE_ORDERS', p.id, 'MANAGER', null, `PO_APPROVAL:${p.id}`); break;
    case 'APPROVE': { const me = assertPermission(ctx, 'purchases:approve'); if (!['SENT', 'DRAFT'].includes(p.status)) throw errors.conflict('Only sent purchase orders can be approved'); p.status = 'APPROVED'; p.approvedAt = now(); p.approvedByName = me.fullName; resolveDedupe(ctx, `PO_APPROVAL:${p.id}`); break; }
    case 'ORDER': assertPermission(ctx, 'purchases:manage'); if (p.status !== 'APPROVED') throw errors.conflict('Approve the purchase order first'); p.status = 'ORDERED'; p.orderedAt = now(); break;
    case 'CANCEL': assertPermission(ctx, 'purchases:manage'); if (['RECEIVED', 'CANCELLED'].includes(p.status)) throw errors.conflict(`Purchase order is already ${p.status.toLowerCase()}`); if (!reason?.trim()) throw errors.validation('Cancellation reason is required', 'reason'); p.status = 'CANCELLED'; p.cancelledAt = now(); p.cancelReason = reason.trim().slice(0, 300); resolveDedupe(ctx, `PO_APPROVAL:${p.id}`); break;
    default: throw errors.validation(`Unknown action ${String(action)}`, 'action');
  }
  audit(ctx, `PO_${action}`, 'PURCHASE_ORDERS', p.id, from, p.status);
  return clone(p);
}

export function receiveGoods(ctx: Ctx, id: ID, body: ReceiveGoodsInput): PurchaseOrder {
  const me = assertPermission(ctx, 'purchases:receive');
  const p = findPo(ctx, id);
  if (!['APPROVED', 'ORDERED', 'PARTIALLY_RECEIVED'].includes(p.status)) throw errors.business('Goods can be received only for approved/ordered purchase orders');
  if (!body.items?.length) throw errors.validation('Nothing to receive', 'items');
  const grn = { id: nextId(ctx.db, 'grn'), grnNumber: nextDocNumber(ctx.db, 'GRN'), invoiceNo: body.invoiceNo ?? null, receivedAt: now(), receivedByName: me.fullName, totalAmount: 0, notes: body.notes ?? null, items: [] as PurchaseOrder['receipts'][number]['items'] };
  let total = 0;
  for (const l of body.items) {
    const recv = Number(l.receivedQty ?? 0), dmg = Number(l.damagedQty ?? 0);
    if (recv < 0 || dmg < 0 || dmg > recv) throw errors.validation('Received / damaged quantities are invalid', 'items');
    if (recv === 0) continue;
    const poi = p.items.find((i) => i.id === Number(l.poItemId));
    if (!poi) throw errors.notFound('Purchase order line not found');
    const inv = ctx.db.p2.invItems.find((i) => i.id === poi.invItemId)!;
    const cost = l.unitCost ?? poi.unitPrice;
    const good = recv - dmg;
    grn.items.push({ poItemId: poi.id, itemName: poi.itemName, receivedQty: recv, damagedQty: dmg, unitCost: cost });
    const stockQty = convertQty(ctx, good, poi.unitId, inv.unitId, inv.packSize);
    if (stockQty > 0) applyMovement(ctx, inv.id, 'PURCHASE', stockQty, round4((cost * good) / stockQty), 'GRN', grn.id, `GRN:${grn.id}:${poi.id}`, `Goods receipt ${grn.grnNumber}`);
    if (dmg > 0) audit(ctx, 'GRN_DAMAGED', 'GOODS_RECEIPTS', grn.id, null, `${inv.name} damaged ${dmg}`);
    poi.receivedQty = round4(poi.receivedQty + recv); poi.pendingQty = Math.max(round4(poi.qty - poi.receivedQty), 0);
    total += recv * cost;
  }
  grn.totalAmount = round2(total);
  p.receipts.push(grn);
  const all = p.items.every((i) => i.receivedQty >= i.qty);
  const from = p.status;
  p.status = all ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
  if (all) p.receivedAt = now();
  audit(ctx, 'PO_RECEIVED', 'PURCHASE_ORDERS', p.id, from, `${grn.grnNumber} ${grn.totalAmount}`);
  ctx.emit('inventory', 'grn.created', grn.id);
  return clone(p);
}
