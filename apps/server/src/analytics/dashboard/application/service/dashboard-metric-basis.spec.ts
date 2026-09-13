import { describe, expect, it } from 'vitest';
import { buildDashboardContext } from '../../domain/context';
import {
  buildMockDashboardInventoryRepo,
  buildMockDashboardSalesRepo,
  buildTodayKpiRow,
  buildMockProfitCalculationRepo,
  buildMockWingTrafficAggregationRepo,
} from '../../__tests__/test-helpers/build-mock-ports';
import {
  missingDatesOf,
  periodStatusOf,
  snapshotStatusOf,
} from '../../../../test-helpers/dashboard-basis-assertions';
import { DashboardSalesService } from './dashboard-sales.service';
import { DashboardAdService } from './dashboard-ad.service';
import { DashboardInventoryService } from './dashboard-inventory.service';
import type { RangeProfitMetrics } from '../port/out/repository/profit-calculation.repository.port';
import type {
  CoupangAdsMetrics,
  WingTrafficMetrics,
} from '../port/out/repository/wing-traffic-aggregation.repository.port';
import type { ResolvedDashboardPeriod } from '../../domain/period/dashboard-period';
import type {
  AbcEvaluationAsOf,
  DashboardAbcFacts,
  DashboardPerListingMetricsResult,
} from '../port/out/repository/dashboard-inventory.repository.port';

/**
 * Published calculation bases for `/api/dashboard/sales` and `/api/dashboard/ad`.
 *
 * The 2026-09-10 partial-aggregation amendment requires evidence for partial
 * numbers, different source cutoffs, internal holes, a true collected zero,
 * two sources with no common date, and a failed read told apart from an
 * empty one. Each case below is one of those.
 */
const ORGANIZATION_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const ANCHOR = new Date('2026-09-08T00:30:00.000Z');
const SELECTED = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05'];
const PREVIOUS = ['2026-08-27', '2026-08-28', '2026-08-29', '2026-08-30', '2026-08-31'];

function customContext() {
  return buildDashboardContext('custom', '2026-09-01', '2026-09-05', ANCHOR);
}

interface ProfitFixture {
  revenue?: number;
  orderCount?: number;
  netProfit?: number | null;
  costComplete?: boolean;
  orderDates?: readonly string[];
  adDates?: readonly string[];
  hasAdAccount?: boolean;
  adEvidenceError?: boolean;
}

/**
 * A range aggregate over one resolved period. `orderDates` / `adDates` default
 * to the period's own selected dates so a fixture claiming revenue also
 * carries the dates it came from.
 */
function profitMetrics(
  period: ResolvedDashboardPeriod,
  fixture: ProfitFixture = {},
): RangeProfitMetrics {
  const requestedDates = period.selectedDates;
  const orderDates = [...(fixture.orderDates ?? requestedDates)]
    .filter((date) => requestedDates.includes(date));
  const hasAdAccount = fixture.hasAdAccount ?? true;
  const adDates = !hasAdAccount
    ? []
    : [...(fixture.adDates ?? requestedDates)].filter((date) => requestedDates.includes(date));
  return {
    revenue: fixture.revenue ?? 100_000,
    costOfGoods: 40_000,
    commission: 5_000,
    shippingCost: 3_000,
    adCost: 10_000,
    otherCost: 2_000,
    netProfit: fixture.netProfit === undefined ? 40_000 : fixture.netProfit,
    profitRate: null,
    orderCount: fixture.orderCount ?? 3,
    adRevenue: 0,
    adImpressions: 0,
    adClicks: 0,
    adConversions: 0,
    costComplete: fixture.costComplete ?? true,
    costIncompleteReasons: [],
    adEvidenceComplete: !hasAdAccount || adDates.length === requestedDates.length,
    ...(fixture.adEvidenceError ? { adEvidenceError: 'AD_EVIDENCE_READ_FAILED' as const } : {}),
    sourceCoverage: { requestedDates, orderDates, adDates, hasAdAccount },
  };
}

