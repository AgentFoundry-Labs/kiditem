import { describe, expect, it, vi } from 'vitest';
import type { DetailPageRepositoryPort } from '../../../../application/port/out/repository/detail-page.repository.port';
import { SalesProductWorkspaceArchiveRepositoryAdapter } from '../sales-product-workspace-archive.repository.adapter';

const ORG = '11111111-1111-4111-8111-111111111111';
const SALES_PRODUCT_ID = '22222222-2222-4222-8222-222222222222';
const WORKSPACE_ID = '33333333-3333-4333-8333-333333333333';
const ARCHIVED_AT = new Date('2026-05-15T08:00:00.000Z');

/** 상세 포인터는 상세 페이지 저장소만 옮긴다 — 보관도 그 port 로 비운다. */
function detailPages() {
  return { clearWorkspacePointers: vi.fn().mockResolvedValue(undefined) };
}

function adapter(pages = detailPages()) {
  return new SalesProductWorkspaceArchiveRepositoryAdapter(pages as unknown as DetailPageRepositoryPort);
}

describe('SalesProductWorkspaceArchiveRepositoryAdapter', () => {
  it('archives the draft workspace, its detail pages, its assets and its thumbnail jobs, and clears both current pointers', async () => {
    const scope = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ id: WORKSPACE_ID }])
        .mockResolvedValue([]),
      contentWorkspace: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      detailPage: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
      contentAsset: { updateMany: vi.fn().mockResolvedValue({ count: 3 }) },
      thumbnailGeneration: { updateMany: vi.fn().mockResolvedValue({ count: 4 }) },
    };

    const pages = detailPages();
    await expect(adapter(pages).archiveSalesProductWorkspace(scope, {
      organizationId: ORG,
      salesProductId: SALES_PRODUCT_ID,
      archivedAt: ARCHIVED_AT,
    })).resolves.toEqual({
      archivedDetailPages: 2,
      archivedContentAssets: 3,
      archivedThumbnailGenerations: 4,
    });

    const archived = { isDeleted: true, deletedAt: ARCHIVED_AT };
    expect(scope.contentWorkspace.updateMany).toHaveBeenCalledWith({
      where: { organizationId: ORG, id: { in: [WORKSPACE_ID] } },
      data: {
        status: 'archived',
        currentThumbnailAssetId: null,
        ...archived,
      },
    });
    expect(pages.clearWorkspacePointers).toHaveBeenCalledWith(expect.anything(), {
      organizationId: ORG, contentWorkspaceIds: [WORKSPACE_ID],
    });
    // revision 은 지우지 않는다 — 몰 실행이 얼린 revision 이 그대로 읽힌다.
    expect(scope.detailPage.updateMany).toHaveBeenCalledWith({
      where: { organizationId: ORG, contentWorkspaceId: { in: [WORKSPACE_ID] }, isDeleted: false },
      data: archived,
    });
    expect(scope.contentAsset.updateMany).toHaveBeenCalledWith({
      where: { organizationId: ORG, contentWorkspaceId: { in: [WORKSPACE_ID] }, isDeleted: false },
      data: archived,
    });
    expect(scope.thumbnailGeneration.updateMany).toHaveBeenCalledWith({
      where: { organizationId: ORG, contentWorkspaceId: { in: [WORKSPACE_ID] }, isDeleted: false },
      data: archived,
    });
    // 작업공간을 먼저 잠근다.
    expect(scope.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      scope.contentWorkspace.updateMany.mock.invocationCallOrder[0],
    );
  });

  it('does nothing for a draft without an active workspace', async () => {
    const scope = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      contentWorkspace: { updateMany: vi.fn() },
      detailPage: { updateMany: vi.fn() },
      contentAsset: { updateMany: vi.fn() },
      thumbnailGeneration: { updateMany: vi.fn() },
    };

    await expect(adapter().archiveSalesProductWorkspace(scope, {
      organizationId: ORG,
      salesProductId: SALES_PRODUCT_ID,
      archivedAt: ARCHIVED_AT,
    })).resolves.toEqual({ archivedDetailPages: 0, archivedContentAssets: 0, archivedThumbnailGenerations: 0 });
    expect(scope.contentWorkspace.updateMany).not.toHaveBeenCalled();
  });
});
