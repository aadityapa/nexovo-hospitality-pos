import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Receipt, Clock, CheckCircle2, ChevronRight, Search, AlertTriangle, Wallet, Users } from 'lucide-react';
import { useOrders } from '@/features/orders/hooks';
import { useBills } from '@/features/billing/hooks';
import { useNow, useDebounce } from '@/hooks/useRealtime';
import { PageHeader, Card, Button, Badge, StatusBadge, LoadingState, ErrorState, EmptyState, SearchInput, Alert } from '@/components/ui';
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
 */

type WaitKind = 'REQUEST' | 'BALANCE';

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
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums whitespace-nowrap',
        tone === 'danger' ? 'bg-danger-50 text-danger-700 border-danger-100'
          : tone === 'warning' ? 'bg-warning-50 text-warning-700 border-warning-100'
            : 'bg-neutral-100 text-neutral-700 border-neutral-200',
      )}
    >
      {tone === 'danger' ? <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden /> : <Clock className="h-3 w-3 shrink-0" aria-hidden />}
      {tone === 'danger' ? 'Waiting ' : ''}{mins} min
    </span>
  );
}

export default function CashierHomePage() {
  const navigate = useNavigate();
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
      <PageHeader
        title="Waiting to pay"
        subtitle={loading ? 'Loading the settlement queue…' : queue.length ? `${queue.length} table${queue.length === 1 ? '' : 's'} to settle · longest waiting ${oldest} min` : 'Nothing is waiting to be settled'}
      >
        <SearchInput value={search} onChange={setSearch} placeholder="Search table, order # or bill #" className="sm:max-w-md" />
      </PageHeader>

      {!failed && dq && (
        <Card padded={false} className="mb-4">
          <div className="px-4 py-2 border-b border-neutral-100 text-label text-neutral-500 uppercase flex items-center gap-1">
            <Search className="h-3.5 w-3.5" aria-hidden />Results for “{search.trim()}”
          </div>
          {hits.length === 0 ? (
            <EmptyState compact title="No matches" description="Search by table name, order number or bill number." action={<Button variant="outline" onClick={() => setSearch('')}>Clear search</Button>} />
          ) : (
            <ul className="divide-y divide-neutral-100">
              {hits.slice(0, 10).map((h) => (
                <li key={h.key}>
                  <button type="button" onClick={() => navigate(h.to)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-neutral-50 min-h-touch">
                    <span className="flex-1 min-w-0">
                      <span className="block font-medium truncate">{h.label}</span>
                      <span className="text-caption text-neutral-500">{h.sub}</span>
                    </span>
                    <span className="tabular-nums font-medium shrink-0">{money(h.amount)}</span>
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

      {/* ---------------------------------------------------------------- the queue */}
      {!failed && (
      <Card padded={false} className="mb-5">
        <div className="px-4 py-3 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-subheading flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary-700" aria-hidden />Settlement queue
          </h2>
          <span className="flex flex-wrap items-center gap-2 text-caption text-neutral-600">
            <Badge tone={queue.length ? 'primary' : 'neutral'} size="sm">{queue.length} waiting</Badge>
            {unpaid.length > 0 && <span className="tabular-nums">{money(outstanding)} outstanding on {unpaid.length} bill{unpaid.length === 1 ? '' : 's'}</span>}
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
          <ul className="divide-y divide-neutral-100">
            {queue.map((r) => {
              const mins = elapsedMinutes(r.since, now);
              const tone = ageTone(mins);
              return (
                <li
                  key={r.key}
                  className={cn(
                    'relative px-4 py-3.5 sm:pl-5',
                    tone === 'danger' && 'bg-danger-50/40',
                    tone === 'warning' && 'bg-warning-50/40',
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
                        <span className="block text-xl font-semibold tabular-nums text-neutral-900 leading-tight">{money(r.amount)}</span>
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
      {!failed && (
      <div className="grid gap-4 lg:grid-cols-2">
        <Card padded={false}>
          <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between gap-2">
            <h2 className="text-subheading flex items-center gap-2"><Users className="h-4 w-4 text-neutral-500" aria-hidden />Still dining</h2>
            <span className="text-caption text-neutral-500">{notRequested.length} open order{notRequested.length === 1 ? '' : 's'}</span>
          </div>
          {loading ? (
            <div className="p-4"><LoadingState rows={2} /></div>
          ) : notRequested.length === 0 ? (
            <EmptyState compact title="No other open orders" description="Every active order has already reached billing." />
          ) : (
            <ul className="divide-y divide-neutral-100">
              {notRequested.slice(0, 6).map((o) => (
                <li key={o.id} className="px-4 py-3 flex items-center gap-3">
                  <span className="font-semibold w-20 shrink-0 truncate">{o.tableName}</span>
                  <span className="flex-1 min-w-0">
                    <StatusBadge kind="order" status={o.status} size="sm" />
                    <span className="block text-caption text-neutral-500 mt-0.5 truncate">{o.orderNumber} · {o.itemCount} items</span>
                  </span>
                  <span className="font-medium tabular-nums shrink-0">{money(o.subtotal)}</span>
                  <Button size="sm" variant="outline" className="min-h-touch shrink-0" onClick={() => navigate(`/cashier/orders/${o.id}/bill`)}>Bill</Button>
                </li>
              ))}
            </ul>
          )}
          {notRequested.length > 6 && (
            <div className="px-4 py-2.5 border-t border-neutral-100">
              <Button variant="ghost" size="sm" className="min-h-touch" rightIcon={<ChevronRight className="h-4 w-4" />} onClick={() => navigate('/cashier/tables')}>
                {notRequested.length - 6} more on the table map
              </Button>
            </div>
          )}
        </Card>

        <Card padded={false}>
          <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between gap-2">
            <h2 className="text-subheading flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-success-600" aria-hidden />Settled today</h2>
            <Button size="sm" variant="ghost" className="min-h-touch" onClick={() => navigate('/cashier/paid')}>All paid bills</Button>
          </div>
          <div className="px-4 py-3 border-b border-neutral-100 flex items-baseline justify-between gap-3">
            <span className="text-metric text-neutral-900 tabular-nums">{money(takings)}</span>
            <span className="text-caption text-neutral-500">{paidToday.length} bill{paidToday.length === 1 ? '' : 's'} paid today</span>
          </div>
          {loading ? (
            <div className="p-4"><LoadingState rows={2} /></div>
          ) : paidToday.length === 0 ? (
            <EmptyState compact icon={<Receipt className="h-6 w-6" />} title="No payments yet today" description="Completed payments are listed here with their tender and time." />
          ) : (
            <ul className="divide-y divide-neutral-100">
              {paidToday.slice(0, 6).map((b) => (
                <li key={b.id}>
                  <button type="button" onClick={() => navigate(`/cashier/bills/${b.id}/receipt`)} className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-neutral-50 min-h-touch">
                    <span className="font-semibold w-20 shrink-0 truncate">{b.tableName}</span>
                    <span className="flex-1 min-w-0 text-caption text-neutral-500 truncate">
                      {b.billNumber} · {fmtTime(b.paidAt)}
                      {b.payments.filter((p) => p.status === 'SUCCESS').length > 0 && ` · ${[...new Set(b.payments.filter((p) => p.status === 'SUCCESS').map((p) => p.method))].join(' + ')}`}
                    </span>
                    <span className="font-semibold tabular-nums shrink-0">{money(b.grandTotal)}</span>
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
