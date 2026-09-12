import { describe, expect, it, vi } from 'vitest';
import { WingTrafficAggregationRepositoryAdapter } from './wing-traffic-aggregation.repository.adapter';
import { periodOf } from '../../../__tests__/test-helpers/period';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const ACTIVE_ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const ATTEMPT_ID = '22222222-2222-4222-8222-222222222222';


function accountDaily(
  businessDate: string,
  values: Partial<{
    visitors: number;
    views: number;
    cartAdds: number;
    orders: number;
    salesQty: number;
    revenue: number;
    providerConversionRate: number | null;
  }> = {},
  observedAt = `${businessDate}T15:00:00.000Z`,
) {
  return {
    businessDate,
    observedAt,
    sourceAttemptId: ATTEMPT_ID,
    providerConversionRate: values.providerConversionRate ?? null,
    visitors: values.visitors ?? 0,
    views: values.views ?? 0,
    cartAdds: values.cartAdds ?? 0,
    orders: values.orders ?? 0,
    salesQty: values.salesQty ?? 0,
    revenue: values.revenue ?? 0,
  };
}

function reconciliation(overrides: Record<string, Record<string, unknown>> = {}) {
  const metric = (dailySum: number, periodValue: number | null = dailySum) => ({
    status: 'MATCHED' as const,
    dailySum,
    periodValue,
  });
  return {
    views: metric(600),
    cartAdds: metric(12),
    orders: metric(17),
    salesQty: metric(21),
    revenue: metric(600),
    ...overrides,
  };
}

function dailyPublication(
  rows: ReturnType<typeof accountDaily>[],
  overrides: Record<string, unknown> = {},
) {
  return {
    channelAccountId: ACTIVE_ACCOUNT_ID,
    attemptId: ATTEMPT_ID,
    plan: {
      sourceType: 'coupang_wing_traffic',
      parserVersion: 'wing-traffic-daily-v2',
      channelAccountId: ACTIVE_ACCOUNT_ID,
      expectedAdvertiserId: 'VENDOR-A',
      providerVendorId: 'VENDOR-A',
      startDate: rows[0]?.businessDate ?? '2026-07-01',
      endDate: rows.at(-1)?.businessDate ?? '2026-07-03',
      businessDate: rows.at(-1)?.businessDate ?? '2026-07-03',
      periodDays: 3,
      expectedDates: ['2026-07-01', '2026-07-02', '2026-07-03'],
      filterScope: 'ALL_NORMAL_RFM',
      targetUrl: null,
    },
    providerVendorId: 'VENDOR-A',
    filterScope: 'ALL_NORMAL_RFM',
    accountDaily: rows,
    optionDaily: [
      {
        businessDate: '2026-07-01',
        observedAt: '2026-07-01T15:00:00.000Z',
        sourceAttemptId: ATTEMPT_ID,
        listingId: null,
        listingOptionId: null,
        externalId: 'UNMATCHED',
        externalOptionId: 'OPTION-1',
        traffic: {
          visitors: 9_999,
          views: 9_999,
          cartAdds: 9_999,
          orders: 9_999,
          salesQty: 9_999,
          revenue: 9_999,
        },
      },
    ],
    periodSummary: {
      startDate: '2026-07-01',
      endDate: '2026-07-03',
      observedAt: '2026-07-04T01:00:00.000Z',
      sourceAttemptId: ATTEMPT_ID,
      providerVendorId: 'VENDOR-A',
      filterScope: 'ALL_NORMAL_RFM',
      accountSummary: {
        visitors: 495,
        views: 600,
        cartAdds: 12,
        orders: 17,
        salesQty: 21,
        revenue: 600,
        providerConversionRate: 2.85,
      },
      accountSummaryRaw: { source: 'wing-period-original' },
    },
    coverage: {
      from: '2026-07-01',
      to: '2026-07-03',
      targetDays: 3,
      completedDays: rows.length,
      missingDates: [],
    },
    reconciliation: reconciliation(),
    legacyExactPeriodEvidence: null,
    ...overrides,
  };
}

function legacyPublication() {
  return {
    channelAccountId: ACTIVE_ACCOUNT_ID,
    attemptId: ATTEMPT_ID,
    plan: {
      sourceType: 'coupang_wing_traffic',
      parserVersion: 'wing-traffic-v1',
      channelAccountId: ACTIVE_ACCOUNT_ID,
      expectedAdvertiserId: 'VENDOR-A',
      startDate: '2026-07-01',
      endDate: '2026-07-03',
      businessDate: '2026-07-01',
      periodDays: 3,
      targetUrl: null,
    },
    rows: [{
      listingId: '33333333-3333-4333-8333-333333333333',
      externalId: 'LEGACY',
      businessDate: '2026-07-01',
      observedAt: '2026-07-01T15:00:00.000Z',
      traffic: {
        visitors: 99,
        views: 99,
        cartAdds: 99,
        orders: 99,
        salesQty: 99,
        revenue: 99,
      },
    }],
    dashboard: {
      summary: { visitors: 88, views: 88, orders: 88, revenue: 88 },
      timestamp: '2026-07-03T01:00:00.000Z',
    },
  };
}


