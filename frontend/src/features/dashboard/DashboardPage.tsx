import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { IndianRupee, ClipboardList, LayoutGrid, ArrowRight, Calculator, Receipt, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { reportsApi } from '@/services/api/endpoints';
import { useDateRange, DateRangeFilter } from '@/features/shared/DateRangeFilter';
import { useMenuItems } from '@/features/menu/hooks';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useSurface';
import { StatCard, Card, CardHeader, DataTable, LoadingState, ErrorState, EmptyState, StatusBadge, Badge, Button, ItemImage, KeyValue, type Column } from '@/components/ui';
import { EmptyPlate, EmptyReceipt, ProgressMeter } from '@/components/graphics';
import { CountUp, staggerDelay } from '@/components/motion';
import { money } from '@/utils/money';
import { fmtTime, fmtRelative } from '@/utils/date';
import { cn } from '@/utils/cn';
import { PAYMENT_METHOD_LABELS } from '@/config/statuses';
import { useChartTheme, compactMoney } from '@/config/chartTheme';
import type { DashboardSummary, DashboardPreset, DateRange, Order } from '@/types';

/* ============================================================================================ *
 * REAL COMPARISON DATA
 *
 * The dashboard endpoint takes a {from,to} window and nothing else, so the only honest way to
 * show "up 12% on last week" is to ask it a SECOND question: the same report for the period
 * immediately before this one, of exactly equal length. That is real data through the existing
 * contract — no backend change, no derived trend, no invented baseline.
 * ============================================================================================ */

/**
 * The period immediately preceding `range`, of identical length and ending one millisecond before
 * it starts. For `today` (00:00:00.000 → 23:59:59.999) that is yesterday, to the millisecond; for
 * a seven-day week it is the seven days before it.
 */
export function previousRange(range: DateRange): DateRange {
  const from = new Date(range.from).getTime();
  const to = new Date(range.to).getTime();
  const span = Math.max(0, to - from);
  return { from: new Date(from - span - 1).toISOString(), to: new Date(from - 1).toISOString() };
}

const PRESET_PERIOD: Record<Exclude<DashboardPreset, 'custom'>, string> = {
  today: 'yesterday',
  yesterday: 'the day before',
  week: 'previous week',
  month: 'previous month',
};

/** Names the period a delta is measured against, so no chip is ever a bare percentage. */
export function comparePeriodLabel(preset: DashboardPreset, range: DateRange): string {
  if (preset !== 'custom') return PRESET_PERIOD[preset];
  const days = Math.max(1, Math.round((new Date(range.to).getTime() - new Date(range.from).getTime()) / 86_400_000));
  return days === 1 ? 'the previous day' : `previous ${days} days`;
}

/**
 * Fetches the preceding period behind its OWN query key, so it caches independently of the
 * current one and switching the range back and forth costs nothing.
 *
 * `compare(current, previous)` is the only way a page builds a delta, and it returns `undefined`
 * until the second fetch has actually resolved — which is what makes "loading shows no delta"
 * structural rather than a rule someone has to remember.
 */
export function useComparison(dr: ReturnType<typeof useDateRange>) {
  const range = useMemo(() => previousRange(dr.range), [dr.range]);
  const query = useQuery({
    queryKey: ['dashboard', 'previous', range],
    queryFn: () => reportsApi.dashboard(range),
    staleTime: 60_000,
  });
  const label = comparePeriodLabel(dr.preset, dr.range);
  const previous = query.data;

  const compare = (current: number, before: number | undefined) =>
    (previous && before != null && Number.isFinite(before) && Number.isFinite(current)
      ? { current, previous: before, label }
      : undefined);

  return { previous, label, range, isPending: query.isPending, compare };
}

/* ---------------------------------------------------------------------------------------------
 * SPARKLINE SERIES — every point below is a figure the API returned for a bucket it measured.
 * Nothing is zero-filled: an hour the venue was shut is absent from `byHour`, and inventing a
 * zero for it would draw a crash that never happened.
 * ------------------------------------------------------------------------------------------- */
const multiDay = (d: DashboardSummary) => d.sales.byDay.length > 1;
const salesSeries = (d: DashboardSummary) => (multiDay(d) ? d.sales.byDay : d.sales.byHour).map((x) => x.sales);
const billsSeries = (d: DashboardSummary) => (multiDay(d) ? d.sales.byDay : d.sales.byHour).map((x) => x.orders);
/** Average bill per bucket — that bucket's own takings divided by its own bill count. */
const avgBillSeries = (d: DashboardSummary) =>
  (multiDay(d) ? d.sales.byDay : d.sales.byHour).filter((x) => x.orders > 0).map((x) => x.sales / x.orders);

/* ============================================================================================ *
 * MOTION — the choreography shared by this screen and the manager dashboard.
 *
 * Both are `expressive` in config/motion: content that is being READ, so a staged reveal helps the
 * eye find its order. Three rules hold the whole file together:
 *
 *   1. THE BEAT IS THE POSITION, NEVER THE DATA. `beat(i)` is a function of where a card sits in
 *      its row, so it is identical on every render. These screens refetch (window focus, the
 *      manager's 20-second live feed, a realtime invalidate); a delay derived from a figure would
 *      change when the figure did, and CSS would restart the animation on every poll.
 *   2. NOTHING RE-ANIMATES ON A REFETCH. The entrance classes are plain CSS animations on elements
 *      that stay mounted: React reuses the DOM node when only the numbers inside it change, so the
 *      animation cannot replay. Nothing here is keyed on data, and no `key` contains a value.
 *   3. ROWS DO NOT STAGGER. A panel reveals; the records inside it do not. A fifty-row table
 *      trickling in is slower to read, and these lists re-render on every poll.
 *
 * Charts use `.anim-enter-soft` — a fade with no rise. A chart that slides while it is being read
 * is a chart that cannot be read, and an axis that moves implies a value that moved.
 * ============================================================================================ */

/** The `--d` beat of a staged reveal, capped by `staggerDelay` so a long row still lands quickly. */
const beat = (i: number) => ({ '--d': `${staggerDelay(i)}ms` }) as CSSProperties;

/* ============================================================================================ *
 * PAGE HERO
 * ============================================================================================ */

/* `DashboardHero` lives in components/layout so screens with no charts do not pull recharts
   into their route chunk through this module. Re-exported here for the screens that import it
   alongside the rest of the dashboard composition. */
export { DashboardHero } from '@/components/layout/DashboardHero';
import { DashboardHero } from '@/components/layout/DashboardHero';

/** Time of day, from the clock on this machine — the same greeting the waiter and host heads use. */
export function greetingFor(d: Date): string {
  const h = d.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/* ============================================================================================ *
 * THE QUIET SECOND ROW — "Also today"
 *
 * The reference dashboard carries ONE row of four tiles. Everything the screen used to state in a
 * second row of tiles is still stated, in a single calm card underneath the charts: label, figure,
 * the same hint, the same drill-down. Nothing was dropped to make the top of the page shorter.
 * ============================================================================================ */

export interface Fact {
  label: string;
  value: ReactNode;
  hint?: string;
  /** Route this figure drills into, when it had one. Rendered as a real button with a text name. */
  to?: string;
  /** Only ever from a second, separately fetched period — see `useComparison`. */
  compare?: { current: number; previous: number; label: string };
  /** `danger` prints the figure on the danger text rung; the label and hint still carry the meaning. */
  tone?: 'neutral' | 'danger';
}

/**
 * The delta beside a quiet figure.
 *
 * Deliberately the SAME rule as `CompareChip` in components/ui/Card: direction is carried by an
 * icon and by the sign as well as by colour, the period is always named, and a change measured
 * from a period that recorded nothing is not a percentage — it says so instead of printing
 * "+100%". (The duplication is noted in the hand-back: `CompareChip` is not exported today.)
 */
export function FactDelta({ current, previous, label }: { current: number; previous: number; label: string }) {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous <= 0) {
    return (
      <span className="text-caption text-neutral-500 inline-flex items-center gap-1">
        <Minus className="h-3 w-3" aria-hidden />
        no data for {label}
      </span>
    );
  }
  const pct = ((current - previous) / previous) * 100;
  const flat = Math.abs(pct) < 0.05;
  return (
    <span className={cn(
      'text-caption inline-flex items-center gap-1 font-medium',
      flat ? 'text-neutral-500' : pct > 0 ? 'text-success-700' : 'text-danger-700',
    )}>
      {flat ? <Minus className="h-3 w-3" aria-hidden /> : pct > 0 ? <TrendingUp className="h-3 w-3" aria-hidden /> : <TrendingDown className="h-3 w-3" aria-hidden />}
      <span className="tnum">{Math.abs(pct).toFixed(1)}%</span>
      <span className="text-neutral-500 font-normal">vs {label}</span>
    </span>
  );
}

/**
 * A 2×N grid of label / figure pairs on the quiet surface — no icon tile, no material, no
 * sparkline. It reads as a summary list, which is what it is, and it cannot be mistaken for the
 * headline row above it.
 */
export function FactGrid({ facts, className }: { facts: Fact[]; className?: string }) {
  const navigate = useNavigate();
  return (
    <ul className={cn('grid grid-cols-1 xs:grid-cols-[repeat(2,minmax(0,1fr))] gap-2.5', className)}>
      {facts.map((f) => {
        const to = f.to;
        const body = (
          <>
            <span className="flex items-baseline justify-between gap-3 min-w-0">
              <span className="text-label uppercase text-neutral-500 leading-tight min-w-0 break-words">{f.label}</span>
              <span className={cn(
                'text-[19px] font-semibold tabular-nums whitespace-nowrap shrink-0 leading-tight',
                f.tone === 'danger' ? 'text-danger-700' : 'text-neutral-900',
              )}>
                {f.value}
              </span>
            </span>
            {(f.compare || f.hint) && (
              <span className="mt-1 block min-w-0">
                {f.compare && <FactDelta current={f.compare.current} previous={f.compare.previous} label={f.compare.label} />}
                {f.hint && <span className="block text-caption text-neutral-500 leading-snug">{f.hint}</span>}
              </span>
            )}
          </>
        );
        return (
          <li key={f.label} className="min-w-0">
            {to ? (
              /* A real button carrying the label and the figure as its accessible name. */
              <button
                type="button"
                onClick={() => navigate(to)}
                className="well w-full text-left px-3.5 py-3 min-w-0 transition-colors duration-control hover:bg-neutral-100 hover:border-neutral-300 press"
              >
                {body}
              </button>
            ) : (
              <div className="well px-3.5 py-3 min-w-0">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* ============================================================================================ *
 * CHARTS
 * ============================================================================================ */

/**
 * The legend's colour chip.
 *
 * Its value comes from `useChartTheme()` — the one place in the product where literal colour
 * values are allowed to live, because Recharts paints SVG attributes and not CSS classes — and it
 * is the SAME value the matching `<Cell>` is filled with, so a chip and its slice cannot drift
 * apart. There is no hex in this file, and switching the theme repaints chip and ring together.
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

export function SalesCharts({ d }: { d: DashboardSummary }) {
  /* Colours resolve for the theme that is painted right now — grid, axis ticks and tooltip
     included — so the same markup reads correctly on charcoal and on white. */
  const { CHART, CHART_SERIES, axisProps, gridProps, tooltipProps } = useChartTheme();

  const hourly = Array.from({ length: 24 }, (_, h) => ({
    hour: `${String(h).padStart(2, '0')}`,
    sales: d.sales.byHour.find((x) => x.hour === h)?.sales ?? 0,
  }));
  const byDay = multiDay(d);
  const categories = d.items.byCategory;
  const categoryTotal = categories.reduce((a, c) => a + c.revenue, 0);
  const listed = categories.slice(0, 6);
  const rest = categories.length - listed.length;

  return (
    /*
     * The reference's two-up: a wide chart beside a narrow one, 2fr against 1fr, collapsing to a
     * single column below `lg`. Both tracks are `minmax(0,1fr)`-based, so a long axis label can
     * never push a track wider than its share — a bare `2fr` sizes to min-content.
     *
     * Both cards FADE (`.anim-enter-soft`); they do not rise.
     */
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4">
      <Card className="anim-enter-soft">
        <CardHeader
          title={byDay ? 'Sales by day' : 'Sales by hour'}
          subtitle={byDay ? 'Paid bills across the selected period' : 'Paid bills by hour of trading'}
        />
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
            <div className="h-64" aria-hidden>
              <ResponsiveContainer>
                {byDay ? (
                  <AreaChart data={d.sales.byDay} margin={{ left: 0, right: 8, top: 8 }}>
                    <defs>
                      <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CHART.primaryFill} stopOpacity={0.24} />
                        <stop offset="100%" stopColor={CHART.primaryFill} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="date" {...axisProps} tickFormatter={(v: string) => v.slice(5)} />
                    <YAxis {...axisProps} tickFormatter={compactMoney} width={52} />
                    <Tooltip {...tooltipProps} formatter={(v: number) => [money(v), 'Sales']} />
                    {/* No entrance animation: the figure must be readable the instant it paints.
                        No legend either — one series, and the card title already names it. */}
                    <Area type="monotone" dataKey="sales" name="Sales" stroke={CHART.primary} fill="url(#salesGradient)" strokeWidth={2} isAnimationActive={false} />
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
              {/* The real total, in the hole of the ring — the one figure the ring is a share of. */}
              <div className="absolute inset-0 grid place-items-center pointer-events-none px-6 text-center">
                <div className="min-w-0">
                  <p className="text-label uppercase text-neutral-500 leading-none">Item revenue</p>
                  <p className="text-subheading text-neutral-900 tnum mt-1 leading-tight break-words">{money(categoryTotal)}</p>
                </div>
              </div>
            </div>
            {/*
             * THE LEGEND IS THE RECORD; the ring is decoration. One row per category: the chip that
             * matches its slice, the category's own name, its share of the real total and the real
             * amount. Every figure here was returned by the report.
             */}
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
    </div>
  );
}

/* ============================================================================================ *
 * SETTLEMENT — payment mix and the adjustments behind the headline figure.
 * Every number here is already in the dashboard payload and was previously thrown away.
 * ============================================================================================ */

export function SettlementPanel({ d }: { d: DashboardSummary }) {
  const taken = d.payments.byMethod.filter((m) => m.count > 0 || m.amount !== 0 || m.reversed !== 0);
  const total = d.payments.total;

  const adjustments: { label: string; value: string; tone?: string }[] = [
    { label: 'Tax collected', value: money(d.sales.taxTotal) },
    { label: 'Service charge', value: money(d.sales.serviceChargeTotal) },
    { label: 'Discounts given', value: money(d.sales.discountTotal) },
    { label: 'Refunded / reversed', value: money(d.payments.refunded), tone: d.payments.refunded > 0 ? 'text-danger-700' : undefined },
  ];

  return (
    /* Below the fold: a single rise-and-fade. The payment rows and the adjustment list inside it
       do not stagger — they are a reconciliation, and a figure arriving late reads as a figure
       that changed. */
    <Card className="anim-reveal">
      <CardHeader title="Settlement" subtitle="How the money in this period was taken, and what was adjusted" />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[repeat(2,minmax(0,1fr))] md:gap-8">
        <div className="min-w-0">
          <p className="text-label uppercase text-neutral-500 mb-3">Payments received · {money(total)}</p>
          {taken.length === 0 ? (
            <EmptyState compact icon={<EmptyReceipt />} title="No payments in this period" />
          ) : (
            <ul className="space-y-3.5">
              {taken.map((m) => (
                <li key={m.method} className="min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm text-neutral-700 truncate">{PAYMENT_METHOD_LABELS[m.method]}</span>
                    <span className="text-sm font-medium text-neutral-900 tnum shrink-0">{money(m.amount)}</span>
                  </div>
                  {/* `static`: this screen refetches on focus and on a realtime invalidate, and a
                      reconciliation bar that slid every time would be motion nobody asked for. */}
                  <ProgressMeter
                    className="mt-1.5"
                    static
                    value={m.amount}
                    max={total > 0 ? total : 1}
                    label={`${PAYMENT_METHOD_LABELS[m.method]} share of payments received`}
                    valueText={`${m.count} payment${m.count === 1 ? '' : 's'}${m.reversed > 0 ? ` · ${money(m.reversed)} reversed` : ''}`}
                    tone="primary"
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="min-w-0">
          <p className="text-label uppercase text-neutral-500 mb-3">Adjustments</p>
          <dl className="text-sm">
            {adjustments.map((a, i) => (
              <div key={a.label} className={cn('flex items-baseline justify-between gap-3 py-2.5', i > 0 && 'border-t border-neutral-200')}>
                <dt className="text-neutral-500 min-w-0">{a.label}</dt>
                <dd className={cn('tnum font-medium shrink-0 text-right', a.tone ?? 'text-neutral-900')}>{a.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </Card>
  );
}

/* ============================================================================================ *
 * RECENT ACTIVITY
 * ============================================================================================ */

/** A short, real summary of what was ordered — the order's own lines, never a count stand-in. */
export function itemSummary(o: Order): string {
  const live = o.items.filter((i) => i.status !== 'CANCELLED');
  if (live.length === 0) return 'No items';
  const head = live.slice(0, 2).map((i) => `${i.quantity}× ${i.itemName}`).join(', ');
  return live.length > 2 ? `${head} +${live.length - 2} more` : head;
}

/**
 * THE RECENT-ORDERS TABLE — the last thing on both dashboards.
 *
 * The reference's columns exactly: order number, time, table, what was ordered, amount and status.
 * `DataTable` brings the sort, the empty state and the card fallback below `md` with it, and the
 * row still opens the order, which is the drill-down this list has always had.
 */
export function RecentOrdersTable({ d, orderLink }: { d: DashboardSummary; orderLink: (id: number) => string }) {
  const navigate = useNavigate();

  const columns = useMemo<Column<Order>[]>(() => [
    { key: 'number', header: 'Order', sortValue: (o) => o.orderNumber, render: (o) => <span className="font-semibold text-neutral-900 whitespace-nowrap">{o.orderNumber}</span> },
    {
      key: 'time',
      header: 'Time',
      sortValue: (o) => o.createdAt,
      render: (o) => (
        <span className="whitespace-nowrap">
          <time dateTime={o.createdAt} className="tnum text-neutral-900">{fmtTime(o.createdAt)}</time>
          <span className="block text-caption text-neutral-500">{fmtRelative(o.createdAt)}</span>
        </span>
      ),
    },
    {
      key: 'table',
      header: 'Table',
      sortValue: (o) => o.tableName,
      render: (o) => (
        <span className="min-w-0 block">
          <span className="block font-medium text-neutral-900 truncate">{o.tableName}</span>
          <span className="block text-caption text-neutral-500 truncate">{o.floorName} · {o.waiterName}</span>
        </span>
      ),
    },
    {
      key: 'items',
      header: 'Items',
      hideBelow: 'lg',
      className: 'max-w-[20rem]',
      render: (o) => <span className="block truncate text-neutral-700">{itemSummary(o)}</span>,
    },
    { key: 'amount', header: 'Amount', align: 'right', sortValue: (o) => o.subtotal, render: (o) => <span className="tnum font-semibold text-neutral-900">{money(o.subtotal)}</span> },
    { key: 'status', header: 'Status', sortValue: (o) => o.status, render: (o) => <StatusBadge kind="order" status={o.status} size="sm" /> },
  ], []);

  return (
    <Card padded={false} className="anim-reveal">
      <CardHeader
        className="p-5 pb-3"
        title="Recent orders"
        subtitle="Newest first — open a row for the full order"
        action={
          <Button size="sm" variant="ghost" rightIcon={<ArrowRight className="h-4 w-4" />} onClick={() => navigate('/admin/orders')}>
            View all orders
          </Button>
        }
      />
      {/* The table sits INSIDE the card, so its own card chrome is switched off — a card drawn
          inside a card reads as a mistake at every width. */}
      <DataTable
        className="border-0 shadow-none rounded-none bg-transparent"
        columns={columns}
        rows={d.recentOrders}
        rowKey={(o) => o.id}
        onRowClick={(o) => navigate(orderLink(o.id))}
        stickyHeader={false}
        caption="The most recent orders, with table, items, amount and status"
        emptyTitle="No orders yet"
        emptyDescription="Orders appear here the moment a waiter sends one."
        mobileCard={(o) => (
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-semibold text-neutral-900 truncate">{o.tableName} · {o.orderNumber}</span>
              <span className="tnum font-semibold shrink-0">{money(o.subtotal)}</span>
            </div>
            <p className="text-caption text-neutral-500 truncate">{fmtTime(o.createdAt)} · {o.waiterName} · {itemSummary(o)}</p>
            <StatusBadge kind="order" status={o.status} size="sm" />
          </div>
        )}
      />
    </Card>
  );
}

/**
 * The two record lists the dashboards keep beside the recent-orders table.
 *
 * The PANELS arrive in sequence; the rows inside them never do — these are lists of records that
 * re-render on every refetch, and a list that trickles in is slower to read than one that is
 * simply there.
 */
export function RecentPanels({ d }: { d: DashboardSummary }) {
  /*
   * The item report carries no photograph, so the menu it was computed from supplies one — the
   * SAME query the menu screens already use, joined by id. Where a venue has photographed an item
   * the real picture appears; where it has not, `ItemImage` draws its station tile instead. No
   * stock photography, and no placeholder pretending to be a dish.
   */
  const menu = useMenuItems();
  const byId = useMemo(() => new Map((menu.data ?? []).map((m) => [m.id, m])), [menu.data]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[repeat(2,minmax(0,1fr))] gap-4">
      <Card padded={false} className="anim-reveal" style={beat(0)}>
        <CardHeader title="Top-selling items" subtitle="By quantity sold" className="p-5 pb-0" />
        {d.items.topItems.length === 0 ? <EmptyState compact icon={<EmptyPlate />} title="No sales yet" /> : (
          <ol className="divide-y divide-neutral-200 mt-2">
            {d.items.topItems.map((it, i) => {
              const mi = byId.get(it.menuItemId);
              return (
                <li key={it.menuItemId} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <span className="text-caption tnum text-neutral-500 w-3 shrink-0 text-right">{i + 1}</span>
                  <ItemImage src={mi?.imageUrl} alt="" prepLocation={mi?.prepLocation} className="h-10 w-10 shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block truncate font-medium text-neutral-900">{it.itemName}</span>
                    <span className="text-caption text-neutral-500 block truncate">{it.categoryName} · {it.quantity} sold</span>
                  </span>
                  <span className="tnum font-medium shrink-0 text-right">{money(it.revenue)}</span>
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      <Card padded={false} className="anim-reveal" style={beat(1)}>
        <CardHeader title="Recent payments" subtitle="Settled at the counter" className="p-5 pb-0" />
        {d.recentPayments.length === 0 ? <EmptyState compact icon={<EmptyReceipt />} title="No payments yet" /> : (
          <ul className="divide-y divide-neutral-200 mt-2">
            {d.recentPayments.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <span className="flex-1 min-w-0">
                  <span className="block font-medium truncate text-neutral-900">{p.billNumber}</span>
                  <span className="text-caption text-neutral-500 truncate block">{p.paymentNumber} · {fmtTime(p.createdAt)}</span>
                </span>
                <span className="shrink-0 flex flex-col items-end gap-1">
                  <span className="tnum font-medium">{money(p.amount)}</span>
                  <Badge size="sm">{PAYMENT_METHOD_LABELS[p.method]}</Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* ============================================================================================ *
 * THE MANAGER WORKSPACE'S OVERVIEW
 *
 * `/admin` is a route a manager reaches too (`dashboard:view` permits both), and the manager board
 * draws it differently from the admin board: an "Overview" head, four comparison tiles, the trend
 * beside the category ring, then the payment mix and the settlement summary as two cards rather
 * than one panel.
 *
 * It is a DIFFERENT COMPOSITION OF THE SAME DATA — every figure below comes from the queries the
 * page already ran (`reportsApi.dashboard` and its second, real previous-period fetch). Nothing
 * here fetches, derives or synthesises anything the admin branch does not already have, and the
 * admin branch itself is untouched: the workspace selects which composition renders, and nothing
 * else. Capability is still `hasPermission`'s job, exactly as before.
 * ============================================================================================ */

/** The payment mix, as labelled horizontal bars: the method, its real share, its real amount. */
function PaymentMethodsCard({ d }: { d: DashboardSummary }) {
  const taken = d.payments.byMethod.filter((m) => m.count > 0 || m.amount !== 0 || m.reversed !== 0);
  const total = d.payments.total;

  return (
    <Card className="anim-reveal" style={beat(0)}>
      <CardHeader title="Payment methods" subtitle={`How the ${money(total)} taken in this period was tendered`} />
      {taken.length === 0 ? (
        <EmptyState compact icon={<EmptyReceipt />} title="No payments in this period" />
      ) : (
        <ul className="space-y-3.5">
          {taken.map((m) => (
            <li key={m.method} className="min-w-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-neutral-700 truncate">{PAYMENT_METHOD_LABELS[m.method]}</span>
                <span className="shrink-0 text-sm tnum">
                  {/* The share is of the real total actually taken — never of a figure nothing
                      measured, so a period with no payments prints an em dash instead of 0%. */}
                  <span className="text-neutral-500">{total > 0 ? `${Math.round((m.amount / total) * 100)}%` : '—'}</span>
                  <span className="ml-2.5 font-medium text-neutral-900">{money(m.amount)}</span>
                </span>
              </div>
              {/* `static`: this screen refetches on focus and on a realtime invalidate, and a
                  reconciliation bar that slid every time would be motion nobody asked for. */}
              <ProgressMeter
                className="mt-1.5"
                static
                hideText
                value={m.amount}
                max={total > 0 ? total : 1}
                label={`${PAYMENT_METHOD_LABELS[m.method]} share of payments received`}
                valueText={`${money(m.amount)} of ${money(total)} · ${m.count} payment${m.count === 1 ? '' : 's'}${m.reversed > 0 ? ` · ${money(m.reversed)} reversed` : ''}`}
                tone="primary"
              />
              <p className="mt-1 text-caption text-neutral-500">
                {m.count} payment{m.count === 1 ? '' : 's'}{m.reversed > 0 ? ` · ${money(m.reversed)} reversed` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/**
 * What the period sold, what was settled and what is still owed — plus the adjustments behind the
 * headline figure, which are in the payload and would otherwise be dropped by this composition.
 */
function SettlementBreakdownCard({ d }: { d: DashboardSummary }) {
  return (
    <Card className="anim-reveal" style={beat(1)}>
      <CardHeader title="Settlement breakdown" subtitle="What the period sold, what came in, and what is still owed" />
      <KeyValue
        items={[
          { label: 'Total sales', value: <span className="tnum font-semibold text-neutral-900">{money(d.sales.totalSales)}</span> },
          { label: 'Paid bills', value: <span className="tnum font-medium text-neutral-900">{d.sales.totalOrders}</span> },
          { label: 'Payments received', value: <span className="tnum font-medium text-neutral-900">{money(d.payments.total)}</span> },
          {
            label: 'Pending settlement',
            value: (
              <span className={cn('tnum font-semibold', d.pendingPayments > 0 ? 'text-warning-700' : 'text-neutral-900')}>
                {money(d.pendingPayments)}
              </span>
            ),
          },
          { label: 'Tax collected', value: <span className="tnum text-neutral-900">{money(d.sales.taxTotal)}</span> },
          { label: 'Service charge', value: <span className="tnum text-neutral-900">{money(d.sales.serviceChargeTotal)}</span> },
          { label: 'Discounts given', value: <span className="tnum text-neutral-900">{money(d.sales.discountTotal)}</span> },
          {
            label: 'Refunded / reversed',
            value: (
              <span className={cn('tnum', d.payments.refunded > 0 ? 'text-danger-700 font-medium' : 'text-neutral-900')}>
                {money(d.payments.refunded)}
              </span>
            ),
          },
        ]}
      />
      <p className="mt-3 text-caption text-neutral-500">
        Pending settlement is finalised bills not yet paid — as of now, not a total for the period.
      </p>
    </Card>
  );
}

function ManagerOverview({ dr, cmp, d, isLoading, isError, error, onRetry }: {
  dr: ReturnType<typeof useDateRange>;
  cmp: ReturnType<typeof useComparison>;
  d?: DashboardSummary;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const navigate = useNavigate();
  const prev = cmp.previous;

  return (
    <div>
      <DashboardHero
        title="Overview"
        subtitle="Your restaurant at a glance"
        range={dr.range}
        /* A DEFINITE max-width below `sm`: the head's action slot is `shrink-0`, so the period
           track would otherwise set a width the page cannot shrink under at 360 px. The control
           already scrolls inside itself, and above `sm` the cap lifts. */
        actions={<div className="min-w-0 max-w-[13rem] sm:max-w-none"><DateRangeFilter state={dr} /></div>}
      />

      {isLoading && <LoadingState variant="page" />}
      {isError && <ErrorState error={error} onRetry={onRetry} />}

      {d && (
        <div className="space-y-5">
          {/*
           * FOUR COMPARISON TILES. Only metrics the report actually scopes to the window carry a
           * delta — sales, bills and the average bill are computed from the {from,to} range, so
           * they can be compared honestly, and each delta appears only once the SECOND fetch has
           * resolved. Pending settlement is a fact about right now; there is no previous-period
           * value of it, so it carries none.
           */}
          <div className="grid grid-cols-1 xs:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard
              label="Total sales"
              value={<CountUp value={d.sales.totalSales} format={(n) => money(n)} />}
              icon={<IndianRupee className="h-5 w-5" />}
              tone="primary"
              size="lg"
              series={salesSeries(d)}
              compare={cmp.compare(d.sales.totalSales, prev?.sales.totalSales)}
              className="anim-reveal"
              style={beat(0)}
            />
            <StatCard
              label="Paid bills"
              value={d.sales.totalOrders}
              icon={<ClipboardList className="h-5 w-5" />}
              tone="neutral"
              series={billsSeries(d)}
              compare={cmp.compare(d.sales.totalOrders, prev?.sales.totalOrders)}
              hint="settled in this period"
              onClick={() => navigate('/admin/orders')}
              className="anim-reveal"
              style={beat(1)}
            />
            <StatCard
              label="Average bill"
              value={money(d.sales.averageOrderValue)}
              icon={<Calculator className="h-5 w-5" />}
              tone="info"
              series={avgBillSeries(d)}
              compare={cmp.compare(d.sales.averageOrderValue, prev?.sales.averageOrderValue)}
              className="anim-reveal"
              style={beat(2)}
            />
            <StatCard
              label="Pending settlement"
              value={money(d.pendingPayments)}
              icon={<Receipt className="h-5 w-5" />}
              tone="warning"
              hint="finalised bills not yet settled — as of now, not a period total"
              onClick={() => navigate('/cashier/bills')}
              className="anim-reveal"
              style={beat(3)}
            />
          </div>

          {/* The same trend and the same category ring the overview has always drawn. */}
          <SalesCharts d={d} />

          <div className="grid grid-cols-1 lg:grid-cols-[repeat(2,minmax(0,1fr))] gap-4">
            <PaymentMethodsCard d={d} />
            <SettlementBreakdownCard d={d} />
          </div>

          <Card className="anim-reveal">
            <CardHeader title="Also today" subtitle="The rest of what this period recorded" />
            <FactGrid
              facts={[
                {
                  label: 'Orders',
                  value: d.orders.total,
                  hint: `${d.orders.completed} completed · ${d.orders.pending} pending`,
                  to: '/admin/orders',
                  compare: cmp.compare(d.orders.total, prev?.orders.total),
                },
                {
                  label: 'Tables occupied',
                  value: `${d.occupiedTables} / ${d.totalTables}`,
                  hint: `${d.availableTables} free`,
                  to: '/admin/tables',
                },
                { label: 'In service now', value: d.orders.active, hint: 'orders still open', to: '/manager/live' },
                {
                  label: 'Cancelled',
                  value: d.orders.cancelled,
                  hint: `${d.orders.cancelledItems} individual items`,
                  tone: d.orders.cancelled > 0 ? 'danger' : 'neutral',
                },
              ]}
            />
          </Card>

          <RecentPanels d={d} />
          <RecentOrdersTable d={d} orderLink={(id) => `/admin/orders/${id}`} />
        </div>
      )}
    </div>
  );
}

/* ============================================================================================ *
 * PAGE
 * ============================================================================================ */

export default function DashboardPage() {
  const dr = useDateRange('today');
  const navigate = useNavigate();
  const { user } = useAuth();
  const q = useQuery({ queryKey: ['dashboard', dr.range], queryFn: () => reportsApi.dashboard(dr.range) });
  const cmp = useComparison(dr);

  /* The greeting is the operator's own name and the clock on this machine — nothing about the
     business is being asserted. Without a signed-in name it is simply the screen's name. */
  const firstName = user?.fullName.split(' ')[0];
  const title = firstName ? `${greetingFor(new Date())}, ${firstName}` : 'Dashboard';

  /*
   * THE WORKSPACE SELECTS A COMPOSITION, NOTHING ELSE.
   *
   * `/admin` is one screen with two designs, because the admin board and the manager board draw
   * it differently and both are signed off. The workspace comes from the signed-in ROLE (see
   * config/workspace.ts), never from the path, and it grants nothing: both branches run the same
   * queries above, and every control inside either branch is still gated on `usePermission`.
   * Everything below this line is the admin's screen exactly as it was.
   */
  const ws = useWorkspace();
  if (ws === 'manager') {
    return (
      <ManagerOverview
        dr={dr}
        cmp={cmp}
        d={q.data}
        isLoading={q.isLoading}
        isError={q.isError}
        error={q.error}
        onRetry={() => void q.refetch()}
      />
    );
  }

  return (
    <div>
      {/*
       * THE PAGE HEAD IS PLAIN. Title, one line, and the period control on the right — the date
       * chip comes from `range`, and `DateRangeFilter` carries the preset segments plus the custom
       * from/to inputs, which behave exactly as they did.
       *
       * The head's action slot is `shrink-0`, so a five-segment period track would otherwise set
       * its width and push the page sideways at 360 px. The cap on the wrapper is a DEFINITE
       * length, which is what constrains that intrinsic width, and `SegmentedControl` already
       * scrolls inside itself (`max-w-full overflow-x-auto no-scrollbar`) — exactly as it did when
       * this control sat in a band of its own. Above `sm` there is room, and no cap.
       */}
      <DashboardHero
        title={title}
        subtitle="Sales, service and table occupancy for the selected period"
        range={dr.range}
        actions={<div className="min-w-0 max-w-[17rem] sm:max-w-none"><DateRangeFilter state={dr} /></div>}
      />

      {q.isLoading && <LoadingState variant="page" />}
      {q.isError && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}

      {q.data && (() => {
        const d = q.data;
        const prev = cmp.previous;
        const occupancy = d.totalTables > 0 ? Math.round((d.occupiedTables / d.totalTables) * 100) : 0;

        /*
         * Everything the second tile row used to say, said once, quietly, below the charts. Each
         * keeps its own hint and its own drill-down; `Paid bills` keeps its real comparison.
         */
        const alsoToday: Fact[] = [
          {
            label: 'Paid bills',
            value: d.sales.totalOrders,
            hint: 'settled in this period',
            compare: cmp.compare(d.sales.totalOrders, prev?.sales.totalOrders),
          },
          {
            label: 'Awaiting payment',
            value: money(d.pendingPayments),
            hint: 'finalised bills not yet settled — as of now, not a period total',
            to: '/cashier/bills',
          },
          { label: 'In service now', value: d.orders.active, hint: 'orders still open', to: '/manager/live' },
          {
            label: 'Cancelled',
            value: d.orders.cancelled,
            hint: `${d.orders.cancelledItems} individual items`,
            tone: d.orders.cancelled > 0 ? 'danger' : 'neutral',
          },
        ];

        return (
          <div className="space-y-5">
            {/*
             * ONE HEADLINE ROW OF FOUR — the four figures a manager opens this screen for. Only
             * metrics the report actually scopes to the window carry a comparison: `sales`,
             * `orders` and the average bill are computed from the {from,to} range, so they can be
             * compared honestly. `occupiedTables` is a fact about right now — there is no
             * "previous period" value of it, so it carries none.
             */}
            <div className="grid grid-cols-1 xs:grid-cols-2 xl:grid-cols-4 gap-4">
              {/*
               * THE ONE COUNT-UP IN THIS PRODUCT'S DASHBOARDS.
               *
               * `CountUp` is allowed on a single headline figure that a person is looking AT, and
               * this is it: the takings for the period, the reason the screen was opened. It is
               * barred from the tables, the lists, the settlement panel and every bill — anything
               * that has to be reconciled — and those all print their figures directly.
               *
               * It cannot re-roll on a poll. `CountUp` rolls once per mounted component and hands
               * every later value straight through, and this instance stays mounted across every
               * refetch: the dashboard query keeps its data for the key it already has, so the
               * subtree is never torn down when the numbers refresh. Asking a different QUESTION —
               * changing the date range — is a different query and a genuinely different figure,
               * and that one is allowed its entrance. Under reduced motion it prints the value.
               */}
              <StatCard
                label="Sales"
                value={<CountUp value={d.sales.totalSales} format={(n) => money(n)} />}
                icon={<IndianRupee className="h-5 w-5" />}
                tone="primary"
                size="lg"
                series={salesSeries(d)}
                compare={cmp.compare(d.sales.totalSales, prev?.sales.totalSales)}
                className="anim-reveal"
                style={beat(0)}
              />
              <StatCard
                label="Orders"
                value={d.orders.total}
                icon={<ClipboardList className="h-5 w-5" />}
                tone="neutral"
                compare={cmp.compare(d.orders.total, prev?.orders.total)}
                hint={`${d.orders.completed} completed · ${d.orders.pending} pending`}
                onClick={() => navigate('/admin/orders')}
                className="anim-reveal"
                style={beat(1)}
              />
              <StatCard
                label="Average bill"
                value={money(d.sales.averageOrderValue)}
                icon={<Calculator className="h-5 w-5" />}
                tone="info"
                series={avgBillSeries(d)}
                compare={cmp.compare(d.sales.averageOrderValue, prev?.sales.averageOrderValue)}
                className="anim-reveal"
                style={beat(2)}
              />
              <StatCard
                label="Tables occupied"
                value={`${d.occupiedTables} / ${d.totalTables}`}
                icon={<LayoutGrid className="h-5 w-5" />}
                tone="primary"
                hint={`${occupancy}% occupancy · ${d.availableTables} free`}
                onClick={() => navigate('/admin/tables')}
                className="anim-reveal"
                style={beat(3)}
              />
            </div>

            <SalesCharts d={d} />

            <Card className="anim-reveal">
              <CardHeader title="Also today" subtitle="The rest of what this period recorded" />
              <FactGrid facts={alsoToday} />
            </Card>

            <SettlementPanel d={d} />
            <RecentPanels d={d} />
            <RecentOrdersTable d={d} orderLink={(id) => `/admin/orders/${id}`} />
          </div>
        );
      })()}
    </div>
  );
}
