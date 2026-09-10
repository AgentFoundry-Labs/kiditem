/**
 * The narrow Orders-owned read capability for listing review statistics.
 *
 * Implementations must use Orders' current-review selector so consumers never
 * reconstruct source-generation or terminal-status rules themselves.
 */
export const ORDERS_REVIEW_LISTING_STATS_READ_PORT = Symbol(
  'OrdersReviewListingStatsReadPort',
);

export interface ReviewListingStatsReadRequest {
  organizationId: string;
  listingIds: string[];
  recentSince: Date;
}

export interface ReviewListingStatsRow {
  listingId: string;
  totalReviews: number;
  avgRating: number;
}

export interface ReviewListingRecentCountRow {
  listingId: string;
  count: number;
}

export interface ReviewListingStatsReadResult {
  lifetime: ReviewListingStatsRow[];
  recent: ReviewListingRecentCountRow[];
}

export interface OrdersReviewListingStatsReadPort {
  loadListingReviewStats(
    request: ReviewListingStatsReadRequest,
  ): Promise<ReviewListingStatsReadResult>;
}
