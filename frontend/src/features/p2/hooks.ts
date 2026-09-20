/**
 * Phase 2 data hooks — one place for query keys + mutations so pages stay thin.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { branchesApi, inventoryApi, recipesApi, suppliersApi, purchasesApi, customersApi, loyaltyApi, reservationsApi, clubApi, vipApi, bottleServiceApi, roomChargeApi, notificationsApi, usersApi } from '@/services/api/endpoints';
import { toast } from '@/store/uiStore';
import type { ID, InventoryItemInput, InventoryCategoryInput, ManualMovementInput, MovementType, StockStatus, RecipeInput, SupplierInput, SupplierStatus, PurchaseOrderInput, PoAction, PoStatus, ReceiveGoodsInput, CustomerInput, LoyaltyProgramInput, ReservationInput, ReservationAction, ReservationStatus, CoverChargeTypeInput, CheckInInput, EntryStatus, VipReservationInput, VipAction, VipStatus, BottleServiceInput, BranchCreateInput, OutletInput } from '@/types';

function useInv(keys: string[][]) {
  const qc = useQueryClient();
  return () => keys.forEach((k) => void qc.invalidateQueries({ queryKey: k }));
}

// ---------------------------------------------------------------- staff directory (host / promoter pickers)
export const useStaff = (role?: string) => useQuery({ queryKey: ['users', 'staff', role ?? ''], queryFn: () => usersApi.staff(role), staleTime: 5 * 60_000 });

// ---------------------------------------------------------------- branches
export const useBranches = (enabled = true) => useQuery({ queryKey: ['branches'], queryFn: branchesApi.list, staleTime: 60_000, enabled });
export const useOutlets = () => useQuery({ queryKey: ['branches', 'outlets'], queryFn: branchesApi.outlets, staleTime: 60_000 });
export function useBranchMutations() {
  const inv = useInv([['branches'], ['branch'], ['users']]);
  return {
    saveBranch: useMutation({ mutationFn: ({ id, body }: { id: ID | null; body: BranchCreateInput }) => (id == null ? branchesApi.create(body) : branchesApi.update(id, body)), onSuccess: () => { inv(); toast.success('Branch saved'); } }),
    saveOutlet: useMutation({ mutationFn: ({ id, body }: { id: ID | null; body: OutletInput }) => (id == null ? branchesApi.createOutlet(body) : branchesApi.updateOutlet(id, body)), onSuccess: () => { inv(); toast.success('Outlet saved'); } }),
    setUserBranches: useMutation({ mutationFn: ({ userId, branchIds }: { userId: ID; branchIds: ID[] }) => branchesApi.setUserBranches(userId, branchIds), onSuccess: () => { inv(); toast.success('Branch access updated'); } }),
  };
}

// ---------------------------------------------------------------- inventory
export const useInventoryUnits = () => useQuery({ queryKey: ['inventory', 'units'], queryFn: inventoryApi.units, staleTime: 10 * 60_000 });
export const useInventoryCategories = () => useQuery({ queryKey: ['inventory', 'categories'], queryFn: inventoryApi.categories, staleTime: 60_000 });
export const useInventoryItems = (params: { search?: string; categoryId?: ID; status?: StockStatus } = {}) => useQuery({ queryKey: ['inventory', 'items', params], queryFn: () => inventoryApi.items(params), staleTime: 10_000 });
export const useInventoryItem = (id: ID | undefined) => useQuery({ queryKey: ['inventory', 'item', id], queryFn: () => inventoryApi.item(id!), enabled: !!id });
export const useItemMovements = (id: ID | undefined, params?: { type?: MovementType; from?: string; to?: string; limit?: number }) => useQuery({ queryKey: ['inventory', 'movements', id, params], queryFn: () => inventoryApi.itemMovements(id!, params), enabled: !!id });
export const useMovements = (params: { invItemId?: ID; type?: MovementType; from?: string; to?: string; limit?: number } = {}) => useQuery({ queryKey: ['inventory', 'movements', 'all', params], queryFn: () => inventoryApi.movements(params), staleTime: 10_000 });
export const useInventoryDashboard = () => useQuery({ queryKey: ['inventory', 'dashboard'], queryFn: inventoryApi.dashboard, staleTime: 10_000 });
export function useInventoryMutations() {
  const inv = useInv([['inventory'], ['recipes'], ['notifications']]);
  return {
    saveItem: useMutation({ mutationFn: ({ id, body }: { id: ID | null; body: InventoryItemInput }) => (id == null ? inventoryApi.createItem(body) : inventoryApi.updateItem(id, body)), onSuccess: (_d, v) => { inv(); toast.success(v.id == null ? 'Inventory item created' : 'Inventory item updated'); } }),
    deleteItem: useMutation({ mutationFn: (id: ID) => inventoryApi.deleteItem(id), onSuccess: () => { inv(); toast.success('Inventory item deleted'); } }),
    saveCategory: useMutation({ mutationFn: ({ id, body }: { id: ID | null; body: InventoryCategoryInput }) => (id == null ? inventoryApi.createCategory(body) : inventoryApi.updateCategory(id, body)), onSuccess: () => { inv(); toast.success('Category saved'); } }),
    recordMovement: useMutation({ mutationFn: (body: ManualMovementInput) => inventoryApi.recordMovement(body), onSuccess: () => { inv(); toast.success('Stock movement recorded'); } }),
    deductForOrder: useMutation({ mutationFn: (orderId: ID) => inventoryApi.deductForOrder(orderId), onSuccess: () => { inv(); toast.success('Stock deducted for order'); } }),
  };
}

// ---------------------------------------------------------------- recipes
export const useRecipeCosting = () => useQuery({ queryKey: ['recipes', 'list'], queryFn: recipesApi.list, staleTime: 30_000 });
export const useRecipe = (menuItemId: ID | undefined) => useQuery({ queryKey: ['recipes', 'one', menuItemId], queryFn: () => recipesApi.get(menuItemId!), enabled: !!menuItemId });
export function useRecipeMutations() {
  const inv = useInv([['recipes'], ['inventory']]);
  return {
    save: useMutation({ mutationFn: ({ menuItemId, body }: { menuItemId: ID; body: RecipeInput }) => recipesApi.save(menuItemId, body), onSuccess: () => { inv(); toast.success('Recipe saved'); } }),
    remove: useMutation({ mutationFn: (menuItemId: ID) => recipesApi.remove(menuItemId), onSuccess: () => { inv(); toast.success('Recipe deactivated'); } }),
  };
}

// ---------------------------------------------------------------- suppliers & purchasing
export const useSuppliers = (params: { search?: string; status?: SupplierStatus } = {}) => useQuery({ queryKey: ['suppliers', 'list', params], queryFn: () => suppliersApi.list(params), staleTime: 30_000 });
export const useSupplierHistory = (id: ID | undefined) => useQuery({ queryKey: ['suppliers', 'history', id], queryFn: () => suppliersApi.history(id!), enabled: !!id });
export const usePurchaseOrders = (params: { status?: PoStatus; supplierId?: ID; search?: string } = {}) => useQuery({ queryKey: ['purchases', 'list', params], queryFn: () => purchasesApi.list(params), staleTime: 10_000 });
export const usePurchaseOrder = (id: ID | undefined) => useQuery({ queryKey: ['purchases', 'one', id], queryFn: () => purchasesApi.get(id!), enabled: !!id });
export function usePurchasingMutations() {
  const inv = useInv([['suppliers'], ['purchases'], ['inventory'], ['notifications']]);
  return {
    saveSupplier: useMutation({ mutationFn: ({ id, body }: { id: ID | null; body: SupplierInput }) => (id == null ? suppliersApi.create(body) : suppliersApi.update(id, body)), onSuccess: (_d, v) => { inv(); toast.success(v.id == null ? 'Supplier created' : 'Supplier updated'); } }),
    deleteSupplier: useMutation({ mutationFn: (id: ID) => suppliersApi.remove(id), onSuccess: () => { inv(); toast.success('Supplier deleted'); } }),
    addSupplierPayment: useMutation({ mutationFn: ({ id, body }: { id: ID; body: { amount: number; method: string; reference?: string; poId?: ID; notes?: string } }) => suppliersApi.addPayment(id, body), onSuccess: () => { inv(); toast.success('Supplier payment recorded'); } }),
    savePo: useMutation({ mutationFn: ({ id, body }: { id: ID | null; body: PurchaseOrderInput }) => (id == null ? purchasesApi.create(body) : purchasesApi.update(id, body)), onSuccess: (_d, v) => { inv(); toast.success(v.id == null ? 'Purchase order created' : 'Purchase order updated'); } }),
    transitionPo: useMutation({ mutationFn: ({ id, action, reason }: { id: ID; action: PoAction; reason?: string }) => purchasesApi.transition(id, action, reason), onSuccess: (po) => { inv(); toast.success(`Purchase order ${po.status.toLowerCase().replace('_', ' ')}`); } }),
    receive: useMutation({ mutationFn: ({ id, body }: { id: ID; body: ReceiveGoodsInput }) => purchasesApi.receive(id, body), onSuccess: () => { inv(); toast.success('Goods received into stock'); } }),
  };
}

// ---------------------------------------------------------------- CRM & loyalty
export const useCustomers = (params: { search?: string; limit?: number } = {}) => useQuery({ queryKey: ['customers', 'list', params], queryFn: () => customersApi.list(params), staleTime: 15_000 });
export const useCustomerHistory = (id: ID | undefined) => useQuery({ queryKey: ['customers', 'history', id], queryFn: () => customersApi.history(id!), enabled: !!id });
export const useLoyaltyProgram = () => useQuery({ queryKey: ['loyalty', 'program'], queryFn: loyaltyApi.program, staleTime: 60_000 });
export const useLoyaltyAccount = (customerId: ID | undefined | null) => useQuery({ queryKey: ['loyalty', 'account', customerId], queryFn: () => loyaltyApi.account(customerId!), enabled: !!customerId });
export function useCrmMutations() {
  const inv = useInv([['customers'], ['loyalty'], ['orders'], ['bills']]);
  return {
    saveCustomer: useMutation({ mutationFn: ({ id, body }: { id: ID | null; body: CustomerInput }) => (id == null ? customersApi.create(body) : customersApi.update(id, body)), onSuccess: (_d, v) => { inv(); toast.success(v.id == null ? 'Customer created' : 'Customer updated'); } }),
    deleteCustomer: useMutation({ mutationFn: (id: ID) => customersApi.remove(id), onSuccess: () => { inv(); toast.success('Customer deleted'); } }),
    attachToOrder: useMutation({ mutationFn: ({ orderId, customerId }: { orderId: ID; customerId: ID | null }) => customersApi.attachToOrder(orderId, customerId), onSuccess: () => { inv(); toast.success('Customer linked to order'); } }),
    saveProgram: useMutation({ mutationFn: (body: LoyaltyProgramInput) => loyaltyApi.saveProgram(body), onSuccess: () => { inv(); toast.success('Loyalty program updated'); } }),
    adjustPoints: useMutation({ mutationFn: ({ customerId, points, notes }: { customerId: ID; points: number; notes: string }) => loyaltyApi.adjust(customerId, points, notes), onSuccess: () => { inv(); toast.success('Points adjusted'); } }),
    redeem: useMutation({ mutationFn: ({ billId, points }: { billId: ID; points: number }) => loyaltyApi.redeem(billId, points), onSuccess: () => { inv(); toast.success('Points redeemed'); }, meta: { silent: true } }),
  };
}

// ---------------------------------------------------------------- reservations
export const useReservations = (params: { from?: string; to?: string; status?: ReservationStatus; search?: string } = {}) => useQuery({ queryKey: ['reservations', 'list', params], queryFn: () => reservationsApi.list(params), staleTime: 10_000 });
export const useAvailability = (date: string) => useQuery({ queryKey: ['reservations', 'availability', date], queryFn: () => reservationsApi.availability(date), staleTime: 10_000 });
export function useReservationMutations() {
  const inv = useInv([['reservations'], ['orders'], ['tables'], ['notifications']]);
  return {
    save: useMutation({ mutationFn: ({ id, body }: { id: ID | null; body: ReservationInput }) => (id == null ? reservationsApi.create(body) : reservationsApi.update(id, body)), onSuccess: (_d, v) => { inv(); toast.success(v.id == null ? 'Reservation created' : 'Reservation updated'); } }),
    transition: useMutation({ mutationFn: ({ id, action, tableId, reason }: { id: ID; action: ReservationAction; tableId?: ID; reason?: string }) => reservationsApi.transition(id, action, { tableId, reason }), onSuccess: (r) => { inv(); toast.success(`Reservation ${r.status.toLowerCase().replace('_', ' ')}`); } }),
  };
}

// ---------------------------------------------------------------- club & VIP
export const useCoverTypes = () => useQuery({ queryKey: ['club', 'cover-types'], queryFn: clubApi.coverTypes, staleTime: 60_000 });
export const useClubEntries = (params: { date?: string; status?: EntryStatus } = {}) => useQuery({ queryKey: ['club', 'entries', params], queryFn: () => clubApi.entries(params), staleTime: 10_000 });
export const useClubDashboard = () => useQuery({ queryKey: ['club', 'dashboard'], queryFn: clubApi.dashboard, staleTime: 10_000, refetchInterval: 30_000 });
export const useVipTables = () => useQuery({ queryKey: ['vip', 'tables'], queryFn: vipApi.tables, staleTime: 10_000, refetchInterval: 30_000 });
export const useVipList = (params: { date?: string; status?: VipStatus } = {}) => useQuery({ queryKey: ['vip', 'list', params], queryFn: () => vipApi.list(params), staleTime: 10_000 });
export const useVipSpend = (id: ID | undefined) => useQuery({ queryKey: ['vip', 'spend', id], queryFn: () => vipApi.spend(id!), enabled: !!id, refetchInterval: 20_000 });
export const useBottleService = () => useQuery({ queryKey: ['bottle-service'], queryFn: bottleServiceApi.list, staleTime: 30_000 });
export function useClubMutations() {
  const inv = useInv([['club'], ['vip'], ['orders'], ['tables'], ['bills'], ['bottle-service'], ['menu'], ['notifications']]);
  return {
    saveCoverType: useMutation({ mutationFn: ({ id, body }: { id: ID | null; body: CoverChargeTypeInput }) => (id == null ? clubApi.createCoverType(body) : clubApi.updateCoverType(id, body)), onSuccess: () => { inv(); toast.success('Cover charge saved'); } }),
    checkIn: useMutation({ mutationFn: (body: CheckInInput) => clubApi.checkIn(body), onSuccess: (e) => { inv(); toast.success('Guest checked in', `${e.guestName} · ${e.entryNumber}`); } }),
    checkOut: useMutation({ mutationFn: (id: ID) => clubApi.checkOut(id), onSuccess: () => { inv(); toast.success('Guest checked out'); } }),
    cancelEntry: useMutation({ mutationFn: ({ id, reason }: { id: ID; reason: string }) => clubApi.cancel(id, reason), onSuccess: () => { inv(); toast.success('Entry cancelled'); } }),
    redeemCover: useMutation({ mutationFn: ({ billId, entryId, amount }: { billId: ID; entryId: ID; amount?: number }) => clubApi.redeemCover(billId, entryId, amount), onSuccess: () => { inv(); toast.success('Cover credit applied'); }, meta: { silent: true } }),
    saveVip: useMutation({ mutationFn: ({ id, body }: { id: ID | null; body: VipReservationInput }) => (id == null ? vipApi.create(body) : vipApi.update(id, body)), onSuccess: (_d, v) => { inv(); toast.success(v.id == null ? 'VIP table booked' : 'VIP booking updated'); } }),
    transitionVip: useMutation({ mutationFn: ({ id, action, reason }: { id: ID; action: VipAction; reason?: string }) => vipApi.transition(id, action, reason), onSuccess: (v) => { inv(); toast.success(`VIP booking ${v.status.toLowerCase().replace('_', ' ')}`); } }),
    saveBottle: useMutation({ mutationFn: ({ menuItemId, body }: { menuItemId: ID; body: BottleServiceInput }) => bottleServiceApi.save(menuItemId, body), onSuccess: () => { inv(); toast.success('Bottle service saved'); } }),
    removeBottle: useMutation({ mutationFn: (menuItemId: ID) => bottleServiceApi.remove(menuItemId), onSuccess: () => { inv(); toast.success('Bottle service removed'); } }),
  };
}

// ---------------------------------------------------------------- room charges & notifications
export const useRoomCharges = (params: { from?: string; to?: string } = {}) => useQuery({ queryKey: ['bills', 'room-charges', params], queryFn: () => roomChargeApi.list(params), staleTime: 15_000 });
export function useRoomChargeMutations() {
  const inv = useInv([['bills'], ['orders'], ['tables']]);
  return {
    verify: useMutation({ mutationFn: (roomNo: string) => roomChargeApi.verify(roomNo), meta: { silent: true } }),
    post: useMutation({ mutationFn: ({ billId, body }: { billId: ID; body: { roomNo: string; guestName: string; amount?: number } }) => roomChargeApi.post(billId, body), onSuccess: () => { inv(); toast.success('Charged to room'); }, meta: { silent: true } }),
  };
}
export const useNotifications = (unread = false) => useQuery({ queryKey: ['notifications', unread], queryFn: () => notificationsApi.list(unread), staleTime: 15_000, refetchInterval: 30_000 });
export const useThresholds = () => useQuery({ queryKey: ['notifications', 'thresholds'], queryFn: notificationsApi.thresholds, staleTime: 60_000 });
export function useNotificationMutations() {
  const inv = useInv([['notifications']]);
  return {
    markRead: useMutation({ mutationFn: (id: ID) => notificationsApi.markRead(id), onSuccess: inv }),
    markAllRead: useMutation({ mutationFn: () => notificationsApi.markAllRead(), onSuccess: inv }),
    saveThresholds: useMutation({ mutationFn: (rows: { key: string; value: number }[]) => notificationsApi.saveThresholds(rows), onSuccess: () => { inv(); toast.success('Alert thresholds saved'); } }),
  };
}
