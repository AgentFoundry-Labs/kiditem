import type { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { ThumbnailTrackingRepositoryAdapter } from '../adapter/out/repository/thumbnail-tracking.repository.adapter';
import { ThumbnailTrackingService } from '../application/service/thumbnail-tracking.service';
import type { CoupangProductSalesScrapePort } from '../application/port/out/provider/coupang-product-sales-scrape.port';

describe('thumbnail tracking KST business date (PG integration)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });

  afterAll(async () => prisma?.$disconnect());

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  afterEach(() => vi.useRealTimers());

  it('creates the new KST day without overwriting the prior daily row at 00-09 KST', async () => {
    const account = await prisma.channelAccount.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Thumbnail Wing',
      },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: account.id,
        externalId: 'thumbnail-listing',
        channelName: '썸네일 추적 상품',
      },
    });
    const workspace = await prisma.contentWorkspace.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ownerType: 'direct_detail_page',
        displayName: 'Thumbnail tracking workspace',
        normalizedTitle: 'thumbnailtrackingworkspace',
      },
    });
    const generation = await prisma.thumbnailGeneration.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        contentWorkspaceId: workspace.id,
        status: 'succeeded',
      },
    });
    const tracking = await prisma.thumbnailTracking.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        generationId: generation.id,
        originalGrade: 'A',
        originalScore: 90,
      },
    });
    const prior = await prisma.thumbnailTrackingDailySnapshot.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        trackingId: tracking.id,
        capturedDate: new Date('2026-05-18T00:00:00.000Z'),
        unitsSold30d: 10,
        scrapeStatus: 'ok',
      },
    });
    const scraper: CoupangProductSalesScrapePort = {
      scrapeByProductName: vi.fn().mockResolvedValue({
        found: true,
        row: {
          inventoryId: 'inventory-1',
          matchedName: '썸네일 추적 상품',
          unitsSold30d: 11,
          unitsSold7d: 3,
          revenueKrw: 22_000,
          reviewCount: 5,
          ratingAvg: 4.8,
          rawCellTexts: ['썸네일 추적 상품', '11'],
        },
      }),
    };
    const repository = new ThumbnailTrackingRepositoryAdapter(
      prisma as unknown as PrismaService,
    );
    const service = new ThumbnailTrackingService(repository, scraper);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-05-18T16:30:00.000Z'));

    await expect(service.collectDailySnapshot(tracking.id, TEST_ORGANIZATION_ID))
      .resolves.toMatchObject({ capturedDate: '2026-05-19', unitsSold30d: 11 });

    const rows = await prisma.thumbnailTrackingDailySnapshot.findMany({
      where: { trackingId: tracking.id },
      orderBy: { capturedDate: 'asc' },
    });
    expect(rows.map((row) => ({
      id: row.id,
      capturedDate: row.capturedDate.toISOString().slice(0, 10),
      unitsSold30d: row.unitsSold30d,
    }))).toEqual([
      { id: prior.id, capturedDate: '2026-05-18', unitsSold30d: 10 },
      { id: expect.any(String), capturedDate: '2026-05-19', unitsSold30d: 11 },
    ]);
  });
});
