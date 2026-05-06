import { describe, expect, it } from 'vitest';
import { gradeOf, rankOf, scoreOf, strategyOf, type GradeMap } from './abc-grading';
import type { ProductListItem } from './product-types';

function product(overrides: Partial<ProductListItem>): ProductListItem {
  return {
    id: 'product-1',
    name: '상품',
    sku: 'SKU-1',
    category: null,
    company: null,
    listingId: 'listing-1',
    coupangProductId: 'external-1',
    thumbnailUrl: null,
    imageUrl: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    costPrice: 0,
    sellPrice: 0,
    commissionRate: 0,
    shippingCost: 0,
    revenue: 0,
    netProfit: 0,
    profitRate: 0,
    adRate: 0,
    adTier: null,
    isAdvertising: false,
    isCostMissing: true,
    inventoryId: null,
    optionId: null,
    currentStock: 0,
    reservedStock: 0,
    availableStock: 0,
    safetyStock: 0,
    reorderPoint: 0,
    reorderQuantity: 0,
    leadTimeDays: null,
    dailySalesAvg: 0,
    optimalStock: 0,
    recommendedOrderQty: 0,
    daysUntilStockout: null,
    stockStatus: 'out',
    stockAction: 'sold_out_required',
    status: 'unknown',
    abcGrade: null,
    gradeScore: null,
    gradeRank: 0,
    prevGradeRank: null,
    gradeStrategy: '',
    healthScore: null,
    reviewCount: 0,
    orderCount: 0,
    thumbnailCTR: 0,
    traffic: {
      visitors: 0,
      views: 0,
      cartAdds: 0,
      orders: 0,
      salesQty: 0,
      revenue: 0,
      conversionRate: 0,
    },
    t14: {
      visitors: 0,
      views: 0,
      cartAdds: 0,
      orders: 0,
      salesQty: 0,
      revenue: 0,
      conversionRate: 0,
    },
    t14prev: {
      visitors: 0,
      views: 0,
      cartAdds: 0,
      orders: 0,
      salesQty: 0,
      revenue: 0,
      conversionRate: 0,
    },
    ...overrides,
  };
}

describe('abc grading display helpers', () => {
  it('shows channel-unlinked products as pending instead of A/B/C', () => {
    const gradeMap: GradeMap = new Map([
      ['product-1', { grade: 'B', score: 50, rank: 2, prevRank: null, strategy: 'watch' }],
    ]);
    const unlinked = product({ listingId: null, abcGrade: 'A', gradeScore: 90, gradeRank: 1 });

    expect(gradeOf(unlinked, gradeMap)).toBe('평가대기');
    expect(scoreOf(unlinked, gradeMap)).toBe(0);
    expect(rankOf(unlinked, gradeMap)).toBe(0);
    expect(strategyOf(unlinked, gradeMap)).toBe('채널 연결 후 성과 평가 가능');
  });
});
