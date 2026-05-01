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
});
