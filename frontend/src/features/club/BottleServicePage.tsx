import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Wine, Plus, Pencil, Trash2, PackageOpen, CheckCircle2, AlertTriangle, XCircle, Link2Off } from 'lucide-react';
import { useBottleService, useClubMutations, useInventoryItems } from '@/features/p2/hooks';
import { useMenuItems } from '@/features/menu/hooks';
import { usePermission } from '@/hooks/useAuth';
import { PageHeader, Button, IconButton, Card, Modal, ConfirmDialog, Input, Select, Textarea, Switch, Badge, SegmentedControl, SearchInput, LoadingState, ErrorState, EmptyState } from '@/components/ui';
import { ApiError } from '@/services/api/client';
import { money } from '@/utils/money';
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
        <div className="grid sm:grid-cols-2 gap-4">
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

export default function BottleServicePage() {
  const navigate = useNavigate();
  const canManage = usePermission('club:manage');
  const q = useBottleService();
  const { removeBottle } = useClubMutations();
  const [form, setForm] = useState<{ editing: BottleServiceItem | null } | null>(null);
  const [toRemove, setToRemove] = useState<BottleServiceItem | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'SELLABLE' | 'BLOCKED'>('ALL');
  const [search, setSearch] = useState('');

  const all = q.data ?? [];
  const sellable = all.filter((b) => availabilityOf(b).orderable).length;
  const shown = useMemo(() => {
    const s = search.trim().toLowerCase();
    return all
      .filter((b) => {
        const a = availabilityOf(b);
        if (filter === 'SELLABLE' && !a.orderable) return false;
        if (filter === 'BLOCKED' && a.orderable) return false;
        return !s || b.menuItemName.toLowerCase().includes(s) || (b.includes ?? '').toLowerCase().includes(s) || (b.invItemName ?? '').toLowerCase().includes(s);
      })
      // Bottles that can actually be poured are read first; the rest sit at the bottom.
      .sort((a, b) => Number(availabilityOf(b).orderable) - Number(availabilityOf(a).orderable) || a.menuItemName.localeCompare(b.menuItemName));
  }, [all, filter, search]);

  return (
    <div>
      <PageHeader title="Bottle service" subtitle="Whole-bottle items for VIP tables and club guests, with stock linked per bottle" actions={<><Button variant="outline" leftIcon={<PackageOpen className="h-4 w-4" />} onClick={() => navigate('/admin/inventory/items')}>Bottle stock</Button>{canManage && <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setForm({ editing: null })}>Add item</Button>}</>}>
        {q.data && q.data.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <SegmentedControl
              size="sm"
              value={filter}
              onChange={setFilter}
              ariaLabel="Filter bottles by availability"
              options={[
                { value: 'ALL', label: 'All bottles', count: all.length },
                { value: 'SELLABLE', label: 'Can sell now', count: sellable },
                { value: 'BLOCKED', label: 'Unavailable', count: all.length - sellable },
              ]}
            />
            <SearchInput value={search} onChange={setSearch} placeholder="Bottle, mixer or stock item" className="sm:ml-auto sm:w-64" />
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
        <ul className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
          {shown.map((b) => {
            const a = availabilityOf(b);
            return (
              <li key={b.id}>
                <Card padded={false} className={a.orderable ? 'h-full flex flex-col' : 'h-full flex flex-col bg-neutral-50'}>
                  <div className="p-4 flex-1 flex flex-col">
                    <div className="flex items-start gap-2">
                      <span className="h-9 w-9 shrink-0 rounded-md bg-primary-50 text-primary-700 flex items-center justify-center" aria-hidden><Wine className="h-5 w-5" /></span>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-neutral-900 leading-snug">{b.menuItemName}</h3>
                        <p className="text-caption text-neutral-500">{b.bottleSizeMl} ml bottle</p>
                      </div>
                      <span className="text-right shrink-0">
                        <span className="block text-lg font-semibold tabular-nums text-neutral-900 leading-6">{money(b.price)}</span>
                        <span className="text-caption text-neutral-500">per bottle</span>
                      </span>
                    </div>

                    <p className="mt-3">
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
                      <IconButton label={`Remove ${b.menuItemName} from bottle service`} size="sm" className="text-danger-600" onClick={() => setToRemove(b)}><Trash2 className="h-4 w-4" /></IconButton>
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
