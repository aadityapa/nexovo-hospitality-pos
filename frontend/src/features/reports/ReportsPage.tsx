import { useMemo, useState, type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Download, LineChart, Wallet, Receipt, ReceiptText, Clock, CreditCard, RotateCcw, ShoppingBag, CheckCircle2, XCircle, Hourglass, Utensils, Layers } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, PieChart, Pie, Cell } from 'recharts';
import { reportsApi } from '@/services/api/endpoints';
import { useDateRange, DateRangeFilter } from '@/features/shared/DateRangeFilter';
import { DashboardHero } from '@/features/dashboard/DashboardPage';
import { usePermission } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useSurface';
import { Tabs, Card, CardHeader, StatCard, SegmentedControl, LoadingState, ErrorState, EmptyState, DataTable, Button, Badge, StatusDot, type Column } from '@/components/ui';
import { EmptyChart } from '@/components/graphics';
import { staggerDelay } from '@/components/motion';
import { money } from '@/utils/money';
import { cn } from '@/utils/cn';
import { fmtDate } from '@/utils/date';
import { useChartTheme, compactMoney } from '@/config/chartTheme';
import { downloadCsv } from '@/utils/csv';
import { PAYMENT_METHOD_LABELS } from '@/config/statuses';
import type { ItemSalesRow, PaymentMethodTotal, PaymentReport, SalesByDay, SalesByHour, SalesReport } from '@/types';

type Tab = 'sales' | 'payments' | 'orders' | 'items';

