import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, AlertTriangle, CalendarClock, ChevronRight, X, ThumbsUp, Truck, PackageCheck } from 'lucide-react';
import { usePurchaseOrders, usePurchasingMutations } from '@/features/p2/hooks';
import { usePermission } from '@/hooks/useAuth';
import { useDebounce } from '@/hooks/useRealtime';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useWorkspace } from '@/hooks/useSurface';
import { HeaderSearch } from '@/components/layout/Shell';
import { ReceiveModal } from './PurchaseOrderPage';
import { PageHeader, Button, IconButton, DataTable, StatusBadge, SearchInput, FilterSelect, FilterChips, Tabs, StatCard, Avatar, InlineError, LoadingState, ErrorState, type Column } from '@/components/ui';
import { ApiError } from '@/services/api/client';
import { money, round2 } from '@/utils/money';
import { fmtDate, todayInput } from '@/utils/date';
import { PO_STATUS } from '@/config/statuses';
import type { PurchaseOrder, PoStatus, ID } from '@/types';

/** Buckets that describe what the buyer has to do next, plus exact-status drill-downs. */
type View = 'ALL' | 'APPROVAL' | 'DELIVERY' | 'OVERDUE' | PoStatus;

const AWAITING_APPROVAL: PoStatus[] = ['DRAFT', 'SENT'];
const AWAITING_DELIVERY: PoStatus[] = ['APPROVED', 'ORDERED', 'PARTIALLY_RECEIVED'];
const CLOSED: PoStatus[] = ['RECEIVED', 'CANCELLED'];

/* The states the document screen's own next-step logic approves and receives from — the same
   sets the mock engine enforces (`APPROVE` from DRAFT or SENT; goods received against APPROVED,
   ORDERED or PARTIALLY_RECEIVED). Nothing here decides a transition the document does not. */
const APPROVABLE: PoStatus[] = ['DRAFT', 'SENT'];
const RECEIVABLE: PoStatus[] = ['APPROVED', 'ORDERED', 'PARTIALLY_RECEIVED'];

const isOverdue = (p: PurchaseOrder, today: string) =>
  !!p.expectedDate && p.expectedDate < today && !CLOSED.includes(p.status);

/** ISO timestamp → the `yyyy-mm-dd` a date input speaks. */
const dayOf = (iso: string) => iso.slice(0, 10);

/** Share of ordered quantity that has arrived, from the order's own lines. */
const receivedShare = (p: PurchaseOrder) => {
  const qty = p.items.reduce((a, i) => a + i.qty, 0);
  const r = p.items.reduce((a, i) => a + i.receivedQty, 0);
  return qty ? Math.round((r * 100) / qty) : 0;
};

/**
 * THE SELECTED ORDER — the summary card the reference draws at the foot of the list.
 *
 * Everything on it is a field of the row that was clicked: the document number, its status,
 * the supplier, the two dates and the total, set large because it is the figure a buyer signs
 * off. The gold button is the order's REAL next step, and only when the signed-in role holds
 * the permission for it: Approve calls the same transition the document screen calls, and
 * Receive goods opens the same receiving dialog, line by line. An order whose next step belongs
 * to someone else simply has no gold button — the outline "View items" opens the document.
 */
