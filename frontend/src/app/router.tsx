import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ProtectedRoute, RequirePermission, RoleHomeRedirect } from '@/routes/guards';
import { LoadingState } from '@/components/ui';
import type { Permission } from '@/config/permissions';

const AdminLayout = lazy(() => import('@/layouts/AdminLayout'));
const PosLayout = lazy(() => import('@/layouts/PosLayout'));
const DisplayLayout = lazy(() => import('@/layouts/DisplayLayout'));

// auth
const LoginPage = lazy(() => import('@/features/auth/LoginPage'));
const ForgotPasswordPage = lazy(() => import('@/features/auth/ForgotPasswordPage'));
const ProfilePage = lazy(() => import('@/features/auth/ProfilePage'));
// public
const PublicMenuPage = lazy(() => import('@/features/public-menu/PublicMenuPage'));
// admin
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage'));
const OrdersListPage = lazy(() => import('@/features/orders/OrdersListPage'));
const OrderDetailPage = lazy(() => import('@/features/orders/OrderDetailPage'));
const TablesPage = lazy(() => import('@/features/tables/TablesPage'));
const FloorsPage = lazy(() => import('@/features/tables/FloorsPage'));
const QrPage = lazy(() => import('@/features/tables/QrPage'));
const CategoriesPage = lazy(() => import('@/features/menu/CategoriesPage'));
const MenuItemsPage = lazy(() => import('@/features/menu/MenuItemsPage'));
const OffersPage = lazy(() => import('@/features/offers/OffersPage'));
const ReportsPage = lazy(() => import('@/features/reports/ReportsPage'));
const UsersPage = lazy(() => import('@/features/users/UsersPage'));
const RolesPage = lazy(() => import('@/features/users/RolesPage'));
const AuditPage = lazy(() => import('@/features/users/AuditPage'));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'));
const MorePage = lazy(() => import('@/features/shared/MorePage'));
// manager
const ManagerDashboardPage = lazy(() => import('@/features/manager/ManagerDashboardPage'));
const LiveOrdersPage = lazy(() => import('@/features/manager/LiveOrdersPage'));
// waiter
const WaiterHomePage = lazy(() => import('@/features/waiter/WaiterHomePage'));
const WaiterTablesPage = lazy(() => import('@/features/waiter/WaiterTablesPage'));
const TableOrderPage = lazy(() => import('@/features/waiter/TableOrderPage'));
const WaiterOrdersPage = lazy(() => import('@/features/waiter/WaiterOrdersPage'));
const ReadyItemsPage = lazy(() => import('@/features/waiter/ReadyItemsPage'));
// kitchen / bar
const KitchenDisplayPage = lazy(() => import('@/features/kitchen/KitchenDisplayPage'));
const BarDisplayPage = lazy(() => import('@/features/bar/BarDisplayPage'));
// cashier
const CashierHomePage = lazy(() => import('@/features/cashier/CashierHomePage'));
const BillsListPage = lazy(() => import('@/features/cashier/BillsListPage'));
const CashierTablesPage = lazy(() => import('@/features/cashier/CashierTablesPage'));
const BillingScreenPage = lazy(() => import('@/features/billing/BillingScreenPage'));
const PaymentPage = lazy(() => import('@/features/billing/PaymentPage'));
const ReceiptPage = lazy(() => import('@/features/billing/ReceiptPage'));
const NotFoundPage = lazy(() => import('@/features/shared/NotFoundPage'));
// phase 2
const InventoryDashboardPage = lazy(() => import('@/features/inventory/InventoryDashboardPage'));
const InventoryItemsPage = lazy(() => import('@/features/inventory/InventoryItemsPage'));
const InventoryItemDetailPage = lazy(() => import('@/features/inventory/InventoryItemDetailPage'));
const StockMovementsPage = lazy(() => import('@/features/inventory/StockMovementsPage'));
const RecipesPage = lazy(() => import('@/features/recipes/RecipesPage'));
const RecipeEditorPage = lazy(() => import('@/features/recipes/RecipeEditorPage'));
const SuppliersPage = lazy(() => import('@/features/purchasing/SuppliersPage'));
const SupplierDetailPage = lazy(() => import('@/features/purchasing/SupplierDetailPage'));
const PurchaseOrdersPage = lazy(() => import('@/features/purchasing/PurchaseOrdersPage'));
const PurchaseOrderPage = lazy(() => import('@/features/purchasing/PurchaseOrderPage'));
const CustomersPage = lazy(() => import('@/features/crm/CustomersPage'));
const CustomerDetailPage = lazy(() => import('@/features/crm/CustomerDetailPage'));
const LoyaltyPage = lazy(() => import('@/features/crm/LoyaltyPage'));
const ReservationsPage = lazy(() => import('@/features/reservations/ReservationsPage'));
const ClubDashboardPage = lazy(() => import('@/features/club/ClubDashboardPage'));
const VipTablesPage = lazy(() => import('@/features/club/VipTablesPage'));
const BottleServicePage = lazy(() => import('@/features/club/BottleServicePage'));
const RoomChargesPage = lazy(() => import('@/features/billing/RoomChargesPage'));
const NotificationsPage = lazy(() => import('@/features/notifications/NotificationsPage'));
const BranchesPage = lazy(() => import('@/features/branches/BranchesPage'));
const AdvancedReportsPage = lazy(() => import('@/features/reports/AdvancedReportsPage'));
const HostHomePage = lazy(() => import('@/features/host/HostHomePage'));

