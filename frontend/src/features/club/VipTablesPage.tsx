import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Crown, Plus, Armchair, CheckCircle2, X, UserX, TrendingUp, Pencil, AlertTriangle } from 'lucide-react';
import { useVipTables, useVipList, useVipSpend, useClubMutations, useCustomers, useStaff } from '@/features/p2/hooks';
import { usePermission } from '@/hooks/useAuth';
import { useRealtimeInvalidate } from '@/hooks/useRealtime';
import { PageHeader, Button, Card, Modal, ConfirmDialog, Input, Select, Textarea, Switch, StatusBadge, statusMeta, Badge, SegmentedControl, LoadingState, ErrorState, EmptyState, KeyValue } from '@/components/ui';
import { ApiError } from '@/services/api/client';
import { money } from '@/utils/money';
import { fmtDate, todayInput } from '@/utils/date';
import { cn } from '@/utils/cn';
import type { VipReservation, VipReservationInput, VipStatus, VipTable } from '@/types';

const schema = z.object({
  tableId: z.coerce.number().min(1, 'Pick a VIP table'), guestName: z.string().trim().min(2, 'Guest name is required'), phone: z.string().trim().max(30).optional(), date: z.string().min(1), guests: z.coerce.number().int().min(1).max(100),
  minSpend: z.coerce.number().min(0), depositAmount: z.coerce.number().min(0), depositPaid: z.boolean(), hostUserId: z.coerce.number().optional(), customerId: z.coerce.number().optional(), notes: z.string().max(300).optional(),
});
type Form = z.infer<typeof schema>;

export function VipBookingForm({ editing, tables, defaultTable, onClose }: { editing: VipReservation | null; tables: VipTable[]; defaultTable?: VipTable | null; onClose: () => void }) {
  const { saveVip } = useClubMutations();
  const customers = useCustomers({ limit: 200 });
  const hosts = useStaff('HOST');
  const { register, handleSubmit, watch, setValue, setError, formState: { errors } } = useForm<Form>({ resolver: zodResolver(schema), values: { tableId: editing?.tableId ?? defaultTable?.tableId ?? 0, guestName: editing?.guestName ?? '', phone: editing?.phone ?? '', date: editing?.date ?? todayInput(), guests: editing?.guests ?? 4, minSpend: editing?.minSpend ?? defaultTable?.minSpendDefault ?? 0, depositAmount: editing?.depositAmount ?? defaultTable?.depositDefault ?? 0, depositPaid: editing?.depositPaid ?? false, hostUserId: editing?.hostUserId ?? undefined, customerId: editing?.customerId ?? undefined, notes: editing?.notes ?? '' } });
  const onSubmit = async (v: Form) => {
    const body: VipReservationInput = { tableId: v.tableId, customerId: v.customerId || null, guestName: v.guestName, phone: v.phone || undefined, date: v.date, guests: v.guests, minSpend: v.minSpend, depositAmount: v.depositAmount, depositPaid: v.depositPaid, hostUserId: v.hostUserId || null, notes: v.notes || undefined };
    try { await saveVip.mutateAsync({ id: editing?.id ?? null, body }); onClose(); }
    catch (e) { const err = ApiError.from(e); setError((err.errors.find((x) => x.field)?.field as keyof Form) ?? (err.status === 409 ? 'tableId' : 'guestName'), { message: err.message }); }
  };
  return (
    <Modal open onClose={onClose} size="lg" title={editing ? `Edit ${editing.vipNumber}` : 'Book VIP table'} description="Minimum spend is tracked live against the table's order; the shortfall rule in Settings decides what happens at billing." footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={handleSubmit(onSubmit)} loading={saveVip.isPending}>{editing ? 'Save changes' : 'Book table'}</Button></>}>
      <form onSubmit={handleSubmit(onSubmit)} className="grid sm:grid-cols-2 gap-4" noValidate>
        <Select label="VIP table" required placeholder="Select table" options={tables.map((t) => ({ value: t.tableId, label: `${t.tableName} · ${t.capacity} seats · min ${money(t.minSpendDefault)}` }))} error={errors.tableId?.message} {...register('tableId', { onChange: (e) => { const t = tables.find((x) => x.tableId === Number(e.target.value)); if (t && !editing) { setValue('minSpend', t.minSpendDefault); setValue('depositAmount', t.depositDefault); } } })} />
        <Input label="Date" required type="date" error={errors.date?.message} {...register('date')} />
        <Select label="Existing customer" placeholder="New guest" options={(customers.data ?? []).map((c) => ({ value: c.id, label: `${c.fullName} · ${c.phone}` }))} wrapperClassName="sm:col-span-2" {...register('customerId', { onChange: (e) => { const c = customers.data?.find((x) => x.id === Number(e.target.value)); if (c) { setValue('guestName', c.fullName); setValue('phone', c.phone); } } })} />
        <Input label="Guest name" required error={errors.guestName?.message} {...register('guestName')} />
        <Input label="Phone" inputMode="tel" error={errors.phone?.message} {...register('phone')} />
        <Input label="Guests" required type="number" min={1} error={errors.guests?.message} {...register('guests')} />
        <Select label="Host" placeholder="None" options={(hosts.data ?? []).map((h) => ({ value: h.id, label: h.fullName }))} {...register('hostUserId')} />
        <Input label="Minimum spend (₹)" required type="number" min={0} error={errors.minSpend?.message} {...register('minSpend')} />
        <Input label="Deposit (₹)" type="number" min={0} error={errors.depositAmount?.message} {...register('depositAmount')} />
        <div className="self-end pb-2"><Switch checked={watch('depositPaid')} onChange={(v) => setValue('depositPaid', v)} label="Deposit collected" /></div>
        <Textarea label="Notes" rows={2} error={errors.notes?.message} {...register('notes')} />
      </form>
    </Modal>
  );
}

