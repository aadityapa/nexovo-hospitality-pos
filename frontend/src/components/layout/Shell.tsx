import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Menu, ChevronLeft, ChevronRight, LogOut, Bell, Building2, ChevronDown, UserCircle, X, Check, CheckCheck,
  Sun, Moon, MonitorCog,
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
import { isGroup, type NavEntry, type NavItem } from '@/config/navigation';
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

/**
 * Nexovo POS mark — the "N" tile plus the product wordmark.
 *
 * On the dark palette the tile is the one place gold is allowed to be a *surface* rather than a
 * stroke: the `.fill-gold` ramp (400 → 500 → 600, so the tile has depth rather than being one flat
 * gold) with the near-black `on-primary` letterform on it (12:1), and a hairline of the lighter
 * gold so the tile still has an edge where it meets the deepest chrome. White on gold reads at
 * 1.9:1 and is never used.
 *
 * MATERIAL. `.material-gloss` puts one specular band across the top so the mark catches light the
 * way a polished enamel badge does — it is the product's signature, and it is the smallest surface
 * in the app that is allowed to read as a material. The grain is not here (an 8 px tile cannot
 * carry it) and neither is `.material-edge`: the tile's edge is already an inset `ring`, which is
 * a `box-shadow`, and `.material-edge` is a `box-shadow` too — adding it would REPLACE the ring
 * and the tile would lose its edge against the rail. The ring is the bevel here.
 *
 * `dark` marks the deepest chrome (the sidebar rail, which sits on `surface-sunken`). That surface
 * follows the theme — it is chrome the operator stares at all day, so it is charcoal in dark and a
 * soft grey in light; only the kitchen/bar boards stay permanently dark. There the
 * tile also carries the reserved gold glow, which is what makes the mark the first thing the eye
 * lands on when the rail is otherwise pure charcoal; on the header it would compete with the
 * primary action, so it is dropped.
 */
export function BrandMark({ collapsed, dark }: { collapsed?: boolean; dark?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <span
        className={cn(
          'h-8 w-8 rounded-md shrink-0 grid place-items-center font-bold text-sm leading-none tracking-tight',
          'fill-gold material-gloss bg-primary-500 text-on-primary ring-1 ring-inset ring-primary-700/50',
          dark && 'shadow-gold',
        )}
        aria-hidden
      >
        N
      </span>
      {!collapsed && <span className="font-semibold truncate tracking-tight text-neutral-900">{env.appName}</span>}
    </div>
  );
}

export function useBranch() {
  return useQuery({ queryKey: ['branch'], queryFn: branchApi.current, staleTime: 5 * 60 * 1000 });
}

// ---------------------------------------------------------------- Sidebar
/** Does this path belong to this item? `end` items match exactly; the rest own their subtree. */
const itemActive = (pathname: string, it: NavItem) =>
  (it.end ? pathname === it.to : pathname === it.to || pathname.startsWith(`${it.to}/`));

/**
 * One row on the rail.
 *
 * ACTIVE = gold rail + gold label + the faintest gold wash. Not a filled gold block: on a dark
 * rail a solid gold pill is the loudest object on the entire screen, and it would outrank the
 * primary action of whatever page it navigated to. The 2 px rail is what carries the position;
 * the colour only confirms it.
 *
 * The rail takes `.fill-gold` — the same 400 → 500 → 600 ramp the brand tile and the hero hairline
 * use — so it reads as a machined edge rather than a flat block of colour. That is the only
 * material on this row. No gloss, no glow, and nothing here animates: an operator navigating at
 * speed must not have the target they are aiming at move or bloom under their finger.
 */
