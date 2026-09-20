import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Menu, ChevronLeft, ChevronRight, LogOut, Bell, Building2, ChevronDown, UserCircle, X, Check, CheckCheck,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/store/authStore';
import { useUiStore, toast } from '@/store/uiStore';
import { branchApi, branchesApi, notificationsApi } from '@/services/api/endpoints';
import { ROLE_LABELS } from '@/config/permissions';
import { SEVERITY_ICON, SEVERITY_TEXT, notificationTarget } from '@/config/notifications';
import { env } from '@/config/env';
import { fmtRelative } from '@/utils/date';
import type { NavItem, NavSection } from '@/config/navigation';
import type { AppNotification } from '@/types';
import { Avatar } from '@/components/ui';
import { ConnectionStatus } from './ConnectionStatus';

/** Closes a popover on outside click. */
function useClickOutside(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [open, onClose]);
  return ref;
}

export function BrandMark({ collapsed, dark }: { collapsed?: boolean; dark?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <span
        className={cn(
          'h-8 w-8 rounded-md flex items-center justify-center font-bold text-sm shrink-0',
          dark ? 'bg-primary-500 text-white' : 'bg-primary-600 text-white',
        )}
        aria-hidden
      >
        N
      </span>
      {!collapsed && <span className={cn('font-semibold truncate tracking-tight', dark ? 'text-white' : 'text-neutral-900')}>{env.appName}</span>}
    </div>
  );
}

export function useBranch() {
  return useQuery({ queryKey: ['branch'], queryFn: branchApi.current, staleTime: 5 * 60 * 1000 });
}

