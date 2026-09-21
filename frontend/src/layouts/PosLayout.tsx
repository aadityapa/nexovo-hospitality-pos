import { Outlet, NavLink } from 'react-router-dom';
import { cn } from '@/utils/cn';
import { useAuthStore } from '@/store/authStore';
import { WAITER_NAV, CASHIER_NAV, type NavItem } from '@/config/navigation';
import { AppHeader, BottomNav, BrandMark } from '@/components/layout/Shell';
import { useRealtimeInvalidate } from '@/hooks/useRealtime';
import { PageTransition } from '@/components/motion';

/**
 * Tablet-first shell for Waiter & Cashier: compact top bar with inline nav on ≥ lg,
 * bottom navigation below. No sidebar — every pixel goes to tables and order entry.
 */
export default function PosLayout({ variant }: { variant: 'waiter' | 'cashier' }) {
  const items: NavItem[] = variant === 'waiter' ? WAITER_NAV : CASHIER_NAV;
  const can = useAuthStore((s) => s.hasPermission);
  useRealtimeInvalidate(variant === 'waiter' ? ['orders', 'tables', 'kitchen', 'bar', 'menu'] : ['orders', 'tables', 'bills', 'menu']);

  return (
    <div className="min-h-dvh flex flex-col bg-surface has-bottom-nav">
      <a href="#main" className="sr-only-focusable absolute z-toast m-3 rounded-sm bg-primary-500 px-4 py-2 text-sm font-semibold text-on-primary shadow-gold">
        Skip to content
      </a>
      <AppHeader
        left={<div className="pr-3 mr-1 border-r border-neutral-200 hidden sm:block"><BrandMark /></div>}
        right={
          <nav aria-label="Primary" className="hidden lg:flex items-center gap-1 mr-2">
            {items.filter((i) => !i.permission || can(i.permission)).map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                end={it.end}
                /* Same active language as the sidebar rail — a gold label on a gold wash with a
                   hairline, never a solid gold pill sitting in the header. */
                className={({ isActive }) => cn(
                  'inline-flex items-center gap-2 px-3 min-h-touch rounded-sm text-sm font-medium transition-colors duration-control',
                  isActive ? 'bg-primary-50 text-primary-700 ring-1 ring-inset ring-primary-200' : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
                )}
              >
                <it.icon className="h-4 w-4" aria-hidden />{it.label}
              </NavLink>
            ))}
          </nav>
        }
      />
      <main id="main" tabIndex={-1} className="flex-1 p-3 sm:p-5 pb-nav max-w-[1600px] w-full mx-auto outline-none">
        <PageTransition><Outlet /></PageTransition>
      </main>
      <BottomNav items={items} />
    </div>
  );
}
