import {
  LayoutDashboard, Activity, UtensilsCrossed, LayoutGrid, ClipboardList, ChefHat, Wine, Receipt, BarChart3, Users, Shield,
  Tag, QrCode, Settings, Layers, Home, Bell, CreditCard, MoreHorizontal, ScrollText, Package, ArrowLeftRight, BookOpen,
  Truck, ShoppingCart, Contact, Star, CalendarDays, PartyPopper, Crown, GlassWater, BedDouble, Building2, LineChart,
  BellRing, Boxes, ConciergeBell, Sparkles, type LucideIcon,
} from 'lucide-react';
import type { Permission } from './permissions';

export interface NavItem { label: string; to: string; icon: LucideIcon; permission?: Permission | Permission[]; end?: boolean }
/** A rail entry that opens to reveal its own screens. Its permission is the union of its children's. */
export interface NavGroup { label: string; icon: LucideIcon; items: NavItem[] }
export type NavEntry = NavItem | NavGroup;
export interface NavSection { title?: string; items: NavItem[] }

export const isGroup = (e: NavEntry): e is NavGroup => 'items' in e;

/**
 * THE MANAGEMENT RAIL (AdminLayout — admin, manager and host).
 *
 * Slim by construction: ten top-level rows, each opening onto the screens that belong to it. The
 * flat list this replaced put thirty-one items on the rail at once, which is a directory rather
 * than a navigation — the operator read it instead of using it.
 *
 * Grouped by what someone is trying to do rather than by the module that implements it, so a
 * manager looking for tonight's bookings reaches for Guests, not Phase 2. Entries and groups are
 * filtered by permission at render time; a group whose children are all invisible disappears.
 *
 * The first child of each group is the screen the group navigates to when the rail is collapsed
 * to icons, so the order inside a group is "the one you probably wanted" first.
 */
export const ADMIN_RAIL: NavEntry[] = [
  { label: 'Dashboard', to: '/admin', icon: LayoutDashboard, permission: 'dashboard:view', end: true },
  { label: 'Host desk', to: '/host', icon: ConciergeBell, permission: ['reservations:manage', 'club:manage'], end: true },
  { label: 'Live operations', to: '/manager/live', icon: Activity, permission: 'orders:view:all' },
  {
    label: 'Service',
    icon: ClipboardList,
    items: [
      { label: 'Orders', to: '/admin/orders', icon: ClipboardList, permission: 'orders:view:all' },
      { label: 'Tables', to: '/admin/tables', icon: LayoutGrid, permission: 'tables:view' },
      { label: 'Floors & areas', to: '/admin/floors', icon: Layers, permission: 'tables:manage' },
      { label: 'Kitchen display', to: '/kitchen', icon: ChefHat, permission: 'kitchen:view' },
      { label: 'Bar display', to: '/bar', icon: Wine, permission: 'bar:view' },
      { label: 'Billing', to: '/cashier', icon: Receipt, permission: 'billing:view' },
    ],
  },
  {
    label: 'Menu & recipes',
    icon: UtensilsCrossed,
    items: [
      { label: 'Menu items', to: '/admin/menu/items', icon: UtensilsCrossed, permission: 'menu:view' },
      { label: 'Categories', to: '/admin/menu/categories', icon: Layers, permission: 'menu:view' },
      { label: 'Offers', to: '/admin/offers', icon: Tag, permission: 'offers:view' },
      { label: 'Recipes', to: '/admin/recipes', icon: BookOpen, permission: 'recipes:view' },
      { label: 'QR codes', to: '/admin/qr', icon: QrCode, permission: 'qr:view' },
    ],
  },
  {
    label: 'Purchasing',
    icon: Boxes,
    items: [
      { label: 'Stock overview', to: '/admin/inventory', icon: Package, permission: 'inventory:view', end: true },
      { label: 'Inventory items', to: '/admin/inventory/items', icon: Boxes, permission: 'inventory:view' },
      { label: 'Stock movements', to: '/admin/inventory/movements', icon: ArrowLeftRight, permission: 'inventory:view' },
      { label: 'Suppliers', to: '/admin/suppliers', icon: Truck, permission: 'suppliers:view' },
      { label: 'Purchase orders', to: '/admin/purchases', icon: ShoppingCart, permission: 'purchases:view' },
    ],
  },
  {
    label: 'Guests',
    icon: Contact,
    items: [
      { label: 'Customers', to: '/admin/customers', icon: Contact, permission: 'customers:view' },
      { label: 'Reservations', to: '/admin/reservations', icon: CalendarDays, permission: 'reservations:view' },
      { label: 'Loyalty program', to: '/admin/loyalty', icon: Star, permission: 'loyalty:view' },
    ],
  },
  {
    label: 'Club & VIP',
    icon: Sparkles,
    items: [
      { label: 'Club & door', to: '/admin/club', icon: PartyPopper, permission: 'club:view' },
      { label: 'VIP tables', to: '/admin/vip', icon: Crown, permission: 'vip:view' },
      { label: 'Bottle service', to: '/admin/bottle-service', icon: GlassWater, permission: 'club:view' },
      { label: 'Room charges', to: '/admin/room-charges', icon: BedDouble, permission: 'room-charge:post' },
    ],
  },
  {
    label: 'Reports',
    icon: BarChart3,
    items: [
      { label: 'Reports', to: '/admin/reports', icon: BarChart3, permission: 'reports:view', end: true },
      { label: 'Advanced reports', to: '/admin/reports/advanced', icon: LineChart, permission: 'reports:advanced' },
    ],
  },
  {
    label: 'Administration',
    icon: Settings,
    items: [
      { label: 'Branches & outlets', to: '/admin/branches', icon: Building2, permission: 'branches:view' },
      { label: 'Users & access', to: '/admin/users', icon: Users, permission: 'users:view' },
      { label: 'Roles & permissions', to: '/admin/roles', icon: Shield, permission: 'roles:view' },
      { label: 'Audit log', to: '/admin/audit', icon: ScrollText, permission: 'audit:view' },
      { label: 'Notifications', to: '/admin/notifications', icon: BellRing, permission: 'notifications:view' },
      { label: 'Settings', to: '/admin/settings', icon: Settings, permission: 'settings:view' },
    ],
  },
];

