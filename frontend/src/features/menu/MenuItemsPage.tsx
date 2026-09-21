import { useMemo, useState, useRef, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, Trash2, ImagePlus, ChefHat, Wine, Leaf, Star, EyeOff, X, UtensilsCrossed } from 'lucide-react';
import { useCategories, useMenuItems, useItemMutations, useTaxGroups } from './hooks';
import { usePermission } from '@/hooks/useAuth';
import { useDebounce } from '@/hooks/useRealtime';
import { PageHeader, Button, IconButton, Modal, ConfirmDialog, Input, Select, Textarea, Switch, Badge, LoadingState, ErrorState, EmptyState, Card, SearchInput, SegmentedControl, FilterChips, Alert, ItemImage, FilterSelect } from '@/components/ui';
import { HeaderSearch } from '@/components/layout/Shell';
import { staggerDelay } from '@/components/motion';
import { ApiError } from '@/services/api/client';
import { money } from '@/utils/money';
import { cn } from '@/utils/cn';
import type { MenuItem, MenuItemInput, PrepLocation } from '@/types';

const schema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(150),
  code: z.string().trim().max(30).optional(),
  description: z.string().max(600).optional(),
  categoryId: z.coerce.number().int().positive('Select a category'),
  price: z.coerce.number().min(0, 'Price cannot be negative').max(9_999_999),
  prepLocation: z.enum(['KITCHEN', 'BAR']),
  taxGroupId: z.coerce.number().int().positive('Select a tax group'),
  imageUrl: z.string().optional(),
  isVeg: z.boolean(), isPopular: z.boolean(), isAvailable: z.boolean(), isActive: z.boolean(),
  tags: z.string().max(300).optional(),
});
type Form = z.infer<typeof schema>;

