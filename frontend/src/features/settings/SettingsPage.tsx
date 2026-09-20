import { useState, type ComponentType } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Save, Plus, Trash2, Percent, Undo2, Building2, Printer, ReceiptText, Boxes, Server, Lock } from 'lucide-react';
import { branchApi } from '@/services/api/endpoints';
import { useBranch } from '@/components/layout/Shell';
import { useTaxGroups, useTaxMutations } from '@/features/menu/hooks';
import { usePermission } from '@/hooks/useAuth';
import { toast } from '@/store/uiStore';
import { PageHeader, Button, IconButton, Card, CardHeader, Input, Select, Switch, Textarea, Modal, Tabs, LoadingState, ErrorState, EmptyState, Badge, Alert } from '@/components/ui';
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

/** Human names for the save bar and the error summary — field keys never reach the operator. */
const FIELD_LABELS: Record<keyof BranchForm, string> = {
  businessName: 'Business name', name: 'Branch name', address: 'Address', city: 'City / PIN', phone: 'Phone', email: 'Email',
  gstNumber: 'GST number', logoUrl: 'Logo URL', welcomeMessage: 'Welcome message', receiptFooter: 'Receipt footer',
  serviceChargePercent: 'Service charge', taxOnServiceCharge: 'Tax on service charge', roundingMode: 'Grand total rounding',
  allowMultipleOrdersPerTable: 'Multiple orders per table', stockDeductionMode: 'Stock deduction', minSpendShortfallMode: 'VIP minimum-spend shortfall',
  minSpendFlatFee: 'Flat shortfall fee', pmsProvider: 'Hotel PMS provider',
};

/** Stable DOM ids so the validation summary can send focus straight to the offending control. */
const fieldId = (k: keyof BranchForm) => `branch-${k}`;

/** Which named section a field lives in — the summary tells you where to look, not just what is wrong. */
const FIELD_SECTION: Partial<Record<keyof BranchForm, string>> = {
  businessName: 'Business identity', name: 'Business identity', address: 'Business identity', city: 'Business identity',
  phone: 'Business identity', email: 'Business identity', gstNumber: 'Business identity',
  logoUrl: 'Guest-facing text', welcomeMessage: 'Guest-facing text', receiptFooter: 'Guest-facing text',
  serviceChargePercent: 'Billing rules', roundingMode: 'Billing rules', taxOnServiceCharge: 'Billing rules', allowMultipleOrdersPerTable: 'Billing rules',
  stockDeductionMode: 'Inventory & operations', minSpendShortfallMode: 'Inventory & operations', minSpendFlatFee: 'Inventory & operations', pmsProvider: 'Inventory & operations',
};

function SectionHeader({ icon, title, subtitle }: { icon: ComponentType<{ className?: string }>; title: string; subtitle: string }) {
  const Icon = icon;
  return <CardHeader title={<span className="flex items-center gap-2"><Icon className="h-4 w-4 text-neutral-400" aria-hidden />{title}</span>} subtitle={subtitle} />;
}

