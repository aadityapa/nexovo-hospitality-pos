import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Play, Bell, Check, Clock, AlertTriangle, Hourglass, LayoutGrid, List, XCircle, ChevronRight } from 'lucide-react';
import { kitchenApi, barApi } from '@/services/api/endpoints';
import { useRealtimeInvalidate, useNow, useMediaQuery } from '@/hooks/useRealtime';
import { cn } from '@/utils/cn';
import { elapsedClock, elapsedMinutes } from '@/utils/date';
import { DELAY_THRESHOLDS } from '@/config/statuses';
import { Button, StatusBadge, LoadingState, ErrorState, SegmentedControl } from '@/components/ui';
import { toast } from '@/store/uiStore';
import type { Ticket, TicketItem, TicketStatus, OrderItemStatus, PrepLocation } from '@/types';

const COLUMNS: { status: TicketStatus; title: string; icon: typeof Play }[] = [
  { status: 'NEW', title: 'New', icon: Bell },
  { status: 'PREPARING', title: 'Preparing', icon: Play },
  { status: 'READY', title: 'Ready', icon: Check },
];

function delayTone(mins: number): 'ok' | 'warn' | 'late' {
  return mins >= DELAY_THRESHOLDS.late ? 'late' : mins >= DELAY_THRESHOLDS.warn ? 'warn' : 'ok';
}

/**
 * Waiting-time state. Colour is never the only signal — every state also carries its own
 * icon and its own word, which is what keeps the stacked phone queue readable at arm's
 * length without the size advantage of a wall screen.
 */
type AgeState = 'ok' | 'warn' | 'late' | 'ready';

const AGE_META: Record<AgeState, { Icon: typeof Clock; word: string; text: string; edge: string; head: string }> = {
  ok:    { Icon: Clock,         word: 'On time',      text: 'text-neutral-800',  edge: 'bg-neutral-300',  head: 'bg-neutral-50' },
  warn:  { Icon: Hourglass,     word: 'Running late', text: 'text-warning-700',  edge: 'bg-warning-500',  head: 'bg-warning-50' },
  late:  { Icon: AlertTriangle, word: 'Delayed',      text: 'text-danger-700',   edge: 'bg-danger-500',   head: 'bg-danger-50' },
  ready: { Icon: Bell,          word: 'Ready',        text: 'text-success-700',  edge: 'bg-success-500',  head: 'bg-success-50' },
};

