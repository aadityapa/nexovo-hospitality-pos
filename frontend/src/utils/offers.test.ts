import { describe, it, expect } from 'vitest';
import { isOfferCurrentlyActive, offerDiscountForLine, bestOfferForLine } from './offers';
import type { Offer } from '@/types';

const base: Offer = { id: 1, branchId: 1, name: 'x', offerType: 'PERCENTAGE', discountValue: 10, maxDiscountAmount: null, appliesTo: 'ALL', categoryIds: [], itemIds: [], startDate: '2026-01-01', endDate: '2026-12-31', startTime: null, endTime: null, daysOfWeek: [], isActive: true, isCurrentlyActive: false };
const at = (iso: string) => new Date(iso);

describe('offers', () => {
  it('respects date, time and weekday windows', () => {
    expect(isOfferCurrentlyActive(base, at('2026-06-15T12:00:00'))).toBe(true);
    expect(isOfferCurrentlyActive(base, at('2027-01-01T12:00:00'))).toBe(false);
    expect(isOfferCurrentlyActive({ ...base, startTime: '16:00', endTime: '19:00' }, at('2026-06-15T15:59:00'))).toBe(false);
    expect(isOfferCurrentlyActive({ ...base, startTime: '16:00', endTime: '19:00' }, at('2026-06-15T17:30:00'))).toBe(true);
    expect(isOfferCurrentlyActive({ ...base, daysOfWeek: [6, 7] }, at('2026-06-15T12:00:00'))).toBe(false); // Monday
    expect(isOfferCurrentlyActive({ ...base, daysOfWeek: [1] }, at('2026-06-15T12:00:00'))).toBe(true);
    expect(isOfferCurrentlyActive({ ...base, isActive: false }, at('2026-06-15T12:00:00'))).toBe(false);
  });
  it('computes discount per offer type', () => {
    expect(offerDiscountForLine({ ...base, offerType: 'PERCENTAGE', discountValue: 10 }, 450, 2)).toBe(90);
    expect(offerDiscountForLine({ ...base, offerType: 'PERCENTAGE', discountValue: 10, maxDiscountAmount: 50 }, 450, 2)).toBe(50);
    expect(offerDiscountForLine({ ...base, offerType: 'FLAT', discountValue: 50 }, 450, 2)).toBe(100);
    expect(offerDiscountForLine({ ...base, offerType: 'FLAT', discountValue: 500 }, 100, 1)).toBe(100);
    expect(offerDiscountForLine({ ...base, offerType: 'BOGO' }, 380, 3)).toBe(380);
    expect(offerDiscountForLine({ ...base, offerType: 'BOGO' }, 380, 4)).toBe(760);
    expect(offerDiscountForLine({ ...base, offerType: 'COMBO', discountValue: 120 }, 300, 2)).toBe(120);
  });
  it('picks the best applicable offer', () => {
    const offers: Offer[] = [
      { ...base, id: 1, offerType: 'PERCENTAGE', discountValue: 10, appliesTo: 'CATEGORIES', categoryIds: [5] },
      { ...base, id: 2, offerType: 'FLAT', discountValue: 80, appliesTo: 'ITEMS', itemIds: [42] },
      { ...base, id: 3, offerType: 'PERCENTAGE', discountValue: 50, appliesTo: 'ITEMS', itemIds: [99] },
    ];
    const r = bestOfferForLine(offers, { id: 42, categoryId: 5 }, 450, 1, at('2026-06-15T12:00:00'));
    expect(r.offer?.id).toBe(2);
    expect(r.amount).toBe(80);
    expect(bestOfferForLine(offers, { id: 7, categoryId: 1 }, 450, 1, at('2026-06-15T12:00:00')).offer).toBeNull();
  });
});