function ItemForm({ open, onClose, editing }: { open: boolean; onClose: () => void; editing: MenuItem | null }) {
  const cats = useCategories(true);
  const taxes = useTaxGroups();
  const { save } = useItemMutations();
  const fileRef = useRef<HTMLInputElement>(null);
  const { register, handleSubmit, watch, setValue, setError, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    values: {
      name: editing?.name ?? '', code: editing?.code ?? '', description: editing?.description ?? '', categoryId: editing?.categoryId ?? 0, price: editing?.price ?? 0,
      prepLocation: editing?.prepLocation ?? 'KITCHEN', taxGroupId: editing?.taxGroupId ?? (taxes.data?.[0]?.id ?? 0), imageUrl: editing?.imageUrl ?? '',
      isVeg: editing?.isVeg ?? false, isPopular: editing?.isPopular ?? false, isAvailable: editing?.isAvailable ?? true, isActive: editing?.isActive ?? true, tags: editing?.tags ?? '',
    },
  });
  const imageUrl = watch('imageUrl');
  const onPickFile = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 1.5 * 1024 * 1024) { setError('imageUrl', { message: 'Image must be under 1.5 MB' }); return; }
    const r = new FileReader(); r.onload = () => setValue('imageUrl', String(r.result)); r.readAsDataURL(f);   // mock: data URL; ORDS: replace with upload endpoint
  };
  const onCategoryChange = (id: number) => { const c = cats.data?.find((x) => x.id === id); if (c && !editing) setValue('prepLocation', c.prepLocation); };
  const onSubmit = async (v: Form) => {
    const body: MenuItemInput = { ...v, code: v.code || undefined, description: v.description || undefined, imageUrl: v.imageUrl || undefined, tags: v.tags || undefined };
    try { await save.mutateAsync({ id: editing?.id ?? null, body }); onClose(); }
    catch (e) { const err = ApiError.from(e); const f = err.errors.find((x) => x.field)?.field as keyof Form | undefined; if (f) setError(f, { message: err.message }); }
  };
  return (
    <Modal open={open} onClose={onClose} size="lg" title={editing ? 'Edit menu item' : 'New menu item'} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={handleSubmit(onSubmit)} loading={save.isPending}>{editing ? 'Save changes' : 'Create item'}</Button></>}>
      <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 sm:grid-cols-2 gap-4" noValidate>
        <Input label="Item name" required autoFocus wrapperClassName="sm:col-span-2" error={errors.name?.message} {...register('name')} />
        <Select label="Category" required placeholder="Select category" options={(cats.data ?? []).map((c) => ({ value: c.id, label: c.name + (c.isActive ? '' : ' (inactive)') }))} error={errors.categoryId?.message} {...register('categoryId', { onChange: (e) => onCategoryChange(Number(e.target.value)) })} />
        <Input label="Price (₹)" required type="number" step="0.01" min={0} inputMode="decimal" error={errors.price?.message} hint={editing ? 'Price changes are recorded in history; past orders keep their snapshot.' : undefined} {...register('price')} />
        <Select label="Preparation location" required options={[{ value: 'KITCHEN', label: 'Kitchen' }, { value: 'BAR', label: 'Bar' }]} error={errors.prepLocation?.message} {...register('prepLocation')} />
        <Select label="Tax group" required placeholder="Select tax group" options={(taxes.data ?? []).map((t) => ({ value: t.id, label: `${t.name} (${t.totalPercent}%)` }))} error={errors.taxGroupId?.message} {...register('taxGroupId')} />
        <Input label="Item code" placeholder="Auto-generated if empty" error={errors.code?.message} {...register('code')} />
        <Input label="Tags" placeholder="spicy, chef special" error={errors.tags?.message} {...register('tags')} />
        <Textarea label="Description" wrapperClassName="sm:col-span-2" error={errors.description?.message} {...register('description')} />
        <div className="sm:col-span-2">
          <p className="text-label text-neutral-700 mb-1.5">Image</p>
          <div className="flex items-center gap-4">
            <div className="h-20 w-28 rounded-sm bg-surface border border-neutral-300 overflow-hidden flex items-center justify-center text-neutral-400">{imageUrl ? <img src={imageUrl} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-6 w-6" />}</div>
            <div className="flex-1 space-y-2">
              <Input placeholder="Image URL or upload" error={errors.imageUrl?.message} {...register('imageUrl')} />
              <div className="flex gap-2"><Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>Upload image</Button>{imageUrl && <Button type="button" variant="ghost" size="sm" onClick={() => setValue('imageUrl', '')}>Remove</Button>}</div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onPickFile(e.target.files?.[0])} />
            </div>
          </div>
        </div>
        <div className="sm:col-span-2 grid grid-cols-2 gap-3">
          <Switch checked={watch('isVeg')} onChange={(v) => setValue('isVeg', v)} label="Vegetarian" />
          <Switch checked={watch('isPopular')} onChange={(v) => setValue('isPopular', v)} label="Mark as popular" />
          <Switch checked={watch('isAvailable')} onChange={(v) => setValue('isAvailable', v)} label="Available now" description="Sold-out items stay on the menu but can't be ordered." />
          <Switch checked={watch('isActive')} onChange={(v) => setValue('isActive', v)} label="Active" description="Inactive items are hidden everywhere." />
        </div>
      </form>
    </Modal>
  );
}

/** Station is a routing fact the expeditor reads constantly — icon + word, never colour alone. */
function StationBadge({ prepLocation }: { prepLocation: PrepLocation }) {
  const bar = prepLocation === 'BAR';
  return (
    <Badge tone={bar ? 'info' : 'warning'} size="sm" icon={bar ? <Wine className="h-3 w-3" aria-hidden /> : <ChefHat className="h-3 w-3" aria-hidden />}>
      {bar ? 'Bar' : 'Kitchen'}
    </Badge>
  );
}

type Avail = 'ALL' | 'ON' | 'OFF';

/** The `--d` beat of a staged reveal — a function of position in the grid, nothing else. */
const beat = (i: number) => ({ '--d': `${staggerDelay(i)}ms` }) as CSSProperties;

