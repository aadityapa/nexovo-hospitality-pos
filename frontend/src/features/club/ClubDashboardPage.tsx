import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { UserPlus, LogOut, X, Ticket, Users, Wallet, Crown, Settings2, Plus, Pencil } from 'lucide-react';
import { useClubDashboard, useClubEntries, useCoverTypes, useClubMutations, useCustomers, useVipTables, useStaff } from '@/features/p2/hooks';
import { useTables } from '@/features/tables/hooks';
import { usePermission } from '@/hooks/useAuth';
import { useRealtimeInvalidate } from '@/hooks/useRealtime';
import { PageHeader, Button, Card, CardHeader, StatCard, Modal, ConfirmDialog, Input, Select, Textarea, Switch, StatusBadge, StatusDot, statusMeta, Badge, SegmentedControl, SearchInput, LoadingState, ErrorState, EmptyState, IconButton, KeyValue } from '@/components/ui';
import { ApiError } from '@/services/api/client';
import { ENTRY_TYPE_LABELS, PAYMENT_METHOD_LABELS } from '@/config/statuses';
import { money } from '@/utils/money';
import { fmtTime, fmtRelative } from '@/utils/date';
import type { ClubEntry, CheckInInput, CoverChargeType, CoverChargeTypeInput, EntryStatus, EntryType, PaymentMethod } from '@/types';

const ENTRY_TYPES: EntryType[] = ['WALK_IN', 'GUEST_LIST', 'PREBOOKED', 'VIP'];
const COVER_TENDERS: PaymentMethod[] = ['CASH', 'UPI', 'CARD', 'COMPLIMENTARY'];

const checkInSchema = z.object({
  guestName: z.string().trim().min(2, 'Guest name is required'), phone: z.string().trim().max(30).optional(), guests: z.coerce.number().int().min(1).max(200),
  entryType: z.enum(['WALK_IN', 'GUEST_LIST', 'PREBOOKED', 'VIP']), coverTypeId: z.coerce.number().optional(), coverUnits: z.coerce.number().int().min(1).max(50),
  paymentMethod: z.enum(['CASH', 'UPI', 'CARD', 'COMPLIMENTARY']), hostUserId: z.coerce.number().optional(), tableId: z.coerce.number().optional(), customerId: z.coerce.number().optional(), notes: z.string().max(300).optional(),
});
type CheckInForm = z.infer<typeof checkInSchema>;

