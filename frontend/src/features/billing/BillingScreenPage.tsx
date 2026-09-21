import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Printer, Percent, CreditCard, Lock, CheckCircle2, X, Tag, ChefHat, Wine, Undo2, Receipt, ChevronUp } from 'lucide-react';
import { useBill, useBillMutations } from './hooks';
import { BillSummary } from './BillSummary';
import { DiscountDialog } from './DiscountDialog';
import { useOrder } from '@/features/orders/hooks';
import { usePermission } from '@/hooks/useAuth';
import { useRealtimeInvalidate } from '@/hooks/useRealtime';
import { PageHeader, Button, Card, CardHeader, StatusBadge, Badge, ConfirmDialog, LoadingState, ErrorState, KeyValue, Textarea } from '@/components/ui';
import { money } from '@/utils/money';
import { fmtDateTime, fmtTime } from '@/utils/date';
import { PAYMENT_METHOD_LABELS } from '@/config/statuses';
import { cn } from '@/utils/cn';

/**
 * POS billing screen: LEFT items / discounts / notes · RIGHT totals / payments / actions.
 * Route: /cashier/orders/:orderId/bill (creates or reuses the bill) or /cashier/bills/:id.
 *
 * Phone (< lg): the right rail is dropped and the summary collapses into a dock at the foot
 * of the screen — the two numbers a cashier needs at all times plus the one action the bill
 * is currently waiting on, expandable to the full breakdown. See the dock comment below for
 * how it stays clear of the POS bottom navigation and of the last card on the page.
 */