// ---------------------------------------------------------------- Sidebar
export function Sidebar({ sections, collapsed, onToggle, mobile, onClose }: {
  sections: NavSection[]; collapsed: boolean; onToggle?: () => void; mobile?: boolean; onClose?: () => void;
}) {
  const can = useAuthStore((s) => s.hasPermission);
  const visible = sections
    .map((s) => ({ ...s, items: s.items.filter((i) => !i.permission || can(i.permission)) }))
    .filter((s) => s.items.length > 0);

  return (
    <nav
      aria-label="Main navigation"
      className={cn('chrome-dark flex flex-col h-full bg-neutral-900 text-neutral-300', collapsed ? 'w-[72px]' : 'w-64')}
    >
      <div className={cn('h-16 flex items-center border-b border-white/10 shrink-0', collapsed ? 'px-3 justify-center' : 'px-4 justify-between')}>
        <BrandMark collapsed={collapsed} dark />
        {mobile && (
          <button type="button" onClick={onClose} aria-label="Close menu" className="h-9 w-9 -mr-1 rounded-sm flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/10 transition-colors">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className={cn('flex-1 overflow-y-auto overscroll-contain py-4 space-y-6', collapsed ? 'px-2' : 'px-3')}>
        {visible.map((section, i) => (
          <div key={section.title ?? i}>
            {section.title && !collapsed && (
              <p className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{section.title}</p>
            )}
            {section.title && collapsed && i > 0 && <hr className="border-white/10 mb-3 mx-2" />}
            <ul className="space-y-0.5">
              {section.items.map((it) => (
                <li key={it.to}>
                  <NavLink
                    to={it.to}
                    end={it.end}
                    onClick={onClose}
                    title={collapsed ? it.label : undefined}
                    className={({ isActive }) => cn(
                      'group relative flex items-center gap-3 rounded-sm px-3 min-h-touch text-sm font-medium transition-colors',
                      isActive ? 'bg-primary-600 text-white' : 'text-neutral-300 hover:bg-white/10 hover:text-white',
                      collapsed && 'justify-center px-0',
                    )}
                  >
                    {({ isActive }) => (
                      <>
                        <it.icon className={cn('h-[18px] w-[18px] shrink-0', !isActive && 'text-neutral-400 group-hover:text-white')} aria-hidden />
                        {!collapsed && <span className="truncate">{it.label}</span>}
                        {collapsed && <span className="sr-only">{it.label}</span>}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {env.isMock && !collapsed && (
        <p className="px-4 py-3 text-[11px] leading-snug text-neutral-500 border-t border-white/10 shrink-0">
          Demo backend — data is stored in this browser only.
        </p>
      )}

      {/* Collapse control sits at the foot of the rail so it never crowds the brand. */}
      {!mobile && onToggle && (
        <div className={cn('border-t border-white/10 shrink-0 p-2', collapsed ? 'flex justify-center' : '')}>
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn(
              'flex items-center gap-2.5 rounded-sm min-h-touch text-sm text-neutral-400 hover:text-white hover:bg-white/10 transition-colors',
              collapsed ? 'w-11 justify-center' : 'w-full px-3',
            )}
          >
            {collapsed ? <ChevronRight className="h-[18px] w-[18px]" aria-hidden /> : <><ChevronLeft className="h-[18px] w-[18px]" aria-hidden />Collapse</>}
          </button>
        </div>
      )}
    </nav>
  );
}

// ---------------------------------------------------------------- UserMenu
export function UserMenu({ compact }: { compact?: boolean }) {
  const { user, role, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(open, () => setOpen(false));
  const navigate = useNavigate();
  if (!user) return null;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-sm px-1.5 py-1 hover:bg-neutral-100 min-h-touch transition-colors"
      >
        <Avatar name={user.fullName} size="sm" />
        {!compact && (
          <span className="hidden sm:flex flex-col items-start leading-tight">
            <span className="text-sm font-medium text-neutral-900 max-w-[140px] truncate">{user.fullName}</span>
            <span className="text-[11px] text-neutral-500">{role ? ROLE_LABELS[role] : ''}</span>
          </span>
        )}
        <ChevronDown className={cn('h-4 w-4 text-neutral-400 hidden sm:block transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-1.5 w-60 popover p-1.5 z-nav animate-scale-in">
          <div className="px-2.5 py-2 border-b border-neutral-100 mb-1">
            <p className="text-sm font-medium truncate text-neutral-900">{user.fullName}</p>
            <p className="text-caption text-neutral-500 truncate">{user.email || user.username}</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {user.roles.map((r) => (
                <span key={r} className="text-[10px] rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-700 font-medium">{ROLE_LABELS[r]}</span>
              ))}
            </div>
          </div>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); navigate('/profile'); }} className="w-full flex items-center gap-2.5 px-2.5 min-h-touch text-sm rounded-sm hover:bg-neutral-100 transition-colors">
            <UserCircle className="h-4 w-4 text-neutral-500" aria-hidden />My profile
          </button>
          <button type="button" role="menuitem" onClick={() => void logout()} className="w-full flex items-center gap-2.5 px-2.5 min-h-touch text-sm rounded-sm hover:bg-danger-50 text-danger-700 transition-colors">
            <LogOut className="h-4 w-4" aria-hidden />Sign out
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Branch switcher
/** Shows the current branch; becomes a dropdown when the user can reach more than one. */
export function BranchSwitcher() {
  const { data: branch } = useBranch();
  const user = useAuthStore((s) => s.user);
  const branchId = useAuthStore((s) => s.branchId);
  const setBranch = useAuthStore((s) => s.setBranch);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const multi = (user?.branchIds?.length ?? 0) > 1 || !!user?.roles.includes('SUPER_ADMIN');
  const branches = useQuery({ queryKey: ['branches'], queryFn: branchesApi.list, staleTime: 60_000, enabled: multi });
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(open, () => setOpen(false));

  const choose = (id: number) => {
    setOpen(false);
    if (id === branchId || branches.data?.find((x) => Number(x.id) === id)?.isCurrent) return;
    setBranch(id);
    // Every cached query is branch-scoped, so the whole cache is dropped on switch.
    qc.clear();
    const b = branches.data?.find((x) => Number(x.id) === id);
    toast.info('Branch switched', b ? `${b.name}${b.city ? ` · ${b.city}` : ''}` : undefined);
    navigate('/', { replace: true });
  };

  const label = (
    <>
      <Building2 className="h-4 w-4 text-neutral-400 shrink-0" aria-hidden />
      <span className="truncate font-medium text-neutral-800">{branch?.businessName ?? '…'}</span>
      {branch?.name && <><span className="hidden md:inline text-neutral-300" aria-hidden>·</span><span className="hidden md:inline truncate text-neutral-500">{branch.name}</span></>}
    </>
  );

  if (!multi) return <div className="flex items-center gap-2 min-w-0 text-sm">{label}</div>;

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-2 min-w-0 max-w-[16rem] text-sm rounded-sm px-2 py-1 hover:bg-neutral-100 min-h-touch transition-colors"
      >
        {label}
        <ChevronDown className={cn('h-4 w-4 text-neutral-400 shrink-0 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div role="listbox" aria-label="Switch branch" className="absolute left-0 mt-1.5 w-72 popover p-1.5 z-nav animate-scale-in">
          <p className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Your branches</p>
          {(branches.data ?? []).map((b) => {
            const current = b.isCurrent || b.id === branchId;
            return (
              <button
                key={b.id}
                type="button"
                role="option"
                aria-selected={current}
                onClick={() => choose(Number(b.id))}
                className={cn('w-full flex items-center gap-2 px-2.5 py-2 text-sm rounded-sm text-left hover:bg-neutral-100 transition-colors', current && 'bg-primary-50')}
              >
                <span className="flex-1 min-w-0">
                  <span className="block font-medium truncate text-neutral-900">{b.name}</span>
                  <span className="text-caption text-neutral-500">
                    {b.code}{b.city ? ` · ${b.city}` : ''} · {b.tableCount} tables{!b.isActive ? ' · inactive' : ''}
                  </span>
                </span>
                {current && <Check className="h-4 w-4 text-primary-600 shrink-0" aria-hidden />}
              </button>
            );
          })}
          {branches.isLoading && <p className="px-2.5 py-2 text-sm text-neutral-500">Loading…</p>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Notification centre
export function NotificationBell() {
  const can = useAuthStore((s) => s.hasPermission);
  const enabled = can('notifications:view');
  const qc = useQueryClient();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['notifications', 'bell'], queryFn: () => notificationsApi.list(true, 20), enabled, staleTime: 15_000, refetchInterval: 30_000 });
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(open, () => setOpen(false));
  const inv = () => void qc.invalidateQueries({ queryKey: ['notifications'] });
  const unread = q.data?.unreadCount ?? 0;
  if (!enabled) return null;

  const openItem = async (n: AppNotification) => {
    setOpen(false);
    if (!n.isRead) { try { await notificationsApi.markRead(n.id); } finally { inv(); } }
    navigate(notificationTarget(n) ?? '/admin/notifications');
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={unread ? `Notifications — ${unread} unread` : 'Notifications'}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="relative h-10 w-10 flex items-center justify-center rounded-sm hover:bg-neutral-100 text-neutral-600 transition-colors"
      >
        <Bell className="h-5 w-5" aria-hidden />
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-danger-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums ring-2 ring-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label="Notifications" className="absolute right-0 mt-1.5 w-[min(92vw,380px)] popover z-nav animate-scale-in overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-neutral-100">
            <p className="text-sm font-semibold text-neutral-900">
              Notifications{unread ? <span className="ml-1 text-caption font-normal text-neutral-500">· {unread} unread</span> : null}
            </p>
            {unread > 0 && (
              <button type="button" onClick={async () => { try { await notificationsApi.markAllRead(); } finally { inv(); } }} className="inline-flex items-center gap-1 text-caption text-primary-700 hover:underline underline-offset-2">
                <CheckCheck className="h-3.5 w-3.5" aria-hidden />Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-[60vh] overflow-y-auto overscroll-contain divide-y divide-neutral-100">
            {(q.data?.items ?? []).length === 0 && (
              <li className="px-4 py-8 text-sm text-neutral-500 text-center">You're all caught up.</li>
            )}
            {(q.data?.items ?? []).map((n) => {
              const Icon = SEVERITY_ICON[n.severity];
              return (
                <li key={n.id}>
                  <button type="button" onClick={() => void openItem(n)} className={cn('w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-neutral-50 transition-colors', !n.isRead && 'bg-primary-50/40')}>
                    <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', SEVERITY_TEXT[n.severity])} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className={cn('block text-sm text-neutral-900', !n.isRead && 'font-semibold')}>{n.title}</span>
                      {n.body && <span className="block text-caption text-neutral-600 line-clamp-2 mt-0.5">{n.body}</span>}
                      <span className="block text-[11px] text-neutral-400 mt-1">{fmtRelative(n.createdAt)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-neutral-100 px-4 py-2.5">
            <button type="button" onClick={() => { setOpen(false); navigate('/admin/notifications'); }} className="text-caption text-primary-700 hover:underline underline-offset-2">
              View all &amp; alert settings
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Header
export function AppHeader({ onMenu, title, left, right }: { onMenu?: () => void; title?: ReactNode; left?: ReactNode; right?: ReactNode }) {
  return (
    <header className="h-16 bg-white border-b border-neutral-200 flex items-center gap-2 sm:gap-3 px-3 sm:px-5 sticky top-0 z-nav">
      {onMenu && (
        <button type="button" onClick={onMenu} aria-label="Open menu" className="lg:hidden h-10 w-10 -ml-1 flex items-center justify-center rounded-sm hover:bg-neutral-100 transition-colors shrink-0">
          <Menu className="h-5 w-5" />
        </button>
      )}
      {left}
      <BranchSwitcher />
      {title && <div className="hidden xl:block text-sm text-neutral-500 truncate border-l border-neutral-200 pl-3 ml-1">{title}</div>}
      <div className="flex-1" />
      {right}
      <span className="hidden sm:inline-flex"><ConnectionStatus /></span>
      <NotificationBell />
      <UserMenu />
    </header>
  );
}

// ---------------------------------------------------------------- BottomNav
export function BottomNav({ items }: { items: NavItem[] }) {
  const can = useAuthStore((s) => s.hasPermission);
  const visible = items.filter((i) => !i.permission || can(i.permission));
  return (
    <nav aria-label="Primary" className="fixed bottom-0 inset-x-0 z-nav bg-white border-t border-neutral-200 safe-bottom lg:hidden shadow-bar-bottom">
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${visible.length}, minmax(0, 1fr))` }}>
        {visible.map((it) => (
          <li key={it.to}>
            <NavLink
              to={it.to}
              end={it.end}
              className={({ isActive }) => cn(
                'flex flex-col items-center justify-center gap-1 min-h-[60px] text-[11px] font-medium transition-colors relative',
                isActive ? 'text-primary-700' : 'text-neutral-500 hover:text-neutral-800',
              )}
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute top-0 inset-x-4 h-0.5 rounded-full bg-primary-600" aria-hidden />}
                  <it.icon className={cn('h-5 w-5', isActive && 'stroke-[2.25]')} aria-hidden />
                  {it.label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Drawer sidebar for mobile. */
export function MobileSidebar({ sections }: { sections: NavSection[] }) {
  const open = useUiStore((s) => s.mobileNavOpen);
  const setOpen = useUiStore((s) => s.setMobileNav);
  useEffect(() => {
    if (!open) return undefined;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = prev; };
  }, [open, setOpen]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-drawer lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
      <div className="absolute inset-0 bg-neutral-900/60 animate-fade-in" onClick={() => setOpen(false)} aria-hidden />
      <div className="absolute inset-y-0 left-0 shadow-modal animate-slide-in-right">
        <Sidebar sections={sections} collapsed={false} mobile onClose={() => setOpen(false)} />
      </div>
    </div>
  );
}
