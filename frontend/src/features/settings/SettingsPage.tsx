import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Save, Plus, Trash2, Percent } from 'lucide-react';
import { branchApi } from '@/services/api/endpoints';
import { useBranch } from '@/components/layout/Shell';
import { useTaxGroups, useTaxMutations } from '@/features/menu/hooks';
import { usePermission } from '@/hooks/useAuth';
import { toast } from '@/store/uiStore';
import { PageHeader, Button, IconButton, Card, CardHeader, Input, Select, Switch, Textarea, Modal, Tabs, LoadingState, ErrorState, Badge } from '@/components/ui';
import { env } from '@/config/env';
import type { Branch, BranchInput, TaxGroup, TaxGroupInput } from '@/types';

const branchSchema = z.object({
  businessName: z.string().trim().min(2).max(150), name: z.string().trim().min(2).max(150),
  address: z.string().max(400).optional(), city: z.string().max(100).optional(), phone: z.string().max(30).optional(), email: z.string().email().or(z.literal('')).optional(),
  gstNumber: z.string().max(30).optional(), logoUrl: z.string().url().or(z.literal('')).optional(), welcomeMessage: z.string().max(300).optional(), receiptFooter: z.string().max(300).optional(),
  serviceChargePercent: z.coerce.number().min(0, 'Min 0').max(100, 'Max 100'), taxOnServiceCharge: z.boolean(), roundingMode: z.enum(['NEAREST', 'UP', 'DOWN', 'NONE']), allowMultipleOrdersPerTable: z.boolean(),
  // Phase 2
  stockDeductionMode: z.enum(['ON_CONFIRM', 'ON_BILL_CLOSE', 'MANUAL']), minSpendShortfallMode: z.enum(['CHARGE_DIFFERENCE', 'WAIVE', 'FLAT_FEE']), minSpendFlatFee: z.coerce.number().min(0, 'Min 0'), pmsProvider: z.enum(['NONE', 'SIMULATED', 'OPERA', 'IDS', 'CUSTOM']),
});
type BranchForm = z.infer<typeof branchSchema>;
const PMS_OPTIONS = [{ value: 'NONE', label: 'None — no hotel integration' }, { value: 'SIMULATED', label: 'Simulated (demo adapter)' }, { value: 'OPERA', label: 'Oracle OPERA (adapter required)' }, { value: 'IDS', label: 'IDS Next (adapter required)' }, { value: 'CUSTOM', label: 'Custom adapter' }];

