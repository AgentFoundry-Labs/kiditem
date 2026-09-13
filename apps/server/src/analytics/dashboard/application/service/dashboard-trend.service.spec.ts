import { afterEach, describe, expect, it, vi } from 'vitest';
import { missingDatesOf, periodStatusOf } from '../../../../test-helpers/dashboard-basis-assertions';
import { DashboardTrendItemSchema } from '@kiditem/shared/dashboard';
import { DashboardTrendService } from './dashboard-trend.service';
import {
  buildMockDashboardTrendRepo,
  buildMockProfitCalculationRepo,
  buildMockWingTrafficAggregationRepo,
} from '../../__tests__/test-helpers/build-mock-ports';
import { kstDayStart } from '../../../../common/kst';
import { buildDashboardContext } from '../../domain/context';

describe('DashboardTrendService daily profit basis', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses same-date cost and ad evidence instead of prorating a range margin', async () => {
    const date = new Date(kstDayStart(new Date()).getTime() - 86_400_000)
      .toISOString()
      .slice(0, 10);
    const profit = buildMockProfitCalculationRepo();
    profit.calculateDailyForRange.mockResolvedValue([
      {
        date,
        revenue: 100,
        qty: 1,
        costOfGoods: 70,
        commission: 0,
        shippingCost: 0,
        otherCost: 0,
        cost: 70,
        adCost: 0,
        adRevenue: 0,
        adImpressions: 0,
        adClicks: 0,
        adConversions: 0,
        netProfit: 30,
        profitRate: 30,
        orderCount: 1,
        hasOrderEvidence: true,
        hasAdEvidence: true,
      hasAdAccount: true,
        costComplete: true,
        costIncompleteReasons: [],
      },
    ]);

    const trend = buildMockDashboardTrendRepo();
    trend.fetchTrendRevenueRows.mockResolvedValue([]);
    const wing = buildMockWingTrafficAggregationRepo();
    wing.fetchDailyTrend.mockResolvedValue([]);
    wing.fetchDailyAds.mockResolvedValue([]);

    const result = await new DashboardTrendService(profit, trend, wing).getTrend(buildDashboardContext('week'), 'org-1');

    expect(result).toHaveLength(7);
    expect(result.find((row) => row.date === date)).toMatchObject({ revenue: 100, adCost: 0, profit: 30 });
    expect(result.find((row) => row.date === date)?.metricBasis?.profit).toMatchObject({
      kind: 'period',
      includedDates: [date],
    });
    expect(periodStatusOf(result.find((row) => row.date === date)?.metricBasis?.profit)).toBe('complete');
    expect(profit.calculateForRange).not.toHaveBeenCalled();
  });

  it('leaves profit unavailable when the same date has no ad evidence', async () => {
    const date = new Date(kstDayStart(new Date()).getTime() - 86_400_000)
      .toISOString()
      .slice(0, 10);
    const profit = buildMockProfitCalculationRepo();
    profit.calculateDailyForRange.mockResolvedValue([{
      date,
      revenue: 100,
      qty: 1,
      costOfGoods: 70,
      commission: 0,
      shippingCost: 0,
      otherCost: 0,
      cost: 70,
      adCost: null,
      adRevenue: null,
      adImpressions: null,
      adClicks: null,
      adConversions: null,
      netProfit: null,
      profitRate: null,
      orderCount: 1,
      hasOrderEvidence: true,
      hasAdEvidence: false,
      hasAdAccount: true,
      costComplete: true,
      costIncompleteReasons: [],
    }]);
    const trend = buildMockDashboardTrendRepo();
    trend.fetchTrendRevenueRows.mockResolvedValue([]);
    const wing = buildMockWingTrafficAggregationRepo();
    wing.fetchDailyTrend.mockResolvedValue([]);
    wing.fetchDailyAds.mockResolvedValue([]);

    const result = await new DashboardTrendService(profit, trend, wing).getTrend(buildDashboardContext('week'), 'org-1');

    expect(result.find((row) => row.date === date)).toMatchObject({ revenue: 100, adCost: null, profit: null });
    expect(periodStatusOf(result.find((row) => row.date === date)?.metricBasis?.profit)).toBe('empty');
    expect(missingDatesOf(result.find((row) => row.date === date)?.metricBasis?.profit)).toEqual([date]);
  });

  it('enumerates the completed KST dates without shifting the window by one day', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-10T16:30:00.000Z')); // 2026-09-11 01:30 KST
    const profit = buildMockProfitCalculationRepo();
    profit.calculateDailyForRange.mockResolvedValue([]);
    const trend = buildMockDashboardTrendRepo();
    trend.fetchTrendRevenueRows.mockResolvedValue([]);
    const wing = buildMockWingTrafficAggregationRepo();
    wing.fetchDailyTrend.mockResolvedValue([]);
    wing.fetchDailyAds.mockResolvedValue([]);

    const result = await new DashboardTrendService(profit, trend, wing).getTrend(buildDashboardContext('week'), 'org-1');

    expect(result.map((row) => row.date)).toEqual([
      '2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07',
      '2026-09-08', '2026-09-09', '2026-09-10',
    ]);
    expect(profit.calculateDailyForRange).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        queryWindow: {
          from: new Date('2026-09-03T15:00:00.000Z'),
          to: new Date('2026-09-10T15:00:00.000Z'),
        },
      }),
    );
  });

  it('marks missing cost inputs invalid — not unverified — when the owner ad row is an explicit zero', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-10T16:30:00.000Z'));
    const date = '2026-09-09';
    const profit = buildMockProfitCalculationRepo();
    profit.calculateDailyForRange.mockResolvedValue([{
      date,
      revenue: 100,
      qty: 1,
      costOfGoods: 0,
      commission: 0,
      shippingCost: 0,
      otherCost: 0,
      cost: 0,
      adCost: 0,
      adRevenue: 0,
      adImpressions: 0,
      adClicks: 0,
      adConversions: 0,
      netProfit: null,
      profitRate: null,
      orderCount: 1,
      hasOrderEvidence: true,
      hasAdEvidence: true,
      hasAdAccount: true,
      costComplete: false,
      costIncompleteReasons: ['MISSING_COST_PRICE'],
    }]);
    const trend = buildMockDashboardTrendRepo();
    trend.fetchTrendRevenueRows.mockResolvedValue([]);
    const wing = buildMockWingTrafficAggregationRepo();
    wing.fetchDailyTrend.mockResolvedValue([]);
    wing.fetchDailyAds.mockResolvedValue([{
      date,
      ad_cost: 0,
      ad_revenue: 0,
      clicks: 0,
      impressions: 0,
      conversions: 0,
      orders: 0,
      observedAt: '2026-09-10T01:00:00.000Z',
    }]);

    const result = await new DashboardTrendService(profit, trend, wing).getTrend(buildDashboardContext('week'), 'org-1');
    const row = result.find((item) => item.date === date)!;
    expect(row).toMatchObject({ revenue: 100, adCost: 0, profit: null });
    // A cost input that was read and refused is invalid evidence, so the
    // computable subset is empty. `unverified` is reserved for a required
    // read that actually failed, which this one did not.
    expect(row.metricBasis?.profit).toMatchObject({
      includedDates: [],
      invalidDates: [date],
    });
    expect(periodStatusOf(row.metricBasis?.profit)).toBe('empty');
    expect(missingDatesOf(row.metricBasis?.profit)).toEqual([date]);
    expect('queryFailedSources' in (row.metricBasis?.profit ?? {})).toBe(false);
  });

  it('preserves valid order revenue and distinguishes an ad query failure from empty evidence', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-10T16:30:00.000Z'));
    const date = '2026-09-09';
    const profit = buildMockProfitCalculationRepo();
    profit.calculateDailyForRange.mockRejectedValue(new Error('owner ad read failed'));
    const trend = buildMockDashboardTrendRepo();
    trend.fetchTrendRevenueRows.mockResolvedValue([{ date, revenue: 100 }]);
    const wing = buildMockWingTrafficAggregationRepo();
    wing.fetchDailyTrend.mockResolvedValue([]);
    wing.fetchDailyAds.mockRejectedValue(new Error('owner ad read failed'));

    const result = await new DashboardTrendService(profit, trend, wing).getTrend(buildDashboardContext('week'), 'org-1');
    const row = result.find((item) => item.date === date)!;
    expect(row).toMatchObject({ revenue: 100, adCost: null, profit: null });
    expect(row.metricBasis?.revenue).toMatchObject({ queryFailedSources: ['profit'] });
    expect(periodStatusOf(row.metricBasis?.revenue)).toBe('complete');
    expect(row.metricBasis?.adCost).toMatchObject({
      invalidDates: [],
      queryFailedSources: ['coupang_ads'],
    });
    expect(periodStatusOf(row.metricBasis?.adCost)).toBe('unverified');
    expect(missingDatesOf(row.metricBasis?.adCost)).toEqual([date]);
  });

  it('uses successful daily ad evidence when the owner daily-profit read failed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-10T16:30:00.000Z'));
    const date = '2026-09-09';
    const profit = buildMockProfitCalculationRepo();
    profit.calculateDailyForRange.mockResolvedValue([{
      date,
      revenue: 100,
      qty: 1,
      costOfGoods: 70,
      commission: 0,
      shippingCost: 0,
      otherCost: 0,
      cost: 70,
      adCost: null,
      adRevenue: null,
      adImpressions: null,
      adClicks: null,
      adConversions: null,
      netProfit: null,
      profitRate: null,
      orderCount: 1,
      hasOrderEvidence: true,
      hasAdEvidence: false,
      hasAdAccount: true,
      costComplete: true,
      costIncompleteReasons: [],
      adEvidenceError: 'AD_EVIDENCE_READ_FAILED',
    }]);
    const trend = buildMockDashboardTrendRepo();
    trend.fetchTrendRevenueRows.mockResolvedValue([]);
    const wing = buildMockWingTrafficAggregationRepo();
    wing.fetchDailyTrend.mockResolvedValue([]);
    wing.fetchDailyAds.mockResolvedValue([{
      date,
      ad_cost: 5,
      ad_revenue: 0,
      clicks: 0,
      impressions: 0,
      conversions: 0,
      orders: 0,
      observedAt: '2026-09-10T01:00:00.000Z',
    }]);

    const result = await new DashboardTrendService(profit, trend, wing).getTrend(buildDashboardContext('week'), 'org-1');
    const row = result.find((item) => item.date === date)!;
    expect(row).toMatchObject({ revenue: 100, adCost: 5, profit: 25 });
    expect(periodStatusOf(row.metricBasis?.profit)).toBe('complete');
    expect('queryFailedSources' in (row.metricBasis?.profit ?? {})).toBe(false);
  });

  it('marks revenue unverified when the order and Wing reads are empty/failed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-10T16:30:00.000Z'));
    const profit = buildMockProfitCalculationRepo();
    profit.calculateDailyForRange.mockResolvedValue([]);
    const trend = buildMockDashboardTrendRepo();
    trend.fetchTrendRevenueRows.mockResolvedValue([]);
    const wing = buildMockWingTrafficAggregationRepo();
    wing.fetchDailyTrend.mockRejectedValue(new Error('wing read failed'));
    wing.fetchDailyAds.mockResolvedValue([]);

    const result = await new DashboardTrendService(profit, trend, wing).getTrend(buildDashboardContext('week'), 'org-1');
    const row = result[0]!;
    expect(row).toMatchObject({ revenue: null });
    expect(row.metricBasis?.revenue).toMatchObject({ queryFailedSources: ['wing_traffic'] });
    expect(periodStatusOf(row.metricBasis?.revenue)).toBe('unverified');
  });

  it('emits schema-valid unique failures when both ad readers fail', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-10T16:30:00.000Z'));
    const date = '2026-09-09';
    const profit = buildMockProfitCalculationRepo();
    profit.calculateDailyForRange.mockResolvedValue([{
      date,
      revenue: 100,
      qty: 1,
      costOfGoods: 70,
      commission: 0,
      shippingCost: 0,
      otherCost: 0,
      cost: 70,
      adCost: null,
      adRevenue: null,
      adImpressions: null,
      adClicks: null,
      adConversions: null,
      netProfit: null,
      profitRate: null,
      orderCount: 1,
      hasOrderEvidence: true,
      hasAdEvidence: false,
      hasAdAccount: true,
      costComplete: true,
      costIncompleteReasons: [],
      adEvidenceError: 'AD_EVIDENCE_READ_FAILED',
    }]);
    const trend = buildMockDashboardTrendRepo();
    trend.fetchTrendRevenueRows.mockResolvedValue([]);
    const wing = buildMockWingTrafficAggregationRepo();
    wing.fetchDailyTrend.mockResolvedValue([]);
    wing.fetchDailyAds.mockRejectedValue(new Error('ads read failed'));

    const result = await new DashboardTrendService(profit, trend, wing).getTrend(buildDashboardContext('week'), 'org-1');
    const row = result.find((item) => item.date === date)!;
    expect(row.metricBasis?.profit).toMatchObject({ queryFailedSources: ['coupang_ads'] });
    expect(() => DashboardTrendItemSchema.parse(row)).not.toThrow();
  });
});
