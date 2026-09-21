import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, AlertTriangle, CalendarClock, ChevronRight, X, ThumbsUp, Truck } from 'lucide-react';
import { usePurchaseOrders } from '@/features/p2/hooks';
import { usePermission } from '@/hooks/useAuth';
import { useDebounce } from '@/hooks/useRealtime';
import { useWorkspace } from '@/hooks/useSurface';
import { HeaderSearch } from '@/components/layout/Shell';
import { PageHeader, Button, IconButton, DataTable, StatusBadge, SearchInput, FilterSelect, SegmentedControl, Tabs, StatCard, LoadingState, ErrorState, type Column } from '@/components/ui';
import { money, round2 } from '@/utils/money';
import { fmtDate, todayInput } from '@/utils/date';
import { PO_STATUS } from '@/config/statuses';
import type { PurchaseOrder, PoStatus, ID } from '@/types';

/** Buckets that describe what the buyer has to do next, plus exact-status drill-downs. */
type View = 'ALL' | 'APPROVAL' | 'DELIVERY' | 'OVERDUE' | PoStatus;

const AWAITING_APPROVAL: PoStatus[] = ['DRAFT', 'SENT'];
const AWAITING_DELIVERY: PoStatus[] = ['APPROVED', 'ORDERED', 'PARTIALLY_RECEIVED'];
const CLOSED: PoStatus[] = ['RECEIVED', 'CANCELLED'];

const isOverdue = (p: PurchaseOrder, today: string) =>
  !!p.expectedDate && p.expectedDate < today && !CLOSED.includes(p.status);

/** ISO timestamp → the `yyyy-mm-dd` a date input speaks. */
const dayOf = (iso: string) => iso.slice(0, 10);

