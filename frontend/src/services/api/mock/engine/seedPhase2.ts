/**
 * SEED DATA — Phase 2 transactions generated through the engine (mirror of database/10_phase2_seed.sql):
 * opening stock, recipes, bottle-service items, a purchase order, customers + loyalty, reservations,
 * club check-ins, a VIP booking and a second branch for the multi-branch demo.
 */
import type { Ctx } from './context';
import * as menu from './menu';
import * as inventory from './p2/inventory';
import * as purchasing from './p2/purchasing';
import * as crm from './p2/crm';
import * as guests from './p2/guests';
import * as branches from './p2/branches';

export function seedPhase2Transactions(ctx: Ctx): void {
  const db = ctx.db;
  const as = (userId: number) => { ctx.user = db.users.find((u) => u.id === userId)!; ctx.branchId = 1; };
  const menuItem = (code: string) => db.items.find((i) => i.code === code)!.id;
  const ymd = (offsetDays = 0) => { const d = new Date(Date.now() + offsetDays * 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  try {
    // ---- opening stock (item id → qty), through movements so history + averages exist
    as(2);
    const opening: Record<number, number> = { 1: 25, 2: 120, 3: 200, 4: 18, 5: 6, 6: 5, 7: 40, 8: 900, 9: 120, 10: 60, 11: 12, 12: 8, 13: 5, 14: 96, 15: 40, 16: 8, 17: 6, 18: 12 };
    for (const [id, qty] of Object.entries(opening)) {
      const it = db.p2.invItems.find((i) => i.id === Number(id))!;
      inventory.applyMovement(ctx, it.id, 'OPENING_STOCK', qty, it.costPrice, 'ITEM', it.id, `OPENING:${it.id}`, 'Opening stock');
    }
    // ---- recipes (STD variant)
    const ln = (invItemId: number, qty: number, unitId: number, wastagePct = 0) => ({ invItemId, qty, unitId, wastagePct });
    inventory.saveRecipe(ctx, menuItem('BG01'), { yieldQty: 1, ingredients: [ln(1, 150, 1, 5), ln(2, 1, 5), ln(3, 1, 5), ln(4, 20, 1, 10), ln(5, 15, 1, 10), ln(6, 20, 3)] });
    inventory.saveRecipe(ctx, menuItem('ST03'), { yieldQty: 1, ingredients: [ln(7, 200, 1, 15)] });
    inventory.saveRecipe(ctx, menuItem('CK01'), { yieldQty: 1, ingredients: [ln(11, 60, 3), ln(8, 10, 1), ln(9, 1, 5), ln(10, 120, 3)] });
    inventory.saveRecipe(ctx, menuItem('BR01'), { yieldQty: 1, ingredients: [ln(14, 1, 6)] });
    inventory.saveRecipe(ctx, menuItem('BR02'), { yieldQty: 1, ingredients: [ln(15, 1, 6)] });
    inventory.saveRecipe(ctx, menuItem('IN01'), { yieldQty: 1, ingredients: [ln(17, 250, 1, 5), ln(16, 30, 1)] });
    inventory.saveRecipe(ctx, menuItem('SP02'), { yieldQty: 1, ingredients: [ln(13, 30, 3)] });
    // ---- bottle service menu items
    const jd = menu.saveItem(ctx, null, { code: 'BS-JD', name: "Jack Daniel's 750ml — Bottle Service", description: 'Full bottle with ice, 4 mixers, glasses and a dedicated waiter', categoryId: 13, price: 8000, prepLocation: 'BAR', taxGroupId: 3, isVeg: true, isPopular: false, isAvailable: true, isActive: true });
    guests.bottleSave(ctx, jd.id, { bottleSizeMl: 750, invItemId: 12, includes: 'Ice, 4 mixers, glasses, dedicated waiter' });
    const gg = menu.saveItem(ctx, null, { code: 'BS-GG', name: 'Grey Goose 750ml — Bottle Service', description: 'Full bottle with ice, mixers and glasses', categoryId: 13, price: 11000, prepLocation: 'BAR', taxGroupId: 3, isVeg: true, isPopular: false, isAvailable: true, isActive: true });
    guests.bottleSave(ctx, gg.id, { bottleSizeMl: 750, invItemId: 13, includes: 'Ice, 4 mixers, glasses' });
    // ---- purchase order awaiting approval
    as(3);
    const po = purchasing.savePo(ctx, null, { supplierId: 1, expectedDate: ymd(2), notes: 'Weekend restock', items: [{ invItemId: 1, qty: 20, unitId: 2, unitPrice: 315, taxPercent: 0 }, { invItemId: 17, qty: 15, unitId: 2, unitPrice: 255, taxPercent: 0 }, { invItemId: 7, qty: 30, unitId: 2, unitPrice: 27, taxPercent: 0 }] });
    purchasing.transitionPo(ctx, po.id, 'SEND');
    // a received PO so supplier balances / purchase history have data
    const po2 = purchasing.savePo(ctx, null, { supplierId: 2, expectedDate: ymd(-3), notes: 'Beer & mixers', items: [{ invItemId: 14, qty: 2, unitId: 9, unitPrice: 3200, taxPercent: 0 }, { invItemId: 10, qty: 24, unitId: 6, unitPrice: 30, taxPercent: 0 }] });
    purchasing.transitionPo(ctx, po2.id, 'SEND'); purchasing.transitionPo(ctx, po2.id, 'APPROVE'); purchasing.transitionPo(ctx, po2.id, 'ORDER');
    const po2Full = purchasing.getPo(ctx, po2.id);
    purchasing.receiveGoods(ctx, po2.id, { invoiceNo: 'MB-88213', items: po2Full.items.map((i) => ({ poItemId: i.id, receivedQty: i.qty, damagedQty: 0 })) });
    purchasing.addSupplierPayment(ctx, 2, { amount: 5000, method: 'BANK', reference: 'NEFT 4471', poId: po2.id, notes: 'Part payment' });
    // ---- customers & loyalty
    const c1 = crm.saveCustomer(ctx, null, { fullName: 'Ananya Desai', phone: '+919876543210', email: 'ananya@example.com', birthday: '1990-05-14', tags: 'regular,wine', consentMarketing: true });
    crm.adjust(ctx, c1.id, 450, 'Welcome bonus (migrated)');
    crm.saveCustomer(ctx, null, { fullName: 'Rohan Bhatia', phone: '+919812345678', anniversary: '2015-11-20', tags: 'corporate', consentMarketing: false });
    const c3 = crm.saveCustomer(ctx, null, { fullName: 'Meera Joshi', phone: '+919900011122', email: 'meera.j@example.com', tags: 'vip,club', consentMarketing: true });
    crm.adjust(ctx, c3.id, 1200, 'Migrated balance');
    // link the completed seed order (table 3) to Ananya so her history has a visit
    const done = db.orders.find((o) => o.status === 'COMPLETED');
    if (done) { done.customerId = c1.id; done.customerName = c1.fullName; const bill = db.bills.find((b) => b.orderId === done.id); if (bill) { crm.recordVisit(ctx, bill); crm.earnForBill(ctx, bill); } }
    // ---- reservations, club entries, VIP booking (host user)
    as(9);
    const t8 = db.tables.find((t) => t.number === '8')!.id;
    const r1 = guests.saveReservation(ctx, null, { customerId: c1.id, guestName: 'Ananya Desai', phone: '+919876543210', date: ymd(0), time: '20:00', durationMin: 120, guests: 4, tableId: t8, occasion: 'Birthday', notes: 'Window table if possible' });
    guests.transitionReservation(ctx, r1.id, 'CONFIRM');
    guests.saveReservation(ctx, null, { guestName: 'Karthik Menon', phone: '+919845012345', date: ymd(1), time: '19:30', durationMin: 120, guests: 2, tablePref: 'Quiet corner' });
    guests.saveReservation(ctx, null, { guestName: 'Sara Thomas', phone: '+919845098765', date: ymd(0), time: '21:30', durationMin: 90, guests: 2, tableId: db.tables.find((t) => t.number === '11')!.id });
    guests.checkIn(ctx, { guestName: 'Aditya Rao', phone: '+919900000001', guests: 2, entryType: 'WALK_IN', coverTypeId: 3, paymentMethod: 'CARD' });
    guests.checkIn(ctx, { guestName: 'Priyanka Sen', guests: 1, entryType: 'GUEST_LIST', coverTypeId: 4 });
    guests.saveVip(ctx, null, { tableId: db.tables.find((t) => t.number === 'VIP2')!.id, customerId: c3.id, guestName: 'Meera Joshi', phone: '+919900011122', date: ymd(0), guests: 6, minSpend: 25000, depositAmount: 5000, depositPaid: true, hostUserId: 9, notes: 'Birthday — bottle service expected' });
    // ---- second branch for the multi-branch demo (admin + manager can switch)
    as(1);
    branches.saveBranch(ctx, null, { code: 'HYD', businessName: 'The Saffron Lounge', name: 'Hyderabad', city: 'Hyderabad 500034', address: 'Road No. 12, Banjara Hills', phone: '+91 40 4000 1234' });
    const hyd = db.p2.branches.find((b) => b.code === 'HYD');
    if (hyd) [2, 3].forEach((userId) => db.p2.userBranches.push({ userId, branchId: hyd.id, isDefault: false }));
  } catch (e) {
    console.error('[mock] phase 2 seed failed:', e);
  } finally {
    ctx.user = null;
    ctx.branchId = 1;
    db.events = [];
    db.p2.notifications.forEach((n) => { if (n.type === 'KITCHEN_BACKLOG' || n.type === 'BAR_BACKLOG') n.isRead = true; });
  }
}
