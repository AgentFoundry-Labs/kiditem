import { describe, expect, it } from 'vitest';
import { planMallPriceAdoption, type MallPriceCandidateProduct } from './sales-product-mall-prices';

function product(overrides: Partial<MallPriceCandidateProduct> = {}): MallPriceCandidateProduct {
  return {
    id: 'p-1',
    version: 3,
    options: [
      { id: 'o-blue', salePrice: 5_000, normalPrice: 6_000 },
      { id: 'o-big', salePrice: 5_500, normalPrice: 6_500 },
    ],
    ...overrides,
  };
}

/**
 * 몰 가격 채택은 판매 상품 옵션의 판매가를 몰에 걸린 값으로 맞춘다(KID-313 W2). 등록 대상은 가격을
 * 갖지 않으므로, 몰마다 다른 가격이면 하나를 고를 근거가 없다.
 */
describe('planMallPriceAdoption', () => {
  it('writes the observed mall price to each selling product option that differs', () => {
    const plan = planMallPriceAdoption({
      products: [product()],
      listingOptions: [
        { channelAccountId: 'acc-1', salesProductOptionId: 'o-blue', salePrice: 5_200 },
        { channelAccountId: 'acc-2', salesProductOptionId: 'o-blue', salePrice: 5_200 },
        { channelAccountId: 'acc-1', salesProductOptionId: 'o-big', salePrice: 6_100 },
      ],
    });

    expect(plan.conflicts).toEqual([]);
    expect(plan.writes).toEqual([{
      salesProductId: 'p-1',
      expectedVersion: 3,
      channelAccountIds: ['acc-1', 'acc-2'],
      optionPrices: [
        { salesProductOptionId: 'o-blue', salePrice: 5_200 },
        { salesProductOptionId: 'o-big', salePrice: 6_100 },
      ],
    }]);
  });

  it('counts a product whose options already carry the mall price as unchanged', () => {
    const plan = planMallPriceAdoption({
      products: [product()],
      listingOptions: [
        { channelAccountId: 'acc-1', salesProductOptionId: 'o-blue', salePrice: 5_000 },
        { channelAccountId: 'acc-1', salesProductOptionId: 'o-big', salePrice: 5_500 },
      ],
    });

    expect(plan).toEqual({ writes: [], conflicts: [], unchanged: 1 });
  });

  it('makes no plan for a product whose option sells at different prices in different malls', () => {
    const plan = planMallPriceAdoption({
      products: [product()],
      listingOptions: [
        { channelAccountId: 'acc-1', salesProductOptionId: 'o-blue', salePrice: 5_200 },
        { channelAccountId: 'acc-2', salesProductOptionId: 'o-blue', salePrice: 5_900 },
        { channelAccountId: 'acc-1', salesProductOptionId: 'o-big', salePrice: 6_100 },
      ],
    });

    expect(plan.writes).toEqual([]);
    expect(plan.conflicts).toEqual([{
      salesProductId: 'p-1',
      channelAccountIds: ['acc-1', 'acc-2'],
      reason: 'options_disagree',
      prices: [5_200, 5_900],
    }]);
  });

  it('ignores mall options without a price or without a selling product option', () => {
    const plan = planMallPriceAdoption({
      products: [product()],
      listingOptions: [
        { channelAccountId: 'acc-1', salesProductOptionId: 'o-blue', salePrice: null },
        { channelAccountId: 'acc-1', salesProductOptionId: 'someone-else', salePrice: 9_000 },
      ],
    });

    expect(plan).toEqual({ writes: [], conflicts: [], unchanged: 0 });
  });
});
