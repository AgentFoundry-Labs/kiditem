import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ownerTransaction } from '../../../../prisma/owner-transaction';
import {
  DETAIL_PAGE_REPOSITORY_PORT,
  type DetailPageRepositoryPort,
} from '../../../application/port/out/repository/detail-page.repository.port';
import type {
  AiWorkspaceArchiveScope,
  ArchiveSalesProductWorkspaceInput,
  ArchiveSalesProductWorkspaceResult,
} from '../../../application/port/in/workspace/sales-product-workspace-archive.port';
import type { SalesProductWorkspaceArchiveRepositoryPort } from '../../../application/port/out/repository/sales-product-workspace-archive.repository.port';

/**
 * 초안을 내리면 그 작업공간이 가진 것을 모두 보관한다(KID-313 W3). 작업공간이 자산 · 상세 페이지 · 썸네일 job 의
 * 유일한 소유자이므로 작업공간 id 로 따라간다. revision 은 지우지 않는다 — 실행이 얼린 revision 은 그대로 읽힌다.
 * 두 현재 포인터(상세 revision · 대표이미지 자산)는 비운다 — 상세 포인터는 그 유일한 writer 인 상세 페이지 저장소로.
 */
@Injectable()
export class SalesProductWorkspaceArchiveRepositoryAdapter
implements SalesProductWorkspaceArchiveRepositoryPort {
  constructor(
    @Inject(DETAIL_PAGE_REPOSITORY_PORT)
    private readonly detailPages: DetailPageRepositoryPort,
  ) {}

  async archiveSalesProductWorkspace(
    scope: AiWorkspaceArchiveScope,
    input: ArchiveSalesProductWorkspaceInput,
  ): Promise<ArchiveSalesProductWorkspaceResult> {
    const tx = scope as unknown as Prisma.TransactionClient;
    const workspaceIds = await lockSalesProductContentWorkspaces(tx, input.organizationId, input.salesProductId);
    if (workspaceIds.length === 0) {
      return { archivedDetailPages: 0, archivedContentAssets: 0, archivedThumbnailGenerations: 0 };
    }
    const archived = archiveData(input.archivedAt);
    await this.detailPages.clearWorkspacePointers(ownerTransaction(tx), {
      organizationId: input.organizationId,
      contentWorkspaceIds: workspaceIds,
    });
    await scope.contentWorkspace.updateMany({
      where: { organizationId: input.organizationId, id: { in: workspaceIds } },
      data: {
        status: 'archived',
        currentThumbnailAssetId: null,
        ...archived,
      },
    });
    const owned = { organizationId: input.organizationId, contentWorkspaceId: { in: workspaceIds }, isDeleted: false };
    const detailPages = await scope.detailPage.updateMany({ where: owned, data: archived });
    const contentAssets = await scope.contentAsset.updateMany({ where: owned, data: archived });
    const thumbnailGenerations = await scope.thumbnailGeneration.updateMany({ where: owned, data: archived });
    return {
      archivedDetailPages: detailPages.count,
      archivedContentAssets: contentAssets.count,
      archivedThumbnailGenerations: thumbnailGenerations.count,
    };
  }
}

async function lockSalesProductContentWorkspaces(
  tx: Prisma.TransactionClient,
  organizationId: string,
  salesProductId: string,
): Promise<string[]> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id
    FROM content_workspaces
    WHERE organization_id = ${organizationId}::uuid
      AND sales_product_id = ${salesProductId}::uuid
      AND status = 'active'
      AND is_deleted = false
    ORDER BY id
    FOR UPDATE
  `);
  return rows.map(({ id }) => id);
}

function archiveData(archivedAt: Date) {
  return { isDeleted: true, deletedAt: archivedAt };
}
