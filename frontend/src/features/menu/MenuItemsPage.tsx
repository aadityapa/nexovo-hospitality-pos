import { useMemo, useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, Trash2, ImagePlus, ChefHat, Wine, Leaf } from 'lucide-react';
import { useCategories, useMenuItems, useItemMutations, useTaxGroups } from './hooks';
import { usePermission } from '@/hooks/useAuth';
import { useDebounce } from '@/hooks/useRealtime';
import { PageHeader, Button, IconButton, Modal, ConfirmDialog, Input, Select, Textarea, Switch, Badge, LoadingState, ErrorState, DataTable, SearchInput, SegmentedControl, type Column, FilterSelect } from '@/components/ui';
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
      <form onSubmit={handleSubmit(onSubmit)} className="grid sm:grid-cols-2 gap-4" noValidate>
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
            <div className="h-20 w-28 rounded-sm bg-neutral-100 overflow-hidden flex items-center justify-center text-neutral-400">{imageUrl ? <img src={imageUrl} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-6 w-6" />}</div>
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

export default function MenuItemsPage() {
  const canManage = usePermission('menu:manage');
  const canAvail = usePermission('menu:availability');
  const [search, setSearch] = useState('');
  const dq = useDebounce(search, 250);
  const [cat, setCat] = useState<number | ''>('');
  const [loc, setLoc] = useState<'ALL' | PrepLocation>('ALL');
  const cats = useCategories(true);
  const items = useMenuItems({ includeInactive: true, search: dq || undefined, categoryId: cat || undefined, prepLocation: loc === 'ALL' ? undefined : loc });
  const { remove, availability } = useItemMutations();
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [toDelete, setToDelete] = useState<MenuItem | null>(null);

  const columns = useMemo<Column<MenuItem>[]>(() => [
    { key: 'name', header: 'Item', sortValue: (r) => r.name, render: (r) => (
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-10 w-10 rounded-sm bg-neutral-100 overflow-hidden shrink-0">{r.imageUrl && <img src={r.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />}</div>
        <div className="min-w-0"><p className={cn('font-medium truncate flex items-center gap-1.5', !r.isActive && 'text-neutral-400')}>{r.isVeg && <Leaf className="h-3.5 w-3.5 text-success-600" aria-label="Vegetarian" />}{r.name}</p><p className="text-caption text-neutral-500 truncate">{r.code}{r.description ? ` · ${r.description}` : ''}</p></div>
      </div>) },
    { key: 'category', header: 'Category', hideBelow: 'lg', sortValue: (r) => r.categoryName ?? '', render: (r) => r.categoryName },
    { key: 'prep', header: 'Station', hideBelow: 'lg', render: (r) => <Badge tone={r.prepLocation === 'BAR' ? 'info' : 'warning'} size="sm" icon={r.prepLocation === 'BAR' ? <Wine className="h-3 w-3" /> : <ChefHat className="h-3 w-3" />}>{r.prepLocation === 'BAR' ? 'Bar' : 'Kitchen'}</Badge> },
    { key: 'price', header: 'Price', align: 'right', sortValue: (r) => r.price, render: (r) => <span className="tabular-nums font-medium">{money(r.price)}</span> },
    { key: 'status', header: 'Status', render: (r) => <div className="flex flex-wrap gap-1">{!r.isActive && <Badge tone="neutral" size="sm">Inactive</Badge>}{r.isPopular && <Badge tone="warning" size="sm">Popular</Badge>}{canAvail ? <Switch size="sm" checked={r.isAvailable} onChange={(v) => availability.mutate({ id: r.id, isAvailable: v })} label={r.isAvailable ? 'Available' : 'Unavailable'} /> : <Badge tone={r.isAvailable ? 'success' : 'danger'} size="sm">{r.isAvailable ? 'Available' : 'Unavailable'}</Badge>}</div> },
    ...(canManage ? [{ key: 'actions', header: '', align: 'right' as const, render: (r: MenuItem) => <div className="flex justify-end gap-1"><IconButton label="Edit" size="sm" onClick={() => { setEditing(r); setFormOpen(true); }}><Pencil className="h-4 w-4" /></IconButton><IconButton label="Delete" size="sm" className="text-danger-600" onClick={() => setToDelete(r)}><Trash2 className="h-4 w-4" /></IconButton></div> }] : []),
  ], [canManage, canAvail, availability]);

  return (
    <div>
      <PageHeader title="Menu items" subtitle={`${items.data?.length ?? 0} items`} actions={canManage && <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setFormOpen(true); }}>New item</Button>}>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <SearchInput value={search} onChange={setSearch} placeholder="Search by name or code" className="sm:w-72" />
          <FilterSelect
            ariaLabel="Filter by category" className="sm:w-52" value={cat} placeholder="All categories"
            onChange={(e) => setCat(e.target.value ? Number(e.target.value) : '')}
            options={(cats.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
          />
          <SegmentedControl size="sm" value={loc} onChange={setLoc} options={[{ value: 'ALL', label: 'All' }, { value: 'KITCHEN', label: 'Kitchen' }, { value: 'BAR', label: 'Bar' }]} />
        </div>
      </PageHeader>
      {items.isLoading && <LoadingState variant="table" rows={8} />}
      {items.isError && <ErrorState error={items.error} onRetry={() => void items.refetch()} />}
      {items.data && <DataTable columns={columns} rows={items.data} rowKey={(r) => r.id} pageSize={25} emptyTitle="No menu items" emptyDescription={search || cat ? 'Try clearing the filters.' : 'Add your first dish or drink.'} emptyAction={canManage && !search && !cat ? <Button onClick={() => setFormOpen(true)}>New item</Button> : undefined}
        mobileCard={(r) => (<div className="flex items-center gap-3"><div className="h-12 w-12 rounded-sm bg-neutral-100 overflow-hidden shrink-0">{r.imageUrl && <img src={r.imageUrl} alt="" className="h-full w-full object-cover" />}</div><div className="min-w-0 flex-1"><p className="font-medium truncate">{r.name}</p><p className="text-caption text-neutral-500">{r.categoryName} · {r.prepLocation}</p><p className="text-sm font-semibold tabular-nums">{money(r.price)}</p></div><div className="flex flex-col items-end gap-1">{canAvail && <Switch size="sm" checked={r.isAvailable} onChange={(v) => availability.mutate({ id: r.id, isAvailable: v })} />}{canManage && <IconButton label="Edit" size="sm" onClick={() => { setEditing(r); setFormOpen(true); }}><Pencil className="h-4 w-4" /></IconButton>}</div></div>)} />}
      {formOpen && <ItemForm open onClose={() => setFormOpen(false)} editing={editing} />}
      <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} variant="danger" title={`Delete “${toDelete?.name}”?`} message="The item is soft-deleted: it disappears from menus, but past orders and bills keep their snapshot." confirmLabel="Delete" loading={remove.isPending}
        onConfirm={async () => { if (toDelete) { try { await remove.mutateAsync(toDelete.id); } finally { setToDelete(null); } } }} />
    </div>
  );
}
