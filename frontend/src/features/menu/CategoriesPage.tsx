import { useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown, ChefHat, Wine, CheckCircle2, Circle, ChevronRight, AlertTriangle, EyeOff, GripVertical } from 'lucide-react';
import { useCategories, useCategoryMutations, useMenuItems } from './hooks';
import { usePermission } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useSurface';
import { PageHeader, Button, IconButton, Modal, ConfirmDialog, Input, Select, Textarea, Switch, Badge, Skeleton, LoadingState, ErrorState, EmptyState, Alert, Card, FilterSelect, ItemImage } from '@/components/ui';
import { CategoryGlyph, glyphFor } from '@/components/graphics';
import { staggerDelay } from '@/components/motion';
import { ApiError } from '@/services/api/client';
import { cn } from '@/utils/cn';
import type { ID, MenuCategory, CategoryInput } from '@/types';

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
        <Switch checked={watch('isActive')} onChange={(v) => setValue('isActive', v)} label="Active" description="Inactive categories are hidden from the customer menu and from order entry." />
      </form>
    </Modal>
  );
}

type Tally = { total: number; unavailable: number; inactive: number };

/**
 * The sorts this screen ACTUALLY implements — nothing is offered that is not applied below.
 * `ORDER` is the menu's own running order, which is what the reorder arrows write to the server;
 * the arrows are therefore only shown while that order is the one on screen.
 */
type SortKey = 'ORDER' | 'NAME_ASC' | 'NAME_DESC' | 'ITEMS_DESC';
const SORTS: { value: SortKey; label: string }[] = [
  { value: 'ORDER', label: 'Menu order' },
  { value: 'NAME_ASC', label: 'Name (A–Z)' },
  { value: 'NAME_DESC', label: 'Name (Z–A)' },
  { value: 'ITEMS_DESC', label: 'Most items' },
];

const beat = (i: number) => ({ '--d': `${staggerDelay(i)}ms` }) as CSSProperties;

