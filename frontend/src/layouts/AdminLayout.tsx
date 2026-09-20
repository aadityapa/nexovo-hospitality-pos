import { Outlet } from 'react-router-dom';
import { useUiStore } from '@/store/uiStore';
import { useAuth } from '@/hooks/useAuth';
import { ADMIN_NAV, ADMIN_BOTTOM_NAV, MANAGER_BOTTOM_NAV, HOST_BOTTOM_NAV } from '@/config/navigation';
import { Sidebar, AppHeader, BottomNav, MobileSidebar } from '@/components/layout/Shell';
import { useRealtimeInvalidate } from '@/hooks/useRealtime';

/** Desktop-first shell for Admin, Manager & Host: collapsible sidebar + header; drawer + bottom nav on mobile. */
export default function AdminLayout() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebar);
  const setMobile = useUiStore((s) => s.setMobileNav);
  const { role } = useAuth();
  useRealtimeInvalidate(['orders', 'tables', 'bills', 'menu', 'notifications']);
  const bottom = role === 'MANAGER' ? MANAGER_BOTTOM_NAV : role === 'HOST' ? HOST_BOTTOM_NAV : ADMIN_BOTTOM_NAV;

  return (
    <div className="min-h-dvh flex bg-surface">
      <a href="#main" className="sr-only-focusable absolute z-toast m-3 rounded-sm bg-primary-600 px-4 py-2 text-sm font-medium text-white">
        Skip to content
      </a>

      <aside className="hidden lg:block sticky top-0 h-dvh shrink-0">
        <Sidebar sections={ADMIN_NAV} collapsed={collapsed} onToggle={toggle} />
      </aside>
      <MobileSidebar sections={ADMIN_NAV} />

      <div className="flex-1 min-w-0 flex flex-col">
        <AppHeader onMenu={() => setMobile(true)} />
        <main id="main" tabIndex={-1} className="flex-1 p-4 sm:p-6 pb-24 lg:pb-8 max-w-[1600px] w-full mx-auto outline-none">
          <Outlet />
        </main>
        <BottomNav items={bottom} />
      </div>
    </div>
  );
}
