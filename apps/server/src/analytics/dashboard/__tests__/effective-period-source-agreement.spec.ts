// `/api/dashboard/sales` and `/api/dashboard/ad` each publish their own
// `effectivePeriod`, and the web renders both in one label row. They must agree
// for the same month and the same sources — the Wing-usability decision lives
// inside `domain/util/effective-period`, not in either caller.

import { describe, expect, it } from 'vitest';

import { buildDashboardContext } from '../domain/context';
import { DashboardAdService } from '../application/service/dashboard-ad.service';
import { DashboardSalesService } from '../application/service/dashboard-sales.service';
import type { RangeProfitMetrics } from '../application/port/out/repository/profit-calculation.repository.port';
import type {
  CoupangAdsMetrics,
  WingTrafficMetrics,
} from '../application/port/out/repository/wing-traffic-aggregation.repository.port';
import {
  buildMockDashboardSalesRepo,
  buildMockProfitCalculationRepo,
  buildMockWingAdSummaryRepo,
  buildMockWingTrafficAggregationRepo,
  buildProfitSourceCoverage,
} from './test-helpers/build-mock-ports';

const ORGANIZATION_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const ANCHOR = new Date('2026-09-08T03:00:00.000Z');

const NO_ORDERS: Omit<RangeProfitMetrics, 'sourceCoverage'> = {
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
  costComplete: true,
  costIncompleteReasons: [],
  adEvidenceComplete: true,
};

const NO_ADS: CoupangAdsMetrics = {
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
};

const WING_BASE: WingTrafficMetrics = {
  revenue: 206_770,
  orders: 31,
  salesQty: 92,
  visitors: 165,
  views: 678,
  cartAdds: 76,
  conversionRate: 4.5,
  dailyAverageVisitors: 165,
  providerConversionRate: null,
  isCollected: true,
  hasData: true,
  coverage: null,
  reconciliation: null,
  exactPeriodEvidence: null,
  lastObservedAt: new Date('2026-09-07T01:00:00.000Z'),
};

async function revenueSources(wing: WingTrafficMetrics): Promise<{
  sales: string | undefined;
  ad: string | undefined;
}> {
  const profit = buildMockProfitCalculationRepo();
  profit.calculateForRange.mockImplementation(async (_organizationId, period) => ({
    ...NO_ORDERS,
    sourceCoverage: buildProfitSourceCoverage(period, { orders: false }),
  }));

  const wingAdSummary = buildMockWingAdSummaryRepo();
  wingAdSummary.fetchCurrentMonthSummary.mockResolvedValue(null);

  const wingTraffic = buildMockWingTrafficAggregationRepo();
  wingTraffic.aggregateTraffic.mockResolvedValue(wing);
  wingTraffic.aggregateCoupangAds.mockResolvedValue(NO_ADS);
  wingTraffic.findLatestDataDate.mockResolvedValue(new Date('2026-09-07T00:00:00.000Z'));
  wingTraffic.fetchDailyAds.mockResolvedValue([]);
  wingTraffic.fetchDailyTrend.mockResolvedValue([]);

  const salesRepo = buildMockDashboardSalesRepo();
  salesRepo.fetchTodayKpis.mockResolvedValue({ revenue: 0, orders: 0 });
  salesRepo.fetchTopProducts.mockResolvedValue([]);
  salesRepo.fetchDailyRevenue.mockResolvedValue([]);

  const ctx = buildDashboardContext('month', undefined, undefined, ANCHOR);
  const sales = await new DashboardSalesService(
    profit,
    wingAdSummary,
    salesRepo,
    wingTraffic,
  ).getSummary(ctx, ORGANIZATION_ID);
  const ad = await new DashboardAdService(
    profit,
    wingAdSummary,
    wingTraffic,
  ).getSummary(ctx, ORGANIZATION_ID);

  return {
    sales: sales.effectivePeriod?.revenueSource,
    ad: ad.effectivePeriod?.revenueSource,
  };
}

describe('effectivePeriod.revenueSource agreement across dashboard endpoints', () => {
  it('agrees on a complete Wing month', async () => {
    const sources = await revenueSources({
      ...WING_BASE,
      coverage: {
        from: '2026-09-01',
        to: '2026-09-07',
        targetDays: 7,
        completedDays: 7,
        missingDates: [],
      },
    });

    expect(sources.ad).toBe(sources.sales);
    expect(sources.sales).toBe('wing');
  });
});
