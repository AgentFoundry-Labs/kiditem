import { describe, expect, it, vi } from 'vitest';
import { ReviewsService, computeSummary } from '../reviews.service';

const COMPANY_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const OTHER_COMPANY_ID = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';
const LISTING_HEALTHY = '11111111-1111-4111-8111-111111111111';
const LISTING_NEEDS_RATING = '22222222-2222-4222-8222-222222222222';
const LISTING_NEEDS_VOLUME = '33333333-3333-4333-8333-333333333333';
const MASTER_HEALTHY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MASTER_NEEDS_RATING = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

interface PrismaMock {
  review: {
    groupBy: ReturnType<typeof vi.fn>;
  };
  channelListing: {
    findMany: ReturnType<typeof vi.fn>;
  };
}

function makePrismaMock(): PrismaMock {
  return {
    review: { groupBy: vi.fn() },
    channelListing: { findMany: vi.fn() },
  };
}

describe('ReviewsService.list', () => {
  it('returns stable empty envelope when DB has no reviews', async () => {
    const prisma = makePrismaMock();
    prisma.review.groupBy.mockResolvedValue([]);
    prisma.channelListing.findMany.mockResolvedValue([]);
    const svc = new ReviewsService(prisma as never);

    const res = await svc.list(COMPANY_ID, {});

    expect(res).toEqual({
      items: [],
      total: 0,
      page: 1,
      limit: 50,
      summary: {
        totalReviewCount: 0,
        weightedAvgRating: 0,
        needsAttentionCount: 0,
      },
    });
  });

  it('aggregates per listing with master display + 30-day recent count', async () => {
    const prisma = makePrismaMock();
    // 1st groupBy call = full aggregates; 2nd call = recent (30d) aggregates.
    prisma.review.groupBy
      .mockResolvedValueOnce([
        {
          listingId: LISTING_HEALTHY,
          _count: { _all: 12 },
          _avg: { rating: 4.5 },
          _max: { reviewedAt: new Date('2026-04-20T00:00:00.000Z') },
        },
        {
          listingId: LISTING_NEEDS_RATING,
          _count: { _all: 8 },
          _avg: { rating: 2.4 },
          _max: { reviewedAt: new Date('2026-04-22T00:00:00.000Z') },
        },
      ])
      .mockResolvedValueOnce([
        { listingId: LISTING_HEALTHY, _count: { _all: 3 } },
      ]);

    prisma.channelListing.findMany.mockResolvedValue([
      {
        id: LISTING_HEALTHY,
        channelName: 'Healthy Listing',
        master: { id: MASTER_HEALTHY, name: 'Healthy Toy', abcGrade: 'A' },
        options: [{ sku: 'M-00000001-01' }],
        company: { name: 'KidItem Co' },
      },
      {
        id: LISTING_NEEDS_RATING,
        channelName: 'Needs Rating',
        master: { id: MASTER_NEEDS_RATING, name: 'Low Rated Toy', abcGrade: 'C' },
        options: [{ sku: 'M-00000002-01' }],
        company: { name: 'KidItem Co' },
      },
    ]);

    const svc = new ReviewsService(prisma as never);
    const res = await svc.list(COMPANY_ID, {});

    expect(res.total).toBe(2);
    expect(res.items).toHaveLength(2);
    expect(res.items.map((i) => i.productId)).toEqual([
      MASTER_HEALTHY,
      MASTER_NEEDS_RATING,
    ]);
    const healthy = res.items[0];
    expect(healthy.productName).toBe('Healthy Toy');
    expect(healthy.totalReviews).toBe(12);
    expect(healthy.avgRating).toBe(4.5);
    expect(healthy.recentReviews).toBe(3);
    expect(healthy.lastReviewAt).toBe('2026-04-20T00:00:00.000Z');
    // R3 documents orderCount as not-yet-available — it must be 0.
    expect(healthy.orderCount).toBe(0);
    expect(res.items[1].recentReviews).toBe(0);
  });

  it('forwards companyId to every Prisma call (tenant isolation)', async () => {
    const prisma = makePrismaMock();
    prisma.review.groupBy.mockResolvedValue([]);
    prisma.channelListing.findMany.mockResolvedValue([]);
    const svc = new ReviewsService(prisma as never);

    await svc.list(COMPANY_ID, {});

    for (const call of prisma.review.groupBy.mock.calls) {
      expect(call[0].where.companyId).toBe(COMPANY_ID);
      expect(call[0].where.companyId).not.toBe(OTHER_COMPANY_ID);
    }
  });

  it('paginates over aggregates sorted by totalReviews DESC', async () => {
    const prisma = makePrismaMock();
    const aggregates = Array.from({ length: 5 }, (_, i) => ({
      listingId: `0000000${i}-1111-4111-8111-111111111111`,
      _count: { _all: i + 1 },
      _avg: { rating: 5 },
      _max: { reviewedAt: new Date() },
    }));
    prisma.review.groupBy.mockResolvedValueOnce(aggregates).mockResolvedValueOnce([]);
    prisma.channelListing.findMany.mockResolvedValue([]);

    const svc = new ReviewsService(prisma as never);
    const page1 = await svc.list(COMPANY_ID, { page: 1, limit: 2 });
    expect(page1.total).toBe(5);
    expect(page1.items).toHaveLength(2);
    // Highest totalReviews first.
    expect(page1.items[0].totalReviews).toBe(5);
    expect(page1.items[1].totalReviews).toBe(4);

    prisma.review.groupBy.mockResolvedValueOnce(aggregates).mockResolvedValueOnce([]);
    const page2 = await svc.list(COMPANY_ID, { page: 2, limit: 2 });
    expect(page2.items).toHaveLength(2);
    expect(page2.items[0].totalReviews).toBe(3);
    expect(page2.items[1].totalReviews).toBe(2);
  });

  it('asks Prisma for reviews from the last 30 days only', async () => {
    const prisma = makePrismaMock();
    prisma.review.groupBy.mockResolvedValue([]);
    prisma.channelListing.findMany.mockResolvedValue([]);
    const svc = new ReviewsService(prisma as never);

    const before = Date.now();
    await svc.list(COMPANY_ID, {});
    const after = Date.now();

    const recentCall = prisma.review.groupBy.mock.calls[1];
    expect(recentCall, 'expected a second groupBy call for the 30-day window').toBeDefined();
    const since: Date = recentCall![0].where.reviewedAt.gte;
    expect(since).toBeInstanceOf(Date);
    const sinceMs = since.getTime();
    const ms30Days = 30 * 24 * 60 * 60 * 1000;
    expect(sinceMs).toBeGreaterThanOrEqual(before - ms30Days - 100);
    expect(sinceMs).toBeLessThanOrEqual(after - ms30Days + 100);
  });
});

describe('computeSummary', () => {
  it('marks listings with avgRating < 3.5 OR totalReviews < 5 as needing attention', () => {
    const summary = computeSummary([
      { listingId: 'h', totalReviews: 12, avgRating: 4.5, lastReviewAt: null },
      { listingId: 'r', totalReviews: 8, avgRating: 2.4, lastReviewAt: null },
      { listingId: 'v', totalReviews: 4, avgRating: 4.8, lastReviewAt: null },
    ]);
    expect(summary.needsAttentionCount).toBe(2);
    expect(summary.totalReviewCount).toBe(24);
    // weighted avg = (12*4.5 + 8*2.4 + 4*4.8) / 24 = (54 + 19.2 + 19.2) / 24 = 3.85
    expect(summary.weightedAvgRating).toBe(3.85);
  });

  it('returns zero weighted average when there are no reviews', () => {
    expect(computeSummary([])).toEqual({
      totalReviewCount: 0,
      weightedAvgRating: 0,
      needsAttentionCount: 0,
    });
  });
});