function wingTraffic(overrides: Partial<WingTrafficMetrics> = {}): WingTrafficMetrics {
  return {
    revenue: 0,
    orders: 0,
    salesQty: 0,
    visitors: 0,
    views: 0,
    cartAdds: 0,
    conversionRate: 0,
    dailyAverageVisitors: null,
    providerConversionRate: null,
    coverage: null,
    reconciliation: null,
    exactPeriodEvidence: null,
    isCollected: false,
    hasData: false,
    lastObservedAt: null,
    ...overrides,
  };
}

function coupangAds(overrides: Partial<CoupangAdsMetrics> = {}): CoupangAdsMetrics {
  return {
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
    ...overrides,
  };
}

function salesService(options: {
  profitFor: (period: ResolvedDashboardPeriod) => RangeProfitMetrics;
  wing?: WingTrafficMetrics;
  ads?: CoupangAdsMetrics;
}) {
  const profit = buildMockProfitCalculationRepo();
  profit.calculateForRange.mockImplementation(async (_org, period) => options.profitFor(period));
  profit.calculateDailyForRange.mockResolvedValue([]);
  const sales = buildMockDashboardSalesRepo();
  sales.fetchTodayKpis.mockResolvedValue(buildTodayKpiRow());
  sales.fetchTopProducts.mockResolvedValue([]);
  const wing = buildMockWingTrafficAggregationRepo();
  wing.aggregateTraffic.mockResolvedValue(options.wing ?? wingTraffic());
  wing.aggregateCoupangAds.mockResolvedValue(options.ads ?? coupangAds());
  wing.readAdRateFacts.mockImplementation(async (_org, period) => {
    const metrics = options.profitFor(period);
    const ads = options.ads ?? coupangAds();
    const adDates = ads.hasData ? period.selectedDates : [];
    const orderDates = new Set(metrics.sourceCoverage.orderDates);
    const includedDates = adDates.filter((date) => orderDates.has(date));
    return {
      adSpend: includedDates.length > 0 ? ads.spend : null,
      revenue: includedDates.length > 0 ? metrics.revenue : null,
      revenueSource: includedDates.length > 0 ? 'orders' : 'unavailable',
      includedDates,
      adCoverageComplete: ads.hasData,
    };
  });
  wing.fetchDailyAds.mockResolvedValue([]);
  wing.fetchDailyTrend.mockResolvedValue([]);
  wing.findLatestDataDate.mockResolvedValue(null);
  return {
    sales: new DashboardSalesService(profit, sales, wing),
    ad: new DashboardAdService(profit, wing),
  };
}

/** Selected-range aggregates only; other windows report no evidence. */
function selectedOnly(
  fixture: ProfitFixture,
  previousFixture: ProfitFixture = { revenue: 0, orderCount: 0, orderDates: [], netProfit: null },
) {
  return (period: ResolvedDashboardPeriod): RangeProfitMetrics => {
    const first = period.selectedDates[0];
    if (first === SELECTED[0] && period.selectedDates.length === SELECTED.length) {
      return profitMetrics(period, fixture);
    }
    if (first === PREVIOUS[0]) return profitMetrics(period, previousFixture);
    return profitMetrics(period, { revenue: 0, orderCount: 0, orderDates: [], netProfit: null });
  };
}

