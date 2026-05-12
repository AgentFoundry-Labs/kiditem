// Outgoing port for `ChannelListingDailySnapshot` upserts. Split from the
// channel-daily-fact aggregate so each grain has its own contract; the
// adapter still preserves overwrite-on-replay metric semantics inside a
// single $transaction.

import type { MetaJsonInput } from './daily-fact-meta';

export const CHANNEL_LISTING_DAILY_REPOSITORY_PORT = Symbol(
  'ChannelListingDailyRepositoryPort',
);

export interface ListingDailyState {
  productName?: string | null;
  status?: string | null;
  exposureStatus?: string | null;
  saleStatus?: string | null;
  channelPrice?: number | null;
  reviewCount?: number | null;
  avgRating?: number | null;
  isOfferWinner?: boolean | null;
  myPrice?: number | null;
  winnerPrice?: number | null;
  winnerGapPrice?: number | null;
  productRank?: number | null;
  categoryRank?: number | null;
}

export interface ListingDailyAdMetrics {
  adSpend?: number | null;
  adRevenue?: number | null;
  adImpressions?: number | null;
  adClicks?: number | null;
  adConversions?: number | null;
  adOrders?: number | null;
  adDirectOrders1d?: number | null;
  adIndirectOrders1d?: number | null;
  adDirectQty1d?: number | null;
  adIndirectQty1d?: number | null;
  adDirectRevenue1d?: number | null;
  adIndirectRevenue1d?: number | null;
  adTotalOrders14d?: number | null;
  adDirectOrders14d?: number | null;
  adIndirectOrders14d?: number | null;
  adTotalQty14d?: number | null;
  adDirectQty14d?: number | null;
  adIndirectQty14d?: number | null;
  adTotalRevenue14d?: number | null;
  adDirectRevenue14d?: number | null;
  adIndirectRevenue14d?: number | null;
}

export interface ListingDailyTrafficMetrics {
  trafficVisitors?: number | null;
  trafficViews?: number | null;
  trafficCartAdds?: number | null;
  trafficOrders?: number | null;
  trafficSalesQty?: number | null;
  trafficRevenue?: number | null;
}

export interface ListingDailyMetrics {
  ad?: ListingDailyAdMetrics;
  traffic?: ListingDailyTrafficMetrics;
}

export interface ListingDailyUpsertInput extends ListingDailyState {
  organizationId: string;
  listingId: string;
  channel: string;
  externalId: string;
  businessDate: Date;
  observedAt?: Date;
  rawSnapshotId?: string | null;
  metaJson?: MetaJsonInput;
  metrics?: ListingDailyMetrics;
}

export interface ChannelListingDailyRepositoryPort {
  upsert(input: ListingDailyUpsertInput): Promise<{ id: string }>;
}