function BranchSettings({ branch }: { branch: Branch }) {
  const canManage = usePermission('settings:manage');
  const qc = useQueryClient();
  const save = useMutation({ mutationFn: (b: BranchInput) => branchApi.update(b), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['branch'] }); toast.success('Settings saved'); } });
  const { register, handleSubmit, watch, setValue, reset, formState: { errors, isDirty, dirtyFields } } = useForm<BranchForm>({ resolver: zodResolver(branchSchema), values: { businessName: branch.businessName, name: branch.name, address: branch.address ?? '', city: branch.city ?? '', phone: branch.phone ?? '', email: branch.email ?? '', gstNumber: branch.gstNumber ?? '', logoUrl: branch.logoUrl ?? '', welcomeMessage: branch.welcomeMessage ?? '', receiptFooter: branch.receiptFooter ?? '', serviceChargePercent: branch.serviceChargePercent, taxOnServiceCharge: branch.taxOnServiceCharge, roundingMode: branch.roundingMode, allowMultipleOrdersPerTable: branch.allowMultipleOrdersPerTable, stockDeductionMode: branch.stockDeductionMode ?? 'ON_CONFIRM', minSpendShortfallMode: branch.minSpendShortfallMode ?? 'CHARGE_DIFFERENCE', minSpendFlatFee: branch.minSpendFlatFee ?? 0, pmsProvider: (PMS_OPTIONS.some((p) => p.value === branch.pmsProvider) ? branch.pmsProvider : 'NONE') as BranchForm['pmsProvider'] } });
  const onSubmit = (v: BranchForm) => save.mutate({ ...v, logoUrl: v.logoUrl || null, email: v.email || null });
  const shortfall = watch('minSpendShortfallMode');

  const changed = (Object.keys(dirtyFields) as (keyof BranchForm)[]).filter((k) => dirtyFields[k]);
  const errorFields = (Object.keys(errors) as (keyof BranchForm)[]);
  const changedSummary = changed.length <= 3
    ? changed.map((k) => FIELD_LABELS[k]).join(', ')
    : `${changed.slice(0, 3).map((k) => FIELD_LABELS[k]).join(', ')} and ${changed.length - 3} more`;

  /** Send focus to the control the summary line names — a list of problems you cannot reach is not a summary. */
  const focusField = (k: keyof BranchForm) => {
    const el = document.getElementById(fieldId(k));
    if (el) { el.focus(); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {/*
        VALIDATION SUMMARY — one block at the top naming every field that blocks the save,
        which section it is in, and a control that jumps straight to it.
      */}
      {errorFields.length > 0 && (
        <Alert tone="danger" title={`${errorFields.length} field${errorFields.length === 1 ? '' : 's'} cannot be saved yet`}>
          <ul className="mt-1 space-y-1">
            {errorFields.map((k) => (
              <li key={k} className="min-w-0">
                <button
                  type="button"
                  onClick={() => focusField(k)}
                  className="text-left underline underline-offset-2 font-semibold hover:no-underline rounded-sm"
                >
                  {FIELD_LABELS[k]}
                </button>
                <span className="text-danger-700"> — {errors[k]?.message || 'check this value'}</span>
                {FIELD_SECTION[k] && <span className="block text-caption text-danger-700/80">in “{FIELD_SECTION[k]}”</span>}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      <Card>
        <SectionHeader icon={Building2} title="Business identity" subtitle="Who you are on receipts, the QR menu and every report header" />
        <fieldset disabled={!canManage} className="grid sm:grid-cols-2 gap-4">
          <Input id={fieldId('businessName')} label="Business name" required hint="Printed at the top of every receipt" error={errors.businessName?.message} {...register('businessName')} />
          <Input id={fieldId('name')} label="Branch name" required hint="Identifies this branch in the header switcher and in branch comparison reports" error={errors.name?.message} {...register('name')} />
          <Input id={fieldId('address')} label="Address" wrapperClassName="sm:col-span-2" hint="Appears under the business name on the receipt" {...register('address')} />
          <Input id={fieldId('city')} label="City / PIN" hint="Shown beside the branch name wherever branches are listed" {...register('city')} />
          <Input id={fieldId('phone')} label="Phone" hint="Printed on the receipt for guest queries" {...register('phone')} />
          <Input id={fieldId('email')} label="Email" type="email" hint="Used on the receipt; not used to send anything from this app" error={errors.email?.message} {...register('email')} />
          <Input id={fieldId('gstNumber')} label="GST number" hint="Printed on the receipt next to the tax breakdown" {...register('gstNumber')} />
        </fieldset>
      </Card>

      <Card>
        <SectionHeader icon={Printer} title="Guest-facing text" subtitle="What the guest reads on the QR menu and on the printed bill" />
        <fieldset disabled={!canManage} className="grid sm:grid-cols-2 gap-4">
          <Input id={fieldId('logoUrl')} label="Logo URL" wrapperClassName="sm:col-span-2" hint="A full https:// link. Shown on the QR menu header; leave blank to show the business name as text." error={errors.logoUrl?.message} {...register('logoUrl')} />
          <Textarea id={fieldId('welcomeMessage')} label="Welcome message (QR menu)" rows={2} hint="First line a guest sees after scanning the table QR code" {...register('welcomeMessage')} />
          <Textarea id={fieldId('receiptFooter')} label="Receipt footer" rows={2} hint="Last line on the printed receipt — a thank-you, Wi-Fi password or return policy" {...register('receiptFooter')} />
        </fieldset>
      </Card>

      <Card>
        <SectionHeader icon={ReceiptText} title="Billing rules" subtitle="Applied by the billing engine to every bill in this branch" />
        <fieldset disabled={!canManage} className="grid sm:grid-cols-2 gap-4">
          <Input id={fieldId('serviceChargePercent')} label="Service charge (%)" type="number" step="0.5" min={0} max={100} hint="Added to every bill as a separate line before rounding. Set 0 to switch it off." error={errors.serviceChargePercent?.message} {...register('serviceChargePercent')} />
          <Select
            id={fieldId('roundingMode')}
            label="Grand total rounding"
            hint="How the final payable amount is rounded once tax and service charge are added"
            options={[{ value: 'NEAREST', label: 'Nearest rupee' }, { value: 'UP', label: 'Round up' }, { value: 'DOWN', label: 'Round down' }, { value: 'NONE', label: 'No rounding (2 decimals)' }]}
            {...register('roundingMode')}
          />
          <Switch checked={watch('taxOnServiceCharge')} onChange={(v) => setValue('taxOnServiceCharge', v, { shouldDirty: true })} label="Apply tax on service charge" description="On: service charge joins the taxable base, so tax is charged on it too. Off: it is taxed at zero." disabled={!canManage} />
          <Switch checked={watch('allowMultipleOrdersPerTable')} onChange={(v) => setValue('allowMultipleOrdersPerTable', v, { shouldDirty: true })} label="Allow multiple active orders per table" description="Off keeps one open order per table, so a waiter can never bill half a table by mistake." disabled={!canManage} />
        </fieldset>
      </Card>

      <Card>
        <SectionHeader icon={Boxes} title="Inventory & operations" subtitle="When stock moves, how a VIP shortfall is charged, and whether room posting is available" />
        <fieldset disabled={!canManage} className="grid sm:grid-cols-2 gap-4">
          <Select
            id={fieldId('stockDeductionMode')}
            label="Stock deduction"
            options={[{ value: 'ON_CONFIRM', label: 'When the order is confirmed' }, { value: 'ON_BILL_CLOSE', label: 'When the bill is closed' }, { value: 'MANUAL', label: 'Manually from the order screen' }]}
            hint="The moment recipe ingredients leave stock. Cancellations always reverse the movement, whichever mode is set."
            {...register('stockDeductionMode')}
          />
          <Select
            id={fieldId('minSpendShortfallMode')}
            label="VIP minimum-spend shortfall"
            options={[{ value: 'CHARGE_DIFFERENCE', label: 'Charge the difference on the bill' }, { value: 'WAIVE', label: 'Waive the shortfall' }, { value: 'FLAT_FEE', label: 'Charge a flat fee' }]}
            hint="What happens when a VIP table spends less than its minimum. Added as a non-taxable line on the bill."
            {...register('minSpendShortfallMode')}
          />
          <Input
            id={fieldId('minSpendFlatFee')}
            label="Flat shortfall fee (₹)"
            type="number"
            min={0}
            step="1"
            disabled={!canManage || shortfall !== 'FLAT_FEE'}
            hint={shortfall === 'FLAT_FEE' ? 'Charged instead of the difference whenever a VIP table falls short' : 'Only used when the shortfall mode above is “Charge a flat fee”'}
            error={errors.minSpendFlatFee?.message}
            {...register('minSpendFlatFee')}
          />
          <Select id={fieldId('pmsProvider')} label="Hotel PMS provider" options={PMS_OPTIONS} hint="Enables “Charge to room” at payment. Anything other than the demo adapter needs server-side credentials before it will post." {...register('pmsProvider')} />
        </fieldset>
      </Card>

      {/*
        SAVE BAR (defect C). `.save-bar` is the one shared rule: sticky, parked at
        `var(--app-bottom-nav) + 0.75rem`, so it sits ABOVE the phone's bottom navigation
        instead of on top of it, and collapses to a plain 0.75rem offset at lg.
        Because it is sticky (in flow) and last in the document, the final field always
        scrolls clear of it — no hand-matched `pb-24` anywhere; `main` carries `.pb-nav`.
      */}
      {canManage && (
        <div className="save-bar">
          <div className="card shadow-panel px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 min-w-0">
            <p className="text-sm min-w-0 flex-1" aria-live="polite">
              {errorFields.length > 0
                ? <span className="font-semibold text-danger-700">Fix {errorFields.length} field{errorFields.length === 1 ? '' : 's'} above before saving</span>
                : isDirty
                  ? <>
                    <span className="font-semibold text-neutral-900">{changed.length || 1} unsaved change{(changed.length || 1) === 1 ? '' : 's'}</span>
                    {changedSummary && <span className="block text-caption text-neutral-600 break-words">{changedSummary}</span>}
                  </>
                  : <span className="text-neutral-500">No unsaved changes.</span>}
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <Button type="button" variant="ghost" leftIcon={<Undo2 className="h-4 w-4" />} disabled={!isDirty || save.isPending} onClick={() => reset()}>Discard</Button>
              <Button type="submit" leftIcon={<Save className="h-4 w-4" />} loading={save.isPending} disabled={!isDirty}>Save settings</Button>
            </div>
          </div>
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
    <Modal
      open
      onClose={onClose}
      title={editing ? `Edit ${editing.name}` : 'New tax group'}
      description="A tax group is what a menu item points at. Its components are what the receipt prints line by line."
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={handleSubmit(onSubmit)} loading={save.isPending}>Save</Button></>}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Code" required placeholder="GST5" hint="Short key used when assigning items" error={errors.code?.message} {...register('code')} />
          <Input label="Name" required placeholder="GST 5% (Food)" hint="Shown in the menu item editor" error={errors.name?.message} {...register('name')} />
        </div>
        <div>
          <p className="text-label text-neutral-700 mb-1.5">Components <span className="text-neutral-500 font-normal">(total {total}% — this is the rate applied to the item)</span></p>
          <div className="space-y-2">
            {fields.map((f, i) => (
              <div key={f.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_90px_auto] gap-2 items-start">
                <Input placeholder="CGST" aria-label={`Component ${i + 1} code`} error={errors.rates?.[i]?.code?.message} {...register(`rates.${i}.code`)} />
                <Input placeholder="Central GST" aria-label={`Component ${i + 1} name`} error={errors.rates?.[i]?.name?.message} {...register(`rates.${i}.name`)} />
                <Input type="number" step="0.001" min={0} placeholder="%" aria-label={`Component ${i + 1} percent`} error={errors.rates?.[i]?.percent?.message} {...register(`rates.${i}.percent`)} />
                <IconButton label={`Remove component ${i + 1}`} className="text-danger-600 mt-0.5" onClick={() => remove(i)}><Trash2 className="h-4 w-4" /></IconButton>
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" className="mt-2" leftIcon={<Plus className="h-4 w-4" />} onClick={() => append({ code: '', name: '', percent: 0 })}>Add component</Button>
        </div>
        <Switch checked={watch('isActive')} onChange={(v) => setValue('isActive', v)} label="Active" description="Inactive groups stay on existing items but cannot be chosen for new ones" />
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
      <CardHeader
        className="p-5 pb-0"
        title="Tax groups"
        subtitle="Every menu item points at one group. GST / CGST / SGST / VAT components are configurable — nothing is hard-coded."
        action={canManage && <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setOpen(true); }}>New group</Button>}
      />
      {taxes.isLoading && <div className="p-5"><LoadingState rows={3} /></div>}
      {taxes.isError && <ErrorState error={taxes.error} onRetry={() => void taxes.refetch()} compact />}
      {taxes.data && (taxes.data.length === 0 ? (
        <EmptyState
          compact
          icon={<Percent className="h-6 w-6" />}
          title="No tax groups yet"
          description="Create one group per rate you charge — a menu item cannot be taxed until it points at a group."
          action={canManage ? <Button onClick={() => { setEditing(null); setOpen(true); }}>New group</Button> : undefined}
        />
      ) : (
        <ul className="divide-y divide-neutral-100 mt-2">
          {taxes.data.map((t) => (
            <li key={t.id} className="px-5 py-3 flex items-center gap-3">
              <span className="h-9 w-9 rounded-sm bg-neutral-100 text-neutral-600 flex items-center justify-center shrink-0" aria-hidden><Percent className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <p className="font-medium flex flex-wrap items-center gap-2">
                  <span className="truncate">{t.name}</span>
                  <Badge size="sm">{t.code}</Badge>
                  {!t.isActive && <Badge size="sm" tone="neutral">Inactive</Badge>}
                </p>
                <p className="text-caption text-neutral-500">{t.rates.length ? t.rates.map((r) => `${r.code} ${r.percent}%`).join(' + ') : 'No components'} = {t.totalPercent}%</p>
              </div>
              {canManage && <Button size="sm" variant="outline" onClick={() => { setEditing(t); setOpen(true); }}>Edit</Button>}
            </li>
          ))}
        </ul>
      ))}
      {open && <TaxGroupForm editing={editing} onClose={() => setOpen(false)} />}
    </Card>
  );
}

export default function SettingsPage() {
  const branch = useBranch();
  const canManage = usePermission('settings:manage');
  const [tab, setTab] = useState<'branch' | 'taxes' | 'system'>('branch');
  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Settings"
        subtitle={branch.data
          ? `${branch.data.businessName} · ${branch.data.name} — these values drive every receipt and every bill calculation in this branch`
          : 'Branch profile, guest-facing text, billing rules and tax configuration'}
      />

      {!canManage && (
        <Alert tone="info" className="mb-4" title="Read-only" >
          <span className="inline-flex items-start gap-1.5">
            <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden />
            <span>These settings change how every bill in the branch is calculated, so editing them needs the “Manage settings” permission. You can read everything here; ask an administrator to make a change.</span>
          </span>
        </Alert>
      )}

      <Tabs
        className="mb-5"
        ariaLabel="Settings section"
        value={tab}
        onChange={setTab}
        options={[{ value: 'branch', label: 'Branch & billing' }, { value: 'taxes', label: 'Taxes' }, { value: 'system', label: 'System' }]}
      />

      {tab === 'branch' && (branch.isLoading ? <LoadingState variant="page" /> : branch.isError ? <ErrorState error={branch.error} onRetry={() => void branch.refetch()} /> : branch.data ? <BranchSettings branch={branch.data} /> : null)}
      {tab === 'taxes' && <TaxSettings />}
      {tab === 'system' && (
        <Card>
          <CardHeader
            title={<span className="flex items-center gap-2"><Server className="h-4 w-4 text-neutral-400" aria-hidden />System</span>}
            subtitle="Runtime configuration, read from the environment this build was started with. Nothing here can be edited from the app."
          />
          <dl className="grid sm:grid-cols-2 gap-3 text-sm">
            {([
              ['API mode', env.apiMode, env.apiMode === 'ords' ? 'Requests go to the ORDS backend' : 'Requests are served by the in-browser mock'],
              ['API base URL', env.apiMode === 'ords' ? env.apiBaseUrl : '— (in-browser mock)', 'Where every request is sent'],
              ['Public app URL (QR)', env.publicAppUrl, 'Base address encoded into table QR codes'],
              ['Realtime transport', env.realtimeMode, 'How order and table updates reach this screen'],
              ['App version', '1.0.0', 'Frontend build'],
            ] as [string, string, string][]).map(([k, v, note]) => (
              <div key={k} className="rounded-sm bg-neutral-50 border border-neutral-200 px-3 py-2 min-w-0">
                <dt className="text-caption text-neutral-500">{k}</dt>
                <dd className="font-mono text-neutral-800 break-all">{v}</dd>
                <dd className="text-caption text-neutral-500 mt-0.5">{note}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}
    </div>
  );
}
