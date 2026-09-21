import { useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { UserPlus, LogOut, X, Ticket, Users, Wallet, Crown, Settings2, Plus, Pencil, Armchair } from 'lucide-react';
import { useClubDashboard, useClubEntries, useCoverTypes, useClubMutations, useCustomers, useVipTables, useStaff } from '@/features/p2/hooks';
import { useTables } from '@/features/tables/hooks';
import { MinimumSpendMeter, showMinimumSpend } from '@/features/club/VipTablesPage';
import { DashboardHero } from '@/features/dashboard/DashboardPage';
import { usePermission } from '@/hooks/useAuth';
import { useRealtimeInvalidate } from '@/hooks/useRealtime';
import { useWorkspace } from '@/hooks/useSurface';
import { Button, Card, CardHeader, StatCard, DataTable, Modal, ConfirmDialog, Input, Select, Textarea, Switch, StatusBadge, StatusDot, statusMeta, Badge, SegmentedControl, Tabs, SearchInput, LoadingState, ErrorState, EmptyState, IconButton, KeyValue, type Column } from '@/components/ui';
import { EmptyGuest } from '@/components/graphics';
import { staggerDelay } from '@/components/motion';
import { ApiError } from '@/services/api/client';
import { ENTRY_TYPE_LABELS, PAYMENT_METHOD_LABELS } from '@/config/statuses';
import { money } from '@/utils/money';
import { fmtDate, fmtTime, fmtRelative, todayInput } from '@/utils/date';
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
      <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 sm:grid-cols-2 gap-4" noValidate>
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
        {cover && <div className="sm:col-span-2 well p-3 text-sm flex flex-wrap gap-x-6 gap-y-1"><span className="text-neutral-700">Cover total <b className="tabular-nums text-neutral-900">{money(total)}</b></span><span className="text-neutral-700">Redeemable credit <b className="tabular-nums text-success-700">{money(credit)}</b></span><span className="text-neutral-500">Credit is applied on the payment screen by picking this entry.</span></div>}
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
        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 sm:grid-cols-2 gap-4" noValidate>
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
            <ul className="divide-y divide-neutral-200 border border-neutral-200 rounded-md">{(covers.data ?? []).map((c) => <li key={c.id} className="flex items-center gap-3 px-4 py-3 text-sm"><span className="flex-1"><span className="font-medium text-neutral-900">{c.name}</span> <span className="text-caption text-neutral-500">{c.code} · {c.guestsIncluded} guest{c.guestsIncluded === 1 ? '' : 's'}/unit</span></span><span className="tabular-nums text-neutral-900">{money(c.amount)}</span><span className="tabular-nums text-success-700 w-24 text-right">{money(c.redeemableAmount)} credit</span>{!c.isActive && <Badge size="sm">Inactive</Badge>}<IconButton label="Edit" size="sm" onClick={() => setEditing(c)}><Pencil className="h-4 w-4" /></IconButton></li>)}</ul>
          )}
        </div>
      )}
    </Modal>
  );
}

/** The `--d` beat of a staged reveal — a function of position, never of the door count on it. */
const beat = (i: number) => ({ '--d': `${staggerDelay(i)}ms` }) as CSSProperties;

/**
 * The door.
 *
 * MATERIAL. Violet is the VIP classification and nothing else, so the VIP panel and the VIP
 * booking tile carry `.fill-vip` — the token wash, in place of the hard-coded `vip-sheen`
 * gradient. The door's own counts stay neutral: guests inside is a fact, not a celebration.
 *
 * MOTION. The three tiles sweep, then the takings block, then the entries list and the VIP column.
 * `useRealtimeInvalidate` refetches the door, the tables and the orders on every event, so the
 * entrances are CSS animations on elements that stay mounted across those refetches and nothing is
 * keyed on the payload. Entry rows never animate: they are a register of who is in the building.
 */
