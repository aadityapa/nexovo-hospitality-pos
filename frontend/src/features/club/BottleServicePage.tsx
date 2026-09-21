import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Wine, Plus, Pencil, Trash2, PackageOpen, CheckCircle2, AlertTriangle, XCircle, Link2Off } from 'lucide-react';
import { useBottleService, useClubMutations, useInventoryItems } from '@/features/p2/hooks';
import { useMenuItems } from '@/features/menu/hooks';
import { usePermission } from '@/hooks/useAuth';
import { PageHeader, Button, IconButton, Card, Modal, ConfirmDialog, Input, Select, Textarea, Switch, Badge, FilterChips, SearchInput, LoadingState, ErrorState, EmptyState } from '@/components/ui';
import { BottleArt } from '@/components/graphics';
import { ApiError } from '@/services/api/client';
import { money } from '@/utils/money';
import { cn } from '@/utils/cn';
import type { BottleServiceItem, BottleServiceInput } from '@/types';

const schema = z.object({ menuItemId: z.coerce.number().min(1, 'Pick a menu item'), bottleSizeMl: z.coerce.number().int().min(50, '≥ 50 ml').max(5000), invItemId: z.coerce.number().optional(), includes: z.string().max(300).optional(), isActive: z.boolean() });
type Form = z.infer<typeof schema>;

function BottleForm({ editing, onClose }: { editing: BottleServiceItem | null; onClose: () => void }) {
  const { saveBottle } = useClubMutations();
  const menu = useMenuItems({ prepLocation: 'BAR', includeInactive: false });
  const inv = useInventoryItems({});
  const bottles = (inv.data ?? []).filter((i) => i.categoryKind === 'BOTTLE' || i.categoryKind === 'BEVERAGE');
  const { register, handleSubmit, watch, setValue, setError, formState: { errors } } = useForm<Form>({ resolver: zodResolver(schema), values: { menuItemId: editing?.menuItemId ?? 0, bottleSizeMl: editing?.bottleSizeMl ?? 750, invItemId: editing?.invItemId ?? undefined, includes: editing?.includes ?? '', isActive: editing?.isActive ?? true } });
  const onSubmit = async (v: Form) => {
    const body: BottleServiceInput = { bottleSizeMl: v.bottleSizeMl, invItemId: v.invItemId || null, includes: v.includes || undefined, isActive: v.isActive };
    try { await saveBottle.mutateAsync({ menuItemId: v.menuItemId, body }); onClose(); }
    catch (e) { const err = ApiError.from(e); setError((err.errors.find((x) => x.field)?.field as keyof Form) ?? 'menuItemId', { message: err.message }); }
  };
  return (
    <Modal open onClose={onClose} size="md" title={editing ? `Edit ${editing.menuItemName}` : 'Add bottle service item'} description="A bottle-service item is a bar menu item sold as a whole bottle. Linking it to an inventory bottle deducts one bottle per unit sold." footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={handleSubmit(onSubmit)} loading={saveBottle.isPending}>{editing ? 'Save' : 'Add'}</Button></>}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Select label="Bar menu item" required placeholder={menu.isLoading ? 'Loading…' : 'Select menu item'} disabled={!!editing} options={(menu.data ?? []).map((m) => ({ value: m.id, label: `${m.name} · ${money(m.price)}` }))} error={errors.menuItemId?.message} hint="Only items prepared at the BAR are eligible" {...register('menuItemId')} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Bottle size (ml)" required type="number" min={50} step={50} error={errors.bottleSizeMl?.message} {...register('bottleSizeMl')} />
          <Select label="Inventory bottle" placeholder="Not tracked in stock" options={bottles.map((b) => ({ value: b.id, label: `${b.name} · ${b.currentQty} ${b.unitCode} in stock` }))} error={errors.invItemId?.message} {...register('invItemId')} />
        </div>
        <Textarea label="Includes" rows={2} placeholder="Mixers, ice bucket, 4 glasses, dedicated server" error={errors.includes?.message} {...register('includes')} />
        <Switch checked={watch('isActive')} onChange={(v) => setValue('isActive', v)} label="Available for bottle service" description="Inactive items stay on the menu but lose the bottle-service badge and stock link" />
      </form>
    </Modal>
  );
}

type Availability = { tone: 'success' | 'warning' | 'danger' | 'neutral'; label: string; icon: ReactNode; orderable: boolean };

/**
 * One honest answer to "can I sell this bottle right now?", built only from what the
 * bottle-service query already returns. Stock is only claimed when it is actually tracked.
 */
