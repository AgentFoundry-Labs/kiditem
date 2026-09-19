import { describe, expect, it } from 'vitest';
import { planMallPriceAdoption, type MallPriceCandidateProduct } from './sales-product-mall-prices';

const memo: MallPriceCandidateProduct = {
  id: 'p-memo',
  salePrice: 2220,
  options: [{ id: 'o-memo', extraPrice: 0 }],
  overrides: [{ channelAccountId: 'acc-smart', salePrice: 1930, priceRateBp: null }],
};

const pad: MallPriceCandidateProduct = {
  id: 'p-pad',
  salePrice: 5000,
  options: [{ id: 'o-blue', extraPrice: 0 }, { id: 'o-big', extraPrice: 500 }],
  overrides: [{ channelAccountId: 'acc-kakao', salePrice: null, priceRateBp: 11000 }],
};

describe('planMallPriceAdoption', () => {
  it('sets the per-mall price to what the mall charges, leaving matching malls alone', () => {
    const plan = planMallPriceAdoption({
      products: [memo, pad],
      listingOptions: [
        // 스마트스토어 몰 상품 둘이 모두 3,500 → 몰별 판매가 1,930 을 3,500 으로.
        { channelAccountId: 'acc-smart', salesProductOptionId: 'o-memo', salePrice: 3500 },
        { channelAccountId: 'acc-smart', salesProductOptionId: 'o-memo', salePrice: 3500 },
        // 11번가는 판매가 그대로라 바꿀 것이 없다.
        { channelAccountId: 'acc-11st', salesProductOptionId: 'o-memo', salePrice: 2220 },
        // 카카오 110% = 5,500, 큰 옵션 +500 = 6,000 → 몰도 그대로.
        { channelAccountId: 'acc-kakao', salesProductOptionId: 'o-blue', salePrice: 5500 },
        { channelAccountId: 'acc-kakao', salesProductOptionId: 'o-big', salePrice: 6000 },
        // 옵션마다 맞출 값이 다르면 고르지 않는다.
        { channelAccountId: 'acc-lotte', salesProductOptionId: 'o-blue', salePrice: 5200 },
        { channelAccountId: 'acc-lotte', salesProductOptionId: 'o-big', salePrice: 5900 },
        // 몰 가격을 모르면 넘긴다.
        { channelAccountId: 'acc-gs', salesProductOptionId: 'o-blue', salePrice: null },
      ],
    });
    expect(plan.writes).toEqual([{ salesProductId: 'p-memo', channelAccountId: 'acc-smart', salePrice: 3500 }]);
    expect(plan.unchanged).toBe(2);
    expect(plan.conflicts).toEqual([
      { salesProductId: 'p-pad', channelAccountId: 'acc-lotte', reason: 'options_disagree', prices: [5200, 5400] },
    ]);
  });
});
