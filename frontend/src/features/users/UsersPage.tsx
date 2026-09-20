import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, KeyRound, UserX, UserCheck } from 'lucide-react';
import { usersApi } from '@/services/api/endpoints';
import { useBranches, useBranchMutations } from '@/features/p2/hooks';
import { usePermission } from '@/hooks/useAuth';
import { useDebounce } from '@/hooks/useRealtime';
import { useAuthStore } from '@/store/authStore';
import { toast } from '@/store/uiStore';
import { PageHeader, Button, IconButton, Modal, ConfirmDialog, Input, PasswordInput, Switch, Badge, LoadingState, ErrorState, DataTable, SearchInput, SegmentedControl, Avatar, type Column } from '@/components/ui';
import { ApiError } from '@/services/api/client';
import { ROLE_LABELS, type RoleCodeKey } from '@/config/permissions';
import { fmtDateTime } from '@/utils/date';
import { cn } from '@/utils/cn';
import type { User, UserInput, RoleCode } from '@/types';

const ROLES = Object.keys(ROLE_LABELS) as RoleCodeKey[];

const schema = z.object({
  fullName: z.string().trim().min(2, 'Enter the full name').max(150),
  username: z.string().trim().min(3, 'At least 3 characters').max(60).regex(/^[a-z0-9._-]+$/i, 'Letters, numbers, dot, dash, underscore only'),
  email: z.string().trim().email('Enter a valid email').or(z.literal('')),
  phone: z.string().trim().max(30).optional(),
  password: z.string().min(6, 'At least 6 characters').or(z.literal('')),
  roles: z.array(z.string()).min(1, 'Select at least one role'),
  approvalPin: z.string().regex(/^\d{4}$/, '4 digits').or(z.literal('')),
  isActive: z.boolean(),
  /** Phase 2 — branches this user may switch to (current branch is always included). */
  branchIds: z.array(z.number()),
});
type Form = z.infer<typeof schema>;

