import { useMemo, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Building2, Plus, Pencil, Store, Check, CheckCircle2, CircleSlash, LayoutGrid, Armchair, MapPin, ArrowUpRight, Phone, KeyRound, CornerDownRight } from 'lucide-react';
import { useBranches, useOutlets, useBranchMutations } from '@/features/p2/hooks';
import { usePermission } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useSurface';
import { useBranch } from '@/components/layout/Shell';
import { useAuthStore } from '@/store/authStore';
import { PageHeader, Button, Card, CardHeader, Modal, Input, Select, Switch, Badge, IconButton, LoadingState, ErrorState, EmptyState, StatCard, SearchInput, Skeleton, Tabs, useReadOnly, ReadOnlyBanner, ReadOnlyPill } from '@/components/ui';
import { VenueArt } from '@/components/graphics';
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
      <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 sm:grid-cols-2 gap-4" noValidate>
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
      <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 sm:grid-cols-2 gap-4" noValidate>
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

/* ---------------------------------------------------------------------------------------------
 * THE MANAGER COMPOSITION.
 *
 * The manager board leads with the room the manager is standing in — a photographic card for the
 * current branch carrying its real address, its real phone number and whether it is open to staff
 * — then three figures, then the organization as a tree. The admin board leads with the whole
 * estate as a grid of venue cards, which is a different job and is left exactly as it was.
 *
 * Nothing here is a capability: every management control below is still gated on
 * `branches:manage`, so an organization that grants a manager that permission gets the same
 * buttons on this composition that an administrator gets on theirs.
 * ------------------------------------------------------------------------------------------- */
type StructureTab = 'tree' | 'outlets';

