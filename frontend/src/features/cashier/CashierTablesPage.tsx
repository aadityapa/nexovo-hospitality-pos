import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Users, Crown, UserRound, Receipt, CheckCircle2, PenLine } from 'lucide-react';
import { useFloors, useTables } from '@/features/tables/hooks';
import { TableStatusLegend } from '@/features/tables/TableGrid';
import { useNow } from '@/hooks/useRealtime';
import { PageHeader, Button, StatusBadge, statusMeta, SegmentedControl, FilterSelect, LoadingState, ErrorState, EmptyState } from '@/components/ui';
import { money } from '@/utils/money';
import { elapsedMinutes } from '@/utils/date';
import { toast } from '@/store/uiStore';
import { cn } from '@/utils/cn';
import type { DiningTable } from '@/types';

/**
 * The cashier's table map. Same floor plan the waiter sees, read through a billing lens:
 * anything with a bill requested or a balance outstanding is a full-size card at the top,
 * tables that are merely occupied sit below, and tables with nothing to settle recede to
 * a quiet strip so they never compete with money waiting to be taken.
 */

type Lane = 'SETTLE' | 'DINING' | 'IDLE';

/** Which lane a table belongs to, derived only from fields already on the table record. */
function laneOf(t: DiningTable): Lane {
  if (!t.activeOrderId) return 'IDLE';
  if (t.activeOrderStatus === 'BILL_REQUESTED' || t.activeOrderStatus === 'BILLED' || t.status === 'BILLING' || t.status === 'PAYMENT_PENDING') return 'SETTLE';
  return 'DINING';
}

const LANE_META: Record<Lane, { title: string; blurb: string }> = {
  SETTLE: { title: 'Ready to settle', blurb: 'Bill requested or already billed — take the payment.' },
  DINING: { title: 'Still dining', blurb: 'Open orders that have not asked for a bill yet.' },
  IDLE: { title: 'Nothing to settle', blurb: 'Free and closed tables.' },
};