export function CheckInModal({ onClose }: { onClose: () => void }) {
  const { checkIn } = useClubMutations();
  const covers = useCoverTypes();
  const customers = useCustomers({ limit: 200 });
  const tables = useTables();
  const hosts = useStaff('HOST');
  const { register, handleSubmit, watch, setValue, setError, formState: { errors } } = useForm<CheckInForm>({ resolver: zodResolver(checkInSchema), defaultValues: { guestName: '', phone: '', guests: 1, entryType: 'WALK_IN', coverUnits: 1, paymentMethod: 'CASH', notes: '' } });
  const activeCovers = (covers.data ?? []).filter((c) => c.isActive);
  const cover = activeCovers.find((c) => c.id === Number(watch('coverTypeId')));
  const units = Number(watch('coverUnits')) || 1;
  const guests = Number(watch('guests')) || 1;
  const total = cover ? cover.amount * units : 0;
  const credit = cover ? cover.redeemableAmount * units : 0;
  const onSubmit = async (v: CheckInForm) => {
    const body: CheckInInput = { guestName: v.guestName, phone: v.phone || undefined, guests: v.guests, entryType: v.entryType, coverTypeId: v.coverTypeId || null, coverUnits: v.coverTypeId ? v.coverUnits : undefined, paymentMethod: v.coverTypeId ? v.paymentMethod : undefined, hostUserId: v.hostUserId || undefined, tableId: v.tableId || null, customerId: v.customerId || null, notes: v.notes || undefined };
    try { await checkIn.mutateAsync(body); onClose(); }
    catch (e) { const err = ApiError.from(e); setError((err.errors.find((x) => x.field)?.field as keyof CheckInForm) ?? 'guestName', { message: err.message }); }
  };
  return (
    <Modal open onClose={onClose} size="lg" title="Check in guests" description="Cover charge is collected at the door; the redeemable part becomes credit on the guest's bill." footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={handleSubmit(onSubmit)} loading={checkIn.isPending} leftIcon={<UserPlus className="h-4 w-4" />}>{cover ? `Collect ${money(total)} & check in` : 'Check in'}</Button></>}>
      <form onSubmit={handleSubmit(onSubmit)} className="grid sm:grid-cols-2 gap-4" noValidate>
        <Select label="Existing customer" placeholder="Walk-in / new guest" options={(customers.data ?? []).map((c) => ({ value: c.id, label: `${c.fullName} · ${c.phone}` }))} wrapperClassName="sm:col-span-2" {...register('customerId', { onChange: (e) => { const c = customers.data?.find((x) => x.id === Number(e.target.value)); if (c) { setValue('guestName', c.fullName); setValue('phone', c.phone); } } })} />
        <Input label="Guest / group name" required autoFocus error={errors.guestName?.message} {...register('guestName')} />
        <Input label="Phone" inputMode="tel" error={errors.phone?.message} {...register('phone')} />
        <Input label="Number of guests" required type="number" min={1} error={errors.guests?.message} {...register('guests')} />
        <Select label="Entry type" required options={ENTRY_TYPES.map((t) => ({ value: t, label: ENTRY_TYPE_LABELS[t] }))} error={errors.entryType?.message} {...register('entryType')} />
        <Select label="Cover charge" placeholder="No cover charge" options={activeCovers.map((c) => ({ value: c.id, label: `${c.name} · ${money(c.amount)}${c.redeemableAmount ? ` (${money(c.redeemableAmount)} redeemable)` : ''}` }))} error={errors.coverTypeId?.message} {...register('coverTypeId')} />
        <Input label="Cover units" type="number" min={1} disabled={!cover} hint={cover ? `${cover.guestsIncluded} guest${cover.guestsIncluded === 1 ? '' : 's'} per unit${cover.guestsIncluded * units < guests ? ' — fewer than guests entering' : ''}` : undefined} error={errors.coverUnits?.message} {...register('coverUnits')} />
        <Select label="Paid by" required disabled={!cover} options={COVER_TENDERS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] }))} {...register('paymentMethod')} />
        <Select label="Host / promoter" placeholder="None" options={(hosts.data ?? []).map((h) => ({ value: h.id, label: h.fullName }))} {...register('hostUserId')} />
        <Select label="Assign table" placeholder="No table" options={(tables.data ?? []).map((t) => ({ value: t.id, label: `${t.name}${t.isVip ? ' · VIP' : ''} · ${t.floorName}` }))} {...register('tableId')} />
        <Textarea label="Notes" rows={2} error={errors.notes?.message} {...register('notes')} />
        {cover && <div className="sm:col-span-2 rounded-md bg-neutral-50 border border-neutral-200 p-3 text-sm flex flex-wrap gap-x-6 gap-y-1"><span>Cover total <b className="tabular-nums">{money(total)}</b></span><span>Redeemable credit <b className="tabular-nums text-success-700">{money(credit)}</b></span><span className="text-neutral-500">Credit is applied on the payment screen by picking this entry.</span></div>}
      </form>
    </Modal>
  );
}

const coverSchema = z.object({ code: z.string().trim().min(2).max(20).regex(/^[A-Z0-9_-]+$/i, 'Letters, digits, - and _ only'), name: z.string().trim().min(2).max(80), amount: z.coerce.number().min(0), redeemableAmount: z.coerce.number().min(0), guestsIncluded: z.coerce.number().int().min(1).max(50), isActive: z.boolean() }).refine((v) => v.redeemableAmount <= v.amount, { path: ['redeemableAmount'], message: 'Cannot exceed the cover amount' });
type CoverForm = z.infer<typeof coverSchema>;

