import { useNavigate, useParams } from 'react-router-dom';
import { Printer, CheckCircle2, ArrowLeft } from 'lucide-react';
import { useReceipt, useBillMutations } from './hooks';
import { ReceiptView, browserPrinter } from './ReceiptView';
import { usePermission } from '@/hooks/useAuth';
import { PageHeader, Button, LoadingState, ErrorState, StatusBadge } from '@/components/ui';

/**
 * Receipt / bill copy.
 *
 * The paper preview is `ReceiptView` rendered into `#receipt-print`, whose 80 mm print
 * stylesheet lives in styles/index.css — nothing here touches its markup or its width, so
 * what comes out of the thermal printer is unchanged. On a phone the 80 mm column (≈ 302 px)
 * already fits inside the 390 px viewport via the view's own `max-w-full`, so the page needs
 * no horizontal scrolling; the phone work here is the action row, which stacks into
 * full-width touch targets instead of three cramped buttons beside the title.
 */
export default function ReceiptPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const q = useReceipt(Number(id));
  const m = useBillMutations();
  const canClose = usePermission('billing:close');
  if (q.isLoading) return <LoadingState variant="page" />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const r = q.data;
  const b = r.bill;
  return (
    <div className="max-w-3xl mx-auto pb-2">
      <PageHeader back={() => navigate(`/cashier/bills/${b.id}`)} title={<span className="flex items-center gap-3 flex-wrap">Receipt <StatusBadge kind="payment" status={b.paymentStatus} /></span>} subtitle={`${b.billNumber} · ${b.tableName}`}
        actions={
          <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:w-auto sm:items-center">
            <Button variant="outline" className="w-full sm:w-auto min-h-touch sm:min-h-0" leftIcon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate('/cashier')}>Cashier home</Button>
            <Button className="w-full sm:w-auto min-h-touch sm:min-h-0" leftIcon={<Printer className="h-4 w-4" />} onClick={() => void browserPrinter.print(r)}>Print</Button>
            {canClose && b.paymentStatus === 'PAID' && b.status !== 'CLOSED' && <Button variant="success" className="col-span-2 w-full sm:col-span-1 sm:w-auto min-h-touch sm:min-h-0" leftIcon={<CheckCircle2 className="h-4 w-4" />} loading={m.close.isPending} onClick={() => m.close.mutate(b.id, { onSuccess: () => navigate('/cashier') })}>Close order</Button>}
          </div>
        } />
      {b.paymentStatus !== 'PAID' && <p className="mb-3 text-sm text-warning-700 bg-warning-50 border border-warning-100 rounded-sm px-3 py-2">This is a bill copy — payment is still pending.</p>}
      {/* Names the narrow column on a phone, so the 80 mm paper width reads as intentional. */}
      <p className="sm:hidden text-caption text-neutral-500 text-center mb-2">80 mm thermal preview</p>
      <ReceiptView receipt={r} />
    </div>
  );
}
