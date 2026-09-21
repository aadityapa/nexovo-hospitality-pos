import { useMemo, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, XCircle, Trash2, ShoppingCart, ArrowRight, Plus, ClipboardList, CheckCircle2, ChevronRight, PackageCheck, Package, Boxes, Wallet, RefreshCw, Layers } from 'lucide-react';
import { useInventoryDashboard, useInventoryItems } from '@/features/p2/hooks';
import { DashboardHero } from '@/features/dashboard/DashboardPage';
import { useRealtimeInvalidate } from '@/hooks/useRealtime';
import { usePermission } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useSurface';
import { StatCard, Card, CardHeader, Button, Badge, KeyValue, Alert, LoadingState, ErrorState, EmptyState } from '@/components/ui';
import { StockLevel, ProgressMeter } from '@/components/graphics';
import { staggerDelay } from '@/components/motion';
import { money, round2 } from '@/utils/money';
import { fmtDateTime, fmtRelative, fmtTime, nowIso } from '@/utils/date';
import { MOVEMENT_LABELS } from '@/config/statuses';
import { cn } from '@/utils/cn';
import type { InventoryDashboard, InventoryItem } from '@/types';

/** The `--d` beat of a staged reveal — a function of position, never of the stock level on it. */
const beat = (i: number) => ({ '--d': `${staggerDelay(i)}ms` }) as CSSProperties;

/* ---------------------------------------------------------------------------------------------
 * STOCK HEALTH RING
 *
 * Three arcs on one ring, drawn from the three counts the dashboard endpoint already returns.
 * Nothing here is estimated: the segments are `outOfStockCount`, `lowStockCount` (low + reorder)
 * and whatever is left of `itemCount`, which the engine computes as disjoint sets — so the arcs
 * always close exactly on the total.
 *
 * The ring is decoration over a list that already carries every figure in words, so it is
 * `aria-hidden`; the legend beneath is the accessible version. Colour is `currentColor` off a
 * palette class, so the ring is correct on ivory and on charcoal with no branch and no hex.
 * ------------------------------------------------------------------------------------------- */
interface HealthSegment { key: string; label: string; count: number; stroke: string; dot: string }

