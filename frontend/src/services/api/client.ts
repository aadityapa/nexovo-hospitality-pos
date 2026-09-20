import type { ApiFieldError, QueryParams } from '@/types';

/** Thrown for every non-success response, network failure or mock business-rule violation. */
export class ApiError extends Error {
  readonly status: number;
  readonly errors: ApiFieldError[];
  readonly isNetworkError: boolean;

  constructor(status: number, message: string, errors: ApiFieldError[] = [], isNetworkError = false) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
    this.isNetworkError = isNetworkError;
  }

  get isUnauthorized(): boolean { return this.status === 401; }
  get isForbidden(): boolean { return this.status === 403; }
  get isNotFound(): boolean { return this.status === 404; }
  get isValidation(): boolean { return this.status === 400; }

  fieldError(field: string): string | undefined {
    return this.errors.find((e) => e.field === field)?.message;
  }

  static from(err: unknown): ApiError {
    if (err instanceof ApiError) return err;
    if (err instanceof Error) return new ApiError(0, err.message || 'Unexpected error');
    return new ApiError(0, 'Unexpected error');
  }
}

/**
 * Transport-agnostic API client. Implementations: OrdsClient (HTTP) and MockClient (in-memory).
 * Methods return the `data` payload of the standard envelope or throw ApiError.
 */
export interface ApiClient {
  get<T>(path: string, params?: QueryParams): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  put<T>(path: string, body?: unknown): Promise<T>;
  delete<T>(path: string): Promise<T>;
}

export interface AuthTokenProvider {
  getToken(): string | null;
  /** Phase 2: branch the session is currently scoped to (sent as X-Branch-Id); null = user's home branch */
  getBranchId(): number | null;
  onUnauthorized(): void;
}

export function buildQuery(params?: QueryParams): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) {
      if (v.length) sp.set(k, v.join(','));
    } else sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}
