import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useOrders } from '@/features/orders/hooks';
import { useDebounce } from '@/hooks/useRealtime';
import { PageHeader, SearchInput, SegmentedControl, StatusBadge, LoadingState, ErrorState, EmptyState, Card, Button } from '@/components/ui';
import { money } from '@/utils/money';
import { fmtRelative } from '@/utils/date';
import type { Order } from '@/types';

type Filter = 'ACTIVE' | 'PENDING' | 'READY' | 'BILLING' | 'ALL';

const match = (o: Order, f: Filter) => f === 'ALL' ? true : f === 'ACTIVE' ? !['COMPLETED', 'CANCELLED'].includes(o.status) : f === 'PENDING' ? ['DRAFT', 'CONFIRMED', 'IN_PROGRESS', 'PARTIALLY_READY'].includes(o.status) : f === 'READY' ? o.items.some((i) => i.status === 'READY') : ['BILL_REQUESTED', 'BILLED', 'PAID'].includes(o.status);

export default function WaiterOrdersPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('ACTIVE');
  const [search, setSearch] = useState('');
  const dq = useDebounce(search, 200);
  const q = useOrders({ active: filter !== 'ALL' || undefined, search: dq || undefined });
  const list = (q.data ?? []).filter((o) => match(o, filter));
  const count = (f: Filter) => (q.data ?? []).filter((o) => match(o, f)).length;
  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader title="My orders">
        <div className="flex flex-col sm:flex-row gap-2"><SegmentedControl value={filter} onChange={setFilter} options={[{ value: 'ACTIVE', label: 'Active', count: count('ACTIVE') }, { value: 'PENDING', label: 'Pending', count: count('PENDING') }, { value: 'READY', label: 'Ready', count: count('READY') }, { value: 'BILLING', label: 'Billing', count: count('BILLING') }, { value: 'ALL', label: 'All' }]} /><SearchInput value={search} onChange={setSearch} placeholder="Order # or table" className="sm:w-56 sm:ml-auto" /></div>
      </PageHeader>
      {q.isLoading && <LoadingState rows={5} />}
      {q.isError && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      {q.data && (list.length === 0 ? <Card><EmptyState title="No orders" description="Orders you create or for your tables show here." action={<Button onClick={() => navigate('/waiter/tables')}>Select table</Button>} /></Card> : (
        <ul className="space-y-2">{list.map((o) => (
          <li key={o.id}><button type="button" onClick={() => navigate(`/waiter/orders/${o.id}`)} className="w-full card px-4 py-3 flex items-center gap-3 text-left hover:border-neutral-300 min-h-[68px]">
            <span className="text-xl font-bold w-24 shrink-0">{o.tableName}</span>
            <span className="flex-1 min-w-0"><span className="flex items-center gap-2 flex-wrap"><StatusBadge kind="order" status={o.status} size="sm" />{o.items.some((i) => i.status === 'READY') && <StatusBadge kind="item" status="READY" size="sm" />}</span><span className="block text-caption text-neutral-500 mt-1 truncate">{o.orderNumber} · {o.itemCount} items · {fmtRelative(o.createdAt)}</span></span>
            <span className="font-semibold tabular-nums">{money(o.subtotal)}</span><ChevronRight className="h-4 w-4 text-neutral-400" />
          </button></li>))}</ul>
      ))}
    </div>
  );
}
