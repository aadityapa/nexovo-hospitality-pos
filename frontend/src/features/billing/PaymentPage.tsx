import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Banknote, Smartphone, CreditCard, Gift, Printer, CheckCircle2, Delete, Star, Ticket, BedDouble, ChevronUp, RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useBill, useBillMutations } from './hooks';
import { BillSummary } from './BillSummary';
import { LoyaltyPanel, CoverCreditPanel, RoomChargePanel } from './AltTenders';
import { usePermission } from '@/hooks/useAuth';
import { useBranch } from '@/components/layout/Shell';
import { PageHeader, Button, Card, CardHeader, Input, ConfirmDialog, LoadingState, ErrorState, Badge, InlineError, Alert } from '@/components/ui';
import { SuccessMark } from '@/components/motion';
import { ApiError } from '@/services/api/client';
import { money, round2 } from '@/utils/money';
import { PAYMENT_METHOD_LABELS } from '@/config/statuses';
import { cn } from '@/utils/cn';
import type { Bill, PaymentMethod } from '@/types';

const METHODS: { m: PaymentMethod; icon: typeof Banknote; needsRef: boolean }[] = [
  { m: 'CASH', icon: Banknote, needsRef: false }, { m: 'UPI', icon: Smartphone, needsRef: true }, { m: 'CARD', icon: CreditCard, needsRef: true }, { m: 'COMPLIMENTARY', icon: Gift, needsRef: false },
];
/** Phase 2 tenders handled by their own modules (loyalty / club / PMS) rather than the generic payment endpoint. */
const ALT_METHODS: { m: PaymentMethod; icon: typeof Banknote }[] = [
  { m: 'LOYALTY', icon: Star }, { m: 'COVER_CREDIT', icon: Ticket }, { m: 'ROOM_CHARGE', icon: BedDouble },
];
const isAlt = (m: PaymentMethod) => ALT_METHODS.some((x) => x.m === m);

/**
 * Payment screen: large method buttons, keypad-style amount, split payments, no overpayment
 * (server-enforced too).
 *
 * Phone (< lg): every tender target is a full-width cell, and the bill summary collapses into
 * a dock at the foot of the screen so the balance stays visible while the keypad is in use.
 * The confirm button deliberately stays inside the amount card — next to the figure it
 * commits, the overpayment warning and the inline error — rather than being mirrored into the
 * dock, so there is never a second, context-free path to taking money. Nothing on this screen
 * shows a payment as accepted until the server has returned the updated bill.
 */
