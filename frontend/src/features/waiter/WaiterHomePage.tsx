import { useMemo, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutGrid, Bell, Receipt, ClipboardList, Plus, ChevronRight, CheckCircle2, Send } from 'lucide-react';
import { useTables } from '@/features/tables/hooks';
import { useOrders } from '@/features/orders/hooks';
import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useRealtime';
import { StatCard, Button, Card, CardHeader, StatusBadge, LoadingState, ErrorState, EmptyState } from '@/components/ui';
import { EmptyPlate } from '@/components/graphics';
import { DashboardHero } from '@/components/layout/DashboardHero';
import { staggerDelay } from '@/components/motion';
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
 *
 * MOTION. `expressive`, but the most restrained reading of it on the product: three tiles arrive
 * in sequence and the two queue PANELS rise once. Not one row inside either queue animates. This
 * screen is opened to find out which plate is going out next, and a waiter who has to wait for a
 * list to finish arriving has been made slower by decoration. Every entrance is one-shot and holds
 * its end state, and nothing on the page gates a tap: the "New order" button, the queue rows and
 * the "All" links are live on first paint.
 */

function greeting(d: Date) { const h = d.getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }

/** The `--d` beat of a staged reveal — a function of position, never of the figure on the tile. */
const beat = (i: number) => ({ '--d': `${staggerDelay(i)}ms` }) as CSSProperties;

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
      {/*
        The COMPACT hero: the same band every dashboard in the product wears, at the scale a live
        queue can afford. It carries the venue and branch, the greeting, the date and the single
        action a waiter starts from — all on one row — so the ready-to-serve queue still clears the
        fold on a 390 px phone.
      */}
      <DashboardHero
        compact
        title={`${greeting(now)}, ${user?.fullName.split(' ')[0] ?? ''}`}
        subtitle={format(now, 'EEE d MMMM')}
        actions={<Button size="pos" className="shrink-0" leftIcon={<Plus className="h-5 w-5" />} onClick={() => navigate('/waiter/tables')}>New order</Button>}
      />

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
            className="anim-reveal"
            style={beat(0)}
          />
          <StatCard
            label="Ready to serve"
            value={readyRows.length}
            icon={<Bell className="h-5 w-5" />}
            tone={readyRows.length ? 'success' : 'neutral'}
            hint={readyItemCount ? `${readyItemCount} item${readyItemCount === 1 ? '' : 's'} on the pass` : undefined}
            onClick={() => navigate('/waiter/ready')}
            className="anim-reveal"
            style={beat(1)}
          />
          <StatCard
            label="Bill requests"
            value={billReq.length}
            icon={<Receipt className="h-5 w-5" />}
            tone={billReq.length ? 'warning' : 'neutral'}
            hint={billReq.length ? 'guests waiting to settle' : undefined}
            onClick={() => navigate('/waiter/orders')}
            className="anim-reveal"
            style={beat(2)}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* The queue PANELS rise once, in sequence. The rows inside do not: both lists re-render
            whenever the order feed or the 30-second clock ticks, and a pass queue that re-animates
            under a waiter's thumb is worse than one that never animated at all. */}
        <Card padded={false} className="min-w-0 anim-reveal" style={beat(3)}>
          {/* The product's one section-block head — the same `CardHeader` the manager's panels
              wear, at the padding a `padded={false}` card needs. */}
          <CardHeader
            className="p-4 pb-3 mb-0 border-b border-neutral-200"
            title={<span className="flex items-center gap-2 min-w-0"><Bell className="h-4 w-4 text-success-500 shrink-0" aria-hidden /><span className="truncate">Ready to serve</span></span>}
            subtitle={readyRows.length > 0 ? `oldest plate first · ${readyItemCount} item${readyItemCount === 1 ? '' : 's'} on the pass` : undefined}
            action={<Button size="sm" variant="ghost" className="min-h-touch shrink-0" onClick={() => navigate('/waiter/ready')}>All</Button>}
          />
          {orders.isLoading ? <div className="p-4"><LoadingState rows={2} /></div> : readyRows.length === 0 ? (
            /* Deliberately a single line, not a tall empty state: this card is a live queue and
               an empty queue must not push the open orders below the fold. */
            <p className="px-4 py-3.5 text-sm text-neutral-500 flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-success-500 shrink-0 mt-0.5" aria-hidden />
              <span>Nothing on the pass. Items appear here the moment the kitchen or bar marks them ready.</span>
            </p>
          ) : (
            /* `neutral-200` is the app hairline; `neutral-100` sits a single step off the card
                surface and all but disappears on a dark ground. */
            <ul className="divide-y divide-neutral-200">{readyRows.slice(0, 6).map(({ order: o, items, since }) => (
              <li key={o.id}>
                <button type="button" onClick={() => navigate(`/waiter/orders/${o.id}`)} className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors duration-control hover:bg-neutral-100 min-h-touch">
                  <span className="text-base sm:text-lg font-bold w-20 sm:w-24 shrink-0 truncate text-neutral-900">{o.tableName}</span>
                  <span className="flex-1 min-w-0 text-sm">
                    <span className="block line-clamp-2 text-neutral-800">{items.map((i) => `${i.itemName} ×${i.quantity}`).join(', ')}</span>
                    <span className="block text-caption text-neutral-500 tnum">
                      {o.orderNumber} · {items.length} ready{since ? ` · waiting ${elapsedMinutes(since, now)} min` : ''}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-neutral-400 shrink-0 mt-1" aria-hidden />
                </button>
              </li>))}</ul>
          )}
        </Card>

        <Card padded={false} className="min-w-0 anim-reveal" style={beat(4)}>
          <CardHeader
            className="p-4 pb-3 mb-0 border-b border-neutral-200"
            title={<span className="flex items-center gap-2 min-w-0"><ClipboardList className="h-4 w-4 text-primary-700 shrink-0" aria-hidden /><span className="truncate">Open orders</span></span>}
            subtitle={openRows.length > 0 ? `${openRows.length} open on your floor` : undefined}
            action={<Button size="sm" variant="ghost" className="min-h-touch shrink-0" onClick={() => navigate('/waiter/orders')}>All</Button>}
          />
          {unsent.length > 0 && (
            <p className="px-4 py-2.5 border-b border-neutral-200 bg-warning-50 text-sm text-warning-700 flex items-start gap-2">
              <Send className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
              <span>{unsent.length} order{unsent.length === 1 ? '' : 's'} still to send to kitchen/bar — listed first below.</span>
            </p>
          )}
          {orders.isLoading ? <div className="p-4"><LoadingState rows={3} /></div> : openRows.length === 0 ? (
            <EmptyState compact icon={<EmptyPlate />} title="No open orders" description="Pick a table to start one." action={<Button onClick={() => navigate('/waiter/tables')}>Select table</Button>} />
          ) : (
            <ul className="divide-y divide-neutral-200">{openRows.slice(0, 6).map((o) => (
              <li key={o.id}>
                <button type="button" onClick={() => navigate(`/waiter/orders/${o.id}`)} className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors duration-control hover:bg-neutral-100 min-h-touch">
                  <span className="text-base sm:text-lg font-bold w-20 sm:w-24 shrink-0 truncate text-neutral-900">{o.tableName}</span>
                  <span className="flex-1 min-w-0">
                    <StatusBadge kind="order" status={o.status} size="sm" />
                    <span className="block text-caption text-neutral-500 mt-0.5 tnum">
                      {o.itemCount} item{o.itemCount === 1 ? '' : 's'} · {fmtRelative(o.createdAt)} · {elapsedMinutes(o.createdAt, now)} min
                      {o.status === 'DRAFT' ? ' · not sent yet' : ''}
                    </span>
                  </span>
                  <span className="font-semibold tnum text-neutral-900 shrink-0">{money(o.subtotal)}</span>
                </button>
              </li>))}</ul>
          )}
        </Card>
      </div>
    </div>
  );
}
