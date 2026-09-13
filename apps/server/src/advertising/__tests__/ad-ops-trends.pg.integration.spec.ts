import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { EventEmitterModule } from '@nestjs/event-emitter';
import type { PrismaClient } from '@prisma/client';
import { AdvertisingModule } from '../advertising.module';
import { AdCampaignsService } from '../application/service/ad-campaigns.service';
import { PrismaService } from '../../prisma/prisma.service';
import { addDays, businessDateKey, datesInclusive } from '../../common/kst';
import { periodBounds } from '../domain/ad-metrics';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  OTHER_ORGANIZATION_ID,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { seedAd, seedCompletedAdSweepRun } from '../../test-helpers/finance-seeds';

/**
 * The ad-ops KPI cards and trend chart read the advertising target-day ledger
 * through its reader: every requested date is present, a date the campaign
 * sweep never declared is a hole, a declared date without rows is a measured
 * zero, and a conversion column the provider grid did not carry is `null`.
 */
describe('Ad-ops trends over the campaign sweep ledger (PG integration)', () => {
  let prisma: PrismaClient;
  let service: AdCampaignsService;
  const window = periodBounds('7d');
  const dates = datesInclusive(window.from, window.to).map(businessDateKey);
  const [d7, d6, d5, d4, d3, d2, d1] = dates;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const m = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot(), AdvertisingModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    service = m.get(AdCampaignsService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  async function listingFor(organizationId: string, suffix: string) {
    const account = await prisma.channelAccount.create({
      data: {
        organizationId,
        channel: 'coupang',
        name: `Trends ${suffix}`,
        isPrimary: true,
        status: 'active',
      },
    });
    return prisma.channelListing.create({
      data: {
        organizationId,
        channelAccountId: account.id,
        externalId: `EXT-TRENDS-${suffix}`,
      },
    });
  }

  it('publishes every requested date with holes, measured zeros and unobserved conversions as null', async () => {
    const listing = await listingFor(TEST_ORGANIZATION_ID, 'MEASURED');
    const other = await listingFor(OTHER_ORGANIZATION_ID, 'FOREIGN');
    // The sweep declared d3..d1. d7..d4 were never looked at.
    await seedAd(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      listingId: listing.id,
      date: d1,
      spend: 1_000,
      revenue: 4_000,
      impressions: 500,
      clicks: 20,
      conversions: 2,
      orders: 2,
    });
    // The product grid of d2 carried no conversion column.
    await seedAd(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      listingId: listing.id,
      date: d2,
      spend: 500,
      revenue: 1_000,
      impressions: 100,
      clicks: 10,
      conversions: 0,
      orders: 0,
      conversionsObserved: false,
    });
    await seedCompletedAdSweepRun(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      generation: 1,
      window: { startDate: d3, endDate: d1 },
    });
    await seedAd(prisma, {
      organizationId: OTHER_ORGANIZATION_ID,
      listingId: other.id,
      date: d1,
      spend: 999_999,
      revenue: 999_999,
    });
    await seedCompletedAdSweepRun(prisma, {
      organizationId: OTHER_ORGANIZATION_ID,
      generation: 1,
      window: { startDate: d7, endDate: d1 },
    });

    const trends = await service.getTrends('7d', undefined, TEST_ORGANIZATION_ID);

    expect(trends.from).toBe(d7);
    expect(trends.to).toBe(d1);
    expect(trends.daily.map((day) => day.date)).toEqual(dates);
    for (const date of [d7, d6, d5, d4]) {
      expect(trends.daily.find((day) => day.date === date), date).toEqual({
        date,
        metrics: null,
        orders: null,
      });
    }
    expect(trends.daily.find((day) => day.date === d3)).toEqual({
      date: d3,
      metrics: {
        spend: 0,
        revenue: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        ctr: null,
        roas: null,
        cvr: null,
      },
      orders: 0,
    });
    expect(trends.daily.find((day) => day.date === d2)).toMatchObject({
      metrics: { spend: 500, clicks: 10, conversions: null, cvr: null, roas: 200 },
      orders: null,
    });
    expect(trends.daily.find((day) => day.date === d1)).toMatchObject({
      metrics: { spend: 1_000, revenue: 4_000, conversions: 2, cvr: 10, ctr: 4, roas: 400 },
      orders: 2,
    });
    expect(trends.summary).toMatchObject({
      source: 'coupang_ads',
      periodDayCount: 3,
      latestBusinessDate: d1,
      metrics: {
        spend: 1_500,
        revenue: 5_000,
        impressions: 600,
        clicks: 30,
        conversions: null,
        cvr: null,
        ctr: 5,
        roas: 333.33,
      },
      orders: null,
    });
  });

  it('publishes an unavailable summary and only holes when the sweep measured nothing', async () => {
    const listing = await listingFor(TEST_ORGANIZATION_ID, 'UNMEASURED');
    // A row without a declared window is preserved history, not a measurement.
    await seedAd(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      listingId: listing.id,
      date: d1,
      spend: 1_000,
      revenue: 2_000,
      runId: null,
    });

    const trends = await service.getTrends('7d', undefined, TEST_ORGANIZATION_ID);

    expect(trends.daily).toHaveLength(7);
    expect(trends.daily.every((day) => day.metrics === null && day.orders === null)).toBe(true);
    expect(trends.summary).toEqual({
      source: 'unavailable',
      periodDayCount: 0,
      latestBusinessDate: null,
      observedAt: null,
      metrics: null,
      orders: null,
    });
  });

  it('applies an explicit inclusive range to the same reader', async () => {
    const listing = await listingFor(TEST_ORGANIZATION_ID, 'RANGE');
    await seedAd(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      listingId: listing.id,
      date: d2,
      spend: 300,
      revenue: 900,
      clicks: 3,
      impressions: 30,
      conversions: 1,
      orders: 1,
    });
    await seedCompletedAdSweepRun(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      generation: 1,
      window: { startDate: d7, endDate: d1 },
    });

    const trends = await service.getTrends('14d', undefined, TEST_ORGANIZATION_ID, {
      from: new Date(`${d3}T00:00:00.000Z`),
      to: addDays(new Date(`${d3}T00:00:00.000Z`), 1),
    });

    expect(trends.daily.map((day) => day.date)).toEqual([d3, d2]);
    expect(trends.summary).toMatchObject({
      source: 'coupang_ads',
      periodDayCount: 2,
      metrics: { spend: 300, revenue: 900, conversions: 1 },
      orders: 1,
    });
  });
});
