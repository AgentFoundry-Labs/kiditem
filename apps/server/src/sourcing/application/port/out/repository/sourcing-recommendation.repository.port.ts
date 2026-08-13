import type { ActiveBrowserAttemptTransaction } from '../../../../../operations/application/port/active-browser-attempt-transaction';

export const SOURCING_RECOMMENDATION_REPOSITORY_PORT = Symbol(
  'SourcingRecommendationRepositoryPort',
);

export interface SourcingRecommendationItemWrite {
  itemKey: string;
  sourcePlatform: '1688' | 'coupang';
  externalOfferId: string;
  variantKeyNormalized: string;
  matchedCoupangProductId: string | null;
  displayName: string;
  rank: number;
  score: number;
  grade: 'A' | 'B' | 'C' | 'WATCH';
  baselineAction: 'order' | 'observe_3d' | 'exclude';
  reasonCodes: string[];
  riskCodes: string[];
  scoreComponents: Record<string, number>;
  sourceSnapshot: Record<string, unknown>;
  evidenceObservationIds: string[];
}

export interface SourcingRecommendationStoredItem
  extends Omit<SourcingRecommendationItemWrite, 'evidenceObservationIds'> {
  id: string;
  evidenceObservationIds: string[];
}

export interface SourcingRecommendationRunGraph {
  id: string;
  organizationId: string;
  inputManifestHash: string;
  status: 'complete' | 'partial' | 'failed' | 'staged_complete' | 'staged_partial';
  businessDate: Date;
  generatedAt: Date;
  completedAt: Date | null;
  expiresAt: Date | null;
  warningCodes: string[];
  items: SourcingRecommendationStoredItem[];
}

export interface CreateSourcingRecommendationRunCommand {
  organizationId: string;
  policyKey: 'sourcing_workspace';
  policyVersion: string;
  modelVersion: string;
  calculationVersion: string;
  inputManifestHash: string;
  inputManifest: Record<string, unknown>;
  status: 'complete' | 'partial' | 'failed' | 'staged_complete' | 'staged_partial';
  businessDate: Date;
  generatedAt: Date;
  completedAt: Date | null;
  expiresAt: Date | null;
  warningCodes: string[];
  errorCode: string | null;
  errorMessage: string | null;
  items: SourcingRecommendationItemWrite[];
}

export type CreateRecommendationRunResult =
  | { kind: 'created'; run: SourcingRecommendationRunGraph }
  | { kind: 'existing'; run: SourcingRecommendationRunGraph };

export interface SourcingRecommendationRepositoryPort {
  publishStagedRunInAttempt(
    transaction: ActiveBrowserAttemptTransaction,
    input: { organizationId: string; runId: string },
  ): Promise<'published' | 'already_published' | 'missing'>;
  findById(input: {
    organizationId: string;
    id: string;
  }): Promise<SourcingRecommendationRunGraph | null>;
  findLatest(input: {
    organizationId: string;
    now: Date;
  }): Promise<SourcingRecommendationRunGraph | null>;
  createOrGet(
    command: CreateSourcingRecommendationRunCommand,
  ): Promise<CreateRecommendationRunResult>;
}
