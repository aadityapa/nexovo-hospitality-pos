import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { usersApi } from '@/services/api/endpoints';
import { usePermission } from '@/hooks/useAuth';
import { ConfirmDialog, Textarea, Select, Input, QuickChips } from '@/components/ui';
import { ApiError } from '@/services/api/client';
import type { Order, OrderItem, CancelItemRequest } from '@/types';

const REASONS = ['Customer changed mind', 'Wrong item entered', 'Out of stock', 'Quality issue', 'Long wait'];

/**
 * Controlled cancellation (Section 23). Waiters can cancel NEW items on a DRAFT order freely;
 * anything else requires manager approval — self-approved for managers, PIN-approved for waiters.
 */
export function CancelItemDialog({ order, item, onClose, onConfirm, loading }: { order: Order; item: OrderItem | null; onClose: () => void; onConfirm: (body: CancelItemRequest) => Promise<void>; loading?: boolean }) {
  const selfApprove = usePermission('orders:cancel');
  const needsApproval = !!item && !(order.status === 'DRAFT' && item.status === 'NEW');
  const needsPin = needsApproval && !selfApprove;
  const approvers = useQuery({ queryKey: ['users', 'approvers'], queryFn: usersApi.approvers, enabled: needsPin, staleTime: 5 * 60_000 });
  const [reason, setReason] = useState('');
  const [approver, setApprover] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setError(null);
    if (!reason.trim()) { setError('A reason is required'); return; }
    if (needsPin && (!approver || pin.length !== 4)) { setError('Select the approving manager and enter their 4-digit PIN'); return; }
    try { await onConfirm({ reason: reason.trim(), approvedByUserId: needsPin ? Number(approver) : undefined, approvalPin: needsPin ? pin : undefined }); onClose(); setReason(''); setPin(''); }
    catch (e) { setError(ApiError.from(e).message); }
  };
  return (
    <ConfirmDialog open={!!item} onClose={onClose} onConfirm={submit} variant="danger" confirmLabel="Cancel item" loading={loading} title={`Cancel ${item?.itemName} × ${item?.quantity}?`} message={needsApproval ? 'This item has already been sent to the kitchen/bar. Cancellation is recorded with the approver.' : 'The item is removed from the draft and kept in history.'}>
      <div className="space-y-3">
        <QuickChips options={REASONS} selected={[reason]} onToggle={(r) => setReason(r === reason ? '' : r)} />
        <Textarea label="Reason" required rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this item being cancelled?" />
        {needsPin && (
          <div className="rounded-sm border border-warning-100 bg-warning-50 p-3 space-y-3">
            <p className="text-sm font-medium text-warning-700 flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" />Manager approval required</p>
            <Select label="Approving manager" required placeholder="Select manager" options={(approvers.data ?? []).map((u) => ({ value: u.id, label: `${u.fullName} (${u.role})` }))} value={approver} onChange={(e) => setApprover(e.target.value)} />
            <Input label="Approval PIN" required type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
          </div>
        )}
        {error && <p role="alert" className="text-sm text-danger-600">{error}</p>}
      </div>
    </ConfirmDialog>
  );
}
