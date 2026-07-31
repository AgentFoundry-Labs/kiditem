import { describe, expect, it, vi } from 'vitest';
import { ReviewIngestService } from '../review-ingest.service';
import type { ReviewIngestItem } from '@kiditem/shared/reviews';

const ORGANIZATION_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const LISTING_ID = '11111111-1111-4111-8111-111111111111';

interface PrismaMock {
  review: {
    upsert: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
  channelListingOption: { findMany: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
}

function makePrismaMock(): PrismaMock {
  return {
    review: {
      upsert: vi.fn((args: unknown) => args),
      findMany: vi.fn().mockResolvedValue([]),
    },
    channelListingOption: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn().mockResolvedValue([]),
  };
}

function makeItem(overrides: Partial<ReviewIngestItem> = {}): ReviewIngestItem {
  return {
    externalReviewId: '962186164',
    externalOptionId: '5347669049',
    externalProductId: '303499224',
    itemName: '파도 (S형) LED 발목 줄넘기',
    rating: 5,
    title: null,
    content: null,
    reviewerName: '홍길동',
    reviewedAt: 1785415297000,
    imageCount: 0,
    videoCount: 0,
    isDeleted: false,
    isBlinded: false,
    ...overrides,
  };
}

describe('ReviewIngestService.ingest', () => {
  it('links a review to the listing that owns the crawled vendorItemId', async () => {
    const prisma = makePrismaMock();
    prisma.channelListingOption.findMany.mockResolvedValue([
      { externalOptionId: '5347669049', listingId: LISTING_ID },
    ]);
    const svc = new ReviewIngestService(prisma as never);

    const res = await svc.ingest(ORGANIZATION_ID, {
      platform: 'coupang',
      items: [makeItem()],
    });

    expect(res).toEqual({
      received: 1,
      created: 1,
      updated: 0,
      linked: 1,
      unlinked: 0,
    });
    const upsertArgs = prisma.review.upsert.mock.calls[0][0];
    expect(upsertArgs.create.listingId).toBe(LISTING_ID);
    expect(upsertArgs.where.organizationId_platform_externalReviewId).toEqual({
      organizationId: ORGANIZATION_ID,
      platform: 'coupang',
      externalReviewId: '962186164',
    });
  });

  it('keeps an unmatched review with a null listing instead of dropping it', async () => {
    const prisma = makePrismaMock();
    const svc = new ReviewIngestService(prisma as never);

    const res = await svc.ingest(ORGANIZATION_ID, {
      platform: 'coupang',
      items: [makeItem({ externalOptionId: '99999999999' })],
    });

    expect(res.received).toBe(1);
    expect(res.linked).toBe(0);
    expect(res.unlinked).toBe(1);
    expect(prisma.review.upsert.mock.calls[0][0].create.listingId).toBeNull();
  });

  it('reports re-collected reviews as updated, not created', async () => {
    const prisma = makePrismaMock();
    prisma.review.findMany.mockResolvedValue([
      { externalReviewId: '962186164' },
    ]);
    const svc = new ReviewIngestService(prisma as never);

    const res = await svc.ingest(ORGANIZATION_ID, {
      platform: 'coupang',
      items: [makeItem(), makeItem({ externalReviewId: '958593983' })],
    });

    expect(res).toMatchObject({ received: 2, created: 1, updated: 1 });
  });

  it('collapses duplicates inside one batch so the transaction cannot self-conflict', async () => {
    const prisma = makePrismaMock();
    const svc = new ReviewIngestService(prisma as never);

    const res = await svc.ingest(ORGANIZATION_ID, {
      platform: 'coupang',
      items: [makeItem({ rating: 3 }), makeItem({ rating: 5 })],
    });

    expect(res.received).toBe(1);
    expect(prisma.review.upsert).toHaveBeenCalledTimes(1);
    // 마지막 값이 남는다.
    expect(prisma.review.upsert.mock.calls[0][0].update.rating).toBe(5);
  });

  it('scopes the option lookup to the caller organization', async () => {
    const prisma = makePrismaMock();
    const svc = new ReviewIngestService(prisma as never);

    await svc.ingest(ORGANIZATION_ID, {
      platform: 'coupang',
      items: [makeItem()],
    });

    expect(prisma.channelListingOption.findMany.mock.calls[0][0].where).toEqual({
      organizationId: ORGANIZATION_ID,
      externalOptionId: { in: ['5347669049'] },
    });
  });
});
