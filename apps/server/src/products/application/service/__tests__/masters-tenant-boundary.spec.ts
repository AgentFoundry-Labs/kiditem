import { describe, expect, it, vi } from 'vitest';
import { MastersService } from '../masters.service';

function buildService(overrides: {
  masters?: Record<string, unknown>;
  transactions?: Record<string, unknown>;
} = {}) {
  const tx = { tx: true };
  const masters = {
    create: vi.fn().mockResolvedValue({
      id: 'master-1',
      code: 'M-00000001',
      organizationId: 'organization-1',
      name: 'Scoped master',
      optionCounter: 0,
      tags: [],
      images: [],
    }),
    findById: vi.fn(),
    findGenerationHistoryRows: vi.fn(),
    listProductContentCards: vi.fn(),
    ...overrides.masters,
  };
  const transactions = {
    run: vi.fn((cb: (txArg: typeof tx) => Promise<unknown>) => cb(tx)),
    ...overrides.transactions,
  };
  const codeSvc = { generate: vi.fn().mockResolvedValue('M-00000001') };
  return {
    tx,
    masters,
    transactions,
    service: new MastersService(masters as any, codeSvc as any, transactions as any, {} as any),
  };
}

describe('MastersService tenant boundary internals', () => {
  it('passes organization scope and transaction into the master repository create path', async () => {
    const { service, masters, tx } = buildService();

    await service.create('organization-1', { name: 'Scoped master' } as any);

    expect(masters.create).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'organization-1',
      tx,
      data: expect.objectContaining({
        organizationId: 'organization-1',
        code: 'M-00000001',
        name: 'Scoped master',
      }),
    }));
  });

  it('queries legacy generation history outside detail-page content cards', async () => {
    const { service, masters } = buildService({
      masters: {
        findById: vi.fn().mockResolvedValue({
          id: 'master-1',
          code: 'M-00000001',
          organizationId: 'organization-1',
          name: 'History master',
          optionCounter: 0,
          tags: [],
          images: [],
        }),
        findGenerationHistoryRows: vi.fn().mockResolvedValue([
          {
            id: 'legacy-1',
            generatedTitle: 'CA result',
            status: 'READY',
            generationResult: { title: 'legacy result' },
            errorMessage: null,
            createdAt: new Date('2026-05-06T00:00:00.000Z'),
          },
        ]),
      },
    });

    await expect(service.getGenerationHistory('organization-1', 'master-1', 10)).resolves.toEqual([
      expect.objectContaining({ id: 'legacy-1' }),
    ]);
    expect(masters.findGenerationHistoryRows).toHaveBeenCalledWith({
      organizationId: 'organization-1',
      masterId: 'master-1',
      limit: 10,
    });
  });

  it('lists master-bound AI detail-page generations as product content cards', async () => {
    const createdAt = new Date('2026-05-12T10:00:00.000Z');
    const { service, masters } = buildService({
      masters: {
        listProductContentCards: vi.fn().mockResolvedValue({
          total: 1,
          rows: [
            {
              id: 'generation-1',
              generatedTitle: 'KIDITEM DESIGN 상세',
              status: 'READY',
              generationInput: {
                rawTitle: '큐브 퍼즐',
                imageUrls: ['https://example.com/source.jpg'],
              },
              generationResult: {
                templateId: 'bold-vertical',
                result: { hook: { text: '생각이 돌아가는 큐브', titleSub: '초등 고학년 집중 놀이' } },
                imageUrls: ['https://example.com/source.jpg'],
                processedImages: { __heroBanner: '/processed/hero.png' },
              },
              errorMessage: null,
              editedHtmlSavedAt: new Date('2026-05-12T11:00:00.000Z'),
              createdAt,
              updatedAt: createdAt,
              generationGroup: {
                targetMaster: {
                  id: 'master-1',
                  code: 'M-00000001',
                  name: '큐브 퍼즐',
                  thumbnailUrl: 'https://example.com/thumb.jpg',
                  imageUrl: 'https://example.com/main.jpg',
                  isTemporary: true,
                  images: [{ url: 'https://example.com/gallery.jpg' }],
                },
              },
            },
          ],
        }),
      },
    });

    await expect(service.listContentCards('organization-1', { page: 1, limit: 20 })).resolves.toEqual({
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
    expect(masters.listProductContentCards).toHaveBeenCalledWith({
      organizationId: 'organization-1',
      productId: undefined,
      page: 1,
      limit: 20,
      templateIds: ['kids-playful', 'bold-vertical', 'simple-vertical'],
    });
  });
});
