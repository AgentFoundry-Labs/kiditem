// Outgoing port for hydrating the strategy-context aggregate used by
// AdStrategyService. The adapter loads everything strategy sub-services
// need from `ChannelListingDailySnapshot` and friends; ratios stay
// recomputed downstream.
//
// Important: this port does NOT fetch `AdsConfig`. The application service
// (AdStrategyService) calls `AdConfigService.getConfig` first and passes
// the result into `loadStrategyContext` so the adapter has zero
// application-layer back-references.

import type {
  AdAggregateRow,
  AdsConfig,
  HydratedListing,
} from '../../../../domain/model/strategy-types';
import type { ChannelStateSignal } from '@kiditem/shared/advertising';

export const AD_STRATEGY_CONTEXT_REPOSITORY_PORT = Symbol(
  'AdStrategyContextRepositoryPort',
);

export interface StrategyContext {
  adGroups: AdAggregateRow[];
  adIssuesAdGroups: AdAggregateRow[];
  listings: HydratedListing[];
  profitRateByListing: Map<string, number>;
  channelStateByListing: Map<string, ChannelStateSignal>;
  gradeMap: Map<string, 'A' | 'B' | 'C' | null>;
  trafficByListing: Map<string, { revenue: number; orders: number }>;
  config: AdsConfig;
}

export interface AllTimeAdAggregateRow {
  listingId: string | null;
  spend: number;
  revenue: number;
  clicks: number;
  impressions: number;
  conversions: number;
}

export interface ListingReviewStatRow {
  listingId: string;
  totalReviews: number;
  avgRating: number;
}

export interface ListingTrafficDailyRow {
  listingId: string;
  businessDate: Date;
  trafficRevenue: number;
  trafficOrders: number;
}

export interface ExposureAnalysisContext {
  /** All-time per-listing ad aggregates over `ChannelListingDailySnapshot`. */
  adAggAll: AllTimeAdAggregateRow[];
  /** Lifetime review stats per listing (count + avg rating). */
  reviewStats: ListingReviewStatRow[];
  /** Recent review counts per listing (since the supplied cutoff). */
  recentReviewCounts: Array<{ listingId: string; count: number }>;
  /** Per-listing-day traffic rows for the inclusive 14-day exposure window. */
  trafficDailyRows: ListingTrafficDailyRow[];
}

export interface AdStrategyContextRepositoryPort {
  /**
   * Hydrate every strategy sub-service input. Caller passes the resolved
   * `AdsConfig` so the adapter has no application-service dependency.
   */
  loadStrategyContext(
    organizationId: string,
    year: number,
    month: number,
    config: AdsConfig,
  ): Promise<StrategyContext>;

  loadChannelStateByListing(
    organizationId: string,
    listings: HydratedListing[],
  ): Promise<Map<string, ChannelStateSignal>>;

  hydrateListings(
    organizationId: string,
    listingIds: string[],
  ): Promise<HydratedListing[]>;

  /**
   * Bundle of reads exclusively used by `AdStrategyService.getExposureAnalysis`:
   * all-time ad aggregates per listing, lifetime + recent review stats, and
   * traffic daily rows over the supplied 14-day inclusive window.
   * `recentReviewSince` and `trafficSince` are usually the same KST 14-day
   * cutoff; the service slices traffic at its own midpoint downstream.
   */
  loadExposureAnalysisContext(
    organizationId: string,
    listingIds: string[],
    options: {
      recentReviewSince: Date;
      trafficSince: Date;
    },
  ): Promise<ExposureAnalysisContext>;

  loadAllTimeAdAggregates(
    organizationId: string,
  ): Promise<AllTimeAdAggregateRow[]>;
}