export default function PurchaseOrdersPage() {
  const ws = useWorkspace();
  const navigate = useNavigate();
  const canManage = usePermission('purchases:manage');
  const [view, setView] = useState<View>('ALL');
  const [search, setSearch] = useState('');
  const [supplier, setSupplier] = useState<'' | ID>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const dq = useDebounce(search, 250);

  // Buckets are client-side slices of the unfiltered list; an exact status is filtered server side.
  const bucketView = view === 'ALL' || view === 'APPROVAL' || view === 'DELIVERY' || view === 'OVERDUE';
  const q = usePurchaseOrders({ search: dq || undefined, status: bucketView ? undefined : (view as PoStatus) });

  const today = todayInput();
  const all = useMemo(() => q.data ?? [], [q.data]);

  // Counts come only from the rows this screen already fetched, and only when that set is
  // complete — an exact-status drill-down holds a subset, and counting it would be a lie.
  const counts = useMemo(() => ({
    approval: all.filter((p) => AWAITING_APPROVAL.includes(p.status)).length,
    delivery: all.filter((p) => AWAITING_DELIVERY.includes(p.status)).length,
    overdue: all.filter((p) => isOverdue(p, today)).length,
  }), [all, today]);

  /**
   * THE MANAGER BOARD (panel 20) — the money behind each of those three counts.
   *
   * Each total is the sum of `grandTotal` on exactly the orders that count counted, so the tile's
   * figure and its count are the same set of rows. Like the counts above, they are only real while
   * the COMPLETE list is loaded: an exact-status drill-down holds a subset, and a "money awaiting
   * approval" figure taken from a subset would be a lie. The tiles are therefore drawn only in the
   * bucket views, which is where the numbers mean what they say.
   */
  const totals = useMemo(() => {
    const sum = (rowsIn: PurchaseOrder[]) => round2(rowsIn.reduce((a, p) => a + p.grandTotal, 0));
    return {
      approval: sum(all.filter((p) => AWAITING_APPROVAL.includes(p.status))),
      delivery: sum(all.filter((p) => AWAITING_DELIVERY.includes(p.status))),
      overdue: sum(all.filter((p) => isOverdue(p, today))),
    };
  }, [all, today]);

  /** Every supplier that actually raised one of the loaded orders. Never a second fetch. */
  const supplierOptions = useMemo(() => {
    const seen = new Map<ID, string>();
    all.forEach((p) => { if (!seen.has(p.supplierId)) seen.set(p.supplierId, p.supplierName); });
    return [...seen.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([value, label]) => ({ value, label }));
  }, [all]);

  const rows = useMemo(() => {
    let out = all;
    if (view === 'APPROVAL') out = out.filter((p) => AWAITING_APPROVAL.includes(p.status));
    if (view === 'DELIVERY') out = out.filter((p) => AWAITING_DELIVERY.includes(p.status));
    if (view === 'OVERDUE') out = out.filter((p) => isOverdue(p, today));
    if (supplier !== '') out = out.filter((p) => p.supplierId === supplier);
    if (from) out = out.filter((p) => dayOf(p.createdAt) >= from);
    if (to) out = out.filter((p) => dayOf(p.createdAt) <= to);
    return out;
  }, [all, view, today, supplier, from, to]);

  const filtered = view !== 'ALL' || supplier !== '' || !!from || !!to;
  const clearAll = () => { setView('ALL'); setSupplier(''); setFrom(''); setTo(''); };

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
    /* The document number leads, in the tabular figures every other number on this screen uses,
       with what the order IS underneath it: how many lines, and who raised them. */
    { key: 'po', header: 'PO number', sortValue: (p) => p.poNumber, render: (p) => (
      <span className="block min-w-0">
        <span className="block font-medium tabular-nums tracking-tight text-neutral-900">{p.poNumber}</span>
        <span className="block text-caption text-neutral-500 truncate">{p.items.length} line{p.items.length === 1 ? '' : 's'}{p.createdByName ? ` · ${p.createdByName}` : ''}</span>
      </span>
    ) },
    { key: 'supplier', header: 'Supplier', sortValue: (p) => p.supplierName, render: (p) => <span className="text-neutral-800">{p.supplierName}</span> },
    { key: 'created', header: 'Order date', sortValue: (p) => p.createdAt, render: (p) => <span className="text-neutral-700">{fmtDate(p.createdAt)}</span> },
    { key: 'expected', header: 'Expected delivery', sortValue: (p) => p.expectedDate ?? '9999-99-99', render: expectedCell },
    { key: 'recv', header: 'Received', align: 'right', hideBelow: 'lg', sortValue: received, render: (p) => <span className="tabular-nums text-neutral-600">{received(p)}%</span> },
    { key: 'total', header: 'Amount', align: 'right', sortValue: (p) => p.grandTotal, render: (p) => <span className="tabular-nums font-medium">{money(p.grandTotal)}</span> },
    { key: 'status', header: 'Status', sortValue: (p) => p.status, render: (p) => <StatusBadge kind="po" status={p.status} size="sm" /> },
    { key: 'actions', header: '', align: 'right', render: (p) => (
      <span className="flex justify-end" onClick={(e) => e.stopPropagation()}>
        <IconButton label={`Open ${p.poNumber}`} size="sm" onClick={() => navigate(`/admin/purchases/${p.id}`)}><ChevronRight className="h-4 w-4" /></IconButton>
      </span>
    ) },
  ];

  const mobileCard = (p: PurchaseOrder) => (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block font-medium tabular-nums text-neutral-900 truncate">{p.poNumber}</span>
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
      <p className="text-caption text-neutral-500">{fmtDate(p.createdAt)} · {p.items.length} lines · {received(p)}% received</p>
    </div>
  );

  const dateField = 'input-base h-9 min-h-0 w-full sm:w-auto text-xs';

  return (
    <div>
      <HeaderSearch>
        <SearchInput value={search} onChange={setSearch} placeholder="Search purchase orders, supplier…" className="w-full max-w-md" />
      </HeaderSearch>

      <PageHeader
        title="Purchase orders"
        subtitle="Draft → sent → approved → ordered → received"
        actions={canManage && <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => navigate('/admin/purchases/new')}>New purchase order</Button>}
      >
        {/*
         * LIFECYCLE FIRST, then the filters. The counts are the buyer's workload, and they are only
         * printed while the complete set is loaded — see `counts` above. Selecting an exact status
         * from the select below leaves no segment pressed, which is honest: an exact status is not
         * one of these buckets.
         */}
        <div className="space-y-3">
          {/* The manager board leads with the three lifecycle summaries, then the same buckets as
              tabs. Base `grid-cols-1` with `minmax(0,1fr)` tracks above it. */}
          {ws === 'manager' && bucketView && q.data && (
            <div className="grid grid-cols-1 xs:grid-cols-[repeat(3,minmax(0,1fr))] gap-3">
              <StatCard
                label="Awaiting approval" value={counts.approval}
                icon={<ThumbsUp className="h-5 w-5" />} tone={counts.approval ? 'warning' : 'neutral'}
                hint={`${money(totals.approval)} on these orders`}
                onClick={() => setView('APPROVAL')}
              />
              <StatCard
                label="Awaiting delivery" value={counts.delivery}
                icon={<Truck className="h-5 w-5" />} tone={counts.delivery ? 'info' : 'neutral'}
                hint={`${money(totals.delivery)} on these orders`}
                onClick={() => setView('DELIVERY')}
              />
              <StatCard
                label="Overdue" value={counts.overdue}
                icon={<AlertTriangle className="h-5 w-5" />} tone={counts.overdue ? 'danger' : 'success'}
                hint={counts.overdue ? `${money(totals.overdue)} past its expected date` : 'Nothing past its expected date'}
                onClick={() => setView('OVERDUE')}
              />
            </div>
          )}
          {ws === 'manager' ? (
            <Tabs<View>
              ariaLabel="Purchase order lifecycle"
              value={view}
              onChange={setView}
              options={[
                { value: 'ALL', label: 'All orders', count: bucketView ? all.length : undefined },
                { value: 'APPROVAL', label: 'Awaiting approval', count: bucketView ? counts.approval : undefined },
                { value: 'DELIVERY', label: 'Awaiting delivery', count: bucketView ? counts.delivery : undefined },
                { value: 'OVERDUE', label: 'Overdue', count: bucketView ? counts.overdue : undefined },
              ]}
            />
          ) : (
          <SegmentedControl<View>
            size="sm"
            ariaLabel="Purchase order lifecycle"
            value={view}
            onChange={setView}
            className="max-w-full"
            options={[
              { value: 'ALL', label: 'All orders', count: bucketView ? all.length : undefined },
              { value: 'APPROVAL', label: 'Awaiting approval', count: bucketView ? counts.approval : undefined },
              { value: 'DELIVERY', label: 'Awaiting delivery', count: bucketView ? counts.delivery : undefined },
              { value: 'OVERDUE', label: 'Overdue', count: bucketView ? counts.overdue : undefined },
            ]}
          />
          )}

          <div className="flex flex-wrap items-center gap-2">
            <FilterSelect
              ariaLabel="Filter purchase orders by supplier"
              className="w-full sm:w-52"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value ? Number(e.target.value) : '')}
              placeholder="Any supplier"
              options={supplierOptions}
            />
            <FilterSelect
              ariaLabel="Filter by purchase order status"
              className="w-full sm:w-48"
              value={bucketView ? '' : view}
              onChange={(e) => setView((e.target.value || 'ALL') as View)}
              placeholder="Any status"
              options={(['DRAFT', 'SENT', 'APPROVED', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'] as PoStatus[]).map((s) => ({ value: s, label: PO_STATUS[s].label }))}
            />
            {/* The range is applied to the order date, which is the column it sits above. */}
            <span className="flex items-center gap-1.5">
              <input type="date" aria-label="Ordered from" className={dateField} value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
              <span className="text-caption text-neutral-400" aria-hidden>to</span>
              <input type="date" aria-label="Ordered to" className={dateField} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
            </span>
            {filtered && (
              <Button variant="ghost" size="sm" leftIcon={<X className="h-4 w-4" />} onClick={clearAll}>Clear filters</Button>
            )}
            <p className="text-caption text-neutral-500 tabular-nums sm:ml-auto" aria-live="polite">
              {rows.length} purchase order{rows.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
      </PageHeader>

      {q.isLoading && <LoadingState variant="table" rows={6} />}
      {q.isError && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}

      {q.data && (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(p) => p.id}
          mobileCard={mobileCard}
          onRowClick={(p) => navigate(`/admin/purchases/${p.id}`)}
          initialSort={{ key: 'created', dir: 'desc' }}
          caption="Purchase orders with supplier, order date, expected delivery, amount and status"
          emptyTitle={view === 'OVERDUE' ? 'Nothing overdue' : 'No purchase orders'}
          emptyDescription={filtered ? 'No orders match these filters.' : undefined}
          emptyAction={filtered
            ? <Button variant="outline" onClick={clearAll}>Show all purchase orders</Button>
            : canManage ? <Button variant="outline" onClick={() => navigate('/admin/purchases/new')}>New purchase order</Button> : undefined}
        />
      )}
    </div>
  );
}
