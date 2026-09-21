import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, UserRound, Users } from 'lucide-react';
import { useFloors, useTables } from '@/features/tables/hooks';
import { TableStatusLegend } from '@/features/tables/TableGrid';
import { useAuth } from '@/hooks/useAuth';
import { useDebounce, useNow } from '@/hooks/useRealtime';
import { PageHeader, SearchInput, FilterChips, StatusBadge, LoadingState, ErrorState, EmptyState, Switch } from '@/components/ui';
import { TableShape } from '@/components/graphics';
import { TABLE_STATUS } from '@/config/statuses';
import { money } from '@/utils/money';
import { elapsedMinutes } from '@/utils/date';
import { cn } from '@/utils/cn';
import type { DiningTable } from '@/types';

/**
 * WAITER TABLE SELECTION — the floor, drawn.
 *
 * This screen is opened standing up, one-handed, to answer one question: which table am I going
 * to. So the tile is a DRAWN TABLE (`TableShape`) rather than a rectangle with a number in it —
 * a four-top and a two-top are told apart before either label is read, and a booth looks like a
 * booth. The shapes are schematic, not a floor plan: `DiningTable` carries no coordinates, so
 * nothing here implies where a table stands (see the note in `components/graphics/TableShape`).
 *
 * STATUS IS NEVER COLOUR ALONE. Three signals per tile, exactly as the shared floor map uses:
 * the tone on the shape's stroke and wash, the `StatusBadge` underneath (icon plus word), and
 * the tile's accessible name, which spells out status, covers, running total and how long the
 * table has been occupied.
 *
 * It is a separate view from `TableGrid` on purpose. `TableGrid` is the admin and manager floor
 * map on `/admin/tables`, whose presentation is signed off; this is the waiter's own selection
 * screen and carries none of that screen's controls — no status override, no waiter assignment,
 * no QR action. Tapping a tile does exactly what it did before: open the live order if there is
 * one, otherwise start a new order on that table.
 */
