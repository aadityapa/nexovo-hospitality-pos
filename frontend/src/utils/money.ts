const formatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 0 });
const formatter2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 2 });

/**
 * ₹1,234 · ₹1,890.50 · ₹341.90
 *
 * The currency's precision is two decimals, so an amount that HAS a fractional part is always
 * shown with both of them. The old behaviour printed `₹1,890.5` and `₹341.9`, which reads as a
 * truncated number rather than money and never matches a printed receipt.
 *
 * A whole amount still renders compactly (`₹3,781`) unless `decimals` is passed, which forces
 * the full two-decimal form for columns of figures that must align and for anything that has to
 * agree with the receipt line for line.
 *
 * Abbreviated chart-axis labels are a different job and deliberately live elsewhere
 * (`compactMoney` in config/chartTheme.ts) — an exact figure and an axis tick must never be
 * formatted by the same function.
 */
export function money(amount: number | null | undefined, opts?: { decimals?: boolean }): string {
  const n = Number(amount ?? 0);
  if (opts?.decimals) return formatter2.format(n);
  return Number.isInteger(round2(n)) ? formatter.format(n) : formatter2.format(n);
}

/** Round half-up to 2 decimals — same as Oracle ROUND(x, 2). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function parseAmount(input: string): number {
  const n = Number(String(input).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
