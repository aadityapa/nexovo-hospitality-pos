import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Download, ArrowLeft, Building2, Layers, Wallet, ReceiptText, Receipt, TrendingDown, Boxes, Trash2, Soup, Users, Info } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, Legend, PieChart, Pie, Cell } from 'recharts';
import { reports2Api } from '@/services/api/endpoints';
import { useDateRange, DateRangeFilter } from '@/features/shared/DateRangeFilter';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader, Tabs, Card, CardHeader, StatCard, LoadingState, ErrorState, EmptyState, DataTable, Button, SegmentedControl, StatusBadge, Badge, Alert, type Column } from '@/components/ui';
import { money } from '@/utils/money';
import { fmtDate } from '@/utils/date';
import { CHART, CHART_SERIES, axisProps, gridProps, tooltipProps, compactMoney } from '@/config/chartTheme';
import { downloadCsv } from '@/utils/csv';
import { MOVEMENT_LABELS } from '@/config/statuses';
import type { BranchComparisonRow, CategoryPerformanceRow, ConsumptionRow, StaffPerformanceRow, WastageReport, InventoryValuation, MovementType } from '@/types';

type Tab = 'sales' | 'branches' | 'categories' | 'profit' | 'valuation' | 'wastage' | 'consumption' | 'staff';
type GroupBy = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';
const COLORS = CHART_SERIES;

const Panel = <T,>({ q, variant = 'stats', children }: {
  q: { isLoading: boolean; isError: boolean; error: unknown; refetch: () => unknown; data?: T };
  variant?: 'stats' | 'page' | 'table';
  children: (d: T) => JSX.Element;
}) =>
  q.isLoading ? <LoadingState variant={variant} rows={8} /> : q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : q.data ? children(q.data) : null;

