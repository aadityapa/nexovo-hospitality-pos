import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Save, SlidersHorizontal } from 'lucide-react';
import { useNotifications, useThresholds, useNotificationMutations } from '@/features/p2/hooks';
import { usePermission } from '@/hooks/useAuth';
import { useRealtimeInvalidate } from '@/hooks/useRealtime';
import { PageHeader, Button, Card, CardHeader, Input, SegmentedControl, LoadingState, ErrorState, EmptyState, Badge } from '@/components/ui';
import { SEVERITY_ICON, SEVERITY_TONE, notificationTarget } from '@/config/notifications';
import { fmtDateTime, fmtRelative } from '@/utils/date';
import { cn } from '@/utils/cn';

function ThresholdsCard() {
  const q = useThresholds();
  const { saveThresholds } = useNotificationMutations();
  const canManage = usePermission('notifications:manage');
  const [draft, setDraft] = useState<Record<string, string>>({});
  if (q.isLoading) return <Card><LoadingState rows={3} /></Card>;
  if (q.isError || !q.data) return <Card><ErrorState compact error={q.error} onRetry={() => void q.refetch()} /></Card>;
  const rows = q.data;
  const edited = rows.filter((r) => (draft[r.key] ?? '').trim() !== '' && Number(draft[r.key]) !== r.value && Number.isFinite(Number(draft[r.key])));
  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4" />Alert thresholds</span>} subtitle="Per-branch rules the alert checker evaluates on every refresh" action={canManage && <Button size="sm" leftIcon={<Save className="h-4 w-4" />} disabled={!edited.length} loading={saveThresholds.isPending} onClick={() => saveThresholds.mutate(edited.map((r) => ({ key: r.key, value: Number(draft[r.key]) })), { onSuccess: () => setDraft({}) })}>Save</Button>} />
      <div className="grid sm:grid-cols-2 gap-4">
        {rows.map((r) => <Input key={r.key} label={r.label} type="number" min={0} disabled={!canManage} value={draft[r.key] ?? String(r.value)} onChange={(e) => setDraft((d) => ({ ...d, [r.key]: e.target.value }))} hint={`default ${r.defaultValue}`} />)}
      </div>
    </Card>
  );
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'UNREAD' | 'ALL'>('UNREAD');
  const q = useNotifications(filter === 'UNREAD');
  const { markRead, markAllRead } = useNotificationMutations();
  useRealtimeInvalidate(['notifications']);
  const items = q.data?.items ?? [];
  return (
    <div>
      <PageHeader title="Notifications" subtitle="Low stock, pending approvals, delayed orders, reservations and VIP alerts" actions={(q.data?.unreadCount ?? 0) > 0 && <Button variant="outline" leftIcon={<CheckCheck className="h-4 w-4" />} loading={markAllRead.isPending} onClick={() => markAllRead.mutate()}>Mark all read</Button>}>
        <SegmentedControl size="sm" value={filter} onChange={setFilter} options={[{ value: 'UNREAD', label: `Unread${q.data ? ` (${q.data.unreadCount})` : ''}` }, { value: 'ALL', label: 'All' }]} />
      </PageHeader>
      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <Card padded={false}>
          {q.isLoading ? <div className="p-4"><LoadingState rows={5} /></div> : q.isError ? <ErrorState compact error={q.error} onRetry={() => void q.refetch()} /> : items.length === 0 ? <EmptyState compact icon={<Bell className="h-6 w-6" />} title={filter === 'UNREAD' ? "You're all caught up" : 'No notifications yet'} description="Alerts appear here and in the bell icon as the system detects them." /> : (
            <ul className="divide-y divide-neutral-100">{items.map((n) => { const Icon = SEVERITY_ICON[n.severity]; const to = notificationTarget(n); return (
              <li key={n.id} className={cn('px-4 py-3 flex items-start gap-3', !n.isRead && 'bg-primary-50/40')}>
                <Badge tone={SEVERITY_TONE[n.severity]} size="sm" icon={<Icon className="h-3 w-3" />}>{n.severity}</Badge>
                <div className="flex-1 min-w-0">
                  <p className={cn('text-sm', !n.isRead && 'font-semibold')}>{n.title}</p>
                  {n.body && <p className="text-sm text-neutral-600">{n.body}</p>}
                  <p className="text-caption text-neutral-400 mt-0.5">{fmtDateTime(n.createdAt)} · {fmtRelative(n.createdAt)} · {n.type}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  {to && <Button size="sm" variant="outline" onClick={() => { if (!n.isRead) markRead.mutate(n.id); navigate(to); }}>Open</Button>}
                  {!n.isRead && <Button size="sm" variant="ghost" onClick={() => markRead.mutate(n.id)}>Read</Button>}
                </div>
              </li>); })}</ul>
          )}
        </Card>
        <ThresholdsCard />
      </div>
    </div>
  );
}
