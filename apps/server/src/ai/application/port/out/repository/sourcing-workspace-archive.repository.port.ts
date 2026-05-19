import type {
  AiWorkspaceArchiveScope,
  ArchiveSourcingWorkspaceInput,
  ArchiveSourcingWorkspaceResult,
} from '../../in/workspace/sourcing-workspace-archive.port';

export const SOURCING_WORKSPACE_ARCHIVE_REPOSITORY_PORT = Symbol(
  'SOURCING_WORKSPACE_ARCHIVE_REPOSITORY_PORT',
);

export interface SourcingWorkspaceArchiveRepositoryPort {
  archiveSourcingWorkspace(
    scope: AiWorkspaceArchiveScope,
    input: ArchiveSourcingWorkspaceInput,
  ): Promise<ArchiveSourcingWorkspaceResult>;
}
