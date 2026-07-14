import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  CandidateImageRow,
  CandidateRow,
  ProductPreparationRow,
  SourcingCandidateRepositoryPort,
  SourcingCandidateStateRow,
  UpsertCandidateInput,
} from '../../../application/port/out/repository/sourcing-candidate.repository.port';
import type { SourcingRepositoryTransaction } from '../../../application/port/out/transaction/repository-transaction';

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

  async findActiveBySourceUrl(input: {
    organizationId: string;
    sourceUrl: string;
  }): Promise<CandidateRow | null> {
    const row = await this.prisma.sourcingCandidate.findFirst({
      where: {
        organizationId: input.organizationId,
        sourceUrl: input.sourceUrl,
        isDeleted: false,
        status: 'sourced',
      },
      orderBy: { updatedAt: 'desc' },
    });
    return row ? toRow(row) : null;
  }

  async upsertSourced(input: UpsertCandidateInput): Promise<CandidateRow> {
    try {
      return await this.upsertSourcedInTransaction(input);
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      return this.upsertSourcedInTransaction(input);
    }
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
      const updated = await tx.sourcingCandidate.update({
        where: { id: existing.id },
        data: {
          rawData: mergeJson(existing.rawData, input.rawData) as Prisma.InputJsonValue,
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
          where: { organizationId, isDeleted: false },
          orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        },
      },
    });
    if (!row) return null;
    return hydrateCandidate(row);
  }

  async listSourced(query: {
    organizationId: string;
    page: number;
    limit: number;
    sort: 'newest' | 'oldest' | 'name_asc';
    platform?: string;
    sourcePlatforms?: string[];
  }) {
    const where: Prisma.SourcingCandidateWhereInput = {
      organizationId: query.organizationId,
      isDeleted: false,
      status: 'sourced',
      ...(query.platform
        ? { sourcePlatform: query.platform }
        : query.sourcePlatforms?.length
          ? { sourcePlatform: { in: query.sourcePlatforms } }
          : {}),
      channelListings: {
        none: { organizationId: query.organizationId, isActive: true },
      },
    };
    const orderBy =
      query.sort === 'oldest' ? { createdAt: 'asc' as const }
        : query.sort === 'name_asc' ? { name: 'asc' as const }
          : { createdAt: 'desc' as const };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.sourcingCandidate.count({ where }),
      this.prisma.sourcingCandidate.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          images: { where: { isDeleted: false }, orderBy: { sortOrder: 'asc' } },
          productPreparations: {
            where: { organizationId: query.organizationId, isDeleted: false },
            orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
          },
        },
      }),
    ]);
    return { total, items: rows.map(hydrateCandidate) };
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
      data: { isDeleted: true, deletedAt: input.archivedAt },
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
      data: { isDeleted: true, deletedAt: input.archivedAt },
    });
    return { archivedCandidate: true, archivedCandidateImages: images.count };
  }

  findCandidateState(
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

  rejectCandidate(
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

  private upsertSourcedInTransaction(input: UpsertCandidateInput): Promise<CandidateRow> {
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
      const data = {
        sourcePlatform: input.sourcePlatform,
        rawData: mergeJson(existing?.rawData, input.rawData) as Prisma.InputJsonValue,
        name: input.name,
        description: input.description,
        category: input.category,
        tags: input.tags,
        thumbnailUrl: input.thumbnailUrl,
        imageUrl: input.imageUrl,
        costCny: input.costCny ?? undefined,
      };
      const candidate = existing
        ? await tx.sourcingCandidate.update({ where: { id: existing.id }, data })
        : await tx.sourcingCandidate.create({
            data: {
              organizationId: input.organizationId,
              sourceUrl: input.sourceUrl,
              triggeredByUserId: input.triggeredByUserId,
              status: 'sourced',
              ...data,
            },
          });
      await this.ensureImages(tx, candidate.id, input.organizationId, input.images);
      return toRow(candidate);
    });
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
      data: images.map((image) => ({
        organizationId,
        candidateId,
        url: image.url,
        role: image.role,
        label: image.label,
        sortOrder: image.sortOrder,
        source: image.source,
        isPrimary: image.isPrimary,
      })),
    });
  }
}

function hydrateCandidate(row: any) {
  const productPreparations = row.productPreparations.map(toProductPreparationRow);
  return {
    ...toRow(row),
    images: row.images.map(toImageRow),
    productPreparation: productPreparations[0] ?? null,
    productPreparations,
  };
}

function toRow(row: any): CandidateRow {
  return {
    id: row.id,
    organizationId: row.organizationId,
    sourceUrl: row.sourceUrl,
    sourcePlatform: row.sourcePlatform,
    rawData: row.rawData,
    name: row.name,
    description: row.description,
    category: row.category,
    tags: row.tags,
    thumbnailUrl: row.thumbnailUrl,
    imageUrl: row.imageUrl,
    costCny: row.costCny,
    status: row.status,
    rejectedReason: row.rejectedReason,
    rejectedAt: row.rejectedAt,
    rejectedByUserId: row.rejectedByUserId,
    triggeredByUserId: row.triggeredByUserId,
    isDeleted: row.isDeleted,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toImageRow(image: any): CandidateImageRow {
  return {
    id: image.id,
    organizationId: image.organizationId,
    candidateId: image.candidateId,
    url: image.url,
    storageKey: image.storageKey,
    role: image.role,
    label: image.label,
    sortOrder: image.sortOrder,
    source: image.source,
    isPrimary: image.isPrimary,
    isDeleted: image.isDeleted,
  };
}

function toProductPreparationRow(preparation: any): ProductPreparationRow {
  return {
    id: preparation.id,
    sourceCandidateId: preparation.sourceCandidateId,
    channelAccountId: preparation.channelAccountId,
    sourceContentWorkspaceId: preparation.sourceContentWorkspaceId,
    channelListingId: preparation.channelListingId,
    displayName: preparation.displayName,
    status: preparation.status,
    selectedThumbnailUrl: preparation.selectedThumbnailUrl,
    selectedThumbnailGenerationId: preparation.selectedThumbnailGenerationId,
    selectedThumbnailGenerationCandidateId: preparation.selectedThumbnailGenerationCandidateId,
    selectedDetailPageArtifactId: preparation.selectedDetailPageArtifactId,
    selectedDetailPageRevisionId: preparation.selectedDetailPageRevisionId,
    selectedDetailPageGenerationId: preparation.selectedDetailPageGenerationId,
    registrationInput: preparation.registrationInput,
    createdAt: preparation.createdAt,
    updatedAt: preparation.updatedAt,
  };
}

function mergeJson(previous: unknown, incoming: object): object {
  const base = previous && typeof previous === 'object' && !Array.isArray(previous)
    ? previous as Record<string, unknown>
    : {};
  return { ...base, ...incoming };
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && (error as { code?: unknown }).code === 'P2002',
  );
}
