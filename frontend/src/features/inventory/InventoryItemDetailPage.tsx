import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Pencil, ArrowLeftRight, Package, ShoppingCart, ChevronLeft, ChevronRight, Building2, Phone, Mail, MapPin, Wallet, Ruler } from 'lucide-react';
import { useInventoryItem, useItemMovements, useRecipeCosting, useSupplierHistory } from '@/features/p2/hooks';
import { InventoryItemForm, MovementForm } from './InventoryForms';
import { usePermission } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useSurface';
import { useRealtimeInvalidate } from '@/hooks/useRealtime';
import { Button, Card, CardHeader, StatCard, StatusBadge, Badge, KeyValue, DataTable, Alert, LoadingState, ErrorState, EmptyState, SegmentedControl, ItemImage, type Column } from '@/components/ui';
import { StockLevel } from '@/components/graphics';
import { money } from '@/utils/money';
import { fmtDateTime } from '@/utils/date';
import { MOVEMENT_LABELS } from '@/config/statuses';
import { cn } from '@/utils/cn';
import type { StockMovement } from '@/types';

type Tab = 'overview' | 'movements' | 'suppliers';

export default function InventoryItemDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const ws = useWorkspace();
  const item = useInventoryItem(Number(id));
  const movements = useItemMovements(Number(id), { limit: 200 });
  const recipes = useRecipeCosting();
  const canManage = usePermission('inventory:manage');
  const canAdjust = usePermission('inventory:adjust');
  const canSuppliers = usePermission('suppliers:view');
  /* The supplier record is only fetched when this item actually has one AND the signed-in role
     may read suppliers — a kitchen account has `inventory:view` and no supplier access at all. */
  const supplierId = item.data?.supplierId ?? undefined;
  const supplier = useSupplierHistory(canSuppliers && supplierId ? supplierId : undefined);
  const [tab, setTab] = useState<Tab>('overview');
  const [edit, setEdit] = useState(false);
  const [move, setMove] = useState(false);
  useRealtimeInvalidate(['inventory']);

  if (item.isLoading) return <LoadingState variant="page" />;
  if (item.isError || !item.data) return <ErrorState error={item.error} onRetry={() => void item.refetch()} />;
  const i = item.data;
  const shortBy = Math.max(0, i.minQty - i.currentQty);
  const kindLabel = i.categoryKind.replace('_', ' ').toLowerCase();

  const columns: Column<StockMovement>[] = [
    { key: 'when', header: 'Date & time', sortValue: (m) => m.createdAt, render: (m) => <span className="text-neutral-600 whitespace-nowrap">{fmtDateTime(m.createdAt)}</span> },
    { key: 'type', header: 'Type', sortValue: (m) => m.type, render: (m) => <Badge size="sm" tone={m.qty > 0 ? 'success' : m.type === 'WASTAGE' || m.type === 'DAMAGE' ? 'danger' : 'neutral'}>{MOVEMENT_LABELS[m.type]}</Badge> },
    { key: 'qty', header: 'Quantity', align: 'right', sortValue: (m) => m.qty, render: (m) => <span className={cn('tabular-nums font-semibold whitespace-nowrap', m.qty > 0 ? 'text-success-700' : 'text-danger-700')}>{m.qty > 0 ? '+' : '−'}{Math.abs(m.qty)} {m.unitCode}</span> },
    { key: 'after', header: 'Balance after', align: 'right', hideBelow: 'md', sortValue: (m) => m.qtyAfter, render: (m) => <span className="tabular-nums text-neutral-600 whitespace-nowrap">{m.qtyBefore} → <span className="text-neutral-900 font-medium">{m.qtyAfter}</span></span> },
    { key: 'cost', header: 'Cost', align: 'right', hideBelow: 'md', sortValue: (m) => m.totalCost, render: (m) => <span className="tabular-nums">{money(m.totalCost)}</span> },
    { key: 'ref', header: 'Reference / reason', hideBelow: 'lg', render: (m) => <span className="text-neutral-600">{m.refType ? `${m.refType} #${m.refId ?? ''} · ` : ''}{m.reason}</span> },
    { key: 'by', header: 'User', hideBelow: 'lg', render: (m) => <span className="text-neutral-600">{m.createdByName ?? 'system'}</span> },
  ];
  const usedIn = (recipes.data ?? []).filter((r) => r.ingredientCount > 0);

  const movementTable = movements.isLoading ? <div className="p-5"><LoadingState rows={4} /></div> : (
    <DataTable
      columns={columns} rows={movements.data ?? []} rowKey={(m) => m.id} pageSize={20}
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
  );

  /** The linked supplier, or an honest account of why there is nothing to show. */
  const supplierPanel = () => {
    if (!i.supplierId) {
      return (
        <Card padded={false}>
          <EmptyState
            compact icon={<Building2 className="h-6 w-6" />}
            title="No preferred supplier"
            description="Set one on the item and new purchase orders will default to it."
            action={canManage ? <Button variant="outline" leftIcon={<Pencil className="h-4 w-4" />} onClick={() => setEdit(true)}>Edit item</Button> : undefined}
          />
        </Card>
      );
    }
    if (!canSuppliers) {
      return (
        <Card>
          <CardHeader title="Preferred supplier" subtitle="Who this item is bought from" />
          <p className="text-sm text-neutral-900 font-medium">{i.supplierName}</p>
          <p className="text-caption text-neutral-500 mt-1">Contact details need supplier access — ask a manager.</p>
        </Card>
      );
    }
    if (supplier.isLoading) return <Card><LoadingState rows={4} /></Card>;
    if (supplier.isError || !supplier.data) return <ErrorState error={supplier.error} onRetry={() => void supplier.refetch()} compact />;
    const s = supplier.data.supplier;
    return (
      <Card>
        <CardHeader
          title="Preferred supplier"
          subtitle="Who this item is bought from"
          action={<Button size="sm" variant="outline" rightIcon={<ChevronRight className="h-4 w-4" />} onClick={() => navigate(`/admin/suppliers/${s.id}`)}>Open supplier</Button>}
        />
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <p className="text-[15px] font-semibold text-neutral-900 min-w-0 break-words">{s.name}</p>
          <StatusBadge kind="supplier" status={s.status} size="sm" />
          <Badge tone="neutral" size="sm">{s.code}</Badge>
        </div>
        <ul className="space-y-2 text-sm">
          {s.contactPerson && (
            <li className="flex items-start gap-2.5 min-w-0">
              <Building2 className="h-4 w-4 mt-0.5 text-neutral-400 shrink-0" aria-hidden />
              <span className="min-w-0 break-words"><span className="sr-only">Contact person: </span>{s.contactPerson}</span>
            </li>
          )}
          {s.phone && (
            <li className="flex items-start gap-2.5 min-w-0">
              <Phone className="h-4 w-4 mt-0.5 text-neutral-400 shrink-0" aria-hidden />
              <a href={`tel:${s.phone}`} className="text-primary-700 hover:underline underline-offset-2 break-words">{s.phone}</a>
            </li>
          )}
          {s.email && (
            <li className="flex items-start gap-2.5 min-w-0">
              <Mail className="h-4 w-4 mt-0.5 text-neutral-400 shrink-0" aria-hidden />
              <a href={`mailto:${s.email}`} className="text-primary-700 hover:underline underline-offset-2 break-words">{s.email}</a>
            </li>
          )}
          {s.address && (
            <li className="flex items-start gap-2.5 min-w-0">
              <MapPin className="h-4 w-4 mt-0.5 text-neutral-400 shrink-0" aria-hidden />
              <span className="min-w-0 break-words text-neutral-600">{s.address}</span>
            </li>
          )}
          <li className="flex items-start gap-2.5 min-w-0">
            <Wallet className="h-4 w-4 mt-0.5 text-neutral-400 shrink-0" aria-hidden />
            <span className="min-w-0 text-neutral-600">
              Payment terms {s.paymentTermsDays} day{s.paymentTermsDays === 1 ? '' : 's'} · outstanding <span className="tabular-nums font-medium text-neutral-900">{money(s.outstanding)}</span>
            </span>
          </li>
        </ul>
      </Card>
    );
  };

  return (
    <div>
      {/* The back link the reference draws — one route out of the document, to the list it came from. */}
      <Link
        to="/admin/inventory/items"
        className="inline-flex items-center gap-1.5 text-[13px] text-neutral-500 hover:text-neutral-900 transition-colors duration-fast mb-3 min-h-touch"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Back to stock items
      </Link>

      {/* IDENTITY. Picture-led, as the board draws it: what the thing is, then what state it is in. */}
      <Card className="mb-4">
        <div className="flex flex-col sm:flex-row gap-5 min-w-0">
          {/* The manager board leads the document with a large product picture; the admin board
              leads with a thumbnail beside the facts. Same drawing, same source, wider frame. */}
          <ItemImage
            src={null} alt={i.name} category={i.categoryName}
            rounded="rounded-md" className={cn('w-full aspect-[4/3] shrink-0', ws === 'manager' ? 'sm:w-64' : 'sm:w-44')}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-heading sm:text-display text-neutral-900 font-semibold tracking-[-0.02em] leading-tight break-words">{i.name}</h1>
                <p className="text-[13px] text-neutral-500 mt-1">{i.code} · {kindLabel}</p>
              </div>
              {/* The action itself is identical in both workspaces — it opens `MovementForm` and
                  is gated on `inventory:adjust`. The manager board leads with it in gold and
                  calls it by the name the board uses; the admin board leads with Edit. */}
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {ws === 'manager' ? (
                  <>
                    {canAdjust && <Button leftIcon={<ArrowLeftRight className="h-4 w-4" />} onClick={() => setMove(true)}>Adjust stock</Button>}
                    {canManage && <Button variant="outline" leftIcon={<Pencil className="h-4 w-4" />} onClick={() => setEdit(true)}>Edit</Button>}
                  </>
                ) : (
                  <>
                    {canAdjust && <Button variant="outline" leftIcon={<ArrowLeftRight className="h-4 w-4" />} onClick={() => setMove(true)}>Record movement</Button>}
                    {canManage && <Button leftIcon={<Pencil className="h-4 w-4" />} onClick={() => setEdit(true)}>Edit</Button>}
                  </>
                )}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <StatusBadge kind="stock" status={i.stockStatus} />
              <Badge tone="neutral" size="sm" icon={<Package className="h-3 w-3" aria-hidden />}>{i.categoryName}</Badge>
              <Badge tone="neutral" size="sm" icon={<Ruler className="h-3 w-3" aria-hidden />}>Counted in {i.unitCode}</Badge>
              {!i.isActive && <Badge tone="neutral" size="sm">Inactive</Badge>}
            </div>
          </div>
        </div>
      </Card>

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

      {/* The four facts a stock decision is taken against. Base `grid-cols-1` declared. */}
      <div className="grid grid-cols-1 xs:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        <StatCard
          label="Current stock"
          value={<>{i.currentQty} <span className="text-base font-semibold text-neutral-500">{i.unitCode}</span></>}
          icon={<Package className="h-5 w-5" />}
          tone={i.stockStatus === 'OUT' ? 'danger' : i.stockStatus === 'OK' ? 'success' : 'warning'}
          hint={shortBy > 0 ? `Short ${Number(shortBy.toFixed(3))} ${i.unitCode} of the minimum` : `Minimum ${i.minQty} ${i.unitCode}`}
        />
        <StatCard label="Reorder at" value={<>{i.reorderLevel} <span className="text-base font-semibold text-neutral-500">{i.unitCode}</span></>} tone="neutral" hint={i.maxQty ? `Maximum level ${i.maxQty} ${i.unitCode}` : 'No maximum level set'} />
        <StatCard label="Unit cost" value={money(i.avgCost, { decimals: true })} tone="neutral" hint={`Weighted average · last purchase ${money(i.costPrice, { decimals: true })}`} />
        <StatCard label="Total value" value={money(i.stockValue)} tone="neutral" hint="On-hand quantity at average cost" />
      </div>

      <SegmentedControl
        ariaLabel="Inventory item sections"
        className="mb-4"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'overview', label: 'Overview' },
          { value: 'movements', label: 'Stock movements', count: movements.data?.length },
          { value: 'suppliers', label: 'Suppliers' },
        ]}
      />

      {/*
       * THE MANAGER OVERVIEW.
       *
       * The manager board puts the identifiers and the supplier in a narrow left column and gives
       * the rest of the row to stock itself: the figure on the shelf, a bar drawn to scale against
       * the levels that trigger an order, and the verdict in words. `StockLevel` draws all three
       * from the item's own figures and the server's own `stockStatus`, so the bar, the sentence
       * and the badge at the top of the page can never disagree.
       *
       * The item record carries no description field, so the board's line of description is the
       * code, the kind and the category — which is what this product actually stores.
       */}
      {tab === 'overview' && ws === 'manager' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] items-start">
          <div className="space-y-4 min-w-0">
            <Card>
              <CardHeader title="Item details" subtitle="How this item is identified and counted" />
              <KeyValue items={[
                { label: 'SKU', value: <span className="font-mono text-[13px]">{i.code}</span> },
                { label: 'Category', value: i.categoryName },
                { label: 'Kind', value: <span className="capitalize">{kindLabel}</span> },
                { label: 'Stock unit', value: i.unitCode },
                { label: 'Pack size', value: i.packSize ? `${i.packSize} per ${i.unitCode}` : '—' },
                { label: 'Negative stock', value: i.allowNegative ? 'Allowed' : 'Blocked — sales stop at zero' },
              ]} />
            </Card>

            <Card>
              <CardHeader title="Supplier" subtitle="Who this item is bought from" />
              {!i.supplierId ? (
                <p className="text-sm text-neutral-500">
                  No preferred supplier set. Set one on the item and new purchase orders will default to it.
                </p>
              ) : (
                <>
                  <p className="text-sm font-medium text-neutral-900 break-words">{i.supplierName}</p>
                  {canSuppliers ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-3"
                      rightIcon={<ChevronRight className="h-4 w-4" />}
                      onClick={() => navigate(`/admin/suppliers/${i.supplierId}`)}
                    >
                      View supplier
                    </Button>
                  ) : (
                    <p className="text-caption text-neutral-500 mt-1">Contact details need supplier access — ask a manager.</p>
                  )}
                </>
              )}
            </Card>
          </div>

          <Card className="min-w-0">
            <CardHeader
              title="Stock information"
              subtitle="What is on the shelf, against the levels that trigger an order"
              action={<StatusBadge kind="stock" status={i.stockStatus} size="sm" />}
            />
            <p className="text-metric tabular-nums text-neutral-900 leading-none">
              {i.currentQty} <span className="text-base font-semibold text-neutral-500">{i.unitCode}</span>
            </p>
            <p className="text-caption text-neutral-500 mt-1">On hand · last movement {fmtDateTime(i.lastMovementAt)}</p>

            {/* Proportional bar, the reorder and minimum marks, and the verdict in words —
                all derived from this item's own figures and the server's own stock status. */}
            <StockLevel
              className="mt-4"
              currentQty={i.currentQty}
              minQty={i.minQty}
              reorderLevel={i.reorderLevel}
              maxQty={i.maxQty}
              unitCode={i.unitCode}
              status={i.stockStatus}
            />

            <KeyValue className="mt-4" items={[
              { label: 'Reorder at', value: <span className="tabular-nums">{i.reorderLevel} {i.unitCode}</span> },
              { label: 'Minimum level', value: <span className="tabular-nums">{i.minQty} {i.unitCode}</span> },
              { label: 'Maximum level', value: i.maxQty ? <span className="tabular-nums">{i.maxQty} {i.unitCode}</span> : '—' },
              { label: 'Unit cost', value: <span className="tabular-nums">{money(i.avgCost, { decimals: true })} <span className="text-neutral-500">weighted average</span></span> },
              { label: 'Total value', value: <span className="tabular-nums font-semibold">{money(i.stockValue)}</span> },
            ]} />
          </Card>
        </div>
      )}

      {tab === 'overview' && ws !== 'manager' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start">
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
          <div className="space-y-4 min-w-0">
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
      )}

      {tab === 'movements' && (
        <Card padded={false}>
          <CardHeader className="p-5 pb-0" title="Movement history" subtitle="Every stock change, newest first — quantities are never overwritten" />
          <div className="mt-3">{movementTable}</div>
        </Card>
      )}

      {tab === 'suppliers' && supplierPanel()}

      {edit && <InventoryItemForm editing={i} onClose={() => setEdit(false)} />}
      {move && <MovementForm item={i} onClose={() => setMove(false)} />}
    </div>
  );
}
