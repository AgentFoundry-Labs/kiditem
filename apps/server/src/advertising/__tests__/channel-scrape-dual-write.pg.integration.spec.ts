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
  OTHER_COMPANY_ID,
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
  let scrapePersistence: ChannelScrapePersistenceService;
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
    scrapePersistence = m.get(ChannelScrapePersistenceService);
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

  it('ChannelScrapeRun finalization is company-scoped', async () => {
    const run = await scrapePersistence.createRun({
      companyId,
      channel: 'coupang',
      source: 'advertising',
      pageType: 'campaign',
    });

    await expect(
      scrapePersistence.finalizeRun({
        scrapeRunId: run.id,
        companyId: OTHER_COMPANY_ID,
        status: 'complete',
      }),
    ).rejects.toThrow('ChannelScrapeRun not found for company scope');

    const stillRunning = await prisma.channelScrapeRun.findUnique({
      where: { id: run.id },
    });
    expect(stillRunning?.status).toBe('running');

    await scrapePersistence.finalizeRun({
      scrapeRunId: run.id,
      companyId,
      status: 'complete',
      rowCount: 0,
    });
    const finalized = await prisma.channelScrapeRun.findUnique({
      where: { id: run.id },
    });
    expect(finalized?.status).toBe('complete');
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
        timestamp: '2026-04-13T15:30:00Z',
        dateFrom: '2026-04-01',
        dateTo: '2026-04-07',
        data: [
          { rawRowId: 'raw-kpi', text: 'summary total' },
          { rawRowId: 'raw-missing-identity', text: 'blank identity' },
          { rawRowId: 'raw-vendor-a', text: 'vendor item row' },
          { rawRowId: 'raw-ext-a', text: 'external id row' },
          { rawRowId: 'raw-unmatched', text: 'unknown row' },
        ],
        normalizedRows: [
          {
            pageType: 'summary',
            _kpiOnly: true,
            metric: 'total',
          },
          {
            pageType: 'product',
            spend: '333',
          },
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

    expect(result.scrapeSnapshotCount).toBe(5);
    expect(result.scrapeMatchedCount).toBe(2);
    expect(result.scrapeUnmatchedCount).toBe(3);

    const run = await prisma.channelScrapeRun.findUnique({
      where: { id: result.scrapeRunId },
    });
    expect(run?.channel).toBe('coupang');
    expect(run?.source).toBe('advertising');
    expect(run?.pageType).toBe('campaign');
    expect(run?.status).toBe('complete');
    expect(run?.businessDate?.toISOString().slice(0, 10)).toBe('2026-04-14');
    expect(run?.rowCount).toBe(5);
    expect(run?.matchedCount).toBe(2);
    expect(run?.unmatchedCount).toBe(3);
    expect(run?.periodStart?.toISOString().slice(0, 10)).toBe('2026-04-01');
    expect(run?.periodEnd?.toISOString().slice(0, 10)).toBe('2026-04-07');
    expect(run?.finishedAt).not.toBeNull();

    const snapshots = await prisma.channelScrapeSnapshot.findMany({
      where: { scrapeRunId: result.scrapeRunId },
      orderBy: { observedAt: 'asc' },
    });
    expect(snapshots).toHaveLength(5);

    const kpiOnly = snapshots.find((s) => s.matchReason?.includes('kpi-only'));
    expect(kpiOnly?.matchStatus).toBe('unmatched');
    expect(kpiOnly?.rawJson).toMatchObject({ rawRowId: 'raw-kpi' });
    expect(kpiOnly?.normalizedJson).toMatchObject({ _kpiOnly: true });

    const missingIdentity = snapshots.find((s) =>
      s.matchReason?.includes('missing campaign/product/keyword identity'),
    );
    expect(missingIdentity?.matchStatus).toBe('unmatched');
    expect(missingIdentity?.rawJson).toMatchObject({ rawRowId: 'raw-missing-identity' });
    expect(missingIdentity?.normalizedJson).toMatchObject({ spend: '333' });

    const matchedSnap = snapshots.find((s) => s.externalOptionId === 'VENDOR-A');
    expect(matchedSnap?.matchStatus).toBe('matched');
    expect(matchedSnap?.businessDate?.toISOString().slice(0, 10)).toBe('2026-04-14');
    expect(matchedSnap?.listingId).toBe(matched.listing.id);
    expect(matchedSnap?.listingOptionId).toBe(matched.listingOption.id);
    expect(matchedSnap?.optionId).toBe(matched.productOption?.id ?? null);
    expect(matchedSnap?.rawJson).toMatchObject({ rawRowId: 'raw-vendor-a' });
    expect(matchedSnap?.normalizedJson).toMatchObject({ vendorItemId: 'VENDOR-A' });

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
        startDate: '2026-04-13T15:30:00Z',
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
    expect(run?.businessDate?.toISOString().slice(0, 10)).toBe('2026-04-14');
    expect(run?.periodStart?.toISOString().slice(0, 10)).toBe('2026-04-01');
    expect(run?.periodEnd?.toISOString().slice(0, 10)).toBe('2026-04-14');

    const matchedSnap = await prisma.channelScrapeSnapshot.findFirst({
      where: { scrapeRunId: result.scrapeRunId, externalId: 'EXT-TRAFFIC' },
    });
    expect(matchedSnap?.matchStatus).toBe('matched_listing_only');
    expect(matchedSnap?.businessDate?.toISOString().slice(0, 10)).toBe('2026-04-14');
    expect(matchedSnap?.listingId).toBe(matched.listing.id);

    // H2 — traffic metrics now land on ChannelListingDailySnapshot, not TrafficStats.
    const listingDaily = await prisma.channelListingDailySnapshot.findFirst({
      where: { companyId, listingId: matched.listing.id },
    });
    expect(listingDaily).toBeDefined();
    expect(listingDaily?.businessDate.toISOString().slice(0, 10)).toBe('2026-04-14');
    expect(listingDaily?.trafficVisitors).toBe(100);
    expect(listingDaily?.trafficViews).toBe(200);
    expect(listingDaily?.trafficCartAdds).toBe(5);
    expect(listingDaily?.trafficOrders).toBe(3);
    expect(listingDaily?.trafficSalesQty).toBe(3);
    expect(listingDaily?.trafficRevenue).toBe(30000);
  });

  it('coupang_ads_daily run records a snapshot per row with matchStatus=unmatched (no listing identity)', async () => {
    const result = (await adSyncService.sync(
      {
        type: 'coupang_ads_daily',
        dateFrom: '2026-04-12',
        dateTo: '2026-4-14',
        data: [
          { date: '2026-04-12', adSpend: 1000, adRevenue: 3000, impressions: 10, clicks: 1 },
          { date: '2026-4-13', adSpend: 2000, adRevenue: 5000, impressions: 20, clicks: 2 },
          { date: '2026-04-13T15:30:00Z', adSpend: 3000, adRevenue: 7000, impressions: 30, clicks: 3 },
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
    expect(result.scrapeMatchedCount).toBe(0);
    expect(result.scrapeUnmatchedCount).toBe(3);
    const run = await prisma.channelScrapeRun.findUnique({
      where: { id: result.scrapeRunId },
    });
    expect(run?.source).toBe('coupang_ads');
    expect(run?.pageType).toBe('dashboard_daily');
    expect(run?.status).toBe('complete');
    expect(run?.finishedAt).not.toBeNull();
    expect(run?.businessDate?.toISOString().slice(0, 10)).toBe('2026-04-12');
    expect(run?.periodStart?.toISOString().slice(0, 10)).toBe('2026-04-12');
    expect(run?.periodEnd?.toISOString().slice(0, 10)).toBe('2026-04-14');
    expect(run?.matchedCount).toBe(0);
    expect(run?.unmatchedCount).toBe(3);

    const snaps = await prisma.channelScrapeSnapshot.findMany({
      where: { scrapeRunId: result.scrapeRunId },
      orderBy: { businessDate: 'asc' },
    });
    expect(snaps).toHaveLength(3);
    expect(snaps.every((s) => s.matchStatus === 'unmatched')).toBe(true);
    expect(snaps[0].businessDate?.toISOString().slice(0, 10)).toBe('2026-04-12');
    expect(snaps[1].businessDate?.toISOString().slice(0, 10)).toBe('2026-04-13');
    expect(snaps[2].businessDate?.toISOString().slice(0, 10)).toBe('2026-04-14');
  });

  it('handler error path: ChannelScrapeRun is finalized as status="error" with errorJson — never stuck on "running"', async () => {
    // H2 — force a daily-fact upsert (ChannelAccountDailyKpiSnapshot) to throw
    // inside handleAdCampaign so we exercise the catch path. The raw
    // ChannelScrapeSnapshot is appended BEFORE the failing upsert so it
    // survives the abort, proving the raw-first contract.
    const original = prisma.channelAccountDailyKpiSnapshot.upsert.bind(
      prisma.channelAccountDailyKpiSnapshot,
    );
    let firstCall = true;
    (prisma.channelAccountDailyKpiSnapshot as { upsert: typeof original }).upsert =
      (async (
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
            kpis: { '광고비': '100' },
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
      (
        prisma.channelAccountDailyKpiSnapshot as { upsert: typeof original }
      ).upsert = original;
    }

    const errored = await prisma.channelScrapeRun.findFirst({
      where: { companyId, source: 'advertising' },
      orderBy: { startedAt: 'desc' },
    });
    expect(errored).toBeDefined();
    expect(errored?.status).toBe('error');
    expect(errored?.finishedAt).not.toBeNull();
    expect(errored?.rowCount).toBe(1);
    expect(errored?.errorJson).toMatchObject({ message: expect.stringContaining('boom') });
    const preservedRows = await prisma.channelScrapeSnapshot.findMany({
      where: { scrapeRunId: errored!.id },
    });
    expect(preservedRows).toHaveLength(1);
    expect(preservedRows[0].normalizedJson).toMatchObject({ vendorItemId: 'VENDOR-BOOM' });
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

  it('raw_scrape advertising keeps source rawJson separate from normalizedJson', async () => {
    const matched = await seedListingWithOption({
      externalId: 'EXT-RAW-AD',
      externalOptionId: 'VENDOR-RAW-AD',
    });

    const result = (await adSyncService.sync(
      {
        type: 'raw_scrape',
        source: 'advertising',
        timestamp: '2026-04-14T01:00:00Z',
        data: [
          { rawRowId: 'raw-ad-row', rawText: '원본 광고 row' },
          { rawRowId: 'raw-only-row', rawText: 'normalizer skipped this row' },
        ],
        normalizedRows: [
          {
            pageType: 'product',
            campaignName: 'Raw Campaign',
            productName: 'Raw Product',
            vendorItemId: 'VENDOR-RAW-AD',
            spend: '42',
          },
        ],
      },
      companyId,
    )) as {
      scrapeRunId: string;
      scrapeSnapshotCount: number;
      scrapeMatchedCount: number;
      scrapeUnmatchedCount: number;
      listingDailyCount: number;
      targetDailyCount: number;
    };

    expect(result.scrapeSnapshotCount).toBe(2);
    expect(result.scrapeMatchedCount).toBe(1);
    expect(result.scrapeUnmatchedCount).toBe(1);
    // Only the matched normalized row produces a listing-day metric upsert.
    expect(result.listingDailyCount).toBe(1);
    expect(result.targetDailyCount).toBe(1);

    const matchedSnap = await prisma.channelScrapeSnapshot.findFirst({
      where: { scrapeRunId: result.scrapeRunId, listingId: matched.listing.id },
    });
    expect(matchedSnap?.rawJson).toMatchObject({ rawRowId: 'raw-ad-row' });
    expect(matchedSnap?.normalizedJson).toMatchObject({
      vendorItemId: 'VENDOR-RAW-AD',
    });

    const rawOnlySnap = await prisma.channelScrapeSnapshot.findFirst({
      where: { scrapeRunId: result.scrapeRunId, matchReason: { contains: 'missing normalized row' } },
    });
    expect(rawOnlySnap?.rawJson).toMatchObject({ rawRowId: 'raw-only-row' });
    expect(rawOnlySnap?.normalizedJson).toBeNull();
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

    // H2 — only the date-bearing row produces a ChannelAccountDailyKpiSnapshot row.
    const kpiSnaps = await prisma.channelAccountDailyKpiSnapshot.count({
      where: { companyId, source: 'coupang_ads', kpiType: 'coupang_ads_daily' },
    });
    expect(kpiSnaps).toBe(1);
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

  it('raw_scrape (wing) creates a wing/itemwinner run + writes snapshot per row alongside ChannelListingDailySnapshot', async () => {
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

    // H2 — winner state lands on ChannelListingDailySnapshot, not ItemWinner.
    const listingDaily = await prisma.channelListingDailySnapshot.findFirst({
      where: { companyId, listingId: matched.listing.id },
    });
    expect(listingDaily?.isOfferWinner).toBe(true);
    expect(listingDaily?.myPrice).toBe(10000);
    expect(listingDaily?.winnerPrice).toBe(9500);
  });

  // -----------------------------------------------------------------------
  // Wave C3 — Daily listing/option snapshot upsert.
  // -----------------------------------------------------------------------

  it('Wave C3 — wing item-winner row upserts both listing daily and option daily fact (full vendor match)', async () => {
    const matched = await seedListingWithOption({
      externalId: 'EXT-C3-A',
      externalOptionId: 'VENDOR-C3-A',
    });

    const result = (await adSyncService.sync(
      {
        type: 'raw_scrape',
        source: 'wing',
        timestamp: '2026-04-14T02:00:00Z',
        data: [
          {
            productName: 'Daily Winner',
            externalId: 'EXT-C3-A',
            vendorItemId: 'VENDOR-C3-A',
            isWinner: true,
            myPrice: 12000,
            winnerPrice: 11500,
          },
        ],
      },
      companyId,
    )) as { scrapeRunId: string };

    const listingDaily = await prisma.channelListingDailySnapshot.findFirst({
      where: { companyId, listingId: matched.listing.id },
    });
    expect(listingDaily).toBeDefined();
    expect(listingDaily?.businessDate.toISOString().slice(0, 10)).toBe(
      '2026-04-14',
    );
    expect(listingDaily?.channel).toBe('coupang');
    expect(listingDaily?.externalId).toBe('EXT-C3-A');
    expect(listingDaily?.productName).toBe('Daily Winner');
    expect(listingDaily?.isOfferWinner).toBe(true);
    expect(listingDaily?.myPrice).toBe(12000);
    expect(listingDaily?.winnerPrice).toBe(11500);
    expect(listingDaily?.winnerGapPrice).toBe(-500);
    expect(listingDaily?.sampleCount).toBe(1);
    expect(listingDaily?.firstObservedAt).not.toBeNull();
    expect(listingDaily?.lastObservedAt).not.toBeNull();
    expect(listingDaily?.rawSnapshotId).not.toBeNull();

    const linkedSnap = await prisma.channelScrapeSnapshot.findUnique({
      where: { id: listingDaily!.rawSnapshotId! },
    });
    expect(linkedSnap?.scrapeRunId).toBe(result.scrapeRunId);

    const optionDaily =
      await prisma.channelListingOptionDailySnapshot.findFirst({
        where: { companyId, listingOptionId: matched.listingOption.id },
      });
    expect(optionDaily).toBeDefined();
    expect(optionDaily?.externalOptionId).toBe('VENDOR-C3-A');
    expect(optionDaily?.optionId).toBe(matched.productOption?.id ?? null);
    expect(optionDaily?.isOfferWinner).toBe(true);
    expect(optionDaily?.myPrice).toBe(12000);
    expect(optionDaily?.winnerPrice).toBe(11500);
    expect(optionDaily?.winnerGapPrice).toBe(-500);
    expect(optionDaily?.sampleCount).toBe(1);
  });

  it('Wave C3 — second scrape on the same KST businessDate is idempotent: 1 listing daily + 1 option daily, sampleCount=2, lastObservedAt advances, firstObservedAt preserved, raw rows multiply', async () => {
    const matched = await seedListingWithOption({
      externalId: 'EXT-C3-IDEM',
      externalOptionId: 'VENDOR-C3-IDEM',
    });

    await adSyncService.sync(
      {
        type: 'raw_scrape',
        source: 'wing',
        timestamp: '2026-04-14T02:00:00Z',
        data: [
          {
            productName: 'Idem Toy',
            externalId: 'EXT-C3-IDEM',
            vendorItemId: 'VENDOR-C3-IDEM',
            isWinner: true,
            myPrice: 10000,
            winnerPrice: 9500,
          },
        ],
      },
      companyId,
    );
    const firstListing = await prisma.channelListingDailySnapshot.findFirst({
      where: { companyId, listingId: matched.listing.id },
    });
    const firstOption =
      await prisma.channelListingOptionDailySnapshot.findFirst({
        where: { companyId, listingOptionId: matched.listingOption.id },
      });
    expect(firstListing).toBeDefined();
    expect(firstOption).toBeDefined();
    const firstObservedListingAt = firstListing!.firstObservedAt;
    const firstObservedOptionAt = firstOption!.firstObservedAt;
    const firstLastListingAt = firstListing!.lastObservedAt;
    const firstRawSnapshotId = firstListing!.rawSnapshotId;

    // Force at least 5ms gap so lastObservedAt can be observed to advance.
    await new Promise((r) => setTimeout(r, 10));

    await adSyncService.sync(
      {
        type: 'raw_scrape',
        source: 'wing',
        // Same KST business date (2026-04-14), different observation time.
        timestamp: '2026-04-14T05:00:00Z',
        data: [
          {
            productName: 'Idem Toy',
            externalId: 'EXT-C3-IDEM',
            vendorItemId: 'VENDOR-C3-IDEM',
            isWinner: false,
            myPrice: 9800,
            winnerPrice: 9500,
          },
        ],
      },
      companyId,
    );

    // Listing daily — exactly one row, sampleCount=2, fields overwritten.
    const listingDailies = await prisma.channelListingDailySnapshot.findMany({
      where: { companyId, listingId: matched.listing.id },
    });
    expect(listingDailies).toHaveLength(1);
    const listingDaily = listingDailies[0];
    expect(listingDaily.sampleCount).toBe(2);
    expect(listingDaily.firstObservedAt.toISOString()).toBe(
      firstObservedListingAt.toISOString(),
    );
    expect(listingDaily.lastObservedAt.getTime()).toBeGreaterThan(
      firstLastListingAt.getTime(),
    );
    expect(listingDaily.isOfferWinner).toBe(false);
    expect(listingDaily.myPrice).toBe(9800);
    expect(listingDaily.winnerPrice).toBe(9500);
    expect(listingDaily.winnerGapPrice).toBe(-300);
    // rawSnapshotId points at the most recent observation.
    expect(listingDaily.rawSnapshotId).not.toBeNull();
    expect(listingDaily.rawSnapshotId).not.toBe(firstRawSnapshotId);

    // Option daily — same idempotent shape.
    const optionDailies =
      await prisma.channelListingOptionDailySnapshot.findMany({
        where: { companyId, listingOptionId: matched.listingOption.id },
      });
    expect(optionDailies).toHaveLength(1);
    expect(optionDailies[0].sampleCount).toBe(2);
    expect(optionDailies[0].firstObservedAt.toISOString()).toBe(
      firstObservedOptionAt.toISOString(),
    );
    expect(optionDailies[0].isOfferWinner).toBe(false);
    expect(optionDailies[0].myPrice).toBe(9800);
    expect(optionDailies[0].winnerPrice).toBe(9500);

    // Raw snapshots accumulate (one per scrape, append-only).
    const rawCount = await prisma.channelScrapeSnapshot.count({
      where: { companyId, listingId: matched.listing.id },
    });
    expect(rawCount).toBe(2);
  });

  it('Wave C3 — different KST businessDate creates a new daily row (no merge across days)', async () => {
    const matched = await seedListingWithOption({
      externalId: 'EXT-C3-DAY',
      externalOptionId: 'VENDOR-C3-DAY',
    });

    await adSyncService.sync(
      {
        type: 'raw_scrape',
        source: 'wing',
        timestamp: '2026-04-13T03:00:00Z', // KST 2026-04-13 12:00
        data: [
          {
            productName: 'Day1',
            vendorItemId: 'VENDOR-C3-DAY',
            externalId: 'EXT-C3-DAY',
            isWinner: true,
            myPrice: 1000,
            winnerPrice: 1000,
          },
        ],
      },
      companyId,
    );
    await adSyncService.sync(
      {
        type: 'raw_scrape',
        source: 'wing',
        timestamp: '2026-04-14T03:00:00Z', // KST 2026-04-14 12:00
        data: [
          {
            productName: 'Day2',
            vendorItemId: 'VENDOR-C3-DAY',
            externalId: 'EXT-C3-DAY',
            isWinner: false,
            myPrice: 1100,
            winnerPrice: 1000,
          },
        ],
      },
      companyId,
    );

    const listings = await prisma.channelListingDailySnapshot.findMany({
      where: { companyId, listingId: matched.listing.id },
      orderBy: { businessDate: 'asc' },
    });
    expect(listings).toHaveLength(2);
    expect(listings[0].businessDate.toISOString().slice(0, 10)).toBe(
      '2026-04-13',
    );
    expect(listings[1].businessDate.toISOString().slice(0, 10)).toBe(
      '2026-04-14',
    );
    const options = await prisma.channelListingOptionDailySnapshot.findMany({
      where: { companyId, listingOptionId: matched.listingOption.id },
      orderBy: { businessDate: 'asc' },
    });
    expect(options).toHaveLength(2);
  });

  it('Wave C3 — listing-only match (vendorItemId miss → externalId fallback) writes listing daily but no option daily', async () => {
    const matched = await seedListingWithOption({
      externalId: 'EXT-C3-LO',
      externalOptionId: 'VENDOR-C3-LO',
    });

    await adSyncService.sync(
      {
        type: 'raw_scrape',
        source: 'wing',
        timestamp: '2026-04-14T02:00:00Z',
        data: [
          {
            productName: 'Listing Only',
            externalId: 'EXT-C3-LO', // matches listing
            vendorItemId: 'VENDOR-MISS', // misses option map
            isWinner: true,
            myPrice: 5000,
            winnerPrice: 4900,
          },
        ],
      },
      companyId,
    );

    const listingDaily = await prisma.channelListingDailySnapshot.findFirst({
      where: { companyId, listingId: matched.listing.id },
    });
    expect(listingDaily).toBeDefined();
    expect(listingDaily?.isOfferWinner).toBe(true);

    const optionDaily =
      await prisma.channelListingOptionDailySnapshot.findFirst({
        where: { companyId, listingOptionId: matched.listingOption.id },
      });
    expect(optionDaily).toBeNull();
  });

  it('Wave C3 — option daily fact lands even when internal optionId is null (channel option matched, ProductOption unmatched)', async () => {
    const matched = await seedListingWithOption({
      externalId: 'EXT-C3-OPTNULL',
      externalOptionId: 'VENDOR-C3-OPTNULL',
      optionId: 'null',
    });
    expect(matched.listingOption.optionId).toBeNull();

    await adSyncService.sync(
      {
        type: 'raw_scrape',
        source: 'wing',
        timestamp: '2026-04-14T02:00:00Z',
        data: [
          {
            productName: 'Null Option Toy',
            externalId: 'EXT-C3-OPTNULL',
            vendorItemId: 'VENDOR-C3-OPTNULL',
            isWinner: false,
            myPrice: 7000,
            winnerPrice: 6900,
          },
        ],
      },
      companyId,
    );

    const optionDaily =
      await prisma.channelListingOptionDailySnapshot.findFirst({
        where: { companyId, listingOptionId: matched.listingOption.id },
      });
    expect(optionDaily).toBeDefined();
    expect(optionDaily?.optionId).toBeNull();
    expect(optionDaily?.externalOptionId).toBe('VENDOR-C3-OPTNULL');
    expect(optionDaily?.myPrice).toBe(7000);
  });

  it('Wave C3 — unmatched row preserves raw snapshot but creates no daily fact', async () => {
    await adSyncService.sync(
      {
        type: 'raw_scrape',
        source: 'wing',
        timestamp: '2026-04-14T02:00:00Z',
        data: [
          {
            productName: 'Lost Toy',
            externalId: 'EXT-C3-NONE',
            vendorItemId: 'VENDOR-C3-NONE',
            isWinner: false,
            myPrice: 100,
            winnerPrice: 100,
          },
        ],
      },
      companyId,
    );

    const listingCount = await prisma.channelListingDailySnapshot.count({
      where: { companyId },
    });
    const optionCount = await prisma.channelListingOptionDailySnapshot.count({
      where: { companyId },
    });
    expect(listingCount).toBe(0);
    expect(optionCount).toBe(0);

    const rawCount = await prisma.channelScrapeSnapshot.count({
      where: { companyId, externalId: 'EXT-C3-NONE' },
    });
    expect(rawCount).toBe(1);
  });

  it('Wave C3 — short product name still upserts daily fact (winner state is valuable independent of ItemWinner filter)', async () => {
    const matched = await seedListingWithOption({
      externalId: 'EXT-C3-SHORT',
      externalOptionId: 'VENDOR-C3-SHORT',
    });

    await adSyncService.sync(
      {
        type: 'raw_scrape',
        source: 'wing',
        timestamp: '2026-04-14T02:00:00Z',
        data: [
          {
            productName: 'X', // <3 chars — historic legacy ItemWinner filter
            externalId: 'EXT-C3-SHORT',
            vendorItemId: 'VENDOR-C3-SHORT',
            isWinner: true,
            myPrice: 2000,
            winnerPrice: 1900,
          },
        ],
      },
      companyId,
    );

    // H2 — daily fact landed regardless of the legacy short-product-name
    // filter. Winner state is independent.
    const listingDaily = await prisma.channelListingDailySnapshot.findFirst({
      where: { companyId, listingId: matched.listing.id },
    });
    expect(listingDaily?.isOfferWinner).toBe(true);
    expect(listingDaily?.myPrice).toBe(2000);
  });

  it('Wave C3 — observable fields are not wiped when a later scrape omits them', async () => {
    const matched = await seedListingWithOption({
      externalId: 'EXT-C3-NULL',
      externalOptionId: 'VENDOR-C3-NULL',
    });

    // First scrape: full state.
    await adSyncService.sync(
      {
        type: 'raw_scrape',
        source: 'wing',
        timestamp: '2026-04-14T02:00:00Z',
        data: [
          {
            productName: 'Persistent State',
            externalId: 'EXT-C3-NULL',
            vendorItemId: 'VENDOR-C3-NULL',
            isWinner: true,
            myPrice: 8000,
            winnerPrice: 7900,
          },
        ],
      },
      companyId,
    );
    // Second scrape: row is observed but lacks winnerPrice/myPrice/isWinner.
    // The previous values must survive.
    await adSyncService.sync(
      {
        type: 'raw_scrape',
        source: 'wing',
        timestamp: '2026-04-14T05:00:00Z',
        data: [
          {
            productName: 'Persistent State', // only product name re-observed
            externalId: 'EXT-C3-NULL',
            vendorItemId: 'VENDOR-C3-NULL',
          },
        ],
      },
      companyId,
    );

    const listingDaily = await prisma.channelListingDailySnapshot.findFirst({
      where: { companyId, listingId: matched.listing.id },
    });
    expect(listingDaily?.productName).toBe('Persistent State');
    expect(listingDaily?.isOfferWinner).toBe(true);
    expect(listingDaily?.myPrice).toBe(8000);
    expect(listingDaily?.winnerPrice).toBe(7900);
    expect(listingDaily?.sampleCount).toBe(2);
  });

  it('Wave C3 — cross-tenant isolation: same listing identifiers in another company never bleed into this companys daily snapshots', async () => {
    const ours = await seedListingWithOption({
      externalId: 'EXT-C3-XT',
      externalOptionId: 'VENDOR-C3-XT',
    });

    // Set up a row in OTHER_COMPANY_ID with the same external identifiers.
    const otherStamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const otherMaster = await prisma.masterProduct.create({
      data: {
        companyId: OTHER_COMPANY_ID,
        code: `M-OTHER-${otherStamp}`,
        name: `Master ${otherStamp}`,
        optionCounter: 0,
      },
    });
    const otherListing = await prisma.channelListing.create({
      data: {
        companyId: OTHER_COMPANY_ID,
        masterId: otherMaster.id,
        channel: 'coupang',
        externalId: 'EXT-C3-XT',
      },
    });
    const otherListingOption = await prisma.channelListingOption.create({
      data: {
        companyId: OTHER_COMPANY_ID,
        listingId: otherListing.id,
        externalOptionId: 'VENDOR-C3-XT',
        isActive: true,
      },
    });

    await adSyncService.sync(
      {
        type: 'raw_scrape',
        source: 'wing',
        timestamp: '2026-04-14T02:00:00Z',
        data: [
          {
            productName: 'Ours',
            externalId: 'EXT-C3-XT',
            vendorItemId: 'VENDOR-C3-XT',
            isWinner: true,
            myPrice: 3000,
            winnerPrice: 2900,
          },
        ],
      },
      companyId,
    );
    await adSyncService.sync(
      {
        type: 'raw_scrape',
        source: 'wing',
        timestamp: '2026-04-14T02:00:00Z',
        data: [
          {
            productName: 'Theirs',
            externalId: 'EXT-C3-XT',
            vendorItemId: 'VENDOR-C3-XT',
            isWinner: false,
            myPrice: 4000,
            winnerPrice: 3900,
          },
        ],
      },
      OTHER_COMPANY_ID,
    );

    // Ours: matches the company-scoped listing only.
    const oursDaily = await prisma.channelListingDailySnapshot.findMany({
      where: { companyId },
    });
    expect(oursDaily).toHaveLength(1);
    expect(oursDaily[0].listingId).toBe(ours.listing.id);
    expect(oursDaily[0].productName).toBe('Ours');

    const oursOptionDaily =
      await prisma.channelListingOptionDailySnapshot.findMany({
        where: { companyId },
      });
    expect(oursOptionDaily).toHaveLength(1);
    expect(oursOptionDaily[0].listingOptionId).toBe(ours.listingOption.id);

    // Theirs: matches its own scope.
    const theirsDaily = await prisma.channelListingDailySnapshot.findMany({
      where: { companyId: OTHER_COMPANY_ID },
    });
    expect(theirsDaily).toHaveLength(1);
    expect(theirsDaily[0].listingId).toBe(otherListing.id);
    expect(theirsDaily[0].productName).toBe('Theirs');

    const theirsOptionDaily =
      await prisma.channelListingOptionDailySnapshot.findMany({
        where: { companyId: OTHER_COMPANY_ID },
      });
    expect(theirsOptionDaily).toHaveLength(1);
    expect(theirsOptionDaily[0].listingOptionId).toBe(otherListingOption.id);
  });
});
