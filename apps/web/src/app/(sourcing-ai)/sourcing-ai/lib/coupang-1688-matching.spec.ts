import { describe, expect, it } from 'vitest';
import {
  build1688SearchUrl,
  buildCoupangImageSearchRows,
  buildImageSearchOffer,
  derive1688SearchQuery,
} from './coupang-1688-matching';
import type { TodayRecommendationRow } from '../recommendations/lib/today-recommendations';

describe('Coupang to 1688 image search matching', () => {
  it('derives a 1688 query from Coupang product signals', () => {
    expect(derive1688SearchQuery(row({ productName: '어린이 물총 대용량 장난감', primaryKeyword: '어린이 물총' })))
      .toBe('儿童水枪玩具');
    expect(build1688SearchUrl('儿童水枪玩具')).toContain('keywords=');
  });

  it('orders Coupang rows by 3-day sales before image search', () => {
    const rows = buildCoupangImageSearchRows({
      coupangRows: [
        row({ productId: 'low', productName: '초등 필통 귀여운 문구', primaryKeyword: '초등 필통', salesLast3d: 3, score: 98 }),
        row({ productId: 'high', productName: '키즈 선글라스 UV 차단', primaryKeyword: '키즈 선글라스', salesLast3d: 22, score: 70 }),
      ],
    });

    expect(rows[0].coupangProduct.productId).toBe('high');
    expect(rows[0].searchQuery).toBe('儿童太阳镜');
    expect(rows[0].targetSalePriceKrw).toBe(15900);
  });

  it('builds margin estimates from an image-search result', () => {
    const offer = buildImageSearchOffer({
      title: '儿童太阳镜 UV 防晒',
      priceCny: 6.2,
      sourceUrl: 'https://detail.1688.com/offer/1.html',
      imageUrl: 'https://img.example/1.jpg',
      score: 82.4,
    }, 12900);

    expect(offer.matchScore).toBe(82);
    expect(offer.landedCostKrw).toBeGreaterThan(0);
    expect(offer.estimatedProfitKrw).toBeGreaterThan(0);
    expect(offer.estimatedMarginRate).toBeGreaterThan(0);
  });
});

function row(overrides: Partial<TodayRecommendationRow>): TodayRecommendationRow {
  return {
    productId: 'p1',
    itemId: 'i1',
    vendorItemId: 'v1',
    productName: '기본 상품',
    itemName: null,
    brandName: null,
    manufacture: null,
    categoryHierarchy: null,
    imagePath: null,
    salePrice: 15900,
    rating: 5,
    ratingCount: 20,
    pvLast28Day: 3000,
    salesLast28d: 200,
    estimatedRevenue28d: 3180000,
    conversionRate28d: 0.06,
    deliveryInfo: null,
    keywords: ['키즈'],
    primaryKeyword: '키즈',
    score: 80,
    grade: 'A',
    reasons: [],
    risks: [],
    lowReviewSalesPower: 4,
    marketReactionSignal: 60,
    newEntrySignal: 40,
    salesLast3d: 22,
    pvLast3d: 450,
    threeDaySalesTracked: true,
    threeDayTrackingDays: 3,
    salesDelta: 22,
    viewDelta: 450,
    reviewDelta: 1,
    ...overrides,
  };
}
