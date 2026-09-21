import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, ChefHat, Wine, Clock, ChevronRight } from 'lucide-react';
import { useOrders, useOrderMutations } from '@/features/orders/hooks';
import { useNow } from '@/hooks/useRealtime';
import { PageHeader, Button, Card, CardHeader, LoadingState, ErrorState, EmptyState, SegmentedControl, Badge } from '@/components/ui';
import { EmptyPlate } from '@/components/graphics';
import { elapsedClock, elapsedMinutes } from '@/utils/date';
import { DELAY_THRESHOLDS } from '@/config/statuses';
import { cn } from '@/utils/cn';
import type { Order, OrderItem } from '@/types';

type Station = 'ALL' | 'KITCHEN' | 'BAR';

interface QueueRow { o: Order; it: OrderItem; since: string; mins: number }

const waitTone = (mins: number) =>
  mins >= DELAY_THRESHOLDS.late
    ? { text: 'text-danger-700', edge: 'border-l-danger-500', label: 'Going cold' }
    : mins >= DELAY_THRESHOLDS.warn
      ? { text: 'text-warning-700', edge: 'border-l-warning-500', label: 'Waiting' }
      : { text: 'text-success-700', edge: 'border-l-success-500', label: 'Just up' };

/**
 * Everything READY across the waiter's tables, as one queue rather than a per-table list:
 * the plate that has been standing longest is always the first row on screen, whichever
 * table it belongs to. One action per row, sized for a thumb on the move.
 */
