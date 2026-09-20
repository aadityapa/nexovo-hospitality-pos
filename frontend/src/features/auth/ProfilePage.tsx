import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { LogOut, ShieldCheck, Building2, KeyRound, Lock, CheckCircle2, Clock, Percent, UserRound, ShieldAlert } from 'lucide-react';
import { useAuth, usePermission } from '@/hooks/useAuth';
import { useBranch } from '@/components/layout/Shell';
import { usersApi } from '@/services/api/endpoints';
import { ApiError } from '@/services/api/client';
import { PageHeader, Card, CardHeader, KeyValue, Badge, Avatar, Button, EmptyState, PasswordInput, Alert, InlineError } from '@/components/ui';
import { ROLE_LABELS, permissionModule, PERMISSION_MODULES, PERMISSIONS } from '@/config/permissions';
import { fmtDateTime, fmtRelative } from '@/utils/date';

/**
 * MY PROFILE — two clearly separated concerns.
 *
 *   1. Profile details — who this account is, what it may spend, what its roles allow.
 *   2. Security        — changing the password on this account.
 *
 * The password section states the truth about the system it runs on. There is exactly one
 * password endpoint (`PUT /users/:id/password`) and the server asserts `users:manage` on it.
 * An account without that permission therefore CANNOT change its own password here, so no
 * control is rendered for it — a disabled or failing button would be worse than a sentence.
 * Where the control does work, success is announced only after the mutation resolves.
 */

const MIN_PASSWORD = 6;

