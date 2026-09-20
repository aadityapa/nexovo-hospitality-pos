import { useMemo, useState } from 'react';
import { Search, Plus, ShoppingCart, ChefHat, Wine, StickyNote, Send, Save, X, Trash2, CheckCircle2 } from 'lucide-react';
import { useCategories, useMenuItems } from '@/features/menu/hooks';
import { useCartStore, cartToItems, type CartLine } from '@/store/cartStore';
import { useDebounce } from '@/hooks/useRealtime';
import { cn } from '@/utils/cn';
import { money } from '@/utils/money';
import {
  Button, Modal, ConfirmDialog, QuantitySelector, QuickChips, LoadingState, ErrorState, EmptyState,
  Textarea, Badge, ItemImage, StatusBadge,
} from '@/components/ui';
import type { MenuItem, NewOrderItemInput, OrderItem } from '@/types';

const NOTE_CHIPS = ['No onion', 'Extra cheese', 'Less spicy', 'Extra spicy', 'Less ice', 'No ice', 'Jain', 'Well done'];

export interface OrderEntryProps {
  tableId: number;
  tableName: string;
  orderNumber?: string;
  /** existing confirmed order: "Send" adds a new batch; draft: send = confirm */
  mode: 'new' | 'draft' | 'append';
  /** lines already sent to the kitchen/bar, shown read-only so the two are never confused */
  existingItems?: OrderItem[];
  onSend: (items: NewOrderItemInput[]) => Promise<void>;
  onSaveDraft?: (items: NewOrderItemInput[]) => Promise<void>;
  sending?: boolean;
  saving?: boolean;
  onCancel?: () => void;
}

function NoteModal({ line, tableId, onClose }: { line: CartLine | null; tableId: number; onClose: () => void }) {
  const setNotes = useCartStore((s) => s.setNotes);
  const [text, setText] = useState(line?.notes ?? '');
  const chips = text.split(',').map((s) => s.trim()).filter(Boolean);
  const toggle = (c: string) => setText(chips.includes(c) ? chips.filter((x) => x !== c).join(', ') : [...chips, c].join(', '));
  if (!line) return null;
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`Instructions — ${line.name}`}
      description="Sent to the kitchen or bar with this line."
      footer={<>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => { setNotes(tableId, line.key, text); onClose(); }}>Save note</Button>
      </>}
    >
      <QuickChips options={NOTE_CHIPS} selected={chips} onToggle={toggle} className="mb-4" />
      <Textarea label="Custom instruction" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. sauce on the side" maxLength={300} data-autofocus />
    </Modal>
  );
}

