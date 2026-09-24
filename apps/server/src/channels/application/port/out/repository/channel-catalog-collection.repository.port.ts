import type { CatalogCollectionChunk } from '../../../../domain/collection/catalog-chunk-snapshot';
import type {
  CoupangCatalogChunkKind,
  CoupangCatalogCollectionPauseRequest,
  CoupangCatalogStage,
} from '@kiditem/shared/coupang-catalog-snapshot';

export interface ChannelCatalogCollectionRunRecord {
  id: string;
  collectionRunId: string;
  organizationId: string;
  channelAccountId: string;
  attemptToken: string;
  idempotencyKey: string;
  expiresAt: Date;
  plan: unknown;
  stage?: CoupangCatalogStage;
  status: string;
  rowCount: number;
  errorCount: number;
  startedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  finishedAt: Date | null;
  metaJson: unknown;
  errorJson: unknown;
  sourceImportRunId: string | null;
}

export type ChannelCatalogCollectionChunkRecord = CatalogCollectionChunk;

export interface ChannelCatalogCollectionWithChunks extends ChannelCatalogCollectionRunRecord {
  chunks: ChannelCatalogCollectionChunkRecord[];
}

export interface ChannelCatalogCollectionRepositoryPort {
  startOrResume(input: {
    organizationId: string;
    userId: string;
    channelAccountId: string;
    idempotencyKey: string;
    collectorVersion: string;
    stage?: CoupangCatalogStage;
    expectedBasicAttemptId?: string;
  }): Promise<ChannelCatalogCollectionRunRecord>;

  getOwnedRunWithChunks(input: {
    organizationId: string;
    channelAccountId: string;
    runId: string;
    attemptToken?: string;
    stage?: CoupangCatalogStage;
    includePayload?: boolean;
  }): Promise<ChannelCatalogCollectionWithChunks>;

  /**
   * Read the preallocated details owner linked to one completed basics owner.
   * This is an internal chain read: the idempotency key and root identity are
   * both fenced so a status poll cannot adopt another account's child.
   */
  getOwnedDetailsChild(input: {
    organizationId: string;
    channelAccountId: string;
    rootAttemptId: string;
    detailsIdempotencyKey: string;
    includePayload?: boolean;
  }): Promise<ChannelCatalogCollectionWithChunks | null>;

  putChunk(input: {
    organizationId: string;
    channelAccountId: string;
    runId: string;
    attemptToken: string;
    stage?: CoupangCatalogStage;
    kind: CoupangCatalogChunkKind;
    sequence: number;
    checksum: string;
    itemCount: number;
    payload: unknown;
  }): Promise<{ stored: boolean; chunk: ChannelCatalogCollectionChunkRecord }>;

  markFailed(input: {
    organizationId: string;
    channelAccountId: string;
    runId: string;
    attemptToken: string;
    stage?: CoupangCatalogStage;
    error: { code: string; message: string; phase: string };
  }): Promise<ChannelCatalogCollectionRunRecord>;

  markPaused(input: {
    organizationId: string;
    channelAccountId: string;
    runId: string;
    attemptToken: string;
    stage?: CoupangCatalogStage;
    error: CoupangCatalogCollectionPauseRequest;
  }): Promise<ChannelCatalogCollectionRunRecord>;

  /**
   * Operator stop without the attempt token (KID-147), under the account lock.
   * A stopped root also stops the details child running under it, and a
   * completed basics root whose handoff is still pending gets its preallocated
   * child admitted and stopped, so the whole import ends. A running attempt
   * whose lease passed is settled as expiry; a terminal import is unchanged.
   */
  cancel(input: {
    organizationId: string;
    userId: string;
    channelAccountId: string;
    runId: string;
  }): Promise<void>;

  /** The account's most recent browser import root: a basics attempt, or a legacy full one. */
  findLatestRootAttempt(input: {
    organizationId: string;
    channelAccountId: string;
  }): Promise<{ id: string } | null>;
}

export const CHANNEL_CATALOG_COLLECTION_REPOSITORY_PORT = Symbol(
  'CHANNEL_CATALOG_COLLECTION_REPOSITORY_PORT',
);
