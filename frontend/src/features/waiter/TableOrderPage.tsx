import { useNavigate, useParams } from 'react-router-dom';
import { ClipboardList, Receipt } from 'lucide-react';
import { useTable } from '@/features/tables/hooks';
import { useOrder, useOrderMutations } from '@/features/orders/hooks';
import { OrderEntry } from './OrderEntry';
import { LoadingState, ErrorState, StatusBadge, Button, EmptyState } from '@/components/ui';
import { money } from '@/utils/money';
import { canAddItems } from '@/utils/orderStatus';
import { toast } from '@/store/uiStore';
import type { NewOrderItemInput } from '@/types';

/**
 * Waiter selects a table → existing active order (append batch) or new order.
 * Rule 2: one active order per table (server-enforced; the UI simply routes to it).
 */
export default function TableOrderPage() {
  const { tableId } = useParams();
  const tid = Number(tableId);
  const navigate = useNavigate();
  const table = useTable(tid);
  const order = useOrder(table.data?.activeOrderId ?? undefined);
  const m = useOrderMutations();

  if (table.isLoading || (table.data?.activeOrderId && order.isLoading)) return <LoadingState variant="page" />;
  if (table.isError || !table.data) return <ErrorState error={table.error} onRetry={() => void table.refetch()} />;
  const t = table.data;
  const o = order.data ?? null;
  const mode: 'new' | 'draft' | 'append' = !o ? 'new' : o.status === 'DRAFT' ? 'draft' : 'append';

  if (o && !canAddItems(o.status)) {
    return (
      <div className="max-w-xl mx-auto">
        <EmptyState icon={<Receipt className="h-6 w-6" />} title={`${t.name} is being billed`} description={`Order ${o.orderNumber} is ${o.status.replace('_', ' ').toLowerCase()}. No more items can be added.`} action={<Button leftIcon={<ClipboardList className="h-4 w-4" />} onClick={() => navigate(`/waiter/orders/${o.id}`)}>View order</Button>} />
      </div>
    );
  }

  const onSend = async (items: NewOrderItemInput[]) => {
    if (mode === 'new') {
      const created = await m.create.mutateAsync({ tableId: tid, items });
      await m.confirm.mutateAsync(created.id);
      navigate(`/waiter/orders/${created.id}`, { replace: true });
    } else if (mode === 'draft' && o) {
      if (items.length) await m.addItems.mutateAsync({ id: o.id, items });
      await m.confirm.mutateAsync(o.id);
      navigate(`/waiter/orders/${o.id}`, { replace: true });
    } else if (o) {
      const updated = await m.addItems.mutateAsync({ id: o.id, items });
      toast.success('Items sent', `New batch routed to ${[items.some((i) => updated.items.find((x) => x.menuItemId === i.menuItemId && x.prepLocation === 'KITCHEN')) && 'kitchen', items.some((i) => updated.items.find((x) => x.menuItemId === i.menuItemId && x.prepLocation === 'BAR')) && 'bar'].filter(Boolean).join(' + ')}`);
      navigate(`/waiter/orders/${o.id}`, { replace: true });
    }
  };
  const onSaveDraft = async (items: NewOrderItemInput[]) => {
    if (mode === 'new') { const created = await m.create.mutateAsync({ tableId: tid, items }); toast.success('Draft saved', created.orderNumber); navigate(`/waiter/orders/${created.id}`, { replace: true }); }
    else if (o) { await m.addItems.mutateAsync({ id: o.id, items }); toast.success('Draft updated'); navigate(`/waiter/orders/${o.id}`, { replace: true }); }
  };

  return (
    <div>
      {o && (
        <div className="mb-3 card px-4 py-3 flex items-center gap-3 flex-wrap sm:flex-nowrap">
          <StatusBadge kind="order" status={o.status} />
          <p className="text-sm min-w-0 flex-1">
            <span className="font-medium">{o.orderNumber}</span>
            <span className="text-neutral-500"> · {o.itemCount} items · {money(o.subtotal)}</span>
            <span className="block sm:inline text-caption text-neutral-500">
              {mode === 'draft' ? ' Draft — nothing has been sent yet.' : ' Sending adds a new batch to this order.'}
            </span>
          </p>
          <Button size="sm" variant="outline" onClick={() => navigate(`/waiter/orders/${o.id}`)}>Order details</Button>
        </div>
      )}
      <OrderEntry
        tableId={tid}
        tableName={t.name}
        orderNumber={o?.orderNumber}
        mode={mode}
        existingItems={o?.items}
        onSend={onSend}
        onSaveDraft={mode !== 'append' ? onSaveDraft : undefined}
        sending={m.create.isPending || m.confirm.isPending || m.addItems.isPending}
        saving={m.create.isPending && !m.confirm.isPending}
        onCancel={() => navigate(o ? `/waiter/orders/${o.id}` : '/waiter/tables')}
      />
    </div>
  );
}
