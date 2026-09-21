import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Receipt, Clock, CheckCircle2, ChevronRight, Search, AlertTriangle, Wallet, Users } from 'lucide-react';
import { useOrders } from '@/features/orders/hooks';
import { useBills } from '@/features/billing/hooks';
import { useNow, useDebounce } from '@/hooks/useRealtime';
import { useWorkspace } from '@/hooks/useSurface';
import { Card, Button, Badge, StatusBadge, LoadingState, ErrorState, EmptyState, SearchInput, Alert } from '@/components/ui';
import { EmptySearch } from '@/components/graphics';
import { DashboardHero } from '@/components/layout/DashboardHero';
import { staggerDelay } from '@/components/motion';
import { money } from '@/utils/money';
import { elapsedMinutes, fmtTime } from '@/utils/date';
import { DELAY_THRESHOLDS } from '@/config/statuses';
import { cn } from '@/utils/cn';
import type { Bill, Order } from '@/types';

/**
 * Cashier home answers one question: **who is waiting to pay?**
 *
 * The page leads with a single queue that merges the two ways a guest ends up waiting —
 * a table that has asked for its bill, and a finalized bill that still has a balance —
 * ordered longest-waiting first. Takings so far are context at the foot of the page,
 * not the headline.
 *
 * MOTION. The three PANELS rise once, in sequence, and nothing else on the screen moves:
 *
 *   • Queue rows never animate. They re-render on the 20-second order poll and the 30-second bill
 *     poll, they carry the money a cashier is about to collect, and a figure that is still
 *     arriving cannot be checked against a guest's card machine.
 *   • The search results card is deliberately static. It mounts and unmounts as the cashier types,
 *     so an entrance on it would replay on every keystroke.
 *   • The overdue banner is deliberately static. It appears the moment a guest crosses the late
 *     threshold; an animated escalation reads as an alarm, and this one is a sentence to be read.
 *   • No entrance gates a tap. "Take payment", "Generate bill" and every queue row are live on
 *     first paint — the animation is on the panel behind them and never on the control.
 */

type WaitKind = 'REQUEST' | 'BALANCE';

/** The `--d` beat of a staged reveal — a function of position, never of the queue's contents. */
const beat = (i: number) => ({ '--d': `${staggerDelay(i)}ms` }) as CSSProperties;

interface WaitingRow {
  key: string;
  kind: WaitKind;
  tableName: string;
  reference: string;
  /** immutable timestamp the wait is measured from — also the sort key, so rows never reshuffle on a tick */
  since: string;
  amount: number;
  amountLabel: string;
  detail: string;
  to: string;
  action: string;
  badge: ReactNode;
}

/** Ageing severity shared by the queue rows and the escalation banner. */
function ageTone(mins: number): 'neutral' | 'warning' | 'danger' {
  if (mins >= DELAY_THRESHOLDS.late) return 'danger';
  if (mins >= DELAY_THRESHOLDS.warn) return 'warning';
  return 'neutral';
}

function WaitFor({ mins }: { mins: number }) {
  const tone = ageTone(mins);
  return (
    <span
      className={cn(
        /* Same construction as the shared Badge: `-50` fill, `-200` hairline, `-700` label. */
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium tnum whitespace-nowrap',
        tone === 'danger' ? 'bg-danger-50 text-danger-700 border-danger-200'
          : tone === 'warning' ? 'bg-warning-50 text-warning-700 border-warning-200'
            : 'bg-neutral-100 text-neutral-700 border-neutral-300',
      )}
    >
      {tone === 'danger' ? <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden /> : <Clock className="h-3 w-3 shrink-0" aria-hidden />}
      {tone === 'danger' ? 'Waiting ' : ''}{mins} min
    </span>
  );
}

