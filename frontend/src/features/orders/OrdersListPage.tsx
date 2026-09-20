import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrders } from './hooks';
import { useDateRange, DateRangeFilter } from '@/features/shared/DateRangeFilter';
import { useDebounce } from '@/hooks/useRealtime';
import { PageHeader, DataTable, StatusBadge, LoadingState, ErrorState, SearchInput, SegmentedControl, FilterSelect, type Column } from '@/components/ui';
import { money } from '@/utils/money';
import { fmtDateTime, fmtRelative } from '@/utils/date';
import { ORDER_STATUS } from '@/config/statuses';
import type { Order, OrderStatus } from '@/types';

type Scope = 'ALL' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export default function OrdersListPage() {
  const navigate = useNavigate();
  const dr = useDateRange('today');
  const [scope, setScope] = useState<Scope>('ALL');
  const [status, setStatus] = useState<'' | OrderStatus>('');
  const [search, setSearch] = useState('');
  const dq = useDebounce(search, 250);
  const q = useOrders({ from: dr.range.from, to: dr.range.to, search: dq || undefined, status: status ? [status] : scope === 'COMPLETED' ? ['COMPLETED'] : scope === 'CANCELLED' ? ['CANCELLED'] : undefined, active: scope === 'ACTIVE' || undefined });
  const columns = useMemo<Column<Order>[]>(() => [
    { key: 'number', header: 'Order', sortValue: (o) => o.orderNumber, render: (o) => <span className="font-medium">{o.orderNumber}</span> },
    { key: 'table', header: 'Table', sortValue: (o) => o.tableName, render: (o) => <span>{o.tableName}<span className="block text-caption text-neutral-500">{o.floorName}</span></span> },
    { key: 'waiter', header: 'Waiter', hideBelow: 'lg', sortValue: (o) => o.waiterName, render: (o) => o.waiterName },
    { key: 'time', header: 'Time', sortValue: (o) => o.createdAt, render: (o) => <span title={fmtDateTime(o.createdAt)}>{fmtRelative(o.createdAt)}</span> },
    { key: 'items', header: 'Items', align: 'center', hideBelow: 'md', sortValue: (o) => o.itemCount, render: (o) => o.itemCount },
    { key: 'total', header: 'Amount', align: 'right', sortValue: (o) => o.subtotal, render: (o) => <span className="tabular-nums font-medium">{money(o.subtotal)}</span> },
    { key: 'status', header: 'Status', sortValue: (o) => o.status, render: (o) => <StatusBadge kind="order" status={o.status} size="sm" /> },
  ], []);
  return (
    <div>
      <PageHeader title="Orders" subtitle={`${q.data?.length ?? 0} orders`}>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <DateRangeFilter state={dr} />
          <SegmentedControl size="sm" value={scope} onChange={(v) => { setScope(v); setStatus(''); }} options={[{ value: 'ALL', label: 'All' }, { value: 'ACTIVE', label: 'Active' }, { value: 'COMPLETED', label: 'Completed' }, { value: 'CANCELLED', label: 'Cancelled' }]} />
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
      {q.data && <DataTable columns={columns} rows={q.data} rowKey={(o) => o.id} onRowClick={(o) => navigate(`/admin/orders/${o.id}`)} initialSort={{ key: 'time', dir: 'desc' }} emptyTitle="No orders" emptyDescription="Orders for the selected period will appear here."
        mobileCard={(o) => <div className="flex items-center gap-3"><div className="min-w-0 flex-1"><p className="font-medium">{o.tableName} · {o.orderNumber}</p><p className="text-caption text-neutral-500">{o.waiterName} · {fmtRelative(o.createdAt)} · {o.itemCount} items</p></div><span className="tabular-nums font-medium">{money(o.subtotal)}</span><StatusBadge kind="order" status={o.status} size="sm" hideIcon /></div>} />}
    </div>
  );
}