export default function PaymentPage() {
  const { id } = useParams();
  const billId = Number.isFinite(Number(id)) && Number(id) > 0 ? Number(id) : undefined;
  const navigate = useNavigate();
  const q = useBill(billId);
  const m = useBillMutations();
  const qc = useQueryClient();
  const canComp = usePermission('orders:approve-discount');
  const canLoyalty = usePermission('loyalty:redeem');
  const canClub = usePermission('club:view');
  const canRoom = usePermission('room-charge:post');
  const { data: branch } = useBranch();
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [amount, setAmount] = useState<string>('');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  /**
   * The attempt whose OUTCOME IS UNKNOWN.
   *
   * A rejected request is not the same fact as a refused payment. When the server answered, the
   * answer is the truth and the message says so. When nothing came back at all — the request
   * never left, or its reply was lost — the money may or may not have been recorded, and the one
   * thing this screen must never do is let that read like a clean failure a cashier can simply
   * key again. It is set only from `isNetworkError` on the caught error, and cleared only by the
   * next attempt or by re-reading the bill from the server.
   */
  const [uncertain, setUncertain] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [tendered, setTendered] = useState('');
  const [dockOpen, setDockOpen] = useState(false);

  if (!billId) return <ErrorState error={new ApiError(404, 'Bill not found')} title="Bill not found" />;
  if (q.isLoading) return <LoadingState variant="page" />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const b = q.data;
  const balance = round2(b.balanceDue);
  const amt = amount === '' ? balance : round2(Number(amount) || 0);
  const overpay = amt > balance + 0.005;
  const change = method === 'CASH' && tendered ? round2(Number(tendered) - amt) : 0;
  const completes = Math.abs(amt - balance) < 0.005;

  const submit = async () => {
    setError(null); setUncertain(false);
    if (amt <= 0) { setError('Enter an amount greater than zero'); return; }
    if (overpay) { setError(`Amount exceeds balance due (${money(balance)})`); return; }
    try {
      const updated = await m.addPayment.mutateAsync({ id: b.id, body: { method, amount: amt, reference: reference.trim() || undefined } });
      setAmount(''); setReference(''); setTendered(''); setConfirm(false);
      if (updated.paymentStatus === 'PAID') navigate(`/cashier/bills/${b.id}/receipt`, { replace: true });
    } catch (e) {
      const err = ApiError.from(e);
      setConfirm(false);
      setError(err.message);
      // The server answered "no" → a plain error. Nothing answered → an UNKNOWN outcome.
      setUncertain(err.isNetworkError);
    }
  };
  const key = (k: string) => setAmount((a) => (k === '⌫' ? a.slice(0, -1) : k === '.' && a.includes('.') ? a : (a + k).replace(/^0+(?=\d)/, '')));

  /*
   * THE SETTLED MOMENT — the only thing on this screen that is allowed to move.
   *
   * `m.addPayment.isSuccess` is react-query's own RESOLVED flag: it is false while the request is
   * in flight, and it only flips once `billingApi.addPayment` has resolved. `m.addPayment.data`
   * is then the bill the SERVER returned — not the keypad figure, not `amt`, not an optimistic
   * cache write, not anything this component believed before the response landed. Reading the
   * mark off that one value is what makes it impossible to show a tick for money the server has
   * not confirmed. Nothing above was touched: the mutation still fires from `submit()` at exactly
   * the same moment, and `submit()` still navigates to the receipt the instant a bill settles in
   * full, with no frame held back for this or anything else.
   *
   * That navigation is also why the mark's lasting homes are the two resolved states that KEEP a
   * cashier on this screen:
   *   · `balance <= 0` — the server's own answer on `q.data`, shown whenever a settled bill is
   *     opened or returned to;
   *   · a resolved PART payment, where the screen stays put with a smaller balance and the
   *     cashier has to know the last tender was actually taken before keying the next one.
   */
  const confirmed = m.addPayment.isSuccess ? m.addPayment.data : undefined;
  const lastTaken = confirmed?.payments.filter((p) => p.status === 'SUCCESS').slice(-1)[0];
  /** Alt tenders return the refreshed bill from their own endpoint — push it into the cache and finish if settled. */
  const onAltDone = (updated: Bill) => {
    qc.setQueryData(['bills', 'one', updated.id], updated);
    void qc.invalidateQueries({ queryKey: ['bills'] });
    if (updated.paymentStatus === 'PAID') navigate(`/cashier/bills/${b.id}/receipt`, { replace: true });
    else setMethod('CASH');
  };
  const altAvailable: Record<string, { ok: boolean; why?: string }> = {
    LOYALTY: { ok: canLoyalty, why: !canLoyalty ? 'No permission to redeem points' : undefined },
    COVER_CREDIT: { ok: canClub, why: !canClub ? 'Club module not available to your role' : undefined },
    ROOM_CHARGE: { ok: canRoom && !!branch?.pmsProvider && branch.pmsProvider !== 'NONE', why: !canRoom ? 'No permission to post room charges' : !branch ? 'Loading branch settings…' : 'No hotel PMS configured for this branch' },
  };

  if (b.status === 'OPEN') return <div className="max-w-xl mx-auto"><ErrorState error={new ApiError(422, 'Finalize the bill before taking payment.')} title="Bill not finalized" /><div className="text-center"><Button onClick={() => navigate(`/cashier/bills/${b.id}`)}>Back to bill</Button></div></div>;

  return (
    <div>
      <PageHeader back={() => navigate(`/cashier/bills/${b.id}`)} title={`Payment · ${b.tableName}`} subtitle={`${b.billNumber} · ${b.orderNumber}${b.customerName ? ` · ${b.customerName}` : ''}`} />
      {/* The trailing padding is what keeps the confirm button reachable above the phone dock. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-4">
          {balance <= 0 ? (
            /*
              SETTLED. `balance` is `round2(b.balanceDue)` straight off the fetched bill, so this
              branch is only ever reached because the SERVER says the bill is clear.

              The ring pops and the tick draws itself once, on mount, and then holds. The figure
              beside it does NOT roll: `CountUp` is explicitly barred from anything that has to be
              reconciled against a receipt, and a settled total is exactly that — it is printed
              straight, in tabular figures, legible from the first frame.
            */
            <Card className="fill-success text-center py-10">
              <div className="flex justify-center"><SuccessMark className="h-14 w-14" /></div>
              <h2 className="text-heading mt-3">Fully paid</h2>
              <p className="text-metric tnum text-success-700 leading-tight mt-1">{money(b.paidAmount, { decimals: true })}</p>
              <p className="text-neutral-500 mt-1">Print the receipt and close the order.</p>
              <div className="mt-5 flex flex-col sm:flex-row sm:justify-center gap-2"><Button variant="outline" block className="sm:w-auto" leftIcon={<Printer className="h-4 w-4" />} onClick={() => navigate(`/cashier/bills/${b.id}/receipt`)}>Receipt</Button><Button block className="sm:w-auto" onClick={() => navigate(`/cashier/bills/${b.id}`)}>Back to bill</Button></div>
            </Card>
          ) : (
            <>
              <Card>
                <p className="text-label text-neutral-500 uppercase mb-2">Payment method</p>
                {/* Two full-width tender cells per row on a phone, four across from `sm` up. */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {METHODS.map(({ m: mm, icon: Icon, needsRef }) => { const disabled = mm === 'COMPLIMENTARY' && !canComp; return (
                    <button key={mm} type="button" disabled={disabled} aria-pressed={method === mm} onClick={() => { setMethod(mm); if (!needsRef) setReference(''); }} title={disabled ? 'Requires manager authorization' : undefined}
                      /* Selected = a gold edge over the gold tint, label on the legible `-700`
                         rung. The cell never fills gold: gold solid is the confirm button. */
                      className={cn('w-full min-h-[72px] px-1 rounded-md border-2 flex flex-col items-center justify-center gap-1 text-sm font-semibold leading-tight text-center transition-colors duration-control disabled:opacity-40', method === mm ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-neutral-200 bg-surface text-neutral-700 hover:border-neutral-400 hover:bg-neutral-100')}>
                      <Icon className="h-6 w-6" />{PAYMENT_METHOD_LABELS[mm]}
                    </button>); })}
                </div>
                <p className="text-label text-neutral-500 uppercase mt-4 mb-2">Credits &amp; charges</p>
                <div className="grid grid-cols-3 gap-2">
                  {ALT_METHODS.map(({ m: mm, icon: Icon }) => { const av = altAvailable[mm]; return (
                    <button key={mm} type="button" disabled={!av.ok} aria-pressed={method === mm} onClick={() => setMethod(mm)} title={av.ok ? undefined : av.why}
                      className={cn('w-full min-h-[64px] px-1 rounded-md border-2 flex flex-col items-center justify-center gap-1 text-xs sm:text-sm font-semibold leading-tight text-center transition-colors duration-control disabled:opacity-40', method === mm ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-neutral-200 bg-surface text-neutral-700 hover:border-neutral-400 hover:bg-neutral-100')}>
                      <Icon className="h-5 w-5" />{PAYMENT_METHOD_LABELS[mm]}
                    </button>); })}
                </div>
              </Card>
              {isAlt(method) ? (
                <Card>
                  <p className="text-label text-neutral-500 uppercase mb-3">{PAYMENT_METHOD_LABELS[method]} · balance due <span className="text-danger-700 font-bold tnum">{money(balance, { decimals: true })}</span></p>
                  {method === 'LOYALTY' && <LoyaltyPanel bill={b} onDone={onAltDone} />}
                  {method === 'COVER_CREDIT' && <CoverCreditPanel bill={b} onDone={onAltDone} />}
                  {method === 'ROOM_CHARGE' && <RoomChargePanel bill={b} onDone={onAltDone} />}
                </Card>
              ) : (
              <Card>
                {/*
                  Two figures, one hierarchy: the balance due is what the screen exists to clear,
                  so it is the heaviest type here (`text-metric`) and carries the owed colour.
                  The amount being keyed sits beside it at the same optical size but lighter
                  weight. Both are tabular, so the digits line up as the keypad changes them.
                */}
                <div className="flex items-end justify-between gap-3 mb-3">
                  <div className="min-w-0"><p className="text-label text-neutral-500 uppercase">Amount</p><p className="text-display tnum text-neutral-900 leading-tight truncate">{money(amt, { decimals: true })}</p></div>
                  <div className="text-right min-w-0"><p className="text-label text-neutral-500 uppercase">Balance due</p><p className="text-metric tnum text-danger-700 leading-tight truncate">{money(balance, { decimals: true })}</p></div>
                </div>
                {/* Quick amounts keep a 44px target on touch and shrink back to chips from `sm` up. */}
                <div className="flex flex-wrap gap-2 mb-3">
                  {/* A quick amount is not the screen's action, so it never takes the gold: the
                      selected chip rises to the raised neutral instead. The gold on this screen
                      belongs to the settled state's "Back to bill", and the act of taking money
                      keeps the green it has always had. */}
                  <Button size="sm" className="min-h-touch sm:min-h-0" variant={amount === '' ? 'secondary' : 'outline'} onClick={() => setAmount('')}>Full balance</Button>
                  {[0.5, 0.25].map((f) => <Button key={f} size="sm" className="min-h-touch sm:min-h-0" variant="outline" onClick={() => setAmount(String(round2(balance * f)))}>{f * 100}%</Button>)}
                  {[500, 1000, 2000].filter((n) => n < balance).map((n) => <Button key={n} size="sm" className="min-h-touch sm:min-h-0" variant="outline" onClick={() => setAmount(String(n))}>₹{n}</Button>)}
                </div>
                <div className="grid grid-cols-3 gap-2 w-full max-w-sm">
                  {/* A keypad is a control, so like `.input-base` it sits on `surface` — BELOW
                      the card — and lifts one rung on hover, two when pressed. */}
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'].map((k) => <button key={k} type="button" onClick={() => key(k)} aria-label={k === '⌫' ? 'Delete last digit' : undefined} className="min-h-pos rounded-sm border border-neutral-300 bg-surface text-neutral-900 text-lg font-semibold tnum transition-colors duration-control hover:bg-neutral-100 hover:border-neutral-400 active:bg-neutral-200 flex items-center justify-center">{k === '⌫' ? <Delete className="h-5 w-5" /> : k}</button>)}
                </div>
                {METHODS.find((x) => x.m === method)?.needsRef && <Input label={`${PAYMENT_METHOD_LABELS[method]} reference`} placeholder={method === 'UPI' ? 'UPI transaction ID' : 'Auth code / last 4 digits'} value={reference} onChange={(e) => setReference(e.target.value)} wrapperClassName="mt-4 max-w-sm" />}
                {method === 'CASH' && <div className="mt-4 max-w-sm grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 sm:items-end"><Input label="Cash tendered (optional)" type="number" inputMode="decimal" value={tendered} onChange={(e) => setTendered(e.target.value)} />{tendered && <p className="text-sm sm:pb-2 text-neutral-700">Change: <span className={cn('font-bold tnum', change < 0 ? 'text-danger-700' : 'text-success-700')}>{money(Math.max(change, 0))}</span></p>}</div>}
                {overpay && <p role="alert" className="mt-3 text-sm text-danger-700 font-medium">Amount exceeds the balance due. Overpayment is not allowed.</p>}
                {/* An unanswered request reads as unanswered — never as a failure, and never as a
                    success. The only safe next step is to re-read the bill from the server, so
                    that is the only action offered. */}
                {uncertain ? (
                  <Alert
                    tone="warning"
                    className="mt-3"
                    title="This attempt got no answer — the outcome is unknown"
                    action={(
                      <Button size="sm" variant="outline" leftIcon={<RefreshCw className="h-4 w-4" />} onClick={() => { setUncertain(false); setError(null); void q.refetch(); }}>
                        Reload bill
                      </Button>
                    )}
                  >
                    {money(amt)} may or may not have been recorded. Reload the bill and check
                    “Payments so far” before keying it again, so the guest is not charged twice.
                  </Alert>
                ) : (
                  <InlineError message={error} />
                )}
                {/*
                  A part payment the SERVER has accepted. `confirmed` is the resolved mutation's
                  own bill (see above), and both figures are read off it, so the line states what
                  the backend recorded rather than what was keyed.

                  Keyed on the payment count so the ring and tick replay once per accepted tender
                  and hold; they do not replay on a re-render, a refetch or a keypad press.

                  No `role="status"` and no `aria-live`: `useBillMutations` already raises a toast
                  on success and the `Toaster` region is `aria-live="polite"`, so announcing it
                  here again would read the same event twice. The mark is `aria-hidden` for the
                  same reason the illustration is — the sentence beside it carries the meaning.
                */}
                {confirmed && lastTaken && (
                  <div key={confirmed.payments.length} className="mt-3 flex items-center gap-3 rounded-sm border border-success-200 bg-success-50 fill-success px-3 py-2.5">
                    <SuccessMark className="h-7 w-7 shrink-0" />
                    <p className="min-w-0 text-sm text-success-700">
                      <span className="font-semibold tnum">{money(lastTaken.amount, { decimals: true })}</span> taken by {PAYMENT_METHOD_LABELS[lastTaken.method]}
                      {confirmed.balanceDue > 0.005 && <> · <span className="tnum">{money(confirmed.balanceDue, { decimals: true })}</span> still due</>}
                    </p>
                  </div>
                )}
                <div className="mt-4"><Button size="pos" block variant="success" disabled={amt <= 0 || overpay} loading={m.addPayment.isPending} leftIcon={<CheckCircle2 className="h-5 w-5" />} onClick={() => (completes ? setConfirm(true) : void submit())}>{completes ? `Complete payment · ${money(amt)}` : `Add ${PAYMENT_METHOD_LABELS[method]} payment · ${money(amt)}`}</Button></div>
                {!completes && <p className="text-caption text-neutral-500 mt-2">Split payment: {money(round2(balance - amt))} will remain after this entry.</p>}
              </Card>
              )}
            </>
          )}
        </div>
        <div className="space-y-4 lg:sticky lg:top-20 self-start">
          {/* On a phone the same numbers live in the dock below, so the rail card would only repeat them. */}
          <Card className="hidden lg:block"><BillSummary bill={b} compact /></Card>
          <Card padded={false}>
            <CardHeader
              className="p-4 pb-3 mb-0 border-b border-neutral-200"
              title="Payments so far"
              /* Both figures come off the fetched bill, so this line is the server's record of
                 what has been taken — which is exactly what the uncertainty notice sends a
                 cashier here to read. */
              subtitle={`${money(b.paidAmount, { decimals: true })} taken · ${money(balance, { decimals: true })} still due`}
            />
            {b.payments.filter((p) => p.status === 'SUCCESS').length === 0 ? <p className="px-4 py-4 text-sm text-neutral-500">No payments yet.</p> : (
              <ul className="divide-y divide-neutral-200">{b.payments.filter((p) => p.status === 'SUCCESS').map((p) => <li key={p.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm"><span className="flex items-center gap-2 min-w-0"><Badge size="sm">{PAYMENT_METHOD_LABELS[p.method]}</Badge><span className="truncate text-neutral-700">{p.reference}</span></span><span className="font-semibold tnum text-neutral-900 shrink-0">{money(p.amount)}</span></li>)}</ul>
            )}
          </Card>
        </div>
      </div>

      {/*
        PHONE DOCK — stays on screen while the page scrolls, parks above the bottom navigation.
        Offset comes from the shared `.save-bar` rule (`--app-bottom-nav`), never from a
        hand-matched padding value; because the dock is sticky and last in the flow it settles
        into its natural place at the end of the scroll, so the final card is always reachable.
      */}
      <div className="lg:hidden save-bar mt-4">
        <div className="card shadow-panel overflow-hidden">
          <div id="pay-summary-sheet" hidden={!dockOpen} className="max-h-64 overflow-y-auto overscroll-contain px-4 py-3 border-b border-neutral-200">
            <BillSummary bill={b} compact />
          </div>
          <button
            type="button"
            aria-expanded={dockOpen}
            aria-controls="pay-summary-sheet"
            onClick={() => setDockOpen((o) => !o)}
            className="w-full min-h-touch px-4 py-2.5 flex items-center gap-3 text-left transition-colors duration-control hover:bg-neutral-100"
          >
            {/* The dock repeats the screen's most important number, not its action — the
                confirm button stays beside the figure it commits. */}
            <span className="min-w-0 flex-1">
              <span className="block text-label uppercase text-neutral-500">{balance > 0.005 ? 'Balance due' : 'Settled in full'}</span>
              <span className={cn('block text-2xl leading-8 font-semibold tnum truncate', balance > 0.005 ? 'text-danger-700' : 'text-success-700')}>{money(balance, { decimals: true })}</span>
            </span>
            {balance > 0.005 && (
              <span className="min-w-0 text-right">
                <span className="block text-label uppercase text-neutral-500">This payment</span>
                <span className="block text-lg leading-7 font-semibold tnum text-neutral-900 truncate">{money(amt, { decimals: true })}</span>
              </span>
            )}
            <ChevronUp className={cn('h-5 w-5 shrink-0 text-neutral-400 transition-transform duration-control ease-out-soft', dockOpen && 'rotate-180')} aria-hidden />
            <span className="sr-only">{dockOpen ? 'Hide bill breakdown' : 'Show bill breakdown'}</span>
          </button>
        </div>
      </div>

      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title="Complete payment?" message={<span>Record <strong>{money(amt)}</strong> via <strong>{PAYMENT_METHOD_LABELS[method]}</strong>{reference ? ` (${reference})` : ''}. This settles the bill in full.</span>} confirmLabel="Complete payment" loading={m.addPayment.isPending} onConfirm={submit} />
    </div>
  );
}