function BranchSettings({ branch }: { branch: Branch }) {
  const canManage = usePermission('settings:manage');
  const qc = useQueryClient();
  const save = useMutation({ mutationFn: (b: BranchInput) => branchApi.update(b), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['branch'] }); toast.success('Settings saved'); } });
  const { register, handleSubmit, watch, setValue, formState: { errors, isDirty } } = useForm<BranchForm>({ resolver: zodResolver(branchSchema), values: { businessName: branch.businessName, name: branch.name, address: branch.address ?? '', city: branch.city ?? '', phone: branch.phone ?? '', email: branch.email ?? '', gstNumber: branch.gstNumber ?? '', logoUrl: branch.logoUrl ?? '', welcomeMessage: branch.welcomeMessage ?? '', receiptFooter: branch.receiptFooter ?? '', serviceChargePercent: branch.serviceChargePercent, taxOnServiceCharge: branch.taxOnServiceCharge, roundingMode: branch.roundingMode, allowMultipleOrdersPerTable: branch.allowMultipleOrdersPerTable, stockDeductionMode: branch.stockDeductionMode ?? 'ON_CONFIRM', minSpendShortfallMode: branch.minSpendShortfallMode ?? 'CHARGE_DIFFERENCE', minSpendFlatFee: branch.minSpendFlatFee ?? 0, pmsProvider: (PMS_OPTIONS.some((p) => p.value === branch.pmsProvider) ? branch.pmsProvider : 'NONE') as BranchForm['pmsProvider'] } });
  const onSubmit = (v: BranchForm) => save.mutate({ ...v, logoUrl: v.logoUrl || null, email: v.email || null });
  const shortfall = watch('minSpendShortfallMode');
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <Card>
        <CardHeader title="Business & branch" subtitle="Shown on the customer menu and receipts" />
        <fieldset disabled={!canManage} className="grid sm:grid-cols-2 gap-4">
          <Input label="Business name" required error={errors.businessName?.message} {...register('businessName')} />
          <Input label="Branch name" required error={errors.name?.message} {...register('name')} />
          <Input label="Address" wrapperClassName="sm:col-span-2" {...register('address')} />
          <Input label="City / PIN" {...register('city')} />
          <Input label="Phone" {...register('phone')} />
          <Input label="Email" type="email" error={errors.email?.message} {...register('email')} />
          <Input label="GST number" {...register('gstNumber')} />
          <Input label="Logo URL" wrapperClassName="sm:col-span-2" error={errors.logoUrl?.message} {...register('logoUrl')} />
          <Textarea label="Welcome message (QR menu)" rows={2} {...register('welcomeMessage')} />
          <Textarea label="Receipt footer" rows={2} {...register('receiptFooter')} />
        </fieldset>
      </Card>
      <Card>
        <CardHeader title="Billing rules" subtitle="Applied by the billing engine on every bill" />
        <fieldset disabled={!canManage} className="grid sm:grid-cols-2 gap-4">
          <Input label="Service charge (%)" type="number" step="0.5" min={0} max={100} error={errors.serviceChargePercent?.message} {...register('serviceChargePercent')} />
          <Select label="Grand total rounding" options={[{ value: 'NEAREST', label: 'Nearest rupee' }, { value: 'UP', label: 'Round up' }, { value: 'DOWN', label: 'Round down' }, { value: 'NONE', label: 'No rounding (2 decimals)' }]} {...register('roundingMode')} />
          <Switch checked={watch('taxOnServiceCharge')} onChange={(v) => setValue('taxOnServiceCharge', v, { shouldDirty: true })} label="Apply tax on service charge" description="When on, service charge is added to the taxable base." disabled={!canManage} />
          <Switch checked={watch('allowMultipleOrdersPerTable')} onChange={(v) => setValue('allowMultipleOrdersPerTable', v, { shouldDirty: true })} label="Allow multiple active orders per table" description="Off by default — one open order per table keeps billing unambiguous." disabled={!canManage} />
        </fieldset>
      </Card>
      <Card>
        <CardHeader title="Inventory & operations" subtitle="How stock is deducted, how VIP minimum spend is handled, and hotel posting" />
        <fieldset disabled={!canManage} className="grid sm:grid-cols-2 gap-4">
          <Select label="Stock deduction" options={[{ value: 'ON_CONFIRM', label: 'When the order is confirmed' }, { value: 'ON_BILL_CLOSE', label: 'When the bill is closed' }, { value: 'MANUAL', label: 'Manually from the order screen' }]} hint="Recipes deduct ingredients at this moment; cancellations always reverse." {...register('stockDeductionMode')} />
          <Select label="VIP minimum-spend shortfall" options={[{ value: 'CHARGE_DIFFERENCE', label: 'Charge the difference on the bill' }, { value: 'WAIVE', label: 'Waive the shortfall' }, { value: 'FLAT_FEE', label: 'Charge a flat fee' }]} hint="Applied as a non-taxable line when a VIP table spends under its minimum." {...register('minSpendShortfallMode')} />
          <Input label="Flat shortfall fee (₹)" type="number" min={0} step="1" disabled={!canManage || shortfall !== 'FLAT_FEE'} error={errors.minSpendFlatFee?.message} {...register('minSpendFlatFee')} />
          <Select label="Hotel PMS provider" options={PMS_OPTIONS} hint="Enables “Charge to room” at payment. Providers other than the demo adapter need server-side credentials." {...register('pmsProvider')} />
        </fieldset>
      </Card>
      {canManage && (
        <div className="bar-bottom -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 flex items-center justify-end gap-3 rounded-b-md">
          {isDirty && <p className="text-caption text-neutral-500 mr-auto">You have unsaved changes.</p>}
          <Button type="submit" leftIcon={<Save className="h-4 w-4" />} loading={save.isPending} disabled={!isDirty}>Save settings</Button>
        </div>
      )}
    </form>
  );
}

const taxSchema = z.object({ code: z.string().trim().min(2).max(20), name: z.string().trim().min(2).max(80), isActive: z.boolean(), rates: z.array(z.object({ code: z.string().trim().min(1, 'Code').max(20), name: z.string().trim().min(1, 'Name').max(80), percent: z.coerce.number().min(0, '≥ 0').max(100) })) });
type TaxForm = z.infer<typeof taxSchema>;

