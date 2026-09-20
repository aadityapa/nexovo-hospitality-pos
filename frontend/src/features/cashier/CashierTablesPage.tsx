import { useNavigate } from 'react-router-dom';
import { useFloors, useTables } from '@/features/tables/hooks';
import { TableGrid, TableStatusLegend } from '@/features/tables/TableGrid';
import { PageHeader, LoadingState, ErrorState } from '@/components/ui';
import { toast } from '@/store/uiStore';

/** Cashier table view: tap an occupied table to open/generate its bill. */
export default function CashierTablesPage() {
  const navigate = useNavigate();
  const floors = useFloors();
  const tables = useTables();
  return (
    <div>
      <PageHeader title="Tables" subtitle="Tap a table to open its bill"><TableStatusLegend /></PageHeader>
      {tables.isLoading && <LoadingState variant="cards" rows={3} />}
      {tables.isError && <ErrorState error={tables.error} onRetry={() => void tables.refetch()} />}
      {tables.data && <TableGrid tables={tables.data} floors={floors.data} onSelect={(t) => { if (!t.activeOrderId) { toast.info(`${t.name} has no active order`); return; } if (t.activeOrderStatus === 'DRAFT') { toast.warning('Order is still a draft', 'The waiter must send it first.'); return; } navigate(`/cashier/orders/${t.activeOrderId}/bill`); }} />}
    </div>
  );
}
