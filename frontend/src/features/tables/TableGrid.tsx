import { Users, Clock, Crown, UserRound } from 'lucide-react';
import { cn } from '@/utils/cn';
import { money } from '@/utils/money';
import { elapsedMinutes } from '@/utils/date';
import { TABLE_STATUS } from '@/config/statuses';
import { StatusBadge, toneBg, EmptyState } from '@/components/ui';
import type { DiningTable, Floor } from '@/types';

export interface TableGridProps {
  tables: DiningTable[];
  floors?: Floor[];
  onSelect: (t: DiningTable) => void;
  selectedId?: number | null;
  /** larger tiles for touch (waiter) */
  size?: 'md' | 'lg';
  emptyTitle?: string;
}

/**
 * Visual table map grouped by floor.
 *
 * Status is carried by three independent signals — a coloured edge, an icon and a text label —
 * so it survives colour-blindness, glare and a dimmed tablet screen.
 */
export function TableGrid({ tables, floors, onSelect, selectedId, size = 'md', emptyTitle = 'No tables' }: TableGridProps) {
  if (tables.length === 0) {
    return <EmptyState title={emptyTitle} description="Tables appear here once they are configured for this branch." compact />;
  }

  const groups = (floors?.length ? floors : [...new Map(tables.map((t) => [t.floorId, { id: t.floorId, name: t.floorName }] as const)).values()])
    .map((f) => ({ id: f.id, name: f.name, tables: tables.filter((t) => t.floorId === f.id) }))
    .filter((g) => g.tables.length);

  return (
    <div className="space-y-7">
      {groups.map((g) => {
        const free = g.tables.filter((t) => t.status === 'AVAILABLE').length;
        return (
          <section key={g.id} aria-label={g.name}>
            <div className="flex items-baseline gap-2.5 mb-3">
              <h2 className="text-subheading text-neutral-900">{g.name}</h2>
              <span className="text-caption text-neutral-500">{free} of {g.tables.length} free</span>
            </div>
            <div className={cn(
              'grid gap-3',
              size === 'lg' ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6',
            )}>
              {g.tables.map((t) => {
                const meta = TABLE_STATUS[t.status];
                const mins = t.occupiedSince ? elapsedMinutes(t.occupiedSince) : null;
                const selected = selectedId === t.id;
                const free = t.status === 'AVAILABLE';
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onSelect(t)}
                    aria-pressed={selected}
                    aria-label={`${t.name}, ${meta.label}, seats ${t.capacity}${t.activeOrderTotal != null ? `, running total ${money(t.activeOrderTotal)}` : ''}`}
                    className={cn(
                      'group relative overflow-hidden text-left rounded-md border bg-white transition-[box-shadow,border-color,transform] press',
                      'hover:shadow-panel hover:border-neutral-300',
                      selected ? 'border-primary-600 ring-2 ring-primary-600/20' : 'border-neutral-200',
                      size === 'lg' ? 'p-4 pt-5 min-h-[132px]' : 'p-3 pt-4 min-h-[108px]',
                    )}
                  >
                    {/* Status edge — the fastest signal when scanning a full floor. */}
                    <span className={cn('absolute inset-x-0 top-0 h-1', toneBg[meta.tone])} aria-hidden />

                    <div className="flex items-start justify-between gap-2">
                      <span className={cn('font-bold tracking-tight text-neutral-900 truncate', size === 'lg' ? 'text-xl' : 'text-lg')}>
                        {t.name}
                      </span>
                      <span className="inline-flex items-center gap-1 text-caption text-neutral-500 shrink-0">
                        {t.isVip && <Crown className="h-3.5 w-3.5 text-accent-500" aria-label="VIP table" />}
                        <Users className="h-3.5 w-3.5" aria-hidden />{t.capacity}
                      </span>
                    </div>

                    <div className="mt-2">
                      <StatusBadge kind="table" status={t.status} size="sm" />
                    </div>

                    <div className="mt-2.5 flex items-end justify-between gap-2 min-h-[20px]">
                      {t.activeOrderTotal != null ? (
                        <span className="font-semibold tabular-nums text-neutral-900">{money(t.activeOrderTotal)}</span>
                      ) : t.assignedWaiterName ? (
                        <span className="inline-flex items-center gap-1 text-caption text-neutral-500 min-w-0">
                          <UserRound className="h-3 w-3 shrink-0" aria-hidden />
                          <span className="truncate">{t.assignedWaiterName}</span>
                        </span>
                      ) : (
                        <span className="text-caption text-neutral-400">{free ? 'Free' : '—'}</span>
                      )}
                      {mins != null && (
                        <span className={cn('inline-flex items-center gap-1 text-caption tabular-nums shrink-0', mins >= 90 ? 'text-warning-700 font-medium' : 'text-neutral-500')}>
                          <Clock className="h-3 w-3" aria-hidden />{mins}m
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** Always render this beside a table map — colour alone never communicates status. */
export function TableStatusLegend({ className }: { className?: string }) {
  return (
    <ul className={cn('flex flex-wrap gap-1.5', className)} aria-label="Table status legend">
      {(Object.keys(TABLE_STATUS) as (keyof typeof TABLE_STATUS)[])
        .filter((s) => s !== 'CLOSED')
        .map((s) => <li key={s}><StatusBadge kind="table" status={s} size="sm" /></li>)}
    </ul>
  );
}
