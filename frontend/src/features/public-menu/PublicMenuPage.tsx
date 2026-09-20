import { useEffect, useMemo, useRef, useState } from 'react';
import { Routes, Route, useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, Tag, ChevronLeft, Leaf, Flame, Clock, Sparkles, ListChecks, X, MapPin, Phone, Minus, Plus } from 'lucide-react';
import { publicApi } from '@/services/api/endpoints';
import { useRealtimeInvalidate, useDebounce } from '@/hooks/useRealtime';
import { cn } from '@/utils/cn';
import { money } from '@/utils/money';
import { bestOfferForLine, offerLabel } from '@/utils/offers';
import type { MenuItem, MenuCategory, Offer, PublicMenu } from '@/types';
import { LoadingState, ErrorState, EmptyState, Badge, Button, Modal, QuantitySelector, ItemImage as SharedItemImage } from '@/components/ui';

/* ------------------------------------------------------------------ helpers */
interface Selection { item: MenuItem; qty: number; note: string }

function useSelection() {
  const [sel, setSel] = useState<Selection[]>([]);
  const add = (item: MenuItem, qty: number, note: string) => setSel((s) => {
    const i = s.findIndex((x) => x.item.id === item.id && x.note === note);
    if (i >= 0) { const c = [...s]; c[i] = { ...c[i], qty: c[i].qty + qty }; return c; }
    return [...s, { item, qty, note }];
  });
  const setQty = (idx: number, qty: number) => setSel((s) => (qty <= 0 ? s.filter((_, i) => i !== idx) : s.map((x, i) => (i === idx ? { ...x, qty } : x))));
  const clear = () => setSel([]);
  return { sel, add, setQty, clear, count: sel.reduce((a, x) => a + x.qty, 0), total: sel.reduce((a, x) => a + x.qty * x.item.price, 0) };
}

/** Thin wrapper so this screen keeps using the shared image fallback. */
function ItemImage({ item, className }: { item: MenuItem; className?: string }) {
  return <SharedItemImage src={item.imageUrl} alt={item.name} prepLocation={item.prepLocation} rounded="" className={className} />;
}

