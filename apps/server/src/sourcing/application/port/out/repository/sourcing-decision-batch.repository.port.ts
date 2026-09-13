import type {
  RecommendationConfidenceKind,
  RecommendationNextEvidenceAction,
  SourcingBaselineDecision,
  SourcingRecommendationDecision,
} from '../../../../domain/recommendation-decision-policy';

export const SOURCING_DECISION_BATCH_REPOSITORY_PORT = Symbol(
  'SourcingDecisionBatchRepositoryPort',
);

export interface SourcingDecisionEvidenceRecord {
  id: string;
  observationId: string;
  evidenceRole: string;
}

export interface SourcingDecisionBatchItemRecord {
  id: string;
  organizationId: string;
  decisionBatchId: string;
  modelCandidateId: string;
  rank: number;
  productName: string;
  supplierOfferSkuSnapshotId: string | null;
  launchCandidateId: string | null;
  baselineDecision: SourcingBaselineDecision;
  canonicalDecision: SourcingRecommendationDecision;
  executionEligible: boolean;
  baselineScore: number;
  confidence: number;
  confidenceKind: RecommendationConfidenceKind;
  evidenceFamilyCount: number;
  evidencePlatformCount: number;
  hasCoupangEvidence: boolean;
  has1688Evidence: boolean;
  nextEvidenceAction: RecommendationNextEvidenceAction | 'resolve_supplier_variant' | null;
  reasonCodes: string[];
  riskCodes: string[];
  modelOutput: Record<string, unknown>;
  createdAt: Date;
}

export interface SourcingDecisionBatchItemWithBatchRecord
  extends SourcingDecisionBatchItemRecord {
  decisionBatchStatus: string;
  decisionBatchExpiresAt: Date;
  evidence: SourcingDecisionEvidenceRecord[];
}

export interface SourcingDecisionBatchRecord {
  id: string;
  organizationId: string;
  batchKey: string;
  requestHash: string;
  status: string;
  keyword: string;
  category: string | null;
  policyVersion: string;
  modelPipeline: string;
  modelVersion: string;
  modelGeneratorVersion: string;
  decisionAt: Date;
  sourceCutoffAt: Date;
  expiresAt: Date;
  createdByUserId: string;
  createdAt: Date;
  items: SourcingDecisionBatchItemRecord[];
}

export interface CreateSourcingDecisionBatchItemCommand {
  modelCandidateId: string;
  rank: number;
  productName: string;
  supplierOfferSkuSnapshotId: string | null;
  launchCandidateId: string | null;
  baselineDecision: SourcingBaselineDecision;
  canonicalDecision: SourcingRecommendationDecision;
  executionEligible: boolean;
  baselineScore: number;
  confidence: number;
  confidenceKind: RecommendationConfidenceKind;
  evidenceFamilyCount: number;
  evidencePlatformCount: number;
  hasCoupangEvidence: boolean;
  has1688Evidence: boolean;
  nextEvidenceAction: RecommendationNextEvidenceAction | 'resolve_supplier_variant' | null;
  reasonCodes: string[];
  riskCodes: string[];
  modelOutput: Record<string, unknown>;
  evidence: Array<{
    observationId: string;
    evidenceRole: string;
    sourceObservation?: {
      sourceKey: string;
      scopeKey: string;
      observationKey: string;
    };
  }>;
}

export interface CreateSourcingDecisionBatchCommand {
  organizationId: string;
  batchKey: string;
  requestHash: string;
  status: string;
  keyword: string;
  category: string | null;
  policyVersion: string;
  modelPipeline: string;
  modelVersion: string;
  modelGeneratorVersion: string;
  decisionAt: Date;
  sourceCutoffAt: Date;
  expiresAt: Date;
  createdByUserId: string;
  items: CreateSourcingDecisionBatchItemCommand[];
}

export type CreateSourcingDecisionBatchResult =
  | { kind: 'created'; duplicate: false; record: SourcingDecisionBatchRecord }
  | { kind: 'existing'; duplicate: true; record: SourcingDecisionBatchRecord }
  | { kind: 'idempotency_conflict' }
  | { kind: 'source_evidence_changed' }
  | { kind: 'reference_not_found' };

export interface SourcingDecisionBatchRepositoryPort {
  create(
    command: CreateSourcingDecisionBatchCommand,
  ): Promise<CreateSourcingDecisionBatchResult>;

  findById(input: {
    organizationId: string;
    id: string;
  }): Promise<SourcingDecisionBatchRecord | null>;

  findLatest(input: {
    organizationId: string;
  }): Promise<SourcingDecisionBatchRecord | null>;

  findItemById(input: {
    organizationId: string;
    id: string;
  }): Promise<SourcingDecisionBatchItemWithBatchRecord | null>;
}
