import { useMemo, useState, type ReactNode } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { Plus, Pencil, Trash2, Tag, Clock, CalendarDays, CalendarClock, CalendarX2, PauseCircle, CheckCircle2, X } from 'lucide-react';
import { useOffers, useOfferMutations, useCategories, useMenuItems } from '@/features/menu/hooks';
import { usePermission } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useSurface';
import { PageHeader, Button, IconButton, Modal, ConfirmDialog, Input, Select, Textarea, Switch, Badge, LoadingState, ErrorState, EmptyState, Card, SearchInput, SegmentedControl, FilterChips, ItemImage } from '@/components/ui';
import { Reveal, staggerDelay } from '@/components/motion';
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
          <label key={o.id} className={cn('flex items-center gap-2 rounded-sm px-2 min-h-touch text-sm cursor-pointer', on ? 'bg-primary-50 text-primary-800' : 'hover:bg-neutral-200')}>
            <input type="checkbox" className="h-4 w-4 rounded-sm" checked={on} onChange={() => onChange(on ? value.filter((x) => x !== o.id) : [...value, o.id])} /><span className="truncate">{o.label}</span>
          </label>); })}
      </div>
      {error && <p role="alert" className="text-caption text-danger-700 mt-1">{error}</p>}
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
    <Modal open={open} onClose={onClose} size="lg" title={editing ? `Edit “${editing.name}”` : 'New offer'} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={handleSubmit(onSubmit)} loading={save.isPending}>{editing ? 'Save changes' : 'Create offer'}</Button></>}>
      <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 sm:grid-cols-2 gap-4" noValidate>
        <Input label="Offer name" required autoFocus wrapperClassName="sm:col-span-2" error={errors.name?.message} {...register('name')} />
        <Select label="Offer type" required options={[{ value: 'PERCENTAGE', label: 'Percentage discount' }, { value: 'FLAT', label: 'Flat discount' }, { value: 'BOGO', label: 'Buy one get one' }, { value: 'COMBO', label: 'Combo offer' }, { value: 'HAPPY_HOUR', label: 'Happy hour (percentage, time-bound)' }]} {...register('offerType')} />
        {valueLabel ? <Input label={valueLabel} required type="number" step="0.01" min={0} error={errors.discountValue?.message} {...register('discountValue')} /> : <div className="text-sm text-neutral-500 self-end pb-2">Every second unit is free.</div>}
        <Input label="Max discount amount (₹)" hint="Optional cap per line" type="number" step="1" min={0} error={errors.maxDiscountAmount?.message} {...register('maxDiscountAmount')} />
        <Textarea label="Description" wrapperClassName="sm:col-span-2" rows={2} error={errors.description?.message} {...register('description')} />
        <div className="sm:col-span-2">
          <p className="text-label text-neutral-700 mb-1.5">Applies to</p>
          <SegmentedControl ariaLabel="What the offer applies to" value={applies} onChange={(v) => setValue('appliesTo', v)} options={[{ value: 'ALL', label: 'Whole menu' }, { value: 'CATEGORIES', label: 'Categories' }, { value: 'ITEMS', label: 'Specific items' }]} />
          {applies === 'CATEGORIES' && <div className="mt-3"><Controller control={control} name="categoryIds" render={({ field }) => <CheckGrid options={(cats.data ?? []).map((c) => ({ id: c.id, label: c.name }))} value={field.value} onChange={field.onChange} error={errors.categoryIds?.message} />} /></div>}
          {applies === 'ITEMS' && <div className="mt-3"><Controller control={control} name="itemIds" render={({ field }) => <CheckGrid options={(items.data ?? []).map((i) => ({ id: i.id, label: `${i.name} · ${money(i.price)}` }))} value={field.value} onChange={field.onChange} error={errors.itemIds?.message} />} /></div>}
        </div>
        <Input label="Start date" required type="date" error={errors.startDate?.message} {...register('startDate')} />
        <Input label="End date" required type="date" error={errors.endDate?.message} {...register('endDate')} />
        <Input label="Start time" type="time" hint="Leave empty for all day" error={errors.startTime?.message} {...register('startTime')} />
        <Input label="End time" type="time" error={errors.endTime?.message} {...register('endTime')} />
        <div className="sm:col-span-2">
          <p className="text-label text-neutral-700 mb-1.5">Days of week <span className="font-normal text-neutral-500">(none = every day)</span></p>
          <div className="flex flex-wrap gap-1.5">{DAYS.map((d) => { const on = days.includes(d.v); return <button key={d.v} type="button" aria-pressed={on} onClick={() => setValue('daysOfWeek', on ? days.filter((x) => x !== d.v) : [...days, d.v].sort())} className={cn('min-h-touch min-w-touch px-3 rounded-sm border text-sm font-medium transition-colors duration-control', on ? 'bg-primary-500 border-primary-400 text-on-primary' : 'bg-surface border-neutral-300 text-neutral-800 hover:border-neutral-400')}>{d.l}</button>; })}</div>
        </div>
        <Switch checked={watch('isActive')} onChange={(v) => setValue('isActive', v)} label="Active" description="Offers only show to customers while active and within schedule." />
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- life cycle

