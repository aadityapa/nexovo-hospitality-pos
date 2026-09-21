/**
 * Phase 2 tenders on the payment screen — loyalty points, club cover credit and hotel room charge.
 * Each panel calls its own module endpoint (the server records the payment and refreshes the bill).
 *
 * Design rule for this file: a non-cash tender is only as good as the check behind it, so every
 * panel states **what is being checked**, **what the check returned**, and never reports a
 * settlement until the server has answered. Nothing here is shown optimistically.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, Ticket, BedDouble, Search, CheckCircle2, XCircle, UserPlus, Circle, Loader2, ShieldCheck } from 'lucide-react';
import { useLoyaltyAccount, useClubEntries, useCrmMutations, useClubMutations, useRoomChargeMutations } from '@/features/p2/hooks';
import { Button, Input, Select, InlineError, Badge, LoadingState, ErrorState, EmptyState, Alert, KeyValue, StatusBadge } from '@/components/ui';
import { ApiError } from '@/services/api/client';
import { money, round2 } from '@/utils/money';
import { cn } from '@/utils/cn';
import type { Bill, RoomVerification } from '@/types';

// ---------------------------------------------------------------- verification checklist

type CheckState = 'ok' | 'fail' | 'todo' | 'busy';

interface Check { label: string; state: CheckState; detail?: ReactNode }

const CHECK_ICON: Record<CheckState, ReactNode> = {
  ok: <CheckCircle2 className="h-4 w-4 text-success-500" aria-hidden />,
  fail: <XCircle className="h-4 w-4 text-danger-500" aria-hidden />,
  todo: <Circle className="h-4 w-4 text-neutral-400" aria-hidden />,
  busy: <Loader2 className="h-4 w-4 text-primary-500 animate-spin" aria-hidden />,
};
const CHECK_WORD: Record<CheckState, string> = { ok: 'Passed', fail: 'Failed', todo: 'Not checked yet', busy: 'Checking…' };

/**
 * The verification step, made visible. Colour is never the only signal — every row carries
 * an icon and a word, and the outcome is repeated for screen readers.
 */
