/**
 * Offer applicability & discount computation — mirrored by V_OFFER_ACTIVE + OFFER_PKG.best_item_discount (Oracle).
 */
import { round2 } from './money';
import type { Offer, MenuItem } from '@/types';

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** ISO day-of-week: 1 = Monday … 7 = Sunday */
function isoDow(d: Date): number {
  const js = d.getDay();
  return js === 0 ? 7 : js;
}

export function isOfferCurrentlyActive(o: Pick<Offer, 'isActive' | 'startDate' | 'endDate' | 'startTime' | 'endTime' | 'daysOfWeek'>, now: Date = new Date()): boolean {
  if (!o.isActive) return false;
  const today = ymd(now);
  if (today < o.startDate || today > o.endDate) return false;
  const t = hhmm(now);
  if (o.startTime && t < o.startTime) return false;
  if (o.endTime && t > o.endTime) return false;
  if (o.daysOfWeek && o.daysOfWeek.length > 0 && !o.daysOfWeek.includes(isoDow(now))) return false;
  return true;
}

export function offerAppliesToItem(o: Offer, item: Pick<MenuItem, 'id' | 'categoryId'>): boolean {
  if (o.appliesTo === 'ALL') return true;
  if (o.appliesTo === 'CATEGORIES') return o.categoryIds.includes(item.categoryId);
  return o.itemIds.includes(item.id);
}

export function offerDiscountForLine(o: Offer, unitPrice: number, qty: number): number {
  const line = unitPrice * qty;
  let amt = 0;
  switch (o.offerType) {
    case 'PERCENTAGE':
    case 'HAPPY_HOUR': amt = (line * o.discountValue) / 100; break;
    case 'FLAT': amt = Math.min(o.discountValue * qty, line); break;
    case 'COMBO': amt = Math.min(o.discountValue, line); break;
    case 'BOGO': amt = Math.floor(qty / 2) * unitPrice; break;
  }
  if (o.maxDiscountAmount != null && o.maxDiscountAmount > 0) amt = Math.min(amt, o.maxDiscountAmount);
  return round2(Math.max(0, amt));
}

/** Best (largest) currently-active offer discount for a line. */
export function bestOfferForLine(offers: Offer[], item: Pick<MenuItem, 'id' | 'categoryId'>, unitPrice: number, qty: number, now: Date = new Date()): { amount: number; offer: Offer | null } {
  let best: { amount: number; offer: Offer | null } = { amount: 0, offer: null };
  for (const o of offers) {
    if (!isOfferCurrentlyActive(o, now) || !offerAppliesToItem(o, item)) continue;
    const amt = offerDiscountForLine(o, unitPrice, qty);
    if (amt > best.amount) best = { amount: amt, offer: o };
  }
  return best;
}

export function offerLabel(o: Offer): string {
  switch (o.offerType) {
    case 'PERCENTAGE': return `${o.discountValue}% off`;
    case 'HAPPY_HOUR': return `Happy hour ${o.discountValue}% off`;
    case 'FLAT': return `₹${o.discountValue} off`;
    case 'COMBO': return `Combo ₹${o.discountValue} off`;
    case 'BOGO': return 'Buy 1 Get 1';
  }
}
