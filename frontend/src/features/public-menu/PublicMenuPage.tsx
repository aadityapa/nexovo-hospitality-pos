import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Routes, Route, useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, Tag, ChevronLeft, Leaf, Flame, Clock, ListChecks, MapPin, Phone } from 'lucide-react';
import { publicApi } from '@/services/api/endpoints';
import { useRealtimeInvalidate, useDebounce } from '@/hooks/useRealtime';
import { cn } from '@/utils/cn';
import { money } from '@/utils/money';
import { bestOfferForLine, offerLabel } from '@/utils/offers';
import type { MenuItem, MenuCategory, Offer, PublicMenu } from '@/types';
import { LoadingState, ErrorState, EmptyState, Badge, Button, Modal, QuantitySelector, ItemImage as SharedItemImage } from '@/components/ui';
import { EmptyPlate } from '@/components/graphics';
import { Reveal, staggerDelay } from '@/components/motion';

/* ------------------------------------------------------------------ helpers */
/**
 * The `--d` beat of a staged reveal. `staggerDelay` caps at 320 ms, so a menu with forty dishes
 * finishes arriving in a third of a second rather than trickling in for two — past the cap every
 * remaining element simply appears together.
 */
const beat = (i: number) => ({ '--d': `${staggerDelay(i)}ms` }) as CSSProperties;

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
  /** How many of one dish are on the list, across every note variant of it. */
  const qtyOf = (itemId: number) => sel.reduce((a, x) => a + (x.item.id === itemId ? x.qty : 0), 0);
  return { sel, add, setQty, clear, qtyOf, count: sel.reduce((a, x) => a + x.qty, 0), total: sel.reduce((a, x) => a + x.qty * x.item.price, 0) };
}

/** Thin wrapper so this screen keeps using the shared image fallback. */
function ItemImage({ item, className }: { item: MenuItem; className?: string }) {
  return <SharedItemImage src={item.imageUrl} alt={item.name} prepLocation={item.prepLocation} rounded="" className={className} />;
}

