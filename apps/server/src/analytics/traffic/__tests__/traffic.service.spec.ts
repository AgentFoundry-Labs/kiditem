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
  };
  const prisma = {
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

function makeOperationAlerts() {
  return {
    start: vi.fn(async () => ({})),
    succeed: vi.fn(async () => ({})),
    fail: vi.fn(async () => ({})),
  };
}

describe('TrafficService — scrape-run tenant-scoped writes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scopes the completed scrape-run update to organizationId', async () => {
    const { prisma } = makePrisma();
    const service = new TrafficService(prisma as never);

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
    const service = new TrafficService(prisma as never);

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
    const service = new TrafficService(prisma as never);

    await expect(
      service.uploadTrafficStats(makeUploadFile(), ORGANIZATION_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('queries monthly traffic with exact @db.Date calendar boundaries', async () => {
    const { prisma } = makePrisma();
    const service = new TrafficService(prisma as never);

    await service.getMonthlyRevenue(2026, 5, ORGANIZATION_ID);

    expect(prisma.channelListingDailySnapshot.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: ORGANIZATION_ID,
          businessDate: {
            gte: new Date('2026-05-01T00:00:00.000Z'),
            lt: new Date('2026-06-01T00:00:00.000Z'),
          },
        },
      }),
    );
  });

  it('skips an unlinked ChannelProduct in period profit calculations', async () => {
    const prisma = {
      channelListingDailySnapshot: {
        aggregate: vi.fn()
          .mockResolvedValueOnce({
            _sum: {
              trafficRevenue: 10_000,
              trafficOrders: 1,
              trafficSalesQty: 1,
              trafficVisitors: 10,
              trafficViews: 20,
              trafficCartAdds: 1,
            },
          })
          .mockResolvedValueOnce({
            _sum: {
              trafficRevenue: 0,
              trafficOrders: 0,
              trafficSalesQty: 0,
              trafficVisitors: 0,
            },
          }),
        groupBy: vi.fn().mockResolvedValue([
          {
            listingId: 'imported-listing-1',
            _sum: {
              trafficRevenue: 10_000,
              trafficSalesQty: 1,
              trafficOrders: 1,
            },
          },
        ]),
      },
      channelListing: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'imported-listing-1', master: null },
        ]),
      },
    };
    const service = new TrafficService(prisma as never);

    const result = await service.getTrafficSummary(1, ORGANIZATION_ID);

    expect(result).toEqual(expect.objectContaining({
      revenue: 10_000,
      netProfit: 0,
      profitRate: 0,
      costCoverage: 0,
    }));
  });

  it('skips an unlinked ChannelProduct in monthly profit calculations', async () => {
    const prisma = {
      channelListingDailySnapshot: {
        groupBy: vi.fn()
          .mockResolvedValueOnce([
            {
              businessDate: new Date('2026-05-01T00:00:00.000Z'),
              _sum: {
                trafficRevenue: 10_000,
                trafficOrders: 1,
                trafficSalesQty: 1,
                trafficVisitors: 10,
              },
            },
          ])
          .mockResolvedValueOnce([
            {
              listingId: 'imported-listing-1',
              businessDate: new Date('2026-05-01T00:00:00.000Z'),
              _sum: {
                trafficRevenue: 10_000,
                trafficSalesQty: 1,
                trafficOrders: 1,
              },
            },
          ]),
      },
      channelListing: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'imported-listing-1', master: null },
        ]),
      },
    };
    const service = new TrafficService(prisma as never);

    const result = await service.getMonthlyRevenue(2026, 5, ORGANIZATION_ID);

    expect(result.days).toEqual([
      expect.objectContaining({
        date: '2026-05-01',
        revenue: 10_000,
        netProfit: 0,
        profitRate: 0,
      }),
    ]);
  });

  it('opens and closes an operation alert for product-list traffic uploads', async () => {
    const { prisma } = makePrisma();
    const operationAlerts = makeOperationAlerts();
    const service = new TrafficService(prisma as never, operationAlerts as never);

    const result = await service.uploadTrafficStats(makeUploadFile(), ORGANIZATION_ID, {
      actorUserId: 'user-1',
      source: 'products',
    });

    expect(result.success).toBe(true);
    expect(operationAlerts.start).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        actorUserId: 'user-1',
        operationKey: 'traffic-upload:products',
        type: 'traffic_upload',
        title: '트래픽 데이터 업로드',
        sourceType: 'traffic_upload',
        sourceId: 'products',
        href: '/product-hub',
      }),
    );
    expect(operationAlerts.succeed).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      'traffic-upload:products',
      expect.objectContaining({
        href: '/product-hub',
        metadata: expect.objectContaining({
          fileName: 'traffic-upload.xlsx',
          source: 'products',
          upserted: 1,
          skipped: 0,
        }),
      }),
    );
    expect(operationAlerts.fail).not.toHaveBeenCalled();
  });

  it('detects Korean headers in UTF-8 CSV uploads', async () => {
    const { prisma } = makePrisma();
    const service = new TrafficService(prisma as never);

    const result = await service.uploadTrafficStats(
      makeUtf8CsvUploadFile(),
      ORGANIZATION_ID,
    );

    expect(result.success).toBe(true);
    expect(result.upserted).toBe(1);
    expect(result.detectedColumns.productId).toBe('등록상품ID');
    expect(result.detectedColumns.visitors).toBe('방문자');
  });

  it('fails the operation alert when upload normalization fails', async () => {
    const { prisma } = makePrisma();
    prisma.$transaction.mockRejectedValueOnce(new Error('daily upsert failed'));
    const operationAlerts = makeOperationAlerts();
    const service = new TrafficService(prisma as never, operationAlerts as never);

    await expect(
      service.uploadTrafficStats(makeUploadFile(), ORGANIZATION_ID, {
        actorUserId: 'user-1',
        source: 'settings',
      }),
    ).rejects.toThrow('daily upsert failed');

    expect(operationAlerts.fail).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      'traffic-upload:settings',
      expect.objectContaining({
        href: '/settings',
        metadata: expect.objectContaining({
          error: 'daily upsert failed',
          source: 'settings',
        }),
      }),
    );
  });
});
