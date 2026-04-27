import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import type { PrismaClient } from '@prisma/client';
import { AdSyncService } from '../services/ad-sync.service';
import { ChannelScrapePersistenceService } from '../services/channel-scrape-persistence.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ExtensionSyncDto } from '../dto/extension-sync.dto';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_COMPANY_ID,
} from '../../test-helpers/real-prisma';

/**
 * Wave C2 — channel-generic raw scrape dual-write tests.
 *
 * Verifies that every extension payload type creates a `ChannelScrapeRun` row
 * and a `ChannelScrapeSnapshot` row per source data row, while leaving the
 * existing `AdSnapshot` / `Ad` / `TrafficStats` / `ItemWinner` writes
 * untouched (covered by `ad-sync-flow.pg.integration.spec.ts`).
 *
 * Also pins:
 * - `dateFrom` / `dateTo` survive `ValidationPipe({ whitelist: true })`
 * - `listingOptionId` is preserved on the match contract even when the
 *   internal `optionId` is null (so C3 daily option facts can land).
 */

describe('Channel scrape dual-write (PG integration, Wave C2)', () => {
  let prisma: PrismaClient;
  let adSyncService: AdSyncService;
  const companyId = TEST_COMPANY_ID;

  async function seedListingWithOption(opts: {
    externalId: string;
    externalOptionId: string;
    optionId?: 'matched' | 'null';
  }) {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const master = await prisma.masterProduct.create({
      data: {
        companyId,
        code: `M-${stamp}`,
        name: `Master ${stamp}`,
        optionCounter: 0,
      },
    });
    const productOption =
      opts.optionId === 'null'
        ? null
        : await prisma.productOption.create({
            data: {
              companyId,
              masterId: master.id,
              sku: `SKU-${stamp}`,
              optionName: `Option ${stamp}`,
            },
          });
    const listing = await prisma.channelListing.create({
      data: {
        companyId,
        masterId: master.id,
        channel: 'coupang',
        externalId: opts.externalId,
      },
    });
    const listingOption = await prisma.channelListingOption.create({
      data: {
        companyId,
        listingId: listing.id,
        optionId: productOption?.id ?? null,
        externalOptionId: opts.externalOptionId,
        isActive: true,
      },
    });
    return { master, productOption, listing, listingOption };
  }

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const m = await Test.createTestingModule({
      providers: [
        AdSyncService,
        ChannelScrapePersistenceService,
        EventEmitter2,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    adSyncService = m.get(AdSyncService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('ExtensionSyncDto preserves dateFrom/dateTo through whitelist validation', async () => {
    const dto = plainToInstance(ExtensionSyncDto, {
      type: 'traffic',
      dateFrom: '2026-04-01',
      dateTo: '2026-04-14',
    });
    const errors = await validate(dto, { whitelist: true });
    expect(errors).toHaveLength(0);
    expect(dto.dateFrom).toBe('2026-04-01');
    expect(dto.dateTo).toBe('2026-04-14');
  });

  it('ad_campaign creates one run + one snapshot per row, with matchStatus reflecting the match', async () => {
    const matched = await seedListingWithOption({
      externalId: 'EXT-A',
      externalOptionId: 'VENDOR-A',
    });

    const result = (await adSyncService.sync(
      {
        type: 'ad_campaign',
        campaignName: 'Camp-1',
        period: '7d',
        dateFrom: '2026-04-01',
        dateTo: '2026-04-07',
        normalizedRows: [
          {
            pageType: 'product',
            campaignName: 'Camp-1',
            productName: 'P-A',
            vendorItemId: 'VENDOR-A',
            itemId: 'VENDOR-A',
            spend: '1000',
          },
          {
            pageType: 'keyword',
            campaignName: 'Camp-1',
            keyword: 'kw',
            externalId: 'EXT-A',
            spend: '500',
          },
          {
            pageType: 'product',
            campaignName: 'Camp-1',
            productName: 'Unmatched',
            vendorItemId: 'VENDOR-NONE',
            externalId: 'EXT-NONE',
          },
        ],
      },
      companyId,
    )) as {
      scrapeRunId: string;
      scrapeSnapshotCount: number;
      scrapeMatchedCount: number;
      scrapeUnmatchedCount: number;
    };

    expect(result.scrapeSnapshotCount).toBe(3);
    expect(result.scrapeMatchedCount).toBe(2);
    expect(result.scrapeUnmatchedCount).toBe(1);

    const run = await prisma.channelScrapeRun.findUnique({
      where: { id: result.scrapeRunId },
    });
    expect(run?.channel).toBe('coupang');
    expect(run?.source).toBe('advertising');
    expect(run?.pageType).toBe('campaign');
    expect(run?.status).toBe('complete');
    expect(run?.rowCount).toBe(3);
    expect(run?.matchedCount).toBe(2);
    expect(run?.unmatchedCount).toBe(1);
    expect(run?.periodStart?.toISOString().slice(0, 10)).toBe('2026-04-01');
    expect(run?.periodEnd?.toISOString().slice(0, 10)).toBe('2026-04-07');
    expect(run?.finishedAt).not.toBeNull();

    const snapshots = await prisma.channelScrapeSnapshot.findMany({
      where: { scrapeRunId: result.scrapeRunId },
      orderBy: { observedAt: 'asc' },
    });
    expect(snapshots).toHaveLength(3);

    const matchedSnap = snapshots.find((s) => s.externalOptionId === 'VENDOR-A');
    expect(matchedSnap?.matchStatus).toBe('matched');
    expect(matchedSnap?.listingId).toBe(matched.listing.id);
    expect(matchedSnap?.listingOptionId).toBe(matched.listingOption.id);
    expect(matchedSnap?.optionId).toBe(matched.productOption?.id ?? null);
    expect(matchedSnap?.rawJson).toMatchObject({ vendorItemId: 'VENDOR-A' });

    const listingOnly = snapshots.find((s) => s.externalId === 'EXT-A');
    expect(listingOnly?.matchStatus).toBe('matched_listing_only');
    expect(listingOnly?.listingId).toBe(matched.listing.id);
    expect(listingOnly?.listingOptionId).toBeNull();

    const unmatched = snapshots.find((s) => s.externalOptionId === 'VENDOR-NONE');
    expect(unmatched?.matchStatus).toBe('unmatched');
    expect(unmatched?.listingId).toBeNull();
    expect(unmatched?.listingOptionId).toBeNull();
  });

  it('ChannelListingOption with null internal optionId still surfaces listingOptionId in matches', async () => {
    const seeded = await seedListingWithOption({
      externalId: 'EXT-NULL',
      externalOptionId: 'VENDOR-NULL',
      optionId: 'null',
    });
    expect(seeded.listingOption.optionId).toBeNull();

    const result = (await adSyncService.sync(
      {
        type: 'ad_campaign',
        campaignName: 'Camp-Null',
        period: '7d',
        normalizedRows: [
          {
            pageType: 'product',
            campaignName: 'Camp-Null',
            productName: 'P-Null',
            vendorItemId: 'VENDOR-NULL',
            itemId: 'VENDOR-NULL',
            spend: '0',
          },
        ],
      },
      companyId,
    )) as { scrapeRunId: string };

    const snap = await prisma.channelScrapeSnapshot.findFirst({
      where: { scrapeRunId: result.scrapeRunId, externalOptionId: 'VENDOR-NULL' },
    });
    expect(snap?.matchStatus).toBe('matched');
    expect(snap?.listingId).toBe(seeded.listing.id);
    expect(snap?.listingOptionId).toBe(seeded.listingOption.id);
    expect(snap?.optionId).toBeNull();
  });

  it('traffic creates a wing/traffic run with periodStart/periodEnd from dateFrom/dateTo and snapshots every row', async () => {
    const matched = await seedListingWithOption({
      externalId: 'EXT-TRAFFIC',
      externalOptionId: 'VENDOR-TRAFFIC',
    });

    const result = (await adSyncService.sync(
      {
        type: 'traffic',
        period: 14,
        startDate: '2026-04-14',
        dateFrom: '2026-04-01',
        dateTo: '2026-04-14',
        data: [
          {
            externalId: 'EXT-TRAFFIC',
            visitors: 100,
            views: 200,
            cartAdds: 5,
            orders: 3,
            salesQty: 3,
            revenue: 30000,
          },
          {
            externalId: 'EXT-MISSING',
            visitors: 1,
            views: 1,
            cartAdds: 0,
            orders: 0,
            salesQty: 0,
            revenue: 0,
          },
        ],
      },
      companyId,
    )) as {
      scrapeRunId: string;
      scrapeSnapshotCount: number;
      scrapeUnmatchedCount: number;
    };

    expect(result.scrapeSnapshotCount).toBe(2);
    expect(result.scrapeUnmatchedCount).toBe(1);
    const run = await prisma.channelScrapeRun.findUnique({
      where: { id: result.scrapeRunId },
    });
    expect(run?.source).toBe('wing');
    expect(run?.pageType).toBe('traffic');
    expect(run?.periodStart?.toISOString().slice(0, 10)).toBe('2026-04-01');
    expect(run?.periodEnd?.toISOString().slice(0, 10)).toBe('2026-04-14');

    const matchedSnap = await prisma.channelScrapeSnapshot.findFirst({
      where: { scrapeRunId: result.scrapeRunId, externalId: 'EXT-TRAFFIC' },
    });
    expect(matchedSnap?.matchStatus).toBe('matched_listing_only');
    expect(matchedSnap?.listingId).toBe(matched.listing.id);

    // Existing TrafficStats write must still happen for matched rows (regression).
    const trafficStats = await prisma.trafficStats.count({
      where: { companyId, listingId: matched.listing.id },
    });
    expect(trafficStats).toBe(1);
  });

  it('coupang_ads_daily run records a snapshot per row with matchStatus=unmatched (no listing identity)', async () => {
    const result = (await adSyncService.sync(
      {
        type: 'coupang_ads_daily',
        dateFrom: '2026-04-12',
        dateTo: '2026-04-14',
        data: [
          { date: '2026-04-12', adSpend: 1000, adRevenue: 3000, impressions: 10, clicks: 1 },
          { date: '2026-04-13', adSpend: 2000, adRevenue: 5000, impressions: 20, clicks: 2 },
        ],
      },
      companyId,
    )) as { scrapeRunId: string; scrapeSnapshotCount: number };

    expect(result.scrapeSnapshotCount).toBe(2);
    const run = await prisma.channelScrapeRun.findUnique({
      where: { id: result.scrapeRunId },
    });
    expect(run?.source).toBe('coupang_ads');
    expect(run?.pageType).toBe('dashboard_daily');
    expect(run?.matchedCount).toBe(0);
    expect(run?.unmatchedCount).toBe(2);

    const snaps = await prisma.channelScrapeSnapshot.findMany({
      where: { scrapeRunId: result.scrapeRunId },
      orderBy: { businessDate: 'asc' },
    });
    expect(snaps).toHaveLength(2);
    expect(snaps.every((s) => s.matchStatus === 'unmatched')).toBe(true);
    expect(snaps[0].businessDate?.toISOString().slice(0, 10)).toBe('2026-04-12');
    expect(snaps[1].businessDate?.toISOString().slice(0, 10)).toBe('2026-04-13');
  });

  it('handler error path: ChannelScrapeRun is finalized as status="error" with errorJson — never stuck on "running"', async () => {
    // Force `prisma.adSnapshot.create` to throw inside handleAdCampaign so we
    // exercise the catch path. We do NOT seed a listing so the matched/total
    // KPI snapshot create is the first one to fire.
    const original = prisma.adSnapshot.create.bind(prisma.adSnapshot);
    let firstCall = true;
    (prisma.adSnapshot as { create: typeof original }).create = (async (
      ...args: Parameters<typeof original>
    ) => {
      if (firstCall) {
        firstCall = false;
        throw new Error('boom — simulated PG failure');
      }
      return original(...args);
    }) as typeof original;

    try {
      await expect(
        adSyncService.sync(
          {
            type: 'ad_campaign',
            campaignName: 'Camp-Boom',
            period: '7d',
            normalizedRows: [
              {
                pageType: 'product',
                campaignName: 'Camp-Boom',
                productName: 'P-Boom',
                vendorItemId: 'VENDOR-BOOM',
              },
            ],
          },
          companyId,
        ),
      ).rejects.toThrow('boom — simulated PG failure');
    } finally {
      (prisma.adSnapshot as { create: typeof original }).create = original;
    }

    const errored = await prisma.channelScrapeRun.findFirst({
      where: { companyId, source: 'advertising' },
      orderBy: { startedAt: 'desc' },
    });
    expect(errored?.status).toBe('error');
    expect(errored?.finishedAt).not.toBeNull();
    expect(errored?.errorJson).toMatchObject({ message: expect.stringContaining('boom') });
  });

  it('raw_scrape with unknown source still snapshots every payload row (raw preservation)', async () => {
    const result = (await adSyncService.sync(
      {
        type: 'raw_scrape',
        source: 'mystery',
        timestamp: '2026-04-14T01:00:00Z',
        data: [
          { externalId: 'EXT-X1', value: 1 },
          { externalId: 'EXT-X2', value: 2 },
        ],
      },
      companyId,
    )) as { scrapeRunId: string; scrapeSnapshotCount: number };

    expect(result.scrapeSnapshotCount).toBe(2);
    const snaps = await prisma.channelScrapeSnapshot.findMany({
      where: { scrapeRunId: result.scrapeRunId },
    });
    expect(snaps).toHaveLength(2);
    expect(snaps.every((s) => s.matchStatus === 'unmatched')).toBe(true);
    expect(snaps[0].matchReason).toContain("unknown source 'mystery'");
  });

  it('coupang_ads_daily preserves rows missing `date` as snapshots (no AdSnapshot upsert)', async () => {
    const result = (await adSyncService.sync(
      {
        type: 'coupang_ads_daily',
        data: [
          { date: '2026-04-12', adSpend: 1000 },
          { adSpend: 999 }, // missing date — must still snapshot
        ],
      },
      companyId,
    )) as { scrapeRunId: string; scrapeSnapshotCount: number };

    expect(result.scrapeSnapshotCount).toBe(2);
    const snaps = await prisma.channelScrapeSnapshot.findMany({
      where: { scrapeRunId: result.scrapeRunId },
      orderBy: { matchReason: 'asc' },
    });
    expect(snaps).toHaveLength(2);
    const missingDateSnap = snaps.find((s) => s.businessDate === null);
    expect(missingDateSnap).toBeDefined();
    expect(missingDateSnap?.matchReason).toContain('missing-date');

    // Only the date-bearing row should produce an AdSnapshot row.
    const adSnaps = await prisma.adSnapshot.count({
      where: { companyId, source: 'coupang_ads' },
    });
    expect(adSnaps).toBe(1);
  });

  it('toBusinessDate respects KST: timestamp 2026-04-13T15:30:00Z lands as 2026-04-14 (KST), not 2026-04-13', async () => {
    // Around-midnight payload — was a known regression risk per plan §10.
    const matched = await seedListingWithOption({
      externalId: 'EXT-KST',
      externalOptionId: 'VENDOR-KST',
    });

    const result = (await adSyncService.sync(
      {
        type: 'raw_scrape',
        source: 'wing',
        timestamp: '2026-04-13T15:30:00Z', // KST 2026-04-14 00:30
        data: [
          {
            productName: 'KST Toy',
            externalId: 'EXT-KST',
            isWinner: true,
            myPrice: 1000,
          },
        ],
      },
      companyId,
    )) as { scrapeRunId: string };

    const run = await prisma.channelScrapeRun.findUnique({
      where: { id: result.scrapeRunId },
    });
    expect(run?.businessDate?.toISOString().slice(0, 10)).toBe('2026-04-14');

    const snap = await prisma.channelScrapeSnapshot.findFirst({
      where: { scrapeRunId: result.scrapeRunId, listingId: matched.listing.id },
    });
    expect(snap?.businessDate?.toISOString().slice(0, 10)).toBe('2026-04-14');
  });

  it('raw_scrape (wing) creates a wing/itemwinner run + writes snapshot per row alongside ItemWinner', async () => {
    const matched = await seedListingWithOption({
      externalId: 'EXT-IW',
      externalOptionId: 'VENDOR-IW',
    });

    const result = (await adSyncService.sync(
      {
        type: 'raw_scrape',
        source: 'wing',
        timestamp: '2026-04-14T01:00:00Z',
        data: [
          {
            productName: 'Winner Toy',
            externalId: 'EXT-IW',
            isWinner: true,
            myPrice: 10000,
            winnerPrice: 9500,
          },
          {
            productName: 'Lonely Toy',
            externalId: 'EXT-NONE',
            isWinner: false,
            myPrice: 1,
          },
        ],
      },
      companyId,
    )) as {
      scrapeRunId: string;
      scrapeSnapshotCount: number;
      scrapeMatchedCount: number;
    };

    expect(result.scrapeSnapshotCount).toBe(2);
    expect(result.scrapeMatchedCount).toBe(1);
    const run = await prisma.channelScrapeRun.findUnique({
      where: { id: result.scrapeRunId },
    });
    expect(run?.source).toBe('wing');
    expect(run?.pageType).toBe('itemwinner');

    const itemWinners = await prisma.itemWinner.count({
      where: { companyId, listingId: matched.listing.id },
    });
    expect(itemWinners).toBe(1);
  });
});
