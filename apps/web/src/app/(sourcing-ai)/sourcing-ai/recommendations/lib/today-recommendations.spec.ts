import { describe, expect, it } from 'vitest';
import {
  appendProductSnapshots,
  buildProductTrackingSummary,
  buildRecommendationSummary,
  buildRisingKeywordOpportunities,
  buildTodayRecommendationRows,
  mergeTodayRecommendationRows,
  snapshotsToMap,
  type ProductSnapshot,
} from './today-recommendations';

describe('today recommendations scoring', () => {
  it('grades low-review products with sales reaction as strong recommendations', () => {
    const rows = buildTodayRecommendationRows({
      keyword: '슬라임',
      products: [
        {
          productId: 'p1',
          itemId: 'i1',
          vendorItemId: 'v1',
          productName: '신상 말랑 슬라임',
          itemName: null,
          brandName: null,
          manufacture: null,
          categoryHierarchy: null,
          imagePath: null,
          salePrice: 15900,
          rating: 5,
          ratingCount: 32,
          pvLast28Day: 8200,
          salesLast28d: 420,
          estimatedRevenue28d: 6678000,
          conversionRate28d: 0.051,
          deliveryInfo: null,
        },
      ],
    });

    expect(rows[0].grade).toBe('A');
    expect(rows[0].salesLast3d).toBe(45);
    expect(rows[0].threeDaySalesTracked).toBe(false);
    expect(rows[0].reasons).toContain('저리뷰인데 판매 발생');
  });

  it('uses prior snapshots to reward growth signals', () => {
    const previous: ProductSnapshot = {
      productId: 'p1',
      itemId: 'i1',
      vendorItemId: 'v1',
      productName: '신상 말랑 슬라임',
      salesLast28d: 10,
      pvLast28Day: 1000,
      ratingCount: 2,
      salePrice: 15900,
      capturedAt: Date.now() - 24 * 60 * 60 * 1000,
    };

    const [row] = buildTodayRecommendationRows({
      keyword: '슬라임',
      previousSnapshots: snapshotsToMap([previous]),
      products: [
        {
          ...previous,
          brandName: null,
          manufacture: null,
          categoryHierarchy: null,
          imagePath: null,
          itemName: null,
          rating: 5,
          salesLast28d: 40,
          pvLast28Day: 1800,
          ratingCount: 8,
          estimatedRevenue28d: 636000,
          conversionRate28d: 0.022,
          deliveryInfo: null,
        },
      ],
    });

    expect(row.salesDelta).toBe(30);
    expect(row.salesLast3d).toBe(30);
    expect(row.threeDaySalesTracked).toBe(true);
    expect(row.reasons).toContain('3일 추적 판매 증가');
  });

  it('deduplicates the same product across keywords and summarizes grades', () => {
    const base = buildTodayRecommendationRows({
      keyword: '키즈 장난감',
      products: [
        {
          productId: 'p1',
          itemId: 'i1',
          vendorItemId: 'v1',
          productName: '신상 장난감',
          itemName: null,
          brandName: null,
          manufacture: null,
          categoryHierarchy: null,
          imagePath: null,
          salePrice: 12900,
          rating: 5,
          ratingCount: 20,
          pvLast28Day: 5000,
          salesLast28d: 250,
          estimatedRevenue28d: 3225000,
          conversionRate28d: 0.05,
          deliveryInfo: null,
        },
      ],
    });
    const duplicate = buildTodayRecommendationRows({ keyword: '완구', products: [base[0]] });
    const merged = mergeTodayRecommendationRows([...base, ...duplicate]);

    expect(merged).toHaveLength(1);
    expect(merged[0].keywords).toEqual(['키즈 장난감', '완구']);
    expect(buildRecommendationSummary(merged).aCount).toBe(1);
  });

  it('ranks keywords by verified three-day Wing product reaction', () => {
    const strong = buildTodayRecommendationRows({
      keyword: '뜨는 슬라임',
      products: [
        {
          productId: 'p1',
          itemId: 'i1',
          vendorItemId: 'v1',
          productName: '저리뷰 반응 슬라임',
          itemName: null,
          brandName: null,
          manufacture: null,
          categoryHierarchy: null,
          imagePath: null,
          salePrice: 14900,
          rating: 5,
          ratingCount: 12,
          pvLast28Day: 3000,
          salesLast28d: 180,
          estimatedRevenue28d: 2682000,
          conversionRate28d: 0.06,
          deliveryInfo: null,
        },
      ],
    });
    const weak = buildTodayRecommendationRows({
      keyword: '약한 키워드',
      products: [
        {
          productId: 'p2',
          itemId: 'i2',
          vendorItemId: 'v2',
          productName: '반응 약한 상품',
          itemName: null,
          brandName: null,
          manufacture: null,
          categoryHierarchy: null,
          imagePath: null,
          salePrice: 14900,
          rating: 5,
          ratingCount: 700,
          pvLast28Day: 500,
          salesLast28d: 8,
          estimatedRevenue28d: 119200,
          conversionRate28d: 0.016,
          deliveryInfo: null,
        },
      ],
    });

    const opportunities = buildRisingKeywordOpportunities([...strong, ...weak]);

    expect(opportunities[0].keyword).toBe('뜨는 슬라임');
    expect(opportunities[0].reasons).toContain('저리뷰 판매 상품 존재');
  });

  it('preserves first seen time while appending product tracking snapshots', () => {
    const firstSeenAt = 100000;
    const secondSeenAt = firstSeenAt + 2 * 24 * 60 * 60 * 1000;
    const rows = buildTodayRecommendationRows({
      keyword: '키즈 물총',
      products: [
        {
          productId: 'p1',
          itemId: 'i1',
          vendorItemId: 'v1',
          productName: '키즈 물총',
          itemName: null,
          brandName: null,
          manufacture: null,
          categoryHierarchy: null,
          imagePath: null,
          salePrice: 12900,
          rating: 5,
          ratingCount: 22,
          pvLast28Day: 4200,
          salesLast28d: 180,
          estimatedRevenue28d: 2322000,
          conversionRate28d: 0.043,
          deliveryInfo: null,
        },
      ],
    });

    const initialSnapshots = appendProductSnapshots(rows, [], firstSeenAt);
    const updatedSnapshots = appendProductSnapshots(rows, initialSnapshots, secondSeenAt);
    const summary = buildProductTrackingSummary(rows, updatedSnapshots, secondSeenAt);
    const opportunities = buildRisingKeywordOpportunities(rows, {
      snapshots: updatedSnapshots,
      now: secondSeenAt,
    });

    expect(updatedSnapshots[0].firstSeenAt).toBe(firstSeenAt);
    expect(updatedSnapshots[0].lastSeenAt).toBe(secondSeenAt);
    expect(summary.recentNewProductCount).toBe(1);
    expect(opportunities[0].recentNewProductCount).toBe(1);
  });
});
