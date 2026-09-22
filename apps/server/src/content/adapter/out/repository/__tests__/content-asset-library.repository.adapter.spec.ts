import { describe, expect, it, vi } from 'vitest';
import { ContentAssetLibraryRepositoryAdapter } from '../content-asset-library.repository.adapter';

const ORG = '11111111-1111-4111-8111-111111111111';
const GROUP_ID = '22222222-2222-4222-8222-222222222222';
const GENERATION_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '99999999-9999-9999-9999-999999999999';

function makePrisma() {
  const tx = {
    $queryRaw: vi.fn()
      .mockResolvedValueOnce([{ id: GENERATION_ID }])
      .mockResolvedValue([
        { id: 'asset-1' },
        { id: 'asset-2' },
      ]),
    contentAsset: {
      createMany: vi.fn().mockResolvedValue({ count: 2 }),
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'asset-1',
          assetKey: expect.stringContaining(`group-url:${GROUP_ID}:`),
          url: 'https://example.com/a.jpg',
          role: 'source',
          label: null,
          sortOrder: 0,
        },
        {
          id: 'asset-2',
          assetKey: expect.stringContaining(`group-url:${GROUP_ID}:`),
          url: 'https://example.com/b.jpg',
          role: 'source',
          label: null,
          sortOrder: 1,
        },
      ]),
    },
    contentGenerationAssetUsage: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
  };
  return {
    tx,
    prisma: {
      ...tx,
      $transaction: vi.fn((fn: (txArg: typeof tx) => unknown) => fn(tx)),
    },
  };
}

describe('ContentAssetLibraryRepositoryAdapter', () => {
  it('does not soft-delete an asset with active usages or a current active-workspace selection', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'asset-1' }]),
      contentAsset: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'asset-1',
          _count: { usages: 1, thumbnailSelections: 1 },
        }),
        updateMany: vi.fn(),
      },
    };
    const prisma = {
      $transaction: vi.fn((operation: (scope: typeof tx) => unknown) => operation(tx)),
    };
    const repository = new ContentAssetLibraryRepositoryAdapter(prisma as never);

    await expect(repository.deleteAsset({
      organizationId: ORG,
      contentAssetId: 'asset-1',
      deletedAt: new Date('2026-07-12T00:00:00.000Z'),
    })).resolves.toEqual({ status: 'in_use' });
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.contentAsset.findFirst.mock.invocationCallOrder[0],
    );
    expect(tx.contentAsset.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'asset-1',
        organizationId: ORG,
        isDeleted: false,
      },
      select: {
        id: true,
        _count: {
          select: {
            usages: {
              where: {
                contentGeneration: {
                  organizationId: ORG,
                  isDeleted: false,
                },
              },
            },
            thumbnailSelections: {
              where: {
                currentForWorkspace: {
                  is: {
                    organizationId: ORG,
                    status: 'active',
                    isDeleted: false,
                  },
                },
              },
            },
          },
        },
      },
    });
    expect(tx.contentAsset.updateMany).not.toHaveBeenCalled();
  });

  it('dedupes detail-page input image URLs into group-scoped content assets', async () => {
    const { prisma, tx } = makePrisma();
    const storage = {
      extractKey: vi.fn((url: string) => {
        if (url === 'http://storage.local/kiditem/detail-page-inputs/a.jpg') {
          return 'detail-page-inputs/a.jpg';
        }
        return null;
      }),
    };
    const repository = new ContentAssetLibraryRepositoryAdapter(prisma as never, storage as never);

    await repository.recordDetailPageInputAssets({
      organizationId: ORG,
      generationGroupId: GROUP_ID,
      createdByUserId: USER_ID,
      imageUrls: [
        'http://storage.local/kiditem/detail-page-inputs/a.jpg',
        'http://storage.local/kiditem/detail-page-inputs/a.jpg',
        'https://example.com/b.jpg',
      ],
    });

    expect(tx.contentAsset.createMany).toHaveBeenCalledWith({
      skipDuplicates: true,
      data: [
        expect.objectContaining({
          organizationId: ORG,
          originGenerationGroupId: GROUP_ID,
          createdByUserId: USER_ID,
          assetKey: expect.stringMatching(new RegExp(`^group-url:${GROUP_ID}:`)),
          url: 'http://storage.local/kiditem/detail-page-inputs/a.jpg',
          storageKey: 'detail-page-inputs/a.jpg',
          assetType: 'image',
          role: 'source',
          sortOrder: 0,
          metadata: expect.objectContaining({ urlHash: expect.any(String) }),
        }),
        expect.objectContaining({
          url: 'https://example.com/b.jpg',
          storageKey: null,
          sortOrder: 2,
        }),
      ],
    });
  });

  it('replaces a generation usage set from current image URLs', async () => {
    const { prisma, tx } = makePrisma();
    const repository = new ContentAssetLibraryRepositoryAdapter(prisma as never);

    await repository.syncGenerationImageUsages({
      organizationId: ORG,
      generationGroupId: GROUP_ID,
      contentGenerationId: GENERATION_ID,
      createdByUserId: USER_ID,
      imageUrls: ['https://example.com/a.jpg', 'https://example.com/b.jpg'],
    });

    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.$queryRaw.mock.invocationCallOrder[1],
    );
    expect(tx.$queryRaw.mock.invocationCallOrder[1]).toBeLessThan(
      tx.contentGenerationAssetUsage.deleteMany.mock.invocationCallOrder[0],
    );
    expect(tx.contentGenerationAssetUsage.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: ORG, contentGenerationId: GENERATION_ID },
    });
    expect(tx.contentGenerationAssetUsage.createMany).toHaveBeenCalledWith({
      skipDuplicates: true,
      data: [
        { organizationId: ORG, contentGenerationId: GENERATION_ID, contentAssetId: 'asset-1' },
        { organizationId: ORG, contentGenerationId: GENERATION_ID, contentAssetId: 'asset-2' },
      ],
    });
  });

  it('rejects usage replacement when an asset cannot be locked as active', async () => {
    const { prisma, tx } = makePrisma();
    tx.$queryRaw.mockResolvedValueOnce([{ id: 'asset-1' }]);
    const repository = new ContentAssetLibraryRepositoryAdapter(prisma as never);

    await expect(repository.syncGenerationImageUsages({
      organizationId: ORG,
      generationGroupId: GROUP_ID,
      contentGenerationId: GENERATION_ID,
      createdByUserId: USER_ID,
      imageUrls: ['https://example.com/a.jpg', 'https://example.com/b.jpg'],
    })).rejects.toThrow('Content asset selection changed while usages were being updated.');

    expect(tx.contentGenerationAssetUsage.deleteMany).not.toHaveBeenCalled();
    expect(tx.contentGenerationAssetUsage.createMany).not.toHaveBeenCalled();
  });

  it('lists assets through workspace and generation filters', async () => {
    const prisma = {
      contentAsset: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const repository = new ContentAssetLibraryRepositoryAdapter(prisma as never);

    await repository.listAssets({
      organizationId: ORG,
      page: 2,
      limit: 10,
      contentWorkspaceId: 'workspace-1',
      generationId: 'generation-1',
    });

    expect(prisma.contentAsset.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organizationId: ORG,
        isDeleted: false,
        originGenerationGroup: { contentWorkspaceId: 'workspace-1' },
        usages: { some: { contentGenerationId: 'generation-1' } },
      },
      skip: 10,
      take: 10,
    }));
  });
});
