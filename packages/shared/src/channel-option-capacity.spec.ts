import { describe, expect, it } from 'vitest';
import { projectChannelOptionCapacity } from './channel-option-capacity';

const component = (
  overrides: Partial<Parameters<typeof projectChannelOptionCapacity>[0][number]> = {},
) => ({
  sellpiaInventorySkuId: 'sku-1',
  currentStock: 10,
  availableStock: 10,
  quantity: 1,
  isActive: true,
  ...overrides,
});

describe('projectChannelOptionCapacity', () => {
  it('requires configuration when the recipe is empty', () => {
    expect(projectChannelOptionCapacity([])).toEqual({
      capacity: null,
      warningState: 'configuration_required',
      bottleneckSellpiaInventorySkuIds: [],
    });
  });

  it.each([0, -1])('rejects nonpositive component quantity %s', (quantity) => {
    expect(() => projectChannelOptionCapacity([component({ quantity })]))
      .toThrow('Channel option inventory quantity must be positive');
  });

  it.each([
    { isActive: false },
    { isActive: null },
    { availableStock: null },
  ])('requires review for inactive or unavailable inventory: %o', (invalidInventory) => {
    expect(projectChannelOptionCapacity([component(invalidInventory)])).toEqual({
      capacity: null,
      warningState: 'review_required',
      bottleneckSellpiaInventorySkuIds: [],
    });
  });

  it('returns zero for an exhausted valid recipe', () => {
    expect(projectChannelOptionCapacity([component({ availableStock: 0 })])).toEqual({
      capacity: 0,
      warningState: 'none',
      bottleneckSellpiaInventorySkuIds: ['sku-1'],
    });
  });

  it('uses available stock, floor division, and every tied bottleneck', () => {
    expect(projectChannelOptionCapacity([
      component({
        sellpiaInventorySkuId: 'sku-a',
        currentStock: 999,
        availableStock: 11,
        quantity: 3,
      }),
      component({ sellpiaInventorySkuId: 'sku-b', availableStock: 8, quantity: 2 }),
      component({ sellpiaInventorySkuId: 'sku-c', availableStock: 7, quantity: 2 }),
    ])).toEqual({
      capacity: 3,
      warningState: 'none',
      bottleneckSellpiaInventorySkuIds: ['sku-a', 'sku-c'],
    });
  });
});
