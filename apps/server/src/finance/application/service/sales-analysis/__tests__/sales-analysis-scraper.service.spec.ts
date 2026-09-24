import { profitCatalogTestReaders } from '../../../../../test-helpers/channel-fact-ports';
import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import {
  readObservedOrderBounds,
  readObservedOrderCount,
} from '../../../../../orders/adapter/out/persistence/read/order-facts.reader';
import { readAdWindowFacts } from '../../../../../advertising/adapter/out/persistence/read/ad-target-facts';
import { SalesAnalysisScraperService } from '../sales-analysis-scraper.service';

vi.mock('../../../../../orders/adapter/out/persistence/read/order-facts.reader', () => ({
  readObservedOrderBounds: vi.fn(),
  readObservedOrderCount: vi.fn(),
}));

vi.mock('../../../../../advertising/adapter/out/persistence/read/ad-target-facts', () => ({
  readAdWindowFacts: vi.fn(),
}));

const ORG = '00000000-0000-0000-0000-000000000001';
const TX = { snapshot: 'orders' };

function asDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/** One business date the campaign sweep measured, as the ad reader returns it. */
function measuredAdDay(businessDate: string) {
  return {
    businessDate,
    spend: 0,
    revenue: 0,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    orders: 0,
    conversionsObserved: true,
  };
}

function measureAds(dates: string[], observedAt: string | null = null) {
  vi.mocked(readAdWindowFacts).mockResolvedValue({
    days: dates.map(measuredAdDay),
    observedAt: observedAt ? new Date(observedAt) : null,
  });
}

function trafficPublishedRow(
  businessDate: string,
  observedAt = '2026-04-30T15:00:00.000Z',
) {
  return {
    businessDate,
    observedAt,
    sourceAttemptId: '00000000-0000-0000-0000-000000000003',
    providerConversionRate: null,
    visitors: 10,
    views: 20,
    cartAdds: 2,
    orders: 3,
    salesQty: 3,
    revenue: 100,
  };
}

function trafficCoverage(rows: ReturnType<typeof trafficPublishedRow>[]) {
  const dates = rows.map((row) => row.businessDate).sort();
  return {
    from: dates[0] ?? '2026-04-18',
    to: dates.at(-1) ?? '2026-04-20',
    targetDays: dates.length,
    completedDays: dates.length,
    missingDates: [],
  };
}

function makeTrafficRead(
  rows: ReturnType<typeof trafficPublishedRow>[] = [],
  error?: unknown,
) {
  return {
    readPublished: error
      ? vi.fn().mockRejectedValue(error)
      : vi.fn().mockResolvedValue({
          channelAccountId: '00000000-0000-0000-0000-000000000002',
          attemptId: '00000000-0000-0000-0000-000000000003',
          plan: {
            sourceType: 'coupang_wing_traffic',
            parserVersion: 'wing-traffic-daily-v2',
            channelAccountId: '00000000-0000-0000-0000-000000000002',
            expectedAdvertiserId: 'VENDOR-A',
            providerVendorId: 'VENDOR-A',
            startDate: rows[0]?.businessDate ?? '2026-04-18',
            endDate: rows.at(-1)?.businessDate ?? '2026-04-20',
            businessDate: rows.at(-1)?.businessDate ?? '2026-04-20',
            periodDays: 3,
            expectedDates: rows.length ? rows.map((row) => row.businessDate) : ['2026-04-18', '2026-04-19', '2026-04-20'],
            filterScope: 'ALL_NORMAL_RFM',
            targetUrl: null,
          },
          providerVendorId: 'VENDOR-A',
          filterScope: 'ALL_NORMAL_RFM',
          accountDaily: rows,
          optionDaily: [],
          periodSummary: null,
          coverage: trafficCoverage(rows),
          reconciliation: {
            views: { dailySum: null, periodValue: null },
            cartAdds: { dailySum: null, periodValue: null },
            orders: { dailySum: null, periodValue: null },
            salesQty: { dailySum: null, periodValue: null },
            revenue: { dailySum: null, periodValue: null },
          },
        }),
  };
}

function makePrisma() {
  return {
    $transaction: vi.fn((work: (tx: unknown) => unknown) => work(TX)),
  } as unknown as ConstructorParameters<typeof SalesAnalysisScraperService>[0];
}

