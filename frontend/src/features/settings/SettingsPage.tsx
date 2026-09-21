import { useState, type ComponentType } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Save, Plus, Trash2, Percent, Undo2, Building2, Printer, ReceiptText, Boxes, Server, type LucideIcon } from 'lucide-react';
import { branchApi } from '@/services/api/endpoints';
import { useBranch } from '@/components/layout/Shell';
import { useTaxGroups, useTaxMutations } from '@/features/menu/hooks';
import { usePermission } from '@/hooks/useAuth';
import { toast } from '@/store/uiStore';
import { PageHeader, Button, IconButton, Card, CardHeader, Input, Select, Switch, Textarea, Modal, LoadingState, ErrorState, EmptyState, Badge, Alert, useReadOnly, ReadOnlyBanner, ReadOnlyPill, ReadOnlyField } from '@/components/ui';
import { env } from '@/config/env';
import { cn } from '@/utils/cn';
import type { Branch, BranchInput, TaxGroup, TaxGroupInput } from '@/types';

/**
 * THE SETTING SECTIONS, declared once.
 *
 * Every one of these is already wired to something real: the first four are fields on
 * `PUT /branch`, "Tax groups" is the tax-group endpoints, and "System" is read-only runtime
 * configuration. Nothing is listed here that the application cannot actually change.
 */
type SectionId = 'identity' | 'guest' | 'billing' | 'operations' | 'taxes' | 'system';

interface SectionDef { id: SectionId; label: string; icon: LucideIcon }

const SECTIONS: SectionDef[] = [
  { id: 'identity', label: 'Business identity', icon: Building2 },
  { id: 'guest', label: 'Guest-facing text', icon: Printer },
  { id: 'billing', label: 'Billing rules', icon: ReceiptText },
  { id: 'operations', label: 'Inventory & operations', icon: Boxes },
  { id: 'taxes', label: 'Tax groups', icon: Percent },
  { id: 'system', label: 'System', icon: Server },
];

const SECTION_LABEL = Object.fromEntries(SECTIONS.map((s) => [s.id, s.label])) as Record<SectionId, string>;
/** The four that are fields on the one branch form, and therefore share one save bar. */
const BRANCH_SECTIONS: SectionId[] = ['identity', 'guest', 'billing', 'operations'];

/** Field width inside a section card — an explicit `minmax(0,1fr)` track, never a bare `1fr`. */
const FIELD_GRID = 'grid grid-cols-1 md:grid-cols-[repeat(2,minmax(0,1fr))] gap-4';

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
const FIELD_SECTION: Partial<Record<keyof BranchForm, SectionId>> = {
  businessName: 'identity', name: 'identity', address: 'identity', city: 'identity',
  phone: 'identity', email: 'identity', gstNumber: 'identity',
  logoUrl: 'guest', welcomeMessage: 'guest', receiptFooter: 'guest',
  serviceChargePercent: 'billing', roundingMode: 'billing', taxOnServiceCharge: 'billing', allowMultipleOrdersPerTable: 'billing',
  stockDeductionMode: 'operations', minSpendShortfallMode: 'operations', minSpendFlatFee: 'operations', pmsProvider: 'operations',
};

function SectionHeader({ icon, title, subtitle }: { icon: ComponentType<{ className?: string }>; title: string; subtitle: string }) {
  const Icon = icon;
  return <CardHeader title={<span className="flex items-center gap-2"><Icon className="h-4 w-4 text-neutral-400" aria-hidden />{title}</span>} subtitle={subtitle} />;
}

/**
 * SECTION NAVIGATION.
 *
 * At `lg` it is the reference's fixed 220 px rail: one button per section, the active one
 * gold-tinted behind a gold left rail. Below `lg` the same list becomes ONE horizontally
 * scrollable line of chips above the form — stacking six full-width rows there would push the
 * fields themselves off the first screen, which is the same mistake defect B2 records on Roles.
 * The scroll lives inside this element, never on the page.
 */
