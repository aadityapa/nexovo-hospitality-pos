import { useNavigate } from 'react-router-dom';
import { Bell, Check, ChefHat, Wine } from 'lucide-react';
import { useOrders, useOrderMutations } from '@/features/orders/hooks';
import { useNow } from '@/hooks/useRealtime';
import { PageHeader, Button, Card, LoadingState, ErrorState, EmptyState } from '@/components/ui';
import { elapsedClock } from '@/utils/date';
import { cn } from '@/utils/cn';

/** Everything READY across the waiter's tables — one tap to mark served. */
export default function ReadyItemsPage() {
  const navigate = useNavigate();
  const q = useOrders({ active: true });
  const m = useOrderMutations();
  const now = useNow(1000);
  const groups = (q.data ?? []).map((o) => ({ o, items: o.items.filter((i) => i.status === 'READY') })).filter((g) => g.items.length);
  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader title="Ready to serve" subtitle="Items marked ready by kitchen and bar" />
      {q.isLoading && <LoadingState rows={4} />}
      {q.isError && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      {q.data && (groups.length === 0 ? <Card><EmptyState icon={<Bell className="h-6 w-6" />} title="Nothing waiting to be served" description="You'll see items here the moment they are ready." /></Card> : (
        <div className="space-y-3">{groups.map(({ o, items }) => (
          <Card key={o.id} padded={false}>
            <button type="button" onClick={() => navigate(`/waiter/orders/${o.id}`)} className="w-full px-4 py-3 flex items-center justify-between border-b border-neutral-100 text-left"><span className="text-xl font-bold">{o.tableName}</span><span className="text-caption text-neutral-500">{o.orderNumber} · {o.floorName}</span></button>
            <ul className="divide-y divide-neutral-100">{items.map((it) => (
              <li key={it.id} className="px-4 py-3 flex items-center gap-3">
                <span className={cn('h-9 w-9 rounded-sm flex items-center justify-center shrink-0', it.prepLocation === 'BAR' ? 'bg-info-50 text-info-600' : 'bg-warning-50 text-warning-600')}>{it.prepLocation === 'BAR' ? <Wine className="h-4 w-4" /> : <ChefHat className="h-4 w-4" />}</span>
                <span className="flex-1 min-w-0"><span className="block font-semibold">{it.itemName} × {it.quantity}</span>{it.notes && <span className="text-sm text-warning-700 font-medium uppercase">{it.notes}</span>}<span className="block text-caption text-neutral-500">ready for {it.readyAt ? elapsedClock(it.readyAt, now) : '—'}</span></span>
                <Button variant="success" size="pos" leftIcon={<Check className="h-5 w-5" />} loading={m.setItemStatus.isPending && m.setItemStatus.variables?.itemId === it.id} onClick={() => m.setItemStatus.mutate({ id: o.id, itemId: it.id, status: 'SERVED' })}>Served</Button>
              </li>))}</ul>
          </Card>))}</div>
      ))}
    </div>
  );
}
