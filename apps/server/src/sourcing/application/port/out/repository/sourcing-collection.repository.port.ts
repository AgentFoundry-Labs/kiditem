import type {
  NaverKeywordSnapshotUpsert,
  NaverPopularKeywordSnapshotUpsert,
  ShortsSnapshotUpsert,
  Sourcing1688HotProductSnapshotUpsert,
  TiktokCcSnapshotUpsert,
} from './trend-collection.repository.port';
import type {
  LiveCommerceBroadcastSnapshotUpsert,
  LiveCommerceProductSnapshotUpsert,
} from './live-commerce.repository.port';
import type { AppendSourcingEvidenceObservationCommand } from './sourcing-evidence-ledger.repository.port';

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
  entitlementVersionId: string;
  entitlementVersionHash: string;
  decisionImpactAtIngest: 'disabled' | 'enabled';
  leaseExpiresAt: Date;
}

export type ClaimAuthorizedRunResult =
  | { kind: 'claimed'; permit: SourcingCollectionPermit }
  | { kind: 'existing'; permit: SourcingCollectionPermit }
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
  | { kind: 'offer_1688_hot'; row: Sourcing1688HotProductSnapshotUpsert }
  | { kind: 'shorts'; row: ShortsSnapshotUpsert }
  | { kind: 'tiktok_creative'; row: TiktokCcSnapshotUpsert }
  | { kind: 'live_commerce_broadcast'; row: LiveCommerceBroadcastSnapshotUpsert }
  | { kind: 'live_commerce_product'; row: LiveCommerceProductSnapshotUpsert };

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
  | { kind: 'authorization_changed' }
  | { kind: 'lease_lost' }
  | { kind: 'cancelled' }
  | { kind: 'superseded' };

export interface FailAuthorizedCollectionInput {
  permit: SourcingCollectionPermit;
  error: { code: string; message: string; retryable: boolean };
}

export interface SourcingCollectionRepositoryPort {
  claimAuthorizedRun(
    input: ClaimAuthorizedRunInput,
  ): Promise<ClaimAuthorizedRunResult>;
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