function buildAdapter() {
  const trafficReadPublished = vi.fn().mockResolvedValue(
    dailyPublication([
      accountDaily('2026-07-01'),
      accountDaily('2026-07-02'),
      accountDaily('2026-07-03'),
    ]),
  );
  // Ad facts come from the listing ledger, not the account summary: the
  // account table only has a row on the days the ad-centre scrape ran.
  const adsGroupBy = vi.fn().mockResolvedValue([]);
  return {
    adapter: new WingTrafficAggregationRepositoryAdapter(
      { readPublished: trafficReadPublished },
      { channelListingDailySnapshot: { groupBy: adsGroupBy, findFirst: vi.fn() } } as never,
    ),
    trafficReadPublished,
    adsGroupBy,
  };
}

/** One grouped business date, as `readAdWindowFacts` sees it. */
function adsDay(businessDate: string, overrides: Record<string, number> = {}) {
  const sums = {
    adSpend: 100, adRevenue: 900, adImpressions: 2_000,
    adClicks: 50, adConversions: 700, adOrders: 7,
    ...overrides,
  };
  return {
    businessDate: new Date(`${businessDate}T00:00:00.000Z`),
    _sum: sums,
    _max: { adObservedAt: new Date(`${businessDate}T01:00:00.000Z`) },
  };
}

