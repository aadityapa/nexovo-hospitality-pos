import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Pencil, Trash2, Layers, ArrowLeftRight, X, Download } from 'lucide-react';
import { useInventoryItems, useInventoryCategories, useInventoryMutations } from '@/features/p2/hooks';
import { InventoryItemForm, InventoryCategoriesModal, MovementForm } from './InventoryForms';
import { usePermission } from '@/hooks/useAuth';
import { useDebounce, useRealtimeInvalidate } from '@/hooks/useRealtime';
import { useWorkspace } from '@/hooks/useSurface';
import { PageHeader, Button, IconButton, DataTable, StatusBadge, SearchInput, SegmentedControl, ConfirmDialog, LoadingState, ErrorState, ItemImage, type Column, FilterSelect, statusMeta } from '@/components/ui';
import { ProgressMeter } from '@/components/graphics';
import { HeaderSearch } from '@/components/layout/Shell';
import { downloadCsv } from '@/utils/csv';
import { money } from '@/utils/money';
import type { InventoryItem, StockStatus } from '@/types';

export default function InventoryItemsPage() {
  const ws = useWorkspace();
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
   * How the level compares with its own marks, in words: colour and a bar can suggest "low", but
   * only the sentence says by how much. Only the computed shortfall is rounded — every figure
   * that came from the API is printed exactly as it arrived.
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

  /* Export is the real thing: the rows currently on screen, exactly as filtered, written from
     data already fetched. There is no import counterpart — no parser and no endpoint exists, so
     none is offered. */
  const exportCsv = () => {
    if (!rows.length) return;
    downloadCsv('stock-items', rows.map((r) => ({
      code: r.code,
      item: r.name,
      category: r.categoryName,
      currentQty: r.currentQty,
      unit: r.unitCode,
      minQty: r.minQty,
      reorderLevel: r.reorderLevel,
      status: statusMeta('stock', r.stockStatus).label,
      unitCost: r.avgCost,
      stockValue: r.stockValue,
      supplier: r.supplierName ?? '',
    })));
  };

  const columns: Column<InventoryItem>[] = [
    {
      key: 'name', header: 'Item', sortValue: (r) => r.name, className: 'max-w-[20rem]',
      render: (r) => (
        <span className="flex items-center gap-3 min-w-0">
          {/* A drawing of the ingredient rather than a grey tile — same picture everywhere the
              item appears, keyed off its own name. */}
          <ItemImage src={null} alt={r.name} category={r.categoryName} className="h-9 w-9 shrink-0" />
          <span className="min-w-0">
            <span className="block font-medium text-neutral-900 truncate">{r.name}</span>
            <span className="block text-caption text-neutral-500 truncate">{r.code}</span>
          </span>
        </span>
      ),
    },
    { key: 'category', header: 'Category', sortValue: (r) => r.categoryName, hideBelow: 'md', render: (r) => <span className="text-neutral-600">{r.categoryName}</span> },
    {
      key: 'qty', header: 'Current stock', align: 'right', sortValue: (r) => r.currentQty,
      render: (r) => (
        <span className="block">
          <span className="block tabular-nums font-semibold text-neutral-900 whitespace-nowrap">{r.currentQty} <span className="font-normal text-neutral-500">{r.unitCode}</span></span>
          <span className="block text-caption text-neutral-500 whitespace-nowrap">{levelNote(r)}</span>
        </span>
      ),
    },
    { key: 'reorder', header: 'Reorder at', align: 'right', hideBelow: 'lg', sortValue: (r) => r.reorderLevel, render: (r) => <span className="tabular-nums text-neutral-600 whitespace-nowrap">{r.reorderLevel} {r.unitCode}</span> },
    { key: 'status', header: 'Status', sortValue: (r) => r.stockStatus, render: (r) => <StatusBadge kind="stock" status={r.stockStatus} size="sm" /> },
    { key: 'cost', header: 'Unit cost', align: 'right', hideBelow: 'md', sortValue: (r) => r.avgCost, render: (r) => <span className="tabular-nums">{money(r.avgCost, { decimals: true })}</span> },
    {
      key: 'actions', header: <span className="sr-only">Actions</span>, align: 'right',
      render: (r) => (
        <div className="flex justify-end items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {canAdjust && adjustButton(r)}
          {canManage && <>
            <IconButton label={`Edit ${r.name}`} size="sm" onClick={() => { setEditing(r); setFormOpen(true); }}><Pencil className="h-4 w-4" /></IconButton>
            <IconButton label={`Delete ${r.name}`} size="sm" className="text-danger-700" onClick={() => setToDelete(r)}><Trash2 className="h-4 w-4" /></IconButton>
          </>}
        </div>
      ),
    },
  ];

  /**
   * THE MANAGER BOARD (panel 17).
   *
   * The same directory, re-columned to what a floor manager orders against: the item, its
   * category, how much is on hand WITH a proportional bar against this item's own reorder level,
   * the unit, that reorder level, the supplier where one is linked, and the status.
   *
   * The bar's maximum is the reorder level, or the quantity on hand when that is already above
   * it — so a healthy item reads as a full bar rather than overflowing its track, and the
   * `aria-valuetext` says which of the two it is in words. An item with no reorder level has
   * nothing to be proportional TO, so it prints that instead of drawing a meaningless bar.
   * Unit cost is dropped here: it is a purchasing figure, and this board is a stock board.
   */
  const managerColumns: Column<InventoryItem>[] = [
    {
      key: 'name', header: 'Item', sortValue: (r) => r.name, className: 'max-w-[20rem]',
      render: (r) => (
        <span className="flex items-center gap-3 min-w-0">
          <ItemImage src={null} alt={r.name} category={r.categoryName} className="h-9 w-9 shrink-0" />
          <span className="min-w-0">
            <span className="block font-medium text-neutral-900 truncate">{r.name}</span>
            <span className="block text-caption text-neutral-500 truncate">{r.code}</span>
          </span>
        </span>
      ),
    },
    { key: 'category', header: 'Category', sortValue: (r) => r.categoryName, hideBelow: 'md', render: (r) => <span className="text-neutral-600">{r.categoryName}</span> },
    {
      key: 'qty', header: 'In stock', sortValue: (r) => r.currentQty, className: 'min-w-[9rem]',
      render: (r) => (
        <span className="block min-w-0">
          <span className="block tabular-nums font-semibold text-neutral-900 whitespace-nowrap">{r.currentQty} <span className="font-normal text-neutral-500">{r.unitCode}</span></span>
          {/* `static`: this list re-renders on every realtime inventory event, and a width
              transition would slide every bar in the table each time one item moved. */}
          {r.reorderLevel > 0 ? (
            <ProgressMeter
              className="mt-1"
              size="sm"
              hideText
              static
              value={Math.max(0, r.currentQty)}
              max={Math.max(r.reorderLevel, r.currentQty, 1)}
              tone={r.currentQty <= 0 ? 'danger' : r.currentQty <= r.reorderLevel ? 'warning' : 'success'}
              label={`${r.name} on hand against its reorder level`}
              valueText={r.currentQty > r.reorderLevel
                ? `${r.currentQty} ${r.unitCode} on hand — above the reorder level of ${r.reorderLevel}`
                : `${r.currentQty} ${r.unitCode} on hand of the reorder level ${r.reorderLevel}`}
            />
          ) : (
            <span className="block text-caption text-neutral-500">No reorder level set</span>
          )}
          <span className="block text-caption text-neutral-500 whitespace-nowrap mt-0.5">{levelNote(r)}</span>
        </span>
      ),
    },
    { key: 'unit', header: 'Unit', hideBelow: 'lg', sortValue: (r) => r.unitCode, render: (r) => <span className="text-neutral-600 whitespace-nowrap">{r.unitCode}</span> },
    { key: 'reorder', header: 'Reorder level', align: 'right', hideBelow: 'md', sortValue: (r) => r.reorderLevel, render: (r) => <span className="tabular-nums text-neutral-600 whitespace-nowrap">{r.reorderLevel} {r.unitCode}</span> },
    {
      key: 'supplier', header: 'Supplier', hideBelow: 'xl', sortValue: (r) => r.supplierName ?? '',
      /* Only where the item actually carries a supplier link — an unlinked item says so. */
      render: (r) => (r.supplierName
        ? <span className="block min-w-0 truncate text-neutral-700">{r.supplierName}</span>
        : <span className="text-neutral-400">Not linked</span>),
    },
    { key: 'status', header: 'Status', sortValue: (r) => r.stockStatus, render: (r) => <StatusBadge kind="stock" status={r.stockStatus} size="sm" /> },
    {
      key: 'actions', header: <span className="sr-only">Actions</span>, align: 'right',
      render: (r) => (
        <div className="flex justify-end items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {canAdjust && adjustButton(r)}
          {canManage && <>
            <IconButton label={`Edit ${r.name}`} size="sm" onClick={() => { setEditing(r); setFormOpen(true); }}><Pencil className="h-4 w-4" /></IconButton>
            <IconButton label={`Delete ${r.name}`} size="sm" className="text-danger-700" onClick={() => setToDelete(r)}><Trash2 className="h-4 w-4" /></IconButton>
          </>}
        </div>
      ),
    },
  ];

  return (
    <div>
      {/* The screen's own search, hoisted into the application header — same input, same state. */}
      <HeaderSearch>
        <SearchInput value={search} onChange={setSearch} placeholder="Search stock items…" className="w-full max-w-sm" />
      </HeaderSearch>

      <PageHeader
        title="Stock items"
        subtitle="Scan the list, then open an item or adjust its stock in place"
        actions={<>
          <Button variant="outline" leftIcon={<Download className="h-4 w-4" />} onClick={exportCsv} disabled={!rows.length}>Export</Button>
          {canManage && <Button variant="outline" leftIcon={<Layers className="h-4 w-4" />} onClick={() => setCatsOpen(true)}>Categories</Button>}
          {canAdjust && <Button variant="outline" leftIcon={<ArrowLeftRight className="h-4 w-4" />} onClick={() => setMoveFor({} as InventoryItem)}>Record movement</Button>}
          {canManage && <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setFormOpen(true); }}>Add item</Button>}
        </>}
      >
        <div className="flex flex-col lg:flex-row gap-2 lg:items-center">
          <FilterSelect
            ariaLabel="Filter by category" className="lg:w-56" value={cat} placeholder="All categories"
            onChange={(e) => setCat(e.target.value ? Number(e.target.value) : '')}
            options={(cats.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
          />
          <SegmentedControl ariaLabel="Filter by stock status" size="sm" value={status} onChange={setStatus} options={[{ value: '', label: 'All' }, { value: 'LOW', label: 'Low / reorder' }, { value: 'OUT', label: 'Out of stock' }, { value: 'OK', label: 'In stock' }]} />
          {filtered && <Button size="sm" variant="ghost" leftIcon={<X className="h-4 w-4" />} onClick={clearFilters}>Clear filters</Button>}
        </div>
      </PageHeader>
      {items.isLoading && <LoadingState variant="table" rows={8} />}
      {items.isError && <ErrorState error={items.error} onRetry={() => void items.refetch()} />}
      {items.data && (
        <DataTable
          columns={ws === 'manager' ? managerColumns : columns} rows={rows} rowKey={(r) => r.id} pageSize={25}
          caption={ws === 'manager'
            ? 'Inventory items with category, quantity on hand against the reorder level, unit, reorder level, supplier and stock status'
            : 'Inventory items with category, quantity on hand, reorder level, stock status and unit cost'}
          onRowClick={(r) => navigate(`/admin/inventory/items/${r.id}`)}
          toolbar={
            <p className="px-1 text-sm text-neutral-600">
              <span className="font-semibold text-neutral-900 tabular-nums">{rows.length}</span> item{rows.length === 1 ? '' : 's'}
              {status ? <> · {statusMeta('stock', status === 'LOW' ? 'LOW' : status).label}{status === 'LOW' ? ' and reorder' : ''}</> : null}
            </p>
          }
          emptyTitle="No inventory items"
          emptyDescription={filtered ? 'No item matches these filters.' : 'Create your first ingredient, beverage or bottle.'}
          emptyAction={filtered ? <Button variant="outline" onClick={clearFilters}>Clear filters</Button> : canManage ? <Button onClick={() => setFormOpen(true)}>Add item</Button> : undefined}
          mobileCard={(r) => (
            <div className="space-y-2">
              <div className="flex items-start gap-3">
                <ItemImage src={null} alt={r.name} category={r.categoryName} className="h-10 w-10 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-neutral-900 truncate">{r.name}</p>
                  <p className="text-caption text-neutral-500 truncate">{r.code} · {r.categoryName}</p>
                </div>
                <StatusBadge kind="stock" status={r.stockStatus} size="sm" />
              </div>
              <div className="flex items-end justify-between gap-3">
                <p className="text-caption text-neutral-500 min-w-0">
                  <span className="block tabular-nums font-semibold text-neutral-900">{r.currentQty} {r.unitCode}</span>
                  {levelNote(r)} · reorder at {r.reorderLevel} {r.unitCode} · {money(r.avgCost, { decimals: true })} per {r.unitCode}
                </p>
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
