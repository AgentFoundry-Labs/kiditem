import type {
  CoupangCatalogChunkKind,
  CoupangCatalogCollectionErrorRequest,
  CoupangCatalogCollectionPauseRequest,
  CoupangCatalogCollectionRun,
  CoupangCatalogCollectionPermit,
  FinalizeCoupangCatalogCollectionRequest,
  PutCoupangCatalogChunkRequest,
  CoupangCatalogSourceStatus,
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

  pause(input: {
    organizationId: string;
    channelAccountId: string;
    runId: string;
    attemptToken: string;
    request: CoupangCatalogCollectionPauseRequest;
  }): Promise<CoupangCatalogCollectionRun>;

  finalize(input: {
    organizationId: string;
    userId: string;
    channelAccountId: string;
    runId: string;
    attemptToken: string;
    request: FinalizeCoupangCatalogCollectionRequest;
  }): Promise<CoupangCatalogCollectionRun>;

  /**
   * Operator stop from any browser, without the attempt token (KID-147).
   * Stopping an import's root ends the whole import, its details child
   * included; a terminal import is answered unchanged.
   */
  cancel(input: {
    organizationId: string;
    userId: string;
    channelAccountId: string;
    runId: string;
  }): Promise<CoupangCatalogCollectionRun>;

  /** The account's latest browser import: its root attempt, and its details child once admitted. */
  readSource(input: {
    organizationId: string;
    channelAccountId: string;
  }): Promise<CoupangCatalogSourceStatus>;
}

export const CHANNEL_CATALOG_COLLECTION_PORT = Symbol('CHANNEL_CATALOG_COLLECTION_PORT');
