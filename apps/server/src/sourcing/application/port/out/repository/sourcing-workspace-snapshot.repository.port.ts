export const SOURCING_WORKSPACE_SNAPSHOT_REPOSITORY_PORT = Symbol('SourcingWorkspaceSnapshotRepositoryPort');

export const SOURCING_WORKSPACE_SNAPSHOT_SCOPES = [
  'keyword_analysis',
  'today_recommendations',
  'interest_tracking',
  '1688_new_products',
  'sourcing_agent_rag',
  'sourcing_market_model',
  'sourcing_1688_new_product_model',
  'coupang_rising_products',
  'market_shadow_signals',
] as const;

export type SourcingWorkspaceSnapshotScope = (typeof SOURCING_WORKSPACE_SNAPSHOT_SCOPES)[number];

export interface SourcingWorkspaceSnapshotRow {
  id: string;
  organizationId: string;
  scope: SourcingWorkspaceSnapshotScope;
  businessDate: Date;
  projectionVersion: string;
  inputHash: string;
  payload: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface SourcingWorkspaceSnapshotRepositoryPort {
  find(input: {
    organizationId: string;
    scope: SourcingWorkspaceSnapshotScope;
    businessDate: Date;
    projectionVersion?: string;
    inputHash?: string;
  }): Promise<SourcingWorkspaceSnapshotRow | null>;

  listRecent(input: {
    organizationId: string;
    scope: SourcingWorkspaceSnapshotScope;
    fromBusinessDate: Date;
    toBusinessDate: Date;
    limit: number;
    projectionVersion?: string;
    inputHash?: string;
  }): Promise<SourcingWorkspaceSnapshotRow[]>;

  upsert(input: {
    organizationId: string;
    scope: SourcingWorkspaceSnapshotScope;
    businessDate: Date;
    projectionVersion?: string;
    inputHash?: string;
    payload: Record<string, unknown>;
  }): Promise<SourcingWorkspaceSnapshotRow>;

  append1688Items(input: {
    organizationId: string;
    businessDate: Date;
    source: string;
    keyword?: string;
    category?: string;
    items: Record<string, unknown>[];
    limit: number;
    generatedAt: Date;
  }): Promise<SourcingWorkspaceSnapshotRow>;
}
