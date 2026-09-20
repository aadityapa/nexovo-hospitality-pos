/**
 * SEED DATA — sample orders / bills / payments generated through the engine so all business
 * rules, numbering and audit trails apply (mirrors the PL/SQL block in database/07_seed.sql).
 */
import type { Ctx } from './context';
import * as orders from './orders';
import * as billing from './billing';

export function seedTransactions(ctx: Ctx): void {
  const db = ctx.db;
  const as = (userId: number) => { ctx.user = db.users.find((u) => u.id === userId)!; };
  const item = (code: string) => db.items.find((i) => i.code === code)!.id;
  const table = (num: string) => db.tables.find((t) => t.number === num)!.id;
  const shiftBack = (iso: string, minutes: number) => new Date(new Date(iso).getTime() - minutes * 60000).toISOString();

  try {
    // 1) Completed order + paid bill (split payment) — table 3
    as(4);
    let o = orders.createOrder(ctx, { tableId: table('3'), guestCount: 3, items: [
      { menuItemId: item('BG01'), quantity: 2, notes: 'No onion, extra cheese' }, { menuItemId: item('ST03'), quantity: 1 },
      { menuItemId: item('CK01'), quantity: 1, notes: 'Less ice' }, { menuItemId: item('BR01'), quantity: 2 },
    ] });
    orders.confirmOrder(ctx, o.id);
    as(7); for (const i of db.orders.find((x) => x.id === o.id)!.items.filter((i) => i.prepLocation === 'KITCHEN')) { orders.setItemStatus(ctx, i.id, 'PREPARING', 'KITCHEN'); orders.setItemStatus(ctx, i.id, 'READY', 'KITCHEN'); }
    as(8); for (const i of db.orders.find((x) => x.id === o.id)!.items.filter((i) => i.prepLocation === 'BAR')) { orders.setItemStatus(ctx, i.id, 'PREPARING', 'BAR'); orders.setItemStatus(ctx, i.id, 'READY', 'BAR'); }
    as(4); for (const i of db.orders.find((x) => x.id === o.id)!.items) orders.setItemStatus(ctx, i.id, 'SERVED', null);
    orders.requestBill(ctx, o.id);
    as(6);
    let b = billing.createBill(ctx, o.id);
    billing.addDiscount(ctx, b.id, { discountType: 'PERCENTAGE', value: 5, reason: 'Regular guest' });
    b = billing.finalizeBill(ctx, b.id);
    billing.addPayment(ctx, b.id, { method: 'CASH', amount: 1000 });
    b = billing.getBill(ctx, b.id);
    billing.addPayment(ctx, b.id, { method: 'UPI', amount: b.balanceDue, reference: 'UPI-REF-77821' });
    billing.closeBill(ctx, b.id);
    // back-date to earlier today so dashboard charts have spread
    const ord = db.orders.find((x) => x.id === o.id)!; ord.createdAt = shiftBack(ord.createdAt, 150); ord.completedAt = shiftBack(ord.completedAt!, 95);
    const bill = db.bills.find((x) => x.id === b.id)!; bill.createdAt = shiftBack(bill.createdAt, 100); bill.paidAt = shiftBack(bill.paidAt!, 95); bill.payments.forEach((p) => { p.createdAt = shiftBack(p.createdAt, 95); });

    // 2) Second completed order — table 7 (card)
    as(5);
    o = orders.createOrder(ctx, { tableId: table('7'), guestCount: 2, items: [{ menuItemId: item('PZ01'), quantity: 1 }, { menuItemId: item('MK01'), quantity: 2 }, { menuItemId: item('DS01'), quantity: 1 }] });
    orders.confirmOrder(ctx, o.id);
    as(7); for (const i of db.orders.find((x) => x.id === o.id)!.items.filter((i) => i.prepLocation === 'KITCHEN')) { orders.setItemStatus(ctx, i.id, 'PREPARING', 'KITCHEN'); orders.setItemStatus(ctx, i.id, 'READY', 'KITCHEN'); }
    as(8); for (const i of db.orders.find((x) => x.id === o.id)!.items.filter((i) => i.prepLocation === 'BAR')) { orders.setItemStatus(ctx, i.id, 'PREPARING', 'BAR'); orders.setItemStatus(ctx, i.id, 'READY', 'BAR'); }
    as(5); for (const i of db.orders.find((x) => x.id === o.id)!.items) orders.setItemStatus(ctx, i.id, 'SERVED', null);
    orders.requestBill(ctx, o.id);
    as(6);
    b = billing.createBill(ctx, o.id); b = billing.finalizeBill(ctx, b.id);
    billing.addPayment(ctx, b.id, { method: 'CARD', amount: b.grandTotal, reference: 'AUTH 5521' });
    billing.closeBill(ctx, b.id);
    { const ord2 = db.orders.find((x) => x.id === o.id)!; ord2.createdAt = shiftBack(ord2.createdAt, 60);
      const bill2 = db.bills.find((x) => x.id === b.id)!; bill2.paidAt = shiftBack(bill2.paidAt!, 40); bill2.payments.forEach((p) => { p.createdAt = shiftBack(p.createdAt, 40); }); }

    // 3) Active order in progress (kitchen preparing) — table 5
    as(4);
    o = orders.createOrder(ctx, { tableId: table('5'), guestCount: 2, items: [{ menuItemId: item('IN01'), quantity: 1 }, { menuItemId: item('IN03'), quantity: 4, notes: 'Extra butter' }, { menuItemId: item('MK01'), quantity: 2 }] });
    orders.confirmOrder(ctx, o.id);
    as(7); { const first = db.orders.find((x) => x.id === o.id)!.items.find((i) => i.prepLocation === 'KITCHEN')!; orders.setItemStatus(ctx, first.id, 'PREPARING', 'KITCHEN'); }
    { const ord3 = db.orders.find((x) => x.id === o.id)!; ord3.createdAt = shiftBack(ord3.createdAt, 12); ord3.confirmedAt = shiftBack(ord3.confirmedAt!, 11); db.tickets.filter((t) => t.orderId === o.id).forEach((t) => { t.createdAt = shiftBack(t.createdAt, 11); }); ord3.items.forEach((i) => { i.addedAt = shiftBack(i.addedAt, 12); }); }

    // 4) Bill requested, awaiting cashier — bar table B11
    as(5);
    o = orders.createOrder(ctx, { tableId: table('B11'), guestCount: 2, items: [{ menuItemId: item('BR02'), quantity: 2 }, { menuItemId: item('ST02'), quantity: 1 }, { menuItemId: item('CK02'), quantity: 1 }] });
    orders.confirmOrder(ctx, o.id);
    as(7); for (const i of db.orders.find((x) => x.id === o.id)!.items.filter((i) => i.prepLocation === 'KITCHEN')) { orders.setItemStatus(ctx, i.id, 'PREPARING', 'KITCHEN'); orders.setItemStatus(ctx, i.id, 'READY', 'KITCHEN'); }
    as(8); for (const i of db.orders.find((x) => x.id === o.id)!.items.filter((i) => i.prepLocation === 'BAR')) { orders.setItemStatus(ctx, i.id, 'PREPARING', 'BAR'); orders.setItemStatus(ctx, i.id, 'READY', 'BAR'); }
    as(5); for (const i of db.orders.find((x) => x.id === o.id)!.items) orders.setItemStatus(ctx, i.id, 'SERVED', null);
    orders.requestBill(ctx, o.id);

    // 5) New order just confirmed — table 9 (kitchen + bar tickets NEW)
    as(5);
    o = orders.createOrder(ctx, { tableId: table('9'), guestCount: 4, items: [{ menuItemId: item('CH02'), quantity: 2, notes: 'Extra spicy' }, { menuItemId: item('CH01'), quantity: 1 }, { menuItemId: item('BR01'), quantity: 3 }, { menuItemId: item('BV01'), quantity: 2, notes: 'Salted' }] });
    orders.confirmOrder(ctx, o.id);

    // 6) Draft order — VIP1
    as(4);
    orders.createOrder(ctx, { tableId: table('VIP1'), guestCount: 4, items: [{ menuItemId: item('MC01'), quantity: 2 }, { menuItemId: item('WN01'), quantity: 2 }] });
  } catch (e) {
    // Seed data must never break app boot — log and continue with whatever was created.
    console.error('[mock] seed transactions failed:', e);
  } finally {
    ctx.user = null;
    db.events = [];
    db.audit.unshift({ id: 0, userId: null, userName: 'SEED', action: 'SEED_DATA_LOADED', entity: 'SYSTEM', entityId: null, oldValue: null, newValue: 'demo transactions', createdAt: new Date().toISOString() });
  }
}