/** Colour swatch + label list so a pie's meaning never depends on colour alone. */
function ChartLegend({ items }: { items: { key: string; label: string; value: string; note?: string; colour: string }[] }) {
  return (
    <ul className="mt-3 space-y-1.5">
      {items.map((i) => (
        <li key={i.key} className="flex items-center gap-2 text-sm min-w-0">
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: i.colour }} aria-hidden />
          <span className="min-w-0 flex-1 truncate text-neutral-700">{i.label}</span>
          {i.note && <span className="text-caption text-neutral-500 tabular-nums shrink-0">{i.note}</span>}
          <span className="tabular-nums font-medium shrink-0">{i.value}</span>
        </li>
      ))}
    </ul>
  );
}

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

  const rangeLabel = useMemo(() => {
    const from = fmtDate(dr.range.from);
    const to = fmtDate(dr.range.to);
    return from === to ? from : `${from} – ${to}`;
  }, [dr.range]);

  // ---------------------------------------------------------------- export, always the open tab
  const exportMeta: Record<Tab, { file: string; what: string }> = {
    sales: { file: 'sales-by-period', what: `sales per ${groupBy.toLowerCase()}` },
    branches: { file: 'branch-comparison', what: 'the branch comparison' },
    categories: { file: 'category-performance', what: 'category performance' },
    profit: { file: 'profitability', what: 'the profitability summary' },
    valuation: { file: 'inventory-valuation', what: 'stock valuation by item' },
    wastage: { file: 'wastage', what: 'wastage' },
    consumption: { file: 'consumption', what: 'ingredient consumption' },
    staff: { file: 'staff-performance', what: 'staff performance' },
  };
  const ex = exportMeta[tab];

  const exportRows = useMemo<Record<string, unknown>[]>(() => {
    const asRows = <T,>(v: T[] | undefined) => (v ?? []) as unknown as Record<string, unknown>[];
    switch (tab) {
      case 'sales': return asRows(sales.data?.rows);
      case 'branches': return asRows(branches.data);
      case 'categories': return asRows(categories.data);
      case 'valuation': return asRows(valuation.data?.topItems);
      case 'wastage': return asRows(wastage.data?.rows);
      case 'consumption': return asRows(consumption.data);
      case 'staff': return asRows(staff.data);
      case 'profit': {
        const p = profit.data;
        return p ? [
          { measure: 'Revenue', value: p.revenue }, { measure: 'Food revenue', value: p.foodRevenue }, { measure: 'Beverage revenue', value: p.beverageRevenue },
          { measure: 'COGS', value: p.cogs }, { measure: 'Food COGS', value: p.foodCogs }, { measure: 'Beverage COGS', value: p.beverageCogs },
          { measure: 'Gross profit', value: p.grossProfit }, { measure: 'Gross margin %', value: p.grossMarginPercent },
          { measure: 'Food cost %', value: p.foodCostPercent }, { measure: 'Beverage cost %', value: p.beverageCostPercent },
          { measure: 'Wastage cost', value: p.wastageCost }, { measure: 'Discounts given', value: p.discountsGiven },
        ] : [];
      }
    }
  }, [tab, sales.data, branches.data, categories.data, profit.data, valuation.data, wastage.data, consumption.data, staff.data]);

  // ---------------------------------------------------------------- columns
  const branchCols: Column<BranchComparisonRow>[] = [
    { key: 'b', header: 'Branch', sortValue: (r) => r.name, render: (r) => <span className="block min-w-0"><span className="block font-medium text-neutral-900 truncate">{r.name}</span><span className="block text-caption text-neutral-500 truncate">{r.code}{r.city ? ` · ${r.city}` : ''}</span></span> },
    { key: 'bills', header: 'Bills', align: 'right', sortValue: (r) => r.bills, render: (r) => <span className="tabular-nums">{r.bills}</span> },
    { key: 'sales', header: 'Sales', align: 'right', sortValue: (r) => r.sales, render: (r) => <span className="tabular-nums font-medium">{money(r.sales)}</span> },
    { key: 'avg', header: 'Avg bill', align: 'right', hideBelow: 'md', sortValue: (r) => r.averageBill, render: (r) => <span className="tabular-nums">{money(r.averageBill)}</span> },
    { key: 'cogs', header: 'COGS', align: 'right', hideBelow: 'md', sortValue: (r) => r.cogs, render: (r) => <span className="tabular-nums">{money(r.cogs)}</span> },
    { key: 'gp', header: 'Gross profit', align: 'right', sortValue: (r) => r.grossProfit, render: (r) => <span className="tabular-nums text-success-700 font-medium">{money(r.grossProfit)}</span> },
    { key: 'canc', header: 'Cancelled orders', align: 'right', hideBelow: 'lg', sortValue: (r) => r.cancelledOrders, render: (r) => <span className={r.cancelledOrders > 0 ? 'tabular-nums text-danger-700' : 'tabular-nums text-neutral-500'}>{r.cancelledOrders}</span> },
  ];
  const catCols: Column<CategoryPerformanceRow>[] = [
    { key: 'c', header: 'Category', sortValue: (r) => r.categoryName, render: (r) => <span className="flex items-center gap-2 min-w-0"><span className="font-medium text-neutral-900 truncate">{r.categoryName}</span><Badge size="sm">{r.prepLocation}</Badge></span> },
    { key: 'q', header: 'Qty', align: 'right', sortValue: (r) => r.quantity, render: (r) => <span className="tabular-nums">{r.quantity}</span> },
    { key: 'rev', header: 'Revenue', align: 'right', sortValue: (r) => r.revenue, render: (r) => <span className="tabular-nums font-medium">{money(r.revenue)}</span> },
    { key: 'share', header: 'Share of revenue', align: 'right', sortValue: (r) => r.sharePercent, render: (r) => <span className="tabular-nums text-neutral-600">{r.sharePercent.toFixed(1)}%</span> },
    { key: 'bills', header: 'Bills', align: 'right', hideBelow: 'md', sortValue: (r) => r.bills, render: (r) => <span className="tabular-nums">{r.bills}</span> },
  ];
  const wasteCols: Column<WastageReport['rows'][number]>[] = [
    { key: 'i', header: 'Item', sortValue: (r) => r.itemName, render: (r) => <span className="font-medium text-neutral-900">{r.itemName}</span> },
    { key: 't', header: 'Reason', sortValue: (r) => r.type, render: (r) => <Badge size="sm" tone={r.type === 'WASTAGE' ? 'danger' : 'warning'}>{MOVEMENT_LABELS[r.type as MovementType] ?? r.type}</Badge> },
    { key: 'q', header: 'Qty', align: 'right', sortValue: (r) => r.qty, render: (r) => <span className="tabular-nums">{r.qty} {r.unitCode}</span> },
    { key: 'c', header: 'Cost', align: 'right', sortValue: (r) => r.cost, render: (r) => <span className="tabular-nums text-danger-700 font-medium">{money(r.cost)}</span> },
    { key: 'n', header: 'Entries', align: 'right', hideBelow: 'md', sortValue: (r) => r.entries, render: (r) => <span className="tabular-nums">{r.entries}</span> },
  ];
  const consCols: Column<ConsumptionRow>[] = [
    { key: 'i', header: 'Ingredient', sortValue: (r) => r.itemName, render: (r) => <span className="block min-w-0"><span className="block font-medium text-neutral-900 truncate">{r.itemName}</span><span className="block text-caption text-neutral-500 truncate">{r.categoryName}</span></span> },
    { key: 'q', header: 'Consumed', align: 'right', sortValue: (r) => r.qty, render: (r) => <span className="tabular-nums">{r.qty} {r.unitCode}</span> },
    { key: 'c', header: 'Cost', align: 'right', sortValue: (r) => r.cost, render: (r) => <span className="tabular-nums font-medium">{money(r.cost)}</span> },
  ];
  const staffCols: Column<StaffPerformanceRow>[] = [
    { key: 'n', header: 'Staff', sortValue: (r) => r.fullName, render: (r) => <span className="font-medium text-neutral-900">{r.fullName}</span> },
    { key: 'o', header: 'Orders', align: 'right', sortValue: (r) => r.ordersHandled, render: (r) => <span className="tabular-nums">{r.ordersHandled}</span> },
    { key: 'bl', header: 'Bills', align: 'right', hideBelow: 'md', sortValue: (r) => r.bills, render: (r) => <span className="tabular-nums">{r.bills}</span> },
    { key: 't', header: 'Tables', align: 'right', hideBelow: 'md', sortValue: (r) => r.tablesServed, render: (r) => <span className="tabular-nums">{r.tablesServed}</span> },
    { key: 's', header: 'Sales', align: 'right', sortValue: (r) => r.sales, render: (r) => <span className="tabular-nums font-medium">{money(r.sales)}</span> },
    { key: 'a', header: 'Avg bill', align: 'right', hideBelow: 'md', sortValue: (r) => r.averageBill, render: (r) => <span className="tabular-nums">{money(r.averageBill)}</span> },
    {
      key: 'c', header: 'Cancelled', align: 'right', hideBelow: 'lg', sortValue: (r) => r.cancelledOrders + r.cancelledItems,
      render: (r) => <span className={r.cancelledOrders + r.cancelledItems > 0 ? 'text-danger-700' : 'text-neutral-500'}>{r.cancelledOrders} order{r.cancelledOrders === 1 ? '' : 's'} · {r.cancelledItems} item{r.cancelledItems === 1 ? '' : 's'}</span>,
    },
  ];
  const valCols: Column<InventoryValuation['topItems'][number]>[] = [
    { key: 'i', header: 'Item', sortValue: (r) => r.itemName, render: (r) => <span className="font-medium text-neutral-900">{r.itemName}</span> },
    { key: 'q', header: 'On hand', align: 'right', sortValue: (r) => r.qty, render: (r) => <span className="tabular-nums">{r.qty} {r.unitCode}</span> },
    { key: 'c', header: 'Avg cost', align: 'right', hideBelow: 'md', sortValue: (r) => r.avgCost, render: (r) => <span className="tabular-nums">{money(r.avgCost, { decimals: true })}</span> },
    { key: 'v', header: 'Value', align: 'right', sortValue: (r) => r.value, render: (r) => <span className="tabular-nums font-medium">{money(r.value)}</span> },
    { key: 's', header: 'Stock status', sortValue: (r) => r.status, render: (r) => <StatusBadge kind="stock" status={r.status} size="sm" /> },
  ];

  const tabs: { value: Tab; label: string }[] = [
    { value: 'sales', label: 'Sales by period' }, ...(multiBranch ? [{ value: 'branches' as Tab, label: 'Branch comparison' }] : []), { value: 'categories', label: 'Categories' }, { value: 'profit', label: 'Profitability' },
    { value: 'valuation', label: 'Inventory valuation' }, { value: 'wastage', label: 'Wastage' }, { value: 'consumption', label: 'Consumption' }, { value: 'staff', label: 'Staff' },
  ];
  const needsRange = tab !== 'valuation';
  const emptyForRange = `Nothing recorded between ${rangeLabel}.`;

  return (
    <div>
      <PageHeader
        title="Advanced reports"
        subtitle="Cross-period, cross-branch, inventory and profitability analytics"
        actions={<>
          <Button variant="ghost" leftIcon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate('/admin/reports')}>Basic reports</Button>
          {/* Primary weight: exporting the open tab is what this screen is for. */}
          <Button
            leftIcon={<Download className="h-4 w-4" />}
            disabled={exportRows.length === 0}
            aria-label={`Export ${ex.what}${needsRange ? ` for ${rangeLabel}` : ''} as CSV`}
            onClick={() => downloadCsv(ex.file, exportRows)}
          >
            Export<span className="hidden sm:inline">&nbsp;{ex.what}</span>
          </Button>
        </>}
      >
        <div className="flex flex-col lg:flex-row lg:items-center gap-2">
          {needsRange && <DateRangeFilter state={dr} />}
          {tab === 'sales' && (
            <SegmentedControl
              size="sm"
              ariaLabel="Group sales by"
              value={groupBy}
              onChange={setGroupBy}
              options={[{ value: 'DAY', label: 'Daily' }, { value: 'WEEK', label: 'Weekly' }, { value: 'MONTH', label: 'Monthly' }, { value: 'YEAR', label: 'Yearly' }]}
            />
          )}
        </div>
      </PageHeader>

      <Tabs className="mb-3" ariaLabel="Advanced report" value={tab} onChange={setTab} options={tabs} />
      <p className="text-caption text-neutral-500 mb-4" aria-live="polite">
        {needsRange
          ? <strong className="text-neutral-700 font-semibold">{rangeLabel}</strong>
          : <strong className="text-neutral-700 font-semibold">Live snapshot</strong>}
        {needsRange ? ' · ' : ' — the date range does not apply to stock on hand · '}
        {exportRows.length > 0
          ? `Export writes ${exportRows.length} row${exportRows.length === 1 ? '' : 's'} of ${ex.what}.`
          : `Nothing to export on this tab yet — ${ex.what} is empty.`}
      </p>

      {/* ---------------------------------------------------------------- Sales by period */}
      {tab === 'sales' && <Panel q={sales} variant="page">{(d) => (
        <div className="space-y-4">
          <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatCard label="Sales" value={money(d.totalSales)} tone="primary" size="lg" icon={<Wallet className="h-5 w-5" />} hint={`Bills paid between ${rangeLabel}`} />
            <StatCard label="Bills" value={d.totalBills} tone="info" icon={<ReceiptText className="h-5 w-5" />} />
            <StatCard label="Average bill" value={money(d.averageBill)} tone="success" icon={<Receipt className="h-5 w-5" />} hint="Sales ÷ bills" />
            <StatCard label={`${groupBy[0]}${groupBy.slice(1).toLowerCase()} buckets`} value={d.rows.length} tone="neutral" hint={d.rows.length ? `${d.rows[0].bucket} → ${d.rows[d.rows.length - 1].bucket}` : 'No settled bills'} />
          </div>

          <Card>
            <CardHeader title={`Sales per ${groupBy.toLowerCase()}`} subtitle="Sales, tax and discounts side by side — all three come from the same settled bills" />
            {d.rows.length === 0 ? (
              <EmptyState compact icon={<Receipt className="h-6 w-6" />} title="No settled bills to plot" description={`${emptyForRange} Widen the range or switch the grouping.`} />
            ) : (
              <div className="h-72">
                <ResponsiveContainer>
                  <LineChart data={d.rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="bucket" {...axisProps} />
                    <YAxis tickFormatter={compactMoney} width={64} {...axisProps} />
                    <Tooltip {...tooltipProps} formatter={(v: number) => money(v)} />
                    <Legend />
                    <Line type="monotone" dataKey="sales" name="Sales" stroke={CHART.primary} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="tax" name="Tax" stroke={CHART_SERIES[4]} dot={false} />
                    <Line type="monotone" dataKey="discounts" name="Discounts" stroke={CHART.danger} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <DataTable
            rows={d.rows}
            rowKey={(r) => r.bucket}
            caption="Sales per period with bills, tax, discounts, service charge and average bill"
            toolbar={<p className="text-sm text-neutral-600 px-1">Every {groupBy.toLowerCase()} in the range that took money</p>}
            emptyTitle="No settled bills"
            emptyDescription={emptyForRange}
            columns={[
              { key: 'b', header: 'Period', sortValue: (r) => r.bucket, render: (r) => <span className="font-medium text-neutral-900">{r.bucket}</span> },
              { key: 'n', header: 'Bills', align: 'right', sortValue: (r) => r.bills, render: (r) => <span className="tabular-nums">{r.bills}</span> },
              { key: 's', header: 'Sales', align: 'right', sortValue: (r) => r.sales, render: (r) => <span className="tabular-nums font-medium">{money(r.sales)}</span> },
              { key: 't', header: 'Tax', align: 'right', hideBelow: 'md', sortValue: (r) => r.tax, render: (r) => <span className="tabular-nums">{money(r.tax)}</span> },
              { key: 'd', header: 'Discounts', align: 'right', hideBelow: 'md', sortValue: (r) => r.discounts, render: (r) => <span className="tabular-nums">{money(r.discounts)}</span> },
              { key: 'sc', header: 'Service charge', align: 'right', hideBelow: 'lg', sortValue: (r) => r.serviceCharge, render: (r) => <span className="tabular-nums">{money(r.serviceCharge)}</span> },
              { key: 'a', header: 'Avg bill', align: 'right', sortValue: (r) => r.averageBill, render: (r) => <span className="tabular-nums">{money(r.averageBill)}</span> },
            ]}
            mobileCard={(r) => (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-neutral-900 min-w-0 truncate">{r.bucket}</span>
                  <span className="tabular-nums font-semibold">{money(r.sales)}</span>
                </div>
                <p className="text-caption text-neutral-500">{r.bills} bill{r.bills === 1 ? '' : 's'} · avg {money(r.averageBill)} · tax {money(r.tax)}</p>
              </div>
            )}
          />
        </div>
      )}</Panel>}

      {/* ---------------------------------------------------------------- Branch comparison */}
      {tab === 'branches' && <Panel q={branches} variant="page">{(rows) => {
        const totals = rows.reduce((a, r) => ({ sales: a.sales + r.sales, bills: a.bills + r.bills, gp: a.gp + r.grossProfit }), { sales: 0, bills: 0, gp: 0 });
        const best = rows.length ? rows.reduce((b, r) => (r.sales > b.sales ? r : b), rows[0]) : null;
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <StatCard label="Sales, all branches" value={money(totals.sales)} tone="primary" size="lg" icon={<Wallet className="h-5 w-5" />} hint={`${rows.length} branch${rows.length === 1 ? '' : 'es'} in range`} />
              <StatCard label="Bills, all branches" value={totals.bills} tone="info" icon={<ReceiptText className="h-5 w-5" />} />
              <StatCard label="Gross profit, all branches" value={money(totals.gp)} tone="success" hint="Sales less recipe cost of goods" />
              <StatCard label="Highest sales" value={best ? best.name : '—'} tone="accent" icon={<Building2 className="h-5 w-5" />} hint={best ? `${money(best.sales)} from ${best.bills} bill${best.bills === 1 ? '' : 's'}` : 'No branch took money in this range'} />
            </div>

            <Card>
              <CardHeader title="Sales and gross profit by branch" subtitle="Same range for every branch — the gap between the bars is the cost of goods" />
              {rows.length === 0 ? (
                <EmptyState compact icon={<Building2 className="h-6 w-6" />} title="No branch activity" description={emptyForRange} />
              ) : (
                <div className="h-64">
                  <ResponsiveContainer>
                    <BarChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid {...gridProps} />
                      <XAxis dataKey="code" {...axisProps} />
                      <YAxis tickFormatter={compactMoney} width={64} {...axisProps} />
                      <Tooltip {...tooltipProps} formatter={(v: number) => money(v)} labelFormatter={(c: string) => rows.find((r) => r.code === c)?.name ?? c} />
                      <Legend />
                      <Bar dataKey="sales" name="Sales" fill={CHART.primary} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="grossProfit" name="Gross profit" fill={CHART.success} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            <DataTable
              columns={branchCols}
              rows={rows}
              rowKey={(r) => r.branchId}
              initialSort={{ key: 'sales', dir: 'desc' }}
              caption="Branch comparison with bills, sales, average bill, cost of goods, gross profit and cancellations"
              emptyTitle="No branch activity"
              emptyDescription={emptyForRange}
              mobileCard={(r) => (
                <div className="space-y-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block font-medium text-neutral-900 truncate">{r.name}</span>
                      <span className="block text-caption text-neutral-500 truncate">{r.code}{r.city ? ` · ${r.city}` : ''}</span>
                    </span>
                    <span className="tabular-nums font-semibold shrink-0">{money(r.sales)}</span>
                  </div>
                  <p className="text-caption text-neutral-500">{r.bills} bills · avg {money(r.averageBill)} · gross profit {money(r.grossProfit)}</p>
                </div>
              )}
            />
          </div>
        );
      }}</Panel>}

      {/* ---------------------------------------------------------------- Categories */}
      {tab === 'categories' && <Panel q={categories} variant="page">{(rows) => {
        const totalRevenue = rows.reduce((a, r) => a + r.revenue, 0);
        const totalQty = rows.reduce((a, r) => a + r.quantity, 0);
        const top = rows.length ? rows.reduce((b, r) => (r.revenue > b.revenue ? r : b), rows[0]) : null;
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <StatCard label="Category revenue" value={money(totalRevenue)} tone="primary" size="lg" icon={<Wallet className="h-5 w-5" />} hint="Line totals after item discounts" />
              <StatCard label="Items sold" value={totalQty} tone="info" icon={<Layers className="h-5 w-5" />} />
              <StatCard label="Categories selling" value={rows.length} tone="neutral" />
              <StatCard label="Largest share" value={top ? top.categoryName : '—'} tone="accent" hint={top ? `${top.sharePercent.toFixed(1)}% of revenue · ${money(top.revenue)}` : 'Nothing sold in this range'} />
            </div>

            <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
              <Card>
                <CardHeader title="Revenue share" subtitle="Share of item revenue in this range" />
                {rows.length === 0 ? (
                  <EmptyState compact icon={<Layers className="h-6 w-6" />} title="No category sales" description={emptyForRange} />
                ) : (
                  <>
                    <div className="h-64">
                      <ResponsiveContainer>
                        <PieChart>
                          <Pie data={rows} dataKey="revenue" nameKey="categoryName" innerRadius={45} outerRadius={85}>
                            {rows.map((r, i) => <Cell key={r.categoryName} fill={COLORS[i % COLORS.length]} />)}
                          </Pie>
                          <Tooltip {...tooltipProps} formatter={(v: number) => money(v)} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <ChartLegend items={rows.slice(0, 8).map((r, i) => ({ key: r.categoryName, label: r.categoryName, note: `${r.sharePercent.toFixed(0)}%`, value: money(r.revenue), colour: COLORS[i % COLORS.length] }))} />
                    {rows.length > 8 && <p className="text-caption text-neutral-500 mt-2">{rows.length - 8} smaller categor{rows.length - 8 === 1 ? 'y is' : 'ies are'} listed in the table.</p>}
                  </>
                )}
              </Card>

              <DataTable
                columns={catCols}
                rows={rows}
                rowKey={(r) => r.categoryName}
                initialSort={{ key: 'rev', dir: 'desc' }}
                caption="Category performance with quantity, revenue, share and bills"
                emptyTitle="No category sales"
                emptyDescription={emptyForRange}
                mobileCard={(r) => (
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0 flex items-center gap-2"><span className="font-medium text-neutral-900 truncate">{r.categoryName}</span><Badge size="sm">{r.prepLocation}</Badge></span>
                      <span className="tabular-nums font-semibold shrink-0">{money(r.revenue)}</span>
                    </div>
                    <p className="text-caption text-neutral-500">{r.quantity} sold · {r.sharePercent.toFixed(1)}% of revenue · {r.bills} bills</p>
                  </div>
                )}
              />
            </div>
          </div>
        );
      }}</Panel>}

      {/* ---------------------------------------------------------------- Profitability */}
      {tab === 'profit' && <Panel q={profit} variant="page">{(p) => (
        <div className="space-y-4">
          <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatCard label="Revenue" value={money(p.revenue)} tone="primary" size="lg" icon={<Wallet className="h-5 w-5" />} hint={`Food ${money(p.foodRevenue)} · beverage ${money(p.beverageRevenue)}`} />
            <StatCard label="Cost of goods" value={money(p.cogs)} tone="warning" icon={<Boxes className="h-5 w-5" />} hint={`Food ${money(p.foodCogs)} · beverage ${money(p.beverageCogs)}`} />
            <StatCard label="Gross profit" value={money(p.grossProfit)} tone="success" hint={`${p.grossMarginPercent.toFixed(1)}% margin on revenue`} />
            <StatCard label="Wastage & discounts" value={money(p.wastageCost + p.discountsGiven)} tone={p.wastageCost + p.discountsGiven > 0 ? 'danger' : 'neutral'} icon={<TrendingDown className="h-5 w-5" />} hint={`Wastage ${money(p.wastageCost)} · discounts ${money(p.discountsGiven)}`} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader title="Cost percentages" subtitle="Recipe cost ÷ revenue, by prep location" />
              {p.revenue === 0 ? (
                <EmptyState compact icon={<Boxes className="h-6 w-6" />} title="No revenue to measure cost against" description={`${emptyForRange} A cost percentage of a zero total would be meaningless, so none is drawn.`} />
              ) : (
              <div className="space-y-4">
                {[{ l: 'Food cost', v: p.foodCostPercent, warn: 35 }, { l: 'Beverage cost', v: p.beverageCostPercent, warn: 25 }].map((r) => {
                  const over = r.v > r.warn;
                  return (
                    <div key={r.l}>
                      <div className="flex items-baseline justify-between gap-3 text-sm mb-1">
                        <span className="text-neutral-700">{r.l}</span>
                        <span className={`font-semibold tabular-nums ${over ? 'text-danger-700' : 'text-success-700'}`}>
                          {r.v.toFixed(1)}%{' '}
                          <span className="font-normal">{over ? 'over target' : 'within target'}</span>
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-neutral-100 overflow-hidden">
                        <div className={`h-full ${over ? 'bg-danger-500' : 'bg-success-500'}`} style={{ width: `${Math.min(100, r.v)}%` }} aria-hidden />
                      </div>
                      <p className="text-caption text-neutral-500 mt-1">Target ≤ {r.warn}%</p>
                    </div>
                  );
                })}
              </div>
              )}
            </Card>

            <Card>
              <CardHeader title="Revenue against cost" subtitle="Food and beverage side by side — the gap between the bars is the gross margin" />
              {p.revenue === 0 && p.cogs === 0 ? (
                <EmptyState compact icon={<Receipt className="h-6 w-6" />} title="Nothing to plot" description={emptyForRange} />
              ) : (
                <div className="h-56">
                  <ResponsiveContainer>
                    <BarChart data={[{ name: 'Food', revenue: p.foodRevenue, cogs: p.foodCogs }, { name: 'Beverage', revenue: p.beverageRevenue, cogs: p.beverageCogs }]} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid {...gridProps} />
                      <XAxis dataKey="name" {...axisProps} />
                      <YAxis tickFormatter={compactMoney} width={64} {...axisProps} />
                      <Tooltip {...tooltipProps} formatter={(v: number) => money(v)} />
                      <Legend />
                      <Bar dataKey="revenue" name="Revenue" fill={CHART.primary} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="cogs" name="Cost of goods" fill={CHART.warning} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </div>

          <Alert tone="info" title="How cost of goods is derived">
            Each item's recipe is costed at moving-average ingredient prices at the time of sale. Items without a recipe contribute zero cost, so their margin reads as 100% — add recipes to make this figure complete.
          </Alert>
        </div>
      )}</Panel>}

      {/* ---------------------------------------------------------------- Inventory valuation */}
      {tab === 'valuation' && <Panel q={valuation} variant="page">{(v) => {
        const itemCount = v.byCategory.reduce((a, c) => a + c.items, 0);
        const top = v.byCategory.length ? v.byCategory.reduce((b, c) => (c.value > b.value ? c : b), v.byCategory[0]) : null;
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <StatCard label="Total stock value" value={money(v.totalValue)} tone="primary" size="lg" icon={<Boxes className="h-5 w-5" />} hint="On hand right now, at moving-average cost" />
              <StatCard label="Categories" value={v.byCategory.length} tone="neutral" icon={<Layers className="h-5 w-5" />} />
              <StatCard label="Items holding stock" value={itemCount} tone="info" />
              <StatCard label="Largest category" value={top ? top.categoryName : '—'} tone="accent" hint={top ? `${money(top.value)} · ${top.items} item${top.items === 1 ? '' : 's'} · ${top.kind.toLowerCase()}` : 'Nothing in stock'} />
            </div>

            <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
              <Card>
                <CardHeader title="By category" subtitle="Where the money on the shelf is sitting" />
                {v.byCategory.length === 0 ? (
                  <EmptyState compact icon={<Boxes className="h-6 w-6" />} title="No stock on hand" description="Receive a purchase order or record opening stock to value it here." />
                ) : (
                  <>
                    <div className="h-64">
                      <ResponsiveContainer>
                        <PieChart>
                          <Pie data={v.byCategory} dataKey="value" nameKey="categoryName" innerRadius={45} outerRadius={85}>
                            {v.byCategory.map((c, i) => <Cell key={c.categoryName} fill={COLORS[i % COLORS.length]} />)}
                          </Pie>
                          <Tooltip {...tooltipProps} formatter={(val: number) => money(val)} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <ChartLegend items={v.byCategory.map((c, i) => ({ key: c.categoryName, label: c.categoryName, note: `${c.items} item${c.items === 1 ? '' : 's'}`, value: money(c.value), colour: COLORS[i % COLORS.length] }))} />
                  </>
                )}
              </Card>

              <DataTable
                columns={valCols}
                rows={v.topItems}
                rowKey={(r) => r.itemName}
                initialSort={{ key: 'v', dir: 'desc' }}
                caption="Highest value stock items with quantity on hand, average cost and stock status"
                toolbar={<p className="text-sm text-neutral-600 px-1">Highest value items first</p>}
                emptyTitle="No stock on hand"
                emptyDescription="Nothing is currently held in inventory for this branch."
                mobileCard={(r) => (
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-medium text-neutral-900 min-w-0 truncate">{r.itemName}</span>
                      <StatusBadge kind="stock" status={r.status} size="sm" />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-caption text-neutral-500">{r.qty} {r.unitCode} · {money(r.avgCost, { decimals: true })} each</span>
                      <span className="tabular-nums font-semibold">{money(r.value)}</span>
                    </div>
                  </div>
                )}
              />
            </div>
          </div>
        );
      }}</Panel>}

      {/* ---------------------------------------------------------------- Wastage */}
      {tab === 'wastage' && <Panel q={wastage} variant="page">{(w) => {
        const entries = w.rows.reduce((a, r) => a + r.entries, 0);
        const items = new Set(w.rows.map((r) => r.itemName)).size;
        const worst = w.rows.length ? w.rows.reduce((b, r) => (r.cost > b.cost ? r : b), w.rows[0]) : null;
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <StatCard label="Wastage cost" value={money(w.totalCost)} tone={w.totalCost > 0 ? 'danger' : 'success'} size="lg" icon={<Trash2 className="h-5 w-5" />} hint={`Written off between ${rangeLabel}`} />
              <StatCard label="Entries" value={entries} tone="neutral" hint="Individual write-off movements" />
              <StatCard label="Items affected" value={items} tone="neutral" icon={<Boxes className="h-5 w-5" />} />
              <StatCard label="Costliest line" value={worst ? worst.itemName : '—'} tone={worst ? 'warning' : 'neutral'} hint={worst ? `${money(worst.cost)} · ${worst.qty} ${worst.unitCode} · ${MOVEMENT_LABELS[worst.type as MovementType] ?? worst.type}` : 'Nothing written off'} />
            </div>

            <DataTable
              columns={wasteCols}
              rows={w.rows}
              rowKey={(r) => `${r.itemName}-${r.type}`}
              initialSort={{ key: 'c', dir: 'desc' }}
              caption="Wastage and write-offs by item and reason"
              toolbar={<p className="text-sm text-neutral-600 px-1">Costliest write-offs first</p>}
              emptyTitle="Nothing written off"
              emptyDescription="Wastage, damage and negative adjustments appear here as soon as they are recorded."
              mobileCard={(r) => (
                <div className="space-y-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-medium text-neutral-900 min-w-0 truncate">{r.itemName}</span>
                    <Badge size="sm" tone={r.type === 'WASTAGE' ? 'danger' : 'warning'}>{MOVEMENT_LABELS[r.type as MovementType] ?? r.type}</Badge>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-caption text-neutral-500">{r.qty} {r.unitCode} · {r.entries} entr{r.entries === 1 ? 'y' : 'ies'}</span>
                    <span className="tabular-nums font-semibold text-danger-700">{money(r.cost)}</span>
                  </div>
                </div>
              )}
            />
          </div>
        );
      }}</Panel>}

      {/* ---------------------------------------------------------------- Consumption */}
      {tab === 'consumption' && <Panel q={consumption} variant="page">{(rows) => {
        const totalCost = rows.reduce((a, r) => a + r.cost, 0);
        const top = rows.length ? rows.reduce((b, r) => (r.cost > b.cost ? r : b), rows[0]) : null;
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <StatCard label="Ingredient cost consumed" value={money(totalCost)} tone="primary" size="lg" icon={<Soup className="h-5 w-5" />} hint={`Deducted by confirmed orders between ${rangeLabel}`} />
              <StatCard label="Ingredients used" value={rows.length} tone="info" icon={<Boxes className="h-5 w-5" />} />
              <StatCard label="Largest consumer" value={top ? top.itemName : '—'} tone="accent" hint={top ? `${money(top.cost)} · ${top.qty} ${top.unitCode}` : 'No consumption recorded'} />
              <StatCard label="Shown in the chart" value={Math.min(12, rows.length)} tone="neutral" hint="Top ingredients by cost; the table lists them all" />
            </div>

            <Card>
              <CardHeader title="Top ingredients by cost consumed" subtitle="Stock deducted when orders were confirmed" />
              {rows.length === 0 ? (
                <EmptyState compact icon={<Soup className="h-6 w-6" />} title="No consumption recorded" description={`${emptyForRange} Stock deductions from confirmed orders appear here.`} />
              ) : (
                <>
                  <div className="h-64">
                    <ResponsiveContainer>
                      <BarChart data={rows.slice(0, 12)} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 8 }}>
                        <CartesianGrid {...gridProps} />
                        <XAxis type="number" tickFormatter={compactMoney} {...axisProps} />
                        {/* The axis gutter has to fit a 390 px card, so long ingredient names are shortened here only. */}
                        <YAxis type="category" dataKey="itemName" width={108} tickFormatter={(v: string) => (v.length > 15 ? `${v.slice(0, 14)}…` : v)} {...axisProps} />
                        {/* The tooltip label is the raw category value, so the full name survives. */}
                        <Tooltip {...tooltipProps} formatter={(v: number) => money(v)} />
                        <Legend />
                        <Bar dataKey="cost" name="Cost consumed" fill={CHART.primary} radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-caption text-neutral-500 mt-2">
                    Top {Math.min(12, rows.length)} of {rows.length} ingredient{rows.length === 1 ? '' : 's'} by cost. A shortened axis label is written in full in the tooltip and in the table below.
                  </p>
                </>
              )}
            </Card>

            <DataTable
              columns={consCols}
              rows={rows}
              rowKey={(r) => r.itemName}
              initialSort={{ key: 'c', dir: 'desc' }}
              caption="Ingredient consumption with quantity and cost"
              emptyTitle="No consumption"
              emptyDescription={emptyForRange}
              mobileCard={(r) => (
                <div className="space-y-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block font-medium text-neutral-900 truncate">{r.itemName}</span>
                      <span className="block text-caption text-neutral-500 truncate">{r.categoryName}</span>
                    </span>
                    <span className="tabular-nums font-semibold shrink-0">{money(r.cost)}</span>
                  </div>
                  <p className="text-caption text-neutral-500">{r.qty} {r.unitCode} consumed</p>
                </div>
              )}
            />
          </div>
        );
      }}</Panel>}

      {/* ---------------------------------------------------------------- Staff */}
      {tab === 'staff' && <Panel q={staff} variant="page">{(rows) => {
        const totalSales = rows.reduce((a, r) => a + r.sales, 0);
        const totalOrders = rows.reduce((a, r) => a + r.ordersHandled, 0);
        const top = rows.length ? rows.reduce((b, r) => (r.sales > b.sales ? r : b), rows[0]) : null;
        const cancels = rows.reduce((a, r) => a + r.cancelledOrders, 0);
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <StatCard label="Sales handled" value={money(totalSales)} tone="primary" size="lg" icon={<Wallet className="h-5 w-5" />} hint={`Across ${rows.length} staff member${rows.length === 1 ? '' : 's'}`} />
              <StatCard label="Orders handled" value={totalOrders} tone="info" icon={<ReceiptText className="h-5 w-5" />} />
              <StatCard label="Highest sales" value={top ? top.fullName : '—'} tone="accent" icon={<Users className="h-5 w-5" />} hint={top ? `${money(top.sales)} from ${top.ordersHandled} order${top.ordersHandled === 1 ? '' : 's'}` : 'No activity in this range'} />
              <StatCard label="Orders cancelled" value={cancels} tone={cancels > 0 ? 'warning' : 'neutral'} hint="Cancellations attributed to these staff" />
            </div>

            <DataTable
              columns={staffCols}
              rows={rows}
              rowKey={(r) => r.userId}
              initialSort={{ key: 's', dir: 'desc' }}
              caption="Staff performance with orders, bills, tables, sales, average bill and cancellations"
              toolbar={<p className="text-sm text-neutral-600 px-1">Waiters and cashiers active between {rangeLabel}</p>}
              emptyTitle="No staff activity"
              emptyDescription={emptyForRange}
              mobileCard={(r) => (
                <div className="space-y-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-medium text-neutral-900 min-w-0 truncate">{r.fullName}</span>
                    <span className="tabular-nums font-semibold shrink-0">{money(r.sales)}</span>
                  </div>
                  <p className="text-caption text-neutral-500">{r.ordersHandled} orders · {r.bills} bills · {r.tablesServed} tables · avg {money(r.averageBill)}</p>
                  {(r.cancelledOrders > 0 || r.cancelledItems > 0) && (
                    <p className="text-caption text-danger-700 inline-flex items-center gap-1"><Info className="h-3 w-3 shrink-0" aria-hidden />{r.cancelledOrders} order{r.cancelledOrders === 1 ? '' : 's'} · {r.cancelledItems} item{r.cancelledItems === 1 ? '' : 's'} cancelled</p>
                  )}
                </div>
              )}
            />
          </div>
        );
      }}</Panel>}
    </div>
  );
}
