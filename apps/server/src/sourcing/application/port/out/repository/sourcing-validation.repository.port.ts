export const SOURCING_VALIDATION_REPOSITORY_PORT = Symbol(
  'SourcingValidationRepositoryPort',
);

export type SourcingValidationCheckStatus =
  | 'pass'
  | 'fail'
  | 'missing'
  | 'pending'
  | 'not_applicable';

export type SourcingValidationEpisodeStatus =
  | 'pending'
  | 'observing'
  | 'ready_for_review'
  | 'blocked'
  | 'failed';

export interface SourcingValidationCheckWrite {
  checkKey: string;
  status: SourcingValidationCheckStatus;
  severity: string | null;
  score: number | null;
  summary: string | null;
  details: Record<string, unknown>;
  evidenceObservationIds: string[];
}

export interface SourcingValidationEpisodeWrite {
  recommendationItemId: string;
  status: SourcingValidationEpisodeStatus;
  policyKey: 'sourcing_validation';
  policyVersion: string;
  evidenceCutoffAt: Date;
  completedAt: Date | null;
  validUntil: Date | null;
  summary: Record<string, unknown>;
  checks: SourcingValidationCheckWrite[];
}

export interface SourcingValidationItemView {
  episodeId: string;
  recommendationRunId: string;
  itemKey: string;
  displayName: string;
  imageUrl: string | null;
  status: SourcingValidationEpisodeStatus;
  score: number | null;
  landedCostKrw: number | null;
  expectedMarginBps: number | null;
  validUntil: string | null;
  checks: Array<{
    checkKey: string;
    status: SourcingValidationCheckStatus;
    summary: string | null;
  }>;
}

export interface SourcingValidationItemRecord extends SourcingValidationItemView {
  /** Internal cache/input version only; HTTP presenters deliberately omit it. */
  updatedAt: Date;
}

export interface SourcingValidationRepositoryPort {
  /**
   * Recommendation runs are immutable, so their validation graph is also
   * create-or-get. A retry returns the first complete graph rather than
   * overwriting an episode already referenced by a review batch.
   */
  replaceForRun(command: {
    organizationId: string;
    recommendationRunId: string;
    /** Agent capability path uses this exact owner key for a DB transaction fence. */
    idempotencyKey?: string;
    episodes: SourcingValidationEpisodeWrite[];
  }): Promise<SourcingValidationItemRecord[]>;

  listForRun(input: {
    organizationId: string;
    recommendationRunId: string;
    limit: number;
    cursor?: string;
  }): Promise<{
    items: SourcingValidationItemRecord[];
    nextCursor: string | null;
  }>;
}