function TaxGroupForm({ editing, onClose }: { editing: TaxGroup | null; onClose: () => void }) {
  const save = useTaxMutations();
  const { register, control, handleSubmit, watch, setValue, formState: { errors } } = useForm<TaxForm>({ resolver: zodResolver(taxSchema), values: { code: editing?.code ?? '', name: editing?.name ?? '', isActive: editing?.isActive ?? true, rates: editing?.rates ?? [{ code: 'CGST', name: 'CGST', percent: 2.5 }, { code: 'SGST', name: 'SGST', percent: 2.5 }] } });
  const { fields, append, remove } = useFieldArray({ control, name: 'rates' });
  const onSubmit = async (v: TaxForm) => { await save.mutateAsync({ id: editing?.id ?? null, body: v as TaxGroupInput }); onClose(); };
  const total = watch('rates').reduce((a, r) => a + (Number(r.percent) || 0), 0);
  return (
    <Modal open onClose={onClose} title={editing ? `Edit ${editing.name}` : 'New tax group'} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={handleSubmit(onSubmit)} loading={save.isPending}>Save</Button></>}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="grid grid-cols-2 gap-4"><Input label="Code" required placeholder="GST5" error={errors.code?.message} {...register('code')} /><Input label="Name" required placeholder="GST 5% (Food)" error={errors.name?.message} {...register('name')} /></div>
        <div>
          <p className="text-label text-neutral-700 mb-1.5">Components <span className="text-neutral-500 font-normal">(total {total}%)</span></p>
          <div className="space-y-2">{fields.map((f, i) => (
            <div key={f.id} className="grid grid-cols-[1fr_1.4fr_90px_auto] gap-2 items-start">
              <Input placeholder="CGST" error={errors.rates?.[i]?.code?.message} {...register(`rates.${i}.code`)} /><Input placeholder="Central GST" error={errors.rates?.[i]?.name?.message} {...register(`rates.${i}.name`)} /><Input type="number" step="0.001" min={0} placeholder="%" error={errors.rates?.[i]?.percent?.message} {...register(`rates.${i}.percent`)} />
              <IconButton label="Remove component" className="text-danger-600 mt-0.5" onClick={() => remove(i)}><Trash2 className="h-4 w-4" /></IconButton>
            </div>))}</div>
          <Button type="button" variant="outline" size="sm" className="mt-2" leftIcon={<Plus className="h-4 w-4" />} onClick={() => append({ code: '', name: '', percent: 0 })}>Add component</Button>
        </div>
        <Switch checked={watch('isActive')} onChange={(v) => setValue('isActive', v)} label="Active" />
      </form>
    </Modal>
  );
}

function TaxSettings() {
  const canManage = usePermission('settings:manage');
  const taxes = useTaxGroups();
  const [editing, setEditing] = useState<TaxGroup | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <Card padded={false}>
      <CardHeader className="p-5 pb-0" title="Tax groups" subtitle="Assign a group to each menu item. GST/CGST/SGST/VAT components are configurable — nothing is hard-coded." action={canManage && <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setOpen(true); }}>New group</Button>} />
      {taxes.isLoading && <div className="p-5"><LoadingState rows={3} /></div>}
      {taxes.isError && <ErrorState error={taxes.error} onRetry={() => void taxes.refetch()} compact />}
      {taxes.data && <ul className="divide-y divide-neutral-100 mt-2">{taxes.data.map((t) => (
        <li key={t.id} className="px-5 py-3 flex items-center gap-3">
          <span className="h-9 w-9 rounded-sm bg-neutral-100 text-neutral-600 flex items-center justify-center"><Percent className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1"><p className="font-medium flex items-center gap-2">{t.name}<Badge size="sm">{t.code}</Badge>{!t.isActive && <Badge size="sm" tone="neutral">Inactive</Badge>}</p><p className="text-caption text-neutral-500">{t.rates.length ? t.rates.map((r) => `${r.code} ${r.percent}%`).join(' + ') : 'No tax'} = {t.totalPercent}%</p></div>
          {canManage && <Button size="sm" variant="outline" onClick={() => { setEditing(t); setOpen(true); }}>Edit</Button>}
        </li>))}</ul>}
      {open && <TaxGroupForm editing={editing} onClose={() => setOpen(false)} />}
    </Card>
  );
}

export default function SettingsPage() {
  const branch = useBranch();
  const [tab, setTab] = useState<'branch' | 'taxes' | 'system'>('branch');
  return (
    <div className="max-w-4xl">
      <PageHeader title="Settings" subtitle="Branch profile, billing rules and tax configuration" />
      <Tabs className="mb-5" value={tab} onChange={setTab} options={[{ value: 'branch', label: 'Branch & billing' }, { value: 'taxes', label: 'Taxes' }, { value: 'system', label: 'System' }]} />
      {tab === 'branch' && (branch.isLoading ? <LoadingState variant="page" /> : branch.isError ? <ErrorState error={branch.error} onRetry={() => void branch.refetch()} /> : branch.data ? <BranchSettings branch={branch.data} /> : null)}
      {tab === 'taxes' && <TaxSettings />}
      {tab === 'system' && (
        <Card>
          <CardHeader title="System" subtitle="Runtime configuration (read-only, from .env)" />
          <dl className="grid sm:grid-cols-2 gap-3 text-sm">
            {[['API mode', env.apiMode], ['API base URL', env.apiMode === 'ords' ? env.apiBaseUrl : '— (in-browser mock)'], ['Public app URL (QR)', env.publicAppUrl], ['Realtime transport', env.realtimeMode], ['App version', '1.0.0']].map(([k, v]) => <div key={k} className="rounded-sm bg-neutral-50 px-3 py-2"><dt className="text-caption text-neutral-500">{k}</dt><dd className="font-mono text-neutral-800 break-all">{v}</dd></div>)}
          </dl>
        </Card>
      )}
    </div>
  );
}
