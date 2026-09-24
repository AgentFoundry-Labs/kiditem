import { describe, expect, it } from 'vitest';
import { projectChannelOptionCapacity } from '@kiditem/shared/channel-option-capacity';
import { decideStockout } from './stockout-policy';

describe('stockout decision', () => {
  it('stops a two-unit offer when only one source unit remains', () => {
    const { capacity } = projectChannelOptionCapacity([{ masterProductId: 'source', currentStock: 1, quantity: 2 }]);
    expect(decideStockout(capacity, 0)).toBe('out_of_stock');
  });
  it.each([[3, 3, 'out_of_stock'], [4, 3, 'in_stock'], [0, 0, 'out_of_stock']] as const)(
    'compares %s complete sets against threshold %s', (capacity, threshold, expected) => {
      expect(decideStockout(capacity, threshold)).toBe(expected);
    },
  );
  it('never treats unknown stock or unresolved composition as zero', () => {
    expect(decideStockout(null, 100)).toBe('unknown');
    expect(decideStockout(0, 100, true)).toBe('unknown');
  });
  it.each([-1, 0.5, NaN, Infinity])('rejects invalid threshold %s', (threshold) => {
    expect(() => decideStockout(0, threshold)).toThrow(expect.objectContaining({ code: 'INTERNAL_ERROR', details: { reason: 'SAFETY_STOCK_INVALID' } }));
  });
});
