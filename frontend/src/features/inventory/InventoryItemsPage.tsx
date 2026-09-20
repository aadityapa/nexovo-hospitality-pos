import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Pencil, Trash2, Layers, ArrowLeftRight, X } from 'lucide-react';
import { useInventoryItems, useInventoryCategories, useInventoryMutations } from '@/features/p2/hooks';
import { InventoryItemForm, InventoryCategoriesModal, MovementForm } from './InventoryForms';
import { usePermission } from '@/hooks/useAuth';
import { useDebounce, useRealtimeInvalidate } from '@/hooks/useRealtime';
import { PageHeader, Button, IconButton, DataTable, StatusBadge, SearchInput, SegmentedControl, ConfirmDialog, LoadingState, ErrorState, type Column, FilterSelect, statusMeta } from '@/components/ui';
import { money } from '@/utils/money';
import { cn } from '@/utils/cn';
import type { InventoryItem, StockStatus } from '@/types';

export default function InventoryItemsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const canManage = usePermission('inventory:manage');
  const canAdjust = usePermission('inventory:adjust');
  const [search, setSearch] = useState('');
  const dq = useDebounce(search, 250);
  const [cat, setCat] = useState<number | ''>('');
  const status = (params.get('status') as StockStatus | null) ?? '';
  const items = useInventoryItems({ search: dq || undefined, categoryId: cat || undefined, status: status === 'LOW' ? undefined : status || undefined });
  const cats = useInventoryCategories();
  const { deleteItem } = useInventoryMutations();
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [formOpen, setFormOpen] = useState(params.get('new') === '1');
  const [catsOpen, setCatsOpen] = useState(false);
  const [moveFor, setMoveFor] = useState<InventoryItem | null>(null);
  const [toDelete, setToDelete] = useState<InventoryItem | null>(null);
  useRealtimeInvalidate(['inventory']);
  const rows = useMemo(() => (items.data ?? []).filter((i) => status !== 'LOW' || i.stockStatus === 'LOW' || i.stockStatus === 'REORDER'), [items.data, status]);
  const setStatus = (v: string) => setParams((p) => { if (v) p.set('status', v); else p.delete('status'); return p; });
  const filtered = !!(search || cat || status);
  const clearFilters = () => { setSearch(''); setCat(''); setStatus(''); };

  /**
   * Stock level as words first, colour second: the badge carries an icon and a label, and the
   * quantity cell always spells out how it compares with the minimum.
   */
  const levelNote = (r: InventoryItem) => {
    if (r.currentQty <= 0) return 'none on hand';
    const short = r.minQty - r.currentQty;
    if (short > 0) return `short ${Number(short.toFixed(3))} of min ${r.minQty}`;
    if (r.currentQty <= r.reorderLevel) return `at reorder level ${r.reorderLevel}`;
    return `min ${r.minQty}`;
  };

  const adjustButton = (r: InventoryItem) => (
    <Button
      size="sm" variant="outline" leftIcon={<ArrowLeftRight className="h-4 w-4" />}
      onClick={(e) => { e.stopPropagation(); setMoveFor(r); }}
    >
      Adjust
    </Button>
  );

  const columns: Column<InventoryItem>[] = [
    { key: 'name', header: 'Item', sortValue: (r) => r.name, className: 'max-w-[18rem]', render: (r) => <span className="block min-w-0"><span className="block font-medium text-neutral-900 truncate">{r.name}</span><span className="block text-caption text-neutral-500 truncate">{r.code} · {r.categoryName}</span></span> },
    { key: 'status', header: 'Stock status', sortValue: (r) => r.stockStatus, render: (r) => <StatusBadge kind="stock" status={r.stockStatus} size="sm" /> },
    {
      key: 'qty', header: 'On hand', align: 'right', sortValue: (r) => r.currentQty,
      render: (r) => (
        <span className="block">
          <span className={cn('block tabular-nums font-semibold', r.stockStatus === 'OUT' ? 'text-danger-700' : r.stockStatus === 'LOW' ? 'text-warning-700' : 'text-neutral-900')}>
            {r.currentQty} {r.unitCode}
          </span>
          <span className="block text-caption text-neutral-500 whitespace-nowrap">{levelNote(r)}</span>
        </span>
      ),
    },
    { key: 'min', header: 'Min / reorder', align: 'right', hideBelow: 'lg', render: (r) => <span className="tabular-nums text-neutral-600">{r.minQty} / {r.reorderLevel}</span> },
    { key: 'cost', header: 'Avg cost', align: 'right', hideBelow: 'md', sortValue: (r) => r.avgCost, render: (r) => <span className="tabular-nums">{money(r.avgCost, { decimals: true })}</span> },
    { key: 'value', header: 'Value', align: 'right', sortValue: (r) => r.stockValue, render: (r) => <span className="tabular-nums font-medium">{money(r.stockValue)}</span> },
    { key: 'supplier', header: 'Supplier', hideBelow: 'lg', render: (r) => <span className="text-neutral-600">{r.supplierName ?? '—'}</span> },
    {
      key: 'actions', header: <span className="sr-only">Actions</span>, align: 'right',
      render: (r) => (
        <div className="flex justify-end items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {canAdjust && adjustButton(r)}
          {canManage && <>
            <IconButton label={`Edit ${r.name}`} size="sm" onClick={() => { setEditing(r); setFormOpen(true); }}><Pencil className="h-4 w-4" /></IconButton>
            <IconButton label={`Delete ${r.name}`} size="sm" className="text-danger-600" onClick={() => setToDelete(r)}><Trash2 className="h-4 w-4" /></IconButton>
          </>}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Stock items" subtitle="Scan the list, then open an item or adjust its stock in place" actions={<>{canManage && <Button variant="outline" leftIcon={<Layers className="h-4 w-4" />} onClick={() => setCatsOpen(true)}>Categories</Button>}{canAdjust && <Button variant="outline" leftIcon={<ArrowLeftRight className="h-4 w-4" />} onClick={() => setMoveFor({} as InventoryItem)}>Record movement</Button>}{canManage && <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setFormOpen(true); }}>New item</Button>}</>}>
        <div className="flex flex-col lg:flex-row gap-2 lg:items-center">
          <SearchInput value={search} onChange={setSearch} placeholder="Search name or code" className="lg:w-72" />
          <FilterSelect
            ariaLabel="Filter by category" className="lg:w-56" value={cat} placeholder="All categories"
            onChange={(e) => setCat(e.target.value ? Number(e.target.value) : '')}
            options={(cats.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
          />
          <SegmentedControl ariaLabel="Filter by stock status" size="sm" value={status} onChange={setStatus} options={[{ value: '', label: 'All' }, { value: 'LOW', label: 'Low / reorder' }, { value: 'OUT', label: 'Out of stock' }, { value: 'OK', label: 'In stock' }]} />
        </div>
      </PageHeader>
      {items.isLoading && <LoadingState variant="table" rows={8} />}
      {items.isError && <ErrorState error={items.error} onRetry={() => void items.refetch()} />}
      {items.data && (
        <DataTable
          columns={columns} rows={rows} rowKey={(r) => r.id} pageSize={25} dense
          caption="Inventory items with stock status, quantity on hand, cost and value"
          onRowClick={(r) => navigate(`/admin/inventory/items/${r.id}`)}
          toolbar={
            <div className="flex items-center justify-between gap-3 flex-wrap px-1">
              <p className="text-sm text-neutral-600">
                <span className="font-semibold text-neutral-900 tabular-nums">{rows.length}</span> item{rows.length === 1 ? '' : 's'}
                {status ? <> · {statusMeta('stock', status === 'LOW' ? 'LOW' : status).label}{status === 'LOW' ? ' and reorder' : ''}</> : null}
              </p>
              {filtered && (
                <Button size="sm" variant="ghost" leftIcon={<X className="h-4 w-4" />} onClick={clearFilters}>Clear filters</Button>
              )}
            </div>
          }
          emptyTitle="No inventory items"
          emptyDescription={filtered ? 'No item matches these filters.' : 'Create your first ingredient, beverage or bottle.'}
          emptyAction={filtered ? <Button variant="outline" onClick={clearFilters}>Clear filters</Button> : canManage ? <Button onClick={() => setFormOpen(true)}>New item</Button> : undefined}
          mobileCard={(r) => (
            <div className="space-y-2">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-neutral-900 truncate">{r.name}</p>
                  <p className="text-caption text-neutral-500 truncate">{r.code} · {r.categoryName}</p>
                </div>
                <StatusBadge kind="stock" status={r.stockStatus} size="sm" />
              </div>
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className={cn('tabular-nums font-semibold', r.stockStatus === 'OUT' ? 'text-danger-700' : r.stockStatus === 'LOW' ? 'text-warning-700' : 'text-neutral-900')}>
                    {r.currentQty} {r.unitCode}
                  </p>
                  <p className="text-caption text-neutral-500">{levelNote(r)} · value {money(r.stockValue)}</p>
                </div>
                {canAdjust && adjustButton(r)}
              </div>
            </div>
          )}
        />
      )}
      {formOpen && <InventoryItemForm editing={editing} onClose={() => { setFormOpen(false); setParams((p) => { p.delete('new'); return p; }); }} />}
      {catsOpen && <InventoryCategoriesModal onClose={() => setCatsOpen(false)} />}
      {moveFor && <MovementForm item={moveFor.id ? moveFor : null} onClose={() => setMoveFor(null)} />}
      <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} variant="danger" title={`Delete “${toDelete?.name}”?`} message="Soft-deleted; movement history is kept. Items used in active recipes cannot be deleted." confirmLabel="Delete" loading={deleteItem.isPending} onConfirm={async () => { if (toDelete) { try { await deleteItem.mutateAsync(toDelete.id); } finally { setToDelete(null); } } }} />
    </div>
  );
}
