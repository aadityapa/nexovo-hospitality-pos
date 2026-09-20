import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { IndianRupee, Activity, AlertTriangle, Bell, LayoutGrid, Receipt, Clock, ChefHat, Wine, ArrowRight } from 'lucide-react';
import { reportsApi } from '@/services/api/endpoints';
import { useOrders } from '@/features/orders/hooks';
import { useNow } from '@/hooks/useRealtime';
import { useDateRange, DateRangeFilter } from '@/features/shared/DateRangeFilter';
import { SalesCharts, RecentPanels } from '@/features/dashboard/DashboardPage';
import { PageHeader, StatCard, Card, CardHeader, LoadingState, ErrorState, EmptyState, StatusBadge, Badge, Button } from '@/components/ui';
import { money } from '@/utils/money';
import { elapsedMinutes, fmtTime } from '@/utils/date';
import { DELAY_THRESHOLDS } from '@/config/statuses';
import { cn } from '@/utils/cn';

/** Operations-first dashboard for managers: what needs attention now, then the numbers. */
export default function ManagerDashboardPage() {
  const dr = useDateRange('today');
  const navigate = useNavigate();
  const now = useNow(15_000);
  const dash = useQuery({ queryKey: ['dashboard', dr.range], queryFn: () => reportsApi.dashboard(dr.range) });
  const live = useOrders({ active: true }, { refetchInterval: 20_000 });

  const active = live.data ?? [];
  const mins = (iso: string) => elapsedMinutes(iso, now);
  const delayed = active.filter((o) => ['CONFIRMED', 'IN_PROGRESS', 'PARTIALLY_READY'].includes(o.status) && mins(o.confirmedAt ?? o.createdAt) >= DELAY_THRESHOLDS.late);
  const readyOrders = active.filter((o) => o.items.some((i) => i.status === 'READY'));
  const pendingOrders = active.filter((o) => ['CONFIRMED', 'IN_PROGRESS', 'PARTIALLY_READY'].includes(o.status));
  const billPending = active.filter((o) => ['BILL_REQUESTED', 'BILLED'].includes(o.status));
  const kitchenBacklog = active.reduce((a, o) => a + o.items.filter((i) => i.prepLocation === 'KITCHEN' && ['NEW', 'PREPARING'].includes(i.status)).length, 0);
  const barBacklog = active.reduce((a, o) => a + o.items.filter((i) => i.prepLocation === 'BAR' && ['NEW', 'PREPARING'].includes(i.status)).length, 0);

  const alerts: { tone: 'danger' | 'warning'; text: string; to: string }[] = [
    ...delayed.map((o) => ({ tone: 'danger' as const, text: `${o.tableName} waiting ${mins(o.confirmedAt ?? o.createdAt)} min (${o.orderNumber})`, to: `/admin/orders/${o.id}` })),
    ...(kitchenBacklog > DELAY_THRESHOLDS.backlog ? [{ tone: 'warning' as const, text: `Kitchen backlog: ${kitchenBacklog} items pending`, to: '/kitchen' }] : []),
    ...(barBacklog > DELAY_THRESHOLDS.backlog ? [{ tone: 'warning' as const, text: `Bar backlog: ${barBacklog} items pending`, to: '/bar' }] : []),
    ...billPending
      .filter((o) => mins(o.billRequestedAt ?? o.createdAt) >= DELAY_THRESHOLDS.warn)
      .map((o) => ({ tone: 'warning' as const, text: `${o.tableName} bill pending ${mins(o.billRequestedAt ?? o.createdAt)} min`, to: '/cashier' })),
  ];

  return (
    <div>
      <PageHeader
        title="Manager dashboard"
        subtitle="What needs attention now, and how the shift is tracking"
        actions={<Button variant="outline" leftIcon={<Activity className="h-4 w-4" />} onClick={() => navigate('/manager/live')}>Live operations</Button>}
      >
        <DateRangeFilter state={dr} />
      </PageHeader>

      {dash.isError && <ErrorState error={dash.error} onRetry={() => void dash.refetch()} compact />}

      {/* Service state first — a manager opens this page because something might be wrong. */}
      <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label="Delayed"
          value={delayed.length}
          icon={<AlertTriangle className="h-5 w-5" />}
          tone={delayed.length ? 'danger' : 'success'}
          hint={`waiting over ${DELAY_THRESHOLDS.late} min`}
          onClick={() => navigate('/manager/live')}
        />
        <StatCard label="In progress" value={pendingOrders.length} icon={<Clock className="h-5 w-5" />} tone="warning" hint="with the kitchen or bar" />
        <StatCard label="Ready to serve" value={readyOrders.length} icon={<Bell className="h-5 w-5" />} tone="success" hint="orders with a ready item" />
        <StatCard
          label="Bills pending"
          value={billPending.length}
          icon={<Receipt className="h-5 w-5" />}
          tone={billPending.length ? 'warning' : 'neutral'}
          hint={dash.data ? `${money(dash.data.pendingPayments)} unpaid` : undefined}
          onClick={() => navigate('/cashier')}
        />
        <StatCard
          label="Tables occupied"
          value={dash.data ? `${dash.data.occupiedTables} / ${dash.data.totalTables}` : '…'}
          icon={<LayoutGrid className="h-5 w-5" />}
          tone="primary"
          onClick={() => navigate('/admin/tables')}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3 mt-5">
        <Card padded={false} className="lg:col-span-2">
          <CardHeader
            className="p-5 pb-0"
            title="Live order feed"
            subtitle={`${active.length} active order${active.length === 1 ? '' : 's'}`}
            action={
              <div className="hidden sm:flex gap-2">
                <Badge icon={<ChefHat className="h-3 w-3" />} tone={kitchenBacklog > DELAY_THRESHOLDS.backlog ? 'danger' : 'warning'}>{kitchenBacklog} kitchen</Badge>
                <Badge icon={<Wine className="h-3 w-3" />} tone={barBacklog > DELAY_THRESHOLDS.backlog ? 'danger' : 'info'}>{barBacklog} bar</Badge>
              </div>
            }
          />
          {live.isLoading ? <div className="p-5"><LoadingState rows={4} /></div> : active.length === 0 ? (
            <EmptyState compact title="No active orders" description="Orders appear here the moment a waiter sends them." />
          ) : (
            <ul className="divide-y divide-neutral-100 mt-2 max-h-[480px] overflow-y-auto overscroll-contain">
              {active.slice(0, 20).map((o) => {
                const late = delayed.some((d) => d.id === o.id);
                return (
                  <li key={o.id}>
                    <button type="button" onClick={() => navigate(`/admin/orders/${o.id}`)} className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-neutral-50 text-sm transition-colors">
                      <span className="font-semibold w-20 shrink-0 truncate">{o.tableName}</span>
                      <StatusBadge kind="order" status={o.status} size="sm" />
                      <span className="flex-1 min-w-0 text-caption text-neutral-500 truncate">
                        {o.orderNumber} · {o.waiterName} · {fmtTime(o.createdAt)}
                      </span>
                      <span className={cn('tabular-nums text-caption shrink-0', late ? 'text-danger-700 font-semibold' : 'text-neutral-500')}>
                        {mins(o.createdAt)} min
                      </span>
                      <span className="tabular-nums font-medium shrink-0">{money(o.subtotal)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card padded={false}>
          <CardHeader
            className="p-5 pb-0"
            title="Operational alerts"
            subtitle="Thresholds are set per branch"
            action={<Button size="sm" variant="ghost" rightIcon={<ArrowRight className="h-4 w-4" />} onClick={() => navigate('/admin/notifications')}>Settings</Button>}
          />
          {alerts.length === 0 ? (
            <EmptyState compact title="All clear" description="No delays or backlogs right now." />
          ) : (
            <ul className="divide-y divide-neutral-100 mt-2">
              {alerts.map((a, i) => (
                <li key={i}>
                  <button type="button" onClick={() => navigate(a.to)} className="w-full flex items-start gap-2.5 px-5 py-3 text-left text-sm hover:bg-neutral-50 transition-colors">
                    <AlertTriangle className={cn('h-4 w-4 mt-0.5 shrink-0', a.tone === 'danger' ? 'text-danger-600' : 'text-warning-600')} aria-hidden />
                    <span className="min-w-0">{a.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Commercial performance below the operational picture. */}
      <div className="mt-6 space-y-5">
        <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Sales" value={dash.data ? money(dash.data.sales.totalSales) : '…'} icon={<IndianRupee className="h-5 w-5" />} tone="primary" size="lg" hint={dash.data ? `${dash.data.sales.totalOrders} paid bills` : undefined} />
          <StatCard label="Average bill" value={dash.data ? money(dash.data.sales.averageOrderValue) : '…'} tone="neutral" />
          <StatCard label="Discounts" value={dash.data ? money(dash.data.sales.discountTotal) : '…'} tone="neutral" />
          <StatCard label="Cancelled" value={dash.data?.orders.cancelled ?? '…'} tone="danger" hint={dash.data ? `${dash.data.orders.cancelledItems} items` : undefined} />
        </div>
        {dash.isLoading && <LoadingState variant="page" />}
        {dash.data && <><SalesCharts d={dash.data} /><RecentPanels d={dash.data} orderLink={(id) => `/admin/orders/${id}`} /></>}
      </div>
    </div>
  );
}
