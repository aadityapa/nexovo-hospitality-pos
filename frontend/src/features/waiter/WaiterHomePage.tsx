import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutGrid, Bell, Receipt, ClipboardList, Plus, ChevronRight, CheckCircle2, Send } from 'lucide-react';
import { useTables } from '@/features/tables/hooks';
import { useOrders } from '@/features/orders/hooks';
import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useRealtime';
import { StatCard, Button, Card, StatusBadge, LoadingState, ErrorState, EmptyState } from '@/components/ui';
import { money } from '@/utils/money';
import { fmtRelative, elapsedMinutes } from '@/utils/date';
import { format } from 'date-fns';

/**
 * Waiter home is opened mid-service, one-handed, on a 390 px phone.
 *
 * Two things therefore drive the layout:
 *   1. Nothing may truncate a metric to "T…" — a waiter cannot act on a number they
 *      cannot name. The metric grid is ONE column below the `xs` (420 px) breakpoint so
 *      `StatCard` renders its full-width row variant: label left (free to wrap), figure right.
 *   2. The operational lists (what is ready, what is still open, what has not been sent)
 *      must be reachable without scrolling. The greeting is a single compact line, the
 *      primary action sits on that same line, and the "nothing ready" case collapses to one
 *      quiet sentence instead of a 180 px empty state.
 */

function greeting(d: Date) { const h = d.getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }

