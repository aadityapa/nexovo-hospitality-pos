import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2, Save, ChefHat, Wine, ChevronLeft, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useRecipe, useRecipeMutations, useInventoryItems, useInventoryUnits } from '@/features/p2/hooks';
import { usePermission } from '@/hooks/useAuth';
import { Button, Card, CardHeader, CardDivider, Input, IconButton, ItemImage, Switch, SegmentedControl, LoadingState, ErrorState, EmptyState, Badge, KeyValue, InlineError } from '@/components/ui';
import { money } from '@/utils/money';
import { ApiError } from '@/services/api/client';
import { cn } from '@/utils/cn';
import type { RecipeIngredient, ID } from '@/types';

interface Line { invItemId: ID | ''; qty: string; unitId: ID | ''; wastagePct: string }
type Tone = 'neutral' | 'success' | 'warning' | 'danger';
type Tab = 'ingredients' | 'settings';

/** The verdict band under the cost breakdown. Colour AND words, never colour alone. */
const VERDICT: Record<Tone, string> = {
  neutral: 'border-neutral-200 bg-neutral-50 text-neutral-700',
  success: 'border-success-200 bg-success-50 text-success-700',
  warning: 'border-warning-200 bg-warning-50 text-warning-700',
  danger: 'border-danger-200 bg-danger-50 text-danger-700',
};

