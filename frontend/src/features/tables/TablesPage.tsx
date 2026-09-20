import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, Trash2, QrCode, ClipboardList, Wrench } from 'lucide-react';
import { useFloors, useTables, useTableMutations, useWaiters } from './hooks';
import { TableGrid, TableStatusLegend } from './TableGrid';
import { usePermission } from '@/hooks/useAuth';
import { PageHeader, Button, Modal, ConfirmDialog, Input, Select, Switch, LoadingState, ErrorState, SearchInput, SegmentedControl, StatusBadge, KeyValue, Card } from '@/components/ui';
import { ApiError } from '@/services/api/client';
import { TABLE_STATUS } from '@/config/statuses';
import { money } from '@/utils/money';
import { fmtRelative } from '@/utils/date';
import type { DiningTable, TableInput, TableStatus } from '@/types';

const schema = z.object({
  floorId: z.coerce.number().int().positive('Select a floor'),
  number: z.string().trim().min(1, 'Table number is required').max(20),
  name: z.string().trim().max(60).optional(),
  capacity: z.coerce.number().int('Whole number').min(1, 'At least 1 seat').max(100),
  isActive: z.boolean(),
  // Phase 2 — VIP table defaults
  isVip: z.boolean(),
  minSpendDefault: z.coerce.number().min(0, '≥ 0'),
  depositDefault: z.coerce.number().min(0, '≥ 0'),
});
type Form = z.infer<typeof schema>;

export function TableForm({ open, onClose, editing, defaultFloorId }: { open: boolean; onClose: () => void; editing: DiningTable | null; defaultFloorId?: number }) {
  const floors = useFloors();
  const { saveTable } = useTableMutations();
  const { register, handleSubmit, watch, setValue, setError, formState: { errors } } = useForm<Form>({ resolver: zodResolver(schema), values: { floorId: editing?.floorId ?? defaultFloorId ?? 0, number: editing?.number ?? '', name: editing?.name ?? '', capacity: editing?.capacity ?? 4, isActive: editing?.isActive ?? true, isVip: editing?.isVip ?? false, minSpendDefault: editing?.minSpendDefault ?? 0, depositDefault: editing?.depositDefault ?? 0 } });
  const onSubmit = async (v: Form) => {
    const body: TableInput = { floorId: v.floorId, number: v.number, name: v.name || undefined, capacity: v.capacity, isActive: v.isActive, isVip: v.isVip, minSpendDefault: v.isVip ? v.minSpendDefault : 0, depositDefault: v.isVip ? v.depositDefault : 0 };
    try { await saveTable.mutateAsync({ id: editing?.id ?? null, body }); onClose(); }
    catch (e) { const err = ApiError.from(e); const f = err.errors.find((x) => x.field)?.field as keyof Form | undefined; if (f) setError(f, { message: err.message }); else if (err.status === 409) setError('number', { message: err.message }); }
  };
  return (
    <Modal open={open} onClose={onClose} title={editing ? `Edit ${editing.name}` : 'New table'} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={handleSubmit(onSubmit)} loading={saveTable.isPending}>{editing ? 'Save changes' : 'Create table'}</Button></>}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Select label="Floor / area" required placeholder="Select floor" options={(floors.data ?? []).map((f) => ({ value: f.id, label: f.name }))} error={errors.floorId?.message} {...register('floorId')} />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Table number" required autoFocus placeholder="12 / B3 / VIP1" hint="Must be unique" error={errors.number?.message} {...register('number')} />
          <Input label="Seating capacity" required type="number" min={1} error={errors.capacity?.message} {...register('capacity')} />
        </div>
        <Input label="Display name" placeholder="Defaults to “Table {number}”" error={errors.name?.message} {...register('name')} />
        <Switch checked={watch('isActive')} onChange={(v) => setValue('isActive', v)} label="Active" description="Inactive tables are hidden from waiters and their QR codes stop working." />
        <div className="rounded-sm border border-neutral-200 p-3 space-y-3">
          <Switch checked={watch('isVip')} onChange={(v) => setValue('isVip', v)} label="VIP table" description="Bookable from VIP tables with a minimum spend and deposit." />
          {watch('isVip') && <div className="grid grid-cols-2 gap-4">
            <Input label="Default minimum spend (₹)" type="number" min={0} error={errors.minSpendDefault?.message} {...register('minSpendDefault')} />
            <Input label="Default deposit (₹)" type="number" min={0} error={errors.depositDefault?.message} {...register('depositDefault')} />
          </div>}
        </div>
      </form>
    </Modal>
  );
}

