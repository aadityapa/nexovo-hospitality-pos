import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, Trash2, QrCode, ClipboardList, Wrench, Users, Clock, X } from 'lucide-react';
import { useFloors, useTables, useTableMutations, useWaiters } from './hooks';
import { useOrder } from '@/features/orders/hooks';
import { usePermission } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useSurface';
import { canAddItems } from '@/utils/orderStatus';
import { PageHeader, Button, IconButton, Modal, ConfirmDialog, Input, Select, Switch, LoadingState, ErrorState, EmptyState, SearchInput, SegmentedControl, StatusBadge, StatusDot, KeyValue, Card, CardHeader } from '@/components/ui';
import { TableShape } from '@/components/graphics';
import { Reveal } from '@/components/motion';
import { ApiError } from '@/services/api/client';
import { TABLE_STATUS } from '@/config/statuses';
import { money } from '@/utils/money';
import { elapsedMinutes, fmtTime } from '@/utils/date';
import { cn } from '@/utils/cn';
import type { DiningTable, Floor, TableInput, TableStatus } from '@/types';

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

/** The statuses a table can actually be in. `CLOSED` is a configuration state, not a floor state. */
const LEGEND_STATUSES = (Object.keys(TABLE_STATUS) as TableStatus[]).filter((s) => s !== 'CLOSED');