export default function MenuItemsPage() {
  const canManage = usePermission('menu:manage');
  const canAvail = usePermission('menu:availability');
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const dq = useDebounce(search, 250);
  /* Category lives in the URL so the categories screen can link straight into a filtered list. */
  const catParam = Number(params.get('category'));
  const cat: number | '' = Number.isInteger(catParam) && catParam > 0 ? catParam : '';
  const setCat = (v: number | '') => setParams((p) => { if (v === '') p.delete('category'); else p.set('category', String(v)); return p; }, { replace: true });
  const [loc, setLoc] = useState<'ALL' | PrepLocation>('ALL');
  const [avail, setAvail] = useState<Avail>('ALL');
  const cats = useCategories(true);
  const items = useMenuItems({ includeInactive: true, search: dq || undefined, categoryId: cat || undefined, prepLocation: loc === 'ALL' ? undefined : loc });
  /*
   * FACET COUNTS come from the whole menu, not from the filtered result: the category query is a
   * SERVER parameter, so once a category is chosen the response only contains that category and a
   * count taken from it would report 0 for every other chip. This is the same unfiltered read the
   * categories screen makes, so the two share one cache entry rather than costing a second fetch.
   * Nothing here is estimated — every count is a length of real rows.
   */
  const menu = useMenuItems({ includeInactive: true });
  const { remove, availability } = useItemMutations();
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [toDelete, setToDelete] = useState<MenuItem | null>(null);

  /* Availability is filtered here, not on the server: the query has no availability parameter and
     the counts below must describe exactly the rows the server already returned. */
  const fetched = useMemo(() => items.data ?? [], [items.data]);
  const offCount = useMemo(() => fetched.filter((i) => !i.isAvailable).length, [fetched]);
  const rows = useMemo(
    () => (avail === 'ALL' ? fetched : fetched.filter((i) => (avail === 'ON' ? i.isAvailable : !i.isAvailable))),
    [fetched, avail],
  );

  const catCounts = useMemo(() => {
    const m = new Map<number, number>();
    for (const i of menu.data ?? []) m.set(Number(i.categoryId), (m.get(Number(i.categoryId)) ?? 0) + 1);
    return m;
  }, [menu.data]);

  /* Only categories that exist are offered, and each carries its own real size. */
  const catOptions = useMemo<{ value: string; label: string; count?: number }[]>(() => ([
    { value: '', label: 'All items', count: menu.data?.length },
    ...(cats.data ?? []).map((c) => ({ value: String(c.id), label: c.name, count: catCounts.get(Number(c.id)) ?? 0 })),
  ]), [cats.data, menu.data, catCounts]);

  const filtered = !!(search || cat || loc !== 'ALL' || avail !== 'ALL');
  const clearFilters = () => { setSearch(''); setCat(''); setLoc('ALL'); setAvail('ALL'); };
  const catLabel = cats.data?.find((c) => c.id === cat)?.name;

  /* Only the row actually being written is frozen — one slow toggle must not lock the whole list. */
  const pendingId = availability.isPending ? availability.variables?.id : undefined;

  const openNew = () => { setEditing(null); setFormOpen(true); };

  return (
    <div>
      {/*
       * The screen's own search, hoisted into the application header — which is what the reference
       * boards draw. It is the same input, the same state and the same debounce; only its position
       * moves, so nothing about the search behaviour changes.
       */}
      <HeaderSearch>
        <SearchInput value={search} onChange={setSearch} placeholder="Search menu items…" className="w-full max-w-sm" />
      </HeaderSearch>

      <PageHeader
        title="Menu items"
        subtitle="Flip an item off the menu the moment the pass calls it — the toggle is on every card"
        actions={canManage && <Button leftIcon={<Plus className="h-4 w-4" />} onClick={openNew}>Add item</Button>}
      >
        <div className="space-y-2.5">
          <FilterChips
            ariaLabel="Filter menu items by category"
            value={cat === '' ? '' : String(cat)}
            onChange={(v) => setCat(v === '' ? '' : Number(v))}
            options={catOptions}
          />
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <SegmentedControl
              size="sm" value={avail} onChange={setAvail} ariaLabel="Filter by availability"
              options={[
                { value: 'ALL', label: 'All', count: fetched.length },
                { value: 'ON', label: 'Available', count: fetched.length - offCount },
                { value: 'OFF', label: 'Unavailable', count: offCount },
              ]}
            />
            <FilterSelect
              ariaLabel="Filter by preparation station" className="sm:w-44" value={loc === 'ALL' ? '' : loc} placeholder="All stations"
              onChange={(e) => setLoc((e.target.value || 'ALL') as 'ALL' | PrepLocation)}
              options={[{ value: 'KITCHEN', label: 'Kitchen' }, { value: 'BAR', label: 'Bar' }]}
            />
            {filtered && <Button size="sm" variant="ghost" leftIcon={<X className="h-4 w-4" />} onClick={clearFilters}>Clear filters</Button>}
          </div>
        </div>
      </PageHeader>

      {/* Items taken off during service are the thing a manager most needs to find again. */}
      {items.data && offCount > 0 && avail !== 'OFF' && (
        <Alert
          tone="warning"
          className="mb-4"
          title={`${offCount} item${offCount === 1 ? ' is' : 's are'} marked unavailable`}
          action={<Button size="sm" variant="outline" onClick={() => setAvail('OFF')}>Show them</Button>}
        >
          They stay on the menu but cannot be ordered until they are switched back on.
        </Alert>
      )}

      {items.isLoading && <LoadingState variant="cards" rows={2} />}
      {items.isError && <ErrorState error={items.error} onRetry={() => void items.refetch()} />}

      {items.data && (rows.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            title={filtered ? 'No item matches' : 'No menu items'}
            description={filtered ? 'Nothing matches this search, category, station or availability.' : 'Add your first dish or drink to start building the menu.'}
            action={filtered
              ? <Button variant="outline" onClick={clearFilters}>Clear filters</Button>
              : canManage ? <Button leftIcon={<Plus className="h-4 w-4" />} onClick={openNew}>Add item</Button> : undefined}
          />
        </Card>
      ) : (
        <>
          <p className="mb-3 text-sm text-neutral-600">
            <span className="font-semibold text-neutral-900 tabular-nums">{rows.length}</span> item{rows.length === 1 ? '' : 's'}
            {catLabel ? <> · {catLabel}</> : null}
            {loc !== 'ALL' ? <> · {loc === 'BAR' ? 'Bar' : 'Kitchen'}</> : null}
            {avail === 'OFF' ? ' · unavailable only' : avail === 'ON' ? ' · available only' : ''}
          </p>

          {/*
           * The reference grid: four across on a wide screen, one on a phone. The base
           * `grid-cols-1` is declared explicitly — an implicit `auto` track sizes to min-content
           * and pushes a card wider than a 360 px viewport.
           */}
          <ul className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {rows.map((r, idx) => (
              <li key={r.id} className="anim-reveal min-w-0" style={beat(idx)}>
                <article className="card material-gloss p-0 overflow-hidden h-full flex flex-col min-w-0">
                  <div className="relative">
                    {/* A real photograph wins; a missing one becomes the dish's own drawing, so the
                        grid stays image-led instead of showing a row of grey tiles. */}
                    <ItemImage
                      src={r.imageUrl} alt={r.name} prepLocation={r.prepLocation} category={r.categoryName}
                      rounded="rounded-none" className="aspect-[4/3] w-full"
                    />
                    {canManage && (
                      <div className="absolute top-2 right-2 flex items-center gap-1">
                        <IconButton
                          label={`Edit ${r.name}`} size="sm"
                          className="bg-surface-raised/90 backdrop-blur-sm ring-1 ring-inset ring-neutral-200 text-neutral-700 hover:bg-surface-raised"
                          onClick={() => { setEditing(r); setFormOpen(true); }}
                        ><Pencil className="h-4 w-4" /></IconButton>
                        <IconButton
                          label={`Delete ${r.name}`} size="sm"
                          className="bg-surface-raised/90 backdrop-blur-sm ring-1 ring-inset ring-neutral-200 text-danger-700 hover:bg-surface-raised"
                          onClick={() => setToDelete(r)}
                        ><Trash2 className="h-4 w-4" /></IconButton>
                      </div>
                    )}
                    <div className="absolute bottom-2 left-2 flex flex-wrap items-center gap-1">
                      <StationBadge prepLocation={r.prepLocation} />
                      {r.isPopular && <Badge tone="primary" size="sm" icon={<Star className="h-3 w-3" aria-hidden />}>Popular</Badge>}
                      {!r.isActive && <Badge tone="neutral" size="sm" icon={<EyeOff className="h-3 w-3" aria-hidden />}>Inactive</Badge>}
                    </div>
                  </div>

                  <div className="p-4 flex-1 flex flex-col min-w-0">
                    <div className="flex items-start justify-between gap-2 min-w-0">
                      <div className="min-w-0">
                        <h3 className={cn('text-[15px] font-semibold leading-snug flex items-start gap-1.5', r.isActive ? 'text-neutral-900' : 'text-neutral-400')}>
                          {r.isVeg && <><Leaf className="h-3.5 w-3.5 mt-1 text-success-700 shrink-0" aria-hidden /><span className="sr-only">Vegetarian. </span></>}
                          {/* Two lines, then clamp. A long name is still fully available — it is
                              the card's `title`, it is the image's alt text and it is the first
                              thing on the edit dialog — and letting it run to three or four lines
                              makes one card in a row of four taller than its neighbours, which is
                              the thing that makes an image grid look broken. */}
                          <span className="min-w-0 break-words line-clamp-2" title={r.name}>{r.name}</span>
                        </h3>
                        <p className="text-xs text-neutral-500 mt-0.5 truncate">{r.categoryName ?? r.code}</p>
                      </div>
                      {/* Status is colour AND text AND a dot — never the fill on its own. */}
                      <Badge tone={r.isAvailable ? 'success' : 'neutral'} size="sm" dot className="shrink-0">
                        {r.isAvailable ? 'Available' : 'Unavailable'}
                      </Badge>
                    </div>

                    {/* `mt-auto` parks the price on the card's floor, so the price rules line up
                        across the row however tall the names above them are. */}
                    <div className="mt-auto pt-3 border-t border-neutral-200 flex items-center justify-between gap-2">
                      <p className="text-[15px] font-semibold text-primary-700 tabular-nums">{money(r.price)}</p>
                      {canAvail && (
                        <Switch
                          size="sm"
                          checked={r.isAvailable}
                          disabled={pendingId === r.id}
                          ariaLabel={`${r.name} — available to order`}
                          onChange={(v) => availability.mutate({ id: r.id, isAvailable: v })}
                        />
                      )}
                    </div>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        </>
      ))}

      {items.data && rows.length > 0 && !canAvail && (
        <p className="mt-3 text-caption text-neutral-500 flex items-center gap-1.5">
          <UtensilsCrossed className="h-3.5 w-3.5" aria-hidden />
          Availability is read-only for your account — ask a manager to take an item off the menu.
        </p>
      )}
      {formOpen && <ItemForm open onClose={() => setFormOpen(false)} editing={editing} />}
      <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} variant="danger" title={`Delete “${toDelete?.name}”?`} message="The item is soft-deleted: it disappears from menus, but past orders and bills keep their snapshot." confirmLabel="Delete" loading={remove.isPending}
        onConfirm={async () => { if (toDelete) { try { await remove.mutateAsync(toDelete.id); } finally { setToDelete(null); } } }} />
    </div>
  );
}
