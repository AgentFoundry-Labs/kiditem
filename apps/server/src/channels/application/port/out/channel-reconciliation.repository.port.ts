import type {
  ReconciliationItem,
  ReconciliationItemListResponse,
  ReconciliationItemStatus,
  ReconciliationMatchReason,
  ReconciliationResolutionSource,
  ReconciliationScanResponse,
  ReconciliationSummary,
} from '@kiditem/shared/channel-reconciliation';

export const CHANNEL_RECONCILIATION_QUERY_REPOSITORY_PORT = Symbol(
  'CHANNEL_RECONCILIATION_QUERY_REPOSITORY_PORT',
);
export const CHANNEL_RECONCILIATION_RESOLUTION_REPOSITORY_PORT = Symbol(
  'CHANNEL_RECONCILIATION_RESOLUTION_REPOSITORY_PORT',
);
export const CHANNEL_RECONCILIATION_SCAN_REPOSITORY_PORT = Symbol(
  'CHANNEL_RECONCILIATION_SCAN_REPOSITORY_PORT',
);
export const CHANNEL_RECONCILIATION_MATCHER_PORT = Symbol(
  'CHANNEL_RECONCILIATION_MATCHER_PORT',
);

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

export interface ReconciliationRowInput {
  externalId: string;
  externalOptionId?: string | null;
  legacyCode?: string | null;
  channelProductName?: string | null;
  channelOptionName?: string | null;
  channelImageUrl?: string | null;
  channelUrl?: string | null;
  channelStatus?: string | null;
}

export interface MatchOutcome {
  status: ReconciliationItemStatus;
  matchReason: ReconciliationMatchReason;
  resolutionSource: ReconciliationResolutionSource | null;
  confidence: number | null;
  linkedListingId: string | null;
  linkedListingOptionId: string | null;
  linkedMasterProductId: string | null;
  linkedProductOptionId: string | null;
  conflictJson: JsonValue | null;
}

export interface ProductOptionCandidate {
  id: string;
  masterId: string;
}

export interface ChannelListingHandle {
  id: string;
  masterId: string;
  channelAccountId?: string | null;
}

export interface ChannelListingOptionHandle {
  id: string;
  optionId: string | null;
}

export interface OptionLinkBackfillResult {
  optionLinkedCount: number;
  optionLinkAmbiguousCount: number;
  optionLinkNoCandidateCount: number;
}

export interface ReconciliationRepositoryItemRow {
  id: string;
  source: string;
  itemType: string;
  status: string;
  externalId: string | null;
  externalOptionId: string | null;
  legacyCode: string | null;
  channelProductName: string | null;
  channelOptionName: string | null;
  channelImageUrl: string | null;
  channelUrl: string | null;
  channelStatus: string | null;
  matchReason: string | null;
  resolutionSource: string | null;
  confidence: number | null;
  linkedListingId: string | null;
  linkedListingOptionId: string | null;
  linkedMasterProductId: string | null;
  linkedProductOptionId: string | null;
  ignoredReason: string | null;
  resolvedAt: Date | null;
  firstObservedAt: Date;
  lastObservedAt: Date;
  updatedAt: Date;
}

export type Tx = unknown;
export type PrismaLike = unknown;

export const RECONCILIATION_CHANNEL = 'coupang';
export const DEFAULT_LIMIT = 50;
export const MAX_PAGE = 200;
export const LINKED_RESOLUTION_SOURCES = [
  'existing_external_id',
  'auto_legacy_code',
  'manual',
  'ignored',
] as const satisfies ReconciliationResolutionSource[];

export interface ChannelReconciliationQueryRepositoryPort {
  getSummary(organizationId: string): Promise<ReconciliationSummary>;

  listItems(
    organizationId: string,
    params: {
      page?: number;
      limit?: number;
      status?: string;
      resolutionSource?: string;
      search?: string;
    },
  ): Promise<ReconciliationItemListResponse>;

  hydrateItems(
    organizationId: string,
    rows: ReconciliationRepositoryItemRow[],
  ): Promise<ReconciliationItem[]>;
}

export interface ChannelReconciliationResolutionRepositoryPort {
  linkItem(
    itemId: string,
    organizationId: string,
    body: { productOptionId: string },
  ): Promise<ReconciliationItem>;

  ignoreItem(
    itemId: string,
    organizationId: string,
    body: { reason?: string | null },
  ): Promise<ReconciliationItem>;
}

export interface ChannelReconciliationScanRepositoryPort {
  scanFromRows(
    organizationId: string,
    rows: ReconciliationRowInput[],
    source?: 'coupang_image_sync' | 'wing_inventory' | 'seller_products' | 'manual',
  ): Promise<ReconciliationScanResponse>;

  syncFromImageSyncedListings(organizationId: string): Promise<ReconciliationScanResponse>;
}

export interface ChannelReconciliationMatcherPort {
  evaluateRow(
    tx: Tx,
    organizationId: string,
    externalId: string,
    externalOptionId: string | null,
    legacyCode: string | null,
  ): Promise<MatchOutcome>;
}