function UserForm({ onClose, editing }: { onClose: () => void; editing: User | null }) {
  const qc = useQueryClient();
  const canBranches = usePermission('branches:manage');
  const branches = useBranches(canBranches);
  const { setUserBranches } = useBranchMutations();
  const currentBranchId = useAuthStore((s) => s.branchId);
  const save = useMutation({ mutationFn: ({ id, body }: { id: number | null; body: UserInput }) => (id == null ? usersApi.create(body) : usersApi.update(id, body)), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['users'] }); toast.success(editing ? 'User updated' : 'User created'); } });
  const { register, handleSubmit, watch, setValue, control, setError, formState: { errors } } = useForm<Form>({ resolver: zodResolver(schema), values: { fullName: editing?.fullName ?? '', username: editing?.username ?? '', email: editing?.email ?? '', phone: editing?.phone ?? '', password: '', roles: editing?.roles ?? [], approvalPin: '', isActive: editing?.isActive ?? true, branchIds: (editing?.branchIds ?? (currentBranchId ? [currentBranchId] : [])).map(Number) } });
  const onSubmit = async (v: Form) => {
    if (!editing && !v.password) { setError('password', { message: 'Password is required for new users' }); return; }
    const body: UserInput = { fullName: v.fullName, username: v.username, email: v.email || undefined, phone: v.phone || undefined, password: v.password || undefined, roles: v.roles as RoleCode[], approvalPin: v.approvalPin || undefined, isActive: v.isActive };
    try {
      const saved = await save.mutateAsync({ id: editing?.id ?? null, body });
      if (canBranches && v.branchIds.length) await setUserBranches.mutateAsync({ userId: saved.id, branchIds: v.branchIds });
      onClose();
    }
    catch (e) { const err = ApiError.from(e); const f = err.errors.find((x) => x.field)?.field as keyof Form | undefined; setError(f ?? 'username', { message: err.message }); }
  };
  return (
    <Modal open onClose={onClose} size="lg" title={editing ? `Edit ${editing.fullName}` : 'New user'} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={handleSubmit(onSubmit)} loading={save.isPending}>{editing ? 'Save changes' : 'Create user'}</Button></>}>
      <form onSubmit={handleSubmit(onSubmit)} className="grid sm:grid-cols-2 gap-4" noValidate>
        <Input label="Full name" required autoFocus error={errors.fullName?.message} {...register('fullName')} />
        <Input label="Username" required autoComplete="off" error={errors.username?.message} {...register('username')} />
        <Input label="Email" type="email" error={errors.email?.message} {...register('email')} />
        <Input label="Phone" error={errors.phone?.message} {...register('phone')} />
        <PasswordInput label={editing ? 'New password (leave blank to keep)' : 'Password'} required={!editing} autoComplete="new-password" error={errors.password?.message} {...register('password')} />
        <Input label="Approval PIN" inputMode="numeric" maxLength={4} hint="4 digits — used to approve cancellations & discounts (managers/admins)" error={errors.approvalPin?.message} {...register('approvalPin')} />
        <div className="sm:col-span-2">
          <p className="text-label text-neutral-700 mb-1.5">Roles <span className="text-danger-600">*</span></p>
          <Controller control={control} name="roles" render={({ field }) => (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {ROLES.map((r) => { const on = field.value.includes(r); return <label key={r} className={cn('flex items-center gap-2 rounded-sm border px-2 min-h-[40px] text-sm cursor-pointer', on ? 'bg-primary-50 border-primary-200 text-primary-800' : 'border-neutral-200')}><input type="checkbox" className="h-4 w-4 rounded-sm" checked={on} onChange={() => field.onChange(on ? field.value.filter((x) => x !== r) : [...field.value, r])} />{ROLE_LABELS[r]}</label>; })}
            </div>
          )} />
          {errors.roles?.message && <p role="alert" className="text-caption text-danger-600 mt-1">{errors.roles.message}</p>}
        </div>
        {canBranches && (branches.data ?? []).length > 1 && (
          <div className="sm:col-span-2">
            <p className="text-label text-neutral-700 mb-1.5">Branch access</p>
            <Controller control={control} name="branchIds" render={({ field }) => (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {(branches.data ?? []).map((b) => { const on = field.value.includes(Number(b.id)); return <label key={b.id} className={cn('flex items-center gap-2 rounded-sm border px-2 min-h-[40px] text-sm cursor-pointer', on ? 'bg-primary-50 border-primary-200 text-primary-800' : 'border-neutral-200')}><input type="checkbox" className="h-4 w-4 rounded-sm" checked={on} onChange={() => field.onChange(on ? field.value.filter((x) => x !== Number(b.id)) : [...field.value, Number(b.id)])} /><span className="truncate">{b.name}</span></label>; })}
              </div>
            )} />
            <p className="text-caption text-neutral-500 mt-1">The user can switch between the selected branches from the header; all data stays scoped to the active one.</p>
          </div>
        )}
        <Switch checked={watch('isActive')} onChange={(v) => setValue('isActive', v)} label="Active" description="Inactive users cannot sign in; their sessions are revoked." />
      </form>
    </Modal>
  );
}