export default function CashierTablesPage() {
  const navigate = useNavigate();
  const now = useNow(30_000);
  const floors = useFloors();
  const tables = useTables();
  const [lane, setLane] = useState<'ALL' | Lane>('SETTLE');
  const [floor, setFloor] = useState('');

  const all = useMemo(() => tables.data ?? [], [tables.data]);

  const byLane = useMemo(() => {
    const scoped = floor ? all.filter((t) => t.floorId === Number(floor)) : all;
    const pick = (l: Lane) => scoped
      .filter((t) => laneOf(t) === l)
      // Longest occupied first; sorting on the fixed timestamp keeps the order steady between refreshes.
      .sort((a, b) => (a.occupiedSince ?? '9999').localeCompare(b.occupiedSince ?? '9999') || a.name.localeCompare(b.name, undefined, { numeric: true }));
    return { SETTLE: pick('SETTLE'), DINING: pick('DINING'), IDLE: pick('IDLE') };
  }, [all, floor]);

  const open = (t: DiningTable) => {
    if (!t.activeOrderId) { toast.info(`${t.name} has no active order`); return; }
    if (t.activeOrderStatus === 'DRAFT') { toast.warning('Order is still a draft', 'The waiter must send it first.'); return; }
    navigate(`/cashier/orders/${t.activeOrderId}/bill`);
  };

  const lanesToShow: Lane[] = lane === 'ALL' ? ['SETTLE', 'DINING', 'IDLE'] : [lane];
  const outstanding = byLane.SETTLE.reduce((a, t) => a + (t.activeOrderTotal ?? 0), 0);

  /** Full-size card — used for the two lanes that carry money. */
  const tableCard = (t: DiningTable, lead: boolean) => {
    const mins = t.occupiedSince ? elapsedMinutes(t.occupiedSince, now) : null;
    const draft = t.activeOrderStatus === 'DRAFT';
    return (
      <button
        key={t.id}
        type="button"
        onClick={() => open(t)}
        aria-label={`${t.name}, ${lead ? 'ready to settle' : 'still dining'}, seats ${t.capacity}${t.activeOrderTotal != null ? `, running total ${money(t.activeOrderTotal)}` : ''}${mins != null ? `, open ${mins} minutes` : ''}`}
        className={cn(
          'group relative overflow-hidden text-left rounded-md border bg-white p-4 pt-5 min-h-pos w-full transition-[box-shadow,border-color] press',
          'hover:shadow-panel focus-visible:shadow-panel',
          lead ? 'border-warning-200 hover:border-warning-500' : 'border-neutral-200 hover:border-neutral-300',
        )}
      >
        <span className={cn('absolute inset-x-0 top-0 h-1', lead ? 'bg-warning-500' : 'bg-neutral-300')} aria-hidden />

        <div className="flex items-start justify-between gap-2">
          <span className={cn('font-bold tracking-tight text-neutral-900 truncate', lead ? 'text-xl' : 'text-lg')}>{t.name}</span>
          <span className="inline-flex items-center gap-1 text-caption text-neutral-500 shrink-0">
            {t.isVip && <Crown className="h-3.5 w-3.5 text-accent-500" aria-label="VIP table" />}
            <Users className="h-3.5 w-3.5" aria-hidden />{t.capacity}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap gap-1">
          <StatusBadge kind="table" status={t.status} size="sm" />
          {t.activeOrderStatus && <StatusBadge kind="order" status={t.activeOrderStatus} size="sm" hideIcon />}
        </div>

        <div className="mt-3 flex items-end justify-between gap-2">
          <span className="min-w-0">
            <span className={cn('block tabular-nums font-semibold text-neutral-900 leading-tight', lead ? 'text-xl' : 'text-base')}>
              {t.activeOrderTotal != null ? money(t.activeOrderTotal) : '—'}
            </span>
            <span className="block text-caption text-neutral-500">{lead ? 'To settle, before tax' : 'Running total'}</span>
          </span>
          {mins != null && (
            <span className={cn('inline-flex items-center gap-1 text-caption tabular-nums shrink-0', mins >= 90 ? 'text-warning-700 font-medium' : 'text-neutral-500')}>
              <Clock className="h-3 w-3" aria-hidden />{mins}m
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t border-neutral-100 pt-2.5">
          <span className="inline-flex items-center gap-1 text-caption text-neutral-500 min-w-0">
            <UserRound className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">{t.assignedWaiterName ?? 'Unassigned'}</span>
          </span>
          <span className={cn('text-sm font-semibold shrink-0', draft ? 'text-neutral-400' : lead ? 'text-warning-700' : 'text-primary-700')}>
            {draft ? 'Draft — not sent' : lead ? 'Open bill →' : 'Generate bill →'}
          </span>
        </div>
      </button>
    );
  };

  /** Quiet chip — a table with nothing to settle should not look like work. */
  const idleChip = (t: DiningTable) => (
    <button
      key={t.id}
      type="button"
      onClick={() => open(t)}
      aria-label={`${t.name}, ${statusMeta('table', t.status).label}, nothing to settle, seats ${t.capacity}`}
      className="min-h-touch inline-flex items-center gap-2 rounded-sm border border-neutral-200 bg-neutral-50 px-3 text-sm text-neutral-600 hover:bg-white hover:border-neutral-300 transition-colors"
    >
      <span className="font-medium text-neutral-700">{t.name}</span>
      <span className="inline-flex items-center gap-0.5 text-caption text-neutral-400"><Users className="h-3 w-3" aria-hidden />{t.capacity}</span>
      {t.status !== 'AVAILABLE' && <StatusBadge kind="table" status={t.status} size="sm" hideIcon />}
    </button>
  );

  return (
    <div>
      <PageHeader
        title="Tables"
        subtitle={tables.isLoading
          ? 'Loading the floor…'
          : byLane.SETTLE.length
            ? `${byLane.SETTLE.length} table${byLane.SETTLE.length === 1 ? '' : 's'} ready to settle · ${money(outstanding)} before tax`
            : 'Nothing is waiting to be settled'}
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <SegmentedControl
              size="sm"
              ariaLabel="Filter tables by what the cashier has to do"
              value={lane}
              onChange={setLane}
              options={[
                { value: 'SETTLE', label: 'To settle', count: byLane.SETTLE.length },
                { value: 'DINING', label: 'Dining', count: byLane.DINING.length },
                { value: 'IDLE', label: 'Free', count: byLane.IDLE.length },
                { value: 'ALL', label: 'All', count: byLane.SETTLE.length + byLane.DINING.length + byLane.IDLE.length },
              ]}
            />
            <FilterSelect
              ariaLabel="Filter tables by area"
              className="sm:w-48"
              value={floor}
              onChange={(e) => setFloor(e.target.value)}
              placeholder="All areas"
              options={(floors.data ?? []).map((f) => ({ value: f.id, label: f.name }))}
            />
          </div>
          <TableStatusLegend />
        </div>
      </PageHeader>

      {tables.isLoading && <LoadingState variant="cards" rows={3} />}
      {tables.isError && <ErrorState error={tables.error} onRetry={() => void tables.refetch()} />}

      {tables.data && (
        all.length === 0 ? (
          <EmptyState title="No tables" description="Tables appear here once they are configured for this branch." />
        ) : lanesToShow.every((l) => byLane[l].length === 0) ? (
          <EmptyState
            icon={<CheckCircle2 className="h-6 w-6" />}
            title={lane === 'SETTLE' ? 'Nothing to settle right now' : floor ? 'No tables in this area match' : 'Nothing here'}
            description={lane === 'SETTLE' ? 'Tables appear here the moment a bill is requested or generated.' : 'Change the filter to see the rest of the floor.'}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {lane !== 'ALL' && <Button variant="outline" onClick={() => setLane('ALL')}>Show every table</Button>}
                {floor && <Button variant="ghost" onClick={() => setFloor('')}>Clear area filter</Button>}
              </div>
            }
          />
        ) : (
          <div className="space-y-7">
            {lanesToShow.map((l) => {
              const rows = byLane[l];
              if (rows.length === 0) return null;
              return (
                <section key={l} aria-label={LANE_META[l].title}>
                  <div className="flex flex-wrap items-baseline gap-2.5 mb-3">
                    <h2 className="text-subheading text-neutral-900 inline-flex items-center gap-2">
                      {l === 'SETTLE' && <Receipt className="h-4 w-4 text-warning-600" aria-hidden />}
                      {l === 'DINING' && <PenLine className="h-4 w-4 text-neutral-400" aria-hidden />}
                      {LANE_META[l].title}
                    </h2>
                    <span className="text-caption text-neutral-500">{rows.length} · {LANE_META[l].blurb}</span>
                  </div>
                  {l === 'IDLE' ? (
                    <div className="flex flex-wrap gap-2">{rows.map(idleChip)}</div>
                  ) : (
                    <div className={cn(
                      'grid gap-3',
                      l === 'SETTLE'
                        ? 'grid-cols-1 xs:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                        : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5',
                    )}>
                      {rows.map((t) => tableCard(t, l === 'SETTLE'))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
