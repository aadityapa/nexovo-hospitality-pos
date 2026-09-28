import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Pencil, Trash2, Layers, ArrowLeftRight, X, Download } from 'lucide-react';
import { useInventoryItems, useInventoryCategories, useInventoryMutations } from '@/features/p2/hooks';
import { InventoryItemForm, InventoryCategoriesModal, MovementForm } from './InventoryForms';
import { usePermission } from '@/hooks/useAuth';
import { useDebounce, useRealtimeInvalidate } from '@/hooks/useRealtime';
import { useWorkspace } from '@/hooks/useSurface';
import { PageHeader, Button, IconButton, DataTable, StatusBadge, SearchInput, SegmentedControl, FilterChips, ConfirmDialog, LoadingState, ErrorState, type Column, statusMeta } from '@/components/ui';
import { ProgressMeter, DishArt, BottleArt, dishKindFor, Photo } from '@/components/graphics';
import { stockImage } from '@/config/imagery';
import { HeaderSearch } from '@/components/layout/Shell';
import { downloadCsv } from '@/utils/csv';
import { money } from '@/utils/money';
import { cn } from '@/utils/cn';
import type { InventoryItem, StockStatus } from '@/types';

/**
 * THE THUMBNAIL. A 36 px tile in a bronze hairline — the product picture the reference draws
 * beside every stock row. A stock record carries no photograph, so the tile is the item's own
 * drawing: a bottle for the bottle and beverage kinds, a dish for everything else, keyed off the
 * item's name so the same item is the same picture everywhere it appears. It is unmistakably an
 * illustration; nothing here is passed off as a photograph of this venue's stock.
 */
