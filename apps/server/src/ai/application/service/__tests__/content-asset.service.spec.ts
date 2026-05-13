import { describe, expect, it, vi } from 'vitest';
import { ContentAssetService } from '../content-asset.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const MASTER_ID = '22222222-2222-4222-8222-222222222222';
const GENERATION_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '99999999-9999-9999-9999-999999999999';

describe('ContentAssetService', () => {
  it('records detail-page input image URLs as content assets with deterministic keys', async () => {
    const prisma = {
      contentAsset: {
        createMany: vi.fn().mockResolvedValue({ count: 2 }),
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'asset-input-1',
            assetKey: `detail-page-input:${GENERATION_ID}:0`,
            url: 'https://example.com/a.jpg',
            role: 'source',
            label: null,
            sortOrder: 0,
            usageType: 'input',
            originType: 'manual_upload',
          },
          {
            id: 'asset-input-2',
            assetKey: `detail-page-input:${GENERATION_ID}:1`,
            url: 'https://example.com/b.jpg',
            role: 'source',
            label: null,
            sortOrder: 1,
            usageType: 'input',
            originType: 'manual_upload',
          },
        ]),
      },
    };
    const service = new ContentAssetService(prisma as never);

    await service.recordDetailPageInputAssets({
      organizationId: ORG,
      contentGenerationId: GENERATION_ID,
      masterId: MASTER_ID,
      createdByUserId: USER_ID,
      imageUrls: ['https://example.com/a.jpg', 'https://example.com/b.jpg'],
    });

    expect(prisma.contentAsset.createMany).toHaveBeenCalledWith({
      skipDuplicates: true,
      data: [
        expect.objectContaining({
          organizationId: ORG,
          masterId: MASTER_ID,
          contentGenerationId: GENERATION_ID,
          createdByUserId: USER_ID,
          assetKey: `detail-page-input:${GENERATION_ID}:0`,
          url: 'https://example.com/a.jpg',
          sourceType: 'detail_page_input',
          pipelineType: 'detail_page',
          usageType: 'input',
          originType: 'manual_upload',
          role: 'source',
          sortOrder: 0,
        }),
        expect.objectContaining({
          assetKey: `detail-page-input:${GENERATION_ID}:1`,
          url: 'https://example.com/b.jpg',
          sortOrder: 1,
        }),
      ],
    });
    expect(prisma.contentAsset.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: ORG,
        assetKey: {
          in: [
            `detail-page-input:${GENERATION_ID}:0`,
            `detail-page-input:${GENERATION_ID}:1`,
          ],
        },
        isDeleted: false,
      },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        assetKey: true,
        url: true,
        role: true,
        label: true,
        sortOrder: true,
        usageType: true,
        originType: true,
      },
    });
  });

  it('records generated image URLs as content assets with role keys', async () => {
    const prisma = {
      contentAsset: {
        createMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
    };
    const service = new ContentAssetService(prisma as never);

    await service.recordDetailPageGeneratedAssets({
      organizationId: ORG,
      contentGenerationId: GENERATION_ID,
      masterId: null,
      processedImages: {
        __heroBanner: 'https://cdn.example.com/hero.png',
        '0': 'https://cdn.example.com/cut.png',
      },
    });

    expect(prisma.contentAsset.createMany).toHaveBeenCalledWith({
      skipDuplicates: true,
      data: [
        expect.objectContaining({
          organizationId: ORG,
          masterId: null,
          contentGenerationId: GENERATION_ID,
          assetKey: `detail-page-generated:${GENERATION_ID}:0`,
          url: 'https://cdn.example.com/cut.png',
          sourceType: 'detail_page_generated',
          pipelineType: 'detail_page',
          usageType: 'output',
          originType: 'generated',
          role: '0',
          sortOrder: 0,
        }),
        expect.objectContaining({
          assetKey: `detail-page-generated:${GENERATION_ID}:__heroBanner`,
          url: 'https://cdn.example.com/hero.png',
          role: '__heroBanner',
          sortOrder: 1,
        }),
      ],
    });
  });

  it('lists non-deleted assets with organization and optional product scope', async () => {
    const createdAt = new Date('2026-05-13T09:00:00.000Z');
    const updatedAt = new Date('2026-05-13T09:30:00.000Z');
    const prisma = {
      contentAsset: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'asset-1',
            masterId: MASTER_ID,
            contentGenerationId: GENERATION_ID,
            url: 'https://cdn.example.com/asset.png',
            assetType: 'image',
            sourceType: 'detail_page_generated',
            pipelineType: 'detail_page',
            usageType: 'output',
            originType: 'generated',
            role: '__heroBanner',
            label: 'hero',
            sortOrder: 0,
            metadata: { width: 1200 },
            createdAt,
            updatedAt,
            master: {
              id: MASTER_ID,
              code: 'M-00000001',
              name: '큐브 퍼즐',
            },
          },
        ]),
      },
    };
    const service = new ContentAssetService(prisma as never);

    await expect(
      service.listAssets(ORG, { page: 2, limit: 10, productId: MASTER_ID }),
    ).resolves.toEqual({
      items: [
        {
          id: 'asset-1',
          productId: MASTER_ID,
          generationId: GENERATION_ID,
          url: 'https://cdn.example.com/asset.png',
          assetType: 'image',
          sourceType: 'detail_page_generated',
          pipelineType: 'detail_page',
          usageType: 'output',
          originType: 'generated',
          role: '__heroBanner',
          label: 'hero',
          sortOrder: 0,
          metadata: { width: 1200 },
          product: {
            id: MASTER_ID,
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
    expect(prisma.contentAsset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: ORG,
          isDeleted: false,
          masterId: MASTER_ID,
        },
        skip: 10,
        take: 10,
      }),
    );
  });
});
