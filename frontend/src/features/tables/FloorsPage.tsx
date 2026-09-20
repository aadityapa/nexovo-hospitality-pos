import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, Trash2, Layers } from 'lucide-react';
import { useFloors, useTableMutations } from './hooks';
import { PageHeader, Button, IconButton, Modal, ConfirmDialog, Input, Switch, Badge, LoadingState, ErrorState, EmptyState, Card } from '@/components/ui';
import { ApiError } from '@/services/api/client';
import type { Floor, FloorInput } from '@/types';

const schema = z.object({ name: z.string().trim().min(2).max(100), code: z.string().trim().max(20).optional(), displayOrder: z.coerce.number().int().min(0), isActive: z.boolean() });
type Form = z.infer<typeof schema>;

function FloorForm({ onClose, editing }: { onClose: () => void; editing: Floor | null }) {
  const { saveFloor } = useTableMutations();
  const { register, handleSubmit, watch, setValue, setError, formState: { errors } } = useForm<Form>({ resolver: zodResolver(schema), values: { name: editing?.name ?? '', code: editing?.code ?? '', displayOrder: editing?.displayOrder ?? 0, isActive: editing?.isActive ?? true } });
  const onSubmit = async (v: Form) => {
    const body: FloorInput = { name: v.name, code: v.code || undefined, displayOrder: v.displayOrder, isActive: v.isActive };
    try { await saveFloor.mutateAsync({ id: editing?.id ?? null, body }); onClose(); } catch (e) { const err = ApiError.from(e); setError('name', { message: err.message }); }
  };
  return (
    <Modal open onClose={onClose} title={editing ? 'Edit floor / area' : 'New floor / area'} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={handleSubmit(onSubmit)} loading={saveFloor.isPending}>{editing ? 'Save' : 'Create'}</Button></>}>
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Input label="Name" required autoFocus placeholder="Main Dining, Rooftop, VIP Lounge" error={errors.name?.message} {...register('name')} />
        <div className="grid grid-cols-2 gap-4"><Input label="Code" placeholder="Auto" error={errors.code?.message} {...register('code')} /><Input label="Display order" type="number" min={0} error={errors.displayOrder?.message} {...register('displayOrder')} /></div>
        <Switch checked={watch('isActive')} onChange={(v) => setValue('isActive', v)} label="Active" />
      </form>
    </Modal>
  );
}

export default function FloorsPage() {
  const floors = useFloors();
  const { removeFloor } = useTableMutations();
  const [editing, setEditing] = useState<Floor | null>(null);
  const [open, setOpen] = useState(false);
  const [del, setDel] = useState<Floor | null>(null);
  return (
    <div>
      <PageHeader title="Floors & areas" subtitle="Branch → Floor/Area → Table" actions={<Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setOpen(true); }}>New area</Button>} />
      {floors.isLoading && <LoadingState variant="table" rows={4} />}
      {floors.isError && <ErrorState error={floors.error} onRetry={() => void floors.refetch()} />}
      {floors.data && (floors.data.length === 0 ? <Card><EmptyState icon={<Layers className="h-6 w-6" />} title="No areas yet" description="Create areas like Main Dining, Bar Area and VIP Lounge." action={<Button onClick={() => setOpen(true)}>New area</Button>} /></Card> : (
        <Card padded={false}><ul className="divide-y divide-neutral-100">{floors.data.map((f) => (
          <li key={f.id} className="flex items-center gap-3 px-4 py-3">
            <span className="h-9 w-9 rounded-sm bg-neutral-100 text-neutral-600 flex items-center justify-center"><Layers className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1"><p className="font-medium flex items-center gap-2">{f.name}{!f.isActive && <Badge size="sm">Inactive</Badge>}</p><p className="text-caption text-neutral-500">{f.code} · {f.tableCount ?? 0} tables · order {f.displayOrder}</p></div>
            <IconButton label="Edit" size="sm" onClick={() => { setEditing(f); setOpen(true); }}><Pencil className="h-4 w-4" /></IconButton>
            <IconButton label="Delete" size="sm" className="text-danger-600" onClick={() => setDel(f)}><Trash2 className="h-4 w-4" /></IconButton>
          </li>))}</ul></Card>
      ))}
      {open && <FloorForm onClose={() => setOpen(false)} editing={editing} />}
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} variant="danger" title={`Delete “${del?.name}”?`} message="Areas that still contain tables cannot be deleted." confirmLabel="Delete" loading={removeFloor.isPending} onConfirm={async () => { if (del) { try { await removeFloor.mutateAsync(del.id); } finally { setDel(null); } } }} />
    </div>
  );
}
