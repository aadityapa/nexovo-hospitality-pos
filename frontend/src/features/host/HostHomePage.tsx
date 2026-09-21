import { useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, PartyPopper, Crown, UserPlus, Plus, Armchair, Users, Contact, Clock, AlertTriangle, LayoutGrid, CheckCircle2 } from 'lucide-react';
import { useReservations, useClubDashboard, useVipTables, useReservationMutations } from '@/features/p2/hooks';
import { useTables } from '@/features/tables/hooks';
import { CheckInModal } from '@/features/club/ClubDashboardPage';
import { MinimumSpendMeter, showMinimumSpend } from '@/features/club/VipTablesPage';
import { ReservationForm } from '@/features/reservations/ReservationsPage';
import { DashboardHero } from '@/features/dashboard/DashboardPage';
import { useAuth, usePermission } from '@/hooks/useAuth';
import { useRealtimeInvalidate } from '@/hooks/useRealtime';
import { Avatar, Button, Card, CardHeader, StatCard, StatusBadge, StatusDot, statusMeta, Badge, LoadingState, EmptyState } from '@/components/ui';
import { staggerDelay } from '@/components/motion';
import { money } from '@/utils/money';
import { todayInput } from '@/utils/date';
import { cn } from '@/utils/cn';

/** The `--d` beat of a staged reveal — a function of position, never of the booking behind it. */
const beat = (i: number) => ({ '--d': `${staggerDelay(i)}ms` }) as CSSProperties;

/**
 * Home for the HOST role — tonight at a glance: bookings, door, VIP tables.
 *
 * THE THREE CARDS ACROSS THE TOP answer the host's three questions in the order they are asked:
 * who is at the door next, how the day's book is running, and whether there is a table. Every
 * figure in them is counted from a record this screen fetched — the day's reservations, the table
 * list and the VIP floor. Nothing is estimated, and a fact the product does not record (a waiting
 * list, a guest tier) is simply absent rather than invented.
 *
 * MATERIAL. Violet is the VIP classification in this product and nothing else, so the VIP panel
 * carries `.fill-vip` — the accent wash straight off the token. The "VIP tables booked" tile takes
 * the same wash, so the tile and the panel it summarises are visibly one surface. Gold stays on
 * the band and on the one *Seat guest* action; the desk's arrivals are neutral, because a booking
 * is not a premium event.
 *
 * MOTION. One rise for the arriving-next card, a sweep across the row, then the panels.
 * `useRealtimeInvalidate` refetches bookings, the door and the tables on every event, so nothing
 * here is keyed on data: each entrance is a CSS animation on an element that stays mounted, and
 * React reusing that node is what stops the animation replaying. Not one arrival row, VIP row or
 * door-activity row animates — the host is reading a list of names against a queue at the door.
 * "Seat" and "Check in guests" are live on first paint.
 */
