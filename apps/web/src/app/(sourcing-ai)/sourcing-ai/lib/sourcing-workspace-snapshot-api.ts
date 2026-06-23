import { apiClient } from '@/lib/api-client';

export type SourcingWorkspaceSnapshotScope =
  | 'keyword_analysis'
  | 'today_recommendations'
  | 'interest_tracking'
  | '1688_new_products'
  | 'sourcing_agent_rag'
  | 'sourcing_market_model'
  | 'sourcing_1688_new_product_model';

export type SourcingWorkspaceSnapshotGenerationSource = 'manual' | 'scheduled' | 'imported';

export interface SourcingWorkspaceSnapshotMeta {
  generatedAt: string;
  generatedByUserId?: string;
  generationSource: SourcingWorkspaceSnapshotGenerationSource;
  generatorVersion: string;
}

export const SOURCING_WORKSPACE_SNAPSHOT_GENERATOR_VERSION = 'sourcing-workspace-snapshot.v1';

export interface SourcingWorkspaceSnapshot<TPayload = Record<string, unknown>> {
  id: string;
  scope: SourcingWorkspaceSnapshotScope;
  businessDate: string;
  payload: TPayload;
  createdAt: string;
  updatedAt: string;
}

export interface SourcingWorkspaceSnapshotEnvelope<TPayload = Record<string, unknown>> {
  snapshot: SourcingWorkspaceSnapshot<TPayload> | null;
}

export interface SourcingWorkspaceSnapshotListEnvelope<TPayload = Record<string, unknown>> {
  snapshots: SourcingWorkspaceSnapshot<TPayload>[];
}

export function createManualSourcingWorkspaceSnapshotMeta(): SourcingWorkspaceSnapshotMeta {
  return {
    generatedAt: new Date().toISOString(),
    generationSource: 'manual',
    generatorVersion: SOURCING_WORKSPACE_SNAPSHOT_GENERATOR_VERSION,
  };
}

export function getTodaySourcingWorkspaceSnapshot<TPayload>(
  scope: SourcingWorkspaceSnapshotScope,
): Promise<SourcingWorkspaceSnapshotEnvelope<TPayload>> {
  return apiClient.get<SourcingWorkspaceSnapshotEnvelope<TPayload>>(
    `/api/sourcing/workspace-snapshots/${scope}/today`,
  );
}

export function getRecentSourcingWorkspaceSnapshots<TPayload>(
  scope: SourcingWorkspaceSnapshotScope,
  days = 3,
): Promise<SourcingWorkspaceSnapshotListEnvelope<TPayload>> {
  return apiClient.get<SourcingWorkspaceSnapshotListEnvelope<TPayload>>(
    `/api/sourcing/workspace-snapshots/${scope}/recent?days=${encodeURIComponent(String(days))}`,
  );
}

export function saveTodaySourcingWorkspaceSnapshot<TPayload>(
  scope: SourcingWorkspaceSnapshotScope,
  payload: TPayload,
): Promise<SourcingWorkspaceSnapshotEnvelope<TPayload>> {
  return apiClient.put<SourcingWorkspaceSnapshotEnvelope<TPayload>>(
    `/api/sourcing/workspace-snapshots/${scope}/today`,
    { payload },
  );
}
