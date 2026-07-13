import { describe, it, expect } from 'vitest';
import { extractPickableItems } from '../picking-rules';

describe('picking-rules — extractPickableItems', () => {
  it('returns empty when input is empty', () => {
    expect(extractPickableItems([])).toEqual({ items: [], skippedCount: 0 });
  });

  it('expands every confirmed ChannelSku component by ordered quantity', () => {
    const result = extractPickableItems([
      {
        id: 'order-1',
        lineItems: [
          {
            productName: '묶음 상품',
            quantity: 3,
            listingOption: {
              components: [
                {
                  masterProductId: 'master-a',
                  quantity: 2,
                  masterProduct: {
                    sellpiaProductCode: 'SELLPIA-A',
                    name: '구성품 A',
                    optionName: '빨강',
                  },
                },
                {
                  masterProductId: 'master-b',
                  quantity: 1,
                  masterProduct: {
                    sellpiaProductCode: 'SELLPIA-B',
                    name: '구성품 B',
                    optionName: null,
                  },
                },
              ],
            },
          },
        ],
      },
    ]);
    expect(result.skippedCount).toBe(0);
    expect(result.items).toEqual([
      {
        orderId: 'order-1',
        masterProductId: 'master-a',
        productName: '구성품 A',
        sku: 'SELLPIA-A',
        quantity: 6,
      },
      {
        orderId: 'order-1',
        masterProductId: 'master-b',
        productName: '구성품 B',
        sku: 'SELLPIA-B',
        quantity: 3,
      },
    ]);
  });

  it('skips and counts each order line without a confirmed component recipe', () => {
    const result = extractPickableItems([
      {
        id: 'order-1',
        lineItems: [
          { productName: '미매칭 A', quantity: 1, listingOption: null },
          { productName: '미매칭 B', quantity: 2, listingOption: { components: [] } },
        ],
      },
    ]);
    expect(result).toEqual({ items: [], skippedCount: 2 });
  });
});
