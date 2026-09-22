import { makeChannelListingQuery } from '../../test-helpers/channel-catalog-ports';
import { NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { THUMBNAIL_TRACKING_STATUSES } from '@kiditem/shared/ai';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { ThumbnailTrackingRepositoryAdapter } from '../adapter/out/repository/thumbnail-tracking.repository.adapter';
import type { CoupangProductSalesScrapePort } from '../application/port/out/provider/coupang-product-sales-scrape.port';
import { ThumbnailTrackingService } from '../application/service/thumbnail-tracking.service';
import {
  deriveThumbnailTrackingStatus,
  type ThumbnailTrackingStatusFacts,
} from '../domain/thumbnail-tracking-status';

const EARLIER_MARK = new Date('2026-09-10T00:00:00.000Z');
const FIRST_MARK_TIME = new Date('2026-09-14T01:00:00.000Z');
const LATER_TIME = new Date('2026-09-14T02:00:00.000Z');

/**
 * The list filter selects rows by status in SQL, so each status predicate must
 * select exactly the rows deriveThumbnailTrackingStatus derives. The PATCH mark
 * keeps the operator's first 결론 없음 time until the operator clears it.
 */
describe('thumbnail tracking status (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let service: ThumbnailTrackingService;
  let targets: Map<string, { listingId: string; workspaceId: string }>;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const salesScraper: CoupangProductSalesScrapePort = { scrapeByProductName: vi.fn() };
    service = new ThumbnailTrackingService(
      new ThumbnailTrackingRepositoryAdapter(prisma as unknown as PrismaService, makeChannelListingQuery(prisma)),
      salesScraper,
    );
  });

  afterAll(async () => prisma?.$disconnect());

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    targets = new Map();
  });

  afterEach(() => vi.useRealTimers());

  it('lists each status with exactly the rows the domain rule derives', async () => {
    for (const markedInconclusiveAt of [null, EARLIER_MARK]) {
      for (const ctrBefore of [null, 1.2]) {
        for (const ctrAfter of [null, 2.4]) {
          await seedTracking(TEST_ORGANIZATION_ID, { markedInconclusiveAt, ctrBefore, ctrAfter });
        }
      }
    }
    // Another organization's rows, one per status, are never listed.
    await seedTracking(OTHER_ORGANIZATION_ID, { markedInconclusiveAt: null, ctrBefore: null, ctrAfter: null });
    await seedTracking(OTHER_ORGANIZATION_ID, { markedInconclusiveAt: null, ctrBefore: 1.2, ctrAfter: 2.4 });
    await seedTracking(OTHER_ORGANIZATION_ID, { markedInconclusiveAt: EARLIER_MARK, ctrBefore: null, ctrAfter: null });

    const rows = await prisma.thumbnailTracking.findMany({ where: { organizationId: TEST_ORGANIZATION_ID } });
    const derivedIds = (status: string) =>
      rows.filter((row) => deriveThumbnailTrackingStatus(row) === status).map((row) => row.id).sort();

    const all = await service.findAll({}, TEST_ORGANIZATION_ID);
    expect(all.total).toBe(8);
    expect(Object.fromEntries(all.items.map((item) => [item.id, item.status])))
      .toEqual(Object.fromEntries(rows.map((row) => [row.id, deriveThumbnailTrackingStatus(row)])));

    for (const status of THUMBNAIL_TRACKING_STATUSES) {
      const listed = await service.findAll({ status }, TEST_ORGANIZATION_ID);
      expect({ status, total: listed.total, ids: listed.items.map((item) => item.id).sort() })
        .toEqual({ status, total: derivedIds(status).length, ids: derivedIds(status) });
    }
    expect(THUMBNAIL_TRACKING_STATUSES.map((status) => derivedIds(status).length)).toEqual([3, 1, 4]);
  });

  it('keeps the first inconclusive mark until the operator clears it, inside the organization fence', async () => {
    const { id } = await seedTracking(TEST_ORGANIZATION_ID, {
      markedInconclusiveAt: null,
      ctrBefore: 1.2,
      ctrAfter: null,
    });
    const storedMark = async () =>
      (await prisma.thumbnailTracking.findUniqueOrThrow({ where: { id } })).markedInconclusiveAt;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(FIRST_MARK_TIME);

    await expect(service.updateMetrics(id, { inconclusive: true }, OTHER_ORGANIZATION_ID))
      .rejects.toBeInstanceOf(NotFoundException);
    await expect(service.updateMetrics(id, { ctrAfter: 2.4 }, TEST_ORGANIZATION_ID))
      .resolves.toMatchObject({ status: 'measured', ctrBefore: 1.2, ctrAfter: 2.4 });
    await expect(service.updateMetrics(id, { inconclusive: true }, TEST_ORGANIZATION_ID))
      .resolves.toMatchObject({ status: 'inconclusive', ctrAfter: 2.4 });
    expect(await storedMark()).toEqual(FIRST_MARK_TIME);

    vi.setSystemTime(LATER_TIME);
    await expect(service.updateMetrics(id, { inconclusive: true, reviewsAfter: 30 }, TEST_ORGANIZATION_ID))
      .resolves.toMatchObject({ status: 'inconclusive', reviewsAfter: 30 });
    await expect(service.updateMetrics(id, { salesAfter: 7 }, TEST_ORGANIZATION_ID))
      .resolves.toMatchObject({ status: 'inconclusive', salesAfter: 7 });
    await expect(service.updateMetrics(id, { inconclusive: false }, OTHER_ORGANIZATION_ID))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(await storedMark()).toEqual(FIRST_MARK_TIME);

    await expect(service.updateMetrics(id, { inconclusive: false }, TEST_ORGANIZATION_ID))
      .resolves.toMatchObject({ status: 'measured', reviewsAfter: 30, salesAfter: 7 });
    expect(await storedMark()).toBeNull();
  });

  async function trackingTarget(organizationId: string) {
    const existing = targets.get(organizationId);
    if (existing) return existing;
    const account = await prisma.channelAccount.create({
      data: { organizationId, channel: 'coupang', name: 'Thumbnail tracking Wing' },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId,
        channelAccountId: account.id,
        externalId: 'thumbnail-tracking-listing',
        channelName: '썸네일 추적 상품',
      },
    });
    const workspace = await prisma.contentWorkspace.create({
      data: {
        organizationId,
        ownerType: 'direct_detail_page',
        displayName: 'Thumbnail tracking workspace',
        normalizedTitle: 'thumbnailtrackingworkspace',
      },
    });
    const target = { listingId: listing.id, workspaceId: workspace.id };
    targets.set(organizationId, target);
    return target;
  }

  async function seedTracking(organizationId: string, facts: ThumbnailTrackingStatusFacts) {
    const target = await trackingTarget(organizationId);
    const generation = await prisma.thumbnailGeneration.create({
      data: { organizationId, contentWorkspaceId: target.workspaceId, status: 'succeeded' },
    });
    return prisma.thumbnailTracking.create({
      data: {
        organizationId,
        listingId: target.listingId,
        generationId: generation.id,
        originalGrade: 'B',
        originalScore: 70,
        ...facts,
      },
    });
  }
});
