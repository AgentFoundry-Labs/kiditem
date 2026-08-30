import type {
  NaverKeywordSnapshotUpsert,
  NaverPopularKeywordSnapshotUpsert,
  ShortsSnapshotUpsert,
  Sourcing1688OfferKeywordObservationInput,
  TiktokCcSnapshotUpsert,
} from './trend-collection.repository.port';
import type {
  LiveCommerceBroadcastSnapshotUpsert,
  LiveCommerceProductSnapshotUpsert,
} from './live-commerce.repository.port';
import type { AppendSourcingEvidenceObservationCommand } from './sourcing-evidence-ledger.repository.port';
import type { ActiveOperationAttemptTransaction } from '../../../../../operations/application/port/active-browser-attempt-transaction';

export const SOURCING_COLLECTION_REPOSITORY_PORT = Symbol(
  'SourcingCollectionRepositoryPort',
);

export interface SourcingCollectionPermit {
  runId: string;
  organizationId: string;
  sourceKey: string;
  scopeKey: string;
  targetKey: string;
  leaseToken: string;
  generation: number;
  leaseExpiresAt: Date;
}

export type ClaimAuthorizedRunResult =
  | { kind: 'claimed'; permit: SourcingCollectionPermit }
  | { kind: 'existing'; permit: SourcingCollectionPermit }
  | { kind: 'denied'; reasonCode: string }
  | { kind: 'idempotency_conflict' };

export type ClaimRecoverableRunResult =
  | { kind: 'claimed'; permit: SourcingCollectionPermit }
  | { kind: 'in_progress'; runId: string; leaseExpiresAt: Date }
  | { kind: 'completed'; runId: string }
  | { kind: 'denied'; reasonCode: string }
  | { kind: 'idempotency_conflict' };

export interface ClaimAuthorizedRunInput {
  organizationId: string;
  sourceKey: string;
  scopeKey: string;
  targetKey: string;
  idempotencyKey: string;
  requestHash: string;
  collectorKey: string;
  collectorVersion: string;
  triggerKind: 'manual' | 'schedule' | 'extension' | 'bootstrap' | 'retry';
  triggeredByUserId: string | null;
  leaseDurationMs: number;
}

export type SourcingTypedCollectionRecord =
  | { kind: 'naver_keyword'; row: NaverKeywordSnapshotUpsert }
  | { kind: 'naver_popular_keyword'; row: NaverPopularKeywordSnapshotUpsert }
  | {
      kind: 'offer_1688_keyword_observation';
      row: Sourcing1688OfferKeywordObservationUpsert;
    }
  | { kind: 'shorts'; row: ShortsSnapshotUpsert }
  | { kind: 'tiktok_creative'; row: TiktokCcSnapshotUpsert }
  | { kind: 'live_commerce_broadcast'; row: LiveCommerceBroadcastSnapshotUpsert }
  | { kind: 'live_commerce_product'; row: LiveCommerceProductSnapshotUpsert }
  | { kind: 'extension_candidate'; row: SourcingExtensionCandidateProjection };

export interface Sourcing1688OfferKeywordObservationUpsert
  extends Sourcing1688OfferKeywordObservationInput {
  ingestionRunId: string;
  evidenceObservationKey: string;
  evidenceRevision: number;
}

export interface SourcingExtensionCandidateProjection {
  organizationId: string;
  pageType: 'detail' | 'description';
  sourceUrl: string;
  sourcePlatform: string;
  externalOfferId: string;
  variantKeyNormalized: string;
  sourceIdentityHash: string;
  rawData: Record<string, unknown>;
  name: string | null;
  description: string | null;
  category: string | null;
  tags: string[];
  thumbnailUrl: string | null;
  imageUrl: string | null;
  costCny: number | null;
  triggeredByUserId: string | null;
  images: Array<{
    url: string;
    role: string;
    label: string | null;
    sortOrder: number;
    source: string;
    isPrimary: boolean;
  }>;
}

export interface AuthorizedCollectionOutput {
  observations: AppendSourcingEvidenceObservationCommand[];
  typedRecords: SourcingTypedCollectionRecord[];
  discoveredCount: number;
  rejectedCount: number;
  qualityReport: Record<string, unknown>;
}

export interface CommitAuthorizedCollectionInput {
  permit: SourcingCollectionPermit;
  output: AuthorizedCollectionOutput;
}

export type CommitAuthorizedCollectionResult =
  | {
      kind: 'committed';
      runId: string;
      acceptedCount: number;
      duplicateCount: number;
      staleDiscardedCount: number;
    }
  | { kind: 'source_denied'; reasonCode: 'source_not_allowed' | 'source_disabled' }
  | { kind: 'lease_lost' }
  | { kind: 'cancelled' }
  | { kind: 'superseded' };

export interface FailAuthorizedCollectionInput {
  permit: SourcingCollectionPermit;
  error: { code: string; message: string; retryable: boolean };
}

export interface SourcingCollectionRepositoryPort {
  claimAuthorizedRunInAttempt(
    transaction: ActiveOperationAttemptTransaction,
    input: ClaimAuthorizedRunInput,
  ): Promise<ClaimAuthorizedRunResult>;
  claimRecoverableRunInAttempt(
    transaction: ActiveOperationAttemptTransaction,
    input: ClaimAuthorizedRunInput,
  ): Promise<ClaimRecoverableRunResult>;
  commitInAttempt(
    transaction: ActiveOperationAttemptTransaction,
    input: CommitAuthorizedCollectionInput,
  ): Promise<CommitAuthorizedCollectionResult>;
  claimAuthorizedRun(
    input: ClaimAuthorizedRunInput,
  ): Promise<ClaimAuthorizedRunResult>;
  resumeAuthorizedRun(
    input: ClaimAuthorizedRunInput,
  ): Promise<ClaimAuthorizedRunResult>;
  /**
   * Claims an idempotent local effect whose external work is itself keyed.
   * Failed, superseded, or expired generations are resumed on the same row;
   * a live generation remains single-owner and a completed row is immutable.
   */
  claimRecoverableRun(
    input: ClaimAuthorizedRunInput,
  ): Promise<ClaimRecoverableRunResult>;
  checkpoint(
    permit: SourcingCollectionPermit,
  ): Promise<'continue' | 'cancel' | 'superseded'>;
  commit(
    input: CommitAuthorizedCollectionInput,
  ): Promise<CommitAuthorizedCollectionResult>;
  fail(input: FailAuthorizedCollectionInput): Promise<void>;
  requestCancel(input: {
    organizationId: string;
    runId: string;
    requestedByUserId: string;
  }): Promise<void>;
}