export default function CashierHomePage() {
  const navigate = useNavigate();
  const ws = useWorkspace();
  const now = useNow(15_000);
  const [search, setSearch] = useState('');
  const dq = useDebounce(search, 200).toLowerCase();
  const orders = useOrders({ active: true }, { refetchInterval: 20_000 });
  const bills = useBills({}, { refetchInterval: 30_000 });

  const allOrders = useMemo(() => orders.data ?? [], [orders.data]);
  const allBills = useMemo(() => bills.data ?? [], [bills.data]);

  const requests = useMemo(() => allOrders.filter((o) => o.status === 'BILL_REQUESTED'), [allOrders]);
  const unpaid = useMemo(() => allBills.filter((b) => ['OPEN', 'FINALIZED'].includes(b.status) && b.paymentStatus !== 'PAID'), [allBills]);
  const notRequested = useMemo(
    () => allOrders.filter((o) => !['DRAFT', 'BILL_REQUESTED', 'BILLED', 'PAID'].includes(o.status)),
    [allOrders],
  );
  const paidToday = useMemo(
    () => allBills.filter((b) => b.paymentStatus === 'PAID' && b.paidAt && new Date(b.paidAt).toDateString() === now.toDateString()),
    [allBills, now],
  );

  /**
   * The settlement queue. A bill row wins over the order that produced it, so a table
   * never appears twice; the remaining bill-request rows are tables with no bill yet.
   */
  const queue = useMemo<WaitingRow[]>(() => {
    const billRow = (b: Bill): WaitingRow => ({
      key: `b${b.id}`,
      kind: 'BALANCE',
      tableName: b.tableName,
      reference: b.billNumber,
      since: b.finalizedAt ?? b.createdAt,
      amount: b.balanceDue,
      amountLabel: b.paymentStatus === 'PARTIALLY_PAID' ? 'Balance due' : 'Total due',
      detail: `${b.orderNumber} · ${b.waiterName}${b.paymentStatus === 'PARTIALLY_PAID' ? ` · ${money(b.paidAmount)} already taken` : ''}`,
      to: b.status === 'OPEN' ? `/cashier/bills/${b.id}` : `/cashier/bills/${b.id}/pay`,
      action: b.status === 'OPEN' ? 'Open bill' : 'Take payment',
      badge: (
        <span className="flex flex-wrap gap-1">
          <StatusBadge kind="bill" status={b.status} size="sm" />
          <StatusBadge kind="payment" status={b.paymentStatus} size="sm" hideIcon />
        </span>
      ),
    });
    const orderRow = (o: Order): WaitingRow => ({
      key: `o${o.id}`,
      kind: 'REQUEST',
      tableName: o.tableName,
      reference: o.orderNumber,
      since: o.billRequestedAt ?? o.createdAt,
      amount: o.subtotal,
      amountLabel: 'Running total, before tax',
      detail: `${o.itemCount} items · ${o.waiterName}`,
      to: o.billId ? `/cashier/bills/${o.billId}` : `/cashier/orders/${o.id}/bill`,
      action: o.billId ? 'Open bill' : 'Generate bill',
      badge: <StatusBadge kind="order" status={o.status} size="sm" />,
    });

    const billIds = new Set(unpaid.map((b) => b.id));
    const rows = [
      ...unpaid.map(billRow),
      ...requests.filter((o) => !(o.billId && billIds.has(o.billId))).map(orderRow),
    ];
    // Oldest first. Sorting on the fixed timestamp (never on the live minute count)
    // means a refresh cannot reshuffle the queue under the cashier's finger.
    return rows.sort((a, b) => a.since.localeCompare(b.since) || a.key.localeCompare(b.key));
  }, [unpaid, requests]);

  const outstanding = useMemo(() => unpaid.reduce((a, b) => a + b.balanceDue, 0), [unpaid]);
  const takings = useMemo(() => paidToday.reduce((a, b) => a + b.grandTotal, 0), [paidToday]);
  /* The manager board prints an average beside the total. It is the mean of the SAME real bills
     listed below it — takings divided by how many were settled — and it is simply absent while
     nothing has been settled, rather than printed as zero. */
  const averageBill = paidToday.length ? takings / paidToday.length : null;
  const oldest = queue.length ? elapsedMinutes(queue[0].since, now) : 0;
  const overdue = queue.filter((r) => elapsedMinutes(r.since, now) >= DELAY_THRESHOLDS.late);

  const hits = dq
    ? [
      ...allOrders
        .filter((o) => o.orderNumber.toLowerCase().includes(dq) || o.tableName.toLowerCase().includes(dq))
        .map((o) => ({ key: `o${o.id}`, label: `${o.tableName} · ${o.orderNumber}`, sub: o.status, amount: o.subtotal, to: o.billId ? `/cashier/bills/${o.billId}` : `/cashier/orders/${o.id}/bill` })),
      ...allBills
        .filter((b) => b.billNumber.toLowerCase().includes(dq) || b.orderNumber.toLowerCase().includes(dq) || b.tableName.toLowerCase().includes(dq))
        .map((b) => ({ key: `b${b.id}`, label: `${b.tableName} · ${b.billNumber}`, sub: `${b.status} · ${b.paymentStatus}`, amount: b.grandTotal, to: `/cashier/bills/${b.id}` })),
    ]
    : [];

  const loading = orders.isLoading || bills.isLoading;
  const failed = orders.isError || bills.isError;
  const retry = () => { void orders.refetch(); void bills.refetch(); };

  return (
    <div className="max-w-6xl mx-auto">
      {/*
        Compact hero — the shared band at the scale a live queue can afford. The subtitle here is
        LIVE state, not a description, so it stays beside the title rather than being demoted, and
        the search keeps its place directly under it.
      */}
      <DashboardHero
        compact
        title="Waiting to pay"
        subtitle={loading ? 'Loading the settlement queue…' : queue.length ? `${queue.length} table${queue.length === 1 ? '' : 's'} to settle · longest waiting ${oldest} min` : 'Nothing is waiting to be settled'}
      >
        <SearchInput value={search} onChange={setSearch} placeholder="Search table, order # or bill #" className="sm:max-w-md" />
      </DashboardHero>

      {!failed && dq && (
        <Card padded={false} className="mb-4">
          <div className="px-4 py-2 border-b border-neutral-200 text-label text-neutral-500 uppercase flex items-center gap-1">
            <Search className="h-3.5 w-3.5" aria-hidden />Results for “{search.trim()}”
          </div>
          {hits.length === 0 ? (
            <EmptyState compact icon={<EmptySearch />} title="No matches" description="Search by table name, order number or bill number." action={<Button variant="outline" onClick={() => setSearch('')}>Clear search</Button>} />
          ) : (
            <ul className="divide-y divide-neutral-200">
              {hits.slice(0, 10).map((h) => (
                <li key={h.key}>
                  <button type="button" onClick={() => navigate(h.to)} className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors duration-control hover:bg-neutral-100 min-h-touch">
                    <span className="flex-1 min-w-0">
                      <span className="block font-medium truncate text-neutral-900">{h.label}</span>
                      <span className="text-caption text-neutral-500">{h.sub}</span>
                    </span>
                    <span className="tnum font-medium text-neutral-900 shrink-0">{money(h.amount)}</span>
                    <ChevronRight className="h-4 w-4 text-neutral-400 shrink-0" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {failed && <ErrorState error={orders.error ?? bills.error} onRetry={retry} />}

      {!failed && overdue.length > 0 && (
        <Alert
          tone="danger"
          className="mb-4"
          title={`${overdue.length} ${overdue.length === 1 ? 'guest has' : 'guests have'} been waiting over ${DELAY_THRESHOLDS.late} minutes`}
        >
          {overdue.slice(0, 4).map((r) => `${r.tableName} (${elapsedMinutes(r.since, now)} min)`).join(', ')}
          {overdue.length > 4 ? ` and ${overdue.length - 4} more` : ''}. Settle these first.
        </Alert>
      )}

      {/*
        THE MANAGER BOARD (panel 11). The same two reads, the same queue and the same oldest-first
        ordering, arranged the way the manager board draws billing: what is still owed down the
        left, what has actually been taken down the right. Every figure below is one the cashier's
        own composition already computes — this is a different arrangement of the same numbers,
        never a different set of them, and the cashier's screen further down is untouched.
      */}
      {!failed && ws === 'manager' && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] xl:items-start">
          <div className="min-w-0 space-y-4">
            <Card padded={false} className="anim-reveal" style={beat(0)}>
              <div className="px-4 py-3 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-subheading flex items-center gap-2">
                  <Wallet className="h-5 w-5 text-primary-700" aria-hidden />Settlement queue
                </h2>
                <span className="flex flex-wrap items-center gap-2 text-caption text-neutral-600">
                  <Badge tone={queue.length ? 'primary' : 'neutral'} size="sm">{queue.length} waiting</Badge>
                  {unpaid.length > 0 && <span className="tnum">{money(outstanding)} outstanding</span>}
                </span>
              </div>

              {loading ? (
                <div className="p-4"><LoadingState rows={4} /></div>
              ) : queue.length === 0 ? (
                <EmptyState
                  compact
                  icon={<CheckCircle2 className="h-6 w-6" />}
                  title="Nobody is waiting to pay"
                  description="Tables that ask for their bill, and finalized bills with a balance, arrive here the moment they do."
                />
              ) : (
                <ul className="divide-y divide-neutral-200">
                  {/* Longest waiting first — the order the queue is built in, taken from each
                      row's fixed timestamp, so a 20-second poll never reshuffles it. */}
                  {queue.map((r) => {
                    const mins = elapsedMinutes(r.since, now);
                    const tone = ageTone(mins);
                    return (
                      <li
                        key={r.key}
                        className={cn(
                          'relative px-4 py-3 pl-5',
                          tone === 'danger' && 'bg-danger-50/60',
                          tone === 'warning' && 'bg-warning-50/60',
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            'absolute inset-y-0 left-0 w-1',
                            tone === 'danger' ? 'bg-danger-500' : tone === 'warning' ? 'bg-warning-500' : 'bg-transparent',
                          )}
                        />
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-neutral-900 truncate">{r.tableName}</span>
                              <WaitFor mins={mins} />
                              {r.badge}
                            </span>
                            <span className="block text-caption text-neutral-500 mt-0.5 truncate">
                              {r.reference} · {r.kind === 'REQUEST' ? 'bill requested' : 'finalized'} {fmtTime(r.since)} · {r.detail}
                            </span>
                          </span>
                          <span className="text-right shrink-0">
                            <span className="block text-lg font-semibold tnum text-neutral-900 leading-tight">{money(r.amount)}</span>
                            <span className="block text-caption text-neutral-500">{r.amountLabel}</span>
                          </span>
                          <Button
                            variant={r.kind === 'BALANCE' ? 'success' : 'primary'}
                            className="shrink-0 min-h-touch"
                            onClick={() => navigate(r.to)}
                          >
                            {r.action}
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <Card padded={false} className="anim-reveal" style={beat(1)}>
              <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between gap-2">
                <h2 className="text-subheading flex items-center gap-2"><Users className="h-4 w-4 text-neutral-500" aria-hidden />Still dining</h2>
                <span className="text-caption text-neutral-500">{notRequested.length} open order{notRequested.length === 1 ? '' : 's'}</span>
              </div>
              {loading ? (
                <div className="p-4"><LoadingState rows={2} /></div>
              ) : notRequested.length === 0 ? (
                <EmptyState compact title="No other open orders" description="Every active order has already reached billing." />
              ) : (
                <ul className="divide-y divide-neutral-200">
                  {notRequested.slice(0, 6).map((o) => (
                    <li key={o.id} className="px-4 py-2.5 flex items-center gap-3">
                      <span className="font-semibold w-20 shrink-0 truncate text-neutral-900">{o.tableName}</span>
                      <span className="flex-1 min-w-0">
                        <StatusBadge kind="order" status={o.status} size="sm" />
                        <span className="block text-caption text-neutral-500 mt-0.5 truncate">{o.orderNumber} · {o.itemCount} items</span>
                      </span>
                      <span className="font-medium tnum text-neutral-900 shrink-0">{money(o.subtotal)}</span>
                      <Button
                        size="sm" variant="outline" className="min-h-touch shrink-0"
                        aria-label={`Generate the bill for ${o.tableName}`}
                        onClick={() => navigate(`/cashier/orders/${o.id}/bill`)}
                      >
                        Bill
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              {notRequested.length > 6 && (
                <div className="px-4 py-2.5 border-t border-neutral-200">
                  <Button variant="ghost" size="sm" className="min-h-touch" rightIcon={<ChevronRight className="h-4 w-4" />} onClick={() => navigate('/cashier/tables')}>
                    {notRequested.length - 6} more on the table map
                  </Button>
                </div>
              )}
            </Card>
          </div>

          <Card padded={false} className="min-w-0 anim-reveal" style={beat(2)}>
            <div className="px-4 py-3 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-subheading flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-success-500" aria-hidden />Settled today</h2>
              <Button size="sm" variant="ghost" className="min-h-touch" rightIcon={<ChevronRight className="h-4 w-4" />} onClick={() => navigate('/cashier/paid')}>
                View all settled bills
              </Button>
            </div>

            {/* Money genuinely taken and reconciled. It does not roll: `CountUp` is barred from
                anything anyone has to agree with a receipt. */}
            <div className="px-4 py-3 border-b border-neutral-200 fill-success">
              <p className="text-metric text-neutral-900 tnum leading-none">{money(takings)}</p>
              <p className="text-caption text-neutral-500 mt-1.5">taken so far today</p>
            </div>

            <dl className="grid grid-cols-2 divide-x divide-neutral-200 border-b border-neutral-200">
              <div className="px-4 py-2.5 min-w-0">
                <dt className="text-label text-neutral-500">Bills</dt>
                <dd className="text-lg font-semibold tnum text-neutral-900 leading-tight">{paidToday.length}</dd>
              </div>
              <div className="px-4 py-2.5 min-w-0">
                <dt className="text-label text-neutral-500">Average bill</dt>
                <dd className="text-lg font-semibold tnum text-neutral-900 leading-tight">
                  {averageBill == null ? <span className="text-caption font-normal text-neutral-500 tracking-normal">Nothing settled yet</span> : money(averageBill)}
                </dd>
              </div>
            </dl>

            {loading ? (
              <div className="p-4"><LoadingState rows={2} /></div>
            ) : paidToday.length === 0 ? (
              <EmptyState compact icon={<Receipt className="h-6 w-6" />} title="No payments yet today" description="Completed payments are listed here with their tender and time." />
            ) : (
              <ul className="divide-y divide-neutral-200">
                {paidToday.slice(0, 6).map((b) => (
                  <li key={b.id}>
                    <button type="button" onClick={() => navigate(`/cashier/bills/${b.id}/receipt`)} className="w-full px-4 py-2.5 flex items-center gap-3 text-left transition-colors duration-control hover:bg-neutral-100 min-h-touch">
                      <span className="font-semibold w-16 shrink-0 truncate text-neutral-900">{b.tableName}</span>
                      <span className="flex-1 min-w-0 text-caption text-neutral-500 truncate">
                        {b.billNumber} · {fmtTime(b.paidAt)}
                        {b.payments.filter((p) => p.status === 'SUCCESS').length > 0 && ` · ${[...new Set(b.payments.filter((p) => p.status === 'SUCCESS').map((p) => p.method))].join(' + ')}`}
                      </span>
                      <span className="font-semibold tnum text-neutral-900 shrink-0">{money(b.grandTotal)}</span>
                      <ChevronRight className="h-4 w-4 text-neutral-400 shrink-0" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {/* ---------------------------------------------------------------- the queue */}
      {!failed && ws !== 'manager' && (
      <Card padded={false} className="mb-5 anim-reveal" style={beat(0)}>
        <div className="px-4 py-3 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-subheading flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary-700" aria-hidden />Settlement queue
          </h2>
          <span className="flex flex-wrap items-center gap-2 text-caption text-neutral-600">
            <Badge tone={queue.length ? 'primary' : 'neutral'} size="sm">{queue.length} waiting</Badge>
            {unpaid.length > 0 && <span className="tnum">{money(outstanding)} outstanding on {unpaid.length} bill{unpaid.length === 1 ? '' : 's'}</span>}
          </span>
        </div>

        {loading ? (
          <div className="p-4"><LoadingState rows={4} /></div>
        ) : queue.length === 0 ? (
          <EmptyState
            compact
            icon={<CheckCircle2 className="h-6 w-6" />}
            title="Nobody is waiting to pay"
            description="Tables that ask for their bill, and finalized bills with a balance, appear here the moment they arrive."
            action={<Button variant="outline" onClick={() => navigate('/cashier/tables')}>Open the table map</Button>}
          />
        ) : (
          <ul className="divide-y divide-neutral-200">
            {queue.map((r) => {
              const mins = elapsedMinutes(r.since, now);
              const tone = ageTone(mins);
              return (
                <li
                  key={r.key}
                  className={cn(
                    'relative px-4 py-3.5 sm:pl-5',
                    tone === 'danger' && 'bg-danger-50/60',
                    tone === 'warning' && 'bg-warning-50/60',
                  )}
                >
                  {/* Priority edge: the fastest signal when the queue is long. */}
                  <span
                    aria-hidden
                    className={cn(
                      'absolute inset-y-0 left-0 w-1',
                      tone === 'danger' ? 'bg-danger-500' : tone === 'warning' ? 'bg-warning-500' : 'bg-transparent',
                    )}
                  />
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-lg font-bold text-neutral-900 truncate">{r.tableName}</span>
                        <WaitFor mins={mins} />
                        {r.badge}
                      </div>
                      <p className="text-caption text-neutral-500 mt-1 truncate">
                        {r.reference} · {r.kind === 'REQUEST' ? 'bill requested' : 'finalized'} {fmtTime(r.since)} · {r.detail}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <span className="min-w-0">
                        {/* The figure the cashier is about to collect: the heaviest type on the
                            row, never a gold fill — gold belongs to the action beside it. */}
                        <span className="block text-metric tnum text-neutral-900 leading-tight">{money(r.amount)}</span>
                        <span className="block text-caption text-neutral-500">{r.amountLabel}</span>
                      </span>
                      <Button
                        size="pos"
                        variant={r.kind === 'BALANCE' ? 'success' : 'primary'}
                        className="shrink-0"
                        onClick={() => navigate(r.to)}
                      >
                        {r.action}
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      )}

      {/* ------------------------------------------------- context, deliberately below */}
      {!failed && ws !== 'manager' && (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card padded={false} className="anim-reveal" style={beat(1)}>
          <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between gap-2">
            <h2 className="text-subheading flex items-center gap-2"><Users className="h-4 w-4 text-neutral-500" aria-hidden />Still dining</h2>
            <span className="text-caption text-neutral-500">{notRequested.length} open order{notRequested.length === 1 ? '' : 's'}</span>
          </div>
          {loading ? (
            <div className="p-4"><LoadingState rows={2} /></div>
          ) : notRequested.length === 0 ? (
            <EmptyState compact title="No other open orders" description="Every active order has already reached billing." />
          ) : (
            <ul className="divide-y divide-neutral-200">
              {notRequested.slice(0, 6).map((o) => (
                <li key={o.id} className="px-4 py-3 flex items-center gap-3">
                  <span className="font-semibold w-20 shrink-0 truncate text-neutral-900">{o.tableName}</span>
                  <span className="flex-1 min-w-0">
                    <StatusBadge kind="order" status={o.status} size="sm" />
                    <span className="block text-caption text-neutral-500 mt-0.5 truncate">{o.orderNumber} · {o.itemCount} items</span>
                  </span>
                  <span className="font-medium tnum text-neutral-900 shrink-0">{money(o.subtotal)}</span>
                  <Button size="sm" variant="outline" className="min-h-touch shrink-0" onClick={() => navigate(`/cashier/orders/${o.id}/bill`)}>Bill</Button>
                </li>
              ))}
            </ul>
          )}
          {notRequested.length > 6 && (
            <div className="px-4 py-2.5 border-t border-neutral-200">
              <Button variant="ghost" size="sm" className="min-h-touch" rightIcon={<ChevronRight className="h-4 w-4" />} onClick={() => navigate('/cashier/tables')}>
                {notRequested.length - 6} more on the table map
              </Button>
            </div>
          )}
        </Card>

        <Card padded={false} className="anim-reveal" style={beat(2)}>
          <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between gap-2">
            <h2 className="text-subheading flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-success-500" aria-hidden />Settled today</h2>
            <Button size="sm" variant="ghost" className="min-h-touch" onClick={() => navigate('/cashier/paid')}>All paid bills</Button>
          </div>
          {/* Money genuinely taken and reconciled — the one positive summary on the screen, so it
              takes the success wash. It does NOT roll: `CountUp` is barred from anything a cashier
              has to reconcile, and today's takings is exactly that. */}
          <div className="px-4 py-3 border-b border-neutral-200 flex items-baseline justify-between gap-3 fill-success">
            <span className="text-metric text-neutral-900 tnum">{money(takings)}</span>
            <span className="text-caption text-neutral-500">{paidToday.length} bill{paidToday.length === 1 ? '' : 's'} paid today</span>
          </div>
          {loading ? (
            <div className="p-4"><LoadingState rows={2} /></div>
          ) : paidToday.length === 0 ? (
            <EmptyState compact icon={<Receipt className="h-6 w-6" />} title="No payments yet today" description="Completed payments are listed here with their tender and time." />
          ) : (
            <ul className="divide-y divide-neutral-200">
              {paidToday.slice(0, 6).map((b) => (
                <li key={b.id}>
                  <button type="button" onClick={() => navigate(`/cashier/bills/${b.id}/receipt`)} className="w-full px-4 py-3 flex items-center gap-3 text-left transition-colors duration-control hover:bg-neutral-100 min-h-touch">
                    <span className="font-semibold w-20 shrink-0 truncate text-neutral-900">{b.tableName}</span>
                    <span className="flex-1 min-w-0 text-caption text-neutral-500 truncate">
                      {b.billNumber} · {fmtTime(b.paidAt)}
                      {b.payments.filter((p) => p.status === 'SUCCESS').length > 0 && ` · ${[...new Set(b.payments.filter((p) => p.status === 'SUCCESS').map((p) => p.method))].join(' + ')}`}
                    </span>
                    <span className="font-semibold tnum text-neutral-900 shrink-0">{money(b.grandTotal)}</span>
                    <ChevronRight className="h-4 w-4 text-neutral-400 shrink-0" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      )}
    </div>
  );
}
