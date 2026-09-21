import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useUiStore } from '@/store/uiStore';
import { useAuth } from '@/hooks/useAuth';
import { useRouteSurface } from '@/hooks/useSurface';
import { ADMIN_RAIL, ADMIN_BOTTOM_NAV, MANAGER_BOTTOM_NAV, HOST_BOTTOM_NAV } from '@/config/navigation';
import { Sidebar, AppHeader, BottomNav, MobileSidebar, HeaderSlotProvider } from '@/components/layout/Shell';
import { useRealtimeInvalidate } from '@/hooks/useRealtime';
import { PageTransition } from '@/components/motion';
import { cn } from '@/utils/cn';

/**
 * Desktop-first shell for Admin, Manager & Host: collapsible rail + header; drawer + bottom nav on
 * mobile.
 *
 * SURFACE. The rail and the content column are painted independently, from the declarations in
 * `config/surfaces.ts` — some screens are warm ivory workspaces inside the charcoal product, and
 * two of them take the paper treatment all the way out to the rail. Each region carries its own
 * `bg-surface` and its own wash, because an island that swapped palette without painting itself
 * would resolve every token inside it against the page's ground rather than its own.
 */
export default function AdminLayout() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebar);
  const setMobile = useUiStore((s) => s.setMobileNav);
  const { role } = useAuth();
  const { shellClass, contentClass } = useRouteSurface();
  /* The header's search slot, as state rather than a ref: pages portal into it, and a ref would
     not tell them when it existed. */
  const [searchSlot, setSearchSlot] = useState<HTMLDivElement | null>(null);
  useRealtimeInvalidate(['orders', 'tables', 'bills', 'menu', 'notifications']);
  const bottom = role === 'MANAGER' ? MANAGER_BOTTOM_NAV : role === 'HOST' ? HOST_BOTTOM_NAV : ADMIN_BOTTOM_NAV;

  return (
    <div className="min-h-dvh flex bg-surface has-bottom-nav">
      {/* Only visible on focus — but when it appears it is the one thing on screen, so it takes
          the full primary treatment: gold fill, dark label, and the reserved gold shadow. */}
      <a href="#main" className="sr-only-focusable absolute z-toast m-3 rounded-sm bg-primary-500 px-4 py-2 text-sm font-semibold text-on-primary shadow-gold">
        Skip to content
      </a>

      <aside className={cn('hidden lg:block sticky top-0 h-dvh shrink-0', shellClass)}>
        <Sidebar entries={ADMIN_RAIL} collapsed={collapsed} onToggle={toggle} />
      </aside>
      <MobileSidebar entries={ADMIN_RAIL} surfaceClass={shellClass} />

      <div className={cn('flex-1 min-w-0 flex flex-col bg-surface chrome-wash', contentClass)}>
        <HeaderSlotProvider value={searchSlot}>
          <AppHeader onMenu={() => setMobile(true)} searchRef={setSearchSlot} />
          <main id="main" tabIndex={-1} className="flex-1 p-4 sm:p-5 lg:p-6 pb-nav max-w-[1600px] w-full mx-auto outline-none">
            <PageTransition><Outlet /></PageTransition>
          </main>
        </HeaderSlotProvider>
        <BottomNav items={bottom} />
      </div>
    </div>
  );
}
