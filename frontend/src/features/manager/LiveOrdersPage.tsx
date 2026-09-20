import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ChefHat, Wine, Receipt } from 'lucide-react';
import { useOrders } from '@/features/orders/hooks';
import { useFloors, useTables, useWaiters } from '@/features/tables/hooks';
import { useNow, useDebounce } from '@/hooks/useRealtime';
import { PageHeader, DataTable, StatusBadge, StatCard, LoadingState, ErrorState, SearchInput, SegmentedControl, FilterSelect, Badge, type Column } from '@/components/ui';
import { money } from '@/utils/money';
import { elapsedMinutes, fmtTime } from '@/utils/date';
import { DELAY_THRESHOLDS, ORDER_STATUS } from '@/config/statuses';
import { cn } from '@/utils/cn';
import type { Order, OrderStatus, PrepLocation } from '@/types';

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
  const dq2 = useDebounce(search, 200);

  const pending = (o: Order, loc: PrepLocation) => o.items.filter((i) => i.prepLocation === loc && ['NEW', 'PREPARING'].includes(i.status)).length;
  const ready = (o: Order, loc: PrepLocation) => o.items.filter((i) => i.prepLocation === loc && i.status === 'READY').length;
  const waitMins = (o: Order) => elapsedMinutes(o.confirmedAt ?? o.createdAt, now);
  const isDelayed = (o: Order) => ['CONFIRMED', 'IN_PROGRESS', 'PARTIALLY_READY'].includes(o.status) && waitMins(o) >= DELAY_THRESHOLDS.late;
  const billPending = (o: Order) => o.status === 'BILL_REQUESTED' && elapsedMinutes(o.billRequestedAt ?? o.createdAt, now) >= DELAY_THRESHOLDS.warn;

  const rows = useMemo(() => (q.data ?? []).filter((o) => (!status || o.status === status) && (!waiter || o.waiterId === Number(waiter)) && (!floor || tables.data?.find((t) => t.id === o.tableId)?.floorId === Number(floor))
    && (station === 'ALL' || (station === 'KITCHEN' && pending(o, 'KITCHEN') > 0) || (station === 'BAR' && pending(o, 'BAR') > 0) || (station === 'DELAYED' && (isDelayed(o) || billPending(o))) || (station === 'BILL' && ['BILL_REQUESTED', 'BILLED', 'PAID'].includes(o.status)))
    && (!dq || o.orderNumber.toLowerCase().includes(dq) || o.tableName.toLowerCase().includes(dq))), [q.data, status, waiter, floor, station, dq, tables.data, now]); // eslint-disable-line react-hooks/exhaustive-deps

  const all = q.data ?? [];
  const kitchenBacklog = all.reduce((a, o) => a + pending(o, 'KITCHEN'), 0);
  const barBacklog = all.reduce((a, o) => a + pending(o, 'BAR'), 0);
  const delayed = all.filter(isDelayed).length;
  const billReq = all.filter((o) => o.status === 'BILL_REQUESTED').length;

  const columns: Column<Order>[] = [
    { key: 'table', header: 'Table', sortValue: (o) => o.tableName, render: (o) => <span className="font-semibold">{o.tableName}<span className="block text-caption font-normal text-neutral-500">{o.orderNumber}</span></span> },
    { key: 'waiter', header: 'Waiter', hideBelow: 'lg', sortValue: (o) => o.waiterName, render: (o) => o.waiterName },
    { key: 'time', header: 'Order time', sortValue: (o) => o.createdAt, render: (o) => { const m = waitMins(o); const d = isDelayed(o); return <span className={cn('tabular-nums', d && 'text-danger-700 font-semibold')}>{fmtTime(o.createdAt)}<span className="block text-caption">{d && <AlertTriangle className="inline h-3 w-3 mr-0.5" />}{m} min</span></span>; } },
    { key: 'status', header: 'Status', sortValue: (o) => o.status, render: (o) => <div className="flex flex-col gap-1 items-start"><StatusBadge kind="order" status={o.status} size="sm" />{billPending(o) && <Badge tone="danger" size="sm" icon={<Receipt className="h-3 w-3" />}>Bill waiting</Badge>}</div> },
    { key: 'kitchen', header: 'Kitchen', align: 'center', hideBelow: 'md', render: (o) => { const p = pending(o, 'KITCHEN'), r = ready(o, 'KITCHEN'); return p + r ? <span className="inline-flex items-center gap-1 text-sm"><ChefHat className="h-4 w-4 text-warning-600" />{p > 0 && <Badge tone="warning" size="sm">{p} pending</Badge>}{r > 0 && <Badge tone="success" size="sm">{r} ready</Badge>}</span> : <span className="text-neutral-300">—</span>; } },
    { key: 'bar', header: 'Bar', align: 'center', hideBelow: 'md', render: (o) => { const p = pending(o, 'BAR'), r = ready(o, 'BAR'); return p + r ? <span className="inline-flex items-center gap-1 text-sm"><Wine className="h-4 w-4 text-info-600" />{p > 0 && <Badge tone="warning" size="sm">{p} pending</Badge>}{r > 0 && <Badge tone="success" size="sm">{r} ready</Badge>}</span> : <span className="text-neutral-300">—</span>; } },
    { key: 'items', header: 'Items', align: 'center', hideBelow: 'lg', sortValue: (o) => o.itemCount, render: (o) => o.itemCount },
    { key: 'total', header: 'Amount', align: 'right', sortValue: (o) => o.subtotal, render: (o) => <span className="tabular-nums font-medium">{money(o.subtotal)}</span> },
  ];

  return (
    <div>
      <PageHeader title="Live operations" subtitle={`${all.length} active orders · auto-refreshing`}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <StatCard label="Kitchen backlog" value={kitchenBacklog} icon={<ChefHat className="h-5 w-5" />} tone={kitchenBacklog > 8 ? 'danger' : 'warning'} hint="items pending" onClick={() => setStation('KITCHEN')} />
          <StatCard label="Bar backlog" value={barBacklog} icon={<Wine className="h-5 w-5" />} tone={barBacklog > 8 ? 'danger' : 'info'} hint="items pending" onClick={() => setStation('BAR')} />
          <StatCard label="Delayed orders" value={delayed} icon={<AlertTriangle className="h-5 w-5" />} tone={delayed ? 'danger' : 'success'} hint={`> ${DELAY_THRESHOLDS.late} min`} onClick={() => setStation('DELAYED')} />
          <StatCard label="Bill requests" value={billReq} icon={<Receipt className="h-5 w-5" />} tone={billReq ? 'warning' : 'neutral'} onClick={() => setStation('BILL')} />
        </div>
        <div className="flex flex-col lg:flex-row gap-2 lg:items-center">
          <SegmentedControl size="sm" value={station} onChange={setStation} options={[{ value: 'ALL', label: 'All' }, { value: 'KITCHEN', label: 'Kitchen' }, { value: 'BAR', label: 'Bar' }, { value: 'DELAYED', label: 'Delayed' }, { value: 'BILL', label: 'Billing' }]} />
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
      {q.data && <DataTable columns={columns} rows={rows} rowKey={(o) => o.id} onRowClick={(o) => navigate(`/admin/orders/${o.id}`)} pageSize={50} emptyTitle="No active orders" emptyDescription={dq2 || status || waiter || floor || station !== 'ALL' ? 'Try clearing the filters.' : 'New orders will appear here automatically.'}
        mobileCard={(o) => <div className="flex items-center gap-3"><div className="min-w-0 flex-1"><p className="font-semibold">{o.tableName} <span className="text-caption font-normal text-neutral-500">{o.orderNumber}</span></p><div className="mt-1 flex flex-wrap gap-1"><StatusBadge kind="order" status={o.status} size="sm" />{isDelayed(o) && <Badge tone="danger" size="sm">{waitMins(o)} min</Badge>}</div></div><span className="tabular-nums font-medium">{money(o.subtotal)}</span></div>} />}
    </div>
  );
}
