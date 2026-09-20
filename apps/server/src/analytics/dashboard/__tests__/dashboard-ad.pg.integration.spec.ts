import { INVENTORY_TRANSACTIONAL_READ_PORT } from '../../../inventory/application/port/in/stock/inventory-transactional-read.port';
import { InventoryTransactionalReadRepositoryAdapter } from '../../../inventory/adapter/out/persistence/inventory-transactional-read.repository.adapter';
import { describe, it, expect, afterEach, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { DashboardAdService } from '../application/service/dashboard-ad.service';
import { buildDashboardContext } from '../domain/context';
import { WingTrafficAggregationRepositoryAdapter } from '../adapter/out/repository/wing-traffic-aggregation.repository.adapter';
import { ProfitCalculationRepositoryAdapter } from '../adapter/out/repository/profit-calculation.repository.adapter';
import { PrismaService } from '../../../prisma/prisma.service';
import { PROFIT_CALCULATION_REPOSITORY_PORT } from '../application/port/out/repository/profit-calculation.repository.port';
import { WING_TRAFFIC_AGGREGATION_REPOSITORY_PORT } from '../application/port/out/repository/wing-traffic-aggregation.repository.port';
import { AD_TRAFFIC_READ_PORT } from '../../../advertising/application/port/in/ad-traffic-source.port';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  OTHER_ORGANIZATION_ID,
  IDOR_SENTINEL,
} from '../../../test-helpers/real-prisma';
import { seedAd, seedCompletedAdSweepRun } from '../../../test-helpers/finance-seeds';
import { addDays, businessDateKey, evidenceCutoffDate } from '../../../common/kst';
import type { PrismaClient } from '@prisma/client';

/**
 * 00:46 KST on 2026-09-15, which is still 2026-09-14 in UTC. The seed used to
 * read the runner's local calendar, so on a UTC runner in the KST small hours
 * it wrote the day before the service's latest closed KST day and every ad
 * read fell outside the window. Pinning the clock reproduces that instant in
 * any runner timezone, and keeps the anchor month off the 1st, where the
 * closed-day window is empty by design (ADR-0001).
 */
const KST_DAWN = new Date('2026-09-14T15:46:00.000Z');

describe('DashboardAdService.getSummary (PG integration) — IDOR + dailyAdRows', () => {
  let prisma: PrismaClient;
  let service: DashboardAdService;
  const trafficRead = {
    readPublished: async () => ({
      channelAccountId: null,
      rows: [],
      dashboard: null,
      plan: { businessDate: '1970-01-01' },
    }),
  };

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();

    const m = await Test.createTestingModule({
      providers: [
        { provide: INVENTORY_TRANSACTIONAL_READ_PORT, useClass: InventoryTransactionalReadRepositoryAdapter },
        DashboardAdService,
        WingTrafficAggregationRepositoryAdapter,
        ProfitCalculationRepositoryAdapter,
        { provide: PrismaService, useValue: prisma },
        { provide: PROFIT_CALCULATION_REPOSITORY_PORT, useExisting: ProfitCalculationRepositoryAdapter },
        { provide: WING_TRAFFIC_AGGREGATION_REPOSITORY_PORT, useExisting: WingTrafficAggregationRepositoryAdapter },
        { provide: AD_TRAFFIC_READ_PORT, useValue: trafficRead },
      ],
    }).compile();
    service = m.get(DashboardAdService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(KST_DAWN);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** The latest closed KST business day, the day the service's window ends on. */
  function latestClosedBusinessDate(): string {
    return businessDateKey(evidenceCutoffDate(new Date()));
  }

  async function seedAdsTwoOrganizations() {
    // Seed the advertising target-day ledger, the one ad source. Reads assert
    // IDOR + value isolation on it.
    const businessDate = evidenceCutoffDate(new Date());

    const accountT = await prisma.channelAccount.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'TEST Wing',
        externalAccountId: 'TEST-WING',
      },
    });
    const listingT = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: accountT.id,
        externalId: 'L-T',
      },
    });
    const accountO = await prisma.channelAccount.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'OTHER Wing',
        externalAccountId: 'OTHER-WING',
      },
    });
    const listingO = await prisma.channelListing.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        channelAccountId: accountO.id,
        externalId: 'L-O',
      },
    });

    const date = businessDateKey(businessDate);
    // Both sweeps declare a window that covers the whole 30-day context, so
    // the days without rows are measured zeros rather than gaps.
    const windowStart = businessDateKey(addDays(businessDate, -40));
    const runs = new Map<string, string>();
    for (const organizationId of [TEST_ORGANIZATION_ID, OTHER_ORGANIZATION_ID]) {
      runs.set(organizationId, await seedCompletedAdSweepRun(prisma, {
        organizationId,
        generation: 1,
        window: { startDate: windowStart, endDate: date },
      }));
    }
    // TEST measured ad day — spend 500
    await seedAd(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      listingId: listingT.id,
      runId: runs.get(TEST_ORGANIZATION_ID),
      date,
      spend: 500,
      revenue: 1500,
      impressions: 100,
      clicks: 10,
      conversions: 1,
    });
    // OTHER measured ad day — sentinel
    await seedAd(prisma, {
      organizationId: OTHER_ORGANIZATION_ID,
      listingId: listingO.id,
      runId: runs.get(OTHER_ORGANIZATION_ID),
      date,
      spend: IDOR_SENTINEL,
      revenue: IDOR_SENTINEL,
      impressions: 100,
      clicks: 10,
      conversions: 1,
    });
  }

  it('TEST getSummary().dailyAd never includes OTHER sentinel spend', async () => {
    await seedAdsTwoOrganizations();
    const ctx = buildDashboardContext('30d');
    const result = await service.getSummary(ctx, TEST_ORGANIZATION_ID);

    expect(result.monthly.totalAdSpend).toBe(500);
    expect(result.monthly.source).toBe('coupang_ads');
    expect(result.dailyAd).toContainEqual({
      date: latestClosedBusinessDate(),
      adCost: 500,
      source: 'coupang_ads',
    });
    for (const row of result.dailyAd ?? []) {
      expect(row.adCost).not.toBe(IDOR_SENTINEL);
    }
  });

  it('OTHER getSummary().dailyAd sees only OTHER sentinel (not TEST 500)', async () => {
    await seedAdsTwoOrganizations();
    const ctx = buildDashboardContext('30d');
    const result = await service.getSummary(ctx, OTHER_ORGANIZATION_ID);

    expect(result.monthly.totalAdSpend).toBe(IDOR_SENTINEL);
    expect(result.monthly.source).toBe('coupang_ads');
    expect(result.dailyAd).toContainEqual({
      date: latestClosedBusinessDate(),
      adCost: IDOR_SENTINEL,
      source: 'coupang_ads',
    });
    for (const row of result.dailyAd ?? []) {
      expect(row.adCost).not.toBe(500);
    }
  });

  it('monthly totalAdSpend reflects TEST-only data', async () => {
    await seedAdsTwoOrganizations();
    const ctx = buildDashboardContext('30d');
    const result = await service.getSummary(ctx, TEST_ORGANIZATION_ID);

    // The target-day ledger is the only ad source; the sum over its measured
    // days is the month.
    expect(result.monthly.totalAdSpend).toBe(500);
    expect(result.monthly.totalAdSpend).not.toBe(IDOR_SENTINEL);
  });
});