function VegDot({ veg }: { veg: boolean }) {
  return (
    <span
      title={veg ? 'Vegetarian' : 'Non-vegetarian'}
      className={cn('inline-flex h-4 w-4 items-center justify-center border rounded-[3px] shrink-0', veg ? 'border-success-600' : 'border-danger-600')}
    >
      <span className={cn('h-2 w-2 rounded-full', veg ? 'bg-success-600' : 'bg-danger-600')} aria-hidden />
      <span className="sr-only">{veg ? 'Vegetarian' : 'Non-vegetarian'}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ item card */
function MenuItemCard({ item, offers, onOpen, onQuickAdd }: { item: MenuItem; offers: Offer[]; onOpen: () => void; onQuickAdd: () => void }) {
  const best = bestOfferForLine(offers, item, item.price, 1);
  return (
    <article className={cn('flex gap-3.5 p-3.5 bg-white rounded-md border border-neutral-200 transition-shadow hover:shadow-card', !item.isAvailable && 'opacity-60')}>
      <button type="button" onClick={onOpen} className="flex-1 min-w-0 text-left" aria-label={`View ${item.name}`}>
        <div className="flex items-center gap-2 flex-wrap">
          <VegDot veg={item.isVeg} />
          {item.isPopular && <Badge tone="accent" size="sm" icon={<Flame className="h-3 w-3" />}>Popular</Badge>}
          {best.offer && <Badge tone="success" size="sm" icon={<Tag className="h-3 w-3" />}>{offerLabel(best.offer)}</Badge>}
        </div>
        <h3 className="font-semibold text-neutral-900 mt-2 leading-snug">{item.name}</h3>
        {item.description && <p className="text-sm text-neutral-500 mt-1 line-clamp-2 leading-relaxed">{item.description}</p>}
        <p className="mt-2.5 font-semibold tabular-nums text-neutral-900">{money(item.price)}</p>
        {!item.isAvailable && <p className="text-caption text-danger-600 font-medium mt-1">Currently unavailable</p>}
      </button>
      <div className="w-[104px] shrink-0 flex flex-col items-center gap-2">
        {/* Tapping the photo opens the same sheet as the title. It is kept out of the tab
            order so keyboard users meet each dish once, not twice. */}
        <button
          type="button"
          onClick={onOpen}
          tabIndex={-1}
          aria-label={`View ${item.name}`}
          className="w-[104px] h-[88px] rounded-md overflow-hidden bg-neutral-100"
        >
          <ItemImage item={item} className="w-full h-full" />
        </button>
        <Button
          size="sm"
          variant="outline"
          className="w-[88px] font-semibold text-primary-700 border-primary-200 hover:bg-primary-50 hover:border-primary-300"
          disabled={!item.isAvailable}
          onClick={onQuickAdd}
          aria-label={`Add ${item.name} to selection`}
        >
          {item.isAvailable ? 'ADD' : 'N/A'}
        </Button>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ item detail sheet */
function ItemSheet({ item, offers, onClose, onAdd }: { item: MenuItem | null; offers: Offer[]; onClose: () => void; onAdd: (item: MenuItem, qty: number, note: string) => void }) {
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  useEffect(() => { setQty(1); setNote(''); }, [item?.id]);
  if (!item) return null;
  const best = bestOfferForLine(offers, item, item.price, qty);
  return (
    <Modal open onClose={onClose} size="md" footer={
      <div className="flex items-center gap-3 w-full">
        <QuantitySelector value={qty} onChange={setQty} min={1} size="lg" />
        <Button size="lg" className="flex-1" disabled={!item.isAvailable} onClick={() => { onAdd(item, qty, note.trim()); onClose(); }}>Add to my selection · {money(item.price * qty)}</Button>
      </div>
    }>
      <div className="-mx-5 -mt-4"><ItemImage item={item} className="w-full h-56" /></div>
      <div className="mt-4 flex items-center gap-2"><VegDot veg={item.isVeg} />{item.isPopular && <Badge tone="warning" size="sm" icon={<Flame className="h-3 w-3" />}>Popular</Badge>}<span className="text-caption text-neutral-500 ml-auto">{item.prepLocation === 'BAR' ? 'From the bar' : 'From the kitchen'}</span></div>
      <h2 className="text-heading mt-2">{item.name}</h2>
      {item.description && <p className="text-neutral-600 mt-1">{item.description}</p>}
      <p className="text-xl font-semibold mt-3 tabular-nums">{money(item.price)}</p>
      {best.offer && <div className="mt-3 rounded-sm bg-success-50 border border-success-100 px-3 py-2 text-sm text-success-700 flex items-center gap-2"><Tag className="h-4 w-4" /><span><strong>{best.offer.name}</strong> — save {money(best.amount)} on this quantity</span></div>}
      {!item.isAvailable && <p className="mt-3 text-sm text-danger-600 font-medium">This item is currently unavailable.</p>}
      <label className="block mt-5 text-label text-neutral-700">Special instructions (optional)</label>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={200} placeholder="e.g. no onion, less spicy" className="input-base py-2 mt-1.5 min-h-[64px]" />
      <p className="text-caption text-neutral-500 mt-2">Add-ons, variants and sizes will be available here in a future update.</p>
    </Modal>
  );
}

/* ------------------------------------------------------------------ selection sheet */
function SelectionSheet({ open, onClose, s }: { open: boolean; onClose: () => void; s: ReturnType<typeof useSelection> }) {
  return (
    <Modal open={open} onClose={onClose} title="My selection" description="Show this to your waiter to place the order." size="md" footer={<><Button variant="outline" onClick={s.clear} disabled={!s.sel.length}>Clear</Button><Button onClick={onClose}>Done</Button></>}>
      {s.sel.length === 0 ? <EmptyState compact icon={<ListChecks className="h-6 w-6" />} title="Nothing selected yet" description="Tap ADD on any dish to build your list." /> : (
        <ul className="divide-y divide-neutral-100">
          {s.sel.map((x, i) => (
            <li key={`${x.item.id}-${i}`} className="py-3 flex items-center gap-3">
              <div className="min-w-0 flex-1"><p className="font-medium">{x.item.name}</p>{x.note && <p className="text-caption text-neutral-500">{x.note}</p>}<p className="text-sm tabular-nums text-neutral-600">{money(x.item.price)} × {x.qty}</p></div>
              <div className="inline-flex items-center rounded-sm border border-neutral-300">
                <button type="button" aria-label="Decrease" onClick={() => s.setQty(i, x.qty - 1)} className="h-9 w-9 flex items-center justify-center">{x.qty <= 1 ? <X className="h-4 w-4" /> : <Minus className="h-4 w-4" />}</button>
                <span className="w-8 text-center font-semibold tabular-nums">{x.qty}</span>
                <button type="button" aria-label="Increase" onClick={() => s.setQty(i, x.qty + 1)} className="h-9 w-9 flex items-center justify-center"><Plus className="h-4 w-4" /></button>
              </div>
            </li>
          ))}
          <li className="py-3 flex justify-between font-semibold"><span>Estimated total</span><span className="tabular-nums">{money(s.total)}</span></li>
          <li className="text-caption text-neutral-500 pb-1">Taxes and service charge are added on the final bill.</li>
        </ul>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ offers view */
function OffersView({ data }: { data: PublicMenu }) {
  const catName = (id: number) => data.categories.find((c) => c.id === id)?.name ?? '';
  const itemName = (id: number) => data.items.find((i) => i.id === id)?.name ?? '';
  return (
    <div className="px-4 py-4 space-y-3">
      {data.offers.length === 0 && <EmptyState icon={<Tag className="h-6 w-6" />} title="No offers right now" description="Check back later — happy hours and specials appear here automatically." />}
      {data.offers.map((o) => (
        <article key={o.id} className="rounded-md border border-neutral-200 bg-white p-4">
          <div className="flex items-start gap-3">
            <span className="h-10 w-10 rounded-md bg-success-50 text-success-600 flex items-center justify-center shrink-0"><Tag className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold">{o.name}</h3>
              <p className="text-sm text-neutral-600">{o.description}</p>
              <p className="text-sm font-medium text-success-700 mt-1">{offerLabel(o)}{o.maxDiscountAmount ? ` (max ${money(o.maxDiscountAmount)})` : ''}</p>
              <dl className="mt-2 text-caption text-neutral-500 space-y-0.5">
                {(o.startTime || o.endTime) && <div className="flex items-center gap-1"><Clock className="h-3 w-3" />{o.startTime ?? '00:00'} – {o.endTime ?? '23:59'}</div>}
                <div>Valid till {o.endDate}</div>
                <div>{o.appliesTo === 'ALL' ? 'Applies to all items' : o.appliesTo === 'CATEGORIES' ? `Applies to: ${o.categoryIds.map(catName).filter(Boolean).join(', ')}` : `Applies to: ${o.itemIds.map(itemName).filter(Boolean).join(', ')}`}</div>
                <div>Best applicable offer is applied automatically on your bill; offers cannot be combined.</div>
              </dl>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ home view */
function MenuHome({ data, s, openItem }: { data: PublicMenu; s: ReturnType<typeof useSelection>; openItem: (id: number) => void }) {
  const [q, setQ] = useState('');
  const dq = useDebounce(q, 200).toLowerCase();
  const [active, setActive] = useState<number | null>(null);
  const sectionRefs = useRef<Record<number, HTMLElement | null>>({});
  const cats = data.categories;
  const filtered = useMemo(() => data.items.filter((i) => !dq || i.name.toLowerCase().includes(dq) || (i.description ?? '').toLowerCase().includes(dq)), [data.items, dq]);
  const grouped = useMemo(() => cats.map((c) => ({ cat: c, items: filtered.filter((i) => i.categoryId === c.id) })).filter((g) => g.items.length), [cats, filtered]);
  const popular = data.items.filter((i) => i.isPopular && i.isAvailable).slice(0, 8);
  const featured = data.offers[0];

  useEffect(() => {
    const obs = new IntersectionObserver((entries) => { const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]; if (vis) setActive(Number((vis.target as HTMLElement).dataset.cat)); }, { rootMargin: '-120px 0px -70% 0px' });
    Object.values(sectionRefs.current).forEach((el) => el && obs.observe(el));
    return () => obs.disconnect();
  }, [grouped]);

  const scrollTo = (c: MenuCategory) => { sectionRefs.current[c.id]?.scrollIntoView({ behavior: 'smooth', block: 'start' }); setActive(c.id); };

  return (
    <>
      {featured && !dq && (
        <Link to="offers" className="block mx-4 mt-4 rounded-lg bg-neutral-900 text-white p-4 relative overflow-hidden">
          <span className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary-700/40" aria-hidden />
          <p className="text-[11px] uppercase tracking-wider text-neutral-300 flex items-center gap-1"><Tag className="h-3 w-3" />Featured offer</p>
          <p className="text-lg font-semibold mt-1">{featured.name}</p>
          <p className="text-sm text-neutral-300">{featured.startTime ? `${featured.startTime} – ${featured.endTime}` : featured.description}</p>
          <span className="inline-block mt-3 text-sm font-medium underline underline-offset-4">View all offers ({data.offers.length})</span>
        </Link>
      )}
      <div className="px-4 mt-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the menu" aria-label="Search the menu" className="input-base pl-9 h-11 rounded-md" />
        </div>
      </div>
      <div className="sticky top-14 z-20 bg-surface/95 backdrop-blur border-b border-neutral-200 mt-3">
        {/* These scroll to a section rather than swapping a panel, so they are navigation, not tabs. */}
        <nav className="flex gap-2 px-4 py-2 overflow-x-auto no-scrollbar" aria-label="Menu categories">
          {cats.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-current={active === c.id ? 'true' : undefined}
              onClick={() => scrollTo(c)}
              className={cn(
                'shrink-0 min-h-touch px-4 rounded-full text-sm font-medium border transition-colors',
                active === c.id ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-300',
              )}
            >
              {c.name}
            </button>
          ))}
        </nav>
      </div>
      {!dq && popular.length > 0 && (
        <section className="mt-4">
          <h2 className="px-4 text-subheading flex items-center gap-2"><Flame className="h-4 w-4 text-warning-500" />Popular right now</h2>
          <div className="flex gap-3 px-4 mt-2 overflow-x-auto no-scrollbar pb-1">
            {popular.map((i) => (
              <button key={i.id} type="button" onClick={() => openItem(i.id)} className="w-40 shrink-0 text-left rounded-md bg-white border border-neutral-200 overflow-hidden">
                <ItemImage item={i} className="w-full h-24" />
                <div className="p-2"><p className="text-sm font-medium truncate">{i.name}</p><p className="text-sm text-neutral-600 tabular-nums">{money(i.price)}</p></div>
              </button>
            ))}
          </div>
        </section>
      )}
      <div className="px-4 pb-28 mt-4 space-y-8">
        {grouped.length === 0 && <EmptyState icon={<Search className="h-6 w-6" />} title="No dishes match" description={`Nothing found for “${q}”.`} action={<Button variant="outline" onClick={() => setQ('')}>Clear search</Button>} />}
        {grouped.map(({ cat, items }) => (
          <section key={cat.id} data-cat={cat.id} ref={(el) => { sectionRefs.current[cat.id] = el; }} className="scroll-mt-[120px]">
            <h2 className="text-subheading mb-2 flex items-center gap-2">{cat.name}<span className="text-caption text-neutral-400 font-normal">{items.length}</span></h2>
            <div className="space-y-3">{items.map((i) => <MenuItemCard key={i.id} item={i} offers={data.offers} onOpen={() => openItem(i.id)} onQuickAdd={() => s.add(i, 1, '')} />)}</div>
          </section>
        ))}
        <footer className="text-center text-caption text-neutral-400 pt-6 flex flex-col gap-1">
          {data.business.address && <span className="inline-flex items-center justify-center gap-1"><MapPin className="h-3 w-3" />{data.business.address}</span>}
          {data.business.phone && <span className="inline-flex items-center justify-center gap-1"><Phone className="h-3 w-3" />{data.business.phone}</span>}
          <span className="inline-flex items-center justify-center gap-1"><Leaf className="h-3 w-3 text-success-600" /> vegetarian · Prices in INR, taxes extra</span>
        </footer>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ page */
export default function PublicMenuPage() {
  const { branchCode = '', tableCode = '' } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const s = useSelection();
  const [selOpen, setSelOpen] = useState(false);
  const query = useQuery({ queryKey: ['public-menu', branchCode, tableCode], queryFn: () => publicApi.menu(branchCode, tableCode), staleTime: 60 * 1000, retry: 1, meta: { silent: true } });
  useRealtimeInvalidate(['menu']);
  const openItem = (id: number) => setParams((p) => { p.set('item', String(id)); return p; });
  const closeItem = () => setParams((p) => { p.delete('item'); return p; });
  const currentItem = query.data?.items.find((i) => i.id === Number(params.get('item'))) ?? null;

  if (query.isLoading) return <div className="min-h-screen bg-surface p-4"><LoadingState variant="page" /></div>;
  if (query.isError || !query.data) return <div className="min-h-screen bg-surface flex items-center justify-center p-4"><ErrorState error={query.error} onRetry={() => void query.refetch()} title="Menu unavailable" /></div>;
  const data = query.data;

  return (
    <div className="min-h-screen bg-surface max-w-lg mx-auto shadow-panel sm:my-0">
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-neutral-200 h-14 flex items-center gap-3 px-4">
        <Routes>
          <Route path="offers" element={<button type="button" onClick={() => navigate('.')} aria-label="Back to menu" className="h-9 w-9 -ml-2 flex items-center justify-center rounded-sm hover:bg-neutral-100"><ChevronLeft className="h-5 w-5" /></button>} />
          <Route path="*" element={data.business.logoUrl ? <img src={data.business.logoUrl} alt="" className="h-9 w-9 rounded-sm object-cover" /> : <span className="h-9 w-9 rounded-sm bg-neutral-900 text-white flex items-center justify-center font-bold">{data.business.name[0]}</span>} />
        </Routes>
        <div className="min-w-0 flex-1"><p className="font-semibold truncate leading-tight">{data.business.name}</p><p className="text-caption text-neutral-500 truncate">{data.table.floorName} · <span className="font-semibold text-neutral-800">Table {data.table.number}</span></p></div>
        <Link to="offers" className="h-10 w-10 flex items-center justify-center rounded-sm hover:bg-neutral-100 text-success-700" aria-label="Offers"><Tag className="h-5 w-5" /></Link>
      </header>
      <Routes>
        <Route index element={<>
          <div className="px-4 pt-4"><p className="text-caption uppercase tracking-wider text-neutral-500">Welcome</p><h1 className="text-heading">{data.business.welcomeMessage || `Welcome to ${data.business.name}`}</h1></div>
          <MenuHome data={data} s={s} openItem={openItem} />
        </>} />
        <Route path="offers" element={<OffersView data={data} />} />
        <Route path="*" element={<MenuHome data={data} s={s} openItem={openItem} />} />
      </Routes>
      {s.count > 0 && (
        <div className="fixed bottom-4 inset-x-0 z-30 flex justify-center px-4 pointer-events-none">
          <button type="button" onClick={() => setSelOpen(true)} className="pointer-events-auto w-full max-w-lg min-h-pos rounded-md bg-neutral-900 text-white shadow-modal flex items-center justify-between px-5 font-semibold">
            <span className="inline-flex items-center gap-2"><ListChecks className="h-5 w-5" />{s.count} item{s.count > 1 ? 's' : ''} selected</span><span className="tabular-nums">{money(s.total)} · Show waiter</span>
          </button>
        </div>
      )}
      <ItemSheet item={currentItem} offers={data.offers} onClose={closeItem} onAdd={s.add} />
      <SelectionSheet open={selOpen} onClose={() => setSelOpen(false)} s={s} />
    </div>
  );
}
