import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  SaveEditorResultInput,
  ThumbnailGenerationLedgerRepositoryPort,
  ThumbnailGenerationLedgerRow,
} from '../../../application/port/out/repository/thumbnail-generation-ledger.repository.port';
import {
  AI_DIRECT_JOB_REPOSITORY_PORT,
  type AiDirectJobRepositoryPort,
} from '../../../application/port/out/repository/ai-direct-job.repository.port';
import {
  findActiveJobForWorkspace,
  findAutoBatchCandidates,
  findGenerationWorkspace,
  findGenerationWorkspaces,
  findGenerationOrThrow,
  findGenerationRows,
  findGenerationWithCandidatesOrThrow,
  findGenerationWithInputImages,
  findWorkspaceForThumbnailJob,
  findWorkspacesForThumbnailJobs,
  findWorkspaceForThumbnailEditor,
  findRecentAutoJob,
  findThumbnailAnalysisGrade,
} from './thumbnail-generation-ledger.query';
import {
  applyDirectSuccessResult,
  applyGenerationToWorkspace,
  cancelDirectGeneration,
  clearReadySelections,
  createPendingCandidateJob,
  createPendingEditJob,
  createPendingStandaloneJob,
  deleteGeneration,
  lockGenerationForProcessing,
  markGenerationFailed,
  persistPendingInputImages,
  removeCandidate,
  replaceGenerationResult,
  resetGenerationForReEdit,
  saveEditorResult,
  setSelectedCandidate,
} from './thumbnail-generation-ledger.persistence';

