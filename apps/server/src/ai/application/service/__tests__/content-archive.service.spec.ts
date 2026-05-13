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
});