/** "01 Apr" — short enough for a category axis without becoming ambiguous. */
const dayTick = (iso: string) => fmtDate(iso).slice(0, 6);
const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`;
const pct = (part: number, whole: number) => (whole > 0 ? (part * 100) / whole : 0);

/* ---------------------------------------------------------------------------------------------
 * SPARKLINE SERIES — the same buckets the charts further down this tab are drawn from, so the
 * line above a headline figure and the chart below it are the one set of measurements.
 *
 * A range covering more than one day is charted day by day; inside a single day the report's own
 * trading hours are the buckets. Nothing is zero-filled: an hour that never took money is absent
 * from `byHour`, and drawing a zero for it would show a collapse that never happened. Where a
 * period is too thin, `Sparkline` refuses to draw at all (fewer than four real points) and the
 * card simply carries no line.
 * ------------------------------------------------------------------------------------------- */
const salesBuckets = (d: SalesReport) => (d.byDay.length > 1 ? d.byDay : d.byHour);
const salesSeries = (d: SalesReport) => salesBuckets(d).map((x) => x.sales);
const billsSeries = (d: SalesReport) => salesBuckets(d).map((x) => x.orders);
/** Average bill per bucket — that bucket's own takings divided by its own bill count. */
const avgBillSeries = (d: SalesReport) => salesBuckets(d).filter((x) => x.orders > 0).map((x) => x.sales / x.orders);

/**
 * The `--d` beat of a staged reveal — a function of a card's position in its row, and of nothing
 * in the report. Each tab's content mounts when that tab is opened, which is a deliberate change
 * of subject and the one time these entrances are meant to play; nothing on this screen polls.
 */
const beat = (i: number) => ({ '--d': `${staggerDelay(i)}ms` }) as CSSProperties;

/**
 * A chart needs at least two observations to be a chart. With exactly one, a bar plot says
 * nothing a sentence cannot say better and reads as a rendering fault — so the single figure is
 * stated instead. Zero observations already have their own empty state.
 */
function SingleObservation({ label, value, meta }: { label: string; value: string; meta?: string }) {
  return (
    <div className="well p-4 sm:p-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <div className="min-w-0">
        <p className="text-label uppercase text-neutral-500">{label}</p>
        {meta && <p className="text-caption text-neutral-500 mt-1">{meta}</p>}
      </div>
      <p className="text-metric tabular-nums text-neutral-900">{value}</p>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------
 * THE MANAGER LEAD.
 *
 * The manager board opens this report with four figures — takings, bills, the average bill, and
 * the payment split as a tile you can press to reach the whole breakdown — and then puts one
 * trend beside one donut. The admin board opens with takings, bills, average bill and tax, then
 * the hour-by-hour chart; that composition is signed off and is left exactly as it was below.
 *
 * NO COMPARISON IS DRAWN, on any of these tiles, because this screen fetches exactly one period.
 * `reports/sales` is called once, for the range in the header, and nothing on this page fetches a
 * second range to measure it against — so a delta here would be a number nobody calculated. The
 * screen that does fetch a second period is Advanced reports, where the comparison is a separate
 * query behind its own key and the tiles carry `compare` only after it resolves.
 * ------------------------------------------------------------------------------------------- */
type TrendBucket = 'hour' | 'day';

interface PaymentsQuery {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
  data?: PaymentReport;
}

function ManagerSalesLead({ data, payments, rangeLabel, emptyForRange, onOpenPayments }: {
  data: SalesReport;
  payments: PaymentsQuery;
  rangeLabel: string;
  emptyForRange: string;
  onOpenPayments: () => void;
}) {
  const { CHART, CHART_SERIES, axisProps, gridProps, tooltipProps } = useChartTheme();
  const COLORS = CHART_SERIES;
  const [bucket, setBucket] = useState<TrendBucket>('hour');
  const slices = (payments.data?.byMethod ?? []).filter((p) => p.amount > 0);
  const paid = payments.data?.total ?? 0;
  const trendRows: { key: string; label: string; value: number; orders: number }[] = bucket === 'hour'
    ? data.byHour.map((h) => ({ key: String(h.hour), label: hourLabel(h.hour), value: h.sales, orders: h.orders }))
    : data.byDay.map((d) => ({ key: d.date, label: dayTick(d.date), value: d.sales, orders: d.orders }));

  return (
    <>
      <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Total sales" value={money(data.totalSales)} tone="primary" size="lg" icon={<Wallet className="h-5 w-5" />} series={salesSeries(data)} hint={`Grand total of bills paid between ${rangeLabel}`} className="anim-reveal" style={beat(0)} />
        <StatCard label="Total bills" value={data.totalOrders} tone="info" icon={<ReceiptText className="h-5 w-5" />} series={billsSeries(data)} hint={data.byDay.length ? `across ${data.byDay.length} day${data.byDay.length === 1 ? '' : 's'}` : 'No paid bills yet'} className="anim-reveal" style={beat(1)} />
        <StatCard label="Average bill value" value={money(data.averageOrderValue)} tone="success" icon={<Receipt className="h-5 w-5" />} series={avgBillSeries(data)} hint="Total sales ÷ bills paid" className="anim-reveal" style={beat(2)} />

        {/*
         * THE PAYMENT SPLIT AS A TILE. Same construction as `StatCard`, with the donut in place
         * of the icon tile, and it presses through to the Payments tab where the same figures are
         * listed in full. The donut is a glyph — it carries no tooltip and no legend of its own,
         * because the tile beside it already names the amount and the tab it opens names the rest.
         */}
        <button
          type="button"
          onClick={onOpenPayments}
          aria-label={`Payment breakdown for ${rangeLabel} — open the full split`}
          className="card material-gloss material-edge p-3.5 sm:p-5 flex items-center gap-3 sm:gap-4 text-left w-full min-w-0 transition-colors duration-control hover:border-neutral-300 press anim-reveal"
          style={beat(3)}
        >
          <span className="shrink-0 h-14 w-14 grid place-items-center" aria-hidden>
            {slices.length > 0 ? (
              <PieChart width={56} height={56}>
                <Pie data={slices} dataKey="amount" nameKey="method" cx={28} cy={28} innerRadius={16} outerRadius={27} stroke="none" isAnimationActive={false}>
                  {slices.map((p, i) => <Cell key={p.method} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
              </PieChart>
            ) : (
              <span className="h-11 w-11 rounded-full ring-1 ring-inset ring-neutral-300 bg-neutral-100 grid place-items-center text-neutral-400">
                <CreditCard className="h-5 w-5" />
              </span>
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3 xs:block">
              <p className="text-label text-neutral-500 uppercase leading-tight break-words min-w-0 xs:order-2 xs:mt-0.5">Payments taken</p>
              <p className="text-neutral-900 font-semibold tabular-nums whitespace-nowrap shrink-0 xs:order-1 text-xl xs:text-[26px] leading-7 xs:leading-8 tracking-[-0.02em]">{money(paid)}</p>
            </div>
            <p className="text-caption font-medium text-primary-700 mt-1.5">
              {slices.length > 0 ? `${slices.length} method${slices.length === 1 ? '' : 's'} · see the split` : 'Nothing collected · see the split'}
            </p>
          </div>
        </button>
      </div>

      <p className="text-caption text-neutral-500">
        One period only — this report fetches the range in the header and nothing to compare it against, so no tile carries a change.
        Advanced reports fetches a second period and shows the difference there.
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-start">
        <Card className="anim-enter-soft min-w-0">
          <CardHeader
            title="Sales trend"
            subtitle={bucket === 'hour'
              ? 'Every hour in the range that settled a bill'
              : 'Grand total of every bill paid on that day'}
            action={
              <SegmentedControl<TrendBucket>
                size="sm"
                ariaLabel="Sales trend period"
                value={bucket}
                onChange={setBucket}
                options={[{ value: 'hour', label: 'By hour', count: data.byHour.length }, { value: 'day', label: 'By day', count: data.byDay.length }]}
              />
            }
          />
          {trendRows.length === 0 ? (
            <EmptyState compact icon={<EmptyChart className="h-16 w-16" />} title="Nothing to chart yet" description={`${emptyForRange} Pick a wider range to see a trend.`} />
          ) : trendRows.length === 1 ? (
            <SingleObservation
              label={bucket === 'hour' ? 'All takings fell in one hour' : 'One day in this range'}
              value={money(trendRows[0].value, { decimals: true })}
              meta={`${trendRows[0].label} · ${trendRows[0].orders} bill${trendRows[0].orders === 1 ? '' : 's'}`}
            />
          ) : (
            <>
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={trendRows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="label" {...axisProps} />
                    <YAxis tickFormatter={compactMoney} width={64} {...axisProps} />
                    <Tooltip {...tooltipProps} formatter={(v: number) => money(v)} />
                    <Legend />
                    <Bar dataKey="value" name="Sales" fill={CHART.primary} radius={[4, 4, 0, 0]} isAnimationActive={false} maxBarSize={56} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-caption text-neutral-500 mt-2">
                Only {bucket === 'hour' ? 'hours' : 'days'} with a settled bill are listed — a {bucket === 'hour' ? 'quiet hour' : 'closed day'} is left out rather than drawn as zero.
              </p>
            </>
          )}
        </Card>

        <Card className="anim-enter-soft min-w-0">
          <CardHeader title="Payments breakdown" subtitle="Share of everything collected in this range" />
          {payments.isLoading ? <LoadingState rows={4} />
            : payments.isError ? <ErrorState compact error={payments.error} onRetry={() => void payments.refetch()} />
              : !payments.data || paid === 0 ? (
                <EmptyState compact icon={<CreditCard className="h-6 w-6" />} title="No payments taken" description={`Nothing was collected between ${rangeLabel}.`} />
              ) : (
                <>
                  {/* The real total sits in the hole of the donut, and is `pointer-events-none`
                      so it never steals the slice tooltips. */}
                  <div className="relative h-56">
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={slices} dataKey="amount" nameKey="method" innerRadius={58} outerRadius={84} isAnimationActive={false}>
                          {slices.map((p, i) => <Cell key={p.method} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip {...tooltipProps} formatter={(v: number, n: string) => [money(v), PAYMENT_METHOD_LABELS[n as PaymentMethodTotal['method']] ?? n]} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-6 text-center">
                      <span className="text-label uppercase text-neutral-500">Collected</span>
                      <span className="text-lg font-semibold tabular-nums text-neutral-900 leading-tight break-words">{money(paid)}</span>
                    </div>
                  </div>
                  {/* Method · share · amount. The slice colours never carry the meaning alone. */}
                  <ul className="mt-3 space-y-1.5">
                    {slices.map((p, i) => (
                      <li key={p.method} className="flex items-center gap-2 text-sm min-w-0">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} aria-hidden />
                        <span className="min-w-0 flex-1 truncate text-neutral-700">{PAYMENT_METHOD_LABELS[p.method]}</span>
                        <span className="tabular-nums text-neutral-500 shrink-0">{pct(p.amount, paid).toFixed(1)}%</span>
                        <span className="tabular-nums font-medium shrink-0 text-neutral-900">{money(p.amount)}</span>
                      </li>
                    ))}
                  </ul>
                  {payments.data.refunded > 0 && (
                    <p className="text-caption text-danger-700 mt-2 inline-flex items-center gap-1.5">
                      <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden />Reversed {money(payments.data.refunded)} — not included in collected
                    </p>
                  )}
                  <Button variant="ghost" size="sm" className="mt-3" onClick={onOpenPayments}>All payments</Button>
                </>
              )}
        </Card>
      </div>
    </>
  );
}

export default function ReportsPage() {
  const navigate = useNavigate();
  const ws = useWorkspace();
  const canAdvanced = usePermission('reports:advanced');
  const dr = useDateRange('today');
  const [tab, setTab] = useState<Tab>('sales');
  /* Grid, axis ticks, tooltip and every series colour resolve for the theme painted right now,
     so the same markup reads correctly on charcoal and on white. */
  const { CHART, CHART_SERIES, axisProps, gridProps, tooltipProps } = useChartTheme();
  const COLORS = CHART_SERIES;
  /*
   * The headline tab carries the reference panel's whole composition — hourly revenue, the
   * payment split and the popular-items ranking — so the payments and items reports are enabled
   * there as well as on their own tabs. Same endpoint, same arguments, same query key, so moving
   * to either tab afterwards is a cache hit rather than a second request.
   */
  const sales = useQuery({ queryKey: ['reports', 'sales', dr.range], queryFn: () => reportsApi.sales(dr.range), enabled: tab === 'sales' });
  const payments = useQuery({ queryKey: ['reports', 'payments', dr.range], queryFn: () => reportsApi.payments(dr.range), enabled: tab === 'payments' || tab === 'sales' });
  const orders = useQuery({ queryKey: ['reports', 'orders', dr.range], queryFn: () => reportsApi.orders(dr.range), enabled: tab === 'orders' });
  const items = useQuery({ queryKey: ['reports', 'items', dr.range], queryFn: () => reportsApi.items(dr.range, 50), enabled: tab === 'items' || tab === 'sales' });

  /** The range in words, so no figure on the page is ambiguous about the period it covers. */
  const rangeLabel = useMemo(() => {
    const from = fmtDate(dr.range.from);
    const to = fmtDate(dr.range.to);
    return from === to ? from : `${from} – ${to}`;
  }, [dr.range]);

  // ---------------------------------------------------------------- export, bound to the open tab
  const exportRows = useMemo<Record<string, unknown>[]>(() => {
    if (tab === 'sales') return (sales.data?.byDay ?? []).map((d) => ({ date: d.date, bills: d.orders, sales: d.sales, averageBill: d.orders ? Number((d.sales / d.orders).toFixed(2)) : 0 }));
    if (tab === 'payments') return (payments.data?.byMethod ?? []).map((p) => ({ method: PAYMENT_METHOD_LABELS[p.method], transactions: p.count, amount: p.amount, reversed: p.reversed }));
    if (tab === 'items') return (items.data?.topItems ?? []).map((i) => ({ item: i.itemName, category: i.categoryName, quantity: i.quantity, revenue: i.revenue }));
    const o = orders.data;
    return o ? [
      { measure: 'Orders created', value: o.total }, { measure: 'Completed', value: o.completed }, { measure: 'Cancelled', value: o.cancelled },
      { measure: 'Awaiting payment', value: o.pending }, { measure: 'Still active', value: o.active }, { measure: 'Items cancelled', value: o.cancelledItems },
    ] : [];
  }, [tab, sales.data, payments.data, orders.data, items.data]);

  const exportMeta: Record<Tab, { file: string; what: string }> = {
    sales: { file: 'daily-sales', what: 'sales by day' },
    payments: { file: 'payments-by-method', what: 'payments by method' },
    orders: { file: 'order-summary', what: 'the order summary' },
    items: { file: 'item-sales', what: 'item sales' },
  };
  const ex = exportMeta[tab];

  // ---------------------------------------------------------------- columns
  const dayCols: Column<SalesByDay>[] = [
    { key: 'date', header: 'Date', sortValue: (r) => r.date, render: (r) => <span className="font-medium text-neutral-900">{fmtDate(r.date)}</span> },
    { key: 'orders', header: 'Bills', align: 'right', sortValue: (r) => r.orders, render: (r) => <span className="tabular-nums">{r.orders}</span> },
    { key: 'sales', header: 'Sales', align: 'right', sortValue: (r) => r.sales, render: (r) => <span className="tabular-nums font-medium">{money(r.sales)}</span> },
    { key: 'avg', header: 'Avg bill', align: 'right', sortValue: (r) => (r.orders ? r.sales / r.orders : 0), render: (r) => <span className="tabular-nums text-neutral-600">{money(r.orders ? r.sales / r.orders : 0)}</span> },
  ];
  const hourCols: Column<SalesByHour>[] = [
    { key: 'hour', header: 'Hour', sortValue: (r) => r.hour, render: (r) => <span className="font-medium text-neutral-900 tabular-nums">{hourLabel(r.hour)}</span> },
    { key: 'orders', header: 'Bills', align: 'right', sortValue: (r) => r.orders, render: (r) => <span className="tabular-nums">{r.orders}</span> },
    { key: 'sales', header: 'Sales', align: 'right', sortValue: (r) => r.sales, render: (r) => <span className="tabular-nums font-medium">{money(r.sales)}</span> },
  ];
  const payCols: Column<PaymentMethodTotal>[] = [
    { key: 'm', header: 'Method', sortValue: (r) => r.method, render: (r) => <span className="font-medium text-neutral-900">{PAYMENT_METHOD_LABELS[r.method]}</span> },
    { key: 'c', header: 'Transactions', align: 'right', sortValue: (r) => r.count, render: (r) => <span className="tabular-nums">{r.count}</span> },
    { key: 'a', header: 'Amount', align: 'right', sortValue: (r) => r.amount, render: (r) => <span className="tabular-nums font-medium">{money(r.amount)}</span> },
    {
      key: 'share', header: 'Share of collected', align: 'right', hideBelow: 'md', sortValue: (r) => r.amount,
      render: (r) => <span className="tabular-nums text-neutral-600">{payments.data && payments.data.total > 0 ? `${pct(r.amount, payments.data.total).toFixed(1)}%` : '—'}</span>,
    },
    { key: 'r', header: 'Reversed', align: 'right', sortValue: (r) => r.reversed, render: (r) => (r.reversed ? <span className="tabular-nums text-danger-700 font-medium">{money(r.reversed)}</span> : <span className="text-neutral-400">None</span>) },
  ];
  const itemCols: Column<ItemSalesRow>[] = [
    { key: 'n', header: 'Item', sortValue: (r) => r.itemName, render: (r) => <span className="block min-w-0"><span className="block font-medium text-neutral-900 truncate">{r.itemName}</span><span className="block text-caption text-neutral-500 truncate">{r.categoryName}</span></span> },
    { key: 'q', header: 'Qty sold', align: 'right', sortValue: (r) => r.quantity, render: (r) => <span className="tabular-nums font-medium">{r.quantity}</span> },
    { key: 'rev', header: 'Revenue', align: 'right', sortValue: (r) => r.revenue, render: (r) => <span className="tabular-nums font-medium">{money(r.revenue)}</span> },
  ];

  const busiestHour = useMemo(() => {
    const rows = sales.data?.byHour ?? [];
    return rows.length ? rows.reduce((best, r) => (r.sales > best.sales ? r : best), rows[0]) : null;
  }, [sales.data]);

  const itemTotals = useMemo(() => {
    const cats = items.data?.byCategory ?? [];
    return { revenue: cats.reduce((a, c) => a + c.revenue, 0), quantity: cats.reduce((a, c) => a + c.quantity, 0), categories: cats.length };
  }, [items.data]);

  const emptyForRange = `No paid bills between ${rangeLabel}.`;

  return (
    <div>
      {/* The same band as the two main dashboards: venue and branch identity, the page, and the
          period every figure below is measured over — carried by the range selector itself. */}
      <DashboardHero
        title="Reports"
        subtitle="Headline figures first, then the breakdown behind them"
        range={dr.range}
        actions={<>
          {canAdvanced && <Button variant="ghost" leftIcon={<LineChart className="h-4 w-4" />} onClick={() => navigate('/admin/reports/advanced')}>Advanced reports</Button>}
          {/* Export is the page's own action, so it carries primary weight — and it always names the tab it will write. */}
          <Button
            leftIcon={<Download className="h-4 w-4" />}
            disabled={exportRows.length === 0}
            aria-label={`Export ${ex.what} for ${rangeLabel} as CSV`}
            onClick={() => downloadCsv(ex.file, exportRows)}
          >
            Export<span className="hidden sm:inline">&nbsp;{ex.what}</span>
          </Button>
        </>}
      >
        <DateRangeFilter state={dr} />
      </DashboardHero>

      <Tabs
        className="mb-3"
        ariaLabel="Report"
        value={tab}
        onChange={setTab}
        options={[{ value: 'sales', label: 'Sales' }, { value: 'payments', label: 'Payments' }, { value: 'orders', label: 'Orders' }, { value: 'items', label: 'Item sales' }]}
      />
      {/* One line that removes every ambiguity about period and about what "Export" will write. */}
      <p className="text-caption text-neutral-500 mb-4" aria-live="polite">
        <strong className="text-neutral-700 font-semibold">{rangeLabel}</strong>
        {' · '}
        {exportRows.length > 0
          ? `Export writes ${exportRows.length} row${exportRows.length === 1 ? '' : 's'} of ${ex.what} for exactly this range.`
          : `Nothing to export on this tab yet — ${ex.what} is empty for this range.`}
      </p>

      {/* ---------------------------------------------------------------- Sales */}
      {tab === 'sales' && (sales.isLoading ? <LoadingState variant="page" /> : sales.isError ? <ErrorState error={sales.error} onRetry={() => void sales.refetch()} /> : sales.data && (
        <div className="space-y-4">
          {/*
           * The first three carry a line because the report measured them bucket by bucket. Tax
           * does not: it arrives as one total for the range, with no per-day or per-hour figure
           * behind it, so that card has no sparkline rather than a shape derived from something
           * else.
           */}
          {/*
           * REVENUE TILES. The reference panel splits revenue into food and beverage. This report
           * does not measure that split — `reports/sales` returns one grand total, a bill count,
           * an average, tax, discounts and service charge, and nothing per prep location. The
           * food/beverage split exists only on Advanced reports → Profitability, which is a
           * different query, so it is not restated here from a figure that was never divided.
           */}
          {ws === 'manager' ? (
            <ManagerSalesLead
              data={sales.data}
              payments={payments}
              rangeLabel={rangeLabel}
              emptyForRange={emptyForRange}
              onOpenPayments={() => setTab('payments')}
            />
          ) : (
          <>
          <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/*
             * No `CountUp` anywhere on this screen, including here. A reports headline is a figure
             * an accountant reconciles against a bank statement, and the rule this product is
             * built on reserves the roll for the ONE dashboard figure a person is looking at.
             */}
            <StatCard label="Total revenue" value={money(sales.data.totalSales)} tone="primary" size="lg" icon={<Wallet className="h-5 w-5" />} series={salesSeries(sales.data)} hint="Grand total of bills paid in this range" className="anim-reveal" style={beat(0)} />
            <StatCard label="Bills paid" value={sales.data.totalOrders} tone="info" icon={<ReceiptText className="h-5 w-5" />} series={billsSeries(sales.data)} hint={sales.data.byDay.length ? `across ${sales.data.byDay.length} day${sales.data.byDay.length === 1 ? '' : 's'}` : 'No paid bills yet'} className="anim-reveal" style={beat(1)} />
            <StatCard label="Average bill" value={money(sales.data.averageOrderValue)} tone="success" icon={<Receipt className="h-5 w-5" />} series={avgBillSeries(sales.data)} hint="Total sales ÷ bills paid" className="anim-reveal" style={beat(2)} />
            <StatCard label="Tax collected" value={money(sales.data.taxTotal)} tone="neutral" hint={`Discounts ${money(sales.data.discountTotal)} · service charge ${money(sales.data.serviceChargeTotal)}`} className="anim-reveal" style={beat(3)} />
          </div>

          {/* ------------------------------------------------- hourly revenue · payment split */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-start">
            <Card className="anim-enter-soft">
              {/* The peak-hour chip is `info`: violet means VIP in this product, never "noteworthy". */}
              <CardHeader
                title="Hourly revenue"
                subtitle={busiestHour
                  ? `Busiest hour: ${hourLabel(busiestHour.hour)} — ${money(busiestHour.sales)} across ${busiestHour.orders} bill${busiestHour.orders === 1 ? '' : 's'}`
                  : 'Every hour in the range that settled a bill'}
                action={busiestHour ? <Badge tone="info" size="sm" icon={<Clock className="h-3 w-3" />}>Peak {hourLabel(busiestHour.hour)}</Badge> : undefined}
              />
              {sales.data.byHour.length === 0 ? (
                <EmptyState compact icon={<Clock className="h-6 w-6" />} title="No hourly pattern yet" description={`${emptyForRange} Hours appear here once bills are settled.`} />
              ) : sales.data.byHour.length === 1 ? (
                <SingleObservation
                  label="All takings fell in one hour"
                  value={money(sales.data.byHour[0].sales, { decimals: true })}
                  meta={`${hourLabel(sales.data.byHour[0].hour)} · ${sales.data.byHour[0].orders} bill${sales.data.byHour[0].orders === 1 ? '' : 's'}`}
                />
              ) : (
                <>
                  <div className="h-64">
                    <ResponsiveContainer>
                      <BarChart data={sales.data.byHour} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                        <CartesianGrid {...gridProps} />
                        <XAxis dataKey="hour" tickFormatter={(h: number) => hourLabel(h)} {...axisProps} />
                        <YAxis tickFormatter={compactMoney} width={64} {...axisProps} />
                        <Tooltip {...tooltipProps} labelFormatter={(h: number) => hourLabel(Number(h))} formatter={(v: number) => money(v)} />
                        <Legend />
                        {/* Gold, resolved by `useChartTheme()` — `primary-500` on charcoal and the
                            `primary-700` rung on white, so the bars carry data on either ground. */}
                        <Bar dataKey="sales" name="Revenue" fill={CHART.primary} radius={[4, 4, 0, 0]} isAnimationActive={false} maxBarSize={56} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-caption text-neutral-500 mt-2">Only hours with a settled bill are listed — hours that never took money are left out rather than drawn as zero.</p>
                </>
              )}
            </Card>

            <Card className="anim-enter-soft min-w-0">
              <CardHeader title="Payment breakdown" subtitle="Share of everything collected in this range" />
              {payments.isLoading ? <LoadingState rows={4} />
                : payments.isError ? <ErrorState compact error={payments.error} onRetry={() => void payments.refetch()} />
                  : !payments.data || payments.data.total === 0 ? (
                    <EmptyState compact icon={<CreditCard className="h-6 w-6" />} title="No payments taken" description={`Nothing was collected between ${rangeLabel}.`} />
                  ) : (
                    <>
                      {/* The total sits in the hole of the donut, where the reference puts it. It
                          is `pointer-events-none` so it never steals the slice tooltips. */}
                      <div className="relative h-56">
                        <ResponsiveContainer>
                          <PieChart>
                            <Pie data={payments.data.byMethod.filter((p) => p.amount > 0)} dataKey="amount" nameKey="method" innerRadius={58} outerRadius={84} isAnimationActive={false}>
                              {payments.data.byMethod.filter((p) => p.amount > 0).map((p, i) => <Cell key={p.method} fill={COLORS[i % COLORS.length]} />)}
                            </Pie>
                            <Tooltip {...tooltipProps} formatter={(v: number, n: string) => [money(v), PAYMENT_METHOD_LABELS[n as PaymentMethodTotal['method']] ?? n]} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-6 text-center">
                          <span className="text-label uppercase text-neutral-500">Collected</span>
                          <span className="text-lg font-semibold tabular-nums text-neutral-900 leading-tight break-words">{money(payments.data.total)}</span>
                        </div>
                      </div>
                      {/* Text legend: the slice colours never carry the meaning on their own. */}
                      <ul className="mt-3 space-y-1.5">
                        {payments.data.byMethod.filter((p) => p.amount > 0).map((p, i) => (
                          <li key={p.method} className="flex items-center gap-2 text-sm min-w-0">
                            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} aria-hidden />
                            <span className="min-w-0 flex-1 truncate text-neutral-700">{PAYMENT_METHOD_LABELS[p.method]}</span>
                            <span className="tabular-nums text-neutral-500 shrink-0">{pct(p.amount, payments.data!.total).toFixed(1)}%</span>
                            <span className="tabular-nums font-medium shrink-0 text-neutral-900">{money(p.amount)}</span>
                          </li>
                        ))}
                      </ul>
                      {payments.data.refunded > 0 && (
                        <p className="text-caption text-danger-700 mt-2 inline-flex items-center gap-1.5">
                          <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden />Reversed {money(payments.data.refunded)} — not included in collected
                        </p>
                      )}
                    </>
                  )}
            </Card>
          </div>
          </>
          )}

          {/* ------------------------------------------------------------------ popular items */}
          <Card className="anim-reveal">
            <CardHeader
              title="Popular items"
              subtitle={items.data?.topItems.length ? 'Ranked by quantity sold in this range' : undefined}
              action={items.data?.topItems.length ? <Button size="sm" variant="ghost" onClick={() => setTab('items')}>All item sales</Button> : undefined}
            />
            {items.isLoading ? <LoadingState rows={4} />
              : items.isError ? <ErrorState compact error={items.error} onRetry={() => void items.refetch()} />
                : !items.data || items.data.topItems.length === 0 ? (
                  <EmptyState compact icon={<Utensils className="h-6 w-6" />} title="No item sales" description={emptyForRange} />
                ) : (
                  <ol className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
                    {items.data.topItems.slice(0, 10).map((it, i) => (
                      <li key={it.menuItemId} className="flex items-center gap-3 py-2.5 border-b border-neutral-200 min-w-0">
                        <span className="h-6 w-6 shrink-0 rounded-sm bg-neutral-100 text-neutral-700 text-[11px] font-semibold tabular-nums inline-flex items-center justify-center" aria-hidden>{i + 1}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-neutral-900 truncate">{it.itemName}</span>
                          <span className="block text-caption text-neutral-500 truncate">{it.categoryName}</span>
                        </span>
                        <span className="text-sm tabular-nums font-semibold text-neutral-900 shrink-0">
                          {it.quantity}<span className="text-caption font-normal text-neutral-500"> sold</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
          </Card>

          {/* Charts FADE. A bar that slides into place is a bar whose height cannot be read while
              it moves, and an axis that travels implies a value that travelled with it. */}
          {/* The manager lead above already carries this series behind its own period control,
              so the second copy is not drawn there. */}
          {ws !== 'manager' && (
          <Card className="anim-enter-soft">
            <CardHeader
              title="Sales by day"
              subtitle={sales.data.byDay.length ? 'Grand total of every bill paid on that day' : undefined}
            />
            {sales.data.byDay.length === 0 ? (
              <EmptyState compact icon={<EmptyChart className="h-16 w-16" />} title="Nothing to chart yet" description={`${emptyForRange} Pick a wider range to see a trend.`} />
            ) : sales.data.byDay.length === 1 ? (
              <SingleObservation
                label="One day in this range"
                value={money(sales.data.byDay[0].sales, { decimals: true })}
                meta={`${fmtDate(sales.data.byDay[0].date)} — widen the range to compare days`}
              />
            ) : (
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={sales.data.byDay} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="date" tickFormatter={dayTick} {...axisProps} />
                    <YAxis tickFormatter={compactMoney} width={64} {...axisProps} />
                    <Tooltip {...tooltipProps} labelFormatter={(d: string) => fmtDate(d)} formatter={(v: number) => money(v)} />
                    <Legend />
                    <Bar dataKey="sales" name="Sales" fill={CHART.primary} radius={[4, 4, 0, 0]} isAnimationActive={false} maxBarSize={56} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
          )}

          {/* The table CONTAINERS rise; their rows never stagger. Fifty rows trickling in is
              slower to read than fifty rows that are simply there. */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <DataTable
              className="anim-reveal"
              columns={dayCols}
              rows={sales.data.byDay}
              rowKey={(r) => r.date}
              initialSort={{ key: 'date', dir: 'asc' }}
              caption="Sales per day with bill count and average bill"
              toolbar={<p className="text-sm text-neutral-600 px-1">Day by day</p>}
              emptyTitle="No paid bills"
              emptyDescription={emptyForRange}
            />
            <DataTable
              className="anim-reveal"
              columns={hourCols}
              rows={sales.data.byHour}
              rowKey={(r) => r.hour}
              initialSort={{ key: 'sales', dir: 'desc' }}
              caption="Sales per hour of day with bill count"
              toolbar={<p className="text-sm text-neutral-600 px-1">Hour by hour, busiest first</p>}
              emptyTitle="No hourly data"
              emptyDescription={emptyForRange}
            />
          </div>
        </div>
      ))}

      {/* ---------------------------------------------------------------- Payments */}
      {tab === 'payments' && (payments.isLoading ? <LoadingState variant="page" /> : payments.isError ? <ErrorState error={payments.error} onRetry={() => void payments.refetch()} /> : payments.data && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatCard label="Collected" value={money(payments.data.total)} tone="primary" size="lg" icon={<Wallet className="h-5 w-5" />} hint="Successful payments taken in this range" className="anim-reveal" style={beat(0)} />
            <StatCard label="Transactions" value={payments.data.byMethod.reduce((a, p) => a + p.count, 0)} tone="info" icon={<CreditCard className="h-5 w-5" />} hint="Individual successful tenders" className="anim-reveal" style={beat(1)} />
            {/* Money handed back or refused. This is the screen's genuinely negative summary, so
                it takes `fill-danger` — but only when there actually were reversals; a red wash
                over a clean zero would be an accusation. */}
            <StatCard
              label="Reversed"
              value={money(payments.data.refunded)}
              tone={payments.data.refunded > 0 ? 'danger' : 'neutral'}
              icon={<RotateCcw className="h-5 w-5" />}
              hint={payments.data.refunded > 0 ? 'Refunded or failed tenders — not included in collected' : 'Nothing reversed in this range'}
              className={cn('anim-reveal', payments.data.refunded > 0 && 'fill-danger')}
              style={beat(2)}
            />
            <StatCard
              label="Methods used"
              value={payments.data.byMethod.filter((p) => p.amount > 0).length}
              tone="neutral"
              hint={payments.data.byMethod.filter((p) => p.amount > 0).map((p) => PAYMENT_METHOD_LABELS[p.method]).join(', ') || 'None yet'}
              className="anim-reveal"
              style={beat(3)}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
            <Card className="anim-enter-soft">
              <CardHeader title="Split by method" subtitle="Share of everything collected in this range" />
              {payments.data.total === 0 ? (
                <EmptyState compact icon={<CreditCard className="h-6 w-6" />} title="No payments taken" description={`Nothing was collected between ${rangeLabel}.`} />
              ) : (
                <>
                  <div className="h-56">
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={payments.data.byMethod.filter((p) => p.amount > 0)} dataKey="amount" nameKey="method" innerRadius={45} outerRadius={80} isAnimationActive={false}>
                          {payments.data.byMethod.filter((p) => p.amount > 0).map((p, i) => <Cell key={p.method} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip {...tooltipProps} formatter={(v: number, n: string) => [money(v), PAYMENT_METHOD_LABELS[n as PaymentMethodTotal['method']] ?? n]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  {/* Text legend: the slice colours never carry the meaning on their own. */}
                  <ul className="mt-3 space-y-1.5">
                    {payments.data.byMethod.filter((p) => p.amount > 0).map((p, i) => (
                      <li key={p.method} className="flex items-center gap-2 text-sm min-w-0">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} aria-hidden />
                        <span className="min-w-0 flex-1 truncate text-neutral-700">{PAYMENT_METHOD_LABELS[p.method]}</span>
                        <span className="tabular-nums text-neutral-500">{pct(p.amount, payments.data!.total).toFixed(1)}%</span>
                        <span className="tabular-nums font-medium">{money(p.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Card>

            <DataTable
              className="anim-reveal"
              columns={payCols}
              rows={payments.data.byMethod}
              rowKey={(r) => r.method}
              initialSort={{ key: 'a', dir: 'desc' }}
              caption="Payments by method with transaction count, amount, share and reversals"
              toolbar={
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-sm">
                  <span className="text-neutral-600">Collected <strong className="text-neutral-900 tabular-nums">{money(payments.data.total)}</strong></span>
                  {payments.data.refunded > 0 && (
                    <span className="inline-flex items-center gap-1.5 text-danger-700">
                      <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      reversed <strong className="tabular-nums">{money(payments.data.refunded)}</strong>
                    </span>
                  )}
                </div>
              }
              emptyTitle="No payments"
              emptyDescription={`Nothing was collected between ${rangeLabel}.`}
              mobileCard={(p) => (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-neutral-900 min-w-0 truncate">{PAYMENT_METHOD_LABELS[p.method]}</span>
                    <span className="tabular-nums font-semibold">{money(p.amount)}</span>
                  </div>
                  <p className="text-caption text-neutral-500">
                    {p.count} transaction{p.count === 1 ? '' : 's'}
                    {payments.data && payments.data.total > 0 ? ` · ${pct(p.amount, payments.data.total).toFixed(1)}% of collected` : ''}
                  </p>
                  {p.reversed > 0 && <p className="text-caption text-danger-700">Reversed {money(p.reversed)}</p>}
                </div>
              )}
            />
          </div>
        </div>
      ))}

      {/* ---------------------------------------------------------------- Orders */}
      {tab === 'orders' && (orders.isLoading ? <LoadingState variant="stats" /> : orders.isError ? <ErrorState error={orders.error} onRetry={() => void orders.refetch()} /> : orders.data && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatCard label="Orders created" value={orders.data.total} tone="primary" size="lg" icon={<ShoppingBag className="h-5 w-5" />} hint={`Opened between ${rangeLabel}`} className="anim-reveal" style={beat(0)} />
            <StatCard label="Completed" value={orders.data.completed} tone="success" icon={<CheckCircle2 className="h-5 w-5" />} hint={orders.data.total ? `${pct(orders.data.completed, orders.data.total).toFixed(0)}% of orders created in this range` : 'No orders in this range'} className="anim-reveal" style={beat(1)} />
            <StatCard label="Cancelled" value={orders.data.cancelled} tone={orders.data.cancelled > 0 ? 'danger' : 'neutral'} icon={<XCircle className="h-5 w-5" />} hint={`${orders.data.cancelledItems} individual item${orders.data.cancelledItems === 1 ? '' : 's'} cancelled`} className={cn('anim-reveal', orders.data.cancelled > 0 && 'fill-danger')} style={beat(2)} />
            <StatCard label="Awaiting payment" value={orders.data.pending} tone={orders.data.pending > 0 ? 'warning' : 'neutral'} icon={<Hourglass className="h-5 w-5" />} hint="Bill requested, billed or paid but not closed" className="anim-reveal" style={beat(3)} />
          </div>

          <Card className="anim-reveal">
            <CardHeader title="Where these orders stand" subtitle="Each line is counted against the orders created in this range; an order can be in more than one of these states over its life." />
            <ul className="divide-y divide-neutral-200">
              {[
                { label: 'Completed', value: orders.data.completed, tone: 'success' as const, note: 'Closed and fully settled' },
                { label: 'Cancelled', value: orders.data.cancelled, tone: 'danger' as const, note: 'Voided before completion' },
                { label: 'Awaiting payment', value: orders.data.pending, tone: 'warning' as const, note: 'Bill requested, billed or paid' },
                { label: 'Still active on the floor', value: orders.data.active, tone: 'info' as const, note: 'Draft through served' },
              ].map((r) => (
                <li key={r.label} className="flex items-center gap-3 py-2.5 min-w-0">
                  <StatusDot tone={r.tone} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-neutral-900 truncate">{r.label}</span>
                    <span className="block text-caption text-neutral-500 truncate">{r.note}</span>
                  </span>
                  <span className="text-sm tabular-nums font-semibold text-neutral-900 shrink-0">{r.value}</span>
                  <span className="text-caption tabular-nums text-neutral-500 w-14 text-right shrink-0">
                    {orders.data!.total ? `${pct(r.value, orders.data!.total).toFixed(0)}%` : '—'}
                  </span>
                </li>
              ))}
            </ul>
            {orders.data.total === 0 && (
              <EmptyState compact icon={<EmptyChart />} title="No orders in this range" description={`Nothing was opened between ${rangeLabel}. Try a wider range.`} />
            )}
          </Card>
        </div>
      ))}

      {/* ---------------------------------------------------------------- Item sales */}
      {tab === 'items' && (items.isLoading ? <LoadingState variant="page" /> : items.isError ? <ErrorState error={items.error} onRetry={() => void items.refetch()} /> : items.data && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatCard label="Item revenue" value={money(itemTotals.revenue)} tone="primary" size="lg" icon={<Utensils className="h-5 w-5" />} hint="Line totals after item discounts, before tax and service charge" className="anim-reveal" style={beat(0)} />
            <StatCard label="Items sold" value={itemTotals.quantity} tone="info" icon={<ShoppingBag className="h-5 w-5" />} hint="Units across every category" className="anim-reveal" style={beat(1)} />
            <StatCard label="Categories selling" value={itemTotals.categories} tone="neutral" icon={<Layers className="h-5 w-5" />} hint={items.data.byCategory[0] ? `Top: ${items.data.byCategory[0].categoryName}` : 'Nothing sold yet'} className="anim-reveal" style={beat(2)} />
            <StatCard label="Items listed below" value={items.data.topItems.length} tone="neutral" hint="Top 50 by quantity sold" className="anim-reveal" style={beat(3)} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <DataTable
              className="anim-reveal"
              columns={itemCols}
              rows={items.data.topItems}
              rowKey={(r) => r.menuItemId}
              initialSort={{ key: 'q', dir: 'desc' }}
              pageSize={25}
              dense
              caption="Top selling items with quantity and revenue"
              toolbar={<p className="text-sm text-neutral-600 px-1">Top {items.data.topItems.length} item{items.data.topItems.length === 1 ? '' : 's'} by quantity sold</p>}
              emptyTitle="No item sales"
              emptyDescription={emptyForRange}
              mobileCard={(r) => (
                <div className="space-y-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block font-medium text-neutral-900 truncate">{r.itemName}</span>
                      <span className="block text-caption text-neutral-500 truncate">{r.categoryName}</span>
                    </span>
                    <span className="tabular-nums font-semibold shrink-0">{money(r.revenue)}</span>
                  </div>
                  <p className="text-caption text-neutral-500">{r.quantity} sold</p>
                </div>
              )}
            />

            <Card padded={false} className="anim-reveal">
              <CardHeader className="p-5 pb-0" title="By category" subtitle="Every category, highest revenue first" />
              {items.data.byCategory.length === 0 ? (
                <EmptyState compact icon={<Layers className="h-6 w-6" />} title="No category sales" description={emptyForRange} />
              ) : (
                <ul className="divide-y divide-neutral-200 mt-2">
                  {items.data.byCategory.map((c) => (
                    <li key={c.categoryName} className="px-5 py-2.5 min-w-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate text-sm font-medium text-neutral-900">{c.categoryName}</span>
                        <span className="tabular-nums font-medium shrink-0">{money(c.revenue)}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {/* `neutral-200` is the hairline rung: the unfilled remainder of the track
                            has to stay visible against the card, which `neutral-100` does not. */}
                        <span className="h-1.5 flex-1 rounded-full bg-neutral-200 overflow-hidden">
                          <span className="block h-full bg-primary-500" style={{ width: `${Math.min(100, pct(c.revenue, itemTotals.revenue))}%` }} aria-hidden />
                        </span>
                        <span className="text-caption text-neutral-500 tabular-nums shrink-0">{c.quantity} sold · {pct(c.revenue, itemTotals.revenue).toFixed(0)}%</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      ))}
    </div>
  );
}
