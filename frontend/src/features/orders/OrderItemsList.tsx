import { ChefHat, Wine, XCircle, Check, StickyNote } from 'lucide-react';
import { cn } from '@/utils/cn';
import { money } from '@/utils/money';
import { fmtTime } from '@/utils/date';
import { StatusBadge, Button, Badge } from '@/components/ui';
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

/** The most recent thing that happened to this line, so the row carries one clear timestamp. */
function milestone(it: OrderItem): { label: string; full: string } {
  const stamps: [string, string | null | undefined][] = [
    ['added', it.addedAt], ['started', it.startedAt], ['ready', it.readyAt], ['served', it.servedAt], ['cancelled', it.cancelledAt],
  ];
  const present = stamps.filter(([, v]) => !!v) as [string, string][];
  const latest = present[present.length - 1];
  return {
    label: latest ? `${latest[0]} ${fmtTime(latest[1])}` : '',
    full: present.map(([k, v]) => `${k} ${fmtTime(v)}`).join(' · '),
  };
}

/**
 * Items grouped by batch (each batch = one KOT/BOT) with per-item status and actions.
 *
 * Every line leads with its quantity, names its station in words as well as colour, and
 * carries its status as an icon + label badge — colour is never the only signal. The action
 * that applies to a line sits on that line, so nothing has to be hunted for.
 */
export function OrderItemsList({ order, showPrices = true, canServe, canCancel, onServe, onCancel, busyItemId }: OrderItemsListProps) {
  const batches = [...new Set(order.items.map((i) => i.batchNo))].sort((a, b) => a - b);
  return (
    <div className="space-y-4">
      {batches.map((b) => {
        const items = order.items.filter((i) => i.batchNo === b);
        const kitchenCount = items.filter((i) => i.prepLocation === 'KITCHEN').length;
        const barCount = items.filter((i) => i.prepLocation === 'BAR').length;
        return (
          <section key={b} aria-label={`Batch ${b}`}>
            {batches.length > 1 && (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1.5">
                <p className="text-label text-neutral-500 uppercase">
                  Batch {b} · {fmtTime(items[0]?.addedAt)}
                </p>
                <span className="text-caption text-neutral-400" aria-hidden>·</span>
                <p className="text-caption text-neutral-500">
                  {items.length} line{items.length === 1 ? '' : 's'}
                  {kitchenCount > 0 && barCount > 0 ? ` (${kitchenCount} kitchen, ${barCount} bar)` : ''}
                </p>
              </div>
            )}
            <ul className="divide-y divide-neutral-100 rounded-md border border-neutral-200 bg-white overflow-hidden">
              {items.map((it) => {
                const cancelled = it.status === 'CANCELLED';
                const bar = it.prepLocation === 'BAR';
                const stamp = milestone(it);
                const serve = canServe && it.status === 'READY' ? onServe : undefined;
                const cancel = canCancel && !cancelled && it.status !== 'SERVED' ? onCancel : undefined;
                return (
                  <li key={it.id} className={cn('p-3 flex gap-3', cancelled && 'bg-neutral-50')}>
                    <span
                      className={cn(
                        'mt-0.5 h-8 w-8 rounded-sm flex items-center justify-center shrink-0',
                        cancelled ? 'bg-neutral-100 text-neutral-400' : bar ? 'bg-info-50 text-info-600' : 'bg-warning-50 text-warning-700',
                      )}
                      aria-hidden
                    >
                      {bar ? <Wine className="h-4 w-4" /> : <ChefHat className="h-4 w-4" />}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="flex items-baseline gap-2 min-w-0">
                          <span className={cn(
                            'shrink-0 rounded-sm px-1.5 py-0.5 text-sm font-semibold tabular-nums',
                            cancelled ? 'bg-neutral-100 text-neutral-400' : 'bg-neutral-100 text-neutral-800',
                          )}>
                            {it.quantity}×
                          </span>
                          <span className={cn('font-medium text-neutral-900 min-w-0 break-words', cancelled && 'line-through text-neutral-400')}>
                            {it.itemName}
                          </span>
                        </p>
                        {showPrices && (
                          <p className={cn('tabular-nums font-medium shrink-0', cancelled && 'line-through text-neutral-400')}>{money(it.lineTotal)}</p>
                        )}
                      </div>

                      {it.notes && (
                        <p className="mt-1.5 inline-flex items-start gap-1.5 rounded-sm border border-warning-200 bg-warning-50 px-2 py-1 text-caption font-semibold uppercase tracking-wide text-warning-700">
                          <StickyNote className="h-3.5 w-3.5 mt-px shrink-0" aria-hidden />
                          <span className="min-w-0 break-words">{it.notes}</span>
                        </p>
                      )}

                      {cancelled && it.cancelReason && (
                        <p className="mt-1.5 flex items-start gap-1 text-caption text-danger-700">
                          <XCircle className="h-3.5 w-3.5 mt-px shrink-0" aria-hidden />
                          <span className="min-w-0 break-words">{it.cancelReason}</span>
                        </p>
                      )}

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <StatusBadge kind="item" status={it.status} size="sm" />
                        <Badge tone="neutral" size="sm">{bar ? 'Bar' : 'Kitchen'}</Badge>
                        {stamp.label && (
                          <span className="text-caption text-neutral-500" title={stamp.full}>{stamp.label}</span>
                        )}
                        {showPrices && <span className="text-caption text-neutral-500">{money(it.unitPrice)} each</span>}

                        {(serve || cancel) && (
                          <span className="ml-auto flex items-center gap-1.5">
                            {cancel && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-danger-700 min-h-touch"
                                aria-label={`Cancel ${it.itemName}`}
                                onClick={() => cancel(it)}
                              >
                                Cancel
                              </Button>
                            )}
                            {serve && (
                              <Button
                                size="sm"
                                variant="success"
                                className="min-h-touch px-4"
                                leftIcon={<Check className="h-4 w-4" />}
                                aria-label={`Mark ${it.quantity} ${it.itemName} as served`}
                                loading={busyItemId === it.id}
                                onClick={() => serve(it)}
                              >
                                Served
                              </Button>
                            )}
                          </span>
                        )}
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
