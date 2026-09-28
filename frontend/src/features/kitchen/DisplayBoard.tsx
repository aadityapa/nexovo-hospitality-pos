import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Play, Bell, Check, Clock, AlertTriangle, Hourglass, LayoutGrid, List, XCircle, ChevronRight } from 'lucide-react';
import { kitchenApi, barApi } from '@/services/api/endpoints';
import { useRealtimeInvalidate, useNow, useMediaQuery } from '@/hooks/useRealtime';
import { useWorkspace } from '@/hooks/useSurface';
import { cn } from '@/utils/cn';
import { elapsedMinutes } from '@/utils/date';
import { DELAY_THRESHOLDS } from '@/config/statuses';
import { Button, StatusBadge, LoadingState, ErrorState, SegmentedControl } from '@/components/ui';
import { toast } from '@/store/uiStore';
import type { Ticket, TicketItem, TicketStatus, OrderItemStatus, PrepLocation } from '@/types';

const COLUMNS: { status: TicketStatus; title: string; icon: typeof Play }[] = [
  { status: 'NEW', title: 'New', icon: Bell },
  { status: 'PREPARING', title: 'Preparing', icon: Play },
  { status: 'READY', title: 'Ready', icon: Check },
];

/**
 * COLUMN ACCENT — the tone each column of the board wears, and that every ticket inside it
 * carries as its left rule. NEW is the muted red of "nobody has touched this yet", PREPARING is
 * amber for pending, READY is emerald for done. The per-line badges inside a ticket keep their
 * own `ORDER_ITEM_STATUS` tones (a NEW line is info-blue), because those describe a LINE's
 * state, while the column describes where the whole ticket stands on the pass.
 *
 * Built the way every tinted surface in the system is: `-500` for a rule, `-50` fill, `-200`
 * hairline and the legible `-700` rung for text — all present on both themes, though this board
 * is obsidian in both.
 */
interface ColumnAccent { top: string; left: string; text: string; badge: string; tint: string }

/* A served or cancelled ticket has already left the board; the neutral accent is typed for
   completeness so the record covers every `TicketStatus`, and `neutral-400` keeps the rule a
   visible mark rather than a hairline. */
const NEUTRAL_ACCENT: ColumnAccent = {
  top: 'border-t-neutral-400', left: 'border-l-neutral-400', text: 'text-neutral-500',
  badge: 'bg-neutral-100 text-neutral-700 border-neutral-300', tint: 'bg-neutral-100 border-neutral-300 text-neutral-700',
};

const COLUMN_ACCENT: Record<TicketStatus, ColumnAccent> = {
  NEW:       { top: 'border-t-danger-500',  left: 'border-l-danger-500',  text: 'text-danger-700',  badge: 'bg-danger-50 text-danger-700 border-danger-200',    tint: 'bg-danger-50 border-danger-200 text-danger-700' },
  PREPARING: { top: 'border-t-warning-500', left: 'border-l-warning-500', text: 'text-warning-700', badge: 'bg-warning-50 text-warning-700 border-warning-200', tint: 'bg-warning-50 border-warning-200 text-warning-700' },
  READY:     { top: 'border-t-success-500', left: 'border-l-success-500', text: 'text-success-700', badge: 'bg-success-50 text-success-700 border-success-200', tint: 'bg-success-50 border-success-200 text-success-700' },
  SERVED:    NEUTRAL_ACCENT,
  CANCELLED: NEUTRAL_ACCENT,
};

function delayTone(mins: number): 'ok' | 'warn' | 'late' {
  return mins >= DELAY_THRESHOLDS.late ? 'late' : mins >= DELAY_THRESHOLDS.warn ? 'warn' : 'ok';
}

/**
 * Waiting-time state, printed as ONE chip on the ticket head. Colour is never the only signal —
 * every state also carries its own icon and its own word, which is what keeps the stacked phone
 * queue readable at arm's length without the size advantage of a wall screen.
 *
 * On time is a plain neutral chip; past `DELAY_THRESHOLDS.warn` it turns amber, past `.late`
 * muted red. A READY ticket's chip is emerald and keeps counting, so the pass can see how long a
 * finished plate has been standing.
 */
type AgeState = 'ok' | 'warn' | 'late' | 'ready';