/** Where an offer sits in its life cycle, using only fields the offers query already returns. */
type Phase = 'LIVE' | 'IDLE' | 'SCHEDULED' | 'PAUSED' | 'FINISHED';

function phaseOf(o: Offer, today: string): Phase {
  if (!o.isActive) return 'PAUSED';
  if (o.endDate < today) return 'FINISHED';
  if (o.startDate > today) return 'SCHEDULED';
  // Inside its dates: the server decides whether the time-of-day / day-of-week window is open now.
  return o.isCurrentlyActive ? 'LIVE' : 'IDLE';
}

const PHASE_META: Record<Phase, { label: string; tone: 'success' | 'info' | 'primary' | 'warning' | 'neutral'; icon: ReactNode }> = {
  LIVE:      { label: 'Running now',       tone: 'success', icon: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> },
  IDLE:      { label: 'Outside its hours', tone: 'info',    icon: <Clock className="h-3.5 w-3.5" aria-hidden /> },
  SCHEDULED: { label: 'Scheduled',         tone: 'primary', icon: <CalendarClock className="h-3.5 w-3.5" aria-hidden /> },
  PAUSED:    { label: 'Paused',            tone: 'warning', icon: <PauseCircle className="h-3.5 w-3.5" aria-hidden /> },
  FINISHED:  { label: 'Finished',          tone: 'neutral', icon: <CalendarX2 className="h-3.5 w-3.5" aria-hidden /> },
};

type GroupKey = 'LIVE' | 'UPCOMING' | 'OFF' | 'ENDED';

const GROUPS: { key: GroupKey; title: string; phases: Phase[] }[] = [
  { key: 'LIVE',     title: 'Running now', phases: ['LIVE'] },
  { key: 'UPCOMING', title: 'Scheduled',   phases: ['SCHEDULED'] },
  { key: 'OFF',      title: 'Not running', phases: ['IDLE', 'PAUSED'] },
  { key: 'ENDED',    title: 'Finished',    phases: ['FINISHED'] },
];

/** 'YYYY-MM-DD' rendered in the venue's own calendar — parsed as a local date, never as UTC. */
function fmtDay(d: string): string {
  const [y, m, dd] = d.split('-').map(Number);
  if (!y || !m || !dd) return d;
  return format(new Date(y, m - 1, dd), 'd MMM yyyy');
}