function RailLink({ item, collapsed, nested, onNavigate }: {
  item: NavItem; collapsed?: boolean; nested?: boolean; onNavigate?: () => void;
}) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) => cn(
        'group relative flex items-center rounded-md transition-colors duration-control',
        nested ? 'gap-2.5 pl-3 pr-2 py-[7px] text-[13px]' : 'gap-3 px-2.5 py-2 text-sm font-medium',
        isActive ? 'bg-primary-500/10 text-primary-700' : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
        collapsed && 'justify-center px-0 py-2.5',
      )}
    >
      {({ isActive }) => (
        <>
          {isActive && <span className={cn('absolute left-0 inset-y-1 w-0.5 rounded-full fill-gold bg-primary-500', nested && '-left-px')} aria-hidden />}
          {/* A nested row carries a dot instead of an icon: the group's icon already says what
              family this belongs to, and six near-identical 18 px glyphs in a column is noise. */}
          {nested
            ? <span className={cn('h-1 w-1 rounded-full shrink-0 transition-colors', isActive ? 'bg-primary-500' : 'bg-neutral-300 group-hover:bg-neutral-400')} aria-hidden />
            : <item.icon className={cn('h-[18px] w-[18px] shrink-0', isActive ? 'text-primary-500' : 'text-neutral-400 group-hover:text-neutral-700')} aria-hidden />}
          {!collapsed && <span className="truncate">{item.label}</span>}
          {collapsed && <span className="sr-only">{item.label}</span>}
        </>
      )}
    </NavLink>
  );
}

