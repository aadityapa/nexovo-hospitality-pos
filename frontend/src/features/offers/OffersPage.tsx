import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, Trash2, Tag, Clock, CalendarDays } from 'lucide-react';
import { useOffers, useOfferMutations, useCategories, useMenuItems } from '@/features/menu/hooks';
import { usePermission } from '@/hooks/useAuth';
import { PageHeader, Button, IconButton, Modal, ConfirmDialog, Input, Select, Textarea, Switch, Badge, LoadingState, ErrorState, EmptyState, Card, SegmentedControl } from '@/components/ui';
import { ApiError } from '@/services/api/client';
import { offerLabel } from '@/utils/offers';
import { money } from '@/utils/money';
import { todayInput } from '@/utils/date';
import { cn } from '@/utils/cn';
import type { Offer, OfferInput } from '@/types';

const DAYS = [{ v: 1, l: 'Mon' }, { v: 2, l: 'Tue' }, { v: 3, l: 'Wed' }, { v: 4, l: 'Thu' }, { v: 5, l: 'Fri' }, { v: 6, l: 'Sat' }, { v: 7, l: 'Sun' }];

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().max(400).optional(),
  offerType: z.enum(['PERCENTAGE', 'FLAT', 'BOGO', 'COMBO', 'HAPPY_HOUR']),
  discountValue: z.coerce.number().min(0),
  maxDiscountAmount: z.coerce.number().min(0).optional(),
  appliesTo: z.enum(['ALL', 'CATEGORIES', 'ITEMS']),
  categoryIds: z.array(z.number()),
  itemIds: z.array(z.number()),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  daysOfWeek: z.array(z.number()),
  isActive: z.boolean(),
}).superRefine((v, ctx) => {
  if (v.endDate < v.startDate) ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'End date must be on or after start date' });
  if (['PERCENTAGE', 'HAPPY_HOUR'].includes(v.offerType) && (v.discountValue <= 0 || v.discountValue > 100)) ctx.addIssue({ code: 'custom', path: ['discountValue'], message: 'Enter 1–100 %' });
  if (['FLAT', 'COMBO'].includes(v.offerType) && v.discountValue <= 0) ctx.addIssue({ code: 'custom', path: ['discountValue'], message: 'Enter an amount greater than 0' });
  if (v.appliesTo === 'CATEGORIES' && v.categoryIds.length === 0) ctx.addIssue({ code: 'custom', path: ['categoryIds'], message: 'Select at least one category' });
  if (v.appliesTo === 'ITEMS' && v.itemIds.length === 0) ctx.addIssue({ code: 'custom', path: ['itemIds'], message: 'Select at least one item' });
  if (v.startTime && v.endTime && v.endTime < v.startTime) ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'End time must be after start time' });
});
type Form = z.infer<typeof schema>;

function CheckGrid({ options, value, onChange, error }: { options: { id: number; label: string }[]; value: number[]; onChange: (v: number[]) => void; error?: string }) {
  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto rounded-sm border border-neutral-200 p-2">
        {options.map((o) => { const on = value.includes(o.id); return (
          <label key={o.id} className={cn('flex items-center gap-2 rounded-sm px-2 min-h-[36px] text-sm cursor-pointer', on ? 'bg-primary-50 text-primary-800' : 'hover:bg-neutral-50')}>
            <input type="checkbox" className="h-4 w-4 rounded-sm" checked={on} onChange={() => onChange(on ? value.filter((x) => x !== o.id) : [...value, o.id])} /><span className="truncate">{o.label}</span>
          </label>); })}
      </div>
      {error && <p role="alert" className="text-caption text-danger-600 mt-1">{error}</p>}
    </div>
  );
}

