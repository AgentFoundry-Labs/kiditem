/** Sourcing owns this incoming Agent capability port; it has no Agent OS dependency. */
export const SOURCING_FINAL_CAPABILITY_PORT = Symbol('SOURCING_FINAL_CAPABILITY_PORT');

export interface SourcingOwnerExecutionContext {
  organizationId: string;
  initiatingUserId: string;
  /** Process-memory live execution coordinate used only for scrape receipt binding. */
  executionId: string;
  ownerIdempotencyKey?: string;
  ownerInputHash?: string;
}
export type SourcingMutationExecutionContext = SourcingOwnerExecutionContext & {
  ownerIdempotencyKey: string;
};

export interface SourcingSourceSnapshot {
  sourceUrl: string;
  platform: '1688' | 'alibaba';
  title: string | null;
  price: number | null;
  currency: string | null;
  /** Sourcing-normalized supplier variant; part of durable candidate identity. */
  variantKeyNormalized: string;
  images: string[];
  contentHash: string;
}

export interface SourcingFinalCapabilityPort {
  duplicateCheck(request: { context: Pick<SourcingOwnerExecutionContext, 'organizationId'>; input: { sourceUrl: string } }): Promise<{ duplicate: boolean; candidateId: string | null }>;
  scrapeProductUrl(request: { context: Pick<SourcingOwnerExecutionContext, 'organizationId' | 'initiatingUserId' | 'executionId'>; input: { sourceUrl: string } }): Promise<{ snapshot: SourcingSourceSnapshot }>;
  ingestCandidate(request: { context: SourcingMutationExecutionContext; input: { snapshot: SourcingSourceSnapshot } }): Promise<{ candidateId: string }>;
  createReviewBatch(request: { context: SourcingMutationExecutionContext; input: { recommendationRunId: string; workspaceKey: 'entry' | 'final'; items: Array<{ itemKey: string; expectedVersion: number }> } }): Promise<{ reviewBatchId: string; itemCount: number; status: string }>;
  inspectRecommendationRun(request: { context: Pick<SourcingOwnerExecutionContext, 'organizationId'>; input: { recommendationRunId?: string } }): Promise<{ runId: string; status: 'complete' | 'partial' | 'failed'; businessDate: string; itemCount: number; warningCodes: string[]; validation: { itemCount: number; missingCount: number } }>;
  refreshCollection(request: { context: SourcingMutationExecutionContext; input: { sources: Array<'naver' | '1688' | 'shorts'> } }): Promise<{ operationRunId: string; status: string }>;
  refreshValidation(request: { context: SourcingMutationExecutionContext; input: { recommendationRunId: string } }): Promise<{ recommendationRunId: string; validationEpisodeIds: string[]; missingEvidence: string[] }>;
  retrieveWorkspaceEvidence(request: { context: Pick<SourcingOwnerExecutionContext, 'organizationId'>; input: { query: string; topK?: number; days?: number } }): Promise<{ inputHash: string; documentCount: number; documents: Array<{ documentId: string; title: string; text: string; sourceScope: 'recommendation_run' | 'interest_targets' | 'validation'; sourceDate: string; sourceSnapshotId: string }>; dataGaps: string[] }>;
  scrapeUrlWorkflow(request: { context: SourcingMutationExecutionContext; input: { sourceUrl: string } }): Promise<{ kind: 'existing'; candidateId: string } | { kind: 'enqueued'; operationRunId: string; status: string }>;
  collectShadowSignals(request: { context: SourcingMutationExecutionContext; input: Record<string, never> }): Promise<{ operationRunId: string; status: string }>;
}
