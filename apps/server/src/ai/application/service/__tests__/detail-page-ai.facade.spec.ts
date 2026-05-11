import { describe, expect, it, vi } from 'vitest';
import { DetailPageAiService } from '../detail-page-ai.service';
import type { DetailPageGenerationService } from '../detail-page-generation.service';
import type { DetailPagePrefillService } from '../detail-page-prefill.service';
import type { DetailPageQueryService } from '../detail-page-query.service';

describe('DetailPageAiService facade', () => {
  it('delegates controller-facing operations to the split application services', async () => {
    const generation = {
      uploadInputImage: vi.fn().mockResolvedValue({ url: 'https://cdn.example.com/input.jpg' }),
      generate: vi.fn().mockResolvedValue({ id: 'generation-id' }),
    } as unknown as DetailPageGenerationService;
    const prefill = {
      prefill: vi.fn().mockResolvedValue({ category: '완구' }),
    } as unknown as DetailPagePrefillService;
    const query = {
      list: vi.fn().mockResolvedValue([{ id: 'row-1' }]),
      getById: vi.fn().mockResolvedValue({ id: 'row-1' }),
      remove: vi.fn().mockResolvedValue({ ok: true }),
    } as unknown as DetailPageQueryService;
    const service = new DetailPageAiService(generation, prefill, query);

    await expect(service.uploadInputImage({ buffer: Buffer.from('x'), mimetype: 'image/png' } as never, 'org'))
      .resolves.toEqual({ url: 'https://cdn.example.com/input.jpg' });
    await expect(service.generate({ rawTitle: '상품' } as never, 'org', 'user'))
      .resolves.toEqual({ id: 'generation-id' });
    await expect(service.prefill({ rawTitle: '상품' } as never, 'org'))
      .resolves.toEqual({ category: '완구' });
    await expect(service.list('org', 'product', 'kids-playful'))
      .resolves.toEqual([{ id: 'row-1' }]);
    await expect(service.getById('row-1', 'org'))
      .resolves.toEqual({ id: 'row-1' });
    await expect(service.remove('row-1', 'org'))
      .resolves.toEqual({ ok: true });

    expect(generation.uploadInputImage).toHaveBeenCalledWith(
      { buffer: Buffer.from('x'), mimetype: 'image/png' },
      'org',
    );
    expect(generation.generate).toHaveBeenCalledWith({ rawTitle: '상품' }, 'org', 'user');
    expect(prefill.prefill).toHaveBeenCalledWith({ rawTitle: '상품' }, 'org');
    expect(query.list).toHaveBeenCalledWith('org', 'product', 'kids-playful');
    expect(query.getById).toHaveBeenCalledWith('row-1', 'org');
    expect(query.remove).toHaveBeenCalledWith('row-1', 'org');
  });
});
