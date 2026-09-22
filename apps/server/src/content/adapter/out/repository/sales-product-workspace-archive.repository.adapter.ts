import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  AiWorkspaceArchiveScope,
  ArchiveSalesProductWorkspaceInput,
  ArchiveSalesProductWorkspaceResult,
} from '../../../application/port/in/workspace/sales-product-workspace-archive.port';
import type { SalesProductWorkspaceArchiveRepositoryPort } from '../../../application/port/out/repository/sales-product-workspace-archive.repository.port';

@Injectable()
export class SalesProductWorkspaceArchiveRepositoryAdapter
implements SalesProductWorkspaceArchiveRepositoryPort {
  async archiveSalesProductWorkspace(
    scope: AiWorkspaceArchiveScope,
    input: ArchiveSalesProductWorkspaceInput,
  ): Promise<ArchiveSalesProductWorkspaceResult> {
    const tx = scope as unknown as Prisma.TransactionClient;
    await lockSalesProductContentWorkspaces(tx, input.organizationId, input.salesProductId);
    await scope.contentWorkspace.updateMany({
      where: {
        organizationId: input.organizationId,
        salesProductId: input.salesProductId,
        status: 'active',
        isDeleted: false,
      },
      data: {
        status: 'archived',
        currentThumbnailSelectionId: null,
        ...archiveData(input.archivedAt),
      },
    });

    const generationRows = await scope.contentGeneration.findMany({
      where: workspaceGenerationWhere(input),
      select: { id: true },
    });
    const generationIds = generationRows.map((row) => row.id);
    await lockContentGenerations(tx, input.organizationId, generationIds);
    await lockThumbnailGenerations(tx, input.organizationId, input.salesProductId);

    const detailPageArtifacts = await scope.detailPageArtifact.updateMany({
      where: {
        organizationId: input.organizationId,
        isDeleted: false,
        OR: [
          { contentWorkspace: { salesProductId: input.salesProductId } },
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
        contentWorkspace: { salesProductId: input.salesProductId },
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

async function lockSalesProductContentWorkspaces(
  tx: Prisma.TransactionClient,
  organizationId: string,
  salesProductId: string,
): Promise<void> {
  await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id
    FROM content_workspaces
    WHERE organization_id = ${organizationId}::uuid
      AND sales_product_id = ${salesProductId}::uuid
      AND status = 'active'
      AND is_deleted = false
    ORDER BY id
    FOR UPDATE
  `);
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
  salesProductId: string,
): Promise<void> {
  await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT g.id
    FROM thumbnail_generations g
    JOIN content_workspaces w
      ON w.id = g.content_workspace_id
     AND w.organization_id = g.organization_id
    WHERE g.organization_id = ${organizationId}::uuid
      AND w.sales_product_id = ${salesProductId}::uuid
      AND g.is_deleted = false
    ORDER BY g.id
    FOR UPDATE OF g
  `);
}

/**
 * The workspace is the only owner a generation has now, so archiving follows
 * the workspace instead of the three-way candidate fan-out it replaced.
 */
function workspaceGenerationWhere(input: ArchiveSalesProductWorkspaceInput) {
  return {
    organizationId: input.organizationId,
    isDeleted: false,
    contentWorkspace: { salesProductId: input.salesProductId },
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
