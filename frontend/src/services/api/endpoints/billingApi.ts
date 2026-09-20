import { api } from '..';
import type { ID, Bill, BillListParams, AddDiscountRequest, AddPaymentRequest, Receipt, DashboardSummary, SalesReport, PaymentReport, OrderReport, ItemSalesReport, DateRange } from '@/types';

export const billingApi = {
  list: (params?: BillListParams) => api().get<Bill[]>('/bills', params),
  get: (id: ID) => api().get<Bill>(`/bills/${id}`),
  create: (orderId: ID) => api().post<Bill>('/bills', { orderId }),
  addDiscount: (id: ID, body: AddDiscountRequest) => api().post<Bill>(`/bills/${id}/discount`, body),
  removeDiscount: (id: ID, discountId: ID) => api().delete<Bill>(`/bills/${id}/discount/${discountId}`),
  finalize: (id: ID) => api().post<Bill>(`/bills/${id}/finalize`),
  addPayment: (id: ID, body: AddPaymentRequest) => api().post<Bill>(`/bills/${id}/payments`, body),
  reversePayment: (id: ID, paymentId: ID, reason: string) => api().post<Bill>(`/bills/${id}/payments/${paymentId}/reverse`, { reason }),
  close: (id: ID) => api().post<Bill>(`/bills/${id}/close`),
  receipt: (id: ID) => api().get<Receipt>(`/bills/${id}/receipt`),
};

export const reportsApi = {
  dashboard: (range: DateRange) => api().get<DashboardSummary>('/dashboard/summary', range),
  sales: (range: DateRange) => api().get<SalesReport>('/reports/sales', range),
  payments: (range: DateRange) => api().get<PaymentReport>('/reports/payments', range),
  orders: (range: DateRange) => api().get<OrderReport>('/reports/orders', range),
  items: (range: DateRange, limit = 20) => api().get<ItemSalesReport>('/reports/items', { ...range, limit }),
};
