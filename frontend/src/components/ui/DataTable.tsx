import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/utils/cn';
import { EmptyState } from './States';
import { Button } from './Button';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number | null | undefined;
  className?: string;
  headerClassName?: string;
  /** hide on small screens (card view shows it in the body) */
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl';
  align?: 'left' | 'right' | 'center';
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  pageSize?: number;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  /** render for mobile card mode; default stacks the first 4 columns */
  mobileCard?: (row: T) => ReactNode;
  className?: string;
  dense?: boolean;
  toolbar?: ReactNode;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  /** Keeps the header visible while a long table scrolls. */
  stickyHeader?: boolean;
  /** Accessible description of the table for screen readers. */
  caption?: string;
  /**
   * Extra classes for a single row, in both the desktop table and the mobile card list.
   * Optional and purely additive — its intended use is a one-shot emphasis such as
   * `animate-row-flash` on a row a live update has just changed. Never use it to encode meaning
   * that is not also in the row's text.
   */
  rowClassName?: (row: T) => string | undefined;
}

/* `xl` exists for wide directories — a ten-column supplier ledger has nothing to drop between
   `lg` and always-visible, so its least-used columns waited until 1024 and then all arrived. */
const hideCls = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell', xl: 'hidden xl:table-cell' };
const alignCls = (a?: Column<unknown>['align']) => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left');

/** Sortable, paginated table with a responsive card fallback below `md`. */
export function DataTable<T>({
  columns, rows, rowKey, onRowClick, pageSize = 20, emptyTitle = 'Nothing here yet', emptyDescription, emptyAction,
  mobileCard, className, dense, toolbar, initialSort, stickyHeader = true, caption, rowClassName,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(initialSort ?? null);
  const [page, setPage] = useState(1);

  // When the caller filters the data, go back to the first page — otherwise the operator
  // lands on an empty page 4 and thinks the filter returned nothing.
  useEffect(() => { setPage(1); }, [rows.length, sort?.key, sort?.dir]);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const sv = col.sortValue;
    return [...rows].sort((a, b) => {
      const av = sv(a) ?? '', bv = sv(b) ?? '';
      const r = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
      return sort.dir === 'asc' ? r : -r;
    });
  }, [rows, sort, columns]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pages);
  const pageRows = sorted.slice((current - 1) * pageSize, current * pageSize);

  const toggleSort = (key: string) =>
    setSort((s) => (s?.key === key ? (s.dir === 'asc' ? { key, dir: 'desc' } : null) : { key, dir: 'asc' }));

  const rowKeyDown = (row: T) => (e: KeyboardEvent) => {
    if (!onRowClick) return;
    if (e.key === 'Enter' || e.key === ' ') {
      // Ignore keys that originated from a control inside the row.
      if ((e.target as HTMLElement).closest('button,a,input,select,textarea')) return;
      e.preventDefault();
      onRowClick(row);
    }
  };

  if (rows.length === 0) {
    return (
      <div className={cn('card p-0 overflow-hidden', className)}>
        {toolbar && <div className="p-3 border-b border-neutral-200">{toolbar}</div>}
        <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} compact />
      </div>
    );
  }

  return (
    <div className={cn('card p-0 overflow-hidden', className)}>
      {toolbar && <div className="p-3 border-b border-neutral-200">{toolbar}</div>}

      {/* Mobile: stacked cards */}
      <ul className="md:hidden divide-y divide-neutral-200">
        {pageRows.map((row) => (
          <li
            key={rowKey(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            onKeyDown={rowKeyDown(row)}
            tabIndex={onRowClick ? 0 : undefined}
            role={onRowClick ? 'button' : undefined}
            className={cn('p-4', onRowClick && 'cursor-pointer active:bg-neutral-100 transition-colors duration-fast', rowClassName?.(row))}
          >
            {mobileCard ? mobileCard(row) : (
              <div className="space-y-1.5">
                {columns.filter((c) => c.key !== 'actions').slice(0, 4).map((c) => (
                  <div key={c.key} className="flex justify-between gap-3 text-sm">
                    <span className="text-neutral-500 shrink-0">{c.header}</span>
                    <span className="text-right min-w-0">{c.render(row)}</span>
                  </div>
                ))}
                {columns.some((c) => c.key === 'actions') && (
                  <div className="pt-2 flex justify-end">{columns.find((c) => c.key === 'actions')!.render(row)}</div>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {/* Desktop: table with its own horizontal scroll so the page never overflows */}
      <div className="hidden md:block table-scroll max-h-[70vh] overflow-y-auto">
        <table className="w-full text-sm border-collapse">
          {caption && <caption className="sr-only">{caption}</caption>}
          {/*
            The header band is `surface` — one step *below* the card it sits in — so it reads as a
            fixed rule the rows scroll under. The background and the stickiness both live on the
            `th`, not the `thead`: with `border-collapse: collapse` a background painted on the
            row group is not guaranteed to render, which on a dark table meant rows showing
            through the sticky header as they scrolled past.
          */}
          <thead>
            <tr>
              {columns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={c.sortValue ? (active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}
                    className={cn(
                      'px-4 py-3 text-label uppercase text-neutral-500 font-semibold whitespace-nowrap bg-surface border-b border-neutral-200',
                      stickyHeader && 'sticky top-0 z-10',
                      alignCls(c.align), c.hideBelow && hideCls[c.hideBelow], c.headerClassName,
                    )}
                  >
                    {c.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        className={cn('inline-flex items-center gap-1.5 rounded-sm transition-colors duration-fast hover:text-neutral-900 touch-target', active && 'text-primary-500')}
                      >
                        {c.header}
                        {active
                          ? (sort!.dir === 'asc' ? <ArrowUp className="h-3.5 w-3.5" aria-hidden /> : <ArrowDown className="h-3.5 w-3.5" aria-hidden />)
                          : <ArrowUpDown className="h-3.5 w-3.5 opacity-40" aria-hidden />}
                      </button>
                    ) : c.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={rowKeyDown(row)}
                tabIndex={onRowClick ? 0 : undefined}
                className={cn(
                  /* `neutral-200/70` is the same hairline `.table-base` uses, so a DataTable and a
                     hand-rolled table on the same screen rule their rows identically. Hover lifts
                     to `neutral-100`, which is *above* the card — on dark a row must get lighter
                     on hover, never darker. */
                  'border-b border-neutral-200/70 last:border-b-0 transition-colors duration-fast',
                  onRowClick && 'cursor-pointer hover:bg-neutral-100 focus-visible:bg-neutral-100',
                  rowClassName?.(row),
                )}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn('px-4 align-middle', dense ? 'py-2' : 'py-3', alignCls(c.align), c.hideBelow && hideCls[c.hideBelow], c.className)}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-neutral-200 text-sm text-neutral-600">
          <span className="tabular-nums">
            <span className="hidden sm:inline">Showing </span>
            {(current - 1) * pageSize + 1}–{Math.min(current * pageSize, sorted.length)} of {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={current === 1} leftIcon={<ChevronLeft className="h-4 w-4" />}>
              <span className="hidden sm:inline">Prev</span>
            </Button>
            <span className="px-2 tabular-nums" aria-live="polite">{current} / {pages}</span>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={current === pages} rightIcon={<ChevronRight className="h-4 w-4" />}>
              <span className="hidden sm:inline">Next</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
