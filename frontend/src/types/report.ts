import type { ID } from './common';
import type { Order } from './order';
import type { PaymentMethod } from './billing';

export interface SalesByDay { date: string; sales: number; orders: number }
export interface SalesByHour { hour: number; sales: number; orders: number }

export interface SalesReport {
  totalSales: number;
  totalOrders: number;
  averageOrderValue: number;
  taxTotal: number;
  discountTotal: number;
  serviceChargeTotal: number;
  byDay: SalesByDay[];
  byHour: SalesByHour[];
}

export interface PaymentMethodTotal { method: PaymentMethod; amount: number; count: number; reversed: number }

export interface PaymentReport {
  byMethod: PaymentMethodTotal[];
  total: number;
  refunded: number;
}

export interface OrderReport {
  total: number;
  completed: number;
  cancelled: number;
  pending: number;
  active: number;
  cancelledItems: number;
}

export interface ItemSalesRow { menuItemId: ID; itemName: string; categoryName: string; quantity: number; revenue: number }
export interface CategorySalesRow { categoryName: string; quantity: number; revenue: number }

export interface ItemSalesReport {
  topItems: ItemSalesRow[];
  byCategory: CategorySalesRow[];
}

export interface RecentPayment {
  id: ID;
  paymentNumber: string;
  billNumber: string;
  method: PaymentMethod;
  amount: number;
  createdAt: string;
}

export interface DashboardSummary {
  sales: SalesReport;
  orders: OrderReport;
  items: ItemSalesReport;
  payments: PaymentReport;
  pendingPayments: number;
  totalTables: number;
  availableTables: number;
  occupiedTables: number;
  recentOrders: Order[];
  recentPayments: RecentPayment[];
}

export type DashboardPreset = 'today' | 'yesterday' | 'week' | 'month' | 'custom';
