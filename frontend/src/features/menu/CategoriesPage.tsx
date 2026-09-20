import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown, ChefHat, Wine } from 'lucide-react';
import { useCategories, useCategoryMutations, useMenuItems } from './hooks';
import { usePermission } from '@/hooks/useAuth';
import { PageHeader, Button, IconButton, Modal, ConfirmDialog, Input, Select, Textarea, Switch, Badge, LoadingState, ErrorState, EmptyState, Card } from '@/components/ui';
import { ApiError } from '@/services/api/client';
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
    <Modal open={open} onClose={onClose} title={editing ? 'Edit category' : 'New category'} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={handleSubmit(onSubmit)} loading={save.isPending}>{editing ? 'Save changes' : 'Create category'}</Button></>}>
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

export default function CategoriesPage() {
  const cats = useCategories(true);
  const items = useMenuItems({ includeInactive: true });
  const { remove, reorder } = useCategoryMutations();
  const canManage = usePermission('menu:manage');
  const [editing, setEditing] = useState<MenuCategory | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [toDelete, setToDelete] = useState<MenuCategory | null>(null);
  const list = cats.data ?? [];
  const countFor = (id: number) => items.data?.filter((i) => i.categoryId === id).length ?? 0;
  const move = (idx: number, dir: -1 | 1) => { const ids = list.map((c) => c.id); const j = idx + dir; if (j < 0 || j >= ids.length) return; [ids[idx], ids[j]] = [ids[j], ids[idx]]; reorder.mutate(ids); };

  return (
    <div>
      <PageHeader title="Menu categories" subtitle="Configure sections of the menu and their display order" actions={canManage && <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setFormOpen(true); }}>New category</Button>} />
      {cats.isLoading && <LoadingState variant="table" rows={6} />}
      {cats.isError && <ErrorState error={cats.error} onRetry={() => void cats.refetch()} />}
      {cats.data && (list.length === 0 ? <Card><EmptyState title="No categories yet" description="Create your first category, e.g. Starters or Cocktails." action={canManage && <Button onClick={() => setFormOpen(true)}>New category</Button>} /></Card> : (
        <Card padded={false}>
          <ul className="divide-y divide-neutral-100">
            {list.map((c, idx) => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                <span className="h-9 w-9 rounded-sm bg-neutral-100 text-neutral-600 flex items-center justify-center shrink-0">{c.prepLocation === 'BAR' ? <Wine className="h-4 w-4" /> : <ChefHat className="h-4 w-4" />}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium flex items-center gap-2">{c.name}{!c.isActive && <Badge tone="neutral" size="sm">Inactive</Badge>}</p>
                  <p className="text-caption text-neutral-500">{countFor(c.id)} items · {c.prepLocation === 'BAR' ? 'Bar' : 'Kitchen'}{c.description ? ` · ${c.description}` : ''}</p>
                </div>
                {canManage && (
                  <div className="flex items-center gap-1">
                    <IconButton label="Move up" size="sm" disabled={idx === 0 || reorder.isPending} onClick={() => move(idx, -1)}><ArrowUp className="h-4 w-4" /></IconButton>
                    <IconButton label="Move down" size="sm" disabled={idx === list.length - 1 || reorder.isPending} onClick={() => move(idx, 1)}><ArrowDown className="h-4 w-4" /></IconButton>
                    <IconButton label="Edit" size="sm" onClick={() => { setEditing(c); setFormOpen(true); }}><Pencil className="h-4 w-4" /></IconButton>
                    <IconButton label="Delete" size="sm" className="text-danger-600" onClick={() => setToDelete(c)}><Trash2 className="h-4 w-4" /></IconButton>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ))}
      {formOpen && <CategoryForm open onClose={() => setFormOpen(false)} editing={editing} />}
      <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} variant="danger" title={`Delete “${toDelete?.name}”?`} message="The category is soft-deleted and hidden everywhere. Categories with active items cannot be deleted." confirmLabel="Delete" loading={remove.isPending}
        onConfirm={async () => { if (toDelete) { try { await remove.mutateAsync(toDelete.id); } finally { setToDelete(null); } } }} />
    </div>
  );
}