describe('dashboard sales metricBasis', () => {
  it('publishes a partial revenue basis that keeps an internal hole visible', async () => {
    const { sales } = salesService({
      profitFor: selectedOnly({ orderDates: ['2026-09-01', '2026-09-03', '2026-09-05'] }),
    });

    const result = await sales.getSummary(customContext(), ORGANIZATION_ID);

    expect(result.metricBasis?.['rangeKpi.revenue']).toMatchObject({
      kind: 'period',
      from: '2026-09-01',
      to: '2026-09-05',
      targetDays: 5,
      includedDates: ['2026-09-01', '2026-09-03', '2026-09-05'],
      sources: ['orders'],
    });
    expect(periodStatusOf(result.metricBasis?.['rangeKpi.revenue'])).toBe('partial');
    expect(missingDatesOf(result.metricBasis?.['rangeKpi.revenue'])).toEqual(['2026-09-02', '2026-09-04']);
    expect(result.rangeKpi?.revenue).toBe(100_000);
  });

  it('intersects order and advertising dates for profit and its rate', async () => {
    const { sales } = salesService({
      profitFor: selectedOnly({
        orderDates: ['2026-09-01', '2026-09-02', '2026-09-03'],
      }),
    });

    const result = await sales.getSummary(customContext(), ORGANIZATION_ID);

    // Orders stop on the 3rd, advertising covers all five: profit uses the
    // exact intersection, never the wider ad window.
    expect(result.metricBasis?.['rangeKpi.profit']).toMatchObject({
      includedDates: ['2026-09-01', '2026-09-02', '2026-09-03'],
      sources: ['orders', 'coupang_ads'],
    });
    expect(periodStatusOf(result.metricBasis?.['rangeKpi.profit'])).toBe('partial');
    expect(missingDatesOf(result.metricBasis?.['rangeKpi.profit'])).toEqual(['2026-09-04', '2026-09-05']);
    // A ratio uses the same dates for numerator and denominator.
    expect(result.metricBasis?.['rangeKpi.profitRate']).toMatchObject({
      includedDates: ['2026-09-01', '2026-09-02', '2026-09-03'],
      sources: ['orders', 'coupang_ads'],
    });
  });

  it('names orders alone when the organization has no advertising account', async () => {
    const { sales } = salesService({
      profitFor: selectedOnly({ hasAdAccount: false }),
    });

    const result = await sales.getSummary(customContext(), ORGANIZATION_ID);

    // `NOT_APPLIED` leaves `adDates` legitimately empty. Reading the evidence
    // word rather than the array length keeps this a complete order basis.
    expect(result.metricBasis?.['rangeKpi.profit']).toMatchObject({
      sources: ['orders'],
      includedDates: SELECTED,
    });
    expect(periodStatusOf(result.metricBasis?.['rangeKpi.profit'])).toBe('complete');
  });

  it('keeps a collected zero as included evidence rather than a gap', async () => {
    const { sales } = salesService({
      profitFor: selectedOnly({ revenue: 0, orderCount: 4, netProfit: 0 }),
    });

    const result = await sales.getSummary(customContext(), ORGANIZATION_ID);

    expect(result.rangeKpi?.revenue).toBe(0);
    expect(result.metricBasis?.['rangeKpi.revenue']).toMatchObject({ includedDates: SELECTED });
    expect(periodStatusOf(result.metricBasis?.['rangeKpi.revenue'])).toBe('complete');
  });

  it('leaves profit with no computable date when the sources share none', async () => {
    const { sales } = salesService({
      profitFor: selectedOnly({
        orderDates: ['2026-09-01', '2026-09-02'],
        adDates: ['2026-09-04', '2026-09-05'],
        netProfit: null,
      }),
    });

    const result = await sales.getSummary(customContext(), ORGANIZATION_ID);

    expect(result.metricBasis?.['rangeKpi.profit']).toMatchObject({ includedDates: [] });
    expect(periodStatusOf(result.metricBasis?.['rangeKpi.profit'])).toBe('empty');
    expect(missingDatesOf(result.metricBasis?.['rangeKpi.profit'])).toEqual(SELECTED);
    // The independently successful revenue value is preserved.
    expect(result.rangeKpi?.revenue).toBe(100_000);
    expect(result.metricBasis?.['rangeKpi.revenue']).toMatchObject({
      includedDates: ['2026-09-01', '2026-09-02'],
    });
    expect(periodStatusOf(result.metricBasis?.['rangeKpi.revenue'])).toBe('partial');
  });

  it('distinguishes a failed advertising read from an empty one', async () => {
    const { sales } = salesService({
      profitFor: selectedOnly({
        adDates: [],
        adEvidenceError: true,
        netProfit: null,
      }),
    });
    const empty = salesService({
      profitFor: selectedOnly({ adDates: [], netProfit: null }),
    });

    const failed = await sales.getSummary(customContext(), ORGANIZATION_ID);
    const collected = await empty.sales.getSummary(customContext(), ORGANIZATION_ID);

    expect(failed.metricBasis?.['rangeKpi.profit']).toMatchObject({
      includedDates: [],
      queryFailedSources: ['coupang_ads'],
    });
    expect(periodStatusOf(failed.metricBasis?.['rangeKpi.profit'])).toBe('unverified');
    expect(missingDatesOf(failed.metricBasis?.['rangeKpi.profit'])).toEqual(SELECTED);
    // Normal empty collection carries no query failure.
    expect(collected.metricBasis?.['rangeKpi.profit']).toMatchObject({ includedDates: [] });
    expect(periodStatusOf(collected.metricBasis?.['rangeKpi.profit'])).toBe('empty');
    expect(
      (collected.metricBasis?.['rangeKpi.profit'] as { queryFailedSources?: string[] })
        .queryFailedSources,
    ).toBeUndefined();
  });

  it('marks refused cost inputs invalid instead of missing', async () => {
    const { sales } = salesService({
      profitFor: selectedOnly({ costComplete: false, netProfit: null }),
    });

    const result = await sales.getSummary(customContext(), ORGANIZATION_ID);

    expect(result.metricBasis?.['rangeKpi.profit']).toMatchObject({
      includedDates: [],
      invalidDates: SELECTED,
    });
    expect(periodStatusOf(result.metricBasis?.['rangeKpi.profit'])).toBe('empty');
    expect(result.profitInputs).toBeNull();
  });

  it('publishes profit inputs over the same basis as the profit value', async () => {
    const { sales } = salesService({ profitFor: selectedOnly({}) });

    const result = await sales.getSummary(customContext(), ORGANIZATION_ID);

    expect(result.profitInputs).toMatchObject({
      revenue: 100_000,
      // costOfGoods + commission + shipping + other, advertising separate.
      cost: 50_000,
      adCost: 10_000,
      qty: null,
    });
    expect(result.profitInputs?.basis).toEqual(result.metricBasis?.['rangeKpi.profit']);
  });

  /**
   * The ranking's two numeric columns no longer share a basis. Revenue is
   * ranked from orders alone. Profit is settled per listing from orders *and*
   * ad evidence and withheld when either is short (ADR-0004), so describing it
   * with the orders-only revenue basis claimed a coverage it never had — a
   * column of withheld values reading `sources: [orders] · partial`.
   */
  it('describes the ranking revenue and its profit over their own sources', async () => {
    const { sales } = salesService({
      profitFor: selectedOnly({
        orderDates: ['2026-09-01', '2026-09-02', '2026-09-03'],
      }),
    });

    const result = await sales.getSummary(customContext(), ORGANIZATION_ID);

    expect(result.metricBasis?.['topProducts.revenue']).toMatchObject({
      sources: ['orders'],
    });
    expect(result.metricBasis?.['topProducts.netProfit']).toMatchObject({
      sources: ['orders', 'coupang_ads'],
    });
    expect(result.metricBasis?.['topProducts.netProfit'])
      .toEqual(result.metricBasis?.['rangeKpi.profit']);
  });
});

