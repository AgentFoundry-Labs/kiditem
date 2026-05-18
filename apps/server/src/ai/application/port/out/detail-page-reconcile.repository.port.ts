export const DETAIL_PAGE_RECONCILE_REPOSITORY_PORT = Symbol(
  'DETAIL_PAGE_RECONCILE_REPOSITORY_PORT',
);

export interface DetailPageTerminalRequest {
  id: string;
  organizationId: string;
  agentInstanceId: string;
  sourceResourceType: string | null;
  sourceResourceId: string | null;
  source: string | null;
  status: string;
  finishedAt: Date | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
}

export interface DetailPageReconcileRepositoryPort {
  listTerminalRequests(input: {
    organizationId: string;
    since: Date;
    limit: number;
  }): Promise<DetailPageTerminalRequest[]>;
  findContentGenerationStatus(input: {
    organizationId: string;
    contentGenerationId: string;
  }): Promise<{ id: string; status: string } | null>;
}
