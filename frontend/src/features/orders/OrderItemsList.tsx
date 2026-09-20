import { ChefHat, Wine, XCircle, Check } from 'lucide-react';
import { cn } from '@/utils/cn';
import { money } from '@/utils/money';
import { fmtTime } from '@/utils/date';
import { StatusBadge, Button } from '@/components/ui';
import type { Order, OrderItem } from '@/types';

export interface OrderItemsListProps {
  order: Order;
  showPrices?: boolean;
  canServe?: boolean;
  canCancel?: boolean;
  onServe?: (item: OrderItem) => void;
  onCancel?: (item: OrderItem) => void;
  busyItemId?: number | null;
}

/** Items grouped by batch (each batch = one KOT/BOT) with per-item status and actions. */
export function OrderItemsList({ order, showPrices = true, canServe, canCancel, onServe, onCancel, busyItemId }: OrderItemsListProps) {
  const batches = [...new Set(order.items.map((i) => i.batchNo))].sort((a, b) => a - b);
  return (
    <div className="space-y-4">
      {batches.map((b) => {
        const items = order.items.filter((i) => i.batchNo === b);
        return (
          <section key={b} aria-label={`Batch ${b}`}>
            {batches.length > 1 && <p className="text-label text-neutral-500 uppercase mb-1.5">Batch {b} · {fmtTime(items[0]?.addedAt)}</p>}
            <ul className="divide-y divide-neutral-100 rounded-md border border-neutral-200 bg-white">
              {items.map((it) => {
                const cancelled = it.status === 'CANCELLED';
                return (
                  <li key={it.id} className={cn('p-3 flex gap-3', cancelled && 'bg-neutral-50')}>
                    <span className={cn('mt-0.5 h-8 w-8 rounded-sm flex items-center justify-center shrink-0', it.prepLocation === 'BAR' ? 'bg-info-50 text-info-600' : 'bg-warning-50 text-warning-600')}>{it.prepLocation === 'BAR' ? <Wine className="h-4 w-4" /> : <ChefHat className="h-4 w-4" />}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn('font-medium', cancelled && 'line-through text-neutral-400')}>{it.itemName} <span className="text-neutral-500 font-normal">× {it.quantity}</span></p>
                        {showPrices && <p className={cn('tabular-nums font-medium shrink-0', cancelled && 'line-through text-neutral-400')}>{money(it.lineTotal)}</p>}
                      </div>
                      {it.notes && <p className="text-sm text-warning-700 font-medium mt-0.5 uppercase tracking-wide">{it.notes}</p>}
                      {cancelled && it.cancelReason && <p className="text-caption text-danger-600 mt-0.5 flex items-center gap-1"><XCircle className="h-3 w-3" />{it.cancelReason}</p>}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <StatusBadge kind="item" status={it.status} size="sm" />
                        {showPrices && <span className="text-caption text-neutral-500">{money(it.unitPrice)} each</span>}
                        {it.readyAt && !it.servedAt && <span className="text-caption text-neutral-500">ready {fmtTime(it.readyAt)}</span>}
                        {it.servedAt && <span className="text-caption text-neutral-500">served {fmtTime(it.servedAt)}</span>}
                        <span className="flex-1" />
                        {canServe && it.status === 'READY' && onServe && <Button size="sm" variant="success" leftIcon={<Check className="h-4 w-4" />} loading={busyItemId === it.id} onClick={() => onServe(it)}>Served</Button>}
                        {canCancel && !cancelled && it.status !== 'SERVED' && onCancel && <Button size="sm" variant="ghost" className="text-danger-700" onClick={() => onCancel(it)}>Cancel</Button>}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
