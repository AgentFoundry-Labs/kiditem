import type { AuthorizedCollectionOutput } from './sourcing-collection.repository.port';
import type { UpsertCandidateInput } from './sourcing-candidate.repository.port';

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
  scrapeUrlResult?: { candidateId: string; href: string };
}

export interface SourcingBrowserSourceStatus {
  status: 'READY' | 'STALE' | 'MISSING';
  refreshing: boolean;
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
  failureAlert: SourcingBrowserSourceFailureAlert;
}

export interface FailSourcingBrowserSourceAttemptInput {
  organizationId: string;
  attemptId: string;
  attemptToken: string;
  code: string;
  message: string;
  failureAlert: SourcingBrowserSourceFailureAlert;
}

export interface CompleteSourcingScrapeUrlAttemptInput extends CompleteSourcingBrowserSourceAttemptInput {
  candidate: UpsertCandidateInput;
}

export interface SourcingWingCatalogReceipt {
  sequence: number;
  keyword: string;
  checksum: string;
  count: number;
  duplicateCount: number;
}

export interface StageSourcingWingCatalogInput {
  organizationId: string;
  attemptId: string;
  attemptToken: string;
  planChecksum: string;
  sequence: number;
  keyword: string;
  checksum: string;
  output: AuthorizedCollectionOutput;
}

export interface CompleteSourcingWingCatalogInput extends Omit<CompleteSourcingBrowserSourceAttemptInput, 'output'> {
  receipts: SourcingWingCatalogReceipt[];
  qualityReport: Record<string, unknown>;
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
  stageWingCatalogBatch(input: StageSourcingWingCatalogInput): Promise<SourcingWingCatalogReceipt>;
  completeWingCatalogAttempt(input: CompleteSourcingWingCatalogInput): Promise<SourcingBrowserSourceAttempt>;
  failAttempt(
    input: FailSourcingBrowserSourceAttemptInput,
  ): Promise<SourcingBrowserSourceAttempt>;
}
