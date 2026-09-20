import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Download, LineChart, Wallet, Receipt, ReceiptText, Clock, CreditCard, RotateCcw, ShoppingBag, CheckCircle2, XCircle, Hourglass, Activity, Utensils, Layers } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, PieChart, Pie, Cell } from 'recharts';
import { reportsApi } from '@/services/api/endpoints';
import { useDateRange, DateRangeFilter } from '@/features/shared/DateRangeFilter';
import { usePermission } from '@/hooks/useAuth';
import { PageHeader, Tabs, Card, CardHeader, StatCard, LoadingState, ErrorState, EmptyState, DataTable, Button, Badge, StatusDot, type Column } from '@/components/ui';
import { money } from '@/utils/money';
import { fmtDate } from '@/utils/date';
import { CHART, CHART_SERIES, axisProps, gridProps, tooltipProps, compactMoney } from '@/config/chartTheme';
import { downloadCsv } from '@/utils/csv';
import { PAYMENT_METHOD_LABELS } from '@/config/statuses';
import type { ItemSalesRow, PaymentMethodTotal, SalesByDay, SalesByHour } from '@/types';

type Tab = 'sales' | 'payments' | 'orders' | 'items';
const COLORS = CHART_SERIES;

/** "01 Apr" — short enough for a category axis without becoming ambiguous. */
const dayTick = (iso: string) => fmtDate(iso).slice(0, 6);
const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`;
const pct = (part: number, whole: number) => (whole > 0 ? (part * 100) / whole : 0);

export default function ReportsPage() {
  const navigate = useNavigate();
  const canAdvanced = usePermission('reports:advanced');
  const dr = useDateRange('today');
  const [tab, setTab] = useState<Tab>('sales');
  const sales = useQuery({ queryKey: ['reports', 'sales', dr.range], queryFn: () => reportsApi.sales(dr.range), enabled: tab === 'sales' });
  const payments = useQuery({ queryKey: ['reports', 'payments', dr.range], queryFn: () => reportsApi.payments(dr.range), enabled: tab === 'payments' });
  const orders = useQuery({ queryKey: ['reports', 'orders', dr.range], queryFn: () => reportsApi.orders(dr.range), enabled: tab === 'orders' });
  const items = useQuery({ queryKey: ['reports', 'items', dr.range], queryFn: () => reportsApi.items(dr.range, 50), enabled: tab === 'items' });

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
      <PageHeader
        title="Reports"
        subtitle="Headline figures first, then the breakdown behind them"
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
      </PageHeader>

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
          <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatCard label="Total sales" value={money(sales.data.totalSales)} tone="primary" size="lg" icon={<Wallet className="h-5 w-5" />} hint="Grand total of bills paid in this range" />
            <StatCard label="Bills paid" value={sales.data.totalOrders} tone="info" icon={<ReceiptText className="h-5 w-5" />} hint={sales.data.byDay.length ? `across ${sales.data.byDay.length} day${sales.data.byDay.length === 1 ? '' : 's'}` : 'No paid bills yet'} />
            <StatCard label="Average bill" value={money(sales.data.averageOrderValue)} tone="success" icon={<Receipt className="h-5 w-5" />} hint="Total sales ÷ bills paid" />
            <StatCard label="Tax collected" value={money(sales.data.taxTotal)} tone="neutral" hint={`Discounts ${money(sales.data.discountTotal)} · service charge ${money(sales.data.serviceChargeTotal)}`} />
          </div>

          <Card>
            <CardHeader
              title="Sales by day"
              subtitle={sales.data.byDay.length ? 'Grand total of every bill paid on that day' : undefined}
            />
            {sales.data.byDay.length === 0 ? (
              <EmptyState compact icon={<Receipt className="h-6 w-6" />} title="Nothing to chart yet" description={`${emptyForRange} Pick a wider range to see a trend.`} />
            ) : (
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={sales.data.byDay} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="date" tickFormatter={dayTick} {...axisProps} />
                    <YAxis tickFormatter={compactMoney} width={64} {...axisProps} />
                    <Tooltip {...tooltipProps} labelFormatter={(d: string) => fmtDate(d)} formatter={(v: number) => money(v)} />
                    <Legend />
                    <Bar dataKey="sales" name="Sales" fill={CHART.primary} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Sales by hour of day"
              subtitle={busiestHour
                ? `Busiest hour: ${hourLabel(busiestHour.hour)} — ${money(busiestHour.sales)} across ${busiestHour.orders} bill${busiestHour.orders === 1 ? '' : 's'}`
                : undefined}
              action={busiestHour ? <Badge tone="accent" size="sm" icon={<Clock className="h-3 w-3" />}>Peak {hourLabel(busiestHour.hour)}</Badge> : undefined}
            />
            {sales.data.byHour.length === 0 ? (
              <EmptyState compact icon={<Clock className="h-6 w-6" />} title="No hourly pattern yet" description={`${emptyForRange} Hours appear here once bills are settled.`} />
            ) : (
              <>
                <div className="h-56">
                  <ResponsiveContainer>
                    <BarChart data={sales.data.byHour} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid {...gridProps} />
                      <XAxis dataKey="hour" tickFormatter={(h: number) => hourLabel(h)} {...axisProps} />
                      <YAxis tickFormatter={compactMoney} width={64} {...axisProps} />
                      <Tooltip {...tooltipProps} labelFormatter={(h: number) => hourLabel(Number(h))} formatter={(v: number) => money(v)} />
                      <Legend />
                      <Bar dataKey="sales" name="Sales" fill={CHART.accent} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-caption text-neutral-500 mt-2">Only hours with a settled bill are listed — hours that never took money are left out rather than drawn as zero.</p>
              </>
            )}
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <DataTable
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
            <StatCard label="Collected" value={money(payments.data.total)} tone="primary" size="lg" icon={<Wallet className="h-5 w-5" />} hint="Successful payments taken in this range" />
            <StatCard label="Transactions" value={payments.data.byMethod.reduce((a, p) => a + p.count, 0)} tone="info" icon={<CreditCard className="h-5 w-5" />} hint="Individual successful tenders" />
            <StatCard
              label="Reversed"
              value={money(payments.data.refunded)}
              tone={payments.data.refunded > 0 ? 'danger' : 'neutral'}
              icon={<RotateCcw className="h-5 w-5" />}
              hint={payments.data.refunded > 0 ? 'Refunded or failed tenders — not included in collected' : 'Nothing reversed in this range'}
            />
            <StatCard
              label="Methods used"
              value={payments.data.byMethod.filter((p) => p.amount > 0).length}
              tone="neutral"
              hint={payments.data.byMethod.filter((p) => p.amount > 0).map((p) => PAYMENT_METHOD_LABELS[p.method]).join(', ') || 'None yet'}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
            <Card>
              <CardHeader title="Split by method" subtitle="Share of everything collected in this range" />
              {payments.data.total === 0 ? (
                <EmptyState compact icon={<CreditCard className="h-6 w-6" />} title="No payments taken" description={`Nothing was collected between ${rangeLabel}.`} />
              ) : (
                <>
                  <div className="h-56">
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={payments.data.byMethod.filter((p) => p.amount > 0)} dataKey="amount" nameKey="method" innerRadius={45} outerRadius={80}>
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
            <StatCard label="Orders created" value={orders.data.total} tone="primary" size="lg" icon={<ShoppingBag className="h-5 w-5" />} hint={`Opened between ${rangeLabel}`} />
            <StatCard label="Completed" value={orders.data.completed} tone="success" icon={<CheckCircle2 className="h-5 w-5" />} hint={orders.data.total ? `${pct(orders.data.completed, orders.data.total).toFixed(0)}% of orders created in this range` : 'No orders in this range'} />
            <StatCard label="Cancelled" value={orders.data.cancelled} tone={orders.data.cancelled > 0 ? 'danger' : 'neutral'} icon={<XCircle className="h-5 w-5" />} hint={`${orders.data.cancelledItems} individual item${orders.data.cancelledItems === 1 ? '' : 's'} cancelled`} />
            <StatCard label="Awaiting payment" value={orders.data.pending} tone={orders.data.pending > 0 ? 'warning' : 'neutral'} icon={<Hourglass className="h-5 w-5" />} hint="Bill requested, billed or paid but not closed" />
          </div>

          <Card>
            <CardHeader title="Where these orders stand" subtitle="Each line is counted against the orders created in this range; an order can be in more than one of these states over its life." />
            <ul className="divide-y divide-neutral-100">
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
              <EmptyState compact icon={<Activity className="h-6 w-6" />} title="No orders in this range" description={`Nothing was opened between ${rangeLabel}. Try a wider range.`} />
            )}
          </Card>
        </div>
      ))}

      {/* ---------------------------------------------------------------- Item sales */}
      {tab === 'items' && (items.isLoading ? <LoadingState variant="page" /> : items.isError ? <ErrorState error={items.error} onRetry={() => void items.refetch()} /> : items.data && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatCard label="Item revenue" value={money(itemTotals.revenue)} tone="primary" size="lg" icon={<Utensils className="h-5 w-5" />} hint="Line totals after item discounts, before tax and service charge" />
            <StatCard label="Items sold" value={itemTotals.quantity} tone="info" icon={<ShoppingBag className="h-5 w-5" />} hint="Units across every category" />
            <StatCard label="Categories selling" value={itemTotals.categories} tone="neutral" icon={<Layers className="h-5 w-5" />} hint={items.data.byCategory[0] ? `Top: ${items.data.byCategory[0].categoryName}` : 'Nothing sold yet'} />
            <StatCard label="Items listed below" value={items.data.topItems.length} tone="neutral" hint="Top 50 by quantity sold" />
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <DataTable
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

            <Card padded={false}>
              <CardHeader className="p-5 pb-0" title="By category" subtitle="Every category, highest revenue first" />
              {items.data.byCategory.length === 0 ? (
                <EmptyState compact icon={<Layers className="h-6 w-6" />} title="No category sales" description={emptyForRange} />
              ) : (
                <ul className="divide-y divide-neutral-100 mt-2">
                  {items.data.byCategory.map((c) => (
                    <li key={c.categoryName} className="px-5 py-2.5 min-w-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate text-sm font-medium text-neutral-900">{c.categoryName}</span>
                        <span className="tabular-nums font-medium shrink-0">{money(c.revenue)}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="h-1.5 flex-1 rounded-full bg-neutral-100 overflow-hidden">
                          <span className="block h-full bg-primary-600" style={{ width: `${Math.min(100, pct(c.revenue, itemTotals.revenue))}%` }} aria-hidden />
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
