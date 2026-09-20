import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Pencil, Gift, Star, ShieldCheck, Cake, Heart, Phone, Mail } from 'lucide-react';
import { useCustomerHistory, useCrmMutations } from '@/features/p2/hooks';
import { CustomerForm } from './CustomersPage';
import { usePermission } from '@/hooks/useAuth';
import { PageHeader, Button, Card, CardHeader, StatCard, KeyValue, Badge, Avatar, Tabs, Modal, Input, Textarea, LoadingState, ErrorState, EmptyState } from '@/components/ui';
import { ApiError } from '@/services/api/client';
import { money } from '@/utils/money';
import { fmtDate, fmtDateTime, fmtRelative } from '@/utils/date';
import { cn } from '@/utils/cn';

type HistoryTab = 'visits' | 'loyalty';

export default function CustomerDetailPage() {
  const { id } = useParams();
  const customerId = Number.isFinite(Number(id)) && Number(id) > 0 ? Number(id) : undefined;
  const navigate = useNavigate();
  const q = useCustomerHistory(customerId);
  const { adjustPoints } = useCrmMutations();
  const canManage = usePermission('customers:manage');
  const canLoyalty = usePermission('loyalty:manage');
  const [edit, setEdit] = useState(false);
  const [adjOpen, setAdjOpen] = useState(false);
  const [tab, setTab] = useState<HistoryTab>('visits');
  const [points, setPoints] = useState('');
  const [notes, setNotes] = useState('');
  if (!customerId) return <ErrorState error={new ApiError(404, 'Customer not found')} title="Customer not found" />;
  if (q.isLoading) return <LoadingState variant="page" />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const { customer: c, visits, favouriteItems, loyalty, loyaltyTransactions } = q.data;
  const shortBy = Math.max(0, loyalty.minRedeemPoints - loyalty.pointsBalance);
  const tags = (c.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean);

  return (
    <div>
      <PageHeader
        back={() => navigate('/admin/customers')}
        title={c.fullName}
        subtitle={`Customer since ${fmtDate(c.createdAt)}`}
        actions={canManage && <Button variant="outline" leftIcon={<Pencil className="h-4 w-4" />} onClick={() => setEdit(true)}>Edit profile</Button>}
      />

      {/* Identity and standing: who this guest is, and what they are worth to the floor right now. */}
      <Card className="mb-4">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <Avatar name={c.fullName} size="lg" />
          <div className="min-w-0 flex-1">
            <h2 className="text-subheading text-neutral-900">{c.fullName}</h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-sm">
              <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1.5 min-h-touch text-primary-700 hover:underline underline-offset-2 font-medium">
                <Phone className="h-4 w-4" aria-hidden />{c.phone}
              </a>
              {c.email && (
                <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1.5 min-h-touch text-primary-700 hover:underline underline-offset-2 break-all">
                  <Mail className="h-4 w-4" aria-hidden />{c.email}
                </a>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <Badge tone="accent" size="sm" icon={<Star className="h-3 w-3" aria-hidden />}>{loyalty.tier} tier</Badge>
              {c.consentMarketing
                ? <Badge tone="success" size="sm" icon={<ShieldCheck className="h-3 w-3" aria-hidden />}>Marketing opt-in{c.consentAt ? ` · ${fmtDate(c.consentAt)}` : ''}</Badge>
                : <Badge size="sm">No marketing consent</Badge>}
              {tags.map((t) => <Badge key={t} size="sm">{t}</Badge>)}
            </div>
          </div>

          <div className="sm:w-56 shrink-0 sm:text-right border-t sm:border-t-0 sm:border-l border-neutral-100 pt-4 sm:pt-0 sm:pl-4">
            <p className="text-label uppercase text-neutral-500">Points balance</p>
            <p className="text-metric tabular-nums text-neutral-900 mt-1">{loyalty.pointsBalance}</p>
            <p className="text-caption text-neutral-500 mt-1">
              {shortBy > 0
                ? `${shortBy} more needed to redeem (min ${loyalty.minRedeemPoints})`
                : `Redeemable now — worth ${money(loyalty.balanceValue)}`}
            </p>
            {canLoyalty && <Button className="mt-3 w-full" leftIcon={<Gift className="h-4 w-4" />} onClick={() => setAdjOpen(true)}>Adjust points</Button>}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard label="Visits" value={c.totalVisits} tone="primary" hint={c.lastVisitAt ? `last ${fmtRelative(c.lastVisitAt)}` : 'no visits yet'} />
        <StatCard label="Total spend" value={money(c.totalSpend)} tone="success" hint={`avg ${money(c.averageSpend)}`} />
        <StatCard label="Lifetime points" value={loyalty.lifetimePoints} icon={<Star className="h-5 w-5" />} tone="warning" />
        <StatCard label="Favourite items" value={favouriteItems.length} tone="neutral" hint={favouriteItems[0]?.itemName ?? 'no orders yet'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px] items-start">
        {/* History is the body of the page: what they did, and what that did to their balance. */}
        <Card padded={false}>
          <div className="px-5 pt-4">
            <Tabs
              ariaLabel="Guest history"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'visits', label: 'Visits', count: visits.length },
                { value: 'loyalty', label: 'Loyalty ledger', count: loyaltyTransactions.length },
              ]}
            />
          </div>

          {tab === 'visits' && (visits.length === 0
            ? <EmptyState compact title="No visits yet" description="Attach the customer to an order; the visit is recorded when the bill closes." />
            : <ul className="divide-y divide-neutral-100">{visits.map((v) => (
              <li key={v.id}>
                <button type="button" onClick={() => v.billId ? navigate(`/cashier/bills/${v.billId}`) : v.orderId && navigate(`/admin/orders/${v.orderId}`)} className="w-full min-h-touch px-5 py-3 text-left text-sm hover:bg-neutral-50 flex items-center gap-3">
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium truncate">{v.billNumber ?? v.orderNumber ?? 'Visit'}</span>
                    <span className="text-caption text-neutral-500">{fmtDateTime(v.visitedAt)}</span>
                  </span>
                  <span className="tabular-nums font-medium">{money(v.amount)}</span>
                </button>
              </li>))}</ul>)}

          {tab === 'loyalty' && (
            <>
              <p className="px-5 pt-3 text-caption text-neutral-500">
                1 point = {money(loyalty.pointValue, { decimals: true })} · minimum {loyalty.minRedeemPoints} points · up to {loyalty.maxRedeemPercent}% of a bill
              </p>
              {loyaltyTransactions.length === 0
                ? <EmptyState compact title="No loyalty transactions" description="Points appear here as soon as a bill closes for this guest." />
                : <ul className="divide-y divide-neutral-100 mt-2">{loyaltyTransactions.map((t) => (
                  <li key={t.id} className="px-5 py-3 text-sm flex items-center gap-3">
                    <Badge size="sm" tone={t.points > 0 ? 'success' : 'danger'}>{t.type}</Badge>
                    <span className="flex-1 min-w-0">
                      <span className="block truncate">{t.notes}</span>
                      <span className="text-caption text-neutral-500">{fmtDateTime(t.createdAt)}{t.expiresAt ? ` · expires ${fmtDate(t.expiresAt)}` : ''}</span>
                    </span>
                    <span className={cn('tabular-nums font-semibold', t.points > 0 ? 'text-success-700' : 'text-danger-700')}>{t.points > 0 ? '+' : ''}{t.points}</span>
                  </li>))}</ul>}
            </>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Profile" />
            <KeyValue items={[
              { label: 'Birthday', value: c.birthday ? <span className="inline-flex items-center gap-1"><Cake className="h-3.5 w-3.5" aria-hidden />{c.birthday}</span> : '—' },
              { label: 'Anniversary', value: c.anniversary ? <span className="inline-flex items-center gap-1"><Heart className="h-3.5 w-3.5" aria-hidden />{c.anniversary}</span> : '—' },
              { label: 'Last visit', value: c.lastVisitAt ? fmtDate(c.lastVisitAt) : '—' },
              { label: 'Avg spend', value: money(c.averageSpend) },
            ]} />
            {c.notes && <p className="text-sm text-neutral-600 mt-3 border-t border-neutral-100 pt-3">{c.notes}</p>}
          </Card>
          <Card padded={false}>
            <CardHeader className="p-5 pb-0" title="Favourite items" subtitle="Most ordered across past visits" />
            {favouriteItems.length === 0
              ? <EmptyState compact title="No orders yet" />
              : <ul className="divide-y divide-neutral-100 mt-2">{favouriteItems.map((f) => (
                <li key={f.itemName} className="px-5 py-2.5 text-sm flex justify-between gap-3">
                  <span className="min-w-0 truncate">{f.itemName}</span>
                  <span className="tabular-nums text-neutral-600 shrink-0">× {f.quantity}</span>
                </li>))}</ul>}
          </Card>
        </div>
      </div>

      {edit && <CustomerForm editing={c} onClose={() => setEdit(false)} />}
      <Modal open={adjOpen} onClose={() => setAdjOpen(false)} size="sm" title="Adjust loyalty points" description="Promotional credit or correction — recorded as a PROMO transaction." footer={<><Button variant="outline" onClick={() => setAdjOpen(false)}>Cancel</Button><Button loading={adjustPoints.isPending} disabled={!Number(points) || !notes.trim()} onClick={async () => { await adjustPoints.mutateAsync({ customerId: c.id, points: Number(points), notes: notes.trim() }); setAdjOpen(false); setPoints(''); setNotes(''); }}>Apply</Button></>}>
        <div className="space-y-3">
          <Input label="Points (negative to deduct)" type="number" value={points} onChange={(e) => setPoints(e.target.value)} autoFocus hint={`Current balance ${loyalty.pointsBalance}`} />
          <Textarea label="Reason" required rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </Modal>
    </div>
  );
}
