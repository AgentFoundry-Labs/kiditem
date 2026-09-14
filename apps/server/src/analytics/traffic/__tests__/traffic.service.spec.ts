import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';

import { TrafficService } from '../traffic.service';

const ORGANIZATION_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

function makeUploadFile() {
  const sheet = XLSX.utils.json_to_sheet([
    {
      등록상품ID: 'EXT-1',
      날짜: '2026-04-14',
      방문자: 10,
      조회: 20,
      주문: 1,
      판매량: 1,
      '매출(원)': 1000,
    },
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'traffic');
  const buffer = XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
  }) as Buffer;

  return {
    fieldname: 'file',
    buffer,
    encoding: '7bit',
    mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: buffer.length,
    originalname: 'traffic-upload.xlsx',
  };
}

function makeUtf8CsvUploadFile() {
  const csv = [
    '등록상품ID,날짜,방문자,조회,주문,판매량,매출(원)',
    'EXT-1,2026-04-14,10,20,1,1,1000',
  ].join('\n');

  return {
    fieldname: 'file',
    buffer: Buffer.from(csv, 'utf8'),
    encoding: '7bit',
    mimetype: 'text/csv',
    size: Buffer.byteLength(csv),
    originalname: 'traffic-upload.csv',
  };
}

function makePrisma() {
  const tx = {
    channelListingDailySnapshot: {
      upsert: vi.fn(async () => ({})),
    },
    $executeRaw: vi.fn(async () => 1),
  };
  const prisma = {
    channelAccount: {
      findFirst: vi.fn(async () => ({ id: 'account-1' })),
    },
    channelListing: {
      findMany: vi.fn(async () => [{ id: 'listing-1', externalId: 'EXT-1' }]),
    },
    channelListingDailySnapshot: {
      groupBy: vi.fn(async () => []),
    },
    channelScrapeRun: {
      create: vi.fn(async () => ({ id: 'run-1' })),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    channelScrapeSnapshot: {
      create: vi.fn(async () => ({ id: 'snapshot-1' })),
    },
    $transaction: vi.fn(async (fn: (txArg: typeof tx) => Promise<void>) => fn(tx)),
  };
  return { prisma, tx };
}

function accountDaily(
  businessDate: string,
  metrics: Partial<{
    visitors: number;
    views: number;
    cartAdds: number;
    orders: number;
    salesQty: number;
    revenue: number;
  }> = {},
) {
  return {
    businessDate,
    observedAt: `${businessDate}T01:00:00.000Z`,
    sourceAttemptId: '00000000-0000-4000-8000-000000000010',
    providerConversionRate: null,
    visitors: metrics.visitors ?? 0,
    views: metrics.views ?? 0,
    cartAdds: metrics.cartAdds ?? 0,
    orders: metrics.orders ?? 0,
    salesQty: metrics.salesQty ?? 0,
    revenue: metrics.revenue ?? 0,
  };
}

function makeTrafficRead(
  rows: ReturnType<typeof accountDaily>[] = [],
  reconciliation?: Record<string, unknown>,
) {
  return {
    readPublished: vi.fn().mockResolvedValue({ accountDaily: rows, reconciliation }),
  };
}

function completeMayRows() {
  return Array.from({ length: 31 }, (_, index) => accountDaily(
    `2026-05-${String(index + 1).padStart(2, '0')}`,
    { visitors: 10, views: 20, cartAdds: 3, orders: 2, salesQty: 2, revenue: 100 },
  ));
}

function reconciliation(overrides: Record<string, unknown> = {}) {
  const base = {
    dailySum: 620,
    periodValue: 620,
  };
  return {
    views: { ...base },
    cartAdds: { ...base },
    orders: { ...base },
    salesQty: { ...base },
    revenue: { ...base },
    ...overrides,
  };
}

describe('TrafficService — scrape-run tenant-scoped writes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scopes the completed scrape-run update to organizationId', async () => {
    const { prisma } = makePrisma();
    const service = new TrafficService(prisma as never, makeTrafficRead() as never);

    await service.uploadTrafficStats(makeUploadFile(), ORGANIZATION_ID);

    expect(prisma.channelScrapeRun.updateMany).toHaveBeenCalledWith({
      where: { id: 'run-1', organizationId: ORGANIZATION_ID },
      data: expect.objectContaining({
        status: 'complete',
        matchedCount: 1,
        unmatchedCount: 0,
      }),
    });
  });

  it('scopes the error scrape-run update to organizationId', async () => {
    const { prisma } = makePrisma();
    prisma.$transaction.mockRejectedValueOnce(new Error('daily upsert failed'));
    const service = new TrafficService(prisma as never, makeTrafficRead() as never);

    await expect(
      service.uploadTrafficStats(makeUploadFile(), ORGANIZATION_ID),
    ).rejects.toThrow('daily upsert failed');

    expect(prisma.channelScrapeRun.updateMany).toHaveBeenCalledWith({
      where: { id: 'run-1', organizationId: ORGANIZATION_ID },
      data: expect.objectContaining({
        status: 'error',
        matchedCount: 1,
        unmatchedCount: 0,
        errorCount: 1,
      }),
    });
  });

  it('throws when the scoped scrape-run update is a no-op', async () => {
    const { prisma } = makePrisma();
    prisma.channelScrapeRun.updateMany.mockResolvedValueOnce({ count: 0 });
    const service = new TrafficService(prisma as never, makeTrafficRead() as never);

    await expect(
      service.uploadTrafficStats(makeUploadFile(), ORGANIZATION_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('queries monthly traffic with exact @db.Date calendar boundaries', async () => {
    const { prisma } = makePrisma();
    const trafficRead = makeTrafficRead([accountDaily('2026-05-01', { revenue: 100 })]);
    const service = new TrafficService(prisma as never, trafficRead as never);

    await service.getMonthlyRevenue(2026, 5, ORGANIZATION_ID);

    expect(trafficRead.readPublished).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      from: '2026-05-01',
      to: '2026-05-31',
    });
  });

  it('reads account daily metrics and leaves guessed Wing profit fields unavailable', async () => {
    const { prisma } = makePrisma();
    const trafficRead = makeTrafficRead([
      accountDaily('2026-05-01', {
        visitors: 10,
        views: 20,
        orders: 1,
        salesQty: 1,
        revenue: 10_000,
      }),
    ]);
    const service = new TrafficService(prisma as never, trafficRead as never);

    const result = await service.getMonthlyRevenue(2026, 5, ORGANIZATION_ID);

    expect(result.days).toEqual([
      expect.objectContaining({ date: '2026-05-01', revenue: 10_000 }),
    ]);
    expect(result.total.visitors).toBeNull();
    expect(result).not.toHaveProperty('netProfit');
    expect(result).not.toHaveProperty('profitRate');
    expect(result).not.toHaveProperty('costCoverage');
  });

  it('keeps collected daily rows numeric but withholds period totals for incomplete coverage', async () => {
    const { prisma } = makePrisma();
    const trafficRead = makeTrafficRead([
      accountDaily('2026-05-01', { orders: 2, revenue: 10_000 }),
    ]);
    const service = new TrafficService(prisma as never, trafficRead as never);

    const result = await service.getMonthlyRevenue(2026, 5, ORGANIZATION_ID);

    expect(result.days[0]).toMatchObject({ orders: 2, revenue: 10_000 });
    expect(result.total).toEqual({
      revenue: null,
      orders: null,
      salesQty: null,
      visitors: null,
      views: null,
      cartAdds: null,
    });
  });

  it('nulls only a mismatched additive metric and preserves reconciliation provenance', async () => {
    const { prisma } = makePrisma();
    const publishedReconciliation = reconciliation({
      views: { dailySum: 620, periodValue: 999 },
      orders: { dailySum: 62, periodValue: null },
    });
    const trafficRead = makeTrafficRead(completeMayRows(), publishedReconciliation);
    const service = new TrafficService(prisma as never, trafficRead as never);

    const result = await service.getMonthlyRevenue(2026, 5, ORGANIZATION_ID);

    expect(result.total.views).toBeNull();
    expect(result.total.revenue).toBe(3_100);
    expect(result.total.orders).toBe(62);
    expect(result.total.salesQty).toBe(62);
    expect(result.reconciliation).toEqual(publishedReconciliation);
  });

  it('uses yesterday as the current-month cutoff and returns null totals for a future month', async () => {
    const { prisma } = makePrisma();
    const trafficRead = makeTrafficRead();
    const service = new TrafficService(prisma as never, trafficRead as never);
    const today = new Date();
    const todayKst = new Date(today.getTime() + 9 * 60 * 60 * 1000);
    const year = todayKst.getUTCFullYear();
    const month = todayKst.getUTCMonth() + 1;
    const yesterday = new Date(Date.UTC(year, todayKst.getUTCMonth(), todayKst.getUTCDate() - 1));

    await service.getMonthlyRevenue(year, month, ORGANIZATION_ID);

    expect(trafficRead.readPublished).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      from: `${year}-${String(month).padStart(2, '0')}-01`,
      to: yesterday.toISOString().slice(0, 10),
    });

    const futureMonth = new Date(Date.UTC(year, todayKst.getUTCMonth() + 1, 1));
    trafficRead.readPublished.mockClear();
    const future = await service.getMonthlyRevenue(
      futureMonth.getUTCFullYear(),
      futureMonth.getUTCMonth() + 1,
      ORGANIZATION_ID,
    );
    expect(future.total).toEqual({
      revenue: null,
      orders: null,
      salesQty: null,
      visitors: null,
      views: null,
      cartAdds: null,
    });
    expect(trafficRead.readPublished).not.toHaveBeenCalled();
  });

  it('detects Korean headers in UTF-8 CSV uploads', async () => {
    const { prisma } = makePrisma();
    const service = new TrafficService(prisma as never, makeTrafficRead() as never);

    const result = await service.uploadTrafficStats(
      makeUtf8CsvUploadFile(),
      ORGANIZATION_ID,
    );

    expect(result.success).toBe(true);
    expect(result.upserted).toBe(1);
    expect(result.detectedColumns.productId).toBe('등록상품ID');
    expect(result.detectedColumns.visitors).toBe('방문자');
  });

});
