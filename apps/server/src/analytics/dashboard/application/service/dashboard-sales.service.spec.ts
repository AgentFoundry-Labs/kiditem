import { describe, expect, it, vi } from 'vitest';
import { buildDashboardContext } from '../../domain/context';
import { DashboardSalesService } from './dashboard-sales.service';
import {
  buildMockDashboardSalesRepo,
  buildMockProfitCalculationRepo,
  buildMockWingAdSummaryRepo,
  buildMockWingTrafficAggregationRepo,
} from '../../__tests__/test-helpers/build-mock-ports';

const ORGANIZATION_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

describe('DashboardSalesService collected Coupang ad spend', () => {
  it('월/기간 순이익과 상세 비용에 수집한 광고비를 반영한다', async () => {
    const profit = buildMockProfitCalculationRepo();
    profit.calculateForRange.mockResolvedValue({
      revenue: 100_000,
      costOfGoods: 50_000,
      commission: 0,
      shippingCost: 0,
      adCost: 10_000,
      otherCost: 0,
      netProfit: 40_000,
      profitRate: 40,
      orderCount: 2,
      adRevenue: 0,
      adImpressions: 0,
      adClicks: 0,
      adConversions: 0,
    });

    const wingAds = buildMockWingAdSummaryRepo();
    wingAds.fetchCurrentMonthSummary.mockResolvedValue(null);

    const sales = buildMockDashboardSalesRepo();
    sales.fetchTodayKpis.mockResolvedValue({ revenue: 0, orders: 0 });
    sales.fetchTopProducts.mockResolvedValue([]);
    sales.fetchDailyRevenue.mockResolvedValue([]);

    const wing = buildMockWingTrafficAggregationRepo();
    wing.aggregateTraffic.mockResolvedValue({
      revenue: 0,
      orders: 0,
      salesQty: 0,
      visitors: 0,
      views: 0,
      cartAdds: 0,
      conversionRate: 0,
      hasData: false,
      lastObservedAt: null,
    });
    wing.aggregateCoupangAds.mockResolvedValue({
      spend: 30_000,
      revenue: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      orders: 0,
      hasData: true,
      lastObservedAt: new Date('2026-07-18T00:00:00.000Z'),
    });
    wing.findLatestDataDate.mockResolvedValue(null);

    const rocket = {
      findLatestDataDate: vi.fn().mockResolvedValue(null),
      aggregateRevenue: vi.fn().mockResolvedValue({
        revenue: 0,
        poCount: 0,
        itemQty: 0,
        hasData: false,
        lastObservedAt: null,
      }),
      fetchDaily: vi.fn().mockResolvedValue([]),
      fetchOrdersForDate: vi.fn().mockResolvedValue([]),
      fetchOrders: vi.fn().mockResolvedValue([]),
    };

    const service = new DashboardSalesService(
      profit,
      wingAds,
      sales,
      wing,
      rocket,
    );
    const result = await service.getSummary(
      buildDashboardContext('month', undefined, undefined, new Date('2026-07-18T03:00:00.000Z')),
      ORGANIZATION_ID,
    );

    expect(result.monthly.profit).toBe(20_000);
    expect(result.rangeKpi?.profit).toBe(20_000);
    expect(result.rangeKpi?.profitRate).toBe(20);
    expect(result.profitDetail).toEqual(expect.objectContaining({
      adCost: 30_000,
      netProfit: 20_000,
    }));
  });
});