describe('WingTrafficAggregationRepositoryAdapter account daily read', () => {
  it('uses accountDaily, averages daily visitors, computes orders/views, and keeps provider CVR', async () => {
    const { adapter, trafficReadPublished } = buildAdapter();
    trafficReadPublished.mockResolvedValue(dailyPublication([
      accountDaily('2026-07-01', {
        visitors: 30, views: 100, cartAdds: 2, orders: 3, salesQty: 4, revenue: 100,
        providerConversionRate: 2.9,
      }),
      accountDaily('2026-07-02', {
        visitors: 40, views: 200, cartAdds: 4, orders: 5, salesQty: 6, revenue: 200,
        providerConversionRate: 2.5,
      }),
      accountDaily('2026-07-03', {
        visitors: 50, views: 300, cartAdds: 6, orders: 9, salesQty: 11, revenue: 300,
        providerConversionRate: 2.8,
      }),
    ]));

    await expect(
      adapter.aggregateTraffic(ORGANIZATION_ID, periodOf(new Date('2026-06-30T15:00:00.000Z'), new Date('2026-07-03T15:00:00.000Z'))),
    ).resolves.toMatchObject({
      revenue: 600,
      orders: 17,
      salesQty: 21,
      visitors: 40,
      dailyAverageVisitors: 40,
      views: 600,
      cartAdds: 12,
      conversionRate: (17 / 600) * 100,
      providerConversionRate: 2.85,
      isCollected: true,
      hasData: true,
      coverage: {
        from: '2026-07-01',
        to: '2026-07-03',
        targetDays: 3,
        completedDays: 3,
        missingDates: [],
      },
      reconciliation: {
        revenue: { status: 'MATCHED', dailySum: 600, periodValue: 600 },
      },
    });
    expect(trafficReadPublished).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      from: '2026-07-01',
      to: '2026-07-03',
    });
  });

  it('keeps a single-day provider CVR separate from the own orders/views ratio', async () => {
    const { adapter, trafficReadPublished } = buildAdapter();
    trafficReadPublished.mockResolvedValue(dailyPublication([
      accountDaily('2026-07-01', {
        views: 100,
        orders: 3,
        providerConversionRate: 3.7,
      }),
    ], { periodSummary: null }));

    await expect(adapter.aggregateTraffic(ORGANIZATION_ID, periodOf(new Date('2026-06-30T15:00:00.000Z'), new Date('2026-07-01T15:00:00.000Z')))).resolves.toMatchObject({
      conversionRate: 3,
      providerConversionRate: 3.7,
      coverage: {
        targetDays: 1,
        completedDays: 1,
        missingDates: [],
      },
    });
  });

  it('does not sum option rows or matched listing rows into account totals', async () => {
    const { adapter, trafficReadPublished } = buildAdapter();
    trafficReadPublished.mockResolvedValue(dailyPublication([
      accountDaily('2026-07-01', {
        visitors: 10, views: 20, cartAdds: 2, orders: 3, salesQty: 3, revenue: 100,
      }),
      accountDaily('2026-07-02', {
        visitors: 12, views: 24, cartAdds: 3, orders: 4, salesQty: 4, revenue: 120,
      }),
      accountDaily('2026-07-03', {
        visitors: 14, views: 28, cartAdds: 4, orders: 5, salesQty: 5, revenue: 140,
      }),
    ]));

    const result = await adapter.aggregateTraffic(ORGANIZATION_ID, periodOf(new Date('2026-06-30T15:00:00.000Z'), new Date('2026-07-03T15:00:00.000Z')));
    expect(result).toMatchObject({
      revenue: 360,
      orders: 12,
      visitors: 12,
      views: 72,
    });
    expect(result.revenue).not.toBe(9_999 + 360);
    expect(result.visitors).not.toBe(9_999 + 12);
  });

  it('marks missing days separately from explicit all-zero days', async () => {
    const { adapter, trafficReadPublished } = buildAdapter();
    trafficReadPublished.mockResolvedValue(dailyPublication([
      accountDaily('2026-07-01', { visitors: 10, views: 20 }),
      accountDaily('2026-07-03', { visitors: 0, views: 0 }),
    ]));
    const partial = await adapter.aggregateTraffic(ORGANIZATION_ID, periodOf(new Date('2026-06-30T15:00:00.000Z'), new Date('2026-07-03T15:00:00.000Z')));
    expect(partial.coverage).toEqual({
      from: '2026-07-01',
      to: '2026-07-03',
      targetDays: 3,
      completedDays: 2,
      missingDates: ['2026-07-02'],
    });
    // The average is over the days it covers, not the days requested. Dividing
    // by three here would report 3.3 for two days that measured 10 and 0 —
    // understating both, which is the same error as reading 07-02 as a zero.
    expect(partial.dailyAverageVisitors).toBe(5);
    // A partial window still cannot stand in for the period's revenue. That is
    // a separate gate and this change does not touch it.
    expect(partial.hasData).toBe(false);

    trafficReadPublished.mockResolvedValue(dailyPublication([
      accountDaily('2026-07-03', { visitors: 0, views: 0, orders: 0, revenue: 0 }),
    ]));
    const zero = await adapter.aggregateTraffic(ORGANIZATION_ID, periodOf(new Date('2026-07-02T15:00:00.000Z'), new Date('2026-07-03T15:00:00.000Z')));
    expect(zero).toMatchObject({
      revenue: 0,
      orders: 0,
      visitors: 0,
      dailyAverageVisitors: 0,
      isCollected: true,
      hasData: true,
      coverage: { targetDays: 1, completedDays: 1, missingDates: [] },
    });
  });

  it('ignores legacy rows/dashboard and old period anchors', async () => {
    const { adapter, trafficReadPublished } = buildAdapter();
    trafficReadPublished.mockResolvedValue(legacyPublication());
    await expect(
      adapter.aggregateTraffic(ORGANIZATION_ID, periodOf(new Date('2026-06-30T15:00:00.000Z'), new Date('2026-07-03T15:00:00.000Z'))),
    ).resolves.toMatchObject({ hasData: false, isCollected: false, lastObservedAt: null });
    await expect(adapter.fetchDailyTrend(
      ORGANIZATION_ID,
      new Date('2026-06-30T15:00:00.000Z'),
      new Date('2026-07-03T15:00:00.000Z'),
    )).resolves.toEqual([]);
    await expect(adapter.findLatestDataDate(ORGANIZATION_ID)).resolves.toBeNull();
  });

  it('reports zero completed days across the requested range when no publication exists', async () => {
    const { adapter, trafficReadPublished } = buildAdapter();
    trafficReadPublished.mockResolvedValue(null);

    await expect(adapter.aggregateTraffic(ORGANIZATION_ID, periodOf(new Date('2026-06-30T15:00:00.000Z'), new Date('2026-07-03T15:00:00.000Z')))).resolves.toMatchObject({
      isCollected: false,
      hasData: false,
      coverage: {
        from: '2026-07-01',
        to: '2026-07-03',
        targetDays: 3,
        completedDays: 0,
        missingDates: ['2026-07-01', '2026-07-02', '2026-07-03'],
      },
    });
  });

  it('selects the newest replacement for a date and preserves the row attempt/cutoff', async () => {
    const { adapter, trafficReadPublished } = buildAdapter();
    trafficReadPublished.mockResolvedValue(dailyPublication([
      accountDaily('2026-07-01', { visitors: 1, revenue: 10 }, '2026-07-02T01:00:00.000Z'),
      accountDaily('2026-07-01', { visitors: 20, revenue: 200 }, '2026-07-03T01:00:00.000Z'),
    ], {
      attemptId: '44444444-4444-4444-8444-444444444444',
    }));
    const result = await adapter.aggregateTraffic(ORGANIZATION_ID, periodOf(new Date('2026-06-30T15:00:00.000Z'), new Date('2026-07-01T15:00:00.000Z')));
    expect(result).toMatchObject({
      revenue: 200,
      visitors: 20,
      sourceAttemptId: ATTEMPT_ID,
      lastObservedAt: new Date('2026-07-03T01:00:00.000Z'),
    });
  });
});

