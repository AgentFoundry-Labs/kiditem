import { describe, expect, it, vi } from 'vitest';
import { ContentArchiveService } from '../content-archive.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const PRODUCT_ID = '22222222-2222-4222-8222-222222222222';
const GROUP_ID = '33333333-3333-4333-8333-333333333333';

function row(overrides: Record<string, unknown>) {
  return {
    id: 'generation-1',
    organizationId: ORG,
    masterId: null,
    generationGroupId: null,
    contentType: 'detail_page',
    templateId: 'kids-playful',
    originalImages: ['https://cdn.example.com/input.jpg'],
    processedImages: {},
    generatedTitle: '상세페이지',
    generatedDescription: null,
    generatedCopy: null,
    detailPageHtml: null,
    editedHtml: null,
    editedHtmlSavedAt: null,
    status: 'READY',
    retryCount: 0,
    errorMessage: null,
    triggeredByUserId: null,
    createdAt: new Date('2026-05-13T08:00:00.000Z'),
    updatedAt: new Date('2026-05-13T09:00:00.000Z'),
    master: null,
    generationGroup: null,
    assets: [],
    sources: [],
    ...overrides,
  };
}

describe('ContentArchiveService', () => {
  it('lists product workspaces and unlinked group workspaces from ContentGeneration rows', async () => {
    const productRow = row({
      id: 'generation-product',
      masterId: PRODUCT_ID,
      contentType: 'detail_page',
      generatedTitle: '완성 상세페이지',
      processedImages: { __heroBanner: 'https://cdn.example.com/hero.jpg' },
      master: {
        id: PRODUCT_ID,
        code: 'M-00000001',
        name: '키즈 퍼즐',
        thumbnailUrl: null,
        imageUrl: 'https://cdn.example.com/product.jpg',
      },
      assets: [
        { id: 'asset-output', url: 'https://cdn.example.com/output.jpg', role: 'hero', label: null },
      ],
    });
    const groupRow = row({
      id: 'generation-group',
      generationGroupId: GROUP_ID,
      contentType: 'image',
      generatedTitle: '미연결 썸네일',
      generationGroup: { id: GROUP_ID, title: '미연결 작업', groupType: 'input_variation' },
      updatedAt: new Date('2026-05-13T08:30:00.000Z'),
    });
    const prisma = {
      contentGeneration: {
        findMany: vi.fn().mockResolvedValue([productRow, groupRow]),
      },
    };
    const service = new ContentArchiveService(prisma as never);

    await expect(service.listWorkspaces(ORG)).resolves.toMatchObject({
      total: 2,
      items: [
        {
          workspaceType: 'product',
          productId: PRODUCT_ID,
          title: '키즈 퍼즐',
          detailPageCount: 1,
          imageCount: 0,
          href: `/product-content/${PRODUCT_ID}`,
        },
        {
          workspaceType: 'unlinked_group',
          generationGroupId: GROUP_ID,
          title: '미연결 작업',
          detailPageCount: 0,
          imageCount: 1,
          href: `/product-content/groups/${GROUP_ID}`,
        },
      ],
    });

    expect(prisma.contentGeneration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: ORG },
        include: expect.objectContaining({
          assets: expect.objectContaining({
            where: { usageType: 'output', isDeleted: false },
          }),
        }),
      }),
    );
  });

  it('keeps product workspace queries scoped to the requested product id', async () => {
    const product = {
      id: PRODUCT_ID,
      code: 'M-00000001',
      name: '키즈 퍼즐',
      thumbnailUrl: null,
      imageUrl: null,
    };
    const prisma = {
      masterProduct: {
        findFirst: vi.fn().mockResolvedValue(product),
      },
      contentGeneration: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const service = new ContentArchiveService(prisma as never);

    await service.listProductWorkspace(ORG, PRODUCT_ID);

    expect(prisma.contentGeneration.count).toHaveBeenCalledWith({
      where: {
        organizationId: ORG,
        masterId: PRODUCT_ID,
      },
    });
    expect(prisma.contentGeneration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: ORG,
          masterId: PRODUCT_ID,
        },
      }),
    );
  });

  it('deletes a product workspace without deleting the MasterProduct row', async () => {
    const tx = {
      contentGeneration: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'generation-product-1', generationGroupId: GROUP_ID },
          { id: 'generation-product-2', generationGroupId: null },
        ]),
        deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      contentAsset: {
        updateMany: vi.fn().mockResolvedValue({ count: 3 }),
      },
      contentGenerationGroup: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: vi.fn((callback) => callback(tx)),
    };
    const service = new ContentArchiveService(prisma as never);

    await expect(service.deleteProductWorkspace(ORG, PRODUCT_ID)).resolves.toEqual({
      ok: true,
      deletedGenerations: 2,
      deletedAssets: 3,
    });

    expect(tx.contentGeneration.findMany).toHaveBeenCalledWith({
      where: { organizationId: ORG, masterId: PRODUCT_ID },
      select: { id: true, generationGroupId: true },
    });
    expect(tx.contentAsset.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: ORG,
        contentGenerationId: { in: ['generation-product-1', 'generation-product-2'] },
        isDeleted: false,
      },
      data: { isDeleted: true, deletedAt: expect.any(Date) },
    });
    expect(tx.contentGeneration.deleteMany).toHaveBeenCalledWith({
      where: {
        organizationId: ORG,
        id: { in: ['generation-product-1', 'generation-product-2'] },
      },
    });
    expect(tx.contentGenerationGroup.deleteMany).toHaveBeenCalledWith({
      where: {
        organizationId: ORG,
        id: { in: [GROUP_ID] },
        generations: { none: {} },
      },
    });
  });

  it('deletes an unlinked group workspace and its group row', async () => {
    const tx = {
      contentGenerationGroup: {
        findFirst: vi.fn().mockResolvedValue({ id: GROUP_ID }),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      contentGeneration: {
        findMany: vi.fn().mockResolvedValue([{ id: 'generation-group-1' }]),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      contentAsset: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: vi.fn((callback) => callback(tx)),
    };
    const service = new ContentArchiveService(prisma as never);

    await expect(service.deleteGroupWorkspace(ORG, GROUP_ID)).resolves.toEqual({
      ok: true,
      deletedGenerations: 1,
      deletedAssets: 1,
    });

    expect(tx.contentGenerationGroup.findFirst).toHaveBeenCalledWith({
      where: { id: GROUP_ID, organizationId: ORG },
      select: { id: true },
    });
    expect(tx.contentGeneration.findMany).toHaveBeenCalledWith({
      where: { organizationId: ORG, generationGroupId: GROUP_ID, masterId: null },
      select: { id: true },
    });
    expect(tx.contentGenerationGroup.deleteMany).toHaveBeenCalledWith({
      where: {
        id: GROUP_ID,
        organizationId: ORG,
        generations: { none: {} },
      },
    });
  });
});
