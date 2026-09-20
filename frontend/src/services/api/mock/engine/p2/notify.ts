/**
 * MOCK ENGINE — notifications, alert thresholds, operational checks (mirror of NOTIFY_PKG).
 * Channel abstraction: IN_APP is stored; other channels would be queued for a provider.
 */
import { type Ctx, errors, now, audit, assertPermission, nextId, clone } from '../context';
import type { AppNotification, NotificationList, NotificationSeverity, AlertThreshold, ID } from '@/types';
import type { RoleCode } from '@/types';

const THRESHOLD_DEFS: { key: string; label: string; defaultValue: number }[] = [
  { key: 'ORDER_DELAY_MIN', label: 'Order delayed after (minutes)', defaultValue: 20 },
  { key: 'KITCHEN_BACKLOG', label: 'Kitchen backlog (pending items)', defaultValue: 8 },
  { key: 'BAR_BACKLOG', label: 'Bar backlog (pending items)', defaultValue: 8 },
  { key: 'BILL_PENDING_MIN', label: 'Bill request unattended after (minutes)', defaultValue: 10 },
  { key: 'LARGE_BILL_AMOUNT', label: 'Large unpaid bill (₹)', defaultValue: 10000 },
  { key: 'RESERVATION_REMINDER_MIN', label: 'Reservation reminder before (minutes)', defaultValue: 60 },
];

export function threshold(ctx: Ctx, key: string): number {
  return ctx.db.p2.thresholds.find((t) => t.branchId === ctx.branchId && t.key === key)?.value ?? THRESHOLD_DEFS.find((d) => d.key === key)?.defaultValue ?? 0;
}

export function createNotification(ctx: Ctx, type: string, severity: NotificationSeverity, title: string, body: string | null, entity: string | null, entityId: ID | null, targetRole: string | null, targetUserId: ID | null, dedupeKey: string | null): void {
  if (dedupeKey && ctx.db.p2.notifications.some((n) => n.dedupeKey === dedupeKey && !n.isRead)) return;
  ctx.db.p2.notifications.unshift({ id: nextId(ctx.db, 'notification'), branchId: ctx.branchId, type, severity, title: title.slice(0, 150), body: body?.slice(0, 500) ?? null, entity, entityId, isRead: false, createdAt: now(), targetRole, targetUserId, dedupeKey });
  if (ctx.db.p2.notifications.length > 500) ctx.db.p2.notifications.length = 500;
  ctx.emit('notifications', 'notification.created', null);
}

export function resolveDedupe(ctx: Ctx, dedupeKey: string): void {
  ctx.db.p2.notifications.filter((n) => n.dedupeKey === dedupeKey && !n.isRead).forEach((n) => { n.isRead = true; });
}

function visibleToMe(ctx: Ctx, n: { targetRole?: string | null; targetUserId?: ID | null }): boolean {
  const u = ctx.user;
  if (!u) return false;
  if (n.targetUserId) return n.targetUserId === u.id;
  if (!n.targetRole) return true;
  return u.roles.includes(n.targetRole as RoleCode) || u.roles.includes('ADMIN') || u.roles.includes('SUPER_ADMIN');
}

export function list(ctx: Ctx, unreadOnly = false, limit = 50): NotificationList {
  assertPermission(ctx, 'notifications:view');
  runChecks(ctx);
  const mine = ctx.db.p2.notifications.filter((n) => (n.branchId === ctx.branchId || n.branchId == null) && visibleToMe(ctx, n));
  const items: AppNotification[] = mine.filter((n) => !unreadOnly || !n.isRead).slice(0, limit).map(({ branchId: _b, targetRole: _r, targetUserId: _u, dedupeKey: _k, ...n }) => clone(n));
  return { items, unreadCount: mine.filter((n) => !n.isRead).length };
}

export function markRead(ctx: Ctx, id: ID): NotificationList {
  assertPermission(ctx, 'notifications:view');
  const n = ctx.db.p2.notifications.find((x) => x.id === Number(id));
  if (n) n.isRead = true;
  return list(ctx);
}

export function markAllRead(ctx: Ctx): NotificationList {
  assertPermission(ctx, 'notifications:view');
  ctx.db.p2.notifications.filter((n) => (n.branchId === ctx.branchId || n.branchId == null) && visibleToMe(ctx, n)).forEach((n) => { n.isRead = true; });
  return list(ctx);
}

export function thresholds(ctx: Ctx): AlertThreshold[] {
  assertPermission(ctx, 'notifications:view');
  return THRESHOLD_DEFS.map((d) => ({ ...d, value: threshold(ctx, d.key) }));
}

