import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { addDays, format, startOfWeek } from 'date-fns';
import { Plus, ChevronLeft, ChevronRight, CalendarDays, Armchair, Check, X, UserX, Phone, Users, AlertTriangle, ArrowDown } from 'lucide-react';
import { useReservations, useAvailability, useReservationMutations, useCustomers } from '@/features/p2/hooks';
import { useTables } from '@/features/tables/hooks';
import { usePermission } from '@/hooks/useAuth';
import { useRealtimeInvalidate } from '@/hooks/useRealtime';
import { PageHeader, Button, Card, Modal, ConfirmDialog, Input, Select, Textarea, StatusBadge, Badge, SegmentedControl, SearchInput, LoadingState, ErrorState, EmptyState, Alert } from '@/components/ui';
import { ApiError } from '@/services/api/client';
import { toDateInput, todayInput } from '@/utils/date';
import { cn } from '@/utils/cn';
import type { Reservation, ReservationInput, ReservationStatus, ID } from '@/types';

const schema = z.object({
  guestName: z.string().trim().min(2, 'Guest name is required'), phone: z.string().trim().min(8, 'Enter a valid phone'), date: z.string().min(1, 'Date is required'), time: z.string().regex(/^\d{2}:\d{2}$/, 'Time is required'),
  durationMin: z.coerce.number().int().min(15).max(600), guests: z.coerce.number().int().min(1, 'At least 1 guest').max(100), tableId: z.coerce.number().optional(), tablePref: z.string().max(100).optional(),
  occasion: z.string().max(60).optional(), notes: z.string().max(500).optional(), depositAmount: z.coerce.number().min(0).optional(), customerId: z.coerce.number().optional(),
});
type Form = z.infer<typeof schema>;

export function ReservationForm({ editing, onClose, defaultDate }: { editing: Reservation | null; onClose: () => void; defaultDate?: string }) {
  const { save } = useReservationMutations();
  const tables = useTables();
  const customers = useCustomers({ limit: 200 });
  const { register, handleSubmit, setError, setValue, formState: { errors } } = useForm<Form>({ resolver: zodResolver(schema), values: { guestName: editing?.guestName ?? '', phone: editing?.phone ?? '', date: editing?.date ?? defaultDate ?? todayInput(), time: editing?.time ?? '20:00', durationMin: editing?.durationMin ?? 120, guests: editing?.guests ?? 2, tableId: editing?.tableId ?? undefined, tablePref: editing?.tablePref ?? '', occasion: editing?.occasion ?? '', notes: editing?.notes ?? '', depositAmount: editing?.depositAmount ?? 0, customerId: editing?.customerId ?? undefined } });
  const onSubmit = async (v: Form) => {
    const body: ReservationInput = { guestName: v.guestName, phone: v.phone, date: v.date, time: v.time, durationMin: v.durationMin, guests: v.guests, tableId: v.tableId || null, tablePref: v.tablePref || undefined, occasion: v.occasion || undefined, notes: v.notes || undefined, depositAmount: v.depositAmount || 0, customerId: v.customerId || null };
    try { await save.mutateAsync({ id: editing?.id ?? null, body }); onClose(); }
    catch (e) { const err = ApiError.from(e); setError((err.errors.find((x) => x.field)?.field as keyof Form) ?? (err.status === 409 ? 'tableId' : 'guestName'), { message: err.message }); }
  };
  return (
    <Modal open onClose={onClose} size="lg" title={editing ? `Edit ${editing.resNumber}` : 'New reservation'} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={handleSubmit(onSubmit)} loading={save.isPending}>{editing ? 'Save changes' : 'Create reservation'}</Button></>}>
      <form onSubmit={handleSubmit(onSubmit)} className="grid sm:grid-cols-2 gap-4" noValidate>
        <Select label="Existing customer" placeholder="Walk-in / new guest" options={(customers.data ?? []).map((c) => ({ value: c.id, label: `${c.fullName} · ${c.phone}` }))} wrapperClassName="sm:col-span-2" {...register('customerId', { onChange: (e) => { const c = customers.data?.find((x) => x.id === Number(e.target.value)); if (c) { setValue('guestName', c.fullName); setValue('phone', c.phone); } } })} />
        <Input label="Guest name" required autoFocus error={errors.guestName?.message} {...register('guestName')} />
        <Input label="Phone" required inputMode="tel" error={errors.phone?.message} {...register('phone')} />
        <Input label="Date" required type="date" error={errors.date?.message} {...register('date')} />
        <Input label="Time" required type="time" error={errors.time?.message} {...register('time')} />
        <Input label="Guests" required type="number" min={1} error={errors.guests?.message} {...register('guests')} />
        <Input label="Duration (minutes)" required type="number" min={15} step={15} error={errors.durationMin?.message} {...register('durationMin')} />
        <Select label="Table" placeholder="Assign later" options={(tables.data ?? []).map((t) => ({ value: t.id, label: `${t.name} · ${t.capacity} seats · ${t.floorName}` }))} error={errors.tableId?.message} hint="Overlapping bookings on the same table are rejected" {...register('tableId')} />
        <Input label="Table preference" placeholder="Window, quiet corner…" error={errors.tablePref?.message} {...register('tablePref')} />
        <Input label="Occasion" placeholder="Birthday, anniversary, business" error={errors.occasion?.message} {...register('occasion')} />
        <Input label="Deposit (₹)" type="number" min={0} error={errors.depositAmount?.message} {...register('depositAmount')} />
        <Textarea label="Notes" rows={2} wrapperClassName="sm:col-span-2" error={errors.notes?.message} {...register('notes')} />
      </form>
    </Modal>
  );
}

