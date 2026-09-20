import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Clock, Printer, Wallet, CheckCircle2, Undo2, FileText } from 'lucide-react';
import { useBills } from '@/features/billing/hooks';
import { useDateRange, DateRangeFilter } from '@/features/shared/DateRangeFilter';
import { useDebounce, useNow } from '@/hooks/useRealtime';
import { PageHeader, DataTable, StatusBadge, LoadingState, ErrorState, SearchInput, SegmentedControl, FilterSelect, Badge, Button, Alert, type Column } from '@/components/ui';
import { money } from '@/utils/money';
import { fmtDateTime, fmtRelative, fmtTime, elapsedMinutes } from '@/utils/date';
import { PAYMENT_METHOD_LABELS, DELAY_THRESHOLDS } from '@/config/statuses';
import { cn } from '@/utils/cn';
import type { Bill, PaymentMethod, PaymentStatus } from '@/types';

/**
 * One component, two genuinely different screens.
 *
 * `unpaid` is a worklist: how long each guest has been waiting, how much is still owed and
 * the one action that clears it. `paid` is a record: what was settled, by which tender, when,
 * and how to reprint it. Columns, default sort and empty states differ accordingly.
 */

/** Waiting time in words — minutes stop being readable after an hour. */
function ageLabel(mins: number): string {
  if (mins < 60) return `${mins} min`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  const d = Math.floor(mins / 1440);
  return `${d} day${d === 1 ? '' : 's'}`;
}

function AgeCell({ mins }: { mins: number }) {
  const late = mins >= DELAY_THRESHOLDS.late;
  const warn = !late && mins >= DELAY_THRESHOLDS.warn;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-sm font-medium tabular-nums whitespace-nowrap',
        late ? 'text-danger-700' : warn ? 'text-warning-700' : 'text-neutral-600',
      )}
    >
      {late ? <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />}
      {ageLabel(mins)}
      {late && <span className="sr-only"> — overdue</span>}
    </span>
  );
}

const successMethods = (b: Bill): PaymentMethod[] => [...new Set(b.payments.filter((p) => p.status === 'SUCCESS').map((p) => p.method))];

