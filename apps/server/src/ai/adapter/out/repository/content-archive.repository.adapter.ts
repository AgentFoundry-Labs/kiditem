import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  ContentArchiveDeleteGroupResult,
  ContentArchiveDeleteResult,
  ContentArchiveGenerationRow,
  ContentArchiveRepositoryPort,
  ContentArchiveRepositoryQuery,
} from '../../../application/port/out/repository/content-archive.repository.port';

const generationInclude = {
  generationGroup: {
    select: {
      id: true,
      title: true,
      groupType: true,
      targetMasterId: true,
      targetMaster: {
        select: { id: true, code: true, name: true, thumbnailUrl: true, imageUrl: true },
      },
    },
  },
  assetUsages: {
    where: {
      contentAsset: { isDeleted: false },
    },
    orderBy: [{ createdAt: 'asc' }],
    select: {
      contentAsset: {
        select: { id: true, url: true, role: true, label: true, sortOrder: true, createdAt: true },
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
      sourceCandidateId: true,
      isDeleted: true,
      currentRevisionId: true,
      currentRevision: {
        select: {
          id: true,
          revisionType: true,
          createdAt: true,
        },
      },
      revisions: {
        orderBy: [{ createdAt: 'desc' }],
        take: 20,
        select: {
          id: true,
          revisionType: true,
          createdAt: true,
        },
      },
    },
  },
} satisfies Prisma.ContentGenerationInclude;

@Injectable()
export class ContentArchiveRepositoryAdapter implements ContentArchiveRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  listWorkspaceGenerations(input: {
    organizationId: string;
    query: ContentArchiveRepositoryQuery;
  }): Promise<ContentArchiveGenerationRow[]> {
    return this.prisma.contentGeneration.findMany({
      where: generationWhere(input.organizationId, input.query),
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: 500,
      include: generationInclude,
    }) as Promise<ContentArchiveGenerationRow[]>;
  }

  findProduct(input: { organizationId: string; productId: string }) {
    return this.prisma.masterProduct.findFirst({
      where: {
        id: input.productId,
        organizationId: input.organizationId,
        isDeleted: false,
      },
      select: { id: true, code: true, name: true, thumbnailUrl: true, imageUrl: true },
    });
  }

  async listProductWorkspaceGenerations(input: {
    organizationId: string;
    productId: string;
    query: ContentArchiveRepositoryQuery;
    page: number;
    limit: number;
  }): Promise<{ total: number; rows: ContentArchiveGenerationRow[] }> {
    const where = generationWhere(input.organizationId, {
      ...input.query,
      productId: input.productId,
      linkState: 'linked',
    });
    return this.listPage(where, input.page, input.limit);
  }

  findGroup(input: { organizationId: string; groupId: string }) {
    return this.prisma.contentGenerationGroup.findFirst({
      where: { id: input.groupId, organizationId: input.organizationId },
      select: { id: true, title: true, groupType: true },
    });
  }

  async listGroupWorkspaceGenerations(input: {
    organizationId: string;
    groupId: string;
    query: ContentArchiveRepositoryQuery;
    page: number;
    limit: number;
  }): Promise<{ total: number; rows: ContentArchiveGenerationRow[] }> {
    const where = generationWhere(input.organizationId, {
      ...input.query,
      linkState: 'unlinked',
    });
    const scopedWhere: Prisma.ContentGenerationWhereInput = {
      ...where,
      generationGroupId: input.groupId,
      generationGroup: { targetMasterId: null },
    };
    return this.listPage(scopedWhere, input.page, input.limit);
  }

  async deleteProductWorkspace(input: {
    organizationId: string;
    productId: string;
  }): Promise<ContentArchiveDeleteResult> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.contentGeneration.findMany({
        where: {
          organizationId: input.organizationId,
          isDeleted: false,
          generationGroup: { targetMasterId: input.productId },
        },
        select: { id: true, generationGroupId: true },
      });
      if (rows.length === 0) return { status: 'workspace_not_found' };
      const result = await deleteGenerationRows(
        tx,
        input.organizationId,
        rows.map((row) => row.id),
      );
      return { status: 'deleted', ...result };
    });
  }

  async deleteGroupWorkspace(input: {
    organizationId: string;
    groupId: string;
  }): Promise<ContentArchiveDeleteGroupResult> {
    return this.prisma.$transaction(async (tx) => {
      const group = await tx.contentGenerationGroup.findFirst({
        where: { id: input.groupId, organizationId: input.organizationId },
        select: { id: true },
      });
      if (!group) return { status: 'group_not_found' };

      const rows = await tx.contentGeneration.findMany({
        where: {
          organizationId: input.organizationId,
          isDeleted: false,
          generationGroupId: input.groupId,
          generationGroup: { targetMasterId: null },
        },
        select: { id: true },
      });
      if (rows.length === 0) return { status: 'workspace_not_found' };

      const result = await deleteGenerationRows(
        tx,
        input.organizationId,
        rows.map((row) => row.id),
      );
      return { status: 'deleted', ...result };
    });
  }

  findSourcingCandidate(input: { organizationId: string; candidateId: string }) {
    return this.prisma.sourcingCandidate.findFirst({
      where: {
        id: input.candidateId,
        organizationId: input.organizationId,
        isDeleted: false,
      },
      select: { id: true, promotedMasterId: true },
    });
  }

  listSourcingCandidateGenerations(input: {
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
    return this.listPage(where, input.page, input.limit);
  }

  listPromotedProductGenerations(input: {
    organizationId: string;
    productId: string;
    query: ContentArchiveRepositoryQuery;
    page: number;
    limit: number;
  }): Promise<{ total: number; rows: ContentArchiveGenerationRow[] }> {
    const where = generationWhere(input.organizationId, {
      ...input.query,
      productId: input.productId,
      linkState: 'linked',
    });
    return this.listPage(where, input.page, input.limit);
  }

  private async listPage(
    where: Prisma.ContentGenerationWhereInput,
    page: number,
    limit: number,
  ): Promise<{ total: number; rows: ContentArchiveGenerationRow[] }> {
    const [total, rows] = await Promise.all([
      this.prisma.contentGeneration.count({ where }),
      this.prisma.contentGeneration.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: generationInclude,
      }),
    ]);
    return { total, rows: rows as ContentArchiveGenerationRow[] };
  }
}

