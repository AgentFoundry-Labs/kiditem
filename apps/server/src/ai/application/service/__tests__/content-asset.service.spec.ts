import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { ContentAssetLibraryRepositoryPort } from '../../port/out/repository/content-asset-library.repository.port';
import { ContentAssetService } from '../content-asset.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const GROUP_ID = '22222222-2222-4222-8222-222222222222';
const GENERATION_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '99999999-9999-9999-9999-999999999999';

function repository(
  overrides: Partial<ContentAssetLibraryRepositoryPort> = {},
): ContentAssetLibraryRepositoryPort {
  return {
    recordDetailPageInputAssets: vi.fn(),
    recordDetailPageGeneratedAssets: vi.fn(),
    syncGenerationImageUsages: vi.fn(),
    syncGenerationImageUsagesInScope: vi.fn(),
    listAssets: vi.fn(),
    deleteAsset: vi.fn(),
    ...overrides,
  } as ContentAssetLibraryRepositoryPort;
}

describe('ContentAssetService', () => {
  it('blocks deletion while an active generation usage or thumbnail selection references the asset', async () => {
    const repo = repository({
      deleteAsset: vi.fn().mockResolvedValue({ status: 'in_use' }),
    });
    const service = new ContentAssetService(repo);

    await expect(service.deleteAsset(ORG, 'asset-1')).rejects.toBeInstanceOf(ConflictException);
    expect(repo.deleteAsset).toHaveBeenCalledWith({
      organizationId: ORG,
      contentAssetId: 'asset-1',
      deletedAt: expect.any(Date),
    });
  });

  it('delegates detail-page input asset recording to the asset library repository', async () => {
    const assets = [{
      id: 'asset-1',
      assetKey: 'group-url:group-1:hash',
      url: 'https://example.com/a.jpg',
      role: 'source',
      label: null,
      sortOrder: 0,
    }];
    const repo = repository({
      recordDetailPageInputAssets: vi.fn().mockResolvedValue(assets),
    });
    const service = new ContentAssetService(repo);

    await expect(service.recordDetailPageInputAssets({
      organizationId: ORG,
      generationGroupId: GROUP_ID,
      createdByUserId: USER_ID,
      imageUrls: ['https://example.com/a.jpg'],
    })).resolves.toEqual(assets);

    expect(repo.recordDetailPageInputAssets).toHaveBeenCalledWith({
      organizationId: ORG,
      generationGroupId: GROUP_ID,
      createdByUserId: USER_ID,
      imageUrls: ['https://example.com/a.jpg'],
    });
  });

  it('keeps existing transaction callers on an abstract asset write scope', async () => {
    const scope = {
      contentAsset: {
        createMany: vi.fn(),
        findMany: vi.fn(),
      },
      contentGenerationAssetUsage: {
        deleteMany: vi.fn(),
        createMany: vi.fn(),
      },
    };
    const repo = repository({
      syncGenerationImageUsagesInScope: vi.fn().mockResolvedValue([]),
    });
    const service = new ContentAssetService(repo);

    await service.syncGenerationImageUsagesTx(scope, {
      organizationId: ORG,
      generationGroupId: GROUP_ID,
      contentGenerationId: GENERATION_ID,
      createdByUserId: USER_ID,
      imageUrls: ['https://example.com/a.jpg'],
    });

    expect(repo.syncGenerationImageUsagesInScope).toHaveBeenCalledWith(scope, {
      organizationId: ORG,
      generationGroupId: GROUP_ID,
      contentGenerationId: GENERATION_ID,
      createdByUserId: USER_ID,
      imageUrls: ['https://example.com/a.jpg'],
    });
  });

  it('lists group assets through the product workspace relation', async () => {
    const createdAt = new Date('2026-05-13T09:00:00.000Z');
    const updatedAt = new Date('2026-05-13T09:30:00.000Z');
    const repo = repository({
      listAssets: vi.fn().mockResolvedValue({
        total: 1,
        rows: [
          {
            id: 'asset-1',
            generationGroupId: GROUP_ID,
            url: 'https://cdn.example.com/asset.png',
            assetType: 'image',
            role: 'used',
            label: 'hero',
            sortOrder: 0,
            metadata: { width: 1200 },
            createdAt,
            updatedAt,
            generationGroup: {
              targetMaster: {
                id: 'master-1',
                code: 'M-00000001',
                name: '큐브 퍼즐',
              },
            },
          },
        ],
      }),
    });
    const service = new ContentAssetService(repo);

    await expect(
      service.listAssets(ORG, { page: 2, limit: 10, productId: 'master-1' }),
    ).resolves.toEqual({
      items: [
        {
          id: 'asset-1',
          productId: 'master-1',
          generationGroupId: GROUP_ID,
          url: 'https://cdn.example.com/asset.png',
          assetType: 'image',
          role: 'used',
          label: 'hero',
          sortOrder: 0,
          metadata: { width: 1200 },
          product: {
            id: 'master-1',
            code: 'M-00000001',
            name: '큐브 퍼즐',
          },
          createdAt: createdAt.toISOString(),
          updatedAt: updatedAt.toISOString(),
        },
      ],
      total: 1,
      page: 2,
      limit: 10,
    });

    expect(repo.listAssets).toHaveBeenCalledWith({
      organizationId: ORG,
      page: 2,
      limit: 10,
      productId: 'master-1',
      generationId: null,
    });
  });
});
