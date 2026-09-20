/**
 * MOCK ENGINE — reservations, club entry & cover credit, VIP tables (minimum spend), bottle service,
 * hotel room charges via a PMS adapter (mirror of RESERVATION_PKG, CLUB_PKG, VIP_PKG, BOTTLE_PKG, ROOM_CHARGE_PKG).
 */
import { type Ctx, errors, now, audit, assertPermission, hasPermission, nextId, nextDocNumber, clone, userName, currentBranch } from '../context';
import { createOrder } from '../orders';
import { createNotification, resolveDedupe } from './notify';
import type { Reservation, ReservationInput, ReservationAction, ReservationStatus, ReservationAvailability, CoverChargeType, CoverChargeTypeInput, ClubEntry, CheckInInput, EntryStatus, ClubDashboard, VipTable, VipReservation, VipReservationInput, VipAction, VipStatus, BottleServiceItem, BottleServiceInput, RoomVerification, RoomCharge, Bill, PaymentMethod, ID } from '@/types';
import { round2 } from '@/utils/money';

type RefreshBill = (ctx: Ctx, bill: Bill) => void;
const todayYmd = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** club business day starts at 06:00 */
const businessDate = () => todayYmd(new Date(Date.now() - 6 * 3600000));

// ------------------------------------------------------------ reservations
function hydrateRes(ctx: Ctx, r: Reservation): Reservation {
  const t = ctx.db.tables.find((x) => x.id === r.tableId);
  const o = ctx.db.orders.find((x) => x.id === r.orderId);
  return { ...clone(r), tableName: t?.name ?? null, orderNumber: o?.orderNumber ?? null };
}

export function listReservations(ctx: Ctx, q: { from?: string; to?: string; status?: ReservationStatus; search?: string }): Reservation[] {
  assertPermission(ctx, 'reservations:view');
  const s = (q.search ?? '').toLowerCase();
  return ctx.db.p2.reservations.filter((r) => r.branchId === ctx.branchId)
    .filter((r) => (!q.from || r.date >= q.from.slice(0, 10)) && (!q.to || r.date <= q.to.slice(0, 10)) && (!q.status || r.status === q.status))
    .filter((r) => !s || r.guestName.toLowerCase().includes(s) || r.phone.includes(s) || r.resNumber.toLowerCase().includes(s))
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)).map((r) => hydrateRes(ctx, r));
}

export function getReservation(ctx: Ctx, id: ID): Reservation {
  assertPermission(ctx, 'reservations:view');
  const r = ctx.db.p2.reservations.find((x) => x.id === Number(id) && x.branchId === ctx.branchId);
  if (!r) throw errors.notFound('Reservation not found');
  return hydrateRes(ctx, r);
}

const minutesOf = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

