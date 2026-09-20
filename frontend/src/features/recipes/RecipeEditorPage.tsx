import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2, Save, ChefHat, Wine } from 'lucide-react';
import { useRecipe, useRecipeMutations, useInventoryItems, useInventoryUnits } from '@/features/p2/hooks';
import { usePermission } from '@/hooks/useAuth';
import { PageHeader, Button, Card, CardHeader, CardDivider, Input, IconButton, Switch, LoadingState, ErrorState, EmptyState, Badge, KeyValue, InlineError } from '@/components/ui';
import { money } from '@/utils/money';
import { ApiError } from '@/services/api/client';
import { cn } from '@/utils/cn';
import type { RecipeIngredient, ID } from '@/types';

interface Line { invItemId: ID | ''; qty: string; unitId: ID | ''; wastagePct: string }

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
  const total = runTotal / (Number(yieldQty) || 1);
  const fc = r.sellingPrice > 0 ? Math.round((total * 1000) / r.sellingPrice) / 10 : 0;
  const fcTone = fc === 0 ? 'neutral' : fc <= 30 ? 'success' : fc <= 40 ? 'warning' : 'danger';
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
      <PageHeader
        back={() => navigate('/admin/recipes')}
        breadcrumbs={[{ label: 'Recipes & costing', to: '/admin/recipes' }, { label: r.menuItemName }]}
        title={<span className="flex items-center gap-2">{r.prepLocation === 'BAR' ? <Wine className="h-5 w-5 text-info-600" aria-hidden /> : <ChefHat className="h-5 w-5 text-warning-700" aria-hidden />}{r.menuItemName}</span>}
        subtitle={`Selling price ${money(r.sellingPrice)} · ${r.prepLocation === 'BAR' ? 'Bar' : 'Kitchen'} · ${lines.length} ingredient${lines.length === 1 ? '' : 's'}`}
        actions={canManage && <>
          {dirty && <Badge tone="warning" size="sm">Unsaved changes</Badge>}
          <Button variant="ghost" className="text-danger-700" disabled={!r.recipeId} loading={remove.isPending} onClick={() => remove.mutate(id)}>Deactivate</Button>
          <Button leftIcon={<Save className="h-4 w-4" />} loading={save.isPending} onClick={() => void onSave()}>Save recipe</Button>
        </>}
      />

      {/* Editing surface left, costing panel right — the panel is sticky so the food cost
          never scrolls out of view while ingredients are being changed. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
        <Card padded={false}>
          <CardHeader className="p-5 pb-0" title="Ingredients" subtitle="Quantity per recipe run; stock is deducted in the item's stock unit" action={canManage && <Button size="sm" variant="outline" leftIcon={<Plus className="h-4 w-4" />} onClick={addLine}>Add ingredient</Button>} />
          {lines.length === 0 ? <EmptyState compact title="No ingredients yet" description="Add the ingredients that make one portion — until then this item deducts no stock." action={canManage && <Button onClick={addLine}>Add ingredient</Button>} /> : (
            <div className="table-scroll mt-3">
              <table className="w-full text-sm min-w-[720px]">
                <caption className="sr-only">Recipe ingredients with quantity, unit, wastage allowance and line cost</caption>
                <thead className="bg-neutral-50 text-label uppercase text-neutral-600">
                  <tr>
                    <th scope="col" className="text-left px-4 py-2.5">Ingredient</th>
                    <th scope="col" className="text-right px-2 py-2.5 w-28">Qty</th>
                    <th scope="col" className="text-left px-2 py-2.5 w-32">Unit</th>
                    <th scope="col" className="text-right px-2 py-2.5 w-28">Wastage %</th>
                    <th scope="col" className="text-right px-4 py-2.5 w-28">Line cost</th>
                    <th className="w-12"><span className="sr-only">Remove</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {lines.map((l, i) => { const inv = unitFor(l.invItemId); return (
                    <tr key={i} className={cn(!l.invItemId && 'bg-warning-50/40')}>
                      <td className="px-4 py-2.5 align-top">
                        <select aria-label={`Ingredient ${i + 1}`} className={cellInput} value={l.invItemId} disabled={!canManage} onChange={(e) => { const v = e.target.value ? Number(e.target.value) : ''; const invx = unitFor(v); update(i, { invItemId: v, unitId: invx ? invx.unitId : '' }); }}>
                          <option value="">Select…</option>
                          {(items.data ?? []).map((it) => <option key={it.id} value={it.id}>{it.name} ({it.unitCode})</option>)}
                        </select>
                        {inv
                          ? <span className="block text-caption text-neutral-500 mt-1">stock {inv.currentQty} {inv.unitCode} · avg {money(inv.avgCost, { decimals: true })} / {inv.unitCode}</span>
                          : <span className="block text-caption text-warning-700 mt-1">Pick an item — this line is not costed</span>}
                      </td>
                      <td className="px-2 py-2.5 align-top"><input aria-label={`Quantity for ingredient ${i + 1}`} type="number" step="any" min={0} className={cn(cellInput, 'text-right')} value={l.qty} disabled={!canManage} onChange={(e) => update(i, { qty: e.target.value })} /></td>
                      <td className="px-2 py-2.5 align-top">
                        <select aria-label={`Unit for ingredient ${i + 1}`} className={cellInput} value={l.unitId} disabled={!canManage} onChange={(e) => update(i, { unitId: e.target.value ? Number(e.target.value) : '' })}>
                          <option value="">Unit</option>
                          {compatibleUnits(l.invItemId).map((u) => <option key={u.id} value={u.id}>{u.code}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-2.5 align-top"><input aria-label={`Wastage percent for ingredient ${i + 1}`} type="number" step="any" min={0} max={100} className={cn(cellInput, 'text-right')} value={l.wastagePct} disabled={!canManage} onChange={(e) => update(i, { wastagePct: e.target.value })} /></td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium align-top leading-10">{money(lineCost(l), { decimals: true })}</td>
                      <td className="px-2 py-2.5 align-top">{canManage && <IconButton label={`Remove ingredient ${i + 1}`} size="sm" className="text-danger-600" onClick={() => removeLine(i)}><Trash2 className="h-4 w-4" /></IconButton>}</td>
                    </tr>); })}
                </tbody>
                <tfoot className="bg-neutral-50 border-t border-neutral-200">
                  <tr>
                    <td colSpan={4} className="px-4 py-2.5 text-right text-neutral-600">Cost per run ({lines.length} ingredient{lines.length === 1 ? '' : 's'})</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-neutral-900">{money(runTotal, { decimals: true })}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          {incomplete > 0 && <p className="px-5 py-3 text-caption text-warning-700">{incomplete} line{incomplete === 1 ? '' : 's'} incomplete — lines without an item, unit or quantity are dropped when you save.</p>}
          {error && <div className="px-5 pb-4"><InlineError message={error} /></div>}
        </Card>

        <div className="space-y-4 lg:sticky lg:top-4">
          <Card>
            <CardHeader title="Cost per portion" subtitle="Recalculated as you edit — not saved until you save" />
            <p className="text-metric text-neutral-900 tabular-nums">{money(total, { decimals: true })}</p>
            <p className="text-caption text-neutral-500 mt-1">{label || 'Portion'} · yield {Number(yieldQty) || 1} per run</p>
            <CardDivider />
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-label uppercase text-neutral-500">Food cost</span>
              <span className="text-right">
                <Badge tone={fcTone} size="lg">{fc}%</Badge>
                <span className="block text-caption text-neutral-500 mt-1">{fcBand} · target ≤ 30 %</span>
              </span>
            </div>
            <CardDivider />
            <KeyValue items={[
              { label: 'Selling price', value: money(r.sellingPrice) },
              { label: 'Gross margin', value: <span className={cn('font-semibold', margin <= 0 ? 'text-danger-700' : 'text-neutral-900')}>{money(margin)}</span> },
              { label: 'Suggested price @ 30 %', value: total > 0 ? money(Math.round(total / 0.3)) : '—' },
            ]} />
            {canManage && (
              <Button block className="mt-4" leftIcon={<Save className="h-4 w-4" />} loading={save.isPending} disabled={!dirty} onClick={() => void onSave()}>
                {dirty ? 'Save recipe' : 'Saved'}
              </Button>
            )}
          </Card>
          <Card>
            <CardHeader title="Recipe settings" />
            <div className="space-y-3">
              <Input label="Portion label" value={label} onChange={(e) => { setDirty(true); setLabel(e.target.value); }} disabled={!canManage} />
              <Input label="Yield (portions per run)" type="number" min={0.1} step="any" value={yieldQty} onChange={(e) => { setDirty(true); setYieldQty(e.target.value); }} disabled={!canManage} hint="Batch recipes: cost is divided by yield" />
              <Switch checked={active} onChange={(v) => { setDirty(true); setActive(v); }} label="Active" description="Inactive recipes stop stock deduction" disabled={!canManage} />
              <div className="flex flex-wrap gap-1 pt-1"><Badge size="sm">Variant STD</Badge><Badge size="sm" tone="neutral">Variants &amp; sizes: Phase 3</Badge></div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
