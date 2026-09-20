import { useMemo, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Building2, Plus, Pencil, Store, Check, CheckCircle2, CircleSlash, LayoutGrid, Armchair, MapPin, ArrowUpRight } from 'lucide-react';
import { useBranches, useOutlets, useBranchMutations } from '@/features/p2/hooks';
import { usePermission } from '@/hooks/useAuth';
import { useAuthStore } from '@/store/authStore';
import { PageHeader, Button, Card, CardHeader, Modal, Input, Select, Switch, Badge, IconButton, LoadingState, ErrorState, EmptyState, StatCard, SearchInput, Skeleton } from '@/components/ui';
import { ApiError } from '@/services/api/client';
import { cn } from '@/utils/cn';
import type { BranchSummary, BranchCreateInput, Outlet, OutletInput, OutletType } from '@/types';

const branchSchema = z.object({ code: z.string().trim().min(2).max(20).regex(/^[A-Z0-9_-]+$/i, 'Letters, digits, - and _ only'), businessName: z.string().trim().min(2).max(150), name: z.string().trim().min(2).max(100), city: z.string().max(80).optional(), address: z.string().max(300).optional(), phone: z.string().max(30).optional(), gstNumber: z.string().max(30).optional(), isActive: z.boolean() });
type BranchForm = z.infer<typeof branchSchema>;
const OUTLET_TYPES: OutletType[] = ['RESTAURANT', 'BAR', 'CLUB', 'CAFE', 'LOUNGE', 'ROOM_SERVICE', 'BANQUET'];
const outletSchema = z.object({ code: z.string().trim().min(2).max(20), name: z.string().trim().min(2).max(100), outletType: z.enum(['RESTAURANT', 'BAR', 'CLUB', 'CAFE', 'LOUNGE', 'ROOM_SERVICE', 'BANQUET']), isActive: z.boolean() });
type OutletForm = z.infer<typeof outletSchema>;

const outletTypeLabel = (t: OutletType) => t.charAt(0) + t.slice(1).toLowerCase().replace('_', ' ');

function BranchFormModal({ editing, onClose }: { editing: BranchSummary | null; onClose: () => void }) {
  const { saveBranch } = useBranchMutations();
  const { register, handleSubmit, watch, setValue, setError, formState: { errors } } = useForm<BranchForm>({ resolver: zodResolver(branchSchema), values: { code: editing?.code ?? '', businessName: editing?.businessName ?? '', name: editing?.name ?? '', city: editing?.city ?? '', address: '', phone: '', gstNumber: '', isActive: editing?.isActive ?? true } });
  const onSubmit = async (v: BranchForm) => {
    const body: BranchCreateInput = { code: v.code.toUpperCase(), businessName: v.businessName, name: v.name, city: v.city || undefined, address: v.address || undefined, phone: v.phone || undefined, gstNumber: v.gstNumber || undefined, isActive: v.isActive };
    try { await saveBranch.mutateAsync({ id: editing?.id ?? null, body }); onClose(); }
    catch (e) { const err = ApiError.from(e); setError((err.errors.find((x) => x.field)?.field as keyof BranchForm) ?? 'code', { message: err.message }); }
  };
  return (
    <Modal open onClose={onClose} size="lg" title={editing ? `Edit ${editing.name}` : 'New branch'} description="A branch has its own tables, menu prices, staff, inventory and settings. Tax groups and roles are shared by the organization." footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={handleSubmit(onSubmit)} loading={saveBranch.isPending}>{editing ? 'Save' : 'Create branch'}</Button></>}>
      <form onSubmit={handleSubmit(onSubmit)} className="grid sm:grid-cols-2 gap-4" noValidate>
        <Input label="Code" required placeholder="MUM, HYD" disabled={!!editing} hint={editing ? 'The code is fixed once the branch exists' : 'Short identifier used on reports and the branch switcher'} error={errors.code?.message} {...register('code')} />
        <Input label="Branch name" required placeholder="Bandra West" error={errors.name?.message} {...register('name')} />
        <Input label="Business name (on receipts)" required wrapperClassName="sm:col-span-2" error={errors.businessName?.message} {...register('businessName')} />
        <Input label="City" error={errors.city?.message} {...register('city')} />
        <Input label="Phone" error={errors.phone?.message} {...register('phone')} />
        {!editing && <><Input label="Address" wrapperClassName="sm:col-span-2" error={errors.address?.message} {...register('address')} /><Input label="GST number" error={errors.gstNumber?.message} {...register('gstNumber')} /></>}
        <div className="self-end pb-2"><Switch checked={watch('isActive')} onChange={(v) => setValue('isActive', v)} label="Active" description="Inactive branches cannot be selected by staff" /></div>
      </form>
    </Modal>
  );
}

