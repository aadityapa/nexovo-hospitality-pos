import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Bell, X } from 'lucide-react';
import { useOrders } from './hooks';
import { useDateRange, DateRangeFilter } from '@/features/shared/DateRangeFilter';
import { useDebounce, useNow } from '@/hooks/useRealtime';
import { PageHeader, DataTable, StatusBadge, LoadingState, ErrorState, SearchInput, SegmentedControl, FilterSelect, Badge, Button, type Column } from '@/components/ui';
import { money } from '@/utils/money';
import { fmtDateTime, fmtRelative, elapsedMinutes } from '@/utils/date';
import { ORDER_STATUS, DELAY_THRESHOLDS } from '@/config/statuses';
import { isOrderActive } from '@/utils/orderStatus';
import { cn } from '@/utils/cn';
import type { Order, OrderStatus } from '@/types';

type Scope = 'ALL' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

const SCOPE_LABEL: Record<Scope, string> = { ALL: 'All', ACTIVE: 'Active', COMPLETED: 'Completed', CANCELLED: 'Cancelled' };

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
  const dr = useDateRange('today');
  const [scope, setScope] = useState<Scope>('ALL');
  const [status, setStatus] = useState<'' | OrderStatus>('');
  const [search, setSearch] = useState('');
  const dq = useDebounce(search, 250);
  const now = useNow(60_000);
  const q = useOrders({ from: dr.range.from, to: dr.range.to, search: dq || undefined, status: status ? [status] : scope === 'COMPLETED' ? ['COMPLETED'] : scope === 'CANCELLED' ? ['CANCELLED'] : undefined, active: scope === 'ACTIVE' || undefined });

  const rows = q.data ?? [];
  const filtered = scope !== 'ALL' || !!status || !!dq;
  const clearFilters = () => { setScope('ALL'); setStatus(''); setSearch(''); };

  const ageCell = (o: Order) => {
    const open = isOrderActive(o.status);
    return (
      <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap', open ? 'text-neutral-800 font-medium' : 'text-neutral-500')} title={fmtDateTime(o.createdAt)}>
        {open && <Clock className="h-3.5 w-3.5 shrink-0 text-neutral-400" aria-hidden />}
        {open ? `Open ${ageLabel(elapsedMinutes(o.createdAt, now))}` : fmtRelative(o.createdAt)}
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
    { key: 'number', header: 'Order', sortValue: (o) => o.orderNumber, render: (o) => <span className="font-medium">{o.orderNumber}</span> },
    { key: 'table', header: 'Table', sortValue: (o) => o.tableName, render: (o) => <span>{o.tableName}<span className="block text-caption text-neutral-500">{o.floorName}</span></span> },
    { key: 'waiter', header: 'Waiter', hideBelow: 'lg', sortValue: (o) => o.waiterName, render: (o) => o.waiterName },
    { key: 'time', header: 'Age', sortValue: (o) => o.createdAt, render: ageCell },
    { key: 'items', header: 'Items', align: 'center', hideBelow: 'md', sortValue: (o) => o.itemCount, render: (o) => o.itemCount },
    { key: 'total', header: 'Amount', align: 'right', sortValue: (o) => o.subtotal, render: (o) => <span className="tabular-nums font-medium">{money(o.subtotal)}</span> },
    { key: 'status', header: 'Status', sortValue: (o) => o.status, render: statusCell },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [now]);

  const mobileCard = (o: Order) => {
    const ready = isOrderActive(o.status) ? readyWait(o, now) : null;
    return (
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block font-medium text-neutral-900 truncate">{o.tableName}</span>
            <span className="block text-caption text-neutral-500 truncate">{o.orderNumber} · {o.floorName}</span>
          </span>
          <StatusBadge kind="order" status={o.status} size="sm" />
        </div>
        <div className="flex items-center justify-between gap-2 text-sm">
          {ageCell(o)}
          <span className="tabular-nums font-semibold">{money(o.subtotal)}</span>
        </div>
        <p className="text-caption text-neutral-500 truncate">{o.waiterName} · {o.itemCount} item{o.itemCount === 1 ? '' : 's'} · {o.guestCount} guest{o.guestCount === 1 ? '' : 's'}</p>
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
      <PageHeader title="Orders" subtitle="Every order in the selected period, newest first.">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
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
          <SearchInput value={search} onChange={setSearch} placeholder="Order # or table" className="lg:w-56" />
        </div>
      </PageHeader>

      {q.isLoading && <LoadingState variant="table" rows={8} />}
      {q.isError && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}

      {q.data && (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-3 text-sm text-neutral-600" aria-live="polite">
            <span className="tabular-nums">{rows.length} order{rows.length === 1 ? '' : 's'}</span>
            {scope !== 'ALL' && <Badge tone="primary" size="sm">{SCOPE_LABEL[scope]}</Badge>}
            {status && <Badge tone="neutral" size="sm">{ORDER_STATUS[status].label}</Badge>}
            {dq && <Badge tone="neutral" size="sm">“{dq}”</Badge>}
            {filtered && (
              <Button variant="ghost" size="sm" className="min-h-touch" leftIcon={<X className="h-4 w-4" />} onClick={clearFilters}>Clear filters</Button>
            )}
          </div>

          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(o) => o.id}
            onRowClick={(o) => navigate(`/admin/orders/${o.id}`)}
            initialSort={{ key: 'time', dir: 'desc' }}
            mobileCard={mobileCard}
            caption="Orders with table, waiter, age, item count, amount and status"
            emptyTitle={filtered ? 'No orders match these filters' : 'No orders'}
            emptyDescription={filtered ? 'Try a wider date range, or clear the filters.' : 'Orders for the selected period will appear here.'}
            emptyAction={filtered ? <Button variant="outline" onClick={clearFilters}>Clear filters</Button> : undefined}
          />
        </>
      )}
    </div>
  );
}
