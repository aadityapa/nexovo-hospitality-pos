import { describe, it, expect } from 'vitest';
import { deriveOrderStatus, deriveTicketStatus, canTransitionItem, tableStatusForOrder, canAddItems, canRequestBill } from './orderStatus';

describe('order status derivation', () => {
  it('derives parent status from item statuses', () => {
    expect(deriveOrderStatus('CONFIRMED', ['NEW', 'NEW'])).toBe('CONFIRMED');
    expect(deriveOrderStatus('CONFIRMED', ['PREPARING', 'NEW'])).toBe('IN_PROGRESS');
    expect(deriveOrderStatus('IN_PROGRESS', ['READY', 'PREPARING'])).toBe('PARTIALLY_READY');
    expect(deriveOrderStatus('IN_PROGRESS', ['READY', 'READY'])).toBe('READY');
    // nothing is left in the kitchen once every item is READY or SERVED → READY (mirrors ORDER_PKG.derive_status)
    expect(deriveOrderStatus('READY', ['SERVED', 'READY'])).toBe('READY');
    expect(deriveOrderStatus('IN_PROGRESS', ['SERVED', 'PREPARING'])).toBe('PARTIALLY_READY');
    expect(deriveOrderStatus('READY', ['SERVED', 'SERVED'])).toBe('SERVED');
  });
  it('ignores cancelled items and cancels order when all items cancelled', () => {
    expect(deriveOrderStatus('CONFIRMED', ['CANCELLED', 'READY'])).toBe('READY');
    expect(deriveOrderStatus('CONFIRMED', ['CANCELLED', 'CANCELLED'])).toBe('CANCELLED');
  });
  it('does not re-derive after bill requested or while draft', () => {
    expect(deriveOrderStatus('BILL_REQUESTED', ['SERVED'])).toBe('BILL_REQUESTED');
    expect(deriveOrderStatus('DRAFT', ['NEW'])).toBe('DRAFT');
  });
  it('derives ticket status', () => {
    expect(deriveTicketStatus(['NEW', 'NEW'])).toBe('NEW');
    expect(deriveTicketStatus(['NEW', 'PREPARING'])).toBe('PREPARING');
    expect(deriveTicketStatus(['READY', 'SERVED'])).toBe('READY');
    expect(deriveTicketStatus(['CANCELLED'])).toBe('CANCELLED');
  });
  it('enforces item transitions', () => {
    expect(canTransitionItem('NEW', 'PREPARING')).toBe(true);
    expect(canTransitionItem('NEW', 'READY')).toBe(true);
    expect(canTransitionItem('NEW', 'SERVED')).toBe(false);
    expect(canTransitionItem('READY', 'PREPARING')).toBe(false);
    expect(canTransitionItem('SERVED', 'CANCELLED')).toBe(false);
  });
  it('maps order → table status', () => {
    expect(tableStatusForOrder(null)).toBe('AVAILABLE');
    expect(tableStatusForOrder('DRAFT')).toBe('ORDERING');
    expect(tableStatusForOrder('IN_PROGRESS')).toBe('PREPARING');
    expect(tableStatusForOrder('BILLED', 500)).toBe('PAYMENT_PENDING');
    expect(tableStatusForOrder('COMPLETED')).toBe('AVAILABLE');
  });
  it('guards add-items and request-bill', () => {
    expect(canAddItems('SERVED')).toBe(true);
    expect(canAddItems('BILL_REQUESTED')).toBe(false);
    expect(canRequestBill('DRAFT')).toBe(false);
    expect(canRequestBill('CONFIRMED')).toBe(true);
    expect(canRequestBill('BILLED')).toBe(false);
  });
});
