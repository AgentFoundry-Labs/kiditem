export type ChannelSkuMappingStatus = 'unmatched' | 'needs_review' | 'matched';

export type ChannelSkuMappingCounts = {
  all: number;
  unmatched: number;
  needsReview: number;
  matched: number;
};

export type ChannelSkuMappingListQuery = {
  channelAccountId?: string;
  mappingStatus?: 'all' | ChannelSkuMappingStatus;
  search?: string;
  page: number;
  limit: number;
};

export type ChannelSkuAvailabilityRepositoryQuery = {
  channelAccountId?: string;
  status: 'all' | 'in_stock' | 'out_of_stock' | 'unmatched' | 'needs_review';
  hasBottleneck?: boolean;
  search?: string;
  page: number;
  limit: number;
};

export type ChannelSkuAvailabilityRepositorySummary = {
  total: number;
  inStock: number;
  outOfStock: number;
  unmatched: number;
  needsReview: number;
};

export type ChannelSkuMappingRow = {
  channelAccount: { id: string; channel: string; name: string };
  product: {
    id: string;
    externalProductId: string;
    registeredName: string | null;
    displayName: string | null;
    status: string | null;
  };
  sku: {
    id: string;
    externalSkuId: string;
    sellerSku: string | null;
    optionName: string | null;
    barcode: string | null;
    modelNumber: string | null;
    salePrice: number | null;
    status: string | null;
    mappingStatus: ChannelSkuMappingStatus;
    updatedAt: Date;
  };
  componentRefs: Array<{
    inventorySkuId: string;
    quantity: number;
    mappingSource: string | null;
  }>;
};

export type UnmappedChannelSkuEvidenceRow = {
  channelSkuId: string;
  sellerSku: string | null;
  modelNumber: string | null;
  barcode: string | null;
  productNames: string[];
  optionName: string | null;
};

export type ReplaceChannelSkuComponentsRepositoryInput = {
  organizationId: string;
  channelSkuId: string;
  userId: string;
  components: Array<{ inventorySkuId: string; quantity: number }>;
  mappingSource: 'manual';
  nextStatus: ChannelSkuMappingStatus;
};

export const CHANNEL_SKU_MAPPING_REPOSITORY_PORT = Symbol(
  'CHANNEL_SKU_MAPPING_REPOSITORY_PORT',
);

export interface ChannelSkuMappingRepositoryPort {
  list(
    organizationId: string,
    query: ChannelSkuMappingListQuery,
  ): Promise<{
    rows: ChannelSkuMappingRow[];
    total: number;
    counts: ChannelSkuMappingCounts;
  }>;
  listAvailabilityPage(
    organizationId: string,
    query: ChannelSkuAvailabilityRepositoryQuery,
  ): Promise<{
    rows: ChannelSkuMappingRow[];
    total: number;
    summary: ChannelSkuAvailabilityRepositorySummary;
  }>;
  findByChannelSkuIds(
    organizationId: string,
    ids: string[],
  ): Promise<ChannelSkuMappingRow[]>;
  findByListingIds(
    organizationId: string,
    ids: string[],
  ): Promise<ChannelSkuMappingRow[]>;
  findOne(
    organizationId: string,
    channelSkuId: string,
  ): Promise<ChannelSkuMappingRow | null>;
  findEvidence(
    organizationId: string,
    channelSkuId: string,
  ): Promise<UnmappedChannelSkuEvidenceRow | null>;
  listUnmappedEvidence(
    organizationId: string,
    channelAccountId?: string,
  ): Promise<UnmappedChannelSkuEvidenceRow[]>;
  updateUnmappedStatuses(
    organizationId: string,
    updates: Array<{
      channelSkuId: string;
      mappingStatus: Exclude<ChannelSkuMappingStatus, 'matched'>;
    }>,
  ): Promise<void>;
  replaceComponents(input: ReplaceChannelSkuComponentsRepositoryInput): Promise<void>;
}
