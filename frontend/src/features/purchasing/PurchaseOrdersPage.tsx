import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, AlertTriangle, ThumbsUp, Truck, CalendarClock, X } from 'lucide-react';
import { usePurchaseOrders } from '@/features/p2/hooks';
import { usePermission } from '@/hooks/useAuth';
import { useDebounce } from '@/hooks/useRealtime';
import { PageHeader, Button, DataTable, StatusBadge, SearchInput, FilterSelect, StatCard, LoadingState, ErrorState, Badge, type Column } from '@/components/ui';
import { money } from '@/utils/money';
import { fmtDate, fmtRelative, todayInput } from '@/utils/date';
import { PO_STATUS } from '@/config/statuses';
import type { PurchaseOrder, PoStatus } from '@/types';

/** Buckets that describe what the buyer has to do next, plus exact-status drill-downs. */
type View = 'ALL' | 'APPROVAL' | 'DELIVERY' | 'OVERDUE' | PoStatus;

const AWAITING_APPROVAL: PoStatus[] = ['DRAFT', 'SENT'];
const AWAITING_DELIVERY: PoStatus[] = ['APPROVED', 'ORDERED', 'PARTIALLY_RECEIVED'];
const CLOSED: PoStatus[] = ['RECEIVED', 'CANCELLED'];

const isOverdue = (p: PurchaseOrder, today: string) =>
  !!p.expectedDate && p.expectedDate < today && !CLOSED.includes(p.status);

