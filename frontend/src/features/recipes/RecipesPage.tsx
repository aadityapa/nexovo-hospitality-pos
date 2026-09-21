import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { useRecipeCosting } from '@/features/p2/hooks';
import { useDebounce } from '@/hooks/useRealtime';
import { PageHeader, DataTable, SearchInput, SegmentedControl, Badge, StatCard, Alert, Button, LoadingState, ErrorState, ItemImage, type Column } from '@/components/ui';
import { HeaderSearch } from '@/components/layout/Shell';
import { money } from '@/utils/money';
import { cn } from '@/utils/cn';
import type { RecipeCostRow } from '@/types';

/* The one threshold this screen judges against — the same pair of numbers the tiles, the filter
   and the badge all use. Nothing here invents a target: 30 / 40 % is what the page already
   reported before it was re-composed, and it is stated in words beside every badge. */
const fcTone = (pct: number) => (pct === 0 ? 'neutral' : pct <= 30 ? 'success' : pct <= 40 ? 'warning' : 'danger');
/** The band in words, so the decision never depends on the badge colour. */
const fcBand = (pct: number) => (pct === 0 ? 'no cost yet' : pct <= 30 ? 'on target' : pct <= 40 ? 'watch' : 'over target');

/**
 * Margin as a percentage of the selling price — the same two fetched figures the gross margin is
 * made of, expressed the way a price decision is taken. Nothing is modelled or assumed: a row with
 * no price has no percentage and prints a dash.
 */
const marginPct = (r: RecipeCostRow) => (r.sellingPrice > 0 ? (r.grossMargin * 100) / r.sellingPrice : null);

