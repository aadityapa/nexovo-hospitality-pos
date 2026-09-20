import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, Trash2, Layers, LayoutGrid, ChevronRight, CheckCircle2, Circle, AlertTriangle } from 'lucide-react';
import { useFloors, useTableMutations } from './hooks';
import { PageHeader, Button, IconButton, Modal, ConfirmDialog, Input, Switch, Badge, LoadingState, ErrorState, EmptyState, Card } from '@/components/ui';
import { ApiError } from '@/services/api/client';
import { cn } from '@/utils/cn';
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
    <Modal
      open onClose={onClose}
      title={editing ? `Edit “${editing.name}”` : 'New floor / area'}
      description="Areas group tables inside this branch. Every table belongs to exactly one area."
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={handleSubmit(onSubmit)} loading={saveFloor.isPending}>{editing ? 'Save changes' : 'Create area'}</Button></>}
    >
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Input label="Name" required autoFocus placeholder="Main Dining, Rooftop, VIP Lounge" error={errors.name?.message} {...register('name')} />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Code" placeholder="Auto" hint="Short identifier, must be unique" error={errors.code?.message} {...register('code')} />
          <Input label="Display order" type="number" min={0} hint="Lower numbers are listed first" error={errors.displayOrder?.message} {...register('displayOrder')} />
        </div>
        <Switch checked={watch('isActive')} onChange={(v) => setValue('isActive', v)} label="Active" description="Inactive areas stay in the system with their tables, but are no longer offered as a working section." />
      </form>
    </Modal>
  );
}

export default function FloorsPage() {
  const navigate = useNavigate();
  const floors = useFloors();
  const { removeFloor } = useTableMutations();
  const [editing, setEditing] = useState<Floor | null>(null);
  const [open, setOpen] = useState(false);
  const [del, setDel] = useState<Floor | null>(null);

  const list = floors.data ?? [];
  const activeCount = list.filter((f) => f.isActive).length;
  const totalTables = list.reduce((n, f) => n + (f.tableCount ?? 0), 0);
  const delCount = del?.tableCount ?? 0;

  return (
    <div>
      <PageHeader
        title="Floors & areas"
        subtitle="Branch → area → table. An area is where a table lives; its table count is the quickest check that the floor plan is complete."
        actions={<>
          <Button variant="outline" leftIcon={<LayoutGrid className="h-4 w-4" />} onClick={() => navigate('/admin/tables')}>All tables</Button>
          <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setOpen(true); }}>New area</Button>
        </>}
      />

      {floors.isLoading && <LoadingState variant="cards" rows={2} />}
      {floors.isError && <ErrorState error={floors.error} onRetry={() => void floors.refetch()} />}

      {floors.data && (list.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            icon={<Layers className="h-6 w-6" />}
            title="No areas yet"
            description="Tables cannot exist without an area. Create the first one — Main Dining, Bar Area or VIP Lounge — then add its tables."
            action={<Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setOpen(true); }}>New area</Button>}
          />
        </Card>
      ) : (
        <>
          <p className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-600">
            <span><span className="font-semibold text-neutral-900 tabular-nums">{list.length}</span> area{list.length === 1 ? '' : 's'}</span>
            <span aria-hidden>·</span>
            <span><span className="tabular-nums">{activeCount}</span> active</span>
            <span aria-hidden>·</span>
            <span><span className="font-semibold text-neutral-900 tabular-nums">{totalTables}</span> table{totalTables === 1 ? '' : 's'} across them</span>
          </p>

          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((f) => {
              const count = f.tableCount ?? 0;
              return (
                <li key={f.id}>
                  <Card padded={false} className={cn('h-full flex flex-col', !f.isActive && 'bg-neutral-50')}>
                    <div className="p-4 flex-1">
                      <div className="flex items-start gap-3">
                        <span className={cn('h-10 w-10 rounded-md flex items-center justify-center shrink-0', f.isActive ? 'bg-primary-50 text-primary-700' : 'bg-neutral-100 text-neutral-500')} aria-hidden>
                          <Layers className="h-5 w-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <h3 className={cn('font-semibold leading-snug break-words', f.isActive ? 'text-neutral-900' : 'text-neutral-600')}>{f.name}</h3>
                          <p className="text-caption text-neutral-500">Code {f.code || '—'} · display order {f.displayOrder}</p>
                        </div>
                        <Badge
                          tone={f.isActive ? 'success' : 'neutral'} size="sm"
                          icon={f.isActive ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : <Circle className="h-3.5 w-3.5" aria-hidden />}
                        >
                          {f.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>

                      <div className="mt-4 flex items-end justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-metric text-neutral-900 tabular-nums leading-none">{count}</p>
                          <p className="text-caption text-neutral-500 mt-1">table{count === 1 ? '' : 's'} in this area</p>
                        </div>
                        {count > 0 && (
                          <Link
                            to="/admin/tables"
                            className="min-h-touch inline-flex items-center gap-0.5 px-1 -mr-1 text-sm font-medium text-primary-700 rounded-sm hover:underline underline-offset-2"
                          >
                            Open tables
                            <ChevronRight className="h-4 w-4" aria-hidden />
                          </Link>
                        )}
                      </div>

                      {count === 0 && (
                        <p className="mt-3 flex items-start gap-2 rounded-sm border border-warning-200 bg-warning-50 px-3 py-2 text-caption text-warning-700">
                          <AlertTriangle className="h-4 w-4 shrink-0 mt-px" aria-hidden />
                          <span>
                            Empty area — guests cannot be seated here yet.{' '}
                            <Link to="/admin/tables" className="font-semibold underline underline-offset-2">Add tables</Link>
                          </span>
                        </p>
                      )}
                    </div>

                    <div className="border-t border-neutral-200 px-3 py-2 flex items-center justify-between gap-2">
                      <Button variant="outline" className="min-h-touch" leftIcon={<Pencil className="h-4 w-4" />} onClick={() => { setEditing(f); setOpen(true); }}>
                        Edit
                      </Button>
                      <IconButton
                        label={count > 0 ? `Delete ${f.name} — move or remove its ${count} table${count === 1 ? '' : 's'} first` : `Delete ${f.name}`}
                        className="text-danger-600"
                        disabled={count > 0}
                        onClick={() => setDel(f)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      ))}

      {open && <FloorForm onClose={() => { setOpen(false); setEditing(null); }} editing={editing} />}
      <ConfirmDialog
        open={!!del} onClose={() => setDel(null)} variant="danger"
        title={`Delete “${del?.name}”?`}
        message={delCount > 0
          ? `This area still has ${delCount} table${delCount === 1 ? '' : 's'}. Move or remove them first — the server will refuse the deletion while tables remain.`
          : 'The area is removed from the floor plan. Historical orders keep the area name they were placed under.'}
        confirmLabel="Delete" loading={removeFloor.isPending}
        onConfirm={async () => { if (del) { try { await removeFloor.mutateAsync(del.id); } finally { setDel(null); } } }}
      />
    </div>
  );
}