export default function BillsListPage({ mode }: { mode: 'unpaid' | 'paid' }) {
  const navigate = useNavigate();
  const now = useNow(30_000);
  const dr = useDateRange(mode === 'paid' ? 'today' : 'week');
  const [search, setSearch] = useState('');
  const dq = useDebounce(search, 250);
  const [ps, setPs] = useState<'ALL' | PaymentStatus>('ALL');
  const [method, setMethod] = useState<'' | PaymentMethod>('');
  const q = useBills({ search: dq || undefined, ...(mode === 'paid' ? { from: dr.range.from, to: dr.range.to } : {}) });

  /** The mode's own slice of the fetched list, before the in-page filters. */
  const scope = useMemo(
    () => (q.data ?? []).filter((b) => (mode === 'paid'
      ? b.paymentStatus === 'PAID' || b.paymentStatus === 'REFUNDED'
      : ['OPEN', 'FINALIZED'].includes(b.status) && b.paymentStatus !== 'PAID')),
    [q.data, mode],
  );

  const rows = useMemo(
    () => scope
      .filter((b) => (mode === 'unpaid' ? ps === 'ALL' || b.paymentStatus === ps : true))
      .filter((b) => (mode === 'paid' ? !method || successMethods(b).includes(method) : true)),
    [scope, mode, ps, method],
  );

  // Every figure below is a sum over rows this screen already fetched — nothing extra is queried.
  const waitFrom = (b: Bill) => b.finalizedAt ?? b.createdAt;
  const outstanding = useMemo(() => scope.reduce((a, b) => a + b.balanceDue, 0), [scope]);
  const overdue = useMemo(() => (mode === 'unpaid' ? scope.filter((b) => elapsedMinutes(waitFrom(b), now) >= DELAY_THRESHOLDS.late) : []), [scope, mode, now]);
  const settled = useMemo(() => scope.filter((b) => b.paymentStatus === 'PAID'), [scope]);
  const refunded = useMemo(() => scope.filter((b) => b.paymentStatus === 'REFUNDED'), [scope]);
  const taken = useMemo(() => settled.reduce((a, b) => a + b.grandTotal, 0), [settled]);
  /** Tender filter options come only from the tenders actually present in the fetched period. */
  const methodsPresent = useMemo(() => [...new Set(scope.flatMap(successMethods))], [scope]);

  const billCell: Column<Bill> = {
    key: 'bill',
    header: 'Bill',
    sortValue: (b) => b.billNumber,
    render: (b) => (
      <span className="font-medium">
        {b.billNumber}
        <span className="block text-caption font-normal text-neutral-500">{b.orderNumber} · {b.waiterName}</span>
      </span>
    ),
  };
  const tableCell: Column<Bill> = { key: 'table', header: 'Table', sortValue: (b) => b.tableName, render: (b) => <span className="font-semibold">{b.tableName}</span> };

  const goPay = (b: Bill) => (b.status === 'OPEN' ? `/cashier/bills/${b.id}` : `/cashier/bills/${b.id}/pay`);

  const unpaidColumns: Column<Bill>[] = [
    tableCell,
    billCell,
    {
      key: 'age',
      header: 'Waiting',
      // Sorted on the timestamp, not the live minute count, so the list does not reshuffle on a tick.
      sortValue: (b) => waitFrom(b),
      render: (b) => (
        <span title={fmtDateTime(waitFrom(b))}>
          <AgeCell mins={elapsedMinutes(waitFrom(b), now)} />
          <span className="block text-caption text-neutral-500">{b.finalizedAt ? 'since finalized' : 'since opened'}</span>
        </span>
      ),
    },
    {
      key: 'due',
      header: 'Balance due',
      align: 'right',
      sortValue: (b) => b.balanceDue,
      render: (b) => (
        <span>
          <span className="block tabular-nums font-semibold text-base text-danger-700">{money(b.balanceDue)}</span>
          {b.paidAmount > 0 && <span className="block text-caption text-neutral-500 tabular-nums">{money(b.paidAmount)} of {money(b.grandTotal)} taken</span>}
        </span>
      ),
    },
    { key: 'total', header: 'Bill total', align: 'right', hideBelow: 'lg', sortValue: (b) => b.grandTotal, render: (b) => <span className="tabular-nums text-neutral-600">{money(b.grandTotal)}</span> },
    {
      key: 'status',
      header: 'Status',
      hideBelow: 'md',
      sortValue: (b) => b.status,
      render: (b) => (
        <div className="flex gap-1 flex-wrap">
          <StatusBadge kind="bill" status={b.status} size="sm" />
          <StatusBadge kind="payment" status={b.paymentStatus} size="sm" hideIcon />
        </div>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Action</span>,
      align: 'right',
      render: (b) => (
        <Button
          size="sm"
          variant={b.status === 'OPEN' ? 'outline' : 'success'}
          className="min-h-touch"
          leftIcon={b.status === 'OPEN' ? <FileText className="h-4 w-4" /> : <Wallet className="h-4 w-4" />}
          onClick={(e) => { e.stopPropagation(); navigate(goPay(b)); }}
        >
          {b.status === 'OPEN' ? 'Open bill' : 'Take payment'}
        </Button>
      ),
    },
  ];

  const paidColumns: Column<Bill>[] = [
    {
      key: 'paid',
      header: 'Settled',
      sortValue: (b) => b.paidAt ?? '',
      render: (b) => (
        <span title={fmtDateTime(b.paidAt)}>
          <span className="block font-medium whitespace-nowrap">{fmtTime(b.paidAt)}</span>
          <span className="block text-caption text-neutral-500">{fmtRelative(b.paidAt)}</span>
        </span>
      ),
    },
    tableCell,
    billCell,
    {
      key: 'methods',
      header: 'Tendered by',
      sortValue: (b) => successMethods(b).join(','),
      render: (b) => {
        const ms = successMethods(b);
        return ms.length === 0
          ? <span className="text-neutral-400">—</span>
          : <div className="flex flex-wrap gap-1">{ms.map((mm) => <Badge key={mm} size="sm" tone={mm === 'COMPLIMENTARY' ? 'accent' : 'neutral'}>{PAYMENT_METHOD_LABELS[mm]}</Badge>)}</div>;
      },
    },
    { key: 'cashier', header: 'Cashier', hideBelow: 'lg', sortValue: (b) => b.cashierName, render: (b) => b.cashierName },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      sortValue: (b) => b.grandTotal,
      render: (b) => (
        <span>
          <span className={cn('block tabular-nums font-semibold', b.paymentStatus === 'REFUNDED' && 'text-neutral-400 line-through')}>{money(b.grandTotal)}</span>
          {b.discountTotal > 0 && <span className="block text-caption text-neutral-500 tabular-nums">incl. {money(b.discountTotal)} discount</span>}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Outcome',
      hideBelow: 'md',
      sortValue: (b) => b.paymentStatus,
      render: (b) => (b.paymentStatus === 'REFUNDED'
        ? <Badge tone="neutral" size="sm" icon={<Undo2 className="h-3.5 w-3.5" aria-hidden />}>Refunded</Badge>
        : <Badge tone="success" size="sm" icon={<CheckCircle2 className="h-3.5 w-3.5" aria-hidden />}>Paid in full</Badge>),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Action</span>,
      align: 'right',
      render: (b) => (
        <Button
          size="sm"
          variant="outline"
          className="min-h-touch"
          leftIcon={<Printer className="h-4 w-4" />}
          onClick={(e) => { e.stopPropagation(); navigate(`/cashier/bills/${b.id}/receipt`); }}
        >
          Receipt
        </Button>
      ),
    },
  ];

  const unpaidCard = (b: Bill) => (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-neutral-900">{b.tableName}</p>
          <p className="text-caption text-neutral-500 truncate">{b.billNumber} · {b.waiterName}</p>
        </div>
        <span className="text-right shrink-0">
          <span className="block tabular-nums font-semibold text-danger-700">{money(b.balanceDue)}</span>
          <span className="block text-caption text-neutral-500">balance due</span>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <AgeCell mins={elapsedMinutes(waitFrom(b), now)} />
        <StatusBadge kind="bill" status={b.status} size="sm" />
        <StatusBadge kind="payment" status={b.paymentStatus} size="sm" hideIcon />
      </div>
      <Button
        block
        variant={b.status === 'OPEN' ? 'outline' : 'success'}
        className="min-h-touch"
        leftIcon={b.status === 'OPEN' ? <FileText className="h-4 w-4" /> : <Wallet className="h-4 w-4" />}
        onClick={(e) => { e.stopPropagation(); navigate(goPay(b)); }}
      >
        {b.status === 'OPEN' ? 'Open bill' : `Take payment · ${money(b.balanceDue)}`}
      </Button>
    </div>
  );

  const paidCard = (b: Bill) => (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-neutral-900">{b.tableName}</p>
          <p className="text-caption text-neutral-500 truncate">{b.billNumber} · {fmtDateTime(b.paidAt)}</p>
        </div>
        <span className={cn('tabular-nums font-semibold shrink-0', b.paymentStatus === 'REFUNDED' && 'text-neutral-400 line-through')}>{money(b.grandTotal)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {b.paymentStatus === 'REFUNDED'
          ? <Badge tone="neutral" size="sm" icon={<Undo2 className="h-3.5 w-3.5" aria-hidden />}>Refunded</Badge>
          : <Badge tone="success" size="sm" icon={<CheckCircle2 className="h-3.5 w-3.5" aria-hidden />}>Paid in full</Badge>}
        {successMethods(b).map((mm) => <Badge key={mm} size="sm">{PAYMENT_METHOD_LABELS[mm]}</Badge>)}
      </div>
      <p className="text-caption text-neutral-500">Taken by {b.cashierName}</p>
      <Button block variant="outline" className="min-h-touch" leftIcon={<Printer className="h-4 w-4" />} onClick={(e) => { e.stopPropagation(); navigate(`/cashier/bills/${b.id}/receipt`); }}>
        Reprint receipt
      </Button>
    </div>
  );

  const filtered = mode === 'unpaid' ? ps !== 'ALL' : !!method;

  return (
    <div>
      <PageHeader
        title={mode === 'paid' ? 'Paid bills' : 'Unpaid bills'}
        subtitle={mode === 'paid'
          ? 'Settled bills with their tender, time and receipt'
          : 'Everything still owed, oldest first'}
      >
        <div className="flex flex-col lg:flex-row gap-2 lg:items-center">
          {mode === 'paid' ? (
            <>
              <DateRangeFilter state={dr} />
              <FilterSelect
                ariaLabel="Filter paid bills by tender"
                className="lg:w-48"
                value={method}
                onChange={(e) => setMethod(e.target.value as '' | PaymentMethod)}
                placeholder="Any tender"
                options={methodsPresent.map((mm) => ({ value: mm, label: PAYMENT_METHOD_LABELS[mm] }))}
              />
            </>
          ) : (
            <SegmentedControl
              size="sm"
              ariaLabel="Filter unpaid bills by payment status"
              value={ps}
              onChange={setPs}
              options={[
                { value: 'ALL', label: 'All', count: scope.length },
                { value: 'UNPAID', label: 'Nothing taken', count: scope.filter((b) => b.paymentStatus === 'UNPAID').length },
                { value: 'PARTIALLY_PAID', label: 'Part paid', count: scope.filter((b) => b.paymentStatus === 'PARTIALLY_PAID').length },
              ]}
            />
          )}
          <SearchInput value={search} onChange={setSearch} placeholder="Bill #, order # or table" className="lg:w-64 lg:ml-auto" />
        </div>
      </PageHeader>

      {q.isLoading && <LoadingState variant="table" rows={6} />}
      {q.isError && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}

      {q.data && (
        <>
          {mode === 'unpaid' && overdue.length > 0 && (
            <Alert
              tone="danger"
              className="mb-4"
              title={`${overdue.length} bill${overdue.length === 1 ? '' : 's'} outstanding for more than ${DELAY_THRESHOLDS.late} minutes`}
            >
              {money(overdue.reduce((a, b) => a + b.balanceDue, 0))} still owed on {overdue.slice(0, 5).map((b) => b.tableName).join(', ')}
              {overdue.length > 5 ? ` and ${overdue.length - 5} more` : ''}.
            </Alert>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-3 text-sm text-neutral-600">
            <span className="tabular-nums">{rows.length} of {scope.length} bill{scope.length === 1 ? '' : 's'}</span>
            {mode === 'unpaid' ? (
              <>
                <span className="tabular-nums font-semibold text-danger-700">{money(outstanding)} outstanding</span>
                {scope.length > 0 && <span className="tabular-nums">oldest waiting {ageLabel(Math.max(...scope.map((b) => elapsedMinutes(waitFrom(b), now))))}</span>}
              </>
            ) : (
              <>
                <span className="tabular-nums font-semibold text-success-700">{money(taken)} taken across {settled.length} paid bill{settled.length === 1 ? '' : 's'}</span>
                {refunded.length > 0 && <span className="tabular-nums">{refunded.length} refunded</span>}
              </>
            )}
            {filtered && <Badge tone="primary" size="sm">Filtered</Badge>}
          </div>

          <DataTable
            columns={mode === 'unpaid' ? unpaidColumns : paidColumns}
            rows={rows}
            rowKey={(b) => b.id}
            mobileCard={mode === 'unpaid' ? unpaidCard : paidCard}
            onRowClick={(b) => navigate(`/cashier/bills/${b.id}`)}
            // Unpaid reads oldest-first (who has waited longest); paid reads newest-first (what just happened).
            initialSort={mode === 'unpaid' ? { key: 'age', dir: 'asc' } : { key: 'paid', dir: 'desc' }}
            caption={mode === 'unpaid'
              ? 'Unpaid bills with waiting time, balance due and the next action'
              : 'Paid bills with settlement time, tender, cashier and receipt'}
            emptyTitle={mode === 'paid'
              ? (filtered ? 'No bills settled with that tender' : 'No paid bills in this period')
              : (filtered ? 'No bills in this state' : 'Everything is settled')}
            emptyDescription={mode === 'paid'
              ? (filtered ? 'Clear the tender filter, or widen the date range.' : 'Widen the date range, or take a payment from the unpaid list.')
              : (filtered ? 'Switch back to All to see every outstanding bill.' : 'No bill is waiting for payment right now.')}
            emptyAction={filtered
              ? <Button variant="outline" onClick={() => { setPs('ALL'); setMethod(''); }}>Clear filter</Button>
              : mode === 'paid'
                ? <Button variant="outline" onClick={() => navigate('/cashier/bills')}>Go to unpaid bills</Button>
                : <Button variant="outline" onClick={() => navigate('/cashier/paid')}>See what was paid</Button>}
          />
        </>
      )}
    </div>
  );
}
