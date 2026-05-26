import { apiClient } from '@/lib/api-client';

export type SourcingWorkspaceSnapshotScope = 'keyword_analysis' | 'today_recommendations';

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

export function saveTodaySourcingWorkspaceSnapshot<TPayload>(
  scope: SourcingWorkspaceSnapshotScope,
  payload: TPayload,
): Promise<SourcingWorkspaceSnapshotEnvelope<TPayload>> {
  return apiClient.put<SourcingWorkspaceSnapshotEnvelope<TPayload>>(
    `/api/sourcing/workspace-snapshots/${scope}/today`,
    { payload },
  );
}