function SectionNav({ value, onChange }: { value: SectionId; onChange: (s: SectionId) => void }) {
  return (
    <nav aria-label="Settings sections" className="min-w-0">
      {/* Phones and tablets — one scrolling line */}
      <div className="lg:hidden flex gap-2 overflow-x-auto overscroll-x-contain no-scrollbar py-1 -mx-1 px-1">
        {SECTIONS.map((s) => {
          const on = s.id === value;
          return (
            <button
              key={s.id}
              type="button"
              aria-current={on ? 'true' : undefined}
              onClick={() => onChange(s.id)}
              className={cn(
                'shrink-0 min-h-touch px-3.5 rounded-full border text-sm font-medium inline-flex items-center gap-1.5 transition-colors duration-control press',
                on
                  ? 'bg-gold-sheen bg-primary-500 border-primary-400 text-on-primary'
                  : 'bg-neutral-100 border-neutral-300 text-neutral-800 hover:bg-neutral-200 hover:border-neutral-400',
              )}
            >
              <s.icon className={cn('h-3.5 w-3.5 shrink-0', on ? 'text-on-primary' : 'text-neutral-400')} aria-hidden />
              {s.label}
            </button>
          );
        })}
      </div>

      {/* Desktop — the fixed rail */}
      <ul className="hidden lg:block card p-0 overflow-hidden">
        {SECTIONS.map((s) => {
          const on = s.id === value;
          return (
            <li key={s.id} className="border-b border-neutral-200 last:border-b-0">
              <button
                type="button"
                aria-current={on ? 'true' : undefined}
                onClick={() => onChange(s.id)}
                className={cn(
                  'w-full text-left px-3.5 py-3 flex items-center gap-2.5 border-l-4 text-sm transition-colors duration-control hover:bg-neutral-100 min-h-touch',
                  on ? 'border-l-primary-500 bg-primary-50 text-primary-900 font-medium' : 'border-l-transparent text-neutral-700',
                )}
              >
                <s.icon className={cn('h-4 w-4 shrink-0', on ? 'text-primary-700' : 'text-neutral-400')} aria-hidden />
                <span className="min-w-0 truncate">{s.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function BranchSettings({ branch, section, onSection }: { branch: Branch; section: SectionId; onSection: (s: SectionId) => void }) {
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
  /** Sections holding an unsaved edit you cannot currently see — named, so nothing is saved blind. */
  const elsewhere = [...new Set(changed.map((k) => FIELD_SECTION[k]).filter((s): s is SectionId => !!s))]
    .filter((s) => s !== section)
    .map((s) => SECTION_LABEL[s]);

  /**
   * Send focus to the control the summary line names — a list of problems you cannot reach is not
   * a summary. Only the active section is mounted, so the section is opened first and the focus
   * is taken on the next frame, once the field exists.
   */
  const focusField = (k: keyof BranchForm) => {
    const target = FIELD_SECTION[k];
    if (target) onSection(target);
    requestAnimationFrame(() => {
      const el = document.getElementById(fieldId(k));
      if (el) { el.focus(); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    });
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
                {FIELD_SECTION[k] && <span className="block text-caption text-danger-700/80">in “{SECTION_LABEL[FIELD_SECTION[k]!]}”</span>}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      {/*
        ONE form, one save bar, one section on screen at a time. The fields of a section that is
        not showing stay registered (react-hook-form keeps their values), so the save bar still
        counts and names an edit made two sections ago and the validation summary above can send
        you straight back to it.
      */}
      <Card className={section === 'identity' ? undefined : 'hidden'}>
        <SectionHeader icon={Building2} title="Business identity" subtitle="Who you are on receipts, the QR menu and every report header" />
        <fieldset disabled={!canManage} className={FIELD_GRID}>
          <Input id={fieldId('businessName')} label="Business name" required hint="Printed at the top of every receipt" error={errors.businessName?.message} {...register('businessName')} />
          <Input id={fieldId('name')} label="Branch name" required hint="Identifies this branch in the header switcher and in branch comparison reports" error={errors.name?.message} {...register('name')} />
          <Input id={fieldId('address')} label="Address" wrapperClassName="md:col-span-2" hint="Appears under the business name on the receipt" {...register('address')} />
          <Input id={fieldId('city')} label="City / PIN" hint="Shown beside the branch name wherever branches are listed" {...register('city')} />
          <Input id={fieldId('phone')} label="Phone" hint="Printed on the receipt for guest queries" {...register('phone')} />
          <Input id={fieldId('email')} label="Email" type="email" hint="Used on the receipt; not used to send anything from this app" error={errors.email?.message} {...register('email')} />
          <Input id={fieldId('gstNumber')} label="GST number" hint="Printed on the receipt next to the tax breakdown" {...register('gstNumber')} />
        </fieldset>
      </Card>

      <Card className={section === 'guest' ? undefined : 'hidden'}>
        <SectionHeader icon={Printer} title="Guest-facing text" subtitle="What the guest reads on the QR menu and on the printed bill" />
        <fieldset disabled={!canManage} className={FIELD_GRID}>
          <Input id={fieldId('logoUrl')} label="Logo URL" wrapperClassName="md:col-span-2" hint="A full https:// link. Shown on the QR menu header; leave blank to show the business name as text." error={errors.logoUrl?.message} {...register('logoUrl')} />
          <Textarea id={fieldId('welcomeMessage')} label="Welcome message (QR menu)" rows={2} hint="First line a guest sees after scanning the table QR code" {...register('welcomeMessage')} />
          <Textarea id={fieldId('receiptFooter')} label="Receipt footer" rows={2} hint="Last line on the printed receipt — a thank-you, Wi-Fi password or return policy" {...register('receiptFooter')} />
        </fieldset>
      </Card>

      <Card className={section === 'billing' ? undefined : 'hidden'}>
        <SectionHeader icon={ReceiptText} title="Billing rules" subtitle="Applied by the billing engine to every bill in this branch" />
        <fieldset disabled={!canManage} className={FIELD_GRID}>
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

      <Card className={section === 'operations' ? undefined : 'hidden'}>
        <SectionHeader icon={Boxes} title="Inventory & operations" subtitle="When stock moves, how a VIP shortfall is charged, and whether room posting is available" />
        <fieldset disabled={!canManage} className={FIELD_GRID}>
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

        It only exists while there is something to save or something to fix. A permanent
        "No unsaved changes." panel spent a whole band of a 390 px screen saying nothing, and
        offered two dead controls; now an untouched form is just the form.
      */}
      {canManage && (isDirty || errorFields.length > 0) && (
        <div className="save-bar">
          <div className="card shadow-panel px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 min-w-0">
            <p className="text-sm min-w-0 flex-1" aria-live="polite">
              {errorFields.length > 0
                ? <span className="font-semibold text-danger-700">Fix {errorFields.length} field{errorFields.length === 1 ? '' : 's'} named at the top of this section before saving</span>
                : <>
                  <span className="font-semibold text-neutral-900">{changed.length || 1} unsaved change{(changed.length || 1) === 1 ? '' : 's'}</span>
                  {changedSummary && <span className="block text-caption text-neutral-600 break-words">{changedSummary}</span>}
                  {elsewhere.length > 0 && <span className="block text-caption text-neutral-500 break-words">including {elsewhere.join(' and ')}, which you are not looking at</span>}
                </>}
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <Button type="button" variant="ghost" leftIcon={<Undo2 className="h-4 w-4" />} disabled={save.isPending} onClick={() => reset()}>Discard</Button>
              <Button type="submit" leftIcon={<Save className="h-4 w-4" />} loading={save.isPending}>Save settings</Button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

/* ---------------------------------------------------------------------------------------------
 * THE READ-ONLY BRANCH CONFIGURATION.
 *
 * Driven by the ABSENCE of `settings:manage`, never by the workspace — see `ui/ReadOnly.tsx`. An
 * account that holds the permission gets `BranchSettings` above, with its form and its save bar,
 * on this same screen; an account that does not gets the values themselves. If the server ever
 * grants a manager `settings:manage`, this screen becomes editable for them with no code change,
 * and if it ever takes it away from an administrator the same is true in the other direction.
 *
 * Values, not disabled inputs. A greyed-out `<input>` dims the text exactly where it most needs
 * to be legible and invites a click that does nothing; `ReadOnlyField` prints the value on a
 * quiet ground and says "Not set" where the branch record genuinely holds nothing.
 * ------------------------------------------------------------------------------------------- */
const ROUNDING_LABEL: Record<Branch['roundingMode'], string> = {
  NEAREST: 'Nearest rupee', UP: 'Round up', DOWN: 'Round down', NONE: 'No rounding (2 decimals)',
};
const STOCK_MODE_LABEL: Record<string, string> = {
  ON_CONFIRM: 'When the order is confirmed', ON_BILL_CLOSE: 'When the bill is closed', MANUAL: 'Manually from the order screen',
};
const SHORTFALL_LABEL: Record<string, string> = {
  CHARGE_DIFFERENCE: 'Charge the difference on the bill', WAIVE: 'Waive the shortfall', FLAT_FEE: 'Charge a flat fee',
};
const onOff = (v: boolean, on: string, off: string) => (v ? on : off);

function BranchSettingsReadOnly({ branch, section }: { branch: Branch; section: SectionId }) {
  const shortfall = branch.minSpendShortfallMode ?? 'CHARGE_DIFFERENCE';
  return (
    <div className="space-y-4">
      <Card className={section === 'identity' ? undefined : 'hidden'}>
        <SectionHeader icon={Building2} title="Branch information" subtitle="Who you are on receipts, the QR menu and every report header" />
        <div className={FIELD_GRID}>
          <ReadOnlyField label={FIELD_LABELS.businessName} value={branch.businessName} />
          <ReadOnlyField label={FIELD_LABELS.name} value={branch.name} />
          <ReadOnlyField className="md:col-span-2" label={FIELD_LABELS.address} value={branch.address} />
          <ReadOnlyField label={FIELD_LABELS.city} value={branch.city} />
          <ReadOnlyField label={FIELD_LABELS.phone} value={branch.phone} />
          <ReadOnlyField label={FIELD_LABELS.email} value={branch.email} />
          <ReadOnlyField label={FIELD_LABELS.gstNumber} value={branch.gstNumber} />
        </div>
      </Card>

      <Card className={section === 'guest' ? undefined : 'hidden'}>
        <SectionHeader icon={Printer} title="Guest-facing text" subtitle="What the guest reads on the QR menu and on the printed bill" />
        <div className={FIELD_GRID}>
          <ReadOnlyField className="md:col-span-2" label={FIELD_LABELS.logoUrl} value={branch.logoUrl} />
          <ReadOnlyField label={FIELD_LABELS.welcomeMessage} value={branch.welcomeMessage} />
          <ReadOnlyField label={FIELD_LABELS.receiptFooter} value={branch.receiptFooter} />
        </div>
      </Card>

      <Card className={section === 'billing' ? undefined : 'hidden'}>
        <SectionHeader icon={ReceiptText} title="Billing preferences" subtitle="Applied by the billing engine to every bill in this branch" />
        <div className={FIELD_GRID}>
          <ReadOnlyField label={FIELD_LABELS.serviceChargePercent} value={<span className="tabular-nums">{branch.serviceChargePercent}%</span>} />
          <ReadOnlyField label={FIELD_LABELS.roundingMode} value={ROUNDING_LABEL[branch.roundingMode]} />
          <ReadOnlyField label={FIELD_LABELS.taxOnServiceCharge} value={onOff(branch.taxOnServiceCharge, 'Applied — service charge joins the taxable base', 'Not applied — taxed at zero')} />
          <ReadOnlyField label={FIELD_LABELS.allowMultipleOrdersPerTable} value={onOff(branch.allowMultipleOrdersPerTable, 'Allowed', 'One open order per table')} />
        </div>
      </Card>

      <Card className={section === 'operations' ? undefined : 'hidden'}>
        <SectionHeader icon={Boxes} title="Inventory & operations" subtitle="When stock moves, how a VIP shortfall is charged, and whether room posting is available" />
        <div className={FIELD_GRID}>
          <ReadOnlyField label={FIELD_LABELS.stockDeductionMode} value={STOCK_MODE_LABEL[branch.stockDeductionMode ?? 'ON_CONFIRM']} />
          <ReadOnlyField label={FIELD_LABELS.minSpendShortfallMode} value={SHORTFALL_LABEL[shortfall]} />
          {/* The flat fee is only ever charged under one shortfall mode, so outside it the figure
              is printed with the fact that nothing uses it rather than on its own. */}
          <ReadOnlyField
            label={FIELD_LABELS.minSpendFlatFee}
            value={shortfall === 'FLAT_FEE'
              ? <span className="tabular-nums">₹{branch.minSpendFlatFee ?? 0}</span>
              : <span className="text-neutral-500">Not used — the shortfall mode is “{SHORTFALL_LABEL[shortfall]}”</span>}
          />
          <ReadOnlyField label={FIELD_LABELS.pmsProvider} value={PMS_OPTIONS.find((p) => p.value === branch.pmsProvider)?.label ?? PMS_OPTIONS[0].label} />
        </div>
      </Card>
    </div>
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
                <IconButton label={`Remove component ${i + 1}`} className="text-danger-700 mt-0.5" onClick={() => remove(i)}><Trash2 className="h-4 w-4" /></IconButton>
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
        <ul className="divide-y divide-neutral-200 mt-2">
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
  /*
   * READ-ONLY IS A PERMISSION, NOT A WORKSPACE.
   *
   * The manager board draws this screen behind a lock banner, and that is not a manager-specific
   * design decision — the seeded MANAGER role holds `settings:view` and not `settings:manage`,
   * which is exactly what this asks. An administrator holds the manage permission and therefore
   * keeps the editable form and its save bar on this same screen, unchanged.
   */
  const readOnly = useReadOnly('settings:manage');
  const [section, setSection] = useState<SectionId>('identity');
  const onBranchForm = BRANCH_SECTIONS.includes(section);

  return (
    /* `.pb-nav` is the shared rule (defect C1/C2): the page reserves the bottom navigation's own
       height plus breathing space, and the sticky `.save-bar` parks above it. No screen here
       matches a padding to an offset by hand. */
    <div className="max-w-5xl pb-nav">
      <PageHeader
        title="Settings"
        subtitle={branch.data
          ? `${branch.data.businessName} · ${branch.data.name} — these values drive every receipt and every bill calculation in this branch`
          : 'Branch profile, guest-facing text, billing rules and tax configuration'}
        actions={readOnly ? <ReadOnlyPill /> : undefined}
      />

      {readOnly && (
        <ReadOnlyBanner className="mb-4" title="These settings are read-only for your role">
          They change how every bill in this branch is calculated, so editing them needs the
          “Manage settings” permission. You can read all of it here; ask your system administrator to make a change.
        </ReadOnlyBanner>
      )}

      {/* Base `grid-cols-1`, and the rail declared as a fixed track beside `minmax(0,1fr)` — an
          implicit `auto` track sizes to min-content and is what pushed cards past 360 px before. */}
      <div className="grid grid-cols-1 gap-4 lg:gap-5 lg:grid-cols-[220px_minmax(0,1fr)] items-start">
        <SectionNav value={section} onChange={setSection} />

        <div className="min-w-0">
          {/* The branch form stays mounted across every section so an unsaved edit survives a
              detour into Taxes or System; only the active section is displayed. */}
          <div className={onBranchForm ? undefined : 'hidden'}>
            {branch.isLoading ? <LoadingState variant="page" />
              : branch.isError ? <ErrorState error={branch.error} onRetry={() => void branch.refetch()} />
                : branch.data
                  ? readOnly
                    ? <BranchSettingsReadOnly branch={branch.data} section={section} />
                    : <BranchSettings branch={branch.data} section={section} onSection={setSection} />
                  : null}
          </div>

          {section === 'taxes' && <TaxSettings />}

          {section === 'system' && (
            <Card>
              <CardHeader
                title={<span className="flex items-center gap-2"><Server className="h-4 w-4 text-neutral-400" aria-hidden />System</span>}
                subtitle="Runtime configuration, read from the environment this build was started with. Nothing here can be edited from the app."
              />
              <dl className="grid grid-cols-1 md:grid-cols-[repeat(2,minmax(0,1fr))] gap-3 text-sm">
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
      </div>
    </div>
  );
}
