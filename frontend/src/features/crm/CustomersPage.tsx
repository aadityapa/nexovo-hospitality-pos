import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, Trash2, ShieldCheck, Star } from 'lucide-react';
import { useCustomers, useCrmMutations } from '@/features/p2/hooks';
import { usePermission } from '@/hooks/useAuth';
import { useDebounce } from '@/hooks/useRealtime';
import { PageHeader, Button, IconButton, Modal, ConfirmDialog, Input, Textarea, Switch, DataTable, SearchInput, Badge, Avatar, LoadingState, ErrorState, type Column } from '@/components/ui';
import { ApiError } from '@/services/api/client';
import { money } from '@/utils/money';
import { fmtDate, fmtRelative } from '@/utils/date';
import type { Customer, CustomerInput } from '@/types';

const schema = z.object({
  fullName: z.string().trim().min(2, 'Name is required').max(150),
  phone: z.string().trim().min(8, 'Enter a valid phone number').max(30),
  email: z.string().email('Enter a valid email').or(z.literal('')).optional(),
  birthday: z.string().optional(), anniversary: z.string().optional(), tags: z.string().max(300).optional(), notes: z.string().max(500).optional(),
  consentMarketing: z.boolean(),
});
type Form = z.infer<typeof schema>;

export function CustomerForm({ editing, onClose, onSaved, initialName }: { editing: Customer | null; onClose: () => void; onSaved?: (c: Customer) => void; initialName?: string }) {
  const { saveCustomer } = useCrmMutations();
  const { register, handleSubmit, watch, setValue, setError, formState: { errors } } = useForm<Form>({ resolver: zodResolver(schema), values: { fullName: editing?.fullName ?? initialName ?? '', phone: editing?.phone ?? '', email: editing?.email ?? '', birthday: editing?.birthday ?? '', anniversary: editing?.anniversary ?? '', tags: editing?.tags ?? '', notes: editing?.notes ?? '', consentMarketing: editing?.consentMarketing ?? false } });
  const onSubmit = async (v: Form) => {
    const body: CustomerInput = { fullName: v.fullName, phone: v.phone, email: v.email || undefined, birthday: v.birthday || undefined, anniversary: v.anniversary || undefined, tags: v.tags || undefined, notes: v.notes || undefined, consentMarketing: v.consentMarketing };
    try { const c = await saveCustomer.mutateAsync({ id: editing?.id ?? null, body }); onSaved?.(c); onClose(); }
    catch (e) { const err = ApiError.from(e); setError((err.errors.find((x) => x.field)?.field as keyof Form) ?? (err.status === 409 ? 'phone' : 'fullName'), { message: err.message }); }
  };
  return (
    <Modal open onClose={onClose} size="lg" title={editing ? `Edit ${editing.fullName}` : 'New customer'} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={handleSubmit(onSubmit)} loading={saveCustomer.isPending}>{editing ? 'Save changes' : 'Create customer'}</Button></>}>
      <form onSubmit={handleSubmit(onSubmit)} className="grid sm:grid-cols-2 gap-4" noValidate>
        <Input label="Full name" required autoFocus error={errors.fullName?.message} {...register('fullName')} />
        <Input label="Phone" required inputMode="tel" hint="Unique per customer" error={errors.phone?.message} {...register('phone')} />
        <Input label="Email" type="email" error={errors.email?.message} {...register('email')} />
        <Input label="Tags" placeholder="regular, vip, corporate" error={errors.tags?.message} {...register('tags')} />
        <Input label="Birthday" type="date" error={errors.birthday?.message} {...register('birthday')} />
        <Input label="Anniversary" type="date" error={errors.anniversary?.message} {...register('anniversary')} />
        <Textarea label="Notes" rows={2} wrapperClassName="sm:col-span-2" error={errors.notes?.message} {...register('notes')} />
        <div className="sm:col-span-2 rounded-sm border border-neutral-200 p-3">
          <Switch checked={watch('consentMarketing')} onChange={(v) => setValue('consentMarketing', v)} label="Marketing consent" description="Explicit opt-in only. Birthday/anniversary offers and promotions are sent solely to consented customers; the timestamp of consent is stored." />
        </div>
      </form>
    </Modal>
  );
}

