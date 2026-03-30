import { describe, it, expect } from 'vitest';
import { buildContext } from './build-context';

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    companyId: 'c1',
    name: 'Test',
    costPrice: 3000,
    sellPrice: 5000,
    abcGrade: 'B',
    adTier: null,
    inventory: { currentStock: 50, reorderPoint: 10, dailySalesAvg: 3 },
    profitLoss: [{ revenue: 100000, netProfit: 5000, profitRate: 0.1, adCost: 5000, orderCount: 30, returnCount: 1 }],
    ads: [{ spend: 5000 }],
    reviews: [{ id: 'rv1' }, { id: 'rv2' }],
    thumbnails: [{ ctr: 0.035 }],
    ...overrides,
  } as any;
}

describe('buildContext', () => {
  it('builds full context from complete data', () => {
    const ctx = buildContext(makeProduct());
    expect(ctx.profitRate).toBe(10);
    expect(ctx.revenue).toBe(100000);
    expect(ctx.currentStock).toBe(50);
    expect(ctx.reviewCount).toBe(2);
    expect(ctx.thumbnailCTR).toBeCloseTo(3.5, 1);
    expect(ctx.daysOfStock).toBeCloseTo(16.67, 1);
  });

  it('returns null for profit fields when no profitLoss', () => {
    const ctx = buildContext(makeProduct({ profitLoss: [] }));
    expect(ctx.profitRate).toBeNull();
    expect(ctx.revenue).toBeNull();
    expect(ctx.netProfit).toBeNull();
    expect(ctx.adRate).toBeNull();
    expect(ctx.orderCount).toBeNull();
    expect(ctx.cancelRate).toBeNull();
  });

  it('returns null for thumbnailCTR when no thumbnails', () => {
    const ctx = buildContext(makeProduct({ thumbnails: [] }));
    expect(ctx.thumbnailCTR).toBeNull();
  });

  it('returns daysOfStock=0 when currentStock=0', () => {
    const ctx = buildContext(makeProduct({
      inventory: { currentStock: 0, reorderPoint: 10, dailySalesAvg: 3 },
    }));
    expect(ctx.daysOfStock).toBe(0);
  });

  it('returns daysOfStock=999 when avgDailySales=0 and stock>0', () => {
    const ctx = buildContext(makeProduct({
      inventory: { currentStock: 50, reorderPoint: 10, dailySalesAvg: 0 },
    }));
    expect(ctx.daysOfStock).toBe(999);
  });

  it('returns null margin when sellPrice=0', () => {
    const ctx = buildContext(makeProduct({ sellPrice: 0 }));
    expect(ctx.margin).toBeNull();
    expect(ctx.costRate).toBeNull();
  });

  it('handles Decimal toNumber() for profitRate', () => {
    const ctx = buildContext(makeProduct({
      profitLoss: [{ revenue: 100000, netProfit: 5000, profitRate: { toNumber: () => 0.15 }, adCost: 5000, orderCount: 30, returnCount: 1 }],
    }));
    expect(ctx.profitRate).toBe(15);
  });
});
