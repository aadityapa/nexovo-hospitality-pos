import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { IndianRupee, ClipboardList, Activity, XCircle, Clock, LayoutGrid, ArrowRight } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { reportsApi } from '@/services/api/endpoints';
import { useDateRange, DateRangeFilter } from '@/features/shared/DateRangeFilter';
import { PageHeader, StatCard, Card, CardHeader, LoadingState, ErrorState, EmptyState, StatusBadge, Badge, Button } from '@/components/ui';
import { money } from '@/utils/money';
import { fmtTime, fmtRelative } from '@/utils/date';
import { PAYMENT_METHOD_LABELS } from '@/config/statuses';
import { CHART, CHART_SERIES, axisProps, gridProps, tooltipProps, compactMoney } from '@/config/chartTheme';
import type { DashboardSummary } from '@/types';

export function SalesCharts({ d }: { d: DashboardSummary }) {
  const hourly = Array.from({ length: 24 }, (_, h) => ({
    hour: `${String(h).padStart(2, '0')}`,
    sales: d.sales.byHour.find((x) => x.hour === h)?.sales ?? 0,
  }));
  const multiDay = d.sales.byDay.length > 1;
  const categories = d.items.byCategory;
  const categoryTotal = categories.reduce((a, c) => a + c.revenue, 0);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader
          title={multiDay ? 'Sales by day' : 'Sales by hour'}
          subtitle={multiDay ? 'Paid bills across the selected period' : 'Paid bills by hour of day'}
        />
        {d.sales.totalOrders === 0 ? (
          <EmptyState compact title="No paid bills in this period" description="Sales appear here once a bill is settled." />
        ) : (
          <div className="h-64" aria-hidden>
            <ResponsiveContainer>
              {multiDay ? (
                <AreaChart data={d.sales.byDay} margin={{ left: 0, right: 8, top: 8 }}>
                  <defs>
                    <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART.primary} stopOpacity={0.24} />
                      <stop offset="100%" stopColor={CHART.primary} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="date" {...axisProps} tickFormatter={(v: string) => v.slice(5)} />
                  <YAxis {...axisProps} tickFormatter={compactMoney} width={52} />
                  <Tooltip {...tooltipProps} formatter={(v: number) => [money(v), 'Sales']} />
                  <Area type="monotone" dataKey="sales" stroke={CHART.primary} fill="url(#salesGradient)" strokeWidth={2} />
                </AreaChart>
              ) : (
                <BarChart data={hourly} margin={{ left: 0, right: 8, top: 8 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="hour" {...axisProps} interval={2} />
                  <YAxis {...axisProps} tickFormatter={compactMoney} width={52} />
                  <Tooltip {...tooltipProps} formatter={(v: number) => [money(v), 'Sales']} labelFormatter={(h) => `${h}:00`} />
                  <Bar dataKey="sales" fill={CHART.primary} radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Revenue by category" subtitle="Share of item revenue" />
        {categories.length === 0 ? (
          <EmptyState compact title="No item sales yet" />
        ) : (
          <div className="flex items-center gap-2">
            <div className="h-44 w-36 shrink-0" aria-hidden>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={categories} dataKey="revenue" nameKey="categoryName" innerRadius={42} outerRadius={68} paddingAngle={2} strokeWidth={0}>
                    {categories.map((_, i) => <Cell key={i} fill={CHART_SERIES[i % CHART_SERIES.length]} />)}
                  </Pie>
                  <Tooltip {...tooltipProps} formatter={(v: number) => money(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            {/* The list is the accessible source of truth; the ring is decoration. */}
            <ul className="flex-1 min-w-0 space-y-2 text-sm">
              {categories.slice(0, 6).map((c, i) => (
                <li key={c.categoryName} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: CHART_SERIES[i % CHART_SERIES.length] }} aria-hidden />
                  <span className="truncate flex-1 text-neutral-700">{c.categoryName}</span>
                  <span className="tabular-nums text-neutral-900 font-medium">
                    {categoryTotal > 0 ? `${Math.round((c.revenue / categoryTotal) * 100)}%` : '—'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}

export function RecentPanels({ d, orderLink }: { d: DashboardSummary; orderLink: (id: number) => string }) {
  const navigate = useNavigate();
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card padded={false}>
        <CardHeader title="Top-selling items" className="p-5 pb-0" />
        {d.items.topItems.length === 0 ? <EmptyState compact title="No sales yet" /> : (
          <ol className="divide-y divide-neutral-100 mt-2">
            {d.items.topItems.map((it, i) => (
              <li key={it.menuItemId} className="flex items-center gap-3 px-5 py-3 text-sm">
                <span className="h-6 w-6 rounded-full bg-neutral-100 text-neutral-600 text-[11px] flex items-center justify-center font-semibold shrink-0 tabular-nums">{i + 1}</span>
                <span className="flex-1 min-w-0">
                  <span className="block truncate font-medium text-neutral-900">{it.itemName}</span>
                  <span className="text-caption text-neutral-500">{it.categoryName} · {it.quantity} sold</span>
                </span>
                <span className="tabular-nums font-medium">{money(it.revenue)}</span>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card padded={false}>
        <CardHeader
          title="Recent orders"
          className="p-5 pb-0"
          action={<Button size="sm" variant="ghost" rightIcon={<ArrowRight className="h-4 w-4" />} onClick={() => navigate('/admin/orders')}>All</Button>}
        />
        {d.recentOrders.length === 0 ? <EmptyState compact title="No orders yet" /> : (
          <ul className="divide-y divide-neutral-100 mt-2">
            {d.recentOrders.map((o) => (
              <li key={o.id}>
                <button type="button" onClick={() => navigate(orderLink(o.id))} className="w-full flex items-center gap-3 px-5 py-3 text-sm text-left hover:bg-neutral-50 transition-colors">
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium truncate text-neutral-900">{o.tableName} · {o.orderNumber}</span>
                    <span className="text-caption text-neutral-500 truncate block">{o.waiterName} · {fmtRelative(o.createdAt)}</span>
                  </span>
                  <span className="tabular-nums shrink-0">{money(o.subtotal)}</span>
                  <StatusBadge kind="order" status={o.status} size="sm" hideIcon />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card padded={false}>
        <CardHeader title="Recent payments" className="p-5 pb-0" />
        {d.recentPayments.length === 0 ? <EmptyState compact title="No payments yet" /> : (
          <ul className="divide-y divide-neutral-100 mt-2">
            {d.recentPayments.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <span className="flex-1 min-w-0">
                  <span className="block font-medium truncate text-neutral-900">{p.billNumber}</span>
                  <span className="text-caption text-neutral-500">{p.paymentNumber} · {fmtTime(p.createdAt)}</span>
                </span>
                <Badge size="sm">{PAYMENT_METHOD_LABELS[p.method]}</Badge>
                <span className="tabular-nums font-medium shrink-0">{money(p.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export default function DashboardPage() {
  const dr = useDateRange('today');
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['dashboard', dr.range], queryFn: () => reportsApi.dashboard(dr.range) });

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Sales, service and table occupancy for the selected period">
        <DateRangeFilter state={dr} />
      </PageHeader>

      {q.isLoading && <LoadingState variant="page" />}
      {q.isError && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}

      {q.data && (() => {
        const d = q.data;
        const occupancy = d.totalTables > 0 ? Math.round((d.occupiedTables / d.totalTables) * 100) : 0;
        return (
          <div className="space-y-5">
            {/* Headline row — the four numbers a manager checks first. */}
            <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="Sales"
                value={money(d.sales.totalSales)}
                icon={<IndianRupee className="h-5 w-5" />}
                tone="primary"
                size="lg"
                hint={`${d.sales.totalOrders} paid · avg ${money(d.sales.averageOrderValue)}`}
              />
              <StatCard
                label="Orders"
                value={d.orders.total}
                icon={<ClipboardList className="h-5 w-5" />}
                tone="info"
                hint={`${d.orders.completed} completed · ${d.orders.pending} pending`}
                onClick={() => navigate('/admin/orders')}
              />
              <StatCard
                label="In service now"
                value={d.orders.active}
                icon={<Activity className="h-5 w-5" />}
                tone="warning"
                hint="orders still open"
                onClick={() => navigate('/manager/live')}
              />
              <StatCard
                label="Awaiting payment"
                value={money(d.pendingPayments)}
                icon={<Clock className="h-5 w-5" />}
                tone="danger"
                hint="finalised bills not yet settled"
                onClick={() => navigate('/cashier/bills')}
              />
            </div>

            {/* Secondary row — occupancy and exceptions. */}
            <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="Tables occupied"
                value={`${d.occupiedTables} / ${d.totalTables}`}
                icon={<LayoutGrid className="h-5 w-5" />}
                tone="primary"
                hint={`${occupancy}% occupancy · ${d.availableTables} free`}
                onClick={() => navigate('/admin/tables')}
              />
              <StatCard label="Tax collected" value={money(d.sales.taxTotal)} tone="neutral" hint={`Service charge ${money(d.sales.serviceChargeTotal)}`} />
              <StatCard label="Discounts given" value={money(d.sales.discountTotal)} tone="neutral" />
              <StatCard
                label="Cancelled"
                value={d.orders.cancelled}
                icon={<XCircle className="h-5 w-5" />}
                tone="danger"
                hint={`${d.orders.cancelledItems} individual items`}
              />
            </div>

            <SalesCharts d={d} />
            <RecentPanels d={d} orderLink={(id) => `/admin/orders/${id}`} />
          </div>
        );
      })()}
    </div>
  );
}
