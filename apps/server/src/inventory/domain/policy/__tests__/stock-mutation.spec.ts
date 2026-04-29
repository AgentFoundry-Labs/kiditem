import { describe, it, expect } from 'vitest';
import {
  assertSufficientStock,
  computeStoredQuantity,
  deriveStockDelta,
  InsufficientStockError,
} from '../stock-mutation';

describe('stock-mutation policy', () => {
  describe('assertSufficientStock', () => {
    it('passes when delta keeps stock non-negative', () => {
      expect(() => assertSufficientStock(10, -10)).not.toThrow();
      expect(() => assertSufficientStock(0, 5)).not.toThrow();
    });

    it('throws when delta would go negative', () => {
      expect(() => assertSufficientStock(3, -5)).toThrow(InsufficientStockError);
    });

    it('error carries current + delta', () => {
      try {
        assertSufficientStock(2, -7);
      } catch (err) {
        if (err instanceof InsufficientStockError) {
          expect(err.currentStock).toBe(2);
          expect(err.delta).toBe(-7);
          return;
        }
      }
      throw new Error('expected InsufficientStockError');
    });
  });

  describe('computeStoredQuantity', () => {
    it('ADJUST keeps signed delta', () => {
      expect(computeStoredQuantity('ADJUST', 4)).toBe(4);
      expect(computeStoredQuantity('ADJUST', -4)).toBe(-4);
    });

    it('RECEIVE/ISSUE store absolute amount', () => {
      expect(computeStoredQuantity('RECEIVE', 5)).toBe(5);
      expect(computeStoredQuantity('ISSUE', -3)).toBe(3);
    });
  });

  describe('deriveStockDelta', () => {
    it('reconstructs sign from stored quantity + type', () => {
      expect(deriveStockDelta('RECEIVE', 5)).toBe(5);
      expect(deriveStockDelta('ISSUE', 3)).toBe(-3);
      expect(deriveStockDelta('ADJUST', 4)).toBe(4);
      expect(deriveStockDelta('ADJUST', -4)).toBe(-4);
    });
  });
});
