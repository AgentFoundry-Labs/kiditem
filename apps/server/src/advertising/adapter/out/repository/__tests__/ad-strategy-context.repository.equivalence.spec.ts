import { describe, it, expect, vi } from 'vitest';
import { AdStrategyContextRepositoryAdapter } from '../ad-strategy-context.repository.adapter';
import type { AdsConfig } from '../../../../domain/model/strategy-types';

// Equivalence snapshot for `AdStrategyContextRepositoryAdapter.loadStrategyContext`.
//
// Purpose: pin the structural shape of the `StrategyContext` returned by the
// adapter so the back-reference refactor — where the adapter no longer reaches
// into `AdConfigService` and instead receives `config` as a parameter — cannot
// silently change the output. The critical regression-guard is the
// referential-equality assertion on the `config` field: if anyone re-introduces
// a back-reference that rebuilds/clones the config, that `toBe` check fails.
//
// This is a unit-style spec with a hand-crafted Prisma mock; it only walks the
// happy path with empty fixtures. Detailed SQL semantics are covered by the
// integration specs (`ad-strategy-flow.pg.integration.spec.ts`).
describe('AdStrategyContextRepositoryAdapter — loadStrategyContext equivalence snapshot', () => {
  const buildPrismaMock = () => ({
    channelListingDailySnapshot: {
      groupBy: vi.fn().mockResolvedValue([]),
      findMany: vi.fn().mockResolvedValue([]),
    },
    channelListing: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    masterProduct: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    productOption: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    channelListingOption: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    inventory: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
  });

  const buildReviewStatsMock = () => ({
    loadListingReviewStats: vi.fn().mockResolvedValue({
      lifetime: [],
      recent: [],
    }),
  });

  // These fixtures carry no listings, so `loadStrategyContext` short-circuits
  // before it asks the owner anything. The adapter still requires the port, and
  // leaving it out only compiles because the Prisma mock is cast.
  const buildAdAccountKpiMock = () => ({
    readPublished: vi.fn().mockResolvedValue({
      channelAccountId: null,
      rows: [],
    }),
  });

  it('returns the StrategyContext keys agreed with the strategy services', async () => {
    const prismaMock = buildPrismaMock();
    const adapter = new AdStrategyContextRepositoryAdapter(
      prismaMock as any,
      buildReviewStatsMock(),
      buildAdAccountKpiMock() as any,
    );
    const config = Object.freeze({ marker: 'TEST_CONFIG' }) as unknown as AdsConfig;

    const result = await adapter.loadStrategyContext('org-1', 2026, 5, '14d', config);

    expect(Object.keys(result).sort()).toEqual(
      [
        'adGroups',
        'adIssuesAdGroups',
        'channelStateByListing',
        'config',
        'gradeMap',
        'listings',
        'profitRateByListing',
        'trafficByListing',
      ].sort(),
    );
  });

  it('returns the exact `config` reference passed in (back-reference regression guard)', async () => {
    const prismaMock = buildPrismaMock();
    const adapter = new AdStrategyContextRepositoryAdapter(
      prismaMock as any,
      buildReviewStatsMock(),
      buildAdAccountKpiMock() as any,
    );
    const config = Object.freeze({ marker: 'TEST_CONFIG' }) as unknown as AdsConfig;

    const result = await adapter.loadStrategyContext('org-1', 2026, 5, '14d', config);

    // Referential equality — if anyone re-introduces an AdConfigService back-
    // reference inside the adapter that rebuilds/clones the config, this fails.
    expect(result.config).toBe(config);
  });

  it('bounds every ad and traffic aggregate to the selected period', async () => {
    const prismaMock = buildPrismaMock();
    const adapter = new AdStrategyContextRepositoryAdapter(
      prismaMock as any,
      buildReviewStatsMock(),
      buildAdAccountKpiMock() as any,
    );
    const config = Object.freeze({ marker: 'TEST_CONFIG' }) as unknown as AdsConfig;

    await adapter.loadStrategyContext('org-1', 2026, 5, '7d', config);

    expect(prismaMock.channelListingDailySnapshot.groupBy).toHaveBeenCalledTimes(1);
    // The listing-day ad reader's window is half-open and gated on the
    // observation timestamp.
    expect(prismaMock.channelListingDailySnapshot.groupBy.mock.calls[0]![0].where).toEqual(expect.objectContaining({
      businessDate: { gte: expect.any(Date), lt: expect.any(Date) },
      adObservedAt: { not: null },
    }));
    expect(prismaMock.channelListingDailySnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessDate: {
            gte: expect.any(Date),
            lte: expect.any(Date),
          },
        }),
        select: expect.objectContaining({ trafficObservedAt: true }),
      }),
    );
  });

  it('drops legacy period-as-day traffic while retaining v2 daily projections', async () => {
    const prismaMock = buildPrismaMock();
    prismaMock.channelListingDailySnapshot.findMany.mockResolvedValue([
      {
        listingId: 'legacy-listing',
        businessDate: new Date('2026-05-01T00:00:00.000Z'),
        trafficRevenue: 99_999,
        trafficOrders: 99,
        // Never reported by the traffic source: not a measurement.
        trafficObservedAt: null,
      },
      {
        listingId: 'daily-listing',
        businessDate: new Date('2026-05-01T00:00:00.000Z'),
        trafficRevenue: 123,
        trafficOrders: 2,
        trafficObservedAt: new Date('2026-05-01T02:00:00.000Z'),
        metaJson: {
          'wing.traffic': {
            grain: 'listing_option_sum',
            scope: 'matched_listings',
            periodDays: 1,
            sourceAttemptId: '00000000-0000-4000-8000-000000000010',
            businessDate: '2026-05-01',
          },
        },
      },
    ]);
    const adapter = new AdStrategyContextRepositoryAdapter(
      prismaMock as any,
      buildReviewStatsMock(),
      buildAdAccountKpiMock() as any,
    );
    const config = Object.freeze({ marker: 'TEST_CONFIG' }) as unknown as AdsConfig;

    const result = await adapter.loadStrategyContext('org-1', 2026, 5, '7d', config);

    expect(result.trafficByListing).toEqual(new Map([
      ['daily-listing', { revenue: 123, orders: 2 }],
    ]));
  });

  it('delegates review aggregates to the Orders-owned complete-fact read port', async () => {
    const prismaMock = buildPrismaMock();
    const reviewStatsMock = buildReviewStatsMock();
    reviewStatsMock.loadListingReviewStats.mockResolvedValue({
      lifetime: [
        { listingId: 'listing-1', totalReviews: 4, avgRating: 4.25 },
      ],
      recent: [{ listingId: 'listing-1', count: 2 }],
    });
    const adapter = new AdStrategyContextRepositoryAdapter(
      prismaMock as any,
      reviewStatsMock,
      buildAdAccountKpiMock() as any,
    );
    const recentSince = new Date('2026-05-01T00:00:00.000Z');
    const trafficSince = new Date('2026-05-02T00:00:00.000Z');

    const result = await adapter.loadExposureAnalysisContext(
      'org-1',
      ['listing-1'],
      { recentReviewSince: recentSince, trafficSince },
    );

    expect(reviewStatsMock.loadListingReviewStats).toHaveBeenCalledWith({
      organizationId: 'org-1',
      listingIds: ['listing-1'],
      recentSince,
    });
    expect(result.reviewStats).toEqual([
      { listingId: 'listing-1', totalReviews: 4, avgRating: 4.25 },
    ]);
    expect(result.recentReviewCounts).toEqual([
      { listingId: 'listing-1', count: 2 },
    ]);
    expect(prismaMock).not.toHaveProperty('review');
  });

  it('produces empty Maps / arrays when the underlying tables are empty', async () => {
    const prismaMock = buildPrismaMock();
    const adapter = new AdStrategyContextRepositoryAdapter(
      prismaMock as any,
      buildReviewStatsMock(),
      buildAdAccountKpiMock() as any,
    );
    const config = Object.freeze({ marker: 'TEST_CONFIG' }) as unknown as AdsConfig;

    const result = await adapter.loadStrategyContext('org-1', 2026, 5, '14d', config);

    expect(result.adGroups).toEqual([]);
    expect(result.adIssuesAdGroups).toEqual([]);
    expect(result.listings).toEqual([]);
    expect(result.profitRateByListing).toBeInstanceOf(Map);
    expect(result.profitRateByListing.size).toBe(0);
    expect(result.channelStateByListing).toBeInstanceOf(Map);
    expect(result.channelStateByListing.size).toBe(0);
    expect(result.gradeMap).toBeInstanceOf(Map);
    expect(result.gradeMap.size).toBe(0);
    expect(result.trafficByListing).toBeInstanceOf(Map);
    expect(result.trafficByListing.size).toBe(0);
    // `config` still passes through unchanged on the empty-fixture path.
    expect(result.config).toBe(config);
  });
});
