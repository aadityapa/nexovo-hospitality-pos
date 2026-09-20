import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Download, ArrowLeft } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, Legend, PieChart, Pie, Cell } from 'recharts';
import { reports2Api } from '@/services/api/endpoints';
import { useDateRange, DateRangeFilter } from '@/features/shared/DateRangeFilter';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader, Tabs, Card, CardHeader, StatCard, LoadingState, ErrorState, EmptyState, DataTable, Button, SegmentedControl, StatusBadge, Badge, type Column } from '@/components/ui';
import { money } from '@/utils/money';
import { CHART, CHART_SERIES, axisProps, gridProps, tooltipProps } from '@/config/chartTheme';
import { downloadCsv } from '@/utils/csv';
import { MOVEMENT_LABELS } from '@/config/statuses';
import type { BranchComparisonRow, CategoryPerformanceRow, ConsumptionRow, StaffPerformanceRow, WastageReport, InventoryValuation, MovementType } from '@/types';

type Tab = 'sales' | 'branches' | 'categories' | 'profit' | 'valuation' | 'wastage' | 'consumption' | 'staff';
type GroupBy = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';
const COLORS = CHART_SERIES;

const Panel = <T,>({ q, children }: { q: { isLoading: boolean; isError: boolean; error: unknown; refetch: () => unknown; data?: T }; children: (d: T) => JSX.Element }) =>
  q.isLoading ? <LoadingState variant="stats" /> : q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : q.data ? children(q.data) : null;

