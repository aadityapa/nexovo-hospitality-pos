import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { LogOut, ShieldCheck, Building2, KeyRound, Lock, CheckCircle2, Clock, Percent, UserRound, ShieldAlert, CalendarDays, Mail, Phone, type LucideIcon } from 'lucide-react';
import { useAuth, usePermission } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useSurface';
import { useBranch } from '@/components/layout/Shell';
import { usersApi } from '@/services/api/endpoints';
import { ApiError } from '@/services/api/client';
import { PageHeader, Card, CardHeader, KeyValue, Badge, Avatar, Button, EmptyState, PasswordInput, Alert, InlineError } from '@/components/ui';
import { ROLE_LABELS, permissionModule, PERMISSION_MODULES, PERMISSIONS } from '@/config/permissions';
import { fmtDate, fmtDateTime, fmtRelative } from '@/utils/date';
import { cn } from '@/utils/cn';

/**
 * MY PROFILE — two clearly separated concerns, and only two.
 *
 *   1. Profile  — who this account is, what it may spend, what its roles allow.
 *   2. Security — changing the password on this account. Nothing else.
 *
 * WHAT IS DELIBERATELY ABSENT (reference brief §7, verified against the API before being cut):
 *   • "Enable 2FA" — there is no enrolment, no secret store and no verification step.
 *   • "Manage sessions" / "Active sessions" — a session here is one bearer token; there is no
 *     session list to show, let alone revoke individually. Sign out is real and stays.
 *   • "Change photo" — the user record has no avatar field; the tile is drawn from initials.
 *   • An editable personal-details form — the only write endpoint for a user is
 *     `PUT /users/:id`, which the server gates on `users:manage`. Name, email, phone and roles
 *     are therefore set by an administrator on Users & access and are read-only here, which the
 *     page says in words rather than by greying out a control that would 403.
 *
 * The password section states the same truth. There is exactly one password endpoint
 * (`PUT /users/:id/password`) and the server asserts `users:manage` on it. An account without
 * that permission cannot change its own password here, so no control is rendered for it — a
 * disabled or failing button would be worse than a sentence. Where the control does work,
 * success is announced only after the mutation resolves.
 */

const MIN_PASSWORD = 6;

type Section = 'profile' | 'security';

const SECTIONS: { id: Section; label: string; icon: LucideIcon }[] = [
  { id: 'profile', label: 'Profile', icon: UserRound },
  { id: 'security', label: 'Security', icon: Lock },
];

/**
 * Section navigation — the reference's fixed 220 px rail at `lg`, and one scrolling line of
 * chips above the content below it. The active entry is gold-tinted behind a gold left rail and
 * is named by `aria-current`, not by colour alone.
 */
