import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFloors, useTables } from '@/features/tables/hooks';
import { TableGrid, TableStatusLegend } from '@/features/tables/TableGrid';
import { useAuth } from '@/hooks/useAuth';
import { useDebounce } from '@/hooks/useRealtime';
import { PageHeader, SearchInput, SegmentedControl, LoadingState, ErrorState, Switch } from '@/components/ui';

/** Waiter table selection — large touch tiles, "my tables" filter, instant search. */
export default function WaiterTablesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const floors = useFloors();
  const [floorId, setFloorId] = useState<number | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const dq = useDebounce(search, 200);
  const [mineOnly, setMineOnly] = useState(false);
  const tables = useTables({ floorId: floorId === 'ALL' ? undefined : floorId, search: dq || undefined });
  const list = (tables.data ?? []).filter((t) => !mineOnly || t.assignedWaiterId === user?.id);

  return (
    <div>
      <PageHeader title="Select table" subtitle="Tap a table to open its order or start a new one">
        <div className="flex flex-col gap-3">
          <div className="flex gap-3 items-center">
            <SearchInput value={search} onChange={setSearch} placeholder="Table number" className="flex-1 sm:max-w-xs" />
            <Switch checked={mineOnly} onChange={setMineOnly} label="My tables" />
          </div>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <SegmentedControl
              ariaLabel="Filter by area"
              value={String(floorId)}
              onChange={(v) => setFloorId(v === 'ALL' ? 'ALL' : Number(v))}
              options={[{ value: 'ALL', label: 'All areas' }, ...(floors.data ?? []).map((f) => ({ value: String(f.id), label: f.name }))]}
            />
            <div className="sm:ml-auto"><TableStatusLegend /></div>
          </div>
        </div>
      </PageHeader>

      {tables.isLoading && <LoadingState variant="cards" rows={3} />}
      {tables.isError && <ErrorState error={tables.error} onRetry={() => void tables.refetch()} />}
      {tables.data && (
        <TableGrid
          tables={list}
          floors={floors.data}
          size="lg"
          onSelect={(t) => navigate(t.activeOrderId && t.status !== 'AVAILABLE' ? `/waiter/orders/${t.activeOrderId}` : `/waiter/tables/${t.id}`)}
          emptyTitle={mineOnly ? 'No tables assigned to you' : search ? `No table matches “${search}”` : 'No tables'}
        />
      )}
    </div>
  );
}
