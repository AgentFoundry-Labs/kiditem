import type {
  CoupangCatalogChunkKind,
  CoupangCatalogCollectionErrorRequest,
  CoupangCatalogCollectionRun,
  CoupangCatalogCollectionPermit,
  FinalizeCoupangCatalogCollectionRequest,
  PutCoupangCatalogChunkRequest,
  StartCoupangCatalogCollectionRequest,
} from '@kiditem/shared/coupang-catalog-snapshot';

export interface ChannelCatalogCollectionPort {
  start(input: {
    organizationId: string;
    userId: string;
    channelAccountId: string;
    idempotencyKey: string;
    request: StartCoupangCatalogCollectionRequest;
  }): Promise<CoupangCatalogCollectionPermit>;

  getStatus(input: {
    organizationId: string;
    channelAccountId: string;
    runId: string;
  }): Promise<CoupangCatalogCollectionRun>;

  putChunk(input: {
    organizationId: string;
    userId: string;
    channelAccountId: string;
    runId: string;
    attemptToken: string;
    kind: CoupangCatalogChunkKind;
    sequence: number;
    request: PutCoupangCatalogChunkRequest;
  }): Promise<CoupangCatalogCollectionRun>;

  fail(input: {
    organizationId: string;
    channelAccountId: string;
    runId: string;
    attemptToken: string;
    request: CoupangCatalogCollectionErrorRequest;
  }): Promise<CoupangCatalogCollectionRun>;

  finalize(input: {
    organizationId: string;
    userId: string;
    channelAccountId: string;
    runId: string;
    attemptToken: string;
    request: FinalizeCoupangCatalogCollectionRequest;
  }): Promise<CoupangCatalogCollectionRun>;
}

export const CHANNEL_CATALOG_COLLECTION_PORT = Symbol('CHANNEL_CATALOG_COLLECTION_PORT');
