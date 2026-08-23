export const SOURCING_AGENT_WORKSPACE_READ_CAPABILITY_PORT = Symbol(
  'SOURCING_AGENT_WORKSPACE_READ_CAPABILITY_PORT',
);
export const SOURCING_AGENT_WORKSPACE_MUTATION_CAPABILITY_PORT = Symbol(
  'SOURCING_AGENT_WORKSPACE_MUTATION_CAPABILITY_PORT',
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

export interface SourcingAgentWorkspaceReadCapabilityPort {
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

}

export interface SourcingAgentWorkspaceMutationCapabilityPort {
  refreshValidation(input: {
    organizationId: string;
    recommendationRunId: string;
    idempotencyKey: string;
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
