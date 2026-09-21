import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Pencil, Gift, Star, ShieldCheck, Cake, Heart, Phone, Mail, Utensils, NotebookPen } from 'lucide-react';
import { useCustomerHistory, useCrmMutations } from '@/features/p2/hooks';
import { CustomerForm } from './CustomersPage';
import { usePermission } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useSurface';
import { PageHeader, Button, Card, CardHeader, StatCard, KeyValue, Badge, Avatar, SegmentedControl, DataTable, ItemImage, Modal, Input, Textarea, LoadingState, ErrorState, EmptyState, type Column } from '@/components/ui';
import { ProgressMeter } from '@/components/graphics';
import { ApiError } from '@/services/api/client';
import { money } from '@/utils/money';
import { fmtDate, fmtDateTime, fmtRelative } from '@/utils/date';
import { cn } from '@/utils/cn';
import type { CustomerHistory } from '@/types';

type HistoryTab = 'visits' | 'loyalty';
type Visit = CustomerHistory['visits'][number];

export default function CustomerDetailPage() {
  const { id } = useParams();
  const customerId = Number.isFinite(Number(id)) && Number(id) > 0 ? Number(id) : undefined;
  const navigate = useNavigate();
  const ws = useWorkspace();
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

  /**
   * RECENT VISITS. The reference panel shows an outlet column beside each visit; a visit record
   * carries the bill or order it came from, its amount and its timestamp, and no outlet, so that
   * column is absent rather than guessed. "Type" is real — it is which document the visit was
   * recorded against.
   */
  const visitCols: Column<Visit>[] = [
    { key: 'date', header: 'Date', sortValue: (v) => v.visitedAt, render: (v) => <span className="whitespace-nowrap text-neutral-900">{fmtDateTime(v.visitedAt)}</span> },
    { key: 'ref', header: 'Reference', sortValue: (v) => v.billNumber ?? v.orderNumber ?? '', render: (v) => <span className="tabular-nums text-neutral-700">{v.billNumber ?? v.orderNumber ?? '—'}</span> },
    { key: 'type', header: 'Type', hideBelow: 'sm', sortValue: (v) => (v.billId ? 'Bill' : 'Order'), render: (v) => <Badge size="sm" tone={v.billId ? 'success' : 'neutral'}>{v.billId ? 'Bill' : 'Order'}</Badge> },
    { key: 'amt', header: 'Spend', align: 'right', sortValue: (v) => v.amount, render: (v) => <span className="tabular-nums font-medium text-neutral-900">{money(v.amount)}</span> },
  ];

  return (
    <div>
      <PageHeader
        back={() => navigate('/admin/customers')}
        title={c.fullName}
        subtitle={`Customer since ${fmtDate(c.createdAt)}`}
        actions={canManage && <Button variant="outline" leftIcon={<Pencil className="h-4 w-4" />} onClick={() => setEdit(true)}>Edit profile</Button>}
      />

      {/*
        Identity and standing: who this guest is, and what they are worth to the floor right now.
        This is the ONE surface on the page allowed to read as a slab of material — the four stat
        tiles and the two history panels below it stay plain cards, so the hierarchy the page sets
        is the hierarchy the eye gets.

        TWO ELEMENTS, for the same reason `DashboardHero` is two: `.material-edge` is a single
        `box-shadow` emitted after `.card` at equal specificity, so putting it on the card would
        REPLACE the ambient `shadow-card` that lifts it off the page. The outer element carries
        the shadow at the card's own radius (and the margin, so the spacing below is unchanged);
        the card itself carries the bevel and the gloss. The outer element adds no semantics.
      */}
      <div className="rounded-lg shadow-card mb-4">
      <Card className="material-gloss material-edge">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          {/* `record`, not `brand`: the gold disc belongs to whoever is signed in. A guest is a
              record in the book, and a page of gold discs makes none of them mean anything. */}
          <Avatar name={c.fullName} size="lg" variant="record" />
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
              <Badge tone="primary" size="sm" icon={<Star className="h-3 w-3" aria-hidden />}>{loyalty.tier} tier</Badge>
              {c.consentMarketing
                ? <Badge tone="success" size="sm" icon={<ShieldCheck className="h-3 w-3" aria-hidden />}>Marketing opt-in{c.consentAt ? ` · ${fmtDate(c.consentAt)}` : ''}</Badge>
                : <Badge size="sm">No marketing consent</Badge>}
              {tags.map((t) => <Badge key={t} size="sm">{t}</Badge>)}
            </div>
          </div>

          <div className="sm:w-56 shrink-0 sm:text-right border-t sm:border-t-0 sm:border-l border-neutral-200 pt-4 sm:pt-0 sm:pl-4">
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
      </div>

      <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard label="Visits" value={c.totalVisits} tone="primary" hint={c.lastVisitAt ? `last ${fmtRelative(c.lastVisitAt)}` : 'no visits yet'} />
        <StatCard label="Total spend" value={money(c.totalSpend)} tone="success" hint={`avg ${money(c.averageSpend)}`} />
        {/* The manager board's four figures are visits, spend, the points BALANCE and the last
            visit; the admin board's fourth is the favourites count. Both sets are fields the
            history payload returns — nothing is derived from anything it did not. */}
        {ws === 'manager' ? (
          <>
            <StatCard label="Loyalty points" value={loyalty.pointsBalance} icon={<Star className="h-5 w-5" />} tone="warning" hint={`${loyalty.lifetimePoints} earned lifetime`} />
            <StatCard label="Last visit" value={c.lastVisitAt ? fmtDate(c.lastVisitAt) : '—'} tone="neutral" hint={c.lastVisitAt ? fmtRelative(c.lastVisitAt) : 'no visits recorded yet'} />
          </>
        ) : (
          <>
            <StatCard label="Lifetime points" value={loyalty.lifetimePoints} icon={<Star className="h-5 w-5" />} tone="warning" />
            <StatCard label="Favourite items" value={favouriteItems.length} tone="neutral" hint={favouriteItems[0]?.itemName ?? 'no orders yet'} />
          </>
        )}
      </div>

      {/* The detail-page tab switcher. Only the two panels that carry real records are offered —
          there is no "preferences" or "communications" record on a guest to open a third on. */}
      <SegmentedControl
        className="mb-4"
        ariaLabel="Guest history"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'visits', label: 'Visits', count: visits.length },
          { value: 'loyalty', label: 'Loyalty ledger', count: loyaltyTransactions.length },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
        <div className="space-y-4 min-w-0">
          {/* ------------------------------------------------------- loyalty & status */}
          <Card>
            <CardHeader title="Loyalty & status" subtitle={`1 point = ${money(loyalty.pointValue, { decimals: true })} · up to ${loyalty.maxRedeemPercent}% of a bill`} />
            <div className="grid grid-cols-1 xs:grid-cols-3 gap-4">
              <div className="min-w-0">
                <p className="text-label uppercase text-neutral-500">Tier</p>
                <p className="mt-1.5"><Badge tone="primary" icon={<Star className="h-3 w-3" aria-hidden />}>{loyalty.tier}</Badge></p>
              </div>
              <div className="min-w-0">
                <p className="text-label uppercase text-neutral-500">Points balance</p>
                <p className="text-metric tabular-nums text-neutral-900 mt-0.5 leading-tight">{loyalty.pointsBalance}</p>
                <p className="text-caption text-neutral-500 tabular-nums">{loyalty.lifetimePoints} earned lifetime</p>
              </div>
              <div className="min-w-0">
                <p className="text-label uppercase text-neutral-500">Total spend</p>
                <p className="text-metric tabular-nums text-neutral-900 mt-0.5 leading-tight break-words">{money(c.totalSpend)}</p>
                <p className="text-caption text-neutral-500 tabular-nums">avg {money(c.averageSpend)}</p>
              </div>
            </div>
            {/*
              A meter toward the NEXT TIER is not drawn, because the loyalty account carries no
              next-tier threshold — it returns the tier's name, the balance, the point value and
              the REDEMPTION minimum, and nothing that says what the next rung costs. So the
              meter below is labelled for the threshold that actually exists, and once the guest
              is past it the balance stands on its own with no bar at all.
            */}
            {shortBy > 0 && loyalty.minRedeemPoints > 0 ? (
              <ProgressMeter
                className="mt-4"
                size="md"
                tone="primary"
                value={loyalty.pointsBalance}
                max={loyalty.minRedeemPoints}
                label="Points towards the redemption minimum"
                valueText={`${loyalty.pointsBalance} of ${loyalty.minRedeemPoints} points — ${shortBy} more to redeem`}
              />
            ) : (
              <p className="mt-4 text-sm text-success-700 tabular-nums">Redeemable now — the balance is worth {money(loyalty.balanceValue)}.</p>
            )}
          </Card>

          {/* -------------------------------------- recent visits · the loyalty ledger */}
          {tab === 'visits' && (
            <Card padded={false}>
              <CardHeader className="p-5 pb-3" title="Recent visits" subtitle="Every visit recorded when a bill closed for this guest" />
              {visits.length === 0
                ? <EmptyState compact title="No visits yet" description="Attach the customer to an order; the visit is recorded when the bill closes." />
                : (
                  <div className="px-5 pb-5">
                    <DataTable
                      columns={visitCols}
                      rows={visits}
                      rowKey={(v) => v.id}
                      dense
                      pageSize={12}
                      initialSort={{ key: 'date', dir: 'desc' }}
                      caption="Visits by this guest with the bill or order they were recorded against and what was spent"
                      onRowClick={(v) => { if (v.billId) navigate(`/cashier/bills/${v.billId}`); else if (v.orderId) navigate(`/admin/orders/${v.orderId}`); }}
                      mobileCard={(v) => (
                        <div className="flex items-start justify-between gap-3">
                          <span className="min-w-0">
                            <span className="block font-medium text-neutral-900 truncate">{v.billNumber ?? v.orderNumber ?? 'Visit'}</span>
                            <span className="block text-caption text-neutral-500">{fmtDateTime(v.visitedAt)}</span>
                          </span>
                          <span className="tabular-nums font-semibold shrink-0 text-neutral-900">{money(v.amount)}</span>
                        </div>
                      )}
                      emptyTitle="No visits yet"
                    />
                  </div>
                )}
            </Card>
          )}

          {tab === 'loyalty' && (
            <Card padded={false}>
              <CardHeader className="p-5 pb-0" title="Loyalty ledger" subtitle={`1 point = ${money(loyalty.pointValue, { decimals: true })} · minimum ${loyalty.minRedeemPoints} points · up to ${loyalty.maxRedeemPercent}% of a bill`} />
              {loyaltyTransactions.length === 0
                ? <EmptyState compact title="No loyalty transactions" description="Points appear here as soon as a bill closes for this guest." />
                : <ul className="divide-y divide-neutral-200 mt-3">{loyaltyTransactions.map((t) => (
                  <li key={t.id} className="px-5 py-3 text-sm flex items-center gap-3">
                    <Badge size="sm" tone={t.points > 0 ? 'success' : 'danger'}>{t.type}</Badge>
                    <span className="flex-1 min-w-0">
                      <span className="block truncate">{t.notes}</span>
                      <span className="text-caption text-neutral-500">{fmtDateTime(t.createdAt)}{t.expiresAt ? ` · expires ${fmtDate(t.expiresAt)}` : ''}</span>
                    </span>
                    <span className={cn('tabular-nums font-semibold', t.points > 0 ? 'text-success-700' : 'text-danger-700')}>{t.points > 0 ? '+' : ''}{t.points}</span>
                  </li>))}</ul>}
            </Card>
          )}
        </div>

        <div className="space-y-4 min-w-0">
          {/* ------------------------------------------------------- favourite dishes */}
          <Card padded={false}>
            <CardHeader className="p-5 pb-0" title="Favourite dishes" subtitle="Most ordered across past visits" />
            {favouriteItems.length === 0
              ? <EmptyState compact icon={<Utensils className="h-6 w-6" />} title="No orders yet" description="Ordered items appear here once a bill closes for this guest." />
              : <ul className="divide-y divide-neutral-200 mt-3">{favouriteItems.map((f) => (
                <li key={f.itemName} className="px-5 py-3 text-sm flex items-center gap-3 min-w-0">
                  {/* A real photograph wins wherever one exists; a guest's favourite carries no
                      imageUrl in this payload, so the deterministic drawing of the dish stands in
                      — the same picture this item wears everywhere else in the product. */}
                  <ItemImage alt={f.itemName} className="h-11 w-11 shrink-0" rounded="rounded-md" />
                  <span className="min-w-0 flex-1 truncate text-neutral-900">{f.itemName}</span>
                  <span className="tabular-nums text-neutral-600 shrink-0">× {f.quantity}</span>
                </li>))}</ul>}
          </Card>

          {/* ------------------------------------------------------------ guest notes */}
          <Card>
            <CardHeader
              title={<span className="flex items-center gap-2"><NotebookPen className="h-4 w-4 text-neutral-400" aria-hidden />{ws === 'manager' ? 'Notes' : 'Guest notes'}</span>}
              action={canManage ? <Button size="sm" variant="outline" aria-label={`Edit the notes on ${c.fullName}`} onClick={() => setEdit(true)}>Edit</Button> : undefined}
            />
            {c.notes
              ? <p className="text-sm text-neutral-700 leading-relaxed whitespace-pre-line break-words">{c.notes}</p>
              : <p className="text-sm text-neutral-500">No notes recorded for this guest.</p>}
          </Card>

          {/*
            PREFERENCES — only the fields a guest record actually carries: the two dates the venue
            marks, whatever tags the floor has attached, and the marketing consent with the day it
            was given. There is no dietary, seating or allergy field on a customer in this product,
            so none is drawn.
          */}
          {ws === 'manager' ? (
            <Card>
              <CardHeader title="Preferences" subtitle="What the venue has recorded about this guest" />
              <KeyValue items={[
                { label: 'Birthday', value: c.birthday ? <span className="inline-flex items-center gap-1"><Cake className="h-3.5 w-3.5" aria-hidden />{c.birthday}</span> : '—' },
                { label: 'Anniversary', value: c.anniversary ? <span className="inline-flex items-center gap-1"><Heart className="h-3.5 w-3.5" aria-hidden />{c.anniversary}</span> : '—' },
                {
                  label: 'Tags',
                  value: tags.length
                    ? <span className="flex flex-wrap gap-1 justify-end">{tags.map((t) => <Badge key={t} size="sm">{t}</Badge>)}</span>
                    : <span className="text-neutral-400">None</span>,
                },
                {
                  label: 'Marketing',
                  value: c.consentMarketing
                    ? <span className="inline-flex items-center gap-1 text-success-700"><ShieldCheck className="h-3.5 w-3.5" aria-hidden />Opted in{c.consentAt ? ` · ${fmtDate(c.consentAt)}` : ''}</span>
                    : <span className="text-neutral-500">No consent recorded</span>,
                },
                { label: 'Last visit', value: c.lastVisitAt ? fmtDate(c.lastVisitAt) : '—' },
              ]} />
            </Card>
          ) : (
          <Card>
            <CardHeader title="Profile" />
            <KeyValue items={[
              { label: 'Birthday', value: c.birthday ? <span className="inline-flex items-center gap-1"><Cake className="h-3.5 w-3.5" aria-hidden />{c.birthday}</span> : '—' },
              { label: 'Anniversary', value: c.anniversary ? <span className="inline-flex items-center gap-1"><Heart className="h-3.5 w-3.5" aria-hidden />{c.anniversary}</span> : '—' },
              { label: 'Last visit', value: c.lastVisitAt ? fmtDate(c.lastVisitAt) : '—' },
              { label: 'Avg spend', value: money(c.averageSpend) },
            ]} />
          </Card>
          )}
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
