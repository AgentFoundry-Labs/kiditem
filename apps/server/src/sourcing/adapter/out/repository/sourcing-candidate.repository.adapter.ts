import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  CandidateImageRow,
  CandidateForPreparationRow,
  CandidateRow,
  LockedPromotionCandidateRow,
  PreparationDetailPageSelectionRow,
  PreparationSelectionRow,
  PreparationThumbnailSelectionRow,
  ProductPreparationRow,
  PromotionPreparationSelectionRow,
  SelectedDetailPageRow,
  SelectedThumbnailGenerationRow,
  SourcingCandidateRepositoryPort,
  SourcingCandidateStateRow,
  UpsertPreparationInput,
  UpsertCandidateInput,
  UpsertPromotedProductPreparationInput,
} from '../../../application/port/out/sourcing-candidate.repository.port';
import type { SourcingRepositoryTransaction } from '../../../application/port/out/repository-transaction';

@Injectable()
export class SourcingCandidateRepositoryAdapter implements SourcingCandidateRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  runInTransaction<T>(
    operation: (tx: SourcingRepositoryTransaction) => Promise<T>,
    options?: { timeout?: number },
  ): Promise<T> {
    return this.prisma.$transaction(
      (tx) => operation(tx as SourcingRepositoryTransaction),
      options,
    );
  }

  async upsertSourced(input: UpsertCandidateInput): Promise<CandidateRow> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.sourcingCandidate.findFirst({
        where: {
          organizationId: input.organizationId,
          sourceUrl: input.sourceUrl,
          isDeleted: false,
          status: 'sourced',
        },
        select: { id: true, rawData: true },
      });

      if (existing) {
        const mergedRaw = mergeJson(existing.rawData, input.rawData);
        const updated = await tx.sourcingCandidate.update({
          where: { id: existing.id },
          data: {
            sourcePlatform: input.sourcePlatform,
            rawData: mergedRaw as Prisma.InputJsonValue,
            name: input.name,
            description: input.description,
            category: input.category,
            tags: input.tags,
            thumbnailUrl: input.thumbnailUrl,
            imageUrl: input.imageUrl,
            costCny: input.costCny ?? undefined,
          },
        });
        await this.ensureImages(tx, updated.id, input.organizationId, input.images);
        return toRow(updated);
      }

      const created = await tx.sourcingCandidate.create({
        data: {
          organizationId: input.organizationId,
          sourceUrl: input.sourceUrl,
          sourcePlatform: input.sourcePlatform,
          rawData: input.rawData as Prisma.InputJsonValue,
          name: input.name,
          description: input.description,
          category: input.category,
          tags: input.tags,
          thumbnailUrl: input.thumbnailUrl,
          imageUrl: input.imageUrl,
          costCny: input.costCny ?? undefined,
          triggeredByUserId: input.triggeredByUserId,
          status: 'sourced',
        },
      });
      await this.ensureImages(tx, created.id, input.organizationId, input.images);
      return toRow(created);
    });
  }

  async mergeDescription(input: {
    organizationId: string;
    sourceUrl: string;
    rawData: object;
    description: string | null;
    thumbnailUrl: string | null;
    imageUrl: string | null;
    images: UpsertCandidateInput['images'];
  }): Promise<CandidateRow | null> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.sourcingCandidate.findFirst({
        where: {
          organizationId: input.organizationId,
          sourceUrl: input.sourceUrl,
          isDeleted: false,
          status: 'sourced',
        },
      });
      if (!existing) return null;
      const merged = mergeJson(existing.rawData, input.rawData);
      const updated = await tx.sourcingCandidate.update({
        where: { id: existing.id },
        data: {
          rawData: merged as Prisma.InputJsonValue,
          description: input.description ?? existing.description,
          thumbnailUrl: existing.thumbnailUrl ?? input.thumbnailUrl,
          imageUrl: existing.imageUrl ?? input.imageUrl,
        },
      });
      await this.ensureImages(tx, updated.id, input.organizationId, input.images);
      return toRow(updated);
    });
  }

  async findById(id: string, organizationId: string) {
    const row = await this.prisma.sourcingCandidate.findFirst({
      where: { id, organizationId, isDeleted: false },
      include: {
        images: { where: { isDeleted: false }, orderBy: { sortOrder: 'asc' } },
        productPreparations: {
          where: {
            organizationId,
            isDeleted: false,
            OR: [
              { isCurrentForMaster: true },
              { masterId: null },
            ],
          },
          orderBy: [
            { isCurrentForMaster: 'desc' },
            { updatedAt: 'desc' },
            { createdAt: 'desc' },
          ],
          take: 1,
        },
      },
    });
    if (!row) return null;
    return {
      ...toRow(row),
      images: row.images.map(toImageRow),
      productPreparation: row.productPreparations[0]
        ? toProductPreparationRow(row.productPreparations[0])
        : null,
    };
  }

  async listSourced(query: {
    organizationId: string;
    page: number;
    limit: number;
    sort: 'newest' | 'oldest' | 'name_asc';
    platform?: string;
    sourcePlatforms?: string[];
  }): Promise<{ items: Array<CandidateRow & { images: CandidateImageRow[] }>; total: number }> {
    const where = {
      organizationId: query.organizationId,
      isDeleted: false,
      status: { in: ['sourced', 'promoted'] },
      ...(query.platform
        ? { sourcePlatform: query.platform }
        : query.sourcePlatforms?.length
          ? { sourcePlatform: { in: query.sourcePlatforms } }
          : {}),
      OR: [
        { promotedMasterId: null },
        {
          promotedMaster: {
            listings: {
              none: { organizationId: query.organizationId, isDeleted: false },
            },
          },
        },
      ],
    };
    const orderBy =
      query.sort === 'oldest' ? { createdAt: 'asc' as const } :
      query.sort === 'name_asc' ? { name: 'asc' as const } :
      { createdAt: 'desc' as const };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.sourcingCandidate.count({ where }),
      this.prisma.sourcingCandidate.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          images: {
            where: { isDeleted: false },
            orderBy: { sortOrder: 'asc' },
          },
        },
      }),
    ]);
    return {
      total,
      items: rows.map((row) => ({
        ...toRow(row),
        images: row.images.map(toImageRow),
      })),
    };
  }

  async archiveSourcedWorkspace(
    tx: SourcingRepositoryTransaction,
    input: { id: string; organizationId: string; archivedAt: Date },
  ): Promise<{ archivedCandidate: boolean; archivedCandidateImages: number }> {
    const prismaTx = tx as Prisma.TransactionClient;
    const candidate = await prismaTx.sourcingCandidate.updateMany({
      where: {
        id: input.id,
        organizationId: input.organizationId,
        isDeleted: false,
        status: 'sourced',
      },
      data: {
        isDeleted: true,
        deletedAt: input.archivedAt,
      },
    });
    if (candidate.count === 0) {
      return { archivedCandidate: false, archivedCandidateImages: 0 };
    }
    const images = await prismaTx.candidateImage.updateMany({
      where: {
        candidateId: input.id,
        organizationId: input.organizationId,
        isDeleted: false,
      },
      data: {
        isDeleted: true,
        deletedAt: input.archivedAt,
      },
    });
    return {
      archivedCandidate: true,
      archivedCandidateImages: images.count,
    };
  }

  async findCandidateState(
    tx: SourcingRepositoryTransaction,
    input: { id: string; organizationId: string },
  ): Promise<SourcingCandidateStateRow | null> {
    const prismaTx = tx as Prisma.TransactionClient;
    return prismaTx.sourcingCandidate.findFirst({
      where: { id: input.id, organizationId: input.organizationId, isDeleted: false },
      select: { id: true, status: true },
    });
  }

  async lockCandidate(
    tx: SourcingRepositoryTransaction,
    input: { id: string; organizationId: string },
  ): Promise<void> {
    const prismaTx = tx as Prisma.TransactionClient;
    await prismaTx.$queryRaw`
      SELECT id FROM sourcing_candidates
      WHERE id = ${input.id}::uuid
        AND organization_id = ${input.organizationId}::uuid
      FOR UPDATE
    `;
  }

  async findLockedPromotionCandidate(
    tx: SourcingRepositoryTransaction,
    input: { id: string; organizationId: string },
  ): Promise<LockedPromotionCandidateRow | null> {
    const prismaTx = tx as Prisma.TransactionClient;
    const row = await prismaTx.sourcingCandidate.findFirst({
      where: { id: input.id, organizationId: input.organizationId, isDeleted: false },
      include: {
        images: {
          where: { isDeleted: false },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      tags: row.tags as LockedPromotionCandidateRow['tags'],
      thumbnailUrl: row.thumbnailUrl,
      imageUrl: row.imageUrl,
      status: row.status,
      promotedMasterId: row.promotedMasterId,
      images: row.images.map((image) => ({
        url: image.url,
        storageKey: image.storageKey,
        sortOrder: image.sortOrder,
        isPrimary: image.isPrimary,
        source: image.source,
        role: image.role,
        label: image.label,
      })),
    };
  }

  async findPromotionPreparationSelection(
    tx: SourcingRepositoryTransaction,
    input: { organizationId: string; candidateId: string },
  ): Promise<PromotionPreparationSelectionRow | null> {
    const prismaTx = tx as Prisma.TransactionClient;
    const row = await prismaTx.productPreparation.findFirst({
      where: {
        organizationId: input.organizationId,
        sourceCandidateId: input.candidateId,
        isDeleted: false,
      },
      select: {
        registrationInput: true,
        selectedThumbnailUrl: true,
        selectedThumbnailGenerationCandidateId: true,
        selectedDetailPageGenerationId: true,
        selectedDetailPageArtifactId: true,
        selectedDetailPageRevisionId: true,
      },
    });
    return row
      ? {
          registrationInput: row.registrationInput as PromotionPreparationSelectionRow['registrationInput'],
          selectedThumbnailUrl: row.selectedThumbnailUrl,
          selectedThumbnailGenerationCandidateId: row.selectedThumbnailGenerationCandidateId,
          selectedDetailPageGenerationId: row.selectedDetailPageGenerationId,
          selectedDetailPageArtifactId: row.selectedDetailPageArtifactId,
          selectedDetailPageRevisionId: row.selectedDetailPageRevisionId,
        }
      : null;
  }

  async findSelectedThumbnailGeneration(
    tx: SourcingRepositoryTransaction,
    input: {
      organizationId: string;
      candidateId: string;
      generationCandidateId: string;
    },
  ): Promise<SelectedThumbnailGenerationRow | null> {
    const prismaTx = tx as Prisma.TransactionClient;
    const generated = await prismaTx.thumbnailGenerationCandidate.findFirst({
      where: {
        id: input.generationCandidateId,
        organizationId: input.organizationId,
        generation: {
          organizationId: input.organizationId,
          sourceCandidateId: input.candidateId,
          isDeleted: false,
        },
      },
      select: {
        id: true,
        generationId: true,
        url: true,
        storageKey: true,
        mimeType: true,
        width: true,
        height: true,
        fileSize: true,
        generation: {
          select: {
            contentWorkspaceId: true,
          },
        },
      },
    });
    return generated
      ? {
          id: generated.id,
          generationId: generated.generationId,
          url: generated.url,
          storageKey: generated.storageKey,
          mimeType: generated.mimeType,
          width: generated.width,
          height: generated.height,
          fileSize: generated.fileSize,
          contentWorkspaceId: generated.generation.contentWorkspaceId ?? null,
        }
      : null;
  }

  async findSelectedDetailPageGeneration(
    tx: SourcingRepositoryTransaction,
    input: {
      organizationId: string;
      candidateId: string;
      contentGenerationId: string;
    },
  ): Promise<SelectedDetailPageRow | null> {
    const prismaTx = tx as Prisma.TransactionClient;
    const generation = await prismaTx.contentGeneration.findFirst({
      where: {
        id: input.contentGenerationId,
        organizationId: input.organizationId,
        isDeleted: false,
        contentType: 'detail_page',
        detailPageArtifact: { is: { isDeleted: false } },
        OR: [
          { sourceCandidateId: input.candidateId },
          { sources: { some: { sourceCandidateId: input.candidateId } } },
          { detailPageArtifact: { is: { sourceCandidateId: input.candidateId } } },
        ],
      },
      select: {
        id: true,
        contentWorkspaceId: true,
        detailPageArtifactId: true,
        detailPageArtifact: {
          select: {
            currentRevisionId: true,
          },
        },
      },
    });
    if (!generation?.detailPageArtifactId) return null;
    return {
      artifactId: generation.detailPageArtifactId,
      revisionId: generation.detailPageArtifact?.currentRevisionId ?? null,
      contentGenerationId: generation.id,
      contentWorkspaceId: generation.contentWorkspaceId ?? null,
    };
  }

  async findSelectedDetailPageArtifact(
    tx: SourcingRepositoryTransaction,
    input: {
      organizationId: string;
      candidateId: string;
      artifactId: string;
    },
  ): Promise<SelectedDetailPageRow | null> {
    const prismaTx = tx as Prisma.TransactionClient;
    const artifact = await prismaTx.detailPageArtifact.findFirst({
      where: {
        id: input.artifactId,
        organizationId: input.organizationId,
        isDeleted: false,
        OR: [
          { sourceCandidateId: input.candidateId },
          { sourceContentGeneration: { is: { sourceCandidateId: input.candidateId, isDeleted: false } } },
          {
            sourceContentGeneration: {
              is: { isDeleted: false, sources: { some: { sourceCandidateId: input.candidateId } } },
            },
          },
        ],
      },
      select: {
        id: true,
        contentWorkspaceId: true,
        sourceContentGenerationId: true,
        currentRevisionId: true,
      },
    });
    return artifact
      ? {
          artifactId: artifact.id,
          revisionId: artifact.currentRevisionId ?? null,
          contentGenerationId: artifact.sourceContentGenerationId ?? null,
          contentWorkspaceId: artifact.contentWorkspaceId ?? null,
        }
      : null;
  }

  async findDetailPageRevision(
    tx: SourcingRepositoryTransaction,
    input: { organizationId: string; artifactId: string; revisionId: string },
  ): Promise<{ id: string } | null> {
    const prismaTx = tx as Prisma.TransactionClient;
    return prismaTx.detailPageRevision.findFirst({
      where: {
        id: input.revisionId,
        organizationId: input.organizationId,
        artifactId: input.artifactId,
      },
      select: { id: true },
    });
  }

  async markCandidatePromoted(
    tx: SourcingRepositoryTransaction,
    input: { id: string; organizationId: string; masterId: string },
  ): Promise<{ count: number }> {
    const prismaTx = tx as Prisma.TransactionClient;
    return prismaTx.sourcingCandidate.updateMany({
      where: {
        id: input.id,
        organizationId: input.organizationId,
        isDeleted: false,
        status: 'sourced',
        promotedMasterId: null,
      },
      data: {
        status: 'promoted',
        promotedMasterId: input.masterId,
      },
    });
  }

  async rejectCandidate(
    tx: SourcingRepositoryTransaction,
    input: {
      id: string;
      organizationId: string;
      reason: string | null;
      rejectedByUserId: string | null;
      rejectedAt: Date;
    },
  ): Promise<{ count: number }> {
    const prismaTx = tx as Prisma.TransactionClient;
    return prismaTx.sourcingCandidate.updateMany({
      where: {
        id: input.id,
        organizationId: input.organizationId,
        isDeleted: false,
        status: 'sourced',
      },
      data: {
        status: 'rejected',
        rejectedAt: input.rejectedAt,
        rejectedReason: input.reason,
        rejectedByUserId: input.rejectedByUserId,
      },
    });
  }

  async attachSelectedDetailPageArtifact(
    tx: SourcingRepositoryTransaction,
    input: {
      organizationId: string;
      artifactId: string;
      targetMasterId: string;
      revisionId: string | null;
    },
  ): Promise<{ count: number }> {
    const prismaTx = tx as Prisma.TransactionClient;
    return prismaTx.detailPageArtifact.updateMany({
      where: { id: input.artifactId, organizationId: input.organizationId, isDeleted: false },
      data: {
        targetMasterId: input.targetMasterId,
        ...(input.revisionId ? { currentRevisionId: input.revisionId } : {}),
      },
    });
  }

  async upsertPromotedProductPreparation(
    tx: SourcingRepositoryTransaction,
    input: UpsertPromotedProductPreparationInput,
  ): Promise<void> {
    const prismaTx = tx as Prisma.TransactionClient;
    await prismaTx.productPreparation.updateMany({
      where: {
        organizationId: input.organizationId,
        masterId: input.masterId,
        isCurrentForMaster: true,
        isDeleted: false,
      },
      data: { isCurrentForMaster: false },
    });
    const data = {
      masterId: input.masterId,
      contentWorkspaceId: input.contentWorkspaceId,
      displayName: input.displayName,
      status: 'product_registered',
      isCurrentForMaster: true,
      appliedToMasterAt: input.appliedToMasterAt,
      selectedThumbnailUrl: input.selectedThumbnailUrl,
      selectedThumbnailGenerationId: input.selectedThumbnailGenerationId,
      selectedThumbnailGenerationCandidateId: input.selectedThumbnailGenerationCandidateId,
      selectedDetailPageArtifactId: input.selectedDetailPageArtifactId,
      selectedDetailPageRevisionId: input.selectedDetailPageRevisionId,
      selectedDetailPageGenerationId: input.selectedDetailPageGenerationId,
      registrationInput: input.registrationInput as Prisma.InputJsonValue,
    };
    const existing = await prismaTx.productPreparation.findFirst({
      where: {
        organizationId: input.organizationId,
        sourceCandidateId: input.candidateId,
        isDeleted: false,
      },
      select: { id: true },
    });
    if (existing) {
      await prismaTx.productPreparation.update({
        where: { id: existing.id },
        data,
      });
      return;
    }
    await prismaTx.productPreparation.create({
      data: {
        organizationId: input.organizationId,
        sourceCandidateId: input.candidateId,
        ...data,
      },
    });
  }

  async findCandidateForPreparation(input: {
    organizationId: string;
    candidateId: string;
  }): Promise<CandidateForPreparationRow | null> {
    const row = await this.prisma.sourcingCandidate.findFirst({
      where: { id: input.candidateId, organizationId: input.organizationId, isDeleted: false },
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        tags: true,
        rawData: true,
        promotedMasterId: true,
      },
    });
    return row ? toCandidateForPreparationRow(row) : null;
  }

  async findActivePreparation(input: {
    organizationId: string;
    sourceCandidateId: string;
  }): Promise<PreparationSelectionRow | null> {
    const row = await this.prisma.productPreparation.findFirst({
      where: {
        organizationId: input.organizationId,
        sourceCandidateId: input.sourceCandidateId,
        isDeleted: false,
      },
      select: { id: true, registrationInput: true },
    });
    return row
      ? { id: row.id, registrationInput: row.registrationInput as PreparationSelectionRow['registrationInput'] }
      : null;
  }

  async findPreparationThumbnailCandidate(input: {
    organizationId: string;
    candidate: CandidateForPreparationRow;
    generatedCandidateId: string;
  }): Promise<(PreparationThumbnailSelectionRow & { url: string }) | null> {
    const generated = await this.prisma.thumbnailGenerationCandidate.findFirst({
      where: {
        id: input.generatedCandidateId,
        organizationId: input.organizationId,
        generation: {
          organizationId: input.organizationId,
          isDeleted: false,
          OR: [
            { sourceCandidateId: input.candidate.id },
            ...(input.candidate.promotedMasterId
              ? [{ masterId: input.candidate.promotedMasterId }]
              : []),
          ],
        },
      },
      select: {
        id: true,
        url: true,
        generationId: true,
        generation: {
          select: {
            contentWorkspaceId: true,
          },
        },
      },
    });
    return generated
      ? {
          id: generated.id,
          url: generated.url,
          generationId: generated.generationId,
          contentWorkspaceId: generated.generation.contentWorkspaceId,
        }
      : null;
  }

  async findPreparationDetailPageGeneration(input: {
    organizationId: string;
    candidate: CandidateForPreparationRow;
    contentGenerationId: string;
  }): Promise<PreparationDetailPageSelectionRow | null> {
    const generation = await this.prisma.contentGeneration.findFirst({
      where: {
        id: input.contentGenerationId,
        organizationId: input.organizationId,
        isDeleted: false,
        contentType: 'detail_page',
        detailPageArtifact: { is: { isDeleted: false } },
        OR: [
          { sourceCandidateId: input.candidate.id },
          ...(input.candidate.promotedMasterId
            ? [{ generationGroup: { is: { targetMasterId: input.candidate.promotedMasterId } } }]
            : []),
        ],
      },
      select: {
        id: true,
        contentWorkspaceId: true,
        detailPageArtifactId: true,
        detailPageArtifact: {
          select: {
            currentRevisionId: true,
          },
        },
      },
    });
    return generation
      ? {
          id: generation.id,
          contentWorkspaceId: generation.contentWorkspaceId,
          artifactId: generation.detailPageArtifactId,
          revisionId: generation.detailPageArtifact?.currentRevisionId ?? null,
        }
      : null;
  }

  async findPreparationDetailPageRevision(input: {
    organizationId: string;
    artifactId: string;
    revisionId: string;
  }): Promise<{ id: string } | null> {
    return this.prisma.detailPageRevision.findFirst({
      where: {
        id: input.revisionId,
        organizationId: input.organizationId,
        artifactId: input.artifactId,
      },
      select: { id: true },
    });
  }

  async upsertPreparation(input: UpsertPreparationInput): Promise<ProductPreparationRow> {
    const existing = await this.prisma.productPreparation.findFirst({
      where: {
        organizationId: input.organizationId,
        sourceCandidateId: input.candidate.id,
        isDeleted: false,
      },
      select: { id: true },
    });
    if (existing) {
      const updated = await this.prisma.productPreparation.update({
        where: { id: existing.id },
        data: input.data as Prisma.ProductPreparationUncheckedUpdateInput,
      });
      return toProductPreparationRow(updated);
    }
    const created = await this.prisma.productPreparation.create({
      data: createPreparationDataFromCandidate(input),
    });
    return toProductPreparationRow(created);
  }

  private async ensureImages(
    tx: Prisma.TransactionClient,
    candidateId: string,
    organizationId: string,
    images: UpsertCandidateInput['images'],
  ) {
    if (images.length === 0) return;
    const existing = await tx.candidateImage.count({
      where: { candidateId, organizationId, isDeleted: false },
    });
    if (existing > 0) return;
    await tx.candidateImage.createMany({
      data: images.map((img) => ({
        organizationId,
        candidateId,
        url: img.url,
        role: img.role,
        label: img.label,
        sortOrder: img.sortOrder,
        source: img.source,
        isPrimary: img.isPrimary,
      })),
    });
  }
}

function toRow(r: any): CandidateRow {
  return {
    id: r.id,
    organizationId: r.organizationId,
    sourceUrl: r.sourceUrl,
    sourcePlatform: r.sourcePlatform,
    rawData: r.rawData,
    name: r.name,
    description: r.description,
    category: r.category,
    tags: r.tags,
    thumbnailUrl: r.thumbnailUrl,
    imageUrl: r.imageUrl,
    costCny: r.costCny,
    status: r.status,
    promotedMasterId: r.promotedMasterId,
    rejectedReason: r.rejectedReason,
    rejectedAt: r.rejectedAt,
    rejectedByUserId: r.rejectedByUserId,
    triggeredByUserId: r.triggeredByUserId,
    isDeleted: r.isDeleted,
    deletedAt: r.deletedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function toImageRow(i: any): CandidateImageRow {
  return {
    id: i.id,
    organizationId: i.organizationId,
    candidateId: i.candidateId,
    url: i.url,
    storageKey: i.storageKey,
    role: i.role,
    label: i.label,
    sortOrder: i.sortOrder,
    source: i.source,
    isPrimary: i.isPrimary,
    isDeleted: i.isDeleted,
  };
}

function toProductPreparationRow(p: any): ProductPreparationRow {
  return {
    id: p.id,
    sourceCandidateId: p.sourceCandidateId,
    masterId: p.masterId,
    contentWorkspaceId: p.contentWorkspaceId,
    displayName: p.displayName,
    status: p.status,
    isCurrentForMaster: p.isCurrentForMaster,
    selectedThumbnailUrl: p.selectedThumbnailUrl,
    selectedThumbnailGenerationId: p.selectedThumbnailGenerationId,
    selectedThumbnailGenerationCandidateId: p.selectedThumbnailGenerationCandidateId,
    selectedDetailPageArtifactId: p.selectedDetailPageArtifactId,
    selectedDetailPageRevisionId: p.selectedDetailPageRevisionId,
    selectedDetailPageGenerationId: p.selectedDetailPageGenerationId,
    registrationInput: p.registrationInput,
    appliedToMasterAt: p.appliedToMasterAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function toCandidateForPreparationRow(candidate: {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  tags: unknown;
  rawData: unknown;
  promotedMasterId: string | null;
}): CandidateForPreparationRow {
  return {
    id: candidate.id,
    name: candidate.name,
    description: candidate.description,
    category: candidate.category,
    tags: candidate.tags as CandidateForPreparationRow['tags'],
    rawData: candidate.rawData as CandidateForPreparationRow['rawData'],
    promotedMasterId: candidate.promotedMasterId,
  };
}

function mergeJson(prev: unknown, incoming: object): object {
  const base = (prev && typeof prev === 'object' && !Array.isArray(prev)) ? (prev as Record<string, unknown>) : {};
  return { ...base, ...incoming };
}

function createPreparationDataFromCandidate(
  input: UpsertPreparationInput,
): Prisma.ProductPreparationUncheckedCreateInput {
  return {
    organizationId: input.organizationId,
    sourceCandidateId: input.candidate.id,
    masterId: input.candidate.promotedMasterId,
    displayName: input.candidate.name,
    status: input.candidate.promotedMasterId ? 'product_registered' : 'draft',
    registrationInput: registrationInputFromCandidate(input.candidate) as Prisma.InputJsonValue,
    ...input.data,
  } as Prisma.ProductPreparationUncheckedCreateInput;
}

function registrationInputFromCandidate(
  candidate: CandidateForPreparationRow,
): Record<string, unknown> {
  const raw = candidate.rawData && typeof candidate.rawData === 'object' && !Array.isArray(candidate.rawData)
    ? candidate.rawData as Record<string, unknown>
    : {};
  return {
    ...raw,
    name: stringOr(raw.name ?? raw.title) ?? candidate.name,
    category: stringOr(raw.category) ?? candidate.category ?? '',
    description: stringOr(raw.description) ?? candidate.description ?? '',
    target: stringOr(raw.target) ?? '',
    ageGroup: stringOr(raw.ageGroup) ?? '',
    kcCertificationStatus: stringOr(raw.kcCertificationStatus) ?? '',
    kcCertificationNumber: stringOr(raw.kcCertificationNumber) ?? '',
    productSize: stringOr(raw.productSize) ?? '',
    colorVariantStatus: stringOr(raw.colorVariantStatus) ?? '',
    colorVariantNames: stringOr(raw.colorVariantNames) ?? '',
    boxSetStatus: stringOr(raw.boxSetStatus) ?? '',
    boxSetQuantity: stringOr(raw.boxSetQuantity) ?? '',
    salePrice: numberOr(raw.salePrice),
    originalPrice: numberOr(raw.originalPrice),
    discountRate: numberOr(raw.discountRate),
    tags: Array.isArray(candidate.tags)
      ? candidate.tags.filter((tag): tag is string => typeof tag === 'string')
      : [],
  };
}

function stringOr(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberOr(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
