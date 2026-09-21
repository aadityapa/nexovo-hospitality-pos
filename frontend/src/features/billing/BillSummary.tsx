import { Star } from 'lucide-react';
import { ProgressMeter } from '@/components/graphics';
import { cn } from '@/utils/cn';
import { money } from '@/utils/money';
import type { Bill } from '@/types';

function Row({ label, value, muted, negative, compact, className }: {
  label: string; value: number; muted?: boolean; negative?: boolean; compact?: boolean; className?: string;
}) {
  return (
    /* Every figure in this column is `tnum`, so the decimal points line up down the whole
       breakdown and the grand total can be reconciled by eye without reading a single digit. */
    <div className={cn('flex justify-between items-baseline gap-3', compact ? 'text-sm' : 'text-[0.9375rem]', muted ? 'text-neutral-500' : 'text-neutral-700', className)}>
      <span className="min-w-0">{label}</span>
      <span className={cn('tnum shrink-0', negative && 'text-success-700')}>
        {negative ? '−' : ''}{money(Math.abs(value), { decimals: true })}
      </span>
    </div>
  );
}

/**
 * The financial summary — the same numbers the receipt prints, in the same order the billing
 * engine computes them:
 *   subtotal → item/offer discounts → bill discount → service charge → tax → VIP shortfall → rounding
 * Every non-zero component is shown, so the grand total can always be reconciled by eye.
 */
export function BillSummary({ bill, className, compact }: { bill: Bill; className?: string; compact?: boolean }) {
  const paid = bill.paidAmount > 0;
  const progress = bill.grandTotal > 0 ? Math.min(100, Math.round((bill.paidAmount / bill.grandTotal) * 100)) : 0;
  const owed = bill.balanceDue > 0.005;
  const partiallyPaid = paid && owed;
  /**
   * "Settled in full" is a claim about money RECEIVED, so it is only made once the server says
   * something was received — or once the bill has left OPEN with nothing left owing. A zero
   * balance on an untouched open bill means nothing is due yet, which is a different fact.
   */
  const settled = !owed && (paid || bill.status !== 'OPEN');

  return (
    <div className={cn('space-y-1.5', className)}>
      <Row label="Subtotal" value={bill.subtotal} compact={compact} />
      {bill.itemDiscountTotal > 0 && <Row label="Offer discounts" value={bill.itemDiscountTotal} negative compact={compact} />}
      {bill.orderDiscountTotal > 0 && <Row label="Bill discount" value={bill.orderDiscountTotal} negative compact={compact} />}
      {bill.serviceChargePercent > 0 && <Row label={`Service charge (${bill.serviceChargePercent}%)`} value={bill.serviceChargeAmount} compact={compact} />}
      {bill.taxLines.map((t) => <Row key={`${t.code}-${t.percent}`} label={`${t.name} ${t.percent}%`} value={t.amount} muted compact={compact} />)}
      {bill.taxLines.length === 0 && bill.taxTotal === 0 && <Row label="Tax" value={0} muted compact={compact} />}
      {/* VIP minimum-spend shortfall is non-taxable and added after tax — without it the total looks wrong. */}
      {(bill.minSpendShortfall ?? 0) > 0 && (
        <Row label="VIP minimum spend shortfall" value={bill.minSpendShortfall!} compact={compact} className="text-accent-700" />
      )}
      {bill.roundOff !== 0 && <Row label="Round off" value={bill.roundOff} muted compact={compact} />}

      {/*
        The grand total is the most important number on the screen, so it is the heaviest type
        in the panel — `text-metric` at the brightest text value. It is deliberately NOT a gold
        fill: gold marks the primary ACTION next to it, and two gold objects competing would
        make neither read as the thing to press.
      */}
      <div className="border-t border-neutral-200 pt-2.5 mt-2.5">
        <div className="flex justify-between items-baseline gap-3">
          <span className="font-semibold text-neutral-900">Grand total</span>
          <span className="text-metric tnum text-neutral-900">{money(bill.grandTotal, { decimals: true })}</span>
        </div>
      </div>

      {paid && (
        <div className="pt-2 space-y-1.5">
          <Row label="Paid" value={bill.paidAmount} negative compact={compact} />
          {partiallyPaid && (
            /*
              The shared meter, not a hand-drawn bar: it carries `role="progressbar"` with a
              spoken equivalent, and it is `static` because billing is a CALM route — the bill
              refetches on every realtime event and a width transition would make the settlement
              bar slide across the panel every time anything on the table changed.
            */
            <ProgressMeter
              static
              className="pt-0.5"
              tone="success"
              label="Proportion of this bill already settled"
              value={bill.paidAmount}
              max={bill.grandTotal}
              valueText={`${progress}% settled`}
            />
          )}
        </div>
      )}

      {/*
        BALANCE DUE IS NEVER CONDITIONAL.
        A cashier's whole job on this panel is "how much is still owed", so the line is present on
        every bill in every state — open, finalized, part-paid or clear — and is read straight off
        `bill.balanceDue` rather than being recomputed here. It sits one step below the grand total
        in weight, and carries its meaning in colour AND in its own words.
      */}
      <div className={cn(
        'flex justify-between items-baseline gap-3 font-semibold pt-1',
        owed ? 'text-danger-700' : settled ? 'text-success-700' : 'text-neutral-500',
      )}>
        <span>{settled ? 'Settled in full' : 'Balance due'}</span>
        <span className="text-xl tnum">{money(bill.balanceDue, { decimals: true })}</span>
      </div>

      {(bill.loyaltyPointsEarned ?? 0) > 0 && (
        /* Violet is VIP classification only — loyalty is emphasis, so it takes the gold rung. */
        <p className="flex items-center gap-1.5 text-caption text-primary-700 pt-1.5 border-t border-neutral-200 mt-2">
          <Star className="h-3.5 w-3.5" aria-hidden />
          {bill.loyaltyPointsEarned} loyalty points earned{bill.customerName ? ` for ${bill.customerName}` : ''}
        </p>
      )}
    </div>
  );
}
