/**
 * MOCK ENGINE — advanced reports (mirror of REPORT2_PKG).
 */
import { type Ctx, assertPermission } from '../context';
import { allBranches, userCanAccess } from './branches';
import { listItems } from './inventory';
import type { SalesPeriodReport, BranchComparisonRow, CategoryPerformanceRow, InventoryValuation, WastageReport, ConsumptionRow, ProfitabilityReport, StaffPerformanceRow, MovementType } from '@/types';
import { round2 } from '@/utils/money';

const inRange = (iso: string | null | undefined, from: string, to: string) => !!iso && iso >= from && iso <= to;

function bucketOf(iso: string, group: string): string {
  const d = new Date(iso);
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  if (group === 'YEAR') return String(y);
  if (group === 'MONTH') return `${y}-${m}`;
  if (group === 'WEEK') { const t = new Date(Date.UTC(y, d.getMonth(), d.getDate())); const dn = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - dn); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); const w = Math.ceil(((t.getTime() - y0.getTime()) / 86400000 + 1) / 7); return `${t.getUTCFullYear()}-W${String(w).padStart(2, '0')}`; }
  return `${y}-${m}-${day}`;
}

const paidBills = (ctx: Ctx, from: string, to: string, branchId = ctx.branchId) => ctx.db.bills.filter((b) => b.branchId === branchId && (b.status === 'PAID' || b.status === 'CLOSED') && inRange(b.paidAt, from, to));

export function salesPeriod(ctx: Ctx, from: string, to: string, group: string): SalesPeriodReport {
  assertPermission(ctx, 'reports:advanced');
  const g = (group ?? 'DAY').toUpperCase() as SalesPeriodReport['groupBy'];
  const map = new Map<string, { bills: number; sales: number; tax: number; discounts: number; serviceCharge: number }>();
  for (const b of paidBills(ctx, from, to)) {
    const k = bucketOf(b.paidAt!, g);
    const c = map.get(k) ?? { bills: 0, sales: 0, tax: 0, discounts: 0, serviceCharge: 0 };
    c.bills += 1; c.sales = round2(c.sales + b.grandTotal); c.tax = round2(c.tax + b.taxTotal); c.discounts = round2(c.discounts + b.itemDiscountTotal + b.orderDiscountTotal); c.serviceCharge = round2(c.serviceCharge + b.serviceChargeAmount);
    map.set(k, c);
  }
  const rows = [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([bucket, v]) => ({ bucket, ...v, averageBill: v.bills ? round2(v.sales / v.bills) : 0 }));
  const totalSales = round2(rows.reduce((a, r) => a + r.sales, 0)), totalBills = rows.reduce((a, r) => a + r.bills, 0);
  return { groupBy: g, rows, totalSales, totalBills, averageBill: totalBills ? round2(totalSales / totalBills) : 0 };
}

export function branchComparison(ctx: Ctx, from: string, to: string): BranchComparisonRow[] {
  assertPermission(ctx, 'reports:advanced');
  return allBranches(ctx).filter((b) => userCanAccess(ctx, ctx.user!.id, b.id)).map((b) => {
    const bills = paidBills(ctx, from, to, b.id);
    const sales = round2(bills.reduce((a, x) => a + x.grandTotal, 0));
    const cogs = round2(ctx.db.p2.movements.filter((m) => m.branchId === b.id && m.type === 'SALE_CONSUMPTION' && inRange(m.createdAt, from, to)).reduce((a, m) => a + m.totalCost, 0));
    return { branchId: b.id, code: b.code, name: b.name, city: b.city ?? null, bills: bills.length, sales, averageBill: bills.length ? round2(sales / bills.length) : 0, cancelledOrders: ctx.db.orders.filter((o) => o.branchId === b.id && o.status === 'CANCELLED' && inRange(o.createdAt, from, to)).length, cogs, grossProfit: round2(sales - cogs) };
  }).sort((a, b) => b.sales - a.sales);
}