export default function AdvancedReportsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const dr = useDateRange('month');
  const [tab, setTab] = useState<Tab>('sales');
  const [groupBy, setGroupBy] = useState<GroupBy>('DAY');
  const multiBranch = (user?.branchIds?.length ?? 0) > 1 || !!user?.roles.includes('SUPER_ADMIN');
  const sales = useQuery({ queryKey: ['reports', 'v2', 'sales', dr.range, groupBy], queryFn: () => reports2Api.sales(dr.range, groupBy), enabled: tab === 'sales' });
  const branches = useQuery({ queryKey: ['reports', 'v2', 'branches', dr.range], queryFn: () => reports2Api.branches(dr.range), enabled: tab === 'branches' });
  const categories = useQuery({ queryKey: ['reports', 'v2', 'categories', dr.range], queryFn: () => reports2Api.categories(dr.range), enabled: tab === 'categories' });
  const profit = useQuery({ queryKey: ['reports', 'v2', 'profit', dr.range], queryFn: () => reports2Api.profitability(dr.range), enabled: tab === 'profit' });
  const valuation = useQuery({ queryKey: ['reports', 'v2', 'valuation'], queryFn: reports2Api.inventoryValuation, enabled: tab === 'valuation' });
  const wastage = useQuery({ queryKey: ['reports', 'v2', 'wastage', dr.range], queryFn: () => reports2Api.wastage(dr.range), enabled: tab === 'wastage' });
  const consumption = useQuery({ queryKey: ['reports', 'v2', 'consumption', dr.range], queryFn: () => reports2Api.consumption(dr.range), enabled: tab === 'consumption' });
  const staff = useQuery({ queryKey: ['reports', 'v2', 'staff', dr.range], queryFn: () => reports2Api.staff(dr.range), enabled: tab === 'staff' });

  const csvBtn = <T extends object>(name: string, rows: T[]) => <Button size="sm" variant="outline" disabled={!rows.length} leftIcon={<Download className="h-4 w-4" />} onClick={() => downloadCsv(name, rows)}>CSV</Button>;
  const branchCols: Column<BranchComparisonRow>[] = [
    { key: 'b', header: 'Branch', sortValue: (r) => r.name, render: (r) => <span className="font-medium">{r.name}<span className="block text-caption font-normal text-neutral-500">{r.code}{r.city ? ` · ${r.city}` : ''}</span></span> },
    { key: 'bills', header: 'Bills', align: 'right', sortValue: (r) => r.bills, render: (r) => r.bills },
    { key: 'sales', header: 'Sales', align: 'right', sortValue: (r) => r.sales, render: (r) => <span className="tabular-nums font-medium">{money(r.sales)}</span> },
    { key: 'avg', header: 'Avg bill', align: 'right', hideBelow: 'md', render: (r) => <span className="tabular-nums">{money(r.averageBill)}</span> },
    { key: 'cogs', header: 'COGS', align: 'right', hideBelow: 'md', render: (r) => <span className="tabular-nums">{money(r.cogs)}</span> },
    { key: 'gp', header: 'Gross profit', align: 'right', sortValue: (r) => r.grossProfit, render: (r) => <span className="tabular-nums text-success-700 font-medium">{money(r.grossProfit)}</span> },
    { key: 'canc', header: 'Cancelled', align: 'right', hideBelow: 'lg', render: (r) => r.cancelledOrders },
  ];
  const catCols: Column<CategoryPerformanceRow>[] = [
    { key: 'c', header: 'Category', sortValue: (r) => r.categoryName, render: (r) => <span className="font-medium">{r.categoryName} <Badge size="sm">{r.prepLocation}</Badge></span> },
    { key: 'q', header: 'Qty', align: 'right', sortValue: (r) => r.quantity, render: (r) => r.quantity },
    { key: 'rev', header: 'Revenue', align: 'right', sortValue: (r) => r.revenue, render: (r) => <span className="tabular-nums font-medium">{money(r.revenue)}</span> },
    { key: 'share', header: 'Share', align: 'right', render: (r) => `${r.sharePercent.toFixed(1)}%` },
    { key: 'bills', header: 'Bills', align: 'right', hideBelow: 'md', render: (r) => r.bills },
  ];
  const wasteCols: Column<WastageReport['rows'][number]>[] = [
    { key: 'i', header: 'Item', sortValue: (r) => r.itemName, render: (r) => r.itemName },
    { key: 't', header: 'Type', render: (r) => <Badge size="sm" tone={r.type === 'WASTAGE' ? 'danger' : 'warning'}>{MOVEMENT_LABELS[r.type as MovementType] ?? r.type}</Badge> },
    { key: 'q', header: 'Qty', align: 'right', sortValue: (r) => r.qty, render: (r) => `${r.qty} ${r.unitCode}` },
    { key: 'c', header: 'Cost', align: 'right', sortValue: (r) => r.cost, render: (r) => <span className="tabular-nums text-danger-700 font-medium">{money(r.cost)}</span> },
    { key: 'n', header: 'Entries', align: 'right', hideBelow: 'md', render: (r) => r.entries },
  ];
  const consCols: Column<ConsumptionRow>[] = [
    { key: 'i', header: 'Ingredient', sortValue: (r) => r.itemName, render: (r) => <span className="font-medium">{r.itemName}<span className="block text-caption font-normal text-neutral-500">{r.categoryName}</span></span> },
    { key: 'q', header: 'Consumed', align: 'right', sortValue: (r) => r.qty, render: (r) => `${r.qty} ${r.unitCode}` },
    { key: 'c', header: 'Cost', align: 'right', sortValue: (r) => r.cost, render: (r) => <span className="tabular-nums font-medium">{money(r.cost)}</span> },
  ];
  const staffCols: Column<StaffPerformanceRow>[] = [
    { key: 'n', header: 'Staff', sortValue: (r) => r.fullName, render: (r) => <span className="font-medium">{r.fullName}</span> },
    { key: 'o', header: 'Orders', align: 'right', sortValue: (r) => r.ordersHandled, render: (r) => r.ordersHandled },
    { key: 't', header: 'Tables', align: 'right', hideBelow: 'md', render: (r) => r.tablesServed },
    { key: 's', header: 'Sales', align: 'right', sortValue: (r) => r.sales, render: (r) => <span className="tabular-nums font-medium">{money(r.sales)}</span> },
    { key: 'a', header: 'Avg bill', align: 'right', hideBelow: 'md', render: (r) => <span className="tabular-nums">{money(r.averageBill)}</span> },
    { key: 'c', header: 'Cancelled', align: 'right', hideBelow: 'lg', render: (r) => <span className={r.cancelledOrders + r.cancelledItems > 0 ? 'text-danger-700' : ''}>{r.cancelledOrders} orders · {r.cancelledItems} items</span> },
  ];
  const valCols: Column<InventoryValuation['topItems'][number]>[] = [
    { key: 'i', header: 'Item', sortValue: (r) => r.itemName, render: (r) => r.itemName },
    { key: 'q', header: 'Qty', align: 'right', render: (r) => `${r.qty} ${r.unitCode}` },
    { key: 'c', header: 'Avg cost', align: 'right', hideBelow: 'md', render: (r) => <span className="tabular-nums">{money(r.avgCost, { decimals: true })}</span> },
    { key: 'v', header: 'Value', align: 'right', sortValue: (r) => r.value, render: (r) => <span className="tabular-nums font-medium">{money(r.value)}</span> },
    { key: 's', header: 'Status', render: (r) => <StatusBadge kind="stock" status={r.status} size="sm" /> },
  ];

  const tabs: { value: Tab; label: string }[] = [
    { value: 'sales', label: 'Sales by period' }, ...(multiBranch ? [{ value: 'branches' as Tab, label: 'Branch comparison' }] : []), { value: 'categories', label: 'Categories' }, { value: 'profit', label: 'Profitability' },
    { value: 'valuation', label: 'Inventory valuation' }, { value: 'wastage', label: 'Wastage' }, { value: 'consumption', label: 'Consumption' }, { value: 'staff', label: 'Staff' },
  ];
  const needsRange = !['valuation'].includes(tab);

  return (
    <div>
      <PageHeader title="Advanced reports" subtitle="Cross-period, cross-branch, inventory and profitability analytics" actions={<Button variant="ghost" leftIcon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate('/admin/reports')}>Basic reports</Button>}>
        <div className="flex flex-col lg:flex-row lg:items-center gap-2">{needsRange && <DateRangeFilter state={dr} />}{tab === 'sales' && <SegmentedControl size="sm" value={groupBy} onChange={setGroupBy} options={[{ value: 'DAY', label: 'Daily' }, { value: 'WEEK', label: 'Weekly' }, { value: 'MONTH', label: 'Monthly' }, { value: 'YEAR', label: 'Yearly' }]} />}</div>
      </PageHeader>
      <Tabs className="mb-5" value={tab} onChange={setTab} options={tabs} />

      {tab === 'sales' && <Panel q={sales}>{(d) => (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4"><StatCard label="Sales" value={money(d.totalSales)} tone="primary" /><StatCard label="Bills" value={d.totalBills} tone="info" /><StatCard label="Average bill" value={money(d.averageBill)} tone="success" /></div>
          <Card><CardHeader title={`Sales per ${groupBy.toLowerCase()}`} action={csvBtn('sales-by-period', d.rows)} />{d.rows.length === 0 ? <EmptyState compact title="No paid bills in this period" /> : <div className="h-72"><ResponsiveContainer><LineChart data={d.rows}><CartesianGrid {...gridProps} /><XAxis dataKey="bucket" {...axisProps} /><YAxis {...axisProps} width={64} /><Tooltip {...tooltipProps} formatter={(v: number) => money(v)} /><Legend /><Line type="monotone" dataKey="sales" name="Sales" stroke={CHART.primary} strokeWidth={2} dot={false} /><Line type="monotone" dataKey="tax" name="Tax" stroke={CHART_SERIES[4]} dot={false} /><Line type="monotone" dataKey="discounts" name="Discounts" stroke={CHART.danger} dot={false} /></LineChart></ResponsiveContainer></div>}</Card>
          <DataTable rows={d.rows} rowKey={(r) => r.bucket} columns={[{ key: 'b', header: 'Period', render: (r) => r.bucket }, { key: 'n', header: 'Bills', align: 'right', render: (r) => r.bills }, { key: 's', header: 'Sales', align: 'right', render: (r) => <span className="tabular-nums font-medium">{money(r.sales)}</span> }, { key: 't', header: 'Tax', align: 'right', hideBelow: 'md', render: (r) => <span className="tabular-nums">{money(r.tax)}</span> }, { key: 'd', header: 'Discounts', align: 'right', hideBelow: 'md', render: (r) => <span className="tabular-nums">{money(r.discounts)}</span> }, { key: 'sc', header: 'Service', align: 'right', hideBelow: 'lg', render: (r) => <span className="tabular-nums">{money(r.serviceCharge)}</span> }, { key: 'a', header: 'Avg bill', align: 'right', render: (r) => <span className="tabular-nums">{money(r.averageBill)}</span> }]} emptyTitle="No data" />
        </div>)}</Panel>}

      {tab === 'branches' && <Panel q={branches}>{(rows) => (
        <div className="space-y-4">
          <Card><CardHeader title="Sales and gross profit by branch" action={csvBtn('branch-comparison', rows)} />{rows.length === 0 ? <EmptyState compact title="No data" /> : <div className="h-64"><ResponsiveContainer><BarChart data={rows}><CartesianGrid {...gridProps} /><XAxis dataKey="code" {...axisProps} /><YAxis {...axisProps} width={64} /><Tooltip {...tooltipProps} formatter={(v: number) => money(v)} /><Legend /><Bar dataKey="sales" name="Sales" fill={CHART.primary} radius={[4, 4, 0, 0]} /><Bar dataKey="grossProfit" name="Gross profit" fill={CHART.success} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>}</Card>
          <DataTable columns={branchCols} rows={rows} rowKey={(r) => r.branchId} emptyTitle="No data" initialSort={{ key: 'sales', dir: 'desc' }} />
        </div>)}</Panel>}

      {tab === 'categories' && <Panel q={categories}>{(rows) => (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <Card><CardHeader title="Revenue share" />{rows.length === 0 ? <EmptyState compact title="No sales" /> : <div className="h-64"><ResponsiveContainer><PieChart><Pie data={rows} dataKey="revenue" nameKey="categoryName" innerRadius={45} outerRadius={85}>{rows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip {...tooltipProps} formatter={(v: number) => money(v)} /></PieChart></ResponsiveContainer></div>}</Card>
          <DataTable columns={catCols} rows={rows} rowKey={(r) => r.categoryName} emptyTitle="No data" initialSort={{ key: 'rev', dir: 'desc' }} toolbar={<div className="flex justify-end">{csvBtn('category-performance', rows)}</div>} />
        </div>)}</Panel>}

      {tab === 'profit' && <Panel q={profit}>{(p) => (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Revenue" value={money(p.revenue)} tone="primary" hint={`food ${money(p.foodRevenue)} · bev ${money(p.beverageRevenue)}`} />
            <StatCard label="Cost of goods" value={money(p.cogs)} tone="warning" hint={`food ${money(p.foodCogs)} · bev ${money(p.beverageCogs)}`} />
            <StatCard label="Gross profit" value={money(p.grossProfit)} tone="success" hint={`${p.grossMarginPercent.toFixed(1)}% margin`} />
            <StatCard label="Wastage & discounts" value={money(p.wastageCost + p.discountsGiven)} tone="danger" hint={`wastage ${money(p.wastageCost)} · discounts ${money(p.discountsGiven)}`} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Card><CardHeader title="Cost percentages" subtitle="Recipe cost ÷ revenue, by prep location" /><div className="space-y-3">{[{ l: 'Food cost %', v: p.foodCostPercent, warn: 35 }, { l: 'Beverage cost %', v: p.beverageCostPercent, warn: 25 }].map((r) => <div key={r.l}><div className="flex justify-between text-sm mb-1"><span>{r.l}</span><span className={`font-semibold tabular-nums ${r.v > r.warn ? 'text-danger-700' : 'text-success-700'}`}>{r.v.toFixed(1)}%</span></div><div className="h-2 rounded-full bg-neutral-100 overflow-hidden"><div className={`h-full ${r.v > r.warn ? 'bg-danger-500' : 'bg-success-500'}`} style={{ width: `${Math.min(100, r.v)}%` }} /></div><p className="text-caption text-neutral-500 mt-0.5">Target ≤ {r.warn}%</p></div>)}</div></Card>
            <Card><CardHeader title="Revenue vs cost" /><div className="h-56"><ResponsiveContainer><BarChart data={[{ name: 'Food', revenue: p.foodRevenue, cogs: p.foodCogs }, { name: 'Beverage', revenue: p.beverageRevenue, cogs: p.beverageCogs }]}><CartesianGrid {...gridProps} /><XAxis dataKey="name" {...axisProps} /><YAxis {...axisProps} width={64} /><Tooltip {...tooltipProps} formatter={(v: number) => money(v)} /><Legend /><Bar dataKey="revenue" name="Revenue" fill={CHART.primary} radius={[4, 4, 0, 0]} /><Bar dataKey="cogs" name="COGS" fill={CHART.warning} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></Card>
          </div>
          <p className="text-caption text-neutral-500">COGS uses each item's recipe cost at moving-average ingredient prices; items without a recipe contribute zero cost.</p>
        </div>)}</Panel>}

      {tab === 'valuation' && <Panel q={valuation}>{(v) => (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4"><StatCard label="Total stock value" value={money(v.totalValue)} tone="primary" size="lg" />{v.byCategory.slice(0, 3).map((c) => <StatCard key={c.categoryName} label={c.categoryName} value={money(c.value)} tone="neutral" hint={`${c.items} items · ${c.kind}`} />)}</div>
          <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
            <Card><CardHeader title="By category" />{v.byCategory.length === 0 ? <EmptyState compact title="No stock" /> : <div className="h-64"><ResponsiveContainer><PieChart><Pie data={v.byCategory} dataKey="value" nameKey="categoryName" innerRadius={45} outerRadius={85}>{v.byCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip {...tooltipProps} formatter={(val: number) => money(val)} /></PieChart></ResponsiveContainer></div>}</Card>
            <DataTable columns={valCols} rows={v.topItems} rowKey={(r) => r.itemName} emptyTitle="No stock" toolbar={<div className="flex justify-between items-center text-sm"><span>Top items by value</span>{csvBtn('inventory-valuation', v.topItems)}</div>} />
          </div>
        </div>)}</Panel>}

      {tab === 'wastage' && <Panel q={wastage}>{(w) => (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4"><StatCard label="Wastage cost" value={money(w.totalCost)} tone="danger" /><StatCard label="Entries" value={w.rows.reduce((a, r) => a + r.entries, 0)} tone="neutral" /></div>
          <DataTable columns={wasteCols} rows={w.rows} rowKey={(r) => `${r.itemName}-${r.type}`} emptyTitle="No wastage recorded" emptyDescription="Wastage, spoilage and negative adjustments appear here." initialSort={{ key: 'c', dir: 'desc' }} toolbar={<div className="flex justify-end">{csvBtn('wastage', w.rows)}</div>} />
        </div>)}</Panel>}

      {tab === 'consumption' && <Panel q={consumption}>{(rows) => (
        <div className="space-y-4">
          <Card><CardHeader title="Top ingredients by cost consumed" action={csvBtn('consumption', rows)} />{rows.length === 0 ? <EmptyState compact title="No consumption" description="Stock deductions from confirmed orders appear here." /> : <div className="h-64"><ResponsiveContainer><BarChart data={rows.slice(0, 12)} layout="vertical" margin={{ left: 20 }}><CartesianGrid {...gridProps} /><XAxis type="number" {...axisProps} /><YAxis type="category" dataKey="itemName" width={120} {...axisProps} /><Tooltip {...tooltipProps} formatter={(v: number) => money(v)} /><Bar dataKey="cost" name="Cost" fill={CHART.primary} radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></div>}</Card>
          <DataTable columns={consCols} rows={rows} rowKey={(r) => r.itemName} emptyTitle="No data" initialSort={{ key: 'c', dir: 'desc' }} />
        </div>)}</Panel>}

      {tab === 'staff' && <Panel q={staff}>{(rows) => (
        <DataTable columns={staffCols} rows={rows} rowKey={(r) => r.userId} emptyTitle="No activity" initialSort={{ key: 's', dir: 'desc' }} toolbar={<div className="flex justify-between items-center text-sm"><span>Waiters and cashiers active in the period</span>{csvBtn('staff-performance', rows)}</div>} />
      )}</Panel>}
    </div>
  );
}
