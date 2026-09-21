import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ChefHat, Wine, Receipt, Clock, Bell, X, Check, ChevronRight } from 'lucide-react';
import { useOrders, useOrderMutations } from '@/features/orders/hooks';
import { useFloors, useTables, useWaiters } from '@/features/tables/hooks';
import { usePermission } from '@/hooks/useAuth';
import { useNow, useDebounce } from '@/hooks/useRealtime';
import { PageHeader, DataTable, StatusBadge, StatCard, LoadingState, ErrorState, SearchInput, SegmentedControl, FilterChips, FilterSelect, Badge, Button, Alert, type Column } from '@/components/ui';
import { ProgressMeter } from '@/components/graphics';
import { money } from '@/utils/money';
import { elapsedMinutes, fmtTime } from '@/utils/date';
import { DELAY_THRESHOLDS, ORDER_STATUS } from '@/config/statuses';
import { cn } from '@/utils/cn';
import type { Order, OrderStatus, PrepLocation } from '@/types';

/**
 * Manager live operations — a board, not a report.
 *
 * Every row answers "how long has this been waiting, and for what?". Escalation is carried by
 * colour **and** a word **and** an icon, so it survives a dimmed screen and colour-blindness.
 * The board is ordered by the timestamp each order has been waiting from, never by the live
 * minute count, so a 15-second refresh cannot reshuffle rows under the manager's eyes.
 *
 * MOTION: none. `/manager/live` is a `calm` route (config/motion), so the page transition is
 * already off, and nothing in this file reveals, staggers, counts up or flashes. A board that
 * re-animated every 20 seconds would be unreadable for the two seconds that matter.
 *
 * NOTHING HERE IS INVENTED. The progress meter measures items the kitchen has actually marked
 * ready or served against the items still live on the order — a count the order carries, not a
 * completion estimate. There is no "expected ready at", because the product records no such time.
 */

const PREP_STATUSES: OrderStatus[] = ['CONFIRMED', 'IN_PROGRESS', 'PARTIALLY_READY'];

/**
 * The live lifecycle, in the order the product derives it. Terminal states never reach this board
 * (it fetches `active: true`), so the chip row is exactly the set an active order can be in — the
 * same set the status filter has always offered, now with the counts visible.
 */
const LIVE_STATUSES = (Object.keys(ORDER_STATUS) as OrderStatus[]).filter((s) => !['COMPLETED', 'CANCELLED'].includes(s));

type Level = 'ok' | 'warn' | 'late';

interface Wait {
  /** immutable timestamp the wait is measured from — also the sort key */
  since: string;
  level: Level;
  label: string;
}

const LEVEL_CLS: Record<Level, string> = {
  late: 'text-danger-700',
  warn: 'text-warning-700',
  ok: 'text-neutral-600',
};

/**
 * Each station's own state on an order, derived from that station's OWN lines and nothing else.
 * `null` when the order has no lines for the station at all — the board prints an em dash there
 * rather than a zero, because "no drinks on this order" is not "no drinks made yet".
 */
interface Station { total: number; done: number; state: 'queued' | 'working' | 'done' }

function stationOf(o: Order, loc: PrepLocation): Station | null {
  const lines = o.items.filter((i) => i.prepLocation === loc && i.status !== 'CANCELLED');
  if (lines.length === 0) return null;
  const done = lines.filter((i) => i.status === 'READY' || i.status === 'SERVED').length;
  return {
    total: lines.length,
    done,
    state: done === lines.length ? 'done' : lines.some((i) => i.status === 'PREPARING') ? 'working' : 'queued',
  };
}

/** The word each station uses for "in hand" — a kitchen cooks, a bar mixes. */
const STATION_LABEL: Record<PrepLocation, Record<Station['state'], string>> = {
  KITCHEN: { queued: 'Queued', working: 'Cooking', done: 'Done' },
  BAR: { queued: 'Queued', working: 'Mixing', done: 'Done' },
};

