import { describe, expect, it, vi } from 'vitest';
import { DetailPageQueryService } from '../detail-page-query.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const GENERATION_ID = '33333333-3333-4333-8333-333333333333';

function makeService(
  prisma: unknown,
  overrides: {
    imageStorage?: Partial<{
      extractKey: ReturnType<typeof vi.fn>;
      copy: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    }>;
  } = {},
) {
  const refiner = {
    suppressProductInfoWhenSafetyLabelExists: vi.fn((result) => result),
  };
  const imageStorage = {
    extractKey: vi.fn().mockReturnValue(null),
    copy: vi.fn(),
    delete: vi.fn(),
    ...overrides.imageStorage,
  };
  const contentAssets = {
    syncGenerationImageUsagesTx: vi.fn().mockResolvedValue([]),
  };
  return {
    service: new DetailPageQueryService(
      prisma as never,
      refiner as never,
      imageStorage as never,
      contentAssets as never,
    ),
    imageStorage,
    contentAssets,
  };
}

describe('DetailPageQueryService edited HTML', () => {
  it('saves edited HTML onto ContentGeneration using organization scope', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-13T10:00:00.000Z'));
    try {
      const prisma = {
        $transaction: vi.fn((callback) => callback(prisma)),
        contentGeneration: {
          findFirst: vi.fn().mockResolvedValue({
            id: GENERATION_ID,
            generationGroupId: 'group-1',
            triggeredByUserId: 'user-1',
          }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };
      const { service, contentAssets } = makeService(prisma);

      await expect(
        service.saveEditedHtml(GENERATION_ID, ORG, '<section><img src="https://cdn.example.com/a.jpg" /></section>'),
      ).resolves.toEqual({
        html: '<section><img src="https://cdn.example.com/a.jpg" /></section>',
        savedAt: '2026-05-13T10:00:00.000Z',
        assetUrlMap: {},
      });

      expect(prisma.contentGeneration.updateMany).toHaveBeenCalledWith({
        where: { id: GENERATION_ID, organizationId: ORG },
        data: {
          editedHtml: '<section><img src="https://cdn.example.com/a.jpg" /></section>',
          editedHtmlSavedAt: new Date('2026-05-13T10:00:00.000Z'),
        },
      });
      expect(contentAssets.syncGenerationImageUsagesTx).toHaveBeenCalledWith(prisma, {
        organizationId: ORG,
        generationGroupId: 'group-1',
        contentGenerationId: GENERATION_ID,
        createdByUserId: 'user-1',
        imageUrls: ['https://cdn.example.com/a.jpg'],
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('promotes temporary edited images to durable content assets before saving', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-13T10:30:00.000Z'));
    try {
      const tmpUrl = 'https://cdn.example.com/tmp/image-edits/org-1/custom.png';
      const durableUrl = `https://cdn.example.com/content-assets/${ORG}/${GENERATION_ID}/promoted.png`;
      const prisma = {
        $transaction: vi.fn((callback) => callback(prisma)),
        contentGeneration: {
          findFirst: vi.fn().mockResolvedValue({
            id: GENERATION_ID,
            generationGroupId: 'group-1',
            triggeredByUserId: 'user-1',
          }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };
      const { service, imageStorage, contentAssets } = makeService(prisma, {
        imageStorage: {
          extractKey: vi.fn((url: string) => (
            url === tmpUrl ? 'tmp/image-edits/org-1/custom.png' : null
          )),
          copy: vi.fn().mockResolvedValue(durableUrl),
          delete: vi.fn().mockResolvedValue(undefined),
        },
      });

      await expect(
        service.saveEditedHtml(GENERATION_ID, ORG, `<section><img src="${tmpUrl}" /></section>`),
      ).resolves.toEqual({
        html: `<section><img src="${durableUrl}" /></section>`,
        savedAt: '2026-05-13T10:30:00.000Z',
        assetUrlMap: { [tmpUrl]: durableUrl },
      });

      expect(imageStorage.copy).toHaveBeenCalledWith(
        'tmp/image-edits/org-1/custom.png',
        expect.stringMatching(
          new RegExp(`^content-assets/${ORG}/${GENERATION_ID}/[a-f0-9]{32}\\.png$`),
        ),
      );
      expect(prisma.contentGeneration.updateMany).toHaveBeenCalledWith({
        where: { id: GENERATION_ID, organizationId: ORG },
        data: {
          editedHtml: `<section><img src="${durableUrl}" /></section>`,
          editedHtmlSavedAt: new Date('2026-05-13T10:30:00.000Z'),
        },
      });
      expect(contentAssets.syncGenerationImageUsagesTx).toHaveBeenCalledWith(prisma, {
        organizationId: ORG,
        generationGroupId: 'group-1',
        contentGenerationId: GENERATION_ID,
        createdByUserId: 'user-1',
        imageUrls: [durableUrl],
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('loads edited HTML from ContentGeneration using organization scope', async () => {
    const savedAt = new Date('2026-05-13T11:00:00.000Z');
    const prisma = {
      contentGeneration: {
        findFirst: vi.fn().mockResolvedValue({
          id: GENERATION_ID,
          editedHtml: '<main>saved</main>',
          editedHtmlSavedAt: savedAt,
        }),
      },
    };
    const { service } = makeService(prisma);

    await expect(service.getEditedHtml(GENERATION_ID, ORG)).resolves.toEqual({
      html: '<main>saved</main>',
      savedAt: savedAt.toISOString(),
    });
    expect(prisma.contentGeneration.findFirst).toHaveBeenCalledWith({
      where: { id: GENERATION_ID, organizationId: ORG },
      select: {
        id: true,
        editedHtml: true,
        editedHtmlSavedAt: true,
      },
    });
  });
});