function OfferForm({ open, onClose, editing }: { open: boolean; onClose: () => void; editing: Offer | null }) {
  const cats = useCategories(true);
  const items = useMenuItems({ includeInactive: false });
  const { save } = useOfferMutations();
  const { register, handleSubmit, watch, setValue, control, setError, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    values: {
      name: editing?.name ?? '', description: editing?.description ?? '', offerType: editing?.offerType ?? 'PERCENTAGE', discountValue: editing?.discountValue ?? 10, maxDiscountAmount: editing?.maxDiscountAmount ?? undefined,
      appliesTo: editing?.appliesTo ?? 'ALL', categoryIds: editing?.categoryIds ?? [], itemIds: editing?.itemIds ?? [], startDate: editing?.startDate ?? todayInput(), endDate: editing?.endDate ?? todayInput(),
      startTime: editing?.startTime ?? '', endTime: editing?.endTime ?? '', daysOfWeek: editing?.daysOfWeek ?? [], isActive: editing?.isActive ?? true,
    },
  });
  const type = watch('offerType'); const applies = watch('appliesTo'); const days = watch('daysOfWeek');
  const onSubmit = async (v: Form) => {
    const body: OfferInput = { ...v, description: v.description || undefined, maxDiscountAmount: v.maxDiscountAmount || null, startTime: v.startTime || null, endTime: v.endTime || null };
    try { await save.mutateAsync({ id: editing?.id ?? null, body }); onClose(); }
    catch (e) { const err = ApiError.from(e); const f = err.errors.find((x) => x.field)?.field as keyof Form | undefined; if (f) setError(f, { message: err.message }); }
  };
  const valueLabel = type === 'BOGO' ? null : ['PERCENTAGE', 'HAPPY_HOUR'].includes(type) ? 'Discount (%)' : type === 'FLAT' ? 'Discount per unit (₹)' : 'Combo discount (₹)';
  return (
    <Modal open={open} onClose={onClose} size="lg" title={editing ? 'Edit offer' : 'New offer'} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={handleSubmit(onSubmit)} loading={save.isPending}>{editing ? 'Save changes' : 'Create offer'}</Button></>}>
      <form onSubmit={handleSubmit(onSubmit)} className="grid sm:grid-cols-2 gap-4" noValidate>
        <Input label="Offer name" required autoFocus wrapperClassName="sm:col-span-2" error={errors.name?.message} {...register('name')} />
        <Select label="Offer type" required options={[{ value: 'PERCENTAGE', label: 'Percentage discount' }, { value: 'FLAT', label: 'Flat discount' }, { value: 'BOGO', label: 'Buy one get one' }, { value: 'COMBO', label: 'Combo offer' }, { value: 'HAPPY_HOUR', label: 'Happy hour (percentage, time-bound)' }]} {...register('offerType')} />
        {valueLabel ? <Input label={valueLabel} required type="number" step="0.01" min={0} error={errors.discountValue?.message} {...register('discountValue')} /> : <div className="text-sm text-neutral-500 self-end pb-2">Every second unit is free.</div>}
        <Input label="Max discount amount (₹)" hint="Optional cap per line" type="number" step="1" min={0} error={errors.maxDiscountAmount?.message} {...register('maxDiscountAmount')} />
        <Textarea label="Description" wrapperClassName="sm:col-span-2" rows={2} error={errors.description?.message} {...register('description')} />
        <div className="sm:col-span-2">
          <p className="text-label text-neutral-700 mb-1.5">Applies to</p>
          <SegmentedControl value={applies} onChange={(v) => setValue('appliesTo', v)} options={[{ value: 'ALL', label: 'Whole menu' }, { value: 'CATEGORIES', label: 'Categories' }, { value: 'ITEMS', label: 'Specific items' }]} />
          {applies === 'CATEGORIES' && <div className="mt-3"><Controller control={control} name="categoryIds" render={({ field }) => <CheckGrid options={(cats.data ?? []).map((c) => ({ id: c.id, label: c.name }))} value={field.value} onChange={field.onChange} error={errors.categoryIds?.message} />} /></div>}
          {applies === 'ITEMS' && <div className="mt-3"><Controller control={control} name="itemIds" render={({ field }) => <CheckGrid options={(items.data ?? []).map((i) => ({ id: i.id, label: `${i.name} · ${money(i.price)}` }))} value={field.value} onChange={field.onChange} error={errors.itemIds?.message} />} /></div>}
        </div>
        <Input label="Start date" required type="date" error={errors.startDate?.message} {...register('startDate')} />
        <Input label="End date" required type="date" error={errors.endDate?.message} {...register('endDate')} />
        <Input label="Start time" type="time" hint="Leave empty for all day" error={errors.startTime?.message} {...register('startTime')} />
        <Input label="End time" type="time" error={errors.endTime?.message} {...register('endTime')} />
        <div className="sm:col-span-2">
          <p className="text-label text-neutral-700 mb-1.5">Days of week <span className="font-normal text-neutral-500">(none = every day)</span></p>
          <div className="flex flex-wrap gap-1.5">{DAYS.map((d) => { const on = days.includes(d.v); return <button key={d.v} type="button" aria-pressed={on} onClick={() => setValue('daysOfWeek', on ? days.filter((x) => x !== d.v) : [...days, d.v].sort())} className={cn('min-h-[40px] px-3 rounded-sm border text-sm font-medium', on ? 'bg-primary-800 border-primary-800 text-white' : 'bg-white border-neutral-300')}>{d.l}</button>; })}</div>
        </div>
        <Switch checked={watch('isActive')} onChange={(v) => setValue('isActive', v)} label="Active" description="Offers only show to customers while active and within schedule." />
      </form>
    </Modal>
  );
}

