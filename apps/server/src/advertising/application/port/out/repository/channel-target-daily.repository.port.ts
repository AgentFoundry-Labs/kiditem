// Row shape the old campaign sweep and keyword source attempts stage into
// `ChannelAdTargetDailySnapshot` (their own repositories write it). The
// repository port and adapter are gone (KID-372); the writers and this shape
// go with the table in KID-373.

import type { MetaJsonInput } from './daily-fact-meta';

export type AdTargetType = 'campaign' | 'keyword' | 'product';

export interface AdTargetDailyMetrics {
  spend?: number | null;
  revenue?: number | null;
  impressions?: number | null;
  clicks?: number | null;
  conversions?: number | null;
  orders?: number | null;
  adSpend?: number | null;
  adRevenue?: number | null;
}

export interface UpsertAdTargetDailyInput extends AdTargetDailyMetrics {
  organizationId: string;
  channelAccountId: string;
  channel: string;
  businessDate: Date;
  targetType: AdTargetType;
  targetKey: string;

  listingId?: string | null;
  listingOptionId?: string | null;
  externalId?: string | null;
  externalOptionId?: string | null;

  campaignId?: string | null;
  campaignIdentity?: string | null;
  campaignName?: string | null;
  /** True only when the source row contains no campaign evidence at all. */
  campaignless?: boolean;
  adGroup?: string | null;
  keyword?: string | null;
  placement?: string | null;
  status?: string | null;
  onOff?: string | null;
  dailyBudget?: number | null;

  observedAt?: Date;
  rawSnapshotId?: string | null;
  metaJson?: MetaJsonInput;
}