/** "1h 20m" / "35m" from a real timestamp the record carries. Never called without one. */
const occupiedFor = (mins: number) => (mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`);

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

/**
 * THE STATUS LEGEND.
 *
 * Colour is never the only signal on the plan itself — every tile also prints its status in words —
 * so the legend is a compact dot-and-label row rather than a stack of full badges. The counts
 * beside each state are counts of the tables currently on screen.
 */
function StatusLegend({ tables }: { tables: DiningTable[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1.5" aria-label="Table status legend">
      {LEGEND_STATUSES.map((s) => (
        <li key={s} className="inline-flex items-center gap-1.5 text-caption text-neutral-600 whitespace-nowrap">
          <StatusDot tone={TABLE_STATUS[s].tone} />
          {TABLE_STATUS[s].label}
          <span className="tnum text-neutral-400">{tables.filter((t) => t.status === s).length}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * ONE TABLE ON THE PLAN.
 *
 * The shape is drawn from the table's REAL capacity (and would take a shape column if the data
 * ever grew one); the tone and the words both come from its real status. The button carries the
 * whole thing as one accessible name, so a screen-reader user never has to assemble it from
 * fragments.
 */
function TableTile({ t, selected, onSelect }: { t: DiningTable; selected: boolean; onSelect: () => void }) {
  const meta = TABLE_STATUS[t.status];
  const mins = t.occupiedSince ? elapsedMinutes(t.occupiedSince) : null;
  const label = [
    t.name,
    meta.label,
    `${t.capacity} seats`,
    t.floorName,
    t.isVip ? 'VIP table' : null,
    t.assignedWaiterName ? `waiter ${t.assignedWaiterName}` : null,
    t.activeOrderTotal != null ? `running total ${money(t.activeOrderTotal)}` : null,
    mins != null ? `occupied ${occupiedFor(mins)}` : null,
  ].filter(Boolean).join(', ');

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={label}
      className={cn(
        'group w-full min-w-0 rounded-md border bg-surface-raised px-2 py-3 flex flex-col items-center text-center gap-1',
        'transition-[border-color,box-shadow] duration-control press hover:shadow-panel',
        /* A VIP table carries the one violet in the system, as a barely-there wash. */
        t.isVip && 'bg-vip-sheen bg-surface-raised',
        selected ? 'border-primary-500 ring-2 ring-primary-500/30' : 'border-neutral-200 hover:border-neutral-300',
      )}
    >
      <TableShape
        label={t.number}
        capacity={t.capacity}
        tone={meta.tone}
        statusLabel={meta.label}
        selected={selected}
        vip={t.isVip}
        hideStatusLabel
        ariaLabel={t.name}
        shapeClassName="h-20 w-20"
      />
      <span className="block w-full truncate font-semibold text-neutral-900 leading-tight">{t.name}</span>
      <span className="inline-flex items-center gap-1 text-caption text-neutral-500">
        <Users className="h-3 w-3" aria-hidden />
        <span className="tnum">{t.capacity}</span> seat{t.capacity === 1 ? '' : 's'}
      </span>
      <StatusBadge kind="table" status={t.status} size="sm" />
      {(t.activeOrderTotal != null || mins != null) && (
        <span className="flex w-full items-center justify-center gap-2 text-caption">
          {t.activeOrderTotal != null && <span className="tnum font-semibold text-neutral-900">{money(t.activeOrderTotal)}</span>}
          {mins != null && (
            <span className={cn('inline-flex items-center gap-0.5 tnum', mins >= 90 ? 'text-warning-700 font-medium' : 'text-neutral-500')}>
              <Clock className="h-3 w-3" aria-hidden />{occupiedFor(mins)}
            </span>
          )}
        </span>
      )}
    </button>
  );
}

/**
 * THE SELECTED TABLE.
 *
 * Every figure here is a field the table record actually carries. The record holds no guest name
 * and no item count — those live on the order, which this screen does not fetch — so neither is
 * printed, and "occupied for" appears only when `occupiedSince` is set. The actions are exactly
 * the ones this screen has always offered.
 */
function TableDetailPanel({ table, onClose }: { table: DiningTable; onClose: () => void }) {
  const canManage = usePermission('tables:manage');
  const canOverride = usePermission('tables:status:override');
  const navigate = useNavigate();
  const waiters = useWaiters();
  const { overrideStatus, assign, removeTable } = useTableMutations();
  const [edit, setEdit] = useState(false);
  const [del, setDel] = useState(false);
  const [status, setStatus] = useState<TableStatus>(table.status);
  const [reason, setReason] = useState('');
  const mins = table.occupiedSince ? elapsedMinutes(table.occupiedSince) : null;

  return (
    <>
      <Card className="xl:sticky xl:top-[76px]">
        <CardHeader
          title={table.name}
          subtitle={`${table.floorName} · ${table.capacity} seat${table.capacity === 1 ? '' : 's'}`}
          action={<IconButton size="sm" label={`Close details for ${table.name}`} onClick={onClose}><X className="h-4 w-4" /></IconButton>}
        />

        <KeyValue items={[
          { label: 'Status', value: <StatusBadge kind="table" status={table.status} size="sm" /> },
          { label: 'Area', value: table.floorName },
          { label: 'Seats', value: <span className="tnum">{table.capacity}</span> },
          ...(mins != null ? [{ label: 'Occupied for', value: <span className="tnum">{occupiedFor(mins)} <span className="text-neutral-500 font-normal">since {fmtTime(table.occupiedSince)}</span></span> }] : []),
          { label: 'Waiter', value: table.assignedWaiterName ?? <span className="text-neutral-500">Unassigned</span> },
          { label: 'Active order', value: table.activeOrderNumber ?? <span className="text-neutral-500">—</span> },
          { label: 'Running total', value: table.activeOrderTotal != null ? <span className="tnum font-semibold">{money(table.activeOrderTotal)}</span> : <span className="text-neutral-500">—</span> },
          ...(table.isVip ? [{ label: 'Classification', value: <span className="text-accent-700 font-medium">VIP table</span> }] : []),
        ]} />

        <div className="mt-4 pt-4 border-t border-neutral-200 flex flex-wrap gap-2">
          {table.activeOrderId && <Button leftIcon={<ClipboardList className="h-4 w-4" />} onClick={() => navigate(`/admin/orders/${table.activeOrderId}`)}>Open order</Button>}
          <Button variant="outline" leftIcon={<QrCode className="h-4 w-4" />} onClick={() => navigate(`/admin/qr?table=${table.id}`)}>QR code</Button>
          {canManage && <Button variant="outline" leftIcon={<Pencil className="h-4 w-4" />} onClick={() => setEdit(true)}>Edit</Button>}
          {canManage && <Button variant="ghost" className="text-danger-700" leftIcon={<Trash2 className="h-4 w-4" />} onClick={() => setDel(true)}>Delete</Button>}
        </div>

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
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-2 sm:items-end">
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
      </Card>

      {edit && <TableForm open onClose={() => { setEdit(false); onClose(); }} editing={table} />}
      <ConfirmDialog open={del} onClose={() => setDel(false)} variant="danger" title={`Delete ${table.name}?`} message="Tables with an active order cannot be deleted. Historical orders keep referencing this table." confirmLabel="Delete" loading={removeTable.isPending} onConfirm={async () => { try { await removeTable.mutateAsync(table.id); onClose(); } finally { setDel(false); } }} />
    </>
  );
}

/**
 * THE SELECTED TABLE — MANAGER WORKSPACE (board 02 panel 07).
 *
 * The manager board draws this panel as the ORDER rather than as the table record: covers, the
 * order number, the order's own lines with their quantities and prices, the running total, then
 * *View order* and a gold *Add items*. None of that lives on `DiningTable`, so the order itself
 * is read — through the orders feature's existing `useOrder` hook and its existing
 * `['orders','one',id]` cache entry, so a manager selecting a table shares the cache with the
 * order screens instead of introducing a second copy of the same truth.
 *
 * NOTHING IS FILLED IN WHILE IT LOADS. The lines block shows the shared loading state, an error
 * shows the shared error state with its retry, a table with no active order prints no order
 * block at all, and cancelled lines are counted rather than silently dropped.
 *
 * WHAT DID NOT CHANGE: every control the shared panel offers is still here and still gated on
 * exactly the same permission. A workspace selects the composition; it grants nothing.
 */
function ManagerTableDetailPanel({ table, onClose }: { table: DiningTable; onClose: () => void }) {
  const canManage = usePermission('tables:manage');
  const canOverride = usePermission('tables:status:override');
  const canCreate = usePermission('orders:create');
  const navigate = useNavigate();
  const waiters = useWaiters();
  const { overrideStatus, assign, removeTable } = useTableMutations();
  const [edit, setEdit] = useState(false);
  const [del, setDel] = useState(false);
  const [status, setStatus] = useState<TableStatus>(table.status);
  const [reason, setReason] = useState('');
  const mins = table.occupiedSince ? elapsedMinutes(table.occupiedSince) : null;

  /* `enabled: !!id` inside the hook, so a table with no open order makes no request. */
  const order = useOrder(table.activeOrderId ?? undefined);
  const all = order.data?.items ?? [];
  const lines = all.filter((i) => i.status !== 'CANCELLED');
  const cancelledLines = all.length - lines.length;
  /* The same order-status rule the order screen uses — not a second derivation of it. */
  const addable = table.activeOrderStatus ? canAddItems(table.activeOrderStatus) : true;

  return (
    <>
      <Card className="xl:sticky xl:top-[76px]">
        <CardHeader
          title={table.name}
          subtitle={`${table.floorName} · ${table.capacity} seat${table.capacity === 1 ? '' : 's'}`}
          action={<IconButton size="sm" label={`Close details for ${table.name}`} onClick={onClose}><X className="h-4 w-4" /></IconButton>}
        />

        <KeyValue items={[
          { label: 'Status', value: <StatusBadge kind="table" status={table.status} size="sm" /> },
          /* Covers come from the ORDER, which is the only record that carries them. */
          ...(order.data ? [{ label: 'Guests', value: <span className="tnum inline-flex items-center gap-1"><Users className="h-3.5 w-3.5 text-neutral-400" aria-hidden />{order.data.guestCount}</span> }] : []),
          ...(mins != null ? [{ label: 'Occupied for', value: <span className="tnum">{occupiedFor(mins)} <span className="text-neutral-500 font-normal">since {fmtTime(table.occupiedSince)}</span></span> }] : []),
          { label: 'Waiter', value: table.assignedWaiterName ?? <span className="text-neutral-500">Unassigned</span> },
          { label: 'Order number', value: table.activeOrderNumber ?? <span className="text-neutral-500">No open order</span> },
          ...(table.isVip ? [{ label: 'Classification', value: <span className="text-accent-700 font-medium">VIP table</span> }] : []),
        ]} />

        {table.activeOrderId && (
          <section className="mt-4 pt-4 border-t border-neutral-200" aria-label={`Lines on ${table.activeOrderNumber ?? 'the open order'}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 mb-2">
              <h3 className="text-label text-neutral-700">On this order</h3>
              {order.data && <span className="text-caption text-neutral-500 tnum">{order.data.itemCount} item{order.data.itemCount === 1 ? '' : 's'}</span>}
            </div>

            {order.isLoading && <LoadingState rows={3} />}
            {order.isError && <ErrorState compact error={order.error} onRetry={() => void order.refetch()} />}

            {order.data && (lines.length === 0 ? (
              <p className="text-caption text-neutral-500">Nothing has been added to this order yet.</p>
            ) : (
              <ul className="divide-y divide-neutral-200">
                {lines.map((i) => (
                  <li key={i.id} className="py-2 flex items-start gap-2.5 min-w-0">
                    <span className="tnum text-sm font-semibold text-neutral-500 w-7 shrink-0">×{i.quantity}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-neutral-900 break-words leading-snug">{i.itemName}</span>
                      {i.notes && <span className="block text-caption text-warning-700 break-words">{i.notes}</span>}
                    </span>
                    <span className="tnum text-sm font-medium text-neutral-900 shrink-0">{money(i.lineTotal)}</span>
                  </li>
                ))}
              </ul>
            ))}

            {cancelledLines > 0 && (
              <p className="mt-1.5 text-caption text-neutral-500">
                {cancelledLines} cancelled line{cancelledLines === 1 ? '' : 's'} are not listed — they stay on the order record.
              </p>
            )}

            {table.activeOrderTotal != null && (
              <div className="mt-2 pt-2.5 border-t border-neutral-200 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-label text-neutral-700">Running total · before tax</span>
                <span className="text-metric tnum text-neutral-900 leading-none">{money(table.activeOrderTotal)}</span>
              </div>
            )}
          </section>
        )}

        {/* One gold action, and it is the one the board draws: put more on this table's order. */}
        <div className="mt-4 pt-4 border-t border-neutral-200 flex flex-wrap gap-2">
          {table.activeOrderId && <Button variant="outline" leftIcon={<ClipboardList className="h-4 w-4" />} onClick={() => navigate(`/admin/orders/${table.activeOrderId}`)}>View order</Button>}
          {canCreate && addable && (
            /* Order entry lives in the waiter shell for every role — the same path the order
               screen sends an admin, a manager and a waiter to. */
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => navigate(`/waiter/tables/${table.id}`)}>
              {table.activeOrderId ? 'Add items' : 'Start order'}
            </Button>
          )}
          <Button variant="outline" leftIcon={<QrCode className="h-4 w-4" />} onClick={() => navigate(`/admin/qr?table=${table.id}`)}>QR code</Button>
          {canManage && <Button variant="ghost" leftIcon={<Pencil className="h-4 w-4" />} onClick={() => setEdit(true)}>Edit</Button>}
          {canManage && <Button variant="ghost" className="text-danger-700" leftIcon={<Trash2 className="h-4 w-4" />} onClick={() => setDel(true)}>Delete</Button>}
        </div>

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
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-2 sm:items-end">
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
      </Card>

      {edit && <TableForm open onClose={() => { setEdit(false); onClose(); }} editing={table} />}
      <ConfirmDialog open={del} onClose={() => setDel(false)} variant="danger" title={`Delete ${table.name}?`} message="Tables with an active order cannot be deleted. Historical orders keep referencing this table." confirmLabel="Delete" loading={removeTable.isPending} onConfirm={async () => { try { await removeTable.mutateAsync(table.id); onClose(); } finally { setDel(false); } }} />
    </>
  );
}

