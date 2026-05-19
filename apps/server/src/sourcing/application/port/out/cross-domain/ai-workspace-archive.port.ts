import type { SourcingRepositoryTransaction } from '../transaction/repository-transaction';

export const SOURCING_AI_WORKSPACE_ARCHIVE_PORT = Symbol('SOURCING_AI_WORKSPACE_ARCHIVE_PORT');

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

export interface SourcingAiWorkspaceArchivePort {
  archiveSourcingWorkspace(
    tx: SourcingRepositoryTransaction,
    input: ArchiveSourcingWorkspaceInput,
  ): Promise<ArchiveSourcingWorkspaceResult>;
}
