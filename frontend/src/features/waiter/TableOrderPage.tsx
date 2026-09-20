import { useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ClipboardList, Receipt, Users, Clock, Utensils, Wallet, ArrowRight, ChevronLeft } from 'lucide-react';
import { useTable } from '@/features/tables/hooks';
import { useOrder, useOrderMutations } from '@/features/orders/hooks';
import { OrderEntry } from './OrderEntry';
import { usePermission } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useRealtime';
import { LoadingState, ErrorState, StatusBadge, Button, EmptyState, Card, ConfirmDialog } from '@/components/ui';
import { money } from '@/utils/money';
import { elapsedMinutes } from '@/utils/date';
import { canAddItems, canRequestBill } from '@/utils/orderStatus';
import { cn } from '@/utils/cn';
import { toast } from '@/store/uiStore';
import type { NewOrderItemInput } from '@/types';

/** Plain-language stage names for the "already billing" message. */
const ORDER_STAGE: Partial<Record<string, string>> = {
  BILL_REQUESTED: 'with the cashier',
  BILLED: 'billed',
  PAID: 'paid',
  COMPLETED: 'closed',
  CANCELLED: 'cancelled',
};

/** "42m" / "2h 05m" — derived from a timestamp the order already carries. */
function ageLabel(iso: string, now: Date): string {
  const m = elapsedMinutes(iso, now);
  if (m < 1) return '<1m';
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

/** One readout in the order summary strip. Labels stay small so the value carries the row. */
function Metric({ icon, label, value, emphasis }: { icon: ReactNode; label: string; value: ReactNode; emphasis?: boolean }) {
  return (
    <div className="well px-3 py-2 min-w-0">
      <dt className="text-label uppercase text-neutral-500 flex items-center gap-1.5 truncate">
        <span className="shrink-0 text-neutral-400" aria-hidden>{icon}</span>
        <span className="truncate">{label}</span>
      </dt>
      <dd className={cn('mt-0.5 font-semibold tabular-nums text-neutral-900 truncate', emphasis ? 'text-lg leading-6' : 'text-base leading-6')}>
        {value}
      </dd>
    </div>
  );
}

/**
 * Waiter selects a table → existing active order (append batch) or new order.
 * Rule 2: one active order per table (server-enforced; the UI simply routes to it).
 *
 * The strip above the menu answers "what is happening at this table" before the waiter
 * touches anything: table, guests, how long the order has been open, what it is worth so
 * far and where it sits in the flow. Only one action is ever styled as primary — when the
 * table is fully served that is "Request bill"; otherwise it is the order panel's own
 * Send button, and everything in this header stays quiet so it cannot compete with it.
 */
export default function TableOrderPage() {
  const { tableId } = useParams();
  const tid = Number(tableId);
  const navigate = useNavigate();
  const table = useTable(tid);
  const order = useOrder(table.data?.activeOrderId ?? undefined);
  const m = useOrderMutations();
  const now = useNow(30_000);
  const canBill = usePermission('orders:request-bill');
  const [confirmBill, setConfirmBill] = useState(false);

  if (table.isLoading || (table.data?.activeOrderId && order.isLoading)) return <LoadingState variant="page" />;
  if (table.isError || !table.data) return <ErrorState error={table.error} onRetry={() => void table.refetch()} />;
  const t = table.data;
  const o = order.data ?? null;
  const mode: 'new' | 'draft' | 'append' = !o ? 'new' : o.status === 'DRAFT' ? 'draft' : 'append';

  if (o && !canAddItems(o.status)) {
    return (
      <div className="max-w-xl mx-auto">
        <Card padded={false}>
          <EmptyState
            icon={<Receipt className="h-6 w-6" />}
            title={`${t.name} is being billed`}
            description={`${o.orderNumber} is ${(ORDER_STAGE[o.status] ?? o.status.replace(/_/g, ' ').toLowerCase())} · ${o.itemCount} items · ${money(o.subtotal)}. No more items can be added to this order.`}
            action={
              <div className="flex flex-col xs:flex-row gap-2">
                <Button leftIcon={<ClipboardList className="h-4 w-4" />} onClick={() => navigate(`/waiter/orders/${o.id}`)}>View order</Button>
                <Button variant="outline" leftIcon={<ChevronLeft className="h-4 w-4" />} onClick={() => navigate('/waiter/tables')}>Back to tables</Button>
              </div>
            }
          />
        </Card>
      </div>
    );
  }

  // The bill can only be requested from here once every line has actually reached the guest.
  const showRequestBill = !!o && canBill && o.status === 'SERVED' && canRequestBill(o.status);

  const nextStep = !o || mode === 'draft'
    ? 'Pick items from the menu, then Send order in the order panel.'
    : showRequestBill
      ? 'Everything has been served — request the bill when the guest is ready.'
      : 'Sending adds a new batch to this order; the kitchen and bar keep the earlier ones.';

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
      <section aria-label={`Order summary for ${t.name}`} className="card p-4 mb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-heading text-neutral-900">{t.name}</h1>
              {o ? <StatusBadge kind="order" status={o.status} /> : <StatusBadge kind="table" status={t.status} />}
            </div>
            <p className="text-caption text-neutral-500 mt-1 truncate">
              {t.floorName}
              {o ? ` · ${o.orderNumber} · ${o.waiterName}` : ` · ${t.capacity} seats · new order`}
            </p>
          </div>

          {/* Exactly one primary action, and only when it is genuinely the next step. */}
          <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
            {o && (
              <Button size="sm" variant="ghost" leftIcon={<ClipboardList className="h-4 w-4" />} className="min-h-touch" onClick={() => navigate(`/waiter/orders/${o.id}`)}>
                Order details
              </Button>
            )}
            {showRequestBill && o && (
              <Button size="lg" leftIcon={<Receipt className="h-4 w-4" />} onClick={() => setConfirmBill(true)}>Request bill</Button>
            )}
          </div>
        </div>

        {/* Nothing is invented here — every figure is already on the order the page loaded. */}
        {o && (
          <dl className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Metric icon={<Users className="h-3.5 w-3.5" />} label="Guests" value={o.guestCount} />
            <Metric icon={<Clock className="h-3.5 w-3.5" />} label="Open for" value={<time dateTime={o.createdAt}>{ageLabel(o.createdAt, now)}</time>} />
            <Metric icon={<Utensils className="h-3.5 w-3.5" />} label="Items" value={o.itemCount} />
            <Metric icon={<Wallet className="h-3.5 w-3.5" />} label="Running total" value={money(o.subtotal)} emphasis />
          </dl>
        )}

        <p className="mt-3 text-caption text-neutral-600 flex items-start gap-1.5">
          <ArrowRight className="h-3.5 w-3.5 mt-0.5 shrink-0 text-neutral-400" aria-hidden />
          <span>{nextStep}</span>
        </p>
      </section>

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

      {o && (
        <ConfirmDialog
          open={confirmBill}
          onClose={() => setConfirmBill(false)}
          title="Request the bill?"
          message={`The cashier will be notified for ${t.name}. No more items can be added to ${o.orderNumber} after this.`}
          confirmLabel="Request bill"
          loading={m.requestBill.isPending}
          onConfirm={async () => { await m.requestBill.mutateAsync(o.id); setConfirmBill(false); }}
        />
      )}
    </div>
  );
}
