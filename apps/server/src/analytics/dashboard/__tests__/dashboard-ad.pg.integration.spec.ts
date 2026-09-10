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
import { AD_ACCOUNT_DAILY_KPI_READ_PORT } from '../../../advertising/application/port/in/ad-account-daily-kpi-source.port';
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

describe('DashboardAdService.getSummary (PG integration) — IDOR + dailyAdRows', () => {
  let prisma: PrismaClient;
  let service: DashboardAdService;
  const dailyKpiRead = { readPublished: vi.fn() };
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
        {
          provide: AD_ACCOUNT_DAILY_KPI_READ_PORT,
          useValue: dailyKpiRead,
        },
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
    dailyKpiRead.readPublished.mockImplementation(async (input: {
      organizationId: string;
      from?: string;
      to?: string;
    }) => {
      const currentDate = latestClosedBusinessDate();
      const spend = input.organizationId === TEST_ORGANIZATION_ID ? 500 : IDOR_SENTINEL;
      const from = input.from && input.from !== '0001-01-01' ? input.from : currentDate;
      const requestedTo = input.to ?? currentDate;
      const to = requestedTo < currentDate ? requestedTo : currentDate;
      const rows = enumerateDates(from, to).map((businessDate) => ({
        businessDate,
        observedAt: `${businessDate}T23:00:00.000Z`,
        normalized: {
          adSpend: businessDate === currentDate ? spend : 0,
          adRevenue: businessDate === currentDate ? spend * 3 : 0,
          impressions: businessDate === currentDate ? 100 : 0,
          clicks: businessDate === currentDate ? 10 : 0,
          conversions: businessDate === currentDate ? 1 : 0,
          orders: businessDate === currentDate ? 1 : 0,
          providerRoas: businessDate === currentDate ? 3 : null,
          providerCtr: businessDate === currentDate ? 10 : null,
          providerConversionRate: businessDate === currentDate ? 10 : null,
          observedMetrics: {
            adSpend: true,
            adRevenue: true,
            impressions: true,
            clicks: true,
            conversions: true,
            orders: true,
          },
        },
      }));
      return {
        channelAccountId: '00000000-0000-4000-8000-000000000001',
        rows,
      };
    });
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
    // Hard rewrite Phase H3b — seed `ChannelListingDailySnapshot` rows
    // (daily-fact source-of-truth) instead of legacy `Ad` rows. Reads still
    // assert IDOR + value isolation but on the new column shape.
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

    // TEST daily fact — adSpend 500
    await prisma.channelListingDailySnapshot.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listingT.id,
        channel: 'coupang',
        externalId: 'L-T',
        businessDate,
        adSpend: 500,
        adImpressions: 100,
        adClicks: 10,
        adConversions: 1,
        adRevenue: 1500,
      },
    });

    // OTHER daily fact — sentinel
    await prisma.channelListingDailySnapshot.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        listingId: listingO.id,
        channel: 'coupang',
        externalId: 'L-O',
        businessDate,
        adSpend: IDOR_SENTINEL,
        adImpressions: 100,
        adClicks: 10,
        adConversions: 1,
        adRevenue: IDOR_SENTINEL,
      },
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

    // The owner-published v2 daily KPI is the only account-level monthly
    // source; linked listing snapshots cannot replace or supplement it.
    expect(result.monthly.totalAdSpend).toBe(500);
    expect(result.monthly.totalAdSpend).not.toBe(IDOR_SENTINEL);
  });

  it('does not turn listing-only facts into account ad KPIs', async () => {
    await seedAdsTwoOrganizations();
    dailyKpiRead.readPublished.mockResolvedValue({
      channelAccountId: null,
      rows: [],
    });

    const result = await service.getSummary(
      buildDashboardContext('30d'),
      TEST_ORGANIZATION_ID,
    );

    expect(result.monthly).toMatchObject({
      source: 'unavailable',
      totalAdSpend: null,
      adRevenue: null,
    });
    expect(result.adKpi).toMatchObject({
      source: 'unavailable',
      totalSpend: null,
      clicks: null,
    });
    expect(result.dailyAd).toBeUndefined();
  });
});
