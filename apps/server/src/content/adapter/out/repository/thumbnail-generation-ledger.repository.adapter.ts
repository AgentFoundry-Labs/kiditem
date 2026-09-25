import { CHANNEL_LISTING_QUERY_PORT, type ChannelListingQueryPort } from '../../../../channels/application/port/in/listing/channel-listing-query.port';
import { CHANNEL_OPTION_RECIPE_PORT, type ChannelOptionRecipePort } from '../../../../channels/application/port/in/channel-option-recipe.port';
import { Inject, Injectable } from '@nestjs/common';
import { KiditemConflictError } from '@kiditem/shared/errors';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  ThumbnailGenerationLedgerRepositoryPort,
} from '../../../application/port/out/repository/thumbnail-generation-ledger.repository.port';
import {
  AI_DIRECT_JOB_OPERATIONS_PORT,
  type AiDirectJobOperationsPort,
} from '../../../application/port/out/runtime/ai-direct-job-operations.port';
import { ownerTransaction, ownerTransactionClient } from '../../../../prisma/owner-transaction';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import {
  findActiveJobForWorkspace,
  findAutoBatchCandidates,
  findGenerationWorkspaces,
  findGenerationOrThrow,
  findGenerationRows,
  findWorkspaceForThumbnailJob,
  findWorkspacesForThumbnailJobs,
  findWorkspaceForThumbnailEditor,
  findRecentAutoJob,
} from './thumbnail-generation-ledger.query';
import {
  cancelDirectGeneration,
  completeWithCandidates,
  createPendingJob,
  createStandaloneWorkspace,
  deleteGeneration,
  ensureSalesProductWorkspace,
  jobInputMeta,
  lockGenerationForProcessing,
  markGenerationFailed,
  removeCandidate,
  resetGenerationForReEdit,
} from './thumbnail-generation-ledger.persistence';
import { withThumbnailJobInputs, readThumbnailJobInputs } from '../../../domain/thumbnail/thumbnail-job-input-meta';