const S = ({ children }: { children: ReactNode }) => <Suspense fallback={<div className="p-6"><LoadingState variant="page" /></div>}>{children}</Suspense>;
const P = (permission: Permission | Permission[], el: ReactNode) => <RequirePermission permission={permission}>{el}</RequirePermission>;

export const router = createBrowserRouter([
  { path: '/', element: <RoleHomeRedirect /> },
  { path: '/login', element: <S><LoginPage /></S> },
  { path: '/forgot-password', element: <S><ForgotPasswordPage /></S> },
  { path: '/menu/:branchCode/:tableCode/*', element: <S><PublicMenuPage /></S> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <S><AdminLayout /></S>,
        children: [
          { path: '/profile', element: <S><ProfilePage /></S> },
          { path: '/admin', element: P('dashboard:view', <S><DashboardPage /></S>) },
          { path: '/admin/orders', element: P('orders:view:all', <S><OrdersListPage /></S>) },
          { path: '/admin/orders/:id', element: P('orders:view', <S><OrderDetailPage /></S>) },
          { path: '/admin/tables', element: P('tables:view', <S><TablesPage /></S>) },
          { path: '/admin/floors', element: P('tables:manage', <S><FloorsPage /></S>) },
          { path: '/admin/qr', element: P('qr:view', <S><QrPage /></S>) },
          { path: '/admin/menu', element: <Navigate to="/admin/menu/items" replace /> },
          { path: '/admin/menu/categories', element: P('menu:view', <S><CategoriesPage /></S>) },
          { path: '/admin/menu/items', element: P('menu:view', <S><MenuItemsPage /></S>) },
          { path: '/admin/offers', element: P('offers:view', <S><OffersPage /></S>) },
          { path: '/admin/reports', element: P('reports:view', <S><ReportsPage /></S>) },
          { path: '/admin/users', element: P('users:view', <S><UsersPage /></S>) },
          { path: '/admin/roles', element: P('roles:view', <S><RolesPage /></S>) },
          { path: '/admin/audit', element: P('audit:view', <S><AuditPage /></S>) },
          { path: '/admin/settings', element: P('settings:view', <S><SettingsPage /></S>) },
          { path: '/admin/more', element: <S><MorePage /></S> },
          { path: '/manager', element: P('dashboard:view', <S><ManagerDashboardPage /></S>) },
          { path: '/manager/live', element: P('orders:view:all', <S><LiveOrdersPage /></S>) },
          // ---- Phase 2
          { path: '/admin/inventory', element: P('inventory:view', <S><InventoryDashboardPage /></S>) },
          { path: '/admin/inventory/items', element: P('inventory:view', <S><InventoryItemsPage /></S>) },
          { path: '/admin/inventory/items/:id', element: P('inventory:view', <S><InventoryItemDetailPage /></S>) },
          { path: '/admin/inventory/movements', element: P('inventory:view', <S><StockMovementsPage /></S>) },
          { path: '/admin/recipes', element: P('recipes:view', <S><RecipesPage /></S>) },
          { path: '/admin/recipes/:menuItemId', element: P('recipes:view', <S><RecipeEditorPage /></S>) },
          { path: '/admin/suppliers', element: P('suppliers:view', <S><SuppliersPage /></S>) },
          { path: '/admin/suppliers/:id', element: P('suppliers:view', <S><SupplierDetailPage /></S>) },
          { path: '/admin/purchases', element: P('purchases:view', <S><PurchaseOrdersPage /></S>) },
          { path: '/admin/purchases/new', element: P('purchases:manage', <S><PurchaseOrderPage /></S>) },
          { path: '/admin/purchases/:id', element: P('purchases:view', <S><PurchaseOrderPage /></S>) },
          { path: '/admin/customers', element: P('customers:view', <S><CustomersPage /></S>) },
          { path: '/admin/customers/:id', element: P('customers:view', <S><CustomerDetailPage /></S>) },
          { path: '/admin/loyalty', element: P('loyalty:view', <S><LoyaltyPage /></S>) },
          { path: '/admin/reservations', element: P('reservations:view', <S><ReservationsPage /></S>) },
          { path: '/admin/club', element: P('club:view', <S><ClubDashboardPage /></S>) },
          { path: '/admin/vip', element: P('vip:view', <S><VipTablesPage /></S>) },
          { path: '/admin/bottle-service', element: P('club:view', <S><BottleServicePage /></S>) },
          { path: '/admin/room-charges', element: P('room-charge:post', <S><RoomChargesPage /></S>) },
          { path: '/admin/notifications', element: P('notifications:view', <S><NotificationsPage /></S>) },
          { path: '/admin/branches', element: P('branches:view', <S><BranchesPage /></S>) },
          { path: '/admin/reports/advanced', element: P('reports:advanced', <S><AdvancedReportsPage /></S>) },
          { path: '/host', element: P(['reservations:manage', 'club:manage'], <S><HostHomePage /></S>) },
        ],
      },
      {
        element: <S><PosLayout variant="waiter" /></S>,
        children: [
          { path: '/waiter', element: P('orders:create', <S><WaiterHomePage /></S>) },
          { path: '/waiter/tables', element: P('tables:view', <S><WaiterTablesPage /></S>) },
          { path: '/waiter/tables/:tableId', element: P('orders:create', <S><TableOrderPage /></S>) },
          { path: '/waiter/orders', element: P('orders:view', <S><WaiterOrdersPage /></S>) },
          { path: '/waiter/orders/:id', element: P('orders:view', <S><OrderDetailPage /></S>) },
          { path: '/waiter/ready', element: P('orders:view', <S><ReadyItemsPage /></S>) },
          { path: '/waiter/more', element: <S><MorePage /></S> },
        ],
      },
      {
        element: <S><PosLayout variant="cashier" /></S>,
        children: [
          { path: '/cashier', element: P('billing:view', <S><CashierHomePage /></S>) },
          { path: '/cashier/bills', element: P('billing:view', <S><BillsListPage mode="unpaid" /></S>) },
          { path: '/cashier/paid', element: P('billing:view', <S><BillsListPage mode="paid" /></S>) },
          { path: '/cashier/tables', element: P('billing:view', <S><CashierTablesPage /></S>) },
          { path: '/cashier/orders/:orderId/bill', element: P('billing:create', <S><BillingScreenPage /></S>) },
          { path: '/cashier/bills/:id', element: P('billing:view', <S><BillingScreenPage /></S>) },
          { path: '/cashier/bills/:id/pay', element: P('billing:pay', <S><PaymentPage /></S>) },
          { path: '/cashier/bills/:id/receipt', element: P('billing:view', <S><ReceiptPage /></S>) },
          { path: '/cashier/more', element: <S><MorePage /></S> },
        ],
      },
      { element: <S><DisplayLayout variant="kitchen" /></S>, children: [{ path: '/kitchen', element: P('kitchen:view', <S><KitchenDisplayPage /></S>) }] },
      { element: <S><DisplayLayout variant="bar" /></S>, children: [{ path: '/bar', element: P('bar:view', <S><BarDisplayPage /></S>) }] },
    ],
  },
  { path: '*', element: <S><NotFoundPage /></S> },
]);
