import { useNavigate } from 'react-router-dom';
import { LayoutGrid, Bell, Receipt, ClipboardList, Plus, ChevronRight } from 'lucide-react';
import { useTables } from '@/features/tables/hooks';
import { useOrders } from '@/features/orders/hooks';
import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useRealtime';
import { StatCard, Button, Card, StatusBadge, LoadingState, ErrorState, EmptyState } from '@/components/ui';
import { money } from '@/utils/money';
import { fmtRelative, elapsedMinutes } from '@/utils/date';
import { format } from 'date-fns';

function greeting(d: Date) { const h = d.getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }

export default function WaiterHomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const now = useNow(30_000);
  const tables = useTables();
  const orders = useOrders({ active: true });
  const mine = tables.data ?? [];
  const active = orders.data ?? [];
  const ready = active.filter((o) => o.items.some((i) => i.status === 'READY'));
  const billReq = active.filter((o) => o.status === 'BILL_REQUESTED');
  const occupied = mine.filter((t) => t.status !== 'AVAILABLE');

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-end justify-between gap-3 mb-6">
        <div className="min-w-0">
          <p className="text-label text-neutral-500 uppercase">{greeting(now)}</p>
          <h1 className="text-display leading-tight truncate">{user?.fullName.split(' ')[0]}</h1>
          <p className="text-sm text-neutral-500 mt-1">{format(now, 'EEEE, d MMMM')}</p>
        </div>
        <Button size="pos" leftIcon={<Plus className="h-5 w-5" />} onClick={() => navigate('/waiter/tables')}>New order</Button>
      </div>
      {(tables.isError || orders.isError) && <ErrorState error={tables.error ?? orders.error} onRetry={() => { void tables.refetch(); void orders.refetch(); }} compact />}
      {tables.isLoading ? <LoadingState variant="stats" /> : (
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Tables in service" value={occupied.length} icon={<LayoutGrid className="h-5 w-5" />} tone="primary" hint={`of ${mine.length} on the floor`} onClick={() => navigate('/waiter/tables')} size="lg" />
          <StatCard label="Ready to serve" value={ready.length} icon={<Bell className="h-5 w-5" />} tone={ready.length ? 'success' : 'neutral'} onClick={() => navigate('/waiter/ready')} size="lg" />
          <StatCard label="Bill requests" value={billReq.length} icon={<Receipt className="h-5 w-5" />} tone={billReq.length ? 'warning' : 'neutral'} onClick={() => navigate('/waiter/orders')} size="lg" />
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2 mt-5">
        <Card padded={false}>
          <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between"><h2 className="text-subheading flex items-center gap-2"><Bell className="h-4 w-4 text-success-600" />Ready orders</h2><Button size="sm" variant="ghost" onClick={() => navigate('/waiter/ready')}>All</Button></div>
          {ready.length === 0 ? <EmptyState compact title="Nothing ready yet" description="Items marked ready by kitchen/bar appear here." /> : (
            <ul className="divide-y divide-neutral-100">{ready.slice(0, 6).map((o) => (
              <li key={o.id}><button type="button" onClick={() => navigate(`/waiter/orders/${o.id}`)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-neutral-50 min-h-[60px]">
                <span className="text-lg font-bold w-24 shrink-0">{o.tableName}</span>
                <span className="flex-1 min-w-0 text-sm"><span className="block truncate">{o.items.filter((i) => i.status === 'READY').map((i) => `${i.itemName} ×${i.quantity}`).join(', ')}</span><span className="text-caption text-neutral-500">{o.orderNumber}</span></span>
                <ChevronRight className="h-4 w-4 text-neutral-400" />
              </button></li>))}</ul>
          )}
        </Card>
        <Card padded={false}>
          <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between"><h2 className="text-subheading flex items-center gap-2"><ClipboardList className="h-4 w-4 text-primary-700" />Active orders</h2><Button size="sm" variant="ghost" onClick={() => navigate('/waiter/orders')}>All</Button></div>
          {orders.isLoading ? <div className="p-4"><LoadingState rows={3} /></div> : active.length === 0 ? <EmptyState compact title="No active orders" description="Select a table to start one." action={<Button onClick={() => navigate('/waiter/tables')}>Select table</Button>} /> : (
            <ul className="divide-y divide-neutral-100">{active.slice(0, 6).map((o) => (
              <li key={o.id}><button type="button" onClick={() => navigate(`/waiter/orders/${o.id}`)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-neutral-50 min-h-[60px]">
                <span className="text-lg font-bold w-24 shrink-0">{o.tableName}</span>
                <span className="flex-1 min-w-0"><StatusBadge kind="order" status={o.status} size="sm" /><span className="block text-caption text-neutral-500 mt-0.5">{o.itemCount} items · {fmtRelative(o.createdAt)} · {elapsedMinutes(o.createdAt)}m</span></span>
                <span className="font-semibold tabular-nums">{money(o.subtotal)}</span>
              </button></li>))}</ul>
          )}
        </Card>
      </div>
    </div>
  );
}
