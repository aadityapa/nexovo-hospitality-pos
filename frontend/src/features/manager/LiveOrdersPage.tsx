import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ChefHat, Wine, Receipt, Clock, Bell, X } from 'lucide-react';
import { useOrders } from '@/features/orders/hooks';
import { useFloors, useTables, useWaiters } from '@/features/tables/hooks';
import { useNow, useDebounce } from '@/hooks/useRealtime';
import { PageHeader, DataTable, StatusBadge, StatCard, LoadingState, ErrorState, SearchInput, SegmentedControl, FilterSelect, Badge, Button, Alert, type Column } from '@/components/ui';
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
 */

const PREP_STATUSES: OrderStatus[] = ['CONFIRMED', 'IN_PROGRESS', 'PARTIALLY_READY'];

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

/** Manager live operations: every active order with station status, delays and bottleneck filters. */
export default function LiveOrdersPage() {
  const navigate = useNavigate();
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

  /** Plain render helper, not a nested component — a nested one would remount on every tick. */
  const waitCell = (o: Order) => {
    const w = waitOf(o);
    const mins = elapsedMinutes(w.since, now);
    const Icon = w.level === 'late' ? AlertTriangle : o.status === 'READY' ? Bell : Clock;
    return (
      <span className="inline-flex flex-col gap-0.5">
        <span className={cn('inline-flex items-center gap-1.5 font-semibold whitespace-nowrap', LEVEL_CLS[w.level])}>
          <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="tabular-nums">{mins} min</span>
          <span className="font-medium">· {w.label}</span>
        </span>
        <span className="text-caption text-neutral-500 whitespace-nowrap">since {fmtTime(w.since)}</span>
      </span>
    );
  };

  const stationCell = (o: Order, loc: PrepLocation) => {
    const p = pending(o, loc), r = ready(o, loc);
    if (!p && !r) return <span className="text-neutral-300">—</span>;
    const Icon = loc === 'KITCHEN' ? ChefHat : Wine;
    return (
      <span className="inline-flex items-center gap-1 text-sm">
        <Icon className={cn('h-4 w-4', loc === 'KITCHEN' ? 'text-warning-600' : 'text-info-600')} aria-hidden />
        {p > 0 && <Badge tone="warning" size="sm">{p} pending</Badge>}
        {r > 0 && <Badge tone="success" size="sm">{r} ready</Badge>}
      </span>
    );
  };

  const columns: Column<Order>[] = [
    {
      key: 'wait',
      header: 'Waiting',
      sortValue: (o) => waitOf(o).since,
      render: waitCell,
    },
    { key: 'table', header: 'Table', sortValue: (o) => o.tableName, render: (o) => <span className="font-semibold">{o.tableName}<span className="block text-caption font-normal text-neutral-500">{o.orderNumber}</span></span> },
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
    { key: 'waiter', header: 'Waiter', hideBelow: 'lg', sortValue: (o) => o.waiterName, render: (o) => o.waiterName },
    { key: 'kitchen', header: 'Kitchen', align: 'center', hideBelow: 'md', render: (o) => stationCell(o, 'KITCHEN') },
    { key: 'bar', header: 'Bar', align: 'center', hideBelow: 'md', render: (o) => stationCell(o, 'BAR') },
    { key: 'items', header: 'Items', align: 'center', hideBelow: 'lg', sortValue: (o) => o.itemCount, render: (o) => o.itemCount },
    { key: 'time', header: 'Ordered', hideBelow: 'lg', sortValue: (o) => o.createdAt, render: (o) => <span className="whitespace-nowrap text-neutral-600">{fmtTime(o.createdAt)}</span> },
    { key: 'total', header: 'Amount', align: 'right', sortValue: (o) => o.subtotal, render: (o) => <span className="tabular-nums font-medium">{money(o.subtotal)}</span> },
  ];

  const tile = (active: boolean) => (active ? 'border-primary-600 ring-1 ring-primary-600' : undefined);

  return (
    <div>
      <PageHeader
        title="Live operations"
        subtitle={q.isLoading
          ? 'Loading the board…'
          : all.length === 0
            ? 'No active orders'
            : `${all.length} active order${all.length === 1 ? '' : 's'} · longest waiting ${oldest ? `${elapsedMinutes(waitOf(oldest).since, now)} min on ${oldest.tableName}` : '—'} · refreshes every 20s`}
        actions={anyFilter ? <Button variant="ghost" className="min-h-touch" leftIcon={<X className="h-4 w-4" />} onClick={clearFilters}>Clear filters</Button> : undefined}
      >
        <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <StatCard label="Delayed orders" value={delayedOrders.length} icon={<AlertTriangle className="h-5 w-5" />} tone={delayedOrders.length ? 'danger' : 'success'} hint={`In prep over ${DELAY_THRESHOLDS.late} min`} onClick={() => setStation(station === 'DELAYED' ? 'ALL' : 'DELAYED')} className={tile(station === 'DELAYED')} />
          <StatCard label="Kitchen backlog" value={kitchenBacklog} icon={<ChefHat className="h-5 w-5" />} tone={kitchenBacklog > DELAY_THRESHOLDS.backlog ? 'danger' : 'warning'} hint="items pending" onClick={() => setStation(station === 'KITCHEN' ? 'ALL' : 'KITCHEN')} className={tile(station === 'KITCHEN')} />
          <StatCard label="Bar backlog" value={barBacklog} icon={<Wine className="h-5 w-5" />} tone={barBacklog > DELAY_THRESHOLDS.backlog ? 'danger' : 'info'} hint="items pending" onClick={() => setStation(station === 'BAR' ? 'ALL' : 'BAR')} className={tile(station === 'BAR')} />
          <StatCard label="Bill requests" value={billReq} icon={<Receipt className="h-5 w-5" />} tone={billWaiting.length ? 'danger' : billReq ? 'warning' : 'neutral'} hint={billWaiting.length ? `${billWaiting.length} waiting over ${DELAY_THRESHOLDS.warn} min` : 'tables asking to pay'} onClick={() => setStation(station === 'BILL' ? 'ALL' : 'BILL')} className={tile(station === 'BILL')} />
        </div>
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
            ariaLabel="Filter by status" className="lg:w-44" value={status} onChange={(e) => setStatus(e.target.value as '' | OrderStatus)} placeholder="Any status"
            options={(Object.keys(ORDER_STATUS) as OrderStatus[]).filter((s) => !['COMPLETED', 'CANCELLED'].includes(s)).map((s) => ({ value: s, label: ORDER_STATUS[s].label }))}
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

          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(o) => o.id}
            onRowClick={(o) => navigate(`/admin/orders/${o.id}`)}
            pageSize={50}
            // Oldest first: the board's whole purpose is what has been waiting longest.
            initialSort={{ key: 'wait', dir: 'asc' }}
            caption="Active orders ordered by how long each has been waiting, with station load and delays"
            emptyTitle={anyFilter ? 'No orders match these filters' : 'No active orders'}
            emptyDescription={anyFilter ? 'Clear the filters to see the whole floor.' : 'New orders will appear here automatically.'}
            emptyAction={anyFilter ? <Button variant="outline" onClick={clearFilters}>Clear filters</Button> : undefined}
            mobileCard={(o) => (
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-neutral-900">{o.tableName} <span className="text-caption font-normal text-neutral-500">{o.orderNumber}</span></p>
                    <p className="text-caption text-neutral-500 truncate">{o.waiterName} · {o.itemCount} items</p>
                  </div>
                  <span className="tabular-nums font-semibold shrink-0">{money(o.subtotal)}</span>
                </div>
                {waitCell(o)}
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge kind="order" status={o.status} size="sm" />
                  {isDelayed(o) && <Badge tone="danger" size="sm" icon={<AlertTriangle className="h-3 w-3" aria-hidden />}>Delayed</Badge>}
                  {billPending(o) && <Badge tone="danger" size="sm" icon={<Receipt className="h-3 w-3" aria-hidden />}>Bill waiting</Badge>}
                  {pending(o, 'KITCHEN') > 0 && <Badge tone="warning" size="sm" icon={<ChefHat className="h-3 w-3" aria-hidden />}>{pending(o, 'KITCHEN')} kitchen</Badge>}
                  {pending(o, 'BAR') > 0 && <Badge tone="warning" size="sm" icon={<Wine className="h-3 w-3" aria-hidden />}>{pending(o, 'BAR')} bar</Badge>}
                </div>
              </div>
            )}
          />
        </>
      )}
    </div>
  );
}
