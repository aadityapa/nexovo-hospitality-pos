import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

/**
 * THEME
 * `system` follows the operating system and keeps following it while the app is open;
 * `light` / `dark` are explicit choices that outlive a reload.
 *
 * The resolved theme is written to `<html data-theme>` (and the `theme-color` meta, so the
 * browser chrome on a phone matches). It is applied before React paints — see the inline
 * bootstrap in index.html — so a dark-theme operator never gets a white flash on load.
 */
export type ThemePref = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const THEME_KEY = 'nexovo.theme';
const systemTheme = (): ResolvedTheme =>
  (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark');

const readThemePref = (): ThemePref => {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
  } catch { return 'system'; }
};

export const resolveTheme = (pref: ThemePref): ResolvedTheme => (pref === 'system' ? systemTheme() : pref);

/** Paints the choice. Kept outside React so the bootstrap and the store share one implementation. */
export function applyTheme(pref: ThemePref): ResolvedTheme {
  const resolved = resolveTheme(pref);
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', resolved);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'light' ? '#F4F6F8' : '#080A0C');
  }
  return resolved;
}
export interface Toast { id: number; type: ToastType; title: string; description?: string; durationMs: number }

interface UiState {
  theme: ThemePref;
  resolvedTheme: ResolvedTheme;
  setTheme: (t: ThemePref) => void;
  /** Cycles light → dark → system, which is what the header control does. */
  cycleTheme: () => void;
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  toasts: Toast[];
  toggleSidebar: () => void;
  setMobileNav: (open: boolean) => void;
  pushToast: (t: Omit<Toast, 'id' | 'durationMs'> & { durationMs?: number }) => void;
  dismissToast: (id: number) => void;
}

let toastSeq = 0;

export const useUiStore = create<UiState>()((set, get) => ({
  theme: readThemePref(),
  resolvedTheme: resolveTheme(readThemePref()),
  setTheme: (t) => {
    try { localStorage.setItem(THEME_KEY, t); } catch { /* private mode — the choice just won't persist */ }
    set({ theme: t, resolvedTheme: applyTheme(t) });
  },
  cycleTheme: () => {
    const order: ThemePref[] = ['light', 'dark', 'system'];
    get().setTheme(order[(order.indexOf(get().theme) + 1) % order.length]);
  },
  sidebarCollapsed: (() => { try { return localStorage.getItem('nexovo.sidebar') === '1'; } catch { return false; } })(),
  mobileNavOpen: false,
  toasts: [],
  toggleSidebar: () => set((s) => { const v = !s.sidebarCollapsed; try { localStorage.setItem('nexovo.sidebar', v ? '1' : '0'); } catch { /* ignore */ } return { sidebarCollapsed: v }; }),
  setMobileNav: (open) => set({ mobileNavOpen: open }),
  pushToast: (t) => set((s) => ({ toasts: [...s.toasts.slice(-4), { id: ++toastSeq, durationMs: t.type === 'error' ? 6000 : 3500, ...t }] })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

/** Imperative helpers usable outside React (e.g. in mutation callbacks). */
export const toast = {
  success: (title: string, description?: string) => useUiStore.getState().pushToast({ type: 'success', title, description }),
  error: (title: string, description?: string) => useUiStore.getState().pushToast({ type: 'error', title, description }),
  warning: (title: string, description?: string) => useUiStore.getState().pushToast({ type: 'warning', title, description }),
  info: (title: string, description?: string) => useUiStore.getState().pushToast({ type: 'info', title, description }),
};

/**
 * Keeps `system` actually following the system. Registered once at module load rather than in a
 * component, so it survives every route change and never double-subscribes.
 */
if (typeof window !== 'undefined' && window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    const { theme } = useUiStore.getState();
    if (theme === 'system') useUiStore.setState({ resolvedTheme: applyTheme('system') });
  });
}