function ManagerBranchesView({ branches, outlets, all, current, canManage, readOnly, accessCount, onEditBranch, onNewOutlet, onEditOutlet }: {
  branches: ReturnType<typeof useBranches>;
  outlets: ReturnType<typeof useOutlets>;
  all: BranchSummary[];
  current: BranchSummary | null;
  canManage: boolean;
  readOnly: boolean;
  accessCount: number;
  onEditBranch: (b: BranchSummary) => void;
  onNewOutlet: () => void;
  onEditOutlet: (o: Outlet) => void;
}) {
  /* The same `['branch']` query the shell and Settings already hold — the current branch's own
     record, which is the only place an address and a phone number actually live. No new fetch. */
  const profile = useBranch();
  const [tab, setTab] = useState<StructureTab>('tree');
  const outletRows = outlets.data ?? [];
  const activeOutlets = outletRows.filter((o) => o.isActive).length;

  return (
    <>
      {/* --------------------------------------------------- the branch you are standing in */}
      <Card padded={false} className="mb-4 overflow-hidden" aria-current="true">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <div className="relative aspect-[16/9] lg:aspect-auto lg:min-h-[210px] border-b border-neutral-200 lg:border-b-0 lg:border-r">
            <VenueArt name={current?.name ?? profile.data?.name ?? 'Branch'} />
            <span className="absolute top-3 left-3">
              <Badge size="sm" tone="primary" icon={<Check className="h-3 w-3" aria-hidden />}>Your current branch</Badge>
            </span>
          </div>

          <div className="p-5 min-w-0">
            {branches.isLoading ? (
              <div className="space-y-2" role="status" aria-busy="true">
                <span className="sr-only">Loading the current branch…</span>
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-64 max-w-full" />
              </div>
            ) : (
              <>
                <h2 className="text-subheading text-neutral-900 flex flex-wrap items-center gap-2">
                  <span className="break-words">{current ? current.name : profile.data?.name ?? 'the branch selected in the header'}</span>
                  {current && (current.isActive
                    ? <Badge size="sm" tone="success" icon={<CheckCircle2 className="h-3 w-3" aria-hidden />}>Active</Badge>
                    : <Badge size="sm" tone="warning" icon={<CircleSlash className="h-3 w-3" aria-hidden />}>Marked inactive</Badge>)}
                </h2>
                <p className="text-caption text-neutral-600 mt-1 break-words">
                  {current ? <>{current.businessName} · part of {current.orgName}</> : profile.data?.businessName}
                </p>

                {/* Address and phone come from the branch record itself; a field the record does
                    not hold prints nothing rather than a placeholder. */}
                <ul className="mt-3 space-y-2 text-sm">
                  {(profile.data?.address || current?.city) && (
                    <li className="flex items-start gap-2.5 min-w-0">
                      <MapPin className="h-4 w-4 mt-0.5 text-neutral-400 shrink-0" aria-hidden />
                      <span className="min-w-0 break-words text-neutral-700">
                        {profile.data?.address ?? current?.city}
                        {profile.data?.address && current?.city ? ` · ${current.city}` : ''}
                      </span>
                    </li>
                  )}
                  {profile.data?.phone && (
                    <li className="flex items-start gap-2.5 min-w-0">
                      <Phone className="h-4 w-4 mt-0.5 text-neutral-400 shrink-0" aria-hidden />
                      <a href={`tel:${profile.data.phone}`} className="text-primary-700 hover:underline underline-offset-2 break-words">{profile.data.phone}</a>
                    </li>
                  )}
                </ul>

                {current && (
                  <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-caption">
                    <Fact icon={<Store className="h-3.5 w-3.5" />} label="Outlets" value={current.outletCount} />
                    <Fact icon={<Armchair className="h-3.5 w-3.5" />} label="Tables" value={current.tableCount} />
                    <Fact icon={<Building2 className="h-3.5 w-3.5" />} label="Code" value={current.code} />
                  </p>
                )}

                <p className="text-caption text-neutral-600 mt-3 leading-relaxed">
                  Orders, bills, stock and reports all read from this branch only. To work somewhere else, switch branch from the name at the top of the screen.
                </p>
              </>
            )}
          </div>
        </div>
      </Card>

      {/* Three figures, and only figures the API returned. One column at 390 px so StatCard
          renders its full-width row variant. */}
      <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-4">
        <StatCard label="Branches" value={branches.data ? all.length : '—'} tone="primary" icon={<Building2 className="h-5 w-5" />} hint={all[0]?.orgName ? `in ${all[0].orgName}` : undefined} />
        <StatCard label="Active outlets" value={outlets.data ? activeOutlets : '—'} tone={outlets.data && activeOutlets === outletRows.length ? 'success' : 'info'} icon={<Store className="h-5 w-5" />} hint={current ? `of ${outletRows.length} in ${current.name}` : 'in the current branch'} />
        <StatCard label="Your access" value={accessCount} tone="neutral" icon={<KeyRound className="h-5 w-5" />} hint={accessCount === 1 ? 'one branch, from the header switcher' : 'branches you can switch to from the header'} />
      </div>

      <Tabs
        className="mb-4"
        ariaLabel="Branch structure"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'tree', label: 'Branch structure', count: branches.data ? all.length : undefined },
          { value: 'outlets', label: 'Outlets in this branch', count: outlets.data ? outletRows.length : undefined },
        ]}
      />

      {/* ------------------------------------------------------- organization → branch → outlet */}
      {tab === 'tree' && (
        <Card padded={false}>
          <CardHeader
            className="p-4 pb-0"
            title={<span className="flex items-center gap-2"><Building2 className="h-4 w-4 text-neutral-400" aria-hidden />{all[0]?.orgName ?? 'Organization'}</span>}
            subtitle="Branch → outlet. Outlets are listed for the branch you are working in; the rest carry the count the API returned."
          />
          {branches.isLoading ? <div className="p-4"><LoadingState rows={3} /></div>
            : branches.isError ? <ErrorState compact error={branches.error} onRetry={() => void branches.refetch()} />
              : all.length === 0 ? (
                <EmptyState compact icon={<Building2 className="h-6 w-6" />} title="No branches yet" description="A branch holds its own tables, staff, stock and settings." />
              ) : (
                <ul className="divide-y divide-neutral-200 mt-2">
                  {all.map((b) => {
                    const here = b.isCurrent || b.id === current?.id;
                    return (
                      <li key={b.id} className="px-4 py-3 min-w-0">
                        <div className="flex items-start gap-3 min-w-0">
                          <span className="h-9 w-9 shrink-0 rounded-md bg-neutral-100 text-neutral-700 ring-1 ring-inset ring-neutral-200 text-[11px] font-semibold flex items-center justify-center" aria-hidden>{b.code}</span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="text-sm font-medium text-neutral-900 truncate">{b.name}</span>
                              {here && <Badge size="sm" tone="primary" icon={<Check className="h-3 w-3" aria-hidden />}>You are here</Badge>}
                              {!b.isActive && <Badge size="sm" tone="neutral" icon={<CircleSlash className="h-3 w-3" aria-hidden />}>Inactive</Badge>}
                            </span>
                            <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-caption">
                              <Fact icon={<MapPin className="h-3.5 w-3.5" />} label="City" value={b.city ?? '—'} />
                              <Fact icon={<Store className="h-3.5 w-3.5" />} label="Outlets" value={b.outletCount} />
                              <Fact icon={<Armchair className="h-3.5 w-3.5" />} label="Tables" value={b.tableCount} />
                            </span>
                          </span>
                          {canManage && <IconButton label={`Edit ${b.name}`} size="sm" onClick={() => onEditBranch(b)}><Pencil className="h-4 w-4" /></IconButton>}
                        </div>

                        {/* Only the current branch's outlets have actually been fetched, so only
                            that branch is expanded. Nothing is invented for the others. */}
                        {here && (
                          outlets.isLoading ? <div className="mt-2 ml-12"><LoadingState rows={1} /></div>
                            : outletRows.length === 0
                              ? <p className="mt-2 ml-12 text-caption text-neutral-500">No outlets in this branch yet.</p>
                              : (
                                <ul className="mt-2 ml-12 space-y-1.5">
                                  {outletRows.map((o) => (
                                    <li key={o.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption min-w-0">
                                      <CornerDownRight className="h-3.5 w-3.5 text-neutral-400 shrink-0" aria-hidden />
                                      <span className={cn('text-neutral-900 font-medium truncate', !o.isActive && 'text-neutral-500')}>{o.name}</span>
                                      <Badge size="sm">{outletTypeLabel(o.outletType)}</Badge>
                                      <span className="text-neutral-500 tabular-nums">{o.floorCount} floor{o.floorCount === 1 ? '' : 's'}</span>
                                      {!o.isActive && <Badge size="sm" tone="neutral">Inactive</Badge>}
                                    </li>
                                  ))}
                                </ul>
                              )
                        )}
                        {!here && <p className="mt-2 ml-12 text-caption text-neutral-500">{b.outletCount} outlet{b.outletCount === 1 ? '' : 's'} — switch to this branch from the header to list them.</p>}
                      </li>
                    );
                  })}
                </ul>
              )}
        </Card>
      )}

      {/* ------------------------------------------------------------ outlets in this branch */}
      {tab === 'outlets' && (
        <Card padded={false}>
          <CardHeader
            className="p-4 pb-0"
            title={<span className="flex items-center gap-2"><Store className="h-4 w-4 text-neutral-400" aria-hidden />Outlets in this branch</span>}
            subtitle={current ? `Inside ${current.name} — the branch selected in the header` : 'Inside the branch selected in the header'}
            action={canManage && <Button size="sm" variant="outline" leftIcon={<Plus className="h-4 w-4" />} onClick={onNewOutlet}>Add outlet</Button>}
          />
          {outlets.isLoading ? <div className="p-4"><LoadingState rows={2} /></div>
            : outlets.isError ? <ErrorState compact error={outlets.error} onRetry={() => void outlets.refetch()} />
              : outletRows.length === 0 ? (
                <EmptyState
                  compact
                  icon={<Store className="h-6 w-6" />}
                  title="No outlets in this branch"
                  description="Outlets group floors — a restaurant, a bar, a club room. Floors can be attached to an outlet once one exists."
                  action={canManage ? <Button onClick={onNewOutlet}>Add outlet</Button> : undefined}
                />
              ) : (
                <ul className="divide-y divide-neutral-200 mt-2">
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
                      {canManage && <IconButton label={`Edit ${o.name}`} size="sm" onClick={() => onEditOutlet(o)}><Pencil className="h-4 w-4" /></IconButton>}
                    </li>
                  ))}
                </ul>
              )}
        </Card>
      )}

      <p className="text-caption text-neutral-500 mt-4 flex items-start gap-1.5">
        <ArrowUpRight className="h-3.5 w-3.5 mt-0.5 shrink-0 text-neutral-400" aria-hidden />
        <span className="min-w-0">
          {readOnly
            ? 'Reports → Advanced → Branch comparison puts every branch you can see side by side for one date range.'
            : 'Which staff may reach which branch is set on the Users page. Reports → Advanced → Branch comparison puts every branch you can see side by side for one date range.'}
        </span>
      </p>
    </>
  );
}

