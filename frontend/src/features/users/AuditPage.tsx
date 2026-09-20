import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ArrowRight, User as UserIcon, Cpu, X, ScrollText, SearchX } from 'lucide-react';
import { auditApi } from '@/services/api/endpoints';
import { useDateRange, DateRangeFilter } from '@/features/shared/DateRangeFilter';
import { PageHeader, Card, LoadingState, ErrorState, EmptyState, Badge, Button, FilterSelect, SearchInput } from '@/components/ui';
import { fmtDateTime, fmtRelative } from '@/utils/date';
import { cn } from '@/utils/cn';
import type { AuditLog } from '@/types';

const ENTITIES = ['', 'ORDERS', 'ORDER_ITEMS', 'BILLS', 'PAYMENTS', 'DISCOUNTS', 'MENU_ITEMS', 'MENU_CATEGORIES', 'OFFERS', 'DINING_TABLES', 'FLOORS', 'USERS', 'ROLES', 'BRANCHES', 'TAX_CONFIGURATIONS'];
const PAGE_SIZE = 50;
/** Entries with no user are written by the server itself; they get a name so they can be filtered like anyone else. */
const SYSTEM_ACTOR = 'System';

/** Actions that removed or reversed something read louder than the rest. */
const actionTone = (action: string): 'danger' | 'warning' | 'success' | 'primary' => {
  const a = action.toUpperCase();
  if (/(DELETE|CANCEL|VOID|REFUND|REVOK|REVERS)/.test(a)) return 'danger';
  if (/(DISCOUNT|OVERRIDE|PASSWORD|STATUS|APPROV)/.test(a)) return 'warning';
  if (/(CREATE|ADD|LOGIN)/.test(a)) return 'success';
  return 'primary';
};

const prettyEntity = (e: string) => e.replace(/_/g, ' ').toLowerCase();

/** Before and after are shown as two separate values — never merged into one line of text. */
function ValueChange({ entry }: { entry: AuditLog }) {
  const { oldValue, newValue } = entry;
  if (!oldValue && !newValue) return null;
  const box = 'rounded-sm border px-2 py-1 font-mono text-[11px] leading-snug break-all min-w-0';
  if (oldValue && newValue) {
    return (
      <div className="mt-1.5 flex flex-col sm:flex-row sm:items-stretch gap-1.5 min-w-0">
        <div className={cn(box, 'flex-1 border-neutral-200 bg-neutral-50 text-neutral-600')}>
          <span className="block text-label uppercase text-neutral-400 font-sans mb-0.5">Before</span>
          {oldValue}
        </div>
        <span className="hidden sm:flex items-center text-neutral-400 shrink-0" aria-hidden><ArrowRight className="h-4 w-4" /></span>
        <div className={cn(box, 'flex-1 border-primary-200 bg-primary-50 text-primary-900')}>
          <span className="block text-label uppercase text-primary-700/70 font-sans mb-0.5">After</span>
          {newValue}
        </div>
      </div>
    );
  }
  return (
    <div className="mt-1.5 min-w-0">
      <div className={cn(box, newValue ? 'border-primary-200 bg-primary-50 text-primary-900' : 'border-neutral-200 bg-neutral-50 text-neutral-600')}>
        <span className="block text-label uppercase font-sans mb-0.5 text-neutral-400">{newValue ? 'Set to' : 'Previous value'}</span>
        {newValue ?? oldValue}
      </div>
    </div>
  );
}

