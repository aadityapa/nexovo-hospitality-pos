/**
 * Phase 2 tenders on the payment screen — loyalty points, club cover credit and hotel room charge.
 * Each panel calls its own module endpoint (the server records the payment and refreshes the bill).
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, Ticket, BedDouble, Search, CheckCircle2, XCircle, UserPlus } from 'lucide-react';
import { useLoyaltyAccount, useClubEntries, useCrmMutations, useClubMutations, useRoomChargeMutations } from '@/features/p2/hooks';
import { Button, Input, Select, InlineError, Badge, LoadingState } from '@/components/ui';
import { ApiError } from '@/services/api/client';
import { money, round2 } from '@/utils/money';
import { cn } from '@/utils/cn';
import type { Bill, RoomVerification } from '@/types';

export function LoyaltyPanel({ bill, onDone }: { bill: Bill; onDone: (b: Bill) => void }) {
  const navigate = useNavigate();
  const acct = useLoyaltyAccount(bill.customerId);
  const { redeem } = useCrmMutations();
  const [points, setPoints] = useState('');
  const [error, setError] = useState<string | null>(null);
  const balance = round2(bill.balanceDue);
  const a = acct.data;
  const maxByPercent = a ? Math.floor((bill.grandTotal * a.maxRedeemPercent) / 100 / (a.pointValue || 1)) : 0;
  const maxByBalance = a ? Math.floor(balance / (a.pointValue || 1)) : 0;
  const maxPoints = a ? Math.max(0, Math.min(a.pointsBalance, maxByPercent, maxByBalance)) : 0;
  const [seeded, setSeeded] = useState(false);
  useEffect(() => { if (a && !seeded) { setPoints(String(maxPoints)); setSeeded(true); } }, [a, maxPoints, seeded]);
  const pts = Math.floor(Number(points) || 0);
  const value = a ? round2(pts * a.pointValue) : 0;
  const problem = !a ? null : a.pointsBalance <= 0 ? 'No points on this account' : pts < a.minRedeemPoints ? `Minimum redemption is ${a.minRedeemPoints} points` : pts > maxPoints ? `Maximum ${maxPoints} points on this bill (balance, ${a.maxRedeemPercent}% cap and amount due)` : null;
  if (!bill.customerId) {
    return <div className="text-center py-6"><Star className="h-8 w-8 text-warning-500 mx-auto" /><p className="mt-2 font-medium">No customer on this bill</p><p className="text-sm text-neutral-500 mt-1">Attach the customer to the order to redeem points.</p><Button variant="outline" className="mt-4" leftIcon={<UserPlus className="h-4 w-4" />} onClick={() => navigate(`/admin/orders/${bill.orderId}`)}>Open order</Button></div>;
  }
  if (acct.isLoading) return <LoadingState rows={2} />;
  if (!a) return <InlineError message="Loyalty account unavailable" />;
  return (
    <div>
      <div className="flex flex-wrap gap-4 mb-4 text-sm">
        <span><span className="text-caption text-neutral-500 block">Member</span><span className="font-medium">{bill.customerName ?? `#${bill.customerId}`}</span> <Badge size="sm" tone="warning">{a.tier}</Badge></span>
        <span><span className="text-caption text-neutral-500 block">Balance</span><span className="font-bold tabular-nums">{a.pointsBalance} pts</span> <span className="text-neutral-500">≈ {money(a.balanceValue)}</span></span>
        <span><span className="text-caption text-neutral-500 block">Rules</span>min {a.minRedeemPoints} pts · up to {a.maxRedeemPercent}% of bill · 1 pt = {money(a.pointValue, { decimals: true })}</span>
      </div>
      <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end max-w-md">
        <Input label="Points to redeem" type="number" inputMode="numeric" min={0} max={maxPoints} value={points} onChange={(e) => setPoints(e.target.value)} hint={`Worth ${money(value, { decimals: true })}`} />
        <Button variant="outline" onClick={() => setPoints(String(maxPoints))}>Max</Button>
      </div>
      {problem && pts > 0 && <p role="alert" className="mt-2 text-sm text-danger-600">{problem}</p>}
      <InlineError message={error} />
      <div className="mt-4"><Button size="pos" block variant="success" leftIcon={<Star className="h-5 w-5" />} disabled={pts <= 0 || !!problem} loading={redeem.isPending} onClick={async () => { setError(null); try { onDone(await redeem.mutateAsync({ billId: bill.id, points: pts })); } catch (e) { setError(ApiError.from(e).message); } }}>Redeem {pts} pts · {money(value)}</Button></div>
    </div>
  );
}

export function CoverCreditPanel({ bill, onDone }: { bill: Bill; onDone: (b: Bill) => void }) {
  const entries = useClubEntries({ status: 'CHECKED_IN' });
  const { redeemCover } = useClubMutations();
  const [entryId, setEntryId] = useState<number | ''>('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const balance = round2(bill.balanceDue);
  const eligible = useMemo(() => (entries.data ?? []).filter((e) => e.remainingCredit > 0), [entries.data]);
  useEffect(() => {
    if (entryId !== '' || eligible.length === 0) return;
    const match = eligible.find((e) => (bill.customerId && e.customerId === bill.customerId) || e.tableId === bill.tableId) ?? (eligible.length === 1 ? eligible[0] : undefined);
    if (match) setEntryId(match.id);
  }, [eligible, entryId, bill.customerId, bill.tableId]);
  const entry = eligible.find((e) => e.id === entryId);
  const maxAmt = entry ? round2(Math.min(entry.remainingCredit, balance)) : 0;
  const amt = amount === '' ? maxAmt : round2(Number(amount) || 0);
  const bad = amt <= 0 ? 'Enter an amount' : amt > maxAmt + 0.005 ? `Maximum ${money(maxAmt)} for this entry` : null;
  if (entries.isLoading) return <LoadingState rows={2} />;
  if (eligible.length === 0) return <div className="text-center py-6"><Ticket className="h-8 w-8 text-neutral-400 mx-auto" /><p className="mt-2 font-medium">No open cover credit</p><p className="text-sm text-neutral-500 mt-1">Only guests currently checked in with unused redeemable cover appear here.</p></div>;
  return (
    <div>
      <Select label="Club entry" required placeholder="Select checked-in guest" value={entryId} onChange={(e) => { setEntryId(e.target.value ? Number(e.target.value) : ''); setAmount(''); }} options={eligible.map((e) => ({ value: e.id, label: `${e.guestName} · ${e.entryNumber} · ${money(e.remainingCredit)} left${e.tableName ? ` · ${e.tableName}` : ''}` }))} wrapperClassName="max-w-md" />
      {entry && (
        <div className="mt-4 grid sm:grid-cols-[1fr_auto] gap-3 items-end max-w-md">
          <Input label="Credit to apply" type="number" inputMode="decimal" min={0} value={amount} placeholder={String(maxAmt)} onChange={(e) => setAmount(e.target.value)} hint={`${money(entry.remainingCredit)} unused of ${money(entry.redeemableAmount)} · balance due ${money(balance)}`} />
          <Button variant="outline" onClick={() => setAmount('')}>Max</Button>
        </div>
      )}
      {entry && bad && amount !== '' && <p role="alert" className="mt-2 text-sm text-danger-600">{bad}</p>}
      <InlineError message={error} />
      <div className="mt-4"><Button size="pos" block variant="success" leftIcon={<Ticket className="h-5 w-5" />} disabled={!entry || !!bad} loading={redeemCover.isPending} onClick={async () => { if (!entry) return; setError(null); try { onDone(await redeemCover.mutateAsync({ billId: bill.id, entryId: entry.id, amount: amt })); } catch (e) { setError(ApiError.from(e).message); } }}>Apply cover credit · {money(amt)}</Button></div>
    </div>
  );
}

export function RoomChargePanel({ bill, onDone }: { bill: Bill; onDone: (b: Bill) => void }) {
  const { verify, post } = useRoomChargeMutations();
  const [roomNo, setRoomNo] = useState('');
  const [guestName, setGuestName] = useState(bill.customerName ?? '');
  const [amount, setAmount] = useState('');
  const [verified, setVerified] = useState<RoomVerification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<'ok' | null>(null);
  const balance = round2(bill.balanceDue);
  const amt = amount === '' ? balance : round2(Number(amount) || 0);
  const bad = amt <= 0 ? 'Enter an amount' : amt > balance + 0.005 ? `Cannot exceed balance due (${money(balance)})` : null;
  const doVerify = async () => {
    setError(null); setVerified(null);
    try { const v = await verify.mutateAsync(roomNo.trim()); setVerified(v); if (v.found && v.guestName && !guestName) setGuestName(v.guestName); }
    catch (e) { setError(ApiError.from(e).message); }
  };
  const doPost = async () => {
    setError(null);
    try { const b = await post.mutateAsync({ billId: bill.id, body: { roomNo: roomNo.trim(), guestName: guestName.trim(), amount: amt } }); setResult('ok'); onDone(b); }
    catch (e) { setError(ApiError.from(e).message); setVerified(null); }
  };
  if (result === 'ok') return <div className="text-center py-6"><CheckCircle2 className="h-10 w-10 text-success-600 mx-auto" /><p className="mt-2 font-semibold">Charge posted to room {roomNo.toUpperCase()}</p><p className="text-sm text-neutral-500">The hotel folio has been updated.</p></div>;
  const canPost = verified?.found && verified.checkedIn && guestName.trim().length >= 2 && !bad;
  return (
    <div>
      <p className="text-sm text-neutral-600 mb-3">Verify the room with the hotel PMS, then post the charge to the guest folio. Failed postings are recorded and never mark the bill paid.</p>
      <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end max-w-md">
        <Input label="Room number" required value={roomNo} onChange={(e) => { setRoomNo(e.target.value); setVerified(null); }} onKeyDown={(e) => { if (e.key === 'Enter' && roomNo.trim()) void doVerify(); }} placeholder="e.g. 204" autoFocus />
        <Button variant="outline" leftIcon={<Search className="h-4 w-4" />} disabled={!roomNo.trim()} loading={verify.isPending} onClick={doVerify}>Verify</Button>
      </div>
      {verified && (
        <div className={cn('mt-3 max-w-md rounded-md border px-3 py-2 text-sm flex items-start gap-2', verified.found && verified.checkedIn ? 'border-success-200 bg-success-50 text-success-800' : 'border-danger-200 bg-danger-50 text-danger-800')}>
          {verified.found && verified.checkedIn ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> : <XCircle className="h-4 w-4 mt-0.5 shrink-0" />}
          <span>{verified.found && verified.checkedIn ? <>Room <b>{verified.roomNo}</b> is occupied{verified.guestName ? <> by <b>{verified.guestName}</b></> : null}.</> : verified.error ?? (verified.found ? `Room ${verified.roomNo} is vacant` : `Room ${verified.roomNo} not found`)}</span>
        </div>
      )}
      {verified?.found && verified.checkedIn && (
        <div className="mt-4 grid sm:grid-cols-2 gap-3 max-w-md">
          <Input label="Guest name (as on folio)" required value={guestName} onChange={(e) => setGuestName(e.target.value)} />
          <Input label="Amount" type="number" inputMode="decimal" min={0} value={amount} placeholder={String(balance)} onChange={(e) => setAmount(e.target.value)} hint={`Balance due ${money(balance)}`} />
        </div>
      )}
      {bad && amount !== '' && <p role="alert" className="mt-2 text-sm text-danger-600">{bad}</p>}
      <InlineError message={error} />
      <div className="mt-4"><Button size="pos" block variant="success" leftIcon={<BedDouble className="h-5 w-5" />} disabled={!canPost} loading={post.isPending} onClick={doPost}>Charge {money(amt)} to room {roomNo.trim().toUpperCase() || '…'}</Button></div>
    </div>
  );
}
