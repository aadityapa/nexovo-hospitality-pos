import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Banknote, Smartphone, CreditCard, Gift, Printer, CheckCircle2, Delete, Star, Ticket, BedDouble, ChevronUp } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useBill, useBillMutations } from './hooks';
import { BillSummary } from './BillSummary';
import { LoyaltyPanel, CoverCreditPanel, RoomChargePanel } from './AltTenders';
import { usePermission } from '@/hooks/useAuth';
import { useBranch } from '@/components/layout/Shell';
import { PageHeader, Button, Card, Input, ConfirmDialog, LoadingState, ErrorState, Badge, InlineError } from '@/components/ui';
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
    setError(null);
    if (amt <= 0) { setError('Enter an amount greater than zero'); return; }
    if (overpay) { setError(`Amount exceeds balance due (${money(balance)})`); return; }
    try {
      const updated = await m.addPayment.mutateAsync({ id: b.id, body: { method, amount: amt, reference: reference.trim() || undefined } });
      setAmount(''); setReference(''); setTendered(''); setConfirm(false);
      if (updated.paymentStatus === 'PAID') navigate(`/cashier/bills/${b.id}/receipt`, { replace: true });
    } catch (e) { setConfirm(false); setError(ApiError.from(e).message); }
  };
  const key = (k: string) => setAmount((a) => (k === '⌫' ? a.slice(0, -1) : k === '.' && a.includes('.') ? a : (a + k).replace(/^0+(?=\d)/, '')));
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
      <div className="grid gap-4 pb-16 lg:pb-0 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-4">
          {balance <= 0 ? (
            <Card className="text-center py-10"><CheckCircle2 className="h-12 w-12 text-success-600 mx-auto" /><h2 className="text-heading mt-3">Fully paid</h2><p className="text-neutral-500 mt-1">Print the receipt and close the order.</p><div className="mt-5 flex flex-col sm:flex-row sm:justify-center gap-2"><Button variant="outline" block className="sm:w-auto" leftIcon={<Printer className="h-4 w-4" />} onClick={() => navigate(`/cashier/bills/${b.id}/receipt`)}>Receipt</Button><Button block className="sm:w-auto" onClick={() => navigate(`/cashier/bills/${b.id}`)}>Back to bill</Button></div></Card>
          ) : (
            <>
              <Card>
                <p className="text-label text-neutral-500 uppercase mb-2">Payment method</p>
                {/* Two full-width tender cells per row on a phone, four across from `sm` up. */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {METHODS.map(({ m: mm, icon: Icon, needsRef }) => { const disabled = mm === 'COMPLIMENTARY' && !canComp; return (
                    <button key={mm} type="button" disabled={disabled} aria-pressed={method === mm} onClick={() => { setMethod(mm); if (!needsRef) setReference(''); }} title={disabled ? 'Requires manager authorization' : undefined}
                      className={cn('w-full min-h-[72px] px-1 rounded-md border-2 flex flex-col items-center justify-center gap-1 text-sm font-semibold leading-tight text-center transition-colors disabled:opacity-40', method === mm ? 'border-primary-700 bg-primary-50 text-primary-800' : 'border-neutral-200 bg-white hover:border-neutral-300')}>
                      <Icon className="h-6 w-6" />{PAYMENT_METHOD_LABELS[mm]}
                    </button>); })}
                </div>
                <p className="text-label text-neutral-500 uppercase mt-4 mb-2">Credits &amp; charges</p>
                <div className="grid grid-cols-3 gap-2">
                  {ALT_METHODS.map(({ m: mm, icon: Icon }) => { const av = altAvailable[mm]; return (
                    <button key={mm} type="button" disabled={!av.ok} aria-pressed={method === mm} onClick={() => setMethod(mm)} title={av.ok ? undefined : av.why}
                      className={cn('w-full min-h-[64px] px-1 rounded-md border-2 flex flex-col items-center justify-center gap-1 text-xs sm:text-sm font-semibold leading-tight text-center transition-colors disabled:opacity-40', method === mm ? 'border-primary-700 bg-primary-50 text-primary-800' : 'border-neutral-200 bg-white hover:border-neutral-300')}>
                      <Icon className="h-5 w-5" />{PAYMENT_METHOD_LABELS[mm]}
                    </button>); })}
                </div>
              </Card>
              {isAlt(method) ? (
                <Card>
                  <p className="text-label text-neutral-500 uppercase mb-3">{PAYMENT_METHOD_LABELS[method]} · balance due <span className="text-danger-700 font-bold tabular-nums">{money(balance, { decimals: true })}</span></p>
                  {method === 'LOYALTY' && <LoyaltyPanel bill={b} onDone={onAltDone} />}
                  {method === 'COVER_CREDIT' && <CoverCreditPanel bill={b} onDone={onAltDone} />}
                  {method === 'ROOM_CHARGE' && <RoomChargePanel bill={b} onDone={onAltDone} />}
                </Card>
              ) : (
              <Card>
                <div className="flex items-end justify-between gap-3 mb-3">
                  <div className="min-w-0"><p className="text-label text-neutral-500 uppercase">Amount</p><p className="text-display tabular-nums leading-tight truncate">{money(amt, { decimals: true })}</p></div>
                  <div className="text-right min-w-0"><p className="text-caption text-neutral-500">Balance due</p><p className="text-xl font-bold tabular-nums text-danger-700 truncate">{money(balance, { decimals: true })}</p></div>
                </div>
                {/* Quick amounts keep a 44px target on touch and shrink back to chips from `sm` up. */}
                <div className="flex flex-wrap gap-2 mb-3">
                  <Button size="sm" className="min-h-touch sm:min-h-0" variant={amount === '' ? 'primary' : 'outline'} onClick={() => setAmount('')}>Full balance</Button>
                  {[0.5, 0.25].map((f) => <Button key={f} size="sm" className="min-h-touch sm:min-h-0" variant="outline" onClick={() => setAmount(String(round2(balance * f)))}>{f * 100}%</Button>)}
                  {[500, 1000, 2000].filter((n) => n < balance).map((n) => <Button key={n} size="sm" className="min-h-touch sm:min-h-0" variant="outline" onClick={() => setAmount(String(n))}>₹{n}</Button>)}
                </div>
                <div className="grid grid-cols-3 gap-2 w-full max-w-sm">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'].map((k) => <button key={k} type="button" onClick={() => key(k)} aria-label={k === '⌫' ? 'Delete last digit' : undefined} className="min-h-pos rounded-sm border border-neutral-200 bg-white text-lg font-semibold hover:bg-neutral-50 active:bg-neutral-100 flex items-center justify-center">{k === '⌫' ? <Delete className="h-5 w-5" /> : k}</button>)}
                </div>
                {METHODS.find((x) => x.m === method)?.needsRef && <Input label={`${PAYMENT_METHOD_LABELS[method]} reference`} placeholder={method === 'UPI' ? 'UPI transaction ID' : 'Auth code / last 4 digits'} value={reference} onChange={(e) => setReference(e.target.value)} wrapperClassName="mt-4 max-w-sm" />}
                {method === 'CASH' && <div className="mt-4 max-w-sm grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 sm:items-end"><Input label="Cash tendered (optional)" type="number" inputMode="decimal" value={tendered} onChange={(e) => setTendered(e.target.value)} />{tendered && <p className="text-sm sm:pb-2">Change: <span className={cn('font-bold tabular-nums', change < 0 ? 'text-danger-700' : 'text-success-700')}>{money(Math.max(change, 0))}</span></p>}</div>}
                {overpay && <p role="alert" className="mt-3 text-sm text-danger-600 font-medium">Amount exceeds the balance due. Overpayment is not allowed.</p>}
                <InlineError message={error} />
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
            <div className="px-4 py-3 border-b border-neutral-200 text-subheading">Payments so far</div>
            {b.payments.filter((p) => p.status === 'SUCCESS').length === 0 ? <p className="px-4 py-4 text-sm text-neutral-500">No payments yet.</p> : (
              <ul className="divide-y divide-neutral-100">{b.payments.filter((p) => p.status === 'SUCCESS').map((p) => <li key={p.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm"><span className="flex items-center gap-2 min-w-0"><Badge size="sm">{PAYMENT_METHOD_LABELS[p.method]}</Badge><span className="truncate">{p.reference}</span></span><span className="font-semibold tabular-nums shrink-0">{money(p.amount)}</span></li>)}</ul>
            )}
          </Card>
        </div>
      </div>

      {/*
        PHONE DOCK — the balance stays on screen while the keypad is in use.
        `bottom-24` matches the clearance PosLayout already reserves for the POS bottom
        navigation (`main … pb-24`), so the dock parks above the tab bar rather than covering
        it; being last in the flow it settles into exactly that position at the end of the
        scroll, with the grid's `pb-16` keeping the confirm button clear of it. The nav's own
        `.safe-bottom` already holds the home-indicator inset, so the dock must not add it again.
      */}
      <div className="lg:hidden sticky bottom-24 z-sticky mt-4">
        <div className="card shadow-panel overflow-hidden">
          <div id="pay-summary-sheet" hidden={!dockOpen} className="max-h-64 overflow-y-auto overscroll-contain px-4 py-3 border-b border-neutral-100">
            <BillSummary bill={b} compact />
          </div>
          <button
            type="button"
            aria-expanded={dockOpen}
            aria-controls="pay-summary-sheet"
            onClick={() => setDockOpen((o) => !o)}
            className="w-full min-h-touch px-4 py-2.5 flex items-center gap-3 text-left transition-colors hover:bg-neutral-50"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-label uppercase text-neutral-500">{balance > 0.005 ? 'Balance due' : 'Settled in full'}</span>
              <span className={cn('block text-xl font-semibold tnum truncate', balance > 0.005 ? 'text-danger-700' : 'text-success-700')}>{money(balance, { decimals: true })}</span>
            </span>
            {balance > 0.005 && (
              <span className="min-w-0 text-right">
                <span className="block text-label uppercase text-neutral-500">This payment</span>
                <span className="block text-base font-semibold tnum text-neutral-900 truncate">{money(amt, { decimals: true })}</span>
              </span>
            )}
            <ChevronUp className={cn('h-5 w-5 shrink-0 text-neutral-400 transition-transform', dockOpen && 'rotate-180')} aria-hidden />
            <span className="sr-only">{dockOpen ? 'Hide bill breakdown' : 'Show bill breakdown'}</span>
          </button>
        </div>
      </div>

      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title="Complete payment?" message={<span>Record <strong>{money(amt)}</strong> via <strong>{PAYMENT_METHOD_LABELS[method]}</strong>{reference ? ` (${reference})` : ''}. This settles the bill in full.</span>} confirmLabel="Complete payment" loading={m.addPayment.isPending} onConfirm={submit} />
    </div>
  );
}