export function categoryPerformance(ctx: Ctx, from: string, to: string): CategoryPerformanceRow[] {
  assertPermission(ctx, 'reports:advanced');
  const map = new Map<string, { prepLocation: 'KITCHEN' | 'BAR'; quantity: number; revenue: number; bills: Set<number> }>();
  let total = 0;
  for (const b of paidBills(ctx, from, to)) {
    const order = ctx.db.orders.find((o) => o.id === b.orderId);
    for (const bi of b.items) {
      const oi = order?.items.find((x) => x.id === bi.orderItemId);
      const mi = ctx.db.items.find((x) => x.id === oi?.menuItemId);
      const cat = ctx.db.categories.find((c) => c.id === mi?.categoryId);
      const key = cat?.name ?? 'Other';
      const c = map.get(key) ?? { prepLocation: cat?.prepLocation ?? 'KITCHEN', quantity: 0, revenue: 0, bills: new Set<number>() };
      const rev = bi.lineTotal - bi.discountAmount;
      c.quantity += bi.quantity; c.revenue = round2(c.revenue + rev); c.bills.add(b.id); total += rev;
      map.set(key, c);
    }
  }
  return [...map.entries()].map(([categoryName, v]) => ({ categoryName, prepLocation: v.prepLocation, quantity: v.quantity, revenue: v.revenue, bills: v.bills.size, sharePercent: total > 0 ? Math.round((v.revenue * 1000) / total) / 10 : 0 })).sort((a, b) => b.revenue - a.revenue);
}

export function inventoryValuation(ctx: Ctx): InventoryValuation {
  assertPermission(ctx, 'reports:advanced');
  const items = listItems(ctx, {});
  const byCat = new Map<string, { kind: InventoryValuation['byCategory'][number]['kind']; items: number; value: number }>();
  items.forEach((i) => { const c = byCat.get(i.categoryName) ?? { kind: i.categoryKind, items: 0, value: 0 }; c.items += 1; c.value = round2(c.value + i.stockValue); byCat.set(i.categoryName, c); });
  return { totalValue: round2(items.reduce((a, i) => a + i.stockValue, 0)), byCategory: [...byCat.entries()].map(([categoryName, v]) => ({ categoryName, ...v })).sort((a, b) => b.value - a.value), topItems: [...items].sort((a, b) => b.stockValue - a.stockValue).slice(0, 25).map((i) => ({ itemName: i.name, unitCode: i.unitCode, qty: i.currentQty, avgCost: i.avgCost, value: i.stockValue, status: i.stockStatus })) };
}

export function wastage(ctx: Ctx, from: string, to: string): WastageReport {
  assertPermission(ctx, 'reports:advanced');
  const map = new Map<string, { itemName: string; unitCode: string; type: MovementType; qty: number; cost: number; entries: number }>();
  for (const m of ctx.db.p2.movements.filter((m) => m.branchId === ctx.branchId && (m.type === 'WASTAGE' || m.type === 'DAMAGE') && inRange(m.createdAt, from, to))) {
    const k = `${m.itemName}|${m.type}`;
    const c = map.get(k) ?? { itemName: m.itemName, unitCode: m.unitCode, type: m.type, qty: 0, cost: 0, entries: 0 };
    c.qty += Math.abs(m.qty); c.cost = round2(c.cost + m.totalCost); c.entries += 1; map.set(k, c);
  }
  const rows = [...map.values()].sort((a, b) => b.cost - a.cost);
  return { totalCost: round2(rows.reduce((a, r) => a + r.cost, 0)), rows };
}

