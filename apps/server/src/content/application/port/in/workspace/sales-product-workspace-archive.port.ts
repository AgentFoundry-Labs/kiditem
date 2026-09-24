export const AI_WORKSPACE_ARCHIVE_PORT = Symbol('AI_WORKSPACE_ARCHIVE_PORT');

/**
 * Archiving every AI row a sales-product draft owns, inside the caller's own
 * transaction. Channels owns the draft and therefore decides when its content
 * workspace goes away; AI owns what "going away" means for its rows.
 */

export interface AiWorkspaceArchiveScope {
  contentWorkspace: {
    updateMany(args: any): Promise<{ count: number }>;
  };
  detailPage: {
    updateMany(args: any): Promise<{ count: number }>;
  };
  contentAsset: {
    updateMany(args: any): Promise<{ count: number }>;
  };
  thumbnailGeneration: {
    updateMany(args: any): Promise<{ count: number }>;
  };
}

export interface ArchiveSalesProductWorkspaceInput {
  organizationId: string;
  salesProductId: string;
  archivedAt: Date;
}

export interface ArchiveSalesProductWorkspaceResult {
  archivedDetailPages: number;
  archivedContentAssets: number;
  archivedThumbnailGenerations: number;
}

export interface AiWorkspaceArchivePort {
  archiveSalesProductWorkspace(
    scope: AiWorkspaceArchiveScope,
    input: ArchiveSalesProductWorkspaceInput,
  ): Promise<ArchiveSalesProductWorkspaceResult>;
}