function generationWhere(
  organizationId: string,
  query: ContentArchiveRepositoryQuery,
): Prisma.ContentGenerationWhereInput {
  const masterScope: Prisma.ContentGenerationWhereInput =
    query.productId
      ? { generationGroup: { targetMasterId: query.productId } }
      : query.linkState === 'linked'
        ? { generationGroup: { targetMasterId: { not: null } } }
        : query.linkState === 'unlinked'
          ? { generationGroup: { targetMasterId: null } }
          : {};
  return {
    organizationId,
    isDeleted: false,
    ...(query.contentType ? { contentType: query.contentType } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...masterScope,
    ...(query.sourceCandidateId
      ? {
          OR: [
            { sourceCandidateId: query.sourceCandidateId },
            { sources: { some: { sourceCandidateId: query.sourceCandidateId } } },
            { detailPageArtifact: { is: { sourceCandidateId: query.sourceCandidateId, isDeleted: false } } },
          ],
        }
      : {}),
  };
}

async function deleteGenerationRows(
  tx: Prisma.TransactionClient,
  organizationId: string,
  generationIds: string[],
): Promise<{ deletedGenerations: number; deletedAssets: number }> {
  const archivedAt = new Date();
  await lockContentGenerations(tx, organizationId, generationIds);
  const assetWhere = {
    organizationId,
    isDeleted: false,
    usages: {
      some: { contentGenerationId: { in: generationIds } },
      none: {
        contentGeneration: {
          organizationId,
          isDeleted: false,
          id: { notIn: generationIds },
        },
      },
    },
    thumbnailSelections: {
      none: {
        currentForWorkspace: {
          is: {
            organizationId,
            status: 'active',
            isDeleted: false,
          },
        },
      },
    },
  } satisfies Prisma.ContentAssetWhereInput;
  const lockedAssetIds = await lockContentAssets(tx, organizationId, assetWhere);
  const assets = lockedAssetIds.length > 0
    ? await tx.contentAsset.updateMany({
        where: { ...assetWhere, id: { in: lockedAssetIds } },
        data: { isDeleted: true, deletedAt: archivedAt },
      })
    : { count: 0 };
  const generationResult = await tx.contentGeneration.updateMany({
    where: { organizationId, id: { in: generationIds }, isDeleted: false },
    data: { isDeleted: true, deletedAt: archivedAt },
  });
  return {
    deletedGenerations: generationResult.count,
    deletedAssets: assets.count,
  };
}

async function lockContentGenerations(
  tx: Prisma.TransactionClient,
  organizationId: string,
  generationIds: string[],
): Promise<void> {
  if (generationIds.length === 0) return;
  await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id
    FROM content_generations
    WHERE organization_id = ${organizationId}::uuid
      AND id IN (${Prisma.join(generationIds.map((id) => Prisma.sql`${id}::uuid`))})
      AND is_deleted = false
    ORDER BY id
    FOR UPDATE
  `);
}

async function lockContentAssets(
  tx: Prisma.TransactionClient,
  organizationId: string,
  where: Prisma.ContentAssetWhereInput,
): Promise<string[]> {
  const candidates = await tx.contentAsset.findMany({
    where,
    orderBy: { id: 'asc' },
    select: { id: true },
  });
  if (candidates.length === 0) return [];
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id
    FROM content_assets
    WHERE organization_id = ${organizationId}::uuid
      AND id IN (${Prisma.join(candidates.map(({ id }) => Prisma.sql`${id}::uuid`))})
      AND is_deleted = false
    ORDER BY id
    FOR UPDATE
  `);
  return rows.map(({ id }) => id);
}
