export const AI_WORKSPACE_ARCHIVE_PORT = Symbol('AI_WORKSPACE_ARCHIVE_PORT');

export interface AiWorkspaceArchiveScope {
  contentGeneration: {
    findMany(args: any): Promise<Array<{ id: string }>>;
    updateMany(args: any): Promise<{ count: number }>;
  };
  detailPageArtifact: {
    updateMany(args: any): Promise<{ count: number }>;
  };
  contentAsset: {
    updateMany(args: any): Promise<{ count: number }>;
  };
  thumbnailGeneration: {
    updateMany(args: any): Promise<{ count: number }>;
  };
}

export interface ArchiveSourcingWorkspaceInput {
  organizationId: string;
  sourceCandidateId: string;
  archivedAt: Date;
}

export interface ArchiveSourcingWorkspaceResult {
  archivedContentGenerations: number;
  archivedDetailPageArtifacts: number;
  archivedContentAssets: number;
  archivedThumbnailGenerations: number;
}

export interface AiWorkspaceArchivePort {
  archiveSourcingWorkspace(
    scope: AiWorkspaceArchiveScope,
    input: ArchiveSourcingWorkspaceInput,
  ): Promise<ArchiveSourcingWorkspaceResult>;
}
