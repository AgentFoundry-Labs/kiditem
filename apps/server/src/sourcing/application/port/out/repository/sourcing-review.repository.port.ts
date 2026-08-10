export const SOURCING_REVIEW_REPOSITORY_PORT = Symbol(
  'SourcingReviewRepositoryPort',
);

export interface SourcingReviewSelectionRecord {
  id: string;
  organizationId: string;
  recommendationRunId: string;
  workspaceKey: 'entry' | 'final';
  itemKey: string;
  state: 'neutral' | 'selected' | 'removed';
  version: number;
  updatedAt: Date;
}

export interface SaveReviewSelectionCommand {
  organizationId: string;
  recommendationRunId: string;
  workspaceKey: 'entry' | 'final';
  itemKey: string;
  state: 'neutral' | 'selected' | 'removed';
  expectedVersion: number;
}

export interface SourcingReviewBatchRecord {
  id: string;
  organizationId: string;
  recommendationRunId: string;
  requestedByUserId: string;
  status: 'awaiting_procurement_enablement' | 'cancelled';
  itemCount: number;
  createdAt: Date;
}

export interface CreateReviewBatchCommand {
  organizationId: string;
  requestedByUserId: string;
  recommendationRunId: string;
  itemKeys: string[];
  idempotencyKey: string;
  requestHash: string;
}

export type SaveReviewSelectionResult =
  | { kind: 'saved'; selection: SourcingReviewSelectionRecord }
  | { kind: 'version_conflict'; currentVersion: number };

export type CreateReviewBatchResult =
  | { kind: 'created'; batch: SourcingReviewBatchRecord }
  | { kind: 'existing'; batch: SourcingReviewBatchRecord }
  | { kind: 'idempotency_conflict' }
  | { kind: 'invalid_items'; itemKeys: string[] };

export interface SourcingReviewRepositoryPort {
  listSelections(input: {
    organizationId: string;
    workspaceKey: 'entry' | 'final';
    recommendationRunId: string;
  }): Promise<SourcingReviewSelectionRecord[]>;
  saveSelection(command: SaveReviewSelectionCommand): Promise<SaveReviewSelectionResult>;
  createBatch(command: CreateReviewBatchCommand): Promise<CreateReviewBatchResult>;
  findBatch(input: {
    organizationId: string;
    id: string;
  }): Promise<SourcingReviewBatchRecord | null>;
}