export default function OffersPage() {
  const canManage = usePermission('offers:manage');
  const offers = useOffers(true);
  const cats = useCategories(true);
  const { remove } = useOfferMutations();
  const [editing, setEditing] = useState<Offer | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Offer | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'LIVE' | 'INACTIVE'>('ALL');
  const list = (offers.data ?? []).filter((o) => filter === 'ALL' || (filter === 'LIVE' ? o.isCurrentlyActive : !o.isActive));
  const catName = (id: number) => cats.data?.find((c) => c.id === id)?.name ?? '';

  return (
    <div>
      <PageHeader title="Offers" subtitle="Discounts, happy hours and combos — the best applicable offer is applied per item on the bill" actions={canManage && <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setFormOpen(true); }}>New offer</Button>}>
        <SegmentedControl size="sm" value={filter} onChange={setFilter} options={[{ value: 'ALL', label: 'All', count: offers.data?.length }, { value: 'LIVE', label: 'Live now', count: offers.data?.filter((o) => o.isCurrentlyActive).length }, { value: 'INACTIVE', label: 'Inactive' }]} />
      </PageHeader>
      {offers.isLoading && <LoadingState variant="cards" rows={2} />}
      {offers.isError && <ErrorState error={offers.error} onRetry={() => void offers.refetch()} />}
      {offers.data && (list.length === 0 ? <Card><EmptyState icon={<Tag className="h-6 w-6" />} title="No offers" description="Create happy hours, BOGO deals or percentage discounts." action={canManage && <Button onClick={() => setFormOpen(true)}>New offer</Button>} /></Card> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((o) => (
            <Card key={o.id} className="flex flex-col">
              <div className="flex items-start gap-3">
                <span className={cn('h-10 w-10 rounded-md flex items-center justify-center shrink-0', o.isCurrentlyActive ? 'bg-success-50 text-success-600' : 'bg-neutral-100 text-neutral-500')}><Tag className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold truncate">{o.name}</h3>
                  <p className="text-sm text-neutral-500 line-clamp-2">{o.description}</p>
                </div>
                {canManage && <div className="flex gap-1"><IconButton label="Edit" size="sm" onClick={() => { setEditing(o); setFormOpen(true); }}><Pencil className="h-4 w-4" /></IconButton><IconButton label="Delete" size="sm" className="text-danger-600" onClick={() => setToDelete(o)}><Trash2 className="h-4 w-4" /></IconButton></div>}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge tone="primary">{offerLabel(o)}</Badge>
                {o.isCurrentlyActive ? <Badge tone="success">Live now</Badge> : o.isActive ? <Badge tone="warning">Scheduled</Badge> : <Badge tone="neutral">Inactive</Badge>}
                {o.maxDiscountAmount ? <Badge>Max {money(o.maxDiscountAmount)}</Badge> : null}
              </div>
              <dl className="mt-3 text-caption text-neutral-600 space-y-1">
                <div className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{o.startDate} → {o.endDate}{o.daysOfWeek.length ? ` · ${o.daysOfWeek.map((d) => DAYS[d - 1]?.l).join(', ')}` : ''}</div>
                {(o.startTime || o.endTime) && <div className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{o.startTime ?? '00:00'} – {o.endTime ?? '23:59'}</div>}
                <div>{o.appliesTo === 'ALL' ? 'Whole menu' : o.appliesTo === 'CATEGORIES' ? o.categoryIds.map(catName).filter(Boolean).join(', ') : `${o.itemIds.length} specific item(s)`}</div>
              </dl>
            </Card>
          ))}
        </div>
      ))}
      {formOpen && <OfferForm open onClose={() => setFormOpen(false)} editing={editing} />}
      <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} variant="danger" title={`Delete “${toDelete?.name}”?`} message="Bills already generated keep their discounts." confirmLabel="Delete" loading={remove.isPending} onConfirm={async () => { if (toDelete) { try { await remove.mutateAsync(toDelete.id); } finally { setToDelete(null); } } }} />
    </div>
  );
}
