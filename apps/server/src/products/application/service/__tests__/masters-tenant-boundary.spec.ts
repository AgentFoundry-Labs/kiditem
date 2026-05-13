import { describe, expect, it, vi } from 'vitest';
import { MastersService } from '../masters.service';

describe('MastersService tenant boundary internals', () => {
  it('re-reads a newly created master with organization scope inside the transaction', async () => {
    const row = {
      id: 'master-1',
      code: 'M-00000001',
      organizationId: 'organization-1',
      name: 'Scoped master',
      optionCounter: 0,
      images: [],
    };
    const tx = {
      masterProduct: {
        create: vi.fn().mockResolvedValue(row),
        findFirst: vi.fn().mockResolvedValue(row),
        findUniqueOrThrow: vi.fn().mockResolvedValue(row),
      },
      masterProductImage: {
        createMany: vi.fn(),
      },
    };
    const prisma = {
      $transaction: vi.fn((cb: (txArg: typeof tx) => Promise<unknown>) => cb(tx)),
    };
    const codeSvc = { generate: vi.fn().mockResolvedValue('M-00000001') };
    const svc = new MastersService(prisma as any, codeSvc as any, {} as any);

    await svc.create('organization-1', { name: 'Scoped master' } as any);

    expect(tx.masterProduct.findFirst).toHaveBeenCalledWith({
      where: { id: 'master-1', organizationId: 'organization-1' },
      include: expect.any(Object),
    });
    expect(tx.masterProduct.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('excludes AI detail-page generations from legacy history', async () => {
    const prisma = {
      masterProduct: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'master-1',
          code: 'M-00000001',
          organizationId: 'organization-1',
          name: 'History master',
          optionCounter: 0,
          images: [],
        }),
      },
      contentGeneration: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'bold-1',
            generatedTitle: 'KIDITEM DESIGN',
            status: 'READY',
            detailPageHtml: JSON.stringify({ templateId: 'bold-vertical', result: {} }),
            errorMessage: null,
            createdAt: new Date('2026-05-07T00:00:00.000Z'),
          },
          {
            id: 'legacy-1',
            generatedTitle: 'CA result',
            status: 'READY',
            detailPageHtml: JSON.stringify({ title: 'legacy detail page' }),
            errorMessage: null,
            createdAt: new Date('2026-05-06T00:00:00.000Z'),
          },
        ]),
      },
    };
    const svc = new MastersService(prisma as any, {} as any, {} as any);

    await expect(svc.getGenerationHistory('organization-1', 'master-1', 10)).resolves.toEqual([
      expect.objectContaining({ id: 'legacy-1' }),
    ]);
  });

  it('lists master-bound AI detail-page generations as product content cards', async () => {
    const createdAt = new Date('2026-05-12T10:00:00.000Z');
    const prisma = {
      contentGeneration: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'generation-1',
            masterId: 'master-1',
            generatedTitle: 'KIDITEM DESIGN 상세',
            status: 'READY',
            detailPageHtml: JSON.stringify({
              templateId: 'bold-vertical',
              rawInput: { rawTitle: '큐브 퍼즐' },
              result: { hook: { text: '생각이 돌아가는 큐브', titleSub: '초등 고학년 집중 놀이' } },
              imageUrls: ['https://example.com/source.jpg'],
            }),
            processedImages: { __heroBanner: '/processed/hero.png' },
            errorMessage: null,
            createdAt,
            updatedAt: createdAt,
            master: {
              id: 'master-1',
              code: 'M-00000001',
              name: '큐브 퍼즐',
              thumbnailUrl: 'https://example.com/thumb.jpg',
              imageUrl: 'https://example.com/main.jpg',
              isTemporary: true,
              images: [{ url: 'https://example.com/gallery.jpg' }],
              draftContent: { editedHtmlSavedAt: '2026-05-12T11:00:00.000Z' },
            },
          },
        ]),
      },
    };
    const svc = new MastersService(prisma as any, {} as any, {} as any);

    await expect(svc.listContentCards('organization-1', { page: 1, limit: 20 })).resolves.toEqual({
      items: [
        {
          generationId: 'generation-1',
          productId: 'master-1',
          productCode: 'M-00000001',
          productName: '큐브 퍼즐',
          title: 'KIDITEM DESIGN 상세',
          subtitle: '초등 고학년 집중 놀이',
          templateId: 'bold-vertical',
          status: 'completed',
          thumbnailUrl: '/processed/hero.png',
          errorMessage: null,
          isTemporaryProduct: true,
          editedHtmlSavedAt: '2026-05-12T11:00:00.000Z',
          createdAt: createdAt.toISOString(),
          updatedAt: createdAt.toISOString(),
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    });
    expect(prisma.contentGeneration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'organization-1' }),
        skip: 0,
        take: 20,
      }),
    );
  });
});
