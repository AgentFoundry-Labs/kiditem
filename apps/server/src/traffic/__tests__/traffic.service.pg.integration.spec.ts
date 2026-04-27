import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import { TrafficService } from '../traffic.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_COMPANY_ID,
  OTHER_COMPANY_ID,
  IDOR_SENTINEL,
} from '../../test-helpers/real-prisma';
import { kstDayStart } from '../../common/kst';

/**
 * `TrafficService` reads + writes daily facts only. Tests cover period
 * aggregation correctness over `ChannelListingDailySnapshot`, empty-state,
 * and multi-tenant isolation.
 */
describe('TrafficService (PG integration) — daily facts', () => {
  let prisma: PrismaClient;
  let service: TrafficService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const m = await Test.createTestingModule({
      providers: [TrafficService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = m.get(TrafficService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  async function seedListing(companyId: string, suffix: string) {
    const master = await prisma.masterProduct.create({
      data: { companyId, code: `M-${suffix}`, name: `Master ${suffix}`, optionCounter: 1 },
    });
    const listing = await prisma.channelListing.create({
      data: { companyId, masterId: master.id, channel: 'coupang', externalId: `EXT-${suffix}` },
    });
    return listing;
  }

  async function seedDailyFact(
    companyId: string,
    listingId: string,
    externalId: string,
    daysAgoFromTodayKst: number,
    metrics: {
      visitors?: number;
      views?: number;
      cartAdds?: number;
      orders?: number;
      salesQty?: number;
      revenue?: number;
    },
  ) {
    const todayKst = kstDayStart(new Date());
    const businessDate = new Date(todayKst.getTime() - daysAgoFromTodayKst * 86400000);
    return prisma.channelListingDailySnapshot.create({
      data: {
        companyId,
        listingId,
        channel: 'coupang',
        externalId,
        businessDate,
        trafficVisitors: metrics.visitors ?? 0,
        trafficViews: metrics.views ?? 0,
        trafficCartAdds: metrics.cartAdds ?? 0,
        trafficOrders: metrics.orders ?? 0,
        trafficSalesQty: metrics.salesQty ?? 0,
        trafficRevenue: metrics.revenue ?? 0,
      },
    });
  }

  it('getTrafficSummary — 7d window sums daily traffic facts (additive)', async () => {
    const listing = await seedListing(TEST_COMPANY_ID, 'A');
    // Days 0..6: each contributes 100 revenue, 1 order
    for (let d = 0; d < 7; d++) {
      await seedDailyFact(TEST_COMPANY_ID, listing.id, listing.externalId, d, {
        revenue: 100,
        orders: 1,
        salesQty: 1,
        visitors: 10,
      });
    }
    // Day 8 — outside the 7d window, must NOT be counted
    await seedDailyFact(TEST_COMPANY_ID, listing.id, listing.externalId, 8, {
      revenue: 9999,
      orders: 99,
    });

    const result = await service.getTrafficSummary(7, TEST_COMPANY_ID);
    expect(result.revenue).toBe(700);
    expect(result.orders).toBe(7);
    expect(result.salesQty).toBe(7);
    expect(result.visitors).toBe(70);
  });

  it('getTrafficSummary — empty state returns zeros (no legacy fallback)', async () => {
    const result = await service.getTrafficSummary(7, TEST_COMPANY_ID);
    expect(result.revenue).toBe(0);
    expect(result.orders).toBe(0);
    expect(result.visitors).toBe(0);
    expect(result.salesQty).toBe(0);
  });

  it('getTrafficSummary — multi-tenant isolation: OTHER sentinel never leaks', async () => {
    const tListing = await seedListing(TEST_COMPANY_ID, 'T');
    const oListing = await seedListing(OTHER_COMPANY_ID, 'O');

    await seedDailyFact(TEST_COMPANY_ID, tListing.id, tListing.externalId, 0, {
      revenue: 500,
      orders: 5,
    });
    await seedDailyFact(OTHER_COMPANY_ID, oListing.id, oListing.externalId, 0, {
      revenue: IDOR_SENTINEL,
      orders: IDOR_SENTINEL,
    });

    const tResult = await service.getTrafficSummary(7, TEST_COMPANY_ID);
    expect(tResult.revenue).toBe(500);
    expect(tResult.revenue).not.toBe(IDOR_SENTINEL);

    const oResult = await service.getTrafficSummary(7, OTHER_COMPANY_ID);
    expect(oResult.revenue).toBe(IDOR_SENTINEL);
    expect(oResult.revenue).not.toBe(500);
  });

  it('uploadTrafficStats — preserves every raw CSV/XLSX row and upserts one summed daily fact per listing/date', async () => {
    const listing = await seedListing(TEST_COMPANY_ID, 'UPLOAD-RAW');
    const rows = [
      {
        등록상품ID: listing.externalId,
        날짜: '2026-04-14',
        방문자: 10,
        조회: 20,
        주문: 1,
        판매량: 1,
        '매출(원)': 1000,
      },
      {
        등록상품ID: listing.externalId,
        날짜: '2026-04-14',
        방문자: 30,
        조회: 40,
        주문: 2,
        판매량: 3,
        '매출(원)': 4000,
      },
    ];
    const sheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'traffic');
    const buffer = XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
    }) as Buffer;

    const result = await service.uploadTrafficStats(
      {
        fieldname: 'file',
        buffer,
        encoding: '7bit',
        mimetype:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: buffer.length,
        originalname: 'traffic-upload.xlsx',
      },
      TEST_COMPANY_ID,
    );

    expect(result).toMatchObject({ success: true, upserted: 1, skipped: 0 });

    const run = await prisma.channelScrapeRun.findFirst({
      where: {
        companyId: TEST_COMPANY_ID,
        source: 'traffic_csv_upload',
        pageType: 'traffic',
      },
      orderBy: { startedAt: 'desc' },
    });
    expect(run).toBeDefined();
    expect(run?.rowCount).toBe(2);
    expect(run?.matchedCount).toBe(2);
    expect(run?.unmatchedCount).toBe(0);
    expect(run?.status).toBe('complete');

    const snapshots = await prisma.channelScrapeSnapshot.findMany({
      where: { scrapeRunId: run!.id },
      orderBy: { observedAt: 'asc' },
    });
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0].rawJson).toMatchObject({ 방문자: 10 });
    expect(snapshots[1].rawJson).toMatchObject({ 방문자: 30 });
    expect(snapshots.every((s) => s.matchStatus === 'matched')).toBe(true);

    const daily = await prisma.channelListingDailySnapshot.findFirst({
      where: { companyId: TEST_COMPANY_ID, listingId: listing.id },
    });
    expect(daily?.businessDate.toISOString().slice(0, 10)).toBe('2026-04-14');
    expect(daily?.trafficVisitors).toBe(40);
    expect(daily?.trafficViews).toBe(60);
    expect(daily?.trafficOrders).toBe(3);
    expect(daily?.trafficSalesQty).toBe(4);
    expect(daily?.trafficRevenue).toBe(5000);
  });

  it('uploadTrafficStats — daily fact failure keeps raw snapshots and marks run error', async () => {
    const listing = await seedListing(TEST_COMPANY_ID, 'UPLOAD-FAIL');
    const sheet = XLSX.utils.json_to_sheet([
      {
        등록상품ID: listing.externalId,
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

    const originalTransaction = prisma.$transaction.bind(prisma);
    (prisma as { $transaction: typeof originalTransaction }).$transaction =
      (async () => {
      throw new Error('boom daily upsert');
    }) as typeof originalTransaction;

    try {
      await expect(
        service.uploadTrafficStats(
          {
            fieldname: 'file',
            buffer,
            encoding: '7bit',
            mimetype:
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            size: buffer.length,
            originalname: 'traffic-upload-fail.xlsx',
          },
          TEST_COMPANY_ID,
        ),
      ).rejects.toThrow('boom daily upsert');
    } finally {
      (prisma as { $transaction: typeof originalTransaction }).$transaction =
        originalTransaction;
    }

    const run = await prisma.channelScrapeRun.findFirst({
      where: {
        companyId: TEST_COMPANY_ID,
        source: 'traffic_csv_upload',
        pageType: 'traffic',
      },
      orderBy: { startedAt: 'desc' },
    });
    expect(run?.status).toBe('error');
    expect(run?.matchedCount).toBe(1);
    expect(run?.errorJson).toMatchObject({
      message: expect.stringContaining('boom daily upsert'),
    });
    const snapshots = await prisma.channelScrapeSnapshot.findMany({
      where: { scrapeRunId: run!.id },
    });
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].rawJson).toMatchObject({ 방문자: 10 });

    const dailyCount = await prisma.channelListingDailySnapshot.count({
      where: { companyId: TEST_COMPANY_ID, listingId: listing.id },
    });
    expect(dailyCount).toBe(0);
  });

  it('getMonthlyRevenue — aggregates by businessDate within KST month', async () => {
    const listing = await seedListing(TEST_COMPANY_ID, 'M');
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    // Seed 3 mid-month days with KST businessDate
    const monthStartKst = kstDayStart(new Date(Date.UTC(year, month - 1, 5)));
    for (let i = 0; i < 3; i++) {
      const businessDate = new Date(monthStartKst.getTime() + i * 86400000);
      await prisma.channelListingDailySnapshot.create({
        data: {
          companyId: TEST_COMPANY_ID,
          listingId: listing.id,
          channel: 'coupang',
          externalId: listing.externalId,
          businessDate,
          trafficRevenue: 1000 * (i + 1),
          trafficOrders: i + 1,
          trafficSalesQty: i + 1,
          trafficVisitors: 100 * (i + 1),
        },
      });
    }

    const result = await service.getMonthlyRevenue(year, month, TEST_COMPANY_ID);
    expect(result.year).toBe(year);
    expect(result.month).toBe(month);
    expect(result.total.revenue).toBe(1000 + 2000 + 3000);
    expect(result.total.orders).toBe(1 + 2 + 3);
    expect(result.days.length).toBe(3);
  });

});
