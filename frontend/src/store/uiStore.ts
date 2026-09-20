import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'warning' | 'info';
export interface Toast { id: number; type: ToastType; title: string; description?: string; durationMs: number }

interface UiState {
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  toasts: Toast[];
  toggleSidebar: () => void;
  setMobileNav: (open: boolean) => void;
  pushToast: (t: Omit<Toast, 'id' | 'durationMs'> & { durationMs?: number }) => void;
  dismissToast: (id: number) => void;
}

let toastSeq = 0;

export const useUiStore = create<UiState>()((set) => ({
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
