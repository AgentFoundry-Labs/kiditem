import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  DetailPageCancellableGenerationSnapshot,
  DetailPageContentWorkspaceSnapshot,
  DetailPageGenerationRepositoryPort,
  DetailPageImageOnlyBaseCandidateSnapshot,
  DetailPageRerunBaseSnapshot,
} from '../../../application/port/out/repository/detail-page-generation.repository.port';
import type { DetailPageGenerationSnapshot } from '../../../application/port/out/repository/detail-page-query.repository.port';
import {
  CONTENT_ASSET_LIBRARY_REPOSITORY_PORT,
  type ContentAssetLibraryRepositoryPort,
} from '../../../application/port/out/repository/content-asset-library.repository.port';

const detailPageGenerationInclude = {
  generationGroup: {
    select: {
      id: true,
      contentWorkspaceId: true,
    },
  },
} satisfies Prisma.ContentGenerationInclude;

@Injectable()
export class DetailPageGenerationRepositoryAdapter implements DetailPageGenerationRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONTENT_ASSET_LIBRARY_REPOSITORY_PORT)
    private readonly contentAssets: ContentAssetLibraryRepositoryPort,
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

  private async createInputGenerationGroup(input: {
    organizationId: string;
    contentWorkspaceId: string;
    triggeredByUserId: string | null;
    rawTitle: string;
    templateId: string;
  }): Promise<string> {
    const group = await this.prisma.contentGenerationGroup.create({
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

  async openProcessingGenerationLedger(input: {
    organizationId: string;
    generationGroupId?: string | null;
    contentWorkspaceId: string;
    sourceCandidateId: string | null;
    triggeredByUserId: string | null;
    templateId: string;
    rawInput: unknown;
    imageUrls: string[];
    rawTitle: string;
    sourceReferences: Array<{
      sourceType: 'sourcing_candidate' | 'content_generation' | 'input_asset';
      sourceCandidateId?: string | null;
      sourceContentGenerationId?: string | null;
      contentAssetId?: string | null;
      label?: string | null;
    }>;
  }): Promise<{ status: 'created'; row: DetailPageGenerationSnapshot }> {
    const generationGroupId = input.generationGroupId ??
      await this.createInputGenerationGroup({
        organizationId: input.organizationId,
        contentWorkspaceId: input.contentWorkspaceId,
        triggeredByUserId: input.triggeredByUserId,
        rawTitle: input.rawTitle,
        templateId: input.templateId,
      });
    const row = await this.prisma.contentGeneration.create({
      data: {
        organizationId: input.organizationId,
        contentType: 'detail_page',
        generationGroupId,
        contentWorkspaceId: input.contentWorkspaceId,
        sourceCandidateId: input.sourceCandidateId,
        triggeredByUserId: input.triggeredByUserId,
        templateId: input.templateId,
        generationInput: input.rawInput as Prisma.InputJsonValue,
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
    const inputAssets = await this.contentAssets.recordDetailPageInputAssets({
      organizationId: input.organizationId,
      generationGroupId,
      createdByUserId: input.triggeredByUserId,
      imageUrls: input.imageUrls,
    });
    await this.recordGenerationSources({
      organizationId: input.organizationId,
      contentGenerationId: row.id,
      sourceReferences: input.sourceReferences,
      inputAssets,
    });
    return { status: 'created', row: row as DetailPageGenerationSnapshot };
  }

  async markGenerationRejectedByParent(input: {
    organizationId: string;
    generationId: string;
    status: 'CANCELLED' | 'FAILED';
    errorMessage: string;
  }): Promise<void> {
    await this.prisma.contentGeneration.updateMany({
      where: { id: input.generationId, organizationId: input.organizationId },
      data: {
        status: input.status,
        errorMessage: input.errorMessage,
      },
    });
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

  async findGenerationStatus(input: {
    organizationId: string;
    generationId: string;
  }): Promise<{ status: string } | null> {
    return this.prisma.contentGeneration.findFirst({
      where: { id: input.generationId, organizationId: input.organizationId },
      select: { status: true },
    });
  }

  async markGenerationCancelledIfProcessing(input: {
    organizationId: string;
    generationId: string;
    processingStatuses: string[];
    errorMessage: string;
  }): Promise<number> {
    const updated = await this.prisma.contentGeneration.updateMany({
      where: {
        id: input.generationId,
        organizationId: input.organizationId,
        status: { in: input.processingStatuses },
      },
      data: {
        status: 'CANCELLED',
        errorMessage: input.errorMessage,
      },
    });
    return updated.count;
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

  private async recordGenerationSources(input: {
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
    await this.prisma.contentGenerationSource.createMany({
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

  async cancelProcessingGeneration(input: {
    organizationId: string;
    generationId: string;
    processingStatuses: string[];
    reason: string;
    generationResult: unknown;
  }): Promise<number> {
    const updated = await this.prisma.contentGeneration.updateMany({
      where: {
        id: input.generationId,
        organizationId: input.organizationId,
        status: { in: input.processingStatuses },
      },
      data: {
        status: 'CANCELLED',
        errorMessage: input.reason,
        generationResult: input.generationResult as Prisma.InputJsonValue,
      },
    });
    return updated.count;
  }
}
