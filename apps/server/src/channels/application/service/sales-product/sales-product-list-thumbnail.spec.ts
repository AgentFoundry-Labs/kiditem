import { describe, expect, it, vi } from 'vitest';
import { SalesProductUseCase } from './sales-product.usecase';

const ORG = '11111111-1111-4111-8111-111111111111';

function page(items: Array<{ id: string; imageUrl: string | null }>) {
  return { items, total: items.length, page: 1, limit: 50,
    summary: { total: items.length, withOptions: 0, withUnlinkedOptions: 0, unregistered: 0, draft: 0 } };
}

describe('SalesProductUseCase.list representative image', () => {
  it('shows the saved representative thumbnail, and the first draft image when none was saved', async () => {
    const repository = { list: vi.fn().mockResolvedValue(page([
      { id: 'a', imageUrl: 'https://cdn.example.com/a-first.png' },
      { id: 'b', imageUrl: 'https://cdn.example.com/b-first.png' },
    ])) };
    const thumbnails = {
      listGeneratedThumbnailUrls: vi.fn(),
      findRepresentativeThumbnailUrls: vi.fn().mockResolvedValue(new Map([['a', 'https://cdn.example.com/a-chosen.png']])),
    };
    const useCase = new SalesProductUseCase(repository as never, undefined, thumbnails);

    const result = await useCase.list(ORG, {});

    expect(result.items.map((item) => item.imageUrl)).toEqual([
      'https://cdn.example.com/a-chosen.png',
      'https://cdn.example.com/b-first.png',
    ]);
    // 한 쪽을 한 번에 읽는다 — 줄마다 묻지 않는다.
    expect(thumbnails.findRepresentativeThumbnailUrls).toHaveBeenCalledTimes(1);
    expect(thumbnails.findRepresentativeThumbnailUrls).toHaveBeenCalledWith(ORG, ['a', 'b']);
  });

  it('does not ask for thumbnails on an empty page', async () => {
    const repository = { list: vi.fn().mockResolvedValue(page([])) };
    const thumbnails = { listGeneratedThumbnailUrls: vi.fn(), findRepresentativeThumbnailUrls: vi.fn() };
    await new SalesProductUseCase(repository as never, undefined, thumbnails).list(ORG, {});
    expect(thumbnails.findRepresentativeThumbnailUrls).not.toHaveBeenCalled();
  });
});
