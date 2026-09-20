import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Building2, Plus, Pencil, Store, Check } from 'lucide-react';
import { useBranches, useOutlets, useBranchMutations } from '@/features/p2/hooks';
import { usePermission } from '@/hooks/useAuth';
import { useAuthStore } from '@/store/authStore';
import { PageHeader, Button, Card, CardHeader, Modal, Input, Select, Switch, Badge, IconButton, LoadingState, ErrorState, EmptyState } from '@/components/ui';
import { ApiError } from '@/services/api/client';
import type { BranchSummary, BranchCreateInput, Outlet, OutletInput, OutletType } from '@/types';

const branchSchema = z.object({ code: z.string().trim().min(2).max(20).regex(/^[A-Z0-9_-]+$/i, 'Letters, digits, - and _ only'), businessName: z.string().trim().min(2).max(150), name: z.string().trim().min(2).max(100), city: z.string().max(80).optional(), address: z.string().max(300).optional(), phone: z.string().max(30).optional(), gstNumber: z.string().max(30).optional(), isActive: z.boolean() });
type BranchForm = z.infer<typeof branchSchema>;
const OUTLET_TYPES: OutletType[] = ['RESTAURANT', 'BAR', 'CLUB', 'CAFE', 'LOUNGE', 'ROOM_SERVICE', 'BANQUET'];
const outletSchema = z.object({ code: z.string().trim().min(2).max(20), name: z.string().trim().min(2).max(100), outletType: z.enum(['RESTAURANT', 'BAR', 'CLUB', 'CAFE', 'LOUNGE', 'ROOM_SERVICE', 'BANQUET']), isActive: z.boolean() });
type OutletForm = z.infer<typeof outletSchema>;

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
        <Input label="Code" required placeholder="MUM, HYD" disabled={!!editing} error={errors.code?.message} {...register('code')} />
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
    <Modal open onClose={onClose} size="md" title={editing ? `Edit ${editing.name}` : 'New outlet'} description="Outlets group floors inside a branch (restaurant, bar, club, room service…)." footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={handleSubmit(onSubmit)} loading={saveOutlet.isPending}>{editing ? 'Save' : 'Create outlet'}</Button></>}>
      <form onSubmit={handleSubmit(onSubmit)} className="grid sm:grid-cols-2 gap-4" noValidate>
        <Input label="Code" required disabled={!!editing} error={errors.code?.message} {...register('code')} />
        <Input label="Name" required error={errors.name?.message} {...register('name')} />
        <Select label="Type" required options={OUTLET_TYPES.map((t) => ({ value: t, label: t.replace('_', ' ') }))} error={errors.outletType?.message} {...register('outletType')} />
        <div className="self-end pb-2"><Switch checked={watch('isActive')} onChange={(v) => setValue('isActive', v)} label="Active" /></div>
      </form>
    </Modal>
  );
}

export default function BranchesPage() {
  const canManage = usePermission('branches:manage');
  const currentId = useAuthStore((s) => s.branchId);
  const branches = useBranches();
  const outlets = useOutlets();
  const [branchForm, setBranchForm] = useState<{ editing: BranchSummary | null } | null>(null);
  const [outletForm, setOutletForm] = useState<{ editing: Outlet | null } | null>(null);
  return (
    <div>
      <PageHeader title="Branches & outlets" subtitle="Organization → branch → outlet → floor → table. Every list in the app is scoped to the branch selected in the header." actions={canManage && <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setBranchForm({ editing: null })}>New branch</Button>} />
      <div className="grid gap-4 xl:grid-cols-[1fr_400px]">
        <Card padded={false}>
          <CardHeader className="p-4 pb-0" title={<span className="flex items-center gap-2"><Building2 className="h-4 w-4" />Branches</span>} subtitle={branches.data ? `${branches.data.length} in ${branches.data[0]?.orgName ?? 'organization'}` : undefined} />
          {branches.isLoading ? <div className="p-4"><LoadingState rows={3} /></div> : branches.isError ? <ErrorState compact error={branches.error} onRetry={() => void branches.refetch()} /> : (
            <ul className="divide-y divide-neutral-100 mt-2">{(branches.data ?? []).map((b) => (
              <li key={b.id} className="px-4 py-3 flex items-center gap-3">
                <span className="h-9 w-9 rounded-sm bg-primary-50 text-primary-800 font-bold flex items-center justify-center text-xs">{b.code}</span>
                <span className="flex-1 min-w-0"><span className="flex items-center gap-2"><span className="font-medium truncate">{b.name}</span>{b.id === currentId && <Badge size="sm" tone="primary" icon={<Check className="h-3 w-3" />}>Current</Badge>}{!b.isActive && <Badge size="sm">Inactive</Badge>}</span><span className="block text-caption text-neutral-500 truncate">{b.businessName}{b.city ? ` · ${b.city}` : ''} · {b.outletCount} outlet{b.outletCount === 1 ? '' : 's'} · {b.tableCount} tables</span></span>
                {canManage && <IconButton label="Edit" size="sm" onClick={() => setBranchForm({ editing: b })}><Pencil className="h-4 w-4" /></IconButton>}
              </li>))}</ul>
          )}
        </Card>
        <Card padded={false}>
          <CardHeader className="p-4 pb-0" title={<span className="flex items-center gap-2"><Store className="h-4 w-4" />Outlets in current branch</span>} action={canManage && <Button size="sm" variant="outline" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setOutletForm({ editing: null })}>Add</Button>} />
          {outlets.isLoading ? <div className="p-4"><LoadingState rows={2} /></div> : outlets.isError ? <ErrorState compact error={outlets.error} onRetry={() => void outlets.refetch()} /> : (outlets.data ?? []).length === 0 ? <EmptyState compact title="No outlets" description="Floors can be attached to an outlet once one exists." /> : (
            <ul className="divide-y divide-neutral-100 mt-2">{(outlets.data ?? []).map((o) => (
              <li key={o.id} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                <span className="flex-1 min-w-0"><span className="font-medium">{o.name}</span> <span className="text-caption text-neutral-500">{o.code} · {o.outletType.replace('_', ' ')} · {o.floorCount} floor{o.floorCount === 1 ? '' : 's'}</span></span>
                {!o.isActive && <Badge size="sm">Inactive</Badge>}
                {canManage && <IconButton label="Edit" size="sm" onClick={() => setOutletForm({ editing: o })}><Pencil className="h-4 w-4" /></IconButton>}
              </li>))}</ul>
          )}
        </Card>
      </div>
      <p className="text-caption text-neutral-500 mt-4">Staff access per branch is managed on the Users page. Reports → Advanced → Branch comparison shows cross-branch figures for users who can see more than one branch.</p>
      {branchForm && <BranchFormModal editing={branchForm.editing} onClose={() => setBranchForm(null)} />}
      {outletForm && <OutletFormModal editing={outletForm.editing} onClose={() => setOutletForm(null)} />}
    </div>
  );
}
