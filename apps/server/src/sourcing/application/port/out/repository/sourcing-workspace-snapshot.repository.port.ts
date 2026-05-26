export const SOURCING_WORKSPACE_SNAPSHOT_REPOSITORY_PORT = Symbol('SourcingWorkspaceSnapshotRepositoryPort');

export const SOURCING_WORKSPACE_SNAPSHOT_SCOPES = [
  'keyword_analysis',
  'today_recommendations',
] as const;

export type SourcingWorkspaceSnapshotScope = (typeof SOURCING_WORKSPACE_SNAPSHOT_SCOPES)[number];

export interface SourcingWorkspaceSnapshotRow {
  id: string;
  organizationId: string;
  scope: SourcingWorkspaceSnapshotScope;
  businessDate: Date;
  payload: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface SourcingWorkspaceSnapshotRepositoryPort {
  find(input: {
    organizationId: string;
    scope: SourcingWorkspaceSnapshotScope;
    businessDate: Date;
  }): Promise<SourcingWorkspaceSnapshotRow | null>;

  upsert(input: {
    organizationId: string;
    scope: SourcingWorkspaceSnapshotScope;
    businessDate: Date;
    payload: Record<string, unknown>;
  }): Promise<SourcingWorkspaceSnapshotRow>;
}