export default function CategoriesPage() {
  const ws = useWorkspace();
  const cats = useCategories(true);
  const items = useMenuItems({ includeInactive: true });
  const { save, remove, reorder } = useCategoryMutations();
  const canManage = usePermission('menu:manage');
  /* Which row is being dragged on the manager list. Presentation state only — the write is the
     same `reorder` mutation the arrows have always called, with the same id array. */
  const [dragId, setDragId] = useState<ID | null>(null);
  const [editing, setEditing] = useState<MenuCategory | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [toDelete, setToDelete] = useState<MenuCategory | null>(null);
  const [sort, setSort] = useState<SortKey>('ORDER');
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

  const shown = useMemo(() => {
    if (sort === 'ORDER') return list;
    const total = (c: MenuCategory) => tallies.get(Number(c.id))?.total ?? 0;
    const copy = [...list];
    if (sort === 'NAME_ASC') return copy.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === 'NAME_DESC') return copy.sort((a, b) => b.name.localeCompare(a.name));
    return copy.sort((a, b) => total(b) - total(a) || a.name.localeCompare(b.name));
  }, [list, sort, tallies]);

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

  /**
   * Drop a dragged row onto another one — the manager list's pointer route to the same operation
   * the arrows perform. It ends in the identical `reorder.mutate(ids)` call with the full ordered
   * id array, so the server is never sent a partial order, and the arrows stay as the keyboard
   * route to it. Nothing reorders locally: the list re-renders from the server's answer.
   */
  const dropOn = (target: MenuCategory) => {
    const from = list.findIndex((x) => x.id === dragId);
    const to = list.findIndex((x) => x.id === target.id);
    setDragId(null);
    if (from < 0 || to < 0 || from === to) return;
    const ids = list.map((x) => x.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
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

  /** The real item count, and the exceptions inside it. Never a guess: a failed items query says so. */
  const countCell = (c: MenuCategory) => {
    if (items.isLoading) return <Skeleton className="h-4 w-20 mx-auto" />;
    if (items.isError) return <span className="text-caption text-neutral-500">Item count unavailable</span>;
    const t = tallies.get(Number(c.id)) ?? { total: 0, unavailable: 0, inactive: 0 };
    if (t.total === 0) {
      return (
        <span className="text-caption text-neutral-500 inline-flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 text-warning-700" aria-hidden />
          No items yet
        </span>
      );
    }
    return (
      <span className="inline-flex flex-wrap justify-center items-center gap-x-2 gap-y-1">
        <Link
          to={`/admin/menu/items?category=${c.id}`}
          className="text-[13px] font-medium text-primary-700 hover:underline underline-offset-2 inline-flex items-center gap-0.5"
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

  const openNew = () => { setEditing(null); setFormOpen(true); };

  return (
    <div>
      <PageHeader
        title="Menu categories"
        subtitle="The spine of the menu — each category routes its items to a station and controls whether they appear at all"
        actions={<>
          {list.length > 0 && (
            <FilterSelect
              ariaLabel="Sort categories"
              className="w-44"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              options={SORTS}
            />
          )}
          {canManage && <Button leftIcon={<Plus className="h-4 w-4" />} onClick={openNew}>Add category</Button>}
        </>}
      />

      {cats.data && list.length > 0 && inactiveCount > 0 && (
        <Alert tone="info" className="mb-4" title={`${inactiveCount} categor${inactiveCount === 1 ? 'y is' : 'ies are'} inactive`}>
          Their items stay in the system but are hidden from the customer menu and from order entry.
        </Alert>
      )}

      {cats.isLoading && <LoadingState variant="cards" rows={2} />}
      {cats.isError && <ErrorState error={cats.error} onRetry={() => void cats.refetch()} />}
      {cats.data && (list.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            title="No categories yet"
            description="Categories decide where an item is prepared and where it shows on the menu. Create your first one, e.g. Starters or Cocktails."
            action={canManage ? <Button leftIcon={<Plus className="h-4 w-4" />} onClick={openNew}>Add category</Button> : undefined}
          />
        </Card>
      ) : (
        <>
          <p className="mb-3 text-sm text-neutral-600">
            <span className="font-semibold text-neutral-900 tabular-nums">{list.length}</span> categor{list.length === 1 ? 'y' : 'ies'}
            {' · '}<span className="tabular-nums">{activeCount}</span> active
            {items.data ? <> · <span className="tabular-nums">{items.data.length}</span> items in total</> : null}
            {sort === 'ORDER' && canManage ? <span className="text-neutral-500"> · arrows set the order guests and waiters see</span> : null}
          </p>

          {/*
            THE MANAGER BOARD (panel 13) draws this screen as a REORDERABLE LIST — handle,
            thumbnail, name, real item count, description, active switch — where the admin board
            draws the card grid below. The admin grid is untouched and is what every other
            workspace still gets.

            The handle is a real control, not a picture of one: it drags, and it ends in the same
            `reorder` mutation the arrows call. The arrows stay beside it because a drag is not
            operable from a keyboard, and reordering the menu is not a pointer-only capability.
          */}
          {ws === 'manager' ? (
            <ol className="rounded-lg border border-neutral-200 bg-surface-raised divide-y divide-neutral-200 overflow-hidden">
              {shown.map((c) => {
                const isEditing = formOpen && editing?.id === c.id;
                const bar = c.prepLocation === 'BAR';
                const orderIndex = list.findIndex((x) => x.id === c.id);
                const draggable = canManage && sort === 'ORDER' && !reorder.isPending;
                return (
                  <li
                    key={c.id}
                    aria-current={isEditing ? 'true' : undefined}
                    onDragOver={(e) => { if (dragId != null && draggable) e.preventDefault(); }}
                    onDrop={(e) => { if (dragId != null && draggable) { e.preventDefault(); dropOn(c); } }}
                    className={cn(
                      'flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3 sm:px-4',
                      isEditing && 'ring-2 ring-inset ring-primary-500',
                      !c.isActive && !isEditing && 'bg-neutral-50',
                      dragId === c.id && 'opacity-60',
                    )}
                  >
                    {/* Handle, thumbnail and the words are one block: `basis-full` below `sm`
                        gives them the whole line and drops the controls beneath, which is what
                        keeps this row off a horizontal scrollbar at 360 px. */}
                    <div className="flex items-center gap-3 min-w-0 grow basis-full sm:basis-0">
                      {draggable && (
                        <span
                          draggable
                          onDragStart={() => setDragId(c.id)}
                          onDragEnd={() => setDragId(null)}
                          className="shrink-0 -ml-1 p-1 text-neutral-400 cursor-grab active:cursor-grabbing"
                          aria-hidden
                        >
                          <GripVertical className="h-5 w-5" />
                        </span>
                      )}

                      {/* A real image wins; without one the category gets its own drawing rather
                          than a grey tile, which is what keeps the list image-led. */}
                      <ItemImage
                        src={c.imageUrl}
                        alt={c.name}
                        prepLocation={c.prepLocation}
                        category={c.name}
                        className="h-14 w-14 shrink-0"
                      />

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <h3 className={cn('text-[15px] font-semibold break-words', c.isActive ? 'text-neutral-900' : 'text-neutral-500')}>{c.name}</h3>
                          <Badge tone={bar ? 'info' : 'warning'} size="sm" icon={bar ? <Wine className="h-3 w-3" aria-hidden /> : <ChefHat className="h-3 w-3" aria-hidden />}>
                            {bar ? 'Bar' : 'Kitchen'}
                          </Badge>
                          {isEditing && <Badge tone="primary" size="sm" icon={<Pencil className="h-3 w-3" aria-hidden />}>Editing</Badge>}
                        </div>
                        {c.description && <p className="text-caption text-neutral-500 line-clamp-2 mt-0.5">{c.description}</p>}
                        <div className="mt-1">{countCell(c)}</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0 ml-auto">
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
                          {sort === 'ORDER' && (
                            <span className="inline-flex items-center gap-0.5">
                              <IconButton label={`Move ${c.name} up`} size="sm" disabled={orderIndex === 0 || reorder.isPending} onClick={() => move(c, -1)}><ArrowUp className="h-4 w-4" /></IconButton>
                              <span className="text-caption tabular-nums text-neutral-500" aria-hidden>{orderIndex + 1}</span>
                              <IconButton label={`Move ${c.name} down`} size="sm" disabled={orderIndex === list.length - 1 || reorder.isPending} onClick={() => move(c, 1)}><ArrowDown className="h-4 w-4" /></IconButton>
                            </span>
                          )}
                          <IconButton label={`Edit ${c.name}`} size="sm" onClick={() => { setEditing(c); setFormOpen(true); }}><Pencil className="h-4 w-4" /></IconButton>
                          <IconButton label={`Delete ${c.name}`} size="sm" className="text-danger-700" onClick={() => setToDelete(c)}><Trash2 className="h-4 w-4" /></IconButton>
                        </>
                      ) : (
                        <Badge tone={c.isActive ? 'success' : 'neutral'} size="sm" icon={c.isActive ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : <Circle className="h-3.5 w-3.5" aria-hidden />}>
                          {c.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
          /* Base `grid-cols-1` declared: an implicit auto track sizes to min-content and would
              push a card past a 360 px viewport. */
          <ul className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {shown.map((c, idx) => {
              const isEditing = formOpen && editing?.id === c.id;
              const bar = c.prepLocation === 'BAR';
              const orderIndex = list.findIndex((x) => x.id === c.id);
              return (
                <li key={c.id} className="anim-reveal min-w-0" style={beat(idx)}>
                  <Card
                    className={cn(
                      'relative h-full flex flex-col items-center text-center',
                      /* Room for the corner actions, so the glyph never sits under them on a
                         narrow two-up card. */
                      canManage && 'pt-9',
                      isEditing ? 'ring-2 ring-inset ring-primary-500' : !c.isActive && 'bg-neutral-50',
                    )}
                    aria-current={isEditing ? 'true' : undefined}
                  >
                    {canManage && (
                      <div className="absolute top-2 right-2 flex items-center gap-0.5">
                        <IconButton label={`Edit ${c.name}`} size="sm" onClick={() => { setEditing(c); setFormOpen(true); }}><Pencil className="h-4 w-4" /></IconButton>
                        <IconButton label={`Delete ${c.name}`} size="sm" className="text-danger-700" onClick={() => setToDelete(c)}><Trash2 className="h-4 w-4" /></IconButton>
                      </div>
                    )}

                    {/* One drawn mark from a single family — the reference's category cards are
                        carried almost entirely by the glyph, so it must not be a borrowed icon. */}
                    <span
                      className={cn('h-12 w-12 rounded-md flex items-center justify-center shrink-0 ring-1 ring-inset', bar ? 'bg-info-50 text-info-700 ring-info-200' : 'bg-warning-50 text-warning-700 ring-warning-200')}
                      aria-hidden
                    >
                      <CategoryGlyph name={glyphFor(c.name)} className="h-6 w-6" />
                    </span>

                    <h3 className={cn('mt-3 text-[15px] font-semibold break-words', c.isActive ? 'text-neutral-900' : 'text-neutral-500')}>{c.name}</h3>
                    {c.description && <p className="text-caption text-neutral-500 line-clamp-2 mt-0.5">{c.description}</p>}
                    <div className="mt-1.5">{countCell(c)}</div>

                    <div className="mt-2 flex flex-wrap justify-center items-center gap-1.5">
                      <Badge tone={bar ? 'info' : 'warning'} size="sm" icon={bar ? <Wine className="h-3 w-3" aria-hidden /> : <ChefHat className="h-3 w-3" aria-hidden />}>
                        {bar ? 'Bar' : 'Kitchen'}
                      </Badge>
                      {isEditing && <Badge tone="primary" size="sm" icon={<Pencil className="h-3 w-3" aria-hidden />}>Editing</Badge>}
                    </div>

                    <div className="mt-auto pt-3 w-full flex flex-wrap items-center justify-center gap-2 border-t border-neutral-200">
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
                          {/* The arrows write the running order, so they only appear while that
                              order is the one being shown. */}
                          {sort === 'ORDER' && (
                            <span className="inline-flex items-center gap-0.5">
                              <IconButton label={`Move ${c.name} up`} size="sm" disabled={orderIndex === 0 || reorder.isPending} onClick={() => move(c, -1)}><ArrowUp className="h-4 w-4" /></IconButton>
                              <span className="text-caption tabular-nums text-neutral-500" aria-hidden>{orderIndex + 1}</span>
                              <IconButton label={`Move ${c.name} down`} size="sm" disabled={orderIndex === list.length - 1 || reorder.isPending} onClick={() => move(c, 1)}><ArrowDown className="h-4 w-4" /></IconButton>
                            </span>
                          )}
                        </>
                      ) : (
                        <Badge tone={c.isActive ? 'success' : 'neutral'} size="sm" icon={c.isActive ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : <Circle className="h-3.5 w-3.5" aria-hidden />}>
                          {c.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      )}
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
          )}
        </>
      ))}

      {formOpen && <CategoryForm open onClose={() => { setFormOpen(false); setEditing(null); }} editing={editing} />}
      <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} variant="danger" title={`Delete “${toDelete?.name}”?`} message="The category is soft-deleted and hidden everywhere. Categories with active items cannot be deleted." confirmLabel="Delete" loading={remove.isPending}
        onConfirm={async () => { if (toDelete) { try { await remove.mutateAsync(toDelete.id); } finally { setToDelete(null); } } }} />
    </div>
  );
}