export default function HostHomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canRes = usePermission('reservations:manage');
  const canClub = usePermission('club:manage');
  const canVip = usePermission('vip:view');
  const today = todayInput();
  const res = useReservations({ from: today, to: today });
  const club = useClubDashboard();
  const vip = useVipTables();
  const tables = useTables();
  const { transition } = useReservationMutations();
  const [checkIn, setCheckIn] = useState(false);
  const [newRes, setNewRes] = useState(false);
  useRealtimeInvalidate(['reservations', 'club', 'tables', 'orders']);
  const upcoming = (res.data ?? []).filter((r) => ['PENDING', 'CONFIRMED'].includes(r.status)).sort((a, b) => a.time.localeCompare(b.time));
  const seated = (res.data ?? []).filter((r) => r.status === 'SEATED').length;
  /** Arrivals the desk has finished with: seated now, or seated and since closed. */
  const arrived = (res.data ?? []).filter((r) => ['SEATED', 'COMPLETED'].includes(r.status)).length;
  const covers = upcoming.reduce((a, r) => a + r.guests, 0);
  const nowMs = Date.now();
  const dueAt = (date: string, time: string) => new Date(`${date}T${time}`).getTime();
  const late = upcoming.filter((r) => nowMs - dueAt(r.date, r.time) > 5 * 60_000);
  /** The one booking the host should be watching the door for. */
  const next = upcoming.find((r) => dueAt(r.date, r.time) >= nowMs) ?? upcoming[0];
  /**
   * VIP tables carry two independent facts and the host desk must never merge them:
   * `booking` is tonight's VIP reservation record, `status` is what the table is doing now
   * (the engine derives it from the active order). A table with no booking may still be
   * occupied by a walk-in, so nothing here is counted as "free" just because it is unbooked.
   */
  const vipTables = vip.data ?? [];
  const vipBooked = vipTables.filter((t) => !!t.booking).length;
  const vipInService = vipTables.filter((t) => t.status !== 'AVAILABLE' && t.status !== 'CLOSED').length;
  /** Guests actually sitting at a VIP table right now — the seated bookings' own covers. */
  const vipGuestsInHouse = vipTables.reduce((a, t) => a + (t.booking?.status === 'SEATED' ? t.booking.guests : 0), 0);
  const vipTableIds = useMemo(() => new Set(vipTables.map((t) => t.tableId)), [vipTables]);

  /**
   * THE FLOOR, PARTITIONED ONCE.
   *
   * A closed table is not part of tonight's service, so it is outside the total. Everything else
   * is exactly one of three things: in service (the engine's own status), held for a booking still
   * to arrive (an upcoming reservation names it), or free. The three counts therefore add up to
   * the total printed beside them — which is what makes the bar underneath a measurement rather
   * than a decoration.
   */
  const reservedIds = useMemo(() => new Set(upcoming.map((r) => r.tableId).filter((id): id is number => id != null)), [upcoming]);
  const floor = useMemo(() => {
    const serviceable = (tables.data ?? []).filter((t) => t.isActive && t.status !== 'CLOSED');
    const occupied = serviceable.filter((t) => t.status !== 'AVAILABLE').length;
    const held = serviceable.filter((t) => t.status === 'AVAILABLE' && reservedIds.has(t.id)).length;
    return { total: serviceable.length, occupied, held, free: serviceable.length - occupied - held };
  }, [tables.data, reservedIds]);
  const pct = (n: number) => (floor.total > 0 ? `${(n / floor.total) * 100}%` : '0%');

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  /**
   * The desk works one service: the same date the bookings on this page were fetched for. The
   * band takes a range, so that day is handed to it as an instant inside the day (local midday),
   * which prints the date itself in any timezone instead of a degenerate "20 Sep – 20 Sep".
   */
  const period = useMemo(() => { const at = new Date(`${today}T12:00:00`).toISOString(); return { from: at, to: at }; }, [today]);

  /**
   * The seat action, unchanged in behaviour: it seats the booking on its own table and follows the
   * order the transition opens, or sends the host to assign a table when the booking has none.
   * The `lg` instance is the screen's ONE gold action — the board's *Seat guest* — and the row
   * instances stay the green confirmation they have always been.
   */
  const seatButton = (r: NonNullable<typeof next>, size: 'sm' | 'lg') =>
    canRes && (r.tableId
      ? <Button size={size} variant={size === 'lg' ? 'primary' : 'success'} leftIcon={<Armchair className={size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'} />} loading={transition.isPending && transition.variables?.id === r.id} onClick={async () => { const out = await transition.mutateAsync({ id: r.id, action: 'SEAT', tableId: r.tableId! }); if (out.orderId) navigate(`/admin/orders/${out.orderId}`); }}>{size === 'lg' ? 'Seat guest' : 'Seat'}</Button>
      : <Button size={size} variant="outline" leftIcon={<Armchair className={size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'} />} onClick={() => navigate('/admin/reservations')}>Assign table</Button>);

  return (
    <div>
      {/* The same band as the dashboards: the venue and branch this desk is working, the greeting,
          and the service date every figure below is counted for. */}
      {/* `actions` is one group with a DEFINITE max-width below `sm`: the head's action slot is
          `shrink-0`, so without a definite cap three buttons set a max-content width the page
          cannot shrink under at 360 px. Above `sm` the cap lifts and the row reads as it did. */}
      <DashboardHero
        title={`${greeting}, ${user?.fullName.split(' ')[0] ?? 'host'}`}
        subtitle="Tonight at a glance — bookings, the door and the VIP floor"
        range={period}
        actions={<div className="flex flex-wrap items-center gap-2 max-w-[13rem] sm:max-w-none">
          <Button variant="ghost" leftIcon={<Contact className="h-4 w-4" />} onClick={() => navigate('/admin/customers')}>Guest profiles</Button>
          {canRes && <Button variant="outline" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setNewRes(true)}>New reservation</Button>}
          {canClub && <Button size="lg" variant="outline" leftIcon={<UserPlus className="h-5 w-5" />} onClick={() => setCheckIn(true)}>Check in guests</Button>}
        </div>}
      />

      {/* THE THREE CARDS. One column below `lg` so no label is ever truncated on a phone. */}
      <div className="grid grid-cols-1 lg:grid-cols-[repeat(3,minmax(0,1fr))] gap-4 mb-5">
        {/* Who is arriving next — the single question a host asks most, answered before scrolling. */}
        {res.isLoading ? <div className="card p-5"><LoadingState rows={2} /></div> : !next ? (
          <Card className="anim-reveal" style={beat(0)}>
            <CardHeader title="Next arrival" subtitle="Nobody is due at the door" />
            <EmptyState
              compact
              title="No more arrivals today"
              description={seated > 0 ? `${seated} table${seated === 1 ? ' is' : 's are'} seated.` : 'New bookings appear here the moment they are taken.'}
            />
          </Card>
        ) : (() => {
          const isLate = late.some((r) => r.id === next.id);
          const isVipTable = next.tableId != null && vipTableIds.has(next.tableId);
          return (
            <Card className={cn('border-l-4 anim-reveal', isLate ? 'border-l-danger-500 fill-danger' : 'border-l-primary-500 bg-surface-sheen')} style={beat(0)}>
              <p className="text-label uppercase text-neutral-500 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" aria-hidden />
                {isLate ? 'Overdue arrival' : 'Next arrival'}
              </p>
              <div className="mt-2.5 flex items-start gap-3 min-w-0">
                {/* A record avatar, not the brand one: the gold disc belongs to the person signed
                    in, and a guest is a record like any other in this product. */}
                <Avatar name={next.guestName} variant="record" size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-subheading text-neutral-900 break-words">{next.guestName}</span>
                    <StatusBadge kind="reservation" status={next.status} size="sm" hideIcon />
                    {isVipTable && <Badge size="sm" tone="accent" icon={<Crown className="h-3 w-3" aria-hidden />}>VIP table</Badge>}
                    {isLate && <Badge size="sm" tone="danger" icon={<AlertTriangle className="h-3.5 w-3.5" aria-hidden />}>past booked time</Badge>}
                  </p>
                  <p className="mt-1 flex items-baseline gap-2 flex-wrap">
                    <span className="text-metric text-neutral-900 tabular-nums leading-none">{next.time}</span>
                    <span className="text-sm text-neutral-500">
                      {next.guests} guest{next.guests === 1 ? '' : 's'} · {next.tableName ?? next.tablePref ?? 'no table assigned'}
                    </span>
                  </p>
                  {/* The number the host rings when the door is late — a real field on the booking. */}
                  <p className="text-sm text-neutral-500 tnum mt-0.5">{next.phone}</p>
                </div>
              </div>
              <div className="mt-4">{seatButton(next, 'lg')}</div>
            </Card>
          );
        })()}

        {/* The day's book, counted three ways. Every count is a filter of the same fetched day. */}
        <Card className="anim-reveal" style={beat(1)}>
          <CardHeader
            title="Today's arrivals"
            subtitle={res.data ? `${res.data.length} booked today · ${covers} covers still to come` : undefined}
            action={<Button size="sm" variant="ghost" onClick={() => navigate('/admin/reservations')}>All bookings</Button>}
          />
          {res.isLoading ? <LoadingState rows={3} /> : (
            <ul className="space-y-2.5">
              {[
                { key: 'arrived', icon: <CheckCircle2 className="h-4 w-4 text-success-700" aria-hidden />, label: 'Arrived', value: arrived, hint: `${seated} still seated` },
                { key: 'upcoming', icon: <CalendarDays className="h-4 w-4 text-primary-700" aria-hidden />, label: 'Still to arrive', value: upcoming.length, hint: `${covers} cover${covers === 1 ? '' : 's'}` },
                { key: 'late', icon: <AlertTriangle className={cn('h-4 w-4', late.length ? 'text-danger-700' : 'text-neutral-400')} aria-hidden />, label: 'Past booked time', value: late.length, hint: late.length ? 'chase the door' : 'nobody overdue' },
              ].map((row) => (
                <li key={row.key} className="well px-3.5 py-2.5 flex items-center gap-2.5 min-w-0">
                  {row.icon}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-neutral-900 leading-tight">{row.label}</span>
                    <span className="block text-caption text-neutral-500">{row.hint}</span>
                  </span>
                  <span className="text-[19px] font-semibold tabular-nums text-neutral-900 shrink-0">{row.value}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* The floor as a fraction, then the same three counts as a proportional bar. */}
        <Card className="anim-reveal" style={beat(2)}>
          <CardHeader
            title="Table availability"
            subtitle="Closed tables are outside tonight's service"
            action={<Button size="sm" variant="ghost" leftIcon={<LayoutGrid className="h-4 w-4" />} onClick={() => navigate('/admin/tables')}>Floor plan</Button>}
          />
          {tables.isLoading ? <LoadingState rows={2} /> : floor.total === 0 ? (
            <EmptyState compact title="No tables in service" description="Tables appear here once the floor is configured." />
          ) : (
            <>
              <p className="flex items-baseline gap-2">
                <span className="text-metric text-neutral-900 tabular-nums leading-none">{floor.free} / {floor.total}</span>
                <span className="text-sm text-neutral-500">tables free now</span>
              </p>
              {/* The bar is the fast scan; the counts beneath it are the record. It is built from
                  the same three integers, so it cannot disagree with them. */}
              <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-surface ring-1 ring-inset ring-neutral-200 shadow-inset" aria-hidden>
                {floor.occupied > 0 && <span className="bg-primary-500 h-full" style={{ width: pct(floor.occupied) }} />}
                {floor.held > 0 && <span className="bg-info-500 h-full" style={{ width: pct(floor.held) }} />}
                {floor.free > 0 && <span className="bg-success-500 h-full" style={{ width: pct(floor.free) }} />}
              </div>
              <ul className="mt-3 space-y-1.5 text-sm">
                <li className="flex items-center gap-2">
                  <StatusDot tone="primary" />
                  <span className="text-neutral-500 flex-1 min-w-0">Occupied</span>
                  <span className="tnum font-semibold text-neutral-900">{floor.occupied}</span>
                </li>
                <li className="flex items-center gap-2">
                  <StatusDot tone="info" />
                  <span className="text-neutral-500 flex-1 min-w-0">Reserved</span>
                  <span className="tnum font-semibold text-neutral-900">{floor.held}</span>
                </li>
                <li className="flex items-center gap-2">
                  <StatusDot tone="success" />
                  <span className="text-neutral-500 flex-1 min-w-0">Available</span>
                  <span className="tnum font-semibold text-neutral-900">{floor.free}</span>
                </li>
              </ul>
            </>
          )}
        </Card>
      </div>

      {/* The door and the VIP floor, kept as tiles: both drill into the screens that own them. */}
      <div className="grid grid-cols-1 xs:grid-cols-2 gap-3 xs:gap-4 mb-5">
        <StatCard label="Guests inside" value={club.data?.guestsInside ?? '…'} icon={<Users className="h-5 w-5" />} tone="info" hint={club.data ? `${club.data.entries} entries · ${money(club.data.coverRevenue)} cover` : undefined} onClick={() => navigate('/admin/club')} className="anim-reveal" style={beat(3)} />
        {/* VIP is the one classification the violet belongs to, on the tile as on the tables — so
            this tile carries the same `fill-vip` wash as the VIP panel it summarises. */}
        <StatCard label="VIP tables booked" value={vip.data ? `${vipBooked} / ${vipTables.length}` : '…'} icon={<Crown className="h-5 w-5" />} tone="accent" hint={vip.data ? `booked tonight · ${vipInService} in service now` : undefined} onClick={() => navigate('/admin/vip')} className="anim-reveal fill-vip" style={beat(4)} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[repeat(2,minmax(0,1fr))]">
        <Card padded={false} className="anim-reveal" style={beat(5)}>
          <CardHeader className="p-4 pb-0" title={<span className="flex items-center gap-2"><CalendarDays className="h-4 w-4" />Upcoming arrivals</span>} subtitle={res.data ? `${upcoming.length} still to arrive${late.length > 0 ? ` · ${late.length} past the booked time` : ''}` : undefined} action={<Button size="sm" variant="ghost" onClick={() => navigate('/admin/reservations')}>All bookings</Button>} />
          {res.isLoading ? <div className="p-4"><LoadingState rows={3} /></div> : upcoming.length === 0 ? <EmptyState compact title="No more arrivals today" description={seated > 0 ? `${seated} table${seated === 1 ? ' is' : 's are'} seated.` : undefined} /> : (
            <ul className="divide-y divide-neutral-200 mt-2">{upcoming.slice(0, 8).map((r) => {
              const isLate = nowMs - dueAt(r.date, r.time) > 5 * 60_000;
              return (
                <li key={r.id} className={cn('py-3 pr-4 border-l-4 flex flex-col xs:flex-row xs:items-center gap-2 xs:gap-3', isLate ? 'border-l-danger-500 bg-danger-50/60 pl-3' : r.id === next?.id ? 'border-l-primary-500 bg-primary-50/60 pl-3' : 'border-l-transparent pl-4')}>
                  <span className="flex items-start gap-3 flex-1 min-w-0">
                    <time className="text-lg font-bold tabular-nums w-14 shrink-0 text-neutral-900">{r.time}</time>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium truncate text-neutral-900">{r.guestName}</span>
                        <StatusBadge kind="reservation" status={r.status} size="sm" hideIcon />
                        {isLate && <Badge size="sm" tone="danger" icon={<AlertTriangle className="h-3.5 w-3.5" aria-hidden />}>late</Badge>}
                        {r.tableId != null && vipTableIds.has(r.tableId) && <Badge size="sm" tone="accent" icon={<Crown className="h-3 w-3" aria-hidden />}>VIP table</Badge>}
                        {r.occasion && <Badge size="sm" tone="info">{r.occasion}</Badge>}
                      </span>
                      <span className="block text-caption text-neutral-500">{r.guests} guests · {r.tableName ?? r.tablePref ?? 'table TBD'} · {r.phone}</span>
                    </span>
                  </span>
                  <span className="shrink-0 [&>button]:min-h-touch xs:[&>button]:min-h-0">{seatButton(r, 'sm')}</span>
                </li>
              );
            })}</ul>
          )}
        </Card>

        <Card padded={false} className="fill-vip anim-reveal" style={beat(6)}>
          <CardHeader
            className="p-4 pb-0"
            title={<span className="flex items-center gap-2"><Crown className="h-4 w-4 text-accent-500" aria-hidden />VIP guests in house<span className="tabular-nums text-neutral-500">· {vipGuestsInHouse}</span></span>}
            subtitle={vip.data ? `${vipBooked} of ${vipTables.length} VIP tables booked tonight · ${vipInService} in service now` : undefined}
            action={canVip && <Button size="sm" variant="ghost" onClick={() => navigate('/admin/vip')}>Manage</Button>}
          />
          {vip.isLoading ? <div className="p-4"><LoadingState rows={2} /></div> : vipTables.length === 0 ? <EmptyState compact title="No VIP tables configured" /> : (
            <ul className="divide-y divide-neutral-200 mt-2">{vipTables.map((t) => {
              const b = t.booking;
              const svc = statusMeta('table', t.status);
              return (
                <li key={t.tableId} className="px-4 py-3 flex items-start gap-3">
                  <span className="w-16 shrink-0 font-bold text-neutral-900">{t.tableName}</span>
                  <div className="flex-1 min-w-0">
                    {/* Reservation for tonight — says nothing about who is sitting there. */}
                    {b ? (
                      <>
                        <span className="flex items-center gap-2"><span className="font-medium truncate text-neutral-900">{b.guestName}</span><StatusBadge kind="vip" status={b.status} size="sm" hideIcon /></span>
                        {showMinimumSpend(b) ? (
                          <MinimumSpendMeter booking={b} tableName={t.tableName} compact showDeposit className="mt-1.5" />
                        ) : (
                          <span className="block text-caption text-neutral-500 tabular-nums">
                            {b.guests} guests · {b.minSpend > 0 ? `min ${money(b.minSpend)}` : `no minimum${b.status === 'SEATED' ? ` · ${money(b.currentSpend)} spent` : ''}`}
                            {b.depositAmount > 0 ? ` · deposit ${b.depositPaid ? 'collected' : 'not collected'}` : ''}
                          </span>
                        )}
                      </>
                    ) : <span className="block text-sm text-neutral-700">No booking tonight <span className="text-caption text-neutral-500 tabular-nums">· min {money(t.minSpendDefault)}</span></span>}
                    {/* Current service — the table's own status, booked or not. */}
                    <span className="mt-1 flex items-center gap-1.5 text-caption text-neutral-500">
                      <StatusDot tone={svc.tone} />
                      Now: {svc.label}{b?.status === 'SEATED' && b.orderNumber ? ` · ${b.orderNumber}` : ''}
                    </span>
                  </div>
                </li>
              );
            })}</ul>
          )}
        </Card>

        {club.data && (
          <Card padded={false} className="xl:col-span-2 anim-reveal" style={beat(7)}>
            <CardHeader className="p-4 pb-0" title={<span className="flex items-center gap-2"><PartyPopper className="h-4 w-4" />Recent door activity</span>} subtitle={`${club.data.guestsInside} inside · ${club.data.guestsTotal} entered today`} action={<Button size="sm" variant="ghost" onClick={() => navigate('/admin/club')}>Club dashboard</Button>} />
            {club.data.recentEntries.length === 0 ? <EmptyState compact title="No entries yet tonight" action={canClub && <Button onClick={() => setCheckIn(true)}>Check in</Button>} /> : (
              <ul className="divide-y divide-neutral-200 mt-2">{club.data.recentEntries.slice(0, 6).map((e) => <li key={e.id} className="px-4 py-2.5 flex items-center gap-3 text-sm"><span className="flex-1 min-w-0"><span className="font-medium text-neutral-900">{e.guestName}</span> <span className="text-caption text-neutral-500">{e.guests} guests · {e.entryNumber}{e.coverName ? ` · ${e.coverName}` : ''}</span></span><StatusBadge kind="entry" status={e.status} size="sm" hideIcon /></li>)}</ul>
            )}
          </Card>
        )}
      </div>
      {checkIn && <CheckInModal onClose={() => setCheckIn(false)} />}
      {newRes && <ReservationForm editing={null} defaultDate={today} onClose={() => setNewRes(false)} />}
    </div>
  );
}
