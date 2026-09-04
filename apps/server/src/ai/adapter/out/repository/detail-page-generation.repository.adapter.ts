import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  CONTENT_ASSET_LIBRARY_REPOSITORY_PORT,
  type ContentAssetLibraryRepositoryPort,
} from '../../../application/port/out/repository/content-asset-library.repository.port';
import {
  AI_DIRECT_JOB_REPOSITORY_PORT,
  type AiDirectJobRepositoryPort,
} from '../../../application/port/out/repository/ai-direct-job.repository.port';
import type { Prisma } from '@prisma/client';
import type {
  DetailPageCancellableGenerationSnapshot,
  DetailPageContentWorkspaceSnapshot,
  DetailPageGenerationRepositoryPort,
  DetailPageImageOnlyBaseCandidateSnapshot,
  DetailPageRerunBaseSnapshot,
} from '../../../application/port/out/repository/detail-page-generation.repository.port';
import type { DetailPageGenerationSnapshot } from '../../../application/port/out/repository/detail-page-query.repository.port';

const detailPageGenerationInclude = {
  generationGroup: {
    select: {
      id: true,
      contentWorkspaceId: true,
    },
  },
} satisfies Prisma.ContentGenerationInclude;

const DETAIL_PAGE_ACTIVE_STATUSES = [
  'PENDING',
  'PROCESSING',
  'generating',
  'pending',
  'processing',
];
const DETAIL_PAGE_PRESERVED_STATUSES = new Set(['READY', 'completed']);

