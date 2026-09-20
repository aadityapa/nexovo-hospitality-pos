import { useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Send, Plus, Receipt, XCircle, History, CreditCard, PackageMinus, Crown, CalendarCheck, Clock, Bell, ArrowRight } from 'lucide-react';
import { useOrder, useOrderHistory, useOrderMutations } from './hooks';
import { OrderItemsList } from './OrderItemsList';
import { CancelItemDialog } from './CancelItemDialog';
import { OrderCustomerCard } from './OrderCustomerCard';
import { useInventoryMutations } from '@/features/p2/hooks';
import { useBranch } from '@/components/layout/Shell';
import { usePermission } from '@/hooks/useAuth';
import { useRealtimeInvalidate, useNow } from '@/hooks/useRealtime';
import { PageHeader, Button, Card, CardHeader, ConfirmDialog, Textarea, StatusBadge, StatusDot, statusMeta, KeyValue, LoadingState, ErrorState, EmptyState, Badge } from '@/components/ui';
import { ApiError } from '@/services/api/client';
import { money } from '@/utils/money';
import { fmtDateTime, fmtTime, elapsedMinutes } from '@/utils/date';
import { canAddItems, canRequestBill, canCancelOrder, isAtLeast } from '@/utils/orderStatus';
import { ORDER_STATUS, type Tone } from '@/config/statuses';
import { cn } from '@/utils/cn';
import type { OrderItem, OrderItemStatus, OrderStatus } from '@/types';

/** Left edge of the state panel, so the order's position in the flow reads before any text. */
const EDGE: Record<Tone, string> = {
  neutral: 'border-l-neutral-300', primary: 'border-l-primary-600', success: 'border-l-success-500',
  warning: 'border-l-warning-500', danger: 'border-l-danger-500', info: 'border-l-info-500', accent: 'border-l-accent-500',
};

