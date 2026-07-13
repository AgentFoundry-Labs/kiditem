import type { CoupangCatalogChunkKind } from '@kiditem/shared/coupang-catalog-snapshot';

export interface ChannelCatalogCollectionRunRecord {
  id: string;
  organizationId: string;
  channelAccountId: string;
  clientRunKey: string | null;
  status: string;
  rowCount: number;
  errorCount: number;
  startedAt: Date;
  finishedAt: Date | null;
  metaJson: unknown;
  errorJson: unknown;
  sourceImportRunId: string | null;
}

export interface ChannelCatalogCollectionChunkRecord {
  id: string;
  kind: string;
  sequence: number;
  checksum: string;
  itemCount: number;
  payload: unknown;
}

export interface ChannelCatalogCollectionWithChunks
  extends ChannelCatalogCollectionRunRecord {
  chunks: ChannelCatalogCollectionChunkRecord[];
}

export interface ChannelCatalogCollectionRepositoryPort {
  startOrResume(input: {
    organizationId: string;
    userId: string;
    channelAccountId: string;
    clientRunKey: string;
    collectorVersion: string;
  }): Promise<ChannelCatalogCollectionRunRecord>;

  getOwnedRunWithChunks(input: {
    organizationId: string;
    channelAccountId: string;
    runId: string;
  }): Promise<ChannelCatalogCollectionWithChunks>;

  putChunk(input: {
    organizationId: string;
    channelAccountId: string;
    runId: string;
    kind: CoupangCatalogChunkKind;
    sequence: number;
    checksum: string;
    itemCount: number;
    payload: unknown;
  }): Promise<{ stored: boolean; chunk: ChannelCatalogCollectionChunkRecord }>;

  recordRecoverableError(input: {
    organizationId: string;
    channelAccountId: string;
    runId: string;
    error: unknown;
  }): Promise<ChannelCatalogCollectionRunRecord>;

  markFailed(input: {
    organizationId: string;
    channelAccountId: string;
    runId: string;
    error: unknown;
  }): Promise<ChannelCatalogCollectionRunRecord>;
}

export const CHANNEL_CATALOG_COLLECTION_REPOSITORY_PORT = Symbol(
  'CHANNEL_CATALOG_COLLECTION_REPOSITORY_PORT',
);
