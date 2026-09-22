import type { SourcingRepositoryTransaction } from '../transaction/repository-transaction';

export const SOURCING_AI_WORKSPACE_ARCHIVE_PORT = Symbol('SOURCING_AI_WORKSPACE_ARCHIVE_PORT');

export interface ArchiveSalesProductWorkspaceInput {
  organizationId: string;
  sourceCandidateId: string;
  archivedAt: Date;
}

export interface ArchiveSalesProductWorkspaceResult {
  archivedContentGenerations: number;
  archivedDetailPageArtifacts: number;
  archivedContentAssets: number;
  archivedThumbnailGenerations: number;
}

export interface SourcingAiWorkspaceArchivePort {
  archiveSalesProductWorkspace(
    tx: SourcingRepositoryTransaction,
    input: ArchiveSalesProductWorkspaceInput,
  ): Promise<ArchiveSalesProductWorkspaceResult>;
}