export default function WaiterHomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const now = useNow(30_000);
  const tables = useTables();
  const orders = useOrders({ active: true });
  const floor = tables.data ?? [];
  const active = useMemo(() => orders.data ?? [], [orders.data]);
  const billReq = active.filter((o) => o.status === 'BILL_REQUESTED');
  /** DRAFT = never sent to kitchen/bar (the "Send to kitchen/bar" action on the order screen). */
  const unsent = active.filter((o) => o.status === 'DRAFT');
  const occupied = floor.filter((t) => t.status !== 'AVAILABLE');

  /**
   * The pass queue: every order carrying at least one READY item, oldest plate first.
   * `since` is the READY timestamp already on the item — no invented ageing.
   */
  const readyRows = useMemo(() => active
    .map((o) => {
      const items = o.items.filter((i) => i.status === 'READY');
      const since = items.reduce<string | null>((a, i) => (i.readyAt && (!a || i.readyAt < a) ? i.readyAt : a), null);
      return { order: o, items, since };
    })
    .filter((r) => r.items.length > 0)
    .sort((a, b) => (a.since ?? '').localeCompare(b.since ?? '')), [active]);

  const readyItemCount = readyRows.reduce((a, r) => a + r.items.length, 0);

  /** Unsent orders float to the top of the six-row preview — they are the ones losing time. */
  const openRows = useMemo(
    () => [...active].sort((a, b) => Number(b.status === 'DRAFT') - Number(a.status === 'DRAFT') || a.createdAt.localeCompare(b.createdAt)),
    [active],
  );

  const loading = tables.isLoading || orders.isLoading;

  return (
    <div className="max-w-5xl mx-auto">
      {/* One compact row: who you are, what day it is, and the single action a waiter starts from. */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h1 className="text-subheading sm:text-display text-neutral-900 leading-tight truncate">
            {greeting(now)}, {user?.fullName.split(' ')[0]}
          </h1>
          <p className="text-caption sm:text-sm text-neutral-500 mt-0.5">{format(now, 'EEE d MMMM')}</p>
        </div>
        <Button size="pos" className="shrink-0" leftIcon={<Plus className="h-5 w-5" />} onClick={() => navigate('/waiter/tables')}>New order</Button>
      </div>

      {(tables.isError || orders.isError) && (
        <ErrorState error={tables.error ?? orders.error} onRetry={() => { void tables.refetch(); void orders.refetch(); }} compact />
      )}

      {loading ? <LoadingState rows={3} className="mb-4" /> : (
        /* One column below 420 px: StatCard's row variant needs the full width to keep every label whole. */
        <div className="grid grid-cols-1 xs:grid-cols-3 gap-3 mb-4">
          <StatCard
            label="Tables in service"
            value={occupied.length}
            icon={<LayoutGrid className="h-5 w-5" />}
            tone="primary"
            hint={`of ${floor.length} on the floor`}
            onClick={() => navigate('/waiter/tables')}
          />
          <StatCard
            label="Ready to serve"
            value={readyRows.length}
            icon={<Bell className="h-5 w-5" />}
            tone={readyRows.length ? 'success' : 'neutral'}
            hint={readyItemCount ? `${readyItemCount} item${readyItemCount === 1 ? '' : 's'} on the pass` : undefined}
            onClick={() => navigate('/waiter/ready')}
          />
          <StatCard
            label="Bill requests"
            value={billReq.length}
            icon={<Receipt className="h-5 w-5" />}
            tone={billReq.length ? 'warning' : 'neutral'}
            hint={billReq.length ? 'guests waiting to settle' : undefined}
            onClick={() => navigate('/waiter/orders')}
          />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card padded={false} className="min-w-0">
          <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between gap-2">
            <h2 className="text-subheading flex items-center gap-2 min-w-0">
              <Bell className="h-4 w-4 text-success-600 shrink-0" aria-hidden />
              <span className="truncate">Ready to serve</span>
            </h2>
            <Button size="sm" variant="ghost" className="min-h-touch shrink-0" onClick={() => navigate('/waiter/ready')}>All</Button>
          </div>
          {orders.isLoading ? <div className="p-4"><LoadingState rows={2} /></div> : readyRows.length === 0 ? (
            /* Deliberately a single line, not a tall empty state: this card is a live queue and
               an empty queue must not push the open orders below the fold. */
            <p className="px-4 py-3.5 text-sm text-neutral-500 flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-success-600 shrink-0 mt-0.5" aria-hidden />
              <span>Nothing on the pass. Items appear here the moment the kitchen or bar marks them ready.</span>
            </p>
          ) : (
            <ul className="divide-y divide-neutral-100">{readyRows.slice(0, 6).map(({ order: o, items, since }) => (
              <li key={o.id}>
                <button type="button" onClick={() => navigate(`/waiter/orders/${o.id}`)} className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-neutral-50 min-h-touch">
                  <span className="text-base sm:text-lg font-bold w-20 sm:w-24 shrink-0 truncate">{o.tableName}</span>
                  <span className="flex-1 min-w-0 text-sm">
                    <span className="block line-clamp-2">{items.map((i) => `${i.itemName} ×${i.quantity}`).join(', ')}</span>
                    <span className="block text-caption text-neutral-500 tabular-nums">
                      {o.orderNumber} · {items.length} ready{since ? ` · waiting ${elapsedMinutes(since, now)} min` : ''}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-neutral-400 shrink-0 mt-1" aria-hidden />
                </button>
              </li>))}</ul>
          )}
        </Card>

        <Card padded={false} className="min-w-0">
          <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between gap-2">
            <h2 className="text-subheading flex items-center gap-2 min-w-0">
              <ClipboardList className="h-4 w-4 text-primary-700 shrink-0" aria-hidden />
              <span className="truncate">Open orders</span>
            </h2>
            <Button size="sm" variant="ghost" className="min-h-touch shrink-0" onClick={() => navigate('/waiter/orders')}>All</Button>
          </div>
          {unsent.length > 0 && (
            <p className="px-4 py-2.5 border-b border-neutral-100 bg-warning-50 text-sm text-warning-700 flex items-start gap-2">
              <Send className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
              <span>{unsent.length} order{unsent.length === 1 ? '' : 's'} still to send to kitchen/bar — listed first below.</span>
            </p>
          )}
          {orders.isLoading ? <div className="p-4"><LoadingState rows={3} /></div> : openRows.length === 0 ? (
            <EmptyState compact title="No open orders" description="Pick a table to start one." action={<Button onClick={() => navigate('/waiter/tables')}>Select table</Button>} />
          ) : (
            <ul className="divide-y divide-neutral-100">{openRows.slice(0, 6).map((o) => (
              <li key={o.id}>
                <button type="button" onClick={() => navigate(`/waiter/orders/${o.id}`)} className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-neutral-50 min-h-touch">
                  <span className="text-base sm:text-lg font-bold w-20 sm:w-24 shrink-0 truncate">{o.tableName}</span>
                  <span className="flex-1 min-w-0">
                    <StatusBadge kind="order" status={o.status} size="sm" />
                    <span className="block text-caption text-neutral-500 mt-0.5 tabular-nums">
                      {o.itemCount} item{o.itemCount === 1 ? '' : 's'} · {fmtRelative(o.createdAt)} · {elapsedMinutes(o.createdAt, now)} min
                      {o.status === 'DRAFT' ? ' · not sent yet' : ''}
                    </span>
                  </span>
                  <span className="font-semibold tabular-nums shrink-0">{money(o.subtotal)}</span>
                </button>
              </li>))}</ul>
          )}
        </Card>
      </div>
    </div>
  );
}
