import { AlertTriangle, Info, OctagonAlert, type LucideIcon } from 'lucide-react';
import type { AppNotification, NotificationSeverity } from '@/types';

export const SEVERITY_ICON: Record<NotificationSeverity, LucideIcon> = { CRITICAL: OctagonAlert, WARNING: AlertTriangle, INFO: Info };
export const SEVERITY_TONE: Record<NotificationSeverity, 'danger' | 'warning' | 'info'> = { CRITICAL: 'danger', WARNING: 'warning', INFO: 'info' };
export const SEVERITY_TEXT: Record<NotificationSeverity, string> = { CRITICAL: 'text-danger-600', WARNING: 'text-warning-600', INFO: 'text-info-600' };

/** Where a notification takes the user when opened. `null` = no dedicated screen. */
export function notificationTarget(n: Pick<AppNotification, 'entity' | 'entityId'>): string | null {
  switch (n.entity) {
    case 'INVENTORY_ITEMS':
    case 'INVENTORY_ITEM': return n.entityId ? `/admin/inventory/items/${n.entityId}` : '/admin/inventory';
    case 'PURCHASE_ORDERS':
    case 'PURCHASE_ORDER': return n.entityId ? `/admin/purchases/${n.entityId}` : '/admin/purchases';
    case 'ORDERS':
    case 'ORDER': return n.entityId ? `/admin/orders/${n.entityId}` : '/admin/orders';
    case 'RESERVATIONS':
    case 'RESERVATION': return '/admin/reservations';
    case 'VIP_RESERVATIONS':
    case 'VIP_RESERVATION': return '/admin/vip';
    case 'CLUB_ENTRIES': return '/admin/club';
    case 'BILLS':
    case 'BILL': return n.entityId ? `/cashier/bills/${n.entityId}` : '/cashier/bills';
    default: return null;
  }
}
