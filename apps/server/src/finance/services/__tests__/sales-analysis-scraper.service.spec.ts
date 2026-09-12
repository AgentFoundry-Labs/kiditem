import { NotFoundException } from '@nestjs/common';
import { describe, it, expect, vi } from 'vitest';
import { SalesAnalysisScraperService } from '../sales-analysis-scraper.service';

const ORG = '00000000-0000-0000-0000-000000000001';

function asDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function adPublishedRow(
  businessDate: string,
  observedAt = '2026-05-02T01:00:00.000Z',
) {
  return {
    businessDate,
    observedAt,
    normalized: {
      adSpend: 0,
      adRevenue: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      orders: 0,
      providerRoas: 0,
      providerCtr: 0,
      providerConversionRate: 0,
    },
  };
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
            parserVersion: 'wing-traffic-v1',
            channelAccountId: '00000000-0000-0000-0000-000000000002',
            expectedAdvertiserId: 'VENDOR-A',
            startDate: rows[0]?.businessDate ?? '2026-04-18',
            endDate: rows.at(-1)?.businessDate ?? '2026-04-20',
            businessDate: rows[0]?.businessDate ?? '2026-04-18',
            periodDays: 3,
            targetUrl: null,
          },
          accountDaily: rows,
          optionDaily: [],
          periodSummary: null,
          coverage: trafficCoverage(rows),
          reconciliation: {
            views: { status: 'UNVERIFIED', dailySum: null, periodValue: null },
            cartAdds: { status: 'UNVERIFIED', dailySum: null, periodValue: null },
            orders: { status: 'UNVERIFIED', dailySum: null, periodValue: null },
            salesQty: { status: 'UNVERIFIED', dailySum: null, periodValue: null },
            revenue: { status: 'UNVERIFIED', dailySum: null, periodValue: null },
          },
          legacyExactPeriodEvidence: null,
        }),
  };
}

function makeAdRead(
  rows: ReturnType<typeof adPublishedRow>[] = [],
  error?: unknown,
) {
  return {
    readPublished: error
      ? vi.fn().mockRejectedValue(error)
      : vi.fn().mockResolvedValue({
          channelAccountId: '00000000-0000-4000-8000-000000000002',
          rows,
        }),
  };
}

function makePrisma(overrides: {
  ordersAgg?: {
    _count: { _all: number };
    _min: { orderedAt: Date | null };
    _max: { orderedAt: Date | null };
  };
}) {
  return {
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
    const adRead = makeAdRead([], new NotFoundException('COUPANG_ACCOUNT_NOT_FOUND'));
    const prisma = makePrisma({});
    const trafficRead = makeTrafficRead();
    const service = new SalesAnalysisScraperService(prisma, adRead, trafficRead);
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
    const adsRows = [
      adPublishedRow('2026-04-19', '2026-04-30T14:00:00.000Z'),
      adPublishedRow('2026-04-20', '2026-04-30T15:00:00.000Z'),
    ];
    const observedAt = new Date('2026-04-30T15:00:00.000Z');
    const adRead = makeAdRead(adsRows);
    const trafficRead = makeTrafficRead(
      wingDates.map(({ businessDate }) => trafficPublishedRow(
        businessDate.toISOString().slice(0, 10),
        observedAt.toISOString(),
      )),
    );
    const service = new SalesAnalysisScraperService(
      makePrisma({}),
      adRead,
      trafficRead,
    );

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
    expect(adRead.readPublished).toHaveBeenCalledWith({ organizationId: ORG });
    expect(trafficRead.readPublished).toHaveBeenCalledWith({ organizationId: ORG });
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
      makeAdRead(),
      makeTrafficRead(),
    );
    const result = await service.getDataSources(ORG);
    expect(result.orders.count).toBe(0);
    expect(result.orders.firstDate).toBeNull();
    expect(result.orders.lastDate).toBeNull();
  });
});