describe('WingTrafficAggregationRepositoryAdapter Coupang ads read', () => {
  it('maps complete owner rows, preserves ad sums, observed cutoff, and KST half-open bounds', async () => {
    const { adapter, adsGroupBy } = buildAdapter();
    adsGroupBy.mockResolvedValue([
      adsDay('2026-07-01'),
      adsDay('2026-07-02', {
        adSpend: 200, adRevenue: 1_800, adImpressions: 3_000,
        adClicks: 80, adConversions: 1_200, adOrders: 11,
      }),
    ]);

    await expect(
      adapter.aggregateCoupangAds(ORGANIZATION_ID, periodOf(new Date('2026-06-30T15:00:00.000Z'), new Date('2026-07-02T15:00:00.000Z'))),
    ).resolves.toEqual({
      spend: 300,
      revenue: 2_700,
      impressions: 5_000,
      clicks: 130,
      conversions: 1_900,
      orders: 18,
      conversionRate: (18 / 130) * 100,
      providerConversionRate: null,
      coverage: {
        from: '2026-07-01',
        to: '2026-07-02',
        knownThrough: '2026-07-02',
        targetDays: 2,
        completedDays: 2,
        missingDates: [],
      },
      isCollected: true,
      hasData: true,
      lastObservedAt: new Date('2026-07-02T01:00:00.000Z'),
    });
    // Half-open `[from, to)` over the window's business dates, so the last
    // selected date is included and the day after it is not.
    expect(adsGroupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        businessDate: {
          gte: new Date('2026-07-01T00:00:00.000Z'),
          lt: new Date('2026-07-03T00:00:00.000Z'),
        },
        adObservedAt: { not: null },
      }),
    }));
  });

  it('keeps an all-zero ads row distinct from missing ads rows', async () => {
    const { adapter, adsGroupBy } = buildAdapter();
    // `CONFIRMED_ZERO` rows group to zero sums and are still a covered day —
    // that is the whole point of the coverage filter.
    adsGroupBy.mockResolvedValue([
      adsDay('2026-07-01', {
        adSpend: 0, adRevenue: 0, adImpressions: 0,
        adClicks: 0, adConversions: 0, adOrders: 0,
      }),
    ]);

    await expect(adapter.aggregateCoupangAds(ORGANIZATION_ID, periodOf(new Date('2026-06-30T15:00:00.000Z'), new Date('2026-07-01T15:00:00.000Z')))).resolves.toMatchObject({
      hasData: true,
      isCollected: true,
      conversionRate: null,
      coverage: {
        knownThrough: '2026-07-01',
        targetDays: 1,
        completedDays: 1,
        missingDates: [],
      },
    });
  });

  // The anchor is injectable precisely so a deterministic caller can evaluate
  // a historical calendar. Reading the process clock here silently unanchored
  // every anchored caller, so the cutoff must come from the resolved period.
  it('takes the ads coverage cutoff from the caller anchor, not the wall clock', async () => {
    const { adapter, adsGroupBy } = buildAdapter();
    adsGroupBy.mockResolvedValue([adsDay('2026-07-01', { adSpend: 10 })]);

    const result = await adapter.aggregateCoupangAds(
      ORGANIZATION_ID,
      periodOf(
        new Date('2026-06-30T15:00:00.000Z'),
        new Date('2026-07-03T15:00:00.000Z'),
        { anchor: new Date('2026-07-02T03:00:00.000Z'), sourceClass: 'closed_day_clipped' },
      ),
    );

    expect(result.coverage).toMatchObject({
      from: '2026-07-01',
      to: '2026-07-03',
      // The anchor's last completed KST day, not today's.
      knownThrough: '2026-07-01',
      targetDays: 3,
      completedDays: 1,
      missingDates: ['2026-07-02', '2026-07-03'],
    });
  });
});
