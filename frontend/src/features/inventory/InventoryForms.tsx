import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, ArrowDownLeft, ArrowUpRight, ArrowLeftRight } from 'lucide-react';
import { useInventoryCategories, useInventoryUnits, useInventoryMutations, useSuppliers, useInventoryItems } from '@/features/p2/hooks';
import { Modal, Button, Input, Select, Switch, Textarea, IconButton, Badge, SegmentedControl, QuickChips, Alert, InlineError } from '@/components/ui';
import { ApiError } from '@/services/api/client';
import { money } from '@/utils/money';
import { cn } from '@/utils/cn';
import type { InventoryItem, InventoryItemInput, InventoryCategory, InventoryCategoryInput, ManualMovementType, ID } from '@/types';

/** Grouped block inside a long form — identity, levels, costing and behaviour read as four decisions, not twelve fields. */
function FormSection({ title, hint, children, className }: { title: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <fieldset className={cn('min-w-0', className)}>
      <legend className="text-label uppercase text-neutral-500">{title}</legend>
      {hint && <p className="text-caption text-neutral-500 mt-1">{hint}</p>}
      <div className="grid sm:grid-cols-2 gap-4 mt-3">{children}</div>
    </fieldset>
  );
}

// ---------------------------------------------------------------- item form
const itemSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(150),
  code: z.string().trim().max(30).optional(),
  categoryId: z.coerce.number().int().positive('Select a category'),
  unitId: z.coerce.number().int().positive('Select a unit'),
  packSize: z.coerce.number().min(0).optional(),
  minQty: z.coerce.number().min(0, 'Cannot be negative'),
  maxQty: z.coerce.number().min(0).optional(),
  reorderLevel: z.coerce.number().min(0, 'Cannot be negative'),
  costPrice: z.coerce.number().min(0, 'Cannot be negative'),
  supplierId: z.coerce.number().optional(),
  openingQty: z.coerce.number().min(0).optional(),
  allowNegative: z.boolean(),
  isActive: z.boolean(),
});
type ItemForm = z.infer<typeof itemSchema>;

