import type { Prisma } from '@prisma/client';

export const AI_WORKSPACE_ARCHIVE_PORT = Symbol('AI_WORKSPACE_ARCHIVE_PORT');

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
    tx: Prisma.TransactionClient,
    input: ArchiveSourcingWorkspaceInput,
  ): Promise<ArchiveSourcingWorkspaceResult>;
}
