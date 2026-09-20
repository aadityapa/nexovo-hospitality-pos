import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Download, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { useMovements } from '@/features/p2/hooks';
import { MovementForm } from './InventoryForms';
import { usePermission } from '@/hooks/useAuth';
import { useRealtimeInvalidate } from '@/hooks/useRealtime';
import { useDateRange, DateRangeFilter } from '@/features/shared/DateRangeFilter';
import { PageHeader, Button, DataTable, Badge, LoadingState, ErrorState, SegmentedControl, type Column, FilterSelect } from '@/components/ui';
import { money } from '@/utils/money';
import { fmtDateTime } from '@/utils/date';
import { MOVEMENT_LABELS } from '@/config/statuses';
import { cn } from '@/utils/cn';
import type { StockMovement, MovementType, ManualMovementType } from '@/types';

type Direction = '' | 'IN' | 'OUT';

export default function StockMovementsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const canAdjust = usePermission('inventory:adjust');
  const dr = useDateRange('week');
  const [type, setType] = useState<'' | MovementType>('');
  const [dir, setDir] = useState<Direction>('');
  const q = useMovements({ type: type || undefined, from: dr.range.from, to: dr.range.to, limit: 500 });
  const newType = params.get('new') as ManualMovementType | null;
  const [open, setOpen] = useState(!!newType);
  useRealtimeInvalidate(['inventory']);

  const all = useMemo(() => q.data ?? [], [q.data]);
  const inCount = useMemo(() => all.filter((m) => m.qty > 0).length, [all]);
  const outCount = all.length - inCount;
  // Direction is a view of the rows already fetched — no extra request.
  const rows = useMemo(() => (dir === '' ? all : all.filter((m) => (dir === 'IN' ? m.qty > 0 : m.qty < 0))), [all, dir]);

  /** Direction is stated twice: an arrow and the words "In"/"Out", never colour alone. */
  const DirectionCell = ({ m }: { m: StockMovement }) => {
    const inbound = m.qty > 0;
    return (
      <span className={cn('inline-flex items-center gap-1.5 font-semibold tabular-nums whitespace-nowrap', inbound ? 'text-success-700' : 'text-danger-700')}>
        {inbound ? <ArrowDownLeft className="h-4 w-4 shrink-0" aria-hidden /> : <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden />}
        <span className="text-label uppercase">{inbound ? 'In' : 'Out'}</span>
        <span>{inbound ? '+' : '−'}{Math.abs(m.qty)} {m.unitCode}</span>
      </span>
    );
  };

  const columns: Column<StockMovement>[] = [
    { key: 'when', header: 'When', sortValue: (m) => m.createdAt, render: (m) => <span className="text-neutral-600 whitespace-nowrap">{fmtDateTime(m.createdAt)}</span> },
    { key: 'item', header: 'Item', sortValue: (m) => m.itemName, render: (m) => <button type="button" className="font-medium text-left text-neutral-900 hover:text-primary-700 hover:underline underline-offset-2" onClick={(e) => { e.stopPropagation(); navigate(`/admin/inventory/items/${m.invItemId}`); }}>{m.itemName}</button> },
    { key: 'type', header: 'Type', sortValue: (m) => m.type, render: (m) => <Badge size="sm" tone={m.qty > 0 ? 'success' : m.type === 'WASTAGE' || m.type === 'DAMAGE' ? 'danger' : 'neutral'}>{MOVEMENT_LABELS[m.type]}</Badge> },
    { key: 'qty', header: 'Direction / qty', align: 'right', sortValue: (m) => m.qty, render: (m) => <DirectionCell m={m} /> },
    { key: 'before', header: 'Balance', align: 'right', hideBelow: 'lg', sortValue: (m) => m.qtyAfter, render: (m) => <span className="tabular-nums text-neutral-600 whitespace-nowrap">{m.qtyBefore} → <span className="text-neutral-900 font-medium">{m.qtyAfter}</span></span> },
    { key: 'cost', header: 'Cost', align: 'right', hideBelow: 'md', sortValue: (m) => m.totalCost, render: (m) => <span className="tabular-nums">{money(m.totalCost)}</span> },
    { key: 'reason', header: 'Reason', hideBelow: 'lg', render: (m) => <span className="text-neutral-600">{m.refType ? `${m.refType} #${m.refId ?? ''} · ` : ''}{m.reason ?? '—'}</span> },
    { key: 'by', header: 'By', hideBelow: 'lg', render: (m) => <span className="text-neutral-600 whitespace-nowrap">{m.createdByName ?? 'system'}</span> },
  ];

  const exportCsv = () => {
    if (!rows.length) return;
    const csv = ['when,item,type,qty,unit,before,after,cost,reason,by', ...rows.map((m) => [m.createdAt, m.itemName, m.type, m.qty, m.unitCode, m.qtyBefore, m.qtyAfter, m.totalCost, m.reason ?? '', m.createdByName ?? ''].map((v) => JSON.stringify(v ?? '')).join(','))].join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'stock-movements.csv'; a.click();
  };

  return (
    <div>
      <PageHeader title="Stock movements" subtitle="Audit trail — purchases, consumption, wastage and adjustments, newest first" actions={<><Button variant="outline" leftIcon={<Download className="h-4 w-4" />} onClick={exportCsv} disabled={!rows.length}>CSV</Button>{canAdjust && <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>Record movement</Button>}</>}>
        <div className="flex flex-col xl:flex-row gap-2 xl:items-center">
          <DateRangeFilter state={dr} />
          <SegmentedControl
            ariaLabel="Filter by direction" size="sm" value={dir} onChange={setDir}
            options={[
              { value: '', label: 'All', count: all.length },
              { value: 'IN', label: <span className="inline-flex items-center gap-1"><ArrowDownLeft className="h-3.5 w-3.5" aria-hidden />Stock in</span>, ariaLabel: 'Stock in', count: inCount },
              { value: 'OUT', label: <span className="inline-flex items-center gap-1"><ArrowUpRight className="h-3.5 w-3.5" aria-hidden />Stock out</span>, ariaLabel: 'Stock out', count: outCount },
            ]}
          />
          <FilterSelect
            ariaLabel="Filter by movement type" className="xl:w-56" value={type} placeholder="All types"
            onChange={(e) => { setType(e.target.value as '' | MovementType); }}
            options={(Object.keys(MOVEMENT_LABELS) as MovementType[]).map((t) => ({ value: t, label: MOVEMENT_LABELS[t] }))}
          />
        </div>
      </PageHeader>
      {q.isLoading && <LoadingState variant="table" rows={10} />}
      {q.isError && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      {q.data && (
        <DataTable
          columns={columns} rows={rows} rowKey={(m) => m.id} pageSize={50} dense
          initialSort={{ key: 'when', dir: 'desc' }}
          caption="Stock movement audit log: date, item, movement type, direction, quantity, resulting balance and who recorded it"
          toolbar={
            <p className="px-1 text-sm text-neutral-600">
              <span className="font-semibold text-neutral-900 tabular-nums">{rows.length}</span> movement{rows.length === 1 ? '' : 's'}
              {dir === '' && all.length > 0 && (
                <span className="text-neutral-500"> · {inCount} in · {outCount} out</span>
              )}
              {type && <span className="text-neutral-500"> · {MOVEMENT_LABELS[type]}</span>}
            </p>
          }
          emptyTitle={dir || type ? 'No movements match these filters' : 'No movements in this period'}
          emptyDescription={dir || type ? 'Widen the date range or clear the type and direction filters.' : undefined}
          emptyAction={dir || type ? <Button variant="outline" onClick={() => { setDir(''); setType(''); }}>Clear filters</Button> : undefined}
          mobileCard={(m) => (
            <div className="space-y-1.5">
              <div className="flex items-start justify-between gap-3">
                <button type="button" className="font-medium text-left text-neutral-900 hover:underline min-w-0 truncate" onClick={() => navigate(`/admin/inventory/items/${m.invItemId}`)}>{m.itemName}</button>
                <DirectionCell m={m} />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge size="sm" tone={m.qty > 0 ? 'success' : m.type === 'WASTAGE' || m.type === 'DAMAGE' ? 'danger' : 'neutral'}>{MOVEMENT_LABELS[m.type]}</Badge>
                <span className="text-caption text-neutral-500">balance {m.qtyBefore} → {m.qtyAfter} · {money(m.totalCost)}</span>
              </div>
              <p className="text-caption text-neutral-500">{fmtDateTime(m.createdAt)} · {m.createdByName ?? 'system'}{m.reason ? ` · ${m.reason}` : ''}</p>
            </div>
          )}
        />
      )}
      {open && <MovementForm defaultType={newType ?? 'WASTAGE'} onClose={() => { setOpen(false); setParams((p) => { p.delete('new'); return p; }); }} />}
    </div>
  );
}
