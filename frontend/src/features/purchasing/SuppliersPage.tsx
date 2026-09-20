import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, Trash2, AlertCircle } from 'lucide-react';
import { useSuppliers, usePurchasingMutations } from '@/features/p2/hooks';
import { usePermission } from '@/hooks/useAuth';
import { useDebounce } from '@/hooks/useRealtime';
import { PageHeader, Button, IconButton, Modal, ConfirmDialog, Input, Select, Textarea, DataTable, StatusBadge, SearchInput, SegmentedControl, Badge, LoadingState, ErrorState, type Column } from '@/components/ui';
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
      <form onSubmit={handleSubmit(onSubmit)} className="grid sm:grid-cols-2 gap-4" noValidate>
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

export default function SuppliersPage() {
  const navigate = useNavigate();
  const canManage = usePermission('suppliers:manage');
  const [search, setSearch] = useState('');
  const dq = useDebounce(search, 250);
  const [status, setStatus] = useState<'ALL' | SupplierStatus>('ALL');
  const q = useSuppliers({ search: dq || undefined, status: status === 'ALL' ? undefined : status });
  const { deleteSupplier } = usePurchasingMutations();
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [open, setOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Supplier | null>(null);
  const rows = q.data ?? [];
  const owing = rows.filter((s) => s.outstanding > 0).length;
  const withOpenPos = rows.filter((s) => s.openPoCount > 0).length;

  /** Contact block: who to call, one tap on a phone. */
  const contact = (s: Supplier) => (
    <span className="block text-caption text-neutral-500">
      {s.contactPerson ?? s.code}
      {s.phone && (
        <>
          {' · '}
          <a href={`tel:${s.phone}`} onClick={(e) => e.stopPropagation()} className="text-primary-700 hover:underline underline-offset-2 font-medium">{s.phone}</a>
        </>
      )}
    </span>
  );

  const columns: Column<Supplier>[] = [
    { key: 'name', header: 'Supplier', sortValue: (s) => s.name, render: (s) => <span><span className="font-medium">{s.name}</span>{contact(s)}</span> },
    { key: 'due', header: 'Outstanding', align: 'right', sortValue: (s) => s.outstanding, render: (s) => (s.outstanding > 0
      ? <span className="inline-flex items-center justify-end gap-1.5 tabular-nums font-semibold text-danger-700"><AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />{money(s.outstanding)}</span>
      : <span className="tabular-nums text-neutral-500">Settled</span>) },
    { key: 'last', header: 'Last order', sortValue: (s) => s.lastReceiptAt ?? '', render: (s) => (s.lastReceiptAt
      ? <span title={fmtDate(s.lastReceiptAt)} className="text-neutral-700">{fmtRelative(s.lastReceiptAt)}</span>
      : <span className="text-neutral-400">Never ordered</span>) },
    { key: 'po', header: 'Open POs', align: 'center', hideBelow: 'md', sortValue: (s) => s.openPoCount, render: (s) => (s.openPoCount > 0 ? <Badge tone="info" size="sm">{s.openPoCount} open</Badge> : <span className="text-neutral-400">—</span>) },
    { key: 'terms', header: 'Terms', hideBelow: 'lg', sortValue: (s) => s.paymentTermsDays, render: (s) => `${s.paymentTermsDays} days` },
    { key: 'purchased', header: 'Purchased', align: 'right', hideBelow: 'lg', sortValue: (s) => s.totalPurchased, render: (s) => <span className="tabular-nums">{money(s.totalPurchased)}</span> },
    { key: 'paid', header: 'Paid', align: 'right', hideBelow: 'lg', render: (s) => <span className="tabular-nums">{money(s.totalPaid)}</span> },
    { key: 'status', header: 'Status', render: (s) => <StatusBadge kind="supplier" status={s.status} size="sm" /> },
    ...(canManage ? [{ key: 'actions', header: '', align: 'right' as const, render: (s: Supplier) => <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}><IconButton label="Edit" size="sm" onClick={() => { setEditing(s); setOpen(true); }}><Pencil className="h-4 w-4" /></IconButton><IconButton label="Delete" size="sm" className="text-danger-600" onClick={() => setToDelete(s)}><Trash2 className="h-4 w-4" /></IconButton></div> }] : []),
  ];

  const mobileCard = (s: Supplier) => (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0"><span className="block font-medium text-neutral-900 truncate">{s.name}</span>{contact(s)}</span>
        <StatusBadge kind="supplier" status={s.status} size="sm" />
      </div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-neutral-600">Last order {s.lastReceiptAt ? fmtRelative(s.lastReceiptAt) : 'never'}</span>
        {s.outstanding > 0
          ? <span className="inline-flex items-center gap-1.5 tabular-nums font-semibold text-danger-700"><AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />{money(s.outstanding)} due</span>
          : <span className="text-neutral-500">Settled</span>}
      </div>
      {s.openPoCount > 0 && <Badge tone="info" size="sm">{s.openPoCount} open PO{s.openPoCount === 1 ? '' : 's'}</Badge>}
      {canManage && (
        <div className="pt-1 flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <IconButton label="Edit" size="sm" onClick={() => { setEditing(s); setOpen(true); }}><Pencil className="h-4 w-4" /></IconButton>
          <IconButton label="Delete" size="sm" className="text-danger-600" onClick={() => setToDelete(s)}><Trash2 className="h-4 w-4" /></IconButton>
        </div>
      )}
    </div>
  );

  return (
    <div>
      <PageHeader title="Suppliers" subtitle="Who to call, what is outstanding" actions={canManage && <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setOpen(true); }}>New supplier</Button>}>
        <div className="flex flex-col sm:flex-row gap-2"><SearchInput value={search} onChange={setSearch} placeholder="Search name, code, contact" className="sm:w-72" /><SegmentedControl size="sm" ariaLabel="Filter suppliers by status" value={status} onChange={setStatus} options={[{ value: 'ALL', label: 'All' }, { value: 'ACTIVE', label: 'Active' }, { value: 'INACTIVE', label: 'Inactive' }, { value: 'BLOCKED', label: 'Blocked' }]} /></div>
      </PageHeader>
      {q.isLoading && <LoadingState variant="table" rows={5} />}
      {q.isError && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      {q.data && (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-sm text-neutral-600">
            <span className="tabular-nums">{rows.length} supplier{rows.length === 1 ? '' : 's'}</span>
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <AlertCircle className="h-3.5 w-3.5 text-danger-600 shrink-0" aria-hidden />{owing} with a balance due
            </span>
            <span className="tabular-nums">{withOpenPos} with open purchase orders</span>
          </div>
          <DataTable columns={columns} rows={rows} rowKey={(s) => s.id} mobileCard={mobileCard} onRowClick={(s) => navigate(`/admin/suppliers/${s.id}`)} initialSort={{ key: 'due', dir: 'desc' }} caption="Suppliers with contact, outstanding balance and last order" emptyTitle="No suppliers" emptyAction={canManage ? <Button onClick={() => setOpen(true)}>New supplier</Button> : undefined} />
        </>
      )}
      {open && <SupplierForm editing={editing} onClose={() => setOpen(false)} />}
      <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} variant="danger" title={`Delete ${toDelete?.name}?`} message="Suppliers with open purchase orders cannot be deleted. History is kept." confirmLabel="Delete" loading={deleteSupplier.isPending} onConfirm={async () => { if (toDelete) { try { await deleteSupplier.mutateAsync(toDelete.id); } finally { setToDelete(null); } } }} />
    </div>
  );
}
