import { ApiError, buildQuery, type ApiClient, type AuthTokenProvider } from '../client';
import type { ApiResponse, QueryParams } from '@/types';

/**
 * HTTP client for Oracle ORDS (or any backend honouring the envelope in docs/API_SPEC.md).
 * Replace this class to move to a different backend — nothing above it changes.
 */
export class OrdsClient implements ApiClient {
  constructor(private readonly baseUrl: string, private readonly auth: AuthTokenProvider, private readonly timeoutMs = 20000) {}

  get<T>(path: string, params?: QueryParams): Promise<T> { return this.request<T>('GET', path + buildQuery(params)); }
  post<T>(path: string, body?: unknown): Promise<T> { return this.request<T>('POST', path, body); }
  put<T>(path: string, body?: unknown): Promise<T> { return this.request<T>('PUT', path, body); }
  delete<T>(path: string): Promise<T> { return this.request<T>('DELETE', path); }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const token = this.auth.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const branchId = this.auth.getBranchId();
    if (branchId) headers['X-Branch-Id'] = String(branchId);

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal });
    } catch (e) {
      clearTimeout(timer);
      const aborted = (e as Error)?.name === 'AbortError';
      throw new ApiError(0, aborted ? 'Request timed out. Please try again.' : 'Network error — check your connection.', [], true);
    }
    clearTimeout(timer);

    let payload: ApiResponse<T> | null = null;
    const text = await res.text();
    if (text) {
      try { payload = JSON.parse(text) as ApiResponse<T>; } catch { payload = null; }
    }

    if (res.status === 401) {
      this.auth.onUnauthorized();
      throw new ApiError(401, payload?.message ?? 'Session expired. Please sign in again.');
    }
    if (!res.ok || !payload || payload.success === false) {
      const msg = payload?.message ?? (res.status >= 500 ? 'Server error. Please try again.' : `Request failed (${res.status})`);
      const errors = payload && payload.success === false ? payload.errors : [];
      throw new ApiError(res.status || 500, msg, errors);
    }
    return payload.data;
  }
}
