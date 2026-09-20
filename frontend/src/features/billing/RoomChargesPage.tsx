import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { BedDouble, Download, CheckCircle2, XCircle, Clock, Undo2 } from 'lucide-react';
import { useRoomCharges } from '@/features/p2/hooks';
import { useDateRange, DateRangeFilter } from '@/features/shared/DateRangeFilter';
import { useBranch } from '@/components/layout/Shell';
import { PageHeader, StatCard, DataTable, Badge, Button, Alert, SegmentedControl, LoadingState, ErrorState, type Column } from '@/components/ui';
import { money } from '@/utils/money';
import { fmtDateTime } from '@/utils/date';
import { downloadCsv } from '@/utils/csv';
import { cn } from '@/utils/cn';
import type { RoomCharge } from '@/types';

type Status = RoomCharge['status'];

/**
 * Posting outcome in words, not the raw enum: a cashier needs to know whether the folio
 * actually took the charge, and colour alone never says that.
 */
const OUTCOME: Record<Status, { tone: 'success' | 'danger' | 'warning' | 'neutral'; label: string; icon: ReactNode }> = {
  POSTED:   { tone: 'success', label: 'Posted to folio',  icon: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> },
  FAILED:   { tone: 'danger',  label: 'Rejected by PMS',  icon: <XCircle className="h-3.5 w-3.5" aria-hidden /> },
  PENDING:  { tone: 'warning', label: 'Awaiting PMS',     icon: <Clock className="h-3.5 w-3.5" aria-hidden /> },
  REVERSED: { tone: 'neutral', label: 'Reversed',         icon: <Undo2 className="h-3.5 w-3.5" aria-hidden /> },
};

function Outcome({ r }: { r: RoomCharge }) {
  const o = OUTCOME[r.status];
  return (
    <span>
      <Badge tone={o.tone} icon={o.icon}>{o.label}</Badge>
      {r.failureReason && <span className="block text-caption text-danger-700 mt-1 max-w-[16rem]">{r.failureReason}</span>}
    </span>
  );
}

