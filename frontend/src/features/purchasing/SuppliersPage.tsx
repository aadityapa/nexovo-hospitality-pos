import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, Trash2, AlertCircle } from 'lucide-react';
import { useSuppliers, usePurchasingMutations } from '@/features/p2/hooks';
import { usePermission } from '@/hooks/useAuth';
import { useDebounce } from '@/hooks/useRealtime';
import { useWorkspace } from '@/hooks/useSurface';
import { HeaderSearch } from '@/components/layout/Shell';
import { PageHeader, Button, IconButton, Modal, ConfirmDialog, Input, Select, Textarea, DataTable, StatusBadge, SearchInput, FilterSelect, Badge, Avatar, LoadingState, ErrorState, type Column } from '@/components/ui';
import { ApiError } from '@/services/api/client';
import { money } from '@/utils/money';
import { fmtDate, fmtRelative } from '@/utils/date';
import type { Supplier, SupplierInput, SupplierStatus } from '@/types';

const schema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(150), code: z.string().trim().max(20).optional(), contactPerson: z.string().max(100).optional(), phone: z.string().max(30).optional(),
  email: z.string().email('Enter a valid email').or(z.literal('')).optional(), address: z.string().max(400).optional(), gstNumber: z.string().max(30).optional(),
  paymentTermsDays: z.coerce.number().int().min(0, 'Cannot be negative').max(365), status: z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED']),
});
type Form = z.infer<typeof schema>;

export function SupplierForm({ editing, onClose }: { editing: Supplier | null; onClose: () => void }) {
  const { saveSupplier } = usePurchasingMutations();
  const { register, handleSubmit, setError, formState: { errors } } = useForm<Form>({ resolver: zodResolver(schema), values: { name: editing?.name ?? '', code: editing?.code ?? '', contactPerson: editing?.contactPerson ?? '', phone: editing?.phone ?? '', email: editing?.email ?? '', address: editing?.address ?? '', gstNumber: editing?.gstNumber ?? '', paymentTermsDays: editing?.paymentTermsDays ?? 30, status: editing?.status ?? 'ACTIVE' } });
  const onSubmit = async (v: Form) => {
    const body: SupplierInput = { name: v.name, code: v.code || undefined, contactPerson: v.contactPerson || undefined, phone: v.phone || undefined, email: v.email || undefined, address: v.address || undefined, gstNumber: v.gstNumber || undefined, paymentTermsDays: v.paymentTermsDays, status: v.status };
    try { await saveSupplier.mutateAsync({ id: editing?.id ?? null, body }); onClose(); } catch (e) { const err = ApiError.from(e); setError((err.errors.find((x) => x.field)?.field as keyof Form) ?? 'name', { message: err.message }); }
  };
  return (
    <Modal open onClose={onClose} size="lg" title={editing ? `Edit ${editing.name}` : 'New supplier'} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={handleSubmit(onSubmit)} loading={saveSupplier.isPending}>{editing ? 'Save changes' : 'Create supplier'}</Button></>}>
      <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 sm:grid-cols-2 gap-4" noValidate>
        <Input label="Supplier name" required autoFocus wrapperClassName="sm:col-span-2" error={errors.name?.message} {...register('name')} />
        <Input label="Code" placeholder="Auto" error={errors.code?.message} {...register('code')} />
        <Select label="Status" options={[{ value: 'ACTIVE', label: 'Active' }, { value: 'INACTIVE', label: 'Inactive' }, { value: 'BLOCKED', label: 'Blocked' }]} {...register('status')} />
        <Input label="Contact person" error={errors.contactPerson?.message} {...register('contactPerson')} />
        <Input label="Phone" error={errors.phone?.message} {...register('phone')} />
        <Input label="Email" type="email" error={errors.email?.message} {...register('email')} />
        <Input label="GST number" error={errors.gstNumber?.message} {...register('gstNumber')} />
        <Textarea label="Address" rows={2} wrapperClassName="sm:col-span-2" error={errors.address?.message} {...register('address')} />
        <Input label="Payment terms (days)" type="number" min={0} error={errors.paymentTermsDays?.message} {...register('paymentTermsDays')} />
      </form>
    </Modal>
  );
}

