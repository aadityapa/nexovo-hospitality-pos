import { useNavigate, useParams } from 'react-router-dom';
import { Printer, CheckCircle2, ArrowLeft } from 'lucide-react';
import { useReceipt, useBillMutations } from './hooks';
import { ReceiptView, browserPrinter } from './ReceiptView';
import { usePermission } from '@/hooks/useAuth';
import { PageHeader, Button, LoadingState, ErrorState, StatusBadge } from '@/components/ui';

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
    <div className="max-w-3xl mx-auto">
      <PageHeader back={() => navigate(`/cashier/bills/${b.id}`)} title={<span className="flex items-center gap-3">Receipt <StatusBadge kind="payment" status={b.paymentStatus} /></span>} subtitle={`${b.billNumber} · ${b.tableName}`}
        actions={<>
          <Button variant="outline" leftIcon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate('/cashier')}>Cashier home</Button>
          <Button leftIcon={<Printer className="h-4 w-4" />} onClick={() => void browserPrinter.print(r)}>Print</Button>
          {canClose && b.paymentStatus === 'PAID' && b.status !== 'CLOSED' && <Button variant="success" leftIcon={<CheckCircle2 className="h-4 w-4" />} loading={m.close.isPending} onClick={() => m.close.mutate(b.id, { onSuccess: () => navigate('/cashier') })}>Close order</Button>}
        </>} />
      {b.paymentStatus !== 'PAID' && <p className="mb-3 text-sm text-warning-700 bg-warning-50 border border-warning-100 rounded-sm px-3 py-2">This is a bill copy — payment is still pending.</p>}
      <ReceiptView receipt={r} />
    </div>
  );
}
