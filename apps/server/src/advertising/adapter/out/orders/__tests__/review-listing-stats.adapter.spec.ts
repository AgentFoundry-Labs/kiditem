import { describe, expect, it, vi } from 'vitest';
import { OrdersReviewListingStatsAdapter } from '../review-listing-stats.adapter';

describe('OrdersReviewListingStatsAdapter', () => {
  it('delegates the narrow review read to Orders without reshaping policy', async () => {
    const loadListingReviewStats = vi.fn().mockResolvedValue({
      lifetime: [{ listingId: 'listing-1', totalReviews: 3, avgRating: 4 }],
      recent: [{ listingId: 'listing-1', count: 1 }],
    });
    const adapter = new OrdersReviewListingStatsAdapter({
      loadListingReviewStats,
    });
    const request = {
      organizationId: 'org-1',
      listingIds: ['listing-1'],
      recentSince: new Date('2026-05-01T00:00:00.000Z'),
    };

    await expect(adapter.loadListingReviewStats(request)).resolves.toEqual({
      lifetime: [{ listingId: 'listing-1', totalReviews: 3, avgRating: 4 }],
      recent: [{ listingId: 'listing-1', count: 1 }],
    });
    expect(loadListingReviewStats).toHaveBeenCalledWith(request);
  });
});
