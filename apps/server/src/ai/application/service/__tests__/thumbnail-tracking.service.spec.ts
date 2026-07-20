import { NotFoundException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThumbnailTrackingService } from '../thumbnail-tracking.service';
import type { CoupangProductSalesScrapePort } from '../../port/out/provider/coupang-product-sales-scrape.port';
import type {
  ThumbnailTrackingRepositoryPort,
  ThumbnailTrackingRow,
} from '../../port/out/repository/thumbnail-tracking.repository.port';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const TRACKING_ID = '22222222-2222-4222-8222-222222222222';
const MASTER_ID = '33333333-3333-4333-8333-333333333333';
const LISTING_ID = '44444444-4444-4444-8444-444444444444';
const GENERATION_ID = '55555555-5555-4555-8555-555555555555';

function makeTrackingRow(overrides: Partial<ThumbnailTrackingRow> = {}) {
  return {
    id: TRACKING_ID,
    organizationId: ORGANIZATION_ID,
    listingId: LISTING_ID,
    generationId: GENERATION_ID,
    originalGrade: 'A',
    originalScore: 92,
    appliedAt: new Date('2026-05-01T00:00:00.000Z'),
    status: 'tracking',
    ctrBefore: 1.2,
    ctrAfter: null,
    reviewsBefore: 10,
    reviewsAfter: null,
    salesBefore: null,
    salesAfter: null,
    listing: {
      id: LISTING_ID,
      displayName: '테스트 상품',
      channelName: '쿠팡 상품명',
      externalId: 'vendor-item-1',
    },
    ...overrides,
  };
}

function makeRepository(): ThumbnailTrackingRepositoryPort {
  return {
    findTrackings: vi.fn().mockResolvedValue([]),
    countTrackings: vi.fn().mockResolvedValue(0),
    findChannelListingForWorkspace: vi.fn().mockResolvedValue({ id: LISTING_ID }),
    createTracking: vi.fn().mockResolvedValue({ created: true, row: makeTrackingRow() }),
    updateMetrics: vi.fn().mockResolvedValue(makeTrackingRow({ status: 'measured', ctrAfter: 2.4 })),
    findTrackingForSnapshot: vi.fn().mockResolvedValue({
      id: TRACKING_ID,
      salesBefore: null,
      listing: {
        channelName: '쿠팡 상품명',
        displayName: '테스트 상품',
        externalId: 'vendor-item-1',
      },
    }),
    upsertDailySnapshot: vi.fn().mockResolvedValue({
      id: 'snapshot-1',
      trackingId: TRACKING_ID,
      capturedAt: new Date('2026-05-19T03:00:00.000Z'),
      capturedDate: new Date('2026-05-19T00:00:00.000Z'),
      unitsSold30d: 42,
      unitsSold7d: 11,
      revenueKrw: 123000,
      reviewCount: 18,
      ratingAvg: 4.7,
      scrapeStatus: 'ok',
      errorMessage: null,
    }),
    listSnapshots: vi.fn().mockResolvedValue([]),
    findActiveTrackings: vi.fn().mockResolvedValue([]),
  };
}

function makeSalesScraper(): CoupangProductSalesScrapePort {
  return {
    scrapeByProductName: vi.fn().mockResolvedValue({
      found: true,
      row: {
        inventoryId: 'inventory-1',
        matchedName: '쿠팡 상품명',
        unitsSold30d: 42,
        unitsSold7d: 11,
        revenueKrw: 123000,
        reviewCount: 18,
        ratingAvg: 4.7,
        rawCellTexts: ['쿠팡 상품명', '42'],
      },
    }),
  };
}

function makeService(
  repository: ThumbnailTrackingRepositoryPort = makeRepository(),
  salesScraper: CoupangProductSalesScrapePort = makeSalesScraper(),
) {
  return {
    repository,
    salesScraper,
    service: new ThumbnailTrackingService(repository, salesScraper),
  };
}

describe('ThumbnailTrackingService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-19T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates tracking through the repository after resolving the listing', async () => {
    const { service, repository } = makeService();

    await expect(
      service.create({
        organizationId: ORGANIZATION_ID,
        contentWorkspaceId: MASTER_ID,
        generationId: GENERATION_ID,
        originalGrade: 'A',
        originalScore: 92,
      }),
    ).resolves.toMatchObject({
      id: TRACKING_ID,
      channelListingId: LISTING_ID,
      productName: '테스트 상품',
      generationId: GENERATION_ID,
    });

    expect(repository.findChannelListingForWorkspace).toHaveBeenCalledWith(MASTER_ID, ORGANIZATION_ID);
    expect(repository.createTracking).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      listingId: LISTING_ID,
      generationId: GENERATION_ID,
      originalGrade: 'A',
      originalScore: 92,
    });
  });

  it('returns null without creating tracking when the workspace has no listing', async () => {
    const repository = makeRepository();
    vi.mocked(repository.findChannelListingForWorkspace).mockResolvedValueOnce(null);
    const { service } = makeService(repository);

    await expect(
      service.create({
        organizationId: ORGANIZATION_ID,
        contentWorkspaceId: MASTER_ID,
        generationId: GENERATION_ID,
        originalGrade: 'B',
        originalScore: 81,
      }),
    ).resolves.toBeNull();

    expect(repository.createTracking).not.toHaveBeenCalled();
  });

  it('throws not found when metrics update cannot find an organization-scoped row', async () => {
    const repository = makeRepository();
    vi.mocked(repository.updateMetrics).mockResolvedValueOnce(null);
    const { service } = makeService(repository);

    await expect(service.updateMetrics(TRACKING_ID, { ctrAfter: 2.3 }, ORGANIZATION_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('collects a daily snapshot through scraper and repository ports', async () => {
    const { service, repository, salesScraper } = makeService();

    await expect(service.collectDailySnapshot(TRACKING_ID, ORGANIZATION_ID)).resolves.toEqual({
      id: 'snapshot-1',
      trackingId: TRACKING_ID,
      capturedAt: '2026-05-19T03:00:00.000Z',
      capturedDate: '2026-05-19',
      unitsSold30d: 42,
      unitsSold7d: 11,
      revenueKrw: 123000,
      reviewCount: 18,
      ratingAvg: 4.7,
      scrapeStatus: 'ok',
      errorMessage: null,
    });

    expect(salesScraper.scrapeByProductName).toHaveBeenCalledWith('쿠팡 상품명');
    expect(repository.upsertDailySnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        trackingId: TRACKING_ID,
        capturedDate: new Date('2026-05-19T00:00:00.000Z'),
        unitsSold30d: 42,
        rawCellTexts: ['쿠팡 상품명', '42'],
        setSalesBefore: true,
      }),
    );
  });
});
