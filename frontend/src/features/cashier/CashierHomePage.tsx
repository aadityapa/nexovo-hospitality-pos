import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Receipt, Clock, CheckCircle2, ChevronRight, Search } from 'lucide-react';
import { useOrders } from '@/features/orders/hooks';
import { useBills } from '@/features/billing/hooks';
import { useNow, useDebounce } from '@/hooks/useRealtime';
import { PageHeader, StatCard, Card, Button, StatusBadge, LoadingState, ErrorState, EmptyState, SearchInput } from '@/components/ui';
import { money } from '@/utils/money';
import { elapsedMinutes, fmtTime } from '@/utils/date';
import { cn } from '@/utils/cn';

/** Cashier home: bill requests first, then unpaid bills, recently paid, and quick search across orders/bills. */
export default function CashierHomePage() {
  const navigate = useNavigate();
  const now = useNow(15_000);
  const [search, setSearch] = useState('');
  const dq = useDebounce(search, 200).toLowerCase();
  const orders = useOrders({ active: true }, { refetchInterval: 20_000 });
  const bills = useBills({}, { refetchInterval: 30_000 });
  const requests = (orders.data ?? []).filter((o) => o.status === 'BILL_REQUESTED');
  const billable = (orders.data ?? []).filter((o) => !['DRAFT', 'BILL_REQUESTED', 'BILLED', 'PAID'].includes(o.status));
  const unpaid = (bills.data ?? []).filter((b) => ['OPEN', 'FINALIZED'].includes(b.status) && b.paymentStatus !== 'PAID');
  const paidToday = (bills.data ?? []).filter((b) => b.paymentStatus === 'PAID' && b.paidAt && new Date(b.paidAt).toDateString() === now.toDateString());
  const hits = dq ? [...(orders.data ?? []).filter((o) => o.orderNumber.toLowerCase().includes(dq) || o.tableName.toLowerCase().includes(dq)).map((o) => ({ key: `o${o.id}`, label: `${o.tableName} · ${o.orderNumber}`, sub: o.status, amount: o.subtotal, to: o.billId ? `/cashier/bills/${o.billId}` : `/cashier/orders/${o.id}/bill` })), ...(bills.data ?? []).filter((b) => b.billNumber.toLowerCase().includes(dq) || b.orderNumber.toLowerCase().includes(dq) || b.tableName.toLowerCase().includes(dq)).map((b) => ({ key: `b${b.id}`, label: `${b.tableName} · ${b.billNumber}`, sub: `${b.status} · ${b.paymentStatus}`, amount: b.grandTotal, to: `/cashier/bills/${b.id}` }))] : [];

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader title="Cashier" subtitle="Bill requests, pending payments and recent bills">
        <SearchInput value={search} onChange={setSearch} placeholder="Search table, order # or bill #" className="sm:max-w-md" />
      </PageHeader>
      {dq && (
        <Card padded={false} className="mb-4">
          <div className="px-4 py-2 border-b border-neutral-100 text-label text-neutral-500 uppercase flex items-center gap-1"><Search className="h-3.5 w-3.5" />Results</div>
          {hits.length === 0 ? <EmptyState compact title="No matches" /> : <ul className="divide-y divide-neutral-100">{hits.slice(0, 10).map((h) => <li key={h.key}><button type="button" onClick={() => navigate(h.to)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-neutral-50"><span className="flex-1 min-w-0"><span className="block font-medium">{h.label}</span><span className="text-caption text-neutral-500">{h.sub}</span></span><span className="tabular-nums font-medium">{money(h.amount)}</span><ChevronRight className="h-4 w-4 text-neutral-400" /></button></li>)}</ul>}
        </Card>
      )}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Bill requests" value={requests.length} icon={<Receipt className="h-5 w-5" />} tone={requests.length ? 'warning' : 'neutral'} size="lg" />
        <StatCard label="Unpaid bills" value={unpaid.length} icon={<Clock className="h-5 w-5" />} tone={unpaid.length ? 'danger' : 'neutral'} hint={money(unpaid.reduce((a, b) => a + b.balanceDue, 0))} size="lg" onClick={() => navigate('/cashier/bills')} />
        <StatCard label="Paid today" value={paidToday.length} icon={<CheckCircle2 className="h-5 w-5" />} tone="success" hint={money(paidToday.reduce((a, b) => a + b.grandTotal, 0))} size="lg" onClick={() => navigate('/cashier/paid')} />
      </div>
      {(orders.isError || bills.isError) && <ErrorState error={orders.error ?? bills.error} onRetry={() => { void orders.refetch(); void bills.refetch(); }} compact />}
      <div className="grid gap-4 lg:grid-cols-2 mt-5">
        <Card padded={false}>
          <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between"><h2 className="text-subheading flex items-center gap-2"><Receipt className="h-4 w-4 text-warning-600" />Bill requests</h2><span className="text-caption text-neutral-500">{requests.length}</span></div>
          {orders.isLoading ? <div className="p-4"><LoadingState rows={3} /></div> : requests.length === 0 ? <EmptyState compact title="No bill requests" description="Tables requesting their bill appear here instantly." /> : (
            <ul className="divide-y divide-neutral-100">{requests.map((o) => { const wait = elapsedMinutes(o.billRequestedAt ?? o.createdAt, now); return (
              <li key={o.id} className="px-4 py-3 flex items-center gap-3">
                <span className="text-xl font-bold w-24 shrink-0">{o.tableName}</span>
                <span className="flex-1 min-w-0"><span className="block font-semibold tabular-nums text-lg">{money(o.subtotal)}<span className="text-caption font-normal text-neutral-500"> + tax</span></span><span className={cn('text-caption', wait >= 10 ? 'text-danger-700 font-medium' : 'text-neutral-500')}>{o.orderNumber} · requested {wait} min ago · {o.waiterName}</span></span>
                <Button size="pos" onClick={() => navigate(o.billId ? `/cashier/bills/${o.billId}` : `/cashier/orders/${o.id}/bill`)}>Open</Button>
              </li>); })}</ul>
          )}
        </Card>
        <Card padded={false}>
          <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between"><h2 className="text-subheading flex items-center gap-2"><Clock className="h-4 w-4 text-danger-600" />Unpaid bills</h2><Button size="sm" variant="ghost" onClick={() => navigate('/cashier/bills')}>All</Button></div>
          {bills.isLoading ? <div className="p-4"><LoadingState rows={3} /></div> : unpaid.length === 0 ? <EmptyState compact title="No unpaid bills" /> : (
            <ul className="divide-y divide-neutral-100">{unpaid.slice(0, 8).map((b) => (
              <li key={b.id}><button type="button" onClick={() => navigate(`/cashier/bills/${b.id}`)} className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-neutral-50 min-h-[60px]">
                <span className="text-lg font-bold w-24 shrink-0">{b.tableName}</span>
                <span className="flex-1 min-w-0"><span className="flex gap-1.5 flex-wrap"><StatusBadge kind="bill" status={b.status} size="sm" /><StatusBadge kind="payment" status={b.paymentStatus} size="sm" /></span><span className="block text-caption text-neutral-500 mt-0.5">{b.billNumber} · {fmtTime(b.createdAt)}</span></span>
                <span className="font-semibold tabular-nums">{money(b.balanceDue)}</span><ChevronRight className="h-4 w-4 text-neutral-400" />
              </button></li>))}</ul>
          )}
        </Card>
        <Card padded={false}>
          <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between"><h2 className="text-subheading">Active orders (not yet requested)</h2><Button size="sm" variant="ghost" onClick={() => navigate('/cashier/tables')}>Tables</Button></div>
          {billable.length === 0 ? <EmptyState compact title="No other active orders" /> : (
            <ul className="divide-y divide-neutral-100">{billable.slice(0, 8).map((o) => (
              <li key={o.id} className="px-4 py-3 flex items-center gap-3"><span className="text-lg font-bold w-24 shrink-0">{o.tableName}</span><span className="flex-1 min-w-0"><StatusBadge kind="order" status={o.status} size="sm" /><span className="block text-caption text-neutral-500 mt-0.5">{o.orderNumber} · {o.itemCount} items</span></span><span className="font-semibold tabular-nums">{money(o.subtotal)}</span><Button size="sm" variant="outline" onClick={() => navigate(`/cashier/orders/${o.id}/bill`)}>Bill</Button></li>))}</ul>
          )}
        </Card>
        <Card padded={false}>
          <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between"><h2 className="text-subheading flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-success-600" />Recently paid</h2><Button size="sm" variant="ghost" onClick={() => navigate('/cashier/paid')}>All</Button></div>
          {paidToday.length === 0 ? <EmptyState compact title="No payments yet today" /> : (
            <ul className="divide-y divide-neutral-100">{paidToday.slice(0, 8).map((b) => (
              <li key={b.id}><button type="button" onClick={() => navigate(`/cashier/bills/${b.id}`)} className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-neutral-50"><span className="text-lg font-bold w-24 shrink-0">{b.tableName}</span><span className="flex-1 min-w-0 text-caption text-neutral-500">{b.billNumber} · {fmtTime(b.paidAt)} · {b.payments.filter((p) => p.status === 'SUCCESS').map((p) => p.method).join(' + ')}</span><span className="font-semibold tabular-nums">{money(b.grandTotal)}</span><StatusBadge kind="bill" status={b.status} size="sm" hideIcon /></button></li>))}</ul>
          )}
        </Card>
      </div>
    </div>
  );
}