/** Manager live operations: every active order with station status, delays and bottleneck filters. */
export default function LiveOrdersPage() {
  const navigate = useNavigate();
  const canServe = usePermission('orders:item:status');
  const m = useOrderMutations();
  const now = useNow(15_000);
  const q = useOrders({ active: true }, { refetchInterval: 20_000 });
  const floors = useFloors();
  const tables = useTables();
  const waiters = useWaiters();
  const [status, setStatus] = useState<'' | OrderStatus>('');
  const [waiter, setWaiter] = useState('');
  const [floor, setFloor] = useState('');
  const [station, setStation] = useState<'ALL' | PrepLocation | 'DELAYED' | 'BILL'>('ALL');
  const [search, setSearch] = useState('');
  const dq = useDebounce(search, 200).toLowerCase();

  const pending = (o: Order, loc: PrepLocation) => o.items.filter((i) => i.prepLocation === loc && ['NEW', 'PREPARING'].includes(i.status)).length;
  const ready = (o: Order, loc: PrepLocation) => o.items.filter((i) => i.prepLocation === loc && i.status === 'READY').length;
  const waitMins = (o: Order) => elapsedMinutes(o.confirmedAt ?? o.createdAt, now);
  const isDelayed = (o: Order) => PREP_STATUSES.includes(o.status) && waitMins(o) >= DELAY_THRESHOLDS.late;
  const billPending = (o: Order) => o.status === 'BILL_REQUESTED' && elapsedMinutes(o.billRequestedAt ?? o.createdAt, now) >= DELAY_THRESHOLDS.warn;

  /**
   * How much of the order the pass has actually finished.
   *
   * This is a COUNT, not an estimate: `done` is the items the kitchen or bar has marked READY or
   * SERVED, `total` is every item still live on the order. Cancelled lines are excluded from both,
   * so cancelling the one outstanding dish completes the meter instead of stranding it. No
   * percentage is synthesised anywhere — the bar draws these two integers and the text beside it
   * prints them.
   */
  const prepared = (o: Order) => {
    const live = o.items.filter((i) => i.status !== 'CANCELLED');
    return { done: live.filter((i) => i.status === 'READY' || i.status === 'SERVED').length, total: live.length };
  };

  /** A real, short read of what is on the order — the first two lines as the guest ordered them. */
  const itemSummary = (o: Order): string | null => {
    const live = o.items.filter((i) => i.status !== 'CANCELLED');
    if (live.length === 0) return null;
    const head = live.slice(0, 2).map((i) => `${i.quantity}× ${i.itemName}`).join(', ');
    const rest = live.length - Math.min(2, live.length);
    return rest > 0 ? `${head} +${rest} more` : head;
  };

  /**
   * What each order is waiting for, and for how long. Every input is already on the order —
   * nothing extra is fetched and no figure is invented.
   */
  const waitOf = (o: Order): Wait => {
    if (PREP_STATUSES.includes(o.status)) {
      const since = o.confirmedAt ?? o.createdAt;
      const m = elapsedMinutes(since, now);
      return m >= DELAY_THRESHOLDS.late
        ? { since, level: 'late', label: 'Delayed in prep' }
        : m >= DELAY_THRESHOLDS.warn
          ? { since, level: 'warn', label: 'Running late' }
          : { since, level: 'ok', label: 'In prep' };
    }
    if (o.status === 'READY') {
      // Oldest item that has been sitting on the pass.
      const readyAt = o.items.filter((i) => i.status === 'READY' && i.readyAt).map((i) => i.readyAt as string).sort()[0];
      const since = readyAt ?? o.confirmedAt ?? o.createdAt;
      const m = elapsedMinutes(since, now);
      return { since, level: m >= DELAY_THRESHOLDS.warn ? 'warn' : 'ok', label: 'Ready, not served' };
    }
    if (o.status === 'BILL_REQUESTED') {
      const since = o.billRequestedAt ?? o.createdAt;
      const m = elapsedMinutes(since, now);
      return { since, level: m >= DELAY_THRESHOLDS.warn ? 'late' : 'ok', label: m >= DELAY_THRESHOLDS.warn ? 'Bill waiting' : 'Bill requested' };
    }
    return { since: o.confirmedAt ?? o.createdAt, level: 'ok', label: 'Open' };
  };

  const anyFilter = !!(search.trim() || status || waiter || floor || station !== 'ALL');
  const clearFilters = () => { setSearch(''); setStatus(''); setWaiter(''); setFloor(''); setStation('ALL'); };

  const rows = useMemo(() => (q.data ?? []).filter((o) => (!status || o.status === status) && (!waiter || o.waiterId === Number(waiter)) && (!floor || tables.data?.find((t) => t.id === o.tableId)?.floorId === Number(floor))
    && (station === 'ALL' || (station === 'KITCHEN' && pending(o, 'KITCHEN') > 0) || (station === 'BAR' && pending(o, 'BAR') > 0) || (station === 'DELAYED' && (isDelayed(o) || billPending(o))) || (station === 'BILL' && ['BILL_REQUESTED', 'BILLED', 'PAID'].includes(o.status)))
    && (!dq || o.orderNumber.toLowerCase().includes(dq) || o.tableName.toLowerCase().includes(dq)))
    // Longest waiting first. The key is a fixed timestamp, so ticking the clock never reorders the board.
    .sort((a, b) => waitOf(a).since.localeCompare(waitOf(b).since) || a.id - b.id), [q.data, status, waiter, floor, station, dq, tables.data, now]); // eslint-disable-line react-hooks/exhaustive-deps

  const all = q.data ?? [];
  const kitchenBacklog = all.reduce((a, o) => a + pending(o, 'KITCHEN'), 0);
  const barBacklog = all.reduce((a, o) => a + pending(o, 'BAR'), 0);
  const delayedOrders = all.filter(isDelayed);
  const billWaiting = all.filter(billPending);
  const billReq = all.filter((o) => o.status === 'BILL_REQUESTED').length;
  /** The single oldest thing on the board — the manager's first question. */
  const oldest = useMemo(() => [...all].sort((a, b) => waitOf(a).since.localeCompare(waitOf(b).since))[0], [all, now]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Counted chips over the live lifecycle. Every count is a filter of the fetched board. */
  const statusChips = useMemo(() => ([
    { value: '' as '' | OrderStatus, label: 'All', count: all.length },
    ...LIVE_STATUSES.map((s) => ({ value: s as '' | OrderStatus, label: ORDER_STATUS[s].label, count: all.filter((o) => o.status === s).length })),
  ]), [all]);

  /** Plain render helpers, not nested components — a nested one would remount on every tick. */
  const waitLine = (o: Order) => {
    const w = waitOf(o);
    const mins = elapsedMinutes(w.since, now);
    const Icon = w.level === 'late' ? AlertTriangle : o.status === 'READY' ? Bell : Clock;
    return (
      <span className={cn('inline-flex items-center gap-1.5 text-caption font-semibold whitespace-nowrap', LEVEL_CLS[w.level])}>
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="tnum">{mins} min</span>
        <span className="font-medium">· {w.label}</span>
      </span>
    );
  };

  /**
   * The progress column: a meter over the real item counts, the real elapsed minutes beneath it.
   * An order with nothing on it yet gets no bar at all rather than an empty one implying zero of
   * something unknown.
   */
  const progressCell = (o: Order) => {
    const { done, total } = prepared(o);
    return (
      <div className="min-w-[8.5rem] space-y-1">
        {total > 0 ? (
          /* `static`: this is a CALM route that repaints every 20 seconds, and a meter that slid
             each time would be motion nobody asked for on the screen where it costs most. */
          <ProgressMeter
            static
            label={`Items ready on ${o.orderNumber}`}
            value={done}
            max={total}
            valueText={`${done}/${total} ready`}
            tone={done === total ? 'success' : done > 0 ? 'warning' : 'neutral'}
          />
        ) : (
          <span className="text-caption text-neutral-400">No items yet</span>
        )}
        {waitLine(o)}
      </div>
    );
  };

  const stationBadges = (o: Order) => {
    const k = pending(o, 'KITCHEN'), b = pending(o, 'BAR');
    const kr = ready(o, 'KITCHEN'), br = ready(o, 'BAR');
    if (!k && !b && !kr && !br) return null;
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        {k > 0 && <Badge tone="warning" size="sm" icon={<ChefHat className="h-3 w-3" aria-hidden />}>{k} kitchen</Badge>}
        {b > 0 && <Badge tone="info" size="sm" icon={<Wine className="h-3 w-3" aria-hidden />}>{b} bar</Badge>}
        {kr + br > 0 && <Badge tone="success" size="sm" icon={<Bell className="h-3 w-3" aria-hidden />}>{kr + br} on the pass</Badge>}
      </span>
    );
  };

  /**
   * One station's column. It reads that station's own lines — done, cooking or mixing, queued —
   * and prints the two integers behind the verdict. An order the station has nothing on gets an
   * em dash, never a zero.
   */
  const stationCell = (o: Order, loc: PrepLocation) => {
    const s = stationOf(o, loc);
    const station = loc === 'KITCHEN' ? 'kitchen' : 'bar';
    if (!s) {
      return (
        <span className="text-neutral-400">
          —<span className="sr-only"> no {station} items on this order</span>
        </span>
      );
    }
    const tone = s.state === 'done' ? 'success' : s.state === 'working' ? (loc === 'KITCHEN' ? 'warning' : 'info') : 'neutral';
    return (
      <span className="inline-flex flex-col items-start gap-1">
        <Badge tone={tone} size="sm" icon={loc === 'KITCHEN' ? <ChefHat className="h-3 w-3" aria-hidden /> : <Wine className="h-3 w-3" aria-hidden />}>
          {STATION_LABEL[loc][s.state]}
        </Badge>
        <span className="text-caption tnum text-neutral-500 whitespace-nowrap">{s.done}/{s.total} ready</span>
      </span>
    );
  };

  /** The items on this order the pass has finished and nobody has carried out yet. */
  const readyItems = (o: Order) => o.items.filter((i) => i.status === 'READY');

  /**
   * The next action, and only ever one: mark what is on the pass as served, or open the order.
   *
   * *Serve* is the real mutation the waiter's ready list and the order screen already use —
   * `orders:item:status`, one call per item that is actually READY — so the workspace changes
   * nothing about what a person is allowed to do. Without that permission the row offers *View*,
   * which is what it has always offered.
   */
  const serveReady = async (o: Order) => {
    for (const it of readyItems(o)) {
      await m.setItemStatus.mutateAsync({ id: o.id, itemId: it.id, status: 'SERVED' });
    }
  };

  const columns: Column<Order>[] = [
    {
      key: 'number',
      header: 'Order',
      sortValue: (o) => o.orderNumber,
      render: (o) => <span className="font-semibold text-neutral-900 whitespace-nowrap">{o.orderNumber}</span>,
    },
    {
      key: 'time',
      header: 'Time',
      hideBelow: 'lg',
      sortValue: (o) => o.createdAt,
      render: (o) => <span className="whitespace-nowrap text-neutral-600 tnum">{fmtTime(o.createdAt)}</span>,
    },
    {
      key: 'items',
      header: 'Items',
      hideBelow: 'md',
      sortValue: (o) => o.itemCount,
      render: (o) => {
        const summary = itemSummary(o);
        return (
          <div className="min-w-[10rem] max-w-[18rem] space-y-1">
            <span className="block text-neutral-800 truncate">{summary ?? '—'}</span>
            <span className="block text-caption text-neutral-500 tnum">{o.itemCount} item{o.itemCount === 1 ? '' : 's'} · {o.guestCount} guest{o.guestCount === 1 ? '' : 's'}</span>
            {/* Below `lg` the two station columns are hidden, so the badges keep that load
                visible at the widths where the columns cannot be. */}
            <span className="lg:hidden">{stationBadges(o)}</span>
          </div>
        );
      },
    },
    {
      key: 'table',
      header: 'Table',
      sortValue: (o) => o.tableName,
      render: (o) => <span className="font-medium text-neutral-900">{o.tableName}<span className="block text-caption font-normal text-neutral-500">{o.floorName}</span></span>,
    },
    { key: 'waiter', header: 'Waiter', hideBelow: 'lg', sortValue: (o) => o.waiterName, render: (o) => <span className="text-neutral-700">{o.waiterName}</span> },
    {
      key: 'kitchen',
      header: 'Kitchen',
      hideBelow: 'lg',
      sortValue: (o) => stationOf(o, 'KITCHEN')?.state ?? '',
      render: (o) => stationCell(o, 'KITCHEN'),
    },
    {
      key: 'bar',
      header: 'Bar',
      hideBelow: 'lg',
      sortValue: (o) => stationOf(o, 'BAR')?.state ?? '',
      render: (o) => stationCell(o, 'BAR'),
    },
    {
      key: 'progress',
      header: 'Waiting',
      sortValue: (o) => waitOf(o).since,
      render: progressCell,
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (o) => o.status,
      render: (o) => (
        <div className="flex flex-col gap-1 items-start">
          <StatusBadge kind="order" status={o.status} size="sm" />
          {isDelayed(o) && <Badge tone="danger" size="sm" icon={<AlertTriangle className="h-3 w-3" aria-hidden />}>Over {DELAY_THRESHOLDS.late} min</Badge>}
          {billPending(o) && <Badge tone="danger" size="sm" icon={<Receipt className="h-3 w-3" aria-hidden />}>Bill waiting</Badge>}
        </div>
      ),
    },
    { key: 'total', header: 'Amount', align: 'right', hideBelow: 'xl', sortValue: (o) => o.subtotal, render: (o) => <span className="tnum font-medium text-neutral-900">{money(o.subtotal)}</span> },
    {
      key: 'actions',
      header: <span className="sr-only">Next action</span>,
      align: 'right',
      render: (o) => {
        const onThePass = readyItems(o);
        return canServe && onThePass.length > 0 ? (
          <Button
            size="sm"
            variant="success"
            className="whitespace-nowrap"
            leftIcon={<Check className="h-4 w-4" />}
            aria-label={`Mark ${onThePass.length} ready item${onThePass.length === 1 ? '' : 's'} on ${o.tableName} as served`}
            loading={m.setItemStatus.isPending && m.setItemStatus.variables?.id === o.id}
            onClick={(e) => { e.stopPropagation(); void serveReady(o); }}
          >
            Serve
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="whitespace-nowrap"
            rightIcon={<ChevronRight className="h-4 w-4" />}
            aria-label={`Open order ${o.orderNumber} on ${o.tableName}`}
            onClick={(e) => { e.stopPropagation(); navigate(`/admin/orders/${o.id}`); }}
          >
            View
          </Button>
        );
      },
    },
  ];

  const tile = (active: boolean) => (active ? 'border-primary-500 ring-1 ring-primary-500' : undefined);

  return (
    <div>
      <PageHeader
        title="Live operations"
        subtitle={
          <>
            {q.isLoading
              ? 'Loading the board…'
              : all.length === 0
                ? 'No active orders'
                : `${all.length} active order${all.length === 1 ? '' : 's'} · longest waiting ${oldest ? `${elapsedMinutes(waitOf(oldest).since, now)} min on ${oldest.tableName}` : '—'}`}
            {/* The refresh stated in words, permanently and in full — a board that updates itself
                has to say so, and "20s" in a corner is not saying so. */}
            <span className="block">This board refreshes itself every 20 seconds. Nothing on it animates.</span>
          </>
        }
        actions={anyFilter ? <Button variant="ghost" className="min-h-touch" leftIcon={<X className="h-4 w-4" />} onClick={clearFilters}>Clear filters</Button> : undefined}
      >
        <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <StatCard label="Delayed orders" value={delayedOrders.length} icon={<AlertTriangle className="h-5 w-5" />} tone={delayedOrders.length ? 'danger' : 'success'} hint={`In prep over ${DELAY_THRESHOLDS.late} min`} onClick={() => setStation(station === 'DELAYED' ? 'ALL' : 'DELAYED')} className={tile(station === 'DELAYED')} />
          <StatCard label="Kitchen backlog" value={kitchenBacklog} icon={<ChefHat className="h-5 w-5" />} tone={kitchenBacklog > DELAY_THRESHOLDS.backlog ? 'danger' : 'warning'} hint="items pending" onClick={() => setStation(station === 'KITCHEN' ? 'ALL' : 'KITCHEN')} className={tile(station === 'KITCHEN')} />
          <StatCard label="Bar backlog" value={barBacklog} icon={<Wine className="h-5 w-5" />} tone={barBacklog > DELAY_THRESHOLDS.backlog ? 'danger' : 'info'} hint="items pending" onClick={() => setStation(station === 'BAR' ? 'ALL' : 'BAR')} className={tile(station === 'BAR')} />
          <StatCard label="Bill requests" value={billReq} icon={<Receipt className="h-5 w-5" />} tone={billWaiting.length ? 'danger' : billReq ? 'warning' : 'neutral'} hint={billWaiting.length ? `${billWaiting.length} waiting over ${DELAY_THRESHOLDS.warn} min` : 'tables asking to pay'} onClick={() => setStation(station === 'BILL' ? 'ALL' : 'BILL')} className={tile(station === 'BILL')} />
        </div>

        {/* The live lifecycle, counted. One chip row, single select, wrapping rather than
            scrolling sideways — a manager reads the whole queue shape in one glance. */}
        <FilterChips
          className="mb-2.5"
          ariaLabel="Filter the board by order status"
          value={status}
          onChange={setStatus}
          options={statusChips}
        />

        <div className="flex flex-col lg:flex-row gap-2 lg:items-center">
          <SegmentedControl
            size="sm"
            ariaLabel="Filter the board by bottleneck"
            value={station}
            onChange={setStation}
            options={[
              { value: 'ALL', label: 'All', count: all.length },
              { value: 'DELAYED', label: 'Delayed', count: all.filter((o) => isDelayed(o) || billPending(o)).length },
              { value: 'KITCHEN', label: 'Kitchen', count: all.filter((o) => pending(o, 'KITCHEN') > 0).length },
              { value: 'BAR', label: 'Bar', count: all.filter((o) => pending(o, 'BAR') > 0).length },
              { value: 'BILL', label: 'Billing', count: all.filter((o) => ['BILL_REQUESTED', 'BILLED', 'PAID'].includes(o.status)).length },
            ]}
          />
          <FilterSelect
            ariaLabel="Filter by waiter" className="lg:w-44" value={waiter} onChange={(e) => setWaiter(e.target.value)} placeholder="All waiters"
            options={(waiters.data ?? []).map((w) => ({ value: w.id, label: w.fullName }))}
          />
          <FilterSelect
            ariaLabel="Filter by area" className="lg:w-44" value={floor} onChange={(e) => setFloor(e.target.value)} placeholder="All areas"
            options={(floors.data ?? []).map((f) => ({ value: f.id, label: f.name }))}
          />
          <SearchInput value={search} onChange={setSearch} placeholder="Table or order #" className="lg:w-52" />
        </div>
      </PageHeader>

      {q.isLoading && <LoadingState variant="table" rows={6} />}
      {q.isError && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}

      {q.data && (
        <>
          {(delayedOrders.length > 0 || billWaiting.length > 0) && (
            <Alert
              tone="danger"
              className="mb-4"
              title={[
                delayedOrders.length ? `${delayedOrders.length} order${delayedOrders.length === 1 ? '' : 's'} over ${DELAY_THRESHOLDS.late} min in prep` : '',
                billWaiting.length ? `${billWaiting.length} table${billWaiting.length === 1 ? '' : 's'} waiting on a bill` : '',
              ].filter(Boolean).join(' · ')}
              action={station !== 'DELAYED' ? <Button size="sm" variant="outline" onClick={() => setStation('DELAYED')}>Show them</Button> : undefined}
            >
              {[...delayedOrders, ...billWaiting]
                .sort((a, b) => waitOf(a).since.localeCompare(waitOf(b).since))
                .slice(0, 5)
                .map((o) => `${o.tableName} (${elapsedMinutes(waitOf(o).since, now)} min)`)
                .join(', ')}
              {delayedOrders.length + billWaiting.length > 5 ? ` and ${delayedOrders.length + billWaiting.length - 5} more` : ''}.
            </Alert>
          )}

          {/* ONE card for the whole queue: the toolbar states what is on screen, the table below
              it is dense. `DataTable` is itself the card, so there is no second frame around it. */}
          <DataTable
            dense
            columns={columns}
            rows={rows}
            rowKey={(o) => o.id}
            onRowClick={(o) => navigate(`/admin/orders/${o.id}`)}
            pageSize={50}
            // Oldest first: the board's whole purpose is what has been waiting longest.
            initialSort={{ key: 'progress', dir: 'asc' }}
            caption="Active orders ordered by how long each has been waiting, with the order, time, items, table, waiter, the kitchen's and the bar's own progress, status and the next action"
            toolbar={
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-neutral-500" aria-live="polite">
                <span className="tnum font-semibold text-neutral-900">{rows.length}</span>
                <span>order{rows.length === 1 ? '' : 's'} on the board</span>
                {status && <><span aria-hidden>·</span><span>{ORDER_STATUS[status].label}</span></>}
                {station !== 'ALL' && <><span aria-hidden>·</span><span>{station === 'DELAYED' ? 'delayed only' : station === 'BILL' ? 'billing only' : station === 'KITCHEN' ? 'kitchen backlog' : 'bar backlog'}</span></>}
              </p>
            }
            emptyTitle={anyFilter ? 'No orders match these filters' : 'No active orders'}
            emptyDescription={anyFilter ? 'Clear the filters to see the whole floor.' : 'New orders will appear here automatically.'}
            emptyAction={anyFilter ? <Button variant="outline" onClick={clearFilters}>Clear filters</Button> : undefined}
            mobileCard={(o) => {
              const { done, total } = prepared(o);
              const summary = itemSummary(o);
              return (
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-neutral-900">{o.tableName} <span className="text-caption font-normal text-neutral-500">{o.orderNumber}</span></p>
                      <p className="text-caption text-neutral-500 truncate">{o.waiterName} · {o.itemCount} items · {fmtTime(o.createdAt)}</p>
                    </div>
                    <span className="tnum font-semibold shrink-0">{money(o.subtotal)}</span>
                  </div>
                  {summary && <p className="text-caption text-neutral-600 truncate">{summary}</p>}
                  {total > 0 && (
                    <ProgressMeter
                      static
                      label={`Items ready on ${o.orderNumber}`}
                      value={done}
                      max={total}
                      valueText={`${done}/${total} ready`}
                      tone={done === total ? 'success' : done > 0 ? 'warning' : 'neutral'}
                    />
                  )}
                  {waitLine(o)}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge kind="order" status={o.status} size="sm" />
                    {isDelayed(o) && <Badge tone="danger" size="sm" icon={<AlertTriangle className="h-3 w-3" aria-hidden />}>Delayed</Badge>}
                    {billPending(o) && <Badge tone="danger" size="sm" icon={<Receipt className="h-3 w-3" aria-hidden />}>Bill waiting</Badge>}
                    {pending(o, 'KITCHEN') > 0 && <Badge tone="warning" size="sm" icon={<ChefHat className="h-3 w-3" aria-hidden />}>{pending(o, 'KITCHEN')} kitchen</Badge>}
                    {pending(o, 'BAR') > 0 && <Badge tone="warning" size="sm" icon={<Wine className="h-3 w-3" aria-hidden />}>{pending(o, 'BAR')} bar</Badge>}
                  </div>
                  {/* The same next action the desktop row offers, at the width where the actions
                      column does not render. Opening the order is the row tap itself. */}
                  {canServe && readyItems(o).length > 0 && (
                    <Button
                      size="sm"
                      variant="success"
                      className="min-h-touch"
                      leftIcon={<Check className="h-4 w-4" />}
                      aria-label={`Mark ${readyItems(o).length} ready item${readyItems(o).length === 1 ? '' : 's'} on ${o.tableName} as served`}
                      loading={m.setItemStatus.isPending && m.setItemStatus.variables?.id === o.id}
                      onClick={(e) => { e.stopPropagation(); void serveReady(o); }}
                    >
                      Serve
                    </Button>
                  )}
                </div>
              );
            }}
          />
        </>
      )}
    </div>
  );
}
