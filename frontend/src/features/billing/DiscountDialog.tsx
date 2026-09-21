import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, ShieldAlert, Percent, IndianRupee, CheckCircle2, RefreshCw, AlertTriangle } from 'lucide-react';
import { usersApi } from '@/services/api/endpoints';
import { useAuth } from '@/hooks/useAuth';
import { Modal, Button, Input, PasswordInput, Select, Textarea, SegmentedControl, QuickChips, InlineError, Alert, Badge, KeyValue } from '@/components/ui';
import { ApiError } from '@/services/api/client';
import { discountPercentOf } from '@/utils/billing';
import { money, round2 } from '@/utils/money';
import { cn } from '@/utils/cn';
import type { Bill, AddDiscountRequest } from '@/types';

const REASONS = ['Regular guest', 'Service recovery', 'Staff / friends', 'Promotion', 'Manager courtesy'];

/** Anything at or above this reads as a large discount and is called out before submitting. */
const LARGE_DISCOUNT_PERCENT = 25;

/**
 * Discount with permission caps (Section 27): if the effective % exceeds the cashier's cap,
 * a manager with a sufficient cap must approve with their PIN. Large discounts get a confirm step.
 *
 * The two paths are deliberately different objects on screen. Inside the cap the dialog is a
 * short, calm form that says so. Over the cap it grows an amber approval block that names the
 * cap that was exceeded and lists exactly who is allowed to sign it off. In both cases the
 * effect on the bill is spelled out above the submit button.
 */
