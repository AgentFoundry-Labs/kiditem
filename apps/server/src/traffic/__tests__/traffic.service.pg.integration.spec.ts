import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
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
 * Hard rewrite Phase H3b — `TrafficService` reads + writes daily facts only.
 * Tests cover period aggregation correctness over `ChannelListingDailySnapshot`,
 * empty-state, multi-tenant isolation, and verify legacy `TrafficStats` rows
 * (when planted) are ignored.
 */
describe('TrafficService (PG integration) — H3b daily facts', () => {
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

  it('legacy TrafficStats rows are NOT consulted by reads', async () => {
    // Seed a legacy traffic_stats row + a daily-fact row. Helper must read
    // only the daily fact and never the legacy table.
    const listing = await seedListing(TEST_COMPANY_ID, 'L');
    const todayKst = kstDayStart(new Date());

    await prisma.trafficStats.create({
      data: {
        companyId: TEST_COMPANY_ID,
        listingId: listing.id,
        date: todayKst,
        periodDays: 1,
        visitors: IDOR_SENTINEL,
        views: 0,
        cartAdds: 0,
        orders: IDOR_SENTINEL,
        salesQty: 0,
        revenue: IDOR_SENTINEL,
      },
    });
    await seedDailyFact(TEST_COMPANY_ID, listing.id, listing.externalId, 0, {
      revenue: 333,
      orders: 3,
    });

    const result = await service.getTrafficSummary(1, TEST_COMPANY_ID);
    expect(result.revenue).toBe(333);
    expect(result.revenue).not.toBe(IDOR_SENTINEL);
    expect(result.orders).toBe(3);
  });
});