const AGE_META: Record<AgeState, { Icon: typeof Clock; word: string; chip: string }> = {
  ok:    { Icon: Clock,         word: 'On time',      chip: 'bg-neutral-100 text-neutral-700 border-neutral-300' },
  warn:  { Icon: Hourglass,     word: 'Running late', chip: 'bg-warning-50 text-warning-700 border-warning-200' },
  late:  { Icon: AlertTriangle, word: 'Delayed',      chip: 'bg-danger-50 text-danger-700 border-danger-200' },
  ready: { Icon: Bell,          word: 'Ready',        chip: 'bg-success-50 text-success-700 border-success-200' },
};

function ElapsedChip({ state, mins }: { state: AgeState; mins: number }) {
  const age = AGE_META[state];
  const AgeIcon = age.Icon;
  return (
    <span className={cn('shrink-0 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap', age.chip)}>
      <AgeIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {state !== 'ok' && <span>{age.word} ·</span>}
      <output className="tnum">{mins} min</output>
    </span>
  );
}

/**
 * The ticket's lines — quantity, name, the note exactly as the waiter typed it, and the line's
 * own state badge, which is also the per-line advance control. Identical on the station card and
 * the manager card, so nothing a station can do is ever lost to the arrangement.
 */
function TicketLines({ t, onItem, busy }: { t: Ticket; onItem: (it: TicketItem, s: OrderItemStatus) => void; busy: boolean }) {
  return (
    <ul className="divide-y divide-neutral-200 flex-1">
      {t.items.map((it) => {
        const cancelled = it.status === 'CANCELLED';
        const advanceable = !cancelled && it.status !== 'SERVED';
        const next: OrderItemStatus = it.status === 'NEW' ? 'PREPARING' : it.status === 'PREPARING' ? 'READY' : 'SERVED';
        return (
          <li key={it.id} className={cn('px-3 py-2.5 sm:px-4 sm:py-3', cancelled && 'bg-neutral-50')}>
            <div className="flex items-start gap-2.5 sm:gap-3">
              <span className={cn('text-base font-semibold sm:text-kds tnum w-8 sm:w-11 shrink-0 text-neutral-900', cancelled && 'line-through text-neutral-400')}>
                ×{it.quantity}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn('text-base leading-snug sm:text-kds sm:leading-tight text-neutral-900 break-words', cancelled && 'line-through text-neutral-400')}>{it.itemName}</p>
                {it.notes && <p className="mt-1 text-sm sm:text-base font-bold text-warning-700 uppercase tracking-wide leading-snug sm:leading-snug break-words">{it.notes}</p>}
                {cancelled && (
                  <p className="text-caption text-danger-700 flex items-center gap-1 mt-1">
                    <XCircle className="h-3 w-3" aria-hidden />Cancelled{it.cancelReason ? ` — ${it.cancelReason}` : ''}
                  </p>
                )}
              </div>
              {advanceable ? (
                /* A 44 px hit area at every width — a wall board is touched as often as a phone. */
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onItem(it, next)}
                  className="shrink-0 -my-1 -mr-1 px-1 min-h-touch min-w-touch inline-flex items-center justify-end rounded-full press disabled:opacity-50"
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
  );
}

/**
 * ONE TICKET — STATION BOARD.
 *
 * A dark card with the column's tone as a left rule, the table name large, the elapsed-minutes
 * chip, the lines, and the state change as one full-width action. Gold "Start preparing" on a
 * NEW ticket, emerald "Mark ready" on a PREPARING one, and a quiet neutral clear once it is
 * READY — the delay palette is never borrowed for an action.
 *
 * MOTION. `anim-enter-soft` plays once, when the ticket arrives in a column. It is keyed on the
 * ticket's id by the board, never on its status or its clock, so the 15-second poll and the
 * one-second timer never replay it; only a ticket that has genuinely changed column fades in.
 *
 * COVERS. The reference prints a cover count on the ticket and `Ticket` carries none: a ticket
 * deliberately holds no pricing and no guest information (`types/order.ts`). None is printed
 * rather than derived, because a cover count is a number the pass would plate against.
 */
function TicketCard({ t, now, onItem, onBulk, busy }: {
  t: Ticket; now: Date; onItem: (it: TicketItem, s: OrderItemStatus) => void; onBulk: (t: Ticket, s: OrderItemStatus) => void; busy: boolean;
}) {
  const mins = elapsedMinutes(t.createdAt, now);
  const state: AgeState = t.status === 'READY' ? 'ready' : delayTone(mins);
  const age = AGE_META[state];
  const accent = COLUMN_ACCENT[t.status];

  const active = t.items.filter((i) => i.status !== 'CANCELLED');
  const canStart = active.some((i) => i.status === 'NEW');
  const canReady = active.some((i) => i.status === 'PREPARING') || (canStart && !active.some((i) => i.status === 'PREPARING'));
  const canServe = active.length > 0 && active.every((i) => i.status === 'READY' || i.status === 'SERVED') && active.some((i) => i.status === 'READY');

  return (
    <article
      aria-label={`${t.tableName}, ticket ${t.ticketNumber}, ${age.word.toLowerCase()}, waiting ${mins} minutes`}
      className={cn('anim-enter-soft rounded-md bg-surface-raised border border-neutral-200 border-l-4 shadow-panel flex flex-col overflow-hidden min-w-0', accent.left)}
    >
      <header className="px-3 py-2.5 sm:px-4 sm:py-3 flex items-start justify-between gap-2 sm:gap-3 border-b border-neutral-200">
        <div className="min-w-0">
          <p className="text-lg sm:text-kds-lg font-bold leading-tight text-neutral-900 truncate">{t.tableName}</p>
          <p className="text-caption text-neutral-500 mt-1 truncate">
            {t.orderNumber} · {t.ticketNumber}{t.batchNo > 1 ? ` · batch ${t.batchNo}` : ''} · {t.waiterName}
          </p>
        </div>
        <ElapsedChip state={state} mins={mins} />
      </header>

      <TicketLines t={t} onItem={onItem} busy={busy} />

      {t.orderNotes && (
        <p className="px-3 sm:px-4 py-2.5 text-sm text-warning-700 border-t border-neutral-200 bg-warning-50 break-words">
          <span className="font-semibold">Order note:</span> {t.orderNotes}
        </p>
      )}

      {/* The state change, full width. A PREPARING ticket with untouched lines keeps its quiet
          "Start rest" above the emerald action, so nothing a station could do is lost. */}
      <footer className="p-3 border-t border-neutral-200 grid grid-cols-1 gap-2">
        {t.status === 'NEW' && (
          <Button size="pos" variant="primary" block leftIcon={<Play className="h-5 w-5" />} loading={busy} onClick={() => onBulk(t, 'PREPARING')}>
            Start preparing
          </Button>
        )}
        {t.status === 'PREPARING' && (
          <>
            {canStart && <Button size="pos" variant="outline" onDark block loading={busy} onClick={() => onBulk(t, 'PREPARING')}>Start rest</Button>}
            <Button size="pos" variant="success" block leftIcon={<Bell className="h-5 w-5" />} loading={busy} disabled={!canReady} onClick={() => onBulk(t, 'READY')}>
              Mark ready
            </Button>
          </>
        )}
        {t.status === 'READY' && (
          <Button size="pos" variant="secondary" onDark block leftIcon={<Check className="h-5 w-5" />} loading={busy} disabled={!canServe} onClick={() => onBulk(t, 'SERVED')}>
            Served · clear
          </Button>
        )}
      </footer>
    </article>
  );
}

/**
 * ONE TICKET — MANAGER WORKSPACE (board 02 panels 09 and 10).
 *
 * The manager board leads a ticket with the ORDER identifier rather than the table, and gives it
 * exactly ONE state-transition action — *Start preparing*, then *Mark ready*, then the clear.
 * The per-line control stays exactly as it is on the station card, so nothing a station can do
 * from this board is lost; only the arrangement changes.
 *
 * CALM, and the rule is load-bearing here. This board re-reads every 15 seconds: no width or
 * transform transition, and no height change when a ticket moves column — the footer carries one
 * action in every state — so a poll never moves a ticket under the hands of whoever is reading it.
 * The one entrance it takes is keyed on the ticket id, so a poll cannot replay it.
 */
function ManagerTicketCard({ t, now, onItem, onBulk, busy }: {
  t: Ticket; now: Date; onItem: (it: TicketItem, s: OrderItemStatus) => void; onBulk: (t: Ticket, s: OrderItemStatus) => void; busy: boolean;
}) {
  const mins = elapsedMinutes(t.createdAt, now);
  const state: AgeState = t.status === 'READY' ? 'ready' : delayTone(mins);
  const age = AGE_META[state];
  const accent = COLUMN_ACCENT[t.status];

  /* The same transition rules as the station card — read once, never re-derived differently. */
  const active = t.items.filter((i) => i.status !== 'CANCELLED');
  const canStart = active.some((i) => i.status === 'NEW');
  const canReady = active.some((i) => i.status === 'PREPARING') || (canStart && !active.some((i) => i.status === 'PREPARING'));
  const canServe = active.length > 0 && active.every((i) => i.status === 'READY' || i.status === 'SERVED') && active.some((i) => i.status === 'READY');

  return (
    <article
      aria-label={`Order ${t.orderNumber}, ${t.tableName}, ${age.word.toLowerCase()}, waiting ${mins} minutes`}
      className={cn('anim-enter-soft rounded-md bg-surface-raised border border-neutral-200 border-l-4 shadow-panel flex flex-col overflow-hidden min-w-0', accent.left)}
    >
      <header className="px-3 py-2.5 sm:px-4 sm:py-3 flex items-start justify-between gap-2 sm:gap-3 border-b border-neutral-200">
        <div className="min-w-0">
          {/* The order identifier is the biggest thing on the ticket, as the board draws it. */}
          <p className="text-lg sm:text-kds-lg font-bold leading-tight text-neutral-900 truncate">{t.orderNumber}</p>
          <p className="text-caption text-neutral-500 mt-1 truncate">
            {t.tableName} · {t.ticketNumber}{t.batchNo > 1 ? ` · batch ${t.batchNo}` : ''} · {t.waiterName}
          </p>
        </div>
        <ElapsedChip state={state} mins={mins} />
      </header>

      <TicketLines t={t} onItem={onItem} busy={busy} />

      {t.orderNotes && (
        <p className="px-3 sm:px-4 py-2.5 text-sm text-warning-700 border-t border-neutral-200 bg-warning-50 break-words">
          <span className="font-semibold">Order note:</span> {t.orderNotes}
        </p>
      )}

      {/* ONE action, whatever the state — so a ticket is exactly as tall in every column. */}
      <footer className="p-3 border-t border-neutral-200">
        {t.status === 'NEW' && (
          <Button size="pos" variant="primary" block leftIcon={<Play className="h-5 w-5" />} loading={busy} onClick={() => onBulk(t, 'PREPARING')}>
            Start preparing
          </Button>
        )}
        {t.status === 'PREPARING' && (
          <Button size="pos" variant="success" block leftIcon={<Bell className="h-5 w-5" />} loading={busy} disabled={!canReady} onClick={() => onBulk(t, 'READY')}>
            Mark ready
          </Button>
        )}
        {t.status === 'READY' && (
          <Button size="pos" variant="secondary" onDark block leftIcon={<Check className="h-5 w-5" />} loading={busy} disabled={!canServe} onClick={() => onBulk(t, 'SERVED')}>
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
  const ws = useWorkspace();
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
  /* The manager board states how many ORDERS are live on this station, which is not the ticket
     count: one order can be split across batches. A count of distinct order ids on the tickets
     already fetched — no extra read, nothing derived beyond a set size. */
  const liveOrders = useMemo(() => new Set(sorted.map((t) => t.orderId)).size, [sorted]);

  return (
    <div className="h-full flex flex-col min-h-0">
      {ws === 'manager' && q.data && (
        <p className="shrink-0 mb-2 text-sm text-neutral-600">
          <span className="tnum font-semibold text-neutral-900">{liveOrders}</span> live order{liveOrders === 1 ? '' : 's'} on the {location === 'BAR' ? 'bar' : 'kitchen'} pass
          {' · '}<span className="tnum">{sorted.length}</span> open ticket{sorted.length === 1 ? '' : 's'}
        </p>
      )}
      {/* Counted state chips, each wearing its column's tone on the icon so the row reads the
          same as the board below it. They scroll sideways on a phone rather than wrapping into
          three ragged rows. This board is fed by ONE station, so there is no kitchen/bar facet
          here — the station is the screen. */}
      <div className="shrink-0 mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 sm:flex-wrap">
        <div className="flex gap-2 overflow-x-auto no-scrollbar sm:flex-wrap sm:overflow-visible">
          {grouped.map((g) => (
            <span key={g.status} className="shrink-0 inline-flex items-center gap-2 rounded-full bg-surface-raised border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700">
              <g.icon className={cn('h-4 w-4', COLUMN_ACCENT[g.status].text)} aria-hidden />
              {g.title}
              <span className="rounded-full bg-neutral-200 text-neutral-900 text-xs px-2 py-0.5 tnum font-semibold">{g.tickets.length}</span>
            </span>
          ))}
          {late > 0 && (
            <span className="shrink-0 inline-flex items-center gap-2 rounded-full bg-danger-50 border border-danger-200 text-danger-700 px-3 py-1.5 text-sm font-semibold">
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
            <span className="mx-auto h-14 w-14 rounded-full bg-surface-raised ring-1 ring-inset ring-neutral-200 text-neutral-500 flex items-center justify-center mb-4" aria-hidden>
              <Bell className="h-7 w-7" />
            </span>
            <h2 className="text-xl font-semibold text-neutral-900">No active tickets</h2>
            <p className="text-sm text-neutral-500 mt-1.5">New orders appear here automatically.</p>
          </div>
        </div>
      ) : useColumns ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0">
          {grouped.map((g) => {
            const accent = COLUMN_ACCENT[g.status];
            return (
              <section key={g.status} aria-label={g.title} className="min-h-0 min-w-0 flex flex-col">
                {/* The column head: a 3 px rule in the column's tone, the label, and a counted badge.
                    The manager board keeps its tinted-fill head in the same tone; the stations get
                    the quieter rule so the tickets stay the brightest thing on the wall. */}
                {ws === 'manager' ? (
                  <h2 className={cn('mb-2.5 shrink-0 flex items-center gap-2 rounded-md border px-3 py-2 text-label uppercase', accent.tint)}>
                    <g.icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="truncate">{g.title}</span>
                    <span className="ml-auto rounded-full bg-surface-raised px-2 py-0.5 tnum text-sm font-semibold">{g.tickets.length}</span>
                  </h2>
                ) : (
                  <h2 className={cn('mb-2.5 shrink-0 flex items-center gap-2 rounded-md border border-neutral-200 border-t-[3px] bg-surface-raised px-3 py-2 text-label uppercase text-neutral-900', accent.top)}>
                    <g.icon className={cn('h-4 w-4 shrink-0', accent.text)} aria-hidden />
                    <span className="truncate">{g.title}</span>
                    <span className={cn('ml-auto rounded-full border px-2 py-0.5 tnum text-xs font-semibold', accent.badge)}>{g.tickets.length}</span>
                  </h2>
                )}
                <div className="flex-1 overflow-y-auto overscroll-contain space-y-3 pr-1">
                  {g.tickets.length === 0 ? (
                    <p className="text-caption text-neutral-500 py-8 text-center border border-dashed border-neutral-200 rounded-md">Empty</p>
                  ) : g.tickets.map((t) => (ws === 'manager'
                    ? <ManagerTicketCard key={t.id} t={t} now={now} onItem={onItem} onBulk={onBulk} busy={busyTicket === t.id} />
                    : <TicketCard key={t.id} t={t} now={now} onItem={onItem} onBulk={onBulk} busy={busyTicket === t.id} />))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col">
          <p className="sm:hidden shrink-0 mb-2 text-caption text-neutral-500">
            Prep queue · longest waiting first{queueFilter !== 'ALL' ? ' · filtered' : ''}
          </p>
          {/* `.safe-bottom` keeps the last ticket's action clear of the home indicator. */}
          <div className="flex-1 overflow-y-auto overscroll-contain safe-bottom">
            {queue.length === 0 ? (
              <p className="text-caption text-neutral-500 py-10 text-center border border-dashed border-neutral-200 rounded-md">
                No tickets in this state.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                {queue.map((t) => (ws === 'manager'
                  ? <ManagerTicketCard key={t.id} t={t} now={now} onItem={onItem} onBulk={onBulk} busy={busyTicket === t.id} />
                  : <TicketCard key={t.id} t={t} now={now} onItem={onItem} onBulk={onBulk} busy={busyTicket === t.id} />))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