function OutletFormModal({ editing, onClose }: { editing: Outlet | null; onClose: () => void }) {
  const { saveOutlet } = useBranchMutations();
  const { register, handleSubmit, watch, setValue, setError, formState: { errors } } = useForm<OutletForm>({ resolver: zodResolver(outletSchema), values: { code: editing?.code ?? '', name: editing?.name ?? '', outletType: editing?.outletType ?? 'RESTAURANT', isActive: editing?.isActive ?? true } });
  const onSubmit = async (v: OutletForm) => {
    const body: OutletInput = { code: v.code.toUpperCase(), name: v.name, outletType: v.outletType, isActive: v.isActive };
    try { await saveOutlet.mutateAsync({ id: editing?.id ?? null, body }); onClose(); }
    catch (e) { const err = ApiError.from(e); setError((err.errors.find((x) => x.field)?.field as keyof OutletForm) ?? 'code', { message: err.message }); }
  };
  return (
    <Modal open onClose={onClose} size="md" title={editing ? `Edit ${editing.name}` : 'New outlet'} description="Outlets group floors inside a branch (restaurant, bar, club, room service…). A new outlet is created in the branch selected in the header." footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={handleSubmit(onSubmit)} loading={saveOutlet.isPending}>{editing ? 'Save' : 'Create outlet'}</Button></>}>
      <form onSubmit={handleSubmit(onSubmit)} className="grid sm:grid-cols-2 gap-4" noValidate>
        <Input label="Code" required disabled={!!editing} error={errors.code?.message} {...register('code')} />
        <Input label="Name" required error={errors.name?.message} {...register('name')} />
        <Select label="Type" required options={OUTLET_TYPES.map((t) => ({ value: t, label: outletTypeLabel(t) }))} error={errors.outletType?.message} {...register('outletType')} />
        <div className="self-end pb-2"><Switch checked={watch('isActive')} onChange={(v) => setValue('isActive', v)} label="Active" description="Inactive outlets keep their floors but are hidden from pickers" /></div>
      </form>
    </Modal>
  );
}

/** One fact with its own label, so a row of numbers is never left to guesswork. */
function Fact({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <span className="text-neutral-400 shrink-0" aria-hidden>{icon}</span>
      <span className="text-neutral-500">{label}</span>
      <span className="font-medium text-neutral-800 tabular-nums truncate">{value}</span>
    </span>
  );
}

