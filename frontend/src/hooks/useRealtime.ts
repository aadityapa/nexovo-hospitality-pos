import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { realtime, TOPIC_QUERY_KEYS, type RealtimeTopic, type RealtimeEvent, type RealtimeStatusSnapshot } from '@/services/realtime';

/**
 * Invalidate TanStack queries when realtime events arrive for the given topics.
 * Components never touch the transport directly.
 */
export function useRealtimeInvalidate(topics: Exclude<RealtimeTopic, 'all'>[], onEvent?: (evt: RealtimeEvent) => void): void {
  const qc = useQueryClient();
  useEffect(() => {
    const rt = realtime();
    const unsubs = topics.map((t) => rt.subscribe(t, (evt) => {
      TOPIC_QUERY_KEYS[t].forEach((key) => void qc.invalidateQueries({ queryKey: [key] }));
      onEvent?.(evt);
    }));
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, topics.join(',')]);
}

/**
 * Live transport state for the connection indicator.
 * Reflects the actual provider — never a hardcoded "Live" badge.
 */
export function useRealtimeStatus(): RealtimeStatusSnapshot {
  const [snap, setSnap] = useState<RealtimeStatusSnapshot>(() => realtime().getStatus());
  useEffect(() => realtime().onStatus(setSnap), []);
  return snap;
}

/** Re-render every `ms` — for waiting-time clocks. */
export function useNow(ms = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = window.setInterval(() => setNow(new Date()), ms); return () => window.clearInterval(t); }, [ms]);
  return now;
}

export function useDebounce<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = window.setTimeout(() => setV(value), ms); return () => window.clearTimeout(t); }, [value, ms]);
  return v;
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [query]);
  return matches;
}