function SectionNav({ value, onChange }: { value: Section; onChange: (s: Section) => void }) {
  return (
    <nav aria-label="Profile sections" className="min-w-0">
      <div className="lg:hidden flex gap-2 overflow-x-auto overscroll-x-contain no-scrollbar py-1 -mx-1 px-1">
        {SECTIONS.map((s) => {
          const on = s.id === value;
          return (
            <button
              key={s.id}
              type="button"
              aria-current={on ? 'true' : undefined}
              onClick={() => onChange(s.id)}
              className={cn(
                'shrink-0 min-h-touch px-3.5 rounded-full border text-sm font-medium inline-flex items-center gap-1.5 transition-colors duration-control press',
                on
                  ? 'bg-gold-sheen bg-primary-500 border-primary-400 text-on-primary'
                  : 'bg-neutral-100 border-neutral-300 text-neutral-800 hover:bg-neutral-200 hover:border-neutral-400',
              )}
            >
              <s.icon className={cn('h-3.5 w-3.5 shrink-0', on ? 'text-on-primary' : 'text-neutral-400')} aria-hidden />
              {s.label}
            </button>
          );
        })}
      </div>

      <ul className="hidden lg:block card p-0 overflow-hidden">
        {SECTIONS.map((s) => {
          const on = s.id === value;
          return (
            <li key={s.id} className="border-b border-neutral-200 last:border-b-0">
              <button
                type="button"
                aria-current={on ? 'true' : undefined}
                onClick={() => onChange(s.id)}
                className={cn(
                  'w-full text-left px-3.5 py-3 flex items-center gap-2.5 border-l-4 text-sm transition-colors duration-control hover:bg-neutral-100 min-h-touch',
                  on ? 'border-l-primary-500 bg-primary-50 text-primary-900 font-medium' : 'border-l-transparent text-neutral-700',
                )}
              >
                <s.icon className={cn('h-4 w-4 shrink-0', on ? 'text-primary-700' : 'text-neutral-400')} aria-hidden />
                <span className="min-w-0 truncate">{s.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function SecurityPanel() {
  const { user } = useAuth();
  const ws = useWorkspace();
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
        title={<span className="flex items-center gap-2"><KeyRound className="h-[18px] w-[18px] text-neutral-400" aria-hidden />{ws === 'manager' ? 'Change your password' : 'Password'}</span>}
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
            className="grid grid-cols-1 sm:grid-cols-2 gap-4"
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
                  {ws === 'manager' ? 'Update password' : 'Change password'}
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
  const ws = useWorkspace();
  const { data: branch } = useBranch();
  const [section, setSection] = useState<Section>('profile');

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

  /* ACCOUNT DETAILS — only rows the API actually returns. `createdAt` is optional on the user
     record, so "Member since" simply does not appear when the server did not send it. */
  const accountRows = [
    {
      label: 'Role',
      value: (
        <span className="flex flex-wrap gap-1 justify-end">
          {user.roles.map((r) => <Badge key={r} tone="primary">{ROLE_LABELS[r]}</Badge>)}
        </span>
      ),
    },
    {
      label: 'Branch',
      value: branch
        ? <span className="inline-flex flex-col items-end"><span>{branch.name}</span><span className="text-caption text-neutral-500">{branchCount > 1 ? `${branchCount} branches available` : 'your only branch'}</span></span>
        : <span className="text-neutral-400">Not loaded</span>,
    },
    ...(user.createdAt ? [{
      label: 'Member since',
      value: (
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5 text-neutral-400" aria-hidden />
          <span>{fmtDate(user.createdAt)}</span>
        </span>
      ),
    }] : []),
    {
      label: 'Last active',
      value: user.lastLoginAt
        ? <span className="inline-flex flex-col items-end"><span>{fmtRelative(user.lastLoginAt)}</span><span className="text-caption text-neutral-500">{fmtDateTime(user.lastLoginAt)}</span></span>
        : <span className="inline-flex items-center gap-1.5 text-neutral-500"><Clock className="h-3.5 w-3.5 text-neutral-400" aria-hidden />No earlier sign-in recorded</span>,
    },
  ];

  return (
    <div className="max-w-5xl pb-nav">
      <PageHeader
        title="My profile"
        subtitle="Your account details, your security, and what your roles allow you to do"
        actions={<Button variant="outline" leftIcon={<LogOut className="h-4 w-4" />} onClick={() => void logout()}>Sign out</Button>}
      />

      {/* Base `grid-cols-1`; the rail is a fixed track beside an explicit `minmax(0,1fr)`. */}
      <div className="grid grid-cols-1 gap-4 lg:gap-5 lg:grid-cols-[220px_minmax(0,1fr)] items-start">
        <SectionNav value={section} onChange={setSection} />

        <div className="min-w-0 space-y-4">
          {section === 'profile' && (
            <>
              {/* ---------------------------------------------------------- Identity */}
              <Card>
                <div className="flex items-center gap-4 min-w-0">
                  {/* The gold tile belongs to exactly one person in the product: whoever is signed
                      in. There is no avatar field on the user record and no upload endpoint, so
                      the mark is drawn from initials and there is no "change photo" control. */}
                  <Avatar name={user.fullName} size="lg" />
                  <div className="min-w-0">
                    <p className="text-subheading text-neutral-900 break-words">{user.fullName}</p>
                    <p className="text-sm text-neutral-500 truncate">@{user.username}</p>
                    {/* The manager board carries the two contact fields on the identity card
                        itself. They are the same values Personal details prints below, and a
                        field the user record does not hold prints nothing at all. */}
                    {ws === 'manager' && (user.email || user.phone) && (
                      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-sm">
                        {user.email && (
                          <a href={`mailto:${user.email}`} className="inline-flex items-center gap-1.5 text-primary-700 hover:underline underline-offset-2 break-all">
                            <Mail className="h-4 w-4 shrink-0" aria-hidden />{user.email}
                          </a>
                        )}
                        {user.phone && (
                          <a href={`tel:${user.phone}`} className="inline-flex items-center gap-1.5 text-primary-700 hover:underline underline-offset-2">
                            <Phone className="h-4 w-4 shrink-0" aria-hidden />{user.phone}
                          </a>
                        )}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      {user.roles.map((r) => <Badge key={r} tone="primary" size="sm">{ROLE_LABELS[r]}</Badge>)}
                      <Badge
                        size="sm"
                        tone={user.isActive ? 'success' : 'neutral'}
                        icon={user.isActive ? <CheckCircle2 className="h-3 w-3" aria-hidden /> : <ShieldAlert className="h-3 w-3" aria-hidden />}
                      >
                        {user.isActive ? 'Active account' : 'Inactive account'}
                      </Badge>
                    </div>
                  </div>
                </div>

                {branch && (
                  <div className="mt-5 pt-4 border-t border-neutral-200 flex items-start gap-2.5 text-sm">
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

              {/* ---------------------------------------------------- Personal details */}
              <Card>
                <CardHeader
                  title={<span className="flex items-center gap-2"><UserRound className="h-[18px] w-[18px] text-neutral-400" aria-hidden />Personal details</span>}
                  subtitle="How you sign in and how the venue reaches you"
                />
                <KeyValue
                  items={[
                    { label: 'Full name', value: user.fullName },
                    { label: 'Username', value: <span className="font-mono text-[13px]">@{user.username}</span> },
                    { label: 'Email', value: user.email || <span className="text-neutral-400">Not set</span> },
                    { label: 'Phone', value: user.phone || <span className="text-neutral-400">Not set</span> },
                    {
                      label: 'Discount limit',
                      value: (
                        <span className="inline-flex items-center gap-1.5">
                          <Percent className="h-3.5 w-3.5 text-neutral-400" aria-hidden />
                          <span className="tabular-nums font-medium">{user.maxDiscountPercent}%</span>
                        </span>
                      ),
                    },
                  ]}
                />
                {/*
                  Honest, not decorative. The only endpoint that writes a user record is
                  `PUT /users/:id`, and the server asserts `users:manage` on it — so for almost
                  everybody an editable field here would produce a 403 on save. The page says so
                  instead of offering a form that cannot work.
                */}
                <p className="text-caption text-neutral-500 mt-4">
                  Name, username, email, phone and roles are set by an administrator on the Users &amp; access page —
                  they are read-only here. Your password is yours to change, under <strong>Security</strong>.
                </p>
              </Card>

              {/* ----------------------------------------------------- Account details */}
              <Card>
                <CardHeader
                  title={<span className="flex items-center gap-2"><ShieldCheck className="h-[18px] w-[18px] text-neutral-400" aria-hidden />{ws === 'manager' ? 'Account information' : 'Account details'}</span>}
                  subtitle="What this account is, as the server records it"
                />
                <KeyValue items={accountRows} />
              </Card>

              {/* ------------------------------------------------- What the roles allow */}
              <Card>
                <CardHeader
                  title={<span className="flex items-center gap-2"><ShieldCheck className="h-[18px] w-[18px] text-neutral-400" aria-hidden />What your roles allow</span>}
                  subtitle={`${user.permissions.length} of ${PERMISSIONS.length} permissions, granted by your roles and enforced on the server for every request`}
                />
                {modules.length === 0 ? (
                  <EmptyState compact title="No permissions granted" description="Ask an administrator to assign a role to your account — without one, most screens will refuse to load." />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-[repeat(2,minmax(0,1fr))] gap-x-6 gap-y-5">
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
            </>
          )}

          {/* Security holds exactly one thing: the password. No 2FA enrolment, no session list. */}
          {section === 'security' && <SecurityPanel />}
        </div>
      </div>
    </div>
  );
}