export default function OffersPage() {
  const ws = useWorkspace();
  const canManage = usePermission('offers:manage');
  const offers = useOffers(true);
  const cats = useCategories(true);
  const { remove, save } = useOfferMutations();
  const [editing, setEditing] = useState<Offer | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Offer | null>(null);
  const [group, setGroup] = useState<'ALL' | GroupKey>('ALL');
  const [search, setSearch] = useState('');

  const today = todayInput();
  const all = useMemo(() => offers.data ?? [], [offers.data]);
  const phases = useMemo(() => new Map(all.map((o) => [o.id, phaseOf(o, today)] as const)), [all, today]);
  const countFor = (g: GroupKey) => all.filter((o) => GROUPS.find((x) => x.key === g)!.phases.includes(phases.get(o.id)!)).length;

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((o) => o.name.toLowerCase().includes(q) || (o.description ?? '').toLowerCase().includes(q));
  }, [all, search]);

  /** Section rows, sorted by what the reader needs first: ending soonest, starting soonest, most recent. */
  const sectionRows = (g: GroupKey) => {
    const def = GROUPS.find((x) => x.key === g)!;
    const rows = matches.filter((o) => def.phases.includes(phases.get(o.id)!));
    return [...rows].sort((a, b) => {
      if (g === 'LIVE') return a.endDate.localeCompare(b.endDate) || a.name.localeCompare(b.name);
      if (g === 'UPCOMING') return a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name);
      if (g === 'ENDED') return b.endDate.localeCompare(a.endDate) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
  };

  /* One list, in life-cycle order: what is running now, then what is coming, then what is off and
     what has ended. Each group keeps the sort it was always given. */
  const rows = group === 'ALL' ? GROUPS.flatMap((g) => sectionRows(g.key)) : sectionRows(group);
  const groupOptions: { value: 'ALL' | GroupKey; label: string; count: number }[] = [
    { value: 'ALL', label: 'All offers', count: all.length },
    ...GROUPS.map((g) => ({ value: g.key, label: g.title, count: countFor(g.key) })),
  ];
  const filtered = group !== 'ALL' || !!search.trim();
  const clearFilters = () => { setGroup('ALL'); setSearch(''); };

  const catName = (id: number) => cats.data?.find((c) => c.id === id)?.name ?? '';
  const appliesLabel = (o: Offer) => {
    if (o.appliesTo === 'ALL') return 'the whole menu';
    if (o.appliesTo === 'ITEMS') return `${o.itemIds.length} specific item${o.itemIds.length === 1 ? '' : 's'}`;
    const names = o.categoryIds.map(catName).filter(Boolean);
    return names.length ? names.join(', ') : `${o.categoryIds.length} categor${o.categoryIds.length === 1 ? 'y' : 'ies'}`;
  };
  const daysLabel = (o: Offer) => (o.daysOfWeek.length ? [...o.daysOfWeek].sort((a, b) => a - b).map((d) => DAYS[d - 1]?.l).filter(Boolean).join(', ') : 'Every day');
  const hoursLabel = (o: Offer) => (o.startTime || o.endTime ? `${o.startTime ?? '00:00'} – ${o.endTime ?? '23:59'}` : 'All day');

  /*
   * Pausing an offer from the list is the same save the dialog performs, with exactly the payload
   * shape it sends and only `isActive` different — no second endpoint, no partial write.
   */
  const toggleActive = (o: Offer, isActive: boolean) => {
    const body: OfferInput = {
      name: o.name, description: o.description ?? undefined, offerType: o.offerType, discountValue: o.discountValue,
      maxDiscountAmount: o.maxDiscountAmount ?? null, appliesTo: o.appliesTo, categoryIds: o.categoryIds, itemIds: o.itemIds,
      startDate: o.startDate, endDate: o.endDate, startTime: o.startTime ?? null, endTime: o.endTime ?? null,
      daysOfWeek: o.daysOfWeek, isActive,
    };
    save.mutate({ id: o.id, body });
  };
  const savingId = save.isPending ? save.variables?.id : undefined;

  const openNew = () => { setEditing(null); setFormOpen(true); };

  /** One compact, image-led row — the reference's offers list. */
  const offerRow = (o: Offer) => {
    const phase = phases.get(o.id)!;
    const meta = PHASE_META[phase];
    const schedule = (
      <>
        <span className="flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden /><span className="sr-only">Dates: </span>
          {fmtDay(o.startDate)} → {fmtDay(o.endDate)}
        </span>
        <span className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden /><span className="sr-only">Hours: </span>
          {hoursLabel(o)} · {daysLabel(o)}
        </span>
      </>
    );
    return (
      <li key={o.id} className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3', phase === 'FINISHED' && 'bg-neutral-50')}>
        {/* The venue has no offer photography, so the tile is this offer's own drawing — the same
            picture wherever the offer appears, and unmistakably an illustration. */}
        <ItemImage src={null} alt={o.name} className="h-14 w-14 shrink-0" rounded="rounded-md" />

        <div className="min-w-0 flex-1 basis-44">
          <p className="text-sm font-semibold text-neutral-900 truncate">{o.name}</p>
          <p className="text-caption text-neutral-500 truncate">
            <span className="text-neutral-700 font-medium">{offerLabel(o)}</span> on {appliesLabel(o)}
            {o.maxDiscountAmount ? ` · capped at ${money(o.maxDiscountAmount)} per line` : ''}
          </p>
        </div>

        <div className="hidden lg:flex lg:w-60 shrink-0 flex-col gap-0.5 text-caption text-neutral-600 min-w-0">{schedule}</div>

        <div className="flex items-center gap-2 shrink-0 ml-auto">
          <Badge tone={meta.tone} size="sm" icon={meta.icon}>{meta.label}</Badge>
          {canManage && (
            <>
              <Switch
                size="sm"
                checked={o.isActive}
                disabled={savingId === o.id}
                ariaLabel={`${o.name} — active`}
                onChange={(v) => toggleActive(o, v)}
              />
              <IconButton label={`Edit ${o.name}`} size="sm" onClick={() => { setEditing(o); setFormOpen(true); }}><Pencil className="h-4 w-4" /></IconButton>
              <IconButton label={`Delete ${o.name}`} size="sm" className="text-danger-700" onClick={() => setToDelete(o)}><Trash2 className="h-4 w-4" /></IconButton>
            </>
          )}
        </div>

        {/* Below `lg` the schedule takes its own line rather than squeezing the row. */}
        <div className="basis-full lg:hidden flex flex-col gap-0.5 text-caption text-neutral-600 min-w-0">{schedule}</div>
      </li>
    );
  };

  /**
   * THE MANAGER BOARD (panel 14) — the same offers as image-led lifecycle CARDS, two up.
   *
   * WHAT IS DRAWN AND WHY.
   *  · The picture is the offer's own deterministic drawing. The venue has no offer photography
   *    and none was invented.
   *  · The "channel chips" the board paints are the offer's REACH, because that is the facet this
   *    product records. `Offer` has no channel field — no dine-in / takeaway / delivery split
   *    exists anywhere in the schema — so the chips carry what the record actually holds: the
   *    scope it applies to, its hours and the days of the week it runs. Inventing three marketing
   *    channels would have been a claim about the business.
   *  · The board finishes each card with two figures, total sales and redemptions. **The offers
   *    API returns neither** (`Offer` carries no usage, redemption or revenue field, and no
   *    endpoint reports one), so the figures are dropped rather than fabricated. The card ends on
   *    the real terms instead.
   */
  const offerCard = (o: Offer, i: number) => {
    const phase = phases.get(o.id)!;
    const meta = PHASE_META[phase];
    const chips = [
      o.appliesTo === 'ALL' ? 'Whole menu' : o.appliesTo === 'ITEMS' ? `${o.itemIds.length} item${o.itemIds.length === 1 ? '' : 's'}` : `${o.categoryIds.length} categor${o.categoryIds.length === 1 ? 'y' : 'ies'}`,
      hoursLabel(o),
      daysLabel(o),
    ];
    return (
      <Reveal as="li" key={o.id} delay={staggerDelay(i)} className="min-w-0">
        <Card padded={false} className={cn('h-full flex flex-col overflow-hidden', phase === 'FINISHED' && 'bg-neutral-50')}>
          <div className="flex gap-4 p-4 min-w-0">
            {/* Photo left, exactly as the board lays the card out. */}
            <ItemImage src={null} alt={o.name} className="h-24 w-24 sm:h-28 sm:w-28 shrink-0" rounded="rounded-md" />

            <div className="min-w-0 flex-1 flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-subheading text-neutral-900 leading-snug break-words min-w-0">{o.name}</h3>
                <Badge tone={meta.tone} size="sm" icon={meta.icon} className="shrink-0">{meta.label}</Badge>
              </div>

              {/* One line of real terms, from the offer's own type, value, scope and cap. */}
              <p className="text-sm text-neutral-600 mt-1.5 leading-snug break-words">
                <span className="font-medium text-neutral-900">{offerLabel(o)}</span> on {appliesLabel(o)}
                {o.maxDiscountAmount ? ` · capped at ${money(o.maxDiscountAmount)} per line` : ''}
              </p>

              <p className="mt-2 flex items-center gap-1.5 text-caption text-neutral-700 tabular-nums">
                <CalendarDays className="h-3.5 w-3.5 shrink-0 text-neutral-400" aria-hidden />
                <span className="sr-only">Runs from </span>{fmtDay(o.startDate)}
                <span aria-hidden>→</span><span className="sr-only"> to </span>{fmtDay(o.endDate)}
              </p>

              <ul className="mt-2.5 flex flex-wrap gap-1.5">
                {chips.map((c, ci) => (
                  <li key={`${ci}-${c}`}><Badge size="sm" tone="neutral">{c}</Badge></li>
                ))}
              </ul>
            </div>
          </div>

          {canManage && (
            <div className="mt-auto border-t border-neutral-200 px-3 py-2 flex items-center justify-between gap-2">
              <Switch
                size="sm"
                checked={o.isActive}
                disabled={savingId === o.id}
                ariaLabel={`${o.name} — active`}
                onChange={(v) => toggleActive(o, v)}
              />
              <span className="flex items-center gap-1">
                <IconButton label={`Edit ${o.name}`} size="sm" onClick={() => { setEditing(o); setFormOpen(true); }}><Pencil className="h-4 w-4" /></IconButton>
                <IconButton label={`Delete ${o.name}`} size="sm" className="text-danger-700" onClick={() => setToDelete(o)}><Trash2 className="h-4 w-4" /></IconButton>
              </span>
            </div>
          )}
        </Card>
      </Reveal>
    );
  };

  return (
    <div>
      <PageHeader
        title="Offers"
        subtitle="Discounts, happy hours and combos — the best applicable offer is applied per item on the bill"
        actions={canManage && <Button leftIcon={<Plus className="h-4 w-4" />} onClick={openNew}>Create offer</Button>}
      >
        {all.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <FilterChips
              ariaLabel="Filter offers by where they are in their life cycle"
              value={group} onChange={setGroup}
              options={groupOptions}
            />
            <SearchInput value={search} onChange={setSearch} placeholder="Offer name or description" className="sm:ml-auto sm:w-64" />
          </div>
        )}
      </PageHeader>

      {offers.isLoading && <LoadingState variant="list" rows={6} />}
      {offers.isError && <ErrorState error={offers.error} onRetry={() => void offers.refetch()} />}

      {offers.data && (all.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            icon={<Tag className="h-6 w-6" />}
            title="No offers yet"
            description="Create a happy hour, a BOGO deal or a percentage discount. Offers apply themselves to bills while they are running."
            action={canManage ? <Button leftIcon={<Plus className="h-4 w-4" />} onClick={openNew}>Create offer</Button> : undefined}
          />
        </Card>
      ) : rows.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            compact icon={<Tag className="h-6 w-6" />}
            title="No offers match"
            description={search.trim() ? `Nothing matches “${search.trim()}” in this part of the life cycle.` : 'No offer is in this part of the life cycle right now.'}
            action={<Button variant="outline" leftIcon={<X className="h-4 w-4" />} onClick={clearFilters}>Show all offers</Button>}
          />
        </Card>
      ) : ws === 'manager' ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <p className="text-sm text-neutral-600">
              <span className="font-semibold text-neutral-900 tabular-nums">{rows.length}</span>
              {filtered ? <> of {all.length}</> : null} offer{rows.length === 1 ? '' : 's'}
              {group === 'ALL' ? <span className="text-neutral-500"> · running now first</span> : null}
            </p>
            {filtered && <Button size="sm" variant="ghost" leftIcon={<X className="h-4 w-4" />} onClick={clearFilters}>Clear filters</Button>}
          </div>
          {/* Two up, with a base `grid-cols-1` and a `minmax(0,1fr)` track — a bare `1fr` floors
              at the widest offer name and drags the grid past a 360 px viewport. */}
          <ul className="grid grid-cols-1 lg:grid-cols-[repeat(2,minmax(0,1fr))] gap-4">{rows.map(offerCard)}</ul>
        </>
      ) : (
        <Card padded={false}>
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-neutral-200">
            <p className="text-sm text-neutral-600">
              <span className="font-semibold text-neutral-900 tabular-nums">{rows.length}</span>
              {filtered ? <> of {all.length}</> : null} offer{rows.length === 1 ? '' : 's'}
              {group === 'ALL' ? <span className="text-neutral-500"> · running now first</span> : null}
            </p>
            {filtered && <Button size="sm" variant="ghost" leftIcon={<X className="h-4 w-4" />} onClick={clearFilters}>Clear filters</Button>}
          </div>
          <ul className="divide-y divide-neutral-200">{rows.map(offerRow)}</ul>
        </Card>
      ))}

      {formOpen && <OfferForm open onClose={() => { setFormOpen(false); setEditing(null); }} editing={editing} />}
      <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} variant="danger" title={`Delete “${toDelete?.name}”?`} message="Bills already generated keep their discounts." confirmLabel="Delete" loading={remove.isPending} onConfirm={async () => { if (toDelete) { try { await remove.mutateAsync(toDelete.id); } finally { setToDelete(null); } } }} />
    </div>
  );
}