describe('dashboard ad metricBasis', () => {
  it('publishes account ad bases and intersects the ad-rate denominator', async () => {
    const { ad } = salesService({
      profitFor: selectedOnly({ orderDates: ['2026-09-01', '2026-09-02', '2026-09-03'] }),
      ads: coupangAds({
        spend: 10_000,
        revenue: 40_000,
        impressions: 1_000,
        clicks: 50,
        orders: 5,
        isCollected: true,
        hasData: true,
        coverage: {
          from: '2026-09-01',
          to: '2026-09-05',
          knownThrough: '2026-09-05',
          targetDays: 5,
          completedDays: 5,
          missingDates: [],
        },
        lastObservedAt: new Date('2026-09-06T01:00:00.000Z'),
      }),
    });

    const result = await ad.getSummary(customContext(), ORGANIZATION_ID);

    expect(result.metricBasis?.['rangeKpi.adCost']).toMatchObject({
      sources: ['coupang_ads'],
      includedDates: SELECTED,
    });
    expect(periodStatusOf(result.metricBasis?.['rangeKpi.adCost'])).toBe('complete');
    // adRate divides account ad spend by order revenue, so it uses the dates
    // both sources cover.
    expect(result.metricBasis?.['rangeKpi.adRate']).toMatchObject({
      sources: ['coupang_ads', 'orders'],
      includedDates: ['2026-09-01', '2026-09-02', '2026-09-03'],
    });
    expect(periodStatusOf(result.metricBasis?.['rangeKpi.adRate'])).toBe('partial');
    // ROAS divides two values collected together and keeps the ad basis.
    expect(result.metricBasis?.['rangeKpi.adRoas']).toMatchObject({ sources: ['coupang_ads'] });
    expect(periodStatusOf(result.metricBasis?.['rangeKpi.adRoas'])).toBe('complete');
  });

  it('reports no included ad date when the owner range is incomplete', async () => {
    const { ad } = salesService({
      profitFor: selectedOnly({}),
      ads: coupangAds({
        isCollected: true,
        hasData: false,
        coverage: {
          from: '2026-09-01',
          to: '2026-09-05',
          knownThrough: '2026-09-03',
          targetDays: 5,
          completedDays: 3,
          missingDates: ['2026-09-04', '2026-09-05'],
        },
      }),
    });

    const result = await ad.getSummary(customContext(), ORGANIZATION_ID);

    expect(result.rangeKpi?.adCost).toBeNull();
    expect(result.metricBasis?.['rangeKpi.adCost']).toMatchObject({ includedDates: [] });
    expect(periodStatusOf(result.metricBasis?.['rangeKpi.adCost'])).toBe('empty');
    expect(missingDatesOf(result.metricBasis?.['rangeKpi.adCost'])).toEqual(SELECTED);
  });

  it('publishes our own CVR over the sources that measured it', async () => {
    const { ad } = salesService({
      // Every window is order-backed here, so the benchmark ad rate is the
      // settlement ratio and names both of its sources.
      profitFor: (period) => profitMetrics(period),
      ads: coupangAds({
        spend: 10_000,
        revenue: 40_000,
        impressions: 1_000,
        clicks: 50,
        orders: 5,
        isCollected: true,
        hasData: true,
        coverage: null,
        lastObservedAt: new Date('2026-09-06T01:00:00.000Z'),
      }),
    });

    const result = await ad.getSummary(customContext(), ORGANIZATION_ID);

    // orders / clicks = 10%. Never produced before, so the card read as
    // unavailable even though both inputs were published.
    expect(result.industryBenchmark?.myCvr).toBe(10);
    expect(result.industryBenchmark?.metricBasis?.myCvr).toMatchObject({ sources: ['coupang_ads'] });
    expect(periodStatusOf(result.industryBenchmark?.metricBasis?.myCvr)).toBe('complete');
    expect(result.industryBenchmark?.metricBasis?.myAdRate).toMatchObject({
      sources: ['orders', 'coupang_ads'],
    });
  });

  it('refuses the conversion dates of a covered window whose grid carried no conversion columns', async () => {
    const { ad } = salesService({
      profitFor: selectedOnly({}),
      ads: coupangAds({
        spend: 10_000,
        revenue: 40_000,
        impressions: 1_000,
        clicks: 50,
        // Every date was swept, but one day's grid had no conversion columns.
        conversions: null,
        orders: null,
        isCollected: true,
        hasData: true,
        coverage: {
          from: '2026-09-01',
          to: '2026-09-05',
          knownThrough: '2026-09-05',
          targetDays: 5,
          completedDays: 5,
          missingDates: [],
        },
        lastObservedAt: new Date('2026-09-06T01:00:00.000Z'),
      }),
    });

    const result = await ad.getSummary(customContext(), ORGANIZATION_ID);

    expect(result.adKpi?.conversions).toBeNull();
    expect(result.adKpi?.cvr).toBeNull();
    expect(result.industryBenchmark?.myCvr).toBeNull();
    for (const key of ['adKpi.conversions', 'adKpi.cvr'] as const) {
      expect(result.metricBasis?.[key]).toMatchObject({
        sources: ['coupang_ads'],
        includedDates: [],
        invalidDates: SELECTED,
      });
      expect(periodStatusOf(result.metricBasis?.[key])).toBe('empty');
    }
    const myCvrBasis = result.industryBenchmark?.metricBasis?.myCvr;
    expect(myCvrBasis).toMatchObject({ sources: ['coupang_ads'], includedDates: [] });
    expect(myCvrBasis?.kind === 'period' ? myCvrBasis.invalidDates.length : 0).toBeGreaterThan(0);
    expect(periodStatusOf(myCvrBasis)).toBe('empty');
    // The rest of the account KPIs were measured and keep their complete basis.
    expect(result.adKpi?.clicks).toBe(50);
    expect(periodStatusOf(result.metricBasis?.['adKpi.clicks'])).toBe('complete');
    expect(periodStatusOf(result.industryBenchmark?.metricBasis?.myCtr)).toBe('complete');
  });

  it('leaves our CVR unavailable rather than zero when clicks are unmeasured', async () => {
    const { ad } = salesService({ profitFor: selectedOnly({}) });

    const result = await ad.getSummary(customContext(), ORGANIZATION_ID);

    expect(result.industryBenchmark?.myCvr).toBeNull();
  });
});

