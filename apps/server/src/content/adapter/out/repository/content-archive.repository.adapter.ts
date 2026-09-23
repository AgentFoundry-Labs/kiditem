import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  ContentArchiveGenerationRow,
  ContentArchiveRepositoryPort,
  ContentArchiveRepositoryQuery,
} from '../../../application/port/out/repository/content-archive.repository.port';
import { DetailPageRevisionTypeSchema } from '../../../domain/detail-page/detail-page-revision-type';

const generationInclude = {
  contentWorkspace: {
    select: {
      id: true,
      ownerType: true,
      salesProductId: true,
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
    return rows.map(toArchiveRow);
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
    return { total, rows: rows.map(toArchiveRow) };
  }
}

type ArchiveGenerationRecord = Prisma.ContentGenerationGetPayload<{ include: typeof generationInclude }>;

/** revision 종류는 정한 목록 안의 값만 읽는다 — 목록 밖의 값은 writer 가 깨진 것이다. */
function toArchiveRow(row: ArchiveGenerationRecord): ContentArchiveGenerationRow {
  const artifact = row.detailPageArtifact;
  return {
    ...row,
    detailPageArtifact: artifact
      ? {
        ...artifact,
        currentRevision: artifact.currentRevision
          ? { ...artifact.currentRevision, revisionType: DetailPageRevisionTypeSchema.parse(artifact.currentRevision.revisionType) }
          : null,
        revisions: artifact.revisions.map((revision) => ({
          ...revision,
          revisionType: DetailPageRevisionTypeSchema.parse(revision.revisionType),
        })),
      }
      : null,
  } as unknown as ContentArchiveGenerationRow;
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
    // ContentGenerationSource keeps the sourcing-candidate id as provenance, so
    // "what did this candidate produce" is still answerable after the workspace
    // moved to the sales-product draft.
    ...(query.sourceCandidateId
      ? { sources: { some: { sourceCandidateId: query.sourceCandidateId } } }
      : {}),
  };
}