export function consumption(ctx: Ctx, from: string, to: string): ConsumptionRow[] {
  assertPermission(ctx, 'reports:advanced');
  const map = new Map<string, ConsumptionRow>();
  for (const m of ctx.db.p2.movements.filter((m) => m.branchId === ctx.branchId && m.type === 'SALE_CONSUMPTION' && inRange(m.createdAt, from, to))) {
    const inv = ctx.db.p2.invItems.find((i) => i.id === m.invItemId);
    const c = map.get(m.itemName) ?? { itemName: m.itemName, unitCode: m.unitCode, categoryName: inv?.categoryName ?? '', qty: 0, cost: 0 };
    c.qty += Math.abs(m.qty); c.cost = round2(c.cost + m.totalCost); map.set(m.itemName, c);
  }
  return [...map.values()].sort((a, b) => b.cost - a.cost);
}

export function profitability(ctx: Ctx, from: string, to: string): ProfitabilityReport {
  assertPermission(ctx, 'reports:advanced');
  let revenue = 0, food = 0, bev = 0, disc = 0;
  for (const b of paidBills(ctx, from, to)) {
    const order = ctx.db.orders.find((o) => o.id === b.orderId);
    disc += b.orderDiscountTotal;
    for (const bi of b.items) {
      const oi = order?.items.find((x) => x.id === bi.orderItemId);
      const rev = bi.lineTotal - bi.discountAmount;
      revenue += rev; if ((oi?.prepLocation ?? bi.prepLocation) === 'BAR') bev += rev; else food += rev;
    }
  }
  let cogs = 0, foodCogs = 0, bevCogs = 0, waste = 0;
  for (const m of ctx.db.p2.movements.filter((m) => m.branchId === ctx.branchId && inRange(m.createdAt, from, to))) {
    if (m.type === 'SALE_CONSUMPTION') { const inv = ctx.db.p2.invItems.find((i) => i.id === m.invItemId); cogs += m.totalCost; if (inv && ['BEVERAGE', 'BOTTLE'].includes(inv.categoryKind)) bevCogs += m.totalCost; else foodCogs += m.totalCost; }
    if (m.type === 'WASTAGE' || m.type === 'DAMAGE') waste += m.totalCost;
  }
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a * 1000) / b) / 10 : 0);
  return { revenue: round2(revenue), foodRevenue: round2(food), beverageRevenue: round2(bev), cogs: round2(cogs), foodCogs: round2(foodCogs), beverageCogs: round2(bevCogs), grossProfit: round2(revenue - cogs), grossMarginPercent: pct(revenue - cogs, revenue), foodCostPercent: pct(foodCogs, food), beverageCostPercent: pct(bevCogs, bev), wastageCost: round2(waste), discountsGiven: round2(disc) };
}

export function staffPerformance(ctx: Ctx, from: string, to: string): StaffPerformanceRow[] {
  assertPermission(ctx, 'reports:advanced');
  const map = new Map<number, StaffPerformanceRow & { tables: Set<number> }>();
  for (const o of ctx.db.orders.filter((o) => o.branchId === ctx.branchId && inRange(o.createdAt, from, to))) {
    const r = map.get(o.waiterId) ?? { userId: o.waiterId, fullName: o.waiterName, ordersHandled: 0, tablesServed: 0, sales: 0, bills: 0, averageBill: 0, cancelledOrders: 0, cancelledItems: 0, tables: new Set<number>() };
    r.ordersHandled += 1; r.tables.add(o.tableId); if (o.status === 'CANCELLED') r.cancelledOrders += 1; r.cancelledItems += o.items.filter((i) => i.status === 'CANCELLED').length;
    const bill = ctx.db.bills.find((b) => b.orderId === o.id && (b.status === 'PAID' || b.status === 'CLOSED'));
    if (bill) { r.sales = round2(r.sales + bill.grandTotal); r.bills += 1; }
    map.set(o.waiterId, r);
  }
  return [...map.values()].map(({ tables, ...r }) => ({ ...r, tablesServed: tables.size, averageBill: r.bills ? round2(r.sales / r.bills) : 0 })).sort((a, b) => b.sales - a.sales);
}
