import { describe, expect, it } from 'vitest';
import { parseActionResult } from './actions';
import { getActionTaskRole } from './action-board-columns';

describe('action board inventory semantics', () => {
  it('does not interpret retired analyze-stock results as reorder advice', () => {
    const result = parseActionResult('analyze-stock', {
      inventories: [
        {
          productName: '레거시 상품',
          currentStock: 1,
          reorderPoint: 5,
          avgDailySales: 2,
        },
      ],
    });

    expect(result).toEqual([
      expect.objectContaining({ label: '결과' }),
    ]);
    expect(result).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: '발주 필요' }),
      ]),
    );
  });

  it('routes factual zero-stock and mapping-attention tasks to inventory', () => {
    expect(getActionTaskRole('h-zero-stock')).toBe('inventory');
    expect(getActionTaskRole('h-mapping-attention')).toBe('inventory');
  });
});
