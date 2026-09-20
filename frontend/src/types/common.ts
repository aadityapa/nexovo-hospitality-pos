export type ID = number;

export interface ApiFieldError {
  field?: string;
  message: string;
  code?: string;
}

export interface ApiSuccess<T> {
  success: true;
  message: string;
  data: T;
}

export interface ApiFailure {
  success: false;
  message: string;
  errors: ApiFieldError[];
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Object type (not interface) so it satisfies the QueryParams index signature. */
export type DateRange = {
  /** ISO date-time (inclusive) */
  from: string;
  /** ISO date-time (inclusive) */
  to: string;
};

export type QueryParams = Record<string, string | number | boolean | undefined | null | Array<string | number>>;

export type PrepLocation = 'KITCHEN' | 'BAR';
