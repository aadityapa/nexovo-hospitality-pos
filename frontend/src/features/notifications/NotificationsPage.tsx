import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, BellOff, CheckCheck, Check, Save, SlidersHorizontal, ArrowRight, Lock } from 'lucide-react';
import { useNotifications, useThresholds, useNotificationMutations } from '@/features/p2/hooks';
import { usePermission } from '@/hooks/useAuth';
import { useRealtimeInvalidate } from '@/hooks/useRealtime';
import { PageHeader, Button, Card, CardHeader, Input, FilterChips, LoadingState, ErrorState, EmptyState, Badge, Alert, ConfirmDialog } from '@/components/ui';
import { SEVERITY_ICON, SEVERITY_TONE, notificationTarget } from '@/config/notifications';
import { fmtDateTime, fmtRelative } from '@/utils/date';
import { cn } from '@/utils/cn';
import type { AppNotification, NotificationSeverity } from '@/types';

const SEVERITY_LABEL: Record<NotificationSeverity, string> = { CRITICAL: 'Critical', WARNING: 'Warning', INFO: 'Info' };

/**
 * The severity tile in front of each row. Same construction as `Badge` and `StatCard`'s icon
 * tile — a `-50` fill, a `-200` inset hairline and the `-700` glyph rung — so it is legible on
 * both grounds with no per-theme branch.
 */
const SEVERITY_TILE: Record<NotificationSeverity, string> = {
  CRITICAL: 'bg-danger-50 text-danger-700 ring-danger-200',
  WARNING: 'bg-warning-50 text-warning-700 ring-warning-200',
  INFO: 'bg-info-50 text-info-700 ring-info-200',
};

/** One row of counted chips over two real facets: what the API fetched, and how loud it is. */
type View = 'ALL' | 'UNREAD' | NotificationSeverity;
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

  /**
   * ONE CHIP ROW over two real facets.
   *
   * "All" and "Unread" decide what is FETCHED — the API distinguishes unread and returns the true
   * unread total on every response, so that chip's count is always exact. The three severity
   * chips narrow whatever has been fetched, so their counts describe the list below and the line
   * under the row says which list that is. No chip ever prints a number nothing measured: the
   * "All" count is left off while the unread-only page is loaded, because the total in this
   * branch was not returned by that request.
   */
  const view: View = severity || filter;
  const onView = (v: View) => {
    if (v === 'ALL') { setFilter('ALL'); setSeverity(''); return; }
    if (v === 'UNREAD') { setFilter('UNREAD'); setSeverity(''); return; }
    setSeverity((s) => (s === v ? '' : v));
  };

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
        <div className="flex flex-col gap-1.5 min-w-0">
          <FilterChips
            ariaLabel="Filter alerts by read state and severity"
            value={view}
            onChange={onView}
            options={[
              { value: 'ALL', label: 'All', count: filter === 'ALL' ? items.length : undefined },
              { value: 'UNREAD', label: 'Unread', count: q.data ? unreadCount : undefined },
              { value: 'CRITICAL', label: 'Critical', count: severityCounts.CRITICAL ?? 0 },
              { value: 'WARNING', label: 'Warning', count: severityCounts.WARNING ?? 0 },
              { value: 'INFO', label: 'Info', count: severityCounts.INFO ?? 0 },
            ]}
          />
          <p className="text-caption text-neutral-500">
            {filter === 'UNREAD'
              ? 'Severity counts describe the unread alerts loaded below.'
              : 'Severity counts describe the alerts loaded below.'}
          </p>
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px] items-start">
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
                /* ONE card, hairline-divided — the reference's alert list. */
                <ul className="divide-y divide-neutral-200">
                  {rows.map((n) => {
                    const Icon = SEVERITY_ICON[n.severity];
                    const to = notificationTarget(n);
                    const dest = n.entity ? DESTINATION[n.entity] : undefined;
                    return (
                      <li
                        key={n.id}
                        className={cn(
                          /* Unread is carried by a faint gold wash, a gold rail, a bold title AND
                             the word "Unread" — never by colour alone. */
                          'px-4 py-3 flex items-start gap-3 border-l-4',
                          n.isRead ? 'border-l-transparent' : 'border-l-primary-500 bg-primary-50/40',
                        )}
                      >
                        <span className={cn('shrink-0 h-9 w-9 rounded-md flex items-center justify-center ring-1 ring-inset', SEVERITY_TILE[n.severity])} aria-hidden>
                          <Icon className="h-[18px] w-[18px]" />
                        </span>

                        <div className="flex-1 min-w-0">
                          {to ? (
                            <button
                              type="button"
                              onClick={() => open(n, to)}
                              className={cn(
                                'text-left text-sm inline-flex items-start gap-1.5 rounded-sm hover:underline underline-offset-2 text-primary-700 min-w-0',
                                !n.isRead && 'font-semibold',
                              )}
                            >
                              <span className="min-w-0">{n.title}</span>
                              <ArrowRight className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden />
                            </button>
                          ) : (
                            <p className={cn('text-sm text-neutral-900', !n.isRead && 'font-semibold')}>{n.title}</p>
                          )}

                          {n.body && <p className="text-caption text-neutral-500 mt-0.5 break-words">{n.body}</p>}

                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            <Badge tone={SEVERITY_TONE[n.severity]} size="sm">{SEVERITY_LABEL[n.severity]}</Badge>
                            <Badge tone="neutral" size="sm">{prettyType(n.type)}</Badge>
                            {!n.isRead && <Badge tone="primary" size="sm">Unread</Badge>}
                            {/* Say where the title goes — and, when it goes nowhere, say that too
                                rather than leaving dead text. */}
                            <span className="text-caption text-neutral-500 min-w-0">
                              {to ? (dest ? `opens ${dest}` : 'opens the related record') : 'no dedicated screen for this alert'}
                            </span>
                          </div>
                        </div>

                        <div className="shrink-0 flex flex-col items-end gap-1.5">
                          <span className="text-caption text-neutral-500 text-right">
                            <time dateTime={n.createdAt} className="block whitespace-nowrap">{fmtRelative(n.createdAt)}</time>
                            <span className="hidden sm:block text-neutral-400 whitespace-nowrap">{fmtDateTime(n.createdAt)}</span>
                          </span>
                          {!n.isRead && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="min-h-touch min-w-touch"
                              aria-label={`Mark “${n.title}” as read`}
                              leftIcon={<Check className="h-4 w-4" />}
                              onClick={() => markRead.mutate(n.id)}
                            >
                              <span className="hidden sm:inline">Mark read</span>
                            </Button>
                          )}
                        </div>
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
