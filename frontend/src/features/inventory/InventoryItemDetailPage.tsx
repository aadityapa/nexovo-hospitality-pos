import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Pencil, ArrowLeftRight, Package, ShoppingCart } from 'lucide-react';
import { useInventoryItem, useItemMovements, useRecipeCosting } from '@/features/p2/hooks';
import { InventoryItemForm, MovementForm } from './InventoryForms';
import { usePermission } from '@/hooks/useAuth';
import { useRealtimeInvalidate } from '@/hooks/useRealtime';
import { PageHeader, Button, Card, CardHeader, StatusBadge, Badge, KeyValue, DataTable, Alert, LoadingState, ErrorState, type Column } from '@/components/ui';
import { money } from '@/utils/money';
import { fmtDateTime } from '@/utils/date';
import { MOVEMENT_LABELS } from '@/config/statuses';
import { cn } from '@/utils/cn';
import type { StockMovement } from '@/types';

export default function InventoryItemDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const item = useInventoryItem(Number(id));
  const movements = useItemMovements(Number(id), { limit: 200 });
  const recipes = useRecipeCosting();
  const canManage = usePermission('inventory:manage');
  const canAdjust = usePermission('inventory:adjust');
  const [edit, setEdit] = useState(false);
  const [move, setMove] = useState(false);
  useRealtimeInvalidate(['inventory']);
  if (item.isLoading) return <LoadingState variant="page" />;
  if (item.isError || !item.data) return <ErrorState error={item.error} onRetry={() => void item.refetch()} />;
  const i = item.data;
  const shortBy = Math.max(0, i.minQty - i.currentQty);
  const columns: Column<StockMovement>[] = [
    { key: 'when', header: 'When', sortValue: (m) => m.createdAt, render: (m) => <span className="text-neutral-600 whitespace-nowrap">{fmtDateTime(m.createdAt)}</span> },
    { key: 'type', header: 'Type', sortValue: (m) => m.type, render: (m) => <Badge size="sm" tone={m.qty > 0 ? 'success' : m.type === 'WASTAGE' || m.type === 'DAMAGE' ? 'danger' : 'neutral'}>{MOVEMENT_LABELS[m.type]}</Badge> },
    { key: 'qty', header: 'In / out', align: 'right', sortValue: (m) => m.qty, render: (m) => <span className={cn('tabular-nums font-semibold whitespace-nowrap', m.qty > 0 ? 'text-success-700' : 'text-danger-700')}>{m.qty > 0 ? '+' : '−'}{Math.abs(m.qty)} {m.unitCode}</span> },
    { key: 'after', header: 'Balance after', align: 'right', hideBelow: 'md', sortValue: (m) => m.qtyAfter, render: (m) => <span className="tabular-nums text-neutral-600">{m.qtyBefore} → <span className="text-neutral-900 font-medium">{m.qtyAfter}</span></span> },
    { key: 'cost', header: 'Cost', align: 'right', hideBelow: 'md', sortValue: (m) => m.totalCost, render: (m) => <span className="tabular-nums">{money(m.totalCost)}</span> },
    { key: 'ref', header: 'Reference / reason', hideBelow: 'lg', render: (m) => <span className="text-neutral-600">{m.refType ? `${m.refType} #${m.refId ?? ''} · ` : ''}{m.reason}</span> },
    { key: 'by', header: 'By', hideBelow: 'lg', render: (m) => <span className="text-neutral-600">{m.createdByName ?? 'system'}</span> },
  ];
  const usedIn = (recipes.data ?? []).filter((r) => r.ingredientCount > 0);
  return (
    <div>
      <PageHeader
        back={() => navigate('/admin/inventory/items')}
        breadcrumbs={[{ label: 'Inventory', to: '/admin/inventory' }, { label: 'Stock items', to: '/admin/inventory/items' }, { label: i.name }]}
        title={<span className="flex items-center gap-3 flex-wrap">{i.name}<StatusBadge kind="stock" status={i.stockStatus} size="lg" /></span>}
        subtitle={`${i.code} · ${i.categoryName} · ${i.categoryKind.replace('_', ' ').toLowerCase()}`}
        actions={<>{canAdjust && <Button variant="outline" leftIcon={<ArrowLeftRight className="h-4 w-4" />} onClick={() => setMove(true)}>Record movement</Button>}{canManage && <Button leftIcon={<Pencil className="h-4 w-4" />} onClick={() => setEdit(true)}>Edit</Button>}</>}
      />

      {(i.stockStatus === 'OUT' || i.stockStatus === 'LOW' || i.stockStatus === 'REORDER') && (
        <Alert
          className="mb-4"
          tone={i.stockStatus === 'OUT' ? 'danger' : 'warning'}
          title={i.stockStatus === 'OUT' ? 'Out of stock' : i.stockStatus === 'LOW' ? 'Below minimum level' : 'At reorder level'}
          action={canManage ? <Button size="sm" variant="outline" leftIcon={<ShoppingCart className="h-4 w-4" />} onClick={() => navigate('/admin/purchases/new')}>Raise PO</Button> : undefined}
        >
          {shortBy > 0
            ? <>On hand {i.currentQty} {i.unitCode} against a minimum of {i.minQty} {i.unitCode} — short by {Number(shortBy.toFixed(3))} {i.unitCode}.</>
            : <>On hand {i.currentQty} {i.unitCode}; reorder level is {i.reorderLevel} {i.unitCode}.</>}
        </Alert>
      )}

      {/* Current position first: one large readout plus the numbers you decide against. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] mb-5">
        <Card className="flex flex-col justify-between gap-4">
          <div className="flex items-start gap-4">
            <span className={cn('h-11 w-11 rounded-md flex items-center justify-center shrink-0',
              i.stockStatus === 'OUT' ? 'bg-danger-50 text-danger-600' : i.stockStatus === 'OK' ? 'bg-success-50 text-success-700' : 'bg-warning-50 text-warning-700')} aria-hidden>
              <Package className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-label uppercase text-neutral-500">On hand now</p>
              <p className="text-metric text-neutral-900 tabular-nums mt-1">{i.currentQty} <span className="text-lg font-semibold text-neutral-500">{i.unitCode}</span></p>
              <p className="text-caption text-neutral-500 mt-1">
                Worth {money(i.stockValue)} at an average cost of {money(i.avgCost, { decimals: true })} / {i.unitCode}
              </p>
            </div>
          </div>
          {canAdjust && (
            <Button block variant="outline" leftIcon={<ArrowLeftRight className="h-4 w-4" />} onClick={() => setMove(true)}>Adjust stock</Button>
          )}
        </Card>
        <Card>
          <CardHeader title="Levels and sourcing" subtitle="What triggers an alert and who supplies it" />
          <KeyValue items={[
            { label: 'Minimum level', value: <span className="tabular-nums">{i.minQty} {i.unitCode}</span> },
            { label: 'Reorder level', value: <span className="tabular-nums">{i.reorderLevel} {i.unitCode}</span> },
            { label: 'Maximum level', value: i.maxQty ? <span className="tabular-nums">{i.maxQty} {i.unitCode}</span> : '—' },
            { label: 'Last purchase cost', value: money(i.costPrice, { decimals: true }) },
            { label: 'Preferred supplier', value: i.supplierName ?? 'None set' },
            { label: 'Last movement', value: fmtDateTime(i.lastMovementAt) },
          ]} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px] items-start">
        <Card padded={false}>
          <CardHeader className="p-5 pb-0" title="Movement history" subtitle="Every stock change, newest first — quantities are never overwritten" />
          <div className="mt-3">{movements.isLoading ? <div className="p-5"><LoadingState rows={4} /></div> : (
            <DataTable
              columns={columns} rows={movements.data ?? []} rowKey={(m) => m.id} pageSize={20} dense
              initialSort={{ key: 'when', dir: 'desc' }}
              caption={`Stock movement history for ${i.name}`}
              emptyTitle="No movements yet"
              emptyDescription={canAdjust ? 'Record an opening stock or adjustment to start the audit trail.' : undefined}
              className="border-0 shadow-none rounded-none"
              mobileCard={(m) => (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <Badge size="sm" tone={m.qty > 0 ? 'success' : m.type === 'WASTAGE' || m.type === 'DAMAGE' ? 'danger' : 'neutral'}>{MOVEMENT_LABELS[m.type]}</Badge>
                    <span className={cn('tabular-nums font-semibold', m.qty > 0 ? 'text-success-700' : 'text-danger-700')}>{m.qty > 0 ? '+' : '−'}{Math.abs(m.qty)} {m.unitCode}</span>
                  </div>
                  <p className="text-caption text-neutral-500">{fmtDateTime(m.createdAt)} · balance {m.qtyBefore} → {m.qtyAfter} · {m.createdByName ?? 'system'}</p>
                  {m.reason && <p className="text-caption text-neutral-600">{m.reason}</p>}
                </div>
              )}
            />
          )}</div>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Item setup" subtitle="How this item is counted" />
            <KeyValue items={[
              { label: 'Stock unit', value: i.unitCode },
              { label: 'Pack size', value: i.packSize ? `${i.packSize} per ${i.unitCode}` : '—' },
              { label: 'Negative stock', value: i.allowNegative ? 'Allowed' : <span className="text-neutral-900">Blocked — sales stop at zero</span> },
              { label: 'Status', value: i.isActive ? 'Active' : 'Inactive' },
            ]} />
          </Card>
          <Card>
            <CardHeader title="Consumption" subtitle="Sales deduct stock through recipes" />
            <p className="text-sm text-neutral-600">{usedIn.length} menu item{usedIn.length === 1 ? '' : 's'} have recipes in this branch. Open a recipe to see the exact quantity of this ingredient per portion.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate('/admin/recipes')}>Open recipes &amp; costing</Button>
          </Card>
        </div>
      </div>
      {edit && <InventoryItemForm editing={i} onClose={() => setEdit(false)} />}
      {move && <MovementForm item={i} onClose={() => setMove(false)} />}
    </div>
  );
}
