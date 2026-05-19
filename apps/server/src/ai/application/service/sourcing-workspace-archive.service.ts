import { Inject, Injectable } from '@nestjs/common';
import type {
  AiWorkspaceArchivePort,
  AiWorkspaceArchiveScope,
  ArchiveSourcingWorkspaceInput,
  ArchiveSourcingWorkspaceResult,
} from '../port/in/workspace/sourcing-workspace-archive.port';
import {
  SOURCING_WORKSPACE_ARCHIVE_REPOSITORY_PORT,
  type SourcingWorkspaceArchiveRepositoryPort,
} from '../port/out/repository/sourcing-workspace-archive.repository.port';

@Injectable()
export class SourcingWorkspaceArchiveService implements AiWorkspaceArchivePort {
  constructor(
    @Inject(SOURCING_WORKSPACE_ARCHIVE_REPOSITORY_PORT)
    private readonly repository: SourcingWorkspaceArchiveRepositoryPort,
  ) {}

  archiveSourcingWorkspace(
    scope: AiWorkspaceArchiveScope,
    input: ArchiveSourcingWorkspaceInput,
  ): Promise<ArchiveSourcingWorkspaceResult> {
    return this.repository.archiveSourcingWorkspace(scope, input);
  }
}
