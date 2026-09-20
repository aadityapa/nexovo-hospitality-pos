import { api } from '..';
import type { ID, Order, OrderListParams, CreateOrderRequest, NewOrderItemInput, CancelItemRequest, OrderItemStatus, OrderStatusHistory, Ticket, TicketStatus } from '@/types';

export const ordersApi = {
  list: (params?: OrderListParams) => api().get<Order[]>('/orders', params),
  get: (id: ID) => api().get<Order>(`/orders/${id}`),
  create: (body: CreateOrderRequest) => api().post<Order>('/orders', body),
  update: (id: ID, body: { guestCount?: number; notes?: string }) => api().put<Order>(`/orders/${id}`, body),
  addItems: (id: ID, items: NewOrderItemInput[]) => api().post<Order>(`/orders/${id}/items`, { items }),
  updateItem: (id: ID, itemId: ID, body: { quantity?: number; notes?: string }) => api().put<Order>(`/orders/${id}/items/${itemId}`, body),
  cancelItem: (id: ID, itemId: ID, body: CancelItemRequest) => api().post<Order>(`/orders/${id}/items/${itemId}/cancel`, body),
  setItemStatus: (id: ID, itemId: ID, status: OrderItemStatus) => api().put<Order>(`/orders/${id}/items/${itemId}/status`, { status }),
  confirm: (id: ID) => api().post<Order>(`/orders/${id}/confirm`),
  cancel: (id: ID, reason: string) => api().post<Order>(`/orders/${id}/cancel`, { reason }),
  requestBill: (id: ID) => api().post<Order>(`/orders/${id}/request-bill`),
  history: (id: ID) => api().get<OrderStatusHistory[]>(`/orders/${id}/history`),
};

export const kitchenApi = {
  tickets: (status?: TicketStatus) => api().get<Ticket[]>('/kitchen/orders', { status }),
  setItemStatus: (itemId: ID, status: OrderItemStatus) => api().put<Ticket>(`/kitchen/order-items/${itemId}/status`, { status }),
};

export const barApi = {
  tickets: (status?: TicketStatus) => api().get<Ticket[]>('/bar/orders', { status }),
  setItemStatus: (itemId: ID, status: OrderItemStatus) => api().put<Ticket>(`/bar/order-items/${itemId}/status`, { status }),
};
