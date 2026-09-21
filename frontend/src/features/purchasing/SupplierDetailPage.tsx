import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Pencil, ShoppingCart, IndianRupee, ChevronLeft, CheckCircle2 } from 'lucide-react';
import { useSupplierHistory, usePurchasingMutations } from '@/features/p2/hooks';
import { SupplierForm } from './SuppliersPage';
import { usePermission } from '@/hooks/useAuth';
import { Button, Card, CardHeader, KeyValue, StatusBadge, SegmentedControl, Modal, Input, Select, Textarea, LoadingState, ErrorState, EmptyState, Badge, Avatar } from '@/components/ui';
import { money } from '@/utils/money';
import { fmtDate, fmtDateTime, fmtRelative } from '@/utils/date';
import { cn } from '@/utils/cn';

type Tab = 'overview' | 'orders' | 'receipts' | 'payments';

export default function SupplierDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const q = useSupplierHistory(Number(id));
  const { addSupplierPayment } = usePurchasingMutations();
  const canManage = usePermission('suppliers:manage');
  const canPay = usePermission('purchases:manage');
  const [edit, setEdit] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');
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
      <Link to="/admin/suppliers" className="inline-flex items-center gap-1 -ml-1 mb-3 text-sm text-neutral-500 hover:text-neutral-900 transition-colors duration-fast">
        <ChevronLeft className="h-4 w-4" aria-hidden />All suppliers
      </Link>

      {/*
       * IDENTITY. The supplier on the left, what they are owed on the right — and nothing between
       * them. The balance carries no action of its own: the outstanding figure is computed from
       * real unpaid orders, and the one flow that changes it (Record payment, which posts to
       * /suppliers/:id/payments) stays in the actions row where it has always been, spelled out.
       */}
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4 min-w-0">
          <Avatar name={s.name} variant="record" square size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-heading sm:text-display text-neutral-900 font-semibold tracking-[-0.02em] leading-tight break-words">{s.name}</h1>
              <StatusBadge kind="supplier" status={s.status} />
            </div>
            <p className="text-[13px] text-neutral-500 mt-1 leading-snug">
              {s.code} · payment terms {s.paymentTermsDays} days · {s.poCount} purchase order{s.poCount === 1 ? '' : 's'}
              {s.lastReceiptAt ? ` · last goods receipt ${fmtRelative(s.lastReceiptAt)}` : ' · nothing received yet'}
            </p>
          </div>
        </div>
        <div className="sm:text-right shrink-0">
          <p className="text-label uppercase text-neutral-500">Outstanding balance</p>
          <p className={cn('text-metric tabular-nums mt-0.5', owes ? 'text-danger-700' : 'text-neutral-900')}>{money(s.outstanding)}</p>
          <p className="text-caption text-neutral-500 mt-1">
            {owes
              ? `Due on ${s.paymentTermsDays}-day terms`
              : <span className="inline-flex items-center gap-1 text-success-700"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden />Account settled</span>}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        {canPay && <Button leftIcon={<ShoppingCart className="h-4 w-4" />} onClick={() => navigate(`/admin/purchases/new?supplierId=${s.id}`)}>New PO</Button>}
        {canPay && <Button variant="outline" leftIcon={<IndianRupee className="h-4 w-4" />} onClick={() => setPayOpen(true)}>Record payment</Button>}
        {canManage && <Button variant="outline" leftIcon={<Pencil className="h-4 w-4" />} onClick={() => setEdit(true)}>Edit</Button>}
      </div>

      <SegmentedControl<Tab>
        className="mb-4"
        size="sm"
        ariaLabel="Supplier record"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'overview', label: 'Overview' },
          { value: 'orders', label: 'Order history', count: purchaseOrders.length },
          { value: 'receipts', label: 'Goods receipts', count: receipts.length },
          { value: 'payments', label: 'Payments', count: payments.length },
        ]}
      />

      {tab === 'overview' && (
        /* Three cards, and only three: the product records no product categories against a
           supplier, so the reference's Categories card is not drawn rather than filled with
           something plausible. */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
          <Card>
            <CardHeader title="Contact information" subtitle={s.contactPerson ?? 'No contact named'} />
            <KeyValue items={[
              { label: 'Contact', value: s.contactPerson ?? <span className="text-neutral-400">—</span> },
              { label: 'Phone', value: s.phone
                ? <a href={`tel:${s.phone}`} className="font-medium text-primary-700 hover:underline underline-offset-2">{s.phone}</a>
                : <span className="text-neutral-400">No phone on file</span> },
              { label: 'Email', value: s.email
                ? <a href={`mailto:${s.email}`} className="break-all text-primary-700 hover:underline underline-offset-2">{s.email}</a>
                : <span className="text-neutral-400">No email on file</span> },
              { label: 'Address', value: s.address ?? <span className="text-neutral-400">—</span> },
              { label: 'Tax id', value: s.gstNumber ?? <span className="text-neutral-400">—</span> },
            ]} />
          </Card>

          <Card>
            <CardHeader title="Stats" subtitle="Everything recorded against this account, all time" />
            <KeyValue items={[
              { label: 'Purchase orders', value: <span className="tabular-nums">{s.poCount}</span> },
              { label: 'Open orders', value: <span className="tabular-nums">{s.openPoCount}</span> },
              { label: 'Total spend', value: <span className="tabular-nums font-semibold">{money(s.totalPurchased)}</span> },
              { label: 'Total paid', value: <span className="tabular-nums">{money(s.totalPaid)}</span> },
              { label: 'Outstanding', value: <span className={cn('tabular-nums font-semibold', owes && 'text-danger-700')}>{money(s.outstanding)}</span> },
              { label: 'Payments recorded', value: <span className="tabular-nums">{payments.length}</span> },
            ]} />
            <p className="text-caption text-neutral-500 mt-3">Total spend is the value of goods actually received, not of orders raised.</p>
          </Card>

          <Card>
            <CardHeader title="Payment terms" subtitle="As saved on the supplier record" />
            <KeyValue items={[
              { label: 'Terms', value: `Net ${s.paymentTermsDays} days` },
              { label: 'Tax id', value: s.gstNumber ?? <span className="text-neutral-400">—</span> },
              { label: 'Status', value: <StatusBadge kind="supplier" status={s.status} size="sm" /> },
              { label: 'Last goods receipt', value: s.lastReceiptAt
                ? <span title={fmtDateTime(s.lastReceiptAt)}>{fmtRelative(s.lastReceiptAt)}</span>
                : <span className="text-neutral-400">Never</span> },
            ]} />
          </Card>
        </div>
      )}

      {tab === 'orders' && (
        <Card padded={false}>
          {purchaseOrders.length === 0
            ? <EmptyState compact title="No purchase orders yet" description="Raise one with the New PO button above." action={canPay ? <Button variant="outline" onClick={() => navigate(`/admin/purchases/new?supplierId=${s.id}`)}>New PO</Button> : undefined} />
            : <ul className="divide-y divide-neutral-200">{purchaseOrders.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => navigate(`/admin/purchases/${p.id}`)} className="w-full min-h-touch px-5 py-3 text-left text-sm transition-colors duration-control hover:bg-neutral-100 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-medium tabular-nums">{p.poNumber}</span>
                  <StatusBadge kind="po" status={p.status} size="sm" />
                  <span className="text-caption text-neutral-500 flex-1 min-w-0">{fmtDate(p.createdAt)}{p.expectedDate ? ` · expected ${fmtDate(p.expectedDate)}` : ''}</span>
                  <span className="tabular-nums font-medium">{money(p.grandTotal)}</span>
                </button>
              </li>))}</ul>}
        </Card>
      )}

      {tab === 'receipts' && (
        <Card padded={false}>
          {receipts.length === 0
            ? <EmptyState compact title="Nothing received yet" description="Goods receipts appear here once a purchase order is received into stock." />
            : <ul className="divide-y divide-neutral-200">{receipts.map((g) => (
              <li key={g.id} className="px-5 py-3 text-sm flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-medium tabular-nums">{g.grnNumber}</span>
                <span className="text-caption text-neutral-500 flex-1 min-w-0">{g.poNumber}{g.invoiceNo ? ` · inv ${g.invoiceNo}` : ''} · {fmtDateTime(g.receivedAt)}</span>
                <span className="tabular-nums font-medium">{money(g.amount)}</span>
              </li>))}</ul>}
        </Card>
      )}

      {tab === 'payments' && (
        <Card padded={false}>
          {payments.length === 0
            ? <EmptyState compact title="No payments recorded" description="Payments you record against this supplier reduce the outstanding balance." action={canPay ? <Button variant="outline" onClick={() => setPayOpen(true)}>Record payment</Button> : undefined} />
            : <ul className="divide-y divide-neutral-200">{payments.map((p) => (
              <li key={p.id} className="px-5 py-3 text-sm flex flex-wrap items-center gap-x-3 gap-y-1">
                <Badge size="sm">{p.method}</Badge>
                <span className="text-caption text-neutral-500 flex-1 min-w-0">{fmtDate(p.paidAt)}{p.reference ? ` · ${p.reference}` : ''}{p.poNumber ? ` · ${p.poNumber}` : ''}</span>
                <span className="tabular-nums font-medium text-success-700">{money(p.amount)}</span>
              </li>))}</ul>}
        </Card>
      )}

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
