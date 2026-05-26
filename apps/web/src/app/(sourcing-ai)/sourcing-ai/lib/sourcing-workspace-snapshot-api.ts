import { apiClient } from '@/lib/api-client';

export type SourcingWorkspaceSnapshotScope = 'keyword_analysis' | 'today_recommendations';

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