function SelectedOrder({ p, today, canApprove, canReceive, busy, error, onApprove, onReceive, onOpen }: {
  p: PurchaseOrder;
  today: string;
  canApprove: boolean;
  canReceive: boolean;
  busy: boolean;
  error: string | null;
  onApprove: () => void;
  onReceive: () => void;
  onOpen: () => void;
}) {
  const late = isOverdue(p, today);
  const pct = receivedShare(p);
  const approvable = canApprove && APPROVABLE.includes(p.status);
  const receivable = canReceive && RECEIVABLE.includes(p.status);
  return (
    <section aria-label={`Selected purchase order ${p.poNumber}`} className="card material-gloss border-bronze/30 p-5 anim-enter-soft min-w-0">
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <h2 className="text-subheading tnum text-neutral-900 break-words">{p.poNumber}</h2>
        <StatusBadge kind="po" status={p.status} size="sm" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <dl className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4 text-sm min-w-0">
          <div className="min-w-0">
            <dt className="text-label uppercase text-neutral-500">Supplier</dt>
            <dd className="mt-1.5 flex items-center gap-2.5 min-w-0">
              <Avatar name={p.supplierName} variant="record" square size="sm" />
              <span className="min-w-0">
                <span className="block font-medium text-neutral-900 truncate">{p.supplierName}</span>
                <span className="block text-caption text-neutral-500 truncate">{p.supplierCode}</span>
              </span>
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-label uppercase text-neutral-500">Order date</dt>
            <dd className="mt-1.5 font-medium text-neutral-900 tnum">{fmtDate(p.createdAt)}</dd>
            <dd className="text-caption text-neutral-500 truncate">{p.createdByName ? `Raised by ${p.createdByName}` : `${p.items.length} line${p.items.length === 1 ? '' : 's'}`}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-label uppercase text-neutral-500">Expected delivery</dt>
            <dd className={late ? 'mt-1.5 inline-flex items-center gap-1.5 font-semibold text-danger-700 tnum' : 'mt-1.5 font-medium text-neutral-900 tnum'}>
              {late && <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />}
              {p.expectedDate ? fmtDate(p.expectedDate) : <span className="font-normal text-neutral-400">Not set</span>}
              {late && <span className="sr-only"> — overdue</span>}
            </dd>
            <dd className="text-caption text-neutral-500 tnum">{pct}% received</dd>
          </div>
        </dl>

        <div className="flex flex-col items-start lg:items-end gap-3 shrink-0 min-w-0">
          <div className="lg:text-right">
            <p className="text-label uppercase text-neutral-500">Total amount</p>
            <p className="text-metric tnum text-neutral-900">{money(p.grandTotal)}</p>
            <p className="text-caption text-neutral-500 tnum">{p.items.length} line{p.items.length === 1 ? '' : 's'} · tax {money(p.taxTotal)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" rightIcon={<ChevronRight className="h-4 w-4" />} onClick={onOpen}>View items</Button>
            {approvable && <Button leftIcon={<ThumbsUp className="h-4 w-4" />} loading={busy} onClick={onApprove}>Approve</Button>}
            {receivable && <Button leftIcon={<PackageCheck className="h-4 w-4" />} onClick={onReceive}>Receive goods</Button>}
          </div>
        </div>
      </div>
      <InlineError message={error} />
    </section>
  );
}

export default function PurchaseOrdersPage() {
  const ws = useWorkspace();
  const navigate = useNavigate();
  const canManage = usePermission('purchases:manage');
  const canApprove = usePermission('purchases:approve');
  const canReceive = usePermission('purchases:receive');
  const { transitionPo } = usePurchasingMutations();
  const [view, setView] = useState<View>('ALL');
  const [search, setSearch] = useState('');
  const [supplier, setSupplier] = useState<'' | ID>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const dq = useDebounce(search, 250);
  /*
   * SELECTION. At `md` and above the list is a table and a click on a row selects it, which
   * brings the summary card up beneath the table with the order's next step on it; the chevron
   * on the row and the card's "View items" open the document. Below `md` the list is a stack of
   * cards with nothing beneath them to select INTO, so a tap opens the document directly, exactly
   * as it always has.
   */
  const tableView = useMediaQuery('(min-width: 768px)');
  const [selectedId, setSelectedId] = useState<ID | null>(null);
  const [receiveFor, setReceiveFor] = useState<PurchaseOrder | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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

  /* The selected order is looked up in the rows on screen, so a filter that hides it also
     takes its card away — the card never describes an order the list is not showing. After a
     transition the list refetches and the card reprints the order in its new state. */
  const selected = useMemo(() => rows.find((p) => p.id === selectedId) ?? null, [rows, selectedId]);

  const filtered = view !== 'ALL' || supplier !== '' || !!from || !!to;
  const clearAll = () => { setView('ALL'); setSupplier(''); setFrom(''); setTo(''); };

  const approve = async (p: PurchaseOrder) => {
    setActionError(null);
    try { await transitionPo.mutateAsync({ id: p.id, action: 'APPROVE' }); }
    catch (e) { setActionError(ApiError.from(e).message); }
  };

  const expectedCell = (p: PurchaseOrder) => {
    if (!p.expectedDate) return <span className="text-neutral-400">Not set</span>;
    const late = isOverdue(p, today);
    return (
      <span className={late ? 'inline-flex items-center gap-1.5 font-semibold text-danger-700 tnum' : 'text-neutral-700 tnum'}>
        {late && <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />}
        {fmtDate(p.expectedDate)}
        {late && <span className="sr-only"> — overdue</span>}
      </span>
    );
  };

  const received = (p: PurchaseOrder) => receivedShare(p);

  const columns: Column<PurchaseOrder>[] = [
    /* The document number leads, in the tabular figures every other number on this screen uses,
       with what the order IS underneath it: how many lines, and who raised them. */
    { key: 'po', header: 'PO number', sortValue: (p) => p.poNumber, render: (p) => (
      <span className="block min-w-0">
        <span className="block font-medium tnum tracking-tight text-neutral-900">{p.poNumber}</span>
        <span className="block text-caption text-neutral-500 truncate">{p.items.length} line{p.items.length === 1 ? '' : 's'}{p.createdByName ? ` · ${p.createdByName}` : ''}</span>
      </span>
    ) },
    /* The supplier's initials tile beside the name — the reference's row, and the same quiet
       `record` tile the supplier directory uses, so a column of them never out-shouts the gold. */
    { key: 'supplier', header: 'Supplier', sortValue: (p) => p.supplierName, render: (p) => (
      <span className="flex items-center gap-2.5 min-w-0">
        <Avatar name={p.supplierName} variant="record" square size="sm" />
        <span className="min-w-0 truncate text-neutral-800">{p.supplierName}</span>
      </span>
    ) },
    { key: 'created', header: 'Order date', sortValue: (p) => p.createdAt, render: (p) => <span className="text-neutral-700 tnum whitespace-nowrap">{fmtDate(p.createdAt)}</span> },
    { key: 'expected', header: 'Expected delivery', sortValue: (p) => p.expectedDate ?? '9999-99-99', render: expectedCell },
    { key: 'recv', header: 'Received', align: 'right', hideBelow: 'lg', sortValue: received, render: (p) => <span className="tnum text-neutral-600">{received(p)}%</span> },
    { key: 'total', header: 'Amount', align: 'right', sortValue: (p) => p.grandTotal, render: (p) => <span className="tnum font-medium text-neutral-900 whitespace-nowrap">{money(p.grandTotal)}</span> },
    { key: 'status', header: 'Status', sortValue: (p) => p.status, render: (p) => <StatusBadge kind="po" status={p.status} size="sm" /> },
    { key: 'actions', header: <span className="sr-only">Actions</span>, align: 'right', render: (p) => (
      <span className="flex justify-end" onClick={(e) => e.stopPropagation()}>
        <IconButton label={`Open ${p.poNumber}`} size="sm" onClick={() => navigate(`/admin/purchases/${p.id}`)}><ChevronRight className="h-4 w-4" /></IconButton>
      </span>
    ) },
  ];

  const mobileCard = (p: PurchaseOrder) => (
    <div className="space-y-2 min-w-0">
      <div className="flex items-start gap-3 min-w-0">
        <Avatar name={p.supplierName} variant="record" square size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block font-medium tnum text-neutral-900 truncate">{p.poNumber}</span>
          <span className="block text-caption text-neutral-500 truncate">{p.supplierName}</span>
        </span>
        <StatusBadge kind="po" status={p.status} size="sm" className="shrink-0" />
      </div>
      <div className="flex items-center justify-between gap-2 text-sm min-w-0">
        <span className="inline-flex items-center gap-1.5 text-neutral-600 min-w-0">
          <CalendarClock className="h-3.5 w-3.5 shrink-0 text-neutral-400" aria-hidden />
          {expectedCell(p)}
        </span>
        <span className="tnum font-semibold text-neutral-900 shrink-0">{money(p.grandTotal)}</span>
      </div>
      <p className="text-caption text-neutral-500 tnum">{fmtDate(p.createdAt)} · {p.items.length} line{p.items.length === 1 ? '' : 's'} · {received(p)}% received</p>
    </div>
  );

  const dateField = 'input-base h-9 min-h-0 w-full sm:w-auto text-xs';

  /* The lifecycle buckets with the counts computed above — the only counts this screen has. An
     exact status chosen from the select below leaves no bucket pressed, which is honest: an exact
     status is not one of these buckets. */
  const bucketOptions = [
    { value: 'ALL' as View, label: 'All orders', count: bucketView ? all.length : undefined },
    { value: 'APPROVAL' as View, label: 'Awaiting approval', count: bucketView ? counts.approval : undefined },
    { value: 'DELIVERY' as View, label: 'Awaiting delivery', count: bucketView ? counts.delivery : undefined },
    { value: 'OVERDUE' as View, label: 'Overdue', count: bucketView ? counts.overdue : undefined },
  ];

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
         * printed while the complete set is loaded — see `counts` above.
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
              options={bucketOptions}
            />
          ) : (
            <FilterChips<View>
              ariaLabel="Purchase order lifecycle"
              value={view}
              onChange={setView}
              options={bucketOptions}
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
            <p className="text-caption text-neutral-500 tnum sm:ml-auto" aria-live="polite">
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
          onRowClick={(p) => (tableView ? setSelectedId(p.id) : navigate(`/admin/purchases/${p.id}`))}
          rowClassName={(p) => (p.id === selectedId ? 'bg-primary-50' : undefined)}
          initialSort={{ key: 'created', dir: 'desc' }}
          caption="Purchase orders with supplier, order date, expected delivery, amount and status"
          emptyTitle={view === 'OVERDUE' ? 'Nothing overdue' : 'No purchase orders'}
          emptyDescription={filtered ? 'No orders match these filters.' : undefined}
          emptyAction={filtered
            ? <Button variant="outline" onClick={clearAll}>Show all purchase orders</Button>
            : canManage ? <Button variant="outline" onClick={() => navigate('/admin/purchases/new')}>New purchase order</Button> : undefined}
        />
      )}

      {/* The card is keyed on the selected order, so it enters once per selection — a user's
          click — and never replays when the list refetches underneath it. Below `md` a tap has
          already opened the document, so there is nothing to draw here. */}
      {selected && (
        <div className="hidden md:block mt-4">
          <SelectedOrder
            key={selected.id}
            p={selected}
            today={today}
            canApprove={canApprove}
            canReceive={canReceive}
            busy={transitionPo.isPending}
            error={actionError}
            onApprove={() => void approve(selected)}
            onReceive={() => setReceiveFor(selected)}
            onOpen={() => navigate(`/admin/purchases/${selected.id}`)}
          />
        </div>
      )}

      {receiveFor && <ReceiveModal po={receiveFor} onClose={() => setReceiveFor(null)} />}
    </div>
  );
}
