import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { MenuItem, NewOrderItemInput } from '@/types';

export interface CartLine {
  key: string;
  menuItemId: number;
  name: string;
  price: number;
  prepLocation: 'KITCHEN' | 'BAR';
  qty: number;
  notes: string;
}

interface CartState {
  /** local (unsent) lines per table — survives refresh, cleared on send */
  carts: Record<number, CartLine[]>;
  add: (tableId: number, item: MenuItem, qty?: number, notes?: string) => void;
  setQty: (tableId: number, key: string, qty: number) => void;
  setNotes: (tableId: number, key: string, notes: string) => void;
  remove: (tableId: number, key: string) => void;
  clear: (tableId: number) => void;
}

const lineKey = (menuItemId: number, notes: string) => `${menuItemId}|${notes.trim().toLowerCase()}`;

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      carts: {},
      add: (tableId, item, qty = 1, notes = '') => set((s) => {
        const lines = s.carts[tableId] ?? [];
        const key = lineKey(item.id, notes);
        const idx = lines.findIndex((l) => l.key === key);
        const next = idx >= 0 ? lines.map((l, i) => (i === idx ? { ...l, qty: Math.min(999, l.qty + qty) } : l))
          : [...lines, { key, menuItemId: item.id, name: item.name, price: item.price, prepLocation: item.prepLocation, qty, notes: notes.trim() }];
        return { carts: { ...s.carts, [tableId]: next } };
      }),
      setQty: (tableId, key, qty) => set((s) => ({ carts: { ...s.carts, [tableId]: (s.carts[tableId] ?? []).map((l) => (l.key === key ? { ...l, qty: Math.max(1, Math.min(999, qty)) } : l)) } })),
      setNotes: (tableId, key, notes) => set((s) => {
        const lines = s.carts[tableId] ?? [];
        const cur = lines.find((l) => l.key === key);
        if (!cur) return s;
        const newKey = lineKey(cur.menuItemId, notes);
        const merged = lines.filter((l) => l.key !== key);
        const existing = merged.find((l) => l.key === newKey);
        const next = existing ? merged.map((l) => (l.key === newKey ? { ...l, qty: l.qty + cur.qty } : l)) : [...merged, { ...cur, key: newKey, notes: notes.trim() }];
        return { carts: { ...s.carts, [tableId]: next } };
      }),
      remove: (tableId, key) => set((s) => ({ carts: { ...s.carts, [tableId]: (s.carts[tableId] ?? []).filter((l) => l.key !== key) } })),
      clear: (tableId) => set((s) => { const c = { ...s.carts }; delete c[tableId]; return { carts: c }; }),
    }),
    { name: 'nexovo.cart', storage: createJSONStorage(() => sessionStorage) },
  ),
);

export function cartToItems(lines: CartLine[]): NewOrderItemInput[] {
  return lines.map((l) => ({ menuItemId: l.menuItemId, quantity: l.qty, notes: l.notes || undefined }));
}
