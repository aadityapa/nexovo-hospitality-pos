import { useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Send, Plus, Receipt, XCircle, History, CreditCard, PackageMinus, Crown, CalendarCheck } from 'lucide-react';
import { useOrder, useOrderHistory, useOrderMutations } from './hooks';
import { OrderItemsList } from './OrderItemsList';
import { CancelItemDialog } from './CancelItemDialog';
import { OrderCustomerCard } from './OrderCustomerCard';
import { useInventoryMutations } from '@/features/p2/hooks';
import { useBranch } from '@/components/layout/Shell';
import { usePermission } from '@/hooks/useAuth';
import { useRealtimeInvalidate } from '@/hooks/useRealtime';
import { PageHeader, Button, Card, CardHeader, ConfirmDialog, Textarea, StatusBadge, KeyValue, LoadingState, ErrorState, EmptyState, Badge } from '@/components/ui';
import { ApiError } from '@/services/api/client';
import { money } from '@/utils/money';
import { fmtDateTime, fmtTime } from '@/utils/date';
import { canAddItems, canRequestBill, canCancelOrder, isAtLeast } from '@/utils/orderStatus';
import { ORDER_STATUS } from '@/config/statuses';
import type { OrderItem } from '@/types';

/** Shared order detail (waiter / manager / admin). Actions are permission-gated AND state-gated. */
export default function OrderDetailPage() {
  const { id } = useParams();
  const orderId = Number.isFinite(Number(id)) && Number(id) > 0 ? Number(id) : undefined;
  const navigate = useNavigate();
  const loc = useLocation();
  const isWaiterCtx = loc.pathname.startsWith('/waiter');
  const ordersHome = isWaiterCtx ? '/waiter/orders' : '/admin/orders';
  const q = useOrder(orderId);
  const hist = useOrderHistory(orderId);
  const m = useOrderMutations();
  useRealtimeInvalidate(['orders', 'kitchen', 'bar', 'bills']);
  const canConfirm = usePermission('orders:confirm');
  const canCreate = usePermission('orders:create');
  const canBill = usePermission('orders:request-bill');
  const canCancelOrd = usePermission('orders:cancel');
  const canCancelItem = usePermission('orders:cancel:item');
  const canServe = usePermission('orders:item:status');
  const canBilling = usePermission('billing:create');
  const canAdjustStock = usePermission('inventory:adjust');
  const { data: branch } = useBranch();
  const { deductForOrder } = useInventoryMutations();
  const [cancelItem, setCancelItem] = useState<OrderItem | null>(null);
  const [cancelOrder, setCancelOrder] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmBill, setConfirmBill] = useState(false);

  if (!orderId) return <ErrorState error={new ApiError(404, 'Order not found')} title="Order not found" />;
  if (q.isLoading) return <LoadingState variant="page" />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const o = q.data;
  const active = o.items.filter((i) => i.status !== 'CANCELLED');
  const readyCount = active.filter((i) => i.status === 'READY').length;
  const addPath = `/waiter/tables/${o.tableId}`;   // order entry lives in the waiter shell for every role
  const billPath = o.billId ? `/cashier/bills/${o.billId}` : `/cashier/orders/${o.id}/bill`;
  const pendingStock = active.filter((i) => !i.stockDeducted).length;
  const showManualDeduct = canAdjustStock && branch?.stockDeductionMode === 'MANUAL' && isAtLeast(o.status, 'CONFIRMED') && o.status !== 'CANCELLED' && pendingStock > 0;

  return (
    <div className="max-w-5xl">
      <PageHeader back={() => (window.history.length > 1 ? navigate(-1) : navigate(ordersHome))} title={<span className="flex items-center gap-3 flex-wrap">{o.tableName}<StatusBadge kind="order" status={o.status} size="lg" />{o.vipResId && <Badge tone="warning" icon={<Crown className="h-3 w-3" />}>VIP</Badge>}{o.reservationId && <Badge tone="info" icon={<CalendarCheck className="h-3 w-3" />}>Reservation</Badge>}</span>} subtitle={`${o.orderNumber} · ${o.floorName} · ${o.waiterName} · ${fmtDateTime(o.createdAt)}`}
        actions={<>
          {showManualDeduct && <Button variant="outline" leftIcon={<PackageMinus className="h-4 w-4" />} loading={deductForOrder.isPending} onClick={() => deductForOrder.mutate(o.id)} title="Branch is set to manual stock deduction">Deduct stock ({pendingStock})</Button>}
          {canCreate && canAddItems(o.status) && <Button variant="outline" leftIcon={<Plus className="h-4 w-4" />} onClick={() => navigate(addPath)}>Add items</Button>}
          {canConfirm && o.status === 'DRAFT' && <Button leftIcon={<Send className="h-4 w-4" />} loading={m.confirm.isPending} onClick={() => m.confirm.mutate(o.id)}>Send to kitchen/bar</Button>}
          {canBill && canRequestBill(o.status) && <Button leftIcon={<Receipt className="h-4 w-4" />} onClick={() => setConfirmBill(true)}>Request bill</Button>}
          {canBilling && isAtLeast(o.status, 'CONFIRMED') && o.status !== 'CANCELLED' && o.status !== 'COMPLETED' && <Button variant={o.status === 'BILL_REQUESTED' ? 'primary' : 'outline'} leftIcon={<CreditCard className="h-4 w-4" />} onClick={() => navigate(billPath)}>{o.billId ? 'Open bill' : 'Generate bill'}</Button>}
          {(canCancelOrd || (o.status === 'DRAFT' && canCreate)) && canCancelOrder(o.status) && <Button variant="ghost" className="text-danger-700" leftIcon={<XCircle className="h-4 w-4" />} onClick={() => setCancelOrder(true)}>Cancel order</Button>}
        </>} />
      {readyCount > 0 && canServe && <div className="mb-4 rounded-md border border-success-100 bg-success-50 px-4 py-3 text-sm text-success-700 font-medium">{readyCount} item{readyCount > 1 ? 's' : ''} ready to serve.</div>}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {o.items.length === 0 ? <Card><EmptyState compact title="No items yet" description="Add items to start this order." action={canCreate && <Button onClick={() => navigate(addPath)}>Add items</Button>} /></Card>
            : <OrderItemsList order={o} canServe={canServe} canCancel={canCancelItem && !isAtLeast(o.status, 'BILLED')} onServe={(it) => m.setItemStatus.mutate({ id: o.id, itemId: it.id, status: 'SERVED' })} onCancel={setCancelItem} busyItemId={m.setItemStatus.isPending ? (m.setItemStatus.variables?.itemId ?? null) : null} />}
          {o.notes && <Card><p className="text-label text-neutral-500 uppercase mb-1">Order notes</p><p className="text-sm">{o.notes}</p></Card>}
        </div>
        <div className="space-y-4">
          <OrderCustomerCard order={o} />
          <Card>
            <KeyValue items={[
              { label: 'Items', value: `${o.itemCount} (${active.length} lines)` }, { label: 'Guests', value: o.guestCount },
              { label: 'Subtotal', value: <span className="font-semibold tabular-nums">{money(o.subtotal)}</span> },
              { label: 'Confirmed', value: fmtTime(o.confirmedAt) }, { label: 'Bill requested', value: fmtTime(o.billRequestedAt) },
              ...(o.cancelReason ? [{ label: 'Cancel reason', value: o.cancelReason }] : []),
            ]} />
            <p className="text-caption text-neutral-500 mt-3">Taxes, service charge and discounts are calculated on the bill.</p>
          </Card>
          <Card padded={false}>
            <CardHeader className="p-4 pb-0" title={<span className="flex items-center gap-2 text-sm"><History className="h-4 w-4" />Status history</span>} />
            <ol className="px-4 pb-4 mt-2 space-y-2">
              {(hist.data ?? []).map((h) => <li key={h.id} className="text-sm flex gap-2"><span className="text-caption text-neutral-500 w-16 shrink-0 pt-0.5">{fmtTime(h.changedAt)}</span><span><span className="font-medium">{ORDER_STATUS[h.toStatus]?.label ?? h.toStatus}</span>{h.changedByName && <span className="text-neutral-500"> · {h.changedByName}</span>}{h.note && <span className="block text-caption text-neutral-500">{h.note}</span>}</span></li>)}
              {hist.data?.length === 0 && <li className="text-caption text-neutral-500">No history</li>}
            </ol>
          </Card>
        </div>
      </div>
      <CancelItemDialog order={o} item={cancelItem} onClose={() => setCancelItem(null)} loading={m.cancelItem.isPending} onConfirm={async (body) => { if (cancelItem) await m.cancelItem.mutateAsync({ id: o.id, itemId: cancelItem.id, body }); }} />
      <ConfirmDialog open={cancelOrder} onClose={() => setCancelOrder(false)} variant="danger" title={`Cancel ${o.orderNumber}?`} message="All items are cancelled and kept in history. This cannot be undone." confirmLabel="Cancel order" loading={m.cancel.isPending} onConfirm={async () => { if (!reason.trim()) return; await m.cancel.mutateAsync({ id: o.id, reason: reason.trim() }); setCancelOrder(false); }}>
        <Textarea label="Reason" required rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Required — recorded in the audit log" />
      </ConfirmDialog>
      <ConfirmDialog open={confirmBill} onClose={() => setConfirmBill(false)} title="Request the bill?" message={`The cashier will be notified for ${o.tableName}. No more items can be added after this.`} confirmLabel="Request bill" loading={m.requestBill.isPending} onConfirm={async () => { await m.requestBill.mutateAsync(o.id); setConfirmBill(false); }} />
    </div>
  );
}
