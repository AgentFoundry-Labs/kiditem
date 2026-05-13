import { describe, expect, it, vi } from 'vitest';
import { DetailPageQueryService } from '../detail-page-query.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const GENERATION_ID = '33333333-3333-4333-8333-333333333333';

function makeService(prisma: unknown) {
  const refiner = {
    suppressProductInfoWhenSafetyLabelExists: vi.fn((result) => result),
  };
  return new DetailPageQueryService(prisma as never, refiner as never);
}

describe('DetailPageQueryService edited HTML', () => {
  it('saves edited HTML onto ContentGeneration using organization scope', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-13T10:00:00.000Z'));
    try {
      const prisma = {
        contentGeneration: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };
      const service = makeService(prisma);

      await expect(
        service.saveEditedHtml(GENERATION_ID, ORG, '<section>edited</section>'),
      ).resolves.toEqual({
        html: '<section>edited</section>',
        savedAt: '2026-05-13T10:00:00.000Z',
      });

      expect(prisma.contentGeneration.updateMany).toHaveBeenCalledWith({
        where: { id: GENERATION_ID, organizationId: ORG },
        data: {
          editedHtml: '<section>edited</section>',
          editedHtmlSavedAt: new Date('2026-05-13T10:00:00.000Z'),
        },
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
    const service = makeService(prisma);

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
