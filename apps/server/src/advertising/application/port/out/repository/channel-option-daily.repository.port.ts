// Outgoing port for `ChannelListingOptionDailySnapshot` upserts. Split
// from the channel-daily-fact aggregate so option-day winner state has
// its own contract.

import type { MetaJsonInput } from './daily-fact-meta';

export const CHANNEL_OPTION_DAILY_REPOSITORY_PORT = Symbol(
  'ChannelOptionDailyRepositoryPort',
);

export interface ListingOptionDailyState {
  optionName?: string | null;
  salePrice?: number | null;
  stockQty?: number | null;
  saleStatus?: string | null;
  isActive?: boolean | null;
  isOfferWinner?: boolean | null;
  myPrice?: number | null;
  winnerPrice?: number | null;
  winnerGapPrice?: number | null;
}

export interface ListingOptionDailyUpsertInput extends ListingOptionDailyState {
  organizationId: string;
  listingId: string;
  listingOptionId: string;
  channel: string;
  externalId: string;
  externalOptionId: string;
  businessDate: Date;
  observedAt?: Date;
  rawSnapshotId?: string | null;
  metaJson?: MetaJsonInput;
}

export interface ChannelOptionDailyRepositoryPort {
  upsert(input: ListingOptionDailyUpsertInput): Promise<{ id: string }>;
}
