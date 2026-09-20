import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown, ChefHat, Wine, CheckCircle2, Circle, ChevronRight, AlertTriangle, EyeOff } from 'lucide-react';
import { useCategories, useCategoryMutations, useMenuItems } from './hooks';
import { usePermission } from '@/hooks/useAuth';
import { PageHeader, Button, IconButton, Modal, ConfirmDialog, Input, Select, Textarea, Switch, Badge, Skeleton, LoadingState, ErrorState, EmptyState, Alert, Card } from '@/components/ui';
import { ApiError } from '@/services/api/client';
import { cn } from '@/utils/cn';
import type { MenuCategory, CategoryInput } from '@/types';

const schema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  description: z.string().max(300).optional(),
  imageUrl: z.string().url('Enter a valid URL').or(z.literal('')).optional(),
  prepLocation: z.enum(['KITCHEN', 'BAR']),
  isActive: z.boolean(),
});
type Form = z.infer<typeof schema>;

function CategoryForm({ open, onClose, editing }: { open: boolean; onClose: () => void; editing: MenuCategory | null }) {
  const { save } = useCategoryMutations();
  const { register, handleSubmit, watch, setValue, setError, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    values: { name: editing?.name ?? '', description: editing?.description ?? '', imageUrl: editing?.imageUrl ?? '', prepLocation: editing?.prepLocation ?? 'KITCHEN', isActive: editing?.isActive ?? true },
  });
  const onSubmit = async (v: Form) => {
    const body: CategoryInput = { name: v.name, description: v.description || undefined, imageUrl: v.imageUrl || undefined, prepLocation: v.prepLocation, isActive: v.isActive };
    try { await save.mutateAsync({ id: editing?.id ?? null, body }); onClose(); }
    catch (e) { const err = ApiError.from(e); const f = err.errors.find((x) => x.field)?.field as keyof Form | undefined; if (f) setError(f, { message: err.message }); }
  };
  return (
    <Modal open={open} onClose={onClose} title={editing ? `Edit “${editing.name}”` : 'New category'} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={handleSubmit(onSubmit)} loading={save.isPending}>{editing ? 'Save changes' : 'Create category'}</Button></>}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Input label="Category name" required autoFocus error={errors.name?.message} {...register('name')} />
        <Select label="Default preparation location" required hint="New items in this category default to this station." options={[{ value: 'KITCHEN', label: 'Kitchen' }, { value: 'BAR', label: 'Bar' }]} error={errors.prepLocation?.message} {...register('prepLocation')} />
        <Textarea label="Description" error={errors.description?.message} {...register('description')} />
        <Input label="Image URL" placeholder="https://…" error={errors.imageUrl?.message} {...register('imageUrl')} />
        <Switch checked={watch('isActive')} onChange={(v) => setValue('isActive', v)} label="Active" description="Inactive categories are hidden from the customer menu and order entry." />
      </form>
    </Modal>
  );
}

type Tally = { total: number; unavailable: number; inactive: number };