/**
 * The same navigation, flattened into titled sections — the shape the phone "More" screen wants,
 * which is a directory of every module rather than a rail. Derived, never hand-maintained: a
 * screen added to the rail appears here automatically, which is what stops the two drifting.
 */
export const ADMIN_NAV: NavSection[] = (() => {
  const singles = ADMIN_RAIL.filter((e): e is NavItem => !isGroup(e));
  const groups = ADMIN_RAIL.filter(isGroup);
  return [
    { title: 'Overview', items: singles },
    ...groups.map((g) => ({ title: g.label, items: g.items })),
  ];
})();

export const WAITER_NAV: NavItem[] = [
  { label: 'Home', to: '/waiter', icon: Home, end: true },
  { label: 'Tables', to: '/waiter/tables', icon: LayoutGrid },
  { label: 'Orders', to: '/waiter/orders', icon: ClipboardList },
  { label: 'Ready', to: '/waiter/ready', icon: Bell },
  { label: 'More', to: '/waiter/more', icon: MoreHorizontal },
];

export const CASHIER_NAV: NavItem[] = [
  { label: 'Home', to: '/cashier', icon: Home, end: true },
  { label: 'Bills', to: '/cashier/bills', icon: Receipt },
  { label: 'Paid', to: '/cashier/paid', icon: CreditCard },
  { label: 'Tables', to: '/cashier/tables', icon: LayoutGrid },
  { label: 'More', to: '/cashier/more', icon: MoreHorizontal },
];

export const MANAGER_BOTTOM_NAV: NavItem[] = [
  { label: 'Dashboard', to: '/manager', icon: LayoutDashboard, end: true },
  { label: 'Live', to: '/manager/live', icon: Activity },
  { label: 'Tables', to: '/admin/tables', icon: LayoutGrid },
  { label: 'Billing', to: '/cashier', icon: Receipt },
  { label: 'More', to: '/admin/more', icon: MoreHorizontal },
];

export const ADMIN_BOTTOM_NAV: NavItem[] = [
  { label: 'Home', to: '/admin', icon: Home, end: true },
  { label: 'Orders', to: '/admin/orders', icon: ClipboardList },
  { label: 'Menu', to: '/admin/menu/items', icon: UtensilsCrossed },
  { label: 'More', to: '/admin/more', icon: MoreHorizontal },
];

/** Bottom nav for the HOST role (reservations / door / VIP) on phones and tablets. */
export const HOST_BOTTOM_NAV: NavItem[] = [
  { label: 'Host', to: '/host', icon: ConciergeBell, end: true },
  { label: 'Bookings', to: '/admin/reservations', icon: CalendarDays },
  { label: 'Door', to: '/admin/club', icon: PartyPopper },
  { label: 'VIP', to: '/admin/vip', icon: Crown },
  { label: 'More', to: '/admin/more', icon: MoreHorizontal },
];
