import { LogOut, ShieldCheck, Building2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useBranch } from '@/components/layout/Shell';
import { PageHeader, Card, CardHeader, KeyValue, Badge, Avatar, Button, EmptyState } from '@/components/ui';
import { ROLE_LABELS, permissionModule, PERMISSION_MODULES } from '@/config/permissions';
import { fmtDateTime } from '@/utils/date';

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const { data: branch } = useBranch();
  if (!user) return null;

  const grouped = user.permissions.reduce<Record<string, string[]>>((acc, p) => {
    (acc[permissionModule(p)] ??= []).push(p);
    return acc;
  }, {});
  const modules = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="My profile"
        subtitle="Your account, roles and what they allow you to do"
        actions={<Button variant="outline" leftIcon={<LogOut className="h-4 w-4" />} onClick={() => void logout()}>Sign out</Button>}
      />

      <div className="grid gap-4 lg:grid-cols-3 items-start">
        <Card className="lg:col-span-1">
          <div className="flex items-center gap-4">
            <Avatar name={user.fullName} size="lg" />
            <div className="min-w-0">
              <p className="text-subheading text-neutral-900 truncate">{user.fullName}</p>
              <p className="text-sm text-neutral-500 truncate">@{user.username}</p>
            </div>
          </div>
          <KeyValue
            className="mt-6"
            items={[
              { label: 'Email', value: user.email || '—' },
              { label: 'Phone', value: user.phone || '—' },
              {
                label: 'Roles',
                value: (
                  <span className="flex flex-wrap gap-1 justify-end">
                    {user.roles.map((r) => <Badge key={r} tone="primary">{ROLE_LABELS[r]}</Badge>)}
                  </span>
                ),
              },
              { label: 'Discount limit', value: <span className="tabular-nums font-medium">{user.maxDiscountPercent}%</span> },
              { label: 'Last sign-in', value: fmtDateTime(user.lastLoginAt) },
            ]}
          />
          {branch && (
            <div className="mt-5 pt-4 border-t border-neutral-100 flex items-start gap-2.5 text-sm">
              <Building2 className="h-4 w-4 text-neutral-400 mt-0.5 shrink-0" aria-hidden />
              <div className="min-w-0">
                <p className="text-neutral-900 font-medium truncate">{branch.businessName}</p>
                <p className="text-caption text-neutral-500 truncate">
                  {branch.name}{(user.branchIds?.length ?? 0) > 1 ? ` · ${user.branchIds!.length} branches available` : ''}
                </p>
              </div>
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title={<span className="flex items-center gap-2"><ShieldCheck className="h-[18px] w-[18px] text-neutral-400" aria-hidden />Permissions</span>}
            subtitle="Granted by your roles and enforced on the server for every request"
          />
          {modules.length === 0 ? (
            <EmptyState compact title="No permissions granted" description="Ask an administrator to assign a role to your account." />
          ) : (
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-5">
              {modules.map(([m, perms]) => (
                <div key={m}>
                  <p className="text-label text-neutral-500 uppercase mb-2">{PERMISSION_MODULES[m] ?? m}</p>
                  <div className="flex flex-wrap gap-1">
                    {perms.map((p) => <Badge key={p} size="sm" className="font-mono text-[10px]">{p}</Badge>)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
