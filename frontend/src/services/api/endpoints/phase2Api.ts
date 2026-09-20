import { api } from '..';
import type {
  ID, DateRange, User, Order, Bill,
  BranchSummary, BranchCreateInput, Outlet, OutletInput,
  InventoryUnit, InventoryCategory, InventoryCategoryInput, InventoryItem, InventoryItemInput, StockMovement, ManualMovementInput, InventoryDashboard, MovementType, StockStatus,
  Recipe, RecipeInput, RecipeCostRow,
  Supplier, SupplierInput, SupplierHistory, SupplierStatus, PurchaseOrder, PurchaseOrderInput, PoAction, PoStatus, ReceiveGoodsInput,
  Customer, CustomerInput, CustomerHistory, LoyaltyProgram, LoyaltyProgramInput, LoyaltyAccount,
  Reservation, ReservationInput, ReservationAction, ReservationStatus, ReservationAvailability,
  CoverChargeType, CoverChargeTypeInput, ClubEntry, CheckInInput, ClubDashboard, EntryStatus,
  VipTable, VipReservation, VipReservationInput, VipAction, VipStatus,
  BottleServiceItem, BottleServiceInput, RoomVerification, RoomCharge,
  NotificationList, AlertThreshold,
  SalesPeriodReport, BranchComparisonRow, CategoryPerformanceRow, InventoryValuation, WastageReport, ConsumptionRow, ProfitabilityReport, StaffPerformanceRow,
} from '@/types';

export const branchesApi = {
  list: () => api().get<BranchSummary[]>('/branches'),
  create: (body: BranchCreateInput) => api().post<BranchSummary[]>('/branches', body),
  update: (id: ID, body: BranchCreateInput) => api().put<BranchSummary[]>(`/branches/${id}`, body),
  outlets: () => api().get<Outlet[]>('/outlets'),
  createOutlet: (body: OutletInput) => api().post<Outlet[]>('/outlets', body),
  updateOutlet: (id: ID, body: OutletInput) => api().put<Outlet[]>(`/outlets/${id}`, body),
  setUserBranches: (userId: ID, branchIds: ID[]) => api().put<User>(`/users/${userId}/branches`, { branchIds }),
};

export const inventoryApi = {
  units: () => api().get<InventoryUnit[]>('/inventory/units'),
  categories: () => api().get<InventoryCategory[]>('/inventory/categories'),
  createCategory: (body: InventoryCategoryInput) => api().post<InventoryCategory[]>('/inventory/categories', body),
  updateCategory: (id: ID, body: InventoryCategoryInput) => api().put<InventoryCategory[]>(`/inventory/categories/${id}`, body),
  items: (params?: { search?: string; categoryId?: ID; status?: StockStatus }) => api().get<InventoryItem[]>('/inventory/items', params),
  item: (id: ID) => api().get<InventoryItem>(`/inventory/items/${id}`),
  createItem: (body: InventoryItemInput) => api().post<InventoryItem>('/inventory/items', body),
  updateItem: (id: ID, body: InventoryItemInput) => api().put<InventoryItem>(`/inventory/items/${id}`, body),
  deleteItem: (id: ID) => api().delete<null>(`/inventory/items/${id}`),
  itemMovements: (id: ID, params?: { type?: MovementType; from?: string; to?: string; limit?: number }) => api().get<StockMovement[]>(`/inventory/items/${id}/movements`, params),
  movements: (params?: { invItemId?: ID; type?: MovementType; from?: string; to?: string; limit?: number }) => api().get<StockMovement[]>('/inventory/movements', params),
  recordMovement: (body: ManualMovementInput) => api().post<InventoryItem>('/inventory/movements', body),
  dashboard: () => api().get<InventoryDashboard>('/inventory/dashboard'),
  lowStock: () => api().get<InventoryItem[]>('/inventory/low-stock'),
  deductForOrder: (orderId: ID) => api().post<Order>(`/orders/${orderId}/deduct-stock`),
};

