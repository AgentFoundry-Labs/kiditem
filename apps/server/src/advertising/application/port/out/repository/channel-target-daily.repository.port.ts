// Outgoing port for `ChannelAdTargetDailySnapshot` upserts. Split from
// the channel-daily-fact aggregate so campaign/keyword/product-target grain
// facts have their own contract; adapter still preserves overwrite-on-replay
// metric semantics inside a single $transaction.

import type { MetaJsonInput } from './daily-fact-meta';

export const CHANNEL_TARGET_DAILY_REPOSITORY_PORT = Symbol(
  'ChannelTargetDailyRepositoryPort',
);

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
  channel: string;
  businessDate: Date;
  targetType: AdTargetType;
  targetKey: string;

  listingId?: string | null;
  listingOptionId?: string | null;
  externalId?: string | null;
  externalOptionId?: string | null;

  campaignId?: string | null;
  campaignName?: string | null;
  adGroup?: string | null;
  keyword?: string | null;
  placement?: string | null;
  status?: string | null;
  onOff?: string | null;
  currentBid?: number | null;
  dailyBudget?: number | null;

  observedAt?: Date;
  rawSnapshotId?: string | null;
  metaJson?: MetaJsonInput;
}

/**
 * One complete, single-day campaign report. The repository treats `targets`
 * as the authoritative set for this campaign/date and removes prior targets
 * that are absent from the replacement set in the same transaction.
 */
export interface ReplaceAdCampaignDayInput {
  organizationId: string;
  channel: string;
  businessDate: Date;
  campaignId?: string | null;
  /** Stable provider identity (for example canonical `href:...`) when the
   * provider does not expose a campaign id. It scopes replacement without
   * overloading the persisted `campaignId` column. */
  campaignIdentity?: string | null;
  campaignName: string;
  targets: UpsertAdTargetDailyInput[];
}

export interface ChannelTargetDailyRepositoryPort {
  upsert(input: UpsertAdTargetDailyInput): Promise<{ id: string }>;
  replaceCampaignDay(
    input: ReplaceAdCampaignDayInput,
  ): Promise<{ upsertedCount: number; deletedCount: number }>;
}
