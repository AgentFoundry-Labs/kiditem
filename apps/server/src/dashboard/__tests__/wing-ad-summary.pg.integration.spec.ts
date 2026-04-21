import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { fetchWingAdSummary } from '../helpers/wing-ad-summary';
import { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_COMPANY_ID,
  OTHER_COMPANY_ID,
  IDOR_SENTINEL,
} from '../../test-helpers/real-prisma';

describe('fetchWingAdSummary (PG integration)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  async function seedWingSnapshot(
    companyId: string,
    adGmv: number,
    adSpend: number,
    period: number,
    capturedAt: Date,
    listingId: string,
  ) {
    // Mirror the helper's format: "YYYY-MM-01" using local calendar year/month
    // (not UTC ISO slice — that shifts by TZ offset in non-UTC locales).
    const year = capturedAt.getFullYear();
    const month = capturedAt.getMonth() + 1;
    const monthStartStr = `${year}-${String(month).padStart(2, '0')}-01`;
    await prisma.adSnapshot.create({
      data: {
        companyId,
        listingId,
        source: 'wing',
        pageType: 'dashboard_kpi',
        date: capturedAt,
        capturedAt,
        level: 'dashboard',
        rawJson: {
          startDate: monthStartStr,
          period,
          adSummary: { adGmv: String(adGmv), adSpend: String(adSpend) },
        },
      },
    });
  }

  async function seedMasterAndListing(companyId: string, code: string, externalId: string) {
    const master = await prisma.masterProduct.create({
      data: { companyId, code, name: `Master ${code}`, category: 'Toy', optionCounter: 1 },
    });
    const listing = await prisma.channelListing.create({
      data: { companyId, masterId: master.id, channel: 'coupang', externalId },
    });
    return listing;
  }

  it('returns TEST snapshot only — OTHER sentinel never leaks', async () => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const listingT = await seedMasterAndListing(TEST_COMPANY_ID, 'M-T', 'L-T');
    const listingO = await seedMasterAndListing(OTHER_COMPANY_ID, 'M-O', 'L-O');

    // TEST — small values
    await seedWingSnapshot(TEST_COMPANY_ID, 1000, 500, 30, now, listingT.id);
    // OTHER — sentinel + longer period (would win if IDOR)
    await seedWingSnapshot(OTHER_COMPANY_ID, IDOR_SENTINEL, IDOR_SENTINEL, 90, now, listingO.id);

    const result = await fetchWingAdSummary(
      prisma as unknown as PrismaService,
      TEST_COMPANY_ID,
      now.getFullYear(),
      now.getMonth() + 1,
      monthStart,
    );

    expect(result).not.toBeNull();
    expect(result?.adRevenue).toBe(1000);
    expect(result?.adSpend).toBe(500);
    expect(result?.adRevenue).not.toBe(IDOR_SENTINEL);
  });

  it('OTHER call returns OTHER — sentinel reflects correctly', async () => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const listingT = await seedMasterAndListing(TEST_COMPANY_ID, 'M-T', 'L-T');
    const listingO = await seedMasterAndListing(OTHER_COMPANY_ID, 'M-O', 'L-O');

    await seedWingSnapshot(TEST_COMPANY_ID, 1000, 500, 30, now, listingT.id);
    await seedWingSnapshot(OTHER_COMPANY_ID, IDOR_SENTINEL, IDOR_SENTINEL, 90, now, listingO.id);

    const result = await fetchWingAdSummary(
      prisma as unknown as PrismaService,
      OTHER_COMPANY_ID,
      now.getFullYear(),
      now.getMonth() + 1,
      monthStart,
    );

    expect(result?.adRevenue).toBe(IDOR_SENTINEL);
    expect(result?.adSpend).toBe(IDOR_SENTINEL);
  });

  it('returns null when no snapshot exists for this company', async () => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Only OTHER has a snapshot
    const listingO = await seedMasterAndListing(OTHER_COMPANY_ID, 'M-O', 'L-O');
    await seedWingSnapshot(OTHER_COMPANY_ID, 500, 250, 30, now, listingO.id);

    const result = await fetchWingAdSummary(
      prisma as unknown as PrismaService,
      TEST_COMPANY_ID,
      now.getFullYear(),
      now.getMonth() + 1,
      monthStart,
    );

    expect(result).toBeNull();
  });

  it('lastSyncAt pulled from TEST company only', async () => {
    const now = new Date();
    const otherEarlier = new Date(now.getTime() - 60 * 60 * 1000); // 1h ago
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const listingT = await seedMasterAndListing(TEST_COMPANY_ID, 'M-T', 'L-T');
    const listingO = await seedMasterAndListing(OTHER_COMPANY_ID, 'M-O', 'L-O');

    await seedWingSnapshot(TEST_COMPANY_ID, 1000, 500, 30, now, listingT.id);
    // OTHER has a much older snapshot — if IDOR, lastSyncAt would return the TEST now value incorrectly
    await seedWingSnapshot(OTHER_COMPANY_ID, 500, 250, 90, otherEarlier, listingO.id);

    const result = await fetchWingAdSummary(
      prisma as unknown as PrismaService,
      TEST_COMPANY_ID,
      now.getFullYear(),
      now.getMonth() + 1,
      monthStart,
    );

    expect(result?.lastSyncAt?.getTime()).toBe(now.getTime());
  });
});
