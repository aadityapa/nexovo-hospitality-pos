import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, Save, Lock, Eye, Users, Check, Undo2, SearchX, Percent, PencilLine } from 'lucide-react';
import { rolesApi } from '@/services/api/endpoints';
import { usePermission } from '@/hooks/useAuth';
import { toast } from '@/store/uiStore';
import { PageHeader, Button, Card, CardHeader, LoadingState, ErrorState, EmptyState, Badge, Input, SearchInput, Checkbox, Alert } from '@/components/ui';
import { PERMISSIONS, PERMISSION_MODULES, PERMISSION_LABELS, permissionModule, type Permission } from '@/config/permissions';
import { cn } from '@/utils/cn';
import type { Role } from '@/types';

/** The part of a permission code after its module — `orders:cancel:item` → `cancel:item`. */
const actionOf = (p: Permission) => p.slice(p.indexOf(':') + 1);

/** Matrix header cell — the same band `DataTable` uses, so both read as one table language. */
const TH = 'px-4 py-3 text-label uppercase text-neutral-500 font-semibold whitespace-nowrap bg-surface border-b border-neutral-200 text-left';

/**
 * ROLES & PERMISSIONS — a master/detail editor.
 *
 * Layout, and why it is built this way (defect B, observed at 390 px):
 *   • At `lg` and above the classic two-pane arrangement holds: a 260 px role list on the
 *     left, the permission editor on the right.
 *   • Below `lg` the grid collapses to ONE column, so stacking the full role list above the
 *     editor pushed the thing you came to edit off the first two screens. The mobile role
 *     SELECTOR is therefore a single horizontally-scrollable chip row: it costs one line,
 *     it scrolls inside its own region (never the page), and the selected role is named by
 *     `aria-current` as well as by a filled chip.
 *   • Both horizontal scroll regions on this page (the chip row and the matrix) are
 *     `position: relative` — see the note on the matrix wrapper for why that, and nothing else,
 *     is what keeps the document at viewport width. The save bar uses the shared `.save-bar`
 *     rule, so it parks ABOVE the bottom navigation instead of on top of it.
 */

/** One role's headline numbers, spelled the same way everywhere on the page. */
function roleSummary(r: Role): string {
  const users = r.userCount ?? 0;
  return `${r.permissions.length} of ${PERMISSIONS.length} permissions · ${users} ${users === 1 ? 'user' : 'users'}`;
}

