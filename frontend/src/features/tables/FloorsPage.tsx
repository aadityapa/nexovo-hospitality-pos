import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, Trash2, Layers, LayoutGrid, ChevronRight, CheckCircle2, Circle, AlertTriangle, Armchair } from 'lucide-react';
import { useFloors, useTables, useTableMutations } from './hooks';
import { useWorkspace } from '@/hooks/useSurface';
import { PageHeader, Button, IconButton, Modal, ConfirmDialog, Input, Switch, Badge, LoadingState, ErrorState, EmptyState, Card } from '@/components/ui';
import { VenueArt } from '@/components/graphics';
import { Reveal, staggerDelay } from '@/components/motion';
import { ApiError } from '@/services/api/client';
import { cn } from '@/utils/cn';
import type { DiningTable, Floor, FloorInput } from '@/types';

const schema = z.object({ name: z.string().trim().min(2).max(100), code: z.string().trim().max(20).optional(), displayOrder: z.coerce.number().int().min(0), isActive: z.boolean() });
type Form = z.infer<typeof schema>;

function FloorForm({ onClose, editing }: { onClose: () => void; editing: Floor | null }) {
  const { saveFloor } = useTableMutations();
  const { register, handleSubmit, watch, setValue, setError, formState: { errors } } = useForm<Form>({ resolver: zodResolver(schema), values: { name: editing?.name ?? '', code: editing?.code ?? '', displayOrder: editing?.displayOrder ?? 0, isActive: editing?.isActive ?? true } });
  const onSubmit = async (v: Form) => {
    const body: FloorInput = { name: v.name, code: v.code || undefined, displayOrder: v.displayOrder, isActive: v.isActive };
    try { await saveFloor.mutateAsync({ id: editing?.id ?? null, body }); onClose(); } catch (e) { const err = ApiError.from(e); setError('name', { message: err.message }); }
  };
  return (
    <Modal
      open onClose={onClose}
      title={editing ? `Edit “${editing.name}”` : 'New floor / area'}
      description="Areas group tables inside this branch. Every table belongs to exactly one area."
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={handleSubmit(onSubmit)} loading={saveFloor.isPending}>{editing ? 'Save changes' : 'Create area'}</Button></>}
    >
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Input label="Name" required autoFocus placeholder="Main Dining, Rooftop, VIP Lounge" error={errors.name?.message} {...register('name')} />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Code" placeholder="Auto" hint="Short identifier, must be unique" error={errors.code?.message} {...register('code')} />
          <Input label="Display order" type="number" min={0} hint="Lower numbers are listed first" error={errors.displayOrder?.message} {...register('displayOrder')} />
        </div>
        <Switch checked={watch('isActive')} onChange={(v) => setValue('isActive', v)} label="Active" description="Inactive areas stay in the system with their tables, but are no longer offered as a working section." />
      </form>
    </Modal>
  );
}

/**
 * AN AREA'S OCCUPANCY, COUNTED FROM ITS OWN TABLES (board 02 panel 08).
 *
 * Every figure is a length of real rows from the same `useTables()` read the floor plan is drawn
 * from. A table that is `CLOSED` is out of service, so it is excluded from BOTH sides of the
 * fraction rather than quietly deflating the percentage; the closed count is printed separately.
 * There is no reserved state in this product — `TableStatus` has none — so none is drawn.
 */
interface Occupancy { occupied: number; available: number; closed: number; serviceable: number; pct: number }

function occupancyOf(tables: DiningTable[]): Occupancy {
  const closed = tables.filter((t) => t.status === 'CLOSED').length;
  const serviceable = tables.length - closed;
  const available = tables.filter((t) => t.status === 'AVAILABLE').length;
  const occupied = serviceable - available;
  return { occupied, available, closed, serviceable, pct: serviceable > 0 ? occupied / serviceable : 0 };
}

/**
 * The ring. An arc of a circle, drawn with the gold TEXT rung (`primary-700`) rather than the
 * `-500` fill rung: this is a graphic carrying information, and on the ivory workspace the fill
 * rung is too pale against white to be read as one. The percentage sits in the middle in words,
 * so the arc is the fast scan and never the only signal — and the meter carries a real
 * `progressbar` role with a spoken equivalent.
 */
