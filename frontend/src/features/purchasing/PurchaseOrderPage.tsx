import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus, Trash2, Save, Send, ThumbsUp, Truck, PackageCheck, XCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { usePurchaseOrder, usePurchasingMutations, useSuppliers, useInventoryItems, useInventoryUnits } from '@/features/p2/hooks';
import { usePermission } from '@/hooks/useAuth';
import { PageHeader, Button, Card, CardHeader, Input, Select, Textarea, IconButton, StatusBadge, KeyValue, Modal, ConfirmDialog, LoadingState, ErrorState, EmptyState, Badge, Alert } from '@/components/ui';
import { ApiError } from '@/services/api/client';
import { money, round2 } from '@/utils/money';
import { fmtDate, fmtDateTime, todayInput } from '@/utils/date';
import type { PurchaseOrder, ID } from '@/types';

interface Line { invItemId: ID | ''; qty: string; unitId: ID | ''; unitPrice: string; taxPercent: string }

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
      <div className="grid sm:grid-cols-2 gap-4 mb-4"><Input label="Supplier invoice no." value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} /><Input label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      <div className="table-scroll rounded-md border border-neutral-200"><table className="w-full text-sm">
        <thead className="bg-neutral-50 text-label uppercase text-neutral-600"><tr><th className="text-left px-3 py-2">Item</th><th className="text-right px-2 py-2">Pending</th><th className="text-right px-2 py-2 w-28">Received</th><th className="text-right px-2 py-2 w-24">Damaged</th><th className="text-right px-2 py-2 w-28">Unit cost</th></tr></thead>
        <tbody className="divide-y divide-neutral-100">{rows.map((r, i) => (
          <tr key={r.poItemId}><td className="px-3 py-2 font-medium">{r.itemName}</td><td className="px-2 py-2 text-right tabular-nums text-neutral-600">{r.pending} {r.unitCode}</td>
            <td className="px-2 py-2"><input aria-label="Received" type="number" step="any" min={0} className="input-base min-h-[36px] text-right" value={r.receivedQty} onChange={(e) => setRows((rs) => rs.map((x, idx) => (idx === i ? { ...x, receivedQty: e.target.value } : x)))} /></td>
            <td className="px-2 py-2"><input aria-label="Damaged" type="number" step="any" min={0} className="input-base min-h-[36px] text-right" value={r.damagedQty} onChange={(e) => setRows((rs) => rs.map((x, idx) => (idx === i ? { ...x, damagedQty: e.target.value } : x)))} /></td>
            <td className="px-2 py-2"><input aria-label="Unit cost" type="number" step="0.01" min={0} className="input-base min-h-[36px] text-right" value={r.unitCost} onChange={(e) => setRows((rs) => rs.map((x, idx) => (idx === i ? { ...x, unitCost: e.target.value } : x)))} /></td></tr>))}</tbody>
      </table></div>
      {error && <p role="alert" className="mt-3 text-sm text-danger-600">{error}</p>}
    </Modal>
  );
}

/** One fact in the pinned summary bar. */
function Fact({ label, value, tone = 'default' }: { label: string; value: ReactNode; tone?: 'default' | 'danger' | 'strong' }) {
  return (
    <div className="min-w-0">
      <p className="text-label uppercase text-neutral-500 truncate">{label}</p>
      <p className={
        tone === 'danger' ? 'mt-0.5 text-sm font-semibold text-danger-700 truncate'
          : tone === 'strong' ? 'mt-0.5 text-lg font-semibold tabular-nums text-neutral-900 truncate'
            : 'mt-0.5 text-sm font-medium text-neutral-900 truncate'
      }>{value}</p>
    </div>
  );
}