/** A fact about the dish, drawn only from a field the recipe record actually holds. */
function MetaChip({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 text-caption text-neutral-600">{children}</span>;
}

export default function RecipeEditorPage() {
  const { menuItemId } = useParams();
  const id = Number(menuItemId);
  const navigate = useNavigate();
  const q = useRecipe(id);
  const items = useInventoryItems({});
  const units = useInventoryUnits();
  const { save, remove } = useRecipeMutations();
  const canManage = usePermission('recipes:manage');
  const [lines, setLines] = useState<Line[]>([]);
  const [yieldQty, setYieldQty] = useState('1');
  const [label, setLabel] = useState('Standard');
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<Tab>('ingredients');
  useEffect(() => {
    if (!q.data) return;
    setLines(q.data.ingredients.map((g: RecipeIngredient) => ({ invItemId: g.invItemId, qty: String(g.qty), unitId: g.unitId, wastagePct: String(g.wastagePct ?? 0) })));
    setYieldQty(String(q.data.yieldQty)); setLabel(q.data.portionLabel); setActive(q.data.isActive); setDirty(false);
  }, [q.data?.recipeId, q.data?.menuItemId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (q.isLoading) return <LoadingState variant="page" />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const r = q.data;
  const unitFor = (invItemId: ID | '') => items.data?.find((i) => i.id === invItemId);
  const compatibleUnits = (invItemId: ID | '') => {
    const inv = unitFor(invItemId); if (!inv || !units.data) return units.data ?? [];
    const base = units.data.find((u) => u.id === inv.unitId)?.baseUnit;
    return units.data.filter((u) => u.baseUnit === base || (inv.packSize && (u.baseUnit === 'ML' || u.baseUnit === 'G')));
  };
  // live cost preview (same maths as the backend, using avg cost + unit factors)
  const lineCost = (l: Line) => {
    const inv = unitFor(l.invItemId); const from = units.data?.find((u) => u.id === l.unitId); const to = units.data?.find((u) => u.id === inv?.unitId);
    if (!inv || !from || !to) return 0;
    const qty = Number(l.qty) * (1 + Number(l.wastagePct || 0) / 100);
    let stockQty: number;
    if (from.baseUnit === to.baseUnit) stockQty = (qty * from.factorToBase) / to.factorToBase;
    else if (inv.packSize && to.baseUnit === 'PIECE') stockQty = (qty * from.factorToBase) / inv.packSize / to.factorToBase;
    else return 0;
    return stockQty * inv.avgCost;
  };
  const runTotal = lines.reduce((a, l) => a + lineCost(l), 0);
  const portions = Number(yieldQty) || 1;
  const total = runTotal / portions;
  const fc = r.sellingPrice > 0 ? Math.round((total * 1000) / r.sellingPrice) / 10 : 0;
  const fcTone: Tone = fc === 0 ? 'neutral' : fc <= 30 ? 'success' : fc <= 40 ? 'warning' : 'danger';
  const fcBand = fc === 0 ? 'not costed yet' : fc <= 30 ? 'on target' : fc <= 40 ? 'watch' : 'over target';
  const margin = r.sellingPrice - total;
  const incomplete = lines.filter((l) => !l.invItemId || !l.unitId || !Number(l.qty)).length;

  const update = (i: number, patch: Partial<Line>) => { setDirty(true); setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l))); };
  const addLine = () => { setDirty(true); setLines((ls) => [...ls, { invItemId: '', qty: '', unitId: '', wastagePct: '0' }]); };
  const removeLine = (i: number) => { setDirty(true); setLines((ls) => ls.filter((_, idx) => idx !== i)); };
  const onSave = async () => {
    setError(null);
    try {
      await save.mutateAsync({ menuItemId: id, body: { portionLabel: label, yieldQty: Number(yieldQty) || 1, isActive: active, ingredients: lines.filter((l) => l.invItemId && l.unitId).map((l) => ({ invItemId: Number(l.invItemId), qty: Number(l.qty), unitId: Number(l.unitId), wastagePct: Number(l.wastagePct || 0) })) } });
      setDirty(false);
    } catch (e) { setError(ApiError.from(e).message); }
  };

  const cellInput = 'input-base min-h-[40px]';

  return (
    <div>
      <Link to="/admin/recipes" className="inline-flex items-center gap-1 -ml-1 mb-3 text-sm text-neutral-500 hover:text-neutral-900 transition-colors duration-fast">
        <ChevronLeft className="h-4 w-4" aria-hidden />Recipes &amp; costing
      </Link>

      {/*
       * IDENTITY. The dish leads with its picture — an original drawing keyed off the item's own
       * name and station, so the same dish is the same picture everywhere it appears. Every chip
       * beside it is a field the recipe record actually holds: nothing here is a guess about the
       * dish's cuisine, its prep time or whether it is vegetarian, because the product stores none
       * of those.
       */}
      <Card className="mb-4">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <ItemImage alt={r.menuItemName} prepLocation={r.prepLocation} className="h-24 w-24 shrink-0" rounded="rounded-md" />
          <div className="min-w-0 flex-1">
            <h1 className="text-heading sm:text-display text-neutral-900 font-semibold tracking-[-0.02em] leading-tight break-words">{r.menuItemName}</h1>
            <p className="text-[13px] text-neutral-500 mt-1 leading-snug">
              Costed from stock at average cost · sells for {money(r.sellingPrice)} · {lines.length} ingredient{lines.length === 1 ? '' : 's'}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-3">
              <MetaChip>{r.prepLocation === 'BAR' ? <Wine className="h-3.5 w-3.5 text-info-700" aria-hidden /> : <ChefHat className="h-3.5 w-3.5 text-warning-700" aria-hidden />}{r.prepLocation === 'BAR' ? 'Bar' : 'Kitchen'}</MetaChip>
              <MetaChip>{label || 'Portion'}</MetaChip>
              <MetaChip>Yield {portions} per run</MetaChip>
              <MetaChip>Variant {r.variantCode}</MetaChip>
              <MetaChip>{active ? 'Active' : 'Inactive'}</MetaChip>
            </div>
          </div>
          {canManage && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {dirty && <Badge tone="warning" size="sm">Unsaved changes</Badge>}
              <Button variant="ghost" className="text-danger-700" disabled={!r.recipeId} loading={remove.isPending} onClick={() => remove.mutate(id)}>Deactivate</Button>
              <Button leftIcon={<Save className="h-4 w-4" />} loading={save.isPending} onClick={() => void onSave()}>Save recipe</Button>
            </div>
          )}
        </div>
      </Card>

      {/* Editing surface left, costing panel right — the panel is sticky so the food cost
          never scrolls out of view while ingredients are being changed. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-start">
        <div className="min-w-0 space-y-4">
          <SegmentedControl<Tab>
            size="sm"
            ariaLabel="Recipe sections"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'ingredients', label: 'Ingredients', count: lines.length },
              { value: 'settings', label: 'Recipe settings' },
            ]}
          />

          {tab === 'ingredients' && (
            <Card padded={false}>
              <CardHeader className="p-5 pb-0" title="Ingredients" subtitle="Quantity per recipe run; stock is deducted in the item's stock unit" action={canManage && <Button size="sm" variant="outline" leftIcon={<Plus className="h-4 w-4" />} onClick={addLine}>Add ingredient</Button>} />
              {lines.length === 0 ? <EmptyState compact title="No ingredients yet" description="Add the ingredients that make one portion — until then this item deducts no stock." action={canManage && <Button variant="outline" onClick={addLine}>Add ingredient</Button>} /> : (
                <div className="table-scroll mt-3">
                  <table className="w-full text-sm min-w-[52rem]">
                    <caption className="sr-only">Recipe ingredients with quantity, unit, unit cost, wastage allowance and cost per portion</caption>
                    <thead className="bg-neutral-50 text-label uppercase text-neutral-600">
                      <tr>
                        <th scope="col" className="text-left px-4 py-2.5">Ingredient</th>
                        <th scope="col" className="text-right px-2 py-2.5 w-24">Quantity</th>
                        <th scope="col" className="text-left px-2 py-2.5 w-28">Unit</th>
                        <th scope="col" className="text-right px-2 py-2.5 w-32">Unit cost</th>
                        <th scope="col" className="text-right px-2 py-2.5 w-24">Wastage %</th>
                        <th scope="col" className="text-right px-4 py-2.5 w-32">Cost per portion</th>
                        <th className="w-12"><span className="sr-only">Remove</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200">
                      {lines.map((l, i) => { const inv = unitFor(l.invItemId); return (
                        <tr key={i} className={cn(!l.invItemId && 'bg-warning-50/40')}>
                          <td className="px-4 py-2.5 align-top">
                            <select aria-label={`Ingredient ${i + 1}`} className={cellInput} value={l.invItemId} disabled={!canManage} onChange={(e) => { const v = e.target.value ? Number(e.target.value) : ''; const invx = unitFor(v); update(i, { invItemId: v, unitId: invx ? invx.unitId : '' }); }}>
                              <option value="">Select…</option>
                              {(items.data ?? []).map((it) => <option key={it.id} value={it.id}>{it.name} ({it.unitCode})</option>)}
                            </select>
                            {inv
                              ? <span className="block text-caption text-neutral-500 mt-1">in stock {inv.currentQty} {inv.unitCode}</span>
                              : <span className="block text-caption text-warning-700 mt-1">Pick an item — this line is not costed</span>}
                          </td>
                          <td className="px-2 py-2.5 align-top"><input aria-label={`Quantity for ingredient ${i + 1}`} type="number" step="any" min={0} className={cn(cellInput, 'text-right')} value={l.qty} disabled={!canManage} onChange={(e) => update(i, { qty: e.target.value })} /></td>
                          <td className="px-2 py-2.5 align-top">
                            <select aria-label={`Unit for ingredient ${i + 1}`} className={cellInput} value={l.unitId} disabled={!canManage} onChange={(e) => update(i, { unitId: e.target.value ? Number(e.target.value) : '' })}>
                              <option value="">Unit</option>
                              {compatibleUnits(l.invItemId).map((u) => <option key={u.id} value={u.id}>{u.code}</option>)}
                            </select>
                          </td>
                          {/* The item's own average cost, which is what the line is costed at. */}
                          <td className="px-2 py-2.5 text-right align-top leading-10 tabular-nums text-neutral-600">
                            {inv ? <>{money(inv.avgCost, { decimals: true })} <span className="text-neutral-400">/ {inv.unitCode}</span></> : '—'}
                          </td>
                          <td className="px-2 py-2.5 align-top"><input aria-label={`Wastage percent for ingredient ${i + 1}`} type="number" step="any" min={0} max={100} className={cn(cellInput, 'text-right')} value={l.wastagePct} disabled={!canManage} onChange={(e) => update(i, { wastagePct: e.target.value })} /></td>
                          <td className="px-4 py-2.5 text-right tabular-nums font-medium align-top leading-10">{money(lineCost(l) / portions, { decimals: true })}</td>
                          <td className="px-2 py-2.5 align-top">{canManage && <IconButton label={`Remove ingredient ${i + 1}`} size="sm" className="text-danger-700" onClick={() => removeLine(i)}><Trash2 className="h-4 w-4" /></IconButton>}</td>
                        </tr>); })}
                    </tbody>
                    <tfoot className="bg-neutral-50 border-t border-neutral-200">
                      <tr>
                        <td colSpan={5} className="px-4 py-2.5 text-right text-neutral-600">Cost per portion ({lines.length} ingredient{lines.length === 1 ? '' : 's'} · yield {portions})</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-neutral-900">{money(total, { decimals: true })}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
              {incomplete > 0 && <p className="px-5 py-3 text-caption text-warning-700">{incomplete} line{incomplete === 1 ? '' : 's'} incomplete — lines without an item, unit or quantity are dropped when you save.</p>}
              {error && <div className="px-5 pb-4"><InlineError message={error} /></div>}
            </Card>
          )}

          {tab === 'settings' && (
            <Card>
              <CardHeader title="Recipe settings" subtitle="What one run of this recipe produces, and whether it deducts stock" />
              <div className="space-y-3">
                <Input label="Portion label" value={label} onChange={(e) => { setDirty(true); setLabel(e.target.value); }} disabled={!canManage} />
                <Input label="Yield (portions per run)" type="number" min={0.1} step="any" value={yieldQty} onChange={(e) => { setDirty(true); setYieldQty(e.target.value); }} disabled={!canManage} hint="Batch recipes: cost is divided by yield" />
                <Switch checked={active} onChange={(v) => { setDirty(true); setActive(v); }} label="Active" description="Inactive recipes stop stock deduction" disabled={!canManage} />
                <div className="flex flex-wrap gap-1 pt-1"><Badge size="sm">Variant {r.variantCode}</Badge><Badge size="sm" tone="neutral">Variants &amp; sizes: Phase 3</Badge></div>
              </div>
              {error && <InlineError message={error} />}
            </Card>
          )}
        </div>

        <div className="min-w-0 lg:sticky lg:top-4">
          <Card>
            <CardHeader title="Cost breakdown" subtitle="Cost per portion against the 30 % target — recalculated as you edit, not saved until you save" />
            <p className="text-metric text-neutral-900 tabular-nums">{money(total, { decimals: true })}</p>
            <p className="text-caption text-neutral-500 mt-1">{label || 'Portion'} · yield {portions} per run</p>
            <CardDivider />
            <KeyValue items={[
              { label: 'Ingredients total (per run)', value: <span className="tabular-nums">{money(runTotal, { decimals: true })}</span> },
              { label: 'Total food cost (per portion)', value: <span className="tabular-nums font-semibold">{money(total, { decimals: true })}</span> },
              { label: 'Selling price', value: <span className="tabular-nums">{money(r.sellingPrice)}</span> },
              { label: 'Gross margin', value: <span className={cn('tabular-nums font-semibold', margin <= 0 ? 'text-danger-700' : 'text-neutral-900')}>{money(margin)}</span> },
              { label: 'Suggested price @ 30 %', value: <span className="tabular-nums">{total > 0 ? money(Math.round(total / 0.3)) : '—'}</span> },
            ]} />
            <CardDivider />
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-label uppercase text-neutral-500">Food cost</span>
              <Badge tone={fcTone} size="lg">{fc}%</Badge>
            </div>
            {/* The verdict, in words as well as colour, naming the target it is measured against. */}
            <p className={cn('mt-3 flex items-start gap-2 rounded-md border px-3 py-2.5 text-sm', VERDICT[fcTone])}>
              {fcTone === 'success'
                ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
                : <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />}
              <span className="min-w-0">
                {fc === 0
                  ? 'Not costed yet — add ingredients with a quantity and a unit.'
                  : `${fc}% food cost — ${fcBand} against the 30 % target.`}
              </span>
            </p>
            {/* The gold Save lives once on this screen, in the identity header. This is the same
                action within reach of the figure it changes, so it takes the quieter variant. */}
            {canManage && (
              <Button variant="outline" block className="mt-4" leftIcon={<Save className="h-4 w-4" />} loading={save.isPending} disabled={!dirty} onClick={() => void onSave()}>
                {dirty ? 'Save recipe' : 'Saved'}
              </Button>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