/**
 * Published calculation bases for `/api/dashboard/inventory`.
 *
 * The consumer half of this contract shipped first: the dashboard's warning
 * cards render a number only when the value's own basis says it is measured,
 * so a payload with no `metricBasis` rendered every warning as the unavailable
 * marker while the server was computing real counts. These cases are the
 * producer half.
 *
 * Every entry is a `snapshot`. The amendment keeps inventory, product counts
 * and ABC on their stored owner results' actual as-of and source validity
 * instead of force-fitting them into period aggregation.
 */
describe('dashboard inventory metricBasis', () => {
  /** The counts a warning card displays, and the ABC as-of behind a grade. */
  function inventoryService(
    evaluatedAsOf: Partial<AbcEvaluationAsOf> = {},
    abcOverrides: Partial<DashboardAbcFacts> = {},
    perListing: Partial<DashboardPerListingMetricsResult> = {},
  ) {
    const repository = buildMockDashboardInventoryRepo();
    repository.readProductAbcFacts.mockResolvedValue({
      gradeRows: [{ abcGrade: 'A', count: 2 }],
      statusRows: [{ displayStatus: 'READY', count: 2 }],
      contributionRows: [],
      withheldContributionProductCount: 0,
      unclassifiedProductCount: 0,
      formula: null,
      evaluatedAsOf: {
        targetCutoff: '2026-08-31',
        actualCutoff: '2026-08-31',
        capturedAt: '2026-09-02T00:00:00.000Z',
        ...evaluatedAsOf,
      },
      publication: null,
      gradeChanges: [],
      aGradeMasterProductIds: [],
      ...abcOverrides,
    });
    repository.findUnreadAlerts.mockResolvedValue([]);
    repository.countActiveProducts.mockResolvedValue(5);
    repository.fetchPerListingMetrics.mockResolvedValue({
      rows: [{ revenue: 1_000, adCost: 300, netProfit: -200, profitRate: -20 }],
      withheldListings: 0,
      orderWindowComplete: true,
      ...perListing,
    });
    repository.readInventoryAvailabilityFacts.mockResolvedValue({
      outOfStockSkus: 3,
      linkedMasterProductCount: 4,
      mappingStatusRows: [{ mappingStatus: 'unmatched', count: 2 }],
      snapshot: {
        collected: true,
        generation: '1',
        verifiedAt: '2026-09-08T00:00:00.000Z',
      },
    });
    repository.countLowCtrThumbnails.mockResolvedValue(0);
    repository.findReviewCountsForProducts.mockResolvedValue([]);
    return new DashboardInventoryService(repository);
  }

  /** Every dotted key the dashboard UI reads off the inventory payload. */
  const DISPLAYED_KEYS = [
    'totalProducts',
    'channelLinkedProducts',
    'channelUnlinkedProducts',
    'gradeCount.A',
    'gradeCount.B',
    'gradeCount.C',
    'classifiedProductCount',
    'unclassifiedProductCount',
    'abcStatusCount.READY',
    'abcStatusCount.INSUFFICIENT_EVIDENCE',
    'abcStatusCount.SOURCE_UNMAPPED',
    'abcStatusCount.SELLPIA_SOURCE_STALE',
    'abcStatusCount.AD_SOURCE_STALE',
    'abcContributionProfit.amountByGrade.A',
    'abcContributionProfit.amountByGrade.B',
    'abcContributionProfit.amountByGrade.C',
    'abcContributionProfit.shareByGrade.A',
    'abcContributionProfit.shareByGrade.B',
    'abcContributionProfit.shareByGrade.C',
    'gradeChanges.upgraded',
    'gradeChanges.downgraded',
    'gradeChanges.total',
    'alerts',
    'warnings.minusProducts',
    'warnings.lowProfitProducts',
    'warnings.highAdProducts',
    'warnings.outOfStockSkus',
    'warnings.mappingAttentionSkus',
  ] as const;

  it('publishes a snapshot basis for every value the dashboard displays', async () => {
    const result = await inventoryService().getSummary(customContext(), ORGANIZATION_ID);

    expect(Object.keys(result.metricBasis ?? {}).sort()).toEqual([...DISPLAYED_KEYS].sort());
    for (const key of DISPLAYED_KEYS) {
      expect(result.metricBasis?.[key], key).toMatchObject({ kind: 'snapshot' });
    }
  });

  it('backs each of the five warning counts with a measured, non-unavailable basis', async () => {
    const result = await inventoryService().getSummary(customContext(), ORGANIZATION_ID);

    // A warning basis that is `unavailable` is what makes the card render the
    // unavailable marker, so every one of these must be a real owner as-of.
    expect(result.metricBasis?.['warnings.minusProducts']).toEqual({
      kind: 'snapshot',
      measured: true,
      asOf: '2026-09-08',
      requiredAsOf: '2026-09-08',
      observedAt: expect.any(String),
      sources: ['orders', 'channel_listings'],
      withheldCount: 0,
    });
    expect(snapshotStatusOf(result.metricBasis?.['warnings.minusProducts'])).toBe('current');
    expect(result.metricBasis?.['warnings.outOfStockSkus']).toMatchObject({ sources: ['sellpia_inventory'] });
    expect(snapshotStatusOf(result.metricBasis?.['warnings.outOfStockSkus'])).toBe('current');
    expect(result.metricBasis?.['warnings.mappingAttentionSkus']).toMatchObject({
      sources: ['channel_listings', 'sellpia_inventory'],
    });
    expect(snapshotStatusOf(result.metricBasis?.['warnings.mappingAttentionSkus'])).toBe('current');
    // The linked/unlinked split is direct Products + Channels CONFIG; an
    // inventory recipe or stock publication is not required.
    expect(result.metricBasis?.channelLinkedProducts).toMatchObject({
      sources: ['products', 'channel_listings'],
    });
    for (const key of ['warnings.lowProfitProducts', 'warnings.highAdProducts'] as const) {
      expect(snapshotStatusOf(result.metricBasis?.[key]), key).toBe('current');
    }
  });

  it('publishes `unavailable` only where a value truly has no owner evidence', async () => {
    const result = await inventoryService().getSummary(customContext(), ORGANIZATION_ID);

    // `unavailable` is the one snapshot status that blanks a card, so this is
    // the producer-side statement of the consumer's display rule.
    expect(
      Object.entries(result.metricBasis ?? {})
        .filter(([, basis]) => basis.kind === 'snapshot' && !basis.measured)
        .map(([key]) => key),
    ).toEqual([
      'abcContributionProfit.amountByGrade.A',
      'abcContributionProfit.amountByGrade.B',
      'abcContributionProfit.amountByGrade.C',
      'abcContributionProfit.shareByGrade.A',
      'abcContributionProfit.shareByGrade.B',
      'abcContributionProfit.shareByGrade.C',
    ]);
  });

  /** The three warning counts drawn from per-listing profit over an order window. */
  const PER_LISTING_WARNING_KEYS = [
    'warnings.minusProducts',
    'warnings.lowProfitProducts',
    'warnings.highAdProducts',
  ] as const;

  /**
   * D2 — the per-listing warnings count listings over collected order rows.
   * Until the Orders collection covers every date of their window those rows
   * are only what it has collected so far, so no count over them is a
   * measurement: an empty read is not "no loss-making listing", and a read
   * with rows is not a complete count.
   */
  it('publishes the per-listing warnings unavailable while orders did not cover their window', async () => {
    const lossRow = { revenue: 1_000, adCost: 300, netProfit: -200, profitRate: -20 };
    const shortReads: DashboardPerListingMetricsResult['rows'][] = [[], [lossRow]];
    for (const rows of shortReads) {
      const result = await inventoryService({}, {}, { rows, orderWindowComplete: false })
        .getSummary(customContext(), ORGANIZATION_ID);

      for (const key of PER_LISTING_WARNING_KEYS) {
        expect(result.metricBasis?.[key], `${key} over ${rows.length} row(s)`).toMatchObject({
          kind: 'snapshot',
          measured: false,
          asOf: null,
          withheldCount: 0,
        });
        expect(snapshotStatusOf(result.metricBasis?.[key]), key).toBe('unavailable');
      }
      // Stock and mapping read no order window and keep their own evidence.
      expect(snapshotStatusOf(result.metricBasis?.['warnings.outOfStockSkus'])).toBe('current');
      expect(snapshotStatusOf(result.metricBasis?.['warnings.mappingAttentionSkus'])).toBe('current');
    }

    // Once orders covered every date, an empty population is a counted zero.
    const covered = await inventoryService({}, {}, { rows: [], orderWindowComplete: true })
      .getSummary(customContext(), ORGANIZATION_ID);
    expect(covered.warnings.minusProducts).toBe(0);
    for (const key of PER_LISTING_WARNING_KEYS) {
      expect(snapshotStatusOf(covered.metricBasis?.[key]), key).toBe('current');
    }
  });

  it('names the ABC evaluation as-of rather than the read clock for a stored grade', async () => {
    const result = await inventoryService().getSummary(customContext(), ORGANIZATION_ID);

    expect(result.metricBasis?.['gradeCount.A']).toMatchObject({
      kind: 'snapshot',
      measured: true,
      asOf: '2026-08-31',
      observedAt: '2026-09-02T00:00:00.000Z',
      sources: ['products', 'product_abc'],
      withheldCount: 0,
    });
    expect(snapshotStatusOf(result.metricBasis?.['gradeCount.A'])).toBe('current');
    expect(result.metricBasis?.['abcStatusCount.READY'])
      .toEqual(result.metricBasis?.['gradeCount.A']);
  });

  it('keeps the active Products unclassified count actionable without an ABC publication', async () => {
    const result = await inventoryService({}, {
      gradeRows: [],
      statusRows: [],
      contributionRows: [],
      unclassifiedProductCount: 5,
      publication: null,
    }).getSummary(customContext(), ORGANIZATION_ID);

    expect(result.unclassifiedProductCount).toBe(5);
    expect(result.metricBasis?.unclassifiedProductCount).toMatchObject({
      kind: 'snapshot',
      measured: true,
      sources: ['products'],
    });
    expect(result.metricBasis?.['gradeCount.A']).toMatchObject({ measured: false });
  });

  it('retains a grade whose evidence stopped short of the asked-for cutoff as stale', async () => {
    const result = await inventoryService({ actualCutoff: '2026-06-30' })
      .getSummary(customContext(), ORGANIZATION_ID);

    // Latest data not applied. The count stays displayable; only its age moves.
    expect(result.metricBasis?.['gradeCount.A']).toMatchObject({ asOf: '2026-06-30' });
    expect(snapshotStatusOf(result.metricBasis?.['gradeCount.A'])).toBe('stale');
    expect(result.gradeCount.A).toBe(2);
  });

  it('leaves a grade with no owner cutoff unknown rather than unavailable', async () => {
    const result = await inventoryService({ actualCutoff: null, capturedAt: null })
      .getSummary(customContext(), ORGANIZATION_ID);

    // The counts are a real read of stored grades; only their age is unknown,
    // and an unknown snapshot keeps its number on screen.
    expect(result.metricBasis?.['gradeCount.A']).toMatchObject({ asOf: null });
    expect(snapshotStatusOf(result.metricBasis?.['gradeCount.A'])).toBe('unknown');
  });

  it('publishes no period basis for an inventory value', async () => {
    const result = await inventoryService().getSummary(customContext(), ORGANIZATION_ID);

    expect(
      Object.entries(result.metricBasis ?? {}).filter(([, basis]) => basis.kind !== 'snapshot'),
    ).toEqual([]);
  });
});
