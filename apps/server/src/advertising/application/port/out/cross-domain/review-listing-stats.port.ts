/**
 * Advertising's narrow consumer-side seam for review metrics.
 *
 * The Orders bridge supplies these rows from its COMPLETE/latest selector;
 * Advertising must not query Review directly or reproduce that policy.
 */
export const ADVERTISING_REVIEW_LISTING_STATS_PORT = Symbol(
  'AdvertisingReviewListingStatsPort',
);

export interface AdvertisingReviewListingStatsRequest {
  organizationId: string;
  listingIds: string[];
  recentSince: Date;
}

export interface AdvertisingReviewListingStatsResult {
  lifetime: Array<{
    listingId: string;
    totalReviews: number;
    avgRating: number;
  }>;
  recent: Array<{
    listingId: string;
    count: number;
  }>;
}

export interface AdvertisingReviewListingStatsPort {
  loadListingReviewStats(
    request: AdvertisingReviewListingStatsRequest,
  ): Promise<AdvertisingReviewListingStatsResult>;
}
