/**
 * Rendered regression for the VIP minimum-spend shortfall.
 *
 * The earlier version of this guard only asserted that the string `minSpendShortfall` appeared
 * somewhere in the source files. That proves a property name exists, not that a guest ever sees
 * the charge — a commented-out row, a wrong branch, or a `0`-valued render would all have passed.
 *
 * These tests render the real components with a real bill produced by the billing engine and
 * assert the LABEL and the FORMATTED AMOUNT that a cashier and a guest actually read, plus the
 * negative case: with no shortfall the line must not appear at all.
 *
 * Runs under happy-dom (see `environmentMatchGlobs` in vite.config.ts); happy-dom and
 * @testing-library/react are declared devDependencies, so `npm ci` reproduces this on any OS.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { createSeedDb, type MockDb } from '@/services/api/mock/db';
import type { Ctx } from '@/services/api/mock/engine/context';
import * as orders from '@/services/api/mock/engine/orders';
import * as billing from '@/services/api/mock/engine/billing';
import * as guests from '@/services/api/mock/engine/p2/guests';
import { money } from '@/utils/money';
import { BillSummary } from './BillSummary';
import { ReceiptView } from './ReceiptView';
import type { Bill, Receipt } from '@/types';

let db: MockDb;
const ctx = (username: string): Ctx => ({ db, user: db.users.find((u) => u.username === username)!, branchId: 1, emit: () => {} });
const item = (code: string) => db.items.find((i) => i.code === code)!.id;
const ymd = () => new Date().toISOString().slice(0, 10);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Screen label and receipt label are deliberately different (one is 80 mm wide). */
const SUMMARY_LABEL = 'VIP minimum spend shortfall';
const RECEIPT_LABEL = 'Min spend shortfall';

/** The receipt prints rupees as "Rs " — mirror the component's own transformation. */
const asReceiptMoney = (n: number) => money(n, { decimals: true }).replace('₹', 'Rs ');

/**
 * Seats a real VIP booking, orders one cheap item and finalises the bill, so the shortfall is
 * produced by the engine under test rather than typed into a fixture.
 */
function vipBill(minSpend: number): Bill {
  const a = ctx('admin');
  const today = ymd();
  const vipTable = db.tables.find((t) => t.isVip && t.status === 'AVAILABLE'
    && !db.p2.vipReservations.some((v) => v.tableId === t.id && v.date === today && ['BOOKED', 'SEATED'].includes(v.status)))!;
  const v = guests.saveVip(a, null, { tableId: vipTable.id, guestName: 'Shortfall Guest', date: today, guests: 4, minSpend, depositAmount: 0, depositPaid: false });
  const seated = guests.transitionVip(a, v.id, 'SEAT');
  const w = ctx('waiter1');
  orders.addItems(w, seated.orderId!, [{ menuItemId: item('BG01'), quantity: 1 }]);
  orders.confirmOrder(w, seated.orderId!);
  const c = ctx('cashier');
  return billing.finalizeBill(c, billing.createBill(c, seated.orderId!).id);
}

const receiptFor = (bill: Bill): Receipt => billing.receipt(ctx('cashier'), bill.id);

beforeEach(() => { db = createSeedDb(); });
afterEach(() => { cleanup(); });

describe('VIP minimum-spend shortfall — rendered output', () => {
  it('bill summary shows the labelled shortfall row with the formatted amount', () => {
    const bill = vipBill(50_000);
    const shortfall = bill.minSpendShortfall ?? 0;
    expect(shortfall, 'engine must produce a shortfall for this fixture').toBeGreaterThan(0);

    const { container } = render(<BillSummary bill={bill} />);

    // The row exists, carries the label a cashier reads, and prints the amount next to it.
    const label = screen.getByText(SUMMARY_LABEL);
    const row = label.parentElement!;
    expect(within(row).getByText(money(shortfall, { decimals: true }))).toBeTruthy();

    // …and the grand total the row helps explain is the one shown.
    expect(screen.getByText('Grand total')).toBeTruthy();
    expect(container.textContent).toContain(money(bill.grandTotal, { decimals: true }));
  });

  it('receipt prints the shortfall line with the formatted amount', () => {
    const bill = vipBill(50_000);
    const shortfall = bill.minSpendShortfall ?? 0;
    const receipt = receiptFor(bill);

    render(<ReceiptView receipt={receipt} id="receipt-test" />);

    const label = screen.getByText(RECEIPT_LABEL);
    const row = label.parentElement!;
    expect(within(row).getByText(asReceiptMoney(shortfall))).toBeTruthy();

    // The guest must be able to reconcile the printed lines against the printed total.
    // (On an unpaid bill the same figure prints twice — GRAND TOTAL and Balance due.)
    const totalRow = screen.getByText('GRAND TOTAL').parentElement!;
    expect(within(totalRow).getByText(asReceiptMoney(bill.grandTotal))).toBeTruthy();
  });

  it('neither surface renders the line when there is no shortfall', () => {
    const bill = vipBill(1);                       // a minimum of 1 is cleared by any order
    expect(bill.minSpendShortfall ?? 0).toBe(0);

    const summary = render(<BillSummary bill={bill} />);
    expect(screen.queryByText(SUMMARY_LABEL)).toBeNull();
    // Guard against a "₹0.00" row sneaking in under a different label.
    expect(summary.container.textContent).not.toContain('shortfall');
    cleanup();

    const receipt = render(<ReceiptView receipt={receiptFor(bill)} id="receipt-test" />);
    expect(screen.queryByText(RECEIPT_LABEL)).toBeNull();
    expect(receipt.container.textContent).not.toContain('shortfall');
  });

  it('the rendered rows reconcile to the rendered grand total', () => {
    const bill = vipBill(50_000);
    const shortfall = bill.minSpendShortfall ?? 0;
    const net = round2(bill.subtotal - bill.discountTotal);

    // Arithmetic invariant retained from the engine-level regression: the shortfall is
    // non-taxable and is added after tax, before rounding.
    expect(round2(bill.taxLines.reduce((a, t) => a + t.amount, 0))).toBe(bill.taxTotal);
    expect(round2(net + bill.serviceChargeAmount + bill.taxTotal + shortfall + bill.roundOff)).toBe(bill.grandTotal);
    expect(bill.grandTotal).toBeGreaterThanOrEqual(50_000);

    // …and the figures used in that sum are the ones on screen, not internal-only values.
    const { container } = render(<BillSummary bill={bill} />);
    for (const value of [bill.subtotal, shortfall, bill.grandTotal]) {
      expect(container.textContent, `${value} must be rendered`).toContain(money(value, { decimals: true }));
    }
  });
});
