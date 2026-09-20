const formatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 0 });
const formatter2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 2 });

/** ₹1,234 / ₹1,234.50 */
export function money(amount: number | null | undefined, opts?: { decimals?: boolean }): string {
  const n = Number(amount ?? 0);
  return opts?.decimals ? formatter2.format(n) : formatter.format(Math.abs(n) % 1 === 0 ? n : Number(n.toFixed(2)));
}

/** Round half-up to 2 decimals — same as Oracle ROUND(x, 2). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function parseAmount(input: string): number {
  const n = Number(String(input).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
