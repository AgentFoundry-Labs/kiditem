import { describe, expect, it, vi } from 'vitest';
import { ContentAssetService } from '../content-asset.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const GROUP_ID = '22222222-2222-4222-8222-222222222222';
const GENERATION_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '99999999-9999-9999-9999-999999999999';

function makePrisma() {
  const tx = {
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

describe('ContentAssetService', () => {
  it('dedupes detail-page input image URLs into group-scoped content assets', async () => {
    const { prisma, tx } = makePrisma();
    const service = new ContentAssetService(prisma as never);

    await service.recordDetailPageInputAssets({
      organizationId: ORG,
      generationGroupId: GROUP_ID,
      createdByUserId: USER_ID,
      imageUrls: ['https://example.com/a.jpg', 'https://example.com/a.jpg', 'https://example.com/b.jpg'],
    });

    expect(tx.contentAsset.createMany).toHaveBeenCalledWith({
      skipDuplicates: true,
      data: [
        expect.objectContaining({
          organizationId: ORG,
          generationGroupId: GROUP_ID,
          createdByUserId: USER_ID,
          assetKey: expect.stringMatching(new RegExp(`^group-url:${GROUP_ID}:`)),
          url: 'https://example.com/a.jpg',
          assetType: 'image',
          role: 'source',
          sortOrder: 0,
        }),
        expect.objectContaining({
          url: 'https://example.com/b.jpg',
          sortOrder: 2,
        }),
      ],
    });
  });

  it('replaces a generation usage set from current image URLs', async () => {
    const { prisma, tx } = makePrisma();
    const service = new ContentAssetService(prisma as never);

    await service.syncGenerationImageUsages({
      organizationId: ORG,
      generationGroupId: GROUP_ID,
      contentGenerationId: GENERATION_ID,
      createdByUserId: USER_ID,
      imageUrls: ['https://example.com/a.jpg', 'https://example.com/b.jpg'],
    });

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

  it('lists group assets through the product workspace relation', async () => {
    const createdAt = new Date('2026-05-13T09:00:00.000Z');
    const updatedAt = new Date('2026-05-13T09:30:00.000Z');
    const prisma = {
      contentAsset: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([
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
        ]),
      },
    };
    const service = new ContentAssetService(prisma as never);

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
  });
});