@Injectable()
export class ThumbnailGenerationLedgerRepositoryAdapter implements ThumbnailGenerationLedgerRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(AI_DIRECT_JOB_OPERATIONS_PORT)
    private readonly directJobs: AiDirectJobOperationsPort,
    @Inject(CHANNEL_LISTING_QUERY_PORT) private readonly listings: ChannelListingQueryPort,
    @Inject(CHANNEL_OPTION_RECIPE_PORT) private readonly recipes: ChannelOptionRecipePort,
  ) {}

  findWorkspaceForThumbnailEditor(contentWorkspaceId: string, organizationId: string) {
    return findWorkspaceForThumbnailEditor(this.prisma, contentWorkspaceId, organizationId, this.listings);
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

  async findGenerationWorkspaces(rows: Array<{ contentWorkspaceId: string | null; inputMeta?: unknown }>, organizationId: string) {
    return findGenerationWorkspaces(this.prisma, rows, organizationId, this.listings);
  }

  async findWorkspaceForThumbnailJob(contentWorkspaceId: string, organizationId: string) {
    return findWorkspaceForThumbnailJob(this.prisma, contentWorkspaceId, organizationId, this.listings) as Promise<
      Awaited<ReturnType<ThumbnailGenerationLedgerRepositoryPort['findWorkspaceForThumbnailJob']>>
    >;
  }

  async findWorkspacesForThumbnailJobs(ids: string[], organizationId: string) {
    return findWorkspacesForThumbnailJobs(this.prisma, ids, organizationId, this.listings) as Promise<
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
    return findAutoBatchCandidates(this.prisma, organizationId, take, this.listings, this.recipes);
  }

  async openPendingDirectGeneration(
    input: Parameters<ThumbnailGenerationLedgerRepositoryPort['openPendingDirectGeneration']>[0],
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await this.findExistingProductGenerationLedger(tx, input);
        if (existing) return existing;

        const contentWorkspaceId =
          input.subject === 'editor'
            ? input.contentWorkspaceId
            : input.contentWorkspaceId
              ?? (input.subject === 'sales_product'
                ? await ensureSalesProductWorkspace(tx, {
                    organizationId: input.organizationId,
                    salesProductId: input.salesProductId,
                  })
                : await createStandaloneWorkspace(tx, input.organizationId));
        const generation = await createPendingJob(tx, {
          id: input.productGenerationIdentity?.generationId,
          organizationId: input.organizationId,
          contentWorkspaceId,
          method: input.method,
          inputMeta: jobInputMeta({
            inputMeta: input.inputMeta,
            originalUrl: input.originalUrl,
            inputImages: input.inputImages,
          }),
          triggeredByUserId: input.triggeredByUserId,
        });

        await this.directJobs.prepare(ownerTransaction(tx), {
          ...input.directJob,
          organizationId: input.organizationId,
          sourceResourceId: generation.id,
        });
        return { status: 'created' as const, generationId: generation.id };
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
  ): Promise<{ status: 'created' | 'existing'; generationId: string } | null> {
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
      throw new KiditemConflictError('STATE_CONFLICT', { details: { reason: 'PRODUCT_GENERATION_IDEMPOTENCY_CONFLICT' } });
    }
    // 먼저 커밋한 요청이 같은 트랜잭션에서 job도 prepare했다.
    return { status: 'existing', generationId: existing.id };
  }

  openPendingEditorJob(input: Parameters<ThumbnailGenerationLedgerRepositoryPort['openPendingEditorJob']>[0]) {
    return createPendingJob(this.prisma, {
      organizationId: input.organizationId,
      contentWorkspaceId: input.contentWorkspaceId,
      method: input.method,
      inputMeta: jobInputMeta({
        inputMeta: input.inputMeta,
        originalUrl: input.originalUrl,
        inputImages: input.originalUrl
          ? [{ url: input.originalUrl, storageKey: null, role: 'product', label: 'Product photo', sortOrder: 0, source: 'workspace_image' }]
          : [],
      }),
      triggeredByUserId: input.triggeredByUserId,
    });
  }

  restartReeditJob(input: Parameters<ThumbnailGenerationLedgerRepositoryPort['restartReeditJob']>[0]) {
    return this.prisma.$transaction(async (client) => {
      const tx = ownerTransaction(client);
      await this.directJobs.cancelLive(tx, {
        organizationId: input.organizationId,
        sourceResourceId: input.generationId,
        jobTypes: ['thumbnail_reedit'],
      });
      return this.directJobs.prepare(tx, {
        ...input.directJob,
        organizationId: input.organizationId,
        sourceResourceId: input.generationId,
      });
    });
  }

  cancelDirectGeneration(
    input: Parameters<ThumbnailGenerationLedgerRepositoryPort['cancelDirectGeneration']>[0],
  ) {
    return cancelDirectGeneration(this.prisma, input, {
      lock: (tx) => this.directJobs.lockLive(ownerTransaction(tx), {
        organizationId: input.organizationId,
        sourceResourceId: input.generationId,
        jobTypes: ['thumbnail_generate', 'thumbnail_reedit'],
      }),
      cancel: (tx, jobIds) => this.directJobs.cancelJobs(ownerTransaction(tx), input.organizationId, jobIds),
    });
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
    return completeWithCandidates(this.prisma, {
      generationId: input.generationId,
      organizationId: input.organizationId,
      candidates: input.candidates,
      // 재편집 결과는 요청 필드를 바꾸되 입력 사진 · 원본은 이전 job 입력을 그대로 둔다.
      inputMeta: (current) => withThumbnailJobInputs(input.inputMeta, readThumbnailJobInputs(current)) as Prisma.InputJsonValue,
    });
  }

  markGenerationFailed(id: string, organizationId: string, message: string) {
    return markGenerationFailed(this.prisma, id, organizationId, message);
  }

  claimForDirectProjection(input: Parameters<ThumbnailGenerationLedgerRepositoryPort['claimForDirectProjection']>[0]) {
    return lockGenerationForProcessing(this.scope(input.transaction), input.generationId, input.organizationId);
  }

  projectDirectSuccess(input: Parameters<ThumbnailGenerationLedgerRepositoryPort['projectDirectSuccess']>[0]) {
    return completeWithCandidates(this.scope(input.transaction), {
      generationId: input.generationId,
      organizationId: input.organizationId,
      candidates: input.candidates,
      // 요청 때 적은 입력(상품 생성 요청 해시 · 입력 사진)은 남기고 실행 정보만 더한다.
      inputMeta: (current) => ({
        ...(current && typeof current === 'object' && !Array.isArray(current) ? current as Record<string, unknown> : {}),
        ...input.projection,
      }) as Prisma.InputJsonValue,
    });
  }

  projectDirectFailure(input: Parameters<ThumbnailGenerationLedgerRepositoryPort['projectDirectFailure']>[0]) {
    return markGenerationFailed(this.scope(input.transaction), input.generationId, input.organizationId, input.errorMessage);
  }

  /** 실행 finish 트랜잭션이 있으면 그 안에서 쓴다. */
  private scope(transaction: OwnerTransaction | undefined) {
    return transaction ? ownerTransactionClient(transaction) : this.prisma;
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
