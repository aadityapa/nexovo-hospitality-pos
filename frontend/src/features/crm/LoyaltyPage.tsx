import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Save, Star, Users, Coins, Power, IndianRupee, Percent, Hourglass, Ticket } from 'lucide-react';
import { useLoyaltyProgram, useCrmMutations, useCustomers } from '@/features/p2/hooks';
import { usePermission } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useSurface';
import { useBranch } from '@/components/layout/Shell';
import { CardFiligree } from '@/components/graphics';
import { Reveal } from '@/components/motion';
import { PageHeader, Button, Card, CardHeader, CardDivider, Input, Switch, Badge, Alert, StatCard, DataTable, Avatar, KeyValue, LoadingState, ErrorState, SegmentedControl, ReadOnlyBanner, ReadOnlyPill, type Column } from '@/components/ui';
import { money } from '@/utils/money';
import { fmtRelative } from '@/utils/date';
import type { Customer } from '@/types';

const schema = z.object({
  name: z.string().trim().min(2).max(100),
  pointsPer100: z.coerce.number().min(0, '≥ 0').max(1000),
  pointValue: z.coerce.number().min(0, '≥ 0').max(100),
  minRedeemPoints: z.coerce.number().int().min(0),
  maxRedeemPercent: z.coerce.number().min(0).max(100, '≤ 100'),
  expiryDays: z.coerce.number().int().min(0),
  isActive: z.boolean(),
});
type Form = z.infer<typeof schema>;
type Tab = 'overview' | 'rules' | 'members';

/** One rule of the programme, with the small gold mark the reference gives each line. */
function Rule({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 h-8 w-8 shrink-0 rounded-md bg-primary-50 text-primary-700 ring-1 ring-inset ring-primary-200 grid place-items-center" aria-hidden>{icon}</span>
      <span className="min-w-0">
        <span className="block text-label uppercase text-neutral-500">{label}</span>
        <span className="block text-sm font-medium text-neutral-900 break-words">{value}</span>
      </span>
    </li>
  );
}

