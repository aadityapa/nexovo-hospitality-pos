import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Bell, X, Plus, ChevronRight } from 'lucide-react';
import { useOrders } from './hooks';
import { useDateRange, DateRangeFilter } from '@/features/shared/DateRangeFilter';
import { usePermission } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useSurface';
import { useDebounce, useNow } from '@/hooks/useRealtime';
import { PageHeader, DataTable, StatusBadge, LoadingState, ErrorState, SearchInput, SegmentedControl, FilterChips, FilterSelect, Badge, Button, IconButton, type Column } from '@/components/ui';
import { HeaderSearch } from '@/components/layout/Shell';
import { money } from '@/utils/money';
import { fmtDateTime, fmtRelative, fmtTime, elapsedMinutes } from '@/utils/date';
import { ORDER_STATUS, DELAY_THRESHOLDS } from '@/config/statuses';
import { isOrderActive } from '@/utils/orderStatus';
import { cn } from '@/utils/cn';
import type { Order, OrderStatus } from '@/types';

type Scope = 'ALL' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
type OrderType = Order['orderType'];
type TypeFilter = 'ALL' | OrderType;

const SCOPE_LABEL: Record<Scope, string> = { ALL: 'All', ACTIVE: 'Active', COMPLETED: 'Completed', CANCELLED: 'Cancelled' };

/** Labels only — the four values are the `orderType` union the API returns. */
const TYPE_LABEL: Record<OrderType, string> = {
  DINE_IN: 'Dine-in', TAKEAWAY: 'Takeaway', ROOM_SERVICE: 'Room service', DELIVERY: 'Delivery',
};
/** Fixed reading order for the tabs; a type the period contains none of is not offered. */
const TYPE_ORDER: OrderType[] = ['DINE_IN', 'TAKEAWAY', 'ROOM_SERVICE', 'DELIVERY'];

function ageLabel(mins: number): string {
  if (mins < 1) return '<1m';
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
}

/** Items the kitchen has finished but nobody has carried out yet — the one thing worth chasing. */
function readyWait(o: Order, now: Date): { count: number; mins: number } | null {
  const ready = o.items.filter((i) => i.status === 'READY');
  if (ready.length === 0) return null;
  const oldest = ready.reduce<string | null>((a, i) => (i.readyAt && (a === null || i.readyAt < a) ? i.readyAt : a), null);
  return { count: ready.length, mins: oldest ? elapsedMinutes(oldest, now) : 0 };
}

const readyTone = (mins: number) => (mins >= DELAY_THRESHOLDS.late ? 'danger' : mins >= DELAY_THRESHOLDS.warn ? 'warning' : 'success');