export default function CategoriesPage() {
  const cats = useCategories(true);
  const items = useMenuItems({ includeInactive: true });
  const { save, remove, reorder } = useCategoryMutations();
  const canManage = usePermission('menu:manage');
  const [editing, setEditing] = useState<MenuCategory | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [toDelete, setToDelete] = useState<MenuCategory | null>(null);
  const list = cats.data ?? [];

  /* One pass over the items this screen already fetched — no extra query just to count. */
  const tallies = useMemo(() => {
    const m = new Map<number, Tally>();
    for (const i of items.data ?? []) {
      const t = m.get(Number(i.categoryId)) ?? { total: 0, unavailable: 0, inactive: 0 };
      t.total += 1;
      if (!i.isActive) t.inactive += 1;
      else if (!i.isAvailable) t.unavailable += 1;
      m.set(Number(i.categoryId), t);
    }
    return m;
  }, [items.data]);

  const activeCount = list.filter((c) => c.isActive).length;
  const inactiveCount = list.length - activeCount;

  /* Reorder always works on the full ordered list, so the ids sent match what the server stores. */
  const move = (c: MenuCategory, dir: -1 | 1) => {
    const ids = list.map((x) => x.id);
    const i = ids.indexOf(c.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    reorder.mutate(ids);
  };

  /* Active/inactive is the one field changed without opening the dialog — same save mutation and
     exactly the payload shape the dialog sends, with only `isActive` different. */
  const toggleActive = (c: MenuCategory, isActive: boolean) => {
    const body: CategoryInput = {
      name: c.name,
      description: c.description ?? undefined,
      imageUrl: c.imageUrl ?? undefined,
      prepLocation: c.prepLocation,
      isActive,
    };
    save.mutate({ id: c.id, body });
  };
  const savingId = save.isPending ? save.variables?.id : undefined;

  const countCell = (c: MenuCategory) => {
    if (items.isLoading) return <Skeleton className="h-4 w-20" />;
    if (items.isError) return <span className="text-caption text-neutral-500">Item count unavailable</span>;
    const t = tallies.get(Number(c.id)) ?? { total: 0, unavailable: 0, inactive: 0 };
    if (t.total === 0) {
      return (
        <span className="text-caption text-neutral-500 inline-flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 text-warning-700" aria-hidden />
          Empty — no items routed here yet
        </span>
      );
    }
    return (
      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
        <Link
          to={`/admin/menu/items?category=${c.id}`}
          className="text-sm font-medium text-primary-700 hover:underline underline-offset-2 inline-flex items-center gap-0.5"
        >
          {t.total} item{t.total === 1 ? '' : 's'}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
        {t.unavailable > 0 && (
          <Badge tone="danger" size="sm" icon={<AlertTriangle className="h-3 w-3" aria-hidden />}>{t.unavailable} unavailable</Badge>
        )}
        {t.inactive > 0 && (
          <Badge tone="neutral" size="sm" icon={<EyeOff className="h-3 w-3" aria-hidden />}>{t.inactive} inactive</Badge>
        )}
      </span>
    );
  };

  return (
    <div>
      <PageHeader
        title="Menu categories"
        subtitle="The spine of the menu — each category routes its items to a station and controls whether they appear at all"
        actions={canManage && <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setFormOpen(true); }}>New category</Button>}
      />

      {cats.data && list.length > 0 && inactiveCount > 0 && (
        <Alert tone="info" className="mb-4" title={`${inactiveCount} categor${inactiveCount === 1 ? 'y is' : 'ies are'} inactive`}>
          Their items stay in the system but are hidden from the customer menu and from order entry.
        </Alert>
      )}

      {cats.isLoading && <LoadingState variant="table" rows={6} />}
      {cats.isError && <ErrorState error={cats.error} onRetry={() => void cats.refetch()} />}
      {cats.data && (list.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            title="No categories yet"
            description="Categories decide where an item is prepared and where it shows on the menu. Create your first one, e.g. Starters or Cocktails."
            action={canManage ? <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setFormOpen(true); }}>New category</Button> : undefined}
          />
        </Card>
      ) : (
        <Card padded={false}>
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-neutral-200">
            <p className="text-sm text-neutral-600">
              <span className="font-semibold text-neutral-900 tabular-nums">{list.length}</span> categor{list.length === 1 ? 'y' : 'ies'}
              {' · '}<span className="tabular-nums">{activeCount}</span> active
              {items.data ? <> · <span className="tabular-nums">{items.data.length}</span> items in total</> : null}
            </p>
            {canManage && <p className="text-caption text-neutral-500">Arrows set the order guests and waiters see</p>}
          </div>

          <ul className="divide-y divide-neutral-100">
            {list.map((c, idx) => {
              const isEditing = formOpen && editing?.id === c.id;
              const bar = c.prepLocation === 'BAR';
              return (
                <li
                  key={c.id}
                  aria-current={isEditing ? 'true' : undefined}
                  className={cn(
                    'px-4 py-3.5 transition-colors',
                    isEditing ? 'bg-primary-50 ring-2 ring-inset ring-primary-600' : !c.isActive && 'bg-neutral-50',
                  )}
                >
                  <div className="flex flex-wrap items-start gap-3">
                    {canManage && (
                      <div className="flex flex-col items-center shrink-0 -my-1">
                        <IconButton label={`Move ${c.name} up`} size="sm" disabled={idx === 0 || reorder.isPending} onClick={() => move(c, -1)}><ArrowUp className="h-4 w-4" /></IconButton>
                        <span className="text-caption tabular-nums text-neutral-500 leading-none py-0.5" aria-hidden>{idx + 1}</span>
                        <IconButton label={`Move ${c.name} down`} size="sm" disabled={idx === list.length - 1 || reorder.isPending} onClick={() => move(c, 1)}><ArrowDown className="h-4 w-4" /></IconButton>
                      </div>
                    )}

                    <span
                      className={cn('h-10 w-10 rounded-md flex items-center justify-center shrink-0', bar ? 'bg-info-50 text-info-700' : 'bg-warning-50 text-warning-700')}
                      aria-hidden
                    >
                      {bar ? <Wine className="h-5 w-5" /> : <ChefHat className="h-5 w-5" />}
                    </span>

                    <div className="min-w-0 flex-1 basis-48">
                      <p className="flex flex-wrap items-center gap-1.5">
                        <span className={cn('font-semibold text-neutral-900 truncate', !c.isActive && 'text-neutral-500')}>{c.name}</span>
                        <Badge tone={bar ? 'info' : 'warning'} size="sm" icon={bar ? <Wine className="h-3 w-3" aria-hidden /> : <ChefHat className="h-3 w-3" aria-hidden />}>
                          {bar ? 'Bar' : 'Kitchen'}
                        </Badge>
                        {isEditing && <Badge tone="primary" size="sm" icon={<Pencil className="h-3 w-3" aria-hidden />}>Editing</Badge>}
                      </p>
                      {c.description && <p className="text-caption text-neutral-500 line-clamp-1 mt-0.5">{c.description}</p>}
                      <p className="mt-1.5">{countCell(c)}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 ml-auto shrink-0">
                      {canManage ? (
                        <>
                          <Switch
                            size="sm"
                            checked={c.isActive}
                            disabled={savingId === c.id}
                            ariaLabel={`${c.name} — show on the menu`}
                            onChange={(v) => toggleActive(c, v)}
                          />
                          <Badge tone={c.isActive ? 'success' : 'neutral'} size="sm" icon={c.isActive ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : <Circle className="h-3.5 w-3.5" aria-hidden />}>
                            {c.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                          <IconButton label={`Edit ${c.name}`} size="sm" onClick={() => { setEditing(c); setFormOpen(true); }}><Pencil className="h-4 w-4" /></IconButton>
                          <IconButton label={`Delete ${c.name}`} size="sm" className="text-danger-600" onClick={() => setToDelete(c)}><Trash2 className="h-4 w-4" /></IconButton>
                        </>
                      ) : (
                        <Badge tone={c.isActive ? 'success' : 'neutral'} size="sm" icon={c.isActive ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : <Circle className="h-3.5 w-3.5" aria-hidden />}>
                          {c.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      ))}

      {formOpen && <CategoryForm open onClose={() => { setFormOpen(false); setEditing(null); }} editing={editing} />}
      <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} variant="danger" title={`Delete “${toDelete?.name}”?`} message="The category is soft-deleted and hidden everywhere. Categories with active items cannot be deleted." confirmLabel="Delete" loading={remove.isPending}
        onConfirm={async () => { if (toDelete) { try { await remove.mutateAsync(toDelete.id); } finally { setToDelete(null); } } }} />
    </div>
  );
}
