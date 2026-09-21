import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, Trash2, ShieldCheck, Star } from 'lucide-react';
import { useCustomers, useCrmMutations } from '@/features/p2/hooks';
import { usePermission } from '@/hooks/useAuth';
import { useDebounce } from '@/hooks/useRealtime';
import { useWorkspace } from '@/hooks/useSurface';
import { HeaderSearch } from '@/components/layout/Shell';
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
      <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 sm:grid-cols-2 gap-4" noValidate>
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

/**
 * Tier colour comes from the tier the account actually holds, not from a rank we invented.
 * Gold takes the product's gold; the rest take neutral semantics. Violet is never used here —
 * it is reserved for VIP classification and a loyalty tier is not a VIP flag.
 */
const TIER_TONE: Record<string, 'primary' | 'neutral' | 'warning' | 'info'> = {
  GOLD: 'primary', PLATINUM: 'info', SILVER: 'neutral', BRONZE: 'warning',
};
const tierTone = (t: string) => TIER_TONE[t.trim().toUpperCase()] ?? 'neutral';
const tierLabel = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : t);

export default function CustomersPage() {
  const ws = useWorkspace();
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
    ? <Badge size="sm" tone={tierTone(c.loyaltyTier)} icon={<Star className="h-3 w-3" aria-hidden />}>{tierLabel(c.loyaltyTier)}</Badge>
    : <span className="text-neutral-400">—</span>);

  /** A guest is a person, so the tile stays a disc; suppliers and products are the squares. */
  const guestCell = (c: Customer) => (
    <span className="flex items-center gap-3 min-w-0">
      <Avatar name={c.fullName} variant="record" size="sm" />
      <span className="min-w-0">
        <span className="block font-medium text-neutral-900 truncate">{c.fullName}</span>
        <span className="block text-caption text-neutral-500 truncate">Last visit {c.lastVisitAt ? fmtRelative(c.lastVisitAt) : 'never'}</span>
      </span>
    </span>
  );

  /* Email leads where there is one, with the phone underneath; a guest with no email leads with
     the phone rather than with an empty line, because the phone is the field that is always set. */
  const contactCell = (c: Customer) => (
    <span className="block min-w-0">
      <span className="block text-neutral-800 truncate">{c.email ?? c.phone}</span>
      {c.email && <span className="block text-caption text-neutral-500 truncate">{c.phone}</span>}
    </span>
  );

  const rowActions = (c: Customer) => (
    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      <IconButton label={`Edit ${c.fullName}`} size="sm" onClick={() => { setEditing(c); setOpen(true); }}><Pencil className="h-4 w-4" /></IconButton>
      <IconButton label={`Delete ${c.fullName}`} size="sm" className="text-danger-700" onClick={() => setToDelete(c)}><Trash2 className="h-4 w-4" /></IconButton>
    </div>
  );

  const columns: Column<Customer>[] = [
    { key: 'name', header: 'Guest', sortValue: (c) => c.fullName, render: guestCell },
    { key: 'contact', header: 'Contact', sortValue: (c) => c.email ?? c.phone, render: contactCell },
    { key: 'visits', header: 'Visits', align: 'right', sortValue: (c) => c.totalVisits, render: (c) => <span className="tabular-nums font-medium">{c.totalVisits}</span> },
    { key: 'last', header: 'Last visit', hideBelow: 'lg', sortValue: (c) => c.lastVisitAt ?? '', render: (c) => (c.lastVisitAt ? <span title={fmtDate(c.lastVisitAt)} className="text-neutral-700">{fmtRelative(c.lastVisitAt)}</span> : <span className="text-neutral-400">Never visited</span>) },
    { key: 'spend', header: 'Total spend', align: 'right', sortValue: (c) => c.totalSpend, render: (c) => <span className="tabular-nums font-medium">{money(c.totalSpend)}</span> },
    { key: 'avg', header: 'Avg spend', align: 'right', hideBelow: 'lg', sortValue: (c) => c.averageSpend, render: (c) => <span className="tabular-nums text-neutral-600">{money(c.averageSpend)}</span> },
    { key: 'points', header: 'Points', align: 'right', hideBelow: 'lg', sortValue: (c) => c.loyaltyPoints, render: (c) => <span className="tabular-nums">{c.loyaltyPoints}</span> },
    { key: 'tier', header: 'Loyalty tier', sortValue: (c) => c.loyaltyTier ?? '', render: tierBadge },
    /* The product records no account status for a guest. What it DOES record is the marketing
       consent, and that is a state with legal weight — so that is what this column carries. */
    { key: 'consent', header: 'Marketing', sortValue: (c) => (c.consentMarketing ? 1 : 0), render: (c) => (c.consentMarketing
      ? <Badge size="sm" tone="success" icon={<ShieldCheck className="h-3 w-3" aria-hidden />}>Opted in</Badge>
      : <Badge size="sm" tone="neutral">Not opted in</Badge>) },
    { key: 'tags', header: 'Tags', hideBelow: 'lg', render: (c) => <span className="flex flex-wrap gap-1">{(c.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean).map((t) => <Badge key={t} size="sm">{t}</Badge>)}</span> },
    ...(canManage ? [{ key: 'actions', header: '', align: 'right' as const, render: rowActions }] : []),
  ];

  /**
   * THE MANAGER BOARD (panel 21) — guest, visits, total spend, points, tags, last visit.
   *
   * Two real differences from the admin directory. The identity cell leads with the guest's
   * EMAIL beneath the name rather than with a repeated last-visit line, because last visit has a
   * column of its own here; a guest with no email falls back to the phone, which is the field the
   * record always carries. And points and tags stop being `hideBelow="lg"` extras — they are what
   * a manager recognises a regular by, so they hold their own columns. Marketing consent, average
   * spend and tier are the back-office's account view and are left to it.
   */
  const managerColumns: Column<Customer>[] = [
    { key: 'name', header: 'Guest', sortValue: (c) => c.fullName, render: (c) => (
      <span className="flex items-center gap-3 min-w-0">
        <Avatar name={c.fullName} variant="record" size="sm" />
        <span className="min-w-0">
          <span className="block font-medium text-neutral-900 truncate">{c.fullName}</span>
          <span className="block text-caption text-neutral-500 truncate">{c.email ?? c.phone}</span>
        </span>
      </span>
    ) },
    { key: 'visits', header: 'Visits', align: 'right', sortValue: (c) => c.totalVisits, render: (c) => <span className="tabular-nums font-medium">{c.totalVisits}</span> },
    { key: 'spend', header: 'Total spend', align: 'right', sortValue: (c) => c.totalSpend, render: (c) => <span className="tabular-nums font-medium">{money(c.totalSpend)}</span> },
    { key: 'points', header: 'Points', align: 'right', sortValue: (c) => c.loyaltyPoints, render: (c) => <span className="tabular-nums">{c.loyaltyPoints}</span> },
    { key: 'tags', header: 'Tags', hideBelow: 'md', render: (c) => {
      const tags = (c.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean);
      return tags.length
        ? <span className="flex flex-wrap gap-1">{tags.map((t) => <Badge key={t} size="sm">{t}</Badge>)}</span>
        : <span className="text-neutral-400">—</span>;
    } },
    { key: 'last', header: 'Last visit', sortValue: (c) => c.lastVisitAt ?? '', render: (c) => (c.lastVisitAt ? <span title={fmtDate(c.lastVisitAt)} className="text-neutral-700">{fmtRelative(c.lastVisitAt)}</span> : <span className="text-neutral-400">Never visited</span>) },
    ...(canManage ? [{ key: 'actions', header: '', align: 'right' as const, render: rowActions }] : []),
  ];

  const mobileCard = (c: Customer) => (
    <div className="flex items-start gap-3">
      <Avatar name={c.fullName} variant="record" size="sm" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block font-medium text-neutral-900 truncate">{c.fullName}</span>
            <span className="block text-caption text-neutral-500 truncate">{c.email ?? c.phone}</span>
          </span>
          {tierBadge(c)}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-neutral-600">
          <span className="tabular-nums">{c.totalVisits} visit{c.totalVisits === 1 ? '' : 's'}</span>
          <span>Last {c.lastVisitAt ? fmtRelative(c.lastVisitAt) : 'never'}</span>
          <span className="tabular-nums font-medium text-neutral-800">{money(c.totalSpend)}</span>
        </div>
        {canManage && <div className="pt-1">{rowActions(c)}</div>}
      </div>
    </div>
  );

  return (
    <div>
      {/* A host or cashier arrives with a name or a phone number, so this screen's search is the
          first thing it offers — hoisted into the header, where the reference puts it. */}
      <HeaderSearch>
        <SearchInput value={search} onChange={setSearch} autoFocus placeholder="Search guests by name, phone or email…" className="w-full max-w-md" />
      </HeaderSearch>

      <PageHeader
        title="Customers"
        subtitle="Find a guest by name or phone, then open the profile"
        actions={canManage && <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setOpen(true); }}>Add customer</Button>}
      >
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p className="text-caption text-neutral-500" aria-live="polite">
            {q.isLoading ? 'Searching…'
              : searching ? `${rows.length} match${rows.length === 1 ? '' : 'es'} for “${dq.trim()}”`
                : 'Type in the header search to narrow the list'}
          </p>
          <p className="text-caption text-neutral-500">
            Total guests <span className="text-base font-semibold tabular-nums text-neutral-900 align-middle">{rows.length}</span>
          </p>
        </div>
      </PageHeader>

      {q.isLoading && <LoadingState variant="table" rows={6} />}
      {q.isError && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      {q.data && <DataTable
        columns={ws === 'manager' ? managerColumns : columns}
        rows={rows}
        rowKey={(c) => c.id}
        mobileCard={mobileCard}
        onRowClick={(c) => navigate(`/admin/customers/${c.id}`)}
        pageSize={25}
        initialSort={{ key: 'last', dir: 'desc' }}
        caption="Customers with visits, total spend and loyalty tier"
        emptyTitle={searching ? `No guest matches “${dq.trim()}”` : 'No customers yet'}
        emptyDescription={searching ? 'Check the spelling, or create the guest now.' : 'Customers are created here or attached to an order by the waiter/cashier.'}
        emptyAction={canManage ? <Button variant="outline" leftIcon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setOpen(true); }}>{searching ? `Create “${dq.trim()}”` : 'Add customer'}</Button> : undefined}
      />}
      {open && <CustomerForm editing={editing} onClose={() => setOpen(false)} initialName={!editing && searching && rows.length === 0 ? dq.trim() : undefined} />}
      <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} variant="danger" title={`Delete ${toDelete?.fullName}?`} message="The profile is anonymised (name, phone, email and notes removed). Visit and loyalty history stays for reporting." confirmLabel="Delete & anonymise" loading={deleteCustomer.isPending} onConfirm={async () => { if (toDelete) { try { await deleteCustomer.mutateAsync(toDelete.id); } finally { setToDelete(null); } } }} />
    </div>
  );
}