export default function PurchaseOrderPage() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
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
      <PageHeader back={() => navigate('/admin/purchases')} title={<span className="flex flex-wrap items-center gap-3">{p ? p.poNumber : 'New purchase order'}{p && <StatusBadge kind="po" status={p.status} size="lg" />}</span>} subtitle={p ? `${p.supplierName} · created ${fmtDateTime(p.createdAt)}${p.approvedByName ? ` · approved by ${p.approvedByName}` : ''}` : 'Draft is editable until approved'}
        actions={<>
          {p && !editable && canManage && ['DRAFT', 'SENT'].includes(p.status) && <Button variant="outline" onClick={() => setEditing(true)}>Edit</Button>}
          {p && p.status === 'DRAFT' && canApprove && !editable && <Button variant="outline" leftIcon={<ThumbsUp className="h-4 w-4" />} loading={transitionPo.isPending} onClick={() => void act('APPROVE')}>Approve directly</Button>}
          {p && p.status === 'APPROVED' && canReceive && <Button variant="outline" leftIcon={<PackageCheck className="h-4 w-4" />} onClick={() => setReceiveOpen(true)}>Receive goods</Button>}
          {p && !['RECEIVED', 'CANCELLED'].includes(p.status) && canManage && <Button variant="ghost" className="text-danger-700" leftIcon={<XCircle className="h-4 w-4" />} onClick={() => setCancelOpen(true)}>Cancel</Button>}
        </>} />

      {/* Pinned facts + the action that moves this PO forward — stays visible while the lines scroll. */}
      <div className="sticky top-16 z-sticky -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 mb-4 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85 border-y border-neutral-200">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 flex-1 min-w-0">
            <Fact label="Supplier" value={p?.supplierName ?? (suppliers.data?.find((s) => s.id === supplierId)?.name ?? 'Not selected')} />
            <Fact label="Status" value={p ? <StatusBadge kind="po" status={p.status} size="sm" /> : <Badge size="sm">New draft</Badge>} />
            <Fact
              label="Expected delivery"
              tone={overdue ? 'danger' : 'default'}
              value={overdue
                ? <span className="inline-flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />{fmtDate(p?.expectedDate)} · overdue</span>
                : (p?.expectedDate ? fmtDate(p.expectedDate) : expected ? fmtDate(expected) : 'Not set')}
            />
            <Fact label="Order total" tone="strong" value={money(grand)} />
          </div>
          {nextStep && (
            <div className="lg:text-right shrink-0">
              <Button
                size="lg"
                variant={nextStep.variant}
                leftIcon={nextStep.icon}
                disabled={!!nextStep.blocked}
                title={nextStep.blocked}
                loading={savePo.isPending || transitionPo.isPending}
                onClick={nextStep.onClick}
                className="w-full lg:w-auto"
              >
                {nextStep.label}
              </Button>
              {nextStep.blocked && <p className="text-caption text-neutral-500 mt-1.5 max-w-xs lg:ml-auto">{nextStep.blocked}</p>}
            </div>
          )}
          {!nextStep && p?.status === 'RECEIVED' && (
            <span className="inline-flex items-center gap-2 text-sm font-medium text-success-700 shrink-0">
              <CheckCircle2 className="h-4 w-4" aria-hidden />Fully received{p.receivedAt ? ` · ${fmtDate(p.receivedAt)}` : ''}
            </span>
          )}
        </div>
      </div>

      {error && <p role="alert" className="mb-4 rounded-sm border border-danger-100 bg-danger-50 px-3 py-2 text-sm text-danger-700">{error}</p>}
      {p?.cancelReason && <Alert tone="danger" title="Purchase order cancelled" className="mb-4">{p.cancelReason}</Alert>}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card padded={false}>
          <CardHeader
            className="p-5 pb-0"
            title="Lines"
            subtitle={p && !editable ? `${p.items.length} lines · ${receivedPct}% received (${receivedQty} of ${orderedQty})` : `${filledLines.length} line${filledLines.length === 1 ? '' : 's'}`}
            action={editable && <Button size="sm" variant="outline" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setLines((ls) => [...ls, { invItemId: '', qty: '', unitId: '', unitPrice: '', taxPercent: '0' }])}>Add line</Button>}
          />
          <div className="table-scroll mt-3"><table className="w-full text-sm">
            <thead className="bg-neutral-50 text-label uppercase text-neutral-600"><tr><th className="text-left px-4 py-2 min-w-[12rem]">Item</th><th className="text-right px-2 py-2 w-24">Qty</th><th className="text-left px-2 py-2 w-28">Unit</th><th className="text-right px-2 py-2 w-28">Unit price</th><th className="text-right px-2 py-2 w-20">Tax %</th><th className="text-right px-4 py-2 w-28">Total</th>{!editable && p && <th className="text-right px-2 py-2 w-24">Received</th>}{editable && <th className="w-12"><span className="sr-only">Remove</span></th>}</tr></thead>
            <tbody className="divide-y divide-neutral-100">
              {lines.map((l, i) => { const it = inv(l.invItemId); const poi = p?.items[i]; return (
                <tr key={i} className="hover:bg-neutral-50/60">
                  <td className="px-4 py-2">{editable ? <select aria-label="Item" className="input-base min-h-[36px]" value={l.invItemId} onChange={(e) => { const v = e.target.value ? Number(e.target.value) : ''; const x = inv(v); update(i, { invItemId: v, unitId: x ? x.unitId : '', unitPrice: x ? String(x.costPrice) : l.unitPrice }); }}><option value="">Select…</option>{(items.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name} ({x.unitCode})</option>)}</select> : <span className="font-medium">{it?.name ?? poi?.itemName}</span>}{it && editable && <span className="block text-caption text-neutral-500 mt-1">stock {it.currentQty} {it.unitCode} · last {money(it.costPrice, { decimals: true })}</span>}</td>
                  <td className="px-2 py-2 text-right">{editable ? <input aria-label="Qty" type="number" step="any" min={0} className="input-base min-h-[36px] text-right" value={l.qty} onChange={(e) => update(i, { qty: e.target.value })} /> : <span className="tabular-nums">{l.qty}</span>}</td>
                  <td className="px-2 py-2">{editable ? <select aria-label="Unit" className="input-base min-h-[36px]" value={l.unitId} onChange={(e) => update(i, { unitId: e.target.value ? Number(e.target.value) : '' })}>{(units.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.code}</option>)}</select> : <span>{units.data?.find((u) => u.id === l.unitId)?.code}</span>}</td>
                  <td className="px-2 py-2 text-right">{editable ? <input aria-label="Unit price" type="number" step="0.01" min={0} className="input-base min-h-[36px] text-right" value={l.unitPrice} onChange={(e) => update(i, { unitPrice: e.target.value })} /> : <span className="tabular-nums">{money(Number(l.unitPrice), { decimals: true })}</span>}</td>
                  <td className="px-2 py-2 text-right">{editable ? <input aria-label="Tax" type="number" step="any" min={0} className="input-base min-h-[36px] text-right" value={l.taxPercent} onChange={(e) => update(i, { taxPercent: e.target.value })} /> : <span className="tabular-nums">{l.taxPercent}%</span>}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium">{money(lineTotal(l))}</td>
                  {!editable && p && <td className="px-2 py-2 text-right tabular-nums">{poi ? <span className={poi.pendingQty > 0 ? 'inline-flex items-center gap-1 font-medium text-warning-700' : 'inline-flex items-center gap-1 font-medium text-success-700'}>{poi.pendingQty > 0 ? <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />}{poi.receivedQty} / {poi.qty}</span> : '—'}</td>}
                  {editable && <td className="px-2 py-2"><IconButton label="Remove line" size="sm" className="text-danger-600" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}><Trash2 className="h-4 w-4" /></IconButton></td>}
                </tr>); })}
            </tbody>
            <tfoot className="bg-neutral-50 border-t border-neutral-200">
              <tr>
                <td className="px-4 py-2.5 text-label uppercase text-neutral-500" colSpan={5}>Order total</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-neutral-900">{money(grand)}</td>
                {(editable || !!p) && <td />}
              </tr>
            </tfoot>
          </table></div>
          {filledLines.length === 0 && <EmptyState compact title="No lines yet" description={editable ? 'Add at least one line before this order can move on.' : undefined} />}
          {p && p.receipts.length > 0 && (
            <div className="border-t border-neutral-200 mt-3"><CardHeader className="p-5 pb-0" title="Goods receipts" subtitle={`${p.receipts.length} receipt${p.receipts.length === 1 ? '' : 's'} against this order`} />
              <ul className="divide-y divide-neutral-100 mt-2">{p.receipts.map((g) => <li key={g.id} className="px-5 py-3 text-sm"><div className="flex flex-wrap items-center gap-x-3 gap-y-1"><span className="font-medium">{g.grnNumber}</span><span className="text-caption text-neutral-500 flex-1 min-w-0">{fmtDateTime(g.receivedAt)} · {g.receivedByName}{g.invoiceNo ? ` · inv ${g.invoiceNo}` : ''}</span><span className="tabular-nums font-medium">{money(g.totalAmount)}</span></div><p className="text-caption text-neutral-500 mt-1">{g.items.map((x) => `${x.itemName} ×${x.receivedQty}${x.damagedQty ? ` (${x.damagedQty} damaged)` : ''}`).join(' · ')}</p></li>)}</ul></div>
          )}
        </Card>

        <div className="space-y-4 lg:sticky lg:top-40 lg:self-start">
          <Card>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{money(subtotal)}</span></div>
              <div className="flex justify-between text-neutral-500"><span>Tax</span><span className="tabular-nums">{money(round2(grand - subtotal))}</span></div>
              <div className="flex justify-between text-lg font-bold border-t border-neutral-200 pt-2 mt-2"><span>Total</span><span className="tabular-nums">{money(grand)}</span></div>
            </div>
          </Card>
          <Card>
            <CardHeader title="Details" />
            <div className="space-y-3">
              {editable ? <Select label="Supplier" required placeholder="Select supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : '')} options={(suppliers.data ?? []).map((s) => ({ value: s.id, label: `${s.name} (${s.paymentTermsDays} d)` }))} /> : <KeyValue items={[{ label: 'Supplier', value: p?.supplierName ?? '—' }, { label: 'Expected', value: p?.expectedDate ? fmtDate(p.expectedDate) : '—' }, { label: 'Sent', value: fmtDateTime(p?.sentAt) }, { label: 'Ordered', value: fmtDateTime(p?.orderedAt) }, { label: 'Received', value: fmtDateTime(p?.receivedAt) }]} />}
              {editable && <Input label="Expected delivery" type="date" value={expected} onChange={(e) => setExpected(e.target.value)} />}
              {editable ? <Textarea label="Notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /> : p?.notes && <p className="text-sm text-neutral-600 border-t border-neutral-100 pt-3">{p.notes}</p>}
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