function Verification({ title, checks, className }: { title: string; checks: Check[]; className?: string }) {
  return (
    /* `.well` is the system's sunken block — the same three declarations this hand-rolled
       border/surface pair was repeating, named once. */
    <section className={cn('well p-3', className)} aria-label={title}>
      <p className="text-label text-neutral-700 uppercase mb-2 inline-flex items-center gap-1.5">
        <ShieldCheck className="h-3.5 w-3.5 text-neutral-500" aria-hidden />{title}
      </p>
      <ul className="space-y-2">
        {checks.map((c) => (
          <li key={c.label} className="flex items-start gap-2 text-sm">
            <span className="mt-0.5 shrink-0">{CHECK_ICON[c.state]}</span>
            <span className="min-w-0 flex-1">
              <span className={cn('font-medium', c.state === 'fail' ? 'text-danger-700' : c.state === 'ok' ? 'text-neutral-800' : 'text-neutral-600')}>
                {c.label}
              </span>
              <span className="sr-only"> — {CHECK_WORD[c.state]}</span>
              {c.detail && <span className="block text-caption text-neutral-500 leading-relaxed">{c.detail}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** What this tender would leave behind, stated as a conditional — never as a result. */
function Effect({ amount, balance, label }: { amount: number; balance: number; label: string }) {
  const remaining = round2(Math.max(0, balance - amount));
  return (
    <div className="well p-3">
      <KeyValue
        items={[
          { label: 'Balance due now', value: <span className="tnum font-medium text-neutral-900">{money(balance, { decimals: true })}</span> },
          { label, value: <span className="tnum font-semibold text-primary-700">− {money(amount, { decimals: true })}</span> },
          {
            label: 'If the server accepts it',
            value: (
              <span className="tnum font-semibold text-neutral-900">
                {remaining <= 0 ? 'Bill settled in full' : `${money(remaining, { decimals: true })} left to collect`}
              </span>
            ),
          },
        ]}
      />
    </div>
  );
}

/** Shown while a tender is in flight, so nobody reads a spinner as a completed payment. */
function AwaitingServer({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="mt-3 inline-flex items-start gap-2 text-sm text-neutral-600">
      <Loader2 className="h-4 w-4 mt-0.5 shrink-0 animate-spin text-primary-500" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

// ---------------------------------------------------------------- loyalty

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
    return (
      <EmptyState
        compact
        icon={<Star className="h-6 w-6 text-warning-500" />}
        title="No customer on this bill"
        description="Points can only be redeemed against a loyalty member. Attach the customer to the order first, then come back to this tender."
        action={<Button variant="outline" leftIcon={<UserPlus className="h-4 w-4" />} onClick={() => navigate(`/admin/orders/${bill.orderId}`)}>Open order</Button>}
      />
    );
  }
  if (acct.isLoading) return <LoadingState rows={2} />;
  if (acct.isError) return <ErrorState compact error={acct.error} title="Loyalty account unavailable" onRetry={() => void acct.refetch()} />;
  if (!a) return <InlineError message="Loyalty account unavailable" />;

  const checks: Check[] = [
    {
      label: 'Member account found',
      state: 'ok',
      detail: <>{bill.customerName ?? `#${bill.customerId}`} · {a.tier} tier</>,
    },
    {
      label: 'Points available to redeem',
      state: a.pointsBalance > 0 ? 'ok' : 'fail',
      detail: <>{a.pointsBalance} pts on the account ≈ {money(a.balanceValue)} · 1 pt = {money(a.pointValue, { decimals: true })}</>,
    },
    {
      label: `Minimum ${a.minRedeemPoints} points per redemption`,
      state: pts <= 0 ? 'todo' : pts >= a.minRedeemPoints ? 'ok' : 'fail',
      detail: pts > 0 ? <>Entered {pts} pts</> : 'Enter the points to redeem',
    },
    {
      label: `Capped at ${a.maxRedeemPercent}% of the bill and at the balance due`,
      state: pts <= 0 ? 'todo' : pts <= maxPoints ? 'ok' : 'fail',
      detail: <>Most that can be used on this bill: {maxPoints} pts ({money(round2(maxPoints * a.pointValue))})</>,
    },
  ];

  return (
    <div className="space-y-4">
      <Verification title="Redemption rules checked" checks={checks} />

      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-3 items-end max-w-md">
        <Input
          label="Points to redeem"
          type="number"
          inputMode="numeric"
          min={0}
          max={maxPoints}
          value={points}
          onChange={(e) => setPoints(e.target.value)}
          hint={`Worth ${money(value, { decimals: true })}`}
        />
        <Button variant="outline" className="min-h-touch" onClick={() => setPoints(String(maxPoints))}>Max</Button>
      </div>
      {problem && pts > 0 && <p role="alert" className="text-sm text-danger-700 font-medium">{problem}</p>}

      {pts > 0 && !problem && <Effect amount={value} balance={balance} label={`${pts} points`} />}

      <InlineError message={error} />
      <div>
        <Button
          size="pos"
          block
          variant="success"
          leftIcon={<Star className="h-5 w-5" />}
          disabled={pts <= 0 || !!problem}
          loading={redeem.isPending}
          onClick={async () => {
            setError(null);
            try { onDone(await redeem.mutateAsync({ billId: bill.id, points: pts })); }
            catch (e) { setError(ApiError.from(e).message); }
          }}
        >
          Redeem {pts} pts · {money(value)}
        </Button>
        {redeem.isPending
          ? <AwaitingServer>Sending the redemption to the loyalty service. The bill is not reduced until it answers.</AwaitingServer>
          : <p className="text-caption text-neutral-500 mt-2">Points are deducted by the loyalty service; the bill only changes once it confirms.</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- club cover credit

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
  if (entries.isError) return <ErrorState compact error={entries.error} title="Door entries unavailable" onRetry={() => void entries.refetch()} />;
  if (eligible.length === 0) {
    return (
      <EmptyState
        compact
        icon={<Ticket className="h-6 w-6" />}
        title="No open cover credit"
        description="Cover credit can only come from a guest who is currently checked in and still has redeemable cover left. Nobody on the door list qualifies right now."
      />
    );
  }

  const checks: Check[] = [
    {
      label: 'Guest is checked in at the door',
      state: entry ? 'ok' : 'todo',
      detail: entry ? <>{entry.guestName} · {entry.entryNumber}{entry.tableName ? ` · ${entry.tableName}` : ''}</> : 'Select the guest whose cover is being used',
    },
    {
      label: 'Redeemable cover still unused',
      state: entry ? (entry.remainingCredit > 0 ? 'ok' : 'fail') : 'todo',
      detail: entry ? <>{money(entry.remainingCredit)} unused of {money(entry.redeemableAmount)} redeemable</> : undefined,
    },
    {
      label: 'Amount within the remaining cover',
      state: !entry ? 'todo' : amt > 0 && amt <= entry.remainingCredit + 0.005 ? 'ok' : 'fail',
      detail: entry ? <>Cap for this entry: {money(entry.remainingCredit)}</> : undefined,
    },
    {
      label: 'Amount within the balance due',
      state: !entry ? 'todo' : amt > 0 && amt <= balance + 0.005 ? 'ok' : 'fail',
      detail: <>Balance due {money(balance, { decimals: true })}</>,
    },
  ];

  return (
    <div className="space-y-4">
      <Select
        label="Club entry"
        required
        placeholder="Select checked-in guest"
        value={entryId}
        onChange={(e) => { setEntryId(e.target.value ? Number(e.target.value) : ''); setAmount(''); }}
        options={eligible.map((e) => ({ value: e.id, label: `${e.guestName} · ${e.entryNumber} · ${money(e.remainingCredit)} left${e.tableName ? ` · ${e.tableName}` : ''}` }))}
        wrapperClassName="max-w-md"
      />

      <Verification title="Cover credit checked" checks={checks} />

      {entry && (
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-3 items-end max-w-md">
          <Input
            label="Credit to apply"
            type="number"
            inputMode="decimal"
            min={0}
            value={amount}
            placeholder={String(maxAmt)}
            onChange={(e) => setAmount(e.target.value)}
            hint={`Up to ${money(maxAmt)} — the lower of unused cover and balance due`}
          />
          <Button variant="outline" className="min-h-touch" onClick={() => setAmount('')}>Max</Button>
        </div>
      )}
      {entry && bad && amount !== '' && <p role="alert" className="text-sm text-danger-700 font-medium">{bad}</p>}

      {entry && !bad && <Effect amount={amt} balance={balance} label={`Cover credit from ${entry.entryNumber}`} />}

      <InlineError message={error} />
      <div>
        <Button
          size="pos"
          block
          variant="success"
          leftIcon={<Ticket className="h-5 w-5" />}
          disabled={!entry || !!bad}
          loading={redeemCover.isPending}
          onClick={async () => {
            if (!entry) return;
            setError(null);
            try { onDone(await redeemCover.mutateAsync({ billId: bill.id, entryId: entry.id, amount: amt })); }
            catch (e) { setError(ApiError.from(e).message); }
          }}
        >
          Apply cover credit · {money(amt)}
        </Button>
        {redeemCover.isPending
          ? <AwaitingServer>Applying the cover credit against the door entry. Nothing is settled until the club module answers.</AwaitingServer>
          : <p className="text-caption text-neutral-500 mt-2">The club module deducts the cover and returns the updated bill.</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- hotel room charge

export function RoomChargePanel({ bill, onDone }: { bill: Bill; onDone: (b: Bill) => void }) {
  const { verify, post } = useRoomChargeMutations();
  const [roomNo, setRoomNo] = useState('');
  const [guestName, setGuestName] = useState(bill.customerName ?? '');
  const [amount, setAmount] = useState('');
  const [verified, setVerified] = useState<RoomVerification | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Only ever set from the server's own response to the posting call. */
  const [posted, setPosted] = useState<{ bill: Bill; amount: number; roomNo: string } | null>(null);
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
    try {
      const b = await post.mutateAsync({ billId: bill.id, body: { roomNo: roomNo.trim(), guestName: guestName.trim(), amount: amt } });
      // Only now — with the server's answer in hand — is anything reported back.
      setPosted({ bill: b, amount: amt, roomNo: roomNo.trim().toUpperCase() });
      onDone(b);
    } catch (e) { setError(ApiError.from(e).message); setVerified(null); }
  };

  if (posted) {
    return (
      <div className="space-y-4">
        <Alert tone="success" title={`The server accepted ${money(posted.amount)} against room ${posted.roomNo}`}>
          This is what came back from the posting call — not a local assumption.
        </Alert>
        <KeyValue
          items={[
            { label: 'Room', value: <span className="font-semibold tnum">{posted.roomNo}</span> },
            { label: 'Folio guest', value: guestName.trim() || '—' },
            { label: 'Amount charged', value: <span className="tnum font-semibold">{money(posted.amount, { decimals: true })}</span> },
            { label: 'Bill balance now', value: <span className="tnum font-semibold">{money(posted.bill.balanceDue, { decimals: true })}</span> },
            { label: 'Bill status', value: <StatusBadge kind="payment" status={posted.bill.paymentStatus} size="sm" /> },
          ]}
        />
        <p className="text-caption text-neutral-500 leading-relaxed">
          The folio outcome for this posting is listed on the Room charges page. A posting the property management
          system later rejects leaves the bill unsettled — check there before closing the table.
        </p>
      </div>
    );
  }

  const step1Done = !!verified?.found && !!verified.checkedIn;
  const canPost = step1Done && guestName.trim().length >= 2 && !bad;

  const checks: Check[] = [
    {
      label: 'Room exists in the property management system',
      state: verify.isPending ? 'busy' : !verified ? 'todo' : verified.found ? 'ok' : 'fail',
      detail: verified ? (verified.found ? <>Room {verified.roomNo}</> : verified.error ?? <>Room {verified.roomNo} is not in the PMS</>) : 'Enter a room number and verify',
    },
    {
      label: 'Room is currently occupied',
      state: verify.isPending ? 'busy' : !verified ? 'todo' : !verified.found ? 'todo' : verified.checkedIn ? 'ok' : 'fail',
      detail: verified?.found ? (verified.checkedIn ? 'A guest is checked in against this folio' : `Room ${verified.roomNo} is vacant — nothing can be charged to it`) : undefined,
    },
    {
      label: 'Folio guest name',
      state: !verified?.found ? 'todo' : verified.guestName ? 'ok' : guestName.trim().length >= 2 ? 'ok' : 'fail',
      detail: verified?.guestName
        ? <>PMS returned <b>{verified.guestName}</b></>
        : verified?.found ? 'The PMS returned no name — type the name on the folio' : undefined,
    },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-600">
        A room charge moves the balance onto a hotel folio. It runs in two steps — verify the room with the PMS,
        then post the charge. A failed posting is recorded and never marks the bill paid.
      </p>

      {/* Step 1 ------------------------------------------------------------------ */}
      <section aria-label="Step 1: verify the room" className="well p-3 space-y-3">
        <p className="text-label text-neutral-700 uppercase">Step 1 · Verify the room</p>
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-3 items-end max-w-md">
          <Input
            label="Room number"
            required
            value={roomNo}
            onChange={(e) => { setRoomNo(e.target.value); setVerified(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && roomNo.trim()) void doVerify(); }}
            placeholder="e.g. 204"
            autoFocus
          />
          <Button variant="outline" className="min-h-touch" leftIcon={<Search className="h-4 w-4" />} disabled={!roomNo.trim()} loading={verify.isPending} onClick={doVerify}>
            {verified ? 'Verify again' : 'Verify'}
          </Button>
        </div>
        <Verification title="What the PMS was asked" checks={checks} />
        {verified && !step1Done && (
          <p role="alert" className="text-sm text-danger-700 font-medium">
            {verified.error ?? (verified.found ? `Room ${verified.roomNo} is vacant — take another tender.` : `Room ${verified.roomNo} was not found.`)}
          </p>
        )}
      </section>

      {/* Step 2 ------------------------------------------------------------------ */}
      {/* Both steps sit on the same sunken block; what says the second one is closed is the
          "Locked until the room verifies" badge and the disabled action, not a shade. */}
      <section aria-label="Step 2: post the charge" className="well p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-label text-neutral-700 uppercase">Step 2 · Post the charge</p>
          {!step1Done && <Badge tone="neutral" size="sm">Locked until the room verifies</Badge>}
        </div>

        {step1Done ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
              <Input label="Guest name (as on folio)" required value={guestName} onChange={(e) => setGuestName(e.target.value)} />
              <Input label="Amount" type="number" inputMode="decimal" min={0} value={amount} placeholder={String(balance)} onChange={(e) => setAmount(e.target.value)} hint={`Balance due ${money(balance)}`} />
            </div>
            {bad && amount !== '' && <p role="alert" className="text-sm text-danger-700 font-medium">{bad}</p>}
            {!bad && <Effect amount={amt} balance={balance} label={`Charge to room ${roomNo.trim().toUpperCase()}`} />}
          </>
        ) : (
          <p className="text-sm text-neutral-500">
            Verify the room above first. The amount and folio name only open once the PMS confirms an occupied room.
          </p>
        )}

        <InlineError message={error} />
        <Button
          size="pos"
          block
          variant="success"
          leftIcon={<BedDouble className="h-5 w-5" />}
          disabled={!canPost}
          loading={post.isPending}
          onClick={doPost}
        >
          Charge {money(amt)} to room {roomNo.trim().toUpperCase() || '…'}
        </Button>
        {post.isPending && <AwaitingServer>Waiting for the property management system to accept the charge. Nothing is settled until it answers.</AwaitingServer>}
      </section>
    </div>
  );
}
