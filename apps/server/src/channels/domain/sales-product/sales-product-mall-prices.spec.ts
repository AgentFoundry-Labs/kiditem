import { describe, expect, it } from 'vitest';
import { planMallPriceAdoption, type MallPriceCandidateProduct } from './sales-product-mall-prices';

function product(overrides: Partial<MallPriceCandidateProduct> = {}): MallPriceCandidateProduct {
  return {
    id: 'p-1',
    options: [
      { id: 'o-blue', salePrice: 5_000, normalPrice: 6_000 },
      { id: 'o-big', salePrice: 5_500, normalPrice: 6_500 },
    ],
    targets: [{
      id: 'target-1',
      channelAccountId: 'acc-1',
      version: 3,
      selectedOptions: [
        { salesProductOptionId: 'o-blue', salePrice: null, normalPrice: null, supplyPrice: null },
        { salesProductOptionId: 'o-big', salePrice: null, normalPrice: null, supplyPrice: null },
      ],
    }],
    ...overrides,
  };
}

describe('planMallPriceAdoption', () => {
  it('writes each selected option final price to the one existing target', () => {
    const plan = planMallPriceAdoption({
      products: [product()],
      listingOptions: [
        { channelAccountId: 'acc-1', salesProductOptionId: 'o-blue', salePrice: 5_200 },
        { channelAccountId: 'acc-1', salesProductOptionId: 'o-big', salePrice: 6_100 },
      ],
    });

    expect(plan.writes).toEqual([{
      salesProductId: 'p-1',
      channelAccountId: 'acc-1',
      salePrice: 5_200,
      targetId: 'target-1',
      expectedVersion: 3,
      optionPrices: [
        { salesProductOptionId: 'o-blue', salePrice: 5_200 },
        { salesProductOptionId: 'o-big', salePrice: 6_100 },
      ],
    }]);
  });

  it('keeps matching option prices unchanged without deriving a base or extra price', () => {
    const plan = planMallPriceAdoption({
      products: [product({
        targets: [{
          id: 'target-1',
          channelAccountId: 'acc-1',
          version: 4,
          selectedOptions: [
            { salesProductOptionId: 'o-blue', salePrice: 5_000, normalPrice: null, supplyPrice: null },
            { salesProductOptionId: 'o-big', salePrice: 5_500, normalPrice: null, supplyPrice: null },
          ],
        }],
      })],
      listingOptions: [
        { channelAccountId: 'acc-1', salesProductOptionId: 'o-blue', salePrice: 5_000 },
        { channelAccountId: 'acc-1', salesProductOptionId: 'o-big', salePrice: 5_500 },
      ],
    });

    expect(plan.writes).toEqual([]);
    expect(plan.unchanged).toBe(1);
  });

  it('reports duplicate prices for the same option instead of guessing', () => {
    const plan = planMallPriceAdoption({
      products: [product()],
      listingOptions: [
        { channelAccountId: 'acc-1', salesProductOptionId: 'o-blue', salePrice: 5_200 },
        { channelAccountId: 'acc-1', salesProductOptionId: 'o-blue', salePrice: 5_300 },
      ],
    });

    expect(plan.writes).toEqual([]);
    expect(plan.conflicts).toEqual([{
      salesProductId: 'p-1',
      channelAccountId: 'acc-1',
      reason: 'options_disagree',
      prices: [5_200, 5_300],
    }]);
  });

  it('reports missing or multiple targets without creating or selecting one', () => {
    const missing = planMallPriceAdoption({
      products: [product({ targets: [] })],
      listingOptions: [{ channelAccountId: 'acc-1', salesProductOptionId: 'o-blue', salePrice: 5_200 }],
    });
    expect(missing.writes).toEqual([]);
    expect(missing.conflicts).toHaveLength(1);

    const baseTarget = product().targets[0]!;
    const multiple = planMallPriceAdoption({
      products: [product({ targets: [baseTarget, { ...baseTarget, id: 'target-2' }] })],
      listingOptions: [{ channelAccountId: 'acc-1', salesProductOptionId: 'o-blue', salePrice: 5_200 }],
    });
    expect(multiple.writes).toEqual([]);
    expect(multiple.conflicts).toHaveLength(1);
  });
});