function SeatModal({ r, onClose }: { r: Reservation; onClose: () => void }) {
  const tables = useTables();
  const { transition } = useReservationMutations();
  const navigate = useNavigate();
  const [tableId, setTableId] = useState<ID | ''>(r.tableId ?? '');
  const [error, setError] = useState<string | null>(null);
  const free = (tables.data ?? []).filter((t) => t.status === 'AVAILABLE' || t.id === r.tableId);
  return (
    <Modal open onClose={onClose} size="sm" title={`Seat ${r.guestName}`} description={`${r.guests} guests · ${r.time}. An order is opened on the table so the waiter can start immediately.`} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button leftIcon={<Armchair className="h-4 w-4" />} disabled={!tableId} loading={transition.isPending} onClick={async () => { setError(null); try { const res = await transition.mutateAsync({ id: r.id, action: 'SEAT', tableId: Number(tableId) }); onClose(); if (res.orderId) navigate(`/admin/orders/${res.orderId}`); } catch (e) { setError(ApiError.from(e).message); } }}>Seat &amp; open order</Button></>}>
      <Select label="Table" required placeholder="Select an available table" value={tableId} onChange={(e) => setTableId(e.target.value ? Number(e.target.value) : '')} options={free.map((t) => ({ value: t.id, label: `${t.name} · ${t.capacity} seats · ${t.floorName}${t.capacity < r.guests ? ' (small)' : ''}` }))} />
      {error && <p role="alert" className="mt-3 text-sm text-danger-600">{error}</p>}
    </Modal>
  );
}

const OPEN_STATUSES: ReservationStatus[] = ['PENDING', 'CONFIRMED'];

