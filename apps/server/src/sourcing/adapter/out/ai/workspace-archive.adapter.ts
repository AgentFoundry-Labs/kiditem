import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  AI_WORKSPACE_ARCHIVE_PORT,
  type AiWorkspaceArchivePort,
} from '../../../../ai/application/port/in/sourcing-workspace-archive.port';
import type {
  ArchiveSourcingWorkspaceInput,
  ArchiveSourcingWorkspaceResult,
  SourcingAiWorkspaceArchivePort,
} from '../../../application/port/out/ai-workspace-archive.port';
import type { SourcingRepositoryTransaction } from '../../../application/port/out/repository-transaction';

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
    return this.aiArchive.archiveSourcingWorkspace(tx as Prisma.TransactionClient, input);
  }
}