function SpendPanel({ booking, onClose }: { booking: VipReservation; onClose: () => void }) {
  const spend = useVipSpend(booking.id);
  const navigate = useNavigate();
  const s = spend.data ?? booking;
  const pct = Math.min(100, s.percentReached ?? (s.minSpend ? (s.currentSpend / s.minSpend) * 100 : 100));
  return (
    <Modal open onClose={onClose} size="md" title={`${booking.tableName} · ${booking.guestName}`} description={`${booking.vipNumber} · ${booking.guests} guests · ${fmtDate(booking.date)}`} footer={<>{s.orderId && <Button variant="outline" onClick={() => navigate(`/admin/orders/${s.orderId}`)}>Open order</Button>}<Button onClick={onClose}>Close</Button></>}>
      {spend.isLoading && !spend.data && <div className="mb-4"><LoadingState rows={1} /></div>}
      {s.minSpend > 0 ? (
        <div className="mb-4">
          <div className="flex justify-between text-sm mb-1"><span>Spend progress</span><span className="tabular-nums font-semibold">{money(s.currentSpend)} / {money(s.minSpend)}</span></div>
          <div
            role="progressbar"
            aria-label="Spend against minimum"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pct)}
            aria-valuetext={`${money(s.currentSpend)} of ${money(s.minSpend)}`}
            className="h-3 rounded-full bg-neutral-100 overflow-hidden"
          >
            <div className={cn('h-full rounded-full transition-all', pct >= 100 ? 'bg-success-500' : pct >= 60 ? 'bg-warning-500' : 'bg-danger-500')} style={{ width: `${pct}%` }} />
          </div>
          <p className={cn('text-caption mt-1 inline-flex items-center gap-1', s.remainingSpend > 0 ? 'text-danger-700' : 'text-success-700')}>
            {s.remainingSpend > 0 ? <><AlertTriangle className="h-3.5 w-3.5" aria-hidden />{pct.toFixed(0)}% reached · {money(s.remainingSpend)} to go</> : <><CheckCircle2 className="h-3.5 w-3.5" aria-hidden />Minimum met</>}
          </p>
        </div>
      ) : <p className="mb-4 text-sm text-neutral-500">No minimum spend on this booking.</p>}
      <KeyValue items={[
        /* Reservation and service are two different facts and are labelled as two rows. */
        { label: 'Reservation', value: <StatusBadge kind="vip" status={s.status} size="sm" /> },
        { label: 'Reserved for', value: fmtDate(s.date) },
        { label: 'Order on the table', value: s.orderNumber ? `${s.orderNumber} (${s.orderStatus})` : 'no order — nobody seated on this booking' },
        { label: 'Deposit', value: `${money(s.depositAmount)} ${s.depositPaid ? '· paid' : '· not collected'}` },
        { label: 'Shortfall rule', value: s.shortfallMode === 'WAIVE' ? 'Waived at billing' : s.shortfallMode === 'FLAT_FEE' ? 'Flat fee if under minimum' : 'Difference charged on the bill' },
        { label: 'Projected shortfall', value: <span className={cn('tabular-nums', (s.projectedShortfall ?? s.shortfallAmount) > 0 ? 'text-danger-700 font-semibold' : 'text-success-700')}>{money(s.projectedShortfall ?? s.shortfallAmount)}</span> },
        { label: 'Host', value: s.hostName ?? '—' },
      ]} />
      {s.notes && <p className="mt-3 text-sm text-neutral-600 border-t border-neutral-100 pt-3">{s.notes}</p>}
    </Modal>
  );
}

