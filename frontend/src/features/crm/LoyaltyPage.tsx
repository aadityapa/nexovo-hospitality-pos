import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Save, Star, Users, Coins, Power } from 'lucide-react';
import { useLoyaltyProgram, useCrmMutations } from '@/features/p2/hooks';
import { usePermission } from '@/hooks/useAuth';
import { PageHeader, Button, Card, CardHeader, CardDivider, Input, Switch, Badge, Alert, KeyValue, LoadingState, ErrorState } from '@/components/ui';
import { money } from '@/utils/money';

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

export default function LoyaltyPage() {
  const q = useLoyaltyProgram();
  const { saveProgram } = useCrmMutations();
  const canManage = usePermission('loyalty:manage');
  const { register, handleSubmit, watch, setValue, formState: { errors, isDirty } } = useForm<Form>({ resolver: zodResolver(schema), values: q.data ? { name: q.data.name, pointsPer100: q.data.pointsPer100, pointValue: q.data.pointValue, minRedeemPoints: q.data.minRedeemPoints, maxRedeemPercent: q.data.maxRedeemPercent, expiryDays: q.data.expiryDays, isActive: q.data.isActive } : undefined });
  if (q.isLoading) return <LoadingState variant="page" />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const p = q.data;
  const ppc = Number(watch('pointsPer100') ?? p.pointsPer100), pv = Number(watch('pointValue') ?? p.pointValue);
  const active = watch('isActive') ?? p.isActive;

  return (
    <div>
      <PageHeader
        title="Loyalty program"
        subtitle="Points are earned when a bill closes and redeemed as a payment method on finalized bills"
        actions={canManage && (
          <span className="flex items-center gap-2">
            {!isDirty && <span className="text-caption text-neutral-500 hidden sm:inline">No unsaved changes</span>}
            <Button leftIcon={<Save className="h-4 w-4" />} disabled={!isDirty} title={!isDirty ? 'Change a rule first' : undefined} loading={saveProgram.isPending} onClick={handleSubmit((v) => saveProgram.mutate(v))}>Save program</Button>
          </span>
        )}
      />

      {!p.isActive && (
        <Alert tone="warning" title="Program is switched off" className="mb-4">
          No points are earned or redeemed while the program is inactive. Existing balances are untouched.
        </Alert>
      )}

      {/* Two jobs, two columns: configuring the rules (left) and watching the programme (right). */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
        <form className="space-y-4" onSubmit={handleSubmit((v) => saveProgram.mutate(v))} noValidate>
          <Card>
            <CardHeader
              title="Earning and redeeming rules"
              subtitle="Changes apply to future transactions; existing balances are untouched"
              action={<Badge tone={active ? 'success' : 'neutral'} icon={<Power className="h-3.5 w-3.5" aria-hidden />}>{active ? 'Active' : 'Inactive'}</Badge>}
            />
            <fieldset disabled={!canManage} className="grid sm:grid-cols-2 gap-4">
              <Input label="Program name" required wrapperClassName="sm:col-span-2" error={errors.name?.message} {...register('name')} />
              <Input label="Points per ₹100 spent" required type="number" step="any" min={0} error={errors.pointsPer100?.message} hint="Earned on money actually paid (not on points or complimentary)" {...register('pointsPer100')} />
              <Input label="Value of 1 point (₹)" required type="number" step="0.01" min={0} error={errors.pointValue?.message} {...register('pointValue')} />
            </fieldset>
            <CardDivider />
            <fieldset disabled={!canManage} className="grid sm:grid-cols-2 gap-4">
              <Input label="Minimum points to redeem" required type="number" min={0} error={errors.minRedeemPoints?.message} {...register('minRedeemPoints')} />
              <Input label="Max % of a bill payable by points" required type="number" min={0} max={100} error={errors.maxRedeemPercent?.message} {...register('maxRedeemPercent')} />
              <Input label="Points expire after (days)" required type="number" min={0} error={errors.expiryDays?.message} hint="0 = never" {...register('expiryDays')} />
              <div className="self-end pb-2">
                <Switch checked={active} onChange={(v) => setValue('isActive', v, { shouldDirty: true })} label="Program active" description="When off, no points are earned or redeemed" disabled={!canManage} />
              </div>
            </fieldset>
            {!canManage && <p className="text-caption text-neutral-500 mt-4">Read-only — editing the program needs the loyalty:manage permission.</p>}
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
        </form>

        {/* Account activity: the programme as it stands today, not something being edited. */}
        <div className="space-y-4">
          <Card>
            <CardHeader title="Programme activity" subtitle={p.name} />
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <span className="h-10 w-10 rounded-md bg-primary-50 text-primary-700 flex items-center justify-center shrink-0" aria-hidden><Users className="h-5 w-5" /></span>
                <span className="min-w-0">
                  <span className="block text-label uppercase text-neutral-500">Members</span>
                  <span className="block text-xl font-semibold tabular-nums text-neutral-900">{p.memberCount}</span>
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="h-10 w-10 rounded-md bg-warning-50 text-warning-700 flex items-center justify-center shrink-0" aria-hidden><Star className="h-5 w-5" /></span>
                <span className="min-w-0">
                  <span className="block text-label uppercase text-neutral-500">Outstanding points</span>
                  <span className="block text-xl font-semibold tabular-nums text-neutral-900">{p.outstandingPoints}</span>
                  <span className="block text-caption text-neutral-500">liability {money(p.outstandingValue)}</span>
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="h-10 w-10 rounded-md bg-success-50 text-success-700 flex items-center justify-center shrink-0" aria-hidden><Coins className="h-5 w-5" /></span>
                <span className="min-w-0">
                  <span className="block text-label uppercase text-neutral-500">Earn rate</span>
                  <span className="block text-xl font-semibold tabular-nums text-neutral-900">{ppc} pts / ₹100</span>
                  <span className="block text-caption text-neutral-500">1 pt = {money(pv, { decimals: true })} → {(ppc * pv).toFixed(1)}% back</span>
                </span>
              </li>
            </ul>
          </Card>

          <Card>
            <CardHeader title="Redemption limits" subtitle="As saved on the program" />
            <KeyValue items={[
              { label: 'Minimum redeem', value: `${p.minRedeemPoints} points` },
              { label: 'Max per bill', value: `${p.maxRedeemPercent}%` },
              { label: 'Expiry', value: p.expiryDays === 0 ? 'Never' : `${p.expiryDays} days` },
            ]} />
            <p className="text-caption text-neutral-500 mt-3">Individual balances and ledgers live on each customer profile.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
