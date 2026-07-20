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

export interface ReplaceAdCampaignDayInput {
  organizationId: string;
  channelAccountId: string;
  channel: string;
  businessDate: Date;
  campaignId?: string | null;
  campaignIdentity?: string | null;
  campaignName: string;
  targets: UpsertAdTargetDailyInput[];
}

export type ReplaceAdCampaignDayResult =
  | {
      kind: 'replaced';
      upsertedCount: number;
      deletedCount: number;
      mergedCount: number;
    }
  | {
      kind: 'rejected';
      code: 'legacy_account_ambiguous' | 'dependent_action_conflict';
    };

export interface ChannelTargetDailyRepositoryPort {
  upsert(input: UpsertAdTargetDailyInput): Promise<{ id: string }>;
  replaceCampaignDay(
    input: ReplaceAdCampaignDayInput,
  ): Promise<ReplaceAdCampaignDayResult>;
}