export default function BranchesPage() {
  const canManage = usePermission('branches:manage');
  /*
   * READ-ONLY IS A PERMISSION, NOT A WORKSPACE. The seeded MANAGER role holds `branches:view` and
   * not `branches:manage`, which is exactly what the board draws. An administrator holds the
   * manage permission and keeps every control on this screen; if the policy changes server-side
   * the screen follows it with no edit here.
   */
  const readOnly = useReadOnly('branches:manage');
  const ws = useWorkspace();
  const accessibleBranchIds = useAuthStore((s) => s.user?.branchIds);
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
        actions={readOnly ? <ReadOnlyPill /> : canManage && <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setBranchForm({ editing: null })}>New branch</Button>}
      />

      {/* The explanatory panel the board asks for, shown to anyone who may read this structure
          but not change it — which is what the absence of `branches:manage` means. */}
      {readOnly && (
        <ReadOnlyBanner className="mb-4" title="Branch structure is administered elsewhere">
          Branches and outlets are created and renamed by your system administrator. You can read the whole organization here,
          and you switch the branch you are working in from the name at the top of the screen.
        </ReadOnlyBanner>
      )}

      {ws === 'manager' ? (
        <ManagerBranchesView
          branches={branches}
          outlets={outlets}
          all={all}
          current={current}
          canManage={canManage}
          readOnly={readOnly}
          accessCount={accessibleBranchIds?.length ?? all.length}
          onEditBranch={(b) => setBranchForm({ editing: b })}
          onNewOutlet={() => setOutletForm({ editing: null })}
          onEditOutlet={(o) => setOutletForm({ editing: o })}
        />
      ) : (
      <>
      {/*
        THE CURRENT BRANCH, unmistakably. Every list, till and report on the site is scoped to
        it, so it gets a panel of its own above everything else — not a colour on one row —
        carrying its operating facts and the one sentence that explains how to change it.

        MATERIAL. Gloss only, and no `.material-edge`. This panel is a wide informational band
        that sits ON the page rather than floating over it, and its `shadow-card` is what says so;
        `.material-edge` is a `box-shadow` and would replace that shadow, flattening the one
        surface on the screen that is meant to sit above the two list panels below it. The gold
        tile carries the `.fill-gold` ramp with its own gloss — the same construction as the
        product's brand mark, which is the right relationship: this is the venue's mark.
      */}
      <Card className="mb-4 border-primary-200 bg-primary-50/40 material-gloss">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4 min-w-0">
          <span className="h-12 w-12 rounded-md fill-gold material-gloss bg-primary-500 text-on-primary font-bold text-sm flex items-center justify-center shrink-0" aria-hidden>
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

      {/* ---------------------------------------------------------------- Branch venue cards */}
      <section className="mb-4 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-3 min-w-0">
          <div className="min-w-0">
            <h2 className="text-subheading text-neutral-900 flex items-center gap-2"><Building2 className="h-4 w-4 text-neutral-400" aria-hidden />Branches</h2>
            {branches.data && <p className="text-[13px] text-neutral-500 mt-1 leading-snug">{all.length} branch{all.length === 1 ? '' : 'es'} in {all[0]?.orgName ?? 'this organization'} · the branch you are working in comes first</p>}
          </div>
          {all.length > 5 && <SearchInput value={search} onChange={setSearch} placeholder="Filter by name, code or city" className="sm:w-64 shrink-0" />}
        </div>

        {branches.isLoading ? <LoadingState variant="cards" rows={2} />
          : branches.isError ? <ErrorState error={branches.error} onRetry={() => void branches.refetch()} />
            : rows.length === 0 ? (
              <EmptyState
                icon={<Building2 className="h-6 w-6" />}
                title={all.length === 0 ? 'No branches yet' : 'No branch matches that filter'}
                description={all.length === 0 ? 'A branch holds its own tables, staff, stock and settings.' : 'Clear the filter to see every branch again.'}
                action={all.length === 0
                  ? (canManage ? <Button onClick={() => setBranchForm({ editing: null })}>New branch</Button> : undefined)
                  : <Button variant="outline" onClick={() => setSearch('')}>Clear filter</Button>}
              />
            ) : (
              /* Base `grid-cols-1`; Tailwind's own `grid-cols-N` already compiles to
                 `repeat(N, minmax(0,1fr))`, so no card can be floored by a long venue name. */
              <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {rows.map((b) => {
                  const here = isCurrent(b);
                  return (
                    <li key={b.id} className="min-w-0">
                      <Card
                        padded={false}
                        aria-current={here ? 'true' : undefined}
                        className={cn('h-full flex flex-col overflow-hidden', here ? 'border-primary-200' : undefined, !b.isActive && !here && 'bg-surface')}
                      >
                        {/*
                          A DRAWN interior, keyed off the branch's own name, so the same venue is
                          the same picture on every load. The reference leads each card with a
                          photograph of the room; this installation has none and invents none.
                        */}
                        <div className="relative aspect-[16/9] overflow-hidden border-b border-neutral-200">
                          <VenueArt name={b.name} />
                          {/* `neutral-950` is the scrim rung — dark in BOTH themes — so the name
                              laid over it stays white-on-dark whichever theme is painted. */}
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-neutral-950/90 via-neutral-950/55 to-transparent px-4 pt-8 pb-3">
                            <h3 className="text-paper font-semibold text-lg leading-tight break-words">{b.name}</h3>
                            <p className="text-paper/75 text-caption truncate">{b.businessName}</p>
                          </div>
                          {/* The product has no "main branch" flag — `isCurrent` is the real one,
                              and it says which branch this session is scoped to. */}
                          {here && (
                            <span className="absolute top-3 right-3">
                              <Badge size="sm" tone="primary" icon={<Check className="h-3 w-3" aria-hidden />}>Current branch</Badge>
                            </span>
                          )}
                        </div>

                        <div className="p-5 flex-1 flex flex-col min-w-0">
                          <p className="flex items-center gap-1.5 text-sm text-neutral-700 min-w-0">
                            <MapPin className="h-4 w-4 text-neutral-400 shrink-0" aria-hidden />
                            <span className="truncate">{b.city ?? 'No city recorded'}</span>
                          </p>

                          {/* Only figures the API returned — no revenue, no covers, no rating. */}
                          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-caption">
                            <Fact icon={<Store className="h-3.5 w-3.5" />} label="Outlets" value={b.outletCount} />
                            <Fact icon={<Armchair className="h-3.5 w-3.5" />} label="Tables" value={b.tableCount} />
                            <Fact icon={<Building2 className="h-3.5 w-3.5" />} label="Code" value={b.code} />
                          </p>

                          <p className="mt-auto pt-3">
                            {b.isActive
                              ? <Badge size="sm" tone="success" icon={<CheckCircle2 className="h-3 w-3" aria-hidden />}>Active</Badge>
                              : <Badge size="sm" tone="neutral" icon={<CircleSlash className="h-3 w-3" aria-hidden />}>Inactive — staff cannot select it</Badge>}
                          </p>
                        </div>

                        {canManage && (
                          <div className="border-t border-neutral-200 px-3 py-2 flex items-center justify-end">
                            <Button size="sm" variant="outline" leftIcon={<Pencil className="h-4 w-4" />} aria-label={`Edit ${b.name}`} onClick={() => setBranchForm({ editing: b })}>Edit</Button>
                          </div>
                        )}
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}
      </section>

      <div className="min-w-0">
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
                <ul className="divide-y divide-neutral-200 mt-2">
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
      </>
      )}

      {branchForm && <BranchFormModal editing={branchForm.editing} onClose={() => setBranchForm(null)} />}
      {outletForm && <OutletFormModal editing={outletForm.editing} onClose={() => setOutletForm(null)} />}
    </div>
  );
}
