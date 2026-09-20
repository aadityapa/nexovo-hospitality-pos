import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, LogOut, UserCircle, RotateCcw } from 'lucide-react';
import { ADMIN_NAV } from '@/config/navigation';
import { useAuthStore } from '@/store/authStore';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader, Card, Avatar, Button, ConfirmDialog } from '@/components/ui';
import { ROLE_LABELS } from '@/config/permissions';
import { env } from '@/config/env';
import { resetDb } from '@/services/api/mock/db';

/** "More" tab for mobile bottom navigation: every permitted destination + account actions. */
export default function MorePage() {
  const can = useAuthStore((s) => s.hasPermission);
  const { user, role, logout } = useAuth();
  const [resetOpen, setResetOpen] = useState(false);
  const sections = ADMIN_NAV.map((s) => ({ ...s, items: s.items.filter((i) => !i.permission || can(i.permission)) })).filter((s) => s.items.length);
  return (
    <div className="max-w-2xl">
      <PageHeader title="More" subtitle="Everything your role can reach, plus account actions" />
      {user && (
        <Card className="flex items-center gap-3 mb-4">
          <Avatar name={user.fullName} /><div className="min-w-0 flex-1"><p className="font-medium truncate">{user.fullName}</p><p className="text-caption text-neutral-500">{role ? ROLE_LABELS[role] : ''}</p></div>
          <Link to="/profile"><Button variant="outline" size="sm" leftIcon={<UserCircle className="h-4 w-4" />}>Profile</Button></Link>
        </Card>
      )}
      {sections.map((s, i) => (
        <Card key={i} padded={false} className="mb-4">
          {s.title && <p className="px-4 pt-3 pb-1 text-label text-neutral-500 uppercase">{s.title}</p>}
          <ul className="divide-y divide-neutral-100">
            {s.items.map((it) => (
              <li key={it.to}><Link to={it.to} className="flex items-center gap-3 px-4 min-h-[52px] text-sm hover:bg-neutral-50"><it.icon className="h-5 w-5 text-neutral-500" />{it.label}<ChevronRight className="h-4 w-4 ml-auto text-neutral-400" /></Link></li>
            ))}
          </ul>
        </Card>
      ))}
      <div className="flex flex-col gap-2 pb-4">
        <Button variant="outline" leftIcon={<LogOut className="h-4 w-4" />} onClick={() => void logout()}>Sign out</Button>
        {env.isMock && (
          <Button variant="ghost" leftIcon={<RotateCcw className="h-4 w-4" />} onClick={() => setResetOpen(true)}>Reset demo data</Button>
        )}
      </div>

      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        variant="danger"
        title="Reset all demo data?"
        message="Every order, bill, customer and stock movement created in this browser is deleted and the original sample data is restored. This cannot be undone."
        confirmLabel="Reset and sign out"
        onConfirm={() => { resetDb(); window.location.assign('/login'); }}
      />
    </div>
  );
}