/** Client-side facet over a figure the list already carries. Never a second fetch. */
type Balance = 'ALL' | 'DUE' | 'SETTLED';

export default function SuppliersPage() {
  const ws = useWorkspace();
  const navigate = useNavigate();
  /*
   * §9 of the manager boards: a manager holds `suppliers:view` and NOT `suppliers:manage`, so the
   * *Add supplier* action, the row edit/delete and the empty-state create are all already absent
   * for them — the gate below is the only thing that decides it, and nothing on this screen was
   * added to work around it. The directory and the balances stay, which is the whole point of the
   * screen for a manager.
   */
  const canManage = usePermission('suppliers:manage');
  const [search, setSearch] = useState('');
  const dq = useDebounce(search, 250);
  const [status, setStatus] = useState<'ALL' | SupplierStatus>('ALL');
  const [balance, setBalance] = useState<Balance>('ALL');
  const q = useSuppliers({ search: dq || undefined, status: status === 'ALL' ? undefined : status });
  const { deleteSupplier } = usePurchasingMutations();
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [open, setOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Supplier | null>(null);
  const all = useMemo(() => q.data ?? [], [q.data]);
  const rows = useMemo(() => (
    balance === 'DUE' ? all.filter((s) => s.outstanding > 0)
      : balance === 'SETTLED' ? all.filter((s) => s.outstanding <= 0)
        : all
  ), [all, balance]);
  const owing = all.filter((s) => s.outstanding > 0).length;

  /**
   * IDENTITY. A rounded-square initials tile, the supplier, and its own code beneath — the
   * reference's directory row. `variant="record"` keeps the tile a quiet neutral: eight gold discs
   * down the left edge of a table would each be as loud as the page's primary action.
   */
  const supplierCell = (s: Supplier) => (
    <span className="flex items-center gap-3 min-w-0">
      <Avatar name={s.name} variant="record" square size="sm" />
      <span className="min-w-0">
        <span className="block font-medium text-neutral-900 truncate">{s.name}</span>
        <span className="block text-caption text-neutral-500 truncate">{s.code}</span>
      </span>
    </span>
  );

  /** Who to call, with the number one tap away underneath it. */
  const contactCell = (s: Supplier) => (
    <span className="block min-w-0">
      {s.contactPerson
        ? <span className="block text-neutral-800 truncate">{s.contactPerson}</span>
        : <span className="block text-neutral-400">No contact named</span>}
      {s.phone
        ? <a href={`tel:${s.phone}`} onClick={(e) => e.stopPropagation()} className="block text-caption text-neutral-500 hover:text-primary-700 hover:underline underline-offset-2">{s.phone}</a>
        : <span className="block text-caption text-neutral-400">No phone on file</span>}
    </span>
  );

  /* Money owed is the column this directory exists for, so it is right-aligned and tabular.
     A settled account prints a real ₹0 in the quiet rung rather than a word: the eye compares a
     column of figures far faster than a column of adjectives. */
  const outstandingCell = (s: Supplier) => (s.outstanding > 0
    ? <span className="inline-flex items-center justify-end gap-1.5 tabular-nums font-semibold text-danger-700"><AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />{money(s.outstanding)}</span>
    : <span className="tabular-nums text-neutral-500">{money(0)}</span>);

  const rowActions = (s: Supplier) => (
    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      <IconButton label={`Edit ${s.name}`} size="sm" onClick={() => { setEditing(s); setOpen(true); }}><Pencil className="h-4 w-4" /></IconButton>
      <IconButton label={`Delete ${s.name}`} size="sm" className="text-danger-700" onClick={() => setToDelete(s)}><Trash2 className="h-4 w-4" /></IconButton>
    </div>
  );

  const columns: Column<Supplier>[] = [
    { key: 'name', header: 'Supplier', sortValue: (s) => s.name, render: supplierCell },
    { key: 'contact', header: 'Contact', sortValue: (s) => s.contactPerson ?? '', render: contactCell },
    { key: 'last', header: 'Last order', hideBelow: 'lg', sortValue: (s) => s.lastReceiptAt ?? '', render: (s) => (s.lastReceiptAt
      ? <span title={fmtDate(s.lastReceiptAt)} className="text-neutral-700">{fmtRelative(s.lastReceiptAt)}</span>
      : <span className="text-neutral-400">Never ordered</span>) },
    { key: 'po', header: 'Open POs', align: 'center', hideBelow: 'lg', sortValue: (s) => s.openPoCount, render: (s) => (s.openPoCount > 0 ? <Badge tone="info" size="sm">{s.openPoCount} open</Badge> : <span className="text-neutral-400">—</span>) },
    { key: 'terms', header: 'Terms', hideBelow: 'lg', sortValue: (s) => s.paymentTermsDays, render: (s) => <span className="tabular-nums text-neutral-600">{s.paymentTermsDays} days</span> },
    { key: 'purchased', header: 'Purchased', align: 'right', hideBelow: 'lg', sortValue: (s) => s.totalPurchased, render: (s) => <span className="tabular-nums">{money(s.totalPurchased)}</span> },
    { key: 'paid', header: 'Paid', align: 'right', hideBelow: 'lg', sortValue: (s) => s.totalPaid, render: (s) => <span className="tabular-nums">{money(s.totalPaid)}</span> },
    { key: 'due', header: 'Outstanding', align: 'right', sortValue: (s) => s.outstanding, render: outstandingCell },
    { key: 'status', header: 'Status', sortValue: (s) => s.status, render: (s) => <StatusBadge kind="supplier" status={s.status} size="sm" /> },
    ...(canManage ? [{ key: 'actions', header: '', align: 'right' as const, render: rowActions }] : []),
  ];

  /**
   * THE MANAGER BOARD (panel 19) — the six columns the board draws, in its order: who they are,
   * who to call, what is owed, what is open, when they last delivered, and their status.
   *
   * The three ledger columns the admin keeps (terms, purchased to date, paid to date) are an
   * account history; a manager reads this screen to decide who to chase and who to order from, so
   * the money owed moves up beside the contact instead. Every cell is the same real field and the
   * same renderer — nothing is recomputed for this view.
   */
  const managerColumns: Column<Supplier>[] = [
    { key: 'name', header: 'Supplier', sortValue: (s) => s.name, render: supplierCell },
    { key: 'contact', header: 'Contact', sortValue: (s) => s.contactPerson ?? '', render: contactCell },
    { key: 'due', header: 'Outstanding', align: 'right', sortValue: (s) => s.outstanding, render: outstandingCell },
    { key: 'po', header: 'Open orders', align: 'center', hideBelow: 'md', sortValue: (s) => s.openPoCount, render: (s) => (s.openPoCount > 0 ? <Badge tone="info" size="sm">{s.openPoCount} open</Badge> : <span className="text-neutral-400">—</span>) },
    { key: 'last', header: 'Last order', hideBelow: 'lg', sortValue: (s) => s.lastReceiptAt ?? '', render: (s) => (s.lastReceiptAt
      ? <span title={fmtDate(s.lastReceiptAt)} className="text-neutral-700">{fmtRelative(s.lastReceiptAt)}</span>
      : <span className="text-neutral-400">Never ordered</span>) },
    { key: 'status', header: 'Status', sortValue: (s) => s.status, render: (s) => <StatusBadge kind="supplier" status={s.status} size="sm" /> },
    ...(canManage ? [{ key: 'actions', header: '', align: 'right' as const, render: rowActions }] : []),
  ];

  const mobileCard = (s: Supplier) => (
    <div className="flex items-start gap-3">
      <Avatar name={s.name} variant="record" square size="sm" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block font-medium text-neutral-900 truncate">{s.name}</span>
            <span className="block text-caption text-neutral-500 truncate">{s.contactPerson ?? s.code}{s.phone ? ` · ${s.phone}` : ''}</span>
          </span>
          <StatusBadge kind="supplier" status={s.status} size="sm" />
        </div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-neutral-600">Last order {s.lastReceiptAt ? fmtRelative(s.lastReceiptAt) : 'never'}</span>
          {outstandingCell(s)}
        </div>
        {s.openPoCount > 0 && <Badge tone="info" size="sm">{s.openPoCount} open PO{s.openPoCount === 1 ? '' : 's'}</Badge>}
        {canManage && <div className="pt-1">{rowActions(s)}</div>}
      </div>
    </div>
  );

  return (
    <div>
      {/* The page's own search, hoisted into the application header — which is where the reference
          puts it. It is not a global search: it filters this directory and says so. */}
      <HeaderSearch>
        <SearchInput value={search} onChange={setSearch} placeholder="Search suppliers, contact…" className="w-full max-w-md" />
      </HeaderSearch>

      <PageHeader
        title="Suppliers"
        subtitle="Who to call, what is outstanding"
        actions={canManage && <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setOpen(true); }}>Add supplier</Button>}
      >
        {/* Filters above the directory, on one wrapping row. Both are backed by data the list
            already holds: status is filtered server side, balance is a facet of the fetched rows. */}
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect
            ariaLabel="Filter suppliers by status"
            className="w-full sm:w-44"
            value={status}
            onChange={(e) => setStatus((e.target.value || 'ALL') as 'ALL' | SupplierStatus)}
            options={[{ value: 'ALL', label: 'All statuses' }, { value: 'ACTIVE', label: 'Active' }, { value: 'INACTIVE', label: 'Inactive' }, { value: 'BLOCKED', label: 'Blocked' }]}
          />
          <FilterSelect
            ariaLabel="Filter suppliers by outstanding balance"
            className="w-full sm:w-48"
            value={balance}
            onChange={(e) => setBalance((e.target.value || 'ALL') as Balance)}
            options={[{ value: 'ALL', label: 'Any balance' }, { value: 'DUE', label: 'Balance due' }, { value: 'SETTLED', label: 'Settled' }]}
          />
          <p className="text-caption text-neutral-500 tabular-nums sm:ml-auto" aria-live="polite">
            {rows.length} supplier{rows.length === 1 ? '' : 's'}{owing > 0 ? ` · ${owing} with a balance due` : ''}
          </p>
        </div>
      </PageHeader>

      {q.isLoading && <LoadingState variant="table" rows={5} />}
      {q.isError && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      {q.data && (
        <DataTable
          columns={ws === 'manager' ? managerColumns : columns}
          rows={rows}
          rowKey={(s) => s.id}
          mobileCard={mobileCard}
          onRowClick={(s) => navigate(`/admin/suppliers/${s.id}`)}
          initialSort={{ key: 'due', dir: 'desc' }}
          caption="Suppliers with contact, outstanding balance and last order"
          emptyTitle={balance === 'DUE' ? 'Nothing outstanding' : 'No suppliers'}
          emptyDescription={balance === 'ALL' ? undefined : 'No suppliers match this filter.'}
          emptyAction={balance !== 'ALL'
            ? <Button variant="outline" onClick={() => setBalance('ALL')}>Show every supplier</Button>
            : canManage ? <Button variant="outline" onClick={() => { setEditing(null); setOpen(true); }}>Add supplier</Button> : undefined}
        />
      )}

      {open && <SupplierForm editing={editing} onClose={() => setOpen(false)} />}
      <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} variant="danger" title={`Delete ${toDelete?.name}?`} message="Suppliers with open purchase orders cannot be deleted. History is kept." confirmLabel="Delete" loading={deleteSupplier.isPending} onConfirm={async () => { if (toDelete) { try { await deleteSupplier.mutateAsync(toDelete.id); } finally { setToDelete(null); } } }} />
    </div>
  );
}
