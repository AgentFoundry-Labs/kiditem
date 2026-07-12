import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  AiWorkspaceArchiveScope,
  ArchiveSourcingWorkspaceInput,
  ArchiveSourcingWorkspaceResult,
} from '../../../application/port/in/workspace/sourcing-workspace-archive.port';
import type { SourcingWorkspaceArchiveRepositoryPort } from '../../../application/port/out/repository/sourcing-workspace-archive.repository.port';

@Injectable()
export class SourcingWorkspaceArchiveRepositoryAdapter
implements SourcingWorkspaceArchiveRepositoryPort {
  async archiveSourcingWorkspace(
    scope: AiWorkspaceArchiveScope,
    input: ArchiveSourcingWorkspaceInput,
  ): Promise<ArchiveSourcingWorkspaceResult> {
    const generationRows = await scope.contentGeneration.findMany({
      where: contentGenerationSourceCandidateWhere(input),
      select: { id: true },
    });
    const generationIds = generationRows.map((row) => row.id);
    const tx = scope as unknown as Prisma.TransactionClient;
    await lockContentGenerations(tx, input.organizationId, generationIds);
    await lockThumbnailGenerations(tx, input.organizationId, input.sourceCandidateId);

    const detailPageArtifacts = await scope.detailPageArtifact.updateMany({
      where: {
        organizationId: input.organizationId,
        isDeleted: false,
        OR: [
          { sourceCandidateId: input.sourceCandidateId },
          ...(generationIds.length > 0
            ? [{ sourceContentGenerationId: { in: generationIds } }]
            : []),
        ],
      },
      data: archiveData(input.archivedAt),
    });

    const assetWhere = {
      organizationId: input.organizationId,
      isDeleted: false,
      usages: {
        some: { contentGenerationId: { in: generationIds } },
        none: {
          contentGeneration: {
            organizationId: input.organizationId,
            isDeleted: false,
            id: { notIn: generationIds },
          },
        },
      },
      thumbnailSelections: {
        none: {
          currentForWorkspace: {
            is: {
              organizationId: input.organizationId,
              status: 'active',
              isDeleted: false,
            },
          },
        },
      },
    } satisfies Prisma.ContentAssetWhereInput;
    const lockedAssetIds = generationIds.length > 0
      ? await lockContentAssets(
          tx,
          input.organizationId,
          assetWhere,
        )
      : [];
    const contentAssets = lockedAssetIds.length > 0
      ? await scope.contentAsset.updateMany({
          where: {
            ...assetWhere,
            id: { in: lockedAssetIds },
          },
          data: archiveData(input.archivedAt),
        })
      : { count: 0 };

    const contentGenerations = generationIds.length > 0
      ? await scope.contentGeneration.updateMany({
        where: {
          organizationId: input.organizationId,
          isDeleted: false,
          id: { in: generationIds },
        },
        data: archiveData(input.archivedAt),
      })
      : { count: 0 };

    const thumbnailGenerations = await scope.thumbnailGeneration.updateMany({
      where: {
        organizationId: input.organizationId,
        sourceCandidateId: input.sourceCandidateId,
        isDeleted: false,
        thumbnailSelections: { none: {} },
      },
      data: archiveData(input.archivedAt),
    });

    return {
      archivedContentGenerations: contentGenerations.count,
      archivedDetailPageArtifacts: detailPageArtifacts.count,
      archivedContentAssets: contentAssets.count,
      archivedThumbnailGenerations: thumbnailGenerations.count,
    };
  }
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

async function lockThumbnailGenerations(
  tx: Prisma.TransactionClient,
  organizationId: string,
  sourceCandidateId: string,
): Promise<void> {
  await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id
    FROM thumbnail_generations
    WHERE organization_id = ${organizationId}::uuid
      AND source_candidate_id = ${sourceCandidateId}::uuid
      AND is_deleted = false
    ORDER BY id
    FOR UPDATE
  `);
}

function contentGenerationSourceCandidateWhere(input: ArchiveSourcingWorkspaceInput) {
  return {
    organizationId: input.organizationId,
    isDeleted: false,
    OR: [
      { sourceCandidateId: input.sourceCandidateId },
      { sources: { some: { sourceCandidateId: input.sourceCandidateId } } },
      { detailPageArtifact: { is: { sourceCandidateId: input.sourceCandidateId } } },
    ],
  };
}

function archiveData(archivedAt: Date) {
  return { isDeleted: true, deletedAt: archivedAt };
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
