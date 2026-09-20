import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, Save, Lock } from 'lucide-react';
import { rolesApi } from '@/services/api/endpoints';
import { usePermission } from '@/hooks/useAuth';
import { toast } from '@/store/uiStore';
import { PageHeader, Button, Card, LoadingState, ErrorState, Badge, Input } from '@/components/ui';
import { PERMISSIONS, PERMISSION_MODULES, permissionModule, type Permission } from '@/config/permissions';
import { cn } from '@/utils/cn';
import type { Role } from '@/types';

export default function RolesPage() {
  const canManage = usePermission('roles:manage');
  const qc = useQueryClient();
  const roles = useQuery({ queryKey: ['roles'], queryFn: rolesApi.list });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = roles.data?.find((r) => r.id === selectedId) ?? roles.data?.[0] ?? null;
  const [perms, setPerms] = useState<Permission[]>([]);
  const [maxDisc, setMaxDisc] = useState(0);
  const save = useMutation({ mutationFn: (r: Role) => rolesApi.update(r.id, { permissions: perms, maxDiscountPercent: maxDisc }), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['roles'] }); toast.success('Role updated', 'Users receive the new permissions on their next request.'); } });
  // reset the editor only when the selected role changes or after a save — not on background refetches
  useEffect(() => { if (selected) { setPerms(selected.permissions); setMaxDisc(selected.maxDiscountPercent); } }, [selected?.id, save.submittedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = selected ? (maxDisc !== selected.maxDiscountPercent || perms.length !== selected.permissions.length || perms.some((p) => !selected.permissions.includes(p))) : false;
  const groups = useMemo(() => PERMISSIONS.reduce<Record<string, Permission[]>>((a, p) => { (a[permissionModule(p)] ??= []).push(p); return a; }, {}), []);
  const locked = !canManage || selected?.code === 'SUPER_ADMIN';
  const toggle = (p: Permission) => setPerms((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]));
  const toggleModule = (m: string) => { const list = groups[m]; const all = list.every((p) => perms.includes(p)); setPerms((s) => (all ? s.filter((p) => !list.includes(p)) : [...new Set([...s, ...list])])); };

  return (
    <div>
      <PageHeader title="Roles & permissions" subtitle="Permissions are enforced by the backend on every request; this matrix mirrors it" actions={canManage && selected && <Button leftIcon={<Save className="h-4 w-4" />} disabled={!dirty || locked} loading={save.isPending} onClick={() => save.mutate(selected)}>Save changes</Button>} />
      {roles.isLoading && <LoadingState variant="page" />}
      {roles.isError && <ErrorState error={roles.error} onRetry={() => void roles.refetch()} />}
      {roles.data && selected && (
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <Card padded={false}>
            <ul className="divide-y divide-neutral-100">{roles.data.map((r) => (
              <li key={r.id}><button type="button" onClick={() => setSelectedId(r.id)} className={cn('w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-neutral-50', selected.id === r.id && 'bg-primary-50')}>
                <Shield className={cn('h-4 w-4', selected.id === r.id ? 'text-primary-700' : 'text-neutral-400')} />
                <span className="min-w-0 flex-1"><span className="block font-medium">{r.name}</span><span className="text-caption text-neutral-500">{r.permissions.length} permissions · {r.userCount ?? 0} users</span></span>
              </button></li>))}</ul>
          </Card>
          <div className="space-y-4">
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h2 className="text-subheading flex items-center gap-2">{selected.name}{selected.isSystem && <Badge size="sm">System</Badge>}{locked && canManage && <Badge tone="warning" size="sm" icon={<Lock className="h-3 w-3" />}>Locked</Badge>}</h2><p className="text-sm text-neutral-500">{selected.description}</p></div>
                <Input label="Max discount without approval (%)" type="number" min={0} max={100} value={maxDisc} disabled={locked} onChange={(e) => setMaxDisc(Number(e.target.value))} wrapperClassName="w-56" />
              </div>
            </Card>
            <Card padded={false} className="overflow-hidden">
              <div className="table-scroll">
              <table className="w-full text-sm min-w-[520px]">
                <thead className="bg-neutral-50 text-label uppercase text-neutral-500"><tr><th className="text-left px-4 py-2.5 font-semibold">Module</th><th className="text-left px-4 py-2.5 font-semibold">Permissions</th></tr></thead>
                <tbody className="divide-y divide-neutral-100">
                  {Object.entries(groups).map(([m, list]) => (
                    <tr key={m}>
                      <td className="px-4 py-3 align-top w-40">
                        <label className="flex items-center gap-2 font-medium"><input type="checkbox" className="h-4 w-4 rounded-sm" disabled={locked} checked={list.every((p) => perms.includes(p))} ref={(el) => { if (el) el.indeterminate = !list.every((p) => perms.includes(p)) && list.some((p) => perms.includes(p)); }} onChange={() => toggleModule(m)} />{PERMISSION_MODULES[m] ?? m}</label>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">{list.map((p) => { const on = perms.includes(p); return <button key={p} type="button" disabled={locked} aria-pressed={on} onClick={() => toggle(p)} className={cn('rounded-sm border px-2 py-1 text-xs font-mono transition-colors disabled:cursor-not-allowed', on ? 'bg-primary-600 border-primary-600 text-white' : 'bg-white border-neutral-300 text-neutral-600 hover:border-neutral-400')}>{p}</button>; })}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
