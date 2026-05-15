import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  CandidateImageRow,
  CandidateRow,
  SourcingCandidateRepositoryPort,
  UpsertCandidateInput,
} from '../../../application/port/out/sourcing-candidate.repository.port';

@Injectable()
export class SourcingCandidateRepositoryAdapter implements SourcingCandidateRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

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
      include: { images: { where: { isDeleted: false }, orderBy: { sortOrder: 'asc' } } },
    });
    if (!row) return null;
    return {
      ...toRow(row),
      images: row.images.map(toImageRow),
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
      status: 'sourced',
      ...(query.platform
        ? { sourcePlatform: query.platform }
        : query.sourcePlatforms?.length
          ? { sourcePlatform: { in: query.sourcePlatforms } }
          : {}),
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
    tx: Prisma.TransactionClient,
    input: { id: string; organizationId: string; archivedAt: Date },
  ): Promise<{ archivedCandidate: boolean; archivedCandidateImages: number }> {
    const candidate = await tx.sourcingCandidate.updateMany({
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
    const images = await tx.candidateImage.updateMany({
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

function mergeJson(prev: unknown, incoming: object): object {
  const base = (prev && typeof prev === 'object' && !Array.isArray(prev)) ? (prev as Record<string, unknown>) : {};
  return { ...base, ...incoming };
}
