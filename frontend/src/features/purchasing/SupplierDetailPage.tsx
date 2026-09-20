import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Pencil, ShoppingCart, IndianRupee, Phone, Mail, MapPin, FileText, CalendarClock, CheckCircle2 } from 'lucide-react';
import { useSupplierHistory, usePurchasingMutations } from '@/features/p2/hooks';
import { SupplierForm } from './SuppliersPage';
import { usePermission } from '@/hooks/useAuth';
import { PageHeader, Button, Card, CardHeader, StatCard, StatusBadge, Tabs, Modal, Input, Select, Textarea, LoadingState, ErrorState, EmptyState, Badge } from '@/components/ui';
import { money } from '@/utils/money';
import { fmtDate, fmtDateTime, fmtRelative } from '@/utils/date';

type HistoryTab = 'orders' | 'receipts' | 'payments';

export default function SupplierDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const q = useSupplierHistory(Number(id));
  const { addSupplierPayment } = usePurchasingMutations();
  const canManage = usePermission('suppliers:manage');
  const canPay = usePermission('purchases:manage');
  const [edit, setEdit] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [tab, setTab] = useState<HistoryTab>('orders');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('BANK');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  if (q.isLoading) return <LoadingState variant="page" />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const { supplier: s, purchaseOrders, receipts, payments } = q.data;
  const owes = s.outstanding > 0;

  return (
    <div>
      <PageHeader
        back={() => navigate('/admin/suppliers')}
        title={<span className="flex flex-wrap items-center gap-3">{s.name}<StatusBadge kind="supplier" status={s.status} /></span>}
        subtitle={`${s.code} · payment terms ${s.paymentTermsDays} days`}
        actions={<>
          {canPay && <Button variant={owes ? 'primary' : 'outline'} leftIcon={<IndianRupee className="h-4 w-4" />} onClick={() => setPayOpen(true)}>Record payment</Button>}
          {canPay && <Button variant="outline" leftIcon={<ShoppingCart className="h-4 w-4" />} onClick={() => navigate(`/admin/purchases/new?supplierId=${s.id}`)}>New PO</Button>}
          {canManage && <Button variant="outline" leftIcon={<Pencil className="h-4 w-4" />} onClick={() => setEdit(true)}>Edit</Button>}
        </>}
      />

      <div className="grid gap-4 lg:grid-cols-[320px_1fr] items-start">
        {/* Contact first — this page usually starts with a phone call. */}
        <div className="space-y-4">
          <Card>
            <CardHeader title="Contact" subtitle={s.contactPerson ?? undefined} />
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-3">
                <Phone className="h-4 w-4 mt-0.5 text-neutral-400 shrink-0" aria-hidden />
                {s.phone
                  ? <a href={`tel:${s.phone}`} className="min-h-touch inline-flex items-center font-medium text-primary-700 hover:underline underline-offset-2">{s.phone}</a>
                  : <span className="text-neutral-400">No phone on file</span>}
              </li>
              <li className="flex items-start gap-3">
                <Mail className="h-4 w-4 mt-0.5 text-neutral-400 shrink-0" aria-hidden />
                {s.email
                  ? <a href={`mailto:${s.email}`} className="min-h-touch inline-flex items-center break-all text-primary-700 hover:underline underline-offset-2">{s.email}</a>
                  : <span className="text-neutral-400">No email on file</span>}
              </li>
              <li className="flex items-start gap-3">
                <MapPin className="h-4 w-4 mt-0.5 text-neutral-400 shrink-0" aria-hidden />
                <span className="text-neutral-700 break-words">{s.address ?? '—'}</span>
              </li>
              <li className="flex items-start gap-3">
                <FileText className="h-4 w-4 mt-0.5 text-neutral-400 shrink-0" aria-hidden />
                <span className="text-neutral-700">GST {s.gstNumber ?? '—'}</span>
              </li>
              <li className="flex items-start gap-3">
                <CalendarClock className="h-4 w-4 mt-0.5 text-neutral-400 shrink-0" aria-hidden />
                <span className="text-neutral-700">Last goods receipt {s.lastReceiptAt ? <span title={fmtDateTime(s.lastReceiptAt)}>{fmtRelative(s.lastReceiptAt)}</span> : '— never'}</span>
              </li>
            </ul>
          </Card>

          {/* Outstanding balance, then the supporting totals. */}
          <Card className={owes ? 'border-danger-200' : undefined}>
            <p className="text-label uppercase text-neutral-500">Outstanding balance</p>
            <p className={`text-metric tabular-nums mt-1 ${owes ? 'text-danger-700' : 'text-neutral-900'}`}>{money(s.outstanding)}</p>
            <p className="text-caption text-neutral-500 mt-1.5">
              {owes
                ? `Due on ${s.paymentTermsDays}-day terms`
                : <span className="inline-flex items-center gap-1 text-success-700"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden />Account settled</span>}
            </p>
            {canPay && owes && <Button className="mt-4" block leftIcon={<IndianRupee className="h-4 w-4" />} onClick={() => setPayOpen(true)}>Record payment</Button>}
          </Card>

          <div className="grid grid-cols-2 gap-4">
            <StatCard label="Purchased" value={money(s.totalPurchased)} tone="primary" hint="goods received value" />
            <StatCard label="Paid" value={money(s.totalPaid)} tone="success" />
            <StatCard label="Purchase orders" value={s.poCount} tone="info" hint={`${s.openPoCount} open`} />
            <StatCard label="Payments" value={payments.length} tone="neutral" hint="recorded on this account" />
          </div>
        </div>

        {/* History: orders, receipts and payments are three answers to three different questions. */}
        <Card padded={false}>
          <div className="px-5 pt-4">
            <Tabs
              ariaLabel="Supplier history"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'orders', label: 'Purchase orders', count: purchaseOrders.length },
                { value: 'receipts', label: 'Goods receipts', count: receipts.length },
                { value: 'payments', label: 'Payments', count: payments.length },
              ]}
            />
          </div>

          {tab === 'orders' && (purchaseOrders.length === 0
            ? <EmptyState compact title="No purchase orders yet" description="Raise one with the New PO button above." action={canPay ? <Button variant="outline" onClick={() => navigate(`/admin/purchases/new?supplierId=${s.id}`)}>New PO</Button> : undefined} />
            : <ul className="divide-y divide-neutral-100">{purchaseOrders.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => navigate(`/admin/purchases/${p.id}`)} className="w-full min-h-touch px-5 py-3 text-left text-sm hover:bg-neutral-50 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-medium">{p.poNumber}</span>
                  <StatusBadge kind="po" status={p.status} size="sm" />
                  <span className="text-caption text-neutral-500 flex-1 min-w-0">{fmtDate(p.createdAt)}{p.expectedDate ? ` · expected ${fmtDate(p.expectedDate)}` : ''}</span>
                  <span className="tabular-nums font-medium">{money(p.grandTotal)}</span>
                </button>
              </li>))}</ul>)}

          {tab === 'receipts' && (receipts.length === 0
            ? <EmptyState compact title="Nothing received yet" description="Goods receipts appear here once a purchase order is received into stock." />
            : <ul className="divide-y divide-neutral-100">{receipts.map((g) => (
              <li key={g.id} className="px-5 py-3 text-sm flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-medium">{g.grnNumber}</span>
                <span className="text-caption text-neutral-500 flex-1 min-w-0">{g.poNumber}{g.invoiceNo ? ` · inv ${g.invoiceNo}` : ''} · {fmtDateTime(g.receivedAt)}</span>
                <span className="tabular-nums font-medium">{money(g.amount)}</span>
              </li>))}</ul>)}

          {tab === 'payments' && (payments.length === 0
            ? <EmptyState compact title="No payments recorded" description="Payments you record against this supplier reduce the outstanding balance." action={canPay ? <Button variant="outline" onClick={() => setPayOpen(true)}>Record payment</Button> : undefined} />
            : <ul className="divide-y divide-neutral-100">{payments.map((p) => (
              <li key={p.id} className="px-5 py-3 text-sm flex flex-wrap items-center gap-x-3 gap-y-1">
                <Badge size="sm">{p.method}</Badge>
                <span className="text-caption text-neutral-500 flex-1 min-w-0">{fmtDate(p.paidAt)}{p.reference ? ` · ${p.reference}` : ''}{p.poNumber ? ` · ${p.poNumber}` : ''}</span>
                <span className="tabular-nums font-medium text-success-700">{money(p.amount)}</span>
              </li>))}</ul>)}
        </Card>
      </div>

      {edit && <SupplierForm editing={s} onClose={() => setEdit(false)} />}
      <Modal open={payOpen} onClose={() => setPayOpen(false)} size="sm" title={`Record payment — ${s.name}`} description={owes ? `Outstanding balance ${money(s.outstanding)}` : 'This account currently has no outstanding balance.'} footer={<><Button variant="outline" onClick={() => setPayOpen(false)}>Cancel</Button><Button loading={addSupplierPayment.isPending} disabled={!(Number(amount) > 0)} onClick={async () => { await addSupplierPayment.mutateAsync({ id: s.id, body: { amount: Number(amount), method, reference: reference || undefined, notes: notes || undefined } }); setPayOpen(false); setAmount(''); setReference(''); setNotes(''); }}>Record</Button></>}>
        <div className="space-y-3">
          <Input label="Amount (₹)" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus hint={`Outstanding ${money(s.outstanding)}`} />
          <Select label="Method" value={method} onChange={(e) => setMethod(e.target.value)} options={[{ value: 'BANK', label: 'Bank transfer' }, { value: 'CASH', label: 'Cash' }, { value: 'CHEQUE', label: 'Cheque' }, { value: 'UPI', label: 'UPI' }]} />
          <Input label="Reference" value={reference} onChange={(e) => setReference(e.target.value)} />
          <Textarea label="Notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </Modal>
    </div>
  );
}