export default function CustomersPage() {
  const navigate = useNavigate();
  const canManage = usePermission('customers:manage');
  const [search, setSearch] = useState('');
  const dq = useDebounce(search, 250);
  const q = useCustomers({ search: dq || undefined, limit: 200 });
  const { deleteCustomer } = useCrmMutations();
  const [editing, setEditing] = useState<Customer | null>(null);
  const [open, setOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Customer | null>(null);
  const rows = q.data ?? [];
  const searching = dq.trim().length > 0;

  const tierBadge = (c: Customer) => (c.loyaltyTier
    ? <Badge size="sm" tone="accent" icon={<Star className="h-3 w-3" aria-hidden />}>{c.loyaltyTier}</Badge>
    : <span className="text-neutral-400">—</span>);

  const columns: Column<Customer>[] = [
    { key: 'name', header: 'Customer', sortValue: (c) => c.fullName, render: (c) => <span className="flex items-center gap-3"><Avatar name={c.fullName} size="sm" /><span className="min-w-0"><span className="font-medium">{c.fullName}</span><span className="block text-caption text-neutral-500 truncate">{c.phone}{c.email ? ` · ${c.email}` : ''}</span></span></span> },
    { key: 'visits', header: 'Visits', align: 'right', sortValue: (c) => c.totalVisits, render: (c) => <span className="tabular-nums font-medium">{c.totalVisits}</span> },
    { key: 'last', header: 'Last visit', sortValue: (c) => c.lastVisitAt ?? '', render: (c) => (c.lastVisitAt ? <span title={fmtDate(c.lastVisitAt)} className="text-neutral-700">{fmtRelative(c.lastVisitAt)}</span> : <span className="text-neutral-400">Never visited</span>) },
    { key: 'spend', header: 'Total spend', align: 'right', sortValue: (c) => c.totalSpend, render: (c) => <span className="tabular-nums font-medium">{money(c.totalSpend)}</span> },
    { key: 'avg', header: 'Avg spend', align: 'right', hideBelow: 'lg', render: (c) => <span className="tabular-nums text-neutral-600">{money(c.averageSpend)}</span> },
    { key: 'tier', header: 'Tier', sortValue: (c) => c.loyaltyTier ?? '', render: tierBadge },
    { key: 'points', header: 'Points', align: 'right', hideBelow: 'md', sortValue: (c) => c.loyaltyPoints, render: (c) => <span className="tabular-nums">{c.loyaltyPoints}</span> },
    { key: 'tags', header: 'Tags', hideBelow: 'lg', render: (c) => <span className="flex flex-wrap gap-1">{(c.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean).map((t) => <Badge key={t} size="sm">{t}</Badge>)}{c.consentMarketing && <Badge size="sm" tone="success" icon={<ShieldCheck className="h-3 w-3" />}>Opted in</Badge>}</span> },
    ...(canManage ? [{ key: 'actions', header: '', align: 'right' as const, render: (c: Customer) => <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}><IconButton label="Edit" size="sm" onClick={() => { setEditing(c); setOpen(true); }}><Pencil className="h-4 w-4" /></IconButton><IconButton label="Delete" size="sm" className="text-danger-600" onClick={() => setToDelete(c)}><Trash2 className="h-4 w-4" /></IconButton></div> }] : []),
  ];

  const mobileCard = (c: Customer) => (
    <div className="flex items-start gap-3">
      <Avatar name={c.fullName} size="sm" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block font-medium text-neutral-900 truncate">{c.fullName}</span>
            <span className="block text-caption text-neutral-500 truncate">{c.phone}</span>
          </span>
          {tierBadge(c)}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-neutral-600">
          <span className="tabular-nums">{c.totalVisits} visit{c.totalVisits === 1 ? '' : 's'}</span>
          <span>Last {c.lastVisitAt ? fmtRelative(c.lastVisitAt) : 'never'}</span>
          <span className="tabular-nums font-medium text-neutral-800">{money(c.totalSpend)}</span>
        </div>
        {canManage && (
          <div className="pt-1 flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <IconButton label="Edit" size="sm" onClick={() => { setEditing(c); setOpen(true); }}><Pencil className="h-4 w-4" /></IconButton>
            <IconButton label="Delete" size="sm" className="text-danger-600" onClick={() => setToDelete(c)}><Trash2 className="h-4 w-4" /></IconButton>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader title="Customers" subtitle="Find a guest by name or phone, then open the profile" actions={canManage && <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setOpen(true); }}>New customer</Button>}>
        {/* Search leads this screen: a host or cashier arrives with a name or a phone number. */}
        <div className="card p-3 sm:p-4">
          <SearchInput value={search} onChange={setSearch} autoFocus placeholder="Search name, phone or email" className="w-full" />
          <p className="text-caption text-neutral-500 mt-2" aria-live="polite">
            {q.isLoading ? 'Searching…'
              : searching ? `${rows.length} match${rows.length === 1 ? '' : 'es'} for “${dq.trim()}”`
                : `${rows.length} customer${rows.length === 1 ? '' : 's'} · type to narrow the list`}
          </p>
        </div>
      </PageHeader>
      {q.isLoading && <LoadingState variant="table" rows={6} />}
      {q.isError && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      {q.data && <DataTable
        columns={columns}
        rows={rows}
        rowKey={(c) => c.id}
        mobileCard={mobileCard}
        onRowClick={(c) => navigate(`/admin/customers/${c.id}`)}
        pageSize={25}
        initialSort={{ key: 'last', dir: 'desc' }}
        caption="Customers with visits, last visit, spend and loyalty tier"
        emptyTitle={searching ? `No guest matches “${dq.trim()}”` : 'No customers yet'}
        emptyDescription={searching ? 'Check the spelling, or create the guest now.' : 'Customers are created here or attached to an order by the waiter/cashier.'}
        emptyAction={canManage ? <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setOpen(true); }}>{searching ? `Create “${dq.trim()}”` : 'New customer'}</Button> : undefined}
      />}
      {open && <CustomerForm editing={editing} onClose={() => setOpen(false)} initialName={!editing && searching && rows.length === 0 ? dq.trim() : undefined} />}
      <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} variant="danger" title={`Delete ${toDelete?.fullName}?`} message="The profile is anonymised (name, phone, email and notes removed). Visit and loyalty history stays for reporting." confirmLabel="Delete & anonymise" loading={deleteCustomer.isPending} onConfirm={async () => { if (toDelete) { try { await deleteCustomer.mutateAsync(toDelete.id); } finally { setToDelete(null); } } }} />
    </div>
  );
}
