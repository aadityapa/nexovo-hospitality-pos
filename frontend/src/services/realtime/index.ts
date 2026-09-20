import { env } from '@/config/env';
import { BroadcastRealtime } from './broadcastRealtime';
import { PollingRealtime } from './pollingRealtime';
import { StatusBus, type RealtimeProvider, type RealtimeTopic } from './types';

export type { RealtimeEvent, RealtimeProvider, RealtimeTopic, RealtimeStatus, RealtimeStatusSnapshot } from './types';

let provider: RealtimeProvider | null = null;

export function realtime(): RealtimeProvider {
  if (provider) return provider;
  if (env.realtimeMode === 'polling') {
    provider = new PollingRealtime(env.realtimePollMs);
  } else if (env.realtimeMode === 'none') {
    // No transport configured: report `disabled` so the UI offers manual refresh
    // instead of implying live updates that will never arrive.
    const status = new StatusBus('disabled');
    provider = {
      connect() {}, disconnect() {}, subscribe: () => () => {},
      getStatus: () => status.get(),
      onStatus: (h) => status.subscribe(h),
    };
  } else {
    provider = new BroadcastRealtime();
  }
  provider.connect();
  return provider;
}

/** Query keys to invalidate per topic — keeps components decoupled from event semantics. */
export const TOPIC_QUERY_KEYS: Record<Exclude<RealtimeTopic, 'all'>, string[]> = {
  orders: ['orders', 'tables', 'dashboard', 'vip'],
  tables: ['tables', 'dashboard'],
  kitchen: ['kitchen', 'orders'],
  bar: ['bar', 'orders'],
  bills: ['bills', 'orders', 'tables', 'dashboard', 'reports', 'customers', 'vip', 'club'],
  menu: ['menu', 'offers', 'public-menu', 'bottle-service', 'recipes'],
  inventory: ['inventory', 'recipes', 'purchases', 'suppliers', 'notifications'],
  reservations: ['reservations'],
  club: ['club', 'vip', 'tables'],
  notifications: ['notifications'],
};
