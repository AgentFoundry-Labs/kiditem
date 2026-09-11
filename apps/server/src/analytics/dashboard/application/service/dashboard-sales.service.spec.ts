import { describe, expect, it } from 'vitest';
import { buildDashboardContext } from '../../domain/context';
import {
  buildMockDashboardSalesRepo,
  buildMockProfitCalculationRepo,
  buildMockWingAdSummaryRepo,
  buildMockWingTrafficAggregationRepo,
  buildProfitSourceCoverage,
} from '../../__tests__/test-helpers/build-mock-ports';
import { DashboardSalesService } from './dashboard-sales.service';

const ORGANIZATION_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

describe('DashboardSalesService collected Coupang ad spend', () => {
  it('does not replace the order-backed Today card with yesterday Wing data', async () => {
    const profit = buildMockProfitCalculationRepo();
    profit.calculateForRange.mockImplementation(async (_organizationId, period) => ({
      revenue: 0,
      costOfGoods: 0,
      commission: 0,
      shippingCost: 0,
      adCost: 0,
      otherCost: 0,
      netProfit: 0,
      profitRate: 0,
      orderCount: 0,
      adRevenue: 0,
      adImpressions: 0,
      adClicks: 0,
      adConversions: 0,
      // No order row was admitted; the ad source published a collected zero
      // for every date, which is what makes the zero profit computable.
      costComplete: true,
      costIncompleteReasons: [],
      adEvidenceComplete: true,
      sourceCoverage: buildProfitSourceCoverage(period, { orders: false }),
    }));
    const wingAds = buildMockWingAdSummaryRepo();
    wingAds.fetchCurrentMonthSummary.mockResolvedValue(null);
    const sales = buildMockDashboardSalesRepo();
    sales.fetchTodayKpis.mockResolvedValue({ revenue: 0, orders: 0 });
    sales.fetchTopProducts.mockResolvedValue([]);
    const wing = buildMockWingTrafficAggregationRepo();
    wing.aggregateTraffic.mockResolvedValue({
      revenue: 999_000,
      orders: 99,
      salesQty: 99,
      visitors: 10,
      views: 20,
      cartAdds: 2,
      conversionRate: 495,
      dailyAverageVisitors: 10,
      providerConversionRate: null,
      isCollected: true,
      hasData: true,
      coverage: {
        from: '2026-09-07',
        to: '2026-09-07',
        targetDays: 1,
        completedDays: 1,
        missingDates: [],
      },
      reconciliation: null,
      exactPeriodEvidence: null,
      lastObservedAt: new Date('2026-09-08T01:00:00.000Z'),
    });
    wing.aggregateCoupangAds.mockResolvedValue({
      spend: 0,
      revenue: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      orders: 0,
      conversionRate: null,
      providerConversionRate: null,
      coverage: null,
      isCollected: false,
      hasData: false,
      lastObservedAt: null,
    });
    wing.findLatestDataDate.mockResolvedValue(null);

    const service = new DashboardSalesService(profit, wingAds, sales, wing);
    const result = await service.getSummary(
      buildDashboardContext('day', undefined, undefined, new Date('2026-09-08T00:30:00.000Z')),
      ORGANIZATION_ID,
    );

    expect(result.today).toEqual({ revenue: 0, orders: 0 });
  });

  it('월/기간 순이익과 상세 비용에 수집한 광고비를 반영한다', async () => {
    const profit = buildMockProfitCalculationRepo();
    profit.calculateForRange.mockImplementation(async (_organizationId, period) => ({
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
      // Order revenue and collected ad spend: both sources cover the window.
      costComplete: true,
      costIncompleteReasons: [],
      adEvidenceComplete: true,
      sourceCoverage: buildProfitSourceCoverage(period),
    }));

    const wingAds = buildMockWingAdSummaryRepo();
    wingAds.fetchCurrentMonthSummary.mockResolvedValue(null);

    const sales = buildMockDashboardSalesRepo();
    sales.fetchTodayKpis.mockResolvedValue({ revenue: 0, orders: 0 });
    sales.fetchTopProducts.mockResolvedValue([]);

    const wing = buildMockWingTrafficAggregationRepo();
    wing.aggregateTraffic.mockResolvedValue({
      revenue: 0,
      orders: 0,
      salesQty: 0,
      visitors: 0,
      views: 0,
      cartAdds: 0,
      conversionRate: 0,
      isCollected: false,
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
      conversionRate: null,
      providerConversionRate: null,
      coverage: null,
      isCollected: true,
      hasData: true,
      lastObservedAt: new Date('2026-07-18T00:00:00.000Z'),
    });
    wing.findLatestDataDate.mockResolvedValue(null);

    const service = new DashboardSalesService(
      profit,
      wingAds,
      sales,
      wing,
    );
    const result = await service.getSummary(
      buildDashboardContext('month', undefined, undefined, new Date('2026-07-18T03:00:00.000Z')),
      ORGANIZATION_ID,
    );

    expect(result.monthly.profit).toBe(20_000);
    expect(result.monthly.revenue).toBe(100_000);
    expect(result.monthly).not.toHaveProperty('rocketRevenue');
    expect(result.rangeKpi?.profit).toBe(20_000);
    expect(result.rangeKpi?.profitRate).toBe(20);
    expect(result.profitDetail).toEqual(expect.objectContaining({
      adCost: 30_000,
      netProfit: 20_000,
    }));
    expect(result.trafficKpi).toEqual(expect.objectContaining({
      trafficAvailable: false,
      trafficObservedAt: null,
    }));
  });

  it('surfaces account-daily averages, orders/views CVR, provider provenance, and coverage', async () => {
    const profit = buildMockProfitCalculationRepo();
    profit.calculateForRange.mockImplementation(async (_organizationId, period) => ({
      revenue: 0,
      costOfGoods: 0,
      commission: 0,
      shippingCost: 0,
      adCost: 0,
      otherCost: 0,
      netProfit: 0,
      profitRate: 0,
      orderCount: 0,
      adRevenue: 0,
      adImpressions: 0,
      adClicks: 0,
      adConversions: 0,
      // No order row was admitted; the ad source published a collected zero
      // for every date, which is what makes the zero profit computable.
      costComplete: true,
      costIncompleteReasons: [],
      adEvidenceComplete: true,
      sourceCoverage: buildProfitSourceCoverage(period, { orders: false }),
    }));
    const wingAds = buildMockWingAdSummaryRepo();
    wingAds.fetchCurrentMonthSummary.mockResolvedValue(null);
    const sales = buildMockDashboardSalesRepo();
    sales.fetchTodayKpis.mockResolvedValue({ revenue: 0, orders: 0 });
    sales.fetchTopProducts.mockResolvedValue([]);
    const wing = buildMockWingTrafficAggregationRepo();
    wing.aggregateTraffic.mockResolvedValue({
      revenue: 206_770,
      orders: 31,
      salesQty: 92,
      visitors: 165,
      views: 678,
      cartAdds: 76,
      conversionRate: (31 / 678) * 100,
      dailyAverageVisitors: 165,
      providerConversionRate: 4.58,
      sourceAttemptId: '11111111-1111-4111-8111-111111111111',
      isCollected: true,
      hasData: true,
      lastObservedAt: new Date('2026-09-04T01:00:00.000Z'),
      coverage: {
        from: '2026-09-01',
        to: '2026-09-03',
        targetDays: 3,
        completedDays: 3,
        missingDates: [],
      },
      reconciliation: {
        views: { status: 'UNVERIFIED', dailySum: 678, periodValue: null },
        cartAdds: { status: 'UNVERIFIED', dailySum: 76, periodValue: null },
        orders: { status: 'UNVERIFIED', dailySum: 31, periodValue: null },
        salesQty: { status: 'UNVERIFIED', dailySum: 92, periodValue: null },
        revenue: { status: 'UNVERIFIED', dailySum: 206_770, periodValue: null },
      },
      exactPeriodEvidence: null,
    });
    wing.aggregateCoupangAds.mockResolvedValue({
      spend: 0,
      revenue: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      orders: 0,
      conversionRate: null,
      providerConversionRate: null,
      coverage: null,
      isCollected: false,
      hasData: false,
      lastObservedAt: null,
    });
    wing.findLatestDataDate.mockResolvedValue(new Date('2026-09-03T00:00:00.000Z'));

    const service = new DashboardSalesService(profit, wingAds, sales, wing);
    const result = await service.getSummary(
      buildDashboardContext('month', undefined, undefined, new Date('2026-09-08T03:00:00.000Z')),
      ORGANIZATION_ID,
    );

    expect(result.trafficKpi).toEqual(expect.objectContaining({
      visitors: 165,
      dailyAverageVisitors: 165,
      views: 678,
      orders: 31,
      salesQty: 92,
      revenue: 206_770,
      cartAdds: 76,
      conversionRate: (31 / 678) * 100,
      providerConversionRate: 4.58,
      coverage: expect.objectContaining({ completedDays: 3, targetDays: 3 }),
      reconciliation: expect.objectContaining({
        revenue: { status: 'UNVERIFIED', dailySum: 206_770, periodValue: null },
      }),
    }));
  });

  it('does not use a partial account range for full-period revenue or traffic values', async () => {
    const profit = buildMockProfitCalculationRepo();
    profit.calculateForRange.mockImplementation(async (_organizationId, period) => ({
      revenue: 0,
      costOfGoods: 0,
      commission: 0,
      shippingCost: 0,
      adCost: 0,
      otherCost: 0,
      netProfit: 0,
      profitRate: 0,
      orderCount: 0,
      adRevenue: 0,
      adImpressions: 0,
      adClicks: 0,
      adConversions: 0,
      // No order row was admitted; the ad source published a collected zero
      // for every date, which is what makes the zero profit computable.
      costComplete: true,
      costIncompleteReasons: [],
      adEvidenceComplete: true,
      sourceCoverage: buildProfitSourceCoverage(period, { orders: false }),
    }));
    const wingAds = buildMockWingAdSummaryRepo();
    wingAds.fetchCurrentMonthSummary.mockResolvedValue(null);
    const sales = buildMockDashboardSalesRepo();
    sales.fetchTodayKpis.mockResolvedValue({ revenue: 0, orders: 0 });
    sales.fetchTopProducts.mockResolvedValue([]);
    const wing = buildMockWingTrafficAggregationRepo();
    wing.aggregateTraffic.mockResolvedValue({
      revenue: 500,
      orders: 5,
      salesQty: 5,
      visitors: 25,
      views: 50,
      cartAdds: 5,
      conversionRate: 10,
      dailyAverageVisitors: null,
      providerConversionRate: null,
      isCollected: true,
      hasData: false,
      lastObservedAt: new Date('2026-09-03T01:00:00.000Z'),
      coverage: {
        from: '2026-09-01',
        to: '2026-09-03',
        targetDays: 3,
        completedDays: 2,
        missingDates: ['2026-09-02'],
      },
      reconciliation: null,
      exactPeriodEvidence: null,
    });
    wing.aggregateCoupangAds.mockResolvedValue({
      spend: 0,
      revenue: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      orders: 0,
      conversionRate: null,
      providerConversionRate: null,
      coverage: null,
      isCollected: false,
      hasData: false,
      lastObservedAt: null,
    });
    wing.findLatestDataDate.mockResolvedValue(null);

    const service = new DashboardSalesService(profit, wingAds, sales, wing);
    const result = await service.getSummary(
      buildDashboardContext('month', undefined, undefined, new Date('2026-09-08T03:00:00.000Z')),
      ORGANIZATION_ID,
    );

    expect(result.monthly.revenue).toBeNull();
    expect(result.trafficKpi).toEqual(expect.objectContaining({
      visitors: null,
      views: null,
      orders: null,
      salesQty: null,
      revenue: null,
      cartAdds: null,
      conversionRate: null,
      dailyAverageVisitors: null,
      trafficAvailable: true,
      coverage: expect.objectContaining({ completedDays: 2, missingDates: ['2026-09-02'] }),
    }));
  });
});