export default function LoyaltyPage() {
  const ws = useWorkspace();
  const navigate = useNavigate();
  const q = useLoyaltyProgram();
  const branch = useBranch();
  // Already cached by the customers directory; the members tab and the tier list read the same rows.
  const guests = useCustomers({ limit: 200 });
  const { saveProgram } = useCrmMutations();
  /*
   * Editing the PROGRAM needs `loyalty:configure`, which is a different grant from the
   * `loyalty:manage` that lets someone adjust a member's points. A manager holds the second and
   * not the first, so they read these rules and work members — which is what the reference board
   * shows. The server asserts the same permission, so this only decides what is drawn.
   */
  const canConfigure = usePermission('loyalty:configure');
  const [tab, setTab] = useState<Tab>('overview');
  const { register, handleSubmit, watch, setValue, formState: { errors, isDirty } } = useForm<Form>({ resolver: zodResolver(schema), values: q.data ? { name: q.data.name, pointsPer100: q.data.pointsPer100, pointValue: q.data.pointValue, minRedeemPoints: q.data.minRedeemPoints, maxRedeemPercent: q.data.maxRedeemPercent, expiryDays: q.data.expiryDays, isActive: q.data.isActive } : undefined });

  /** Only guests the programme actually holds an account for. Nothing is ranked or invented. */
  const members = useMemo(
    () => (guests.data ?? []).filter((c) => !!c.loyaltyTier || c.loyaltyPoints > 0),
    [guests.data],
  );
  /** The tiers that exist because a real account is on them — not a tier ladder we made up. */
  const tiers = useMemo(() => {
    const seen: string[] = [];
    members.forEach((c) => { const t = c.loyaltyTier?.trim(); if (t && !seen.includes(t)) seen.push(t); });
    return seen;
  }, [members]);

  if (q.isLoading) return <LoadingState variant="page" />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const p = q.data;
  const ppc = Number(watch('pointsPer100') ?? p.pointsPer100), pv = Number(watch('pointValue') ?? p.pointValue);
  const active = watch('isActive') ?? p.isActive;

  const memberColumns: Column<Customer>[] = [
    { key: 'name', header: 'Member', sortValue: (c) => c.fullName, render: (c) => (
      <span className="flex items-center gap-3 min-w-0">
        <Avatar name={c.fullName} variant="record" size="sm" />
        <span className="min-w-0">
          <span className="block font-medium text-neutral-900 truncate">{c.fullName}</span>
          <span className="block text-caption text-neutral-500 truncate">{c.phone}</span>
        </span>
      </span>
    ) },
    { key: 'tier', header: 'Tier', sortValue: (c) => c.loyaltyTier ?? '', render: (c) => (c.loyaltyTier ? <Badge size="sm" tone="primary" icon={<Star className="h-3 w-3" aria-hidden />}>{c.loyaltyTier}</Badge> : <span className="text-neutral-400">—</span>) },
    { key: 'points', header: 'Points balance', align: 'right', sortValue: (c) => c.loyaltyPoints, render: (c) => <span className="tabular-nums font-medium">{c.loyaltyPoints}</span> },
    { key: 'visits', header: 'Visits', align: 'right', hideBelow: 'md', sortValue: (c) => c.totalVisits, render: (c) => <span className="tabular-nums">{c.totalVisits}</span> },
    { key: 'last', header: 'Last visit', hideBelow: 'lg', sortValue: (c) => c.lastVisitAt ?? '', render: (c) => (c.lastVisitAt ? <span className="text-neutral-700">{fmtRelative(c.lastVisitAt)}</span> : <span className="text-neutral-400">Never visited</span>) },
    { key: 'spend', header: 'Total spend', align: 'right', sortValue: (c) => c.totalSpend, render: (c) => <span className="tabular-nums font-medium">{money(c.totalSpend)}</span> },
  ];

  return (
    <div>
      <PageHeader
        title="Loyalty program"
        subtitle="Points are earned when a bill closes and redeemed as a payment method on finalized bills"
        /* The board captions this screen "READ-ONLY" for a manager. That caption is earned by the
           permission, not asserted by the page: whoever holds `loyalty:configure` gets the save
           action instead. */
        actions={canConfigure ? (
          <span className="flex items-center gap-2">
            {!isDirty && <span className="text-caption text-neutral-500 hidden sm:inline">No unsaved changes</span>}
            <Button leftIcon={<Save className="h-4 w-4" />} disabled={!isDirty} title={!isDirty ? 'Change a rule first' : undefined} loading={saveProgram.isPending} onClick={handleSubmit((v) => saveProgram.mutate(v))}>Save program</Button>
          </span>
        ) : <ReadOnlyPill />}
      >
        {/* Three real sections. There is no campaign entity in this product, so there is no
            Campaigns tab — a tab that opened onto nothing would be a claim, not a feature. */}
        <SegmentedControl<Tab>
          size="sm"
          ariaLabel="Loyalty program sections"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'overview', label: 'Overview' },
            { value: 'rules', label: 'Points & rules' },
            { value: 'members', label: 'Members', count: p.memberCount },
          ]}
        />
      </PageHeader>

      {!p.isActive && (
        <Alert tone="warning" title="Program is switched off" className="mb-4">
          No points are earned or redeemed while the program is inactive. Existing balances are untouched.
        </Alert>
      )}

      {tab === 'overview' && (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start">
            {/*
             * THE MEMBERSHIP CARD.
             *
             * The page is ivory, and the card is the one charcoal object on it. It is built by
             * wrapping the panel in a `.chrome-dark` island rather than by hand-picking dark
             * values: the island re-declares the whole palette for its subtree, so `bg-surface-sunken`,
             * `text-neutral-900` and the gold resolve against charcoal here and stay correct when the
             * operator switches the application to the light theme. Nothing inside it knows.
             *
             * Everything printed on it is the venue's and the programme's own: the business name from
             * the branch record, the programme's name, its real member count and the tiers that real
             * accounts are actually on. The product stores no membership number, so none is drawn.
             */}
            <Reveal className="min-w-0">
              <div className="chrome-dark rounded-xl overflow-hidden shadow-panel">
                <div className="relative bg-surface-sunken p-5 sm:p-7 min-h-[15rem] flex flex-col justify-between gap-6">
                  <span className="pointer-events-none absolute inset-0 text-primary-500/40" aria-hidden><CardFiligree /></span>

                  <div className="relative flex items-start justify-between gap-3 min-w-0">
                    <span className="min-w-0">
                      {branch.data?.businessName && <span className="block text-label uppercase text-neutral-500 truncate">{branch.data.businessName}</span>}
                      <span className="block text-heading text-neutral-900 mt-1 break-words">{p.name}</span>
                    </span>
                    <Badge tone={active ? 'success' : 'neutral'} size="sm" icon={<Power className="h-3.5 w-3.5" aria-hidden />}>{active ? 'Active' : 'Inactive'}</Badge>
                  </div>

                  <div className="relative min-w-0">
                    <span className="block text-label uppercase text-neutral-500">Members</span>
                    <span className="block text-metric tabular-nums text-neutral-900">{p.memberCount}</span>
                    {tiers.length > 0 && (
                      <span className="mt-3 flex flex-wrap gap-1.5">
                        {tiers.map((t) => <Badge key={t} size="sm" tone="primary">{t}</Badge>)}
                      </span>
                    )}
                    <span className="mt-3 block text-caption text-neutral-500 tabular-nums">
                      {p.pointsPer100} points per ₹100 · 1 point = {money(p.pointValue, { decimals: true })}
                    </span>
                  </div>
                </div>
              </div>
            </Reveal>

            {/*
              THE MANAGER BOARD (panel 22) splits the read side in two, exactly as the poster does:
              what the programme EARNS and what it is worth, then the limits a redemption is held
              to. The gating above is untouched — whoever holds `loyalty:configure` still gets the
              same *Edit these rules* route out of the second list.
            */}
            {ws === 'manager' ? (
            <Reveal delay={60} className="min-w-0 space-y-4">
              <Card>
                <CardHeader title="Earning and redemption rules" subtitle="What a guest earns, what a point is worth, and how long it lives" />
                <ul className="space-y-4">
                  <Rule icon={<Coins className="h-4 w-4" />} label="Earn rate" value={`${p.pointsPer100} points per ₹100 spent`} />
                  <Rule icon={<IndianRupee className="h-4 w-4" />} label="Point value" value={`1 point = ${money(p.pointValue, { decimals: true })}`} />
                  <Rule icon={<Hourglass className="h-4 w-4" />} label="Expiry" value={p.expiryDays === 0 ? 'Points never expire' : `${p.expiryDays} days after they are earned`} />
                </ul>
              </Card>
              <Card>
                <CardHeader title="Redemption limits" subtitle="The ceilings the payment screen enforces on every redemption" />
                <ul className="space-y-4">
                  <Rule icon={<Ticket className="h-4 w-4" />} label="Minimum redemption" value={`${p.minRedeemPoints} points`} />
                  <Rule icon={<Percent className="h-4 w-4" />} label="Maximum per bill" value={`${p.maxRedeemPercent}% of the bill payable by points`} />
                </ul>
                {canConfigure && (
                  <Button variant="outline" size="sm" className="mt-5" onClick={() => setTab('rules')}>Edit these rules</Button>
                )}
              </Card>
            </Reveal>
            ) : (
            <Reveal delay={60} className="min-w-0">
              <Card>
                <CardHeader title="Points & rules" subtitle="Earn and redeem rules the programme is running today" />
                <ul className="space-y-4">
                  <Rule icon={<Coins className="h-4 w-4" />} label="Earn rate" value={`${p.pointsPer100} points per ₹100 spent`} />
                  <Rule icon={<IndianRupee className="h-4 w-4" />} label="Point value" value={`1 point = ${money(p.pointValue, { decimals: true })}`} />
                  <Rule icon={<Ticket className="h-4 w-4" />} label="Minimum redemption" value={`${p.minRedeemPoints} points`} />
                  <Rule icon={<Percent className="h-4 w-4" />} label="Maximum per bill" value={`${p.maxRedeemPercent}% of the bill payable by points`} />
                  <Rule icon={<Hourglass className="h-4 w-4" />} label="Expiry" value={p.expiryDays === 0 ? 'Points never expire' : `${p.expiryDays} days after they are earned`} />
                </ul>
                {canConfigure && (
                  <Button variant="outline" size="sm" className="mt-5" onClick={() => setTab('rules')}>Edit these rules</Button>
                )}
              </Card>
            </Reveal>
            )}
          </div>

          {ws === 'manager' ? (
            /*
             * PROGRAM ACTIVITY — only the metrics `loyalty/program` actually answers with.
             *
             * The payload carries three: how many members the programme holds, how many points
             * are still outstanding, and what those points are worth as a liability. There is no
             * redemption count, no issue rate and no period breakdown anywhere in the contract, so
             * there is no row for one. Each row below is dropped outright if its figure is absent
             * from the payload rather than printed as a zero, because a missing metric and a
             * metric that is genuinely nil are not the same statement.
             */
            <Card className="mt-4">
              <CardHeader title="Program activity" subtitle="Counted now, from the programme record" />
              <KeyValue items={[
                { label: 'Members', present: p.memberCount != null, value: <span className="tabular-nums font-semibold">{p.memberCount}</span> },
                { label: 'Outstanding points', present: p.outstandingPoints != null, value: <span className="tabular-nums font-semibold">{p.outstandingPoints}</span> },
                { label: 'Points liability', present: p.outstandingValue != null, value: <span className="tabular-nums font-semibold">{money(p.outstandingValue)}</span> },
              ].filter((r) => r.present).map(({ label, value }) => ({ label, value }))} />
            </Card>
          ) : (
          /* Only metrics the programme endpoint actually returns. Nothing here is a trend. */
          <div className="grid grid-cols-1 xs:grid-cols-2 xl:grid-cols-4 gap-3 mt-4">
            <StatCard label="Members" value={p.memberCount} tone="primary" icon={<Users className="h-5 w-5" />} />
            <StatCard label="Outstanding points" value={p.outstandingPoints} tone="warning" icon={<Star className="h-5 w-5" />} />
            <StatCard label="Points liability" value={money(p.outstandingValue)} tone="danger" icon={<IndianRupee className="h-5 w-5" />} />
            <StatCard label="Earn rate" value={`${p.pointsPer100} / ₹100`} tone="success" icon={<Coins className="h-5 w-5" />} hint={`1 pt = ${money(p.pointValue, { decimals: true })}`} />
          </div>
          )}
        </>
      )}

      {tab === 'rules' && (
        <form className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start" onSubmit={handleSubmit((v) => saveProgram.mutate(v))} noValidate>
          <Card>
            <CardHeader
              title="Earning and redeeming rules"
              subtitle="Changes apply to future transactions; existing balances are untouched"
              action={<Badge tone={active ? 'success' : 'neutral'} icon={<Power className="h-3.5 w-3.5" aria-hidden />}>{active ? 'Active' : 'Inactive'}</Badge>}
            />
            <fieldset disabled={!canConfigure} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Program name" required wrapperClassName="sm:col-span-2" error={errors.name?.message} {...register('name')} />
              <Input label="Points per ₹100 spent" required type="number" step="any" min={0} error={errors.pointsPer100?.message} hint="Earned on money actually paid (not on points or complimentary)" {...register('pointsPer100')} />
              <Input label="Value of 1 point (₹)" required type="number" step="0.01" min={0} error={errors.pointValue?.message} {...register('pointValue')} />
            </fieldset>
            <CardDivider />
            <fieldset disabled={!canConfigure} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Minimum points to redeem" required type="number" min={0} error={errors.minRedeemPoints?.message} {...register('minRedeemPoints')} />
              <Input label="Max % of a bill payable by points" required type="number" min={0} max={100} error={errors.maxRedeemPercent?.message} {...register('maxRedeemPercent')} />
              <Input label="Points expire after (days)" required type="number" min={0} error={errors.expiryDays?.message} hint="0 = never" {...register('expiryDays')} />
              <div className="self-end pb-2">
                <Switch checked={active} onChange={(v) => setValue('isActive', v, { shouldDirty: true })} label="Program active" description="When off, no points are earned or redeemed" disabled={!canConfigure} />
              </div>
            </fieldset>
            {!canConfigure && (
              <ReadOnlyBanner title="Program rules are managed by your administrator" className="mt-4 sm:col-span-2">
                You can see how the program earns and redeems, and you can still adjust individual members&rsquo;
                points from their profile. Changing these rules re-prices every point already issued, so it needs
                the <code className="text-neutral-700">loyalty:configure</code> permission.
              </ReadOnlyBanner>
            )}
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader title="What these rules are worth" subtitle="Recalculated as you edit — not saved until you save" />
              <p className="text-metric text-neutral-900 tabular-nums">{(ppc * pv).toFixed(1)}%</p>
              <p className="text-caption text-neutral-500 mt-1 tabular-nums">back to the guest · {ppc} pts per ₹100 · 1 pt = {money(pv, { decimals: true })}</p>
            </Card>
            <Card>
              <CardHeader title="How it works" subtitle="Where each rule above takes effect in service" />
              <ol className="text-sm text-neutral-600 space-y-1.5 list-decimal pl-5">
                <li>Waiter / cashier attaches a customer to the order (or creates one from the phone number).</li>
                <li>On the payment screen the cashier can redeem points — capped by balance, minimum and the max-% rule.</li>
                <li>When the bill closes, points are earned on the paid amount and a visit is recorded on the profile.</li>
                <li>Reversing a loyalty payment automatically returns the points; every movement is in the customer's ledger.</li>
              </ol>
            </Card>
          </div>
        </form>
      )}

      {tab === 'members' && (
        <>
          {guests.isLoading && <LoadingState variant="table" rows={6} />}
          {guests.isError && <ErrorState error={guests.error} onRetry={() => void guests.refetch()} />}
          {guests.data && (
            <DataTable
              columns={memberColumns}
              rows={members}
              rowKey={(c) => c.id}
              onRowClick={(c) => navigate(`/admin/customers/${c.id}`)}
              pageSize={25}
              initialSort={{ key: 'points', dir: 'desc' }}
              caption="Loyalty members with tier, points balance and spend"
              emptyTitle="No members yet"
              emptyDescription="A guest becomes a member the first time points are earned on a closed bill."
            />
          )}
          <p className="text-caption text-neutral-500 mt-3">Individual balances and ledgers live on each customer profile.</p>
        </>
      )}
    </div>
  );
}
