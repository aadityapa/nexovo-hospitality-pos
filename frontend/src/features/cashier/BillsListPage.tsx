import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBills } from '@/features/billing/hooks';
import { useDateRange, DateRangeFilter } from '@/features/shared/DateRangeFilter';
import { useDebounce } from '@/hooks/useRealtime';
import { PageHeader, DataTable, StatusBadge, LoadingState, ErrorState, SearchInput, SegmentedControl, Badge, type Column } from '@/components/ui';
import { money } from '@/utils/money';
import { fmtDateTime, fmtRelative } from '@/utils/date';
import { PAYMENT_METHOD_LABELS } from '@/config/statuses';
import type { Bill, PaymentStatus } from '@/types';

export default function BillsListPage({ mode }: { mode: 'unpaid' | 'paid' }) {
  const navigate = useNavigate();
  const dr = useDateRange(mode === 'paid' ? 'today' : 'week');
  const [search, setSearch] = useState('');
  const dq = useDebounce(search, 250);
  const [ps, setPs] = useState<'ALL' | PaymentStatus>('ALL');
  const q = useBills({ search: dq || undefined, ...(mode === 'paid' ? { from: dr.range.from, to: dr.range.to } : {}) });
  const rows = useMemo(() => (q.data ?? []).filter((b) => (mode === 'paid' ? b.paymentStatus === 'PAID' || b.paymentStatus === 'REFUNDED' : ['OPEN', 'FINALIZED'].includes(b.status) && b.paymentStatus !== 'PAID')).filter((b) => ps === 'ALL' || b.paymentStatus === ps), [q.data, mode, ps]);
  const columns: Column<Bill>[] = [
    { key: 'bill', header: 'Bill', sortValue: (b) => b.billNumber, render: (b) => <span className="font-medium">{b.billNumber}<span className="block text-caption font-normal text-neutral-500">{b.orderNumber}</span></span> },
    { key: 'table', header: 'Table', sortValue: (b) => b.tableName, render: (b) => b.tableName },
    { key: 'time', header: mode === 'paid' ? 'Paid' : 'Created', sortValue: (b) => (mode === 'paid' ? b.paidAt : b.createdAt) ?? '', render: (b) => <span title={fmtDateTime(mode === 'paid' ? b.paidAt : b.createdAt)}>{fmtRelative(mode === 'paid' ? b.paidAt : b.createdAt)}</span> },
    { key: 'cashier', header: 'Cashier', hideBelow: 'lg', render: (b) => b.cashierName },
    { key: 'methods', header: 'Payment', hideBelow: 'md', render: (b) => <div className="flex flex-wrap gap-1">{[...new Set(b.payments.filter((p) => p.status === 'SUCCESS').map((p) => p.method))].map((mm) => <Badge key={mm} size="sm">{PAYMENT_METHOD_LABELS[mm]}</Badge>)}</div> },
    { key: 'total', header: 'Total', align: 'right', sortValue: (b) => b.grandTotal, render: (b) => <span className="tabular-nums font-medium">{money(b.grandTotal)}</span> },
    ...(mode === 'unpaid' ? [{ key: 'due', header: 'Balance', align: 'right' as const, sortValue: (b: Bill) => b.balanceDue, render: (b: Bill) => <span className="tabular-nums font-semibold text-danger-700">{money(b.balanceDue)}</span> }] : []),
    { key: 'status', header: 'Status', render: (b) => <div className="flex gap-1 flex-wrap"><StatusBadge kind="bill" status={b.status} size="sm" /><StatusBadge kind="payment" status={b.paymentStatus} size="sm" hideIcon /></div> },
  ];
  return (
    <div>
      <PageHeader title={mode === 'paid' ? 'Paid bills' : 'Unpaid bills'} subtitle={`${rows.length} bills`}>
        <div className="flex flex-col lg:flex-row gap-2 lg:items-center">
          {mode === 'paid' ? <DateRangeFilter state={dr} /> : <SegmentedControl size="sm" value={ps} onChange={setPs} options={[{ value: 'ALL', label: 'All' }, { value: 'UNPAID', label: 'Unpaid' }, { value: 'PARTIALLY_PAID', label: 'Partially paid' }]} />}
          <SearchInput value={search} onChange={setSearch} placeholder="Bill #, order # or table" className="lg:w-64 lg:ml-auto" />
        </div>
      </PageHeader>
      {q.isLoading && <LoadingState variant="table" rows={6} />}
      {q.isError && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      {q.data && <DataTable columns={columns} rows={rows} rowKey={(b) => b.id} onRowClick={(b) => navigate(`/cashier/bills/${b.id}`)} initialSort={{ key: 'time', dir: 'desc' }} emptyTitle={mode === 'paid' ? 'No paid bills in this period' : 'No unpaid bills'} />}
    </div>
  );
}
