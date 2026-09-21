import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { BedDouble, Download, CheckCircle2, XCircle, Clock, Undo2 } from 'lucide-react';
import { useRoomCharges } from '@/features/p2/hooks';
import { useDateRange, DateRangeFilter } from '@/features/shared/DateRangeFilter';
import { useWorkspace } from '@/hooks/useSurface';
import { useBranch } from '@/components/layout/Shell';
import { PageHeader, StatCard, DataTable, Badge, Button, Alert, Card, FilterSelect, Tabs, LoadingState, ErrorState, EmptyState, type Column } from '@/components/ui';
import { money, round2 } from '@/utils/money';
import { fmtDate, fmtDateTime } from '@/utils/date';
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

/** The manager board's two views of the same fetched period. */
type BoardTab = 'CHARGES' | 'FOLIOS';

/** One room's account for the period, folded from the charges this branch actually posted. */
interface Folio { room: string; guest: string; charges: number; posted: number; unsettled: number; lastAt: string | null }

export default function RoomChargesPage() {
  const ws = useWorkspace();
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
  /* The room facet is built from the rows this period actually returned — there is no room
     directory endpoint, and a select listing rooms the venue may not have would be a fiction. */
  const roomOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.roomNo))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [rows],
  );
  const [room, setRoom] = useState('');
  const shown = useMemo(
    () => rows.filter((r) => (filter === 'ALL' || r.status === filter) && (!room || r.roomNo === room)),
    [rows, filter, room],
  );

  /*
   * COLUMNS. The reference panel shows a check-in and a check-out date beside the guest. A room
   * charge record holds neither: `room-charges` returns the room number, the guest name the PMS
   * answered with, the bill, the amount, the posting outcome and its reference. The folio's stay
   * dates live in the PMS and are never fetched here, so those two columns are absent rather
   * than filled with the posting date under a different name.
   */
  const columns: Column<RoomCharge>[] = [
    { key: 'room', header: 'Room', sortValue: (r) => r.roomNo, render: (r) => <span className="font-semibold tabular-nums">{r.roomNo}</span> },
    { key: 'guest', header: 'Guest', sortValue: (r) => r.guestName, render: (r) => <span className="block min-w-0 truncate text-neutral-900">{r.guestName}</span> },
    { key: 'bill', header: 'Bill', hideBelow: 'md', sortValue: (r) => r.billNumber, render: (r) => <span className="tabular-nums text-neutral-700">{r.billNumber}</span> },
    { key: 'when', header: 'Posted', hideBelow: 'md', sortValue: (r) => r.postedAt ?? '', render: (r) => <span className="whitespace-nowrap">{fmtDateTime(r.postedAt)}</span> },
    { key: 'amt', header: 'Charges', align: 'right', sortValue: (r) => r.amount, render: (r) => <span className={cn('tabular-nums font-medium', r.status === 'FAILED' ? 'text-danger-700' : r.status === 'REVERSED' ? 'text-neutral-500 line-through' : 'text-neutral-900')}>{money(r.amount)}</span> },
    /* The REAL posting state the record holds — never an optimistic success. */
    { key: 'status', header: 'Status', sortValue: (r) => r.status, render: (r) => <Outcome r={r} /> },
    { key: 'ref', header: 'PMS reference', hideBelow: 'lg', render: (r) => <span className="text-caption font-mono text-neutral-500">{r.pmsReference ?? '—'}</span> },
    {
      key: 'act', header: <span className="sr-only">Actions</span>, align: 'right',
      render: (r) => <Button size="sm" variant="outline" aria-label={`Open bill ${r.billNumber} for room ${r.roomNo}`} onClick={() => navigate(`/cashier/bills/${r.billId}`)}>Open bill</Button>,
    },
  ];

  /* ------------------------------------------------------------------ the manager board (27)
   *
   * COLUMNS. The board draws date · room · guest · description · amount · posted by. Four of
   * those six are real fields on a `RoomCharge` and lead the table below. The other two are not
   * in the record at all: it carries no free-text description (the bill it came from is the only
   * thing that says WHAT was charged, so the bill number takes that place under its own header)
   * and no posting user — the post is made by the PMS adapter, not by a named operator, and the
   * payload has no user id to print. Neither was invented; both are simply absent.
   *
   * FOLIOS. There is no folio endpoint in this product — a folio lives in the PMS and is never
   * fetched. So the second tab is not a claim to hold folios: it is exactly the rows already on
   * this page, folded by the room they were posted to, and its caption says so. Every figure in
   * it is a sum of `amount` on real charges of a real status.
   */
  const [tab, setTab] = useState<BoardTab>('CHARGES');

  const folios = useMemo(() => {
    const m = new Map<string, Folio>();
    [...rows]
      .sort((a, b) => (a.postedAt ?? '').localeCompare(b.postedAt ?? ''))
      .forEach((r) => {
        const f = m.get(r.roomNo) ?? { room: r.roomNo, guest: r.guestName, charges: 0, posted: 0, unsettled: 0, lastAt: null };
        f.guest = r.guestName;
        f.charges += 1;
        if (r.status === 'POSTED') f.posted += r.amount;
        if (r.status === 'FAILED' || r.status === 'PENDING') f.unsettled += r.amount;
        if (r.postedAt && (!f.lastAt || r.postedAt > f.lastAt)) f.lastAt = r.postedAt;
        m.set(r.roomNo, f);
      });
    return [...m.values()]
      .map((f) => ({ ...f, posted: round2(f.posted), unsettled: round2(f.unsettled) }))
      .sort((a, b) => b.posted - a.posted || a.room.localeCompare(b.room, undefined, { numeric: true }));
  }, [rows]);

  const managerColumns: Column<RoomCharge>[] = [
    { key: 'when', header: 'Date', sortValue: (r) => r.postedAt ?? '', render: (r) => <span className="whitespace-nowrap text-neutral-700">{r.postedAt ? fmtDateTime(r.postedAt) : 'Not posted yet'}</span> },
    { key: 'room', header: 'Room', sortValue: (r) => r.roomNo, render: (r) => <span className="font-semibold tabular-nums">{r.roomNo}</span> },
    { key: 'guest', header: 'Guest', sortValue: (r) => r.guestName, render: (r) => <span className="block min-w-0 truncate text-neutral-900">{r.guestName}</span> },
    { key: 'bill', header: 'Bill charged', hideBelow: 'md', sortValue: (r) => r.billNumber, render: (r) => <span className="tabular-nums text-neutral-700">{r.billNumber}</span> },
    { key: 'amt', header: 'Amount', align: 'right', sortValue: (r) => r.amount, render: (r) => <span className={cn('tabular-nums font-medium', r.status === 'FAILED' ? 'text-danger-700' : r.status === 'REVERSED' ? 'text-neutral-500 line-through' : 'text-neutral-900')}>{money(r.amount)}</span> },
    { key: 'status', header: 'Status', sortValue: (r) => r.status, render: (r) => <Outcome r={r} /> },
    {
      key: 'act', header: <span className="sr-only">Actions</span>, align: 'right',
      render: (r) => <Button size="sm" variant="outline" aria-label={`Open bill ${r.billNumber} for room ${r.roomNo}`} onClick={() => navigate(`/cashier/bills/${r.billId}`)}>Open bill</Button>,
    },
  ];

  const folioColumns: Column<Folio>[] = [
    { key: 'room', header: 'Room', sortValue: (f) => f.room, render: (f) => <span className="font-semibold tabular-nums">{f.room}</span> },
    { key: 'guest', header: 'Latest guest', sortValue: (f) => f.guest, render: (f) => <span className="block min-w-0 truncate text-neutral-900">{f.guest}</span> },
    { key: 'charges', header: 'Charges', align: 'right', sortValue: (f) => f.charges, render: (f) => <span className="tabular-nums">{f.charges}</span> },
    { key: 'posted', header: 'Posted to folio', align: 'right', sortValue: (f) => f.posted, render: (f) => <span className="tabular-nums font-medium text-neutral-900">{money(f.posted)}</span> },
    { key: 'unsettled', header: 'Not settled', align: 'right', hideBelow: 'md', sortValue: (f) => f.unsettled, render: (f) => (f.unsettled > 0 ? <span className="tabular-nums font-semibold text-danger-700">{money(f.unsettled)}</span> : <span className="tabular-nums text-neutral-500">{money(0)}</span>) },
    { key: 'last', header: 'Last posting', hideBelow: 'lg', sortValue: (f) => f.lastAt ?? '', render: (f) => (f.lastAt ? <span className="whitespace-nowrap text-neutral-700">{fmtDate(f.lastAt)}</span> : <span className="text-neutral-400">—</span>) },
  ];

  return (
    <div>
      <PageHeader
        title="Room charges"
        subtitle={`Bills posted to hotel folios via the ${branch?.pmsProvider ?? '…'} PMS adapter`}
        actions={<Button leftIcon={<Download className="h-4 w-4" />} disabled={!shown.length} aria-label="Export the room charges shown as CSV" onClick={() => downloadCsv('room-charges', shown)}>CSV</Button>}
      >
        {/* THE FILTER ROW. Only controls that are actually wired: the date range the query is
            made with, and two client-side facets over the rows it returned. There is no room
            directory and no PMS-side filter, so nothing here pretends to reach further. */}
        <Card className="flex flex-wrap items-end gap-3 min-w-0">
          <div className="min-w-0">
            <p className="text-label uppercase text-neutral-500 mb-1.5">Period</p>
            <DateRangeFilter state={dr} />
          </div>
          <div className="min-w-0">
            <p className="text-label uppercase text-neutral-500 mb-1.5">Room</p>
            <FilterSelect
              ariaLabel="Filter room charges by room"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              placeholder={`All rooms (${roomOptions.length})`}
              options={roomOptions.map((n) => ({ value: n, label: `Room ${n}` }))}
              className="h-9 min-h-0 w-auto text-sm"
            />
          </div>
          <div className="min-w-0">
            <p className="text-label uppercase text-neutral-500 mb-1.5">Posting status</p>
            <FilterSelect
              ariaLabel="Filter room charges by posting status"
              value={filter}
              onChange={(e) => setFilter(e.target.value as 'ALL' | Status)}
              options={[
                { value: 'ALL', label: `All outcomes (${rows.length})` },
                { value: 'POSTED', label: `Posted to folio (${posted.length})` },
                { value: 'FAILED', label: `Rejected by PMS (${failed.length})` },
                { value: 'PENDING', label: `Awaiting PMS (${pending.length})` },
                { value: 'REVERSED', label: `Reversed (${reversed.length})` },
              ]}
              className="h-9 min-h-0 w-auto text-sm"
            />
          </div>
          <p className="text-caption text-neutral-500 tabular-nums ml-auto self-center">{shown.length} of {rows.length} charge{rows.length === 1 ? '' : 's'} in this period</p>
        </Card>
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

      {ws === 'manager' && (
        <Tabs<BoardTab>
          className="mb-4"
          ariaLabel="Room charge views"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'CHARGES', label: 'Posted charges', count: shown.length },
            { value: 'FOLIOS', label: 'Folios', count: folios.length },
          ]}
        />
      )}

      {ws === 'manager' && tab === 'FOLIOS' && (
        q.isLoading ? <LoadingState variant="table" rows={5} />
        : q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        : folios.length === 0 ? (
          <Card padded={false}>
            <EmptyState
              icon={<BedDouble className="h-6 w-6" />}
              title="No room charges in this period"
              description="A folio appears here as soon as a bill is charged to its room from the payment screen."
            />
          </Card>
        ) : (
          <DataTable
            columns={folioColumns}
            rows={folios}
            rowKey={(f) => f.room}
            pageSize={25}
            initialSort={{ key: 'posted', dir: 'desc' }}
            caption="Rooms charged in the selected period, with how many charges each took, what was posted to the folio and what is still unsettled"
            toolbar={
              <p className="text-sm text-neutral-600 px-1">
                <span className="font-semibold text-neutral-900 tabular-nums">{folios.length}</span> room{folios.length === 1 ? '' : 's'} charged · folded from the {rows.length} charge{rows.length === 1 ? '' : 's'} on this page
              </p>
            }
            mobileCard={(f) => (
              <div className="space-y-1.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-neutral-900">Room {f.room}</p>
                    <p className="text-caption text-neutral-500 truncate">{f.guest}</p>
                  </div>
                  <span className="tabular-nums font-semibold shrink-0 text-neutral-900">{money(f.posted)}</span>
                </div>
                <p className="text-caption text-neutral-500 tabular-nums">
                  {f.charges} charge{f.charges === 1 ? '' : 's'}{f.unsettled > 0 ? ` · ${money(f.unsettled)} not settled` : ''}{f.lastAt ? ` · last ${fmtDate(f.lastAt)}` : ''}
                </p>
              </div>
            )}
            emptyTitle="No room charges in this period"
          />
        )
      )}

      {(ws !== 'manager' || tab === 'CHARGES') && (
      q.isLoading ? <LoadingState variant="table" rows={5} /> : q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : (
        <DataTable
          columns={ws === 'manager' ? managerColumns : columns}
          rows={shown}
          rowKey={(r) => r.id}
          pageSize={25}
          initialSort={{ key: 'when', dir: 'desc' }}
          caption="Room charges posted to hotel folios in the selected period, with room, guest, bill, amount and the posting outcome the record holds"
          toolbar={
            <p className="text-sm text-neutral-600 px-1">
              Newest posting first{room ? ` · room ${room}` : ''}{filter !== 'ALL' ? ` · ${OUTCOME[filter].label.toLowerCase()}` : ''}
            </p>
          }
          mobileCard={(r) => (
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-neutral-900">Room {r.roomNo}</p>
                  <p className="text-caption text-neutral-500 truncate">{r.guestName} · {r.billNumber}</p>
                </div>
                <span className={cn('tabular-nums font-semibold shrink-0', r.status === 'FAILED' ? 'text-danger-700' : r.status === 'REVERSED' ? 'text-neutral-500 line-through' : 'text-neutral-900')}>{money(r.amount)}</span>
              </div>
              <Outcome r={r} />
              <p className="text-caption text-neutral-500">{fmtDateTime(r.postedAt)}{r.pmsReference ? ` · ref ${r.pmsReference}` : ''}</p>
              <Button size="sm" variant="outline" className="min-h-touch" onClick={() => navigate(`/cashier/bills/${r.billId}`)}>Open bill {r.billNumber}</Button>
            </div>
          )}
          emptyTitle={filter === 'ALL' ? 'No room charges in this period' : `No ${OUTCOME[filter].label.toLowerCase()} charges in this period`}
          emptyDescription={filter === 'ALL' ? 'Cashiers post a finalized bill to a room from the payment screen (Charge to room).' : 'Switch back to All to see every charge in the period.'}
        />
      )
      )}
    </div>
  );
}