function OccupancyRing({ occ, area }: { occ: Occupancy; area: string }) {
  const R = 26;
  const CIRC = 2 * Math.PI * R;
  const text = `${Math.round(occ.pct * 100)}% occupied — ${occ.occupied} of ${occ.serviceable} table${occ.serviceable === 1 ? '' : 's'} in service`;
  return (
    <div
      role="progressbar"
      aria-label={`Occupancy of ${area}`}
      aria-valuenow={occ.occupied}
      aria-valuemin={0}
      aria-valuemax={occ.serviceable}
      aria-valuetext={text}
      className="relative h-[68px] w-[68px] shrink-0"
    >
      <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90" aria-hidden focusable="false">
        <circle cx="32" cy="32" r={R} fill="none" strokeWidth="7" className="text-neutral-200" stroke="currentColor" />
        <circle
          cx="32" cy="32" r={R} fill="none" strokeWidth="7" strokeLinecap="round"
          className="text-primary-700" stroke="currentColor"
          strokeDasharray={`${(occ.pct * CIRC).toFixed(2)} ${CIRC.toFixed(2)}`}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold tnum text-neutral-900">
        {Math.round(occ.pct * 100)}%
      </span>
    </div>
  );
}

export default function FloorsPage() {
  const ws = useWorkspace();
  const navigate = useNavigate();
  const floors = useFloors();
  /* The seat figure is a sum of the REAL capacities of the tables in each area — the same table
     list the floor plan is drawn from, through the same hook and the same query key. Nothing is
     estimated: while it is still loading, the area simply shows no seat figure. */
  const tables = useTables();
  const { removeFloor } = useTableMutations();
  const [editing, setEditing] = useState<Floor | null>(null);
  const [open, setOpen] = useState(false);
  const [del, setDel] = useState<Floor | null>(null);

  const list = floors.data ?? [];
  const activeCount = list.filter((f) => f.isActive).length;
  const totalTables = list.reduce((n, f) => n + (f.tableCount ?? 0), 0);
  const seatsIn = (floorId: number) => (tables.data ?? []).filter((t) => t.floorId === floorId).reduce((n, t) => n + t.capacity, 0);
  const totalSeats = (tables.data ?? []).reduce((n, t) => n + t.capacity, 0);
  const delCount = del?.tableCount ?? 0;

  return (
    <div>
      <PageHeader
        title="Floors & areas"
        subtitle="Branch → area → table. An area is where a table lives; its table count is the quickest check that the floor plan is complete."
        actions={<>
          <Button variant="outline" leftIcon={<LayoutGrid className="h-4 w-4" />} onClick={() => navigate('/admin/tables')}>All tables</Button>
          <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setOpen(true); }}>New area</Button>
        </>}
      />

      {floors.isLoading && <LoadingState variant="cards" rows={2} />}
      {floors.isError && <ErrorState error={floors.error} onRetry={() => void floors.refetch()} />}

      {floors.data && (list.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            icon={<Layers className="h-6 w-6" />}
            title="No areas yet"
            description="Tables cannot exist without an area. Create the first one — Main Dining, Bar Area or VIP Lounge — then add its tables."
            action={<Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setOpen(true); }}>New area</Button>}
          />
        </Card>
      ) : (
        <>
          <p className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-600">
            <span><span className="font-semibold text-neutral-900 tabular-nums">{list.length}</span> area{list.length === 1 ? '' : 's'}</span>
            <span aria-hidden>·</span>
            <span><span className="tabular-nums">{activeCount}</span> active</span>
            <span aria-hidden>·</span>
            <span><span className="font-semibold text-neutral-900 tabular-nums">{totalTables}</span> table{totalTables === 1 ? '' : 's'} across them</span>
            {tables.data && (
              <>
                <span aria-hidden>·</span>
                <span><span className="font-semibold text-neutral-900 tabular-nums">{totalSeats}</span> seat{totalSeats === 1 ? '' : 's'}</span>
              </>
            )}
          </p>

          {/* Base `grid-cols-1`; Tailwind's `grid-cols-N` compiles to `repeat(N, minmax(0,1fr))`,
              so a long area name can never floor a card wider than its column. */}
          <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {list.map((f, i) => {
              const count = f.tableCount ?? 0;
              const seats = seatsIn(f.id);
              /*
               * THE MANAGER BOARD (panel 08). The same areas, led by the same drawn interior, but
               * the card is about how full the area is right now rather than how it is configured.
               * The admin composition below is untouched and is what every other workspace gets.
               */
              if (ws === 'manager') {
                const areaTables = (tables.data ?? []).filter((t) => t.floorId === f.id);
                const occ = tables.data ? occupancyOf(areaTables) : null;
                return (
                  <Reveal as="li" key={f.id} delay={staggerDelay(i)} className="min-w-0">
                    <Card padded={false} className={cn('h-full flex flex-col overflow-hidden', !f.isActive && 'bg-neutral-50')}>
                      <div className="relative aspect-[16/9] overflow-hidden border-b border-neutral-200">
                        <VenueArt name={f.name} />
                        {/* `neutral-950` is the scrim rung — dark in BOTH themes. */}
                        {/*
                          A SOLID caption band, not a fade.

                          A gradient scrim is a `background-image`, and white text on one cannot be
                          measured: the contrast audit walks up for the nearest opaque
                          `background-color`, finds the white card behind the picture, and reports
                          1.00:1 on text that is in fact white on near-black. An unmeasurable
                          surface is one nobody can defend, and the reference board draws a band
                          here anyway. `/95` — and it has to be a step Tailwind actually ships:
                          `/92` is not on the default opacity scale, so the class is dropped and
                          the band silently disappears, which is exactly how this was first
                          written and why the audit still read 1.00:1 afterwards.
                        */}
                        <div className="absolute inset-x-0 bottom-0 bg-neutral-950/95 px-4 pt-3 pb-3 flex items-end justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="text-paper font-semibold text-lg leading-tight break-words">{f.name}</h3>
                            <p className="text-paper/75 text-caption truncate">
                              <span className="tnum">{count}</span> table{count === 1 ? '' : 's'}
                              {tables.data ? <> · <span className="tnum">{seats}</span> seat{seats === 1 ? '' : 's'}</> : null}
                            </p>
                          </div>
                          {!f.isActive && <Badge tone="neutral" size="sm" icon={<Circle className="h-3.5 w-3.5" aria-hidden />}>Inactive</Badge>}
                        </div>
                      </div>

                      <div className="p-5 flex-1 flex flex-col min-w-0">
                        {occ === null ? (
                          <p className="text-caption text-neutral-500">Occupancy appears once live table status has loaded.</p>
                        ) : occ.serviceable === 0 ? (
                          <p className="flex items-start gap-2 rounded-sm border border-warning-200 bg-warning-50 px-3 py-2 text-caption text-warning-700">
                            <AlertTriangle className="h-4 w-4 shrink-0 mt-px" aria-hidden />
                            <span>
                              {count === 0
                                ? <>Empty area — guests cannot be seated here yet. <Link to="/admin/tables" className="font-semibold underline underline-offset-2">Add tables</Link></>
                                : <>Every table in this area is closed, so nothing here can be seated.</>}
                            </span>
                          </p>
                        ) : (
                          <div className="flex items-center gap-4 min-w-0">
                            <OccupancyRing occ={occ} area={f.name} />
                            <div className="min-w-0">
                              <p className="text-sm text-neutral-900">
                                <span className="font-semibold tnum">{occ.occupied}</span>
                                <span className="text-neutral-500"> of </span>
                                <span className="tnum">{occ.serviceable}</span>
                                <span className="text-neutral-500"> in service occupied</span>
                              </p>
                              <p className="text-caption text-neutral-500 mt-0.5">Counted from this area’s own tables</p>
                            </div>
                          </div>
                        )}

                        {occ && occ.serviceable > 0 && (
                          <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                            {[
                              { label: 'Occupied', value: occ.occupied },
                              { label: 'Available', value: occ.available },
                              { label: 'Closed', value: occ.closed },
                            ].map((s) => (
                              <div key={s.label} className="min-w-0 rounded-sm bg-neutral-50 ring-1 ring-inset ring-neutral-200 px-2 py-2">
                                <dt className="text-label text-neutral-500 truncate">{s.label}</dt>
                                <dd className="text-lg font-semibold tnum text-neutral-900 leading-tight">{s.value}</dd>
                              </div>
                            ))}
                          </dl>
                        )}
                      </div>

                      <div className="border-t border-neutral-200 px-3 py-2 flex items-center justify-between gap-2">
                        <Link
                          to="/admin/tables"
                          className="min-h-touch inline-flex items-center gap-0.5 px-1 text-sm font-medium text-primary-700 rounded-sm hover:underline underline-offset-2"
                        >
                          View tables
                          <ChevronRight className="h-4 w-4" aria-hidden />
                        </Link>
                        <span className="flex items-center gap-1">
                          <IconButton label={`Edit ${f.name}`} onClick={() => { setEditing(f); setOpen(true); }}><Pencil className="h-4 w-4" /></IconButton>
                          <IconButton
                            label={count > 0 ? `Delete ${f.name} — move or remove its ${count} table${count === 1 ? '' : 's'} first` : `Delete ${f.name}`}
                            className="text-danger-700"
                            disabled={count > 0}
                            onClick={() => setDel(f)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </IconButton>
                        </span>
                      </div>
                    </Card>
                  </Reveal>
                );
              }
              return (
                <Reveal as="li" key={f.id} delay={staggerDelay(i)} className="min-w-0">
                  {/* An inactive area sinks: `neutral-50` is the DARKEST rung on this ramp, so
                      the card drops below the page instead of lighting up. */}
                  <Card padded={false} className={cn('h-full flex flex-col overflow-hidden', !f.isActive && 'bg-neutral-50')}>
                    {/*
                      A DRAWN interior, keyed off the area's own name so the same room is the same
                      picture on every load. The reference leads each card with a photograph; this
                      venue has none and none was invented.
                    */}
                    <div className="relative aspect-[16/9] overflow-hidden border-b border-neutral-200">
                      <VenueArt name={f.name} />
                      {/* `neutral-950` is the scrim rung — dark in BOTH themes — so the name laid
                          over it stays white-on-dark whichever theme is painted. */}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-neutral-950/90 via-neutral-950/55 to-transparent px-4 pt-8 pb-3">
                        <h3 className="text-paper font-semibold text-lg leading-tight break-words">{f.name}</h3>
                        <p className="text-paper/75 text-caption truncate">Code {f.code || '—'} · display order {f.displayOrder}</p>
                      </div>
                    </div>

                    <div className="p-5 flex-1 flex flex-col min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        {/* Two real figures: the areas' own table count from the floors API, and
                            the sum of those tables' seating capacities. */}
                        <div className="flex items-end gap-5 min-w-0">
                          <div className="min-w-0">
                            <p className="text-metric text-neutral-900 tabular-nums leading-none">{count}</p>
                            <p className="text-caption text-neutral-500 mt-1 inline-flex items-center gap-1">
                              <LayoutGrid className="h-3 w-3 text-neutral-400" aria-hidden />
                              table{count === 1 ? '' : 's'}
                            </p>
                          </div>
                          {tables.data && (
                            <div className="min-w-0">
                              <p className="text-metric text-neutral-900 tabular-nums leading-none">{seats}</p>
                              <p className="text-caption text-neutral-500 mt-1 inline-flex items-center gap-1">
                                <Armchair className="h-3 w-3 text-neutral-400" aria-hidden />
                                seat{seats === 1 ? '' : 's'}
                              </p>
                            </div>
                          )}
                        </div>
                        <Badge
                          tone={f.isActive ? 'success' : 'neutral'} size="sm"
                          icon={f.isActive ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : <Circle className="h-3.5 w-3.5" aria-hidden />}
                        >
                          {f.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>

                      {count > 0 && (
                        <Link
                          to="/admin/tables"
                          className="mt-3 self-start min-h-touch inline-flex items-center gap-0.5 px-1 -ml-1 text-sm font-medium text-primary-700 rounded-sm hover:underline underline-offset-2"
                        >
                          Open tables
                          <ChevronRight className="h-4 w-4" aria-hidden />
                        </Link>
                      )}

                      {count === 0 && (
                        <p className="mt-3 flex items-start gap-2 rounded-sm border border-warning-200 bg-warning-50 px-3 py-2 text-caption text-warning-700">
                          <AlertTriangle className="h-4 w-4 shrink-0 mt-px" aria-hidden />
                          <span>
                            Empty area — guests cannot be seated here yet.{' '}
                            <Link to="/admin/tables" className="font-semibold underline underline-offset-2">Add tables</Link>
                          </span>
                        </p>
                      )}
                    </div>

                    <div className="border-t border-neutral-200 px-3 py-2 flex items-center justify-between gap-2">
                      <Button variant="outline" className="min-h-touch" leftIcon={<Pencil className="h-4 w-4" />} onClick={() => { setEditing(f); setOpen(true); }}>
                        Edit
                      </Button>
                      <IconButton
                        label={count > 0 ? `Delete ${f.name} — move or remove its ${count} table${count === 1 ? '' : 's'} first` : `Delete ${f.name}`}
                        className="text-danger-700"
                        disabled={count > 0}
                        onClick={() => setDel(f)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    </div>
                  </Card>
                </Reveal>
              );
            })}
          </ul>
        </>
      ))}

      {open && <FloorForm onClose={() => { setOpen(false); setEditing(null); }} editing={editing} />}
      <ConfirmDialog
        open={!!del} onClose={() => setDel(null)} variant="danger"
        title={`Delete “${del?.name}”?`}
        message={delCount > 0
          ? `This area still has ${delCount} table${delCount === 1 ? '' : 's'}. Move or remove them first — the server will refuse the deletion while tables remain.`
          : 'The area is removed from the floor plan. Historical orders keep the area name they were placed under.'}
        confirmLabel="Delete" loading={removeFloor.isPending}
        onConfirm={async () => { if (del) { try { await removeFloor.mutateAsync(del.id); } finally { setDel(null); } } }}
      />
    </div>
  );
}