export default function UsersPage() {
  const canManage = usePermission('users:manage');
  const me = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const dq = useDebounce(search, 250);
  const [role, setRole] = useState<'ALL' | RoleCodeKey>('ALL');
  const users = useQuery({ queryKey: ['users', 'list', dq, role], queryFn: () => usersApi.list({ search: dq || undefined, role: role === 'ALL' ? undefined : role }) });
  const [editing, setEditing] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const [toggle, setToggle] = useState<User | null>(null);
  const [pwdFor, setPwdFor] = useState<User | null>(null);
  const [pwd, setPwd] = useState('');
  const status = useMutation({ mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => usersApi.setStatus(id, isActive), onSuccess: (u) => { void qc.invalidateQueries({ queryKey: ['users'] }); toast.success(u.isActive ? 'User activated' : 'User deactivated'); } });
  const setPassword = useMutation({ mutationFn: ({ id, password }: { id: number; password: string }) => usersApi.setPassword(id, password), onSuccess: () => toast.success('Password updated') });

  const columns = useMemo<Column<User>[]>(() => [
    { key: 'name', header: 'User', sortValue: (u) => u.fullName, render: (u) => <div className="flex items-center gap-3"><Avatar name={u.fullName} size="sm" /><div className="min-w-0"><p className={cn('font-medium truncate', !u.isActive && 'text-neutral-400')}>{u.fullName}{u.id === me?.id && <span className="text-caption text-neutral-500"> (you)</span>}</p><p className="text-caption text-neutral-500 truncate">@{u.username}{u.email ? ` · ${u.email}` : ''}</p></div></div> },
    { key: 'roles', header: 'Roles', render: (u) => <div className="flex flex-wrap gap-1">{u.roles.map((r) => <Badge key={r} tone="primary" size="sm">{ROLE_LABELS[r]}</Badge>)}</div> },
    { key: 'disc', header: 'Max discount', hideBelow: 'lg', align: 'right', sortValue: (u) => u.maxDiscountPercent, render: (u) => `${u.maxDiscountPercent}%` },
    { key: 'login', header: 'Last login', hideBelow: 'lg', sortValue: (u) => u.lastLoginAt ?? '', render: (u) => <span className="text-neutral-600">{fmtDateTime(u.lastLoginAt)}</span> },
    { key: 'status', header: 'Status', render: (u) => <Badge tone={u.isActive ? 'success' : 'neutral'} size="sm">{u.isActive ? 'Active' : 'Inactive'}</Badge> },
    ...(canManage ? [{ key: 'actions', header: '', align: 'right' as const, render: (u: User) => <div className="flex justify-end gap-1"><IconButton label="Edit" size="sm" onClick={() => { setEditing(u); setOpen(true); }}><Pencil className="h-4 w-4" /></IconButton><IconButton label="Reset password" size="sm" onClick={() => { setPwd(''); setPwdFor(u); }}><KeyRound className="h-4 w-4" /></IconButton><IconButton label={u.isActive ? 'Deactivate' : 'Activate'} size="sm" disabled={u.id === me?.id} className={u.isActive ? 'text-danger-600' : 'text-success-600'} onClick={() => setToggle(u)}>{u.isActive ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}</IconButton></div> }] : []),
  ], [canManage, me?.id]);

  return (
    <div>
      <PageHeader title="Users" subtitle="Staff accounts and role assignment" actions={canManage && <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setOpen(true); }}>New user</Button>}>
        <div className="flex flex-col sm:flex-row gap-2"><SearchInput value={search} onChange={setSearch} placeholder="Search name, username, email" className="sm:w-72" /><SegmentedControl size="sm" value={role} onChange={setRole} options={[{ value: 'ALL', label: 'All roles' }, ...ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))]} /></div>
      </PageHeader>
      {users.isLoading && <LoadingState variant="table" rows={6} />}
      {users.isError && <ErrorState error={users.error} onRetry={() => void users.refetch()} />}
      {users.data && <DataTable columns={columns} rows={users.data} rowKey={(u) => u.id} emptyTitle="No users found" />}
      {open && <UserForm onClose={() => setOpen(false)} editing={editing} />}
      <ConfirmDialog open={!!toggle} onClose={() => setToggle(null)} variant={toggle?.isActive ? 'danger' : 'primary'} title={`${toggle?.isActive ? 'Deactivate' : 'Activate'} ${toggle?.fullName}?`} message={toggle?.isActive ? 'They will be signed out immediately and cannot sign in until reactivated.' : 'They will be able to sign in again.'} confirmLabel={toggle?.isActive ? 'Deactivate' : 'Activate'} loading={status.isPending} onConfirm={async () => { if (toggle) { try { await status.mutateAsync({ id: toggle.id, isActive: !toggle.isActive }); } finally { setToggle(null); } } }} />
      <Modal open={!!pwdFor} onClose={() => setPwdFor(null)} size="sm" title={`Reset password — ${pwdFor?.fullName}`} footer={<><Button variant="outline" onClick={() => setPwdFor(null)}>Cancel</Button><Button loading={setPassword.isPending} disabled={pwd.length < 6} onClick={async () => { if (pwdFor) { await setPassword.mutateAsync({ id: pwdFor.id, password: pwd }); setPwdFor(null); } }}>Set password</Button></>}>
        <PasswordInput label="New password" autoFocus autoComplete="new-password" value={pwd} onChange={(e) => setPwd(e.target.value)} hint="Minimum 6 characters" />
      </Modal>
    </div>
  );
}
