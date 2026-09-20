/**
 * Billing calculation engine — pure, deterministic, mirrored by BILLING_PKG.calculate (Oracle).
 *
 * ITEM TOTAL → SUBTOTAL → ITEM DISCOUNTS → ORDER DISCOUNT → SERVICE CHARGE → TAX → ROUNDING → GRAND TOTAL
 */
import { round2 } from './money';
import type { RoundingMode, TaxRate, TaxLine } from '@/types';

export interface CalcLineInput {
  key: string | number;
  quantity: number;
  unitPrice: number;
  /** item-level (offer) discount, absolute */
  itemDiscount: number;
  taxRates: TaxRate[];
}

export interface CalcDiscountInput {
  key: string | number;
  type: 'PERCENTAGE' | 'FLAT';
  value: number;
}

export interface CalcInput {
  lines: CalcLineInput[];
  orderDiscounts: CalcDiscountInput[];
  serviceChargePercent: number;
  taxOnServiceCharge: boolean;
  roundingMode: RoundingMode;
}

export interface CalcLineResult {
  key: string | number;
  lineTotal: number;
  itemDiscount: number;
  orderDiscountShare: number;
  taxableAmount: number;
  taxPercent: number;
  taxAmount: number;
}

export interface CalcResult {
  lines: CalcLineResult[];
  discounts: { key: string | number; amount: number }[];
  subtotal: number;
  itemDiscountTotal: number;
  orderDiscountTotal: number;
  netAmount: number;
  serviceChargeAmount: number;
  taxLines: TaxLine[];
  taxTotal: number;
  rawTotal: number;
  roundOff: number;
  grandTotal: number;
}

export function roundAmount(amount: number, mode: RoundingMode): number {
  switch (mode) {
    case 'NEAREST': return Math.round(amount);
    case 'UP': return Math.ceil(amount);
    case 'DOWN': return Math.floor(amount);
    default: return round2(amount);
  }
}

export function calculateBill(input: CalcInput): CalcResult {
  const lineTotals = input.lines.map((l) => round2(l.unitPrice * l.quantity));
  const subtotal = round2(lineTotals.reduce((a, b) => a + b, 0));
  const itemDiscountTotal = round2(input.lines.reduce((a, l) => a + Math.max(0, l.itemDiscount), 0));
  const afterItem = round2(subtotal - itemDiscountTotal);

  // order-level discounts — applied sequentially, each capped to the remaining amount
  let orderDiscountTotal = 0;
  const discounts = input.orderDiscounts.map((d) => {
    let amt = d.type === 'PERCENTAGE' ? round2((afterItem * d.value) / 100) : round2(d.value);
    amt = Math.min(amt, Math.max(0, round2(afterItem - orderDiscountTotal)));
    orderDiscountTotal = round2(orderDiscountTotal + amt);
    return { key: d.key, amount: amt };
  });

  const netAmount = round2(afterItem - orderDiscountTotal);
  const serviceChargeAmount = round2((netAmount * input.serviceChargePercent) / 100);

  const taxMap = new Map<string, TaxLine>();
  let taxTotal = 0;
  const lines: CalcLineResult[] = input.lines.map((l, i) => {
    const lineTotal = lineTotals[i];
    const afterItemLine = round2(lineTotal - l.itemDiscount);
    const share = afterItem > 0 ? round2((orderDiscountTotal * afterItemLine) / afterItem) : 0;
    let taxable = round2(afterItemLine - share);
    if (input.taxOnServiceCharge && netAmount > 0) {
      taxable = round2(taxable + (serviceChargeAmount * (afterItemLine - share)) / netAmount);
    }
    let lineTax = 0;
    let pct = 0;
    for (const r of l.taxRates) {
      const amt = round2((taxable * r.percent) / 100);
      lineTax = round2(lineTax + amt);
      pct += r.percent;
      const k = `${r.code}|${r.name}|${r.percent}`;
      const existing = taxMap.get(k);
      if (existing) {
        existing.taxableAmount = round2(existing.taxableAmount + taxable);
        existing.amount = round2(existing.amount + amt);
      } else {
        taxMap.set(k, { code: r.code, name: r.name, percent: r.percent, taxableAmount: taxable, amount: amt });
      }
    }
    taxTotal = round2(taxTotal + lineTax);
    return { key: l.key, lineTotal, itemDiscount: l.itemDiscount, orderDiscountShare: share, taxableAmount: taxable, taxPercent: pct, taxAmount: lineTax };
  });

  const rawTotal = round2(netAmount + serviceChargeAmount + taxTotal);
  const grandTotal = roundAmount(rawTotal, input.roundingMode);
  const roundOff = round2(grandTotal - rawTotal);

  return {
    lines,
    discounts,
    subtotal,
    itemDiscountTotal,
    orderDiscountTotal,
    netAmount,
    serviceChargeAmount,
    taxLines: [...taxMap.values()].sort((a, b) => a.code.localeCompare(b.code)),
    taxTotal,
    rawTotal,
    roundOff,
    grandTotal,
  };
}

/** Effective percentage of a discount request against the discountable base — used for cap checks. */
export function discountPercentOf(type: 'PERCENTAGE' | 'FLAT', value: number, base: number): number {
  if (type === 'PERCENTAGE') return value;
  return base > 0 ? (value * 100) / base : 0;
}
