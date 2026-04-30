import { describe, it, expect } from 'vitest';
import {
  assertValidStockTransferTransition,
  InvalidStockTransferTransition,
} from '../stock-transfer-transition';

describe('stock-transfer-transition policy', () => {
  it('pending → in_transit allowed', () => {
    expect(() => assertValidStockTransferTransition('pending', 'in_transit')).not.toThrow();
  });

  it('pending → cancelled allowed', () => {
    expect(() => assertValidStockTransferTransition('pending', 'cancelled')).not.toThrow();
  });

  it('in_transit → completed allowed', () => {
    expect(() => assertValidStockTransferTransition('in_transit', 'completed')).not.toThrow();
  });

  it('completed → anything rejected', () => {
    expect(() => assertValidStockTransferTransition('completed', 'in_transit'))
      .toThrow(InvalidStockTransferTransition);
  });

  it('pending → completed rejected (must pass through in_transit)', () => {
    expect(() => assertValidStockTransferTransition('pending', 'completed'))
      .toThrow(InvalidStockTransferTransition);
  });

  it('unknown source rejected', () => {
    expect(() => assertValidStockTransferTransition('weird', 'pending'))
      .toThrow(InvalidStockTransferTransition);
  });
});