/** "12 min" / "1h 05m" — how far past the booked time a guest still is not seated. */
function lateLabel(min: number): string {
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`;
}

export default function ReservationsPage() {
  const navigate = useNavigate();
  const canManage = usePermission('reservations:manage');
  const [view, setView] = useState<'day' | 'week' | 'list'>('day');
  const [date, setDate] = useState(todayInput());
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'ALL' | ReservationStatus>('ALL');
  const weekStart = startOfWeek(new Date(date), { weekStartsOn: 1 });
  const range = view === 'week' ? { from: toDateInput(weekStart), to: toDateInput(addDays(weekStart, 6)) } : view === 'day' ? { from: date, to: date } : {};
  const list = useReservations({ ...range, status: status === 'ALL' ? undefined : status, search: search || undefined });
  const avail = useAvailability(date);
  const { transition } = useReservationMutations();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Reservation | null>(null);
  const [seat, setSeat] = useState<Reservation | null>(null);
  const [cancel, setCancel] = useState<Reservation | null>(null);
  const [reason, setReason] = useState('');
  useRealtimeInvalidate(['reservations', 'tables']);
  const shift = (days: number) => setDate(toDateInput(addDays(new Date(date), days)));
  const rows = useMemo(() => [...(list.data ?? [])].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)), [list.data]);
  const dayCounts = useMemo(() => { const m = new Map<string, number>(); rows.forEach((r) => m.set(r.date, (m.get(r.date) ?? 0) + 1)); return m; }, [rows]);

  // A podium tablet stays open all service, so "next up" and "late" are re-evaluated
  // every minute instead of only when the query refetches.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const h = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(h);
  }, []);

  const dueAt = (r: Reservation) => new Date(`${r.date}T${r.time}`).getTime();
  /** Minutes past the booked time for a guest who is still not seated (5 min grace). */
  const minutesLate = (r: Reservation) => {
    if (!OPEN_STATUSES.includes(r.status)) return 0;
    const diff = Math.floor((now.getTime() - dueAt(r)) / 60_000);
    return diff > 5 ? diff : 0;
  };
  /** The booking the host should be watching the door for. */
  const nextUp = rows.find((r) => OPEN_STATUSES.includes(r.status) && dueAt(r) >= now.getTime());
  const open = rows.filter((r) => OPEN_STATUSES.includes(r.status));
  const lateRows = open.filter((r) => minutesLate(r) > 0);
  const seatedCount = rows.filter((r) => r.status === 'SEATED').length;
  const noShowCount = rows.filter((r) => r.status === 'NO_SHOW').length;
  const coversToArrive = open.reduce((a, r) => a + r.guests, 0);
  const freeTables = (avail.data?.tables ?? []).filter((t) => t.currentStatus === 'AVAILABLE').length;

  const actions = (r: Reservation) => canManage && (
    // 44px targets on a podium tablet; the desktop row keeps the compact 32px buttons.
    <div className="flex flex-wrap gap-1.5 sm:justify-end [&>button]:min-h-touch sm:[&>button]:min-h-0" onClick={(e) => e.stopPropagation()}>
      {r.status === 'PENDING' && <Button size="sm" variant="outline" leftIcon={<Check className="h-4 w-4" />} onClick={() => transition.mutate({ id: r.id, action: 'CONFIRM' })}>Confirm</Button>}
      {OPEN_STATUSES.includes(r.status) && <Button size="sm" variant="success" leftIcon={<Armchair className="h-4 w-4" />} onClick={() => setSeat(r)}>Seat</Button>}
      {OPEN_STATUSES.includes(r.status) && <Button size="sm" variant="ghost" leftIcon={<UserX className="h-4 w-4" />} onClick={() => transition.mutate({ id: r.id, action: 'NO_SHOW' })}>No-show</Button>}
      {r.status === 'SEATED' && r.orderId && <Button size="sm" variant="outline" onClick={() => navigate(`/admin/orders/${r.orderId}`)}>Order</Button>}
      {r.status === 'SEATED' && <Button size="sm" variant="outline" onClick={() => transition.mutate({ id: r.id, action: 'COMPLETE' })}>Complete</Button>}
      {!['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(r.status) && <><Button size="sm" variant="ghost" onClick={() => { setEditing(r); setFormOpen(true); }}>Edit</Button><Button size="sm" variant="ghost" className="text-danger-700" leftIcon={<X className="h-4 w-4" />} onClick={() => setCancel(r)}>Cancel</Button></>}
    </div>
  );

  const ResRow = ({ r }: { r: Reservation }) => {
    const late = minutesLate(r);
    const isNext = nextUp?.id === r.id;
    return (
      <li className={cn(
        'py-3 pr-4 border-l-4 transition-colors',
        isNext ? 'border-l-primary-600 bg-primary-50/60 pl-3' : late > 0 ? 'border-l-danger-500 bg-danger-50/40 pl-3' : 'border-l-transparent pl-4',
      )}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <span className="w-[4.25rem] shrink-0">
              <time className="block text-lg font-bold tabular-nums leading-6 text-neutral-900">{r.time}</time>
              {isNext && <span className="block mt-1"><Badge size="sm" tone="primary" icon={<ArrowDown className="h-3 w-3" aria-hidden />}>Next</Badge></span>}
            </span>
            <span className="flex-1 min-w-0">
              <span className="flex items-center gap-1.5 flex-wrap">
                <span className="font-semibold text-neutral-900">{r.guestName}</span>
                <StatusBadge kind="reservation" status={r.status} size="sm" />
                {late > 0 && <Badge size="sm" tone="danger" icon={<AlertTriangle className="h-3.5 w-3.5" aria-hidden />}>{lateLabel(late)} late</Badge>}
                {r.occasion && <Badge size="sm" tone="info">{r.occasion}</Badge>}
              </span>
              <span className="block text-caption text-neutral-500 mt-0.5">
                <Users className="inline h-3 w-3 mr-0.5" aria-hidden />{r.guests} · <Phone className="inline h-3 w-3 mr-0.5" aria-hidden />{r.phone} · {r.tableName ?? r.tablePref ?? 'no table'} · {r.resNumber}{r.notes ? ` · ${r.notes}` : ''}
              </span>
            </span>
          </div>
          {actions(r)}
        </div>
      </li>
    );
  };

  /* The week is navigation, never the content: it moves the selected day and, in week
     view (where all seven days are actually fetched), shows the per-day booking count. */
  const weekStrip = (
    <div className="mb-4 -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto no-scrollbar">
      <div className={cn('grid grid-cols-7 gap-2', view === 'week' ? 'min-w-[560px] sm:min-w-0' : 'min-w-[420px] sm:min-w-0')}>
        {Array.from({ length: 7 }).map((_, i) => {
          const d = addDays(weekStart, i);
          const key = toDateInput(d);
          const n = dayCounts.get(key) ?? 0;
          const isToday = key === todayInput();
          const selected = key === date;
          return (
            <button
              key={key}
              type="button"
              onClick={() => { setDate(key); if (view === 'week') setView('day'); }}
              aria-current={selected ? 'date' : undefined}
              className={cn(
                'relative rounded-md border px-2 py-2 text-left min-h-touch transition-colors',
                view === 'week' && 'min-h-[76px]',
                selected ? 'border-primary-600 ring-1 ring-primary-600/20 bg-primary-50'
                  : isToday ? 'border-primary-300 bg-primary-50/50' : 'border-neutral-200 bg-white hover:border-neutral-300',
              )}
            >
              <span className="text-caption text-neutral-500">{format(d, 'EEE')}</span>
              <span className={cn('block font-semibold', selected ? 'text-primary-800' : 'text-neutral-900')}>{format(d, 'd MMM')}</span>
              {/* Counts are only honest in week view — day view fetches a single day. */}
              {view === 'week' && <span className="text-caption text-neutral-500">{n} booking{n === 1 ? '' : 's'}</span>}
              {/* `sr-only` is position:absolute at its static position; on the last day of the
                  strip that sits past the viewport edge and added 2 px of page-wide horizontal
                  scroll. `left-0` pins it inside the (relative) button instead. */}
              {selected && view !== 'week' && <span className="sr-only left-0">Selected day</span>}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader title="Reservations" subtitle="Bookings, table availability and seating" actions={canManage && <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setFormOpen(true); }}>New reservation</Button>}>
        <div className="flex flex-col lg:flex-row gap-2 lg:items-center">
          <SegmentedControl size="sm" value={view} onChange={setView} ariaLabel="Reservation view" options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'list', label: 'All' }]} />
          {view !== 'list' && <div className="inline-flex items-center gap-1"><Button size="sm" variant="outline" onClick={() => shift(view === 'week' ? -7 : -1)} aria-label={view === 'week' ? 'Previous week' : 'Previous day'}><ChevronLeft className="h-4 w-4" /></Button><input type="date" aria-label="Date" className="input-base h-8 min-h-0 w-auto text-xs" value={date} onChange={(e) => setDate(e.target.value)} /><Button size="sm" variant="outline" onClick={() => shift(view === 'week' ? 7 : 1)} aria-label={view === 'week' ? 'Next week' : 'Next day'}><ChevronRight className="h-4 w-4" /></Button><Button size="sm" variant="ghost" onClick={() => setDate(todayInput())}>Today</Button></div>}
          <SegmentedControl size="sm" value={status} onChange={setStatus} ariaLabel="Filter by status" options={[{ value: 'ALL', label: 'All' }, { value: 'PENDING', label: 'Pending' }, { value: 'CONFIRMED', label: 'Confirmed' }, { value: 'SEATED', label: 'Seated' }, { value: 'COMPLETED', label: 'Completed' }]} />
          <SearchInput value={search} onChange={setSearch} placeholder="Guest, phone or number" className="lg:w-56 lg:ml-auto" />
        </div>
      </PageHeader>
      {list.isLoading && <LoadingState rows={4} />}
      {list.isError && <ErrorState error={list.error} onRetry={() => void list.refetch()} />}
      {/* Seven columns are unreadable on a phone, so the strip scrolls horizontally there
          and only becomes a full-width grid once there is room for it. */}
      {list.data && view !== 'list' && weekStrip}
      {list.data && view === 'day' && lateRows.length > 0 && (
        <Alert tone="danger" className="mb-4" title={`${lateRows.length} booking${lateRows.length === 1 ? ' is' : 's are'} past the booked time`}>
          {lateRows.slice(0, 3).map((r) => `${r.time} ${r.guestName}`).join(' · ')}{lateRows.length > 3 ? ` · +${lateRows.length - 3} more` : ''} — seat them or mark a no-show.
        </Alert>
      )}
      {list.data && (
        <div className={cn('grid gap-4', view === 'day' && 'lg:grid-cols-[1fr_360px]')}>
          <Card padded={false}>
            {view === 'day' && (
              <div className="px-4 py-3 border-b border-neutral-200">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h2 className="text-subheading text-neutral-900">{format(new Date(date), 'EEEE d MMM')}</h2>
                  {date === todayInput() && <Badge size="sm" tone="primary">Today</Badge>}
                </div>
                <p className="text-caption text-neutral-500 mt-1 tabular-nums">
                  {open.length} to arrive · {coversToArrive} cover{coversToArrive === 1 ? '' : 's'} · {seatedCount} seated{noShowCount > 0 ? ` · ${noShowCount} no-show` : ''}
                </p>
                {nextUp && (
                  <p className="text-sm text-neutral-700 mt-2 flex items-center gap-1.5 flex-wrap">
                    <Badge size="sm" tone="primary" icon={<ArrowDown className="h-3 w-3" aria-hidden />}>Next</Badge>
                    <span className="font-semibold tabular-nums">{nextUp.time}</span>
                    <span className="truncate">{nextUp.guestName} · {nextUp.guests} guest{nextUp.guests === 1 ? '' : 's'} · {nextUp.tableName ?? nextUp.tablePref ?? 'no table yet'}</span>
                  </p>
                )}
              </div>
            )}
            {rows.length === 0 ? <EmptyState icon={<CalendarDays className="h-6 w-6" />} title="No reservations" description={view === 'day' ? `Nothing booked for ${format(new Date(date), 'EEEE d MMM')}.` : 'No bookings match the filters.'} action={canManage && <Button onClick={() => { setEditing(null); setFormOpen(true); }}>New reservation</Button>} /> : (
              <ul className="divide-y divide-neutral-100">{rows.map((r, i) => (
                <Fragment key={r.id}>
                  {view !== 'day' && (i === 0 || rows[i - 1].date !== r.date) && <li className="px-4 pt-3 pb-1 text-label uppercase text-neutral-500 bg-neutral-50">{format(new Date(r.date), 'EEEE, d MMM')}</li>}
                  <ResRow r={r} />
                </Fragment>
              ))}</ul>
            )}
          </Card>
          {view === 'day' && (
            <Card padded={false}>
              <div className="px-4 py-3 border-b border-neutral-200">
                <h2 className="text-subheading">Table availability</h2>
                <p className="text-caption text-neutral-500">{avail.data ? `${freeTables} of ${avail.data.tableCount} free now · ${avail.data.bookedSlots} booking${avail.data.bookedSlots === 1 ? '' : 's'} today` : 'Loading…'}</p>
              </div>
              {avail.isLoading ? <div className="p-4"><LoadingState rows={3} /></div> : <ul className="divide-y divide-neutral-100 max-h-[560px] overflow-y-auto">{(avail.data?.tables ?? []).map((t) => (
                <li key={t.tableId} className="px-4 py-2.5 text-sm">
                  <div className="flex items-center gap-2"><span className="font-medium">{t.tableName}</span><span className="text-caption text-neutral-500">{t.capacity} seats · {t.floorName}</span>{t.isVip && <Badge size="sm" tone="warning">VIP</Badge>}<span className="ml-auto"><StatusBadge kind="table" status={t.currentStatus} size="sm" hideIcon /></span></div>
                  {t.reservations.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{t.reservations.map((s) => <Badge key={s.resId} size="sm" tone={s.status === 'SEATED' ? 'primary' : 'info'}>{s.time} {s.guestName} ({s.guests})</Badge>)}</div>}
                </li>))}</ul>}
            </Card>
          )}
        </div>
      )}
      {formOpen && <ReservationForm editing={editing} defaultDate={date} onClose={() => setFormOpen(false)} />}
      {seat && <SeatModal r={seat} onClose={() => setSeat(null)} />}
      <ConfirmDialog open={!!cancel} onClose={() => setCancel(null)} variant="danger" title={`Cancel reservation for ${cancel?.guestName}?`} confirmLabel="Cancel reservation" loading={transition.isPending} onConfirm={async () => { if (cancel) { await transition.mutateAsync({ id: cancel.id, action: 'CANCEL', reason: reason || 'cancelled by staff' }); setCancel(null); setReason(''); } }}>
        <Textarea label="Reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </ConfirmDialog>
    </div>
  );
}