export default function RolesPage() {
  const canManage = usePermission('roles:manage');
  const qc = useQueryClient();
  const roles = useQuery({ queryKey: ['roles'], queryFn: rolesApi.list });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = roles.data?.find((r) => r.id === selectedId) ?? roles.data?.[0] ?? null;
  const [perms, setPerms] = useState<Permission[]>([]);
  const [maxDisc, setMaxDisc] = useState(0);
  const [filter, setFilter] = useState('');
  const save = useMutation({ mutationFn: (r: Role) => rolesApi.update(r.id, { permissions: perms, maxDiscountPercent: maxDisc }), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['roles'] }); toast.success('Role updated', 'Users receive the new permissions on their next request.'); } });
  // reset the editor only when the selected role changes or after a save — not on background refetches
  useEffect(() => { if (selected) { setPerms(selected.permissions); setMaxDisc(selected.maxDiscountPercent); } }, [selected?.id, save.submittedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => PERMISSIONS.reduce<Record<string, Permission[]>>((a, p) => { (a[permissionModule(p)] ??= []).push(p); return a; }, {}), []);
  const superAdmin = selected?.code === 'SUPER_ADMIN';
  const locked = !canManage || superAdmin;
  const toggle = (p: Permission) => setPerms((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]));
  const toggleModule = (m: string) => { const list = groups[m]; const all = list.every((p) => perms.includes(p)); setPerms((s) => (all ? s.filter((p) => !list.includes(p)) : [...new Set([...s, ...list])])); };

  // What exactly is unsaved — the save control names it rather than just lighting up.
  const changes = useMemo(() => {
    if (!selected) return { added: [] as Permission[], removed: [] as Permission[], discount: false, count: 0, touched: new Set<Permission>() };
    const added = perms.filter((p) => !selected.permissions.includes(p));
    const removed = selected.permissions.filter((p) => !perms.includes(p));
    const discount = maxDisc !== selected.maxDiscountPercent;
    return { added, removed, discount, count: added.length + removed.length + (discount ? 1 : 0), touched: new Set<Permission>([...added, ...removed]) };
  }, [perms, maxDisc, selected]);
  const dirty = changes.count > 0;

  const changeSummary = [
    changes.added.length ? `${changes.added.length} permission${changes.added.length === 1 ? '' : 's'} granted` : null,
    changes.removed.length ? `${changes.removed.length} permission${changes.removed.length === 1 ? '' : 's'} revoked` : null,
    changes.discount && selected ? `discount limit ${selected.maxDiscountPercent}% → ${maxDisc}%` : null,
  ].filter(Boolean).join(' · ');

  const discard = () => { if (selected) { setPerms(selected.permissions); setMaxDisc(selected.maxDiscountPercent); } };

  const q = filter.trim().toLowerCase();
  const visibleModules = useMemo(() => Object.entries(groups)
    .map(([m, list]) => [m, q ? list.filter((p) => p.toLowerCase().includes(q) || (PERMISSION_MODULES[m] ?? m).toLowerCase().includes(q)) : list] as [string, Permission[]])
    .filter(([, list]) => list.length > 0), [groups, q]);

  /** One editing mode, named once and reused, so the four possible states never blur together. */
  const mode: 'readonly' | 'system-locked' | 'editable' = !canManage ? 'readonly' : superAdmin ? 'system-locked' : 'editable';
  const users = selected?.userCount ?? 0;

  /**
   * ONE PERMISSION, AS A CHECKBOX — the shared control, whose checked state is already champagne.
   *
   * The accessible name is the permission code plus the module it belongs to, because "create"
   * on its own is ambiguous across twenty-six rows; where the catalogue spells a permission out
   * (`PERMISSION_LABELS` — the loyalty split), that sentence is part of the name and, in the
   * "Other actions" column, printed under the box as well. In the View and Manage columns the
   * column header already says the word, so the box's own label is not drawn a second time and
   * the name is carried by `aria-label`. A permission changed since the last save carries an
   * amber ring AND says so in its name, never colour alone.
   */
  const permBox = (p: Permission, moduleLabel: string, text?: string) => {
    const touched = changes.touched.has(p);
    const meaning = PERMISSION_LABELS[p];
    const name = `${p} — ${moduleLabel}${meaning ? `. ${meaning}` : ''}${touched ? '. Changed, not yet saved' : ''}`;
    return (
      <span key={p} className={cn('inline-flex items-start rounded-md min-w-0', touched && 'ring-2 ring-warning-500 px-1.5 -mx-1.5')}>
        <Checkbox
          label={text ?? actionOf(p)}
          description={text ? meaning : undefined}
          aria-label={name}
          checked={perms.includes(p)}
          disabled={locked}
          onChange={() => toggle(p)}
          className={text ? undefined : '[&>span]:hidden'}
        />
      </span>
    );
  };

  /** A column that does not apply to this module says so, rather than showing a dead control. */
  const notApplicable = (moduleLabel: string, column: string) => (
    <span className="text-neutral-400">
      —<span className="sr-only">no {column.toLowerCase()} permission exists for {moduleLabel}</span>
    </span>
  );

  return (
    /* `min-w-0` on the page root is ordinary hygiene for a page that holds a wide table. It was
       NOT the 436 px document — that cause is named on the matrix wrapper below. */
    <div className="min-w-0">
      <PageHeader
        title="Roles & permissions"
        subtitle="A role is a set of permissions. The server enforces them on every request — this matrix is how you change them."
      />

      {roles.isLoading && <LoadingState variant="page" />}
      {roles.isError && <ErrorState error={roles.error} onRetry={() => void roles.refetch()} />}

      {roles.data && roles.data.length === 0 && (
        <EmptyState
          icon={<Shield className="h-6 w-6" />}
          title="No roles are defined"
          description="Roles are seeded with the branch. If this list is empty the account has no role catalogue to read — ask an administrator."
        />
      )}

      {roles.data && selected && (
        <>
          {/* ------------------------------------------------------- Mobile role selector
              One scrolling line instead of a stacked list, so the editor for the chosen role
              is always the next thing on screen. Hidden once the two-pane layout takes over. */}
          <div className="lg:hidden mb-4 min-w-0">
            <p className="text-label uppercase text-neutral-500 mb-1.5" id="role-picker-label">Role being edited</p>
            <div
              role="group"
              aria-labelledby="role-picker-label"
              /* `relative` for the same reason as the matrix wrapper below: the selected chip
                 carries a `sr-only` span, and a scroll region must be the containing block of
                 its own absolutely-positioned descendants or they escape its clip. */
              className="relative flex gap-2 overflow-x-auto overscroll-x-contain no-scrollbar py-1 w-full min-w-0"
            >
              {roles.data.map((r) => {
                const on = selected.id === r.id;
                const sys = r.code === 'SUPER_ADMIN';
                return (
                  <button
                    key={r.id}
                    type="button"
                    aria-current={on ? 'true' : undefined}
                    onClick={() => setSelectedId(Number(r.id))}
                    className={cn(
                      'shrink-0 min-h-touch px-3.5 rounded-full border text-sm font-medium inline-flex items-center gap-1.5 transition-colors duration-control press',
                      on
                        ? 'bg-gold-sheen bg-primary-500 border-primary-400 text-on-primary'
                        : 'bg-neutral-100 border-neutral-300 text-neutral-800 hover:bg-neutral-200 hover:border-neutral-400',
                    )}
                  >
                    {on ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <Shield className="h-3.5 w-3.5 shrink-0 text-neutral-400" aria-hidden />}
                    {r.name}
                    {sys && <Lock className={cn('h-3 w-3 shrink-0', on ? 'text-on-primary/70' : 'text-neutral-400')} aria-hidden />}
                    <span className={cn('rounded-full px-1.5 text-[11px] tabular-nums font-semibold', on ? 'bg-on-primary/15 text-on-primary' : 'bg-neutral-200 text-neutral-700')}>
                      {r.permissions.length}
                    </span>
                    {on && <span className="sr-only">— currently being edited</span>}
                  </button>
                );
              })}
            </div>
            <p className="text-caption text-neutral-500 mt-1.5">
              {roles.data.length} role{roles.data.length === 1 ? '' : 's'} · the number on each chip is how many permissions it grants
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)] items-start">
            {/* ---------------------------------------------------- Role list (lg and above) */}
            <Card padded={false} className="hidden lg:block">
              <p className="px-4 pt-4 pb-2 text-label uppercase text-neutral-500">Roles</p>
              <ul className="divide-y divide-neutral-200">
                {roles.data.map((r) => {
                  const on = selected.id === r.id;
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        aria-current={on ? 'true' : undefined}
                        onClick={() => setSelectedId(Number(r.id))}
                        className={cn(
                          'w-full text-left px-4 py-3 flex items-center gap-3 border-l-4 transition-colors duration-control hover:bg-neutral-100 min-h-touch',
                          on ? 'border-l-primary-500 bg-primary-50' : 'border-l-transparent',
                        )}
                      >
                        <Shield className={cn('h-4 w-4 shrink-0', on ? 'text-primary-700' : 'text-neutral-400')} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className={cn('block font-medium truncate', on && 'text-primary-900')}>{r.name}</span>
                          <span className="block text-caption text-neutral-500 truncate">{roleSummary(r)}</span>
                        </span>
                        {r.code === 'SUPER_ADMIN' && <Lock className="h-3.5 w-3.5 text-neutral-400 shrink-0" aria-hidden />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>

            {/* ---------------------------------------------------- The matrix */}
            <div className="space-y-4 min-w-0">
              <Card>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h2 className="text-subheading flex flex-wrap items-center gap-2">
                      {selected.name}
                      {selected.isSystem && <Badge size="sm">System role</Badge>}
                      {mode === 'system-locked' && <Badge tone="warning" size="sm" icon={<Lock className="h-3 w-3" aria-hidden />}>Locked — cannot be edited</Badge>}
                      {mode === 'readonly' && <Badge tone="neutral" size="sm" icon={<Eye className="h-3 w-3" aria-hidden />}>Read-only for you</Badge>}
                      {mode === 'editable' && <Badge tone="primary" size="sm" icon={<PencilLine className="h-3 w-3" aria-hidden />}>Editable</Badge>}
                      {dirty && <Badge tone="warning" size="sm">Unsaved changes</Badge>}
                    </h2>
                    {selected.description && <p className="text-sm text-neutral-500 mt-1 leading-snug">{selected.description}</p>}
                    <p className="text-caption text-neutral-500 mt-2 flex flex-wrap gap-x-3 gap-y-1">
                      <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-neutral-400" aria-hidden />{perms.length} of {PERMISSIONS.length} permissions granted</span>
                      <span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-neutral-400" aria-hidden />{users} {users === 1 ? 'user holds' : 'users hold'} this role</span>
                    </p>
                  </div>
                  <Input
                    label="Max discount without approval (%)"
                    type="number"
                    min={0}
                    max={100}
                    value={maxDisc}
                    disabled={locked}
                    leftIcon={<Percent className="h-4 w-4" aria-hidden />}
                    hint="Above this, a manager PIN is required at the till"
                    onChange={(e) => setMaxDisc(Number(e.target.value))}
                    wrapperClassName="w-full sm:w-56 sm:shrink-0"
                  />
                </div>
              </Card>

              {/* Three different reasons the matrix may look the way it does — each says so in its own words. */}
              {mode === 'readonly' && (
                <Alert tone="info" title="Read-only view">
                  You can read every role and see exactly what it grants, but changing a role needs the “Manage roles” permission. Ask an administrator to make the change.
                </Alert>
              )}
              {mode === 'system-locked' && (
                <Alert tone="warning" title="Super Admin cannot be edited">
                  This role always holds all {PERMISSIONS.length} permissions — that is what guarantees somebody can always restore access if another role is misconfigured.
                  To give someone less, put them on Admin or Manager and edit that role instead.
                </Alert>
              )}

              <Card padded={false}>
                <CardHeader
                  className="p-5 pb-0"
                  title={`Role permissions — ${selected.name}`}
                  subtitle={locked
                    ? 'One row per module. A ticked box is a permission the server will allow.'
                    : 'One row per module. Tick a box to grant, clear it to revoke — a save bar appears as soon as something changes.'}
                />
                <div className="px-5 pt-3 pb-4">
                  <SearchInput value={filter} onChange={setFilter} placeholder="Find a permission or module" aria-label="Find a permission" />
                </div>

                {visibleModules.length === 0 ? (
                  <EmptyState
                    compact
                    icon={<SearchX className="h-6 w-6" />}
                    title="No permission matches"
                    description={`Nothing in the matrix contains “${filter.trim()}”.`}
                    action={<Button variant="outline" onClick={() => setFilter('')}>Clear the filter</Button>}
                  />
                ) : (
                  /*
                    THE MATRIX SCROLLS; THE PAGE NEVER DOES.

                    THE 436 px DOCUMENT (O1), and its cause. `.table-scroll` clips this 760 px table
                    correctly — but a scroll region only clips descendants whose containing block is
                    the region or lies inside it. The `sr-only` spans in these cells ("no manage
                    permission exists for…", "this module defines no further permissions") are
                    `position: absolute`, and with no positioned ancestor nearer than the layout
                    their containing block was ABOVE this wrapper, so each 1 × 1 px box escaped the
                    clip and sat at its static position inside the unscrolled table: the "Other
                    actions" column starts 382 px into the table, plus 16 px of cell padding and the
                    em dash, plus 17 px of page padding and card border — right where the document
                    ended, at every viewport narrower than that. At 768 px the same box lands inside
                    the viewport, which is why the measurement "went away" there. Nothing visible was
                    ever outside the viewport, no `min-w-0` could touch it, and `overflow-x: hidden`
                    would only have hidden it. `relative` makes this wrapper the containing block, so
                    the boxes belong to the scroll region and are clipped with it.
                  */
                  <div className="relative table-scroll border-t border-neutral-200">
                    <table className="w-full min-w-[760px] text-sm border-collapse">
                      <caption className="sr-only">
                        Permissions held by {selected.name}, one row per module. The View and Manage columns are the two
                        actions that exist across modules; anything else a module defines is in “Other actions”.
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col" className={cn(TH, 'w-[210px]')}>Module</th>
                          <th scope="col" className={cn(TH, 'text-center w-[86px]')}>View</th>
                          <th scope="col" className={cn(TH, 'text-center w-[86px]')}>Manage</th>
                          <th scope="col" className={TH}>Other actions</th>
                          <th scope="col" className={cn(TH, 'text-right w-[190px]')}>Granted</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleModules.map(([m, list]) => {
                          const full = groups[m];
                          const label = PERMISSION_MODULES[m] ?? m;
                          const granted = full.filter((p) => perms.includes(p)).length;
                          const none = granted === 0;
                          const all = granted === full.length;
                          const moduleDirty = full.some((p) => changes.touched.has(p));
                          const view = list.find((p) => p === `${m}:view`);
                          const manage = list.find((p) => p === `${m}:manage`);
                          const others = list.filter((p) => p !== view && p !== manage);
                          return (
                            <tr key={m} className={cn('border-b border-neutral-200/70 last:border-b-0 align-top', none && 'bg-neutral-50/70')}>
                              <th scope="row" className="px-4 py-2 text-left font-normal min-w-0 align-middle">
                                {q ? (
                                  <span className="font-medium text-neutral-900">{label}</span>
                                ) : (
                                  /* The module's own box grants or revokes the whole row; half a row
                                     shows as indeterminate. Same shared control as every cell. */
                                  <Checkbox
                                    ref={(el) => { if (el) el.indeterminate = !all && granted > 0; }}
                                    label={label}
                                    aria-label={`Grant every ${label} permission`}
                                    disabled={locked}
                                    checked={all}
                                    onChange={() => toggleModule(m)}
                                    className="font-medium"
                                  />
                                )}
                                {q && <span className="block text-caption text-neutral-500 mt-0.5">showing {list.length} of {full.length}</span>}
                              </th>
                              <td className="px-4 py-2 align-middle">
                                <span className="flex justify-center">{view ? permBox(view, label) : notApplicable(label, 'View')}</span>
                              </td>
                              <td className="px-4 py-2 align-middle">
                                <span className="flex justify-center">{manage ? permBox(manage, label) : notApplicable(label, 'Manage')}</span>
                              </td>
                              <td className="px-4 py-2 min-w-0 align-middle">
                                {others.length === 0
                                  ? <span className="text-neutral-400">—<span className="sr-only">this module defines no further permissions</span></span>
                                  : <div className="flex flex-wrap gap-x-5 gap-y-0.5 min-w-0">{others.map((p) => permBox(p, label, actionOf(p)))}</div>}
                              </td>
                              <td className="px-4 py-2 text-right align-middle">
                                {/* The per-module count is the fastest read on the page: "granted x of y". */}
                                <span className="inline-flex flex-wrap justify-end items-center gap-1.5">
                                  <Badge size="sm" tone={none ? 'neutral' : all ? 'success' : 'primary'}>
                                    {none ? `None granted · 0 of ${full.length}` : `Granted ${granted} of ${full.length}`}
                                  </Badge>
                                  {moduleDirty && <Badge size="sm" tone="warning">Unsaved</Badge>}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <p className="px-5 py-3 text-caption text-neutral-500 border-t border-neutral-200 flex items-start gap-1.5">
                  <Eye className="h-3.5 w-3.5 mt-px shrink-0 text-neutral-400" aria-hidden />
                  <span className="min-w-0">
                    A ticked box is granted. “View” and “Manage” are the only two actions this system defines across
                    modules, so a module that has neither prints an em dash rather than an inert control; everything else it
                    defines is a named box under “Other actions”. Modules with nothing granted are shaded and labelled “None granted”.
                    {mode === 'editable' && ' A box ringed in amber, in a row marked “Unsaved”, has been changed but not yet written.'}
                  </span>
                </p>
              </Card>

              {/*
                Save is tied to the change and says what the change is.
                `.save-bar` is the shared sticky rule: it sits above the bottom navigation
                (never on it) and, being in flow, lets the last card scroll clear of it.
              */}
              {mode === 'editable' && dirty && (
                <div className="save-bar">
                  <div className="card shadow-panel px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 min-w-0">
                    <p className="text-sm min-w-0 flex-1" aria-live="polite">
                      <span className="font-semibold text-neutral-900">{changes.count} unsaved change{changes.count === 1 ? '' : 's'} to {selected.name}</span>
                      <span className="block text-caption text-neutral-600">{changeSummary}</span>
                    </p>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button variant="ghost" leftIcon={<Undo2 className="h-4 w-4" />} onClick={discard} disabled={save.isPending}>Discard</Button>
                      <Button leftIcon={<Save className="h-4 w-4" />} loading={save.isPending} onClick={() => save.mutate(selected)}>
                        Save {changes.count} change{changes.count === 1 ? '' : 's'}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