export function InventoryItemForm({ editing, onClose }: { editing: InventoryItem | null; onClose: () => void }) {
  const cats = useInventoryCategories();
  const units = useInventoryUnits();
  const suppliers = useSuppliers({ status: 'ACTIVE' });
  const { saveItem } = useInventoryMutations();
  const { register, handleSubmit, watch, setValue, setError, formState: { errors } } = useForm<ItemForm>({
    resolver: zodResolver(itemSchema),
    values: { name: editing?.name ?? '', code: editing?.code ?? '', categoryId: editing?.categoryId ?? 0, unitId: editing?.unitId ?? 0, packSize: editing?.packSize ?? undefined, minQty: editing?.minQty ?? 0, maxQty: editing?.maxQty ?? undefined, reorderLevel: editing?.reorderLevel ?? 0, costPrice: editing?.costPrice ?? 0, supplierId: editing?.supplierId ?? undefined, openingQty: undefined, allowNegative: editing?.allowNegative ?? false, isActive: editing?.isActive ?? true },
  });
  const unitId = watch('unitId');
  const unit = units.data?.find((u) => u.id === Number(unitId));
  const onSubmit = async (v: ItemForm) => {
    const body: InventoryItemInput = { name: v.name, code: v.code || undefined, categoryId: v.categoryId, unitId: v.unitId, packSize: v.packSize || null, minQty: v.minQty, maxQty: v.maxQty || null, reorderLevel: v.reorderLevel, costPrice: v.costPrice, supplierId: v.supplierId || null, allowNegative: v.allowNegative, isActive: v.isActive, openingQty: editing ? undefined : v.openingQty || undefined };
    try { await saveItem.mutateAsync({ id: editing?.id ?? null, body }); onClose(); }
    catch (e) { const err = ApiError.from(e); const f = err.errors.find((x) => x.field)?.field as keyof ItemForm | undefined; setError(f ?? 'name', { message: err.message }); }
  };
  return (
    <Modal open onClose={onClose} size="lg" title={editing ? `Edit ${editing.name}` : 'New inventory item'} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={handleSubmit(onSubmit)} loading={saveItem.isPending}>{editing ? 'Save changes' : 'Create item'}</Button></>}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
        <FormSection title="What it is">
          <Input label="Item name" required autoFocus wrapperClassName="sm:col-span-2" error={errors.name?.message} {...register('name')} />
          <Select label="Category" required placeholder="Select category" options={(cats.data ?? []).map((c) => ({ value: c.id, label: `${c.name} (${c.kind.toLowerCase().replace('_', ' ')})` }))} error={errors.categoryId?.message} {...register('categoryId')} />
          <Input label="Item code" placeholder="Auto-generated if empty" error={errors.code?.message} {...register('code')} />
        </FormSection>

        <FormSection title="How it is counted" hint="The stock unit drives every movement, recipe conversion and valuation for this item.">
          <Select label="Stock unit" required placeholder="Select unit" options={(units.data ?? []).map((u) => ({ value: u.id, label: `${u.name} (${u.code})` }))} error={errors.unitId?.message} hint="Unit stock is counted in, e.g. KG, L, BOTTLE" {...register('unitId')} />
          <Input label={`Pack size${unit?.baseUnit === 'PIECE' ? ' (ml / g per piece)' : ''}`} type="number" step="any" min={0} hint="Needed when recipes use ml/g of a bottled/packed item" error={errors.packSize?.message} {...register('packSize')} />
          {!editing && <Input label="Opening stock" type="number" step="any" min={0} hint="Recorded as an OPENING_STOCK movement" error={errors.openingQty?.message} wrapperClassName="sm:col-span-2" {...register('openingQty')} />}
        </FormSection>

        <FormSection title="When to reorder" hint={`Alerts on the inventory dashboard fire against these levels${unit?.code ? `, in ${unit.code}` : ''}.`}>
          <Input label="Minimum quantity" required type="number" step="any" min={0} error={errors.minQty?.message} hint="Low-stock alert below this" {...register('minQty')} />
          <Input label="Reorder level" required type="number" step="any" min={0} error={errors.reorderLevel?.message} hint="Flagged for reordering at or below this" {...register('reorderLevel')} />
          <Input label="Maximum quantity" type="number" step="any" min={0} error={errors.maxQty?.message} hint="Optional ceiling for purchase planning" {...register('maxQty')} />
        </FormSection>

        <FormSection title="Cost and supply">
          <Input label={`Cost price (₹ per ${unit?.code ?? 'unit'})`} required type="number" step="0.01" min={0} error={errors.costPrice?.message} hint="Latest purchase price; the moving average is maintained by receipts" {...register('costPrice')} />
          <Select label="Preferred supplier" placeholder="None" options={(suppliers.data ?? []).map((s) => ({ value: s.id, label: s.name }))} error={errors.supplierId?.message} {...register('supplierId')} />
        </FormSection>

        <FormSection title="Behaviour">
          <Switch checked={watch('allowNegative')} onChange={(v) => setValue('allowNegative', v)} label="Allow negative stock" description="Otherwise sales are blocked when stock runs out." />
          <Switch checked={watch('isActive')} onChange={(v) => setValue('isActive', v)} label="Active" description="Inactive items stay in history but cannot be used." />
        </FormSection>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- categories manager
export function InventoryCategoriesModal({ onClose }: { onClose: () => void }) {
  const cats = useInventoryCategories();
  const { saveCategory } = useInventoryMutations();
  const [editing, setEditing] = useState<InventoryCategory | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<InventoryCategoryInput['kind']>('INGREDIENT');
  const [active, setActive] = useState(true);
  const start = (c: InventoryCategory | null) => { setEditing(c); setName(c?.name ?? ''); setKind(c?.kind ?? 'INGREDIENT'); setActive(c?.isActive ?? true); };
  const submit = async () => { await saveCategory.mutateAsync({ id: editing?.id ?? null, body: { name, kind, isActive: active } }); start(null); };
  return (
    <Modal open onClose={onClose} title="Inventory categories" description="Categories group items for filtering and drive the kind of stock each item is." footer={<Button onClick={onClose}>Done</Button>}>
      <ul className="divide-y divide-neutral-100 rounded-md border border-neutral-200 mb-4">
        {(cats.data ?? []).map((c) => (
          <li key={c.id} className={cn('flex items-center gap-3 px-3 py-2 min-h-touch text-sm', editing?.id === c.id && 'bg-primary-50')}>
            <span className="min-w-0 flex-1">
              <span className="font-medium text-neutral-900">{c.name}</span>{' '}
              <Badge size="sm">{c.kind.replace('_', ' ').toLowerCase()}</Badge>
              {!c.isActive && <Badge size="sm" tone="neutral" className="ml-1">Inactive</Badge>}
            </span>
            <span className="text-caption text-neutral-500 tabular-nums shrink-0">{c.itemCount} item{c.itemCount === 1 ? '' : 's'}</span>
            <IconButton label={`Edit ${c.name}`} size="sm" onClick={() => start(c)}><Pencil className="h-4 w-4" /></IconButton>
          </li>
        ))}
      </ul>
      <div className="well p-3 space-y-3">
        <p className="text-label uppercase text-neutral-600">{editing ? `Edit ${editing.name}` : 'Add category'}</p>
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Select label="Kind" value={kind} onChange={(e) => setKind(e.target.value as InventoryCategoryInput['kind'])} options={['INGREDIENT', 'RAW_MATERIAL', 'BEVERAGE', 'BOTTLE', 'PACKAGING', 'CONSUMABLE'].map((k) => ({ value: k, label: k.replace('_', ' ') }))} />
        <div className="flex items-center justify-between gap-3 flex-wrap"><Switch checked={active} onChange={setActive} label="Active" /><div className="flex gap-2">{editing && <Button variant="ghost" size="sm" onClick={() => start(null)}>Cancel</Button>}<Button size="sm" leftIcon={<Plus className="h-4 w-4" />} disabled={name.trim().length < 2} loading={saveCategory.isPending} onClick={() => void submit()}>{editing ? 'Save' : 'Add'}</Button></div></div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- manual movement
type Direction = 'in' | 'out' | 'both';
const TYPES: { value: ManualMovementType; label: string; hint: string; dir: Direction }[] = [
  { value: 'WASTAGE', label: 'Wastage', hint: 'Spoiled / expired — reduces stock', dir: 'out' },
  { value: 'DAMAGE', label: 'Damage', hint: 'Broken / unusable — reduces stock', dir: 'out' },
  { value: 'ADJUSTMENT', label: 'Adjustment', hint: 'Stock count correction (+ / −)', dir: 'both' },
  { value: 'RETURN', label: 'Return', hint: 'Returned to stock — adds', dir: 'in' },
  { value: 'OPENING_STOCK', label: 'Opening stock', hint: 'Initial count — adds', dir: 'in' },
  { value: 'TRANSFER', label: 'Transfer', hint: 'Between branches / stores (+ / −)', dir: 'both' },
];
const REASON_SUGGESTIONS: Partial<Record<ManualMovementType, string[]>> = {
  WASTAGE: ['Expired', 'Spillage', 'Spoiled in storage', 'Prep trim'],
  DAMAGE: ['Broken in handling', 'Damaged on delivery', 'Equipment failure'],
  ADJUSTMENT: ['Physical count correction', 'Recount after audit'],
  RETURN: ['Returned from kitchen', 'Returned by supplier credit'],
  TRANSFER: ['Transfer to another outlet', 'Transfer received'],
};

export function MovementForm({ onClose, item, defaultType = 'WASTAGE' }: { onClose: () => void; item?: InventoryItem | null; defaultType?: ManualMovementType }) {
  const items = useInventoryItems({});
  const { recordMovement } = useInventoryMutations();
  const [invItemId, setInvItemId] = useState<ID | ''>(item?.id ?? '');
  const [type, setType] = useState<ManualMovementType>(defaultType);
  const [qty, setQty] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const sel = item ?? items.data?.find((i) => i.id === Number(invItemId));
  const meta = TYPES.find((t) => t.value === type)!;
  const signed = meta.dir === 'both';

  // Mirrors the sign the server applies, so the operator sees the resulting balance before saving.
  const entered = Number(qty);
  const effectiveQty = qty !== '' && Number.isFinite(entered)
    ? (meta.dir === 'out' ? -Math.abs(entered) : meta.dir === 'in' ? Math.abs(entered) : entered)
    : 0;
  const after = sel && effectiveQty !== 0 ? Number((sel.currentQty + effectiveQty).toFixed(4)) : null;
  const wouldGoNegative = !!sel && after !== null && after < 0 && !sel.allowNegative;

  const submit = async () => {
    setError(null);
    const q = Number(qty);
    if (!invItemId) { setError('Select an item'); return; }
    if (!q) { setError('Enter a quantity'); return; }
    if (!reason.trim()) { setError('A reason is required (audited)'); return; }
    try { await recordMovement.mutateAsync({ invItemId: Number(invItemId), type, qty: q, unitCost: unitCost ? Number(unitCost) : undefined, reason: reason.trim() }); onClose(); }
    catch (e) { setError(ApiError.from(e).message); }
  };

  const suggestions = REASON_SUGGESTIONS[type] ?? [];

  return (
    <Modal open onClose={onClose} title="Record stock movement" description="Every change creates an auditable transaction — quantities are never overwritten." footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={recordMovement.isPending} onClick={() => void submit()} variant={meta.dir === 'out' ? 'danger' : 'primary'}>Record {meta.label.toLowerCase()}</Button></>}>
      <div className="space-y-4">
        <div>
          <SegmentedControl ariaLabel="Movement type" value={type} onChange={setType} options={TYPES.map((t) => ({ value: t.value, label: t.label }))} />
          <p className="text-caption text-neutral-600 mt-2 inline-flex items-center gap-1.5">
            {meta.dir === 'out' ? <ArrowUpRight className="h-3.5 w-3.5 text-danger-600" aria-hidden />
              : meta.dir === 'in' ? <ArrowDownLeft className="h-3.5 w-3.5 text-success-600" aria-hidden />
                : <ArrowLeftRight className="h-3.5 w-3.5 text-neutral-500" aria-hidden />}
            {meta.hint}
          </p>
        </div>

        {!item && <Select label="Item" required placeholder="Select inventory item" value={invItemId} onChange={(e) => setInvItemId(e.target.value ? Number(e.target.value) : '')} options={(items.data ?? []).map((i) => ({ value: i.id, label: `${i.name} — ${i.currentQty} ${i.unitCode}` }))} />}

        <div className="grid grid-cols-2 gap-4">
          <Input label={`Quantity${sel ? ` (${sel.unitCode})` : ''}${signed ? ' — negative to reduce' : ''}`} required type="number" step="any" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
          {(type === 'OPENING_STOCK' || type === 'RETURN' || type === 'ADJUSTMENT' || type === 'TRANSFER') && <Input label="Unit cost (optional)" type="number" step="0.01" min={0} value={unitCost} onChange={(e) => setUnitCost(e.target.value)} hint="Updates moving average on inbound stock" />}
        </div>

        {/* Before → after, so the effect on the shelf is visible before the movement is saved. */}
        {sel && (
          <div className="well p-3">
            <div className="flex items-center justify-between gap-3 flex-wrap text-sm">
              <span className="text-neutral-600">Stock on hand</span>
              <span className="tabular-nums font-semibold text-neutral-900">{sel.currentQty} {sel.unitCode}</span>
            </div>
            {after !== null && (
              <div className="flex items-center justify-between gap-3 flex-wrap text-sm mt-2 pt-2 border-t border-neutral-200">
                <span className="text-neutral-600 inline-flex items-center gap-1.5">
                  {effectiveQty > 0 ? <ArrowDownLeft className="h-4 w-4 text-success-600" aria-hidden /> : <ArrowUpRight className="h-4 w-4 text-danger-600" aria-hidden />}
                  {effectiveQty > 0 ? 'Adds' : 'Removes'} {Math.abs(effectiveQty)} {sel.unitCode} — balance after
                </span>
                <span className={cn('tabular-nums font-semibold', after < 0 ? 'text-danger-700' : after <= sel.minQty ? 'text-warning-700' : 'text-neutral-900')}>
                  {after} {sel.unitCode}
                  {after >= 0 && after <= sel.minQty && <span className="ml-1.5 text-caption font-normal">below min {sel.minQty}</span>}
                </span>
              </div>
            )}
            <p className="text-caption text-neutral-500 mt-2">Average cost {money(sel.avgCost, { decimals: true })} / {sel.unitCode}</p>
          </div>
        )}
        {wouldGoNegative && (
          <Alert tone="danger" title="This would take stock below zero">
            Negative stock is blocked for {sel?.name}. Reduce the quantity, or enable negative stock on the item first.
          </Alert>
        )}

        <div>
          <Textarea label="Reason" required rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={type === 'WASTAGE' ? 'e.g. expired, spillage' : 'Why is stock changing?'} hint="Stored on the movement and shown in the audit log" />
          {suggestions.length > 0 && (
            <QuickChips className="mt-2" options={suggestions} selected={suggestions.filter((s) => s === reason)} onToggle={(v) => setReason((r) => (r === v ? '' : v))} />
          )}
        </div>
        <InlineError message={error} />
      </div>
    </Modal>
  );
}