export default function ReadyItemsPage() {
  const navigate = useNavigate();
  const q = useOrders({ active: true });
  const m = useOrderMutations();
  const now = useNow(1000);
  const [station, setStation] = useState<Station>('ALL');

  const all = useMemo<QueueRow[]>(() => {
    const rows: QueueRow[] = [];
    for (const o of q.data ?? []) {
      for (const it of o.items) {
        if (it.status !== 'READY') continue;
        const since = it.readyAt ?? it.addedAt;
        rows.push({ o, it, since, mins: elapsedMinutes(since, now) });
      }
    }
    // Longest wait first — this is the whole point of the screen.
    return rows.sort((a, b) => a.since.localeCompare(b.since));
  }, [q.data, now]);

  const rows = station === 'ALL' ? all : all.filter((r) => r.it.prepLocation === station);
  const stationCount = (s: Station) => (s === 'ALL' ? all.length : all.filter((r) => r.it.prepLocation === s).length);
  const oldest = rows[0];

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader
        title="Ready to serve"
        subtitle="Marked ready by the kitchen and bar. Longest wait at the top."
      >
        {all.length > 0 && (
          /* Three stations is a switch, not a facet list, so it stays a segmented control —
             counted, because "Bar 0" is the fastest way to know the drinks are all away. */
          <SegmentedControl
            ariaLabel="Filter the queue by station"
            value={station}
            onChange={setStation}
            options={[
              { value: 'ALL', label: 'All', count: stationCount('ALL') },
              { value: 'KITCHEN', label: 'Kitchen', count: stationCount('KITCHEN') },
              { value: 'BAR', label: 'Bar', count: stationCount('BAR') },
            ]}
          />
        )}
      </PageHeader>

      {q.isLoading && <LoadingState rows={4} />}
      {q.isError && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}

      {q.data && (rows.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            icon={<EmptyPlate />}
            title={all.length === 0 ? 'Nothing waiting to be served' : `Nothing ready at the ${station === 'BAR' ? 'bar' : 'kitchen'}`}
            description={all.length === 0
              ? 'Items appear here the moment the kitchen or bar marks them ready.'
              : `${all.length} item${all.length === 1 ? ' is' : 's are'} ready at the other station.`}
            action={all.length === 0
              ? <Button variant="outline" onClick={() => navigate('/waiter/orders')}>Go to my orders</Button>
              : <Button variant="outline" onClick={() => setStation('ALL')}>Show all stations</Button>}
          />
        </Card>
      ) : (
        /*
          THE PASS, AS ONE BOARD. A single card with hairline separators rather than a stack of
          cards: the queue is read top-down under a thumb, and the separator is enough to part two
          plates. Each row keeps its own left edge in the waiting tone, so "going cold" is still
          the first thing the eye lands on.
        */
        <Card padded={false}>
          <CardHeader
            className="p-4 pb-3 mb-0 border-b border-neutral-200"
            title={<span className="flex items-center gap-2"><Bell className="h-4 w-4 text-success-500 shrink-0" aria-hidden />On the pass</span>}
            subtitle={oldest ? (
              <span className="inline-flex items-center gap-1.5 flex-wrap" aria-live="polite">
                <Clock className="h-3.5 w-3.5 text-neutral-400 shrink-0" aria-hidden />
                <span className="tabular-nums">{rows.length} item{rows.length === 1 ? '' : 's'}</span>
                <span className="text-neutral-400" aria-hidden>·</span>
                <span className={cn('font-medium tabular-nums', waitTone(oldest.mins).text)}>oldest {elapsedClock(oldest.since, now)}</span>
              </span>
            ) : undefined}
          />
          <ul className="divide-y divide-neutral-200">
          {rows.map(({ o, it, since, mins }) => {
            const tone = waitTone(mins);
            const bar = it.prepLocation === 'BAR';
            return (
              <li
                key={it.id}
                className={cn('border-l-4 p-3 sm:p-4 flex flex-wrap items-center gap-3', tone.edge)}
              >
                <span
                  /* Same construction as the shared Badge: `-50` fill, `-700` glyph — the rung
                     that stays legible on its own tint. */
                  className={cn('h-11 w-11 rounded-md flex items-center justify-center shrink-0 ring-1 ring-inset', bar ? 'bg-info-50 text-info-700 ring-info-200' : 'bg-warning-50 text-warning-700 ring-warning-200')}
                  aria-hidden
                >
                  {bar ? <Wine className="h-5 w-5" /> : <ChefHat className="h-5 w-5" />}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-semibold leading-tight text-neutral-900">
                    <span className="tabular-nums">{it.quantity}×</span> {it.itemName}
                  </span>
                  {it.notes && (
                    <span className="mt-1 inline-block rounded-sm border border-warning-200 bg-warning-50 px-2 py-0.5 text-caption font-semibold uppercase tracking-wide text-warning-700">
                      {it.notes}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => navigate(`/waiter/orders/${o.id}`)}
                    className="mt-1 flex items-center gap-1 text-caption text-neutral-500 hover:text-neutral-800 hover:underline underline-offset-2 min-h-touch -my-2 py-2"
                  >
                    <span className="font-semibold text-neutral-700">{o.tableName}</span>
                    <span aria-hidden>·</span>
                    <span className="truncate">{o.floorName} · {o.orderNumber}</span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  </button>
                </span>

                <span className="shrink-0 text-right">
                  <output className={cn('block text-kds tabular-nums font-semibold leading-none', tone.text)}>
                    {elapsedClock(since, now)}
                  </output>
                  <Badge tone={mins >= DELAY_THRESHOLDS.late ? 'danger' : mins >= DELAY_THRESHOLDS.warn ? 'warning' : 'success'} size="sm" className="mt-1">
                    {tone.label}
                  </Badge>
                </span>

                <Button
                  variant="success"
                  size="pos"
                  className="w-full sm:w-auto"
                  leftIcon={<Check className="h-5 w-5" />}
                  aria-label={`Mark ${it.quantity} ${it.itemName} on ${o.tableName} as served`}
                  loading={m.setItemStatus.isPending && m.setItemStatus.variables?.itemId === it.id}
                  onClick={() => m.setItemStatus.mutate({ id: o.id, itemId: it.id, status: 'SERVED' })}
                >
                  Served
                </Button>
              </li>
            );
          })}
          </ul>
        </Card>
      ))}
    </div>
  );
}
