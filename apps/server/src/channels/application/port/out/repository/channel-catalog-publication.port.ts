import type { CoupangCatalogStage } from '@kiditem/shared/coupang-catalog-snapshot';

export interface ChannelCatalogPublicationResult {
  sourceImportRunId: string;
  duplicate: boolean;
  changes: Record<string, number>;
}

export interface ChannelCatalogPublicationPort {
  /**
   * Atomically enrich one accepted full-details chunk inside the collection
   * owner's transaction. The source attempt remains running until every
   * product is accepted; already published products survive a later failure.
   */
  publishDetailChunk(input: {
    transaction: unknown;
    organizationId: string;
    channelAccountId: string;
    collectionRunId: string;
    attemptId: string;
    attemptToken: string;
    chunk: {
      id: string;
      kind: string;
      sequence: number;
      checksum: string;
      itemCount: number;
      payload: unknown;
      publishedAt?: Date | null;
      publicationJson?: unknown;
    };
  }): Promise<ChannelCatalogPublicationResult>;

  publish(input: {
    organizationId: string;
    userId: string;
    channelAccountId: string;
    collectionRunId: string;
    attemptId: string;
    attemptToken: string;
    snapshotHash: string;
    chunkSetHash: string;
    stage?: CoupangCatalogStage;
  }): Promise<ChannelCatalogPublicationResult>;
}

export const CHANNEL_CATALOG_PUBLICATION_PORT = Symbol('CHANNEL_CATALOG_PUBLICATION_PORT');