@Injectable()
export class DetailPageGenerationRepositoryAdapter implements DetailPageGenerationRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONTENT_ASSET_LIBRARY_REPOSITORY_PORT)
    private readonly contentAssets: ContentAssetLibraryRepositoryPort,
    @Inject(AI_DIRECT_JOB_REPOSITORY_PORT)
    private readonly directJobs: AiDirectJobRepositoryPort,
  ) {}

  async findActiveContentWorkspace(input: {
    organizationId: string;
    contentWorkspaceId: string;
  }): Promise<DetailPageContentWorkspaceSnapshot | null> {
    return this.prisma.contentWorkspace.findFirst({
      where: {
        id: input.contentWorkspaceId,
        organizationId: input.organizationId,
        status: 'active',
        isDeleted: false,
      },
      select: {
        id: true,
        sourceCandidateId: true,
        displayName: true,
        normalizedTitle: true,
      },
    });
  }

  private async createInputGenerationGroup(scope: Prisma.TransactionClient, input: {
    organizationId: string;
    contentWorkspaceId: string;
    triggeredByUserId: string | null;
    rawTitle: string;
    templateId: Parameters<DetailPageGenerationRepositoryPort['openProcessingGenerationLedger']>[0]['templateId'];
  }): Promise<string> {
    const group = await scope.contentGenerationGroup.create({
      data: {
        organizationId: input.organizationId,
        contentWorkspaceId: input.contentWorkspaceId,
        groupType: 'input_variation',
        title: input.rawTitle.slice(0, 80),
        createdByUserId: input.triggeredByUserId,
        metadata: {
          source: 'detail_page_generation',
          templateId: input.templateId,
        },
      },
      select: { id: true },
    });
    return group.id;
  }

  async ensureRerunGenerationGroup(input: {
    organizationId: string;
    baseGenerationId: string;
    existingGroupId: string | null;
    contentWorkspaceId: string;
    title: string;
    triggeredByUserId: string | null;
  }): Promise<string> {
    if (input.existingGroupId) return input.existingGroupId;
    const group = await this.prisma.contentGenerationGroup.create({
      data: {
        organizationId: input.organizationId,
        contentWorkspaceId: input.contentWorkspaceId,
        groupType: 'input_variation',
        baseContentGenerationId: input.baseGenerationId,
        title: input.title.slice(0, 80),
        createdByUserId: input.triggeredByUserId,
        metadata: { source: 'same_input_rerun' },
      },
      select: { id: true },
    });
    await this.prisma.contentGeneration.updateMany({
      where: { id: input.baseGenerationId, organizationId: input.organizationId },
      data: { generationGroupId: group.id },
    });
    return group.id;
  }

  async openProcessingGenerationLedger(
    input: Parameters<DetailPageGenerationRepositoryPort['openProcessingGenerationLedger']>[0],
  ): ReturnType<DetailPageGenerationRepositoryPort['openProcessingGenerationLedger']> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await this.findExistingProductGenerationLedger(tx, input);
        if (existing) return existing;

        const generationGroupId = input.generationGroupId ??
          await this.createInputGenerationGroup(tx, {
            organizationId: input.organizationId,
            contentWorkspaceId: input.contentWorkspaceId,
            triggeredByUserId: input.triggeredByUserId,
            rawTitle: input.rawTitle,
            templateId: input.templateId,
          });
        const row = await tx.contentGeneration.create({
          data: {
            id: input.productGenerationIdentity?.generationId,
            organizationId: input.organizationId,
            contentType: 'detail_page',
            generationGroupId,
            contentWorkspaceId: input.contentWorkspaceId,
            sourceCandidateId: input.sourceCandidateId,
            triggeredByUserId: input.triggeredByUserId,
            templateId: input.templateId,
            generationInput: input.rawInput as unknown as Prisma.InputJsonValue,
            generationResult: {
              templateId: input.templateId,
              result: {},
              imageUrls: input.imageUrls,
              processedImages: {},
            },
            generatedTitle: input.rawTitle.slice(0, 80),
            status: 'PROCESSING',
          },
          include: detailPageGenerationInclude,
        });
        const inputAssets = await this.contentAssets.recordDetailPageInputAssetsInScope(tx, {
          organizationId: input.organizationId,
          generationGroupId,
          createdByUserId: input.triggeredByUserId,
          imageUrls: input.imageUrls,
        });
        await this.recordGenerationSources(tx, {
          organizationId: input.organizationId,
          contentGenerationId: row.id,
          sourceReferences: input.sourceReferences,
          inputAssets,
        });
        const directJob = await this.directJobs.createInScope(tx, {
          ...input.directJob,
          organizationId: input.organizationId,
          sourceResourceId: row.id,
        });
        return {
          status: 'created' as const,
          row: row as DetailPageGenerationSnapshot,
          directJobId: directJob.id,
          releaseRequired: true,
        };
      });
    } catch (error) {
      if (!input.productGenerationIdentity || !isUniqueConstraint(error)) throw error;
      // P2002 aborts the failed transaction. Read the committed deterministic
      // child through a fresh Prisma scope before treating it as a replay.
      const winner = await this.findExistingProductGenerationLedger(this.prisma, input);
      if (winner) return winner;
      throw error;
    }
  }

  private async findExistingProductGenerationLedger(
    scope: Prisma.TransactionClient | PrismaService,
    input: Parameters<DetailPageGenerationRepositoryPort['openProcessingGenerationLedger']>[0],
  ): Promise<{
    status: 'created' | 'existing';
    row: DetailPageGenerationSnapshot;
    directJobId: string;
    releaseRequired: boolean;
  } | null> {
    if (!input.productGenerationIdentity) return null;
    const existing = await scope.contentGeneration.findFirst({
      where: {
        id: input.productGenerationIdentity.generationId,
        organizationId: input.organizationId,
      },
      include: detailPageGenerationInclude,
    });
    if (!existing) return null;
    if (
      existing.isDeleted ||
      readProductGenerationRequestHash(existing.generationInput) !==
        input.productGenerationIdentity.requestHash
    ) {
      throw new ConflictException('product_generation_idempotency_conflict');
    }
    const directJob = await scope.aiDirectJob.findFirst({
      where: {
        organizationId: input.organizationId,
        jobType: 'detail_page_generate',
        sourceResourceId: existing.id,
      },
      select: { id: true, status: true },
    });
    if (!directJob) {
      throw new Error(`Missing detail-page AI direct job for ${existing.id}.`);
    }
    return {
      status: 'existing',
      row: existing as DetailPageGenerationSnapshot,
      directJobId: directJob.id,
      releaseRequired: directJob.status === 'held',
    };
  }

  async markGenerationFailed(input: {
    organizationId: string;
    generationId: string;
    errorMessage: string;
  }): Promise<void> {
    await this.prisma.contentGeneration.updateMany({
      where: { id: input.generationId, organizationId: input.organizationId },
      data: { status: 'FAILED', errorMessage: input.errorMessage },
    });
  }

  async findRerunBase(input: {
    organizationId: string;
    generationId: string;
  }): Promise<DetailPageRerunBaseSnapshot | null> {
    const base = await this.prisma.contentGeneration.findFirst({
      where: { id: input.generationId, organizationId: input.organizationId },
      select: {
        id: true,
        generationGroupId: true,
        contentWorkspaceId: true,
        sourceCandidateId: true,
        generationInput: true,
        generationResult: true,
        templateId: true,
        generatedTitle: true,
      },
    });
    return base as DetailPageRerunBaseSnapshot | null;
  }

  async findImageOnlyBaseCandidates(input: {
    organizationId: string;
    sourceCandidateId: string | null;
    contentWorkspaceId: string | null;
    templateId: string;
  }): Promise<DetailPageImageOnlyBaseCandidateSnapshot[]> {
    if (!input.sourceCandidateId && !input.contentWorkspaceId) return [];
    const where: Prisma.ContentGenerationWhereInput = {
      organizationId: input.organizationId,
      contentType: 'detail_page',
      templateId: input.templateId,
      status: { in: ['READY', 'completed'] },
      ...(input.contentWorkspaceId
        ? { contentWorkspaceId: input.contentWorkspaceId }
        : {
              OR: [
                { sourceCandidateId: input.sourceCandidateId },
                { sources: { some: { sourceCandidateId: input.sourceCandidateId } } },
              ],
            }),
    };
    const rows = await this.prisma.contentGeneration.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        generationInput: true,
        generationResult: true,
        templateId: true,
        generatedTitle: true,
      },
    });
    return rows as DetailPageImageOnlyBaseCandidateSnapshot[];
  }

  async findSourceCandidate(input: {
    organizationId: string;
    sourceCandidateId: string;
  }) {
    return this.prisma.sourcingCandidate.findFirst({
      where: {
        id: input.sourceCandidateId,
        organizationId: input.organizationId,
        isDeleted: false,
      },
      select: { id: true, name: true },
    });
  }

  async findSourceContentGeneration(input: {
    organizationId: string;
    sourceContentGenerationId: string;
  }) {
    return this.prisma.contentGeneration.findFirst({
      where: {
        id: input.sourceContentGenerationId,
        organizationId: input.organizationId,
      },
      select: { id: true, generatedTitle: true },
    });
  }

  async findSourceContentAsset(input: {
    organizationId: string;
    contentAssetId: string;
  }) {
    return this.prisma.contentAsset.findFirst({
      where: {
        id: input.contentAssetId,
        organizationId: input.organizationId,
        isDeleted: false,
      },
      select: { id: true, label: true, role: true },
    });
  }

  private async recordGenerationSources(scope: Prisma.TransactionClient, input: {
    organizationId: string;
    contentGenerationId: string;
    sourceReferences: Array<{
      sourceType: 'sourcing_candidate' | 'content_generation' | 'input_asset';
      sourceCandidateId?: string | null;
      sourceContentGenerationId?: string | null;
      contentAssetId?: string | null;
      label?: string | null;
    }>;
    inputAssets: Array<{
      id: string;
      assetKey: string;
      role: string | null;
      label: string | null;
    }>;
  }): Promise<void> {
    const explicitRows = input.sourceReferences.map((ref, index) => ({
      organizationId: input.organizationId,
      contentGenerationId: input.contentGenerationId,
      sourceType: ref.sourceType,
      sourceCandidateId: ref.sourceCandidateId ?? null,
      sourceContentGenerationId: ref.sourceContentGenerationId ?? null,
      contentAssetId: ref.contentAssetId ?? null,
      label: ref.label ?? null,
      sortOrder: index,
      metadata: {},
    }));
    const inputAssetRows = input.inputAssets.map((asset, index) => ({
      organizationId: input.organizationId,
      contentGenerationId: input.contentGenerationId,
      sourceType: 'input_asset',
      sourceCandidateId: null,
      sourceContentGenerationId: null,
      contentAssetId: asset.id,
      label: asset.label ?? asset.role ?? 'Input asset',
      sortOrder: explicitRows.length + index,
      metadata: { assetKey: asset.assetKey },
    }));
    const rows = [...explicitRows, ...inputAssetRows];
    if (rows.length === 0) return;
    await scope.contentGenerationSource.createMany({
      skipDuplicates: true,
      data: rows,
    });
  }

  async findCancellableGeneration(input: {
    organizationId: string;
    generationId: string;
  }): Promise<DetailPageCancellableGenerationSnapshot | null> {
    return this.prisma.contentGeneration.findFirst({
      where: { id: input.generationId, organizationId: input.organizationId },
      select: { id: true, status: true, generationInput: true, generationResult: true },
    });
  }

  async cancelDirectGeneration(input: {
    organizationId: string;
    generationId: string;
    reason: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.contentGeneration.findFirst({
        where: { id: input.generationId, organizationId: input.organizationId },
        select: { id: true, status: true, generationResult: true },
      });
      if (!current) {
        return {
          status: 'not_found' as const,
          generationId: input.generationId,
          preserved: false,
        };
      }
      if (!DETAIL_PAGE_ACTIVE_STATUSES.includes(current.status)) {
        return {
          status: 'already_terminal' as const,
          generationId: current.id,
          preserved: DETAIL_PAGE_PRESERVED_STATUSES.has(current.status),
        };
      }

      const cancelledGeneration = await tx.contentGeneration.updateMany({
        where: {
          id: current.id,
          organizationId: input.organizationId,
          status: { in: DETAIL_PAGE_ACTIVE_STATUSES },
        },
        data: {
          status: 'CANCELLED',
          errorMessage: input.reason,
          generationResult: current.generationResult as Prisma.InputJsonValue,
        },
      });
      if (cancelledGeneration.count === 0) {
        const latest = await tx.contentGeneration.findFirst({
          where: { id: current.id, organizationId: input.organizationId },
          select: { id: true, status: true },
        });
        return {
          status: 'already_terminal' as const,
          generationId: latest?.id ?? current.id,
          preserved: latest ? DETAIL_PAGE_PRESERVED_STATUSES.has(latest.status) : false,
        };
      }

      await tx.aiDirectJob.updateMany({
        where: {
          organizationId: input.organizationId,
          sourceResourceId: current.id,
          jobType: 'detail_page_generate',
          status: { in: ['held', 'pending', 'running', 'projecting'] },
        },
        data: {
          status: 'cancelled',
          finishedAt: new Date(),
          leaseExpiresAt: null,
          lastErrorCode: 'user_cancelled',
          lastErrorMessage: input.reason,
        },
      });
      return {
        status: 'cancelled' as const,
        generationId: current.id,
        preserved: false,
      };
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
