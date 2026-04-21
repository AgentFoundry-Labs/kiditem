import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import { DashboardTrendService } from '../services/dashboard-trend.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_COMPANY_ID,
  OTHER_COMPANY_ID,
  IDOR_SENTINEL,
} from '../../test-helpers/real-prisma';

describe('DashboardTrendService (PG integration)', () => {
  let prisma: PrismaClient;
  let service: DashboardTrendService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();

    const m = await Test.createTestingModule({
      providers: [
        DashboardTrendService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = m.get(DashboardTrendService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  /**
   * Seed TEST + OTHER companies with distinguishable values.
   *
   * Order: MasterProduct → ChannelListing → ProfitLoss & Ad (both reference listing).
   * This is required because Ad.listingId is a REQUIRED @db.Uuid FK (critic C-02).
   */
  async function seedTwoCompanies() {
    const today = new Date();
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const ym = { year: today.getFullYear(), month: today.getMonth() + 1 };

    // TEST company — master + listing
    const masterT = await prisma.masterProduct.create({
      data: { companyId: TEST_COMPANY_ID, code: 'M-T', name: 'Master T', category: 'Toy', optionCounter: 1 },
    });
    const listingT = await prisma.channelListing.create({
      data: { companyId: TEST_COMPANY_ID, masterId: masterT.id, channel: 'coupang', externalId: 'L-T' },
    });

    // OTHER company — master + listing (sentinel)
    const masterO = await prisma.masterProduct.create({
      data: { companyId: OTHER_COMPANY_ID, code: 'M-O', name: 'Master O', category: 'Toy', optionCounter: 1 },
    });
    const listingO = await prisma.channelListing.create({
      data: { companyId: OTHER_COMPANY_ID, masterId: masterO.id, channel: 'coupang', externalId: 'L-O' },
    });

    // TEST orders — 2 rows, totalPrice 10_000 + 20_000 = 30_000
    await prisma.order.create({
      data: {
        companyId: TEST_COMPANY_ID,
        platform: 'coupang',
        externalOrderId: 'T-1',
        orderedAt: yesterday,
        status: 'paid',
        totalPrice: 10_000,
        receiverName: 'A',
        listingId: listingT.id,
      },
    });
    await prisma.order.create({
      data: {
        companyId: TEST_COMPANY_ID,
        platform: 'coupang',
        externalOrderId: 'T-2',
        orderedAt: yesterday,
        status: 'paid',
        totalPrice: 20_000,
        receiverName: 'A',
        listingId: listingT.id,
      },
    });

    // OTHER orders — 1 row with sentinel
    await prisma.order.create({
      data: {
        companyId: OTHER_COMPANY_ID,
        platform: 'coupang',
        externalOrderId: 'O-1',
        orderedAt: yesterday,
        status: 'paid',
        totalPrice: IDOR_SENTINEL,
        receiverName: 'B',
        listingId: listingO.id,
      },
    });

    // TEST ads (listingId required per Ad schema)
    await prisma.ad.create({
      data: {
        companyId: TEST_COMPANY_ID,
        listingId: listingT.id,
        date: yesterday,
        campaignId: 'C-T-1',
        spend: 500,
        impressions: 100,
        clicks: 10,
        conversions: 1,
        revenue: 1500,
      },
    });

    // OTHER ads (sentinel)
    await prisma.ad.create({
      data: {
        companyId: OTHER_COMPANY_ID,
        listingId: listingO.id,
        date: yesterday,
        campaignId: 'C-O-1',
        spend: IDOR_SENTINEL,
        impressions: 100,
        clicks: 10,
        conversions: 1,
        revenue: IDOR_SENTINEL,
      },
    });

    // TEST profit-loss (current year/month)
    await prisma.profitLoss.create({
      data: {
        companyId: TEST_COMPANY_ID,
        listingId: listingT.id,
        year: ym.year,
        month: ym.month,
        revenue: 100_000,
        netProfit: 30_000,
      },
    });

    // OTHER profit-loss (sentinel)
    await prisma.profitLoss.create({
      data: {
        companyId: OTHER_COMPANY_ID,
        listingId: listingO.id,
        year: ym.year,
        month: ym.month,
        revenue: IDOR_SENTINEL,
        netProfit: IDOR_SENTINEL,
      },
    });
  }

  it('TEST sees only TEST rows — OTHER sentinel never leaks', async () => {
    await seedTwoCompanies();
    const result = await service.getTrend(TEST_COMPANY_ID, '30d');

    // Sentinel must not appear on any day
    for (const row of result) {
      expect(row.revenue).not.toBe(IDOR_SENTINEL);
      expect(row.adCost).not.toBe(IDOR_SENTINEL);
    }

    // Yesterday's TEST aggregation: 10_000 + 20_000 = 30_000
    const yesterdayRow = result.find((r) => r.revenue === 30_000);
    expect(yesterdayRow).toBeTruthy();
    expect(yesterdayRow?.adCost).toBe(500);
  });

  it('OTHER sees only OTHER rows — TEST does not leak', async () => {
    await seedTwoCompanies();
    const result = await service.getTrend(OTHER_COMPANY_ID, '30d');

    // TEST values must not appear
    for (const row of result) {
      expect(row.revenue).not.toBe(10_000);
      expect(row.revenue).not.toBe(20_000);
      expect(row.revenue).not.toBe(30_000);
      expect(row.adCost).not.toBe(500);
    }

    // OTHER sentinel should be present
    const otherRow = result.find((r) => r.revenue === IDOR_SENTINEL);
    expect(otherRow).toBeTruthy();
  });

  it('fresh company (no orders/ads/pl) returns []', async () => {
    // seedBaseFixture creates company row but no data; skip seedTwoCompanies
    const result = await service.getTrend(TEST_COMPANY_ID, '7d');
    expect(result).toEqual([]);
  });

  it('avgProfitRate uses TEST profit-loss only', async () => {
    await seedTwoCompanies();
    const result = await service.getTrend(TEST_COMPANY_ID, '30d');
    // TEST pl: revenue=100_000, netProfit=30_000 → rate = 0.3
    // Yesterday row revenue=30_000 → profit = 30_000 * 0.3 = 9_000
    const yr = result.find((r) => r.revenue === 30_000);
    expect(yr?.profit).toBe(9_000);
  });
});