function availabilityOf(b: BottleServiceItem): Availability {
  if (!b.isActive) return { tone: 'neutral', label: 'Not offered', icon: <XCircle className="h-3.5 w-3.5" aria-hidden />, orderable: false };
  if (!b.isAvailable) return { tone: 'danger', label: 'Off the menu', icon: <XCircle className="h-3.5 w-3.5" aria-hidden />, orderable: false };
  if (b.bottlesInStock == null) return { tone: 'neutral', label: 'Stock not tracked', icon: <Link2Off className="h-3.5 w-3.5" aria-hidden />, orderable: true };
  if (b.bottlesInStock <= 0) return { tone: 'danger', label: 'Out of stock', icon: <XCircle className="h-3.5 w-3.5" aria-hidden />, orderable: false };
  if (b.bottlesInStock <= 3) return { tone: 'warning', label: `Only ${b.bottlesInStock} left`, icon: <AlertTriangle className="h-3.5 w-3.5" aria-hidden />, orderable: true };
  return { tone: 'success', label: `${b.bottlesInStock} in stock`, icon: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />, orderable: true };
}

/**
 * THE FACET ROW.
 *
 * The reference draws category chips above this grid. `bottle-service` returns no category for a
 * bottle — the payload is the menu item's name and price, the bottle size, the linked stock item
 * and the two availability flags — so the chips carry the facet the record ACTUALLY holds, which
 * is stock. Every count below is a count of real rows; nothing is bucketed by a field that does
 * not exist.
 */
type Facet = 'ALL' | 'SELLABLE' | 'LOW' | 'OUT' | 'BLOCKED';

const tracked = (b: BottleServiceItem) => b.bottlesInStock != null;
const isLow = (b: BottleServiceItem) => tracked(b) && b.bottlesInStock! > 0 && b.bottlesInStock! <= 3;
const isOut = (b: BottleServiceItem) => tracked(b) && b.bottlesInStock! <= 0;

function matchesFacet(facet: Facet, b: BottleServiceItem): boolean {
  switch (facet) {
    case 'SELLABLE': return availabilityOf(b).orderable;
    case 'LOW': return isLow(b);
    case 'OUT': return isOut(b);
    case 'BLOCKED': return !availabilityOf(b).orderable;
    default: return true;
  }
}