export default function OrdersListPage() {
  const navigate = useNavigate();
  const canCreate = usePermission('orders:create');
  /*
   * PRESENTATION ONLY. The manager board draws this screen's type filter as a counted CHIP ROW
   * and its table at the dense row height; the admin board draws the segmented track and the
   * ordinary height. Same options, same state, same query, same permissions — the workspace
   * (derived from the signed-in role, never the URL) chooses which of the two is rendered.
   */
  const ws = useWorkspace();
  const dr = useDateRange('today');
  const [scope, setScope] = useState<Scope>('ALL');
  const [type, setType] = useState<TypeFilter>('ALL');
  const [status, setStatus] = useState<'' | OrderStatus>('');
  const [search, setSearch] = useState('');
  const dq = useDebounce(search, 250);
  const now = useNow(60_000);
  const q = useOrders({ from: dr.range.from, to: dr.range.to, search: dq || undefined, status: status ? [status] : scope === 'COMPLETED' ? ['COMPLETED'] : scope === 'CANCELLED' ? ['CANCELLED'] : undefined, active: scope === 'ACTIVE' || undefined });

  const fetched = useMemo(() => q.data ?? [], [q.data]);
  /**
   * Order type is not a server-side filter, so the tabs narrow the fetched period in place. The
   * counts are therefore counts of real orders, and a type the venue has never taken in this
   * period is simply not offered rather than shown as a permanent zero.
   */
  const typeTabs = useMemo(() => {
    const present = TYPE_ORDER.filter((t) => fetched.some((o) => o.orderType === t));
    return [
      { value: 'ALL' as TypeFilter, label: 'All', count: fetched.length },
      ...present.map((t) => ({ value: t as TypeFilter, label: TYPE_LABEL[t], count: fetched.filter((o) => o.orderType === t).length })),
    ];
  }, [fetched]);

  const rows = useMemo(() => (type === 'ALL' ? fetched : fetched.filter((o) => o.orderType === type)), [fetched, type]);
  const filtered = scope !== 'ALL' || type !== 'ALL' || !!status || !!dq;
  const clearFilters = () => { setScope('ALL'); setType('ALL'); setStatus(''); setSearch(''); };

  /** Clock time, with the order's real age under it. Both come from `createdAt`. */
  const timeCell = (o: Order) => {
    const open = isOrderActive(o.status);
    return (
      <span className="inline-flex flex-col gap-0.5 whitespace-nowrap" title={fmtDateTime(o.createdAt)}>
        <span className="tnum text-neutral-900">{fmtTime(o.createdAt)}</span>
        <span className={cn('inline-flex items-center gap-1 text-caption', open ? 'text-neutral-600 font-medium' : 'text-neutral-500')}>
          {open && <Clock className="h-3 w-3 shrink-0 text-neutral-400" aria-hidden />}
          {open ? `open ${ageLabel(elapsedMinutes(o.createdAt, now))}` : fmtRelative(o.createdAt)}
        </span>
      </span>
    );
  };

  const statusCell = (o: Order) => {
    const ready = isOrderActive(o.status) ? readyWait(o, now) : null;
    return (
      <span className="inline-flex flex-col items-start gap-1">
        <StatusBadge kind="order" status={o.status} size="sm" />
        {ready && (
          <Badge tone={readyTone(ready.mins)} size="sm" icon={<Bell className="h-3 w-3" aria-hidden />}>
            {ready.count} ready {ageLabel(ready.mins)}
          </Badge>
        )}
      </span>
    );
  };

  const columns = useMemo<Column<Order>[]>(() => [
    { key: 'number', header: 'Order', sortValue: (o) => o.orderNumber, render: (o) => <span className="font-semibold text-neutral-900 whitespace-nowrap">{o.orderNumber}</span> },
    { key: 'time', header: 'Time', sortValue: (o) => o.createdAt, render: timeCell },
    { key: 'type', header: 'Type', hideBelow: 'lg', sortValue: (o) => TYPE_LABEL[o.orderType], render: (o) => <Badge tone={o.orderType === 'DINE_IN' ? 'neutral' : 'info'} size="sm">{TYPE_LABEL[o.orderType]}</Badge> },
    { key: 'table', header: 'Table', sortValue: (o) => o.tableName, render: (o) => <span className="font-medium text-neutral-900">{o.tableName}<span className="block text-caption font-normal text-neutral-500">{o.floorName}</span></span> },
    { key: 'items', header: 'Items', align: 'center', hideBelow: 'md', sortValue: (o) => o.itemCount, render: (o) => <span className="tnum">{o.itemCount}</span> },
    { key: 'total', header: 'Amount', align: 'right', sortValue: (o) => o.subtotal, render: (o) => <span className="tnum font-semibold text-neutral-900">{money(o.subtotal)}</span> },
    { key: 'status', header: 'Status', sortValue: (o) => o.status, render: statusCell },
    { key: 'waiter', header: 'Waiter', hideBelow: 'lg', sortValue: (o) => o.waiterName, render: (o) => <span className="text-neutral-700">{o.waiterName}</span> },
    {
      key: 'actions',
      header: <span className="sr-only">Open order</span>,
      align: 'right',
      render: (o) => (
        <IconButton
          size="sm"
          label={`Open order ${o.orderNumber} on ${o.tableName}`}
          onClick={(e) => { e.stopPropagation(); navigate(`/admin/orders/${o.id}`); }}
        >
          <ChevronRight className="h-4 w-4" />
        </IconButton>
      ),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [now]);

  /**
   * The phone card. Four lines, in the order a manager reads them: which table, what state, when
   * and how much, then who and how many covers. Nothing here truncates a figure.
   */
  const mobileCard = (o: Order) => {
    const ready = isOrderActive(o.status) ? readyWait(o, now) : null;
    const open = isOrderActive(o.status);
    return (
      <div className="space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block font-semibold text-neutral-900 truncate">{o.tableName}</span>
            <span className="block text-caption text-neutral-500 truncate">{o.orderNumber} · {o.floorName}</span>
          </span>
          <StatusBadge kind="order" status={o.status} size="sm" />
        </div>
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-neutral-600">
            <span className="tnum text-neutral-900">{fmtTime(o.createdAt)}</span>
            <span className="text-caption">{open ? `· open ${ageLabel(elapsedMinutes(o.createdAt, now))}` : `· ${fmtRelative(o.createdAt)}`}</span>
          </span>
          <span className="tnum font-semibold text-neutral-900">{money(o.subtotal)}</span>
        </div>
        <p className="text-caption text-neutral-500 truncate">
          {TYPE_LABEL[o.orderType]} · {o.waiterName} · {o.itemCount} item{o.itemCount === 1 ? '' : 's'} · {o.guestCount} guest{o.guestCount === 1 ? '' : 's'}
        </p>
        {ready && (
          <Badge tone={readyTone(ready.mins)} size="sm" icon={<Bell className="h-3 w-3" aria-hidden />}>
            {ready.count} ready {ageLabel(ready.mins)}
          </Badge>
        )}
      </div>
    );
  };

  return (
    <div>
      {/* The screen's own search, hoisted into the application header — same input, same state,
          same debounce, and the same `search` parameter on the same query. */}
      <HeaderSearch>
        <SearchInput value={search} onChange={setSearch} placeholder="Search orders, tables, items…" className="w-full max-w-md" />
      </HeaderSearch>

      <PageHeader
        title="Orders"
        subtitle="Every order in the selected period, newest first."
        /* Order entry lives in the waiter shell for every role, which is where this goes — the
           same real action the waiter home screen offers, behind the same permission. */
        actions={canCreate ? <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => navigate('/waiter/tables')}>New order</Button> : undefined}
      >
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          {ws === 'manager' ? (
            <FilterChips
              ariaLabel="Filter orders by type"
              value={type}
              onChange={setType}
              options={typeTabs}
            />
          ) : (
            <SegmentedControl
              ariaLabel="Filter orders by type"
              size="sm"
              value={type}
              onChange={setType}
              options={typeTabs}
            />
          )}
          <DateRangeFilter state={dr} />
          <SegmentedControl
            ariaLabel="Filter orders by lifecycle"
            size="sm"
            value={scope}
            onChange={(v) => { setScope(v); setStatus(''); }}
            options={(Object.keys(SCOPE_LABEL) as Scope[]).map((s) => ({ value: s, label: SCOPE_LABEL[s] }))}
          />
          <FilterSelect
            ariaLabel="Filter by status"
            className="lg:w-48"
            value={status}
            onChange={(e) => setStatus(e.target.value as '' | OrderStatus)}
            placeholder="Any status"
            options={(Object.keys(ORDER_STATUS) as OrderStatus[]).map((s) => ({ value: s, label: ORDER_STATUS[s].label }))}
          />
        </div>
      </PageHeader>

      {q.isLoading && <LoadingState variant="table" rows={8} />}
      {q.isError && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}

      {q.data && (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(o) => o.id}
          /* The manager board's orders table is the dense one. `false` is the height the admin
             board has always had — `dense` was simply never passed. */
          dense={ws === 'manager'}
          onRowClick={(o) => navigate(`/admin/orders/${o.id}`)}
          initialSort={{ key: 'time', dir: 'desc' }}
          mobileCard={mobileCard}
          caption="Orders with order number, time, type, table, item count, amount, status and waiter"
          toolbar={
            <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-600" aria-live="polite">
              <span className="tnum"><span className="font-semibold text-neutral-900">{rows.length}</span> order{rows.length === 1 ? '' : 's'}</span>
              {type !== 'ALL' && <Badge tone="info" size="sm">{TYPE_LABEL[type]}</Badge>}
              {scope !== 'ALL' && <Badge tone="primary" size="sm">{SCOPE_LABEL[scope]}</Badge>}
              {status && <Badge tone="neutral" size="sm">{ORDER_STATUS[status].label}</Badge>}
              {dq && <Badge tone="neutral" size="sm">“{dq}”</Badge>}
              {filtered && (
                <Button variant="ghost" size="sm" className="min-h-touch" leftIcon={<X className="h-4 w-4" />} onClick={clearFilters}>Clear filters</Button>
              )}
            </div>
          }
          emptyTitle={filtered ? 'No orders match these filters' : 'No orders'}
          emptyDescription={filtered ? 'Try a wider date range, or clear the filters.' : 'Orders for the selected period will appear here.'}
          emptyAction={filtered ? <Button variant="outline" onClick={clearFilters}>Clear filters</Button> : undefined}
        />
      )}
    </div>
  );
}