export default function WaiterTablesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const now = useNow(30_000);
  const floors = useFloors();
  const [floorId, setFloorId] = useState<number | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const dq = useDebounce(search, 200);
  const [mineOnly, setMineOnly] = useState(false);
  const tables = useTables({ floorId: floorId === 'ALL' ? undefined : floorId, search: dq || undefined });
  const list = useMemo(
    () => (tables.data ?? []).filter((t) => !mineOnly || t.assignedWaiterId === user?.id),
    [tables.data, mineOnly, user?.id],
  );

  /**
   * The visible tables, grouped by their area, in the venue's own area order.
   *
   * The area chips filter at the API, so a group here only ever contains tables the current
   * fetch returned — the "N of M free" beside each heading counts that group and nothing else.
   */
  const groups = useMemo(() => {
    const order = floors.data?.length
      ? floors.data.map((f) => ({ id: f.id, name: f.name }))
      : [...new Map(list.map((t) => [t.floorId, { id: t.floorId, name: t.floorName }] as const)).values()];
    return order
      .map((f) => ({ ...f, tables: list.filter((t) => t.floorId === f.id) }))
      .filter((g) => g.tables.length > 0);
  }, [floors.data, list]);

  const open = (t: DiningTable) =>
    navigate(t.activeOrderId && t.status !== 'AVAILABLE' ? `/waiter/orders/${t.activeOrderId}` : `/waiter/tables/${t.id}`);

  const tile = (t: DiningTable) => {
    const meta = TABLE_STATUS[t.status];
    const mins = t.occupiedSince ? elapsedMinutes(t.occupiedSince, now) : null;
    const free = t.status === 'AVAILABLE';
    return (
      <button
        key={t.id}
        type="button"
        onClick={() => open(t)}
        aria-label={[
          t.name,
          meta.label,
          `seats ${t.capacity}`,
          t.isVip ? 'VIP table' : null,
          t.activeOrderTotal != null ? `running total ${money(t.activeOrderTotal)}` : null,
          mins != null ? `occupied ${mins} minutes` : null,
        ].filter(Boolean).join(', ')}
        className={cn(
          'group flex flex-col items-center gap-1.5 rounded-md border bg-surface-raised shadow-card p-3 text-center min-w-0',
          'transition-[border-color,box-shadow] duration-control press hover:border-neutral-300 hover:shadow-panel',
          /* Violet is the VIP classification and nothing else — a wash, never a fill. */
          t.isVip && 'bg-vip-sheen bg-surface-raised',
        )}
      >
        {/* The drawing carries the identifier, the covers and the status tone. The WORDS for the
            status live in the `StatusBadge` below it, so `hideStatusLabel` stops the shape
            printing them a second time; the button's own `aria-label` is what a screen reader
            announces, so nothing here is said twice either. */}
        <TableShape
          label={t.number}
          capacity={t.capacity}
          tone={meta.tone}
          statusLabel={meta.label}
          shapeClassName="h-20 w-20 sm:h-24 sm:w-24"
          vip={t.isVip}
          hideStatusLabel
        />
        <span className="text-sm font-bold leading-tight text-neutral-900 truncate max-w-full">{t.name}</span>
        <StatusBadge kind="table" status={t.status} size="sm" />
        {/* Every figure below is already on the table record — nothing is derived or estimated. */}
        <span className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-caption text-neutral-500 max-w-full">
          <span className="inline-flex items-center gap-0.5 tnum"><Users className="h-3 w-3" aria-hidden />{t.capacity}</span>
          {t.activeOrderTotal != null && <span className="font-semibold tnum text-neutral-900">{money(t.activeOrderTotal)}</span>}
          {mins != null && (
            <span className={cn('inline-flex items-center gap-0.5 tnum', mins >= 90 ? 'text-warning-700 font-medium' : 'text-neutral-500')}>
              <Clock className="h-3 w-3" aria-hidden />{mins}m
            </span>
          )}
          {t.activeOrderTotal == null && mins == null && t.assignedWaiterName && (
            <span className="inline-flex items-center gap-0.5 min-w-0"><UserRound className="h-3 w-3 shrink-0" aria-hidden /><span className="truncate">{t.assignedWaiterName}</span></span>
          )}
          {free && !t.assignedWaiterName && t.activeOrderTotal == null && <span>Free</span>}
        </span>
      </button>
    );
  };

  return (
    <div>
      <PageHeader title="Select table" subtitle="Tap a table to open its order or start a new one">
        <div className="flex flex-col gap-3">
          <div className="flex gap-3 items-center">
            <SearchInput value={search} onChange={setSearch} placeholder="Table number" className="flex-1 sm:max-w-xs" />
            <Switch checked={mineOnly} onChange={setMineOnly} label="My tables" />
          </div>
          {/*
            Areas as a chip row rather than a segmented track: chips WRAP onto a second line at
            360 px, where a track would have hidden the last areas behind a sideways scroll on
            the one screen a waiter uses while walking.

            Deliberately UNCOUNTED. The area is applied at the API, so any number printed here
            would either describe a different set from the one on screen (the search and the
            "my tables" switch both narrow it) or would have to be fetched separately. The real
            counts a waiter needs are the "N of M free" beside each area heading below, which are
            counted from exactly the tables being shown.
          */}
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <FilterChips<string>
              ariaLabel="Filter by area"
              value={String(floorId)}
              onChange={(v) => setFloorId(v === 'ALL' ? 'ALL' : Number(v))}
              options={[{ value: 'ALL', label: 'All areas' }, ...(floors.data ?? []).map((f) => ({ value: String(f.id), label: f.name }))]}
            />
            <div className="sm:ml-auto"><TableStatusLegend /></div>
          </div>
        </div>
      </PageHeader>

      {tables.isLoading && <LoadingState variant="cards" rows={3} />}
      {tables.isError && <ErrorState error={tables.error} onRetry={() => void tables.refetch()} />}

      {tables.data && (groups.length === 0 ? (
        <EmptyState
          compact
          title={mineOnly ? 'No tables assigned to you' : search ? `No table matches “${search}”` : 'No tables'}
          description="Tables appear here once they are configured for this branch."
        />
      ) : (
        <div className="space-y-7">
          {groups.map((g) => {
            const free = g.tables.filter((t) => t.status === 'AVAILABLE').length;
            return (
              <section key={g.id} aria-label={g.name}>
                <div className="flex items-baseline gap-2.5 mb-3">
                  <h2 className="text-subheading text-neutral-900">{g.name}</h2>
                  <span className="text-caption text-neutral-500 tnum">{free} of {g.tables.length} free</span>
                </div>
                {/* Two tiles at 360 px and never fewer: a drawn table is square, so a single
                    column would put four tables on a phone screen instead of eight. Every track
                    is `minmax(0,1fr)`, so a long table name shrinks rather than widening the page. */}
                <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {g.tables.map(tile)}
                </div>
              </section>
            );
          })}
        </div>
      ))}
    </div>
  );
}