function StockHealthRing({ segments, total }: { segments: HealthSegment[]; total: number }) {
  const R = 52;
  const C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="relative h-36 w-36 shrink-0">
      <svg viewBox="0 0 140 140" className="h-full w-full" role="presentation" aria-hidden focusable="false">
        <circle cx="70" cy="70" r={R} fill="none" strokeWidth="14" stroke="currentColor" className="text-neutral-200" />
        {segments.filter((s) => s.count > 0).map((s) => {
          const len = (s.count / total) * C;
          const offset = -acc;
          acc += len;
          return (
            <circle
              key={s.key}
              cx="70" cy="70" r={R} fill="none" strokeWidth="14" strokeLinecap="butt"
              stroke="currentColor" className={s.stroke}
              strokeDasharray={`${len} ${Math.max(0, C - len)}`}
              strokeDashoffset={offset}
              transform="rotate(-90 70 70)"
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden>
        <span className="text-[26px] leading-7 font-semibold text-neutral-900 tabular-nums">{total}</span>
        <span className="text-caption text-neutral-500">items</span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------
 * THE MANAGER BOARD (panel 16)
 *
 * Three lead tiles — what the stock is worth, what is low, what has run out — then the value by
 * category beside the newest movements. It is a separate component rather than a branch inside the
 * page so the extra read below is only ever mounted for the manager workspace: an admin's screen
 * issues exactly the requests it issued before.
 *
 * WHERE THE CATEGORY FIGURES COME FROM. `inventory/dashboard` computes its own `stockValue` as the
 * sum of `listItems(ctx, {})`, and `useInventoryItems({})` is that identical query and key (already
 * cached by the stock-items screen and the bottle-service form). So the split below is a partition
 * of the very figure in the first tile, summed from each item's own `stockValue` — no new endpoint,
 * no new key, no second scope, and nothing modelled.
 * ------------------------------------------------------------------------------------------- */
function ManagerStockBoard({ d, updatedAt, refreshing, onRefresh, onOpen }: {
  d: InventoryDashboard;
  updatedAt: number;
  refreshing: boolean;
  onRefresh: () => void;
  onOpen: (to: string) => void;
}) {
  const items = useInventoryItems({});

  const byCategory = useMemo(() => {
    const m = new Map<string, { name: string; count: number; value: number }>();
    (items.data ?? []).forEach((i) => {
      const row = m.get(i.categoryName) ?? { name: i.categoryName, count: 0, value: 0 };
      row.count += 1;
      row.value += i.stockValue;
      m.set(i.categoryName, row);
    });
    return [...m.values()]
      .map((r) => ({ ...r, value: round2(r.value) }))
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  }, [items.data]);

  /* The bar's scale is the total of the categories it is drawn from, so the bar and the figure
     printed beside it are the same arithmetic. */
  const totalValue = round2(byCategory.reduce((a, r) => a + r.value, 0));

  return (
    <div className="space-y-5">
      {/* The real moment this data was answered, from the query itself — never "just now". */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-caption text-neutral-500 tabular-nums" aria-live="polite">
          {updatedAt ? <>Stock as at <time dateTime={new Date(updatedAt).toISOString()}>{fmtDateTime(new Date(updatedAt).toISOString())}</time></> : 'Waiting for the first reading'}
        </p>
        <Button size="sm" variant="outline" loading={refreshing} leftIcon={<RefreshCw className="h-4 w-4" />} onClick={onRefresh}>Refresh</Button>
      </div>

      <div className="grid grid-cols-1 xs:grid-cols-2 xl:grid-cols-3 gap-4">
        <StatCard
          label="Total stock value" value={money(d.stockValue)}
          icon={<Wallet className="h-5 w-5" />} tone="primary"
          hint={`Across ${d.itemCount} active item${d.itemCount === 1 ? '' : 's'}`}
          onClick={() => onOpen('/admin/inventory/items')}
          className="anim-reveal" style={beat(0)}
        />
        <StatCard
          label="Low stock" value={d.lowStockCount}
          icon={d.lowStockCount ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
          tone={d.lowStockCount ? 'warning' : 'success'}
          hint={d.lowStockCount ? 'Below minimum or at reorder level' : 'All items above minimum'}
          onClick={() => onOpen('/admin/inventory/items?status=LOW')}
          className="anim-reveal" style={beat(1)}
        />
        <StatCard
          label="Out of stock" value={d.outOfStockCount}
          icon={d.outOfStockCount ? <XCircle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
          tone={d.outOfStockCount ? 'danger' : 'success'}
          hint={d.outOfStockCount ? 'Sales of these items are blocked or go negative' : 'Nothing has run out'}
          onClick={() => onOpen('/admin/inventory/items?status=OUT')}
          className={cn('anim-reveal', d.outOfStockCount > 0 && 'fill-danger')}
          style={beat(2)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start">
        <Card padded={false} className="anim-reveal" style={beat(3)}>
          <CardHeader
            className="p-4 sm:p-5 pb-0"
            title="Stock by category"
            subtitle="Items held and what they are worth, highest value first"
            action={<Button size="sm" variant="ghost" rightIcon={<ArrowRight className="h-4 w-4" />} onClick={() => onOpen('/admin/inventory/items')}>Items</Button>}
          />
          {items.isLoading ? <div className="p-4 sm:p-5"><LoadingState rows={4} /></div>
            : items.isError ? <ErrorState compact error={items.error} onRetry={() => void items.refetch()} />
              : byCategory.length === 0 ? <EmptyState compact icon={<Layers className="h-6 w-6" />} title="No stock items yet" description="Create an ingredient, beverage or bottle to start tracking stock." />
                : (
                  <ul className="divide-y divide-neutral-200 mt-3 border-t border-neutral-200">
                    {byCategory.map((r) => (
                      <li key={r.name} className="px-4 sm:px-5 py-3 text-sm min-w-0">
                        <div className="flex items-baseline justify-between gap-3 min-w-0">
                          <span className="min-w-0 truncate font-medium text-neutral-900">{r.name}</span>
                          <span className="shrink-0 tabular-nums font-semibold text-neutral-900">{money(r.value)}</span>
                        </div>
                        <ProgressMeter
                          className="mt-1.5"
                          size="sm"
                          hideText
                          static
                          value={r.value}
                          max={totalValue || 1}
                          tone="primary"
                          label={`${r.name} share of stock value`}
                          valueText={`${money(r.value)} of ${money(totalValue)} held in stock`}
                        />
                        <p className="text-caption text-neutral-500 tabular-nums mt-1">{r.count} item{r.count === 1 ? '' : 's'}</p>
                      </li>
                    ))}
                  </ul>
                )}
        </Card>

        <Card padded={false} className="anim-reveal" style={beat(4)}>
          <CardHeader
            className="p-4 sm:p-5 pb-0"
            title="Recent movements"
            subtitle="Newest stock changes across the branch"
            action={<Button size="sm" variant="ghost" rightIcon={<ArrowRight className="h-4 w-4" />} onClick={() => onOpen('/admin/inventory/movements')}>All</Button>}
          />
          {d.recentMovements.length === 0 ? <EmptyState compact icon={<ClipboardList className="h-6 w-6" />} title="No movements yet" /> : (
            <ul className="divide-y divide-neutral-200 mt-3 border-t border-neutral-200">
              {d.recentMovements.slice(0, 8).map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-4 sm:px-5 py-3 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-neutral-900">{m.itemName}</span>
                    {/* Time and actor, both as the record holds them. */}
                    <span className="block text-caption text-neutral-500 truncate tabular-nums">
                      {fmtTime(m.createdAt)} · {fmtRelative(m.createdAt)} · {m.createdByName ?? 'system'}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className={cn('block tabular-nums font-semibold', m.qty > 0 ? 'text-success-700' : 'text-danger-700')}>{m.qty > 0 ? '+' : ''}{m.qty} {m.unitCode}</span>
                    <span className="block text-caption text-neutral-500">{MOVEMENT_LABELS[m.type]}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

/**
 * The stock controller opens this to answer one question: what has to be ordered or counted
 * today? So the exceptions (out of stock, below reorder) are the page, and the valuation is
 * context underneath them. Every alert row is a direct route into the item.
 *
 * MOTION. The verdict banner is deliberately STATIC. It is the first thing read on the page and it
 * changes with the data; an entrance on it would replay every time the realtime invalidate landed
 * and would delay the one sentence that tells a controller whether to act at all. Below it the
 * four tiles sweep, then the health ring and the alert list. No alert row animates — a controller
 * works down that list, and a list that re-animates under them has cost them their place in it.
 */
export default function InventoryDashboardPage() {
  const ws = useWorkspace();
  const navigate = useNavigate();
  const q = useInventoryDashboard();
  const canAdjust = usePermission('inventory:adjust');
  const canManage = usePermission('inventory:manage');
  useRealtimeInvalidate(['inventory']);
  /*
   * Stock is not measured over a period — every exception on this page is what the shelf looks
   * like at the moment it was asked. So the band's period is that moment: one instant, which the
   * band prints as today's date. (The two rolling 30-day figures name their own window on the
   * card that carries them.)
   */
  const snapshot = useMemo(() => { const at = nowIso(); return { from: at, to: at }; }, []);

  /** One alert row — the whole row is the link into the item. */
  const AlertRow = ({ i }: { i: InventoryItem }) => {
    const out = i.stockStatus === 'OUT';
    const shortBy = Math.max(0, i.minQty - i.currentQty);
    return (
      <li>
        <button
          type="button"
          onClick={() => navigate(`/admin/inventory/items/${i.id}`)}
          className="w-full min-h-touch flex items-center gap-3 px-4 sm:px-5 py-3 text-left hover:bg-neutral-100 focus-visible:bg-neutral-100 transition-colors duration-control text-sm"
        >
          {/* Severity as an icon AND as the words in the line beneath — never colour alone. */}
          <span
            className={cn('h-8 w-8 rounded-md shrink-0 inline-flex items-center justify-center ring-1 ring-inset',
              out ? 'bg-danger-50 text-danger-700 ring-danger-200' : 'bg-warning-50 text-warning-700 ring-warning-200')}
            aria-hidden
          >
            {out ? <XCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-neutral-900 truncate">{i.name}</span>
            <span className="block text-caption text-neutral-500 truncate">
              {out ? 'Out of stock' : shortBy > 0 ? `Short ${Number(shortBy.toFixed(3))} ${i.unitCode} of minimum ${i.minQty}` : `At reorder level ${i.reorderLevel} ${i.unitCode}`}
              {' · last moved '}{fmtRelative(i.lastMovementAt)}
            </span>
          </span>
          {/* The gauge shows how far below the minimum and reorder marks the item has fallen; the
              same quantity and shortfall are already spelled out in the line above it. */}
          <StockLevel
            currentQty={i.currentQty} minQty={i.minQty} reorderLevel={i.reorderLevel} maxQty={i.maxQty}
            unitCode={i.unitCode} status={i.stockStatus}
            note={shortBy > 0 ? `short ${Number(shortBy.toFixed(3))} of min ${i.minQty}` : `min ${i.minQty}`}
            className="w-[7.5rem] shrink-0 text-right hidden xs:block"
          />
          <ChevronRight className="h-4 w-4 text-neutral-400 shrink-0" aria-hidden />
        </button>
      </li>
    );
  };

  return (
    <div>
      {/* The same band as the dashboards: venue and branch identity, the page, and the day this
          worklist is for. The verdict and the exceptions still lead the page below it. */}
      <DashboardHero
        title="Inventory"
        subtitle="What needs ordering or counting today — stock on hand as it stands now"
        range={snapshot}
        actions={<>
          {canAdjust && <Button variant="outline" leftIcon={<Trash2 className="h-4 w-4" />} onClick={() => navigate('/admin/inventory/movements?new=WASTAGE')}>Record wastage</Button>}
          {canManage && <Button variant="outline" leftIcon={<ShoppingCart className="h-4 w-4" />} onClick={() => navigate('/admin/purchases/new')}>New purchase order</Button>}
          {canManage && <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => navigate('/admin/inventory/items?new=1')}>New item</Button>}
        </>}
      />
      {q.isLoading && <LoadingState variant="stats" />}
      {q.isError && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      {q.data && ws === 'manager' && (
        <ManagerStockBoard
          d={q.data}
          updatedAt={q.dataUpdatedAt}
          refreshing={q.isFetching}
          onRefresh={() => void q.refetch()}
          onOpen={(to) => navigate(to)}
        />
      )}
      {q.data && ws !== 'manager' && (() => {
        const d = q.data;
        const wastageMoves = d.recentMovements.filter((m) => m.type === 'WASTAGE' || m.type === 'DAMAGE');
        const clear = d.outOfStockCount === 0 && d.lowStockCount === 0;
        /* Disjoint by construction in the engine: OUT, then LOW+REORDER, then everything else. */
        const healthy = Math.max(0, d.itemCount - d.lowStockCount - d.outOfStockCount);
        const segments: HealthSegment[] = [
          { key: 'ok', label: 'Healthy stock', count: healthy, stroke: 'text-success-500', dot: 'bg-success-500' },
          { key: 'low', label: 'Low or at reorder level', count: d.lowStockCount, stroke: 'text-warning-500', dot: 'bg-warning-500' },
          { key: 'out', label: 'Out of stock', count: d.outOfStockCount, stroke: 'text-danger-500', dot: 'bg-danger-500' },
        ];
        const share = (n: number) => (d.itemCount > 0 ? (n * 100) / d.itemCount : 0);
        /* Out of stock first, then everything else in the order the engine ranked it (furthest
           below its minimum first). A stable sort, so that ranking survives inside each group. */
        const alerts = [...d.lowStock].sort((a, b) => Number(b.stockStatus === 'OUT') - Number(a.stockStatus === 'OUT'));
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

            {/* Four counts, in the order a controller reads them: how much there is, then the
                three ways it can be wrong. Base `grid-cols-1` declared. */}
            <div className="grid grid-cols-1 xs:grid-cols-2 xl:grid-cols-4 gap-4">
              <StatCard
                label="Total items" value={d.itemCount}
                icon={<Boxes className="h-5 w-5" />} tone="neutral"
                hint="Active stock items in this branch"
                onClick={() => navigate('/admin/inventory/items')}
                className="anim-reveal" style={beat(0)}
              />
              <StatCard
                label="Low stock" value={d.lowStockCount}
                icon={d.lowStockCount ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                tone={d.lowStockCount ? 'warning' : 'success'}
                hint={d.lowStockCount ? 'Below minimum or at reorder level' : 'All items above minimum'}
                onClick={() => navigate('/admin/inventory/items?status=LOW')}
                className="anim-reveal" style={beat(1)}
              />
              <StatCard
                label="Out of stock" value={d.outOfStockCount}
                icon={d.outOfStockCount ? <XCircle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                tone={d.outOfStockCount ? 'danger' : 'success'}
                hint={d.outOfStockCount ? 'Sales of these items are blocked or go negative' : 'Nothing has run out'}
                onClick={() => navigate('/admin/inventory/items?status=OUT')}
                className={cn('anim-reveal', d.outOfStockCount > 0 && 'fill-danger')}
                style={beat(2)}
              />
              <StatCard
                label="Healthy stock" value={healthy}
                icon={<PackageCheck className="h-5 w-5" />} tone="success"
                hint="Above both the minimum and the reorder level"
                onClick={() => navigate('/admin/inventory/items?status=OK')}
                className={cn('anim-reveal', clear && 'fill-success')}
                style={beat(3)}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] items-start">
              {/* Stock health — the same three counts as a share of the whole shelf. */}
              <Card className="anim-reveal" style={beat(4)}>
                <CardHeader title="Stock health" subtitle="Share of active items, counted now" />
                {d.itemCount === 0 ? (
                  <EmptyState compact icon={<Package className="h-6 w-6" />} title="No stock items yet" description="Create an ingredient, beverage or bottle to start tracking stock." />
                ) : (
                  <div className="flex flex-col sm:flex-row items-center gap-5">
                    <StockHealthRing segments={segments} total={d.itemCount} />
                    {/* The legend is the accessible version of the ring: every segment named,
                        counted and given its share in text. */}
                    <ul className="min-w-0 w-full space-y-2.5">
                      {segments.map((s) => (
                        <li key={s.key} className="flex items-center gap-2.5 text-sm min-w-0">
                          <span className={cn('h-2.5 w-2.5 rounded-full shrink-0', s.dot)} aria-hidden />
                          <span className="min-w-0 flex-1 text-neutral-700">{s.label}</span>
                          <span className="tabular-nums font-semibold text-neutral-900 shrink-0">{s.count}</span>
                          <span className="tabular-nums text-neutral-500 shrink-0 w-12 text-right">{share(s.count).toFixed(1)}%</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>

              {/* Recent alerts. Out of stock first, then low — that is the order to act in, and it
                  is the order the engine already returns them in. */}
              <Card padded={false} className="anim-reveal" style={beat(5)}>
                <CardHeader
                  className="p-4 sm:p-5 pb-0"
                  title="Recent alerts"
                  subtitle="Out of stock first, then items below their minimum"
                  action={<Button size="sm" variant="ghost" rightIcon={<ArrowRight className="h-4 w-4" />} onClick={() => navigate('/admin/inventory/items?status=LOW')}>All low stock</Button>}
                />
                {alerts.length === 0 ? (
                  <EmptyState compact icon={<PackageCheck className="h-6 w-6" />} title="All stocked up" description="No item is below its minimum level." />
                ) : (
                  <ul className="divide-y divide-neutral-200 mt-3 border-t border-neutral-200">
                    {alerts.slice(0, 8).map((i) => <AlertRow key={i.id} i={i} />)}
                  </ul>
                )}
              </Card>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start">
              {/* Valuation is a reference block, not a headline: money on a shelf is neither good
                  news nor bad, so it takes no wash. */}
              <Card className="anim-reveal" style={beat(6)}>
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

              <div className="space-y-4 min-w-0">
                {wastageMoves.length > 0 && (
                  <Card padded={false} className="anim-reveal" style={beat(7)}>
                    <CardHeader className="p-4 sm:p-5 pb-0" title="Recent write-offs" subtitle="Wastage and damage from the latest movements" />
                    <ul className="divide-y divide-neutral-200 mt-2">{wastageMoves.slice(0, 4).map((m) => (
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

                <Card padded={false} className="anim-reveal" style={beat(8)}>
                  <CardHeader className="p-4 sm:p-5 pb-0" title="Recent movements" subtitle="Newest stock changes across the branch" action={<Button size="sm" variant="ghost" rightIcon={<ArrowRight className="h-4 w-4" />} onClick={() => navigate('/admin/inventory/movements')}>All</Button>} />
                  {d.recentMovements.length === 0 ? <EmptyState compact icon={<ClipboardList className="h-6 w-6" />} title="No movements yet" /> : (
                    <ul className="divide-y divide-neutral-200 mt-2">{d.recentMovements.slice(0, 6).map((m) => (
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
