import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, BellOff, CheckCheck, Check, Save, SlidersHorizontal, ArrowRight, Lock } from 'lucide-react';
import { useNotifications, useThresholds, useNotificationMutations } from '@/features/p2/hooks';
import { usePermission } from '@/hooks/useAuth';
import { useRealtimeInvalidate } from '@/hooks/useRealtime';
import { PageHeader, Button, Card, CardHeader, Input, SegmentedControl, FilterSelect, LoadingState, ErrorState, EmptyState, Badge, Alert, ConfirmDialog } from '@/components/ui';
import { SEVERITY_ICON, SEVERITY_TONE, notificationTarget } from '@/config/notifications';
import { fmtDateTime, fmtRelative } from '@/utils/date';
import { cn } from '@/utils/cn';
import type { AppNotification, NotificationSeverity } from '@/types';

const SEVERITY_LABEL: Record<NotificationSeverity, string> = { CRITICAL: 'Critical', WARNING: 'Warning', INFO: 'Info' };
const prettyType = (t: string) => t.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
/** Where the title takes you, in words — so the destination is never a surprise. */
const DESTINATION: Record<string, string> = {
  INVENTORY_ITEMS: 'the stock item', INVENTORY_ITEM: 'the stock item',
  PURCHASE_ORDERS: 'the purchase order', PURCHASE_ORDER: 'the purchase order',
  ORDERS: 'the order', ORDER: 'the order',
  RESERVATIONS: 'reservations', RESERVATION: 'reservations',
  VIP_RESERVATIONS: 'VIP tables', VIP_RESERVATION: 'VIP tables',
  CLUB_ENTRIES: 'club entry', BILLS: 'the bill', BILL: 'the bill',
};

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
      <CardHeader
        title={<span className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-neutral-400" aria-hidden />Alert thresholds</span>}
        subtitle="The numbers the alert checker compares against on every refresh, for this branch only"
        action={canManage && (
          <Button
            size="sm"
            className="min-h-touch"
            leftIcon={<Save className="h-4 w-4" />}
            disabled={!edited.length}
            loading={saveThresholds.isPending}
            onClick={() => saveThresholds.mutate(edited.map((r) => ({ key: r.key, value: Number(draft[r.key]) })), { onSuccess: () => setDraft({}) })}
          >
            Save {edited.length || ''} change{edited.length === 1 ? '' : 's'}
          </Button>
        )}
      />
      {!canManage && (
        <Alert tone="info" className="mb-4">
          <span className="inline-flex items-start gap-1.5">
            <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden />
            <span>These are read-only for you — changing a threshold needs the “Manage notifications” permission.</span>
          </span>
        </Alert>
      )}
      <div className="grid sm:grid-cols-2 gap-4">
        {rows.map((r) => {
          const changedNow = edited.some((e) => e.key === r.key);
          return (
            <Input
              key={r.key}
              label={r.label}
              type="number"
              min={0}
              disabled={!canManage}
              value={draft[r.key] ?? String(r.value)}
              onChange={(e) => setDraft((d) => ({ ...d, [r.key]: e.target.value }))}
              hint={changedNow ? `Unsaved — currently ${r.value}, default ${r.defaultValue}` : `Default ${r.defaultValue}`}
              className={changedNow ? 'border-primary-500' : undefined}
            />
          );
        })}
      </div>
      {edited.length > 0 && (
        <p className="text-caption text-neutral-600 mt-3">
          {edited.length} threshold{edited.length === 1 ? '' : 's'} edited and not yet saved. New values take effect at the next alert check.
        </p>
      )}
    </Card>
  );
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'UNREAD' | 'ALL'>('UNREAD');
  const [severity, setSeverity] = useState<'' | NotificationSeverity>('');
  const [confirmAll, setConfirmAll] = useState(false);
  const q = useNotifications(filter === 'UNREAD');
  const { markRead, markAllRead } = useNotificationMutations();
  useRealtimeInvalidate(['notifications']);

  const items = useMemo(() => q.data?.items ?? [], [q.data]);
  const unreadCount = q.data?.unreadCount ?? 0;
  // Severity narrows the page already fetched — no second request.
  const rows = useMemo(() => (severity ? items.filter((n) => n.severity === severity) : items), [items, severity]);
  const severityCounts = useMemo(() => items.reduce<Record<string, number>>((a, n) => { a[n.severity] = (a[n.severity] ?? 0) + 1; return a; }, {}), [items]);

  const open = (n: AppNotification, to: string) => { if (!n.isRead) markRead.mutate(n.id); navigate(to); };

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle="Low stock, pending approvals, delayed orders, reservations and VIP alerts for this branch"
        actions={unreadCount > 0 && (
          <Button variant="outline" leftIcon={<CheckCheck className="h-4 w-4" />} loading={markAllRead.isPending} onClick={() => setConfirmAll(true)}>
            Mark all {unreadCount} as read
          </Button>
        )}
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <SegmentedControl
            size="sm"
            ariaLabel="Filter by read state"
            value={filter}
            onChange={setFilter}
            options={[{ value: 'UNREAD', label: 'Unread', count: q.data ? unreadCount : undefined }, { value: 'ALL', label: 'Everything' }]}
          />
          <FilterSelect
            ariaLabel="Filter by severity, within the alerts already listed"
            className="sm:w-52"
            value={severity}
            onChange={(e) => setSeverity(e.target.value as '' | NotificationSeverity)}
            placeholder={`Any severity (${items.length})`}
            options={(['CRITICAL', 'WARNING', 'INFO'] as NotificationSeverity[]).map((s) => ({ value: s, label: `${SEVERITY_LABEL[s]} (${severityCounts[s] ?? 0})` }))}
          />
        </div>
      </PageHeader>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px] items-start">
        <Card padded={false}>
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-neutral-200">
            <p className="text-sm text-neutral-600 min-w-0" aria-live="polite">
              <span className="font-semibold text-neutral-900 tabular-nums">{rows.length}</span> {filter === 'UNREAD' ? 'unread' : 'alert'}{rows.length === 1 ? '' : 's'} listed
              {severity ? ` · ${SEVERITY_LABEL[severity]} only` : ''}
            </p>
            {unreadCount > items.length && filter === 'UNREAD' && (
              <p className="text-caption text-neutral-500">Showing the most recent {items.length} of {unreadCount} unread</p>
            )}
          </div>

          {/* Severity breakdown of exactly what is listed — a one-tap way into the part that matters. */}
          {items.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 px-4 py-2 border-b border-neutral-100">
              <span className="text-caption text-neutral-500 mr-1">In this list:</span>
              {(['CRITICAL', 'WARNING', 'INFO'] as NotificationSeverity[]).map((s) => {
                const n = severityCounts[s] ?? 0;
                const on = severity === s;
                const Icon = SEVERITY_ICON[s];
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={n === 0}
                    aria-pressed={on}
                    onClick={() => setSeverity(on ? '' : s)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-caption font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                      on ? 'bg-neutral-900 border-neutral-900 text-white' : 'bg-white border-neutral-300 text-neutral-700 hover:border-neutral-400',
                    )}
                  >
                    <Icon className="h-3 w-3 shrink-0" aria-hidden />
                    {SEVERITY_LABEL[s]}
                    <span className="tabular-nums">{n}</span>
                  </button>
                );
              })}
            </div>
          )}

          {q.isLoading ? <div className="p-4"><LoadingState rows={5} /></div>
            : q.isError ? <ErrorState compact error={q.error} onRetry={() => void q.refetch()} />
              : rows.length === 0 ? (
                <EmptyState
                  compact
                  icon={filter === 'UNREAD' ? <BellOff className="h-6 w-6" /> : <Bell className="h-6 w-6" />}
                  title={severity ? `No ${SEVERITY_LABEL[severity].toLowerCase()} alerts here` : filter === 'UNREAD' ? 'You are all caught up' : 'No notifications yet'}
                  description={severity
                    ? 'Clear the severity filter to see the rest of this list.'
                    : filter === 'UNREAD'
                      ? 'Nothing is waiting for you. Alerts appear here and on the bell in the header as the system detects them.'
                      : 'Low stock, delayed orders, pending approvals and reservation alerts will collect here.'}
                  action={severity
                    ? <Button variant="outline" onClick={() => setSeverity('')}>Show every severity</Button>
                    : filter === 'UNREAD' ? <Button variant="outline" onClick={() => setFilter('ALL')}>Show everything</Button> : undefined}
                />
              ) : (
                <ul className="divide-y divide-neutral-100">
                  {rows.map((n) => {
                    const Icon = SEVERITY_ICON[n.severity];
                    const to = notificationTarget(n);
                    const dest = n.entity ? DESTINATION[n.entity] : undefined;
                    return (
                      <li
                        key={n.id}
                        className={cn('px-4 py-3 flex items-start gap-3 border-l-4', n.isRead ? 'border-l-transparent' : 'border-l-primary-600 bg-primary-50/40')}
                      >
                        {/* Unread is carried by a dot, a word, the border and the weight — not by colour alone. */}
                        <span className="pt-0.5 shrink-0 w-2.5" aria-hidden>
                          {!n.isRead && <span className="block h-2.5 w-2.5 rounded-full bg-primary-600" />}
                        </span>

                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 mb-1">
                            <Badge tone={SEVERITY_TONE[n.severity]} size="sm" icon={<Icon className="h-3 w-3" aria-hidden />}>{SEVERITY_LABEL[n.severity]}</Badge>
                            {!n.isRead
                              ? <Badge tone="primary" size="sm">Unread</Badge>
                              : <span className="text-caption text-neutral-400">Read</span>}
                            <span className="text-caption text-neutral-500 truncate">{prettyType(n.type)}</span>
                          </div>

                          {to ? (
                            <button
                              type="button"
                              onClick={() => open(n, to)}
                              className={cn(
                                'text-left text-sm inline-flex items-start gap-1.5 rounded-sm hover:underline underline-offset-2 text-primary-800 min-w-0',
                                !n.isRead && 'font-semibold',
                              )}
                            >
                              <span className="min-w-0">{n.title}</span>
                              <ArrowRight className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden />
                            </button>
                          ) : (
                            <p className={cn('text-sm text-neutral-900', !n.isRead && 'font-semibold')}>{n.title}</p>
                          )}

                          {n.body && <p className="text-sm text-neutral-600 mt-0.5 break-words">{n.body}</p>}
                          <p className="text-caption text-neutral-400 mt-1">
                            <time dateTime={n.createdAt}>{fmtDateTime(n.createdAt)}</time> · {fmtRelative(n.createdAt)}
                            {/* Say where the title goes — and, when it goes nowhere, say that too rather than leaving dead text. */}
                            {to ? (dest ? ` · opens ${dest}` : ' · opens the related record') : ' · no dedicated screen for this alert'}
                          </p>
                        </div>

                        {!n.isRead && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="shrink-0 min-h-touch min-w-touch"
                            aria-label={`Mark “${n.title}” as read`}
                            leftIcon={<Check className="h-4 w-4" />}
                            onClick={() => markRead.mutate(n.id)}
                          >
                            <span className="hidden sm:inline">Mark read</span>
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
        </Card>

        <ThresholdsCard />
      </div>

      <ConfirmDialog
        open={confirmAll}
        onClose={() => setConfirmAll(false)}
        variant="primary"
        title={`Mark all ${unreadCount} alerts as read?`}
        message={
          <>
            <p>This clears every alert you can see in this branch — including any not listed on this page — and empties the bell in the header.</p>
            <p className="mt-2">It does not fix anything: stock that is low stays low, and an alert reappears if the condition is still true at the next check.</p>
          </>
        }
        confirmLabel="Mark all as read"
        loading={markAllRead.isPending}
        onConfirm={async () => { try { await markAllRead.mutateAsync(); } finally { setConfirmAll(false); } }}
      />
    </div>
  );
}