export default function AuditPage() {
  const dr = useDateRange('week');
  const [entity, setEntity] = useState('');
  const [page, setPage] = useState(1);
  const [text, setText] = useState('');
  const [action, setAction] = useState('');
  const [actor, setActor] = useState('');
  const q = useQuery({ queryKey: ['audit', dr.range, entity, page], queryFn: () => auditApi.list({ entity: entity || undefined, from: dr.range.from, to: dr.range.to, page, pageSize: PAGE_SIZE }) });
  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.pageSize)) : 1;

  const items = useMemo(() => q.data?.items ?? [], [q.data]);
  /** Every distinct action on the page already fetched — narrowing never costs a request. */
  const actions = useMemo(() => [...new Set(items.map((a) => a.action))].sort(), [items]);
  /** "Who did this?" is the first question asked of an audit trail, so the actors on this page are a filter too. */
  const actors = useMemo(() => [...new Set(items.map((a) => a.userName ?? SYSTEM_ACTOR))].sort(), [items]);
  const rows = useMemo(() => {
    const needle = text.trim().toLowerCase();
    return items.filter((a) => {
      if (action && a.action !== action) return false;
      if (actor && (a.userName ?? SYSTEM_ACTOR) !== actor) return false;
      if (!needle) return true;
      return [a.action, a.entity, a.userName ?? 'system', a.entityId != null ? `#${a.entityId}` : '', a.oldValue ?? '', a.newValue ?? '']
        .some((v) => String(v).toLowerCase().includes(needle));
    });
  }, [items, text, action, actor]);

  const narrowed = !!text.trim() || !!action || !!actor;
  const clearNarrowing = () => { setText(''); setAction(''); setActor(''); };
  const resetPaging = () => { setPage(1); clearNarrowing(); };

  return (
    <div>
      <PageHeader
        title="Audit log"
        subtitle="Every critical action — who did it, what it touched, and the value before and after. The log is written by the server and cannot be edited or deleted from this app."
      >
        <div className="flex flex-col lg:flex-row gap-2 lg:items-center">
          <DateRangeFilter state={dr} />
          <FilterSelect
            ariaLabel="Filter by entity (fetches that entity)"
            className="lg:w-52"
            value={entity}
            onChange={(e) => { setEntity(e.target.value); resetPaging(); }}
            options={ENTITIES.map((e) => ({ value: e, label: e ? prettyEntity(e).replace(/^./, (c) => c.toUpperCase()) : 'All entities' }))}
          />
        </div>
      </PageHeader>

      {q.isLoading && <LoadingState variant="table" rows={8} />}
      {q.isError && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}

      {q.data && (
        <Card padded={false}>
          {/* Narrowing works on the page already loaded — it never issues another request. */}
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 p-3 border-b border-neutral-200">
            <SearchInput value={text} onChange={setText} placeholder="Filter this page: user, action, value" className="sm:w-64" aria-label="Filter the entries on this page" />
            <FilterSelect
              ariaLabel="Filter by who did it, within this page"
              className="sm:w-44"
              value={actor}
              onChange={(e) => setActor(e.target.value)}
              placeholder={`Anyone (${actors.length})`}
              options={actors.map((a) => ({ value: a, label: a }))}
            />
            <FilterSelect
              ariaLabel="Filter by action, within this page"
              className="sm:w-52"
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder={`Any action (${actions.length})`}
              options={actions.map((a) => ({ value: a, label: a.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()) }))}
            />
            <p className="text-caption text-neutral-500 sm:ml-auto tabular-nums" aria-live="polite">
              {narrowed ? `${rows.length} of ${items.length} on this page` : `${items.length} on this page`} · {q.data.total} in range
            </p>
            {narrowed && <Button size="sm" variant="ghost" className="min-h-touch self-start sm:self-auto" leftIcon={<X className="h-4 w-4" />} onClick={clearNarrowing}>Clear</Button>}
          </div>

          {items.length === 0 ? (
            <EmptyState
              icon={<ScrollText className="h-6 w-6" />}
              title="No audit entries"
              description={entity ? `Nothing was recorded against ${prettyEntity(entity)} in this date range.` : 'Nothing was recorded in this date range.'}
              action={entity ? <Button variant="outline" onClick={() => { setEntity(''); resetPaging(); }}>Show every entity</Button> : undefined}
            />
          ) : rows.length === 0 ? (
            <EmptyState
              compact
              icon={<SearchX className="h-6 w-6" />}
              title="Nothing on this page matches"
              description="The filter only looks at the 50 entries loaded here. Clear it, or move to another page."
              action={<Button variant="outline" onClick={clearNarrowing}>Clear the filter</Button>}
            />
          ) : (
            <>
              {/*
                A forensic list reads in columns: WHO did WHAT to WHICH record, WHEN.
                The header row makes that contract explicit from md up; below md each entry
                stacks in the same order, so the reading sequence never changes.
              */}
              <div
                className="hidden md:grid md:grid-cols-[minmax(0,150px)_minmax(0,160px)_minmax(0,1fr)] gap-4 px-4 py-2 bg-neutral-50 border-b border-neutral-200 text-label uppercase text-neutral-500"
                aria-hidden
              >
                <span>When</span>
                <span>Who</span>
                <span>What changed</span>
              </div>
              <ul className="divide-y divide-neutral-100">
                {rows.map((a) => (
                  <li key={a.id} className="px-4 py-3 text-sm grid gap-1.5 md:grid-cols-[minmax(0,150px)_minmax(0,160px)_minmax(0,1fr)] md:gap-4 md:items-start">
                    <div className="min-w-0 md:order-1">
                      <time className="block text-neutral-800 tabular-nums" dateTime={a.createdAt}>{fmtDateTime(a.createdAt)}</time>
                      <span className="block text-caption text-neutral-400">{fmtRelative(a.createdAt)}</span>
                    </div>

                    {/* Actor is its own column: "system" and "a named person" must never look alike. */}
                    <div className="min-w-0 md:order-2">
                      <span className={cn(
                        'inline-flex items-center gap-1.5 min-w-0 max-w-full rounded-full border px-2 py-0.5 text-caption',
                        a.userName ? 'bg-neutral-50 border-neutral-200 text-neutral-700' : 'bg-info-50 border-info-100 text-info-700',
                      )}>
                        {a.userName
                          ? <><UserIcon className="h-3.5 w-3.5 shrink-0 text-neutral-400" aria-hidden /><span className="truncate">{a.userName}</span></>
                          : <><Cpu className="h-3.5 w-3.5 shrink-0" aria-hidden /><span className="truncate">System</span></>}
                      </span>
                    </div>

                    <div className="min-w-0 md:order-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={actionTone(a.action)} size="sm">{a.action.replace(/_/g, ' ')}</Badge>
                        <span className="text-neutral-700 min-w-0 truncate">
                          {prettyEntity(a.entity)}{a.entityId != null ? <span className="text-neutral-500 tabular-nums"> #{a.entityId}</span> : null}
                        </span>
                      </div>
                      <ValueChange entry={a} />
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}

          {pages > 1 && (
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-neutral-200 text-sm text-neutral-600">
              <span className="tabular-nums min-w-0">
                <span className="hidden sm:inline">Entries </span>
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, q.data.total)} of {q.data.total}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="sm" variant="outline" className="min-h-touch" disabled={page <= 1} leftIcon={<ChevronLeft className="h-4 w-4" />} aria-label="Previous page" onClick={() => { setPage((p) => p - 1); clearNarrowing(); }}>
                  <span className="hidden sm:inline">Prev</span>
                </Button>
                <span className="px-2 tabular-nums" aria-live="polite">{page} / {pages}</span>
                <Button size="sm" variant="outline" className="min-h-touch" disabled={page >= pages} rightIcon={<ChevronRight className="h-4 w-4" />} aria-label="Next page" onClick={() => { setPage((p) => p + 1); clearNarrowing(); }}>
                  <span className="hidden sm:inline">Next</span>
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
