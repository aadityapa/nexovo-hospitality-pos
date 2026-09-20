import { describe, it, expect } from 'vitest';
import { calculateBill, discountPercentOf, roundAmount } from './billing';

const GST5 = [{ code: 'CGST', name: 'CGST', percent: 2.5 }, { code: 'SGST', name: 'SGST', percent: 2.5 }];
const VAT20 = [{ code: 'VAT', name: 'VAT', percent: 20 }];

describe('calculateBill', () => {
  it('computes subtotal, service charge, tax, rounding and grand total', () => {
    const r = calculateBill({
      lines: [
        { key: 1, quantity: 2, unitPrice: 350, itemDiscount: 0, taxRates: GST5 },   // 700
        { key: 2, quantity: 1, unitPrice: 250, itemDiscount: 0, taxRates: GST5 },   // 250
        { key: 3, quantity: 1, unitPrice: 450, itemDiscount: 0, taxRates: VAT20 },  // 450
      ],
      orderDiscounts: [], serviceChargePercent: 5, taxOnServiceCharge: false, roundingMode: 'NEAREST',
    });
    expect(r.subtotal).toBe(1400);
    expect(r.serviceChargeAmount).toBe(70);
    // tax: 950 * 5% = 47.5 ; 450 * 20% = 90
    expect(r.taxTotal).toBe(137.5);
    expect(r.rawTotal).toBe(1607.5);
    expect(r.grandTotal).toBe(1608);
    expect(r.roundOff).toBe(0.5);
    expect(r.taxLines.map((t) => `${t.code}:${t.amount}`).sort()).toEqual(['CGST:23.75', 'SGST:23.75', 'VAT:90']);
  });

  it('applies item discounts before order discounts and allocates order discount pro-rata for tax', () => {
    const r = calculateBill({
      lines: [
        { key: 1, quantity: 1, unitPrice: 1000, itemDiscount: 100, taxRates: GST5 },
        { key: 2, quantity: 1, unitPrice: 1000, itemDiscount: 0, taxRates: VAT20 },
      ],
      orderDiscounts: [{ key: 'd1', type: 'PERCENTAGE', value: 10 }], serviceChargePercent: 0, taxOnServiceCharge: false, roundingMode: 'NONE',
    });
    expect(r.itemDiscountTotal).toBe(100);
    expect(r.orderDiscountTotal).toBe(190);            // 10% of 1900
    expect(r.lines[0].orderDiscountShare).toBe(90);    // 900/1900 * 190
    expect(r.lines[1].orderDiscountShare).toBe(100);
    expect(r.lines[0].taxableAmount).toBe(810);
    expect(r.lines[1].taxableAmount).toBe(900);
    expect(r.taxTotal).toBe(40.5 + 180);
    expect(r.grandTotal).toBe(1710 + 220.5);
  });

  it('caps flat discounts to the discountable amount and never goes negative', () => {
    const r = calculateBill({ lines: [{ key: 1, quantity: 1, unitPrice: 100, itemDiscount: 0, taxRates: [] }], orderDiscounts: [{ key: 'a', type: 'FLAT', value: 80 }, { key: 'b', type: 'FLAT', value: 50 }], serviceChargePercent: 0, taxOnServiceCharge: false, roundingMode: 'NONE' });
    expect(r.discounts.map((d) => d.amount)).toEqual([80, 20]);
    expect(r.grandTotal).toBe(0);
  });

  it('taxes the service charge when configured', () => {
    const r = calculateBill({ lines: [{ key: 1, quantity: 1, unitPrice: 1000, itemDiscount: 0, taxRates: GST5 }], orderDiscounts: [], serviceChargePercent: 10, taxOnServiceCharge: true, roundingMode: 'NONE' });
    expect(r.serviceChargeAmount).toBe(100);
    expect(r.lines[0].taxableAmount).toBe(1100);
    expect(r.taxTotal).toBe(55);
    expect(r.grandTotal).toBe(1155);
  });

  it('supports rounding modes', () => {
    expect(roundAmount(100.4, 'NEAREST')).toBe(100);
    expect(roundAmount(100.5, 'NEAREST')).toBe(101);
    expect(roundAmount(100.1, 'UP')).toBe(101);
    expect(roundAmount(100.9, 'DOWN')).toBe(100);
    expect(roundAmount(100.456, 'NONE')).toBe(100.46);
  });

  it('computes effective discount percentage for cap checks', () => {
    expect(discountPercentOf('PERCENTAGE', 15, 1000)).toBe(15);
    expect(discountPercentOf('FLAT', 250, 1000)).toBe(25);
    expect(discountPercentOf('FLAT', 250, 0)).toBe(0);
  });
});
