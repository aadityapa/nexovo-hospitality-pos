import { QueryClient, MutationCache, QueryCache } from '@tanstack/react-query';
import { ApiError } from '@/services/api/client';
import { toast } from '@/store/uiStore';

/**
 * Global error handling: every failed mutation surfaces a toast unless the caller opts out
 * (meta.silent). Queries retry on network/5xx only — never on 4xx.
 */
export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (query.meta?.silent) return;
      const err = ApiError.from(error);
      if (err.isUnauthorized) return; // handled by token provider
      if (err.isNetworkError) toast.error('Connection problem', err.message);
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _v, _c, mutation) => {
      if (mutation.meta?.silent) return;
      const err = ApiError.from(error);
      if (err.isUnauthorized) return;
      toast.error(err.status === 403 ? 'Not allowed' : err.status === 400 ? 'Check your input' : 'Action failed', err.message);
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 15 * 1000,
      refetchOnWindowFocus: true,
      retry: (count, error) => {
        const err = ApiError.from(error);
        if (err.status >= 400 && err.status < 500) return false;
        return count < 2;
      },
    },
    mutations: { retry: 0 },
  },
});