export default function RecipesPage() {
  const navigate = useNavigate();
  const q = useRecipeCosting();
  const [search, setSearch] = useState('');
  const dq = useDebounce(search, 200).toLowerCase();
  const [filter, setFilter] = useState<'ALL' | 'WITH' | 'WITHOUT' | 'HIGH'>('ALL');
  const rows = useMemo(() => (q.data ?? []).filter((r) => !dq || r.menuItemName.toLowerCase().includes(dq) || r.categoryName.toLowerCase().includes(dq)).filter((r) => filter === 'ALL' || (filter === 'WITH' ? r.ingredientCount > 0 : filter === 'WITHOUT' ? r.ingredientCount === 0 : r.foodCostPercent > 40)), [q.data, dq, filter]);
  const all = q.data ?? [];
  const withRecipe = all.filter((r) => r.ingredientCount > 0);
  const without = all.filter((r) => r.ingredientCount === 0);
  const overTarget = withRecipe.filter((r) => r.foodCostPercent > 40);
  const avgFc = withRecipe.length ? Math.round((withRecipe.reduce((a, r) => a + r.foodCostPercent, 0) / withRecipe.length) * 10) / 10 : 0;

  const columns: Column<RecipeCostRow>[] = [
    {
      key: 'item', header: 'Dish', sortValue: (r) => r.menuItemName, className: 'max-w-[20rem]',
      render: (r) => (
        <span className="flex items-center gap-3 min-w-0">
          {/* The dish's own drawing, typed by its station and category — the same picture it
              carries on the menu grid and on the bill. */}
          <ItemImage src={null} alt={r.menuItemName} prepLocation={r.prepLocation} category={r.categoryName} className="h-9 w-9 shrink-0" />
          <span className="min-w-0">
            <span className="block font-medium text-neutral-900 truncate">{r.menuItemName}</span>
            <span className="block text-caption text-neutral-500 truncate">{r.prepLocation === 'BAR' ? 'Bar' : 'Kitchen'}</span>
          </span>
        </span>
      ),
    },
    { key: 'category', header: 'Category', sortValue: (r) => r.categoryName, hideBelow: 'md', render: (r) => <span className="text-neutral-600">{r.categoryName}</span> },
    { key: 'cost', header: 'Total cost', align: 'right', sortValue: (r) => r.recipeCost, render: (r) => <span className="tabular-nums">{r.ingredientCount === 0 ? '—' : money(r.recipeCost, { decimals: true })}</span> },
    { key: 'price', header: 'Selling price', align: 'right', sortValue: (r) => r.sellingPrice, render: (r) => <span className="tabular-nums">{money(r.sellingPrice)}</span> },
    {
      // Food cost is the decision number, so it leads the two percentages.
      key: 'fc', header: 'Food cost %', align: 'right', sortValue: (r) => (r.ingredientCount === 0 ? -1 : r.foodCostPercent),
      render: (r) => (r.ingredientCount === 0
        ? <span className="text-neutral-400">—</span>
        : <span className="tabular-nums font-semibold text-neutral-900">{r.foodCostPercent}%</span>),
    },
    {
      key: 'margin', header: 'Margin %', align: 'right', hideBelow: 'md',
      sortValue: (r) => (r.ingredientCount === 0 ? -1 : (marginPct(r) ?? -1)),
      render: (r) => {
        const pct = r.ingredientCount === 0 ? null : marginPct(r);
        if (pct == null) return <span className="text-neutral-400">—</span>;
        return (
          <span className="block">
            <span className={cn('block tabular-nums font-semibold', r.grossMargin <= 0 ? 'text-danger-700' : 'text-neutral-900')}>{pct.toFixed(1)}%</span>
            <span className="block text-caption text-neutral-500 tabular-nums">{money(r.grossMargin)}</span>
          </span>
        );
      },
    },
    {
      key: 'band', header: 'Profitability', align: 'right', sortValue: (r) => (r.ingredientCount === 0 ? -1 : r.foodCostPercent),
      render: (r) => (r.ingredientCount === 0
        ? <Badge tone="warning" size="sm" icon={<AlertTriangle className="h-3.5 w-3.5" aria-hidden />}>No recipe</Badge>
        : <Badge tone={fcTone(r.foodCostPercent)} size="sm">{fcBand(r.foodCostPercent)}</Badge>),
    },
  ];

  return (
    <div>
      {/* The screen's own search, hoisted into the application header — same input, same state. */}
      <HeaderSearch>
        <SearchInput value={search} onChange={setSearch} placeholder="Search recipes…" className="w-full max-w-sm" />
      </HeaderSearch>

      <PageHeader title="Recipes & costing" subtitle="Food cost % and margin per portion — the two numbers that decide a price change">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <StatCard label="Average food cost" size="lg" value={`${avgFc}%`} tone={avgFc > 40 ? 'danger' : avgFc > 30 ? 'warning' : 'success'} hint={`Across ${withRecipe.length} costed item${withRecipe.length === 1 ? '' : 's'} · target ≤ 30 %`} />
          <StatCard label="Above 40 %" size="lg" value={overTarget.length} icon={<AlertTriangle className="h-5 w-5" />} tone={overTarget.length ? 'danger' : 'success'} hint={overTarget.length ? 'Re-price or re-spec these' : 'Every costed item is within target'} onClick={() => setFilter('HIGH')} />
          <StatCard label="Missing a recipe" size="lg" value={without.length} tone={without.length ? 'warning' : 'success'} hint={without.length ? 'No stock is deducted when these sell' : 'Every menu item is costed'} onClick={() => setFilter('WITHOUT')} />
        </div>
        {without.length > 0 && (
          <Alert
            tone="warning" className="mb-4"
            title={`${without.length} menu item${without.length === 1 ? ' has' : 's have'} no recipe`}
            action={<Button size="sm" variant="outline" rightIcon={<ArrowRight className="h-4 w-4" />} onClick={() => setFilter('WITHOUT')}>Show them</Button>}
          >
            Selling them deducts no stock and leaves them out of food-cost analysis.
          </Alert>
        )}
        <SegmentedControl
          ariaLabel="Filter recipes" size="sm" value={filter} onChange={setFilter}
          options={[
            { value: 'ALL', label: 'All', count: all.length },
            { value: 'WITH', label: 'With recipe', count: withRecipe.length },
            { value: 'WITHOUT', label: 'Missing recipe', count: without.length },
            { value: 'HIGH', label: 'Over 40 %', count: overTarget.length },
          ]}
        />
      </PageHeader>
      {q.isLoading && <LoadingState variant="table" rows={8} />}
      {q.isError && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      {q.data && (
        <DataTable
          columns={columns} rows={rows} rowKey={(r) => r.menuItemId} pageSize={30}
          initialSort={{ key: 'fc', dir: 'desc' }}
          caption="Menu items with recipe cost, selling price, food cost percentage, margin percentage and a profitability band"
          onRowClick={(r) => navigate(`/admin/recipes/${r.menuItemId}`)}
          toolbar={<p className="px-1 text-sm text-neutral-600"><span className="font-semibold text-neutral-900 tabular-nums">{rows.length}</span> menu item{rows.length === 1 ? '' : 's'} · highest food cost first</p>}
          emptyTitle={filter === 'ALL' && !dq ? 'No menu items' : 'Nothing matches this filter'}
          emptyDescription={filter === 'ALL' && !dq ? undefined : 'Clear the search or choose a different filter.'}
          emptyAction={filter !== 'ALL' || dq ? <Button variant="outline" onClick={() => { setFilter('ALL'); setSearch(''); }}>Clear filters</Button> : undefined}
          mobileCard={(r) => {
            const pct = r.ingredientCount === 0 ? null : marginPct(r);
            return (
              <div className="space-y-2">
                <div className="flex items-start gap-3">
                  <ItemImage src={null} alt={r.menuItemName} prepLocation={r.prepLocation} category={r.categoryName} className="h-10 w-10 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-neutral-900 truncate">{r.menuItemName}</p>
                    <p className="text-caption text-neutral-500 truncate">{r.categoryName}</p>
                  </div>
                  {r.ingredientCount === 0
                    ? <Badge tone="warning" size="sm" icon={<AlertTriangle className="h-3.5 w-3.5" aria-hidden />}>No recipe</Badge>
                    : <Badge tone={fcTone(r.foodCostPercent)} size="sm">{r.foodCostPercent}% {fcBand(r.foodCostPercent)}</Badge>}
                </div>
                <p className="text-caption text-neutral-600 tabular-nums">
                  Cost {r.ingredientCount === 0 ? '—' : money(r.recipeCost, { decimals: true })} · price {money(r.sellingPrice)} · margin <span className="font-semibold">{money(r.grossMargin)}</span>{pct != null ? ` (${pct.toFixed(1)}%)` : ''}
                </p>
              </div>
            );
          }}
        />
      )}
    </div>
  );
}
