import type { ReactNode } from 'react';
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

/** The station tile. Colour is never alone — the row also carries a Kitchen / Bar badge in words. */
function StationTile({ it, size = 'md' }: { it: OrderItem; size?: 'sm' | 'md' }) {
  const cancelled = it.status === 'CANCELLED';
  const bar = it.prepLocation === 'BAR';
  return (
    <span
      className={cn(
        'rounded-sm flex items-center justify-center shrink-0',
        size === 'sm' ? 'h-7 w-7' : 'mt-0.5 h-8 w-8',
        cancelled ? 'bg-neutral-100 text-neutral-400' : bar ? 'bg-info-50 text-info-700' : 'bg-warning-50 text-warning-700',
      )}
      aria-hidden
    >
      {bar ? <Wine className="h-4 w-4" /> : <ChefHat className="h-4 w-4" />}
    </span>
  );
}

/** The line's own name, with the kitchen note and the cancellation reason it actually carries. */
function ItemName({ it }: { it: OrderItem }) {
  const cancelled = it.status === 'CANCELLED';
  return (
    <>
      <span className={cn('block font-medium text-neutral-900 min-w-0 break-words', cancelled && 'line-through text-neutral-400')}>
        {it.itemName}
      </span>
      {it.notes && (
        <span className="mt-1.5 inline-flex items-start gap-1.5 rounded-sm border border-warning-200 bg-warning-50 px-2 py-1 text-caption font-semibold uppercase tracking-wide text-warning-700">
          <StickyNote className="h-3.5 w-3.5 mt-px shrink-0" aria-hidden />
          <span className="min-w-0 break-words">{it.notes}</span>
        </span>
      )}
      {cancelled && it.cancelReason && (
        <span className="mt-1.5 flex items-start gap-1 text-caption text-danger-700">
          <XCircle className="h-3.5 w-3.5 mt-px shrink-0" aria-hidden />
          <span className="min-w-0 break-words">{it.cancelReason}</span>
        </span>
      )}
    </>
  );
}

/** Status, station and the one timestamp that matters — identical in both layouts. */
function ItemMeta({ it, showPrices }: { it: OrderItem; showPrices: boolean }) {
  const stamp = milestone(it);
  const bar = it.prepLocation === 'BAR';
  return (
    <span className="mt-2 flex flex-wrap items-center gap-2">
      <StatusBadge kind="item" status={it.status} size="sm" />
      <Badge tone="neutral" size="sm">{bar ? 'Bar' : 'Kitchen'}</Badge>
      {stamp.label && <span className="text-caption text-neutral-500" title={stamp.full}>{stamp.label}</span>}
      {/* The per-unit price rides with the meta in the card layout only; the table gives it a
          column of its own, so it is never printed twice on the same screen. */}
      {showPrices && <span className="text-caption text-neutral-500 md:hidden">{money(it.unitPrice)} each</span>}
    </span>
  );
}