function StockThumb({ item, className }: { item: Pick<InventoryItem, 'code' | 'name' | 'categoryName' | 'categoryKind'>; className?: string }) {
  const bottle = item.categoryKind === 'BOTTLE' || item.categoryKind === 'BEVERAGE';
  return (
    <span className={cn('block shrink-0 overflow-hidden rounded-md border border-bronze/30 bg-neutral-100', className)} aria-hidden>
      {/* The stock item's photograph (config/imagery.ts, keyed by its code), with the drawing as
          understudy — which is also what an item with no checked photo (white rum) shows. */}
      <Photo
        src={stockImage(item.code)}
        fallback={bottle
          ? <BottleArt name={item.name} category={item.categoryName} className="p-1" />
          : <DishArt name={item.name} kind={dishKindFor(item.name, { category: item.categoryName })} />}
        className="h-full w-full"
      />
    </span>
  );
}

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

  /* The category row the reference draws above the table — one chip per real category, no counts:
     the list is filtered server side by category, so the only honest figure per chip would be a
     second fetch, and the reference prints none. Same state, same query parameter as before. */
  const catOptions = useMemo<{ value: string; label: string }[]>(() => ([
    { value: '', label: 'All items' },
    ...(cats.data ?? []).map((c) => ({ value: String(c.id), label: c.name })),
  ]), [cats.data]);

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

  /** The identity cell every column set shares: the framed drawing, the name, the code. */
  const itemCell = (r: InventoryItem) => (
    <span className="flex items-center gap-3 min-w-0">
      <StockThumb item={r} className="h-9 w-9" />
      <span className="min-w-0">
        <span className="block font-medium text-neutral-900 truncate">{r.name}</span>
        <span className="block text-caption text-neutral-500 truncate">{r.code}</span>
      </span>
    </span>
  );

  const rowActions = (r: InventoryItem) => (
    <div className="flex justify-end items-center gap-1" onClick={(e) => e.stopPropagation()}>
      {canAdjust && adjustButton(r)}
      {canManage && <>
        <IconButton label={`Edit ${r.name}`} size="sm" onClick={() => { setEditing(r); setFormOpen(true); }}><Pencil className="h-4 w-4" /></IconButton>
        <IconButton label={`Delete ${r.name}`} size="sm" className="text-danger-700" onClick={() => setToDelete(r)}><Trash2 className="h-4 w-4" /></IconButton>
      </>}
    </div>
  );

  /* The reference's columns, in its order: item, category, what is on hand, the unit it is
     counted in, the level that triggers an order, the status in words — and, for the admin, the
     unit cost the valuation is built from. Every figure is tabular so a column of them lines up. */
  const columns: Column<InventoryItem>[] = [
    { key: 'name', header: 'Item', sortValue: (r) => r.name, className: 'max-w-[20rem]', render: itemCell },
    { key: 'category', header: 'Category', sortValue: (r) => r.categoryName, hideBelow: 'md', render: (r) => <span className="text-neutral-600">{r.categoryName}</span> },
    {
      key: 'qty', header: 'In stock', align: 'right', sortValue: (r) => r.currentQty,
      render: (r) => (
        <span className="block">
          <span className="block tnum font-semibold text-neutral-900 whitespace-nowrap">{r.currentQty} <span className="font-normal text-neutral-500">{r.unitCode}</span></span>
          <span className="block text-caption text-neutral-500 whitespace-nowrap tnum">{levelNote(r)}</span>
        </span>
      ),
    },
    { key: 'unit', header: 'Unit', hideBelow: 'lg', sortValue: (r) => r.unitCode, render: (r) => <span className="text-neutral-600 whitespace-nowrap">{r.unitCode}</span> },
    { key: 'reorder', header: 'Reorder at', align: 'right', hideBelow: 'lg', sortValue: (r) => r.reorderLevel, render: (r) => <span className="tnum text-neutral-600 whitespace-nowrap">{r.reorderLevel} {r.unitCode}</span> },
    { key: 'status', header: 'Status', sortValue: (r) => r.stockStatus, render: (r) => <StatusBadge kind="stock" status={r.stockStatus} size="sm" /> },
    { key: 'cost', header: 'Unit cost', align: 'right', hideBelow: 'xl', sortValue: (r) => r.avgCost, render: (r) => <span className="tnum text-neutral-700">{money(r.avgCost, { decimals: true })}</span> },
    { key: 'actions', header: <span className="sr-only">Actions</span>, align: 'right', render: rowActions },
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
    { key: 'name', header: 'Item', sortValue: (r) => r.name, className: 'max-w-[20rem]', render: itemCell },
    { key: 'category', header: 'Category', sortValue: (r) => r.categoryName, hideBelow: 'md', render: (r) => <span className="text-neutral-600">{r.categoryName}</span> },
    {
      key: 'qty', header: 'In stock', sortValue: (r) => r.currentQty, className: 'min-w-[9rem]',
      render: (r) => (
        <span className="block min-w-0">
          <span className="block tnum font-semibold text-neutral-900 whitespace-nowrap">{r.currentQty} <span className="font-normal text-neutral-500">{r.unitCode}</span></span>
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
          <span className="block text-caption text-neutral-500 whitespace-nowrap mt-0.5 tnum">{levelNote(r)}</span>
        </span>
      ),
    },
    { key: 'unit', header: 'Unit', hideBelow: 'lg', sortValue: (r) => r.unitCode, render: (r) => <span className="text-neutral-600 whitespace-nowrap">{r.unitCode}</span> },
    { key: 'reorder', header: 'Reorder level', align: 'right', hideBelow: 'md', sortValue: (r) => r.reorderLevel, render: (r) => <span className="tnum text-neutral-600 whitespace-nowrap">{r.reorderLevel} {r.unitCode}</span> },
    {
      key: 'supplier', header: 'Supplier', hideBelow: 'xl', sortValue: (r) => r.supplierName ?? '',
      /* Only where the item actually carries a supplier link — an unlinked item says so. */
      render: (r) => (r.supplierName
        ? <span className="block min-w-0 truncate text-neutral-700">{r.supplierName}</span>
        : <span className="text-neutral-400">Not linked</span>),
    },
    { key: 'status', header: 'Status', sortValue: (r) => r.stockStatus, render: (r) => <StatusBadge kind="stock" status={r.stockStatus} size="sm" /> },
    { key: 'actions', header: <span className="sr-only">Actions</span>, align: 'right', render: rowActions },
  ];

  return (
    <div>
      {/* The screen's own search, hoisted into the application header — same input, same state. */}
      <HeaderSearch>
        <SearchInput value={search} onChange={setSearch} placeholder="Search stock items…" className="w-full max-w-sm" />
      </HeaderSearch>

      <PageHeader
        title="Inventory items"
        subtitle="Stock on hand across ingredients, beverages and bottles — open an item or adjust it in place"
        actions={<>
          <Button variant="outline" leftIcon={<Download className="h-4 w-4" />} onClick={exportCsv} disabled={!rows.length}>Export</Button>
          {canManage && <Button variant="outline" leftIcon={<Layers className="h-4 w-4" />} onClick={() => setCatsOpen(true)}>Categories</Button>}
          {canAdjust && <Button variant="outline" leftIcon={<ArrowLeftRight className="h-4 w-4" />} onClick={() => setMoveFor({} as InventoryItem)}>Record movement</Button>}
          {canManage && <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setFormOpen(true); }}>Add item</Button>}
        </>}
      >
        {/* Category chips first, as the reference draws them, then the stock-status switch. Both
            are the same filters as before: category goes to the server, LOW is a view of the rows. */}
        <div className="space-y-2.5">
          <FilterChips
            ariaLabel="Filter by category"
            value={cat === '' ? '' : String(cat)}
            onChange={(v) => setCat(v === '' ? '' : Number(v))}
            options={catOptions}
          />
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <SegmentedControl ariaLabel="Filter by stock status" size="sm" value={status} onChange={setStatus} options={[{ value: '', label: 'All' }, { value: 'LOW', label: 'Low / reorder' }, { value: 'OUT', label: 'Out of stock' }, { value: 'OK', label: 'In stock' }]} />
            {filtered && <Button size="sm" variant="ghost" leftIcon={<X className="h-4 w-4" />} onClick={clearFilters}>Clear filters</Button>}
          </div>
        </div>
      </PageHeader>
      {items.isLoading && <LoadingState variant="table" rows={8} />}
      {items.isError && <ErrorState error={items.error} onRetry={() => void items.refetch()} />}
      {items.data && (
        <DataTable
          columns={ws === 'manager' ? managerColumns : columns} rows={rows} rowKey={(r) => r.id} pageSize={25}
          caption={ws === 'manager'
            ? 'Inventory items with category, quantity on hand against the reorder level, unit, reorder level, supplier and stock status'
            : 'Inventory items with category, quantity on hand, unit, reorder level, stock status and unit cost'}
          onRowClick={(r) => navigate(`/admin/inventory/items/${r.id}`)}
          toolbar={
            <p className="px-1 text-sm text-neutral-600">
              <span className="font-semibold text-neutral-900 tnum">{rows.length}</span> item{rows.length === 1 ? '' : 's'}
              {status ? <> · {statusMeta('stock', status === 'LOW' ? 'LOW' : status).label}{status === 'LOW' ? ' and reorder' : ''}</> : null}
            </p>
          }
          emptyTitle="No inventory items"
          emptyDescription={filtered ? 'No item matches these filters.' : 'Create your first ingredient, beverage or bottle.'}
          emptyAction={filtered ? <Button variant="outline" onClick={clearFilters}>Clear filters</Button> : canManage ? <Button onClick={() => setFormOpen(true)}>Add item</Button> : undefined}
          mobileCard={(r) => (
            <div className="space-y-2 min-w-0">
              <div className="flex items-start gap-3 min-w-0">
                <StockThumb item={r} className="h-10 w-10" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-neutral-900 truncate">{r.name}</p>
                  <p className="text-caption text-neutral-500 truncate">{r.code} · {r.categoryName}</p>
                </div>
                <StatusBadge kind="stock" status={r.stockStatus} size="sm" className="shrink-0" />
              </div>
              <div className="flex items-end justify-between gap-3 min-w-0">
                <p className="text-caption text-neutral-500 min-w-0 tnum">
                  <span className="block text-sm font-semibold text-neutral-900">{r.currentQty} {r.unitCode}</span>
                  {levelNote(r)} · reorder at {r.reorderLevel} {r.unitCode} · {money(r.avgCost, { decimals: true })} per {r.unitCode}
                </p>
                {canAdjust && <span className="shrink-0">{adjustButton(r)}</span>}
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
