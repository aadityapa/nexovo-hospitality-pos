import { type Ctx, assertPermission } from './context';
import { hydrateOrder } from './orders';
import type { SalesReport, PaymentReport, OrderReport, ItemSalesReport, DashboardSummary, PaymentMethod } from '@/types';
import { round2 } from '@/utils/money';
import { isOrderActive } from '@/utils/orderStatus';

const inRange = (iso: string | null | undefined, from: string, to: string) => !!iso && iso >= from && iso <= to;

function paidBills(ctx: Ctx, from: string, to: string) {
  return ctx.db.bills.filter((b) => b.branchId === ctx.branchId && (b.status === 'PAID' || b.status === 'CLOSED') && inRange(b.paidAt, from, to));
}

export function salesReport(ctx: Ctx, from: string, to: string): SalesReport {
  assertPermission(ctx, 'reports:view');
  const bills = paidBills(ctx, from, to);
  const totalSales = round2(bills.reduce((a, b) => a + b.grandTotal, 0));
  const byDayMap = new Map<string, { sales: number; orders: number }>();
  const byHourMap = new Map<number, { sales: number; orders: number }>();
  for (const b of bills) {
    const d = new Date(b.paidAt!);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const cur = byDayMap.get(day) ?? { sales: 0, orders: 0 };
    byDayMap.set(day, { sales: round2(cur.sales + b.grandTotal), orders: cur.orders + 1 });
    const h = d.getHours();
    const ch = byHourMap.get(h) ?? { sales: 0, orders: 0 };
    byHourMap.set(h, { sales: round2(ch.sales + b.grandTotal), orders: ch.orders + 1 });
  }
  return {
    totalSales, totalOrders: bills.length, averageOrderValue: bills.length ? round2(totalSales / bills.length) : 0,
    taxTotal: round2(bills.reduce((a, b) => a + b.taxTotal, 0)),
    discountTotal: round2(bills.reduce((a, b) => a + b.itemDiscountTotal + b.orderDiscountTotal, 0)),
    serviceChargeTotal: round2(bills.reduce((a, b) => a + b.serviceChargeAmount, 0)),
    byDay: [...byDayMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v })),
    byHour: [...byHourMap.entries()].sort(([a], [b]) => a - b).map(([hour, v]) => ({ hour, ...v })),
  };
}

export function paymentReport(ctx: Ctx, from: string, to: string): PaymentReport {
  assertPermission(ctx, 'reports:view');
  const map = new Map<PaymentMethod, { amount: number; count: number; reversed: number }>();
  for (const b of ctx.db.bills.filter((x) => x.branchId === ctx.branchId)) for (const p of b.payments) {
    if (!inRange(p.createdAt, from, to)) continue;
    const cur = map.get(p.method) ?? { amount: 0, count: 0, reversed: 0 };
    if (p.status === 'SUCCESS') { cur.amount = round2(cur.amount + p.amount); cur.count += 1; } else cur.reversed = round2(cur.reversed + p.amount);
    map.set(p.method, cur);
  }
  const byMethod = (['CASH', 'UPI', 'CARD', 'COMPLIMENTARY'] as PaymentMethod[]).map((m) => ({ method: m, ...(map.get(m) ?? { amount: 0, count: 0, reversed: 0 }) }));
  return { byMethod, total: round2(byMethod.reduce((a, m) => a + m.amount, 0)), refunded: round2(byMethod.reduce((a, m) => a + m.reversed, 0)) };
}

export function orderReport(ctx: Ctx, from: string, to: string): OrderReport {
  assertPermission(ctx, 'reports:view');
  const orders = ctx.db.orders.filter((o) => o.branchId === ctx.branchId && inRange(o.createdAt, from, to));
  return {
    total: orders.length,
    completed: orders.filter((o) => o.status === 'COMPLETED').length,
    cancelled: orders.filter((o) => o.status === 'CANCELLED').length,
    pending: orders.filter((o) => ['BILL_REQUESTED', 'BILLED', 'PAID'].includes(o.status)).length,
    active: orders.filter((o) => isOrderActive(o.status)).length,
    cancelledItems: ctx.db.orders.filter((o) => o.branchId === ctx.branchId).flatMap((o) => o.items).filter((i) => inRange(i.cancelledAt, from, to)).length,
  };
}

export function itemReport(ctx: Ctx, from: string, to: string, limit = 20): ItemSalesReport {
  assertPermission(ctx, 'reports:view');
  const items = new Map<number, { itemName: string; categoryName: string; quantity: number; revenue: number }>();
  const cats = new Map<string, { quantity: number; revenue: number }>();
  for (const b of paidBills(ctx, from, to)) {
    const order = ctx.db.orders.find((o) => o.id === b.orderId);
    for (const bi of b.items) {
      const oi = order?.items.find((x) => x.id === bi.orderItemId);
      const mi = ctx.db.items.find((x) => x.id === oi?.menuItemId);
      const catName = ctx.db.categories.find((c) => c.id === mi?.categoryId)?.name ?? 'Other';
      const key = oi?.menuItemId ?? -bi.id;
      const cur = items.get(key) ?? { itemName: bi.itemName, categoryName: catName, quantity: 0, revenue: 0 };
      cur.quantity += bi.quantity; cur.revenue = round2(cur.revenue + bi.lineTotal - bi.discountAmount);
      items.set(key, cur);
      const cc = cats.get(catName) ?? { quantity: 0, revenue: 0 };
      cc.quantity += bi.quantity; cc.revenue = round2(cc.revenue + bi.lineTotal - bi.discountAmount);
      cats.set(catName, cc);
    }
  }
  return {
    topItems: [...items.entries()].map(([menuItemId, v]) => ({ menuItemId, ...v })).sort((a, b) => b.quantity - a.quantity).slice(0, limit),
    byCategory: [...cats.entries()].map(([categoryName, v]) => ({ categoryName, ...v })).sort((a, b) => b.revenue - a.revenue),
  };
}

export function dashboard(ctx: Ctx, from: string, to: string): DashboardSummary {
  assertPermission(ctx, 'dashboard:view');
  const tables = ctx.db.tables.filter((t) => !t.isDeleted && t.isActive && t.branchId === ctx.branchId);
  const bills = ctx.db.bills.filter((b) => b.branchId === ctx.branchId);
  return {
    sales: salesReport(ctx, from, to),
    orders: orderReport(ctx, from, to),
    items: itemReport(ctx, from, to, 5),
    payments: paymentReport(ctx, from, to),
    pendingPayments: round2(bills.filter((b) => b.status === 'FINALIZED' && b.paymentStatus !== 'PAID').reduce((a, b) => a + b.grandTotal - b.paidAmount, 0)),
    totalTables: tables.length,
    availableTables: tables.filter((t) => t.status === 'AVAILABLE').length,
    occupiedTables: tables.filter((t) => t.status !== 'AVAILABLE').length,
    recentOrders: ctx.db.orders.filter((o) => o.branchId === ctx.branchId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8).map((o) => hydrateOrder(ctx, o)),
    recentPayments: bills.flatMap((b) => b.payments.filter((p) => p.status === 'SUCCESS').map((p) => ({ id: p.id, paymentNumber: p.paymentNumber, billNumber: b.billNumber, method: p.method, amount: p.amount, createdAt: p.createdAt })))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8),
  };
}
