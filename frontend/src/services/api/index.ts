import { env } from '@/config/env';
import { useAuthStore } from '@/store/authStore';
import type { ApiClient, AuthTokenProvider } from './client';
import { OrdsClient } from './http/ordsClient';
import { MockClient } from './mock/mockClient';

export { ApiError } from './client';
export type { ApiClient } from './client';

const tokenProvider: AuthTokenProvider = {
  getToken: () => useAuthStore.getState().token,
  getBranchId: () => useAuthStore.getState().branchId,
  onUnauthorized: () => {
    useAuthStore.getState().clear();
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/menu')) {
      window.location.assign('/login?expired=1');
    }
  },
};

let client: ApiClient | null = null;

/** Single entry point for every endpoint module. Swap implementation via VITE_API_MODE. */
export function api(): ApiClient {
  if (client) return client;
  client = env.apiMode === 'ords'
    ? new OrdsClient(env.apiBaseUrl, tokenProvider)
    : new MockClient(tokenProvider, env.mockLatencyMs);
  return client;
}
