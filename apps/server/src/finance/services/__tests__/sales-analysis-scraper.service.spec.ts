import { describe, it, expect, vi } from 'vitest';
import { SalesAnalysisScraperService } from '../sales-analysis-scraper.service';

const ORG = '00000000-0000-0000-0000-000000000001';

function asDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function makePrisma(overrides: {
  wingAgg?: ReturnType<
    () => {
      _min: { businessDate: Date | null; lastObservedAt: Date | null };
      _max: { businessDate: Date | null; lastObservedAt: Date | null };
    }
  >;
  adsAgg?: ReturnType<
    () => {
      _min: { businessDate: Date | null; lastObservedAt: Date | null };
      _max: { businessDate: Date | null; lastObservedAt: Date | null };
    }
  >;
  ordersAgg?: {
    _count: { _all: number };
    _min: { orderedAt: Date | null };
    _max: { orderedAt: Date | null };
  };
  wingGroupBy?: Array<{ businessDate: Date }>;
  adsDates?: Array<{ businessDate: Date }>;
  adsRows?: Array<{ businessDate: Date; normalizedJson: unknown }>;
  campaignRows?: Array<unknown>;
}) {
  return {
    channelListingDailySnapshot: {
      aggregate: vi.fn().mockResolvedValue(
        overrides.wingAgg ?? {
          _min: { businessDate: null, lastObservedAt: null },
          _max: { businessDate: null, lastObservedAt: null },
        },
      ),
      groupBy: vi.fn().mockResolvedValue(overrides.wingGroupBy ?? []),
    },
    channelAccountDailyKpiSnapshot: {
      aggregate: vi.fn().mockResolvedValue(
        overrides.adsAgg ?? {
          _min: { businessDate: null, lastObservedAt: null },
          _max: { businessDate: null, lastObservedAt: null },
        },
      ),
      groupBy: vi.fn().mockResolvedValue(overrides.adsDates ?? []),
      findMany: vi.fn().mockResolvedValue(overrides.adsRows ?? []),
    },
    order: {
      aggregate: vi.fn().mockResolvedValue(
        overrides.ordersAgg ?? {
          _count: { _all: 0 },
          _min: { orderedAt: null },
          _max: { orderedAt: null },
        },
      ),
    },
    $queryRaw: vi.fn().mockResolvedValue(overrides.campaignRows ?? []),
  } as unknown as ConstructorParameters<typeof SalesAnalysisScraperService>[0];
}

describe('SalesAnalysisScraperService.getDataSources', () => {
  it('reports empty ranges when nothing has been ingested', async () => {
    const service = new SalesAnalysisScraperService(makePrisma({}));
    const result = await service.getDataSources(ORG);
    expect(result.wing.dateCount).toBe(0);
    expect(result.ads.dateCount).toBe(0);
    expect(result.orders.count).toBe(0);
    expect(result.ads.missingDates).toEqual([]);
  });

  it('lists ads businessDates that fall inside the wing window but are missing', async () => {
    const wingDates = [
      { businessDate: asDate('2026-04-18') },
      { businessDate: asDate('2026-04-19') },
      { businessDate: asDate('2026-04-20') },
    ];
    const adsDates = [
      { businessDate: asDate('2026-04-19') },
      { businessDate: asDate('2026-04-20') },
    ];
    const observedAt = new Date('2026-04-30T15:00:00.000Z');
    const service = new SalesAnalysisScraperService(
      makePrisma({
        wingAgg: {
          _min: {
            businessDate: asDate('2026-04-18'),
            lastObservedAt: observedAt,
          },
          _max: {
            businessDate: asDate('2026-04-20'),
            lastObservedAt: observedAt,
          },
        },
        adsAgg: {
          _min: {
            businessDate: asDate('2026-04-19'),
            lastObservedAt: observedAt,
          },
          _max: {
            businessDate: asDate('2026-04-20'),
            lastObservedAt: observedAt,
          },
        },
        wingGroupBy: wingDates,
        adsDates,
      }),
    );

    const result = await service.getDataSources(ORG);
    expect(result.wing.firstDate).toBe('2026-04-18');
    expect(result.wing.lastDate).toBe('2026-04-20');
    expect(result.wing.dateCount).toBe(3);
    expect(result.ads.firstDate).toBe('2026-04-19');
    expect(result.ads.dateCount).toBe(2);
    expect(result.ads.missingDates).toEqual(['2026-04-18']);
  });

  it('reports orders=0 with null range when DB has no orders', async () => {
    const service = new SalesAnalysisScraperService(
      makePrisma({
        ordersAgg: {
          _count: { _all: 0 },
          _min: { orderedAt: null },
          _max: { orderedAt: null },
        },
      }),
    );
    const result = await service.getDataSources(ORG);
    expect(result.orders.count).toBe(0);
    expect(result.orders.firstDate).toBeNull();
    expect(result.orders.lastDate).toBeNull();
  });
});