export default function ClubDashboardPage() {
  const ws = useWorkspace();
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
  /**
   * The club's period is its own business day — the one the API returned, which rolls at 06:00
   * rather than midnight, so at 3 a.m. this is still last night's date. The band takes a range,
   * so that day is handed over as an instant inside it (local midday), printing the single date
   * it is in any timezone. Until the payload lands there is no measured business day to name and
   * the band shows today.
   */
  const period = useMemo(() => {
    const at = new Date(`${d?.businessDate ?? todayInput()}T12:00:00`).toISOString();
    return { from: at, to: at };
  }, [d?.businessDate]);

  /* ------------------------------------------------------------------ the two VIP axes
   * `vip/tables` is the only payload that carries a VIP table's OWN live status, so the tile
   * that counts occupancy is counted from it. The booking count beside it is the other axis and
   * is printed as its own sentence — a table can be in service with no booking and booked with
   * nobody on it, and neither number is derived from the other. */
  const vipTables = vip.data ?? [];
  const vipInService = vipTables.filter((t) => t.status !== 'AVAILABLE' && t.status !== 'CLOSED').length;
  const vipBooked = vipTables.filter((t) => !!t.booking).length;

  /**
   * THE DOOR REGISTER.
   *
   * The reference panel draws this as a waiting queue with a position and a waiting time. This
   * product has neither: an entry is created when a guest is ALREADY through the door
   * (`CHECKED_IN` / `CHECKED_OUT` / `CANCELLED`), there is no queued state, no position and no
   * measured wait. So the columns say what the record actually holds — the entry number, how long
   * the party has been inside, and the door actions that exist.
   */
  const entryCols: Column<ClubEntry>[] = [
    { key: 'no', header: 'Entry', sortValue: (e) => e.entryNumber, render: (e) => <span className="font-semibold tabular-nums text-neutral-900 whitespace-nowrap">{e.entryNumber}</span> },
    {
      key: 'guest', header: 'Guest', sortValue: (e) => e.guestName,
      render: (e) => (
        <span className="block min-w-0">
          <span className="block font-medium text-neutral-900 truncate">{e.guestName}</span>
          <span className="block text-caption text-neutral-500 truncate">{[e.phone, e.tableName, e.hostName ? `host ${e.hostName}` : null].filter(Boolean).join(' · ') || '—'}</span>
        </span>
      ),
    },
    {
      key: 'type', header: 'Type', sortValue: (e) => e.entryType,
      /* A VIP entry is a VIP CLASSIFICATION, so it takes the violet — never the gold. */
      render: (e) => <Badge size="sm" tone={e.entryType === 'VIP' ? 'accent' : 'neutral'} icon={e.entryType === 'VIP' ? <Crown className="h-3 w-3" aria-hidden /> : undefined}>{ENTRY_TYPE_LABELS[e.entryType]}</Badge>,
    },
    { key: 'party', header: 'Party', align: 'right', sortValue: (e) => e.guests, render: (e) => <span className="tabular-nums">{e.guests}</span> },
    {
      key: 'inside', header: 'Inside for', hideBelow: 'md', sortValue: (e) => e.enteredAt,
      render: (e) => (
        <span className="block whitespace-nowrap">
          <span className="block tabular-nums text-neutral-900">{e.exitedAt ? `${fmtTime(e.enteredAt)} → ${fmtTime(e.exitedAt)}` : fmtRelative(e.enteredAt)}</span>
          <span className="block text-caption text-neutral-500 tabular-nums">in at {fmtTime(e.enteredAt)}</span>
        </span>
      ),
    },
    {
      key: 'cover', header: 'Cover', align: 'right', hideBelow: 'lg', sortValue: (e) => e.coverAmount,
      render: (e) => (
        <span className="block whitespace-nowrap">
          <span className="block tabular-nums text-neutral-900">{e.coverAmount ? `${money(e.coverAmount)} ${e.coverName ?? 'cover'}` : 'No cover'}</span>
          {e.paymentMethod && <span className="block text-caption text-neutral-500">{PAYMENT_METHOD_LABELS[e.paymentMethod]}</span>}
          {e.redeemableAmount > 0 && <span className={e.remainingCredit > 0 ? 'block text-caption text-success-700 tabular-nums' : 'block text-caption text-neutral-500 tabular-nums'}>credit {money(e.remainingCredit)} of {money(e.redeemableAmount)} left</span>}
        </span>
      ),
    },
    { key: 'status', header: 'Status', sortValue: (e) => e.status, render: (e) => <StatusBadge kind="entry" status={e.status} size="sm" /> },
    {
      key: 'act', header: <span className="sr-only">Actions</span>, align: 'right',
      render: (e) => (canManage && e.status === 'CHECKED_IN' ? (
        <span className="inline-flex gap-1 justify-end [&>button]:min-h-touch sm:[&>button]:min-h-0">
          <Button size="sm" variant="outline" leftIcon={<LogOut className="h-4 w-4" />} loading={checkOut.isPending && checkOut.variables === e.id} onClick={() => checkOut.mutate(e.id)}>Check out</Button>
          <IconButton label={`Cancel entry ${e.entryNumber}`} size="sm" className="text-danger-700" onClick={() => setToCancel(e)}><X className="h-4 w-4" /></IconButton>
        </span>
      ) : null),
    },
  ];

  /**
   * THE MANAGER BOARD (panel 24) — time, guest, type, table/area, status.
   *
   * The board's register is about the room rather than the till, so the cover columns come out and
   * the table the party is on goes in beside them. The time column is the real `enteredAt` (and
   * the real `exitedAt` once they have gone), not a queue position or a waiting time: this product
   * opens an entry once a guest is ALREADY inside, so no wait is measured anywhere and none is
   * drawn. The door actions stay exactly as they are — they are the manager's real work here.
   */
  const managerEntryCols: Column<ClubEntry>[] = [
    {
      key: 'inside', header: 'Time', sortValue: (e) => e.enteredAt,
      render: (e) => (
        <span className="block whitespace-nowrap">
          <span className="block tabular-nums font-semibold text-neutral-900">{fmtTime(e.enteredAt)}</span>
          <span className="block text-caption text-neutral-500 tabular-nums">{e.exitedAt ? `out ${fmtTime(e.exitedAt)}` : `inside ${fmtRelative(e.enteredAt)}`}</span>
        </span>
      ),
    },
    {
      key: 'guest', header: 'Guest', sortValue: (e) => e.guestName,
      render: (e) => (
        <span className="block min-w-0">
          <span className="block font-medium text-neutral-900 truncate">{e.guestName}</span>
          <span className="block text-caption text-neutral-500 truncate tabular-nums">
            {[e.entryNumber, `${e.guests} guest${e.guests === 1 ? '' : 's'}`, e.phone, e.hostName ? `host ${e.hostName}` : null].filter(Boolean).join(' · ')}
          </span>
        </span>
      ),
    },
    {
      key: 'type', header: 'Type', sortValue: (e) => e.entryType,
      /* A VIP entry is a VIP CLASSIFICATION, so it takes the violet — never the gold. */
      render: (e) => <Badge size="sm" tone={e.entryType === 'VIP' ? 'accent' : 'neutral'} icon={e.entryType === 'VIP' ? <Crown className="h-3 w-3" aria-hidden /> : undefined}>{ENTRY_TYPE_LABELS[e.entryType]}</Badge>,
    },
    {
      key: 'table', header: 'Table / area', hideBelow: 'md', sortValue: (e) => e.tableName ?? '',
      render: (e) => (e.tableName ? <span className="text-neutral-700">{e.tableName}</span> : <span className="text-neutral-400">No table</span>),
    },
    { key: 'status', header: 'Status', sortValue: (e) => e.status, render: (e) => <StatusBadge kind="entry" status={e.status} size="sm" /> },
    {
      key: 'act', header: <span className="sr-only">Actions</span>, align: 'right',
      render: (e) => (canManage && e.status === 'CHECKED_IN' ? (
        <span className="inline-flex gap-1 justify-end [&>button]:min-h-touch sm:[&>button]:min-h-0">
          <Button size="sm" variant="outline" leftIcon={<LogOut className="h-4 w-4" />} loading={checkOut.isPending && checkOut.variables === e.id} onClick={() => checkOut.mutate(e.id)}>Check out</Button>
          <IconButton label={`Cancel entry ${e.entryNumber}`} size="sm" className="text-danger-700" onClick={() => setToCancel(e)}><X className="h-4 w-4" /></IconButton>
        </span>
      ) : null),
    },
  ];

  return (
    <div>
      {/* The same band as the dashboards: venue and branch identity, the page, and the business
          day every figure on it is counted against. */}
      <DashboardHero
        title="Club"
        subtitle="Door, cover charges and guests inside — the business day rolls at 06:00"
        range={period}
        actions={canManage && <><Button variant="outline" leftIcon={<Settings2 className="h-4 w-4" />} onClick={() => setCoversOpen(true)}>Cover types</Button><Button size="lg" leftIcon={<UserPlus className="h-5 w-5" />} onClick={() => setCheckInOpen(true)}>Check in</Button></>}
      />
      {dash.isLoading && <LoadingState variant="stats" />}
      {dash.isError && <ErrorState error={dash.error} onRetry={() => void dash.refetch()} />}
      {d && (
        /* FOUR COMPACT TILES, each one figure the API returned. Base `grid-cols-1` and
           `minmax(0,1fr)` tracks above it — an implicit auto track sizes to its widest child
           and pushes the row past a 360 px viewport. */
        <div className="grid grid-cols-1 xs:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))] gap-3 xs:gap-4 mb-5">
          <StatCard label="Guests inside" value={d.guestsInside} icon={<Users className="h-5 w-5" />} tone="primary" hint={`${d.guestsTotal} entered on this business day`} className="anim-reveal" style={beat(0)} />
          <StatCard label="Entries tonight" value={d.entries} icon={<Ticket className="h-5 w-5" />} tone="info" hint={`${d.vipEntries} VIP entr${d.vipEntries === 1 ? 'y' : 'ies'} at the door`} className="anim-reveal" style={beat(1)} />
          {/* CURRENT SERVICE on the numerator, the RESERVATION count as its own sentence
              underneath. The tile never says a table is free because nobody booked it. */}
          <StatCard
            label="VIP tables in service"
            value={vip.data ? `${vipInService} / ${vipTables.length}` : '—'}
            icon={<Armchair className="h-5 w-5" />}
            tone="accent"
            hint={vip.data ? `live table status · ${vipBooked} booked tonight` : 'live table status'}
            onClick={() => navigate('/admin/vip')}
            className="anim-reveal fill-vip"
            style={beat(2)}
          />
          <StatCard label="Takings tonight" value={money(d.fnbRevenue)} icon={<Wallet className="h-5 w-5" />} tone="primary" hint={`F&B sales · cover ${money(d.coverRevenue)} collected`} className="anim-reveal" style={beat(3)} />
        </div>
      )}
      {/* `minmax(0,1fr)` on the register column: a bare `1fr` floors at the widest guest name in
          the list, which pushes the whole grid past the viewport instead of truncating. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px] items-start">
        <Card padded={false} className="anim-reveal" style={beat(4)}>
          <div className="px-5 pt-5 pb-3 flex flex-col gap-3">
            <div className="min-w-0">
              <h2 className="text-subheading text-neutral-900">Entry queue</h2>
              <p className="text-[13px] text-neutral-500 mt-1 leading-snug">
                Door register — an entry is opened once a guest is through the door, so this column is time inside, not a measured wait
              </p>
            </div>
            {/* The manager board carries these as tabs. No count is printed on them: each one is
                a SERVER-side status filter, so only the selected tab's rows are ever loaded and a
                count on the other three would be a number nobody fetched. */}
            {ws === 'manager' ? (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 min-w-0">
                <Tabs value={status} onChange={setStatus} ariaLabel="Filter entries by status" className="min-w-0" options={[{ value: 'CHECKED_IN', label: 'Inside' }, { value: 'CHECKED_OUT', label: 'Left' }, { value: 'CANCELLED', label: 'Cancelled' }, { value: 'ALL', label: 'All' }]} />
                <SearchInput value={search} onChange={setSearch} placeholder="Name, phone, entry no." className="sm:ml-auto sm:w-56" />
              </div>
            ) : (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 min-w-0">
              <SegmentedControl size="sm" value={status} onChange={setStatus} ariaLabel="Filter entries by status" options={[{ value: 'CHECKED_IN', label: 'Inside' }, { value: 'CHECKED_OUT', label: 'Left' }, { value: 'CANCELLED', label: 'Cancelled' }, { value: 'ALL', label: 'All' }]} />
              <SearchInput value={search} onChange={setSearch} placeholder="Name, phone, entry no." className="sm:ml-auto sm:w-56" />
            </div>
            )}
          </div>
          {entries.isLoading ? <div className="px-5 pb-5"><LoadingState rows={4} /></div>
            : entries.isError ? <ErrorState compact error={entries.error} onRetry={() => void entries.refetch()} />
              : rows.length === 0 ? (
                <EmptyState
                  compact
                  icon={<EmptyGuest />}
                  title="No entries"
                  description={status === 'CHECKED_IN' ? 'Nobody is checked in right now.' : 'No entries match.'}
                  action={canManage && status === 'CHECKED_IN' ? <Button onClick={() => setCheckInOpen(true)}>Check in</Button> : undefined}
                />
              ) : (
                <div className="px-5 pb-5">
                  <DataTable
                    columns={ws === 'manager' ? managerEntryCols : entryCols}
                    rows={rows}
                    rowKey={(e) => e.id}
                    pageSize={25}
                    dense
                    initialSort={{ key: 'inside', dir: 'desc' }}
                    caption={ws === 'manager'
                      ? 'Guests at the door, with the time they entered, entry type, the table they are on and their status'
                      : 'Guests checked in at the door, with entry type, party size, time inside and cover charge'}
                    toolbar={<p className="text-sm text-neutral-600 px-1 tabular-nums">{rows.length} shown · longest inside first</p>}
                    mobileCard={(e) => (
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <span className="min-w-0">
                            <span className="block font-semibold text-neutral-900 truncate">{e.guestName}</span>
                            <span className="block text-caption text-neutral-500 tabular-nums">{e.entryNumber} · {e.guests} guest{e.guests === 1 ? '' : 's'}</span>
                          </span>
                          <span className="tabular-nums font-semibold shrink-0 text-neutral-900">{e.coverAmount ? money(e.coverAmount) : 'No cover'}</span>
                        </div>
                        <span className="flex items-center gap-2 flex-wrap">
                          <Badge size="sm" tone={e.entryType === 'VIP' ? 'accent' : 'neutral'} icon={e.entryType === 'VIP' ? <Crown className="h-3 w-3" aria-hidden /> : undefined}>{ENTRY_TYPE_LABELS[e.entryType]}</Badge>
                          <StatusBadge kind="entry" status={e.status} size="sm" />
                        </span>
                        <p className="text-caption text-neutral-500 tabular-nums">in at {fmtTime(e.enteredAt)} · {e.exitedAt ? `out ${fmtTime(e.exitedAt)}` : `inside ${fmtRelative(e.enteredAt)}`}{e.tableName ? ` · ${e.tableName}` : ''}{e.hostName ? ` · host ${e.hostName}` : ''}</p>
                        {canManage && e.status === 'CHECKED_IN' && (
                          <span className="flex gap-2">
                            <Button size="sm" variant="outline" className="min-h-touch" leftIcon={<LogOut className="h-4 w-4" />} loading={checkOut.isPending && checkOut.variables === e.id} onClick={() => checkOut.mutate(e.id)}>Check out</Button>
                            <IconButton label={`Cancel entry ${e.entryNumber}`} size="sm" className="text-danger-700 min-h-touch" onClick={() => setToCancel(e)}><X className="h-4 w-4" /></IconButton>
                          </span>
                        )}
                      </div>
                    )}
                    emptyTitle="No entries"
                    emptyDescription={status === 'CHECKED_IN' ? 'Nobody is checked in right now.' : 'No entries match.'}
                  />
                </div>
              )}
        </Card>
        <div className="space-y-4">
          <Card padded={false} className="fill-vip anim-reveal" style={beat(5)}>
            <CardHeader className="p-5 pb-0" title="VIP table status" subtitle="Two separate facts per table: what is happening at it now, and the booking for the date" action={<Button size="sm" variant="ghost" onClick={() => navigate('/admin/vip')}>Manage</Button>} />
            {vip.isLoading ? <div className="p-5"><LoadingState rows={2} /></div> : vipTables.length === 0 ? <EmptyState compact title="No VIP tables" description="Mark tables as VIP in Tables settings." /> : (
              /* A table can be occupied without a booking and booked without being occupied,
                 so both axes are always printed under their own label. Neither is inferred
                 from the other, and a missing booking never means "free". */
              <ul className="divide-y divide-neutral-200 mt-3">{vipTables.map((t) => {
                const svc = statusMeta('table', t.status);
                const b = t.booking;
                return (
                  <li key={t.tableId} className="px-5 py-3.5 text-sm flex items-start gap-2.5">
                    <Crown className="h-4 w-4 text-accent-500 shrink-0 mt-0.5" aria-label="VIP table" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate text-neutral-900">{t.tableName}</p>
                      <p className="text-caption text-neutral-500 tabular-nums">{t.floorName} · {t.capacity} seats</p>

                      {/* -------------------------------------------- axis 1: right now */}
                      <p className="text-label uppercase text-neutral-500 mt-2.5">Current service</p>
                      <p className="mt-1 flex items-center gap-1.5 text-neutral-900">
                        <StatusDot tone={svc.tone} />{svc.label}
                      </p>

                      {/* -------------------------------- axis 2: the booking, with its date */}
                      <p className="text-label uppercase text-neutral-500 mt-2.5">Reservation {b ? `for ${fmtDate(b.date)}` : 'for tonight'}</p>
                      {b ? (
                        <>
                          <span className="mt-1 flex items-center gap-2 flex-wrap">
                            <span className="font-medium truncate text-neutral-900">{b.guestName}</span>
                            <StatusBadge kind="vip" status={b.status} size="sm" hideIcon />
                          </span>
                          <p className="text-caption text-neutral-500 truncate tabular-nums">{b.guests} guests · minimum {money(b.minSpend)}</p>
                          {/* Spend only once a party is actually seated on the booking. */}
                          {showMinimumSpend(b) && <MinimumSpendMeter booking={b} tableName={t.tableName} compact showDeposit className="mt-1.5" />}
                        </>
                      ) : (
                        <p className="mt-1 text-neutral-700">No VIP booking taken <span className="text-caption text-neutral-500 tabular-nums">· default minimum {money(t.minSpendDefault)}</span></p>
                      )}
                    </div>
                  </li>
                );
              })}</ul>
            )}
          </Card>
          {d && (
            /* Money is context, not the door's job — grouped quietly rather than four more tiles. */
            <Card className="min-w-0 anim-reveal" style={beat(6)}>
              <CardHeader className="mb-3" title={<span className="flex items-center gap-2"><Wallet className="h-4 w-4" aria-hidden />Takings today</span>} />
              <KeyValue items={[
                { label: 'Cover revenue', value: <span className="tabular-nums font-semibold">{money(d.coverRevenue)}</span> },
                { label: 'F&B sales', value: <span className="tabular-nums font-semibold">{money(d.fnbRevenue)}</span> },
                { label: 'Cover credit used', value: <span className="tabular-nums">{money(d.coverCreditUsed)}</span> },
                { label: 'Credit still open', value: <span className={d.coverCreditOpen > 0 ? 'tabular-nums text-warning-700 font-medium' : 'tabular-nums text-neutral-500'}>{money(d.coverCreditOpen)}</span> },
              ]} />
            </Card>
          )}
          {d && d.byEntryType.length > 0 && (
            <Card padded={false} className="anim-reveal" style={beat(7)}>
              <CardHeader className="p-5 pb-0" title="By entry type" />
              <ul className="divide-y divide-neutral-200 mt-2">{d.byEntryType.map((r) => <li key={r.entryType} className="px-5 py-2 text-sm flex items-center gap-2"><span className="flex-1 text-neutral-700">{ENTRY_TYPE_LABELS[r.entryType]}</span><span className="text-caption text-neutral-500 tabular-nums">{r.entries} entries · {r.guests} guests</span><span className="tabular-nums font-medium w-20 text-right text-neutral-900">{money(r.coverRevenue)}</span></li>)}</ul>
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
