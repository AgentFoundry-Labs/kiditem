// Outgoing port for the listing daily-fact ad aggregate. Returns additive
// sums from `ChannelListingDailySnapshot` over a half-open `[from, to)`
// window. Caller-side ratios (ROAS/CTR/CVR) recompute via the shared
// percent helpers; provider ratios are not stored on additive columns.

export const AD_AGGREGATION_REPOSITORY_PORT = Symbol(
  'AdAggregationRepositoryPort',
);

export interface RangeAdMetrics {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
}

export interface AdAggregationRepositoryPort {
  aggregateForRange(
    organizationId: string,
    from: Date,
    to: Date,
  ): Promise<RangeAdMetrics>;
}