/** POS-style order entry: menu on the left, a persistent order panel on the right. Mobile: sheet. */
export function OrderEntry({
  tableId, tableName, orderNumber, mode, existingItems = [], onSend, onSaveDraft, sending, saving, onCancel,
}: OrderEntryProps) {
  const cats = useCategories(false);
  const [catId, setCatId] = useState<number | 'ALL' | 'POPULAR'>('POPULAR');
  const [search, setSearch] = useState('');
  const dq = useDebounce(search, 200).toLowerCase();
  const items = useMenuItems({});
  const lines = useCartStore((s) => s.carts[tableId] ?? []);
  const { add, setQty, remove, clear } = useCartStore();
  const [noteLine, setNoteLine] = useState<CartLine | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const visible = useMemo(
    () => (items.data ?? [])
      .filter((i) => i.isActive)
      .filter((i) => (dq
        ? i.name.toLowerCase().includes(dq) || i.code.toLowerCase().includes(dq)
        : catId === 'ALL' ? true : catId === 'POPULAR' ? i.isPopular : i.categoryId === catId)),
    [items.data, dq, catId],
  );

  const qtyOf = (id: number) => lines.filter((l) => l.menuItemId === id).reduce((a, l) => a + l.qty, 0);
  const subtotal = lines.reduce((a, l) => a + l.qty * l.price, 0);
  const count = lines.reduce((a, l) => a + l.qty, 0);
  const kitchen = lines.filter((l) => l.prepLocation === 'KITCHEN').length;
  const bar = lines.filter((l) => l.prepLocation === 'BAR').length;
  const sentItems = existingItems.filter((i) => i.status !== 'CANCELLED');

  const send = async () => { await onSend(cartToItems(lines)); clear(tableId); setCartOpen(false); };
  const saveDraft = async () => { if (onSaveDraft) { await onSaveDraft(cartToItems(lines)); clear(tableId); } };

  const orderPanel = (
    <div className="flex flex-col h-full bg-white">
      <div className="px-4 py-3 border-b border-neutral-200 flex items-center gap-2 shrink-0">
        <div className="min-w-0 flex-1">
          <p className="font-bold text-lg leading-tight truncate">{tableName}</p>
          <p className="text-caption text-neutral-500 truncate">
            {orderNumber ? `${orderNumber} · ${mode === 'append' ? 'adding to this order' : 'draft — not sent'}` : 'New order'}
          </p>
        </div>
        {lines.length > 0 && (
          <Button size="sm" variant="ghost" className="text-danger-700" leftIcon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirmClear(true)}>
            Clear
          </Button>
        )}
        <button type="button" onClick={() => setCartOpen(false)} aria-label="Close order panel" className="lg:hidden h-10 w-10 flex items-center justify-center rounded-sm hover:bg-neutral-100 -mr-1">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain">
        {/* Already sent — read-only, so a waiter never re-sends what the kitchen already has. */}
        {sentItems.length > 0 && (
          <section className="border-b-4 border-neutral-100">
            <h3 className="px-4 pt-3 pb-1.5 text-label uppercase text-neutral-500 flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-success-600" aria-hidden />
              Already sent · {sentItems.length}
            </h3>
            <ul className="divide-y divide-neutral-100">
              {sentItems.map((i) => (
                <li key={i.id} className="px-4 py-2.5 flex items-start gap-2 bg-neutral-50/60">
                  <span className="tabular-nums text-neutral-500 text-sm w-6 shrink-0">{i.quantity}×</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-neutral-700 truncate">{i.itemName}</span>
                    {i.notes && <span className="block text-caption text-warning-700 uppercase tracking-wide">{i.notes}</span>}
                  </span>
                  <StatusBadge kind="item" status={i.status} size="sm" hideIcon />
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* New, unsent selection */}
        {sentItems.length > 0 && lines.length > 0 && (
          <h3 className="px-4 pt-3 pb-1.5 text-label uppercase text-primary-700">New items · not sent yet</h3>
        )}
        {lines.length === 0 ? (
          <EmptyState
            compact
            icon={<ShoppingCart className="h-6 w-6" />}
            title={sentItems.length ? 'No new items' : 'Nothing selected yet'}
            description="Tap items on the menu to add them."
          />
        ) : (
          <ul className="divide-y divide-neutral-100">
            {lines.map((l) => (
              <li key={l.key} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium leading-snug text-neutral-900">{l.name}</p>
                    <p className="text-caption text-neutral-500">
                      {money(l.price)} · {l.prepLocation === 'BAR' ? 'Bar' : 'Kitchen'}
                    </p>
                  </div>
                  <p className="font-semibold tabular-nums shrink-0">{money(l.price * l.qty)}</p>
                </div>
                {l.notes && <p className="mt-1.5 text-caption font-semibold text-warning-700 uppercase tracking-wide">{l.notes}</p>}
                <div className="mt-2.5 flex items-center gap-2">
                  <QuantitySelector value={l.qty} min={1} onChange={(q) => setQty(tableId, l.key, q)} onRemove={() => remove(tableId, l.key)} />
                  <Button size="sm" variant="ghost" leftIcon={<StickyNote className="h-4 w-4" />} onClick={() => setNoteLine(l)}>
                    {l.notes ? 'Edit note' : 'Add note'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-neutral-200 p-4 space-y-3 safe-bottom bg-white shrink-0">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-neutral-600 text-sm">
            New items
            <span className="text-caption text-neutral-500 block">
              {count} item{count === 1 ? '' : 's'}{kitchen > 0 && bar > 0 ? ` · ${kitchen} kitchen, ${bar} bar` : ''}
            </span>
          </span>
          <span className="text-xl font-bold tabular-nums">{money(subtotal)}</span>
        </div>
        <p className="text-caption text-neutral-500">Taxes and service charge are added on the bill.</p>
        <div className="grid grid-cols-2 gap-2">
          {mode !== 'append' && onSaveDraft ? (
            <Button variant="outline" size="pos" leftIcon={<Save className="h-4 w-4" />} disabled={lines.length === 0} loading={saving} onClick={() => void saveDraft()}>
              Save draft
            </Button>
          ) : (
            <Button variant="outline" size="pos" onClick={onCancel}>Back</Button>
          )}
          <Button size="pos" leftIcon={<Send className="h-4 w-4" />} disabled={lines.length === 0} loading={sending} onClick={() => void send()}>
            {mode === 'append' ? 'Send items' : 'Send order'}
          </Button>
        </div>
      </div>
    </div>
  );

  const chips = [
    { id: 'POPULAR' as const, name: 'Popular' },
    { id: 'ALL' as const, name: 'All' },
    ...(cats.data ?? []).map((c) => ({ id: c.id, name: c.name })),
  ];

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-4 lg:h-[calc(100dvh-8.5rem)]">
      {/* MENU */}
      <div className="flex flex-col min-h-0">
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 pointer-events-none" aria-hidden />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search the menu"
              aria-label="Search the menu"
              className="input-base input-pos pl-10 [&::-webkit-search-cancel-button]:appearance-none"
            />
          </div>
          {onCancel && <Button variant="outline" size="lg" className="hidden lg:inline-flex" onClick={onCancel}>Back</Button>}
        </div>

        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 -mx-1 px-1" role="group" aria-label="Menu categories">
          {chips.map((c) => {
            const on = catId === c.id && !dq;
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => { setCatId(c.id); setSearch(''); }}
                className={cn(
                  'shrink-0 min-h-touch px-4 rounded-full border text-sm font-medium transition-colors',
                  on ? 'bg-primary-600 text-white border-primary-600' : 'bg-white border-neutral-300 text-neutral-700 hover:border-neutral-400',
                )}
              >
                {c.name}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 pb-28 lg:pb-2">
          {items.isLoading && <LoadingState variant="cards" rows={3} />}
          {items.isError && <ErrorState error={items.error} onRetry={() => void items.refetch()} />}
          {items.data && (visible.length === 0 ? (
            <EmptyState compact title="No items" description={dq ? `Nothing matches “${search}”.` : 'No items in this category.'} />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5">
              {visible.map((it: MenuItem) => {
                const q = qtyOf(it.id);
                return (
                  <button
                    key={it.id}
                    type="button"
                    disabled={!it.isAvailable}
                    onClick={() => add(tableId, it)}
                    aria-label={`Add ${it.name}, ${money(it.price)}`}
                    className={cn(
                      'group relative text-left rounded-md border bg-white overflow-hidden flex flex-col transition-[border-color,box-shadow] press',
                      'disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100',
                      q > 0 ? 'border-primary-600 ring-1 ring-primary-600/20' : 'border-neutral-200 hover:border-neutral-300 hover:shadow-card',
                    )}
                  >
                    <div className="relative">
                      <ItemImage src={it.imageUrl} alt="" prepLocation={it.prepLocation} rounded="" className="h-20 w-full" />
                      {q > 0 && (
                        <span className="absolute top-1.5 right-1.5 h-6 min-w-6 px-1.5 rounded-full bg-primary-600 text-white text-xs font-bold flex items-center justify-center tabular-nums ring-2 ring-white">
                          {q}
                        </span>
                      )}
                      {!it.isAvailable && (
                        <span className="absolute inset-0 bg-white/75 flex items-center justify-center">
                          <Badge tone="danger" size="sm">Sold out</Badge>
                        </span>
                      )}
                    </div>
                    <div className="p-2.5 flex flex-col flex-1 min-h-[76px]">
                      <span className="text-[11px] text-neutral-500 flex items-center gap-1 truncate">
                        {it.prepLocation === 'BAR' ? <Wine className="h-3 w-3 shrink-0" aria-hidden /> : <ChefHat className="h-3 w-3 shrink-0" aria-hidden />}
                        <span className="truncate">{it.categoryName}</span>
                      </span>
                      <span className="font-semibold leading-snug mt-0.5 line-clamp-2 text-neutral-900">{it.name}</span>
                      {it.isBottleService && (
                        <span className="mt-1"><Badge tone="accent" size="sm">Bottle{it.bottleSizeMl ? ` · ${it.bottleSizeMl}ml` : ''}</Badge></span>
                      )}
                      <span className="mt-auto pt-2 flex items-center justify-between">
                        <span className="font-semibold tabular-nums">{money(it.price)}</span>
                        {it.isAvailable && <Plus className="h-4 w-4 text-primary-600" aria-hidden />}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ORDER PANEL — desktop */}
      <aside className="hidden lg:flex flex-col card p-0 overflow-hidden min-h-0" aria-label="Current order">{orderPanel}</aside>

      {/* ORDER PANEL — mobile launcher + sheet */}
      <div className="lg:hidden fixed bottom-[68px] inset-x-0 z-sticky px-3 pb-2 pointer-events-none">
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          disabled={count === 0}
          className="pointer-events-auto w-full min-h-pos rounded-md bg-neutral-900 text-white shadow-modal flex items-center justify-between px-4 font-semibold disabled:opacity-60 press"
        >
          <span className="inline-flex items-center gap-2"><ShoppingCart className="h-5 w-5" aria-hidden />{count} item{count === 1 ? '' : 's'}</span>
          <span className="tabular-nums">{money(subtotal)} · Review</span>
        </button>
      </div>
      {cartOpen && (
        <div className="lg:hidden fixed inset-0 z-modal flex flex-col" role="dialog" aria-modal="true" aria-label={`Order for ${tableName}`}>
          {orderPanel}
        </div>
      )}

      <NoteModal key={noteLine?.key ?? 'none'} line={noteLine} tableId={tableId} onClose={() => setNoteLine(null)} />
      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        variant="danger"
        title="Clear all new items?"
        message={`${count} unsent item${count === 1 ? '' : 's'} will be removed. Items already sent to the kitchen are not affected.`}
        confirmLabel="Clear items"
        onConfirm={() => { clear(tableId); setConfirmClear(false); }}
      />
    </div>
  );
}
