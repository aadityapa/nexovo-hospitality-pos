import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, PartyPopper, Crown, UserPlus, Plus, Armchair, Users, Contact, Clock, AlertTriangle } from 'lucide-react';
import { useReservations, useClubDashboard, useVipTables, useReservationMutations } from '@/features/p2/hooks';
import { CheckInModal } from '@/features/club/ClubDashboardPage';
import { ReservationForm } from '@/features/reservations/ReservationsPage';
import { useAuth, usePermission } from '@/hooks/useAuth';
import { useRealtimeInvalidate } from '@/hooks/useRealtime';
import { PageHeader, Button, Card, CardHeader, StatCard, StatusBadge, Badge, LoadingState, EmptyState } from '@/components/ui';
import { money } from '@/utils/money';
import { todayInput } from '@/utils/date';
import { cn } from '@/utils/cn';

/** Home for the HOST role — tonight at a glance: bookings, door, VIP tables. */
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
  const { transition } = useReservationMutations();
  const [checkIn, setCheckIn] = useState(false);
  const [newRes, setNewRes] = useState(false);
  useRealtimeInvalidate(['reservations', 'club', 'tables', 'orders']);
  const upcoming = (res.data ?? []).filter((r) => ['PENDING', 'CONFIRMED'].includes(r.status)).sort((a, b) => a.time.localeCompare(b.time));
  const seated = (res.data ?? []).filter((r) => r.status === 'SEATED').length;
  const covers = upcoming.reduce((a, r) => a + r.guests, 0);
  const nowMs = Date.now();
  const dueAt = (date: string, time: string) => new Date(`${date}T${time}`).getTime();
  const late = upcoming.filter((r) => nowMs - dueAt(r.date, r.time) > 5 * 60_000);
  /** The one booking the host should be watching the door for. */
  const next = upcoming.find((r) => dueAt(r.date, r.time) >= nowMs) ?? upcoming[0];
  const vipFree = (vip.data ?? []).filter((t) => !t.booking).length;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const seatButton = (r: NonNullable<typeof next>, size: 'sm' | 'lg') =>
    canRes && (r.tableId
      ? <Button size={size} variant="success" leftIcon={<Armchair className={size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'} />} loading={transition.isPending && transition.variables?.id === r.id} onClick={async () => { const out = await transition.mutateAsync({ id: r.id, action: 'SEAT', tableId: r.tableId! }); if (out.orderId) navigate(`/admin/orders/${out.orderId}`); }}>Seat</Button>
      : <Button size={size} variant="outline" leftIcon={<Armchair className={size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'} />} onClick={() => navigate('/admin/reservations')}>Assign table</Button>);

  return (
    <div>
      <PageHeader
        title={`${greeting}, ${user?.fullName.split(' ')[0] ?? 'host'}`}
        subtitle="Tonight at a glance"
        actions={<>
          <Button variant="ghost" leftIcon={<Contact className="h-4 w-4" />} onClick={() => navigate('/admin/customers')}>Guest profiles</Button>
          {canRes && <Button variant="outline" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setNewRes(true)}>New reservation</Button>}
          {canClub && <Button size="lg" leftIcon={<UserPlus className="h-5 w-5" />} onClick={() => setCheckIn(true)}>Check in guests</Button>}
        </>}
      />

      {/* Who is arriving next — the single question a host asks most, answered before any scrolling. */}
      {res.isLoading ? <div className="card p-5 mb-4"><LoadingState rows={1} /></div> : next && (
        <Card className={cn('mb-4 border-l-4', late.some((r) => r.id === next.id) ? 'border-l-danger-500' : 'border-l-primary-600')}>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-label uppercase text-neutral-500 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" aria-hidden />
                {late.some((r) => r.id === next.id) ? 'Overdue arrival' : 'Arriving next'}
              </p>
              <p className="mt-1 flex items-baseline gap-2 flex-wrap">
                <span className="text-metric text-neutral-900 tabular-nums">{next.time}</span>
                <span className="text-subheading text-neutral-900 truncate">{next.guestName}</span>
                <StatusBadge kind="reservation" status={next.status} size="sm" />
                {late.some((r) => r.id === next.id) && <Badge size="sm" tone="danger" icon={<AlertTriangle className="h-3.5 w-3.5" aria-hidden />}>past booked time</Badge>}
              </p>
              <p className="text-sm text-neutral-500 mt-1">
                {next.guests} guest{next.guests === 1 ? '' : 's'} · {next.tableName ?? next.tablePref ?? 'no table assigned'} · {next.phone}
              </p>
            </div>
            <div className="shrink-0 flex gap-2">{seatButton(next, 'lg')}</div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
        <StatCard label="Still to arrive" value={res.data ? upcoming.length : '…'} icon={<CalendarDays className="h-5 w-5" />} tone="primary" hint={res.data ? `${covers} covers · ${seated} seated · ${res.data.length} booked today` : undefined} onClick={() => navigate('/admin/reservations')} />
        <StatCard label="Guests inside" value={club.data?.guestsInside ?? '…'} icon={<Users className="h-5 w-5" />} tone="info" hint={club.data ? `${club.data.entries} entries · ${money(club.data.coverRevenue)} cover` : undefined} onClick={() => navigate('/admin/club')} />
        <StatCard label="VIP tables free" value={vip.data ? `${vipFree} / ${vip.data.length}` : '…'} icon={<Crown className="h-5 w-5" />} tone="warning" hint="free / total" onClick={() => navigate('/admin/vip')} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card padded={false}>
          <CardHeader className="p-4 pb-0" title={<span className="flex items-center gap-2"><CalendarDays className="h-4 w-4" />Arrivals</span>} subtitle={res.data ? `${upcoming.length} still to arrive${late.length > 0 ? ` · ${late.length} past the booked time` : ''}` : undefined} action={<Button size="sm" variant="ghost" onClick={() => navigate('/admin/reservations')}>All bookings</Button>} />
          {res.isLoading ? <div className="p-4"><LoadingState rows={3} /></div> : upcoming.length === 0 ? <EmptyState compact title="No more arrivals today" description={seated > 0 ? `${seated} table${seated === 1 ? ' is' : 's are'} seated.` : undefined} /> : (
            <ul className="divide-y divide-neutral-100 mt-2">{upcoming.slice(0, 8).map((r) => {
              const isLate = nowMs - dueAt(r.date, r.time) > 5 * 60_000;
              return (
                <li key={r.id} className={cn('py-3 pr-4 border-l-4 flex flex-col xs:flex-row xs:items-center gap-2 xs:gap-3', isLate ? 'border-l-danger-500 bg-danger-50/40 pl-3' : r.id === next?.id ? 'border-l-primary-600 bg-primary-50/50 pl-3' : 'border-l-transparent pl-4')}>
                  <span className="flex items-start gap-3 flex-1 min-w-0">
                    <time className="text-lg font-bold tabular-nums w-14 shrink-0">{r.time}</time>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium truncate">{r.guestName}</span>
                        <StatusBadge kind="reservation" status={r.status} size="sm" hideIcon />
                        {isLate && <Badge size="sm" tone="danger" icon={<AlertTriangle className="h-3.5 w-3.5" aria-hidden />}>late</Badge>}
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

        <Card padded={false}>
          <CardHeader className="p-4 pb-0" title={<span className="flex items-center gap-2"><Crown className="h-4 w-4" />VIP tables</span>} subtitle={vip.data ? `${vipFree} free of ${vip.data.length}` : undefined} action={canVip && <Button size="sm" variant="ghost" onClick={() => navigate('/admin/vip')}>Manage</Button>} />
          {vip.isLoading ? <div className="p-4"><LoadingState rows={2} /></div> : (vip.data ?? []).length === 0 ? <EmptyState compact title="No VIP tables configured" /> : (
            <ul className="divide-y divide-neutral-100 mt-2">{(vip.data ?? []).map((t) => {
              const b = t.booking;
              const pct = b && b.minSpend ? Math.min(100, (b.currentSpend / b.minSpend) * 100) : 0;
              return (
                <li key={t.tableId} className="px-4 py-3 flex items-center gap-3">
                  <span className="w-16 shrink-0 font-bold">{t.tableName}</span>
                  <span className="flex-1 min-w-0">
                    {b ? (
                      <>
                        <span className="flex items-center gap-2"><span className="font-medium truncate">{b.guestName}</span><StatusBadge kind="vip" status={b.status} size="sm" hideIcon /></span>
                        {b.status === 'SEATED' && b.minSpend > 0 ? (
                          <>
                            <span
                              role="progressbar"
                              aria-label={`Minimum spend progress for ${t.tableName}`}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={Math.round(pct)}
                              className="block h-1.5 mt-1.5 rounded-full bg-neutral-100 overflow-hidden"
                            >
                              <span className={cn('block h-full', pct >= 100 ? 'bg-success-500' : pct >= 60 ? 'bg-warning-500' : 'bg-danger-500')} style={{ width: `${pct}%` }} />
                            </span>
                            <span className="block text-caption text-neutral-500 mt-0.5 tabular-nums">{b.remainingSpend > 0 ? `${money(b.remainingSpend)} to minimum` : 'minimum met'}</span>
                          </>
                        ) : <span className="block text-caption text-neutral-500">{b.guests} guests · min {money(b.minSpend)}</span>}
                      </>
                    ) : <span className="text-sm text-neutral-500">Free · min {money(t.minSpendDefault)}</span>}
                  </span>
                  {b?.status === 'SEATED' && <span className="text-caption tabular-nums text-right shrink-0">{money(b.currentSpend)}<span className="block text-neutral-500">of {money(b.minSpend)}</span></span>}
                </li>
              );
            })}</ul>
          )}
        </Card>

        {club.data && (
          <Card padded={false} className="xl:col-span-2">
            <CardHeader className="p-4 pb-0" title={<span className="flex items-center gap-2"><PartyPopper className="h-4 w-4" />Recent door activity</span>} subtitle={`${club.data.guestsInside} inside · ${club.data.guestsTotal} entered today`} action={<Button size="sm" variant="ghost" onClick={() => navigate('/admin/club')}>Club dashboard</Button>} />
            {club.data.recentEntries.length === 0 ? <EmptyState compact title="No entries yet tonight" action={canClub && <Button onClick={() => setCheckIn(true)}>Check in</Button>} /> : (
              <ul className="divide-y divide-neutral-100 mt-2">{club.data.recentEntries.slice(0, 6).map((e) => <li key={e.id} className="px-4 py-2.5 flex items-center gap-3 text-sm"><span className="flex-1 min-w-0"><span className="font-medium">{e.guestName}</span> <span className="text-caption text-neutral-500">{e.guests} guests · {e.entryNumber}{e.coverName ? ` · ${e.coverName}` : ''}</span></span><StatusBadge kind="entry" status={e.status} size="sm" hideIcon /></li>)}</ul>
            )}
          </Card>
        )}
      </div>
      {checkIn && <CheckInModal onClose={() => setCheckIn(false)} />}
      {newRes && <ReservationForm editing={null} defaultDate={today} onClose={() => setNewRes(false)} />}
    </div>
  );
}
