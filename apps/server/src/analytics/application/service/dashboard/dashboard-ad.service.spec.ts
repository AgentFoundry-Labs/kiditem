import { describe, expect, it, vi } from 'vitest';
import { buildDashboardContext } from '../../../domain/dashboard/context';
import { businessDateText } from '../../../domain/dashboard/period/dashboard-period';
import {
  buildMockProfitCalculationRepo,
  buildMockWingTrafficAggregationRepo,
  buildProfitSourceCoverage,
} from '../../../__tests__/dashboard/test-helpers/build-mock-ports';
import { DashboardAdService } from './dashboard-ad.service';
import type { RangeProfitMetrics } from '../../port/out/repository/dashboard/profit-calculation.repository.port';
import type {
  CoupangAdsMetrics,
  WingTrafficMetrics,
} from '../../port/out/repository/dashboard/wing-traffic-aggregation.repository.port';

const ORGANIZATION_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const ANCHOR = new Date('2026-09-07T03:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

const MONTH_ADS: CoupangAdsMetrics = {
  spend: 100_000,
  revenue: 1_000_000,
  impressions: 50_000,
  clicks: 3_083,
  conversions: 800,
  orders: 474,
  conversionRate: (474 / 3_083) * 100,
  providerConversionRate: null,
  coverage: null,
  isCollected: true,
  hasData: true,
  lastObservedAt: null,
};

const RANGE_ADS: CoupangAdsMetrics = {
  ...MONTH_ADS,
  spend: 200_000,
  revenue: 2_000_000,
  impressions: 80_000,
  clicks: 3_500,
  conversions: 879,
  orders: 731,
};

const DAY_ADS: CoupangAdsMetrics = {
  ...MONTH_ADS,
  spend: 10_000,
  revenue: 100_000,
  impressions: 5_000,
  clicks: 200,
  conversions: 3,
  orders: 3,
};

const PREVIOUS_ADS: CoupangAdsMetrics = {
  ...MONTH_ADS,
  spend: 90_000,
  revenue: 900_000,
  impressions: 40_000,
  clicks: 2_000,
  conversions: 300,
  orders: 300,
};

const OWNER_ZERO_ADS: CoupangAdsMetrics = {
  ...MONTH_ADS,
  spend: 0,
  revenue: 0,
  impressions: 0,
  clicks: 0,
  conversions: 0,
  orders: 0,
  conversionRate: null,
  providerConversionRate: null,
  coverage: {
    from: '2026-09-01',
    to: '2026-09-07',
    knownThrough: '2026-09-07',
    targetDays: 7,
    completedDays: 7,
    missingDates: [],
  },
  isCollected: true,
  hasData: true,
};

// Window-independent totals; `sourceCoverage` is filled per requested range
// because business-date evidence only means something against a window.
const PROFIT: Omit<RangeProfitMetrics, 'sourceCoverage'> = {
  revenue: 1_000_000,
  costOfGoods: 0,
  commission: 0,
  shippingCost: 0,
  adCost: 100_000,
  otherCost: 0,
  netProfit: 900_000,
  profitRate: 90,
  orderCount: 474,
  adRevenue: 1_000_000,
  adImpressions: 50_000,
  adClicks: 3_083,
  adConversions: 474,
  // A non-null netProfit is only derivable when both evidence gates pass.
  costComplete: true,
  costIncompleteReasons: [],
  adEvidenceComplete: true,
};

const NO_TRAFFIC: WingTrafficMetrics = {
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
};

function adsForRange(from: Date, to: Date): CoupangAdsMetrics {
  const days = Math.round((to.getTime() - from.getTime()) / DAY_MS);
  // Preset month calls are clipped at the explicit KST cutoff in the service;
  // classify them by their month-start origin rather than their shortened day
  // count. A current-day clip is intentionally empty.
  // The month start is a KST business date; host-local getters differ by runner TZ.
  if (businessDateText(from).endsWith('-01')) return MONTH_ADS;
  if (days === 1) return DAY_ADS;
  if (days === 14) return RANGE_ADS;
  if (days === 30) return MONTH_ADS;
  return PREVIOUS_ADS;
}

function buildService(options: {
  owner?: CoupangAdsMetrics;
  latestDataDate?: Date | null;
} = {}): {
  service: DashboardAdService;
  wingTraffic: ReturnType<typeof buildMockWingTrafficAggregationRepo>;
} {
  const profit = buildMockProfitCalculationRepo();
  profit.calculateForRange.mockImplementation(async (_organizationId, period) => ({
    ...PROFIT,
    sourceCoverage: buildProfitSourceCoverage(period),
  }));


  const wingTraffic = buildMockWingTrafficAggregationRepo();
  wingTraffic.aggregateTraffic.mockResolvedValue(NO_TRAFFIC);
  wingTraffic.aggregateCoupangAds.mockImplementation(async (_organizationId, period) => (
    options.owner ?? adsForRange(period.queryWindow.from, period.queryWindow.to)
  ));
  wingTraffic.readAdRateFacts.mockImplementation(async (_organizationId, period) => {
    const ads = options.owner ?? adsForRange(period.queryWindow.from, period.queryWindow.to);
    return {
      adSpend: ads.spend,
      revenue: PROFIT.revenue,
      revenueSource: 'orders',
      includedDates: [...period.selectedDates],
      adCoverageComplete: ads.hasData,
    };
  });
  wingTraffic.findLatestDataDate.mockResolvedValue(options.latestDataDate ?? null);
  wingTraffic.fetchDailyAds.mockResolvedValue([]);

  return {
    service: new DashboardAdService(
      profit,
      wingTraffic,
    ),
    wingTraffic,
  };
}

describe('DashboardAdService detailed ad KPI period', () => {
  it('uses Coupang order counts rather than conversion revenue for CVR', async () => {
    const result = await buildService().service.getSummary(
      buildDashboardContext('custom', '2026-08-25', '2026-09-07', ANCHOR),
      ORGANIZATION_ID,
    );

    expect(result.adKpi).toMatchObject({
      clicks: RANGE_ADS.clicks,
      conversions: RANGE_ADS.orders,
      cvr: 20.89,
    });
    expect(result.adKpi?.conversions).not.toBe(RANGE_ADS.conversions);
  });

  it('uses selected-range conversions when a custom range crosses calendar months', async () => {
    const result = await buildService().service.getSummary(
      buildDashboardContext('custom', '2026-08-25', '2026-09-07', ANCHOR),
      ORGANIZATION_ID,
    );

    expect(result.adKpi).toMatchObject({
      clicks: RANGE_ADS.clicks,
      conversions: RANGE_ADS.orders,
      cvr: 20.89,
    });
    expect(result.adKpi?.conversions).not.toBe(MONTH_ADS.orders);
  });

  it('keeps conversion counts and CVR on each selected period', async () => {
    const day = await buildService().service.getSummary(
      buildDashboardContext('day', undefined, undefined, ANCHOR),
      ORGANIZATION_ID,
    );
    const month = await buildService().service.getSummary(
      buildDashboardContext('month', undefined, undefined, ANCHOR),
      ORGANIZATION_ID,
    );

    expect(day.adKpi).toMatchObject({
      clicks: DAY_ADS.clicks,
      conversions: DAY_ADS.orders,
      cvr: 1.5,
    });
    expect(month.adKpi).toMatchObject({
      clicks: MONTH_ADS.clicks,
      conversions: MONTH_ADS.orders,
      cvr: 15.37,
    });
    expect(day.adKpi?.conversions).not.toBe(month.adKpi?.conversions);
    expect(day.adKpi?.cvr).not.toBe(month.adKpi?.cvr);
  });

  it('keeps a complete all-zero owner range as explicit zero', async () => {
    const result = await buildService({
      owner: OWNER_ZERO_ADS,
    }).service.getSummary(
      buildDashboardContext('custom', '2026-08-25', '2026-09-07', ANCHOR),
      ORGANIZATION_ID,
    );

    expect(result.adKpi).toMatchObject({
      source: 'coupang_ads',
      totalSpend: 0,
      clicks: 0,
      conversions: 0,
      cvr: null,
    });
    expect(result.monthly).toMatchObject({
      source: 'coupang_ads',
      adRevenue: 0,
      totalAdSpend: 0,
    });
  });

  it('divides only the ad and revenue inputs recomputed on their common dates', async () => {
    const { service, wingTraffic } = buildService();
    wingTraffic.readAdRateFacts.mockResolvedValue({
      adSpend: 10,
      revenue: 100,
      revenueSource: 'orders',
      includedDates: ['2026-09-01'],
      adCoverageComplete: false,
    });

    const result = await service.getSummary(
      buildDashboardContext('custom', '2026-08-25', '2026-09-07', ANCHOR),
      ORGANIZATION_ID,
    );

    expect(result.rangeKpi?.adRate).toBe(10);
    expect(result.metricBasis?.['rangeKpi.adRate']).toMatchObject({
      includedDates: ['2026-09-01'],
      sources: ['coupang_ads', 'orders'],
    });
  });

  it('returns only observed owner daily rows, including explicit zeroes', async () => {
    const { service, wingTraffic } = buildService();
    wingTraffic.fetchDailyAds.mockResolvedValue([
      { date: '2026-09-05', ad_cost: 12_000 },
      { date: '2026-09-06', ad_cost: 0 },
    ]);

    const result = await service.getSummary(
      buildDashboardContext('custom', '2026-08-25', '2026-09-07', ANCHOR),
      ORGANIZATION_ID,
    );

    expect(result.dailyAd).toEqual([
      { date: '2026-09-05', adCost: 12_000, source: 'coupang_ads' },
      { date: '2026-09-06', adCost: 0, source: 'coupang_ads' },
    ]);
  });

  it('leaves daily ad unavailable when the owner publishes no daily rows', async () => {
    const { service, wingTraffic } = buildService();
    wingTraffic.fetchDailyAds.mockResolvedValue([]);

    const result = await service.getSummary(
      buildDashboardContext('custom', '2026-08-25', '2026-09-07', ANCHOR),
      ORGANIZATION_ID,
    );

    expect(result.dailyAd).toBeUndefined();
  });

  it('keeps partial owner coverage visible as unavailable account KPIs', async () => {
    const result = await buildService({
      owner: {
        ...MONTH_ADS,
        hasData: false,
        isCollected: true,
        coverage: {
          from: '2026-09-01',
          to: '2026-09-07',
          knownThrough: '2026-09-05',
          targetDays: 7,
          completedDays: 5,
          missingDates: ['2026-09-06', '2026-09-07'],
        },
      },
    }).service.getSummary(
      buildDashboardContext('custom', '2026-08-25', '2026-09-07', ANCHOR),
      ORGANIZATION_ID,
    );

    expect(result.adKpi).toMatchObject({
      source: 'unavailable',
      totalSpend: null,
      conversions: null,
      cvr: null,
      coverage: {
        completedDays: 5,
        missingDates: ['2026-09-06', '2026-09-07'],
      },
    });
    expect(result.monthly).toMatchObject({
      source: 'unavailable',
      adRevenue: null,
      totalAdSpend: null,
      coverage: {
        completedDays: 5,
        missingDates: ['2026-09-06', '2026-09-07'],
      },
    });
    expect(result.rangeKpi).toMatchObject({
      source: 'unavailable',
      adSpend: null,
      adConvRevenue: null,
      coverage: {
        completedDays: 5,
        missingDates: ['2026-09-06', '2026-09-07'],
      },
    });
  });

  it('clips only preset owner calls to the explicit KST anchor cutoff', async () => {
    const { service, wingTraffic } = buildService({
      latestDataDate: new Date('2026-09-03T00:00:00.000Z'),
    });

    await service.getSummary(
      buildDashboardContext('month', undefined, undefined, new Date('2026-09-08T03:00:00.000Z')),
      ORGANIZATION_ID,
    );

    expect(wingTraffic.aggregateCoupangAds.mock.calls.some(([, period]) => (
      period.queryWindow.to.toISOString() === '2026-09-07T15:00:00.000Z'
    ))).toBe(true);
    expect(wingTraffic.aggregateCoupangAds.mock.calls.some(([, period]) => (
      period.queryWindow.to.toISOString() === '2026-09-04T00:00:00.000Z'
    ))).toBe(false);
  });

  it('uses yesterday and the preceding closed day for day-period owner reads', async () => {
    const { service, wingTraffic } = buildService();

    await service.getSummary(
      buildDashboardContext('day', undefined, undefined, new Date('2026-09-08T03:00:00.000Z')),
      ORGANIZATION_ID,
    );

    expect(wingTraffic.aggregateCoupangAds.mock.calls.some(([, period]) => (
      period.queryWindow.from.toISOString() === '2026-09-06T15:00:00.000Z'
      && period.queryWindow.to.toISOString() === '2026-09-07T15:00:00.000Z'
    ))).toBe(true);
    expect(wingTraffic.aggregateCoupangAds.mock.calls.some(([, period]) => (
      period.queryWindow.from.toISOString() === '2026-09-05T15:00:00.000Z'
      && period.queryWindow.to.toISOString() === '2026-09-06T15:00:00.000Z'
    ))).toBe(true);
  });
});
