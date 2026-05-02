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