export default function PurchaseOrdersPage() {
  const navigate = useNavigate();
  const canManage = usePermission('purchases:manage');
  const [view, setView] = useState<View>('ALL');
  const [search, setSearch] = useState('');
  const dq = useDebounce(search, 250);

  // Buckets are client-side slices of the unfiltered list; an exact status is filtered server side.
  const bucketView = view === 'ALL' || view === 'APPROVAL' || view === 'DELIVERY' || view === 'OVERDUE';
  const q = usePurchaseOrders({ search: dq || undefined, status: bucketView ? undefined : (view as PoStatus) });

  const today = todayInput();
  const all = useMemo(() => q.data ?? [], [q.data]);

  // Counts come only from the rows this screen already fetched, and only when that set is complete.
  const counts = useMemo(() => ({
    approval: all.filter((p) => AWAITING_APPROVAL.includes(p.status)).length,
    delivery: all.filter((p) => AWAITING_DELIVERY.includes(p.status)).length,
    overdue: all.filter((p) => isOverdue(p, today)).length,
  }), [all, today]);

  const rows = useMemo(() => {
    if (view === 'APPROVAL') return all.filter((p) => AWAITING_APPROVAL.includes(p.status));
    if (view === 'DELIVERY') return all.filter((p) => AWAITING_DELIVERY.includes(p.status));
    if (view === 'OVERDUE') return all.filter((p) => isOverdue(p, today));
    return all;
  }, [all, view, today]);

  const expectedCell = (p: PurchaseOrder) => {
    if (!p.expectedDate) return <span className="text-neutral-400">Not set</span>;
    const late = isOverdue(p, today);
    return (
      <span className={late ? 'inline-flex items-center gap-1.5 font-semibold text-danger-700' : 'text-neutral-700'}>
        {late && <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />}
        {fmtDate(p.expectedDate)}
        {late && <span className="sr-only"> — overdue</span>}
      </span>
    );
  };

  const received = (p: PurchaseOrder) => {
    const qty = p.items.reduce((a, i) => a + i.qty, 0);
    const r = p.items.reduce((a, i) => a + i.receivedQty, 0);
    return qty ? Math.round((r * 100) / qty) : 0;
  };

  const columns: Column<PurchaseOrder>[] = [
    { key: 'po', header: 'PO', sortValue: (p) => p.poNumber, render: (p) => <span className="font-medium">{p.poNumber}<span className="block text-caption font-normal text-neutral-500">{p.items.length} lines · {p.createdByName}</span></span> },
    { key: 'supplier', header: 'Supplier', sortValue: (p) => p.supplierName, render: (p) => p.supplierName },
    { key: 'status', header: 'Status', sortValue: (p) => p.status, render: (p) => <StatusBadge kind="po" status={p.status} size="sm" /> },
    { key: 'expected', header: 'Expected delivery', sortValue: (p) => p.expectedDate ?? '9999-99-99', render: expectedCell },
    { key: 'created', header: 'Created', hideBelow: 'lg', sortValue: (p) => p.createdAt, render: (p) => <span title={fmtDate(p.createdAt)}>{fmtRelative(p.createdAt)}</span> },
    { key: 'recv', header: 'Received', align: 'right', hideBelow: 'md', sortValue: received, render: (p) => <span className="tabular-nums text-neutral-600">{received(p)}%</span> },
    { key: 'total', header: 'Total', align: 'right', sortValue: (p) => p.grandTotal, render: (p) => <span className="tabular-nums font-medium">{money(p.grandTotal)}</span> },
  ];

  const mobileCard = (p: PurchaseOrder) => (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block font-medium text-neutral-900 truncate">{p.poNumber}</span>
          <span className="block text-caption text-neutral-500 truncate">{p.supplierName}</span>
        </span>
        <StatusBadge kind="po" status={p.status} size="sm" />
      </div>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="inline-flex items-center gap-1.5 text-neutral-600">
          <CalendarClock className="h-3.5 w-3.5 shrink-0 text-neutral-400" aria-hidden />
          {expectedCell(p)}
        </span>
        <span className="tabular-nums font-semibold">{money(p.grandTotal)}</span>
      </div>
      <p className="text-caption text-neutral-500">{p.items.length} lines · {received(p)}% received</p>
    </div>
  );

  const bucketLabel: Partial<Record<View, string>> = {
    APPROVAL: 'Awaiting approval',
    DELIVERY: 'Awaiting delivery',
    OVERDUE: 'Overdue delivery',
  };

  return (
    <div>
      <PageHeader
        title="Purchase orders"
        subtitle="Draft → sent → approved → ordered → received"
        actions={canManage && <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => navigate('/admin/purchases/new')}>New purchase order</Button>}
      >
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <SearchInput value={search} onChange={setSearch} placeholder="PO number or supplier" className="sm:w-72" />
          <FilterSelect
            ariaLabel="Filter by purchase order status"
            className="sm:w-56"
            value={bucketView ? '' : view}
            onChange={(e) => setView((e.target.value || 'ALL') as View)}
            placeholder="Any status"
            options={(['DRAFT', 'SENT', 'APPROVED', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'] as PoStatus[]).map((s) => ({ value: s, label: PO_STATUS[s].label }))}
          />
          {view !== 'ALL' && (
            <Button variant="ghost" size="sm" className="min-h-touch self-start sm:self-auto" leftIcon={<X className="h-4 w-4" />} onClick={() => setView('ALL')}>
              Clear filter
            </Button>
          )}
        </div>
      </PageHeader>

      {q.isLoading && <LoadingState variant="table" rows={6} />}
      {q.isError && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}

      {q.data && (
        <>
          {bucketView && (
            <div className="grid grid-cols-1 xs:grid-cols-3 gap-3 mb-4">
              <StatCard
                label="Awaiting approval"
                value={counts.approval}
                tone="info"
                icon={<ThumbsUp className="h-5 w-5" />}
                hint={view === 'APPROVAL' ? 'Showing these' : 'Draft and sent'}
                onClick={() => setView(view === 'APPROVAL' ? 'ALL' : 'APPROVAL')}
                className={view === 'APPROVAL' ? 'border-primary-600 ring-1 ring-primary-600' : undefined}
              />
              <StatCard
                label="Awaiting delivery"
                value={counts.delivery}
                tone="primary"
                icon={<Truck className="h-5 w-5" />}
                hint={view === 'DELIVERY' ? 'Showing these' : 'Approved, ordered, part received'}
                onClick={() => setView(view === 'DELIVERY' ? 'ALL' : 'DELIVERY')}
                className={view === 'DELIVERY' ? 'border-primary-600 ring-1 ring-primary-600' : undefined}
              />
              <StatCard
                label="Overdue"
                value={counts.overdue}
                tone={counts.overdue > 0 ? 'danger' : 'neutral'}
                icon={<AlertTriangle className="h-5 w-5" />}
                hint={view === 'OVERDUE' ? 'Showing these' : 'Expected date has passed'}
                onClick={() => setView(view === 'OVERDUE' ? 'ALL' : 'OVERDUE')}
                className={view === 'OVERDUE' ? 'border-primary-600 ring-1 ring-primary-600' : undefined}
              />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 mb-3 text-sm text-neutral-600">
            <span className="tabular-nums">{rows.length} purchase order{rows.length === 1 ? '' : 's'}</span>
            {bucketLabel[view] && <Badge tone={view === 'OVERDUE' ? 'danger' : 'primary'} size="sm">{bucketLabel[view]}</Badge>}
            {!bucketView && <Badge tone="neutral" size="sm">{PO_STATUS[view as PoStatus].label}</Badge>}
          </div>

          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(p) => p.id}
            mobileCard={mobileCard}
            onRowClick={(p) => navigate(`/admin/purchases/${p.id}`)}
            initialSort={{ key: 'created', dir: 'desc' }}
            caption="Purchase orders with supplier, status, expected delivery and total"
            emptyTitle={view === 'OVERDUE' ? 'Nothing overdue' : 'No purchase orders'}
            emptyDescription={view === 'ALL' ? undefined : 'No orders match this filter.'}
            emptyAction={view !== 'ALL'
              ? <Button variant="outline" onClick={() => setView('ALL')}>Show all purchase orders</Button>
              : canManage ? <Button onClick={() => navigate('/admin/purchases/new')}>New purchase order</Button> : undefined}
          />
        </>
      )}
    </div>
  );
}
