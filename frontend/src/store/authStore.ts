import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { User } from '@/types';
import type { Permission } from '@/config/permissions';

interface AuthState {
  token: string | null;
  expiresAt: string | null;
  user: User | null;
  rememberMe: boolean;
  /** Phase 2: branch context for this session (null = user's home branch) */
  branchId: number | null;
  setSession: (s: { token: string; expiresAt: string; user: User; rememberMe: boolean }) => void;
  setUser: (u: User) => void;
  setBranch: (branchId: number | null) => void;
  clear: () => void;
  hasPermission: (p: Permission | Permission[], mode?: 'any' | 'all') => boolean;
}

const KEY = 'nexovo.auth';

/** Remember-me → localStorage, otherwise sessionStorage (cleared when the tab closes). */
const dynamicStorage = {
  getItem: (name: string) => localStorage.getItem(name) ?? sessionStorage.getItem(name),
  setItem: (name: string, value: string) => {
    try {
      const parsed = JSON.parse(value) as { state?: { rememberMe?: boolean } };
      if (parsed.state?.rememberMe) { localStorage.setItem(name, value); sessionStorage.removeItem(name); }
      else { sessionStorage.setItem(name, value); localStorage.removeItem(name); }
    } catch { localStorage.setItem(name, value); }
  },
  removeItem: (name: string) => { localStorage.removeItem(name); sessionStorage.removeItem(name); },
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      expiresAt: null,
      user: null,
      rememberMe: false,
      branchId: null,
      setSession: ({ token, expiresAt, user, rememberMe }) => set({ token, expiresAt, user, rememberMe, branchId: user.currentBranchId ?? user.branchId }),
      setUser: (user) => set({ user }),
      setBranch: (branchId) => set({ branchId }),
      clear: () => set({ token: null, expiresAt: null, user: null, branchId: null }),
      hasPermission: (p, mode = 'any') => {
        const perms = get().user?.permissions ?? [];
        const list = Array.isArray(p) ? p : [p];
        if (list.length === 0) return true;
        return mode === 'all' ? list.every((x) => perms.includes(x)) : list.some((x) => perms.includes(x));
      },
    }),
    { name: KEY, storage: createJSONStorage(() => dynamicStorage) },
  ),
);

export function isSessionExpired(): boolean {
  const exp = useAuthStore.getState().expiresAt;
  return !!exp && new Date(exp).getTime() < Date.now();
}