@Injectable()
export class ThumbnailGenerationLedgerRepositoryAdapter implements ThumbnailGenerationLedgerRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(AI_DIRECT_JOB_REPOSITORY_PORT)
    private readonly directJobs: AiDirectJobRepositoryPort,
  ) {}

  findWorkspaceForThumbnailEditor(contentWorkspaceId: string, organizationId: string) {
    return findWorkspaceForThumbnailEditor(this.prisma, contentWorkspaceId, organizationId);
  }

  async findGenerationRows(
    organizationId: string,
    opts: Parameters<ThumbnailGenerationLedgerRepositoryPort['findGenerationRows']>[1] = {},
  ) {
    return findGenerationRows(this.prisma, organizationId, opts);
  }

  async findGenerationOrThrow(id: string, organizationId: string) {
    return findGenerationOrThrow(this.prisma, id, organizationId);
  }

  async findGenerationWithCandidatesOrThrow(id: string, organizationId: string) {
    return findGenerationWithCandidatesOrThrow(this.prisma, id, organizationId) as Promise<
      Awaited<ReturnType<ThumbnailGenerationLedgerRepositoryPort['findGenerationWithCandidatesOrThrow']>>
    >;
  }

  async findGenerationWithInputImages(id: string, organizationId: string) {
    return findGenerationWithInputImages(this.prisma, id, organizationId) as Promise<
      Awaited<ReturnType<ThumbnailGenerationLedgerRepositoryPort['findGenerationWithInputImages']>>
    >;
  }

  async findGenerationWorkspaces(rows: Array<{ contentWorkspaceId: string | null }>, organizationId: string) {
    return findGenerationWorkspaces(this.prisma, rows, organizationId);
  }

  findGenerationWorkspace(contentWorkspaceId: string | null, organizationId: string) {
    return findGenerationWorkspace(this.prisma, contentWorkspaceId, organizationId);
  }

  async findWorkspaceForThumbnailJob(contentWorkspaceId: string, organizationId: string) {
    return findWorkspaceForThumbnailJob(this.prisma, contentWorkspaceId, organizationId) as Promise<
      Awaited<ReturnType<ThumbnailGenerationLedgerRepositoryPort['findWorkspaceForThumbnailJob']>>
    >;
  }

  async findSourceCandidateForJob(sourceCandidateId: string, organizationId: string) {
    return this.prisma.sourcingCandidate.findFirst({
      where: {
        id: sourceCandidateId,
        organizationId,
        isDeleted: false,
      },
      select: {
        id: true,
        name: true,
        category: true,
        images: {
          where: { isDeleted: false },
          select: { id: true, url: true, storageKey: true },
        },
      },
    });
  }

  async findWorkspacesForThumbnailJobs(ids: string[], organizationId: string) {
    return findWorkspacesForThumbnailJobs(this.prisma, ids, organizationId) as Promise<
      Awaited<ReturnType<ThumbnailGenerationLedgerRepositoryPort['findWorkspacesForThumbnailJobs']>>
    >;
  }

  async findActiveJobForWorkspace(contentWorkspaceId: string, organizationId: string, method: string) {
    return findActiveJobForWorkspace(this.prisma, contentWorkspaceId, organizationId, method);
  }

  findRecentAutoJob(contentWorkspaceId: string, organizationId: string, cooldownStart: Date) {
    return findRecentAutoJob(this.prisma, contentWorkspaceId, organizationId, cooldownStart);
  }

  findAutoBatchCandidates(organizationId: string, take: number) {
    return findAutoBatchCandidates(this.prisma, organizationId, take);
  }

  findThumbnailAnalysisGrade(contentWorkspaceId: string, organizationId: string) {
    return findThumbnailAnalysisGrade(this.prisma, contentWorkspaceId, organizationId);
  }

  saveEditorResult(input: SaveEditorResultInput) {
    return saveEditorResult(this.prisma, {
      ...input,
      inputMeta: input.inputMeta as Prisma.InputJsonValue | null | undefined,
    });
  }

  async openPendingDirectGeneration(
    input: Parameters<ThumbnailGenerationLedgerRepositoryPort['openPendingDirectGeneration']>[0],
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await this.findExistingProductGenerationLedger(tx, input);
        if (existing) return existing;

        const common = {
          id: input.productGenerationIdentity?.generationId,
          organizationId: input.organizationId,
          originalUrl: input.originalUrl,
          method: input.method,
          inputMeta: input.inputMeta as Prisma.InputJsonValue,
          triggeredByUserId: input.triggeredByUserId,
        };
        const generation =
          input.subject === 'editor'
            ? await createPendingEditJob(tx, {
                ...common,
                contentWorkspaceId: input.contentWorkspaceId,
                editAnalysis: input.editAnalysis,
              })
            : input.subject === 'candidate'
              ? await createPendingCandidateJob(tx, {
                  ...common,
                  sourceCandidateId: input.sourceCandidateId,
                  contentWorkspaceId: input.contentWorkspaceId,
                })
              : await createPendingStandaloneJob(tx, {
                  ...common,
                  contentWorkspaceId: input.contentWorkspaceId,
                });

        await persistPendingInputImages(tx, {
          generationId: generation.id,
          organizationId: input.organizationId,
          inputImages: input.inputImages,
        });
        const directJob = await this.directJobs.createInScope(tx, {
          ...input.directJob,
          organizationId: input.organizationId,
          sourceResourceId: generation.id,
        });
        return {
          status: 'created' as const,
          generationId: generation.id,
          directJobId: directJob.id,
          releaseRequired: true,
        };
      });
    } catch (error) {
      if (!input.productGenerationIdentity || !isUniqueConstraint(error)) throw error;
      // P2002 aborts the failed transaction. Re-read the winner through a
      // fresh Prisma scope so only the durable child identity becomes replay.
      const winner = await this.findExistingProductGenerationLedger(this.prisma, input);
      if (winner) return winner;
      throw error;
    }
  }

  private async findExistingProductGenerationLedger(
    scope: Prisma.TransactionClient | PrismaService,
    input: Parameters<ThumbnailGenerationLedgerRepositoryPort['openPendingDirectGeneration']>[0],
  ): Promise<{
    status: 'created' | 'existing';
    generationId: string;
    directJobId: string;
    releaseRequired: boolean;
  } | null> {
    if (!input.productGenerationIdentity) return null;
    const existing = await scope.thumbnailGeneration.findFirst({
      where: {
        id: input.productGenerationIdentity.generationId,
        organizationId: input.organizationId,
      },
      select: { id: true, isDeleted: true, inputMeta: true },
    });
    if (!existing) return null;
    if (
      existing.isDeleted ||
      readProductGenerationRequestHash(existing.inputMeta) !==
        input.productGenerationIdentity.requestHash
    ) {
      throw new ConflictException('product_generation_idempotency_conflict');
    }
    const directJob = await scope.aiDirectJob.findFirst({
      where: {
        organizationId: input.organizationId,
        jobType: 'thumbnail_generate',
        sourceResourceId: existing.id,
      },
      select: { id: true, status: true },
    });
    if (!directJob) {
      throw new Error(`Missing thumbnail AI direct job for ${existing.id}.`);
    }
    return {
      status: 'existing',
      generationId: existing.id,
      directJobId: directJob.id,
      releaseRequired: directJob.status === 'held',
    };
  }

  async openPendingEditorJob(input: Parameters<ThumbnailGenerationLedgerRepositoryPort['openPendingEditorJob']>[0]) {
    return createPendingEditJob(this.prisma, {
      ...input,
      inputMeta: input.inputMeta as Prisma.InputJsonValue,
    });
  }

  openPendingCandidateJob(input: Parameters<ThumbnailGenerationLedgerRepositoryPort['openPendingCandidateJob']>[0]) {
    return createPendingCandidateJob(this.prisma, {
      ...input,
      inputMeta: input.inputMeta as Prisma.InputJsonValue,
    });
  }

  openPendingStandaloneJob(input: Parameters<ThumbnailGenerationLedgerRepositoryPort['openPendingStandaloneJob']>[0]) {
    return createPendingStandaloneJob(this.prisma, {
      ...input,
      inputMeta: input.inputMeta as Prisma.InputJsonValue,
    });
  }

  persistPendingInputImages(
    input: Parameters<ThumbnailGenerationLedgerRepositoryPort['persistPendingInputImages']>[0],
  ) {
    return persistPendingInputImages(this.prisma, input);
  }

  setSelectedCandidate(id: string, organizationId: string, selectedUrl: string | null) {
    return setSelectedCandidate(this.prisma, id, organizationId, selectedUrl);
  }

  clearReadySelections(organizationId: string) {
    return clearReadySelections(this.prisma, organizationId);
  }

  applyGenerationToWorkspace(
    input: Parameters<ThumbnailGenerationLedgerRepositoryPort['applyGenerationToWorkspace']>[0],
  ) {
    return applyGenerationToWorkspace(this.prisma, input);
  }

  cancelDirectGeneration(
    input: Parameters<ThumbnailGenerationLedgerRepositoryPort['cancelDirectGeneration']>[0],
  ) {
    return cancelDirectGeneration(this.prisma, input);
  }

  deleteGeneration(id: string, organizationId: string) {
    return deleteGeneration(this.prisma, id, organizationId);
  }

  removeCandidate(input: Parameters<ThumbnailGenerationLedgerRepositoryPort['removeCandidate']>[0]) {
    return removeCandidate(this.prisma, input);
  }

  resetGenerationForReEdit(input: Parameters<ThumbnailGenerationLedgerRepositoryPort['resetGenerationForReEdit']>[0]) {
    return resetGenerationForReEdit(this.prisma, input);
  }

  replaceLegacyEditResult(input: Parameters<ThumbnailGenerationLedgerRepositoryPort['replaceLegacyEditResult']>[0]) {
    return replaceGenerationResult(this.prisma, {
      ...input,
      inputMeta: input.inputMeta as Prisma.InputJsonValue,
    });
  }

  markGenerationFailed(id: string, organizationId: string, message: string) {
    return markGenerationFailed(this.prisma, id, organizationId, message);
  }

  claimForDirectProjection(input: Parameters<ThumbnailGenerationLedgerRepositoryPort['claimForDirectProjection']>[0]) {
    return lockGenerationForProcessing(this.prisma, input.generationId, input.organizationId);
  }

  projectDirectSuccess(input: Parameters<ThumbnailGenerationLedgerRepositoryPort['projectDirectSuccess']>[0]) {
    return applyDirectSuccessResult(this.prisma, {
      ...input,
      inputMeta: input.inputMeta as Prisma.InputJsonValue,
    });
  }

  projectDirectFailure(input: Parameters<ThumbnailGenerationLedgerRepositoryPort['projectDirectFailure']>[0]) {
    return markGenerationFailed(this.prisma, input.generationId, input.organizationId, input.errorMessage);
  }

  async findGenerationProjectionStatus(
    input: Parameters<ThumbnailGenerationLedgerRepositoryPort['findGenerationProjectionStatus']>[0],
  ) {
    return this.prisma.thumbnailGeneration.findFirst({
      where: {
        id: input.generationId,
        organizationId: input.organizationId,
        isDeleted: false,
      },
      select: {
        id: true,
        status: true,
        phase: true,
        inputMeta: true,
        errorMessage: true,
      },
    });
  }

  async findRecentlyTerminalGenerations(
    input: Parameters<ThumbnailGenerationLedgerRepositoryPort['findRecentlyTerminalGenerations']>[0],
  ) {
    return this.prisma.thumbnailGeneration.findMany({
      where: {
        organizationId: input.organizationId,
        isDeleted: false,
        status: { notIn: ['pending', 'running'] },
        updatedAt: { gte: input.since },
      },
      select: { id: true, status: true, errorMessage: true },
      orderBy: { updatedAt: 'desc' },
      take: input.limit,
    });
  }

  async findStaleNonTerminalGenerations(
    input: Parameters<ThumbnailGenerationLedgerRepositoryPort['findStaleNonTerminalGenerations']>[0],
  ) {
    return this.prisma.thumbnailGeneration.findMany({
      where: {
        organizationId: input.organizationId,
        isDeleted: false,
        status: { in: ['pending', 'running'] },
        updatedAt: { lt: input.staleBefore },
      },
      select: { id: true },
      orderBy: { updatedAt: 'asc' },
      take: input.limit,
    });
  }

}

function readProductGenerationRequestHash(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const requestHash = (value as Record<string, unknown>).productGenerationRequestHash;
  return typeof requestHash === 'string' ? requestHash : null;
}

function isUniqueConstraint(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    (error as { code?: unknown }).code === 'P2002',
  );
}

type _LedgerRow = ThumbnailGenerationLedgerRow;