export function Sidebar({ entries, collapsed, onToggle, mobile, onClose }: {
  entries: NavEntry[]; collapsed: boolean; onToggle?: () => void; mobile?: boolean; onClose?: () => void;
}) {
  const can = useAuthStore((s) => s.hasPermission);
  const { pathname } = useLocation();
  const { data: branch } = useBranch();
  const [manual, setManual] = useState<Record<string, boolean>>({});

  /* Permission filtering happens here, once. A group whose children are all invisible to this
     role disappears entirely rather than opening onto nothing. */
  const visible: NavEntry[] = entries
    .map((e) => (isGroup(e) ? { ...e, items: e.items.filter((i) => !i.permission || can(i.permission)) } : e))
    .filter((e) => (isGroup(e) ? e.items.length > 0 : !e.permission || can(e.permission)));

  return (
    /*
     * The rail is the deepest surface in the app chrome — `surface-sunken`, one step below the page
     * background — with a single hairline separating it from the content. That inversion (chrome
     * darker than content) is what lets the navigation recede while a screen is being worked on.
     * It paints its own palette when the route asks for a light shell; see config/surfaces.ts.
     */
    <nav
      aria-label="Main navigation"
      className={cn('flex flex-col h-full bg-surface-sunken border-r border-neutral-200 text-neutral-600', collapsed ? 'w-[72px]' : 'w-[260px]')}
    >
      <div className={cn('h-[60px] flex items-center border-b border-neutral-200 shrink-0', collapsed ? 'px-3 justify-center' : 'px-4 justify-between')}>
        <BrandMark collapsed={collapsed} dark />
        {mobile && (
          <button type="button" onClick={onClose} aria-label="Close menu" className="h-9 w-9 -mr-1 rounded-sm flex items-center justify-center text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-colors duration-fast">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className={cn('flex-1 overflow-y-auto overscroll-contain py-3 space-y-0.5', collapsed ? 'px-2' : 'px-3')}>
        {visible.map((entry) => {
          if (!isGroup(entry)) return <RailLink key={entry.to} item={entry} collapsed={collapsed} onNavigate={onClose} />;

          const holdsActive = entry.items.some((i) => itemActive(pathname, i));
          const open = manual[entry.label] ?? holdsActive;
          const first = entry.items[0];

          /* Collapsed to icons, a group cannot expand — the flyout that would need would be a
             second navigation surface to keep correct. It navigates to its first screen instead,
             which is the one the group is ordered to put first. */
          if (collapsed) {
            return <RailLink key={entry.label} item={{ ...first, label: entry.label, icon: entry.icon, end: false }} collapsed onNavigate={onClose} />;
          }

          return (
            <div key={entry.label}>
              <button
                type="button"
                onClick={() => setManual((m) => ({ ...m, [entry.label]: !open }))}
                aria-expanded={open}
                className={cn(
                  'group w-full flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-colors duration-control',
                  holdsActive ? 'text-primary-700' : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
                )}
              >
                <entry.icon className={cn('h-[18px] w-[18px] shrink-0', holdsActive ? 'text-primary-500' : 'text-neutral-400 group-hover:text-neutral-700')} aria-hidden />
                <span className="truncate flex-1 text-left">{entry.label}</span>
                <ChevronDown className={cn('h-4 w-4 shrink-0 text-neutral-400 transition-transform duration-control', open && 'rotate-180')} aria-hidden />
              </button>
              {open && (
                /* The hairline is the group's spine: it is what makes five indented labels read
                   as belonging to the row above them rather than as five more top-level rows. */
                <ul className="mt-0.5 mb-1 ml-[19px] pl-2.5 border-l border-neutral-200 space-y-px">
                  {entry.items.map((it) => (
                    <li key={it.to}><RailLink item={it} nested onNavigate={onClose} /></li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {/* The venue the operator is acting in, at the foot of the rail — the boards put it here,
          and it is the answer to "which branch am I about to change?" without looking up. */}
      {branch && !collapsed && (
        <div className="px-3 pb-2 pt-2 border-t border-neutral-200 shrink-0">
          <div className="flex items-center gap-2.5 rounded-md px-2 py-2 bg-neutral-100/60">
            <span className="h-7 w-7 rounded-full shrink-0 grid place-items-center bg-primary-500/15 ring-1 ring-inset ring-primary-500/30" aria-hidden>
              <Building2 className="h-3.5 w-3.5 text-primary-700" />
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block text-[12.5px] font-medium text-neutral-900 truncate">{branch.businessName}</span>
              <span className="block text-[11px] text-neutral-500 truncate">{branch.name}</span>
            </span>
          </div>
        </div>
      )}

      {env.isMock && !collapsed && (
        <p className="px-4 pb-2 text-[11px] leading-snug text-neutral-500 shrink-0">
          Demo backend — data is stored in this browser only.
        </p>
      )}

      {/* Collapse control sits at the foot of the rail so it never crowds the brand. */}
      {!mobile && onToggle && (
        <div className={cn('border-t border-neutral-200 shrink-0 p-2', collapsed ? 'flex justify-center' : '')}>
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn(
              'flex items-center gap-2.5 rounded-md min-h-[36px] text-[13px] text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-colors duration-fast',
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
        className="flex items-center gap-2 rounded-sm px-1.5 py-1 hover:bg-neutral-100 min-h-touch transition-colors duration-fast"
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
        /*
         * `.popover` is `surface-high`, which IS `neutral-100` — so every hover inside a popover
         * has to step up to `neutral-200`. A `hover:bg-neutral-100` here would be invisible.
         */
        <div role="menu" className="absolute right-0 mt-1.5 w-60 popover p-1.5 z-nav animate-scale-in">
          <div className="px-2.5 py-2 border-b border-neutral-200 mb-1">
            <p className="text-sm font-medium truncate text-neutral-900">{user.fullName}</p>
            <p className="text-caption text-neutral-500 truncate">{user.email || user.username}</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {user.roles.map((r) => (
                <span key={r} className="text-[10px] rounded-full bg-neutral-200 px-2 py-0.5 text-neutral-700 font-medium">{ROLE_LABELS[r]}</span>
              ))}
            </div>
          </div>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); navigate('/profile'); }} className="w-full flex items-center gap-2.5 px-2.5 min-h-touch text-sm text-neutral-800 rounded-sm hover:bg-neutral-200 hover:text-neutral-900 transition-colors duration-fast">
            <UserCircle className="h-4 w-4 text-neutral-500" aria-hidden />My profile
          </button>
          <button type="button" role="menuitem" onClick={() => void logout()} className="w-full flex items-center gap-2.5 px-2.5 min-h-touch text-sm rounded-sm hover:bg-danger-50 text-danger-700 transition-colors duration-fast">
            <LogOut className="h-4 w-4" aria-hidden />Sign out
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Branch switcher
/** Shows the current branch; becomes a dropdown when the user can reach more than one. */
export function BranchSwitcher({ compact }: { compact?: boolean } = {}) {
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

  /*
   * COMPACT is the reference's header chip: a bordered pill carrying the BRANCH. The venue's
   * business name moved to the foot of the rail, where the boards put it and where it has room to
   * print in full — which is how defect E1 ("The Saffron L… · Main Br…") stays fixed rather than
   * being reintroduced by a smaller control. Both facts are on screen; neither is truncated.
   */
  const label = compact ? (
    <>
      <Building2 className="h-4 w-4 text-neutral-400 shrink-0" aria-hidden />
      <span className="truncate font-medium text-neutral-900">{branch?.name ?? '…'}</span>
    </>
  ) : (
    <>
      <Building2 className="h-4 w-4 text-neutral-400 shrink-0" aria-hidden />
      <span className="truncate font-medium text-neutral-900">{branch?.businessName ?? '…'}</span>
      {branch?.name && <><span className="hidden md:inline text-neutral-400" aria-hidden>·</span><span className="hidden md:inline truncate text-neutral-500">{branch.name}</span></>}
    </>
  );

  const pill = compact
    ? 'flex items-center gap-2 min-w-0 max-w-[14rem] text-[13px] rounded-md border border-neutral-200 bg-surface px-2.5 h-9 hover:border-neutral-300 hover:bg-neutral-100 transition-colors duration-fast touch-target'
    : 'flex items-center gap-2 min-w-0 max-w-[13rem] md:max-w-[22rem] xl:max-w-[32rem] text-sm rounded-sm px-2 py-1 hover:bg-neutral-100 min-h-touch transition-colors duration-fast';

  if (!multi) {
    return compact
      ? <div className="flex items-center gap-2 min-w-0 max-w-[14rem] text-[13px] rounded-md border border-neutral-200 bg-surface px-2.5 h-9">{label}</div>
      : <div className="flex items-center gap-2 min-w-0 text-sm">{label}</div>;
  }

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={branch ? `Branch: ${branch.name}. Switch branch.` : 'Switch branch'}
        className={pill}
      >
        {label}
        <ChevronDown className={cn('h-4 w-4 text-neutral-400 shrink-0 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div role="listbox" aria-label="Switch branch" className={cn('absolute mt-1.5 w-72 popover p-1.5 z-nav animate-scale-in', compact ? 'right-0' : 'left-0')}>
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
                className={cn('w-full flex items-center gap-2 px-2.5 py-2 text-sm rounded-sm text-left hover:bg-neutral-200 transition-colors duration-fast', current && 'bg-primary-50 ring-1 ring-inset ring-primary-200')}
              >
                <span className="flex-1 min-w-0">
                  <span className="block font-medium truncate text-neutral-900">{b.name}</span>
                  <span className="text-caption text-neutral-500">
                    {b.code}{b.city ? ` · ${b.city}` : ''} · {b.tableCount} tables{!b.isActive ? ' · inactive' : ''}
                  </span>
                </span>
                {current && <Check className="h-4 w-4 text-primary-500 shrink-0" aria-hidden />}
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
        className="relative h-10 w-10 flex items-center justify-center rounded-sm hover:bg-neutral-100 hover:text-neutral-900 text-neutral-600 transition-colors duration-fast"
      >
        <Bell className="h-5 w-5" aria-hidden />
        {/* The count sits on a bright danger fill, so its label is the dark `on-primary`, and the
            ring that punches it out of the bell is the header's own surface, not white. */}
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-danger-500 text-on-primary text-[10px] font-bold flex items-center justify-center tabular-nums ring-2 ring-surface-raised">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label="Notifications" className="absolute right-0 mt-1.5 w-[min(92vw,380px)] popover z-nav animate-scale-in overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-neutral-200">
            <p className="text-sm font-semibold text-neutral-900">
              Notifications{unread ? <span className="ml-1 text-caption font-normal text-neutral-500">· {unread} unread</span> : null}
            </p>
            {unread > 0 && (
              <button type="button" onClick={async () => { try { await notificationsApi.markAllRead(); } finally { inv(); } }} className="inline-flex items-center gap-1 text-caption text-primary-700 hover:underline underline-offset-2">
                <CheckCheck className="h-3.5 w-3.5" aria-hidden />Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-[60vh] overflow-y-auto overscroll-contain divide-y divide-neutral-200">
            {(q.data?.items ?? []).length === 0 && (
              <li className="px-4 py-8 text-sm text-neutral-500 text-center">You're all caught up.</li>
            )}
            {(q.data?.items ?? []).map((n) => {
              const Icon = SEVERITY_ICON[n.severity];
              return (
                <li key={n.id}>
                  {/* Unread carries a gold wash; hover steps *up* from the popover surface. */}
                  <button type="button" onClick={() => void openItem(n)} className={cn('w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-neutral-200 transition-colors duration-fast', !n.isRead && 'bg-primary-50/50')}>
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
          <div className="border-t border-neutral-200 px-4 py-2.5">
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
/**
 * Theme control. Cycles light → dark → follow the system, and says which it is — an icon alone
 * cannot distinguish "dark because I chose it" from "dark because the system is dark".
 */
export function ThemeToggle({ onDark }: { onDark?: boolean }) {
  const theme = useUiStore((s) => s.theme);
  const resolved = useUiStore((s) => s.resolvedTheme);
  const cycle = useUiStore((s) => s.cycleTheme);
  const Icon = theme === 'system' ? MonitorCog : theme === 'light' ? Sun : Moon;
  const label = theme === 'system' ? `Theme: follow system (${resolved})` : `Theme: ${theme}`;
  return (
    <button
      type="button"
      onClick={cycle}
      title={`${label} — click to change`}
      aria-label={`${label}. Change theme.`}
      className={cn(
        'h-10 w-10 shrink-0 inline-flex items-center justify-center rounded-sm transition-colors duration-fast touch-target',
        onDark ? 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200' : 'text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100',
      )}
    >
      <Icon className="h-5 w-5" aria-hidden />
    </button>
  );
}

/* -------------------------------------------------------------- Header search slot
 *
 * The reference boards put a search field in the header on almost every screen — and the
 * placeholder is different on each one ("Search suppliers, contact, etc.", "Search purchase
 * orders…", "Search guests by name, phone or email…"). That is not a global search. It is the
 * PAGE's own search, hoisted into the header, and that is what this is.
 *
 * A global search box would have to search something, and nothing in this product searches across
 * modules; a box that looked global and only filtered the current table would be a lie about what
 * the application can do. So the header owns a slot, each screen portals its real, working search
 * into it, and a screen with nothing to search leaves the slot empty rather than showing a field
 * that does nothing.
 *
 * A portal rather than registered state: the page keeps ownership of its own input, its value and
 * its debounce, and React keeps one tree. Nothing has to be kept in sync.
 */
const HeaderSlotContext = createContext<HTMLElement | null>(null);
export const HeaderSlotProvider = HeaderSlotContext.Provider;

/** Renders its children into the application header, if there is one on this layout. */
export function HeaderSearch({ children }: { children: ReactNode }) {
  const slot = useContext(HeaderSlotContext);
  if (!slot) return null;
  return createPortal(children, slot);
}

export function AppHeader({ onMenu, title, left, right, searchRef }: {
  onMenu?: () => void; title?: ReactNode; left?: ReactNode; right?: ReactNode;
  searchRef?: (el: HTMLDivElement | null) => void;
}) {
  return (
    /*
     * The header is the one raised surface in the chrome: `surface-raised` over the darker page,
     * separated by a single hairline — no shadow, because a drop shadow on a dark ground reads as
     * smudge rather than elevation. It is sticky, so it takes the same translucency + blur as
     * `.bar-top` and content passing underneath stays legible.
     *
     * 60 px rather than 64: it aligns with the rail's brand row, and the references' chrome is
     * tighter than the product's was — the difference is four pixels per screen and it reads.
     */
    <header className="h-[60px] bg-surface-raised/95 backdrop-blur supports-[backdrop-filter]:bg-surface-raised/80 border-b border-neutral-200 flex items-center gap-2 sm:gap-3 px-3 sm:px-4 sticky top-0 z-nav">
      {onMenu && (
        <button type="button" onClick={onMenu} aria-label="Open menu" className="lg:hidden h-10 w-10 -ml-1 flex items-center justify-center rounded-md text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100 transition-colors duration-fast shrink-0">
          <Menu className="h-5 w-5" />
        </button>
      )}
      {left}

      {/* The page's search lands here. Empty on screens that have nothing to search, and the
          layout closes up around it because the slot itself carries no width of its own. */}
      <div ref={searchRef} className="min-w-0 flex-1 flex items-center" />

      {title && <div className="hidden xl:block text-sm text-neutral-500 truncate border-l border-neutral-200 pl-3">{title}</div>}
      {/*
       * `min-w-0`, and the ONE thing allowed to give way is `right`.
       *
       * This group was `shrink-0`, which made its max-content width a floor for the whole header.
       * In the POS shells `right` is an inline navigation of up to five links, and at 1024 px that
       * floor was 1065 px — the page scrolled sideways on the cashier screens. The identity and
       * status controls stay at their natural size because they are individually `shrink-0`; the
       * navigation is the part that compresses, because it is the part that has somewhere else to
       * live (the bottom bar below `lg`).
       */}
      <div className="min-w-0 flex items-center gap-1 sm:gap-1.5">
        {right && <div className="min-w-0 overflow-hidden">{right}</div>}
        <span className="hidden md:inline-flex shrink-0"><BranchSwitcher compact /></span>
        <span className="hidden sm:inline-flex shrink-0"><ConnectionStatus /></span>
        <span className="shrink-0 flex items-center gap-1 sm:gap-1.5">
          <ThemeToggle />
          <NotificationBell />
          <UserMenu />
        </span>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------- BottomNav
export function BottomNav({ items }: { items: NavItem[] }) {
  const can = useAuthStore((s) => s.hasPermission);
  const visible = items.filter((i) => !i.permission || can(i.permission));
  return (
    <nav aria-label="Primary" data-bottom-nav
      className="fixed bottom-0 inset-x-0 z-nav bg-surface-raised/95 backdrop-blur supports-[backdrop-filter]:bg-surface-raised/85 border-t border-neutral-200 safe-bottom lg:hidden shadow-bar-bottom">
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${visible.length}, minmax(0, 1fr))` }}>
        {visible.map((it) => (
          <li key={it.to}>
            <NavLink
              to={it.to}
              end={it.end}
              className={({ isActive }) => cn(
                'flex flex-col items-center justify-center gap-1 min-h-[60px] text-[11px] font-medium transition-colors duration-control relative',
                isActive ? 'text-primary-700' : 'text-neutral-500 hover:text-neutral-800',
              )}
            >
              {({ isActive }) => (
                <>
                  {/* Same language as the sidebar: a gold rail marks position, gold text confirms
                      it. The rail is on top here because the nav is at the bottom of the screen. */}
                  {isActive && <span className="absolute top-0 inset-x-4 h-0.5 rounded-full fill-gold bg-primary-500" aria-hidden />}
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

/** Drawer sidebar for mobile. `surfaceClass` paints it in the shell palette the route declared. */
export function MobileSidebar({ entries, surfaceClass }: { entries: NavEntry[]; surfaceClass?: string }) {
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
      <div className="absolute inset-0 bg-neutral-950/70 animate-fade-in" onClick={() => setOpen(false)} aria-hidden />
      <div className={cn('absolute inset-y-0 left-0 shadow-modal animate-slide-in-right', surfaceClass)}>
        <Sidebar entries={entries} collapsed={false} mobile onClose={() => setOpen(false)} />
      </div>
    </div>
  );
}
