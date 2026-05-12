import { describe, it, expect } from 'vitest';
import {
  assertValidPurchaseOrderTransition,
  isDeletablePurchaseOrderStatus,
  isValidPurchaseOrderTransition,
} from '../purchase-order-status';

describe('purchase-order-status policy', () => {
  it('forward chain draft → pending → ordered → shipped → received is valid', () => {
    expect(isValidPurchaseOrderTransition('draft', 'pending')).toBe(true);
    expect(isValidPurchaseOrderTransition('pending', 'ordered')).toBe(true);
    expect(isValidPurchaseOrderTransition('ordered', 'shipped')).toBe(true);
    expect(isValidPurchaseOrderTransition('shipped', 'received')).toBe(true);
  });

  it('skipping a step is invalid', () => {
    expect(isValidPurchaseOrderTransition('draft', 'received')).toBe(false);
    expect(isValidPurchaseOrderTransition('pending', 'shipped')).toBe(false);
    expect(isValidPurchaseOrderTransition('ordered', 'received')).toBe(false);
  });

  it('reverse and same-state transitions are invalid', () => {
    expect(isValidPurchaseOrderTransition('pending', 'draft')).toBe(false);
    expect(isValidPurchaseOrderTransition('received', 'received')).toBe(false);
    expect(isValidPurchaseOrderTransition('received', 'shipped')).toBe(false);
  });

  it('terminal state has no forward transition', () => {
    expect(isValidPurchaseOrderTransition('received', 'pending')).toBe(false);
    expect(isValidPurchaseOrderTransition('cancelled', 'pending')).toBe(false);
  });

  it('assertValidPurchaseOrderTransition throws on invalid transition', () => {
    expect(() => assertValidPurchaseOrderTransition('draft', 'received')).toThrow();
  });

  it('only draft and pending are deletable', () => {
    expect(isDeletablePurchaseOrderStatus('draft')).toBe(true);
    expect(isDeletablePurchaseOrderStatus('pending')).toBe(true);
    expect(isDeletablePurchaseOrderStatus('ordered')).toBe(false);
    expect(isDeletablePurchaseOrderStatus('shipped')).toBe(false);
    expect(isDeletablePurchaseOrderStatus('received')).toBe(false);
    expect(isDeletablePurchaseOrderStatus('cancelled')).toBe(false);
  });
});
