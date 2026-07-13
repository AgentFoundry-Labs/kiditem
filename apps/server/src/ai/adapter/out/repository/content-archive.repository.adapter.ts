import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  ContentArchiveGenerationRow,
  ContentArchiveRepositoryPort,
  ContentArchiveRepositoryQuery,
} from '../../../application/port/out/repository/content-archive.repository.port';

const generationInclude = {
  contentWorkspace: {
    select: {
      id: true,
      ownerType: true,
      sourceCandidateId: true,
      channelListingId: true,
      displayName: true,
    },
  },
  generationGroup: {
    select: { id: true, title: true, groupType: true },
  },
  assetUsages: {
    where: { contentAsset: { isDeleted: false } },
    orderBy: [{ createdAt: 'asc' }],
    select: {
      contentAsset: {
        select: {
          id: true,
          url: true,
          role: true,
          label: true,
          sortOrder: true,
          createdAt: true,
        },
      },
    },
  },
  sources: {
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      sourceType: true,
      sourceCandidateId: true,
      sourceContentGenerationId: true,
      contentAssetId: true,
      label: true,
    },
  },
  detailPageArtifact: {
    select: {
      id: true,
      isDeleted: true,
      currentRevisionId: true,
      currentRevision: {
        select: { id: true, revisionType: true, createdAt: true },
      },
      revisions: {
        orderBy: [{ createdAt: 'desc' }],
        take: 20,
        select: { id: true, revisionType: true, createdAt: true },
      },
    },
  },
} satisfies Prisma.ContentGenerationInclude;

@Injectable()
export class ContentArchiveRepositoryAdapter implements ContentArchiveRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async listWorkspaceGenerations(input: {
    organizationId: string;
    query: ContentArchiveRepositoryQuery;
  }): Promise<ContentArchiveGenerationRow[]> {
    const rows = await this.prisma.contentGeneration.findMany({
      where: generationWhere(input.organizationId, input.query),
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: 500,
      include: generationInclude,
    });
    return rows as unknown as ContentArchiveGenerationRow[];
  }

  findSourcingCandidate(input: { organizationId: string; candidateId: string }) {
    return this.prisma.sourcingCandidate.findFirst({
      where: {
        id: input.candidateId,
        organizationId: input.organizationId,
        isDeleted: false,
      },
      select: { id: true },
    });
  }

  async listSourcingCandidateGenerations(input: {
    organizationId: string;
    candidateId: string;
    query: ContentArchiveRepositoryQuery;
    page: number;
    limit: number;
  }): Promise<{ total: number; rows: ContentArchiveGenerationRow[] }> {
    const where = generationWhere(input.organizationId, {
      ...input.query,
      sourceCandidateId: input.candidateId,
    });
    const [total, rows] = await Promise.all([
      this.prisma.contentGeneration.count({ where }),
      this.prisma.contentGeneration.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        skip: (input.page - 1) * input.limit,
        take: input.limit,
        include: generationInclude,
      }),
    ]);
    return { total, rows: rows as unknown as ContentArchiveGenerationRow[] };
  }
}

function generationWhere(
  organizationId: string,
  query: ContentArchiveRepositoryQuery,
): Prisma.ContentGenerationWhereInput {
  return {
    organizationId,
    isDeleted: false,
    ...(query.contentType ? { contentType: query.contentType } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.contentWorkspaceId
      ? { contentWorkspaceId: query.contentWorkspaceId }
      : {}),
    ...(query.sourceCandidateId
      ? {
          OR: [
            { sourceCandidateId: query.sourceCandidateId },
            { sources: { some: { sourceCandidateId: query.sourceCandidateId } } },
            { contentWorkspace: { sourceCandidateId: query.sourceCandidateId } },
          ],
        }
      : {}),
  };
}
