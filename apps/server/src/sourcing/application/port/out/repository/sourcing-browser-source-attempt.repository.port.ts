import type { AuthorizedCollectionOutput } from './sourcing-collection.repository.port';
import type { SourceRecordWrite } from './source-record.repository.port';

export const SOURCING_BROWSER_SOURCE_ATTEMPT_REPOSITORY_PORT = Symbol(
  'SourcingBrowserSourceAttemptRepositoryPort',
);

/**
 * Retained Sourcing sources share one canonical owner table, not a
 * generic platform runtime. The plan is intentionally JSON-shaped because
 * each source owns its own frozen target shape.
 */
export type SourcingBrowserSourceAttemptState = 'RUNNING' | 'COMPLETE' | 'FAILED';

export interface SourcingBrowserSourceAttemptPlan {
  source: string;
  [key: string]: unknown;
}

export interface SourcingBrowserSourceFailureAlert {
  sourceType: string;
  dedupeKey: string;
  title: string;
  href: string;
}

export interface SourcingBrowserSourceAttempt {
  attemptId: string;
  attemptToken: string;
  sourceKey: string;
  scopeKey: string;
  targetKey: string;
  generation: number;
  state: SourcingBrowserSourceAttemptState;
  expiresAt: Date;
  plan: SourcingBrowserSourceAttemptPlan;
  planChecksum: string;
  contentChecksum: string | null;
  acceptedCount: number;
  warnings?: string[];
  errorCode: string | null;
  errorMessage: string | null;
  completedAt: Date | null;
  /** URL 수집이 입장시킨 원본 기록과 같은 커밋에서 만든 그 초안. */
  scrapeUrlResult?: { sourceRecordId: string; salesProductId: string };
}

export interface SourcingBrowserSourceStatus {
  ready: boolean;
  latestAttempt: SourcingBrowserSourceAttempt | null;
  latestComplete: SourcingBrowserSourceAttempt | null;
  actualCutoffAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface BeginSourcingBrowserSourceAttemptInput {
  organizationId: string;
  sourceKey: string;
  scopeKey: string;
  targetKey: string;
  idempotencyKey: string;
  requestFingerprint: string;
  plan: SourcingBrowserSourceAttemptPlan;
  planChecksum: string;
  requestedByUserId: string | null;
  collectorKey: string;
  collectorVersion: string;
  expiresInMs: number;
  triggerKind?: 'extension' | 'manual';
  failureAlert: SourcingBrowserSourceFailureAlert;
}

export interface CompleteSourcingBrowserSourceAttemptInput {
  organizationId: string;
  attemptId: string;
  attemptToken: string;
  planChecksum: string;
  contentChecksum: string;
  output: AuthorizedCollectionOutput;
  sourceWindowStartAt?: Date | null;
  sourceWindowEndAt?: Date | null;
}

export interface FailSourcingBrowserSourceAttemptInput {
  organizationId: string;
  attemptId: string;
  attemptToken: string;
  code: string;
  message: string;
}

export interface CompleteSourcingScrapeUrlAttemptInput extends CompleteSourcingBrowserSourceAttemptInput {
  sourceRecord: SourceRecordWrite;
}

export interface SourcingBrowserSourceAttemptRepositoryPort {
  readScrapeUrlAttemptByKey(input: { organizationId: string; sourceKey: string; idempotencyKey: string; requestFingerprint: string }): Promise<SourcingBrowserSourceAttempt | null>;
  readAttempt(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<SourcingBrowserSourceAttempt | null>;
  readSourceStatus(input: {
    organizationId: string;
    sourceKey: string;
    scopeKey: string;
    targetKey: string;
    currentPlanChecksum: string;
  }): Promise<SourcingBrowserSourceStatus>;
  /** Creation ownership is ephemeral; source services expose only the attempt on the wire. */
  beginAttempt(
    input: BeginSourcingBrowserSourceAttemptInput,
  ): Promise<{ attempt: SourcingBrowserSourceAttempt; created: boolean }>;
  completeAttempt(
    input: CompleteSourcingBrowserSourceAttemptInput,
  ): Promise<SourcingBrowserSourceAttempt>;
  completeScrapeUrlAttempt(input: CompleteSourcingScrapeUrlAttemptInput): Promise<SourcingBrowserSourceAttempt>;
  failAttempt(
    input: FailSourcingBrowserSourceAttemptInput,
  ): Promise<SourcingBrowserSourceAttempt>;
  /** Operator stop without the lease token; a terminal attempt is returned unchanged. */
  cancelAttempt(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<SourcingBrowserSourceAttempt>;
}
