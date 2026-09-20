import { useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, ChefHat, Wine, Receipt, Package, FileText } from 'lucide-react';
import { usersApi } from '@/services/api/endpoints';
import { usePermission } from '@/hooks/useAuth';
import { ConfirmDialog, Textarea, Select, Input, QuickChips, InlineError } from '@/components/ui';
import { ApiError } from '@/services/api/client';
import type { Order, OrderItem, CancelItemRequest } from '@/types';

const REASONS = ['Customer changed mind', 'Wrong item entered', 'Out of stock', 'Quality issue', 'Long wait'];

/** One consequence line: icon + plain description of something the cancellation actually does. */
function Consequence({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0 text-neutral-400" aria-hidden>{icon}</span>
      <span className="min-w-0">{children}</span>
    </li>
  );
}

/**
 * Controlled cancellation (Section 23). Waiters can cancel NEW items on a DRAFT order freely;
 * anything else requires manager approval — self-approved for managers, PIN-approved for waiters.
 *
 * The dialog spells out exactly what the cancellation does — to the station ticket, to the bill
 * and to stock — and the consequences shown are the ones the cancel path actually performs:
 * the station is notified, the line drops out of the order total, and an ingredient deduction
 * is reversed only when one was made for this line.
 */
export function CancelItemDialog({ order, item, onClose, onConfirm, loading }: { order: Order; item: OrderItem | null; onClose: () => void; onConfirm: (body: CancelItemRequest) => Promise<void>; loading?: boolean }) {
  const selfApprove = usePermission('orders:cancel');
  const needsApproval = !!item && !(order.status === 'DRAFT' && item.status === 'NEW');
  const needsPin = needsApproval && !selfApprove;
  const approvers = useQuery({ queryKey: ['users', 'approvers'], queryFn: usersApi.approvers, enabled: needsPin, staleTime: 5 * 60_000 });
  const [reason, setReason] = useState('');
  const [approver, setApprover] = useState('');
  const [pin, setPin] = useState('');
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Each item gets a clean dialog — a reason typed for one line must never be reused for another.
  useEffect(() => {
    setReason(''); setApprover(''); setPin(''); setTouched(false); setError(null);
  }, [item?.id]);

  const bar = item?.prepLocation === 'BAR';
  const station = bar ? 'bar' : 'kitchen';
  const ticket = bar ? 'BOT' : 'KOT';
  const reversesStock = item?.stockDeducted === true;

  const submit = async () => {
    setError(null);
    setTouched(true);
    if (!reason.trim()) return;
    if (needsPin && (!approver || pin.length !== 4)) { setError('Select the approving manager and enter their 4-digit PIN.'); return; }
    try {
      await onConfirm({ reason: reason.trim(), approvedByUserId: needsPin ? Number(approver) : undefined, approvalPin: needsPin ? pin : undefined });
      onClose();
    } catch (e) { setError(ApiError.from(e).message); }
  };

  return (
    <ConfirmDialog
      open={!!item}
      onClose={onClose}
      onConfirm={submit}
      variant="danger"
      confirmLabel="Cancel item"
      loading={loading}
      title={item ? `Cancel ${item.quantity}× ${item.itemName}?` : 'Cancel item'}
      message={
        <ul className="space-y-2">
          <Consequence icon={bar ? <Wine className="h-4 w-4" /> : <ChefHat className="h-4 w-4" />}>
            {needsApproval
              ? <>The {station} is told straight away and the line is struck off its {ticket}. The ticket only leaves the {station} queue once every line on it is cancelled.</>
              : <>Nothing has been sent yet, so no {ticket} is affected.</>}
          </Consequence>
          <Consequence icon={<Receipt className="h-4 w-4" />}>
            The line comes out of the order total and will not appear on the bill.
          </Consequence>
          <Consequence icon={<Package className="h-4 w-4" />}>
            {reversesStock
              ? <>Ingredients already deducted for this line are put back into stock automatically.</>
              : <>No stock has been deducted for this line, so stock is unchanged.</>}
          </Consequence>
          <Consequence icon={<FileText className="h-4 w-4" />}>
            The line stays on the order marked cancelled, with your reason{needsApproval ? ' and the approving manager' : ''}, in the audit log. This cannot be undone.
          </Consequence>
        </ul>
      }
    >
      <div className="space-y-3">
        <div>
          <p className="text-label text-neutral-700 mb-1.5">Common reasons</p>
          <QuickChips options={REASONS} selected={[reason]} onToggle={(r) => { setReason(r === reason ? '' : r); setTouched(false); }} />
        </div>

        <Textarea
          label="Reason"
          required
          rows={2}
          maxLength={300}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={touched && !reason.trim() ? 'Type or pick a reason — it is stored against this line and in the audit log.' : undefined}
          hint={reason.trim() ? `${reason.trim().length}/300 characters` : 'Pick one above, or describe what happened.'}
          placeholder="Why is this item being cancelled?"
          data-autofocus
        />

        {needsPin && (
          <div className="rounded-sm border border-warning-200 bg-warning-50 p-3 space-y-3">
            <p className="text-sm font-medium text-warning-700 flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
              Manager approval required
            </p>
            <p className="text-caption text-warning-700 leading-relaxed">
              This line has already been sent to the {station}, so a manager has to approve the cancellation with their PIN.
            </p>
            {approvers.isError ? (
              <InlineError message="The list of approving managers could not be loaded. Close this and try again." />
            ) : (
              <>
                <Select
                  label="Approving manager"
                  required
                  placeholder={approvers.isLoading ? 'Loading managers…' : 'Select manager'}
                  disabled={approvers.isLoading}
                  options={(approvers.data ?? []).map((u) => ({ value: u.id, label: `${u.fullName} (${u.role})` }))}
                  value={approver}
                  onChange={(e) => setApprover(e.target.value)}
                />
                <Input
                  label="Approval PIN"
                  required
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  hint="4 digits, entered by the manager."
                />
              </>
            )}
          </div>
        )}

        <InlineError message={error} />
      </div>
    </ConfirmDialog>
  );
}
