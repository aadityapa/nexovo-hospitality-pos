import {
  LayoutDashboard, Activity, UtensilsCrossed, LayoutGrid, ClipboardList, ChefHat, Wine, Receipt, BarChart3, Users, Shield,
  Tag, QrCode, Settings, Layers, Home, Bell, CreditCard, MoreHorizontal, ScrollText, Package, ArrowLeftRight, BookOpen,
  Truck, ShoppingCart, Contact, Star, CalendarDays, PartyPopper, Crown, GlassWater, BedDouble, Building2, LineChart,
  BellRing, type LucideIcon,
} from 'lucide-react';
import type { Permission } from './permissions';

export interface NavItem { label: string; to: string; icon: LucideIcon; permission?: Permission | Permission[]; end?: boolean }
export interface NavSection { title?: string; items: NavItem[] }

/**
 * Management sidebar (AdminLayout — admin, manager and host).
 *
 * Grouped by what an operator is trying to do rather than by the module that implements it,
 * so a manager looking for "tonight's bookings" reaches for Guests, not Phase 2.
 * Sections and items are filtered by permission at render time; a section with no visible
 * items disappears entirely.
 */
export const ADMIN_NAV: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', to: '/admin', icon: LayoutDashboard, permission: 'dashboard:view', end: true },
      { label: 'Host desk', to: '/host', icon: PartyPopper, permission: ['reservations:manage', 'club:manage'], end: true },
      { label: 'Live operations', to: '/manager/live', icon: Activity, permission: 'orders:view:all' },
      { label: 'Notifications', to: '/admin/notifications', icon: BellRing, permission: 'notifications:view' },
    ],
  },
  {
    title: 'Service',
    items: [
      { label: 'Orders', to: '/admin/orders', icon: ClipboardList, permission: 'orders:view:all' },
      { label: 'Tables', to: '/admin/tables', icon: LayoutGrid, permission: 'tables:view' },
      { label: 'Kitchen display', to: '/kitchen', icon: ChefHat, permission: 'kitchen:view' },
      { label: 'Bar display', to: '/bar', icon: Wine, permission: 'bar:view' },
      { label: 'Billing', to: '/cashier', icon: Receipt, permission: 'billing:view' },
    ],
  },
  {
    title: 'Menu',
    items: [
      { label: 'Menu items', to: '/admin/menu/items', icon: UtensilsCrossed, permission: 'menu:view' },
      { label: 'Categories', to: '/admin/menu/categories', icon: Layers, permission: 'menu:view' },
      { label: 'Offers', to: '/admin/offers', icon: Tag, permission: 'offers:view' },
      { label: 'Recipes', to: '/admin/recipes', icon: BookOpen, permission: 'recipes:view' },
      { label: 'QR codes', to: '/admin/qr', icon: QrCode, permission: 'qr:view' },
    ],
  },
  {
    title: 'Stock & purchasing',
    items: [
      { label: 'Stock overview', to: '/admin/inventory', icon: Package, permission: 'inventory:view', end: true },
      { label: 'Inventory items', to: '/admin/inventory/items', icon: Package, permission: 'inventory:view' },
      { label: 'Stock movements', to: '/admin/inventory/movements', icon: ArrowLeftRight, permission: 'inventory:view' },
      { label: 'Suppliers', to: '/admin/suppliers', icon: Truck, permission: 'suppliers:view' },
      { label: 'Purchase orders', to: '/admin/purchases', icon: ShoppingCart, permission: 'purchases:view' },
    ],
  },
  {
    title: 'Guests & hospitality',
    items: [
      { label: 'Reservations', to: '/admin/reservations', icon: CalendarDays, permission: 'reservations:view' },
      { label: 'Customers', to: '/admin/customers', icon: Contact, permission: 'customers:view' },
      { label: 'Loyalty', to: '/admin/loyalty', icon: Star, permission: 'loyalty:view' },
      { label: 'Club & door', to: '/admin/club', icon: PartyPopper, permission: 'club:view' },
      { label: 'VIP tables', to: '/admin/vip', icon: Crown, permission: 'vip:view' },
      { label: 'Bottle service', to: '/admin/bottle-service', icon: GlassWater, permission: 'club:view' },
      { label: 'Room charges', to: '/admin/room-charges', icon: BedDouble, permission: 'room-charge:post' },
    ],
  },
  {
    title: 'Reports',
    items: [
      { label: 'Reports', to: '/admin/reports', icon: BarChart3, permission: 'reports:view', end: true },
      { label: 'Advanced reports', to: '/admin/reports/advanced', icon: LineChart, permission: 'reports:advanced' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { label: 'Floors & areas', to: '/admin/floors', icon: Layers, permission: 'tables:manage' },
      { label: 'Branches & outlets', to: '/admin/branches', icon: Building2, permission: 'branches:view' },
      { label: 'Users', to: '/admin/users', icon: Users, permission: 'users:view' },
      { label: 'Roles', to: '/admin/roles', icon: Shield, permission: 'roles:view' },
      { label: 'Audit log', to: '/admin/audit', icon: ScrollText, permission: 'audit:view' },
      { label: 'Settings', to: '/admin/settings', icon: Settings, permission: 'settings:view' },
    ],
  },
];

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
  { label: 'Dashboard', to: '/admin', icon: LayoutDashboard, end: true },
  { label: 'Orders', to: '/admin/orders', icon: ClipboardList },
  { label: 'Tables', to: '/admin/tables', icon: LayoutGrid },
  { label: 'Menu', to: '/admin/menu/items', icon: UtensilsCrossed },
  { label: 'More', to: '/admin/more', icon: MoreHorizontal },
];

/** Bottom nav for the HOST role (reservations / door / VIP) on phones and tablets. */
export const HOST_BOTTOM_NAV: NavItem[] = [
  { label: 'Host', to: '/host', icon: Home, end: true },
  { label: 'Bookings', to: '/admin/reservations', icon: CalendarDays },
  { label: 'Door', to: '/admin/club', icon: PartyPopper },
  { label: 'VIP', to: '/admin/vip', icon: Crown },
  { label: 'More', to: '/admin/more', icon: MoreHorizontal },
];
