import { useNavigate } from 'react-router-dom';
import { AlertTriangle, XCircle, Trash2, TrendingDown, ShoppingCart, ArrowRight, Plus, ClipboardList, CheckCircle2, ChevronRight, PackageCheck } from 'lucide-react';
import { useInventoryDashboard } from '@/features/p2/hooks';
import { useRealtimeInvalidate } from '@/hooks/useRealtime';
import { usePermission } from '@/hooks/useAuth';
import { PageHeader, StatCard, Card, CardHeader, Button, StatusBadge, Badge, KeyValue, Alert, LoadingState, ErrorState, EmptyState } from '@/components/ui';
import { money } from '@/utils/money';
import { fmtRelative } from '@/utils/date';
import { MOVEMENT_LABELS } from '@/config/statuses';
import { cn } from '@/utils/cn';
import type { InventoryItem } from '@/types';

/**
 * The stock controller opens this to answer one question: what has to be ordered or counted
 * today? So the exceptions (out of stock, below reorder) are the page, and the valuation is
 * context underneath them. Every exception row is a direct route into the item.
 */
export default function InventoryDashboardPage() {
  const navigate = useNavigate();
  const q = useInventoryDashboard();
  const canAdjust = usePermission('inventory:adjust');
  const canManage = usePermission('inventory:manage');
  useRealtimeInvalidate(['inventory']);

  /** One exception row — the whole row is the link into the item. */
  const ExceptionRow = ({ i }: { i: InventoryItem }) => {
    const shortBy = Math.max(0, i.minQty - i.currentQty);
    return (
      <li>
        <button
          type="button"
          onClick={() => navigate(`/admin/inventory/items/${i.id}`)}
          className="w-full min-h-touch flex items-center gap-3 px-4 sm:px-5 py-3 text-left hover:bg-neutral-50 focus-visible:bg-neutral-50 transition-colors text-sm"
        >
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-neutral-900 truncate">{i.name}</span>
            <span className="block text-caption text-neutral-500 truncate">
              {i.categoryName}{i.supplierName ? ` · ${i.supplierName}` : ' · no preferred supplier'}
            </span>
          </span>
          <span className="text-right shrink-0 tabular-nums">
            <span className={cn('block font-semibold', i.currentQty <= 0 ? 'text-danger-700' : 'text-warning-700')}>
              {i.currentQty} {i.unitCode}
            </span>
            <span className="block text-caption text-neutral-500">
              {shortBy > 0 ? `short ${Number(shortBy.toFixed(3))} of min ${i.minQty}` : `min ${i.minQty}`}
            </span>
          </span>
          <StatusBadge kind="stock" status={i.stockStatus} size="sm" className="hidden xs:inline-flex shrink-0" />
          <ChevronRight className="h-4 w-4 text-neutral-400 shrink-0" aria-hidden />
        </button>
      </li>
    );
  };

  return (
    <div>
      <PageHeader title="Inventory" subtitle="What needs ordering or counting today" actions={<>
        {canAdjust && <Button variant="outline" leftIcon={<Trash2 className="h-4 w-4" />} onClick={() => navigate('/admin/inventory/movements?new=WASTAGE')}>Record wastage</Button>}
        {canManage && <Button variant="outline" leftIcon={<ShoppingCart className="h-4 w-4" />} onClick={() => navigate('/admin/purchases/new')}>New purchase order</Button>}
        {canManage && <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => navigate('/admin/inventory/items?new=1')}>New item</Button>}
      </>} />
      {q.isLoading && <LoadingState variant="stats" />}
      {q.isError && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      {q.data && (() => {
        const d = q.data;
        const out = d.lowStock.filter((i) => i.stockStatus === 'OUT');
        const low = d.lowStock.filter((i) => i.stockStatus !== 'OUT');
        const wastageMoves = d.recentMovements.filter((m) => m.type === 'WASTAGE' || m.type === 'DAMAGE');
        const clear = d.outOfStockCount === 0 && d.lowStockCount === 0;
        return (
          <div className="space-y-5">
            {/* Headline verdict — the first thing read, in words, before any number. */}
            {clear ? (
              <Alert tone="success" title="Nothing below minimum">
                Every active item is above its minimum level. Stock counts and purchase orders can wait.
              </Alert>
            ) : (
              <Alert
                tone={d.outOfStockCount > 0 ? 'danger' : 'warning'}
                title={
                  d.outOfStockCount > 0
                    ? `${d.outOfStockCount} item${d.outOfStockCount === 1 ? '' : 's'} out of stock${d.lowStockCount ? `, ${d.lowStockCount} below reorder level` : ''}`
                    : `${d.lowStockCount} item${d.lowStockCount === 1 ? '' : 's'} below reorder level`
                }
                action={canManage ? (
                  <Button size="sm" variant="outline" leftIcon={<ShoppingCart className="h-4 w-4" />} onClick={() => navigate('/admin/purchases/new')}>
                    Raise PO
                  </Button>
                ) : undefined}
              >
                Work through the list below — each row opens the item so you can check its history and adjust stock.
              </Alert>
            )}

            {/* Exceptions lead. Valuation is deliberately not a headline tile. */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard
                label="Out of stock" size="lg" value={d.outOfStockCount}
                icon={d.outOfStockCount ? <XCircle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                tone={d.outOfStockCount ? 'danger' : 'success'}
                hint={d.outOfStockCount ? 'Sales of these items are blocked or go negative' : 'Nothing has run out'}
                onClick={() => navigate('/admin/inventory/items?status=OUT')}
              />
              <StatCard
                label="Below reorder level" size="lg" value={d.lowStockCount}
                icon={d.lowStockCount ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                tone={d.lowStockCount ? 'warning' : 'success'}
                hint={d.lowStockCount ? 'Order before the next service' : 'All items above minimum'}
                onClick={() => navigate('/admin/inventory/items?status=LOW')}
              />
              <StatCard
                label="Wastage (30 d)" size="lg" value={money(d.wastage30d)}
                icon={<TrendingDown className="h-5 w-5" />} tone={d.wastage30d > 0 ? 'danger' : 'neutral'}
                hint="Wastage and damage written off in the last 30 days"
                onClick={() => navigate('/admin/inventory/movements')}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr] items-start">
              {/* The worklist. Out-of-stock first, then low, because that is the order to act in. */}
              <Card padded={false}>
                <CardHeader
                  className="p-4 sm:p-5 pb-0"
                  title="Needs ordering or counting"
                  subtitle="Out of stock first, then items below their minimum"
                  action={<Button size="sm" variant="ghost" rightIcon={<ArrowRight className="h-4 w-4" />} onClick={() => navigate('/admin/inventory/items?status=LOW')}>All low stock</Button>}
                />
                {d.lowStock.length === 0 ? (
                  <EmptyState compact icon={<PackageCheck className="h-6 w-6" />} title="All stocked up" description="No item is below its minimum level." />
                ) : (
                  <div className="mt-3">
                    {out.length > 0 && (
                      <>
                        <p className="px-4 sm:px-5 py-2 text-label uppercase text-danger-700 bg-danger-50 border-y border-danger-100 flex items-center gap-1.5">
                          <XCircle className="h-3.5 w-3.5" aria-hidden /> Out of stock · {out.length}
                        </p>
                        <ul className="divide-y divide-neutral-100">{out.slice(0, 6).map((i) => <ExceptionRow key={i.id} i={i} />)}</ul>
                      </>
                    )}
                    {low.length > 0 && (
                      <>
                        <p className="px-4 sm:px-5 py-2 text-label uppercase text-warning-700 bg-warning-50 border-y border-warning-100 flex items-center gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Low or at reorder level · {low.length}
                        </p>
                        <ul className="divide-y divide-neutral-100">{low.slice(0, 8).map((i) => <ExceptionRow key={i.id} i={i} />)}</ul>
                      </>
                    )}
                  </div>
                )}
              </Card>

              <div className="space-y-4">
                {/* Valuation demoted to a reference block. */}
                <Card>
                  <CardHeader
                    title="Stock position"
                    subtitle="Reference figures, not today's to-do list"
                    action={<Button size="sm" variant="ghost" rightIcon={<ArrowRight className="h-4 w-4" />} onClick={() => navigate('/admin/inventory/items')}>Items</Button>}
                  />
                  <KeyValue items={[
                    { label: 'Stock value on hand', value: <strong className="font-semibold">{money(d.stockValue)}</strong> },
                    { label: 'Active items', value: d.itemCount },
                    { label: 'Purchased (30 d)', value: money(d.purchases30d) },
                    { label: 'Consumed (30 d)', value: money(d.consumption30d) },
                    { label: 'Wasted (30 d)', value: <span className={d.wastage30d > 0 ? 'text-danger-700 font-medium' : undefined}>{money(d.wastage30d)}</span> },
                  ]} />
                </Card>

                {wastageMoves.length > 0 && (
                  <Card padded={false}>
                    <CardHeader className="p-4 sm:p-5 pb-0" title="Recent write-offs" subtitle="Wastage and damage from the latest movements" />
                    <ul className="divide-y divide-neutral-100 mt-2">{wastageMoves.slice(0, 4).map((m) => (
                      <li key={m.id} className="flex items-center gap-3 px-4 sm:px-5 py-2.5 text-sm">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{m.itemName}</span>
                          <span className="block text-caption text-neutral-500 truncate">{MOVEMENT_LABELS[m.type]} · {m.reason} · {fmtRelative(m.createdAt)}</span>
                        </span>
                        <span className="tabular-nums font-semibold text-danger-700 shrink-0">{m.qty} {m.unitCode}</span>
                      </li>
                    ))}</ul>
                  </Card>
                )}

                <Card padded={false}>
                  <CardHeader className="p-4 sm:p-5 pb-0" title="Recent movements" subtitle="Newest stock changes across the branch" action={<Button size="sm" variant="ghost" rightIcon={<ArrowRight className="h-4 w-4" />} onClick={() => navigate('/admin/inventory/movements')}>All</Button>} />
                  {d.recentMovements.length === 0 ? <EmptyState compact icon={<ClipboardList className="h-6 w-6" />} title="No movements yet" /> : (
                    <ul className="divide-y divide-neutral-100 mt-2">{d.recentMovements.slice(0, 6).map((m) => (
                      <li key={m.id} className="flex items-center gap-3 px-4 sm:px-5 py-2.5 text-sm">
                        <Badge size="sm" tone={m.qty > 0 ? 'success' : m.type === 'WASTAGE' || m.type === 'DAMAGE' ? 'danger' : 'neutral'} className="shrink-0">{MOVEMENT_LABELS[m.type]}</Badge>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{m.itemName}</span>
                          <span className="block text-caption text-neutral-500 truncate">{m.createdByName ?? 'system'} · {fmtRelative(m.createdAt)}</span>
                        </span>
                        <span className={cn('tabular-nums font-semibold shrink-0', m.qty > 0 ? 'text-success-700' : 'text-danger-700')}>{m.qty > 0 ? '+' : ''}{m.qty} {m.unitCode}</span>
                      </li>
                    ))}</ul>
                  )}
                </Card>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
