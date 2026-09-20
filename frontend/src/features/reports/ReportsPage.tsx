import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import { reportsApi } from '@/services/api/endpoints';
import { useDateRange, DateRangeFilter } from '@/features/shared/DateRangeFilter';
import { PageHeader, Tabs, Card, CardHeader, StatCard, LoadingState, ErrorState, EmptyState, DataTable, Button, type Column } from '@/components/ui';
import { money } from '@/utils/money';
import { CHART, CHART_SERIES, axisProps, gridProps, tooltipProps } from '@/config/chartTheme';
import { downloadCsv } from '@/utils/csv';
import { PAYMENT_METHOD_LABELS } from '@/config/statuses';
import type { ItemSalesRow, PaymentMethodTotal, SalesByDay } from '@/types';

type Tab = 'sales' | 'payments' | 'orders' | 'items';
const COLORS = CHART_SERIES;

export default function ReportsPage() {
  const dr = useDateRange('today');
  const [tab, setTab] = useState<Tab>('sales');
  const sales = useQuery({ queryKey: ['reports', 'sales', dr.range], queryFn: () => reportsApi.sales(dr.range), enabled: tab === 'sales' });
  const payments = useQuery({ queryKey: ['reports', 'payments', dr.range], queryFn: () => reportsApi.payments(dr.range), enabled: tab === 'payments' });
  const orders = useQuery({ queryKey: ['reports', 'orders', dr.range], queryFn: () => reportsApi.orders(dr.range), enabled: tab === 'orders' });
  const items = useQuery({ queryKey: ['reports', 'items', dr.range], queryFn: () => reportsApi.items(dr.range, 50), enabled: tab === 'items' });

  const dayCols: Column<SalesByDay>[] = [{ key: 'date', header: 'Date', sortValue: (r) => r.date, render: (r) => r.date }, { key: 'orders', header: 'Bills', align: 'right', sortValue: (r) => r.orders, render: (r) => r.orders }, { key: 'sales', header: 'Sales', align: 'right', sortValue: (r) => r.sales, render: (r) => <span className="tabular-nums">{money(r.sales)}</span> }, { key: 'avg', header: 'Avg bill', align: 'right', render: (r) => <span className="tabular-nums">{money(r.orders ? r.sales / r.orders : 0)}</span> }];
  const payCols: Column<PaymentMethodTotal>[] = [{ key: 'm', header: 'Method', render: (r) => PAYMENT_METHOD_LABELS[r.method] }, { key: 'c', header: 'Transactions', align: 'right', sortValue: (r) => r.count, render: (r) => r.count }, { key: 'a', header: 'Amount', align: 'right', sortValue: (r) => r.amount, render: (r) => <span className="tabular-nums font-medium">{money(r.amount)}</span> }, { key: 'r', header: 'Reversed', align: 'right', render: (r) => <span className="tabular-nums text-danger-700">{r.reversed ? money(r.reversed) : '—'}</span> }];
  const itemCols: Column<ItemSalesRow>[] = [{ key: 'n', header: 'Item', sortValue: (r) => r.itemName, render: (r) => <span className="font-medium">{r.itemName}<span className="block text-caption font-normal text-neutral-500">{r.categoryName}</span></span> }, { key: 'q', header: 'Qty sold', align: 'right', sortValue: (r) => r.quantity, render: (r) => r.quantity }, { key: 'rev', header: 'Revenue', align: 'right', sortValue: (r) => r.revenue, render: (r) => <span className="tabular-nums font-medium">{money(r.revenue)}</span> }];

  return (
    <div>
      <PageHeader title="Reports" subtitle="Sales, payments, orders and item performance"><DateRangeFilter state={dr} /></PageHeader>
      <Tabs className="mb-5" value={tab} onChange={setTab} options={[{ value: 'sales', label: 'Daily sales' }, { value: 'payments', label: 'Payments' }, { value: 'orders', label: 'Orders' }, { value: 'items', label: 'Item sales' }]} />

      {tab === 'sales' && (sales.isLoading ? <LoadingState variant="stats" /> : sales.isError ? <ErrorState error={sales.error} onRetry={() => void sales.refetch()} /> : sales.data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total sales" value={money(sales.data.totalSales)} tone="primary" />
            <StatCard label="Total bills" value={sales.data.totalOrders} tone="info" />
            <StatCard label="Average order value" value={money(sales.data.averageOrderValue)} tone="success" />
            <StatCard label="Tax collected" value={money(sales.data.taxTotal)} tone="neutral" hint={`Discounts ${money(sales.data.discountTotal)} · Service ${money(sales.data.serviceChargeTotal)}`} />
          </div>
          <Card>
            <CardHeader title="Sales by day" action={<Button size="sm" variant="outline" leftIcon={<Download className="h-4 w-4" />} onClick={() => downloadCsv('daily-sales', sales.data!.byDay)}>CSV</Button>} />
            {sales.data.byDay.length === 0 ? <EmptyState compact title="No paid bills in this period" /> : <div className="h-64"><ResponsiveContainer><BarChart data={sales.data.byDay}><CartesianGrid {...gridProps} /><XAxis dataKey="date" {...axisProps} /><YAxis {...axisProps} width={60} /><Tooltip {...tooltipProps} formatter={(v: number) => money(v)} /><Bar dataKey="sales" fill={CHART.primary} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>}
          </Card>
          <DataTable columns={dayCols} rows={sales.data.byDay} rowKey={(r) => r.date} emptyTitle="No data" />
        </div>
      ))}

      {tab === 'payments' && (payments.isLoading ? <LoadingState variant="stats" /> : payments.isError ? <ErrorState error={payments.error} onRetry={() => void payments.refetch()} /> : payments.data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{payments.data.byMethod.map((p) => <StatCard key={p.method} label={PAYMENT_METHOD_LABELS[p.method]} value={money(p.amount)} hint={`${p.count} txns`} tone="neutral" />)}</div>
          <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
            <Card><CardHeader title="Split by method" />{payments.data.total === 0 ? <EmptyState compact title="No payments" /> : <div className="h-56"><ResponsiveContainer><PieChart><Pie data={payments.data.byMethod.filter((p) => p.amount > 0)} dataKey="amount" nameKey="method" innerRadius={45} outerRadius={80}>{payments.data.byMethod.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip {...tooltipProps} formatter={(v: number) => money(v)} /></PieChart></ResponsiveContainer></div>}</Card>
            <DataTable columns={payCols} rows={payments.data.byMethod} rowKey={(r) => r.method} toolbar={<div className="flex justify-between items-center text-sm"><span>Total collected <strong>{money(payments.data.total)}</strong>{payments.data.refunded > 0 && <span className="text-danger-700"> · reversed {money(payments.data.refunded)}</span>}</span><Button size="sm" variant="outline" leftIcon={<Download className="h-4 w-4" />} onClick={() => downloadCsv('payments', payments.data!.byMethod)}>CSV</Button></div>} />
          </div>
        </div>
      ))}

      {tab === 'orders' && (orders.isLoading ? <LoadingState variant="stats" /> : orders.isError ? <ErrorState error={orders.error} onRetry={() => void orders.refetch()} /> : orders.data && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard label="Total orders" value={orders.data.total} tone="primary" />
          <StatCard label="Completed" value={orders.data.completed} tone="success" />
          <StatCard label="Cancelled" value={orders.data.cancelled} tone="danger" hint={`${orders.data.cancelledItems} items cancelled`} />
          <StatCard label="Pending payment" value={orders.data.pending} tone="warning" />
          <StatCard label="Active now" value={orders.data.active} tone="info" />
        </div>
      ))}

      {tab === 'items' && (items.isLoading ? <LoadingState variant="table" rows={8} /> : items.isError ? <ErrorState error={items.error} onRetry={() => void items.refetch()} /> : items.data && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <DataTable columns={itemCols} rows={items.data.topItems} rowKey={(r) => r.menuItemId} initialSort={{ key: 'q', dir: 'desc' }} emptyTitle="No item sales in this period" toolbar={<div className="flex justify-end"><Button size="sm" variant="outline" leftIcon={<Download className="h-4 w-4" />} onClick={() => downloadCsv('item-sales', items.data!.topItems)}>CSV</Button></div>} />
          <Card padded={false}><CardHeader className="p-5 pb-0" title="By category" /><ul className="divide-y divide-neutral-100 mt-2">{items.data.byCategory.map((c) => <li key={c.categoryName} className="px-5 py-2.5 flex justify-between text-sm"><span>{c.categoryName}<span className="text-caption text-neutral-500"> · {c.quantity} sold</span></span><span className="tabular-nums font-medium">{money(c.revenue)}</span></li>)}{items.data.byCategory.length === 0 && <li className="px-5 py-4 text-sm text-neutral-500">No data</li>}</ul></Card>
        </div>
      ))}
    </div>
  );
}