function SecurityPanel() {
  const { user } = useAuth();
  // The endpoint behind "change my password" is the admin password-reset endpoint.
  const canSetPassword = usePermission('users:manage');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const change = useMutation({
    mutationFn: (password: string) => usersApi.setPassword(user!.id, password),
  });

  const tooShort = next.length > 0 && next.length < MIN_PASSWORD;
  const mismatch = confirm.length > 0 && confirm !== next;
  const valid = next.length >= MIN_PASSWORD && confirm === next;

  /** Any keystroke invalidates the previous outcome — a success banner must never outlive its edit. */
  const edit = (set: (v: string) => void) => (v: string) => {
    if (change.isSuccess || change.isError) change.reset();
    setSubmitted(false);
    set(v);
  };

  const submit = () => {
    setSubmitted(true);
    if (!valid) return;
    change.mutate(next, {
      onSuccess: () => { setNext(''); setConfirm(''); setSubmitted(false); },
    });
  };

  return (
    <Card>
      <CardHeader
        title={<span className="flex items-center gap-2"><KeyRound className="h-[18px] w-[18px] text-neutral-400" aria-hidden />Password</span>}
        subtitle="Sign-in credentials for this account"
      />

      {!canSetPassword ? (
        /*
          Honest, not decorative. The only password endpoint this app has requires
          `users:manage`; rendering a form here would produce a 403 on submit.
        */
        <Alert tone="warning" title="You cannot change your own password from here">
          <p>
            This system has a single password endpoint and the server requires the <strong>“Manage users”</strong> permission on it.
            Your roles ({user?.roles.map((r) => ROLE_LABELS[r]).join(', ') || 'none'}) do not include it, so there is no control on this page that would work.
          </p>
          <p className="mt-2">
            Ask an administrator to set a new one for you — they do it from <strong>Users &amp; access</strong>, and the new password works immediately.
            Passwords are never emailed; you will be told in person.
          </p>
        </Alert>
      ) : (
        <>
          <Alert tone="info" className="mb-4">
            Changing this sets the password on your own account immediately. Other people signed in as you are not signed out —
            an administrator deactivates an account from <strong>Users &amp; access</strong> if sessions must be revoked.
          </Alert>

          {change.isSuccess && (
            <Alert tone="success" className="mb-4" title="Password changed">
              Use the new password the next time you sign in. Nothing else about the account changed.
            </Alert>
          )}

          <form
            className="grid sm:grid-cols-2 gap-4"
            noValidate
            onSubmit={(e) => { e.preventDefault(); submit(); }}
          >
            <PasswordInput
              label="New password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => edit(setNext)(e.target.value)}
              hint={`At least ${MIN_PASSWORD} characters`}
              error={tooShort ? `At least ${MIN_PASSWORD} characters` : submitted && !next ? 'Enter a new password' : undefined}
            />
            <PasswordInput
              label="Confirm new password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => edit(setConfirm)(e.target.value)}
              hint="Type it a second time so a typo cannot lock you out"
              error={mismatch ? 'The two passwords do not match' : submitted && !confirm ? 'Confirm the new password' : undefined}
            />
            <div className="sm:col-span-2">
              {change.isError && <InlineError message={ApiError.from(change.error).message} />}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {/*
                  The button stays enabled on an incomplete form: pressing it names what is missing,
                  which a greyed-out control never does. Success wording appears only after the
                  mutation resolves — the label never changes on optimism.
                */}
                <Button type="submit" leftIcon={<KeyRound className="h-4 w-4" />} loading={change.isPending}>
                  Change password
                </Button>
                <p className="text-caption text-neutral-500 min-w-0" aria-live="polite">
                  {change.isPending
                    ? 'Sending the change to the server…'
                    : submitted && !valid
                      ? 'Fix the two fields above, then press again.'
                      : 'Nothing is saved until you press this.'}
                </p>
              </div>
            </div>
          </form>
        </>
      )}
    </Card>
  );
}

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const { data: branch } = useBranch();

  const modules = useMemo(() => {
    if (!user) return [];
    const grouped = user.permissions.reduce<Record<string, string[]>>((acc, p) => {
      (acc[permissionModule(p)] ??= []).push(p);
      return acc;
    }, {});
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
  }, [user]);

  if (!user) return null;

  const branchCount = user.branchIds?.length ?? 0;

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="My profile"
        subtitle="Your account details, your security, and what your roles allow you to do"
        actions={<Button variant="outline" leftIcon={<LogOut className="h-4 w-4" />} onClick={() => void logout()}>Sign out</Button>}
      />

      {/* ============================================================ 1. Profile details */}
      <section aria-labelledby="profile-details-heading">
        <h2 id="profile-details-heading" className="text-label uppercase text-neutral-500 mb-2 flex items-center gap-1.5">
          <UserRound className="h-3.5 w-3.5 text-neutral-400" aria-hidden />Profile details
        </h2>

        <div className="grid gap-4 lg:grid-cols-3 items-start">
          <Card className="lg:col-span-1">
            <div className="flex items-center gap-4 min-w-0">
              <Avatar name={user.fullName} size="lg" />
              <div className="min-w-0">
                <p className="text-subheading text-neutral-900 break-words">{user.fullName}</p>
                <p className="text-sm text-neutral-500 truncate">@{user.username}</p>
                <Badge
                  size="sm"
                  tone={user.isActive ? 'success' : 'neutral'}
                  className="mt-1.5"
                  icon={user.isActive ? <CheckCircle2 className="h-3 w-3" aria-hidden /> : <ShieldAlert className="h-3 w-3" aria-hidden />}
                >
                  {user.isActive ? 'Active account' : 'Inactive account'}
                </Badge>
              </div>
            </div>

            <KeyValue
              className="mt-6"
              items={[
                { label: 'Email', value: user.email || <span className="text-neutral-400">Not set</span> },
                { label: 'Phone', value: user.phone || <span className="text-neutral-400">Not set</span> },
                {
                  label: 'Roles',
                  value: (
                    <span className="flex flex-wrap gap-1 justify-end">
                      {user.roles.map((r) => <Badge key={r} tone="primary">{ROLE_LABELS[r]}</Badge>)}
                    </span>
                  ),
                },
                {
                  label: 'Discount limit',
                  value: (
                    <span className="inline-flex items-center gap-1.5">
                      <Percent className="h-3.5 w-3.5 text-neutral-400" aria-hidden />
                      <span className="tabular-nums font-medium">{user.maxDiscountPercent}%</span>
                    </span>
                  ),
                },
                {
                  label: 'Last sign-in',
                  value: user.lastLoginAt
                    ? <span className="inline-flex flex-col items-end"><span>{fmtDateTime(user.lastLoginAt)}</span><span className="text-caption text-neutral-500">{fmtRelative(user.lastLoginAt)}</span></span>
                    : <span className="inline-flex items-center gap-1.5 text-neutral-500"><Clock className="h-3.5 w-3.5 text-neutral-400" aria-hidden />No earlier sign-in recorded</span>,
                },
              ]}
            />

            <p className="text-caption text-neutral-500 mt-4">
              Name, email, phone and roles are set by an administrator on the Users &amp; access page — they are read-only here.
            </p>

            {branch && (
              <div className="mt-5 pt-4 border-t border-neutral-100 flex items-start gap-2.5 text-sm">
                <Building2 className="h-4 w-4 text-neutral-400 mt-0.5 shrink-0" aria-hidden />
                <div className="min-w-0">
                  <p className="text-neutral-900 font-medium break-words">{branch.businessName}</p>
                  <p className="text-caption text-neutral-500 break-words">
                    Working in {branch.name}
                    {branchCount > 1 ? ` · ${branchCount} branches available from the header switcher` : ' · this is your only branch'}
                  </p>
                </div>
              </div>
            )}
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader
              title={<span className="flex items-center gap-2"><ShieldCheck className="h-[18px] w-[18px] text-neutral-400" aria-hidden />What your roles allow</span>}
              subtitle={`${user.permissions.length} of ${PERMISSIONS.length} permissions, granted by your roles and enforced on the server for every request`}
            />
            {modules.length === 0 ? (
              <EmptyState compact title="No permissions granted" description="Ask an administrator to assign a role to your account — without one, most screens will refuse to load." />
            ) : (
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-5">
                {modules.map(([m, perms]) => (
                  <div key={m} className="min-w-0">
                    <p className="text-label text-neutral-500 uppercase mb-2 flex items-center justify-between gap-2">
                      <span className="truncate">{PERMISSION_MODULES[m] ?? m}</span>
                      <span className="tabular-nums text-neutral-400 shrink-0">{perms.length}</span>
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {perms.map((p) => <Badge key={p} size="sm" className="font-mono text-[10px]">{p}</Badge>)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </section>

      {/* ============================================================ 2. Security */}
      <section aria-labelledby="security-heading" className="mt-6">
        <h2 id="security-heading" className="text-label uppercase text-neutral-500 mb-2 flex items-center gap-1.5">
          <Lock className="h-3.5 w-3.5 text-neutral-400" aria-hidden />Security
        </h2>
        <SecurityPanel />
      </section>
    </div>
  );
}
