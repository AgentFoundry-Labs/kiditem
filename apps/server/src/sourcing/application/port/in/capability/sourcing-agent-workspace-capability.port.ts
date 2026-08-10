export const SOURCING_AGENT_WORKSPACE_CAPABILITY_PORT = Symbol(
  'SOURCING_AGENT_WORKSPACE_CAPABILITY_PORT',
);

export interface SourcingEvidenceDocument {
  documentId: string;
  title: string;
  text: string;
  sourceScope: 'recommendation_run' | 'interest_targets' | 'validation';
  sourceDate: string;
  sourceSnapshotId: string;
  matchedTerms: string[];
  score: number;
  metadata: Record<string, string | number | boolean | null>;
}

export interface SourcingWorkspaceEvidenceResult {
  inputHash: string;
  documentCount: number;
  documents: SourcingEvidenceDocument[];
  dataGaps: string[];
}

export interface SourcingAgentWorkspaceCapabilityPort {
  retrieveWorkspaceEvidence(input: {
    organizationId: string;
    query: string;
    topK?: number;
    days?: number;
  }): Promise<SourcingWorkspaceEvidenceResult>;

  inspectRecommendationRun(input: {
    organizationId: string;
    recommendationRunId?: string | null;
  }): Promise<{
    runId: string;
    status: 'complete' | 'partial' | 'failed';
    businessDate: string;
    itemCount: number;
    warningCodes: string[];
    validation: { itemCount: number; missingCount: number };
  }>;

  refreshCollection(input: {
    organizationId: string;
    requestedByUserId: string | null;
    sources: Array<'naver' | '1688' | 'shorts'>;
    idempotencyKey: string;
  }): Promise<{ operationRunId: string; status: string }>;

  refreshValidation(input: {
    organizationId: string;
    recommendationRunId: string;
  }): Promise<{
    recommendationRunId: string;
    validationEpisodeIds: string[];
    missingEvidence: string[];
  }>;

  createReviewBatch(input: {
    organizationId: string;
    requestedByUserId: string;
    recommendationRunId: string;
    workspaceKey: 'entry' | 'final';
    items: Array<{ itemKey: string; expectedVersion: number }>;
    idempotencyKey: string;
  }): Promise<{ reviewBatchId: string; itemCount: number; status: string }>;
}