export function saveReservation(ctx: Ctx, id: ID | null, body: ReservationInput): Reservation {
  const me = assertPermission(ctx, 'reservations:manage');
  const guestName = String(body.guestName ?? '').trim(), phone = String(body.phone ?? '').trim();
  if (!guestName || !phone) throw errors.validation('Guest name and phone are required', 'guestName');
  if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date) || !body.time || !/^\d{2}:\d{2}$/.test(body.time)) throw errors.validation('Date and time (HH:MM) are required', 'time');
  const guests = Number(body.guests);
  if (!(guests > 0)) throw errors.validation('Number of guests must be positive', 'guests');
  const dur = Number(body.durationMin ?? 120);
  const tableId = body.tableId ? Number(body.tableId) : null;
  if (tableId) {
    if (!ctx.db.tables.some((t) => t.id === tableId && !t.isDeleted)) throw errors.validation('Table not found', 'tableId');
    const clash = ctx.db.p2.reservations.some((x) => x.tableId === tableId && x.date === body.date && ['PENDING', 'CONFIRMED', 'SEATED'].includes(x.status) && x.id !== id && Math.abs(minutesOf(x.time) - minutesOf(body.time)) < Math.max(x.durationMin, dur));
    if (clash) throw errors.conflict('That table already has a reservation around this time');
  }
  const data = { customerId: body.customerId ?? null, guestName, phone, date: body.date, time: body.time, durationMin: dur, guests, tablePref: body.tablePref ?? null, tableId, occasion: body.occasion ?? null, notes: body.notes ?? null, depositAmount: Number(body.depositAmount ?? 0) };
  let r: Reservation;
  if (id == null) {
    r = { id: nextId(ctx.db, 'reservation'), resNumber: nextDocNumber(ctx.db, 'RES'), branchId: ctx.branchId, ...data, status: 'PENDING', seatedAt: null, orderId: null, orderNumber: null, tableName: null, createdByName: me.fullName, createdAt: now() };
    ctx.db.p2.reservations.push(r);
  } else {
    const f = ctx.db.p2.reservations.find((x) => x.id === id && x.branchId === ctx.branchId);
    if (!f) throw errors.notFound('Reservation not found');
    if (['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(f.status)) throw errors.business('Closed reservations cannot be edited');
    Object.assign(f, data); r = f;
  }
  audit(ctx, id == null ? 'RESERVATION_CREATED' : 'RESERVATION_UPDATED', 'RESERVATIONS', r.id);
  ctx.emit('reservations', 'reservation.saved', r.id);
  return hydrateRes(ctx, r);
}

export function transitionReservation(ctx: Ctx, id: ID, action: ReservationAction, tableId?: ID, reason?: string): Reservation {
  assertPermission(ctx, 'reservations:manage');
  const r = ctx.db.p2.reservations.find((x) => x.id === Number(id) && x.branchId === ctx.branchId);
  if (!r) throw errors.notFound('Reservation not found');
  const from = r.status;
  switch (action) {
    case 'CONFIRM': if (r.status !== 'PENDING') throw errors.conflict('Only pending reservations can be confirmed'); r.status = 'CONFIRMED'; break;
    case 'SEAT': {
      if (!['PENDING', 'CONFIRMED'].includes(r.status)) throw errors.conflict(`Reservation is ${r.status.toLowerCase()}`);
      const tid = tableId ? Number(tableId) : r.tableId;
      if (!tid) throw errors.validation('Select a table to seat the guests', 'tableId');
      const order = createOrder(ctx, { tableId: tid, guestCount: r.guests, notes: `Reservation ${r.resNumber}${r.occasion ? ` · ${r.occasion}` : ''}`, items: [] });
      const stored = ctx.db.orders.find((o) => o.id === order.id)!;
      stored.customerId = r.customerId ?? null; stored.customerName = ctx.db.p2.customers.find((c) => c.id === r.customerId)?.fullName ?? null; stored.reservationId = r.id;
      Object.assign(r, { status: 'SEATED', tableId: tid, seatedAt: now(), orderId: order.id });
      break;
    }
    case 'COMPLETE': if (r.status !== 'SEATED') throw errors.conflict('Only seated reservations can be completed'); r.status = 'COMPLETED'; break;
    case 'CANCEL': if (['COMPLETED', 'CANCELLED'].includes(r.status)) throw errors.conflict('Reservation already closed'); r.status = 'CANCELLED'; r.notes = `${r.notes ?? ''} [cancelled: ${reason ?? 'no reason'}]`.trim().slice(0, 500); break;
    case 'NO_SHOW': if (!['PENDING', 'CONFIRMED'].includes(r.status)) throw errors.conflict('Only open reservations can be marked no-show'); r.status = 'NO_SHOW'; break;
    default: throw errors.validation(`Unknown action ${String(action)}`, 'action');
  }
  resolveDedupe(ctx, `RES_REMINDER:${r.id}`);
  audit(ctx, `RESERVATION_${action}`, 'RESERVATIONS', r.id, from, r.status);
  ctx.emit('reservations', 'reservation.status', r.id);
  return hydrateRes(ctx, r);
}

export function availability(ctx: Ctx, date: string): ReservationAvailability {
  assertPermission(ctx, 'reservations:view');
  const d = date?.slice(0, 10) || todayYmd();
  const floorOrder = new Map(ctx.db.floors.map((f) => [f.id, f.displayOrder]));
  const tables = ctx.db.tables.filter((t) => !t.isDeleted && t.isActive && t.branchId === ctx.branchId).sort((a, b) => (floorOrder.get(a.floorId) ?? 0) - (floorOrder.get(b.floorId) ?? 0) || a.number.localeCompare(b.number, undefined, { numeric: true }))
    .map((t) => ({ tableId: t.id, tableName: t.name, capacity: t.capacity, floorName: t.floorName, isVip: !!t.isVip, currentStatus: t.status, reservations: ctx.db.p2.reservations.filter((r) => r.tableId === t.id && r.date === d && ['PENDING', 'CONFIRMED', 'SEATED'].includes(r.status)).sort((a, b) => a.time.localeCompare(b.time)).map((r) => ({ resId: r.id, resNumber: r.resNumber, guestName: r.guestName, time: r.time, durationMin: r.durationMin, guests: r.guests, status: r.status })) }));
  return { date: d, tables, tableCount: tables.length, bookedSlots: tables.reduce((a, t) => a + t.reservations.length, 0) };
}

// ------------------------------------------------------------ club: cover charges & entries
export function coverTypes(ctx: Ctx): CoverChargeType[] {
  assertPermission(ctx, 'club:view');
  return ctx.db.p2.coverTypes.filter((c) => c.branchId === ctx.branchId).map(({ branchId: _b, ...c }) => clone(c)).sort((a, b) => a.code.localeCompare(b.code));
}

export function saveCoverType(ctx: Ctx, id: ID | null, body: CoverChargeTypeInput): CoverChargeType[] {
  assertPermission(ctx, 'club:manage');
  const code = String(body.code ?? '').trim().toUpperCase(), name = String(body.name ?? '').trim();
  if (!code || !name) throw errors.validation('Code and name are required', 'name');
  const amount = Number(body.amount ?? 0), red = Number(body.redeemableAmount ?? 0);
  if (amount < 0 || red < 0 || red > amount) throw errors.validation('Redeemable amount must be between 0 and the cover amount', 'redeemableAmount');
  if (ctx.db.p2.coverTypes.some((c) => c.branchId === ctx.branchId && c.id !== id && c.code === code)) throw errors.conflict('Cover code already exists');
  const data = { code, name, amount, redeemableAmount: red, guestsIncluded: Number(body.guestsIncluded ?? 1), isActive: body.isActive ?? true };
  if (id == null) ctx.db.p2.coverTypes.push({ id: nextId(ctx.db, 'coverType'), branchId: ctx.branchId, ...data });
  else { const c = ctx.db.p2.coverTypes.find((x) => x.id === id && x.branchId === ctx.branchId); if (!c) throw errors.notFound('Cover charge type not found'); Object.assign(c, data); }
  audit(ctx, 'COVER_TYPE_SAVED', 'COVER_CHARGE_TYPES', id, null, body);
  return coverTypes(ctx);
}

function hydrateEntry(ctx: Ctx, e: ClubEntry): ClubEntry {
  return { ...clone(e), remainingCredit: round2(e.redeemableAmount - e.redeemedAmount), hostName: e.hostUserId ? userName(ctx.db, e.hostUserId) : null, tableName: ctx.db.tables.find((t) => t.id === e.tableId)?.name ?? null, coverName: ctx.db.p2.coverTypes.find((c) => c.id === e.coverTypeId)?.name ?? null };
}

const inBusinessDay = (iso: string, day: string) => { const start = new Date(`${day}T06:00:00`).getTime(); const t = new Date(iso).getTime(); return t >= start && t < start + 86400000; };

export function listEntries(ctx: Ctx, q: { date?: string; status?: EntryStatus }): ClubEntry[] {
  assertPermission(ctx, 'club:view');
  const day = q.date?.slice(0, 10) || businessDate();
  return ctx.db.p2.clubEntries.filter((e) => e.branchId === ctx.branchId && inBusinessDay(e.enteredAt, day)).filter((e) => !q.status || e.status === q.status).sort((a, b) => b.enteredAt.localeCompare(a.enteredAt)).map((e) => hydrateEntry(ctx, e));
}

export function checkIn(ctx: Ctx, body: CheckInInput): ClubEntry {
  const me = assertPermission(ctx, 'club:manage');
  const guestName = String(body.guestName ?? '').trim();
  if (!guestName) throw errors.validation('Guest name is required', 'guestName');
  const guests = Number(body.guests ?? 1);
  if (!(guests > 0)) throw errors.validation('Guests must be positive', 'guests');
  if (!['WALK_IN', 'GUEST_LIST', 'PREBOOKED', 'VIP'].includes(body.entryType)) throw errors.validation('Invalid entry type', 'entryType');
  let coverAmount = 0, redeemable = 0;
  if (body.coverTypeId) {
    const ct = ctx.db.p2.coverTypes.find((c) => c.id === Number(body.coverTypeId) && c.isActive && c.branchId === ctx.branchId);
    if (!ct) throw errors.validation('Cover charge type is invalid', 'coverTypeId');
    const units = Number(body.coverUnits ?? 1);
    coverAmount = round2(ct.amount * units); redeemable = round2(ct.redeemableAmount * units);
    if (coverAmount > 0 && !['CASH', 'UPI', 'CARD', 'COMPLIMENTARY'].includes(body.paymentMethod ?? '')) throw errors.validation('Payment method is required for the cover charge', 'paymentMethod');
    if (body.paymentMethod === 'COMPLIMENTARY' && !hasPermission(ctx, 'orders:approve-discount')) throw errors.forbidden('Complimentary entry requires manager authorization');
  }
  const e: ClubEntry = { id: nextId(ctx.db, 'entry'), entryNumber: nextDocNumber(ctx.db, 'ENT'), branchId: ctx.branchId, customerId: body.customerId ?? null, guestName, phone: body.phone ?? null, guests, entryType: body.entryType, coverTypeId: body.coverTypeId ?? null, coverName: null, coverAmount, redeemableAmount: redeemable, redeemedAmount: 0, remainingCredit: redeemable, paymentMethod: coverAmount > 0 ? (body.paymentMethod as PaymentMethod) : null, hostUserId: body.hostUserId ?? me.id, hostName: null, tableId: body.tableId ?? null, tableName: null, status: 'CHECKED_IN', enteredAt: now(), exitedAt: null, notes: body.notes ?? null };
  ctx.db.p2.clubEntries.push(e);
  if (e.entryType === 'VIP') createNotification(ctx, 'VIP_ARRIVAL', 'INFO', `VIP arrived: ${guestName}`, `${guests} guest(s)${e.tableId ? ' · table assigned' : ''}`, 'CLUB_ENTRIES', e.id, 'MANAGER', null, null);
  audit(ctx, 'CLUB_CHECK_IN', 'CLUB_ENTRIES', e.id, null, `${e.entryType} ${guests} cover ${coverAmount} ${e.paymentMethod ?? ''}`);
  ctx.emit('club', 'entry.checked_in', e.id);
  return hydrateEntry(ctx, e);
}

export function checkOut(ctx: Ctx, id: ID): ClubEntry {
  assertPermission(ctx, 'club:manage');
  const e = ctx.db.p2.clubEntries.find((x) => x.id === Number(id) && x.branchId === ctx.branchId);
  if (!e || e.status !== 'CHECKED_IN') throw errors.conflict('Entry is not checked in');
  e.status = 'CHECKED_OUT'; e.exitedAt = now();
  audit(ctx, 'CLUB_CHECK_OUT', 'CLUB_ENTRIES', e.id);
  ctx.emit('club', 'entry.checked_out', e.id);
  return hydrateEntry(ctx, e);
}

export function cancelEntry(ctx: Ctx, id: ID, reason?: string): ClubEntry {
  assertPermission(ctx, 'club:manage');
  const e = ctx.db.p2.clubEntries.find((x) => x.id === Number(id) && x.branchId === ctx.branchId);
  if (!e) throw errors.notFound('Entry not found');
  if (e.redeemedAmount > 0) throw errors.business('Cover credit has already been used on a bill; reverse that payment first');
  e.status = 'CANCELLED'; e.exitedAt = now(); e.notes = `${e.notes ?? ''} [cancelled: ${reason ?? '-'}]`.trim().slice(0, 300);
  audit(ctx, 'CLUB_ENTRY_CANCELLED', 'CLUB_ENTRIES', e.id, null, reason);
  return hydrateEntry(ctx, e);
}

export function clubDashboard(ctx: Ctx): ClubDashboard {
  assertPermission(ctx, 'club:view');
  const day = businessDate();
  const entries = ctx.db.p2.clubEntries.filter((e) => e.branchId === ctx.branchId && inBusinessDay(e.enteredAt, day));
  const live = entries.filter((e) => e.status !== 'CANCELLED');
  const start = new Date(`${day}T06:00:00`).toISOString(), end = new Date(new Date(`${day}T06:00:00`).getTime() + 86400000).toISOString();
  const byType = new Map<string, { entries: number; guests: number; coverRevenue: number }>();
  live.forEach((e) => { const c = byType.get(e.entryType) ?? { entries: 0, guests: 0, coverRevenue: 0 }; c.entries += 1; c.guests += e.guests; c.coverRevenue = round2(c.coverRevenue + e.coverAmount); byType.set(e.entryType, c); });
  return {
    businessDate: day, entries: entries.length, guestsTotal: entries.reduce((a, e) => a + e.guests, 0), guestsInside: entries.filter((e) => e.status === 'CHECKED_IN').reduce((a, e) => a + e.guests, 0),
    coverRevenue: round2(live.reduce((a, e) => a + e.coverAmount, 0)), coverCreditUsed: round2(entries.reduce((a, e) => a + e.redeemedAmount, 0)), coverCreditOpen: round2(entries.filter((e) => e.status === 'CHECKED_IN').reduce((a, e) => a + e.redeemableAmount - e.redeemedAmount, 0)),
    vipEntries: entries.filter((e) => e.entryType === 'VIP').length,
    fnbRevenue: round2(ctx.db.bills.filter((b) => b.branchId === ctx.branchId && ['PAID', 'CLOSED'].includes(b.status) && b.paidAt && b.paidAt >= start && b.paidAt < end).reduce((a, b) => a + b.grandTotal, 0)),
    byEntryType: [...byType.entries()].map(([entryType, v]) => ({ entryType: entryType as ClubEntry['entryType'], ...v })),
    vipTables: ctx.db.p2.vipReservations.filter((v) => v.branchId === ctx.branchId && v.date === day && ['BOOKED', 'SEATED'].includes(v.status)).map((v) => hydrateVip(ctx, v)),
    recentEntries: listEntries(ctx, { date: day }),
  };
}

export function redeemCover(ctx: Ctx, billId: ID, entryId: ID, amount: number | undefined, refreshBill: RefreshBill): Bill {
  const me = assertPermission(ctx, 'billing:pay');
  const bill = ctx.db.bills.find((b) => b.id === Number(billId));
  if (!bill) throw errors.notFound('Bill not found');
  if (bill.status !== 'FINALIZED') throw errors.business('Finalize the bill before applying cover credit');
  const e = ctx.db.p2.clubEntries.find((x) => x.id === Number(entryId) && x.branchId === bill.branchId);
  if (!e) throw errors.notFound('Entry not found');
  if (e.status !== 'CHECKED_IN') throw errors.business('Entry is not checked in');
  const avail = round2(e.redeemableAmount - e.redeemedAmount);
  const amt = round2(Math.min(amount ?? avail, avail, bill.grandTotal - bill.paidAmount));
  if (amt <= 0) throw errors.validation('No cover credit available for this entry', 'amount');
  const payment = { id: nextId(ctx.db, 'payment'), paymentNumber: nextDocNumber(ctx.db, 'PAY'), billId: bill.id, method: 'COVER_CREDIT' as const, amount: amt, reference: e.entryNumber, status: 'SUCCESS' as const, receivedBy: me.id, receivedByName: me.fullName, createdAt: now(), reversedAt: null, reversalReason: null };
  bill.payments.push(payment);
  ctx.db.p2.coverRedemptions.push({ id: nextId(ctx.db, 'redemption'), entryId: e.id, billId: bill.id, paymentId: payment.id, amount: amt });
  e.redeemedAmount = round2(e.redeemedAmount + amt);
  refreshBill(ctx, bill);
  audit(ctx, 'COVER_CREDIT_REDEEMED', 'BILLS', bill.id, null, `${e.entryNumber} ${amt}`);
  ctx.emit('bills', 'payment.received', bill.id);
  return clone(bill);
}

export function reverseCoverRedemption(ctx: Ctx, paymentId: ID): void {
  for (const r of ctx.db.p2.coverRedemptions.filter((x) => x.paymentId === paymentId)) {
    const e = ctx.db.p2.clubEntries.find((x) => x.id === r.entryId);
    if (e) e.redeemedAmount = Math.max(round2(e.redeemedAmount - r.amount), 0);
  }
}

// ------------------------------------------------------------ VIP tables
function currentSpend(ctx: Ctx, orderId?: ID | null): number {
  const o = orderId ? ctx.db.orders.find((x) => x.id === orderId) : null;
  return o ? round2(o.items.filter((i) => i.status !== 'CANCELLED').reduce((a, i) => a + i.lineTotal, 0)) : 0;
}

function hydrateVip(ctx: Ctx, v: VipReservation): VipReservation {
  const o = ctx.db.orders.find((x) => x.id === v.orderId);
  const spend = currentSpend(ctx, v.orderId);
  return { ...clone(v), tableName: ctx.db.tables.find((t) => t.id === v.tableId)?.name ?? v.tableName, hostName: v.hostUserId ? userName(ctx.db, v.hostUserId) : null, orderNumber: o?.orderNumber ?? null, orderStatus: o?.status ?? null, currentSpend: spend, remainingSpend: Math.max(round2(v.minSpend - spend), 0) };
}

export function vipTables(ctx: Ctx): VipTable[] {
  assertPermission(ctx, 'vip:view');
  const day = businessDate();
  return ctx.db.tables.filter((t) => t.isVip && !t.isDeleted && t.branchId === ctx.branchId).map((t) => {
    const booking = ctx.db.p2.vipReservations.filter((v) => v.tableId === t.id && v.date === day && ['BOOKED', 'SEATED'].includes(v.status)).sort((a, b) => (a.status === 'SEATED' ? -1 : 1) - (b.status === 'SEATED' ? -1 : 1))[0];
    return { tableId: t.id, tableName: t.name, floorName: t.floorName, capacity: t.capacity, status: t.status, minSpendDefault: t.minSpendDefault ?? 0, depositDefault: t.depositDefault ?? 0, booking: booking ? hydrateVip(ctx, booking) : null };
  });
}

export function listVip(ctx: Ctx, q: { date?: string; status?: VipStatus }): VipReservation[] {
  assertPermission(ctx, 'vip:view');
  return ctx.db.p2.vipReservations.filter((v) => v.branchId === ctx.branchId && (!q.date || v.date === q.date.slice(0, 10)) && (!q.status || v.status === q.status)).sort((a, b) => b.date.localeCompare(a.date) || a.guestName.localeCompare(b.guestName)).map((v) => hydrateVip(ctx, v));
}

export function getVip(ctx: Ctx, id: ID): VipReservation {
  assertPermission(ctx, 'vip:view');
  const v = ctx.db.p2.vipReservations.find((x) => x.id === Number(id) && x.branchId === ctx.branchId);
  if (!v) throw errors.notFound('VIP reservation not found');
  return hydrateVip(ctx, v);
}

export function saveVip(ctx: Ctx, id: ID | null, body: VipReservationInput): VipReservation {
  assertPermission(ctx, 'vip:manage');
  const guestName = String(body.guestName ?? '').trim();
  if (!guestName || !body.date) throw errors.validation('Guest name and date are required', 'guestName');
  const t = ctx.db.tables.find((x) => x.id === Number(body.tableId) && !x.isDeleted && x.branchId === ctx.branchId);
  if (!t) throw errors.validation('Table is invalid', 'tableId');
  if (!t.isVip) throw errors.validation('Selected table is not a VIP table', 'tableId');
  const minSpend = Number(body.minSpend ?? t.minSpendDefault ?? 0), deposit = Number(body.depositAmount ?? t.depositDefault ?? 0);
  if (minSpend < 0 || deposit < 0) throw errors.validation('Amounts cannot be negative', 'minSpend');
  if (ctx.db.p2.vipReservations.some((v) => v.tableId === t.id && v.date === body.date && ['BOOKED', 'SEATED'].includes(v.status) && v.id !== id)) throw errors.conflict('This VIP table is already booked for that date');
  const data = { tableId: t.id, tableName: t.name, customerId: body.customerId ?? null, guestName, phone: body.phone ?? null, date: body.date, guests: Number(body.guests ?? 1), minSpend, depositAmount: deposit, depositPaid: !!body.depositPaid, hostUserId: body.hostUserId ?? null, notes: body.notes ?? null };
  let v: VipReservation;
  if (id == null) { v = { id: nextId(ctx.db, 'vip'), vipNumber: nextDocNumber(ctx.db, 'VIP'), branchId: ctx.branchId, ...data, hostName: null, status: 'BOOKED', orderId: null, orderNumber: null, orderStatus: null, currentSpend: 0, remainingSpend: minSpend, shortfallAmount: 0, createdAt: now() }; ctx.db.p2.vipReservations.push(v); }
  else { const f = ctx.db.p2.vipReservations.find((x) => x.id === id && x.branchId === ctx.branchId && ['BOOKED', 'SEATED'].includes(x.status)); if (!f) throw errors.notFound('Open VIP reservation not found'); Object.assign(f, data); v = f; }
  audit(ctx, id == null ? 'VIP_CREATED' : 'VIP_UPDATED', 'VIP_RESERVATIONS', v.id, null, body);
  ctx.emit('club', 'vip.saved', v.id);
  return hydrateVip(ctx, v);
}

export function transitionVip(ctx: Ctx, id: ID, action: VipAction, reason?: string): VipReservation {
  assertPermission(ctx, 'vip:manage');
  const v = ctx.db.p2.vipReservations.find((x) => x.id === Number(id) && x.branchId === ctx.branchId);
  if (!v) throw errors.notFound('VIP reservation not found');
  const from = v.status;
  switch (action) {
    case 'SEAT': {
      if (v.status !== 'BOOKED') throw errors.conflict(`Reservation is ${v.status.toLowerCase()}`);
      const order = createOrder(ctx, { tableId: v.tableId, guestCount: v.guests, notes: `VIP ${v.vipNumber} · min spend ₹${v.minSpend}`, items: [] });
      const stored = ctx.db.orders.find((o) => o.id === order.id)!;
      stored.customerId = v.customerId ?? null; stored.customerName = ctx.db.p2.customers.find((c) => c.id === v.customerId)?.fullName ?? null; stored.vipResId = v.id;
      v.status = 'SEATED'; v.orderId = order.id; break;
    }
    case 'COMPLETE': if (v.status !== 'SEATED') throw errors.conflict('Only seated reservations can be completed'); v.status = 'COMPLETED'; break;
    case 'CANCEL': if (['COMPLETED', 'CANCELLED'].includes(v.status)) throw errors.conflict('Reservation already closed'); v.status = 'CANCELLED'; v.notes = `${v.notes ?? ''} [cancelled: ${reason ?? '-'}]`.trim().slice(0, 500); break;
    case 'NO_SHOW': if (v.status !== 'BOOKED') throw errors.conflict('Only booked reservations can be marked no-show'); v.status = 'NO_SHOW'; break;
    default: throw errors.validation(`Unknown action ${String(action)}`, 'action');
  }
  audit(ctx, `VIP_${action}`, 'VIP_RESERVATIONS', v.id, from, v.status);
  ctx.emit('club', 'vip.status', v.id);
  return hydrateVip(ctx, v);
}

export function vipSpend(ctx: Ctx, id: ID): VipReservation {
  const v = getVip(ctx, id);
  const b = currentBranch(ctx);
  const mode = b.minSpendShortfallMode ?? 'CHARGE_DIFFERENCE';
  const short = v.currentSpend >= v.minSpend ? 0 : mode === 'CHARGE_DIFFERENCE' ? round2(v.minSpend - v.currentSpend) : mode === 'FLAT_FEE' ? (b.minSpendFlatFee ?? 0) : 0;
  return { ...v, shortfallMode: mode, projectedShortfall: short, percentReached: v.minSpend > 0 ? Math.min(Math.round((v.currentSpend * 1000) / v.minSpend) / 10, 100) : 100 };
}

/** hook: BILLING calculate — configurable shortfall rule */
export function shortfallForOrder(ctx: Ctx, orderId: ID, netAmount: number): number {
  const v = ctx.db.p2.vipReservations.find((x) => x.orderId === orderId && ['SEATED', 'COMPLETED'].includes(x.status));
  if (!v || v.minSpend <= 0 || netAmount >= v.minSpend) return 0;
  const b = currentBranch(ctx);
  const mode = b.minSpendShortfallMode ?? 'CHARGE_DIFFERENCE';
  return mode === 'CHARGE_DIFFERENCE' ? round2(v.minSpend - netAmount) : mode === 'FLAT_FEE' ? (b.minSpendFlatFee ?? 0) : 0;
}
export function vipOnBillClosed(ctx: Ctx, orderId: ID): void {
  ctx.db.p2.vipReservations.filter((v) => v.orderId === orderId && v.status === 'SEATED').forEach((v) => { v.status = 'COMPLETED'; });
}

// ------------------------------------------------------------ bottle service
export function bottleList(ctx: Ctx): BottleServiceItem[] {
  assertPermission(ctx, 'menu:view');
  return ctx.db.p2.bottleService.map((b) => {
    const mi = ctx.db.items.find((x) => x.id === b.menuItemId);
    const inv = ctx.db.p2.invItems.find((x) => x.id === b.invItemId);
    return { id: b.id, menuItemId: b.menuItemId, menuItemName: mi?.name ?? '', price: mi?.price ?? 0, isAvailable: mi?.isAvailable ?? false, bottleSizeMl: b.bottleSizeMl, invItemId: b.invItemId ?? null, invItemName: inv?.name ?? null, bottlesInStock: inv?.currentQty ?? null, includes: b.includes ?? null, isActive: b.isActive };
  }).filter((b) => b.menuItemName).sort((a, b) => a.menuItemName.localeCompare(b.menuItemName));
}

export function bottleSave(ctx: Ctx, menuItemId: ID, body: BottleServiceInput): BottleServiceItem[] {
  assertPermission(ctx, 'menu:manage');
  const size = Number(body.bottleSizeMl);
  if (!(size > 0)) throw errors.validation('Bottle size (ml) is required', 'bottleSizeMl');
  if (!ctx.db.items.some((x) => x.id === Number(menuItemId) && !x.isDeleted)) throw errors.notFound('Menu item not found');
  if (body.invItemId && !ctx.db.p2.invItems.some((x) => x.id === Number(body.invItemId) && !x.isDeleted)) throw errors.validation('Inventory item not found', 'invItemId');
  const existing = ctx.db.p2.bottleService.find((b) => b.menuItemId === Number(menuItemId));
  const data = { bottleSizeMl: size, invItemId: body.invItemId ? Number(body.invItemId) : null, includes: body.includes ?? null, isActive: body.isActive ?? true };
  if (existing) Object.assign(existing, data); else ctx.db.p2.bottleService.push({ id: nextId(ctx.db, 'bottle'), menuItemId: Number(menuItemId), ...data });
  audit(ctx, 'BOTTLE_SERVICE_SAVED', 'BOTTLE_SERVICE_ITEMS', Number(menuItemId), null, body);
  ctx.emit('menu', 'bottle.saved', Number(menuItemId));
  return bottleList(ctx);
}

export function bottleRemove(ctx: Ctx, menuItemId: ID): BottleServiceItem[] {
  assertPermission(ctx, 'menu:manage');
  const b = ctx.db.p2.bottleService.find((x) => x.menuItemId === Number(menuItemId));
  if (b) b.isActive = false;
  audit(ctx, 'BOTTLE_SERVICE_REMOVED', 'BOTTLE_SERVICE_ITEMS', Number(menuItemId));
  return bottleList(ctx);
}

// ------------------------------------------------------------ hotel room charges (PMS adapter seam)
interface PmsAdapter { verifyRoom(roomNo: string): RoomVerification; postCharge(roomNo: string, guest: string, amount: number): { success: boolean; pmsReference?: string; error?: string } }

const simulatedPms: PmsAdapter = {
  verifyRoom(roomNo) {
    const r = roomNo.trim().toUpperCase();
    if (!/^[1-5][0-9]{2}$/.test(r)) return { found: false, roomNo: r, checkedIn: false, guestName: null };
    const occupied = !r.endsWith('0');
    const names = ['Sharma', 'Khan', 'Fernandes', 'Patel', 'Rao'];
    return { found: true, roomNo: r, checkedIn: occupied, guestName: occupied ? `Guest ${r} (${names[Number(r) % 5]})` : null };
  },
  postCharge(roomNo, _guest, _amount) {
    const v = this.verifyRoom(roomNo);
    return v.found && v.checkedIn ? { success: true, pmsReference: `SIM-${v.roomNo}-${Date.now().toString(36).toUpperCase()}` } : { success: false, error: `Room ${roomNo} is not occupied` };
  },
};

function adapter(ctx: Ctx): PmsAdapter {
  const provider = currentBranch(ctx).pmsProvider ?? 'SIMULATED';
  if (provider === 'SIMULATED') return simulatedPms;
  return { verifyRoom: (roomNo) => ({ found: false, roomNo, checkedIn: false, guestName: null, error: `PMS provider ${provider} is not configured` }), postCharge: () => ({ success: false, error: `PMS provider ${provider} is not configured` }) };
}

export function verifyRoom(ctx: Ctx, roomNo: string): RoomVerification {
  assertPermission(ctx, 'room-charge:post');
  if (!roomNo?.trim()) throw errors.validation('Room number is required', 'roomNo');
  return adapter(ctx).verifyRoom(roomNo);
}

export function postToRoom(ctx: Ctx, billId: ID, body: { roomNo: string; guestName: string; amount?: number }, refreshBill: RefreshBill): Bill {
  const me = assertPermission(ctx, 'room-charge:post');
  const bill = ctx.db.bills.find((b) => b.id === Number(billId));
  if (!bill) throw errors.notFound('Bill not found');
  if (bill.status !== 'FINALIZED') throw errors.business('Finalize the bill before charging to a room');
  if (!body.roomNo?.trim() || !body.guestName?.trim()) throw errors.validation('Room number and guest name are required', 'roomNo');
  const balance = round2(bill.grandTotal - bill.paidAmount);
  const amt = round2(body.amount ?? balance);
  if (amt <= 0 || amt > balance + 0.005) throw errors.validation('Amount must be positive and within the balance due', 'amount');
  const rc: Ctx['db']['p2']['roomCharges'][number] = { id: nextId(ctx.db, 'roomCharge'), billId: bill.id, billNumber: bill.billNumber, roomNo: body.roomNo.trim().toUpperCase(), guestName: body.guestName.trim(), amount: amt, status: 'PENDING', pmsProvider: currentBranch(ctx).pmsProvider ?? 'SIMULATED', pmsReference: null, postedAt: null, failureReason: null, paymentId: null };
  ctx.db.p2.roomCharges.push(rc);
  const res = adapter(ctx).postCharge(rc.roomNo, rc.guestName, amt);
  if (!res.success) { rc.status = 'FAILED'; rc.failureReason = res.error ?? 'Unknown error'; audit(ctx, 'ROOM_CHARGE_FAILED', 'BILLS', bill.id, null, rc.failureReason); throw errors.business(`Room charge failed: ${rc.failureReason}`); }
  const payment = { id: nextId(ctx.db, 'payment'), paymentNumber: nextDocNumber(ctx.db, 'PAY'), billId: bill.id, method: 'ROOM_CHARGE' as const, amount: amt, reference: `Room ${rc.roomNo}`, status: 'SUCCESS' as const, receivedBy: me.id, receivedByName: me.fullName, createdAt: now(), reversedAt: null, reversalReason: null };
  bill.payments.push(payment);
  Object.assign(rc, { status: 'POSTED', paymentId: payment.id, pmsReference: res.pmsReference ?? null, postedAt: now() });
  refreshBill(ctx, bill);
  audit(ctx, 'ROOM_CHARGE_POSTED', 'BILLS', bill.id, null, `Room ${rc.roomNo} ${amt} ref ${rc.pmsReference}`);
  ctx.emit('bills', 'payment.received', bill.id);
  return clone(bill);
}

export function reverseRoomCharge(ctx: Ctx, paymentId: ID): void {
  ctx.db.p2.roomCharges.filter((r) => r.paymentId === paymentId && r.status === 'POSTED').forEach((r) => { r.status = 'REVERSED'; });
}

export function listRoomCharges(ctx: Ctx, q: { from?: string; to?: string }): RoomCharge[] {
  assertPermission(ctx, 'billing:view');
  return ctx.db.p2.roomCharges.filter((r) => ctx.db.bills.find((b) => b.id === r.billId)?.branchId === ctx.branchId).filter((r) => (!q.from || (r.postedAt ?? '') >= q.from) && (!q.to || (r.postedAt ?? '') <= q.to)).sort((a, b) => (b.postedAt ?? '').localeCompare(a.postedAt ?? '')).map(({ paymentId: _p, ...r }) => clone(r));
}