function VegDot({ veg }: { veg: boolean }) {
  return (
    <span
      title={veg ? 'Vegetarian' : 'Non-vegetarian'}
      className={cn('inline-flex h-4 w-4 items-center justify-center border rounded-[3px] shrink-0', veg ? 'border-success-500' : 'border-danger-500')}
    >
      <span className={cn('h-2 w-2 rounded-full', veg ? 'bg-success-500' : 'bg-danger-500')} aria-hidden />
      <span className="sr-only">{veg ? 'Vegetarian' : 'Non-vegetarian'}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ item card */
/**
 * The guest-facing dish row. `selected` is the number of this dish already on the guest's list,
 * derived from the selection they built — nothing is invented. When it is non-zero the card
 * takes a gold edge and the ADD control becomes a live count, so a guest scrolling back up can
 * see what they have chosen without opening the summary sheet.
 *
 * MATERIAL. This is the guest's screen, on the guest's own phone, read at leisure — so the dish
 * card gets the gloss that an operational row does not: one specular band raking across the top,
 * so a page of dishes reads as a set of lit surfaces rather than a stack of rectangles. It takes
 * no `.material-edge`: the card's edge is a real `border` that CHANGES with selection (gold once
 * the dish is on the list), and its lift is `shadow-card` — `.material-edge` is a `box-shadow`
 * and would replace that shadow on exactly the cards that are meant to be lifted.
 */
function MenuItemCard({ item, offers, selected, onOpen, onQuickAdd }: { item: MenuItem; offers: Offer[]; selected: number; onOpen: () => void; onQuickAdd: () => void }) {
  const best = bestOfferForLine(offers, item, item.price, 1);
  return (
    <article className={cn(
      'flex gap-3.5 p-3.5 bg-surface-raised rounded-md border material-gloss transition-[border-color,box-shadow] duration-control',
      selected > 0 ? 'border-primary-500 shadow-card' : 'border-neutral-200 hover:border-neutral-300 hover:shadow-card',
      !item.isAvailable && 'opacity-60',
    )}>
      <button type="button" onClick={onOpen} className="flex-1 min-w-0 text-left" aria-label={`View ${item.name}`}>
        <div className="flex items-center gap-2 flex-wrap">
          <VegDot veg={item.isVeg} />
          {/* Violet means VIP classification in this product — a popular dish is emphasis. */}
          {item.isPopular && <Badge tone="warning" size="sm" icon={<Flame className="h-3 w-3" />}>Popular</Badge>}
          {best.offer && <Badge tone="success" size="sm" icon={<Tag className="h-3 w-3" />}>{offerLabel(best.offer)}</Badge>}
        </div>
        <h3 className="font-semibold text-neutral-900 mt-2 leading-snug">{item.name}</h3>
        {item.description && <p className="text-sm text-neutral-500 mt-1 line-clamp-2 leading-relaxed">{item.description}</p>}
        <p className="mt-2.5 font-semibold tnum text-neutral-900">{money(item.price)}</p>
        {selected > 0 && (
          <p className="mt-1 text-caption font-semibold text-primary-700 tnum">{selected} on your list</p>
        )}
        {!item.isAvailable && <p className="text-caption text-danger-700 font-medium mt-1">Currently unavailable</p>}
      </button>
      <div className="w-[112px] shrink-0 flex flex-col items-center gap-2">
        {/* Tapping the photo opens the same sheet as the title. It is kept out of the tab
            order so keyboard users meet each dish once, not twice. */}
        <button
          type="button"
          onClick={onOpen}
          tabIndex={-1}
          aria-label={`View ${item.name}`}
          className="w-[112px] h-[96px] rounded-md overflow-hidden bg-neutral-100 ring-1 ring-inset ring-neutral-200"
        >
          <ItemImage item={item} className="w-full h-full" />
        </button>
        <Button
          size="sm"
          variant={selected > 0 ? 'primary' : 'outline'}
          className={cn('w-[112px] font-semibold', selected === 0 && 'text-primary-700 border-primary-200 hover:bg-primary-50 hover:border-primary-400')}
          disabled={!item.isAvailable}
          onClick={onQuickAdd}
          aria-label={selected > 0 ? `Add another ${item.name}, ${selected} already selected` : `Add ${item.name} to selection`}
        >
          {!item.isAvailable ? 'N/A' : selected > 0 ? `${selected} · ADD` : 'ADD'}
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
      {/* The photograph runs full bleed to the sheet edge — the one generous piece of imagery
          on a guest screen, and the reason the sheet exists rather than an inline expander. */}
      <div className="-mx-5 -mt-4"><ItemImage item={item} className="w-full h-56" /></div>
      <div className="mt-4 flex items-center gap-2"><VegDot veg={item.isVeg} />{item.isPopular && <Badge tone="warning" size="sm" icon={<Flame className="h-3 w-3" />}>Popular</Badge>}<span className="text-caption text-neutral-500 ml-auto">{item.prepLocation === 'BAR' ? 'From the bar' : 'From the kitchen'}</span></div>
      <h2 className="text-heading mt-2 text-neutral-900">{item.name}</h2>
      {item.description && <p className="text-neutral-600 mt-1 leading-relaxed">{item.description}</p>}
      <p className="text-metric mt-3 tnum text-neutral-900">{money(item.price)}</p>
      {best.offer && <div className="mt-3 rounded-sm bg-success-50 border border-success-200 px-3 py-2 text-sm text-success-700 flex items-center gap-2"><Tag className="h-4 w-4 shrink-0" /><span><strong>{best.offer.name}</strong> — save {money(best.amount)} on this quantity</span></div>}
      {!item.isAvailable && <p className="mt-3 text-sm text-danger-700 font-medium">This item is currently unavailable.</p>}
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
        <>
          <ul className="divide-y divide-neutral-200">
            {s.sel.map((x, i) => (
              <li key={`${x.item.id}-${i}`} className="py-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-neutral-900">{x.item.name}</p>
                  {x.note && <p className="text-caption text-neutral-500">{x.note}</p>}
                  <p className="text-sm tnum text-neutral-500">
                    {money(x.item.price)} each
                    {/* Below 420 px the line total rides with the unit price instead of taking
                        its own column — at that width a third column leaves the dish name
                        about 130 px, and a wrapped name is worse than a shifted figure. */}
                    <span className="xs:hidden font-semibold text-neutral-900"> · {money(x.item.price * x.qty)}</span>
                  </p>
                </div>
                {/* The shared stepper, so the guest gets the same 44 px targets, the same
                    remove-at-one behaviour and the same live announcement as the staff app. */}
                <QuantitySelector
                  value={x.qty}
                  min={1}
                  size="sm"
                  onChange={(q) => s.setQty(i, q)}
                  onRemove={() => s.setQty(i, 0)}
                />
                <span className="hidden xs:block w-20 text-right font-semibold tnum text-neutral-900 shrink-0">{money(x.item.price * x.qty)}</span>
              </li>
            ))}
          </ul>
          {/*
            Financial hierarchy: line count and items read quietly, the estimated total is the
            one figure a guest checks before showing the list to a waiter, and the caveat that
            it is not the final bill sits directly under it rather than in a footnote.
          */}
          <div className="mt-4 rounded-md border border-neutral-200 bg-surface p-3.5">
            <div className="flex items-baseline justify-between gap-3 text-sm text-neutral-500">
              <span>{s.count} item{s.count === 1 ? '' : 's'} across {s.sel.length} line{s.sel.length === 1 ? '' : 's'}</span>
            </div>
            <div className="mt-1.5 flex items-baseline justify-between gap-3">
              <span className="font-semibold text-neutral-900">Estimated total</span>
              <span className="text-metric tnum text-neutral-900">{money(s.total)}</span>
            </div>
            <p className="text-caption text-neutral-500 mt-1.5 leading-relaxed">
              Taxes, service charge and any offer are applied on the final bill, so the amount you pay can differ.
            </p>
          </div>
        </>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ offers view */
function OffersView({ data }: { data: PublicMenu }) {
  const catName = (id: number) => data.categories.find((c) => c.id === id)?.name ?? '';
  const itemName = (id: number) => data.items.find((i) => i.id === id)?.name ?? '';
  return (
    <div className="px-4 py-5 space-y-3">
      {/* The same page head the menu itself wears — small gold label, strong title, then the
          13 px supporting line. The rule that used to be repeated under every single offer now
          sits here once, where a guest reads it before the list rather than five times inside it. */}
      <div className="mb-4">
        <p className="text-label uppercase text-primary-700">Offers</p>
        <h1 className="text-heading text-neutral-900 mt-1">
          {data.offers.length > 0 ? `${data.offers.length} offer${data.offers.length === 1 ? '' : 's'} running now` : 'Offers'}
        </h1>
        <p className="text-[13px] text-neutral-500 mt-1 leading-snug">
          The best applicable offer is applied automatically on your bill. Offers cannot be combined.
        </p>
      </div>
      {data.offers.length === 0 && <EmptyState icon={<Tag className="h-6 w-6" />} title="No offers right now" description="Check back later — happy hours and specials appear here automatically." />}
      {data.offers.map((o) => (
        <article key={o.id} className="card p-4">
          <div className="flex items-start gap-3">
            <span className="h-10 w-10 rounded-md bg-success-50 text-success-700 ring-1 ring-inset ring-success-200 flex items-center justify-center shrink-0"><Tag className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-neutral-900">{o.name}</h3>
              <p className="text-sm text-neutral-600 leading-relaxed">{o.description}</p>
              <p className="text-sm font-medium text-success-700 mt-1">{offerLabel(o)}{o.maxDiscountAmount ? ` (max ${money(o.maxDiscountAmount)})` : ''}</p>
              <dl className="mt-2 text-caption text-neutral-500 space-y-0.5">
                {(o.startTime || o.endTime) && <div className="flex items-center gap-1"><Clock className="h-3 w-3" />{o.startTime ?? '00:00'} – {o.endTime ?? '23:59'}</div>}
                <div>Valid till {o.endDate}</div>
                <div>{o.appliesTo === 'ALL' ? 'Applies to all items' : o.appliesTo === 'CATEGORIES' ? `Applies to: ${o.categoryIds.map(catName).filter(Boolean).join(', ')}` : `Applies to: ${o.itemIds.map(itemName).filter(Boolean).join(', ')}`}</div>
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
  /*
   * `idx` is the category's position in the venue's OWN category order, carried through the
   * filter deliberately. The staged reveal below keys its `--d` off it rather than off the
   * position in the filtered list, and that is a correctness requirement, not a nicety: an
   * `animation-delay` that grows on an element whose animation has already finished pushes it
   * back into its delay phase, and a `both`-filled entrance in its delay phase is opacity 0. A
   * guest deleting a character from the search would have watched sections they were reading
   * blink out and re-arrive. Against the source order the delay is fixed for the life of the
   * section, so a search filters the menu and animates nothing that was already on screen.
   */
  const grouped = useMemo(() => cats.map((c, idx) => ({ cat: c, idx, items: filtered.filter((i) => i.categoryId === c.id) })).filter((g) => g.items.length), [cats, filtered]);
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
        /* The one premium flourish on the guest screen: a gold hairline over the card surface
            with the restrained top sheen, not a saturated block. Gold names the offer; the
            card stays a card, so the dishes below it remain the loudest thing on the page.
            The sheen is now `.material-gloss` and REPLACES the old `bg-surface-sheen` wash
            rather than stacking on it — two highlights on one surface is a shine, and a shine
            is exactly what this system does not do. */
        <Link
          to="offers"
          className="block mx-4 mt-4 rounded-lg border border-primary-200 material-gloss bg-surface-raised shadow-card p-4 relative overflow-hidden transition-[border-color,box-shadow] duration-control hover:border-primary-400 hover:shadow-panel"
        >
          <span className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-primary-500/10" aria-hidden />
          <p className="text-label uppercase text-primary-700 flex items-center gap-1"><Tag className="h-3 w-3" />Featured offer</p>
          <p className="text-lg font-semibold mt-1 text-neutral-900">{featured.name}</p>
          <p className="text-sm text-neutral-500">{featured.startTime ? `${featured.startTime} – ${featured.endTime}` : featured.description}</p>
          <span className="inline-block mt-3 text-sm font-medium text-primary-700 underline underline-offset-4">View all offers ({data.offers.length})</span>
        </Link>
      )}
      <div className="px-4 mt-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the menu" aria-label="Search the menu" className="input-base pl-9 h-11 rounded-md" />
        </div>
      </div>
      <div className="sticky top-14 z-20 bg-surface/95 backdrop-blur border-b border-neutral-200 mt-3">
        {/* These scroll to a section rather than swapping a panel, so they are navigation, not tabs.
            MOTION: the rail arrives left to right on the capped beat — the chips carry `anim-reveal`
            themselves rather than being wrapped, so `shrink-0` stays on the flex item and the rail
            scrolls exactly as it did. Keyed by category id, so a search that re-filters the DISHES
            never replays the rail, and a menu refetch never replays anything. */}
        <nav className="flex gap-2 px-4 py-2 overflow-x-auto no-scrollbar" aria-label="Menu categories">
          {cats.map((c, i) => (
            <button
              key={c.id}
              type="button"
              aria-current={active === c.id ? 'true' : undefined}
              onClick={() => scrollTo(c)}
              style={beat(i)}
              className={cn(
                'anim-reveal shrink-0 min-h-touch px-4 rounded-full text-sm font-medium border transition-colors duration-control',
                active === c.id
                  ? 'bg-primary-500 text-on-primary border-primary-400'
                  : 'bg-surface-raised text-neutral-700 border-neutral-300 hover:border-neutral-400 hover:bg-neutral-100',
              )}
            >
              {c.name}
            </button>
          ))}
        </nav>
      </div>
      {!dq && popular.length > 0 && (
        <section className="mt-4">
          <h2 className="px-4 text-subheading flex items-center gap-2"><Flame className="h-4 w-4 text-warning-500" aria-hidden />Popular right now</h2>
          <div className="flex gap-3 px-4 mt-2 overflow-x-auto no-scrollbar pb-2">
            {popular.map((i, n) => (
              <button
                key={i.id}
                type="button"
                onClick={() => openItem(i.id)}
                style={beat(n)}
                className="anim-reveal w-44 shrink-0 text-left rounded-md bg-surface-raised border border-neutral-200 material-gloss shadow-card overflow-hidden transition-[border-color,box-shadow] duration-control hover:border-neutral-300 hover:shadow-panel press"
              >
                <ItemImage item={i} className="w-full h-28" />
                <div className="p-2.5">
                  <p className="text-sm font-medium truncate text-neutral-900">{i.name}</p>
                  <p className="text-sm text-neutral-500 tnum">{money(i.price)}</p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
      <div className="px-4 pb-28 mt-4 space-y-8">
        {/* The product's own drawing rather than a lucide glyph — this is the guest's screen and
            the empty state is the one place it can afford a mark of its own. */}
        {grouped.length === 0 && <EmptyState icon={<EmptyPlate />} title="No dishes match" description={`Nothing found for “${q}”.`} action={<Button variant="outline" onClick={() => setQ('')}>Clear search</Button>} />}
        {/*
          The dish grid arrives in stages by SECTION, not by dish. A category is the unit the eye
          reads the menu in, so the beat lands where the guest's attention lands; animating forty
          individual dish cards would be a list of records trickling in, which this system does not
          do. The delay is the same capped `staggerDelay`, so however many categories a venue has,
          the last one is on screen within 320 ms of the first.
        */}
        {grouped.map(({ cat, idx, items }) => (
          <section key={cat.id} data-cat={cat.id} ref={(el) => { sectionRefs.current[cat.id] = el; }} style={beat(idx)} className="anim-reveal scroll-mt-[120px]">
            <h2 className="text-subheading mb-2 flex items-center gap-2">{cat.name}<span className="text-caption text-neutral-500 font-normal tnum">{items.length}</span></h2>
            <div className="space-y-3">{items.map((i) => <MenuItemCard key={i.id} item={i} offers={data.offers} selected={s.qtyOf(i.id)} onOpen={() => openItem(i.id)} onQuickAdd={() => s.add(i, 1, '')} />)}</div>
          </section>
        ))}
        <footer className="text-center text-caption text-neutral-500 pt-6 flex flex-col gap-1 border-t border-neutral-200 mt-4">
          {data.business.address && <span className="inline-flex items-center justify-center gap-1 pt-4"><MapPin className="h-3 w-3 shrink-0" aria-hidden />{data.business.address}</span>}
          {data.business.phone && <span className="inline-flex items-center justify-center gap-1"><Phone className="h-3 w-3 shrink-0" aria-hidden />{data.business.phone}</span>}
          <span className="inline-flex items-center justify-center gap-1"><Leaf className="h-3 w-3 text-success-500 shrink-0" aria-hidden /> vegetarian · Prices in INR, taxes extra</span>
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
    /*
     * THE GUEST'S GROUND. This is the one page in the product a guest sees on their own phone, at
     * leisure, with nobody waiting on them — so it carries more finish than any operational
     * screen. `.material-matte` lays the system's fine grain over the whole column, which is what
     * turns a 400 px-wide slab of charcoal (or of warm white) into a material rather than a flat
     * fill. It is the page ground only; the grain appears exactly once per screen, as it does on
     * the management hero, and the dish cards on top of it take gloss alone.
     */
    <div className="min-h-screen bg-surface material-matte max-w-lg mx-auto shadow-panel sm:my-0">
      <header className="sticky top-0 z-30 bg-surface-raised/95 backdrop-blur supports-[backdrop-filter]:bg-surface-raised/80 border-b border-neutral-200 h-14 flex items-center gap-3 px-4">
        <Routes>
          <Route path="offers" element={<button type="button" onClick={() => navigate('.')} aria-label="Back to menu" className="h-9 w-9 -ml-2 flex items-center justify-center rounded-sm text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 transition-colors duration-control"><ChevronLeft className="h-5 w-5" /></button>} />
          {/* The venue monogram is the only mark on the guest screen, so it carries the gold —
              the `.fill-gold` ramp with a gloss over it, the same treatment the product's own
              brand tile takes in the app chrome. Its edge is the inset `ring`, so no
              `.material-edge` (which would replace it). */}
          <Route path="*" element={data.business.logoUrl ? <img src={data.business.logoUrl} alt="" className="h-9 w-9 rounded-sm object-cover" /> : <span className="h-9 w-9 rounded-sm fill-gold material-gloss bg-primary-500 text-on-primary ring-1 ring-inset ring-primary-400 flex items-center justify-center font-bold">{data.business.name[0]}</span>} />
        </Routes>
        <div className="min-w-0 flex-1"><p className="font-semibold truncate leading-tight text-neutral-900">{data.business.name}</p><p className="text-caption text-neutral-500 truncate">{data.table.floorName} · <span className="font-semibold text-neutral-800">Table {data.table.number}</span></p></div>
        <Link to="offers" className="h-10 w-10 flex items-center justify-center rounded-sm hover:bg-neutral-100 text-success-700 transition-colors duration-control" aria-label="Offers"><Tag className="h-5 w-5" /></Link>
      </header>
      <Routes>
        <Route index element={<>
          <div className="px-4 pt-5"><p className="text-label uppercase text-primary-700">Welcome</p><h1 className="text-heading text-neutral-900 mt-1">{data.business.welcomeMessage || `Welcome to ${data.business.name}`}</h1></div>
          <MenuHome data={data} s={s} openItem={openItem} />
        </>} />
        <Route path="offers" element={<OffersView data={data} />} />
        <Route path="*" element={<MenuHome data={data} s={s} openItem={openItem} />} />
      </Routes>
      {s.count > 0 && (
        /*
         * THE BASKET SUMMARY. `Reveal soft` — a fade with no rise. It appears the moment the guest
         * adds their first dish, which is a direct response to their own tap, so it is allowed an
         * entrance; but it is a bar that sits under the guest's thumb, so it must not slide up into
         * the place their finger is already travelling to. A fade puts it there without moving it.
         *
         * It plays ONCE: the element persists for the whole life of the selection, so adding a
         * second dish updates the count and the total in place and re-animates nothing.
         */
        <Reveal soft className="fixed bottom-4 inset-x-0 z-30 flex justify-center px-4 pointer-events-none">
          {/* The single primary action on the guest screen: the `.fill-gold` ramp with a gloss
              over it, an `on-primary` label, and the one shadow reserved for a primary action.
              `shadow-gold` is a `box-shadow`, so no `.material-edge` here either. */}
          <button
            type="button"
            onClick={() => setSelOpen(true)}
            className="pointer-events-auto w-full max-w-lg min-h-pos rounded-md fill-gold material-gloss bg-primary-500 text-on-primary border border-primary-400 shadow-gold flex items-center justify-between px-5 font-semibold transition-colors duration-control hover:border-primary-700 press"
          >
            <span className="inline-flex items-center gap-2"><ListChecks className="h-5 w-5" aria-hidden />{s.count} item{s.count > 1 ? 's' : ''} selected</span><span className="tnum">{money(s.total)} · Show waiter</span>
          </button>
        </Reveal>
      )}
      <ItemSheet item={currentItem} offers={data.offers} onClose={closeItem} onAdd={s.add} />
      <SelectionSheet open={selOpen} onClose={() => setSelOpen(false)} s={s} />
    </div>
  );
}