function ageLabel(mins: number): string {
  if (mins < 1) return '<1m';
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
}

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
  const now = useNow(30_000);
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
  const [reasonTouched, setReasonTouched] = useState(false);
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

  // ---- what is available, and which single one of them actually advances the order -----
  const can = {
    send: canConfirm && o.status === 'DRAFT',
    addItems: canCreate && canAddItems(o.status),
    requestBill: canBill && canRequestBill(o.status),
    bill: canBilling && isAtLeast(o.status, 'CONFIRMED') && o.status !== 'CANCELLED' && o.status !== 'COMPLETED',
    cancel: (canCancelOrd || (o.status === 'DRAFT' && canCreate)) && canCancelOrder(o.status),
  };
  const primary: keyof typeof can | null =
    can.send ? 'send'
      : (o.status === 'BILL_REQUESTED' || o.status === 'BILLED') && can.bill ? 'bill'
        : o.status === 'SERVED' && can.requestBill ? 'requestBill'
          : can.addItems ? 'addItems'
            : can.bill ? 'bill'
              : null;
  const isP = (k: keyof typeof can) => primary === k;
  const btnSize = (k: keyof typeof can) => (isP(k) ? 'lg' as const : 'md' as const);
  const btnVariant = (k: keyof typeof can) => (isP(k) ? 'primary' as const : 'outline' as const);

  const STATE_COPY: Record<OrderStatus, { title: string; detail: string }> = {
    DRAFT: { title: 'Not sent yet', detail: 'Nothing has reached the kitchen or bar. Sending routes every line to its station.' },
    CONFIRMED: { title: 'With the kitchen and bar', detail: 'All lines are routed. Stations mark items ready as they come up.' },
    IN_PROGRESS: { title: 'Being prepared', detail: 'At least one line has been started at a station.' },
    PARTIALLY_READY: { title: 'Part of the order is ready', detail: `${readyCount} line${readyCount === 1 ? '' : 's'} can go out now; the rest is still being prepared.` },
    READY: { title: 'Everything is ready', detail: 'Carry the lines out and mark them served, then request the bill.' },
    SERVED: { title: 'All served', detail: 'Request the bill when the guest asks for it.' },
    BILL_REQUESTED: { title: 'Bill requested', detail: `Requested ${fmtTime(o.billRequestedAt)}. The cashier takes it from here — no more items can be added.` },
    BILLED: { title: 'Bill generated', detail: 'Waiting on payment at the counter.' },
    PAID: { title: 'Paid', detail: 'The cashier closes the table to complete the order.' },
    COMPLETED: { title: 'Closed', detail: `Completed ${fmtDateTime(o.completedAt)}.` },
    CANCELLED: { title: 'Cancelled', detail: o.cancelReason ? `Reason: ${o.cancelReason}` : 'Every line was cancelled and kept in history.' },
  };
  const state = STATE_COPY[o.status];
  const tone = statusMeta('order', o.status).tone;

  const itemCounts = (['NEW', 'PREPARING', 'READY', 'SERVED', 'CANCELLED'] as OrderItemStatus[])
    .map((s) => ({ s, n: o.items.filter((i) => i.status === s).length }))
    .filter((x) => x.n > 0);

  return (
    <div className="max-w-5xl">
      <PageHeader
        back={() => (window.history.length > 1 ? navigate(-1) : navigate(ordersHome))}
        title={<span className="flex items-center gap-3 flex-wrap">{o.tableName}<StatusBadge kind="order" status={o.status} size="lg" />{o.vipResId && <Badge tone="warning" icon={<Crown className="h-3 w-3" />}>VIP</Badge>}{o.reservationId && <Badge tone="info" icon={<CalendarCheck className="h-3 w-3" />}>Reservation</Badge>}</span>}
        subtitle={`${o.orderNumber} · ${o.floorName} · ${o.waiterName} · opened ${fmtDateTime(o.createdAt)}`}
      />

      {/* ---- State first, then the one action that moves it on --------------------- */}
      <Card className={cn('border-l-4 mb-4', EDGE[tone])}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-label uppercase text-neutral-500">Current state</p>
            <h2 className="text-subheading text-neutral-900 mt-1">{state.title}</h2>
            <p className="text-sm text-neutral-600 mt-1 leading-relaxed">{state.detail}</p>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-neutral-500">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-neutral-400" aria-hidden />
                Open for <span className="font-medium text-neutral-700 tabular-nums">{ageLabel(elapsedMinutes(o.createdAt, now))}</span>
              </span>
              <span className="tabular-nums">{o.itemCount} items · {money(o.subtotal)}</span>
            </p>
            {readyCount > 0 && canServe && (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-sm border border-success-200 bg-success-50 px-2.5 py-1.5 text-sm font-medium text-success-700">
                <Bell className="h-4 w-4 shrink-0" aria-hidden />
                {readyCount} item{readyCount === 1 ? '' : 's'} ready — mark them served in the list below
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end lg:shrink-0">
            {can.send && (
              <Button size={btnSize('send')} variant={btnVariant('send')} leftIcon={<Send className="h-4 w-4" />} loading={m.confirm.isPending} onClick={() => m.confirm.mutate(o.id)}>
                Send to kitchen/bar
              </Button>
            )}
            {can.requestBill && (
              <Button size={btnSize('requestBill')} variant={btnVariant('requestBill')} leftIcon={<Receipt className="h-4 w-4" />} onClick={() => setConfirmBill(true)}>
                Request bill
              </Button>
            )}
            {can.bill && (
              <Button size={btnSize('bill')} variant={btnVariant('bill')} leftIcon={<CreditCard className="h-4 w-4" />} onClick={() => navigate(billPath)}>
                {o.billId ? 'Open bill' : 'Generate bill'}
              </Button>
            )}
            {can.addItems && (
              <Button size={btnSize('addItems')} variant={btnVariant('addItems')} leftIcon={<Plus className="h-4 w-4" />} onClick={() => navigate(addPath)}>
                Add items
              </Button>
            )}
            {showManualDeduct && (
              <Button variant="outline" leftIcon={<PackageMinus className="h-4 w-4" />} loading={deductForOrder.isPending} onClick={() => deductForOrder.mutate(o.id)} title="This branch deducts stock manually">
                Deduct stock ({pendingStock})
              </Button>
            )}
            {can.cancel && (
              <Button variant="ghost" className="text-danger-700 min-h-touch" leftIcon={<XCircle className="h-4 w-4" />} onClick={() => setCancelOrder(true)}>
                Cancel order
              </Button>
            )}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4 min-w-0">
          <section aria-labelledby="order-items-heading">
            <div className="flex flex-wrap items-end justify-between gap-2 mb-2">
              <div className="min-w-0">
                <h2 id="order-items-heading" className="text-subheading text-neutral-900">Items</h2>
                <p className="text-caption text-neutral-500 tabular-nums">
                  {active.length} line{active.length === 1 ? '' : 's'} · {o.itemCount} item{o.itemCount === 1 ? '' : 's'} · {money(o.subtotal)}
                </p>
              </div>
              {itemCounts.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  {itemCounts.map(({ s, n }) => (
                    <Badge key={s} tone={statusMeta('item', s).tone} size="sm">{n} {statusMeta('item', s).label.toLowerCase()}</Badge>
                  ))}
                </div>
              )}
            </div>

            {o.items.length === 0 ? (
              <Card padded={false}>
                <EmptyState
                  compact
                  title="No items yet"
                  description="Nothing has been added to this order."
                  action={canCreate && canAddItems(o.status) ? <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => navigate(addPath)}>Add items</Button> : undefined}
                />
              </Card>
            ) : (
              <OrderItemsList
                order={o}
                canServe={canServe}
                canCancel={canCancelItem && !isAtLeast(o.status, 'BILLED')}
                onServe={(it) => m.setItemStatus.mutate({ id: o.id, itemId: it.id, status: 'SERVED' })}
                onCancel={setCancelItem}
                busyItemId={m.setItemStatus.isPending ? (m.setItemStatus.variables?.itemId ?? null) : null}
              />
            )}
          </section>

          {o.notes && (
            <Card>
              <p className="text-label text-neutral-500 uppercase mb-1">Order notes</p>
              <p className="text-sm leading-relaxed">{o.notes}</p>
            </Card>
          )}
        </div>

        <div className="space-y-4 min-w-0">
          <OrderCustomerCard order={o} />

          <Card>
            <CardHeader className="mb-3" title={<span className="text-sm font-semibold text-neutral-900">Order summary</span>} />
            <KeyValue items={[
              { label: 'Items', value: `${o.itemCount} (${active.length} lines)` },
              { label: 'Guests', value: o.guestCount },
              { label: 'Subtotal', value: <span className="font-semibold tabular-nums">{money(o.subtotal)}</span> },
              { label: 'Opened', value: fmtTime(o.createdAt) },
              { label: 'Confirmed', value: fmtTime(o.confirmedAt) },
              { label: 'Bill requested', value: fmtTime(o.billRequestedAt) },
              ...(o.cancelReason ? [{ label: 'Cancel reason', value: o.cancelReason }] : []),
            ]} />
            <p className="text-caption text-neutral-500 mt-3 leading-relaxed">Taxes, service charge and discounts are calculated on the bill.</p>
          </Card>

          <Card padded={false}>
            <CardHeader
              className="p-4 pb-0 mb-0"
              title={<span className="flex items-center gap-2 text-sm font-semibold text-neutral-900"><History className="h-4 w-4 text-neutral-400" aria-hidden />Status history</span>}
            />
            <div className="px-4 pb-4 pt-3">
              {hist.isLoading && <LoadingState rows={3} />}
              {hist.isError && <ErrorState compact error={hist.error} onRetry={() => void hist.refetch()} title="History unavailable" />}
              {hist.data && (hist.data.length === 0 ? (
                <p className="text-caption text-neutral-500">No status changes recorded yet.</p>
              ) : (
                <ol className="min-w-0">
                  {hist.data.map((h, i) => {
                    const last = i === hist.data.length - 1;
                    return (
                      <li key={h.id} className="flex gap-3 min-w-0">
                        <span className="flex flex-col items-center shrink-0" aria-hidden>
                          <StatusDot tone={statusMeta('order', h.toStatus).tone} className="mt-1.5 h-2.5 w-2.5" />
                          {!last && <span className="w-px flex-1 bg-neutral-200 my-1" />}
                        </span>
                        <span className={cn('min-w-0 flex-1', !last && 'pb-3.5')}>
                          <span className="flex items-baseline justify-between gap-2 flex-wrap">
                            <span className="text-sm font-medium text-neutral-900">{ORDER_STATUS[h.toStatus]?.label ?? h.toStatus}</span>
                            <time dateTime={h.changedAt} className="text-caption text-neutral-500 shrink-0" title={fmtDateTime(h.changedAt)}>{fmtTime(h.changedAt)}</time>
                          </span>
                          {h.changedByName && <span className="block text-caption text-neutral-500">{h.changedByName}</span>}
                          {h.note && (
                            <span className="mt-0.5 flex items-start gap-1 text-caption text-neutral-500">
                              <ArrowRight className="h-3 w-3 mt-0.5 shrink-0 text-neutral-300" aria-hidden />
                              <span className="min-w-0 break-words">{h.note}</span>
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <CancelItemDialog order={o} item={cancelItem} onClose={() => setCancelItem(null)} loading={m.cancelItem.isPending} onConfirm={async (body) => { if (cancelItem) await m.cancelItem.mutateAsync({ id: o.id, itemId: cancelItem.id, body }); }} />

      <ConfirmDialog
        open={cancelOrder}
        onClose={() => { setCancelOrder(false); setReasonTouched(false); }}
        variant="danger"
        title={`Cancel ${o.orderNumber}?`}
        message={
          <>
            <span className="block">Every line on this order is marked cancelled and kept in history with your reason. The kitchen and bar displays are told immediately.</span>
            <span className="block mt-1.5">Any open, unpaid bill for the order is voided, and stock already deducted for these lines is returned. This cannot be undone.</span>
          </>
        }
        confirmLabel="Cancel order"
        loading={m.cancel.isPending}
        onConfirm={async () => {
          setReasonTouched(true);
          if (!reason.trim()) return;
          await m.cancel.mutateAsync({ id: o.id, reason: reason.trim() });
          setCancelOrder(false);
          setReasonTouched(false);
        }}
      >
        <Textarea
          label="Reason"
          required
          rows={2}
          maxLength={300}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={reasonTouched && !reason.trim() ? 'A reason is required before an order can be cancelled.' : undefined}
          hint="Recorded in the audit log against your name."
          placeholder="e.g. guests left before the order was prepared"
          data-autofocus
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmBill}
        onClose={() => setConfirmBill(false)}
        title="Request the bill?"
        message={`The cashier will be notified for ${o.tableName}. No more items can be added after this.`}
        confirmLabel="Request bill"
        loading={m.requestBill.isPending}
        onConfirm={async () => { await m.requestBill.mutateAsync(o.id); setConfirmBill(false); }}
      />
    </div>
  );
}
