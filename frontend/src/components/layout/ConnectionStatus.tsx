import { Wifi, WifiOff, RefreshCw, Loader2 } from 'lucide-react';
import { useRealtimeStatus, useNow } from '@/hooks/useRealtime';
import { cn } from '@/utils/cn';

const AGO = (from: string, now: Date): string => {
  const s = Math.max(0, Math.round((now.getTime() - new Date(from).getTime()) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
};

/**
 * Honest transport indicator.
 *
 * Reports what the realtime provider actually reports — it is never a decorative "Live"
 * badge. On a kitchen display a stale board is a safety problem, so "offline" is stated
 * plainly together with the age of the last successful sync.
 *
 * The label comes from `status`, which the provider sets from transport outcomes alone (a poll
 * resolving, a poll failing twice, connect/disconnect, the browser's online/offline events).
 * The two timestamps are displayed, never used to derive the label:
 *   `lastSyncAt`  — the last successful exchange with the transport ("checked 12s ago").
 *   `lastEventAt` — the last business event received ("last activity 40m ago"), which on a slow
 *                   night is legitimately old and must not be read as a fault.
 * Because neither timestamp is compared against `now` to decide anything, an idle but healthy
 * connection cannot drift into looking stale or offline.
 */
export function ConnectionStatus({ onDark, compact }: { onDark?: boolean; compact?: boolean }) {
  const { status, lastSyncAt, lastEventAt } = useRealtimeStatus();
  // Only tick the clock while something is wrong — no needless re-renders during service.
  const now = useNow(status === 'connected' ? 60_000 : 10_000);

  const activity = lastEventAt ? `last activity ${AGO(lastEventAt, now)}` : 'no activity yet on this shift';

  const meta = {
    connected: {
      Icon: Wifi,
      label: 'Live',
      title: lastSyncAt
        ? `Connected — checked ${AGO(lastSyncAt, now)} · ${activity}`
        : `Connected · ${activity}`,
      light: 'text-success-700 bg-success-50 border-success-200',
      dark: 'text-success-500 bg-success-500/10 border-success-500/25',
    },
    connecting: {
      Icon: Loader2,
      label: 'Connecting',
      title: 'Connecting to the live update channel…',
      light: 'text-neutral-600 bg-neutral-100 border-neutral-200',
      dark: 'text-neutral-300 bg-white/5 border-white/15',
    },
    offline: {
      Icon: WifiOff,
      label: 'Offline',
      title: lastSyncAt
        ? `Not receiving updates — last connected ${AGO(lastSyncAt, now)}. Retrying automatically.`
        : 'Not receiving updates. Retrying automatically.',
      light: 'text-danger-700 bg-danger-50 border-danger-200',
      dark: 'text-danger-500 bg-danger-500/10 border-danger-500/25',
    },
    disabled: {
      Icon: RefreshCw,
      label: 'Manual refresh',
      title: 'Live updates are turned off for this deployment — refresh to see new activity.',
      light: 'text-neutral-600 bg-neutral-100 border-neutral-200',
      dark: 'text-neutral-300 bg-white/5 border-white/15',
    },
  }[status];

  const { Icon } = meta;
  return (
    <span
      title={meta.title}
      role="status"
      aria-label={`Live updates: ${meta.label}`}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap',
        onDark ? meta.dark : meta.light,
      )}
    >
      <Icon className={cn('h-3 w-3 shrink-0', status === 'connecting' && 'animate-spin')} aria-hidden />
      {!compact && meta.label}
    </span>
  );
}