/** Serve / cancel, with the same accessible names, busy state and gating they have always had. */
function ItemActions({ it, serve, cancel, busyItemId }: {
  it: OrderItem;
  serve?: (item: OrderItem) => void;
  cancel?: (item: OrderItem) => void;
  busyItemId?: number | null;
}) {
  if (!serve && !cancel) return null;
  return (
    <span className="flex items-center justify-end gap-1.5">
      {cancel && (
        <Button size="sm" variant="ghost" className="text-danger-700 min-h-touch" aria-label={`Cancel ${it.itemName}`} onClick={() => cancel(it)}>
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
  );
}

/**
 * THE ORDER'S LINES.
 *
 * The reference board draws this as a table — quantity, item, price, amount — and that is what it
 * is at `md` and above: four columns, the two money columns right-aligned and tabular, so a bill
 * can be read down its right edge. Below `md` the same lines render as the stacked cards they
 * always were, because a four-column table with a 44 px Serve button inside it is not something
 * anyone should have to scroll sideways to use on a phone. Both layouts are built from the same
 * pieces, so a line says exactly the same thing at every width.
 *
 * Lines stay grouped by batch (each batch = one KOT/BOT), every line names its station in words as
 * well as colour, and each carries its status as an icon + label badge — colour is never the only
 * signal. The action that applies to a line sits on that line.
 */
export function OrderItemsList({ order, showPrices = true, canServe, canCancel, onServe, onCancel, busyItemId }: OrderItemsListProps) {
  const batches = [...new Set(order.items.map((i) => i.batchNo))].sort((a, b) => a - b);
  const serveFor = (it: OrderItem) => (canServe && it.status === 'READY' ? onServe : undefined);
  const cancelFor = (it: OrderItem) => (canCancel && it.status !== 'CANCELLED' && it.status !== 'SERVED' ? onCancel : undefined);
  const anyAction = order.items.some((it) => serveFor(it) || cancelFor(it));
  const columns = 2 + (showPrices ? 2 : 0) + (anyAction ? 1 : 0);

  const batchLabel = (b: number): ReactNode => {
    const items = order.items.filter((i) => i.batchNo === b);
    const kitchenCount = items.filter((i) => i.prepLocation === 'KITCHEN').length;
    const barCount = items.filter((i) => i.prepLocation === 'BAR').length;
    return (
      <>
        Batch {b} · {fmtTime(items[0]?.addedAt)} · {items.length} line{items.length === 1 ? '' : 's'}
        {kitchenCount > 0 && barCount > 0 ? ` (${kitchenCount} kitchen, ${barCount} bar)` : ''}
      </>
    );
  };

  return (
    <>
      {/* ---------- Phone: the stacked lines, unchanged in behaviour ---------- */}
      <div className="md:hidden space-y-4">
        {batches.map((b) => {
          const items = order.items.filter((i) => i.batchNo === b);
          return (
            <section key={b} aria-label={`Batch ${b}`}>
              {batches.length > 1 && <p className="text-label text-neutral-500 uppercase mb-1.5">{batchLabel(b)}</p>}
              <ul className="divide-y divide-neutral-200 rounded-md border border-neutral-200 bg-surface-raised overflow-hidden">
                {items.map((it) => {
                  const cancelled = it.status === 'CANCELLED';
                  const serve = serveFor(it);
                  const cancel = cancelFor(it);
                  return (
                    /* `neutral-50` is the darkest rung, so a cancelled line sinks below the list
                        surface instead of lighting up. */
                    <li key={it.id} className={cn('p-3 flex gap-3', cancelled && 'bg-neutral-50')}>
                      <StationTile it={it} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="flex items-baseline gap-2 min-w-0">
                            <span className={cn(
                              'shrink-0 rounded-sm px-1.5 py-0.5 text-sm font-semibold tabular-nums',
                              cancelled ? 'bg-neutral-100 text-neutral-400' : 'bg-neutral-100 text-neutral-800',
                            )}>
                              {it.quantity}×
                            </span>
                            <span className="min-w-0"><ItemName it={it} /></span>
                          </p>
                          {showPrices && (
                            <p className={cn('tnum font-medium shrink-0 text-neutral-900', cancelled && 'line-through text-neutral-400')}>{money(it.lineTotal)}</p>
                          )}
                        </div>
                        <ItemMeta it={it} showPrices={showPrices} />
                        {(serve || cancel) && (
                          <div className="mt-2">
                            <ItemActions it={it} serve={serve} cancel={cancel} busyItemId={busyItemId} />
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      {/* ---------- Tablet and up: the reference's items table ---------- */}
      {/* `.table-scroll` keeps any overflow inside this box, so the page itself never scrolls
          sideways however long an item name is. */}
      <div className="hidden md:block table-scroll rounded-md border border-neutral-200 bg-surface-raised overflow-hidden">
        <table className="table-base">
          <caption className="sr-only">
            Every line on this order: quantity, item, unit price and line amount.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="w-16">Qty</th>
              <th scope="col">Item</th>
              {showPrices && <th scope="col" className="text-right w-28">Price</th>}
              {showPrices && <th scope="col" className="text-right w-28">Amount</th>}
              {anyAction && <th scope="col" className="text-right w-48"><span className="sr-only">Line actions</span></th>}
            </tr>
          </thead>
          {batches.map((b) => {
            const items = order.items.filter((i) => i.batchNo === b);
            return (
              <tbody key={b}>
                {batches.length > 1 && (
                  <tr>
                    <th scope="colgroup" colSpan={columns} className="text-left">{batchLabel(b)}</th>
                  </tr>
                )}
                {items.map((it) => {
                  const cancelled = it.status === 'CANCELLED';
                  const serve = serveFor(it);
                  const cancel = cancelFor(it);
                  return (
                    <tr key={it.id} className={cn(cancelled && 'bg-neutral-50')}>
                      <td className="align-top">
                        <span className={cn(
                          'inline-block rounded-sm px-1.5 py-0.5 text-sm font-semibold tabular-nums',
                          cancelled ? 'bg-neutral-100 text-neutral-400' : 'bg-neutral-100 text-neutral-800',
                        )}>
                          {it.quantity}×
                        </span>
                      </td>
                      <td className="align-top">
                        <span className="flex gap-2.5 min-w-0">
                          <StationTile it={it} size="sm" />
                          <span className="min-w-0">
                            <ItemName it={it} />
                            <ItemMeta it={it} showPrices={showPrices} />
                          </span>
                        </span>
                      </td>
                      {showPrices && (
                        <td className={cn('align-top text-right tnum text-neutral-700', cancelled && 'text-neutral-400')}>{money(it.unitPrice)}</td>
                      )}
                      {showPrices && (
                        <td className={cn('align-top text-right tnum font-semibold text-neutral-900', cancelled && 'line-through text-neutral-400')}>{money(it.lineTotal)}</td>
                      )}
                      {anyAction && (
                        <td className="align-top text-right">
                          <ItemActions it={it} serve={serve} cancel={cancel} busyItemId={busyItemId} />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            );
          })}
        </table>
      </div>
    </>
  );
}