export default function BottleServicePage() {
  const navigate = useNavigate();
  const canManage = usePermission('club:manage');
  const q = useBottleService();
  const { removeBottle } = useClubMutations();
  const [form, setForm] = useState<{ editing: BottleServiceItem | null } | null>(null);
  const [toRemove, setToRemove] = useState<BottleServiceItem | null>(null);
  const [filter, setFilter] = useState<Facet>('ALL');
  const [search, setSearch] = useState('');

  const all = q.data ?? [];
  const sellable = all.filter((b) => availabilityOf(b).orderable).length;
  const shown = useMemo(() => {
    const s = search.trim().toLowerCase();
    return all
      .filter((b) => {
        if (!matchesFacet(filter, b)) return false;
        return !s || b.menuItemName.toLowerCase().includes(s) || (b.includes ?? '').toLowerCase().includes(s) || (b.invItemName ?? '').toLowerCase().includes(s);
      })
      // Bottles that can actually be poured are read first; the rest sit at the bottom.
      .sort((a, b) => Number(availabilityOf(b).orderable) - Number(availabilityOf(a).orderable) || a.menuItemName.localeCompare(b.menuItemName));
  }, [all, filter, search]);

  return (
    <div>
      <PageHeader title="Bottle service" subtitle="Whole-bottle items for VIP tables and club guests, with stock linked per bottle" actions={<><Button variant="outline" leftIcon={<PackageOpen className="h-4 w-4" />} onClick={() => navigate('/admin/inventory/items')}>Bottle stock</Button>{canManage && <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setForm({ editing: null })}>Add item</Button>}</>}>
        {q.data && q.data.length > 0 && (
          <div className="flex flex-col lg:flex-row lg:items-center gap-3 min-w-0">
            <FilterChips
              value={filter}
              onChange={setFilter}
              ariaLabel="Filter bottles by stock"
              options={[
                { value: 'ALL', label: 'All bottles', count: all.length },
                { value: 'SELLABLE', label: 'Can sell now', count: sellable },
                { value: 'LOW', label: 'Low stock', count: all.filter(isLow).length },
                { value: 'OUT', label: 'Out of stock', count: all.filter(isOut).length },
                { value: 'BLOCKED', label: 'Unavailable', count: all.length - sellable },
              ]}
            />
            <SearchInput value={search} onChange={setSearch} placeholder="Bottle, mixer or stock item" className="lg:ml-auto lg:w-64" />
          </div>
        )}
      </PageHeader>

      {q.isLoading && <LoadingState variant="cards" rows={2} />}
      {q.isError && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      {q.data && (all.length === 0 ? (
        <Card padded={false}>
          <EmptyState icon={<Wine className="h-6 w-6" />} title="No bottle-service items" description="Pick a bar menu item and mark it as a whole bottle." action={canManage ? <Button onClick={() => setForm({ editing: null })}>Add item</Button> : undefined} />
        </Card>
      ) : shown.length === 0 ? (
        <Card padded={false}>
          <EmptyState compact icon={<Wine className="h-6 w-6" />} title="No bottles match" description="Clear the search or switch back to all bottles." action={<Button variant="outline" onClick={() => { setSearch(''); setFilter('ALL'); }}>Show all bottles</Button>} />
        </Card>
      ) : (
        /* Base `grid-cols-1`, and every prefixed track is `minmax(0,1fr)` — an implicit auto
           track sizes to the widest bottle name and drags the grid past a 360 px viewport. */
        <ul className="grid grid-cols-1 xs:grid-cols-[repeat(2,minmax(0,1fr))] lg:grid-cols-[repeat(3,minmax(0,1fr))] xl:grid-cols-[repeat(4,minmax(0,1fr))] gap-4">
          {shown.map((b) => {
            const a = availabilityOf(b);
            return (
              <li key={b.id} className="min-w-0">
                {/*
                  A bottle that cannot be poured recedes to the page's own ground instead of
                  taking a tint: on the dark palette a quieter card is a darker one.

                  MATERIAL. The gloss is part of that same signal and is spent only on the
                  bottles that can actually be sold — a pourable bottle catches light, a blocked
                  one is a flat card on the page ground. It is gloss alone: `.material-edge` is a
                  `box-shadow` and would replace the `shadow-card` these cards sit on, and the
                  grain belongs to one large slab per screen, not to a grid of tiles.

                  Deliberately NOT `.fill-vip`: violet means VIP CLASSIFICATION in this product
                  (a VIP table, a VIP booking), and a bottle-service item is a menu item that any
                  guest can order. Washing the list violet would claim a tier the data does not
                  carry.
                */}
                <Card padded={false} className={cn('h-full flex flex-col overflow-hidden', a.orderable ? 'material-gloss' : 'bg-surface')}>
                  {/* A DRAWN bottle on a quiet tinted ground — `neutral-50` is the rung that
                      sits BELOW the card in both themes, so the image area reads as a recess
                      rather than a second card. The drawing is deterministic on the item's own
                      name, so the same bottle is the same picture everywhere it appears. */}
                  <div className={cn('aspect-[3/4] border-b border-neutral-200 bg-neutral-50 overflow-hidden', !a.orderable && 'opacity-60')}>
                    <BottleArt name={b.menuItemName} />
                  </div>

                  <div className="p-4 flex-1 flex flex-col min-w-0">
                    <h3 className="font-semibold text-neutral-900 leading-snug break-words">{b.menuItemName}</h3>
                    {/* The record carries no category, so this line is what it DOES carry. */}
                    <p className="text-[12px] text-neutral-500 mt-0.5 leading-snug">{b.bottleSizeMl} ml bottle{b.invItemName ? ` · ${b.invItemName}` : ''}</p>

                    <p className={cn('mt-2 text-lg font-semibold tabular-nums leading-6', a.orderable ? 'text-neutral-900' : 'text-neutral-500')}>
                      {money(b.price)}<span className="text-caption font-normal text-neutral-500"> per bottle</span>
                    </p>

                    <p className="mt-2.5">
                      <Badge tone={a.tone} icon={a.icon}>{a.label}</Badge>
                      {!b.isActive && b.isAvailable && <span className="sr-only">This item is not currently offered as bottle service.</span>}
                    </p>

                    {b.includes && <p className="mt-2 text-sm text-neutral-600 leading-snug">Includes: {b.includes}</p>}

                    <p className="mt-auto pt-3 text-caption text-neutral-500">
                      {b.invItemName ? <>Stock: {b.invItemName} — 1 bottle deducted per unit sold</> : 'Not linked to inventory — sales do not move stock'}
                    </p>
                  </div>

                  {canManage && (
                    <div className="border-t border-neutral-200 px-3 py-2 flex items-center justify-end gap-1">
                      <IconButton label={`Edit ${b.menuItemName}`} size="sm" onClick={() => setForm({ editing: b })}><Pencil className="h-4 w-4" /></IconButton>
                      <IconButton label={`Remove ${b.menuItemName} from bottle service`} size="sm" className="text-danger-700" onClick={() => setToRemove(b)}><Trash2 className="h-4 w-4" /></IconButton>
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      ))}
      {form && <BottleForm editing={form.editing} onClose={() => setForm(null)} />}
      <ConfirmDialog open={!!toRemove} onClose={() => setToRemove(null)} variant="danger" title={`Remove ${toRemove?.menuItemName} from bottle service?`} message="The menu item itself is kept; only the bottle-service flag and stock link are removed." confirmLabel="Remove" loading={removeBottle.isPending} onConfirm={async () => { if (toRemove) { try { await removeBottle.mutateAsync(toRemove.menuItemId); } finally { setToRemove(null); } } }} />
    </div>
  );
}
