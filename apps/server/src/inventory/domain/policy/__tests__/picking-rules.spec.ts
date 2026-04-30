import { describe, it, expect } from 'vitest';
import { extractPickableItems } from '../picking-rules';

describe('picking-rules — extractPickableItems', () => {
  it('returns empty when input is empty', () => {
    expect(extractPickableItems([])).toEqual({ items: [], skippedCount: 0 });
  });

  it('skips line items with optionId=null and reports the count', () => {
    const result = extractPickableItems([
      {
        id: 'order-1',
        lineItems: [
          { optionId: null, productName: 'A', sku: null, quantity: 1, option: null },
          { optionId: 'opt-2', productName: 'B', sku: 'B-SKU', quantity: 2, option: null },
        ],
      },
    ]);
    expect(result.skippedCount).toBe(1);
    expect(result.items).toEqual([
      { orderId: 'order-1', optionId: 'opt-2', productName: 'B', sku: 'B-SKU', quantity: 2 },
    ]);
  });

  it('falls back to option.sku when lineItem.sku is null', () => {
    const result = extractPickableItems([
      {
        id: 'order-1',
        lineItems: [
          { optionId: 'opt-1', productName: 'A', sku: null, quantity: 1, option: { sku: 'OPT-A' } },
        ],
      },
    ]);
    expect(result.items[0].sku).toBe('OPT-A');
  });

  it('preserves order of orders + line items', () => {
    const result = extractPickableItems([
      {
        id: 'order-1',
        lineItems: [
          { optionId: 'a', productName: 'A', sku: 'A', quantity: 1, option: null },
          { optionId: 'b', productName: 'B', sku: 'B', quantity: 1, option: null },
        ],
      },
      {
        id: 'order-2',
        lineItems: [
          { optionId: 'c', productName: 'C', sku: 'C', quantity: 1, option: null },
        ],
      },
    ]);
    expect(result.items.map((i) => i.optionId)).toEqual(['a', 'b', 'c']);
  });
});