describe('DashboardSalesService unavailable profit evidence', () => {
  // `null` netProfit means the cost evidence was incomplete. It is
  // categorically different from a measured zero, so nothing downstream may
  // coerce it: the collected ad cost is still a measured fact and updates
  // `adCost`, but every profit value derived from the missing base stays null.
  it('수집 광고비는 반영하되 원가 근거가 없으면 순이익/이익률을 null로 유지한다', async () => {
    const profit = buildMockProfitCalculationRepo();
    profit.calculateForRange.mockImplementation(async (_organizationId, period) => ({
      revenue: 100_000,
      costOfGoods: 50_000,
      commission: 0,
      shippingCost: 0,
      adCost: 10_000,
      otherCost: 0,
      netProfit: null,
      profitRate: null,
      orderCount: 2,
      adRevenue: 0,
      adImpressions: 0,
      adClicks: 0,
      adConversions: 0,
      costComplete: false,
      costIncompleteReasons: ['MISSING_COST_PRICE'],
      adEvidenceComplete: true,
      // Both sources cover every date; only the cost inputs are incomplete.
      sourceCoverage: buildProfitSourceCoverage(period),
    }));

    const wingAds = buildMockWingAdSummaryRepo();
    wingAds.fetchCurrentMonthSummary.mockResolvedValue(null);

    const sales = buildMockDashboardSalesRepo();
    sales.fetchTodayKpis.mockResolvedValue({ revenue: 0, orders: 0 });
    sales.fetchTopProducts.mockResolvedValue([]);

    const wing = buildMockWingTrafficAggregationRepo();
    wing.aggregateTraffic.mockResolvedValue({
      revenue: 0,
      orders: 0,
      salesQty: 0,
      visitors: 120,
      views: 400,
      cartAdds: 0,
      conversionRate: 0,
      isCollected: true,
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
      conversionRate: null,
      providerConversionRate: null,
      coverage: null,
      isCollected: true,
      hasData: true,
      lastObservedAt: new Date('2026-07-18T00:00:00.000Z'),
    });
    wing.findLatestDataDate.mockResolvedValue(null);

    const service = new DashboardSalesService(profit, wingAds, sales, wing);
    const result = await service.getSummary(
      buildDashboardContext('month', undefined, undefined, new Date('2026-07-18T03:00:00.000Z')),
      ORGANIZATION_ID,
    );

    // Reconciliation keeps the larger measured account spend...
    expect(result.profitDetail?.adCost).toBe(30_000);
    expect(result.profitDetail?.revenue).toBe(100_000);
    // ...but never synthesizes a profit out of a missing base.
    expect(result.profitDetail?.netProfit).toBeNull();
    expect(result.monthly.profit).toBeNull();
    expect(result.rangeKpi?.profit).toBeNull();
    expect(result.rangeKpi?.profitRate).toBeNull();
    // A ratio whose numerator is unavailable is itself unavailable.
    expect(result.trafficKpi.netProfit).toBeNull();
    expect(result.trafficKpi.profitRate).toBeNull();
    // The order-backed revenue evidence that does exist stays visible.
    expect(result.trafficKpi.revenue).toBe(100_000);
    expect(result.trafficKpi.orders).toBe(2);
  });
});
