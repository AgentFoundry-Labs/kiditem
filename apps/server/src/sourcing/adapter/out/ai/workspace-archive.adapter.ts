import { Inject, Injectable } from '@nestjs/common';
import {
  AI_WORKSPACE_ARCHIVE_PORT,
  type AiWorkspaceArchiveScope,
  type AiWorkspaceArchivePort,
} from '../../../../ai/application/port/in/workspace/sourcing-workspace-archive.port';
import type {
  ArchiveSourcingWorkspaceInput,
  ArchiveSourcingWorkspaceResult,
  SourcingAiWorkspaceArchivePort,
} from '../../../application/port/out/cross-domain/ai-workspace-archive.port';
import type { SourcingRepositoryTransaction } from '../../../application/port/out/transaction/repository-transaction';

@Injectable()
export class SourcingAiWorkspaceArchiveAdapter implements SourcingAiWorkspaceArchivePort {
  constructor(
    @Inject(AI_WORKSPACE_ARCHIVE_PORT)
    private readonly aiArchive: AiWorkspaceArchivePort,
  ) {}

  archiveSourcingWorkspace(
    tx: SourcingRepositoryTransaction,
    input: ArchiveSourcingWorkspaceInput,
  ): Promise<ArchiveSourcingWorkspaceResult> {
    return this.aiArchive.archiveSourcingWorkspace(tx as unknown as AiWorkspaceArchiveScope, input);
  }
}