export default function TablesPage() {
  const ws = useWorkspace();
  const canManage = usePermission('tables:manage');
  const floors = useFloors();
  const [floorId, setFloorId] = useState<number | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const tables = useTables({ floorId: floorId === 'ALL' ? undefined : floorId, search: search || undefined });
  const [selected, setSelected] = useState<DiningTable | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const list = tables.data ?? [];
  const counts = tables.data ? { total: list.length, available: list.filter((t) => t.status === 'AVAILABLE').length } : null;
  /* Keep the panel on the live copy of the record, so a status change lands in it immediately. */
  const current = selected ? list.find((t) => t.id === selected.id) ?? selected : null;

  /**
   * Grouped by area, in the venue's own order. `DiningTable` carries no coordinates, so this is a
   * deterministic grid and says so in the caption — a drawn room would invent a layout an
   * operator might then trust.
   */
  const areas: Pick<Floor, 'id' | 'name'>[] = floors.data?.length
    ? floors.data
    : [...new Map(list.map((t) => [t.floorId, { id: t.floorId, name: t.floorName }] as const)).values()];
  const groups = areas
    .map((f) => ({ id: f.id, name: f.name, tables: list.filter((t) => t.floorId === f.id) }))
    .filter((g) => g.tables.length);

  return (
    <div>
      <PageHeader
        title="Tables"
        subtitle={counts ? `${counts.available} of ${counts.total} available` : 'Floor plan and live table status'}
        actions={canManage && <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setFormOpen(true)}>New table</Button>}
      >
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
          <SegmentedControl
            size="sm"
            ariaLabel="Filter the floor plan by area"
            value={String(floorId)}
            onChange={(v) => setFloorId(v === 'ALL' ? 'ALL' : Number(v))}
            options={[{ value: 'ALL', label: 'All areas', count: (floors.data ?? []).reduce((n, f) => n + (f.tableCount ?? 0), 0) || undefined }, ...(floors.data ?? []).map((f) => ({ value: String(f.id), label: f.name, count: f.tableCount }))]}
          />
          <SearchInput value={search} onChange={setSearch} placeholder="Find table" className="lg:w-56" />
        </div>
      </PageHeader>

      {tables.isLoading && <LoadingState variant="cards" rows={3} />}
      {tables.isError && <ErrorState error={tables.error} onRetry={() => void tables.refetch()} />}

      {tables.data && (
        /* The plan and its detail panel. Below `xl` the panel comes FIRST, so selecting a table on
           a phone does not push the answer below a screen of tiles. */
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] xl:items-start">
          <Card className="min-w-0">
            <CardHeader
              className="mb-3"
              title="Floor plan"
              subtitle="Schematic layout — not to scale"
            />
            {/* The legend sits on its own row rather than in the header action: it is seven chips
                wide and a non-shrinking header action would push the card past a 360 px viewport. */}
            <div className="mb-5"><StatusLegend tables={list} /></div>
            {groups.length === 0 ? (
              <EmptyState
                compact
                title={search ? 'No tables match' : 'No tables yet'}
                description="Tables appear here once they are configured for this branch."
                action={canManage ? <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setFormOpen(true)}>New table</Button> : undefined}
              />
            ) : (
              <div className="space-y-7">
                {groups.map((g) => {
                  const free = g.tables.filter((t) => t.status === 'AVAILABLE').length;
                  return (
                    <section key={g.id} aria-label={g.name}>
                      <div className="flex items-baseline gap-2.5 mb-3">
                        <h3 className="text-subheading text-neutral-900">{g.name}</h3>
                        <span className="text-caption text-neutral-500 tnum">{free} of {g.tables.length} free</span>
                      </div>
                      <ul className="grid grid-cols-2 xs:grid-cols-3 md:grid-cols-4 2xl:grid-cols-5 gap-3">
                        {g.tables.map((t) => (
                          <li key={t.id} className="min-w-0">
                            <TableTile t={t} selected={current?.id === t.id} onSelect={() => setSelected(t)} />
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </div>
            )}
          </Card>

          {current && (
            <Reveal className="min-w-0 order-first xl:order-last">
              {/* The manager board draws this panel as the order; every other workspace keeps
                  the signed-off table panel, unchanged. */}
              {ws === 'manager' ? <ManagerTableDetailPanel table={current} onClose={() => setSelected(null)} /> : (
              <TableDetailPanel table={current} onClose={() => setSelected(null)} />
              )}
            </Reveal>
          )}
        </div>
      )}

      {formOpen && <TableForm open onClose={() => setFormOpen(false)} editing={null} defaultFloorId={floorId === 'ALL' ? undefined : floorId} />}
    </div>
  );
}