describe('SalesAnalysisScraperService.getDataSources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // No order published by a completed Orders collection.
    vi.mocked(readObservedOrderCount).mockResolvedValue(0);
    vi.mocked(readObservedOrderBounds).mockResolvedValue(null);
    // No active Coupang account / no completed campaign sweep.
    measureAds([]);
  });

  it('reports empty ranges when nothing has been ingested', async () => {
    const prisma = makePrisma();
    const trafficRead = makeTrafficRead();
    const service = new SalesAnalysisScraperService(prisma, trafficRead, profitCatalogTestReaders(prisma as never).accounts);
    const result = await service.getDataSources(ORG);
    expect(result.wing.dateCount).toBe(0);
    expect(result.ads.dateCount).toBe(0);
    expect(result.orders.count).toBe(0);
    expect(result.ads.missingDates).toEqual([]);
    expect(trafficRead.readPublished).toHaveBeenCalledWith({ organizationId: ORG });
  });

  it('lists ads businessDates that fall inside the wing window but are missing', async () => {
    const wingDates = [
      { businessDate: asDate('2026-04-18') },
      { businessDate: asDate('2026-04-19') },
      { businessDate: asDate('2026-04-20') },
    ];
    const observedAt = new Date('2026-04-30T15:00:00.000Z');
    measureAds(['2026-04-19', '2026-04-20'], observedAt.toISOString());
    const trafficRead = makeTrafficRead(
      wingDates.map(({ businessDate }) => trafficPublishedRow(
        businessDate.toISOString().slice(0, 10),
        observedAt.toISOString(),
      )),
    );
    const service = new SalesAnalysisScraperService(makePrisma(), trafficRead, profitCatalogTestReaders(makePrisma() as never).accounts);

    const result = await service.getDataSources(ORG);
    expect(result.wing.firstDate).toBe('2026-04-18');
    expect(result.wing.lastDate).toBe('2026-04-20');
    expect(result.wing.dateCount).toBe(3);
    expect(result.wing.coverage).toEqual({
      from: '2026-04-18',
      to: '2026-04-20',
      targetDays: 3,
      completedDays: 3,
      missingDates: [],
    });
    expect(result.ads.firstDate).toBe('2026-04-19');
    expect(result.ads.dateCount).toBe(2);
    expect(result.ads.lastSyncedAt).toBe(observedAt.toISOString());
    expect(result.ads.missingDates).toEqual(['2026-04-18']);
    expect(readAdWindowFacts).toHaveBeenCalledWith(TX, { organizationId: ORG }, expect.objectContaining({ readProviderIdentities: expect.any(Function) }));
    expect(trafficRead.readPublished).toHaveBeenCalledWith({ organizationId: ORG });
  });

  it('reports orders=0 with null range when no completed collection published an order', async () => {
    const service = new SalesAnalysisScraperService(makePrisma(), makeTrafficRead(), profitCatalogTestReaders(makePrisma() as never).accounts);
    const result = await service.getDataSources(ORG);
    expect(result.orders).toEqual({ count: 0, firstDate: null, lastDate: null });
  });

  /** KID-85 review P2-4 — the P&L "0 orders" banner uses the same fence as the P&L table. */
  it('counts orders and their KST date range through the Orders reader in one snapshot', async () => {
    vi.mocked(readObservedOrderCount).mockResolvedValue(3);
    vi.mocked(readObservedOrderBounds).mockResolvedValue({
      from: new Date('2026-04-09T15:00:00.000Z'), // 2026-04-10 00:00 KST
      to: new Date('2026-04-30T15:00:00.000Z'), // 2026-05-01 00:00 KST, exclusive
    });
    const prisma = makePrisma();
    const service = new SalesAnalysisScraperService(prisma, makeTrafficRead(), profitCatalogTestReaders(prisma as never).accounts);

    const result = await service.getDataSources(ORG);

    expect(result.orders).toEqual({ count: 3, firstDate: '2026-04-10', lastDate: '2026-04-30' });
    expect(readObservedOrderCount).toHaveBeenCalledWith(TX, ORG);
    expect(readObservedOrderBounds).toHaveBeenCalledWith(TX, ORG);
    // One snapshot for the order facts; the ad reader reads in its own.
    expect((prisma as unknown as { $transaction: ReturnType<typeof vi.fn> }).$transaction)
      .toHaveBeenCalledTimes(2);
  });
});
