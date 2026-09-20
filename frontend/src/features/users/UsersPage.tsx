import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, KeyRound, UserX, UserCheck, Users as UsersIcon, ShieldCheck, ShieldOff, Clock, Building2, X } from 'lucide-react';
import { usersApi } from '@/services/api/endpoints';
import { useBranches, useBranchMutations } from '@/features/p2/hooks';
import { usePermission } from '@/hooks/useAuth';
import { useDebounce } from '@/hooks/useRealtime';
import { useAuthStore } from '@/store/authStore';
import { toast } from '@/store/uiStore';
import { PageHeader, Button, IconButton, Modal, ConfirmDialog, Input, PasswordInput, Switch, Badge, LoadingState, ErrorState, DataTable, SearchInput, SegmentedControl, FilterSelect, Avatar, StatCard, Alert, type Column } from '@/components/ui';
import { ApiError } from '@/services/api/client';
import { ROLE_LABELS, type RoleCodeKey } from '@/config/permissions';
import { fmtDateTime, fmtRelative } from '@/utils/date';
import { cn } from '@/utils/cn';
import type { User, UserInput, RoleCode } from '@/types';

const ROLES = Object.keys(ROLE_LABELS) as RoleCodeKey[];

/**
 * The four questions this directory answers, as one filter:
 * everyone / who can sign in / who is blocked / who has an account they have never used.
 * Every bucket is a slice of the rows already fetched — narrowing never costs a request.
 */
type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE' | 'NEVER';

const STATUS_LABEL: Record<StatusFilter, string> = {
  ALL: 'everyone', ACTIVE: 'active only', INACTIVE: 'inactive only', NEVER: 'never signed in',
};

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

