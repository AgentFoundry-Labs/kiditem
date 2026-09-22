import { describe, expect, it } from 'vitest';
import { planSalesProductListingLinks, type LinkCandidateListing, type LinkCandidateProduct } from './sales-product-links';

const SKU = { masterProductId: 'sku-1', quantity: 1 };

const products: LinkCandidateProduct[] = [
  { id: 'p-umbrella', code: '100017', ownCode: null, options: [{ id: 'o-umbrella', supplyStatus: 'selling', components: [SKU] }] },
  {
    id: 'p-pad',
    code: '100300',
    ownCode: '7400090026127',
    options: [
      { id: 'o-blue', supplyStatus: 'selling', components: [] },
      { id: 'o-yellow', supplyStatus: 'selling', components: [] },
    ],
  },
  { id: 'p-dup-a', code: '100400', ownCode: 'SAME', options: [] },
  { id: 'p-dup-b', code: '100401', ownCode: 'SAME', options: [] },
];

function listing(overrides: Partial<LinkCandidateListing>): LinkCandidateListing {
  return {
    id: 'l',
    channel: 'boribori',
    externalId: '438217859',
    source: 'mall_admin_listings',
    sabangnetProductNo: null,
    sellerCode: null,
    salesProductId: null,
    options: [{ id: 'co', salesProductOptionId: null, hasRecipe: false }],
    ...overrides,
  };
}

describe('planSalesProductListingLinks', () => {
  it('links a Sabangnet record by its goods number and fills the empty recipe of a single option', () => {
    const plan = planSalesProductListingLinks({
      listings: [listing({ id: 'l1', source: 'sabangnet_mall_listings', sabangnetProductNo: '100017' })],
      products,
      sendRecords: [],
    });
    expect(plan.listingLinks).toEqual([{ channelListingId: 'l1', salesProductId: 'p-umbrella' }]);
    expect(plan.optionLinks).toEqual([{ channelListingOptionId: 'co', salesProductOptionId: 'o-umbrella' }]);
    expect(plan.recipeFills).toEqual([{ channelListingOptionId: 'co', components: [SKU] }]);
    expect(plan.summary.bySource.sabangnet_record).toBe(1);
  });

  it('links through the send-record file, including ESM site_master codes, and a unique seller code', () => {
    const plan = planSalesProductListingLinks({
      listings: [
        listing({ id: 'l2', channel: 'gmarket', externalId: '2345678901_998877' }),
        listing({ id: 'l3', channel: 'smartstore', externalId: '11', sellerCode: '7400090026127' }),
        listing({ id: 'l4', channel: 'kakao', externalId: '22', sellerCode: 'SAME' }),
      ],
      products,
      sendRecords: [{ mallKey: 'gmarket', mallProductCode: '2345678901', goodsNo: '100017' }],
    });
    expect(plan.listingLinks).toEqual([
      { channelListingId: 'l2', salesProductId: 'p-umbrella' },
      { channelListingId: 'l3', salesProductId: 'p-pad' },
    ]);
    // 옵션 둘인 판매상품과 옵션 하나인 몰 상품은 옵션을 잇지 않는다. 겹치는 자체상품코드는 근거가 아니다.
    expect(plan.optionLinks.map((link) => link.channelListingOptionId)).toEqual(['co']);
  });

  it('never overrides an existing link and reports evidence that disagrees as a conflict', () => {
    const plan = planSalesProductListingLinks({
      listings: [
        listing({ id: 'l5', source: 'sabangnet_mall_listings', sabangnetProductNo: '100017', salesProductId: 'p-pad' }),
        listing({ id: 'l6', source: 'sabangnet_mall_listings', sabangnetProductNo: '100017', sellerCode: '7400090026127' }),
        listing({
          id: 'l7',
          source: 'sabangnet_mall_listings',
          sabangnetProductNo: '100017',
          salesProductId: 'p-umbrella',
          options: [{ id: 'co7', salesProductOptionId: 'o-umbrella', hasRecipe: true }],
        }),
      ],
      products,
      sendRecords: [],
    });
    expect(plan.listingLinks).toEqual([]);
    expect(plan.summary).toMatchObject({ conflicts: 2, alreadyLinked: 1 });
    expect(plan.recipeFills).toEqual([]);
  });
});