function CoverTypesModal({ onClose }: { onClose: () => void }) {
  const covers = useCoverTypes();
  const { saveCoverType } = useClubMutations();
  const [editing, setEditing] = useState<CoverChargeType | null | 'new'>(null);
  const target = editing === 'new' ? null : editing;
  const { register, handleSubmit, watch, setValue, setError, formState: { errors } } = useForm<CoverForm>({ resolver: zodResolver(coverSchema), values: { code: target?.code ?? '', name: target?.name ?? '', amount: target?.amount ?? 0, redeemableAmount: target?.redeemableAmount ?? 0, guestsIncluded: target?.guestsIncluded ?? 1, isActive: target?.isActive ?? true } });
  const onSubmit = async (v: CoverForm) => {
    const body: CoverChargeTypeInput = { code: v.code.toUpperCase(), name: v.name, amount: v.amount, redeemableAmount: v.redeemableAmount, guestsIncluded: v.guestsIncluded, isActive: v.isActive };
    try { await saveCoverType.mutateAsync({ id: target?.id ?? null, body }); setEditing(null); }
    catch (e) { const err = ApiError.from(e); setError((err.errors.find((x) => x.field)?.field as keyof CoverForm) ?? 'code', { message: err.message }); }
  };
  return (
    <Modal open onClose={onClose} size="lg" title="Cover charge types" description="Configure door charges; the redeemable amount becomes F&B credit for the guest." footer={<Button variant="outline" onClick={onClose}>Close</Button>}>
      {editing ? (
        <form onSubmit={handleSubmit(onSubmit)} className="grid sm:grid-cols-2 gap-4" noValidate>
          <Input label="Code" required placeholder="STD, LADIES, COUPLE" disabled={!!target} error={errors.code?.message} {...register('code')} />
          <Input label="Name" required error={errors.name?.message} {...register('name')} />
          <Input label="Amount (₹)" required type="number" min={0} error={errors.amount?.message} {...register('amount')} />
          <Input label="Redeemable on F&B (₹)" required type="number" min={0} error={errors.redeemableAmount?.message} {...register('redeemableAmount')} />
          <Input label="Guests included per unit" required type="number" min={1} error={errors.guestsIncluded?.message} {...register('guestsIncluded')} />
          <div className="self-end pb-2"><Switch checked={watch('isActive')} onChange={(v) => setValue('isActive', v)} label="Active" /></div>
          <div className="sm:col-span-2 flex justify-end gap-2"><Button variant="outline" onClick={() => setEditing(null)}>Back</Button><Button type="submit" loading={saveCoverType.isPending}>{target ? 'Save' : 'Create'}</Button></div>
        </form>
      ) : (
        <div>
          <div className="flex justify-end mb-3"><Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>New cover type</Button></div>
          {covers.isLoading ? <LoadingState rows={3} /> : (covers.data ?? []).length === 0 ? <EmptyState compact title="No cover charges configured" /> : (
            <ul className="divide-y divide-neutral-100 border border-neutral-200 rounded-md">{(covers.data ?? []).map((c) => <li key={c.id} className="flex items-center gap-3 px-4 py-3 text-sm"><span className="flex-1"><span className="font-medium">{c.name}</span> <span className="text-caption text-neutral-500">{c.code} · {c.guestsIncluded} guest{c.guestsIncluded === 1 ? '' : 's'}/unit</span></span><span className="tabular-nums">{money(c.amount)}</span><span className="tabular-nums text-success-700 w-24 text-right">{money(c.redeemableAmount)} credit</span>{!c.isActive && <Badge size="sm">Inactive</Badge>}<IconButton label="Edit" size="sm" onClick={() => setEditing(c)}><Pencil className="h-4 w-4" /></IconButton></li>)}</ul>
          )}
        </div>
      )}
    </Modal>
  );
}

