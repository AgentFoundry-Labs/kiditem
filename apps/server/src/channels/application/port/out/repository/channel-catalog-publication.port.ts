import type { CoupangCatalogProductV1 } from '@kiditem/shared/coupang-catalog-snapshot';

export interface ChannelCatalogPublicationResult {
  sourceImportRunId: string;
  duplicate: boolean;
  changes: Record<string, number>;
}

export interface ChannelCatalogChunkPublicationResult {
  duplicate: boolean;
  changes: Record<string, number>;
}

export interface ChannelCatalogPublicationPort {
  publishChunk(input: {
    organizationId: string;
    userId: string;
    channelAccountId: string;
    collectionRunId: string;
    chunkId: string;
    products: Array<{ ordinal: number; product: CoupangCatalogProductV1 }>;
  }): Promise<ChannelCatalogChunkPublicationResult>;

  publish(input: {
    organizationId: string;
    userId: string;
    channelAccountId: string;
    collectionRunId: string;
    snapshotHash: string;
    products: Array<{ ordinal: number; product: CoupangCatalogProductV1 }>;
  }): Promise<ChannelCatalogPublicationResult>;
}

export const CHANNEL_CATALOG_PUBLICATION_PORT = Symbol(
  'CHANNEL_CATALOG_PUBLICATION_PORT',
);
