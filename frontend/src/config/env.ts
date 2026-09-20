export type ApiMode = 'mock' | 'ords';
export type RealtimeMode = 'broadcast' | 'polling' | 'none';

function read(key: string, fallback = ''): string {
  const v = (import.meta.env as Record<string, string | undefined>)[key];
  return v === undefined || v === '' ? fallback : v;
}

export const env = {
  apiMode: (read('VITE_API_MODE', 'mock') as ApiMode),
  apiBaseUrl: read('VITE_API_BASE_URL', 'http://localhost:8080/ords/pos/v1').replace(/\/$/, ''),
  publicAppUrl: read('VITE_PUBLIC_APP_URL', typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173').replace(/\/$/, ''),
  realtimeMode: (read('VITE_REALTIME_MODE', read('VITE_API_MODE', 'mock') === 'mock' ? 'broadcast' : 'polling') as RealtimeMode),
  realtimePollMs: Number(read('VITE_REALTIME_POLL_MS', '5000')),
  mockLatencyMs: Number(read('VITE_MOCK_LATENCY_MS', '150')),
  appName: read('VITE_APP_NAME', 'Nexovo POS'),
  isMock: read('VITE_API_MODE', 'mock') === 'mock',
} as const;