function TableDetailModal({ table, onClose }: { table: DiningTable; onClose: () => void }) {
  const canManage = usePermission('tables:manage');
  const canOverride = usePermission('tables:status:override');
  const navigate = useNavigate();
  const waiters = useWaiters();
  const { overrideStatus, assign, removeTable } = useTableMutations();
  const [edit, setEdit] = useState(false);
  const [del, setDel] = useState(false);
  const [status, setStatus] = useState<TableStatus>(table.status);
  const [reason, setReason] = useState('');
  return (
    <>
      <Modal open onClose={onClose} title={table.name} description={`${table.floorName} · ${table.capacity} seats`} footer={<>
        {canManage && <Button variant="ghost" className="text-danger-700 sm:mr-auto" leftIcon={<Trash2 className="h-4 w-4" />} onClick={() => setDel(true)}>Delete</Button>}
        {canManage && <Button variant="outline" leftIcon={<Pencil className="h-4 w-4" />} onClick={() => setEdit(true)}>Edit</Button>}
        <Button variant="outline" leftIcon={<QrCode className="h-4 w-4" />} onClick={() => navigate(`/admin/qr?table=${table.id}`)}>QR code</Button>
        {table.activeOrderId && <Button leftIcon={<ClipboardList className="h-4 w-4" />} onClick={() => navigate(`/admin/orders/${table.activeOrderId}`)}>Open order</Button>}
      </>}>
        <KeyValue items={[
          { label: 'Status', value: <StatusBadge kind="table" status={table.status} /> },
          { label: 'Waiter', value: table.assignedWaiterName ?? 'Unassigned' },
          { label: 'Active order', value: table.activeOrderNumber ? `${table.activeOrderNumber} · ${money(table.activeOrderTotal)}` : '—' },
          { label: 'Occupied', value: table.occupiedSince ? fmtRelative(table.occupiedSince) : '—' },
        ]} />
        {canManage && (
          <div className="mt-5 pt-4 border-t border-neutral-200">
            <Select
              label="Assigned waiter"
              placeholder="Unassigned"
              value={table.assignedWaiterId ?? ''}
              disabled={assign.isPending}
              onChange={(e) => assign.mutate({ id: table.id, waiterId: e.target.value ? Number(e.target.value) : null })}
              options={(waiters.data ?? []).map((w) => ({ value: w.id, label: w.fullName }))}
              hint="Waiters see their own tables first on the floor plan."
            />
          </div>
        )}
        {canOverride && (
          <div className="mt-5 pt-4 border-t border-neutral-200">
            <p className="text-label text-neutral-700 mb-1.5 flex items-center gap-1.5">
              <Wrench className="h-3.5 w-3.5" aria-hidden />Manual status override
            </p>
            <p className="text-caption text-neutral-500 mb-3">
              Status normally follows the active order. Override only for exceptions such as reserved or out of service —
              setting “Available” returns the table to automatic mode.
            </p>
            <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
              <Select
                label="Status"
                value={status}
                onChange={(e) => setStatus(e.target.value as TableStatus)}
                options={(Object.keys(TABLE_STATUS) as TableStatus[]).map((s) => ({ value: s, label: TABLE_STATUS[s].label }))}
              />
              <Button
                variant="outline"
                className="mb-0"
                loading={overrideStatus.isPending}
                disabled={status === table.status}
                onClick={() => overrideStatus.mutate({ id: table.id, status, reason }, { onSuccess: onClose })}
              >
                Apply
              </Button>
            </div>
            <Input
              wrapperClassName="mt-3"
              label="Reason"
              placeholder="Recorded in the audit log"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        )}
      </Modal>
      {edit && <TableForm open onClose={() => { setEdit(false); onClose(); }} editing={table} />}
      <ConfirmDialog open={del} onClose={() => setDel(false)} variant="danger" title={`Delete ${table.name}?`} message="Tables with an active order cannot be deleted. Historical orders keep referencing this table." confirmLabel="Delete" loading={removeTable.isPending} onConfirm={async () => { try { await removeTable.mutateAsync(table.id); onClose(); } finally { setDel(false); } }} />
    </>
  );
}

export default function TablesPage() {
  const canManage = usePermission('tables:manage');
  const floors = useFloors();
  const [floorId, setFloorId] = useState<number | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const tables = useTables({ floorId: floorId === 'ALL' ? undefined : floorId, search: search || undefined });
  const [selected, setSelected] = useState<DiningTable | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const counts = tables.data ? { total: tables.data.length, available: tables.data.filter((t) => t.status === 'AVAILABLE').length } : null;

  return (
    <div>
      <PageHeader title="Tables" subtitle={counts ? `${counts.available} of ${counts.total} available` : 'Floor plan and live table status'} actions={canManage && <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setFormOpen(true)}>New table</Button>}>
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
          <SegmentedControl size="sm" value={String(floorId)} onChange={(v) => setFloorId(v === 'ALL' ? 'ALL' : Number(v))} options={[{ value: 'ALL', label: 'All areas' }, ...(floors.data ?? []).map((f) => ({ value: String(f.id), label: f.name, count: f.tableCount }))]} />
          <SearchInput value={search} onChange={setSearch} placeholder="Find table" className="lg:w-56" />
          <div className="lg:ml-auto"><TableStatusLegend /></div>
        </div>
      </PageHeader>
      {tables.isLoading && <LoadingState variant="cards" rows={3} />}
      {tables.isError && <ErrorState error={tables.error} onRetry={() => void tables.refetch()} />}
      {tables.data && <Card><TableGrid tables={tables.data} floors={floors.data} onSelect={setSelected} selectedId={selected?.id} emptyTitle={search ? 'No tables match' : 'No tables yet'} /></Card>}
      {selected && <TableDetailModal table={tables.data?.find((t) => t.id === selected.id) ?? selected} onClose={() => setSelected(null)} />}
      {formOpen && <TableForm open onClose={() => setFormOpen(false)} editing={null} defaultFloorId={floorId === 'ALL' ? undefined : floorId} />}
    </div>
  );
}