export default function BranchesPage() {
  const canManage = usePermission('branches:manage');
  const currentId = useAuthStore((s) => s.branchId);
  const branches = useBranches();
  const outlets = useOutlets();
  const [branchForm, setBranchForm] = useState<{ editing: BranchSummary | null } | null>(null);
  const [outletForm, setOutletForm] = useState<{ editing: Outlet | null } | null>(null);
  const [search, setSearch] = useState('');

  const isCurrent = (b: BranchSummary) => b.isCurrent || b.id === currentId;
  const all = useMemo(() => branches.data ?? [], [branches.data]);

  /** Current branch first, then active branches by name, then the inactive ones. */
  const sorted = useMemo(() => [...all].sort((a, b) => {
    if (isCurrent(a) !== isCurrent(b)) return isCurrent(a) ? -1 : 1;
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return a.name.localeCompare(b.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [all, currentId]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((b) => [b.name, b.code, b.businessName, b.city ?? ''].some((v) => v.toLowerCase().includes(q)));
  }, [sorted, search]);

  const current = all.find(isCurrent) ?? null;
  const activeCount = all.filter((b) => b.isActive).length;
  const totalTables = all.reduce((a, b) => a + b.tableCount, 0);
  const outletRows = outlets.data ?? [];

  return (
    <div>
      <PageHeader
        title="Branches & outlets"
        subtitle="Organization → branch → outlet → floor → table"
        actions={canManage && <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setBranchForm({ editing: null })}>New branch</Button>}
      />

      {/*
        THE CURRENT BRANCH, unmistakably. Every list, till and report on the site is scoped to
        it, so it gets a panel of its own above everything else — not a colour on one row —
        carrying its operating facts and the one sentence that explains how to change it.
      */}
      <Card className="mb-4 border-primary-200 bg-primary-50/40">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4 min-w-0">
          <span className="h-12 w-12 rounded-md bg-primary-600 text-white font-bold text-sm flex items-center justify-center shrink-0" aria-hidden>
            {current?.code ?? '—'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-label uppercase text-primary-700 flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" aria-hidden />You are working in
            </p>
            {branches.isLoading ? (
              <div className="mt-1.5 space-y-2" role="status" aria-busy="true">
                <span className="sr-only">Loading the current branch…</span>
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-64 max-w-full" />
              </div>
            ) : (
              <>
                <h2 className="text-subheading text-neutral-900 mt-0.5 flex flex-wrap items-center gap-2">
                  <span className="break-words">{current ? current.name : 'the branch selected in the header'}</span>
                  {current && <Badge size="sm" tone="primary" icon={<Check className="h-3 w-3" aria-hidden />}>Current branch</Badge>}
                  {current && !current.isActive && <Badge size="sm" tone="warning" icon={<CircleSlash className="h-3 w-3" aria-hidden />}>Marked inactive</Badge>}
                </h2>
                {current ? (
                  <>
                    <p className="text-caption text-neutral-600 mt-1 break-words">{current.businessName}{current.city ? ` · ${current.city}` : ''} · part of {current.orgName}</p>
                    <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-caption">
                      <Fact icon={<Store className="h-3.5 w-3.5" />} label="Outlets" value={current.outletCount} />
                      <Fact icon={<Armchair className="h-3.5 w-3.5" />} label="Tables" value={current.tableCount} />
                      <Fact icon={<Building2 className="h-3.5 w-3.5" />} label="Code" value={current.code} />
                    </p>
                  </>
                ) : (
                  <p className="text-caption text-neutral-600 mt-1">
                    {branches.isError
                      ? 'The branch list could not be loaded, so its operating facts are not shown here. Your session is still scoped to one branch.'
                      : 'None of the branches you can see is flagged as the current one — the header switcher is the source of truth.'}
                  </p>
                )}
              </>
            )}
            <p className="text-caption text-neutral-600 mt-2.5 leading-relaxed">
              Orders, bills, stock and reports all read from this branch only. To work somewhere else, switch branch from the name at the top of the screen —
              this page sets branches up, it does not change the one you are in.
            </p>
          </div>
        </div>
      </Card>

      {branches.data && all.length > 0 && (
        /* One column at 390 px so StatCard renders its full-width row variant. */
        <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4">
          <StatCard label="Branches" value={all.length} tone="primary" icon={<Building2 className="h-5 w-5" />} hint={all[0]?.orgName ? `in ${all[0].orgName}` : undefined} />
          <StatCard label="Active" value={activeCount} tone={activeCount === all.length ? 'success' : 'warning'} icon={<CheckCircle2 className="h-5 w-5" />} hint={activeCount === all.length ? 'All branches open to staff' : `${all.length - activeCount} inactive`} />
          <StatCard label="Tables, all branches" value={totalTables} tone="neutral" icon={<Armchair className="h-5 w-5" />} hint="Summed across every branch listed" />
          <StatCard label="Outlets here" value={outlets.data ? outletRows.length : '—'} tone="info" icon={<Store className="h-5 w-5" />} hint={current ? `in ${current.name}` : 'in the current branch'} />
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px] items-start">
        {/* ---------------------------------------------------------------- Branches */}
        <Card padded={false}>
          <CardHeader
            className="p-4 pb-0"
            title={<span className="flex items-center gap-2"><Building2 className="h-4 w-4 text-neutral-400" aria-hidden />Branches</span>}
            subtitle={branches.data ? `${all.length} branch${all.length === 1 ? '' : 'es'} in ${all[0]?.orgName ?? 'this organization'} · current branch listed first` : undefined}
          />

          {all.length > 5 && (
            <div className="px-4 pt-3">
              <SearchInput value={search} onChange={setSearch} placeholder="Filter by name, code or city" />
            </div>
          )}

          {branches.isLoading ? <div className="p-4"><LoadingState rows={3} /></div>
            : branches.isError ? <ErrorState compact error={branches.error} onRetry={() => void branches.refetch()} />
              : rows.length === 0 ? (
                <EmptyState
                  compact
                  icon={<Building2 className="h-6 w-6" />}
                  title={all.length === 0 ? 'No branches yet' : 'No branch matches that filter'}
                  description={all.length === 0 ? 'A branch holds its own tables, staff, stock and settings.' : 'Clear the filter to see every branch again.'}
                  action={all.length === 0
                    ? (canManage ? <Button onClick={() => setBranchForm({ editing: null })}>New branch</Button> : undefined)
                    : <Button variant="outline" onClick={() => setSearch('')}>Clear filter</Button>}
                />
              ) : (
                <ul className="divide-y divide-neutral-100 mt-2">
                  {rows.map((b) => {
                    const here = isCurrent(b);
                    return (
                      <li
                        key={b.id}
                        aria-current={here ? 'true' : undefined}
                        className={cn(
                          'px-4 py-3.5 flex items-start gap-3 border-l-4',
                          here ? 'border-l-primary-600 bg-primary-50/50' : 'border-l-transparent',
                          !b.isActive && !here && 'bg-neutral-50/60',
                        )}
                      >
                        <span className={cn(
                          'h-9 w-9 rounded-sm font-bold flex items-center justify-center text-xs shrink-0',
                          here ? 'bg-primary-600 text-white' : b.isActive ? 'bg-primary-50 text-primary-800' : 'bg-neutral-100 text-neutral-500',
                        )} aria-hidden>
                          {b.code}
                        </span>

                        <span className="flex-1 min-w-0">
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className={cn('font-medium truncate', here ? 'text-primary-900' : 'text-neutral-900')}>{b.name}</span>
                            {here && <Badge size="sm" tone="primary" icon={<Check className="h-3 w-3" aria-hidden />}>Current branch</Badge>}
                            {b.isActive
                              ? !here && <Badge size="sm" tone="success" icon={<CheckCircle2 className="h-3 w-3" aria-hidden />}>Active</Badge>
                              : <Badge size="sm" tone="neutral" icon={<CircleSlash className="h-3 w-3" aria-hidden />}>Inactive — staff cannot select it</Badge>}
                          </span>
                          <span className="block text-caption text-neutral-500 truncate mt-0.5">{b.businessName}</span>
                          <span className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-caption">
                            <Fact icon={<Store className="h-3.5 w-3.5" />} label="Outlets" value={b.outletCount} />
                            <Fact icon={<Armchair className="h-3.5 w-3.5" />} label="Tables" value={b.tableCount} />
                            {b.city && <Fact icon={<MapPin className="h-3.5 w-3.5" />} label="City" value={b.city} />}
                          </span>
                        </span>

                        {canManage && (
                          <IconButton label={`Edit ${b.name}`} size="sm" onClick={() => setBranchForm({ editing: b })}><Pencil className="h-4 w-4" /></IconButton>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
        </Card>

        {/* ---------------------------------------------------------------- Outlets in the current branch */}
        <Card padded={false}>
          <CardHeader
            className="p-4 pb-0"
            title={<span className="flex items-center gap-2"><Store className="h-4 w-4 text-neutral-400" aria-hidden />Outlets</span>}
            subtitle={current ? `Inside ${current.name} — the branch selected in the header` : 'Inside the branch selected in the header'}
            action={canManage && <Button size="sm" variant="outline" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setOutletForm({ editing: null })}>Add outlet</Button>}
          />
          {outlets.isLoading ? <div className="p-4"><LoadingState rows={2} /></div>
            : outlets.isError ? <ErrorState compact error={outlets.error} onRetry={() => void outlets.refetch()} />
              : outletRows.length === 0 ? (
                <EmptyState
                  compact
                  icon={<Store className="h-6 w-6" />}
                  title="No outlets in this branch"
                  description="Outlets group floors — a restaurant, a bar, a club room. Floors can be attached to an outlet once one exists."
                  action={canManage ? <Button onClick={() => setOutletForm({ editing: null })}>Add outlet</Button> : undefined}
                />
              ) : (
                <ul className="divide-y divide-neutral-100 mt-2">
                  {outletRows.map((o) => (
                    <li key={o.id} className={cn('px-4 py-3 flex items-start gap-3 text-sm', !o.isActive && 'bg-neutral-50/60')}>
                      <span className="flex-1 min-w-0">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-medium text-neutral-900 truncate">{o.name}</span>
                          <Badge size="sm">{outletTypeLabel(o.outletType)}</Badge>
                          {!o.isActive && <Badge size="sm" tone="neutral" icon={<CircleSlash className="h-3 w-3" aria-hidden />}>Inactive</Badge>}
                        </span>
                        <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-caption">
                          <Fact icon={<Building2 className="h-3.5 w-3.5" />} label="Code" value={o.code} />
                          <Fact icon={<LayoutGrid className="h-3.5 w-3.5" />} label="Floors" value={o.floorCount} />
                        </span>
                      </span>
                      {canManage && <IconButton label={`Edit ${o.name}`} size="sm" onClick={() => setOutletForm({ editing: o })}><Pencil className="h-4 w-4" /></IconButton>}
                    </li>
                  ))}
                </ul>
              )}
        </Card>
      </div>

      <p className="text-caption text-neutral-500 mt-4 flex items-start gap-1.5">
        <ArrowUpRight className="h-3.5 w-3.5 mt-0.5 shrink-0 text-neutral-400" aria-hidden />
        <span className="min-w-0">
          Which staff may reach which branch is set on the Users page. Reports → Advanced → Branch comparison puts every branch you can see side by side for one date range.
        </span>
      </p>

      {branchForm && <BranchFormModal editing={branchForm.editing} onClose={() => setBranchForm(null)} />}
      {outletForm && <OutletFormModal editing={outletForm.editing} onClose={() => setOutletForm(null)} />}
    </div>
  );
}