export const recipesApi = {
  list: () => api().get<RecipeCostRow[]>('/recipes'),
  get: (menuItemId: ID) => api().get<Recipe>(`/recipes/${menuItemId}`),
  save: (menuItemId: ID, body: RecipeInput) => api().put<Recipe>(`/recipes/${menuItemId}`, body),
  remove: (menuItemId: ID) => api().delete<null>(`/recipes/${menuItemId}`),
};

export const suppliersApi = {
  list: (params?: { search?: string; status?: SupplierStatus }) => api().get<Supplier[]>('/suppliers', params),
  history: (id: ID) => api().get<SupplierHistory>(`/suppliers/${id}`),
  create: (body: SupplierInput) => api().post<Supplier>('/suppliers', body),
  update: (id: ID, body: SupplierInput) => api().put<Supplier>(`/suppliers/${id}`, body),
  remove: (id: ID) => api().delete<null>(`/suppliers/${id}`),
  addPayment: (id: ID, body: { amount: number; method: string; reference?: string; poId?: ID; notes?: string }) => api().post<SupplierHistory>(`/suppliers/${id}/payments`, body),
};

export const purchasesApi = {
  list: (params?: { status?: PoStatus; supplierId?: ID; search?: string }) => api().get<PurchaseOrder[]>('/purchases', params),
  get: (id: ID) => api().get<PurchaseOrder>(`/purchases/${id}`),
  create: (body: PurchaseOrderInput) => api().post<PurchaseOrder>('/purchases', body),
  update: (id: ID, body: PurchaseOrderInput) => api().put<PurchaseOrder>(`/purchases/${id}`, body),
  transition: (id: ID, action: PoAction, reason?: string) => api().post<PurchaseOrder>(`/purchases/${id}/transition`, { action, reason }),
  receive: (id: ID, body: ReceiveGoodsInput) => api().post<PurchaseOrder>(`/purchases/${id}/receive`, body),
};

export const customersApi = {
  list: (params?: { search?: string; limit?: number }) => api().get<Customer[]>('/customers', params),
  get: (id: ID) => api().get<Customer>(`/customers/${id}`),
  history: (id: ID) => api().get<CustomerHistory>(`/customers/${id}/history`),
  create: (body: CustomerInput) => api().post<Customer>('/customers', body),
  update: (id: ID, body: CustomerInput) => api().put<Customer>(`/customers/${id}`, body),
  remove: (id: ID) => api().delete<null>(`/customers/${id}`),
  attachToOrder: (orderId: ID, customerId: ID | null) => api().put<Order>(`/orders/${orderId}/customer`, { customerId }),
};

export const loyaltyApi = {
  program: () => api().get<LoyaltyProgram>('/loyalty/program'),
  saveProgram: (body: LoyaltyProgramInput) => api().put<LoyaltyProgram>('/loyalty/program', body),
  account: (customerId: ID) => api().get<LoyaltyAccount>(`/loyalty/accounts/${customerId}`),
  adjust: (customerId: ID, points: number, notes: string) => api().post<LoyaltyAccount>(`/loyalty/accounts/${customerId}/adjust`, { points, notes }),
  redeem: (billId: ID, points: number) => api().post<Bill>(`/bills/${billId}/redeem-points`, { points }),
};

export const reservationsApi = {
  list: (params?: { from?: string; to?: string; status?: ReservationStatus; search?: string }) => api().get<Reservation[]>('/reservations', params),
  availability: (date: string) => api().get<ReservationAvailability>('/reservations/availability', { date }),
  get: (id: ID) => api().get<Reservation>(`/reservations/${id}`),
  create: (body: ReservationInput) => api().post<Reservation>('/reservations', body),
  update: (id: ID, body: ReservationInput) => api().put<Reservation>(`/reservations/${id}`, body),
  transition: (id: ID, action: ReservationAction, extra?: { tableId?: ID; reason?: string }) => api().post<Reservation>(`/reservations/${id}/transition`, { action, ...extra }),
};