export default function RoomChargesPage() {
  const navigate = useNavigate();
  const dr = useDateRange('month');
  const q = useRoomCharges(dr.range);
  const { data: branch } = useBranch();
  const rows = q.data ?? [];
  const posted = rows.filter((r) => r.status === 'POSTED');
  const failed = rows.filter((r) => r.status === 'FAILED');
  const pending = rows.filter((r) => r.status === 'PENDING');
  const reversed = rows.filter((r) => r.status === 'REVERSED');
  const [filter, setFilter] = useState<'ALL' | Status>('ALL');
  const shown = useMemo(() => (filter === 'ALL' ? rows : rows.filter((r) => r.status === filter)), [rows, filter]);

  const columns: Column<RoomCharge>[] = [
    { key: 'when', header: 'Posted', sortValue: (r) => r.postedAt ?? '', render: (r) => <span className="whitespace-nowrap">{fmtDateTime(r.postedAt)}</span> },
    { key: 'room', header: 'Room', sortValue: (r) => r.roomNo, render: (r) => <span className="font-semibold tabular-nums">{r.roomNo}</span> },
    { key: 'guest', header: 'Guest', sortValue: (r) => r.guestName, render: (r) => r.guestName },
    { key: 'bill', header: 'Bill', hideBelow: 'md', render: (r) => <button type="button" className="text-primary-700 hover:underline" onClick={() => navigate(`/cashier/bills/${r.billId}`)}>{r.billNumber}</button> },
    { key: 'amt', header: 'Amount', align: 'right', sortValue: (r) => r.amount, render: (r) => <span className={cn('tabular-nums font-medium', r.status === 'FAILED' && 'text-danger-700', r.status === 'REVERSED' && 'text-neutral-400 line-through')}>{money(r.amount)}</span> },
    { key: 'status', header: 'Outcome', sortValue: (r) => r.status, render: (r) => <Outcome r={r} /> },
    { key: 'ref', header: 'PMS reference', hideBelow: 'lg', render: (r) => <span className="text-caption font-mono">{r.pmsReference ?? '—'}</span> },
  ];

  return (
    <div>
      <PageHeader
        title="Room charges"
        subtitle={`Bills posted to hotel folios via the ${branch?.pmsProvider ?? '…'} PMS adapter`}
        actions={<Button variant="outline" leftIcon={<Download className="h-4 w-4" />} disabled={!shown.length} onClick={() => downloadCsv('room-charges', shown)}>CSV</Button>}
      >
        <DateRangeFilter state={dr} />
      </PageHeader>

      {/* A rejected folio post means money nobody has collected — it leads the page. */}
      {failed.length > 0 && (
        <Alert tone="danger" className="mb-4" title={`${failed.length} charge${failed.length === 1 ? '' : 's'} were rejected by the PMS`} action={filter !== 'FAILED' ? <Button size="sm" variant="outline" onClick={() => setFilter('FAILED')}>Show them</Button> : undefined}>
          {money(failed.reduce((a, r) => a + r.amount, 0))} across room{failed.length === 1 ? '' : 's'} {Array.from(new Set(failed.map((r) => r.roomNo))).slice(0, 6).join(', ')}. These bills are still unsettled — take another tender on the bill.
        </Alert>
      )}
      {pending.length > 0 && (
        <Alert tone="warning" className="mb-4" title={`${pending.length} charge${pending.length === 1 ? ' is' : 's are'} still awaiting the PMS`}>
          The folio has not confirmed {pending.length === 1 ? 'this post' : 'these posts'} yet. Do not treat {pending.length === 1 ? 'it' : 'them'} as settled until the outcome reads “Posted to folio”.
        </Alert>
      )}

      <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard label="Posted to folios" value={money(posted.reduce((a, r) => a + r.amount, 0))} icon={<BedDouble className="h-5 w-5" />} tone="success" hint={`${posted.length} charge${posted.length === 1 ? '' : 's'} confirmed`} onClick={() => setFilter('POSTED')} />
        <StatCard label="Rejected" value={failed.length} icon={<XCircle className="h-5 w-5" />} tone="danger" hint={failed.length ? `${money(failed.reduce((a, r) => a + r.amount, 0))} unsettled` : 'PMS rejected or offline'} onClick={() => setFilter('FAILED')} />
        <StatCard label="Reversed" value={reversed.length} icon={<Undo2 className="h-5 w-5" />} tone="neutral" hint="payment voided after posting" onClick={() => setFilter('REVERSED')} />
        <StatCard label="PMS provider" value={branch?.pmsProvider ?? '—'} tone="info" hint="Configured in Settings" />
      </div>

      {q.isLoading ? <LoadingState variant="table" rows={5} /> : q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : (
        <DataTable
          columns={columns}
          rows={shown}
          rowKey={(r) => r.id}
          pageSize={25}
          initialSort={{ key: 'when', dir: 'desc' }}
          caption="Room charges posted to hotel folios in the selected period"
          toolbar={
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <SegmentedControl
                size="sm"
                value={filter}
                onChange={setFilter}
                ariaLabel="Filter room charges by outcome"
                options={[
                  { value: 'ALL', label: 'All', count: rows.length },
                  { value: 'POSTED', label: 'Posted', count: posted.length },
                  { value: 'FAILED', label: 'Rejected', count: failed.length },
                  { value: 'PENDING', label: 'Awaiting', count: pending.length },
                  { value: 'REVERSED', label: 'Reversed', count: reversed.length },
                ]}
              />
              <span className="text-caption text-neutral-500 sm:ml-auto tabular-nums">{shown.length} of {rows.length} in this period</span>
            </div>
          }
          mobileCard={(r) => (
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-neutral-900">Room {r.roomNo}</p>
                  <p className="text-caption text-neutral-500 truncate">{r.guestName} · {r.billNumber}</p>
                </div>
                <span className={cn('tabular-nums font-semibold shrink-0', r.status === 'FAILED' && 'text-danger-700', r.status === 'REVERSED' && 'text-neutral-400 line-through')}>{money(r.amount)}</span>
              </div>
              <Outcome r={r} />
              <p className="text-caption text-neutral-500">{fmtDateTime(r.postedAt)}{r.pmsReference ? ` · ref ${r.pmsReference}` : ''}</p>
              <Button size="sm" variant="outline" className="min-h-touch" onClick={() => navigate(`/cashier/bills/${r.billId}`)}>Open bill {r.billNumber}</Button>
            </div>
          )}
          emptyTitle={filter === 'ALL' ? 'No room charges in this period' : `No ${OUTCOME[filter].label.toLowerCase()} charges in this period`}
          emptyDescription={filter === 'ALL' ? 'Cashiers post a finalized bill to a room from the payment screen (Charge to room).' : 'Switch back to All to see every charge in the period.'}
        />
      )}
    </div>
  );
}
