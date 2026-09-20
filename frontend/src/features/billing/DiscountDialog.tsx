import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, Percent, IndianRupee } from 'lucide-react';
import { usersApi } from '@/services/api/endpoints';
import { useAuth } from '@/hooks/useAuth';
import { Modal, Button, Input, Select, Textarea, SegmentedControl, QuickChips, InlineError } from '@/components/ui';
import { ApiError } from '@/services/api/client';
import { discountPercentOf } from '@/utils/billing';
import { money, round2 } from '@/utils/money';
import type { Bill, AddDiscountRequest } from '@/types';

const REASONS = ['Regular guest', 'Service recovery', 'Staff / friends', 'Promotion', 'Manager courtesy'];

/**
 * Discount with permission caps (Section 27): if the effective % exceeds the cashier's cap,
 * a manager with a sufficient cap must approve with their PIN. Large discounts get a confirm step.
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
    <Modal open={open} onClose={onClose} size="sm" title="Apply discount" description={`Discountable amount ${money(base)} · your limit ${cap}%`} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={loading} onClick={() => void submit()} variant={pct >= 25 ? 'warning' : 'primary'}>{pct >= 25 ? `Apply large discount (${pct.toFixed(0)}%)` : 'Apply discount'}</Button></>}>
      <div className="space-y-4">
        <SegmentedControl value={type} onChange={setType} options={[{ value: 'PERCENTAGE', label: <span className="inline-flex items-center gap-1"><Percent className="h-4 w-4" />Percentage</span> }, { value: 'FLAT', label: <span className="inline-flex items-center gap-1"><IndianRupee className="h-4 w-4" />Flat amount</span> }]} />
        <Input label={type === 'PERCENTAGE' ? 'Discount (%)' : 'Discount (₹)'} type="number" inputMode="decimal" min={0} step={type === 'PERCENTAGE' ? 1 : 10} value={value} onChange={(e) => setValue(e.target.value)} autoFocus hint={`= ${money(amount)} (${pct.toFixed(1)}%)`} />
        <div><p className="text-label text-neutral-700 mb-1.5">Reason <span className="text-danger-600">*</span></p><QuickChips options={REASONS} selected={[reason]} onToggle={(r) => setReason(r === reason ? '' : r)} className="mb-2" /><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this discount given?" /></div>
        {needsApproval && (
          <div className="rounded-sm border border-warning-100 bg-warning-50 p-3 space-y-3">
            <p className="text-sm font-medium text-warning-700 flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" />{pct.toFixed(1)}% exceeds your {cap}% limit — manager approval required</p>
            <Select label="Approving manager" required placeholder={approvers.isLoading ? 'Loading…' : eligible.length ? 'Select manager' : 'No manager can approve this amount'} options={eligible.map((a) => ({ value: a.id, label: `${a.fullName} (up to ${a.maxDiscountPercent}%)` }))} value={approver} onChange={(e) => setApprover(e.target.value)} />
            <Input label="Approval PIN" required type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
          </div>
        )}
        <InlineError message={error} />
      </div>
    </Modal>
  );
}
