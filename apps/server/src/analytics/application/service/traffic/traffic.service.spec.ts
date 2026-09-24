import { KiditemNotFoundError } from '@kiditem/shared/errors';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrafficService } from './traffic.service';

const ORGANIZATION_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

function accountDaily(
  businessDate: string,
  metrics: Partial<{
    visitors: number;
    views: number;
    cartAdds: number;
    orders: number;
    salesQty: number;
    revenue: number;
  }> = {},
) {
  return {
    businessDate,
    observedAt: `${businessDate}T01:00:00.000Z`,
    sourceAttemptId: '00000000-0000-4000-8000-000000000010',
    providerConversionRate: null,
    visitors: metrics.visitors ?? 0,
    views: metrics.views ?? 0,
    cartAdds: metrics.cartAdds ?? 0,
    orders: metrics.orders ?? 0,
    salesQty: metrics.salesQty ?? 0,
    revenue: metrics.revenue ?? 0,
  };
}

function makeTrafficRead(
  rows: ReturnType<typeof accountDaily>[] = [],
  reconciliation?: Record<string, unknown>,
) {
  return {
    readPublished: vi.fn().mockResolvedValue({ accountDaily: rows, reconciliation }),
  };
}

function completeMayRows() {
  return Array.from({ length: 31 }, (_, index) => accountDaily(
    `2026-05-${String(index + 1).padStart(2, '0')}`,
    { visitors: 10, views: 20, cartAdds: 3, orders: 2, salesQty: 2, revenue: 100 },
  ));
}

function reconciliation(overrides: Record<string, unknown> = {}) {
  const base = {
    dailySum: 620,
    periodValue: 620,
  };
  return {
    views: { ...base },
    cartAdds: { ...base },
    orders: { ...base },
    salesQty: { ...base },
    revenue: { ...base },
    ...overrides,
  };
}

describe('TrafficService — owner-published Wing traffic reads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries monthly traffic with exact @db.Date calendar boundaries', async () => {
    const trafficRead = makeTrafficRead([accountDaily('2026-05-01', { revenue: 100 })]);
    const service = new TrafficService(trafficRead as never);

    await service.getMonthlyRevenue(2026, 5, ORGANIZATION_ID);

    expect(trafficRead.readPublished).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      from: '2026-05-01',
      to: '2026-05-31',
    });
  });

  it('reads a missing Coupang account (CHANNELS_ACCOUNT_NOT_FOUND) as no traffic yet', async () => {
    const trafficRead = { readPublished: vi.fn().mockRejectedValue(new KiditemNotFoundError('CHANNELS_ACCOUNT_NOT_FOUND')) };
    const service = new TrafficService(trafficRead as never);

    const result = await service.getMonthlyRevenue(2026, 5, ORGANIZATION_ID);

    expect(result.days).toEqual([]);
  });

  it('reads account daily metrics and leaves guessed Wing profit fields unavailable', async () => {
    const trafficRead = makeTrafficRead([
      accountDaily('2026-05-01', {
        visitors: 10,
        views: 20,
        orders: 1,
        salesQty: 1,
        revenue: 10_000,
      }),
    ]);
    const service = new TrafficService(trafficRead as never);

    const result = await service.getMonthlyRevenue(2026, 5, ORGANIZATION_ID);

    expect(result.days).toEqual([
      expect.objectContaining({ date: '2026-05-01', revenue: 10_000 }),
    ]);
    expect(result.total.visitors).toBeNull();
    expect(result).not.toHaveProperty('netProfit');
    expect(result).not.toHaveProperty('profitRate');
    expect(result).not.toHaveProperty('costCoverage');
  });

  it('keeps collected daily rows numeric but withholds period totals for incomplete coverage', async () => {
    const trafficRead = makeTrafficRead([
      accountDaily('2026-05-01', { orders: 2, revenue: 10_000 }),
    ]);
    const service = new TrafficService(trafficRead as never);

    const result = await service.getMonthlyRevenue(2026, 5, ORGANIZATION_ID);

    expect(result.days[0]).toMatchObject({ orders: 2, revenue: 10_000 });
    expect(result.total).toEqual({
      revenue: null,
      orders: null,
      salesQty: null,
      visitors: null,
      views: null,
      cartAdds: null,
    });
  });

  it('nulls only a mismatched additive metric and preserves reconciliation provenance', async () => {
    const publishedReconciliation = reconciliation({
      views: { dailySum: 620, periodValue: 999 },
      orders: { dailySum: 62, periodValue: null },
    });
    const trafficRead = makeTrafficRead(completeMayRows(), publishedReconciliation);
    const service = new TrafficService(trafficRead as never);

    const result = await service.getMonthlyRevenue(2026, 5, ORGANIZATION_ID);

    expect(result.total.views).toBeNull();
    expect(result.total.revenue).toBe(3_100);
    expect(result.total.orders).toBe(62);
    expect(result.total.salesQty).toBe(62);
    expect(result.reconciliation).toEqual(publishedReconciliation);
  });

  it('uses yesterday as the current-month cutoff and returns null totals for a future month', async () => {
    const trafficRead = makeTrafficRead();
    const service = new TrafficService(trafficRead as never);
    const today = new Date();
    const todayKst = new Date(today.getTime() + 9 * 60 * 60 * 1000);
    const year = todayKst.getUTCFullYear();
    const month = todayKst.getUTCMonth() + 1;
    const yesterday = new Date(Date.UTC(year, todayKst.getUTCMonth(), todayKst.getUTCDate() - 1));

    await service.getMonthlyRevenue(year, month, ORGANIZATION_ID);

    expect(trafficRead.readPublished).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      from: `${year}-${String(month).padStart(2, '0')}-01`,
      to: yesterday.toISOString().slice(0, 10),
    });

    const futureMonth = new Date(Date.UTC(year, todayKst.getUTCMonth() + 1, 1));
    trafficRead.readPublished.mockClear();
    const future = await service.getMonthlyRevenue(
      futureMonth.getUTCFullYear(),
      futureMonth.getUTCMonth() + 1,
      ORGANIZATION_ID,
    );
    expect(future.total).toEqual({
      revenue: null,
      orders: null,
      salesQty: null,
      visitors: null,
      views: null,
      cartAdds: null,
    });
    expect(trafficRead.readPublished).not.toHaveBeenCalled();
  });

});