export const clubApi = {
  coverTypes: () => api().get<CoverChargeType[]>('/club/cover-types'),
  createCoverType: (body: CoverChargeTypeInput) => api().post<CoverChargeType[]>('/club/cover-types', body),
  updateCoverType: (id: ID, body: CoverChargeTypeInput) => api().put<CoverChargeType[]>(`/club/cover-types/${id}`, body),
  entries: (params?: { date?: string; status?: EntryStatus }) => api().get<ClubEntry[]>('/club/entries', params),
  checkIn: (body: CheckInInput) => api().post<ClubEntry>('/club/entries', body),
  checkOut: (id: ID) => api().post<ClubEntry>(`/club/entries/${id}/checkout`),
  cancel: (id: ID, reason: string) => api().post<ClubEntry>(`/club/entries/${id}/cancel`, { reason }),
  dashboard: () => api().get<ClubDashboard>('/club/dashboard'),
  redeemCover: (billId: ID, entryId: ID, amount?: number) => api().post<Bill>(`/bills/${billId}/redeem-cover`, { entryId, amount }),
};

export const vipApi = {
  tables: () => api().get<VipTable[]>('/vip/tables'),
  list: (params?: { date?: string; status?: VipStatus }) => api().get<VipReservation[]>('/vip/reservations', params),
  get: (id: ID) => api().get<VipReservation>(`/vip/reservations/${id}`),
  spend: (id: ID) => api().get<VipReservation>(`/vip/reservations/${id}/spend`),
  create: (body: VipReservationInput) => api().post<VipReservation>('/vip/reservations', body),
  update: (id: ID, body: VipReservationInput) => api().put<VipReservation>(`/vip/reservations/${id}`, body),
  transition: (id: ID, action: VipAction, reason?: string) => api().post<VipReservation>(`/vip/reservations/${id}/transition`, { action, reason }),
};

export const bottleServiceApi = {
  list: () => api().get<BottleServiceItem[]>('/bottle-service'),
  save: (menuItemId: ID, body: BottleServiceInput) => api().put<BottleServiceItem[]>(`/bottle-service/${menuItemId}`, body),
  remove: (menuItemId: ID) => api().delete<BottleServiceItem[]>(`/bottle-service/${menuItemId}`),
};

export const roomChargeApi = {
  verify: (roomNo: string) => api().post<RoomVerification>('/room-charges/verify', { roomNo }),
  post: (billId: ID, body: { roomNo: string; guestName: string; amount?: number }) => api().post<Bill>(`/bills/${billId}/room-charge`, body),
  list: (params?: { from?: string; to?: string }) => api().get<RoomCharge[]>('/room-charges', params),
};

export const notificationsApi = {
  list: (unread = false, limit = 50) => api().get<NotificationList>('/notifications', { unread, limit }),
  markRead: (id: ID) => api().put<NotificationList>(`/notifications/${id}/read`),
  markAllRead: () => api().put<NotificationList>('/notifications/read-all'),
  thresholds: () => api().get<AlertThreshold[]>('/notifications/thresholds'),
  saveThresholds: (thresholds: { key: string; value: number }[]) => api().put<AlertThreshold[]>('/notifications/thresholds', { thresholds }),
};

export const reports2Api = {
  sales: (range: DateRange, groupBy: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR') => api().get<SalesPeriodReport>('/reports/v2/sales', { ...range, groupBy }),
  branches: (range: DateRange) => api().get<BranchComparisonRow[]>('/reports/v2/branches', range),
  categories: (range: DateRange) => api().get<CategoryPerformanceRow[]>('/reports/v2/categories', range),
  inventoryValuation: () => api().get<InventoryValuation>('/reports/v2/inventory/valuation'),
  lowStock: () => api().get<InventoryItem[]>('/reports/v2/inventory/low-stock'),
  wastage: (range: DateRange) => api().get<WastageReport>('/reports/v2/inventory/wastage', range),
  consumption: (range: DateRange) => api().get<ConsumptionRow[]>('/reports/v2/inventory/consumption', range),
  movements: (range: DateRange, type?: MovementType) => api().get<StockMovement[]>('/reports/v2/inventory/movements', { ...range, type }),
  profitability: (range: DateRange) => api().get<ProfitabilityReport>('/reports/v2/profitability', range),
  staff: (range: DateRange) => api().get<StaffPerformanceRow[]>('/reports/v2/staff', range),
};
