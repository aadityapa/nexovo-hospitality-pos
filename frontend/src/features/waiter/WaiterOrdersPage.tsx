import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Bell, Clock, Users, ClipboardList } from 'lucide-react';
import { useOrders } from '@/features/orders/hooks';
import { useDebounce, useNow } from '@/hooks/useRealtime';
import { PageHeader, SearchInput, SegmentedControl, StatusBadge, LoadingState, ErrorState, EmptyState, Card, Button, Badge } from '@/components/ui';
import { money } from '@/utils/money';
import { elapsedMinutes } from '@/utils/date';
import { DELAY_THRESHOLDS } from '@/config/statuses';
import { cn } from '@/utils/cn';
import type { Order } from '@/types';

type Filter = 'ACTIVE' | 'PENDING' | 'READY' | 'BILLING' | 'ALL';

const match = (o: Order, f: Filter) => f === 'ALL' ? true : f === 'ACTIVE' ? !['COMPLETED', 'CANCELLED'].includes(o.status) : f === 'PENDING' ? ['DRAFT', 'CONFIRMED', 'IN_PROGRESS', 'PARTIALLY_READY'].includes(o.status) : f === 'READY' ? o.items.some((i) => i.status === 'READY') : ['BILL_REQUESTED', 'BILLED', 'PAID'].includes(o.status);

/** "42m" / "2h 05m" — from timestamps already on the order. */
function ageLabel(mins: number): string {
  if (mins < 1) return '<1m';
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
}

interface Ageing { ready: boolean; mins: number; readyCount: number }

/**
 * What has this order been waiting on, and for how long?
 * Plates standing ready are the urgent case — that clock starts at the earliest `readyAt`.
 * Otherwise the order simply ages from when it was opened.
 */
function ageingOf(o: Order, now: Date): Ageing {
  const readyItems = o.items.filter((i) => i.status === 'READY');
  const oldestReady = readyItems.reduce<string | null>((a, i) => (i.readyAt && (a === null || i.readyAt < a) ? i.readyAt : a), null);
  if (oldestReady) return { ready: true, mins: elapsedMinutes(oldestReady, now), readyCount: readyItems.length };
  return { ready: false, mins: elapsedMinutes(o.createdAt, now), readyCount: 0 };
}

const readyTone = (mins: number) =>
  mins >= DELAY_THRESHOLDS.late ? 'text-danger-700' : mins >= DELAY_THRESHOLDS.warn ? 'text-warning-700' : 'text-success-700';

export default function WaiterOrdersPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('ACTIVE');
  const [search, setSearch] = useState('');
  const dq = useDebounce(search, 200);
  const now = useNow(30_000);
  const q = useOrders({ active: filter !== 'ALL' || undefined, search: dq || undefined });

  const all = useMemo(() => q.data ?? [], [q.data]);
  const count = (f: Filter) => all.filter((o) => match(o, f)).length;

  /** Most urgent first: plates going cold, longest wait at the top, then oldest open orders. */
  const list = useMemo(() => {
    const rows = all.filter((o) => match(o, filter)).map((o) => ({ o, age: ageingOf(o, now) }));
    return rows.sort((a, b) => (Number(b.age.ready) - Number(a.age.ready)) || (b.age.mins - a.age.mins));
  }, [all, filter, now]);

  const readyTables = list.filter((r) => r.age.ready).length;

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader title="My orders" subtitle="Longest wait first — plates already standing ready come before everything else.">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SegmentedControl
            ariaLabel="Filter orders by state"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'ACTIVE', label: 'Active', count: count('ACTIVE') },
              { value: 'PENDING', label: 'Pending', count: count('PENDING') },
              { value: 'READY', label: 'Ready', count: count('READY') },
              { value: 'BILLING', label: 'Billing', count: count('BILLING') },
              { value: 'ALL', label: 'All' },
            ]}
          />
          <SearchInput value={search} onChange={setSearch} placeholder="Order # or table" className="sm:w-56 sm:ml-auto" />
        </div>
      </PageHeader>

      {q.isLoading && <LoadingState rows={5} />}
      {q.isError && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}

      {q.data && (list.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            icon={<ClipboardList className="h-6 w-6" />}
            title={filter === 'ACTIVE' ? 'No open orders' : filter === 'READY' ? 'Nothing waiting to be served' : 'No orders match this filter'}
            description={dq ? `Nothing matches “${search}”.` : 'Orders you create, and orders on your tables, show up here.'}
            action={
              <div className="flex flex-col xs:flex-row gap-2">
                <Button onClick={() => navigate('/waiter/tables')}>Select a table</Button>
                {(filter !== 'ACTIVE' || dq) && (
                  <Button variant="outline" onClick={() => { setFilter('ACTIVE'); setSearch(''); }}>Show active orders</Button>
                )}
              </div>
            }
          />
        </Card>
      ) : (
        <>
          <p className="mb-2 text-sm text-neutral-600 flex flex-wrap items-center gap-x-2 gap-y-1" aria-live="polite">
            <span className="tabular-nums">{list.length} order{list.length === 1 ? '' : 's'}</span>
            {readyTables > 0 && (
              <Badge tone="success" size="sm" icon={<Bell className="h-3 w-3" aria-hidden />}>
                {readyTables} table{readyTables === 1 ? '' : 's'} waiting to be served
              </Badge>
            )}
          </p>

          <ul className="space-y-2">
            {list.map(({ o, age }) => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/waiter/orders/${o.id}`)}
                  className={cn(
                    'w-full card text-left px-3.5 py-3 flex items-start gap-3 min-h-touch transition-[border-color,box-shadow] hover:border-neutral-300 hover:shadow-panel press',
                    age.ready && age.mins >= DELAY_THRESHOLDS.late && 'border-danger-200',
                  )}
                >
                  <span className="shrink-0 w-14 sm:w-20 min-w-0">
                    <span className="block text-lg sm:text-xl font-bold leading-tight text-neutral-900 truncate">{o.tableName}</span>
                    <span className="block text-caption text-neutral-500 truncate">{o.floorName}</span>
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge kind="order" status={o.status} size="sm" />
                      {age.readyCount > 0 && (
                        <Badge tone="success" size="sm" icon={<Bell className="h-3 w-3" aria-hidden />}>{age.readyCount} ready</Badge>
                      )}
                    </span>
                    <span className="block text-caption text-neutral-500 mt-1 truncate">
                      {o.orderNumber} · {o.itemCount} item{o.itemCount === 1 ? '' : 's'}
                      <span className="hidden xs:inline"> · <Users className="inline h-3 w-3 -mt-0.5" aria-hidden /> {o.guestCount}</span>
                    </span>
                    <span className={cn('mt-1 inline-flex items-center gap-1 text-caption font-medium', age.ready ? readyTone(age.mins) : 'text-neutral-500')}>
                      <Clock className="h-3 w-3 shrink-0" aria-hidden />
                      {age.ready ? `Ready ${ageLabel(age.mins)} ago` : `Open ${ageLabel(age.mins)}`}
                    </span>
                  </span>

                  <span className="shrink-0 flex items-center gap-1">
                    <span className="font-semibold tabular-nums text-neutral-900">{money(o.subtotal)}</span>
                    <ChevronRight className="h-4 w-4 text-neutral-400" aria-hidden />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ))}
    </div>
  );
}