export default function VipTablesPage() {
  const navigate = useNavigate();
  const canManage = usePermission('vip:manage');
  const tables = useVipTables();
  const [filter, setFilter] = useState<'ALL' | VipStatus>('ALL');
  const list = useVipList({ status: filter === 'ALL' ? undefined : filter });
  const { transitionVip } = useClubMutations();
  const [form, setForm] = useState<{ editing: VipReservation | null; table?: VipTable | null } | null>(null);
  const [spend, setSpend] = useState<VipReservation | null>(null);
  const [cancel, setCancel] = useState<VipReservation | null>(null);
  const [reason, setReason] = useState('');
  useRealtimeInvalidate(['tables', 'orders', 'club']);
  const rows = list.data ?? [];
  const actions = (b: VipReservation) => canManage && (
    <span className="flex flex-wrap gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
      {b.status === 'BOOKED' && <Button size="sm" variant="success" leftIcon={<Armchair className="h-4 w-4" />} onClick={async () => { const r = await transitionVip.mutateAsync({ id: b.id, action: 'SEAT' }); if (r.orderId) navigate(`/admin/orders/${r.orderId}`); }}>Seat</Button>}
      {b.status === 'BOOKED' && <Button size="sm" variant="ghost" leftIcon={<UserX className="h-4 w-4" />} onClick={() => transitionVip.mutate({ id: b.id, action: 'NO_SHOW' })}>No-show</Button>}
      {b.status === 'SEATED' && <Button size="sm" variant="outline" leftIcon={<TrendingUp className="h-4 w-4" />} onClick={() => setSpend(b)}>Spend</Button>}
      {b.status === 'SEATED' && <Button size="sm" variant="outline" leftIcon={<CheckCircle2 className="h-4 w-4" />} onClick={() => transitionVip.mutate({ id: b.id, action: 'COMPLETE' })}>Complete</Button>}
      {['BOOKED', 'SEATED'].includes(b.status) && <><Button size="sm" variant="ghost" aria-label={`Edit booking ${b.vipNumber}`} onClick={() => setForm({ editing: b })}><Pencil className="h-4 w-4" aria-hidden /></Button><Button size="sm" variant="ghost" className="text-danger-700" aria-label={`Cancel booking ${b.vipNumber}`} onClick={() => setCancel(b)}><X className="h-4 w-4" aria-hidden /></Button></>}
    </span>
  );
  /**
   * `vip/tables` scopes each table's `booking` to the club's CURRENT BUSINESS DAY (it rolls
   * over at 06:00), so every booking it returns carries that date. The reservation axis is
   * therefore labelled from the data itself; when no table is booked at all there is no date
   * in the payload and the period is named as "tonight" rather than invented.
   */
  const bookedDate = (tables.data ?? []).find((t) => t.booking)?.booking?.date ?? null;
  const periodLabel = bookedDate ? `for ${fmtDate(bookedDate)}` : 'tonight';
  return (
    <div>
      <PageHeader title="VIP tables" subtitle="Each table shows two separate facts: who is at it right now, and the VIP booking for tonight" actions={canManage && <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setForm({ editing: null })}>Book VIP table</Button>} />
      {tables.isLoading && <LoadingState variant="cards" rows={2} />}
      {tables.isError && <ErrorState error={tables.error} onRetry={() => void tables.refetch()} />}
      {tables.data && (tables.data.length === 0 ? <EmptyState icon={<Crown className="h-6 w-6" />} title="No VIP tables configured" description="Mark a table as VIP (with default minimum spend and deposit) under Tables." action={<Button variant="outline" onClick={() => navigate('/admin/tables')}>Go to tables</Button>} /> : (
        <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4 mb-6">
          {tables.data.map((t) => {
            const b = t.booking;
            /**
             * TWO AXES, NEVER MERGED.
             *  · current service — what is happening at the table now. It comes from the
             *    table's own status, which the engine derives from the active order
             *    (`syncTableStatus`), so it is true whether or not a VIP booking exists.
             *  · reservation — whether a VIP booking exists for the business day this list
             *    covers, from the booking record.
             * A table can be occupied by a walk-in with no booking, and booked for tonight
             * with nobody sitting at it, so "free" is never inferred from a missing booking.
             */
            const svc = statusMeta('table', t.status);
            const inService = t.status !== 'AVAILABLE' && t.status !== 'CLOSED';
            const seatedHere = b?.status === 'SEATED';
            /* Progress is only shown once the table is seated and a real minimum exists —
               a booked-but-empty table has no spend to report. */
            const showProgress = !!b && b.status === 'SEATED' && b.minSpend > 0;
            const pct = b && b.minSpend ? Math.min(100, (b.currentSpend / b.minSpend) * 100) : 0;
            const met = !!b && b.remainingSpend <= 0;
            return (
              <Card key={t.tableId} padded={false} className={cn('flex flex-col border-2', inService ? 'border-warning-400' : b ? 'border-info-300' : 'border-neutral-200')}>
                <div className="p-4 flex-1 flex flex-col">
                  <div className="flex items-center gap-2">
                    <Crown className="h-4 w-4 text-warning-500 shrink-0" aria-hidden />
                    <h3 className="font-bold text-lg text-neutral-900 truncate">{t.tableName}</h3>
                  </div>
                  <p className="text-caption text-neutral-500 mt-0.5">{t.floorName} · {t.capacity} seats</p>

                  {/* ---------------------------------------------- axis 1: right now */}
                  <div className="mt-3 pt-3 border-t border-neutral-100">
                    <p className="text-label uppercase text-neutral-500">Current service</p>
                    <p className="mt-1.5"><StatusBadge kind="table" status={t.status} size="sm" /></p>
                    <p className="text-caption text-neutral-500 mt-1.5">
                      {seatedHere
                        ? `This VIP party is seated${b?.orderNumber ? ` · ${b.orderNumber}` : ''}`
                        : inService
                          ? 'An order is open on this table — not from a VIP booking'
                          : t.status === 'CLOSED' ? 'Table closed, nobody seated' : 'Nobody seated right now'}
                    </p>
                  </div>

                  {/* ------------------------------------ axis 2: the booking, with its date */}
                  <div className="mt-3 pt-3 border-t border-neutral-100 flex-1 flex flex-col">
                    <p className="text-label uppercase text-neutral-500">Reservation {b ? `for ${fmtDate(b.date)}` : periodLabel}</p>
                    {b ? (
                    <>
                      <div className="flex items-center gap-2 flex-wrap mt-1.5">
                        <span className="font-medium text-neutral-900 truncate">{b.guestName}</span>
                        <StatusBadge kind="vip" status={b.status} size="sm" />
                      </div>
                      <p className="text-caption text-neutral-500 mt-1">{b.guests} guests · {b.vipNumber}{b.hostName ? ` · ${b.hostName}` : ''}</p>
                      {b.depositAmount > 0 && <p className="mt-1.5"><Badge size="sm" tone={b.depositPaid ? 'success' : 'warning'}>deposit {money(b.depositAmount)}{b.depositPaid ? ' paid' : ' due'}</Badge></p>}

                      <div className="mt-auto pt-3">
                        <div className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="text-label uppercase text-neutral-500">Minimum spend</span>
                          <span className="tabular-nums font-semibold text-neutral-900">{money(b.minSpend)}</span>
                        </div>
                        {showProgress ? (
                          <>
                            <div
                              role="progressbar"
                              aria-label={`Spend against minimum on ${t.tableName}`}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={Math.round(pct)}
                              aria-valuetext={`${money(b.currentSpend)} of ${money(b.minSpend)}`}
                              className="h-2 mt-1.5 rounded-full bg-neutral-100 overflow-hidden"
                            >
                              <div className={cn('h-full rounded-full', met ? 'bg-success-500' : pct >= 60 ? 'bg-warning-500' : 'bg-danger-500')} style={{ width: `${pct}%` }} />
                            </div>
                            <p className="mt-1.5 flex items-center justify-between gap-2 text-caption tabular-nums">
                              <span className="text-neutral-700 font-medium">{money(b.currentSpend)} spent</span>
                              <span className={cn('inline-flex items-center gap-1 font-medium', met ? 'text-success-700' : 'text-danger-700')}>
                                {met ? <><CheckCircle2 className="h-3.5 w-3.5" aria-hidden />minimum met</> : <><AlertTriangle className="h-3.5 w-3.5" aria-hidden />{money(b.remainingSpend)} short</>}
                              </span>
                            </p>
                          </>
                        ) : (
                          <p className="text-caption text-neutral-500 mt-1.5">{b.status === 'BOOKED' ? 'Not seated yet — no spend recorded' : b.minSpend > 0 ? 'Spend tracked once the table is seated' : 'No minimum on this booking'}</p>
                        )}
                      </div>
                    </>
                    ) : (
                    <>
                      {/* No booking record — that says nothing about who is at the table, so
                          this line speaks only about the booking. */}
                      <p className="text-sm text-neutral-700 mt-1.5">No VIP booking taken</p>
                      <p className="text-caption text-neutral-500 mt-auto pt-3 tabular-nums">Table default: minimum {money(t.minSpendDefault)}{t.depositDefault > 0 ? ` · deposit ${money(t.depositDefault)}` : ''}</p>
                    </>
                    )}
                  </div>

                  {/* The server creates a fresh order when a booking is seated, and refuses a
                      second open order on a table unless the branch allows it — say so before
                      the waiter taps Seat. */}
                  {b?.status === 'BOOKED' && inService && (
                    <p className="mt-3 flex items-start gap-1.5 text-caption text-warning-700">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden />
                      <span>Table is {svc.label.toLowerCase()} on another order. Seating opens a new order and is refused while that one is open.</span>
                    </p>
                  )}
                </div>

                {/* Every card ends in the one action that moves this table forward. Each button
                    matches a transition the engine accepts: SEAT only from BOOKED, COMPLETE
                    only from SEATED, and a new booking only where tonight has none (saveVip
                    rejects a second BOOKED/SEATED reservation on the same table and date). */}
                {(b || canManage) && (
                <div className="border-t border-neutral-200 p-3 flex flex-wrap gap-2 [&>button]:min-h-touch">
                  {b ? <>
                    {canManage && b.status === 'BOOKED' && <Button size="sm" variant="success" className="flex-1" leftIcon={<Armchair className="h-4 w-4" />} loading={transitionVip.isPending && transitionVip.variables?.id === b.id} onClick={async () => { const r = await transitionVip.mutateAsync({ id: b.id, action: 'SEAT' }); if (r.orderId) navigate(`/admin/orders/${r.orderId}`); }}>Seat</Button>}
                    {canManage && b.status === 'SEATED' && <Button size="sm" variant="primary" className="flex-1" leftIcon={<CheckCircle2 className="h-4 w-4" />} loading={transitionVip.isPending && transitionVip.variables?.id === b.id} onClick={() => transitionVip.mutate({ id: b.id, action: 'COMPLETE' })}>Complete</Button>}
                    <Button size="sm" variant="outline" className={canManage && ['BOOKED', 'SEATED'].includes(b.status) ? '' : 'flex-1'} leftIcon={<TrendingUp className="h-4 w-4" />} onClick={() => setSpend(b)}>Details</Button>
                  </> : (
                    <Button size="sm" variant="outline" block leftIcon={<Plus className="h-4 w-4" />} onClick={() => setForm({ editing: null, table: t })}>Book {t.tableName}</Button>
                  )}
                </div>
                )}
              </Card>
            );
          })}
        </div>
      ))}
      <Card padded={false}>
        <div className="px-4 py-3 border-b border-neutral-200 flex flex-col sm:flex-row sm:items-center gap-2">
          <h2 className="text-subheading">Bookings</h2>
          <SegmentedControl size="sm" value={filter} onChange={setFilter} ariaLabel="Filter VIP bookings by status" options={[{ value: 'ALL', label: 'All' }, { value: 'BOOKED', label: 'Booked' }, { value: 'SEATED', label: 'Seated' }, { value: 'COMPLETED', label: 'Completed' }, { value: 'CANCELLED', label: 'Cancelled' }, { value: 'NO_SHOW', label: 'No-show' }]} className="sm:ml-auto" />
        </div>
        {list.isLoading ? <div className="p-4"><LoadingState rows={3} /></div> : list.isError ? <ErrorState compact error={list.error} onRetry={() => void list.refetch()} /> : rows.length === 0 ? <EmptyState compact title="No VIP bookings" /> : (
          <ul className="divide-y divide-neutral-100">{rows.map((b) => (
            <li key={b.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 cursor-pointer hover:bg-neutral-50" onClick={() => setSpend(b)}>
              <span className="w-24 shrink-0"><span className="font-bold">{b.tableName}</span><span className="block text-caption text-neutral-500">{fmtDate(b.date)}</span></span>
              <span className="flex-1 min-w-0"><span className="flex items-center gap-2 flex-wrap"><span className="font-medium">{b.guestName}</span><StatusBadge kind="vip" status={b.status} size="sm" />{b.depositAmount > 0 && <Badge size="sm" tone={b.depositPaid ? 'success' : 'warning'}>deposit {money(b.depositAmount)}{b.depositPaid ? ' paid' : ' due'}</Badge>}</span><span className="block text-caption text-neutral-500">{b.vipNumber} · {b.guests} guests · min {money(b.minSpend)}{b.orderNumber ? ` · ${b.orderNumber}` : ''}{b.hostName ? ` · host ${b.hostName}` : ''}</span></span>
              <span className="text-right text-sm shrink-0 w-36">
                {['SEATED', 'COMPLETED'].includes(b.status) ? <>
                  <span className="block tabular-nums font-semibold">{money(b.currentSpend)}<span className="text-caption font-normal text-neutral-500"> of {money(b.minSpend)}</span></span>
                  <span className={cn('text-caption inline-flex items-center gap-1 justify-end', b.shortfallAmount > 0 && b.status !== 'CANCELLED' ? 'text-danger-700' : 'text-success-700')}>
                    {b.status === 'COMPLETED'
                      ? (b.shortfallAmount > 0 ? <><AlertTriangle className="h-3 w-3" aria-hidden />short {money(b.shortfallAmount)}</> : <><CheckCircle2 className="h-3 w-3" aria-hidden />minimum met</>)
                      : (b.remainingSpend > 0 ? <><AlertTriangle className="h-3 w-3" aria-hidden />{money(b.remainingSpend)} to go</> : <><CheckCircle2 className="h-3 w-3" aria-hidden />minimum met</>)}
                  </span>
                </> : <>
                  <span className="block tabular-nums font-semibold">{money(b.minSpend)}</span>
                  <span className="text-caption text-neutral-500">minimum · nobody seated on it yet</span>
                </>}
              </span>
              {actions(b)}
            </li>))}</ul>
        )}
      </Card>
      {form && <VipBookingForm editing={form.editing} tables={tables.data ?? []} defaultTable={form.table} onClose={() => setForm(null)} />}
      {spend && <SpendPanel booking={spend} onClose={() => setSpend(null)} />}
      <ConfirmDialog open={!!cancel} onClose={() => setCancel(null)} variant="danger" title={`Cancel VIP booking ${cancel?.vipNumber}?`} message={cancel?.status === 'SEATED' ? 'The table has an open order — cancel or bill the order first if it has items.' : 'The table is released for the date.'} confirmLabel="Cancel booking" loading={transitionVip.isPending} onConfirm={async () => { if (cancel) { await transitionVip.mutateAsync({ id: cancel.id, action: 'CANCEL', reason: reason || 'cancelled by staff' }); setCancel(null); setReason(''); } }}>
        <Textarea label="Reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </ConfirmDialog>
    </div>
  );
}