export default function BillingScreenPage() {
  const { id, orderId } = useParams();
  const navigate = useNavigate();
  const m = useBillMutations();
  const [billId, setBillId] = useState<number | undefined>(id ? Number(id) : undefined);
  const order = useOrder(orderId ? Number(orderId) : undefined);
  useEffect(() => {
    if (!billId && orderId) {
      if (order.data?.billId) setBillId(order.data.billId);
      else if (order.data) m.create.mutateAsync(order.data.id).then((b) => { setBillId(b.id); navigate(`/cashier/bills/${b.id}`, { replace: true }); }).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.data?.id, order.data?.billId, billId, orderId]);
  const q = useBill(billId);
  useRealtimeInvalidate(['bills', 'orders']);
  const canDiscount = usePermission('billing:discount');
  const canPay = usePermission('billing:pay');
  const canClose = usePermission('billing:close');
  const canRefund = usePermission('billing:refund');
  const [discountOpen, setDiscountOpen] = useState(false);
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [reverse, setReverse] = useState<number | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [dockOpen, setDockOpen] = useState(false);

  if (order.isError) return <ErrorState error={order.error} onRetry={() => void order.refetch()} />;
  if (m.create.isError) return <ErrorState error={m.create.error} onRetry={() => order.data && m.create.mutate(order.data.id)} />;
  if (!billId || q.isLoading) return <LoadingState variant="page" />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const b = q.data;
  const open = b.status === 'OPEN';
  const editable = open;
  const details = [
    { label: 'Table', value: `${b.tableName} (${b.tableNumber})` },
    { label: 'Order', value: b.orderNumber },
    { label: 'Finalized', value: fmtDateTime(b.finalizedAt) },
    { label: 'Paid', value: fmtDateTime(b.paidAt) },
  ];

  /* The same decisions in the same order as the desktop rail — conditions are not merged, so
     which action is offered never depends on where it is rendered. */
  const actions = (
    <>
      {open && <Button size="pos" block className="lg:col-span-2" leftIcon={<Lock className="h-5 w-5" />} loading={m.finalize.isPending} onClick={() => setConfirmFinalize(true)}>Finalize bill</Button>}
      {!open && b.balanceDue > 0 && canPay && <Button size="pos" block variant="success" className="lg:col-span-2" leftIcon={<CreditCard className="h-5 w-5" />} onClick={() => navigate(`/cashier/bills/${b.id}/pay`)}>Take payment · {money(b.balanceDue)}</Button>}
      {b.paymentStatus === 'PAID' && b.status !== 'CLOSED' && canClose && <Button size="pos" block variant="primary" className="lg:col-span-2" leftIcon={<CheckCircle2 className="h-5 w-5" />} loading={m.close.isPending} onClick={() => setConfirmClose(true)}>Close order &amp; free table</Button>}
      {b.status === 'CLOSED' && <div className="lg:col-span-2 rounded-sm bg-success-50 border border-success-200 text-success-700 text-sm font-medium px-3 py-2 text-center">Order completed · {fmtDateTime(b.closedAt)}</div>}
    </>
  );
  const links = (
    <>
      <Button variant="outline" block leftIcon={<Printer className="h-4 w-4" />} onClick={() => navigate(`/cashier/bills/${b.id}/receipt`)}>{b.paymentStatus === 'PAID' ? 'Receipt' : 'Print bill'}</Button>
      <Button variant="outline" block leftIcon={<Receipt className="h-4 w-4" />} onClick={() => navigate(`/admin/orders/${b.orderId}`)}>Order</Button>
    </>
  );

  return (
    <div>
      <PageHeader back={() => navigate('/cashier')} title={<span className="flex items-center gap-3 flex-wrap">{b.tableName}<StatusBadge kind="bill" status={b.status} size="lg" /><StatusBadge kind="payment" status={b.paymentStatus} /></span>} subtitle={`${b.billNumber} · ${b.orderNumber} · Waiter ${b.waiterName} · Cashier ${b.cashierName} · ${fmtDateTime(b.createdAt)}`}
        actions={<><Button variant="outline" className="w-full sm:w-auto min-h-touch sm:min-h-0" leftIcon={<Printer className="h-4 w-4" />} onClick={() => navigate(`/cashier/bills/${b.id}/receipt`)}>Print bill</Button></>} />
      {/* The trailing padding is what keeps the last card reachable above the phone dock. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* LEFT */}
        <div className="space-y-4">
          <Card padded={false}>
            {/* Every block on this screen wears the same `CardHeader` the manager's panels do —
                title, one supporting line, and the block's own action on the right. */}
            <CardHeader
              className="p-4 pb-3 mb-0 border-b border-neutral-200"
              title="Items"
              subtitle={`${b.items.length} line${b.items.length === 1 ? '' : 's'} · prices as ordered`}
            />
            <ul className="divide-y divide-neutral-200">
              {b.items.map((it) => (
                <li key={it.id} className="px-4 py-3 flex items-start gap-3">
                  <span className={cn('mt-0.5 h-8 w-8 rounded-sm flex items-center justify-center shrink-0 ring-1 ring-inset', it.prepLocation === 'BAR' ? 'bg-info-50 text-info-700 ring-info-200' : 'bg-warning-50 text-warning-700 ring-warning-200')}>{it.prepLocation === 'BAR' ? <Wine className="h-4 w-4" /> : <ChefHat className="h-4 w-4" />}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-neutral-900">{it.itemName} <span className="text-neutral-500 font-normal">× {it.quantity}</span></p>
                    <p className="text-caption text-neutral-500 tnum">{money(it.unitPrice)} each · tax {it.taxPercent}%{it.notes ? ` · ${it.notes}` : ''}</p>
                    {it.discountAmount > 0 && <Badge tone="success" size="sm" icon={<Tag className="h-3 w-3" />} className="mt-1">Offer −{money(it.discountAmount)}</Badge>}
                  </div>
                  <span className="font-semibold tnum text-neutral-900">{money(it.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <p className="px-4 py-2 text-caption text-neutral-500 border-t border-neutral-200">Quantities are locked once items are sent to the kitchen/bar. Use item cancellation on the order (manager approval) to remove items.</p>
          </Card>
          <Card padded={false}>
            <CardHeader
              className="p-4 pb-3 mb-0 border-b border-neutral-200"
              title={<span className="flex items-center gap-2"><Percent className="h-4 w-4" aria-hidden />Discounts</span>}
              subtitle={b.orderDiscountTotal > 0 ? `−${money(b.orderDiscountTotal)} applied to this bill` : undefined}
              /* Gated exactly as before: `billing:discount` AND an open bill. */
              action={canDiscount && editable && <Button size="sm" variant="outline" className="min-h-touch sm:min-h-0" onClick={() => setDiscountOpen(true)}>Add discount</Button>}
            />
            {b.discounts.filter((d) => !d.isVoided).length === 0 ? <p className="px-4 py-4 text-sm text-neutral-500">No bill-level discount.{!editable && ' (Bill finalized — discounts locked.)'}</p> : (
              <ul className="divide-y divide-neutral-200">{b.discounts.filter((d) => !d.isVoided).map((d) => (
                <li key={d.id} className="px-4 py-3 flex items-center gap-3 text-sm">
                  <div className="min-w-0 flex-1"><p className="font-medium text-neutral-900">{d.discountType === 'PERCENTAGE' ? `${d.value}%` : money(d.value)} — {d.reason}</p><p className="text-caption text-neutral-500">by {d.appliedByName}{d.approvedByName ? ` · approved by ${d.approvedByName}` : ''} · {fmtTime(d.createdAt)}</p></div>
                  <span className="font-semibold tnum text-success-700">−{money(d.amount)}</span>
                  {canDiscount && editable && <Button size="sm" variant="ghost" className="min-h-touch min-w-touch sm:min-h-0 sm:min-w-0 shrink-0" aria-label="Remove discount" onClick={() => m.removeDiscount.mutate({ id: b.id, discountId: d.id })}><X className="h-4 w-4" /></Button>}
                </li>))}</ul>
            )}
          </Card>
          {b.payments.length > 0 && (
            <Card padded={false}>
              <CardHeader
                className="p-4 pb-3 mb-0 border-b border-neutral-200"
                title={<span className="flex items-center gap-2"><CreditCard className="h-4 w-4" aria-hidden />Payments</span>}
                /* Straight off the bill the server returned — never a sum computed here. */
                subtitle={`${money(b.paidAmount, { decimals: true })} taken of ${money(b.grandTotal, { decimals: true })}`}
              />
              <ul className="divide-y divide-neutral-200">{b.payments.map((p) => (
                <li key={p.id} className={cn('px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm', p.status === 'REVERSED' && 'opacity-60')}>
                  <Badge tone={p.status === 'REVERSED' ? 'danger' : 'primary'}>{PAYMENT_METHOD_LABELS[p.method]}</Badge>
                  <div className="min-w-0 flex-1"><p className="font-medium text-neutral-900">{p.paymentNumber}{p.reference ? ` · ${p.reference}` : ''}</p><p className="text-caption text-neutral-500">{p.receivedByName} · {fmtTime(p.createdAt)}{p.status === 'REVERSED' ? ` · reversed: ${p.reversalReason}` : ''}</p></div>
                  <span className={cn('font-semibold tnum text-neutral-900', p.status === 'REVERSED' && 'line-through')}>{money(p.amount)}</span>
                  {canRefund && p.status === 'SUCCESS' && b.status !== 'CLOSED' && <Button size="sm" variant="ghost" className="text-danger-700 min-h-touch sm:min-h-0" leftIcon={<Undo2 className="h-4 w-4" />} onClick={() => setReverse(p.id)}>Reverse</Button>}
                </li>))}</ul>
            </Card>
          )}
          {/* Phone: what the desktop rail carries below the summary, kept in the reading flow. */}
          <Card className="lg:hidden">
            <div className="grid grid-cols-2 gap-2">{links}</div>
            {open && <p className="text-caption text-neutral-500 mt-3">Finalizing locks items and discounts and marks the order BILLED. Payments are accepted only on finalized bills.</p>}
          </Card>
          <Card className="lg:hidden"><KeyValue items={details} /></Card>
        </div>
        {/* RIGHT — the sticky rail is a desktop affordance only; on a phone it would cover the bill. */}
        <div className="hidden lg:block space-y-4 lg:sticky lg:top-20 self-start">
          <Card>
            <BillSummary bill={b} />
            <div className="mt-5 grid grid-cols-2 gap-2">
              {actions}
              {links}
            </div>
            {open && <p className="text-caption text-neutral-500 mt-3">Finalizing locks items and discounts and marks the order BILLED. Payments are accepted only on finalized bills.</p>}
          </Card>
          <Card><KeyValue items={details} /></Card>
        </div>
      </div>

      {/*
        PHONE DOCK — stays on screen while the page scrolls, parks above the bottom navigation.
        Offset comes from the shared `.save-bar` rule (`--app-bottom-nav`), never from a
        hand-matched padding value; because the dock is sticky and last in the flow it settles
        into its natural place at the end of the scroll, so the final card is always reachable.
      */}
      <div className="lg:hidden save-bar mt-4">
        <div className="card shadow-panel overflow-hidden">
          <div id="bill-summary-sheet" hidden={!dockOpen} className="max-h-64 overflow-y-auto overscroll-contain px-4 py-3 border-b border-neutral-200">
            <BillSummary bill={b} compact />
          </div>
          <button
            type="button"
            aria-expanded={dockOpen}
            aria-controls="bill-summary-sheet"
            onClick={() => setDockOpen((o) => !o)}
            className="w-full min-h-touch px-4 py-2.5 flex items-center gap-3 text-left transition-colors duration-control hover:bg-neutral-100"
          >
            {/* Same hierarchy as the desktop rail: grand total heaviest, balance due coloured
                and one step down, both tabular so they align across the dock. */}
            <span className="min-w-0 flex-1">
              <span className="block text-label uppercase text-neutral-500">Grand total</span>
              <span className="block text-2xl leading-8 font-semibold tnum text-neutral-900 truncate">{money(b.grandTotal, { decimals: true })}</span>
            </span>
            {b.balanceDue > 0.005 && (
              <span className="min-w-0 text-right">
                <span className="block text-label uppercase text-neutral-500">Balance due</span>
                <span className="block text-lg leading-7 font-semibold tnum text-danger-700 truncate">{money(b.balanceDue, { decimals: true })}</span>
              </span>
            )}
            <ChevronUp className={cn('h-5 w-5 shrink-0 text-neutral-400 transition-transform duration-control ease-out-soft', dockOpen && 'rotate-180')} aria-hidden />
            <span className="sr-only">{dockOpen ? 'Hide bill breakdown' : 'Show bill breakdown'}</span>
          </button>
          <div className="px-3 pb-3 space-y-2">{actions}</div>
        </div>
      </div>

      <DiscountDialog bill={b} open={discountOpen} onClose={() => setDiscountOpen(false)} loading={m.addDiscount.isPending} onApply={async (body) => { await m.addDiscount.mutateAsync({ id: b.id, body }); }} />
      <ConfirmDialog open={confirmFinalize} onClose={() => setConfirmFinalize(false)} title="Finalize this bill?" message={<span>Grand total <strong>{money(b.grandTotal)}</strong>. Items and discounts are locked after this; the order moves to BILLED.</span>} confirmLabel="Finalize" loading={m.finalize.isPending} onConfirm={async () => { await m.finalize.mutateAsync(b.id); setConfirmFinalize(false); }} />
      <ConfirmDialog open={confirmClose} onClose={() => setConfirmClose(false)} title="Close order?" message={`${b.tableName} becomes available for the next guests. Paid bills cannot be edited afterwards without admin authorization.`} confirmLabel="Close order" loading={m.close.isPending} onConfirm={async () => { await m.close.mutateAsync(b.id); setConfirmClose(false); }} />
      <ConfirmDialog open={reverse != null} onClose={() => setReverse(null)} variant="danger" title="Reverse this payment?" message="The payment is marked REVERSED (never deleted) and the balance due is recalculated." confirmLabel="Reverse payment" loading={m.reversePayment.isPending} onConfirm={async () => { if (reverse != null && reverseReason.trim()) { await m.reversePayment.mutateAsync({ id: b.id, paymentId: reverse, reason: reverseReason.trim() }); setReverse(null); setReverseReason(''); } }}>
        <Textarea label="Reason" required rows={2} value={reverseReason} onChange={(e) => setReverseReason(e.target.value)} />
      </ConfirmDialog>
    </div>
  );
}
