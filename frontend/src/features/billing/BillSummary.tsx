import { Star } from 'lucide-react';
import { cn } from '@/utils/cn';
import { money } from '@/utils/money';
import type { Bill } from '@/types';

function Row({ label, value, muted, negative, compact, className }: {
  label: string; value: number; muted?: boolean; negative?: boolean; compact?: boolean; className?: string;
}) {
  return (
    <div className={cn('flex justify-between items-baseline gap-3', compact ? 'text-sm' : 'text-[0.9375rem]', muted && 'text-neutral-500', className)}>
      <span className="min-w-0">{label}</span>
      <span className={cn('tabular-nums shrink-0', negative && 'text-success-700')}>
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
  const partiallyPaid = paid && bill.balanceDue > 0.005;

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

      <div className="border-t border-neutral-200 pt-2.5 mt-2.5">
        <div className="flex justify-between items-baseline gap-3">
          <span className="font-semibold text-neutral-900">Grand total</span>
          <span className="text-metric tabular-nums text-neutral-900">{money(bill.grandTotal, { decimals: true })}</span>
        </div>
      </div>

      {paid && (
        <div className="pt-2 space-y-1.5">
          <Row label="Paid" value={bill.paidAmount} negative compact={compact} />
          {partiallyPaid && (
            <div className="pt-0.5" aria-hidden>
              <div className="h-1.5 rounded-full bg-neutral-100 overflow-hidden">
                <div className="h-full rounded-full bg-success-500 transition-[width]" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-caption text-neutral-500 mt-1 tabular-nums">{progress}% settled</p>
            </div>
          )}
        </div>
      )}

      {(paid || bill.status !== 'OPEN') && (
        <div className={cn(
          'flex justify-between items-baseline gap-3 font-semibold pt-1',
          bill.balanceDue > 0.005 ? 'text-danger-700' : 'text-success-700',
        )}>
          <span>{bill.balanceDue > 0.005 ? 'Balance due' : 'Settled in full'}</span>
          <span className="text-lg tabular-nums">{money(bill.balanceDue, { decimals: true })}</span>
        </div>
      )}

      {(bill.loyaltyPointsEarned ?? 0) > 0 && (
        <p className="flex items-center gap-1.5 text-caption text-accent-700 pt-1.5 border-t border-neutral-100 mt-2">
          <Star className="h-3.5 w-3.5" aria-hidden />
          {bill.loyaltyPointsEarned} loyalty points earned{bill.customerName ? ` for ${bill.customerName}` : ''}
        </p>
      )}
    </div>
  );
}