export default function ClubDashboardPage() {
  const navigate = useNavigate();
  const canManage = usePermission('club:manage');
  const dash = useClubDashboard();
  const [status, setStatus] = useState<'ALL' | EntryStatus>('CHECKED_IN');
  const [search, setSearch] = useState('');
  const entries = useClubEntries({ status: status === 'ALL' ? undefined : status });
  const vip = useVipTables();
  const { checkOut, cancelEntry } = useClubMutations();
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [coversOpen, setCoversOpen] = useState(false);
  const [toCancel, setToCancel] = useState<ClubEntry | null>(null);
  const [reason, setReason] = useState('');
  useRealtimeInvalidate(['club', 'tables', 'orders']);
  const rows = useMemo(() => { const s = search.trim().toLowerCase(); return (entries.data ?? []).filter((e) => !s || e.guestName.toLowerCase().includes(s) || e.entryNumber.toLowerCase().includes(s) || (e.phone ?? '').includes(s)); }, [entries.data, search]);
  const d = dash.data;
  return (
    <div>
      <PageHeader title="Club" subtitle={d ? `Business day ${d.businessDate} (resets 06:00)` : 'Door, cover charges and guests inside'} actions={canManage && <><Button variant="outline" leftIcon={<Settings2 className="h-4 w-4" />} onClick={() => setCoversOpen(true)}>Cover types</Button><Button size="lg" leftIcon={<UserPlus className="h-5 w-5" />} onClick={() => setCheckInOpen(true)}>Check in</Button></>} />
      {dash.isLoading && <LoadingState variant="stats" />}
      {dash.isError && <ErrorState error={dash.error} onRetry={() => void dash.refetch()} />}
      {d && (
        <div className="grid gap-4 mb-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          {/* Door and floor first: how many people are in the room, how they got in,
              how much of the VIP floor is actually in use. */}
          {/* One column below 420 px: StatCard's row variant needs the full width, and a
              `col-span-2` inside a single-column grid would create an implicit second track
              and overflow the page. */}
          <div className="grid grid-cols-1 xs:grid-cols-2 xl:grid-cols-3 gap-3 xs:gap-4">
            <StatCard size="lg" label="Guests inside" value={d.guestsInside} icon={<Users className="h-5 w-5" />} tone="primary" hint={`${d.guestsTotal} entered today`} />
            <StatCard size="lg" label="Entries tonight" value={d.entries} icon={<Ticket className="h-5 w-5" />} tone="info" hint={`${d.vipEntries} VIP entr${d.vipEntries === 1 ? 'y' : 'ies'}`} />
            {/* Counts VIP RESERVATIONS that have been seated — a reservation fact, not a
                claim about every VIP table on the floor. */}
            <StatCard size="lg" label="VIP bookings seated" value={`${d.vipTables.filter((v) => v.status === 'SEATED').length} / ${d.vipTables.length}`} icon={<Crown className="h-5 w-5" />} tone="warning" hint="seated / booked tonight" onClick={() => navigate('/admin/vip')} className="xs:col-span-2 xl:col-span-1" />
          </div>
          {/* Money is context, not the door's job — grouped quietly instead of four more tiles. */}
          <Card className="min-w-0">
            <CardHeader className="mb-3" title={<span className="flex items-center gap-2"><Wallet className="h-4 w-4" aria-hidden />Takings today</span>} />
            <KeyValue items={[
              { label: 'Cover revenue', value: <span className="tabular-nums font-semibold">{money(d.coverRevenue)}</span> },
              { label: 'F&B sales', value: <span className="tabular-nums font-semibold">{money(d.fnbRevenue)}</span> },
              { label: 'Cover credit used', value: <span className="tabular-nums">{money(d.coverCreditUsed)}</span> },
              { label: 'Credit still open', value: <span className={d.coverCreditOpen > 0 ? 'tabular-nums text-warning-700 font-medium' : 'tabular-nums text-neutral-500'}>{money(d.coverCreditOpen)}</span> },
            ]} />
          </Card>
        </div>
      )}
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <Card padded={false}>
          <div className="px-4 py-3 border-b border-neutral-200 flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="min-w-0">
              <h2 className="text-subheading">Entries</h2>
              <p className="text-caption text-neutral-500 tabular-nums">
                {status === 'CHECKED_IN' ? 'Currently inside' : status === 'CHECKED_OUT' ? 'Already left' : status === 'CANCELLED' ? 'Cancelled at the door' : 'All entries today'}
                {entries.data ? ` · ${rows.length} shown` : ''}
              </p>
            </div>
            <SegmentedControl size="sm" value={status} onChange={setStatus} ariaLabel="Filter entries by status" options={[{ value: 'CHECKED_IN', label: 'Inside' }, { value: 'CHECKED_OUT', label: 'Left' }, { value: 'CANCELLED', label: 'Cancelled' }, { value: 'ALL', label: 'All' }]} />
            <SearchInput value={search} onChange={setSearch} placeholder="Name, phone, entry no." className="sm:ml-auto sm:w-56" />
          </div>
          {entries.isLoading ? <div className="p-4"><LoadingState rows={4} /></div> : entries.isError ? <ErrorState compact error={entries.error} onRetry={() => void entries.refetch()} /> : rows.length === 0 ? <EmptyState compact icon={<Ticket className="h-6 w-6" />} title="No entries" description={status === 'CHECKED_IN' ? 'Nobody is checked in right now.' : 'No entries match.'} action={canManage && status === 'CHECKED_IN' ? <Button onClick={() => setCheckInOpen(true)}>Check in</Button> : undefined} /> : (
            <ul className="divide-y divide-neutral-100">{rows.map((e) => (
              <li key={e.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2 flex-wrap"><span className="font-semibold">{e.guestName}</span><Badge size="sm" tone={e.entryType === 'VIP' ? 'warning' : 'neutral'}>{ENTRY_TYPE_LABELS[e.entryType]}</Badge><StatusBadge kind="entry" status={e.status} size="sm" /></span>
                  <span className="block text-caption text-neutral-500">{e.entryNumber} · {e.guests} guest{e.guests === 1 ? '' : 's'} · in {fmtTime(e.enteredAt)} ({fmtRelative(e.enteredAt)}){e.exitedAt ? ` · out ${fmtTime(e.exitedAt)}` : ''}{e.tableName ? ` · ${e.tableName}` : ''}{e.hostName ? ` · host ${e.hostName}` : ''}{e.phone ? ` · ${e.phone}` : ''}</span>
                </span>
                <span className="text-sm text-right shrink-0"><span className="block tabular-nums">{e.coverAmount ? `${money(e.coverAmount)} ${e.coverName ?? 'cover'}` : 'No cover'}{e.paymentMethod ? <span className="text-caption text-neutral-500"> · {PAYMENT_METHOD_LABELS[e.paymentMethod]}</span> : null}</span>{e.redeemableAmount > 0 && <span className={e.remainingCredit > 0 ? 'block text-caption text-success-700' : 'block text-caption text-neutral-500'}>credit {money(e.remainingCredit)} of {money(e.redeemableAmount)} left</span>}</span>
                {canManage && e.status === 'CHECKED_IN' && <span className="flex gap-1 justify-end shrink-0 [&>button]:min-h-touch sm:[&>button]:min-h-0"><Button size="sm" variant="outline" leftIcon={<LogOut className="h-4 w-4" />} loading={checkOut.isPending && checkOut.variables === e.id} onClick={() => checkOut.mutate(e.id)}>Check out</Button><IconButton label={`Cancel entry ${e.entryNumber}`} size="sm" className="text-danger-600" onClick={() => setToCancel(e)}><X className="h-4 w-4" /></IconButton></span>}
              </li>))}</ul>
          )}
        </Card>
        <div className="space-y-4">
          <Card padded={false}>
            <CardHeader className="p-4 pb-0" title="VIP tables tonight" subtitle="Booking and current service shown separately" action={<Button size="sm" variant="ghost" onClick={() => navigate('/admin/vip')}>Manage</Button>} />
            {vip.isLoading ? <div className="p-4"><LoadingState rows={2} /></div> : (vip.data ?? []).length === 0 ? <EmptyState compact title="No VIP tables" description="Mark tables as VIP in Tables settings." /> : (
              /* A table can be occupied without a booking and booked without being occupied,
                 so both axes are always printed: the VIP reservation for tonight, and the
                 table's own live status. Neither is inferred from the other. */
              <ul className="divide-y divide-neutral-100 mt-2">{(vip.data ?? []).map((t) => {
                const svc = statusMeta('table', t.status);
                return (
                  <li key={t.tableId} className="px-4 py-3 text-sm flex items-start gap-2">
                    <Crown className="h-4 w-4 text-warning-500 shrink-0 mt-0.5" aria-hidden />
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{t.tableName}</span>
                        {t.booking ? <StatusBadge kind="vip" status={t.booking.status} size="sm" hideIcon /> : <Badge size="sm" tone="neutral">No booking</Badge>}
                      </span>
                      <span className="block text-caption text-neutral-500 truncate tabular-nums">
                        {t.booking ? `${t.booking.guestName} · ${t.booking.guests} guests · ${money(t.booking.currentSpend)} of ${money(t.booking.minSpend)}` : `minimum ${money(t.minSpendDefault)} if booked`}
                      </span>
                      <span className="mt-1 flex items-center gap-1.5 text-caption text-neutral-500">
                        <StatusDot tone={svc.tone} />Now: {svc.label}
                      </span>
                    </span>
                  </li>
                );
              })}</ul>
            )}
          </Card>
          {d && d.byEntryType.length > 0 && (
            <Card padded={false}>
              <CardHeader className="p-4 pb-0" title="By entry type" />
              <ul className="divide-y divide-neutral-100 mt-2">{d.byEntryType.map((r) => <li key={r.entryType} className="px-4 py-2 text-sm flex items-center gap-2"><span className="flex-1">{ENTRY_TYPE_LABELS[r.entryType]}</span><span className="text-caption text-neutral-500">{r.entries} entries · {r.guests} guests</span><span className="tabular-nums font-medium w-20 text-right">{money(r.coverRevenue)}</span></li>)}</ul>
            </Card>
          )}
        </div>
      </div>
      {checkInOpen && <CheckInModal onClose={() => setCheckInOpen(false)} />}
      {coversOpen && <CoverTypesModal onClose={() => setCoversOpen(false)} />}
      <ConfirmDialog open={!!toCancel} onClose={() => setToCancel(null)} variant="danger" title={`Cancel entry ${toCancel?.entryNumber}?`} message="Cover payment is reversed and any unused credit is voided. Credit already applied to a bill stays on that bill." confirmLabel="Cancel entry" loading={cancelEntry.isPending} onConfirm={async () => { if (toCancel) { await cancelEntry.mutateAsync({ id: toCancel.id, reason: reason || 'cancelled at door' }); setToCancel(null); setReason(''); } }}>
        <Textarea label="Reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </ConfirmDialog>
    </div>
  );
}
