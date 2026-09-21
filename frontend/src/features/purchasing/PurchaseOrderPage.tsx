import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus, Trash2, Save, Send, ThumbsUp, Truck, PackageCheck, XCircle, AlertTriangle, CheckCircle2, Circle, Printer, ChevronLeft, CalendarDays, Building2 } from 'lucide-react';
import { usePurchaseOrder, usePurchasingMutations, useSuppliers, useInventoryItems, useInventoryUnits } from '@/features/p2/hooks';
import { usePermission } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useSurface';
import { Button, Card, CardHeader, Input, Select, Textarea, IconButton, StatusBadge, KeyValue, Avatar, Modal, ConfirmDialog, LoadingState, ErrorState, EmptyState, Alert } from '@/components/ui';
import { ApiError } from '@/services/api/client';
import { money, round2 } from '@/utils/money';
import { fmtDate, fmtDateTime, todayInput } from '@/utils/date';
import { cn } from '@/utils/cn';
import type { PurchaseOrder, PoStatus, ID } from '@/types';

interface Line { invItemId: ID | ''; qty: string; unitId: ID | ''; unitPrice: string; taxPercent: string }

/** The states a purchase order in this product actually passes through, in order. */
const LIFECYCLE: PoStatus[] = ['DRAFT', 'SENT', 'APPROVED', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED'];

function ReceiveModal({ po, onClose }: { po: PurchaseOrder; onClose: () => void }) {
  const { receive } = usePurchasingMutations();
  const [invoiceNo, setInvoiceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState(po.items.map((i) => ({ poItemId: i.id, itemName: i.itemName, unitCode: i.unitCode, pending: i.pendingQty, receivedQty: String(i.pendingQty), damagedQty: '0', unitCost: String(i.unitPrice) })));
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setError(null);
    try { await receive.mutateAsync({ id: po.id, body: { invoiceNo: invoiceNo || undefined, notes: notes || undefined, items: rows.map((r) => ({ poItemId: r.poItemId, receivedQty: Number(r.receivedQty) || 0, damagedQty: Number(r.damagedQty) || 0, unitCost: Number(r.unitCost) || undefined })) } }); onClose(); }
    catch (e) { setError(ApiError.from(e).message); }
  };
  return (
    <Modal open onClose={onClose} size="lg" title={`Receive goods — ${po.poNumber}`} description="Received quantities enter stock as PURCHASE movements; damaged units are recorded but never added to usable stock." footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button leftIcon={<PackageCheck className="h-4 w-4" />} loading={receive.isPending} onClick={() => void submit()}>Receive into stock</Button></>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4"><Input label="Supplier invoice no." value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} /><Input label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      <div className="table-scroll rounded-md border border-neutral-200"><table className="w-full text-sm">
        <thead className="bg-neutral-50 text-label uppercase text-neutral-600"><tr><th className="text-left px-3 py-2">Item</th><th className="text-right px-2 py-2">Pending</th><th className="text-right px-2 py-2 w-28">Received</th><th className="text-right px-2 py-2 w-24">Damaged</th><th className="text-right px-2 py-2 w-28">Unit cost</th></tr></thead>
        <tbody className="divide-y divide-neutral-200">{rows.map((r, i) => (
          <tr key={r.poItemId}><td className="px-3 py-2 font-medium">{r.itemName}</td><td className="px-2 py-2 text-right tabular-nums text-neutral-600">{r.pending} {r.unitCode}</td>
            <td className="px-2 py-2"><input aria-label="Received" type="number" step="any" min={0} className="input-base min-h-[36px] text-right" value={r.receivedQty} onChange={(e) => setRows((rs) => rs.map((x, idx) => (idx === i ? { ...x, receivedQty: e.target.value } : x)))} /></td>
            <td className="px-2 py-2"><input aria-label="Damaged" type="number" step="any" min={0} className="input-base min-h-[36px] text-right" value={r.damagedQty} onChange={(e) => setRows((rs) => rs.map((x, idx) => (idx === i ? { ...x, damagedQty: e.target.value } : x)))} /></td>
            <td className="px-2 py-2"><input aria-label="Unit cost" type="number" step="0.01" min={0} className="input-base min-h-[36px] text-right" value={r.unitCost} onChange={(e) => setRows((rs) => rs.map((x, idx) => (idx === i ? { ...x, unitCost: e.target.value } : x)))} /></td></tr>))}</tbody>
      </table></div>
      {error && <p role="alert" className="mt-3 text-sm text-danger-700">{error}</p>}
    </Modal>
  );
}

interface Stage { label: string; at?: string | null; done: boolean; terminal?: boolean }

/**
 * ORDER PROGRESS — the order's own lifecycle, nothing else.
 *
 * The reference board draws a carrier tracker here ("Dispatched → Out for delivery"). This product
 * records no carrier events: a purchase order moves draft → sent → approved → ordered → part
 * received → received, and each of those transitions is a real timestamp on the record. So those
 * are the stages, the date under a stage is the one the record holds, and a stage the order has
 * reached without a timestamp of its own (part received) simply prints no date rather than a
 * plausible one.
 */
function OrderProgress({ stages }: { stages: Stage[] }) {
  return (
    <ol className="flex flex-col sm:flex-row sm:items-stretch gap-4 sm:gap-0" aria-label="Order progress">
      {stages.map((st, i) => {
        const last = i === stages.length - 1;
        return (
          <li key={st.label} className="flex sm:flex-col gap-3 sm:gap-0 sm:flex-1 sm:min-w-0">
            <span className="flex flex-col sm:flex-row sm:w-full items-center shrink-0">
              <span
                className={cn(
                  'h-7 w-7 shrink-0 rounded-full grid place-items-center ring-1 ring-inset',
                  st.terminal ? 'bg-danger-50 text-danger-700 ring-danger-200'
                    : st.done ? 'bg-primary-50 text-primary-700 ring-primary-200'
                      : 'bg-neutral-50 text-neutral-400 ring-neutral-200',
                )}
                aria-hidden
              >
                {st.terminal ? <XCircle className="h-4 w-4" /> : st.done ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-3.5 w-3.5" />}
              </span>
              {!last && <span className={cn('w-0.5 flex-1 sm:w-auto sm:h-0.5 sm:flex-1 sm:mx-2', st.done ? 'bg-primary-500' : 'bg-neutral-200')} aria-hidden />}
            </span>
            <span className="min-w-0 sm:mt-2 pb-1">
              <span className={cn('block text-sm font-medium', st.done ? 'text-neutral-900' : 'text-neutral-500')}>{st.label}</span>
              <span className="block text-caption text-neutral-500 tabular-nums">{st.at ? fmtDate(st.at) : ''}</span>
              <span className="sr-only">{st.done ? 'reached' : 'not yet reached'}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * THE SAME STAGES, READ DOWNWARDS.
 *
 * The manager board draws this progress as a vertical status timeline rather than the horizontal
 * tracker the admin board uses, and puts the moment each stage happened directly under its name.
 * The stages themselves are identical — they are built once, above, from what the record holds —
 * so nothing here decides what did or did not happen. A stage the order reached without a
 * timestamp of its own (a partial receipt) prints NO date, rather than borrowing a plausible one
 * from the stage above it, and a stage it has not reached prints nothing either.
 */
function OrderTimeline({ stages }: { stages: Stage[] }) {
  return (
    <ol className="min-w-0" aria-label="Order status">
      {stages.map((st, i) => {
        const last = i === stages.length - 1;
        return (
          <li key={st.label} className="flex gap-3 min-w-0">
            <span className="flex flex-col items-center shrink-0" aria-hidden>
              <span
                className={cn(
                  'h-7 w-7 shrink-0 rounded-full grid place-items-center ring-1 ring-inset',
                  st.terminal ? 'bg-danger-50 text-danger-700 ring-danger-200'
                    : st.done ? 'bg-primary-50 text-primary-700 ring-primary-200'
                      : 'bg-neutral-50 text-neutral-400 ring-neutral-200',
                )}
              >
                {st.terminal ? <XCircle className="h-4 w-4" /> : st.done ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-3.5 w-3.5" />}
              </span>
              {!last && <span className={cn('w-0.5 flex-1 my-1', st.done ? 'bg-primary-500' : 'bg-neutral-200')} />}
            </span>
            <span className={cn('min-w-0 flex-1 pt-0.5', !last && 'pb-4')}>
              <span className={cn('block text-sm font-medium', st.done ? 'text-neutral-900' : 'text-neutral-500')}>{st.label}</span>
              {st.at && <time dateTime={st.at} className="block text-caption text-neutral-500 tabular-nums">{fmtDateTime(st.at)}</time>}
              <span className="sr-only">{st.done ? 'reached' : 'not yet reached'}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default function PurchaseOrderPage() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const ws = useWorkspace();
  const [params] = useSearchParams();
  const po = usePurchaseOrder(isNew ? undefined : Number(id));
  const suppliers = useSuppliers({ status: 'ACTIVE' });
  const items = useInventoryItems({});
  const units = useInventoryUnits();
  const { savePo, transitionPo } = usePurchasingMutations();
  const canManage = usePermission('purchases:manage');
  const canApprove = usePermission('purchases:approve');
  const canReceive = usePermission('purchases:receive');
  const [supplierId, setSupplierId] = useState<ID | ''>(params.get('supplierId') ? Number(params.get('supplierId')) : '');
  const [expected, setExpected] = useState(todayInput());
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([{ invItemId: '', qty: '', unitId: '', unitPrice: '', taxPercent: '0' }]);
  const [error, setError] = useState<string | null>(null);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [editing, setEditing] = useState(isNew);
  useEffect(() => {
    if (!po.data) return;
    setSupplierId(po.data.supplierId); setExpected(po.data.expectedDate ?? ''); setNotes(po.data.notes ?? '');
    setLines(po.data.items.map((i) => ({ invItemId: i.invItemId, qty: String(i.qty), unitId: i.unitId, unitPrice: String(i.unitPrice), taxPercent: String(i.taxPercent) })));
  }, [po.data?.id, po.data?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isNew && po.isLoading) return <LoadingState variant="page" />;
  if (!isNew && (po.isError || !po.data)) return <ErrorState error={po.error} onRetry={() => void po.refetch()} />;
  const p = po.data ?? null;
  const editable = editing && canManage && (isNew || ['DRAFT', 'SENT'].includes(p?.status ?? ''));
  const inv = (v: ID | '') => items.data?.find((i) => i.id === v);
  const lineTotal = (l: Line) => round2((Number(l.qty) || 0) * (Number(l.unitPrice) || 0) * (1 + (Number(l.taxPercent) || 0) / 100));
  const subtotal = round2(lines.reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.unitPrice) || 0), 0));
  const grand = round2(lines.reduce((a, l) => a + lineTotal(l), 0));
  const update = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const onSave = async () => {
    setError(null);
    try {
      const saved = await savePo.mutateAsync({ id: p?.id ?? null, body: { supplierId: Number(supplierId), expectedDate: expected || undefined, notes: notes || undefined, items: lines.filter((l) => l.invItemId).map((l) => ({ invItemId: Number(l.invItemId), qty: Number(l.qty), unitId: l.unitId ? Number(l.unitId) : undefined, unitPrice: Number(l.unitPrice) || 0, taxPercent: Number(l.taxPercent) || 0 })) } });
      setEditing(false);
      if (isNew) navigate(`/admin/purchases/${saved.id}`, { replace: true });
    } catch (e) { setError(ApiError.from(e).message); }
  };
  const act = async (action: 'SEND' | 'APPROVE' | 'ORDER') => { setError(null); try { await transitionPo.mutateAsync({ id: p!.id, action }); } catch (e) { setError(ApiError.from(e).message); } };

  const filledLines = lines.filter((l) => l.invItemId);
  const overdue = !!p?.expectedDate && p.expectedDate < todayInput() && !['RECEIVED', 'CANCELLED'].includes(p.status);
  const orderedQty = p ? p.items.reduce((a, i) => a + i.qty, 0) : 0;
  const receivedQty = p ? p.items.reduce((a, i) => a + i.receivedQty, 0) : 0;
  const receivedPct = orderedQty ? Math.round((receivedQty * 100) / orderedQty) : 0;
  const supplier = suppliers.data?.find((x) => x.id === p?.supplierId);

  /** The stages this record actually holds, and which of them it has reached. */
  const stages: Stage[] = (() => {
    if (!p) return [];
    if (p.status === 'CANCELLED') {
      const walked: Stage[] = [
        { label: 'Draft', at: p.createdAt, done: true },
        { label: 'Sent', at: p.sentAt, done: !!p.sentAt },
        { label: 'Approved', at: p.approvedAt, done: !!p.approvedAt },
        { label: 'Ordered', at: p.orderedAt, done: !!p.orderedAt },
      ].filter((s) => s.done);
      return [...walked, { label: 'Cancelled', at: p.cancelledAt, done: true, terminal: true }];
    }
    const reached = LIFECYCLE.indexOf(p.status);
    return [
      { label: 'Draft', at: p.createdAt, done: reached >= 0 },
      { label: 'Sent', at: p.sentAt, done: reached >= 1 },
      { label: 'Approved', at: p.approvedAt, done: reached >= 2 },
      { label: 'Ordered', at: p.orderedAt, done: reached >= 3 },
      /* The record keeps no timestamp for a partial receipt, so this stage prints no date. */
      { label: 'Part received', done: reached >= 4 },
      { label: 'Received', at: p.receivedAt, done: reached >= 5 },
    ];
  })();

  /**
   * The single action that moves this PO to its next state. It is always rendered while the
   * state has a next step — disabled with the missing precondition spelled out, never hidden,
   * so the buyer knows who or what is blocking the order.
   */
  type Next = { label: string; icon: ReactNode; variant: 'primary' | 'success'; onClick: () => void; blocked?: string };
  const nextStep: Next | null = (() => {
    if (editable) {
      const blocked = !supplierId ? 'Choose a supplier first' : filledLines.length === 0 ? 'Add at least one line first' : undefined;
      return { label: isNew ? 'Create draft' : 'Save changes', icon: <Save className="h-4 w-4" />, variant: 'primary', onClick: () => void onSave(), blocked };
    }
    if (!p) return null;
    switch (p.status) {
      case 'DRAFT':
        return { label: 'Send for approval', icon: <Send className="h-4 w-4" />, variant: 'primary', onClick: () => void act('SEND'), blocked: !canManage ? 'Sending needs the purchases:manage permission' : p.items.length === 0 ? 'Add at least one line first' : undefined };
      case 'SENT':
        return { label: 'Approve', icon: <ThumbsUp className="h-4 w-4" />, variant: 'success', onClick: () => void act('APPROVE'), blocked: !canApprove ? 'Approval needs the purchases:approve permission' : undefined };
      case 'APPROVED':
        return { label: 'Mark ordered', icon: <Truck className="h-4 w-4" />, variant: 'primary', onClick: () => void act('ORDER'), blocked: !canManage ? 'Ordering needs the purchases:manage permission' : undefined };
      case 'ORDERED':
      case 'PARTIALLY_RECEIVED':
        return { label: 'Receive goods', icon: <PackageCheck className="h-4 w-4" />, variant: 'success', onClick: () => setReceiveOpen(true), blocked: !canReceive ? 'Receiving needs the purchases:receive permission' : undefined };
      default:
        return null;
    }
  })();

  return (
    <div>
      <Link to="/admin/purchases" className="inline-flex items-center gap-1 -ml-1 mb-3 text-sm text-neutral-500 hover:text-neutral-900 transition-colors duration-fast">
        <ChevronLeft className="h-4 w-4" aria-hidden />All purchase orders
      </Link>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-heading sm:text-display text-neutral-900 font-semibold tabular-nums tracking-[-0.02em] leading-tight break-words">{p ? p.poNumber : 'New purchase order'}</h1>
            {p && <StatusBadge kind="po" status={p.status} size="lg" />}
          </div>
          {/* The manager board names the supplier and whoever raised the order; the admin board
              names the supplier and the date it was placed. Both are fields on the record, and
              neither is printed when the record does not hold it. */}
          <p className="text-[13px] text-neutral-500 mt-1 leading-snug">
            {!p ? 'Draft is editable until approved'
              : ws === 'manager'
                ? `${p.supplierName}${p.createdByName ? ` · raised by ${p.createdByName}` : ''}${p.approvedByName ? ` · approved by ${p.approvedByName}` : ''}`
                : `${p.supplierName} · ordered ${fmtDate(p.createdAt)}${p.approvedByName ? ` · approved by ${p.approvedByName}` : ''}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {p && <Button variant="outline" leftIcon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Print</Button>}
          {p && !editable && canManage && ['DRAFT', 'SENT'].includes(p.status) && <Button variant="outline" onClick={() => setEditing(true)}>Edit</Button>}
          {p && p.status === 'DRAFT' && canApprove && !editable && <Button variant="outline" leftIcon={<ThumbsUp className="h-4 w-4" />} loading={transitionPo.isPending} onClick={() => void act('APPROVE')}>Approve directly</Button>}
          {p && p.status === 'APPROVED' && canReceive && <Button variant="outline" leftIcon={<PackageCheck className="h-4 w-4" />} onClick={() => setReceiveOpen(true)}>Receive goods</Button>}
          {p && !['RECEIVED', 'CANCELLED'].includes(p.status) && canManage && <Button variant="ghost" className="text-danger-700" leftIcon={<XCircle className="h-4 w-4" />} onClick={() => setCancelOpen(true)}>Cancel</Button>}
        </div>
      </div>

      {/* The one action that moves this order forward, pinned so it stays reachable while the
          lines scroll. Blocked reasons are printed, never hidden behind a disabled control.

          A full-bleed sticky bar cancels the page gutter with a negative margin, so the margin
          has to be the gutter the layout ACTUALLY uses — `p-4 sm:p-5 lg:p-6`. It was `sm:-mx-6`
          against a 20 px gutter: 4 px too much on each side, which measured as a 772 px document
          in a 768 px viewport. `top-16` was the old 64 px header; the header is 60 px now. */}
      {(nextStep || p?.status === 'RECEIVED') && (
        <div className="sticky top-[60px] z-sticky -mx-4 sm:-mx-5 lg:-mx-6 px-4 sm:px-5 lg:px-6 py-3 mb-4 bg-surface-raised/95 backdrop-blur supports-[backdrop-filter]:bg-surface-raised/85 border-y border-neutral-200">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <p className="text-caption text-neutral-500 flex-1 min-w-0">
              {nextStep?.blocked ?? (p ? `${p.items.length} line${p.items.length === 1 ? '' : 's'} · ${receivedPct}% received (${receivedQty} of ${orderedQty})` : 'Nothing saved yet')}
            </p>
            {nextStep && (
              <Button
                size="lg"
                variant={nextStep.variant}
                leftIcon={nextStep.icon}
                disabled={!!nextStep.blocked}
                title={nextStep.blocked}
                loading={savePo.isPending || transitionPo.isPending}
                onClick={nextStep.onClick}
                className="w-full sm:w-auto shrink-0"
              >
                {nextStep.label}
              </Button>
            )}
            {!nextStep && p?.status === 'RECEIVED' && (
              <span className="inline-flex items-center gap-2 text-sm font-medium text-success-700 shrink-0">
                <CheckCircle2 className="h-4 w-4" aria-hidden />Fully received{p.receivedAt ? ` · ${fmtDate(p.receivedAt)}` : ''}
              </span>
            )}
          </div>
        </div>
      )}

      {error && <p role="alert" className="mb-4 rounded-sm border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">{error}</p>}
      {p?.cancelReason && <Alert tone="danger" title="Purchase order cancelled" className="mb-4">{p.cancelReason}</Alert>}

      {p && ws === 'manager' && (
        <div className="space-y-4 mb-4">
          {/* Three facts, each one field off the record. Base `grid-cols-1`, explicit
              `minmax(0,1fr)` tracks, so a long supplier name can never floor the row. */}
          <div className="grid grid-cols-1 sm:grid-cols-[repeat(2,minmax(0,1fr))] lg:grid-cols-[repeat(3,minmax(0,1fr))] gap-4">
            <Card className="min-w-0">
              <p className="text-label uppercase text-neutral-500">Supplier</p>
              <div className="flex items-start gap-3 mt-2">
                <Avatar name={p.supplierName} variant="record" square />
                <div className="min-w-0">
                  <p className="font-medium text-neutral-900 break-words">{p.supplierName}</p>
                  <p className="text-caption text-neutral-500">{p.supplierCode}</p>
                  {supplier?.phone && (
                    <a href={`tel:${supplier.phone}`} className="text-caption font-medium text-primary-700 hover:underline underline-offset-2 break-words">{supplier.phone}</a>
                  )}
                </div>
              </div>
            </Card>

            <Card className="min-w-0">
              <p className="text-label uppercase text-neutral-500">Expected delivery</p>
              <p className="mt-2 flex items-start gap-2.5">
                <Truck className="h-5 w-5 mt-0.5 text-neutral-400 shrink-0" aria-hidden />
                <span className="min-w-0">
                  <span className={cn('block text-subheading', overdue ? 'text-danger-700' : 'text-neutral-900')}>
                    {p.expectedDate ? fmtDate(p.expectedDate) : 'Not set'}
                  </span>
                  <span className="block text-caption text-neutral-500">
                    {p.expectedDate
                      ? (overdue ? 'Overdue — nothing has been received in full' : `${receivedPct}% received (${receivedQty} of ${orderedQty})`)
                      : 'No expected delivery date on this order'}
                  </span>
                </span>
              </p>
            </Card>

            <Card className="min-w-0">
              <p className="text-label uppercase text-neutral-500">Order date</p>
              <p className="mt-2 flex items-start gap-2.5">
                <CalendarDays className="h-5 w-5 mt-0.5 text-neutral-400 shrink-0" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-subheading text-neutral-900">{fmtDate(p.createdAt)}</span>
                  <span className="block text-caption text-neutral-500 break-words">
                    Raised {fmtDateTime(p.createdAt)}{p.createdByName ? ` by ${p.createdByName}` : ''}
                  </span>
                </span>
              </p>
            </Card>
          </div>

          {/* The vertical status timeline. Built from `stages` — the record's own lifecycle. */}
          <Card>
            <CardHeader
              title="Order status"
              subtitle="Each stage carries the moment the record wrote it; a stage with no timestamp carries no date."
              action={<span className="inline-flex items-center gap-1.5 text-caption text-neutral-500"><Building2 className="h-3.5 w-3.5 text-neutral-400" aria-hidden />{p.poNumber}</span>}
            />
            <OrderTimeline stages={stages} />
          </Card>
        </div>
      )}

      {p && ws !== 'manager' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] items-start mb-4">
          <Card>
            <CardHeader title="Supplier" />
            <div className="flex items-start gap-3">
              <Avatar name={p.supplierName} variant="record" square />
              <div className="min-w-0">
                <p className="font-medium text-neutral-900 break-words">{p.supplierName}</p>
                <p className="text-caption text-neutral-500">{p.supplierCode}</p>
              </div>
            </div>
            <KeyValue className="mt-4" items={[
              { label: 'Contact', value: supplier?.contactPerson ?? <span className="text-neutral-400">—</span> },
              { label: 'Phone', value: supplier?.phone
                ? <a href={`tel:${supplier.phone}`} className="font-medium text-primary-700 hover:underline underline-offset-2">{supplier.phone}</a>
                : <span className="text-neutral-400">—</span> },
              { label: 'Email', value: supplier?.email
                ? <a href={`mailto:${supplier.email}`} className="break-all text-primary-700 hover:underline underline-offset-2">{supplier.email}</a>
                : <span className="text-neutral-400">—</span> },
            ]} />
          </Card>

          <Card>
            <CardHeader
              title="Order progress"
              subtitle={p.expectedDate
                ? <span className={overdue ? 'inline-flex items-center gap-1.5 font-semibold text-danger-700' : undefined}>
                  {overdue && <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                  Expected {fmtDate(p.expectedDate)}{overdue ? ' · overdue' : ''}
                </span>
                : 'No expected delivery date set'}
            />
            <OrderProgress stages={stages} />
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] items-start">
        <Card padded={false} className="min-w-0">
          <CardHeader
            className="p-5 pb-0"
            title="Items"
            subtitle={p && !editable ? `${p.items.length} line${p.items.length === 1 ? '' : 's'} · ${receivedPct}% received (${receivedQty} of ${orderedQty})` : `${filledLines.length} line${filledLines.length === 1 ? '' : 's'}`}
            action={editable && <Button size="sm" variant="outline" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setLines((ls) => [...ls, { invItemId: '', qty: '', unitId: '', unitPrice: '', taxPercent: '0' }])}>Add line</Button>}
          />
          <div className="table-scroll mt-3"><table className="w-full text-sm">
            <caption className="sr-only">Purchase order lines with ordered and received quantities, unit price and line total</caption>
            <thead className="bg-neutral-50 text-label uppercase text-neutral-600">
              <tr>
                <th scope="col" className="text-left px-4 py-2 min-w-[12rem]">Item</th>
                <th scope="col" className="text-right px-2 py-2 w-24">{editable ? 'Qty' : 'Ordered'}</th>
                {editable
                  ? <th scope="col" className="text-left px-2 py-2 w-28">Unit</th>
                  : <th scope="col" className="text-right px-2 py-2 w-28">Received</th>}
                <th scope="col" className="text-right px-2 py-2 w-28">Unit price</th>
                <th scope="col" className="text-right px-2 py-2 w-20">Tax %</th>
                <th scope="col" className="text-right px-4 py-2 w-28">Total</th>
                {editable && <th className="w-12"><span className="sr-only">Remove</span></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {lines.map((l, i) => { const it = inv(l.invItemId); const poi = p?.items[i]; const unitCode = units.data?.find((u) => u.id === l.unitId)?.code; return (
                <tr key={i} className="transition-colors duration-control hover:bg-neutral-100">
                  <td className="px-4 py-2">{editable ? <select aria-label="Item" className="input-base min-h-[36px]" value={l.invItemId} onChange={(e) => { const v = e.target.value ? Number(e.target.value) : ''; const x = inv(v); update(i, { invItemId: v, unitId: x ? x.unitId : '', unitPrice: x ? String(x.costPrice) : l.unitPrice }); }}><option value="">Select…</option>{(items.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name} ({x.unitCode})</option>)}</select> : <span className="font-medium">{it?.name ?? poi?.itemName}</span>}{it && editable && <span className="block text-caption text-neutral-500 mt-1">stock {it.currentQty} {it.unitCode} · last {money(it.costPrice, { decimals: true })}</span>}</td>
                  <td className="px-2 py-2 text-right">{editable ? <input aria-label="Qty" type="number" step="any" min={0} className="input-base min-h-[36px] text-right" value={l.qty} onChange={(e) => update(i, { qty: e.target.value })} /> : <span className="tabular-nums">{l.qty}{unitCode ? ` ${unitCode}` : ''}</span>}</td>
                  {editable
                    ? <td className="px-2 py-2"><select aria-label="Unit" className="input-base min-h-[36px]" value={l.unitId} onChange={(e) => update(i, { unitId: e.target.value ? Number(e.target.value) : '' })}>{(units.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.code}</option>)}</select></td>
                    : <td className="px-2 py-2 text-right tabular-nums">{poi ? <span className={poi.pendingQty > 0 ? 'inline-flex items-center gap-1 font-medium text-warning-700' : 'inline-flex items-center gap-1 font-medium text-success-700'}>{poi.pendingQty > 0 ? <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />}{poi.receivedQty} / {poi.qty}</span> : '—'}</td>}
                  <td className="px-2 py-2 text-right">{editable ? <input aria-label="Unit price" type="number" step="0.01" min={0} className="input-base min-h-[36px] text-right" value={l.unitPrice} onChange={(e) => update(i, { unitPrice: e.target.value })} /> : <span className="tabular-nums">{money(Number(l.unitPrice), { decimals: true })}</span>}</td>
                  <td className="px-2 py-2 text-right">{editable ? <input aria-label="Tax" type="number" step="any" min={0} className="input-base min-h-[36px] text-right" value={l.taxPercent} onChange={(e) => update(i, { taxPercent: e.target.value })} /> : <span className="tabular-nums">{l.taxPercent}%</span>}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium">{money(lineTotal(l))}</td>
                  {editable && <td className="px-2 py-2"><IconButton label={`Remove line ${i + 1}`} size="sm" className="text-danger-700" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}><Trash2 className="h-4 w-4" /></IconButton></td>}
                </tr>); })}
            </tbody>
            <tfoot className="bg-neutral-50 border-t border-neutral-200">
              <tr>
                <td className="px-4 py-2.5 text-label uppercase text-neutral-500" colSpan={5}>Order total</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-neutral-900">{money(grand)}</td>
                {editable && <td />}
              </tr>
            </tfoot>
          </table></div>
          {filledLines.length === 0 && <EmptyState compact title="No lines yet" description={editable ? 'Add at least one line before this order can move on.' : undefined} />}
          {p && p.receipts.length > 0 && (
            <div className="border-t border-neutral-200 mt-3"><CardHeader className="p-5 pb-0" title="Goods receipts" subtitle={`${p.receipts.length} receipt${p.receipts.length === 1 ? '' : 's'} against this order`} />
              <ul className="divide-y divide-neutral-200 mt-2">{p.receipts.map((g) => <li key={g.id} className="px-5 py-3 text-sm"><div className="flex flex-wrap items-center gap-x-3 gap-y-1"><span className="font-medium tabular-nums">{g.grnNumber}</span><span className="text-caption text-neutral-500 flex-1 min-w-0">{fmtDateTime(g.receivedAt)} · {g.receivedByName}{g.invoiceNo ? ` · inv ${g.invoiceNo}` : ''}</span><span className="tabular-nums font-medium">{money(g.totalAmount)}</span></div><p className="text-caption text-neutral-500 mt-1">{g.items.map((x) => `${x.itemName} ×${x.receivedQty}${x.damagedQty ? ` (${x.damagedQty} damaged)` : ''}`).join(' · ')}</p></li>)}</ul></div>
          )}
        </Card>

        <div className="min-w-0 space-y-4 lg:sticky lg:top-40 lg:self-start">
          <Card>
            <CardHeader title="Order totals" />
            {/* The same computation the lines above are printed from. A purchase order in this
                product carries no discount field, so no discount line is drawn. */}
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-neutral-600">Subtotal</span><span className="tabular-nums">{money(subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-neutral-600">Tax</span><span className="tabular-nums">{money(round2(grand - subtotal))}</span></div>
              <div className="flex justify-between text-lg font-bold border-t border-neutral-200 pt-2 mt-2"><span>Total</span><span className="tabular-nums">{money(grand)}</span></div>
            </div>
          </Card>
          <Card>
            <CardHeader title={ws === 'manager' ? 'Delivery details' : 'Details'} />
            <div className="space-y-3">
              {editable && <Select label="Supplier" required placeholder="Select supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : '')} options={(suppliers.data ?? []).map((s) => ({ value: s.id, label: `${s.name} (${s.paymentTermsDays} d)` }))} />}
              {editable && <Input label="Expected delivery" type="date" value={expected} onChange={(e) => setExpected(e.target.value)} />}
              {editable
                ? <Textarea label="Notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
                : p?.notes
                  ? <p className="text-sm text-neutral-600">{p.notes}</p>
                  : <p className="text-sm text-neutral-400">No notes on this order.</p>}
              {!editable && p && <p className="text-caption text-neutral-500 border-t border-neutral-200 pt-3">Raised {fmtDateTime(p.createdAt)}{p.createdByName ? ` by ${p.createdByName}` : ''}.</p>}
            </div>
          </Card>
        </div>
      </div>

      {receiveOpen && p && <ReceiveModal po={p} onClose={() => setReceiveOpen(false)} />}
      <ConfirmDialog open={cancelOpen} onClose={() => setCancelOpen(false)} variant="danger" title={`Cancel ${p?.poNumber}?`} confirmLabel="Cancel purchase order" loading={transitionPo.isPending} onConfirm={async () => { if (p && cancelReason.trim()) { await transitionPo.mutateAsync({ id: p.id, action: 'CANCEL', reason: cancelReason.trim() }); setCancelOpen(false); } }}>
        <Textarea label="Reason" required rows={2} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
      </ConfirmDialog>
    </div>
  );
}
