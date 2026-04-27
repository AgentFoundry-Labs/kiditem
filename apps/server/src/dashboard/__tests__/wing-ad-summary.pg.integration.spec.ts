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

describe('fetchWingAdSummary (PG integration) — daily-fact source', () => {
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

  /**
   * Hard rewrite Phase H3b — wing dashboard ad-summary source moved from
   * legacy `AdSnapshot(source='wing', page_type='dashboard_kpi')` to
   * `ChannelAccountDailyKpiSnapshot(source='wing', kpiType='wing_dashboard')`.
   * Tests seed the daily-fact row directly and assert the helper reads it
   * with company isolation + month matching + adGmv > 0 filter.
   */
  async function seedWingDailyKpi(
    companyId: string,
    adGmv: number,
    adSpend: number,
    capturedAt: Date,
  ) {
    const year = capturedAt.getFullYear();
    const month = capturedAt.getMonth() + 1;
    const monthStartStr = `${year}-${String(month).padStart(2, '0')}-01`;
    const businessDate = new Date(
      Date.UTC(capturedAt.getFullYear(), capturedAt.getMonth(), capturedAt.getDate()),
    );
    return prisma.channelAccountDailyKpiSnapshot.create({
      data: {
        companyId,
        channel: 'coupang',
        source: 'wing',
        kpiType: 'wing_dashboard',
        businessDate,
        normalizedJson: {
          startDate: monthStartStr,
          adSummary: { adGmv: String(adGmv), adSpend: String(adSpend) },
        },
        lastObservedAt: capturedAt,
        firstObservedAt: capturedAt,
      },
    });
  }

  it('returns TEST snapshot only — OTHER sentinel never leaks', async () => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    await seedWingDailyKpi(TEST_COMPANY_ID, 1000, 500, now);
    await seedWingDailyKpi(OTHER_COMPANY_ID, IDOR_SENTINEL, IDOR_SENTINEL, now);

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

    await seedWingDailyKpi(TEST_COMPANY_ID, 1000, 500, now);
    await seedWingDailyKpi(OTHER_COMPANY_ID, IDOR_SENTINEL, IDOR_SENTINEL, now);

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

    await seedWingDailyKpi(OTHER_COMPANY_ID, 500, 250, now);

    const result = await fetchWingAdSummary(
      prisma as unknown as PrismaService,
      TEST_COMPANY_ID,
      now.getFullYear(),
      now.getMonth() + 1,
      monthStart,
    );

    expect(result).toBeNull();
  });

  it('ignores legacy AdSnapshot rows even when present (no fallback)', async () => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthStartStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    // Seed a legacy AdSnapshot row matching the old source/pageType. Helper must
    // ignore it under H3b daily-fact-as-source-of-truth and return null because
    // no `ChannelAccountDailyKpiSnapshot(wing_dashboard)` row exists.
    const master = await prisma.masterProduct.create({
      data: { companyId: TEST_COMPANY_ID, code: 'LEGACY-M', name: 'Legacy', category: 'Toy', optionCounter: 1 },
    });
    const listing = await prisma.channelListing.create({
      data: { companyId: TEST_COMPANY_ID, masterId: master.id, channel: 'coupang', externalId: 'LEGACY-L' },
    });
    await prisma.adSnapshot.create({
      data: {
        companyId: TEST_COMPANY_ID,
        listingId: listing.id,
        source: 'wing',
        pageType: 'dashboard_kpi',
        date: now,
        capturedAt: now,
        level: 'dashboard',
        rawJson: {
          startDate: monthStartStr,
          period: 30,
          adSummary: { adGmv: '12345', adSpend: '6789' },
        },
      },
    });

    const result = await fetchWingAdSummary(
      prisma as unknown as PrismaService,
      TEST_COMPANY_ID,
      now.getFullYear(),
      now.getMonth() + 1,
      monthStart,
    );

    expect(result).toBeNull();
  });

  it('lastSyncAt pulled from chosen daily-fact row (not legacy)', async () => {
    const now = new Date();
    const otherEarlier = new Date(now.getTime() - 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    await seedWingDailyKpi(TEST_COMPANY_ID, 1000, 500, now);
    await seedWingDailyKpi(OTHER_COMPANY_ID, 500, 250, otherEarlier);

    const result = await fetchWingAdSummary(
      prisma as unknown as PrismaService,
      TEST_COMPANY_ID,
      now.getFullYear(),
      now.getMonth() + 1,
      monthStart,
    );

    expect(result?.lastSyncAt).not.toBeNull();
    // Within ~5s tolerance — pg may round timestamps.
    expect(Math.abs((result?.lastSyncAt?.getTime() ?? 0) - now.getTime())).toBeLessThan(5000);
  });

  it('skips rows whose adGmv is 0 or missing', async () => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    await seedWingDailyKpi(TEST_COMPANY_ID, 0, 500, now);

    const result = await fetchWingAdSummary(
      prisma as unknown as PrismaService,
      TEST_COMPANY_ID,
      now.getFullYear(),
      now.getMonth() + 1,
      monthStart,
    );

    expect(result).toBeNull();
  });
});
