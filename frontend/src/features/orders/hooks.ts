import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ordersApi } from '@/services/api/endpoints';
import { toast } from '@/store/uiStore';
import type { ID, OrderListParams, CreateOrderRequest, NewOrderItemInput, CancelItemRequest, OrderItemStatus } from '@/types';

export function useOrders(params: OrderListParams = {}, opts: { refetchInterval?: number; enabled?: boolean } = {}) {
  return useQuery({ queryKey: ['orders', 'list', params], queryFn: () => ordersApi.list(params), staleTime: 5_000, ...opts });
}
export function useOrder(id: ID | undefined) {
  return useQuery({ queryKey: ['orders', 'one', id], queryFn: () => ordersApi.get(id!), enabled: !!id, staleTime: 5_000 });
}
export function useOrderHistory(id: ID | undefined) {
  return useQuery({ queryKey: ['orders', 'history', id], queryFn: () => ordersApi.history(id!), enabled: !!id });
}

export function useOrderMutations() {
  const qc = useQueryClient();
  const inv = () => { void qc.invalidateQueries({ queryKey: ['orders'] }); void qc.invalidateQueries({ queryKey: ['tables'] }); void qc.invalidateQueries({ queryKey: ['kitchen'] }); void qc.invalidateQueries({ queryKey: ['bar'] }); void qc.invalidateQueries({ queryKey: ['dashboard'] }); };
  const create = useMutation({ mutationFn: (body: CreateOrderRequest) => ordersApi.create(body), onSuccess: inv });
  const addItems = useMutation({ mutationFn: ({ id, items }: { id: ID; items: NewOrderItemInput[] }) => ordersApi.addItems(id, items), onSuccess: inv });
  const updateItem = useMutation({ mutationFn: ({ id, itemId, body }: { id: ID; itemId: ID; body: { quantity?: number; notes?: string } }) => ordersApi.updateItem(id, itemId, body), onSuccess: inv });
  const cancelItem = useMutation({ mutationFn: ({ id, itemId, body }: { id: ID; itemId: ID; body: CancelItemRequest }) => ordersApi.cancelItem(id, itemId, body), onSuccess: () => { inv(); toast.success('Item cancelled'); } });
  const confirm = useMutation({ mutationFn: (id: ID) => ordersApi.confirm(id), onSuccess: (o) => { inv(); const k = o.items.some((i) => i.prepLocation === 'KITCHEN' && i.status !== 'CANCELLED'); const b = o.items.some((i) => i.prepLocation === 'BAR' && i.status !== 'CANCELLED'); toast.success('Order sent', `${o.orderNumber} → ${[k && 'Kitchen', b && 'Bar'].filter(Boolean).join(' + ')}`); } });
  const cancel = useMutation({ mutationFn: ({ id, reason }: { id: ID; reason: string }) => ordersApi.cancel(id, reason), onSuccess: () => { inv(); toast.success('Order cancelled'); } });
  const requestBill = useMutation({ mutationFn: (id: ID) => ordersApi.requestBill(id), onSuccess: (o) => { inv(); void qc.invalidateQueries({ queryKey: ['bills'] }); toast.success('Bill requested', `Cashier notified for ${o.tableName}`); } });
  const setItemStatus = useMutation({ mutationFn: ({ id, itemId, status }: { id: ID; itemId: ID; status: OrderItemStatus }) => ordersApi.setItemStatus(id, itemId, status), onSuccess: inv });
  const update = useMutation({ mutationFn: ({ id, body }: { id: ID; body: { guestCount?: number; notes?: string } }) => ordersApi.update(id, body), onSuccess: inv });
  return { create, addItems, updateItem, cancelItem, confirm, cancel, requestBill, setItemStatus, update };
}
