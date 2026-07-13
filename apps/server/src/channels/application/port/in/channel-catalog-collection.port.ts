import type {
  CoupangCatalogChunkKind,
  CoupangCatalogCollectionErrorRequest,
  CoupangCatalogCollectionRun,
  FinalizeCoupangCatalogCollectionRequest,
  PutCoupangCatalogChunkRequest,
  StartCoupangCatalogCollectionRequest,
} from '@kiditem/shared/coupang-catalog-snapshot';

export interface ChannelCatalogCollectionPort {
  start(input: {
    organizationId: string;
    userId: string;
    channelAccountId: string;
    request: StartCoupangCatalogCollectionRequest;
  }): Promise<CoupangCatalogCollectionRun>;

  getStatus(input: {
    organizationId: string;
    channelAccountId: string;
    runId: string;
  }): Promise<CoupangCatalogCollectionRun>;

  putChunk(input: {
    organizationId: string;
    channelAccountId: string;
    runId: string;
    kind: CoupangCatalogChunkKind;
    sequence: number;
    request: PutCoupangCatalogChunkRequest;
  }): Promise<CoupangCatalogCollectionRun>;

  recordError(input: {
    organizationId: string;
    channelAccountId: string;
    runId: string;
    request: CoupangCatalogCollectionErrorRequest;
  }): Promise<CoupangCatalogCollectionRun>;

  finalize(input: {
    organizationId: string;
    userId: string;
    channelAccountId: string;
    runId: string;
    request: FinalizeCoupangCatalogCollectionRequest;
  }): Promise<CoupangCatalogCollectionRun>;
}

export const CHANNEL_CATALOG_COLLECTION_PORT = Symbol(
  'CHANNEL_CATALOG_COLLECTION_PORT',
);