export function DiscountDialog({ bill, open, onClose, onApply, loading }: { bill: Bill; open: boolean; onClose: () => void; onApply: (b: AddDiscountRequest) => Promise<void>; loading?: boolean }) {
  const { user } = useAuth();
  const [type, setType] = useState<'PERCENTAGE' | 'FLAT'>('PERCENTAGE');
  const [value, setValue] = useState('10');
  const [reason, setReason] = useState('');
  const [approver, setApprover] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const base = round2(bill.subtotal - bill.itemDiscountTotal);
  const v = Number(value) || 0;
  const pct = discountPercentOf(type, v, base);
  const amount = type === 'PERCENTAGE' ? round2((base * v) / 100) : Math.min(v, base);
  const cap = user?.maxDiscountPercent ?? 0;
  const needsApproval = pct > cap + 1e-9;
  const approvers = useQuery({ queryKey: ['users', 'approvers'], queryFn: usersApi.approvers, enabled: open && needsApproval, staleTime: 5 * 60_000 });
  const eligible = (approvers.data ?? []).filter((a) => a.maxDiscountPercent >= pct - 1e-9);

  const highestCap = (approvers.data ?? []).reduce((m, a) => Math.max(m, a.maxDiscountPercent), 0);
  const large = pct >= LARGE_DISCOUNT_PERCENT;
  const remaining = round2(Math.max(0, base - amount));

  const submit = async () => {
    setError(null);
    if (v <= 0) { setError('Enter a discount value'); return; }
    if (type === 'PERCENTAGE' && v > 100) { setError('Percentage cannot exceed 100'); return; }
    if (type === 'FLAT' && v > base) { setError('Discount cannot exceed the bill amount'); return; }
    if (!reason.trim()) { setError('A reason is required'); return; }
    if (needsApproval && (!approver || pin.length !== 4)) { setError('Manager approval (name + 4-digit PIN) is required for this discount'); return; }
    try { await onApply({ discountType: type, value: v, reason: reason.trim(), approvedByUserId: needsApproval ? Number(approver) : undefined, approvalPin: needsApproval ? pin : undefined }); onClose(); setPin(''); setReason(''); }
    catch (e) { setError(ApiError.from(e).message); }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={needsApproval ? 'Apply discount — approval required' : 'Apply discount'}
      description={cap > 0
        ? `You can approve up to ${cap}% yourself on ${money(base)} of discountable value.`
        : 'Your role cannot sign off a discount on its own — every discount here needs a manager.'}
      footer={<>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button
          loading={loading}
          onClick={() => void submit()}
          variant={needsApproval || large ? 'warning' : 'primary'}
          leftIcon={needsApproval ? <ShieldAlert className="h-4 w-4" /> : undefined}
        >
          {needsApproval ? `Apply with approval · ${money(amount)}` : `Apply discount · ${money(amount)}`}
        </Button>
      </>}
    >
      <div className="space-y-4">
        {/* ------------------------------------------------- which path this discount is on */}
        {v > 0 && (needsApproval ? (
          <Alert tone="warning" title={`${pct.toFixed(1)}% is above your ${cap}% limit`}>
            A manager with a high enough limit has to approve this before it can be applied. Their name and
            4-digit PIN are recorded against the discount.
          </Alert>
        ) : (
          <div className="flex items-start gap-3 rounded-md border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700">
            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
            <p><span className="font-semibold">{pct.toFixed(1)}% is within your {cap}% limit.</span> You can apply this yourself — no approval needed.</p>
          </div>
        ))}

        <SegmentedControl
          value={type}
          onChange={setType}
          ariaLabel="Discount type"
          options={[
            { value: 'PERCENTAGE', label: <span className="inline-flex items-center gap-1"><Percent className="h-4 w-4" aria-hidden />Percentage</span>, ariaLabel: 'Percentage discount' },
            { value: 'FLAT', label: <span className="inline-flex items-center gap-1"><IndianRupee className="h-4 w-4" aria-hidden />Flat amount</span>, ariaLabel: 'Flat amount discount' },
          ]}
        />

        <Input
          label={type === 'PERCENTAGE' ? 'Discount (%)' : 'Discount (₹)'}
          type="number"
          inputMode="decimal"
          min={0}
          step={type === 'PERCENTAGE' ? 1 : 10}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          hint={type === 'PERCENTAGE'
            ? `= ${money(amount)} off · your limit is ${cap}%`
            : `= ${pct.toFixed(1)}% of the discountable amount · your limit is ${cap}%`}
        />

        {/* ------------------------------------------------- what it does to the bill */}
        <section aria-label="Effect on this bill" className="rounded-md border border-neutral-200 bg-surface p-3">
          <p className="text-label text-neutral-700 uppercase mb-2">Effect on this bill</p>
          <KeyValue
            items={[
              { label: 'Bill total now', value: <span className="tnum font-medium">{money(bill.grandTotal)}</span> },
              { label: 'Discountable amount', value: <span className="tnum">{money(base)}</span> },
              ...(bill.orderDiscountTotal > 0
                ? [{ label: 'Already discounted', value: <span className="tnum text-neutral-600">{money(bill.orderDiscountTotal)}</span> }]
                : []),
              {
                label: 'This discount',
                value: <span className={cn('tnum font-semibold', large ? 'text-warning-700' : 'text-primary-700')}>− {money(amount)} ({pct.toFixed(1)}%)</span>,
              },
              { label: 'Discountable left', value: <span className="tnum font-semibold">{money(remaining)}</span> },
            ]}
          />
          <p className="text-caption text-neutral-500 mt-2 leading-relaxed">
            Service charge and tax are recalculated on the server, so the new bill total appears on the bill once
            the discount is accepted.
          </p>
        </section>

        {large && (
          <Alert tone="warning" title={`This removes ${pct.toFixed(1)}% of the discountable value`}>
            {money(amount)} off {money(base)}. Check the reason is accurate before applying — the discount is
            recorded against your name.
          </Alert>
        )}

        <div>
          <p className="text-label text-neutral-700 mb-1.5">Reason <span className="text-danger-700" aria-hidden>*</span><span className="sr-only"> (required)</span></p>
          <QuickChips options={REASONS} selected={[reason]} onToggle={(r) => setReason(r === reason ? '' : r)} className="mb-2" />
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this discount given?" aria-label="Discount reason" />
        </div>

        {/* ------------------------------------------------- the approval path */}
        {needsApproval && (
          <section aria-label="Manager approval" className="rounded-md border-2 border-warning-200 bg-warning-50 p-3.5 space-y-3">
            <p className="text-sm font-semibold text-warning-700 flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
              <span>Manager approval required — {pct.toFixed(1)}% exceeds your {cap}% limit</span>
            </p>

            {approvers.isLoading ? (
              <p className="text-sm text-warning-700">Checking who can approve {pct.toFixed(1)}%…</p>
            ) : approvers.isError ? (
              <div className="flex flex-wrap items-center gap-2">
                <InlineError message={`Could not load the approver list. ${ApiError.from(approvers.error).message}`} />
                <Button size="sm" variant="outline" leftIcon={<RefreshCw className="h-4 w-4" />} onClick={() => void approvers.refetch()}>Try again</Button>
              </div>
            ) : eligible.length === 0 ? (
              <p role="alert" className="flex items-start gap-2 text-sm font-medium text-danger-700">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
                <span>
                  Nobody on this branch can approve {pct.toFixed(1)}%.
                  {highestCap > 0 ? ` The highest limit available is ${highestCap}% — reduce the discount to that or below.` : ' No approver limits are configured.'}
                </span>
              </p>
            ) : (
              <>
                <p className="text-caption text-warning-700">
                  {eligible.length} manager{eligible.length === 1 ? '' : 's'} can approve {pct.toFixed(1)}%:
                </p>
                <ul className="flex flex-wrap gap-1.5">
                  {eligible.slice(0, 6).map((a) => (
                    <li key={a.id}><Badge tone="warning" size="sm">{a.fullName} · up to {a.maxDiscountPercent}%</Badge></li>
                  ))}
                  {eligible.length > 6 && <li><Badge tone="neutral" size="sm">+{eligible.length - 6} more</Badge></li>}
                </ul>
                <Select
                  label="Approving manager"
                  required
                  placeholder="Select manager"
                  options={eligible.map((a) => ({ value: a.id, label: `${a.fullName} (up to ${a.maxDiscountPercent}%)` }))}
                  value={approver}
                  onChange={(e) => setApprover(e.target.value)}
                />
                <PasswordInput
                  label="Approval PIN"
                  required
                  inputMode="numeric"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  hint={`The manager types their own 4-digit PIN — ${pin.length} of 4 entered`}
                />
              </>
            )}
          </section>
        )}

        <InlineError message={error} />
      </div>
    </Modal>
  );
}
