import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { auditApi } from '@/services/api/endpoints';
import { useDateRange, DateRangeFilter } from '@/features/shared/DateRangeFilter';
import { PageHeader, Card, LoadingState, ErrorState, EmptyState, Badge, Button, FilterSelect } from '@/components/ui';
import { fmtDateTime } from '@/utils/date';

const ENTITIES = ['', 'ORDERS', 'ORDER_ITEMS', 'BILLS', 'PAYMENTS', 'DISCOUNTS', 'MENU_ITEMS', 'MENU_CATEGORIES', 'OFFERS', 'DINING_TABLES', 'FLOORS', 'USERS', 'ROLES', 'BRANCHES', 'TAX_CONFIGURATIONS'];

export default function AuditPage() {
  const dr = useDateRange('week');
  const [entity, setEntity] = useState('');
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['audit', dr.range, entity, page], queryFn: () => auditApi.list({ entity: entity || undefined, from: dr.range.from, to: dr.range.to, page, pageSize: 50 }) });
  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.pageSize)) : 1;
  return (
    <div>
      <PageHeader title="Audit log" subtitle="Every critical action with user, entity and before/after values">
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center"><DateRangeFilter state={dr} /><FilterSelect
          ariaLabel="Filter by entity" className="sm:w-52" value={entity}
          onChange={(e) => { setEntity(e.target.value); setPage(1); }}
          options={ENTITIES.map((e) => ({ value: e, label: e || 'All entities' }))}
        /></div>
      </PageHeader>
      {q.isLoading && <LoadingState variant="table" rows={8} />}
      {q.isError && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      {q.data && (q.data.items.length === 0 ? <Card><EmptyState title="No audit entries" description="Nothing recorded for this filter." /></Card> : (
        <Card padded={false}>
          <ul className="divide-y divide-neutral-100">{q.data.items.map((a) => (
            <li key={a.id} className="px-4 py-3 text-sm grid sm:grid-cols-[170px_1fr] gap-1 sm:gap-4">
              <div className="text-neutral-500 text-caption sm:text-sm">{fmtDateTime(a.createdAt)}<br className="hidden sm:block" /><span className="text-neutral-700">{a.userName ?? 'system'}</span></div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5"><Badge tone="primary" size="sm">{a.action}</Badge><span className="text-neutral-600">{a.entity}{a.entityId != null ? ` #${a.entityId}` : ''}</span></div>
                {(a.oldValue || a.newValue) && <p className="text-caption text-neutral-500 mt-1 font-mono break-all line-clamp-2">{a.oldValue ? `${a.oldValue} → ` : ''}{a.newValue}</p>}
              </div>
            </li>))}</ul>
          {pages > 1 && <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200 text-sm"><span>{q.data.total} entries</span><div className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button><span>{page} / {pages}</span><Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button></div></div>}
        </Card>
      ))}
    </div>
  );
}
