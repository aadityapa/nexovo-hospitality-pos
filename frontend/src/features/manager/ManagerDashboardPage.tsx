import type { CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { Activity, AlertTriangle, ArrowRight, Bell, Boxes, ChefHat, Clock, Plus, Receipt, Wine } from 'lucide-react';
import { reportsApi } from '@/services/api/endpoints';
import { useOrders } from '@/features/orders/hooks';
import { useNotifications } from '@/features/p2/hooks';
import { useAuth, usePermission } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useRealtime';
import { useDateRange, DateRangeFilter } from '@/features/shared/DateRangeFilter';
import { DashboardHero, RecentPanels, RecentOrdersTable, FactGrid, FactDelta, greetingFor, useComparison, type Fact } from '@/features/dashboard/DashboardPage';
import { StatCard, Card, CardHeader, LoadingState, ErrorState, EmptyState, StatusBadge, Badge, Button } from '@/components/ui';
import { CountUp, staggerDelay } from '@/components/motion';
import { money } from '@/utils/money';
import { elapsedMinutes, fmtTime } from '@/utils/date';
import { DELAY_THRESHOLDS } from '@/config/statuses';
import { notificationTarget } from '@/config/notifications';
import { useChartTheme, compactMoney } from '@/config/chartTheme';
import { cn } from '@/utils/cn';
import type { DashboardSummary } from '@/types';

/* Sparkline / chart series, from figures the report already returned for buckets it measured.
   Nothing is zero-filled: an hour with no paid bills is absent from `byHour`, and inventing a
   zero for it would draw a fall that never happened. */
const multiDay = (d: DashboardSummary) => d.sales.byDay.length > 1;

/**
 * The `--d` beat of a staged reveal — a function of a card's POSITION in its row and of nothing
 * else. This screen polls the live order feed every 20 seconds; a delay derived from a figure
 * would change when that figure did, and CSS would restart the entrance on every poll.
 */
const beat = (i: number) => ({ '--d': `${staggerDelay(i)}ms` }) as CSSProperties;

/* ============================================================================================ *
 * TODAY'S SALES — the wide half of the command centre's two-up.
 *
 * The same series, the same empty rule and the same tokens as the overview dashboard's trend
 * card: `byDay` when the period spans days, the 24-hour bar chart when it does not, no entrance
 * animation on the chart itself, and `useChartTheme()` as the one place a literal colour may be
 * resolved (Recharts paints SVG attributes, not classes — there is no hex in this file).
 * ============================================================================================ */
function TodaysSalesCard({ d, compare }: { d: DashboardSummary; compare?: Fact['compare'] }) {
  const { CHART, axisProps, gridProps, tooltipProps } = useChartTheme();
  const byDay = multiDay(d);
  const hourly = Array.from({ length: 24 }, (_, h) => ({
    hour: `${String(h).padStart(2, '0')}`,
    sales: d.sales.byHour.find((x) => x.hour === h)?.sales ?? 0,
  }));

  return (
    <Card className="anim-enter-soft">
      <CardHeader
        title="Today's sales"
        subtitle={byDay ? 'Paid bills across the selected period' : 'Paid bills by hour of trading'}
      />
      {/*
       * THE ONE COUNT-UP ON THIS SCREEN, and the only one permitted anywhere on it. It rolls the
       * FIRST finite value it is handed and passes every later one straight through, so the
       * 20-second live poll, a window-focus refetch and a realtime invalidate all leave it alone.
       * Nothing below it rolls — those are figures to reconcile against.
       */}
      <p className="text-metric text-neutral-900 tnum leading-none">
        <CountUp value={d.sales.totalSales} format={(n) => money(n)} />
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
        {/* The delta arrives only once the previous period has genuinely been fetched, and says
            "no data for …" rather than "+100%" when that period recorded nothing. */}
        {compare && <FactDelta current={compare.current} previous={compare.previous} label={compare.label} />}
        <span className="text-caption text-neutral-500">
          {d.sales.totalOrders} paid bill{d.sales.totalOrders === 1 ? '' : 's'} · {money(d.sales.discountTotal)} discounted
        </span>
      </div>

      {d.sales.totalOrders === 0 ? (
        <EmptyState compact title="No paid bills in this period" description="Sales appear here once a bill is settled." />
      ) : (
        <>
          {/* The chart is decoration for assistive technology; this sentence is the record. */}
          <p className="sr-only">
            {byDay
              ? `Sales across ${d.sales.byDay.length} days, totalling ${money(d.sales.totalSales)}.`
              : `Sales across ${d.sales.byHour.length} trading hours, totalling ${money(d.sales.totalSales)}.`}
          </p>
          <div className="h-56 mt-4" aria-hidden>
            <ResponsiveContainer>
              {byDay ? (
                <AreaChart data={d.sales.byDay} margin={{ left: 0, right: 8, top: 8 }}>
                  <defs>
                    <linearGradient id="managerSalesGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART.primaryFill} stopOpacity={0.24} />
                      <stop offset="100%" stopColor={CHART.primaryFill} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="date" {...axisProps} tickFormatter={(v: string) => v.slice(5)} />
                  <YAxis {...axisProps} tickFormatter={compactMoney} width={52} />
                  <Tooltip {...tooltipProps} formatter={(v: number) => [money(v), 'Sales']} />
                  <Area type="monotone" dataKey="sales" name="Sales" stroke={CHART.primary} fill="url(#managerSalesGradient)" strokeWidth={2} isAnimationActive={false} />
                </AreaChart>
              ) : (
                <BarChart data={hourly} margin={{ left: 0, right: 8, top: 8 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="hour" {...axisProps} interval={2} />
                  <YAxis {...axisProps} tickFormatter={compactMoney} width={52} />
                  <Tooltip {...tooltipProps} formatter={(v: number) => [money(v), 'Sales']} labelFormatter={(h) => `${h}:00`} />
                  <Bar dataKey="sales" name="Sales" fill={CHART.primary} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </>
      )}
    </Card>
  );
}

/**
 * The legend's colour chip. Its value comes from `useChartTheme()` and is the SAME value the
 * matching `<Cell>` is filled with, so a chip and its slice cannot drift apart.
 */
function SeriesSwatch({ index }: { index: number }) {
  const { CHART_SERIES } = useChartTheme();
  return (
    <span
      className="h-2.5 w-2.5 rounded-full shrink-0 ring-1 ring-inset ring-neutral-300/40"
      style={{ background: CHART_SERIES[index % CHART_SERIES.length] }}
      aria-hidden
    />
  );
}

/**
 * REVENUE BY CATEGORY — kept from this screen's previous composition rather than dropped when the
 * two-up above it became "today's sales beside the live feed". The ring is decoration; the legend
 * below it is the record, and every figure in it was returned by the report.
 */
function CategoryCard({ d }: { d: DashboardSummary }) {
  const { CHART_SERIES, tooltipProps } = useChartTheme();
  const categories = d.items.byCategory;
  const categoryTotal = categories.reduce((a, c) => a + c.revenue, 0);
  const listed = categories.slice(0, 6);
  const rest = categories.length - listed.length;

  return (
    <Card className="anim-enter-soft">
      <CardHeader title="Revenue by category" subtitle="Share of item revenue" />
      {categories.length === 0 ? (
        <EmptyState compact title="No item sales yet" />
      ) : (
        <>
          <div className="relative h-52 w-full">
            <div className="absolute inset-0" aria-hidden>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={categories} dataKey="revenue" nameKey="categoryName" innerRadius="58%" outerRadius="82%" paddingAngle={2} strokeWidth={0} isAnimationActive={false}>
                    {categories.map((_, i) => <Cell key={i} fill={CHART_SERIES[i % CHART_SERIES.length]} />)}
                  </Pie>
                  <Tooltip {...tooltipProps} formatter={(v: number) => money(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="absolute inset-0 grid place-items-center pointer-events-none px-6 text-center">
              <div className="min-w-0">
                <p className="text-label uppercase text-neutral-500 leading-none">Item revenue</p>
                <p className="text-subheading text-neutral-900 tnum mt-1 leading-tight break-words">{money(categoryTotal)}</p>
              </div>
            </div>
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            {listed.map((c, i) => (
              <li key={c.categoryName} className="flex items-center gap-2 min-w-0">
                <SeriesSwatch index={i} />
                <span className="truncate flex-1 text-neutral-700">{c.categoryName}</span>
                <span className="tnum text-neutral-500 shrink-0 w-10 text-right">
                  {categoryTotal > 0 ? `${Math.round((c.revenue / categoryTotal) * 100)}%` : '—'}
                </span>
                <span className="tnum text-neutral-900 font-medium shrink-0">{money(c.revenue)}</span>
              </li>
            ))}
          </ul>
          {rest > 0 && (
            <p className="mt-2 text-caption text-neutral-500">
              {rest} smaller {rest === 1 ? 'category is' : 'categories are'} in the ring and in the total above.
            </p>
          )}
        </>
      )}
    </Card>
  );
}

/** One operational alert. Every one of these is a condition that is true right now. */
interface OpAlert {
  key: string;
  tone: 'danger' | 'warning';
  icon: 'delay' | 'stock' | 'table';
  text: string;
  hint?: string;
  to: string;
}

const ALERT_ICON = { delay: AlertTriangle, stock: Boxes, table: Receipt } as const;

/**
 * Operations-first command centre for managers: what needs attention now, then the numbers.
 *
 * The composition is the manager board's — greeting and clock with one gold *Start new order*,
 * four action tiles that each navigate to the work they count, today's sales beside the live order
 * feed, and an operational-alerts strip ending in *View all alerts*. Everything the screen carried
 * before is still here: the sales headline and its real comparison moved into the trend card, the
 * table occupancy and the period figures into "Also today", and the category ring below them.
 */
export default function ManagerDashboardPage() {
  const dr = useDateRange('today');
  const navigate = useNavigate();
  const { user } = useAuth();
  const canCreateOrder = usePermission('orders:create');
  const now = useNow(15_000);
  const dash = useQuery({ queryKey: ['dashboard', dr.range], queryFn: () => reportsApi.dashboard(dr.range) });
  const cmp = useComparison(dr);
  const live = useOrders({ active: true }, { refetchInterval: 20_000 });
  /* The same unread feed the alert centre lists — same hook, same key, same permission. It is the
     only place low stock is recorded, so the alerts strip reads it rather than inventing one. */
  const notif = useNotifications(true);

  const active = live.data ?? [];
  const mins = (iso: string) => elapsedMinutes(iso, now);
  const waitFrom = (o: { confirmedAt?: string | null; createdAt: string }) => o.confirmedAt ?? o.createdAt;
  const delayed = active.filter((o) => ['CONFIRMED', 'IN_PROGRESS', 'PARTIALLY_READY'].includes(o.status) && mins(waitFrom(o)) >= DELAY_THRESHOLDS.late);
  const readyOrders = active.filter((o) => o.items.some((i) => i.status === 'READY'));
  const pendingOrders = active.filter((o) => ['CONFIRMED', 'IN_PROGRESS', 'PARTIALLY_READY'].includes(o.status));
  const billPending = active.filter((o) => ['BILL_REQUESTED', 'BILLED'].includes(o.status));
  const kitchenBacklog = active.reduce((a, o) => a + o.items.filter((i) => i.prepLocation === 'KITCHEN' && ['NEW', 'PREPARING'].includes(i.status)).length, 0);
  const barBacklog = active.reduce((a, o) => a + o.items.filter((i) => i.prepLocation === 'BAR' && ['NEW', 'PREPARING'].includes(i.status)).length, 0);

  /**
   * THE ALERTS STRIP — delayed orders longest-waiting first, then the low-stock alerts the system
   * has actually raised, then the tables waiting on someone. Sorted by a fixed timestamp rather
   * than by the live minute count, so a poll never reorders the strip under the manager's eyes.
   */
  const alerts: OpAlert[] = [
    ...[...delayed]
      .sort((a, b) => waitFrom(a).localeCompare(waitFrom(b)))
      .map((o) => ({
        key: `delay-${o.id}`,
        tone: 'danger' as const,
        icon: 'delay' as const,
        text: `${o.tableName} waiting ${mins(waitFrom(o))} min`,
        hint: `${o.orderNumber} · ${o.waiterName}`,
        to: `/admin/orders/${o.id}`,
      })),
    ...(notif.data?.items ?? [])
      .filter((n) => n.entity === 'INVENTORY_ITEM' || n.entity === 'INVENTORY_ITEMS')
      .slice(0, 4)
      .map((n) => ({
        key: `stock-${n.id}`,
        tone: n.severity === 'CRITICAL' ? ('danger' as const) : ('warning' as const),
        icon: 'stock' as const,
        text: n.title,
        hint: n.body ?? undefined,
        to: notificationTarget(n) ?? '/admin/inventory',
      })),
    ...(kitchenBacklog > DELAY_THRESHOLDS.backlog
      ? [{ key: 'kitchen', tone: 'warning' as const, icon: 'delay' as const, text: `Kitchen backlog: ${kitchenBacklog} items pending`, to: '/kitchen' }]
      : []),
    ...(barBacklog > DELAY_THRESHOLDS.backlog
      ? [{ key: 'bar', tone: 'warning' as const, icon: 'delay' as const, text: `Bar backlog: ${barBacklog} items pending`, to: '/bar' }]
      : []),
    ...billPending
      .filter((o) => mins(o.billRequestedAt ?? o.createdAt) >= DELAY_THRESHOLDS.warn)
      .map((o) => ({
        key: `bill-${o.id}`,
        tone: 'warning' as const,
        icon: 'table' as const,
        text: `${o.tableName} bill pending ${mins(o.billRequestedAt ?? o.createdAt)} min`,
        hint: 'waiting to settle at the counter',
        to: '/cashier',
      })),
  ];

  const d = dash.data;
  const prev = cmp.previous;

  /*
   * EVERY FIGURE THAT LEFT THE TILE ROW, kept. Table occupancy describes this instant and carries
   * no comparison, because there is no previous-period value of it to compare against; the period
   * figures carry the real one, which appears only once the second fetch has resolved and says
   * "no data for …" rather than "+100%" when the period before recorded none.
   */
  const alsoToday: Fact[] = [
    {
      label: 'Tables occupied',
      value: d ? `${d.occupiedTables} / ${d.totalTables}` : '…',
      hint: d ? `${d.availableTables} free` : undefined,
      to: '/admin/tables',
    },
    {
      label: 'Paid bills',
      value: d ? d.sales.totalOrders : '…',
      hint: 'settled in this period',
      compare: d ? cmp.compare(d.sales.totalOrders, prev?.sales.totalOrders) : undefined,
    },
    {
      label: 'Average bill',
      value: d ? money(d.sales.averageOrderValue) : '…',
      compare: d ? cmp.compare(d.sales.averageOrderValue, prev?.sales.averageOrderValue) : undefined,
    },
    {
      label: 'Cancelled',
      value: d ? d.orders.cancelled : '…',
      hint: d ? `${d.orders.cancelledItems} items` : undefined,
      tone: !!d && d.orders.cancelled > 0 ? 'danger' : 'neutral',
    },
  ];

  const firstName = user?.fullName.split(' ')[0];

  return (
    <div>
      {/*
       * THE HEAD: the greeting, the clock on this machine, and the screen's actions.
       *
       * The head's action slot is `shrink-0`, so whatever is put in it sets a width the page
       * cannot shrink below. Two things keep that honest at 360 px: the actions are ONE group
       * carrying a DEFINITE max-width until `sm` — a definite length is what actually constrains
       * an intrinsic width, and the group wraps inside it — and the period control moved to the
       * head's own full-width row underneath, where it can wrap freely. Both behave exactly as
       * they did: the same presets, the same custom from/to inputs, the same state.
       */}
      <DashboardHero
        title={firstName ? `${greetingFor(now)}, ${firstName}` : 'Manager dashboard'}
        subtitle="What needs attention now, and how the shift is tracking"
        range={dr.range}
        actions={
          <div className="flex flex-wrap items-center gap-2 max-w-[13rem] sm:max-w-none">
            {/* The clock, built exactly like the period chip beside it — tokens only. Below `sm`
                it stands down: the phone already prints the time above this screen. */}
            <span className="hidden sm:inline-flex items-center gap-2 rounded-md border border-neutral-200 bg-surface-raised px-2.5 h-9 text-[13px] text-neutral-700">
              <Clock className="h-4 w-4 text-neutral-400 shrink-0" aria-hidden />
              <time dateTime={now.toISOString()} className="tnum">{fmtTime(now.toISOString())}</time>
            </span>
            <Button variant="outline" leftIcon={<Activity className="h-4 w-4" />} onClick={() => navigate('/manager/live')}>Live operations</Button>
            {/* THE ONE GOLD ACTION ON THIS SCREEN. Order entry lives in the waiter shell for every
                role, which is where this goes — the same real action, behind the same permission. */}
            {canCreateOrder && (
              <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => navigate('/waiter/tables')}>Start new order</Button>
            )}
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-2 min-w-0"><DateRangeFilter state={dr} /></div>
      </DashboardHero>

      {dash.isError && <ErrorState error={dash.error} onRetry={() => void dash.refetch()} compact />}

      {/*
       * FOUR ACTION TILES. Each is a real count taken from the LIVE order feed, and each navigates
       * to the work it counts — the board's row, in the board's order, with the tones the numbers
       * deserve. A "previous period" value of a service count does not exist and none is invented.
       */}
      <div className="grid grid-cols-1 xs:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Ready to serve"
          value={readyOrders.length}
          icon={<Bell className="h-5 w-5" />}
          tone="success"
          hint="orders with an item on the pass"
          onClick={() => navigate('/manager/live')}
          className="anim-reveal"
          style={beat(0)}
        />
        <StatCard
          label="In progress"
          value={pendingOrders.length}
          icon={<ChefHat className="h-5 w-5" />}
          tone="info"
          hint="with the kitchen or bar"
          onClick={() => navigate('/manager/live')}
          className="anim-reveal"
          style={beat(1)}
        />
        {/*
         * The verdict tile. This is the one card on the screen where the FIGURE is the answer —
         * "is anything late?" — so it is the one that takes a gradient wash: `fill-danger` when
         * tables are waiting, `fill-success` when none are. The wash tracks the live count, so it
         * changes with the shift; it is a restatement of the tone and the hint already on the
         * card, never the only carrier of the meaning.
         */}
        <StatCard
          label="Delayed"
          value={delayed.length}
          icon={<AlertTriangle className="h-5 w-5" />}
          tone={delayed.length ? 'danger' : 'success'}
          hint={`waiting over ${DELAY_THRESHOLDS.late} min`}
          onClick={() => navigate('/manager/live')}
          className={cn('anim-reveal', delayed.length ? 'fill-danger' : 'fill-success')}
          style={beat(2)}
        />
        <StatCard
          label="Bills pending"
          value={billPending.length}
          icon={<Receipt className="h-5 w-5" />}
          tone="warning"
          hint={d ? `${money(d.pendingPayments)} unpaid` : undefined}
          onClick={() => navigate('/cashier')}
          className="anim-reveal"
          style={beat(3)}
        />
      </div>

      {/* Today's sales beside the live feed. Both tracks are `minmax(0,1fr)`-based, so a long axis
          label can never push a track wider than its share — a bare `2fr` sizes to min-content. */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4 mt-5">
        {dash.isLoading ? <div className="card p-5"><LoadingState rows={6} /></div> : d ? (
          <TodaysSalesCard d={d} compare={cmp.compare(d.sales.totalSales, prev?.sales.totalSales)} />
        ) : <div />}

        {/* The feed reveals as a PANEL. The order rows inside it do not stagger: the list
            re-renders every time the 20-second poll lands, and a manager scanning for the late
            table must not watch it arrive. */}
        <Card padded={false} className="anim-reveal" style={beat(4)}>
          <CardHeader
            className="p-5 pb-0"
            title="Live order feed"
            subtitle={`${active.length} active order${active.length === 1 ? '' : 's'}`}
            action={
              <>
                <div className="hidden xl:flex gap-2">
                  <Badge icon={<ChefHat className="h-3 w-3" />} tone={kitchenBacklog > DELAY_THRESHOLDS.backlog ? 'danger' : 'warning'}>{kitchenBacklog} kitchen</Badge>
                  <Badge icon={<Wine className="h-3 w-3" />} tone={barBacklog > DELAY_THRESHOLDS.backlog ? 'danger' : 'info'}>{barBacklog} bar</Badge>
                </div>
                <Button size="sm" variant="ghost" rightIcon={<ArrowRight className="h-4 w-4" />} onClick={() => navigate('/manager/live')}>View all</Button>
              </>
            }
          />
          {live.isLoading ? <div className="p-5"><LoadingState rows={4} /></div> : active.length === 0 ? (
            <EmptyState compact title="No active orders" description="Orders appear here the moment a waiter sends them." />
          ) : (
            <ul className="divide-y divide-neutral-200 mt-2 max-h-[480px] overflow-y-auto overscroll-contain">
              {active.slice(0, 20).map((o) => {
                const late = delayed.some((x) => x.id === o.id);
                return (
                  <li key={o.id}>
                    <button type="button" onClick={() => navigate(`/admin/orders/${o.id}`)} className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-left hover:bg-neutral-100 text-sm transition-colors duration-control">
                      <span className="font-semibold shrink-0 truncate max-w-[7rem]">{o.tableName}</span>
                      <StatusBadge kind="order" status={o.status} size="sm" />
                      <span className="tnum font-medium shrink-0 ml-auto">{money(o.subtotal)}</span>
                      <span className="basis-full flex items-center gap-2 min-w-0">
                        <span className="flex-1 min-w-0 text-caption text-neutral-500 truncate">
                          {o.orderNumber} · {o.waiterName} · {fmtTime(o.createdAt)}
                        </span>
                        <span className={cn('tnum text-caption shrink-0 text-right', late ? 'text-danger-700 font-semibold' : 'text-neutral-500')}>
                          {mins(o.createdAt)} min
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* OPERATIONAL ALERTS — a row of the conditions that are true right now, and nothing else.
          The grid declares a base single column and `minmax(0,1fr)` tracks above it, so a long
          alert can never push the strip wider than the page. */}
      <Card className="anim-reveal mt-5" style={beat(5)}>
        <CardHeader
          title="Operational alerts"
          subtitle="Thresholds are set per branch"
          action={<Button size="sm" variant="ghost" rightIcon={<ArrowRight className="h-4 w-4" />} onClick={() => navigate('/admin/notifications')}>View all alerts</Button>}
        />
        {alerts.length === 0 ? (
          <EmptyState compact title="All clear" description="No delays, backlogs or stock warnings right now." />
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-[repeat(2,minmax(0,1fr))] xl:grid-cols-[repeat(3,minmax(0,1fr))] gap-2.5">
            {alerts.slice(0, 6).map((a) => {
              const Icon = ALERT_ICON[a.icon];
              return (
                <li key={a.key} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => navigate(a.to)}
                    className="well w-full text-left px-3.5 py-3 min-w-0 flex items-start gap-2.5 transition-colors duration-control hover:bg-neutral-100 hover:border-neutral-300 press"
                  >
                    <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', a.tone === 'danger' ? 'text-danger-700' : 'text-warning-700')} aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-sm text-neutral-900 break-words">{a.text}</span>
                      {a.hint && <span className="block text-caption text-neutral-500 break-words">{a.hint}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {alerts.length > 6 && (
          <p className="text-caption text-neutral-500 mt-2.5">
            {alerts.length - 6} more {alerts.length - 6 === 1 ? 'alert is' : 'alerts are'} waiting on the alert centre.
          </p>
        )}
      </Card>

      {/* Commercial performance below the operational picture — same quiet cards as the overview
          dashboard, so the two screens read as one product. */}
      <div className="mt-5 space-y-5">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4">
          <Card className="anim-reveal">
            <CardHeader title="Also today" subtitle="The rest of the floor, and how the period is settling" />
            <FactGrid facts={alsoToday} />
          </Card>
          {d && <CategoryCard d={d} />}
        </div>

        {dash.isLoading && <LoadingState variant="page" />}
        {d && (
          <>
            <RecentPanels d={d} />
            <RecentOrdersTable d={d} orderLink={(id) => `/admin/orders/${id}`} />
          </>
        )}
      </div>
    </div>
  );
}