describe('SalesAnalysisScraperService.getMonthlyAds', () => {
  it('queries the @db.Date column with calendar boundaries and recomputes ratios', async () => {
    const prisma = makePrisma({
      adsRows: [
        {
          businessDate: asDate('2026-04-19'),
          normalizedJson: {
            adSpend: 10000,
            adRevenue: 30000,
            impressions: 1000,
            clicks: 100,
            conversions: 10,
            orders: 8,
          },
        },
        {
          businessDate: asDate('2026-04-20'),
          normalizedJson: {
            adSpend: 5000,
            adRevenue: 4000,
            impressions: 500,
            clicks: 0,
            conversions: 0,
            orders: 0,
          },
        },
      ],
      wingGroupBy: [
        { businessDate: asDate('2026-04-18') },
        { businessDate: asDate('2026-04-19') },
        { businessDate: asDate('2026-04-20') },
      ],
      campaignRows: [
        {
          targetKey: 'campaign:abc',
          campaignName: 'ABC',
          listingId: '00000000-0000-0000-0000-0000000000aa',
          adSpend: 9000,
          adRevenue: 18000,
          impressions: 800,
          clicks: 80,
          conversions: 8,
        },
      ],
    });
    const service = new SalesAnalysisScraperService(prisma);

    const result = await service.getMonthlyAds(ORG, 2026, 4);

    const accountKpi = (
      prisma as unknown as {
        channelAccountDailyKpiSnapshot: { findMany: ReturnType<typeof vi.fn> };
      }
    ).channelAccountDailyKpiSnapshot.findMany;
    expect(accountKpi).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: ORG,
          kpiType: 'coupang_ads_daily',
          businessDate: {
            gte: new Date('2026-04-01T00:00:00.000Z'),
            lt: new Date('2026-05-01T00:00:00.000Z'),
          },
        }),
      }),
    );

    expect(result.days).toHaveLength(2);
    expect(result.days[0]).toMatchObject({
      date: '2026-04-19',
      adSpend: 10000,
      adRevenue: 30000,
      roas: 300,
      ctr: 0.1,
      cvr: 0.08, // orders/clicks = 8/100 — `conversions` mirrors revenue and is not used.
    });
    expect(result.days[1].cvr).toBe(0); // clicks=0 should not divide-by-zero
    expect(result.total.adSpend).toBe(15000);
    expect(result.total.adRevenue).toBe(34000);
    expect(result.total.roas).toBeCloseTo((34000 / 15000) * 100, 5);
    expect(result.missingDates).toEqual(['2026-04-18']);
    expect(result.campaigns).toHaveLength(1);
    expect(result.campaigns[0]).toMatchObject({
      targetKey: 'campaign:abc',
      adSpend: 9000,
      adRevenue: 18000,
      roas: 200,
    });
  });

  it('returns zeroed totals when the month has no ads daily rows', async () => {
    const service = new SalesAnalysisScraperService(makePrisma({}));
    const result = await service.getMonthlyAds(ORG, 2026, 5);
    expect(result.days).toEqual([]);
    expect(result.total.adSpend).toBe(0);
    expect(result.total.roas).toBe(0);
    expect(result.missingDates).toEqual([]);
    expect(result.campaigns).toEqual([]);
  });
});
