import { describe, expect, it } from 'vitest';
import { buildCoupangImageSearchRows } from './coupang-1688-matching';
import { toTodayRecommendationRow } from './sourcing-recommendation-presenter';
import type { SourcingRecommendationItem } from '@kiditem/shared/sourcing';

describe('sourcing recommendation presenter', () => {
  it('preserves the exact Wing product, item, and vendor identity for owner operations', () => {
    const item = {
      itemKey: 'a'.repeat(64),
      sourcePlatform: 'coupang',
      externalOfferId: '8835050121',
      variantKey: '92734234062',
      rank: 1,
      score: 90,
      grade: 'A',
      baselineAction: 'order',
      reasonCodes: [],
      riskCodes: [],
      displayName: '쿠팡 유아 우산',
      keyword: '유아 우산',
      isNewKeyword: false,
      imageUrl: null,
      sourceUrl: null,
      overseasPriceCny: null,
      overseasPriceKrw: null,
      salePriceKrw: 15_900,
      supplierName: null,
      monthlySales: null,
      repurchaseRate: null,
      tradeScore: null,
      minOrderQuantity: null,
      estimatedMarginRate: null,
      estimatedProfitKrw: null,
      shippingLabel: null,
      rating: null,
      tags: [],
      sourceKeywords: ['유아 우산'],
      offerObservationIds: [],
      evidenceObservationIds: [],
      scoreComponents: {},
      coupang: {
        productId: '8835050121',
        itemId: '25745879681',
        vendorItemId: '92734234062',
        productName: '쿠팡 유아 우산',
        salePriceKrw: 15_900,
        ratingCount: null,
        ratingAverage: null,
        viewsLast28d: null,
        salesLast28d: null,
      },
      interest: null,
      contributingSources: ['coupang_competitor'],
    } as unknown as SourcingRecommendationItem;

    const row = toTodayRecommendationRow(item);
    expect(row).toMatchObject({
      productId: '8835050121',
      itemId: '25745879681',
      vendorItemId: '92734234062',
    });
    expect(buildCoupangImageSearchRows({ coupangRows: [row] })[0]?.id)
      .toBe('8835050121:25745879681:92734234062');
  });
});
