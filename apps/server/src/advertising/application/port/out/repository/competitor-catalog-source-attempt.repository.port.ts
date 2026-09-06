import type { AdvertisingCompetitorCatalogItem } from '@kiditem/shared/sourcing';

export const COMPETITOR_CATALOG_SOURCE_ATTEMPT_REPOSITORY_PORT = Symbol(
  'CompetitorCatalogSourceAttemptRepositoryPort',
);

export type CompetitorCatalogAttemptInput =
  | { target: 'all' }
  | { target: 'rank_enrichment'; excludeCompletedAttemptId?: string }
  | { target: 'seller_id'; sellerId: string };

export interface CompetitorCatalogTargetPlan {
  sellerId: string;
  sellerName: string;
  sellerStoreUrl: string;
  keyword: string;
}

export interface CompetitorCatalogAttemptPlan {
  attemptId: string;
  attemptToken: string;
  state: 'RUNNING' | 'COMPLETE' | 'FAILED';
  expiresAt: string;
  input: CompetitorCatalogAttemptInput;
  targets: readonly CompetitorCatalogTargetPlan[];
}

export interface CompetitorCatalogSourceView {
  status: 'READY' | 'STALE' | 'MISSING';
  latestAttempt: {
    attemptId: string;
    state: 'RUNNING' | 'COMPLETE' | 'FAILED';
    startedAt: string;
    capturedAt: string | null;
    expiresAt: string;
    errorCode: string | null;
    errorMessage: string | null;
  } | null;
  latestComplete: {
    sourceImportRunId: string;
    coveredThrough: string;
    capturedAt: string;
    expectedTargetCount: number;
    capturedTargetCount: number;
    ignoredTargetCount: number;
  } | null;
}

export interface CompetitorCatalogSubmission {
  organizationId: string;
  attemptId: string;
  attemptToken: string;
  catalogs: readonly AdvertisingCompetitorCatalogItem[];
}

export interface CompetitorCatalogSourceAttemptRepositoryPort {
  replayAttempt(input: {
    organizationId: string;
    idempotencyKey: string;
    input: CompetitorCatalogAttemptInput;
  }): Promise<CompetitorCatalogAttemptPlan | null>;
  beginAttempt(input: {
    organizationId: string;
    idempotencyKey: string;
    input: CompetitorCatalogAttemptInput;
    targets: readonly CompetitorCatalogTargetPlan[];
  }): Promise<CompetitorCatalogAttemptPlan>;
  readAttemptControl(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<CompetitorCatalogAttemptPlan | null>;
  readSourceStatus(input: {
    organizationId: string;
  }): Promise<CompetitorCatalogSourceView>;
  submitAttempt(input: CompetitorCatalogSubmission): Promise<CompetitorCatalogSourceView>;
  failAttempt(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    code: string;
    message: string;
  }): Promise<CompetitorCatalogSourceView>;
}
