import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { DashboardAdService } from '../application/service/dashboard-ad.service';
import { buildDashboardContext } from '../domain/context';
import { WingTrafficAggregationRepositoryAdapter } from '../adapter/out/repository/wing-traffic-aggregation.repository.adapter';
import { ProfitCalculationRepositoryAdapter } from '../adapter/out/repository/profit-calculation.repository.adapter';
import { WingAdSummaryRepositoryAdapter } from '../adapter/out/repository/wing-ad-summary.repository.adapter';
import { PrismaService } from '../../../prisma/prisma.service';
import { PROFIT_CALCULATION_REPOSITORY_PORT } from '../application/port/out/repository/profit-calculation.repository.port';
import { WING_AD_SUMMARY_REPOSITORY_PORT } from '../application/port/out/repository/wing-ad-summary.repository.port';
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
import type { PrismaClient } from '@prisma/client';
import { seedAd, seedCompletedAdSweepRun } from '../../../test-helpers/finance-seeds';

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
        DashboardAdService,
        WingTrafficAggregationRepositoryAdapter,
        ProfitCalculationRepositoryAdapter,
        WingAdSummaryRepositoryAdapter,
        { provide: PrismaService, useValue: prisma },
        { provide: PROFIT_CALCULATION_REPOSITORY_PORT, useExisting: ProfitCalculationRepositoryAdapter },
        { provide: WING_AD_SUMMARY_REPOSITORY_PORT, useExisting: WingAdSummaryRepositoryAdapter },
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
  });

  function latestClosedBusinessDate(): string {
    const now = new Date();
    const yesterday = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - 1));
    return yesterday
      .toISOString()
      .slice(0, 10);
  }

  function enumerateDates(from: string, to: string): string[] {
    const result: string[] = [];
    const cursor = new Date(`${from}T00:00:00.000Z`);
    const end = new Date(`${to}T00:00:00.000Z`);
    while (cursor.getTime() <= end.getTime()) {
      result.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return result;
  }

  async function seedAdsTwoOrganizations() {
    // Seed the advertising target-day ledger, the one ad source. Reads assert
    // IDOR + value isolation on it.
    const today = new Date();
    today.setDate(today.getDate() - 1);
    const businessDate = new Date(
      Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()),
    );

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

    const date = businessDate.toISOString().slice(0, 10);
    // Both sweeps declare a window that covers the whole 30-day context, so
    // the days without rows are measured zeros rather than gaps.
    const windowStart = new Date(businessDate.getTime() - 40 * 86_400_000).toISOString().slice(0, 10);
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
