import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { fetchWingAdSummary } from '../adapter/out/repository/wing-ad-summary.repository.adapter';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  OTHER_ORGANIZATION_ID,
  IDOR_SENTINEL,
} from '../../../test-helpers/real-prisma';

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
   * Wing dashboard ad-summary reads the daily-fact row
   * `ChannelAccountDailyKpiSnapshot(source='wing', kpiType='wing_dashboard')`.
   * Tests seed the daily-fact row directly and assert the helper reads it
   * with organization isolation + month matching + adGmv > 0 filter.
   */
  async function seedWingDailyKpi(
    organizationId: string,
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
        organizationId,
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

    await seedWingDailyKpi(TEST_ORGANIZATION_ID, 1000, 500, now);
    await seedWingDailyKpi(OTHER_ORGANIZATION_ID, IDOR_SENTINEL, IDOR_SENTINEL, now);

    const result = await fetchWingAdSummary(
      prisma as unknown as PrismaService,
      TEST_ORGANIZATION_ID,
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

    await seedWingDailyKpi(TEST_ORGANIZATION_ID, 1000, 500, now);
    await seedWingDailyKpi(OTHER_ORGANIZATION_ID, IDOR_SENTINEL, IDOR_SENTINEL, now);

    const result = await fetchWingAdSummary(
      prisma as unknown as PrismaService,
      OTHER_ORGANIZATION_ID,
      now.getFullYear(),
      now.getMonth() + 1,
      monthStart,
    );

    expect(result?.adRevenue).toBe(IDOR_SENTINEL);
    expect(result?.adSpend).toBe(IDOR_SENTINEL);
  });

  it('returns null when no snapshot exists for this organization', async () => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    await seedWingDailyKpi(OTHER_ORGANIZATION_ID, 500, 250, now);

    const result = await fetchWingAdSummary(
      prisma as unknown as PrismaService,
      TEST_ORGANIZATION_ID,
      now.getFullYear(),
      now.getMonth() + 1,
      monthStart,
    );

    expect(result).toBeNull();
  });

  it('lastSyncAt pulled from chosen daily-fact row', async () => {
    const now = new Date();
    const otherEarlier = new Date(now.getTime() - 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    await seedWingDailyKpi(TEST_ORGANIZATION_ID, 1000, 500, now);
    await seedWingDailyKpi(OTHER_ORGANIZATION_ID, 500, 250, otherEarlier);

    const result = await fetchWingAdSummary(
      prisma as unknown as PrismaService,
      TEST_ORGANIZATION_ID,
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

    await seedWingDailyKpi(TEST_ORGANIZATION_ID, 0, 500, now);

    const result = await fetchWingAdSummary(
      prisma as unknown as PrismaService,
      TEST_ORGANIZATION_ID,
      now.getFullYear(),
      now.getMonth() + 1,
      monthStart,
    );

    expect(result).toBeNull();
  });
});
