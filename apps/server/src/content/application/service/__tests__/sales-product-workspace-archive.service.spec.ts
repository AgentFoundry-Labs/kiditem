import { describe, expect, it, vi } from 'vitest';
import type { SalesProductWorkspaceArchiveRepositoryPort } from '../../port/out/repository/sales-product-workspace-archive.repository.port';
import { SalesProductWorkspaceArchiveService } from '../sales-product-workspace-archive.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const SALES_PRODUCT_ID = '22222222-2222-4222-8222-222222222222';
const ARCHIVED_AT = new Date('2026-05-15T08:00:00.000Z');

describe('AI SalesProductWorkspaceArchiveService', () => {
  it('delegates candidate AI artifact archival to the archive repository', async () => {
    const scope = {
      contentWorkspace: {
        updateMany: vi.fn(),
      },
      detailPage: {
        updateMany: vi.fn(),
      },
      contentAsset: {
        updateMany: vi.fn(),
      },
      thumbnailGeneration: {
        updateMany: vi.fn(),
      },
    };
    const repository: SalesProductWorkspaceArchiveRepositoryPort = {
      archiveSalesProductWorkspace: vi.fn().mockResolvedValue({
        archivedDetailPages: 1,
        archivedContentAssets: 3,
        archivedThumbnailGenerations: 4,
      }),
    };
    const service = new SalesProductWorkspaceArchiveService(repository);

    await expect(
      service.archiveSalesProductWorkspace(scope, {
        organizationId: ORG,
        salesProductId: SALES_PRODUCT_ID,
        archivedAt: ARCHIVED_AT,
      }),
    ).resolves.toEqual({
      archivedDetailPages: 1,
      archivedContentAssets: 3,
      archivedThumbnailGenerations: 4,
    });

    expect(repository.archiveSalesProductWorkspace).toHaveBeenCalledWith(scope, {
      organizationId: ORG,
      salesProductId: SALES_PRODUCT_ID,
      archivedAt: ARCHIVED_AT,
    });
  });
});