export function saveThresholds(ctx: Ctx, rows: { key: string; value: number }[]): AlertThreshold[] {
  assertPermission(ctx, 'notifications:manage');
  for (const r of rows ?? []) {
    if (!THRESHOLD_DEFS.some((d) => d.key === r.key)) throw errors.validation(`Unknown threshold ${r.key}`, r.key);
    const v = Number(r.value);
    if (!Number.isFinite(v) || v < 0) throw errors.validation('Threshold values must be zero or positive', r.key);
    const t = ctx.db.p2.thresholds.find((x) => x.branchId === ctx.branchId && x.key === r.key);
    if (t) t.value = v; else ctx.db.p2.thresholds.push({ branchId: ctx.branchId, key: r.key, value: v });
  }
  audit(ctx, 'THRESHOLDS_UPDATED', 'ALERT_THRESHOLDS', null, null, rows);
  return thresholds(ctx);
}

const minutesSince = (iso: string) => (Date.now() - new Date(iso).getTime()) / 60000;

/** Operational rules → deduped notifications; auto-resolve when the condition clears. */
export function runChecks(ctx: Ctx): void {
  try {
    const delay = threshold(ctx, 'ORDER_DELAY_MIN'), kb = threshold(ctx, 'KITCHEN_BACKLOG'), bb = threshold(ctx, 'BAR_BACKLOG'), billMin = threshold(ctx, 'BILL_PENDING_MIN'), large = threshold(ctx, 'LARGE_BILL_AMOUNT'), remind = threshold(ctx, 'RESERVATION_REMINDER_MIN');
    const orders = ctx.db.orders.filter((o) => o.branchId === ctx.branchId);
    for (const o of orders) {
      const prepping = ['CONFIRMED', 'IN_PROGRESS', 'PARTIALLY_READY'].includes(o.status);
      if (prepping && minutesSince(o.confirmedAt ?? o.createdAt) >= delay) createNotification(ctx, 'ORDER_DELAYED', 'WARNING', `Order delayed: ${o.orderNumber}`, `${o.tableName} waiting more than ${delay} minutes`, 'ORDERS', o.id, 'MANAGER', null, `ORDER_DELAYED:${o.id}`);
      else if (!prepping) resolveDedupe(ctx, `ORDER_DELAYED:${o.id}`);
      if (o.status === 'BILL_REQUESTED' && minutesSince(o.billRequestedAt ?? o.createdAt) >= billMin) createNotification(ctx, 'BILL_PENDING', 'WARNING', `Bill request waiting: ${o.tableName}`, `${o.orderNumber} requested more than ${billMin} minutes ago`, 'ORDERS', o.id, 'CASHIER', null, `BILL_PENDING:${o.id}`);
      else if (o.status !== 'BILL_REQUESTED') resolveDedupe(ctx, `BILL_PENDING:${o.id}`);
    }
    const active = orders.filter((o) => !['COMPLETED', 'CANCELLED'].includes(o.status));
    const backlog = (loc: 'KITCHEN' | 'BAR') => active.reduce((a, o) => a + o.items.filter((i) => i.prepLocation === loc && ['NEW', 'PREPARING'].includes(i.status)).length, 0);
    const k = backlog('KITCHEN'), b = backlog('BAR');
    if (k >= kb) createNotification(ctx, 'KITCHEN_BACKLOG', 'WARNING', `Kitchen backlog: ${k} items`, `Threshold ${kb}`, null, null, 'MANAGER', null, 'KITCHEN_BACKLOG'); else resolveDedupe(ctx, 'KITCHEN_BACKLOG');
    if (b >= bb) createNotification(ctx, 'BAR_BACKLOG', 'WARNING', `Bar backlog: ${b} items`, `Threshold ${bb}`, null, null, 'MANAGER', null, 'BAR_BACKLOG'); else resolveDedupe(ctx, 'BAR_BACKLOG');
    for (const bill of ctx.db.bills.filter((x) => x.branchId === ctx.branchId)) {
      if (bill.status === 'FINALIZED' && bill.paymentStatus !== 'PAID' && bill.grandTotal >= large) createNotification(ctx, 'LARGE_BILL_PENDING', 'INFO', `Large bill pending: ${bill.billNumber}`, `${bill.tableName} · ₹${bill.grandTotal}`, 'BILLS', bill.id, 'MANAGER', null, `LARGE_BILL:${bill.id}`);
      else if (bill.paymentStatus === 'PAID') resolveDedupe(ctx, `LARGE_BILL:${bill.id}`);
    }
    const today = new Date(); const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    for (const r of ctx.db.p2.reservations.filter((x) => x.branchId === ctx.branchId && x.date === ymd && ['PENDING', 'CONFIRMED'].includes(x.status))) {
      const at = new Date(`${r.date}T${r.time}:00`).getTime();
      const mins = (at - Date.now()) / 60000;
      if (mins >= 0 && mins <= remind) createNotification(ctx, 'RESERVATION_REMINDER', 'INFO', `Arriving soon: ${r.guestName} (${r.guests})`, `${r.resNumber} at ${r.time}`, 'RESERVATIONS', r.id, null, null, `RES_REMINDER:${r.id}`);
    }
  } catch (e) {
    console.warn('[mock] notification checks failed', e);   // checks must never break the calling request
  }
}