/** Last sign-in, spelled out — a blank cell reads as missing data, not as "never". */
function LastSignIn({ user, className }: { user: User; className?: string }) {
  if (!user.lastLoginAt) {
    return (
      <span className={cn('inline-flex items-center gap-1.5 text-neutral-500', className)}>
        <Clock className="h-3.5 w-3.5 shrink-0 text-neutral-400" aria-hidden />
        Never signed in
      </span>
    );
  }
  return (
    <span className={cn('text-neutral-700', className)} title={fmtDateTime(user.lastLoginAt)}>
      {fmtRelative(user.lastLoginAt)}
      <span className="block text-caption text-neutral-500">{fmtDateTime(user.lastLoginAt)}</span>
    </span>
  );
}

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
  const errorCount = Object.keys(errors).length;
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={editing ? `Edit ${editing.fullName}` : 'Add a user'}
      description={editing ? 'Changes take effect on the user’s next request.' : 'Set the sign-in details and the roles that decide what this person can reach.'}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={handleSubmit(onSubmit)} loading={save.isPending}>{editing ? 'Save changes' : 'Create user'}</Button></>}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid sm:grid-cols-2 gap-4" noValidate>
        {errorCount > 0 && (
          <div className="sm:col-span-2">
            <Alert tone="danger" title={`${errorCount} field${errorCount === 1 ? '' : 's'} need${errorCount === 1 ? 's' : ''} attention`}>
              {Object.values(errors).map((e) => e?.message).filter(Boolean).join(' · ')}
            </Alert>
          </div>
        )}
        <Input label="Full name" required autoFocus error={errors.fullName?.message} {...register('fullName')} />
        <Input label="Username" required autoComplete="off" hint="What they type to sign in" error={errors.username?.message} {...register('username')} />
        <Input label="Email" type="email" error={errors.email?.message} {...register('email')} />
        <Input label="Phone" error={errors.phone?.message} {...register('phone')} />
        <PasswordInput label={editing ? 'New password (leave blank to keep)' : 'Password'} required={!editing} autoComplete="new-password" hint="Minimum 6 characters" error={errors.password?.message} {...register('password')} />
        <Input label="Approval PIN" inputMode="numeric" maxLength={4} hint="4 digits — used to approve cancellations & discounts (managers/admins)" error={errors.approvalPin?.message} {...register('approvalPin')} />
        <div className="sm:col-span-2">
          <p className="text-label text-neutral-700 mb-1.5">Roles <span className="text-danger-600">*</span></p>
          <Controller control={control} name="roles" render={({ field }) => (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {ROLES.map((r) => { const on = field.value.includes(r); return <label key={r} className={cn('flex items-center gap-2 rounded-sm border px-2 min-h-touch text-sm cursor-pointer', on ? 'bg-primary-50 border-primary-200 text-primary-800' : 'border-neutral-200 hover:border-neutral-300')}><input type="checkbox" className="h-4 w-4 rounded-sm shrink-0" checked={on} onChange={() => field.onChange(on ? field.value.filter((x) => x !== r) : [...field.value, r])} /><span className="min-w-0 truncate">{ROLE_LABELS[r]}</span></label>; })}
            </div>
          )} />
          <p className="text-caption text-neutral-500 mt-1">Roles carry the permissions; the matrix behind each role is on the Roles page.</p>
          {errors.roles?.message && <p role="alert" className="text-caption text-danger-600 mt-1">{errors.roles.message}</p>}
        </div>
        {canBranches && (branches.data ?? []).length > 1 && (
          <div className="sm:col-span-2">
            <p className="text-label text-neutral-700 mb-1.5">Branch access</p>
            <Controller control={control} name="branchIds" render={({ field }) => (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {(branches.data ?? []).map((b) => { const on = field.value.includes(Number(b.id)); return <label key={b.id} className={cn('flex items-center gap-2 rounded-sm border px-2 min-h-touch text-sm cursor-pointer', on ? 'bg-primary-50 border-primary-200 text-primary-800' : 'border-neutral-200 hover:border-neutral-300')}><input type="checkbox" className="h-4 w-4 rounded-sm shrink-0" checked={on} onChange={() => field.onChange(on ? field.value.filter((x) => x !== Number(b.id)) : [...field.value, Number(b.id)])} /><span className="min-w-0 truncate">{b.name}</span></label>; })}
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
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [editing, setEditing] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const [toggle, setToggle] = useState<User | null>(null);
  const [pwdFor, setPwdFor] = useState<User | null>(null);
  const [pwd, setPwd] = useState('');
  const setStatusMutation = useMutation({ mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => usersApi.setStatus(id, isActive), onSuccess: (u) => { void qc.invalidateQueries({ queryKey: ['users'] }); toast.success(u.isActive ? 'User activated' : 'User deactivated'); } });
  const setPassword = useMutation({ mutationFn: ({ id, password }: { id: number; password: string }) => usersApi.setPassword(id, password), onSuccess: () => toast.success('Password updated') });

  const all = useMemo(() => users.data ?? [], [users.data]);
  // Status is narrowed over the rows already fetched — no second request just to count.
  const counts = useMemo(() => ({
    total: all.length,
    active: all.filter((u) => u.isActive).length,
    inactive: all.filter((u) => !u.isActive).length,
    never: all.filter((u) => !u.lastLoginAt).length,
  }), [all]);
  const rows = useMemo(() => all.filter((u) => {
    if (status === 'ACTIVE') return u.isActive;
    if (status === 'INACTIVE') return !u.isActive;
    if (status === 'NEVER') return !u.lastLoginAt;
    return true;
  }), [all, status]);
  const filtered = !!search || role !== 'ALL' || status !== 'ALL';
  const clearFilters = () => { setSearch(''); setRole('ALL'); setStatus('ALL'); };
  /** A stat card doubles as the filter it describes — selected state is border + ring + hint text. */
  const cardProps = (v: StatusFilter) => ({
    onClick: () => setStatus((s) => (s === v ? 'ALL' : v)),
    className: status === v ? 'border-primary-600 ring-1 ring-primary-600' : undefined,
  });

  const deactivateButton = (u: User, block?: boolean) => {
    const self = u.id === me?.id;
    return u.isActive ? (
      <Button
        size="sm"
        variant="outline"
        block={block}
        disabled={self}
        title={self ? 'You cannot deactivate your own account' : undefined}
        className={cn('min-h-touch', !self && 'text-danger-700 border-danger-200 hover:bg-danger-50 hover:border-danger-300')}
        leftIcon={<UserX className="h-4 w-4" />}
        onClick={(e) => { e.stopPropagation(); setToggle(u); }}
      >
        Deactivate
        {self && <span className="sr-only"> — not available on your own account</span>}
      </Button>
    ) : (
      <Button size="sm" variant="outline" block={block} className="min-h-touch" leftIcon={<UserCheck className="h-4 w-4" />} onClick={(e) => { e.stopPropagation(); setToggle(u); }}>
        Reactivate
      </Button>
    );
  };

  const columns = useMemo<Column<User>[]>(() => [
    {
      key: 'name', header: 'User', sortValue: (u) => u.fullName,
      render: (u) => (
        <div className="flex items-center gap-3 min-w-0">
          <Avatar name={u.fullName} size="sm" />
          <div className="min-w-0">
            <p className={cn('font-medium truncate', !u.isActive && 'text-neutral-500')}>
              {u.fullName}{u.id === me?.id && <span className="text-caption text-neutral-500"> (you)</span>}
            </p>
            <p className="text-caption text-neutral-500 truncate">@{u.username}{u.email ? ` · ${u.email}` : ''}</p>
          </div>
        </div>
      ),
    },
    { key: 'roles', header: 'Roles', render: (u) => <div className="flex flex-wrap gap-1">{u.roles.map((r) => <Badge key={r} tone="primary" size="sm">{ROLE_LABELS[r]}</Badge>)}</div> },
    {
      key: 'branches', header: 'Branch access', hideBelow: 'lg', sortValue: (u) => u.branchIds?.length ?? 0,
      render: (u) => (
        <span className="inline-flex items-center gap-1.5 text-neutral-600">
          <Building2 className="h-3.5 w-3.5 shrink-0 text-neutral-400" aria-hidden />
          {u.branchIds?.length ? `${u.branchIds.length} branch${u.branchIds.length === 1 ? '' : 'es'}` : 'Home branch only'}
        </span>
      ),
    },
    { key: 'disc', header: 'Max discount', hideBelow: 'lg', align: 'right', sortValue: (u) => u.maxDiscountPercent, render: (u) => <span className="tabular-nums">{u.maxDiscountPercent}%</span> },
    { key: 'login', header: 'Last sign-in', hideBelow: 'md', sortValue: (u) => u.lastLoginAt ?? '', render: (u) => <LastSignIn user={u} className="text-sm" /> },
    {
      key: 'status', header: 'Status', sortValue: (u) => (u.isActive ? 'A' : 'Z'),
      render: (u) => (
        <Badge tone={u.isActive ? 'success' : 'neutral'} size="sm" icon={u.isActive ? <ShieldCheck className="h-3 w-3" aria-hidden /> : <ShieldOff className="h-3 w-3" aria-hidden />}>
          {u.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    ...(canManage ? [{
      key: 'actions', header: <span className="sr-only">Actions</span>, align: 'right' as const,
      render: (u: User) => (
        <div className="flex justify-end items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <IconButton label={`Edit ${u.fullName}`} size="sm" onClick={() => { setEditing(u); setOpen(true); }}><Pencil className="h-4 w-4" /></IconButton>
          <IconButton label={`Set a new password for ${u.fullName}`} size="sm" onClick={() => { setPwd(''); setPwdFor(u); }}><KeyRound className="h-4 w-4" /></IconButton>
          {deactivateButton(u)}
        </div>
      ),
    }] : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [canManage, me?.id]);

  return (
    <div>
      <PageHeader
        title="Users & access"
        subtitle="Who can sign in, the roles they hold, and whether the account is live"
        actions={canManage
          ? <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setOpen(true); }}>Add user</Button>
          : undefined}
      >
        <div className="flex flex-col lg:flex-row lg:items-center gap-2 min-w-0">
          <SearchInput value={search} onChange={setSearch} placeholder="Search name, username, email" className="lg:w-72" />
          {/* Role is a select rather than a second scrolling segmented row — nine roles do not fit a 390 px line. */}
          <FilterSelect
            ariaLabel="Filter by role"
            className="lg:w-48"
            value={role}
            onChange={(e) => setRole(e.target.value as 'ALL' | RoleCodeKey)}
            options={[{ value: 'ALL', label: 'All roles' }, ...ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))]}
          />
          <SegmentedControl
            size="sm"
            ariaLabel="Filter by account status"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'ALL', label: 'All', count: counts.total },
              { value: 'ACTIVE', label: 'Active', count: counts.active },
              { value: 'INACTIVE', label: 'Inactive', count: counts.inactive },
              { value: 'NEVER', label: 'Never signed in', count: counts.never },
            ]}
          />
          {filtered && <Button size="sm" variant="ghost" className="self-start lg:self-auto min-h-touch" leftIcon={<X className="h-4 w-4" />} onClick={clearFilters}>Clear filters</Button>}
        </div>
      </PageHeader>

      {!canManage && (
        <Alert tone="info" className="mb-4" title="Read-only">
          You can see who has access, but only a user with the “Manage users” permission can add accounts, change roles or deactivate anyone.
        </Alert>
      )}

      {users.isLoading && <LoadingState variant="table" rows={6} />}
      {users.isError && <ErrorState error={users.error} onRetry={() => void users.refetch()} />}

      {users.data && (
        <>
          {/*
            One column at 390 px so each card is a full-width ROW (StatCard's mobile variant) —
            two 170 px columns crushed the label. Each card also sets the status filter it names.
          */}
          <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4">
            <StatCard
              label="Accounts"
              value={counts.total}
              tone="primary"
              icon={<UsersIcon className="h-5 w-5" />}
              hint={search || role !== 'ALL' ? 'Matching the search and role filter' : 'Every account in this branch'}
              {...cardProps('ALL')}
            />
            <StatCard label="Active" value={counts.active} tone="success" icon={<ShieldCheck className="h-5 w-5" />} hint={status === 'ACTIVE' ? 'Showing these' : 'Able to sign in right now'} {...cardProps('ACTIVE')} />
            <StatCard label="Inactive" value={counts.inactive} tone={counts.inactive > 0 ? 'warning' : 'neutral'} icon={<ShieldOff className="h-5 w-5" />} hint={status === 'INACTIVE' ? 'Showing these' : 'Blocked from signing in'} {...cardProps('INACTIVE')} />
            <StatCard label="Never signed in" value={counts.never} tone={counts.never > 0 ? 'info' : 'neutral'} icon={<Clock className="h-5 w-5" />} hint={status === 'NEVER' ? 'Showing these' : 'Created but not yet used'} {...cardProps('NEVER')} />
          </div>

          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(u) => u.id}
            pageSize={25}
            caption="Staff accounts with roles, branch access, discount limit, last sign-in and status"
            toolbar={
              <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                <p className="text-sm text-neutral-600 min-w-0" aria-live="polite">
                  <span className="font-semibold text-neutral-900 tabular-nums">{rows.length}</span> account{rows.length === 1 ? '' : 's'}
                  {status !== 'ALL' && <> · {STATUS_LABEL[status]}</>}
                  {role !== 'ALL' && <> · {ROLE_LABELS[role]}</>}
                  {search && <> · matching “{search.trim()}”</>}
                </p>
                {filtered && <Button size="sm" variant="ghost" className="min-h-touch" leftIcon={<X className="h-4 w-4" />} onClick={clearFilters}>Clear filters</Button>}
              </div>
            }
            emptyTitle={filtered ? 'No account matches these filters' : 'No users yet'}
            emptyDescription={filtered ? 'Try a different role or status, or clear the filters.' : 'Add the first staff account to give someone access to this branch.'}
            emptyAction={filtered
              ? <Button variant="outline" onClick={clearFilters}>Clear filters</Button>
              : canManage ? <Button onClick={() => { setEditing(null); setOpen(true); }}>Add user</Button> : undefined}
            mobileCard={(u) => (
              <div className="space-y-2.5">
                <div className="flex items-start gap-3">
                  <Avatar name={u.fullName} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className={cn('font-medium truncate', !u.isActive && 'text-neutral-500')}>
                      {u.fullName}{u.id === me?.id && <span className="text-caption text-neutral-500"> (you)</span>}
                    </p>
                    <p className="text-caption text-neutral-500 truncate">@{u.username}{u.email ? ` · ${u.email}` : ''}</p>
                  </div>
                  <Badge tone={u.isActive ? 'success' : 'neutral'} size="sm" icon={u.isActive ? <ShieldCheck className="h-3 w-3" aria-hidden /> : <ShieldOff className="h-3 w-3" aria-hidden />}>
                    {u.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1">{u.roles.map((r) => <Badge key={r} tone="primary" size="sm">{ROLE_LABELS[r]}</Badge>)}</div>
                <p className="text-caption"><LastSignIn user={u} /></p>
                {canManage && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button size="sm" variant="outline" className="min-h-touch" leftIcon={<Pencil className="h-4 w-4" />} onClick={(e) => { e.stopPropagation(); setEditing(u); setOpen(true); }}>Edit</Button>
                    <Button size="sm" variant="outline" className="min-h-touch" leftIcon={<KeyRound className="h-4 w-4" />} onClick={(e) => { e.stopPropagation(); setPwd(''); setPwdFor(u); }}>Password</Button>
                    {deactivateButton(u)}
                  </div>
                )}
              </div>
            )}
          />
        </>
      )}

      {open && <UserForm onClose={() => setOpen(false)} editing={editing} />}

      <ConfirmDialog
        open={!!toggle}
        onClose={() => setToggle(null)}
        variant={toggle?.isActive ? 'danger' : 'primary'}
        title={toggle?.isActive ? `Deactivate ${toggle?.fullName}?` : `Reactivate ${toggle?.fullName}?`}
        message={toggle?.isActive ? (
          <>
            <p>This takes effect immediately:</p>
            <ul className="mt-1.5 space-y-1 list-disc pl-5">
              <li>every open session of theirs is revoked, so they are signed out of every till and tablet;</li>
              <li>they cannot sign in again until someone reactivates the account;</li>
              <li>orders, bills and audit entries they created stay exactly as they are.</li>
            </ul>
            <p className="mt-2">Nothing is deleted — you can reactivate the account at any time.</p>
          </>
        ) : 'They will be able to sign in again with their existing username and password. Their roles and branch access are unchanged.'}
        confirmLabel={toggle?.isActive ? 'Deactivate account' : 'Reactivate account'}
        loading={setStatusMutation.isPending}
        onConfirm={async () => { if (toggle) { try { await setStatusMutation.mutateAsync({ id: Number(toggle.id), isActive: !toggle.isActive }); } finally { setToggle(null); } } }}
      />

      <Modal
        open={!!pwdFor}
        onClose={() => setPwdFor(null)}
        size="sm"
        title={`Set a new password — ${pwdFor?.fullName}`}
        description="The new password works immediately. Tell the user in person; it is never emailed."
        footer={<><Button variant="outline" onClick={() => setPwdFor(null)}>Cancel</Button><Button loading={setPassword.isPending} disabled={pwd.length < 6} onClick={async () => { if (pwdFor) { await setPassword.mutateAsync({ id: Number(pwdFor.id), password: pwd }); setPwdFor(null); } }}>Set password</Button></>}
      >
        <PasswordInput label="New password" autoFocus autoComplete="new-password" value={pwd} onChange={(e) => setPwd(e.target.value)} hint="Minimum 6 characters" />
      </Modal>
    </div>
  );
}