function TicketCard({ t, now, onItem, onBulk, busy }: {
  t: Ticket; now: Date; onItem: (it: TicketItem, s: OrderItemStatus) => void; onBulk: (t: Ticket, s: OrderItemStatus) => void; busy: boolean;
}) {
  const mins = elapsedMinutes(t.createdAt, now);
  const state: AgeState = t.status === 'READY' ? 'ready' : delayTone(mins);
  const age = AGE_META[state];
  const AgeIcon = age.Icon;
  /* Colour + icon + word, in that order of redundancy. */
  const ageLabel = state === 'ready' ? 'Ready' : state === 'ok' ? `${mins} min` : `${age.word} · ${mins}m`;

  const active = t.items.filter((i) => i.status !== 'CANCELLED');
  const canStart = active.some((i) => i.status === 'NEW');
  const canReady = active.some((i) => i.status === 'PREPARING') || (canStart && !active.some((i) => i.status === 'PREPARING'));
  const canServe = active.length > 0 && active.every((i) => i.status === 'READY' || i.status === 'SERVED') && active.some((i) => i.status === 'READY');

  return (
    <article
      aria-label={`${t.tableName}, ticket ${t.ticketNumber}, ${age.word.toLowerCase()}, waiting ${mins} minutes`}
      className="rounded-md bg-white shadow-panel flex flex-col overflow-hidden"
    >
      {/* Delay state as a thick edge: readable from across the pass, and the first thing
          the eye lands on when the tickets are stacked one per row on a phone. */}
      <span className={cn('h-2 sm:h-1.5 w-full shrink-0', age.edge)} aria-hidden />

      <header className={cn('px-3 py-2.5 sm:px-4 sm:py-3 flex items-start justify-between gap-2 sm:gap-3', age.head)}>
        <div className="min-w-0">
          <p className="text-lg sm:text-kds-lg font-bold leading-none sm:leading-none tracking-tight sm:tracking-tight text-neutral-900 truncate">{t.tableName.toUpperCase()}</p>
          <p className="text-caption text-neutral-600 mt-1.5 truncate">
            {t.orderNumber} · {t.ticketNumber}{t.batchNo > 1 ? ` · batch ${t.batchNo}` : ''} · {t.waiterName}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className={cn('text-lg sm:text-xl font-bold tabular-nums leading-none sm:leading-none inline-flex items-center gap-1.5', age.text)}>
            <AgeIcon className="h-4 w-4 shrink-0" aria-hidden />
            {elapsedClock(t.createdAt, now)}
          </p>
          <p className={cn('text-[11px] font-semibold uppercase mt-1.5 tracking-wide leading-tight', age.text)}>
            {ageLabel}
          </p>
        </div>
      </header>

      <ul className="divide-y divide-neutral-100 flex-1">
        {t.items.map((it) => {
          const cancelled = it.status === 'CANCELLED';
          const advanceable = !cancelled && it.status !== 'SERVED';
          const next: OrderItemStatus = it.status === 'NEW' ? 'PREPARING' : it.status === 'PREPARING' ? 'READY' : 'SERVED';
          return (
            <li key={it.id} className={cn('px-3 py-2.5 sm:px-4 sm:py-3', cancelled && 'bg-neutral-50')}>
              <div className="flex items-start gap-2.5 sm:gap-3">
                <span className={cn('text-base font-semibold sm:text-kds tabular-nums w-8 sm:w-11 shrink-0 text-neutral-900', cancelled && 'line-through text-neutral-400')}>
                  ×{it.quantity}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn('text-base leading-snug sm:text-kds sm:leading-tight text-neutral-900', cancelled && 'line-through text-neutral-400')}>{it.itemName}</p>
                  {it.notes && <p className="mt-1 text-sm sm:text-base font-bold text-warning-700 uppercase tracking-wide leading-snug sm:leading-snug">{it.notes}</p>}
                  {cancelled && (
                    <p className="text-caption text-danger-600 flex items-center gap-1 mt-1">
                      <XCircle className="h-3 w-3" aria-hidden />Cancelled{it.cancelReason ? ` — ${it.cancelReason}` : ''}
                    </p>
                  )}
                </div>
                {advanceable ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onItem(it, next)}
                    /* 44px hit area on a phone; the compact wall-board target from `sm` up. */
                    className="shrink-0 -my-1 -mr-1 px-1 min-h-touch min-w-touch sm:min-h-0 sm:min-w-0 sm:m-0 sm:p-0 inline-flex items-center justify-end rounded-full transition-transform press disabled:opacity-50"
                    aria-label={`${it.itemName}: move to ${next.toLowerCase()}`}
                  >
                    <span className="inline-flex items-center gap-0.5">
                      <span className="sm:hidden"><StatusBadge kind="item" status={it.status} size="sm" /></span>
                      <span className="hidden sm:inline-flex"><StatusBadge kind="item" status={it.status} size="lg" /></span>
                      <ChevronRight className="h-4 w-4 text-neutral-400" aria-hidden />
                    </span>
                  </button>
                ) : (
                  <>
                    <span className="sm:hidden"><StatusBadge kind="item" status={it.status} size="sm" /></span>
                    <span className="hidden sm:inline-flex"><StatusBadge kind="item" status={it.status} size="md" /></span>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {t.orderNotes && (
        <p className="px-3 sm:px-4 py-2.5 text-sm text-neutral-700 border-t border-neutral-100 bg-warning-50/50">
          <span className="font-semibold">Order note:</span> {t.orderNotes}
        </p>
      )}

      {/* One full-width action per row on a phone; the two-up wall-board grid from `sm` up. */}
      <footer className="p-3 border-t border-neutral-100 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {t.status === 'NEW' && (
          <Button size="pos" variant="warning" block className="sm:col-span-2" leftIcon={<Play className="h-5 w-5" />} loading={busy} onClick={() => onBulk(t, 'PREPARING')}>
            Start preparing
          </Button>
        )}
        {t.status === 'PREPARING' && (
          <>
            {canStart && <Button size="pos" variant="outline" block loading={busy} onClick={() => onBulk(t, 'PREPARING')}>Start rest</Button>}
            <Button size="pos" variant="success" block className={canStart ? '' : 'sm:col-span-2'} leftIcon={<Bell className="h-5 w-5" />} loading={busy} disabled={!canReady} onClick={() => onBulk(t, 'READY')}>
              Mark ready
            </Button>
          </>
        )}
        {t.status === 'READY' && (
          <Button size="pos" variant="primary" block className="sm:col-span-2" leftIcon={<Check className="h-5 w-5" />} loading={busy} disabled={!canServe} onClick={() => onBulk(t, 'SERVED')}>
            Served · clear
          </Button>
        )}
      </footer>
    </article>
  );
}

export function DisplayBoard({ location }: { location: PrepLocation }) {
  const api = location === 'BAR' ? barApi : kitchenApi;
  const key = location === 'BAR' ? 'bar' : 'kitchen';
  const qc = useQueryClient();
  const q = useQuery({ queryKey: [key, 'tickets'], queryFn: () => api.tickets(), refetchInterval: 15_000, staleTime: 3_000 });
  useRealtimeInvalidate([key === 'bar' ? 'bar' : 'kitchen', 'orders']);
  const now = useNow(1000);
  const wide = useMediaQuery('(min-width: 1024px)');
  const [view, setView] = useState<'columns' | 'queue'>('columns');
  const [queueFilter, setQueueFilter] = useState<TicketStatus | 'ALL'>('ALL');
  const [busyTicket, setBusyTicket] = useState<number | null>(null);
  const setStatus = useMutation({
    mutationFn: ({ itemId, status }: { itemId: number; status: OrderItemStatus }) => api.setItemStatus(itemId, status),
    onSettled: () => void qc.invalidateQueries({ queryKey: [key] }),
  });

  // New-ticket alert: a short tone plus a toast, so the line notices without watching the screen.
  const prevIds = useRef<Set<number> | null>(null);
  useEffect(() => {
    if (!q.data) return;
    const ids = new Set(q.data.filter((t) => t.status === 'NEW').map((t) => t.id));
    if (prevIds.current) {
      const fresh = [...ids].filter((id) => !prevIds.current!.has(id));
      if (fresh.length) {
        toast.info(`${fresh.length} new ticket${fresh.length > 1 ? 's' : ''}`);
        try {
          const ac = new AudioContext();
          const o = ac.createOscillator(); const g = ac.createGain();
          o.connect(g); g.connect(ac.destination);
          o.frequency.value = 880; g.gain.value = 0.05;
          o.start(); o.stop(ac.currentTime + 0.15);
        } catch { /* audio unavailable — the toast still shows */ }
      }
    }
    prevIds.current = ids;
  }, [q.data]);

  const onItem = async (it: TicketItem, s: OrderItemStatus) => { await setStatus.mutateAsync({ itemId: it.id, status: s }); };
  const onBulk = async (t: Ticket, s: OrderItemStatus) => {
    setBusyTicket(t.id);
    try {
      const from: OrderItemStatus = s === 'PREPARING' ? 'NEW' : s === 'READY' ? 'PREPARING' : 'READY';
      const targets = t.items.filter((i) => i.status === from || (s === 'READY' && i.status === 'NEW'));
      for (const it of targets) {
        if (s === 'READY' && it.status === 'NEW') await setStatus.mutateAsync({ itemId: it.id, status: 'READY' });
        else await setStatus.mutateAsync({ itemId: it.id, status: s });
      }
    } finally { setBusyTicket(null); }
  };

  /**
   * Oldest first, always — so the stacked phone queue is literally a prep queue, longest
   * waiting at the top. A stable order also means a refresh never reshuffles the board under
   * the hands of someone mid-task — new tickets append at the end of their column.
   */
  const sorted = useMemo(
    () => [...(q.data ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id),
    [q.data],
  );
  const grouped = useMemo(() => COLUMNS.map((c) => ({ ...c, tickets: sorted.filter((t) => t.status === c.status) })), [sorted]);
  const late = sorted.filter((t) => t.status !== 'READY' && delayTone(elapsedMinutes(t.createdAt, now)) === 'late').length;
  const useColumns = wide && view === 'columns';
  const queue = sorted.filter((t) => queueFilter === 'ALL' || t.status === queueFilter);

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Counts scroll sideways on a phone rather than wrapping into three ragged rows. */}
      <div className="shrink-0 mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 sm:flex-wrap">
        <div className="flex gap-2 overflow-x-auto no-scrollbar sm:flex-wrap sm:overflow-visible">
          {grouped.map((g) => (
            <span key={g.status} className="shrink-0 inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/15 px-3 py-1.5 text-sm font-medium text-neutral-200">
              <g.icon className="h-4 w-4 text-neutral-400" aria-hidden />
              {g.title}
              <span className="rounded-full bg-white/15 text-white text-xs px-2 py-0.5 tabular-nums font-semibold">{g.tickets.length}</span>
            </span>
          ))}
          {late > 0 && (
            <span className="shrink-0 inline-flex items-center gap-2 rounded-full bg-danger-500/15 border border-danger-500/30 text-danger-500 px-3 py-1.5 text-sm font-semibold">
              <AlertTriangle className="h-4 w-4" aria-hidden />{late} delayed
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 sm:ml-auto">
          {!useColumns && (
            <SegmentedControl
              size="sm" ariaLabel="Filter tickets" value={queueFilter} onChange={setQueueFilter}
              options={[{ value: 'ALL', label: 'All' }, { value: 'NEW', label: 'New' }, { value: 'PREPARING', label: 'Preparing' }, { value: 'READY', label: 'Ready' }]}
            />
          )}
          {wide && (
            <SegmentedControl
              size="sm" ariaLabel="Board layout" value={view} onChange={setView}
              options={[
                { value: 'columns', label: <LayoutGrid className="h-4 w-4" aria-hidden />, ariaLabel: 'Column layout' },
                { value: 'queue', label: <List className="h-4 w-4" aria-hidden />, ariaLabel: 'Queue layout' },
              ]}
            />
          )}
        </div>
      </div>

      {q.isLoading && <LoadingState variant="cards" rows={3} />}
      {q.isError && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}

      {q.data && (sorted.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <span className="mx-auto h-14 w-14 rounded-full bg-white/5 text-neutral-500 flex items-center justify-center mb-4" aria-hidden>
              <Bell className="h-7 w-7" />
            </span>
            <h2 className="text-xl font-semibold text-neutral-200">No active tickets</h2>
            <p className="text-sm text-neutral-500 mt-1.5">New orders appear here automatically.</p>
          </div>
        </div>
      ) : useColumns ? (
        <div className="grid grid-cols-3 gap-4 flex-1 min-h-0">
          {grouped.map((g) => (
            <section key={g.status} aria-label={g.title} className="min-h-0 flex flex-col">
              <h2 className="text-label uppercase text-neutral-400 mb-2.5 flex items-center gap-2 shrink-0">
                <g.icon className="h-4 w-4" aria-hidden />{g.title}
                <span className="tabular-nums text-neutral-500">({g.tickets.length})</span>
              </h2>
              <div className="flex-1 overflow-y-auto overscroll-contain space-y-3 pr-1">
                {g.tickets.length === 0 ? (
                  <p className="text-caption text-neutral-600 py-8 text-center border border-dashed border-white/10 rounded-md">Empty</p>
                ) : g.tickets.map((t) => <TicketCard key={t.id} t={t} now={now} onItem={onItem} onBulk={onBulk} busy={busyTicket === t.id} />)}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col">
          <p className="sm:hidden shrink-0 mb-2 text-caption text-neutral-400">
            Prep queue · longest waiting first{queueFilter !== 'ALL' ? ' · filtered' : ''}
          </p>
          {/* `.safe-bottom` keeps the last ticket's action clear of the home indicator. */}
          <div className="flex-1 overflow-y-auto overscroll-contain safe-bottom">
            {queue.length === 0 ? (
              <p className="text-caption text-neutral-500 py-10 text-center border border-dashed border-white/10 rounded-md">
                No tickets in this state.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                {queue.map((t) => <TicketCard key={t.id} t={t} now={now} onItem={onItem} onBulk={onBulk} busy={busyTicket === t.id} />)}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
