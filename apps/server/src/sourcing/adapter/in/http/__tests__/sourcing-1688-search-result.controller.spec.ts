import { describe, expect, it, vi } from 'vitest';
import { Sourcing1688SearchResultController } from '../sourcing-1688-search-result.controller';

describe('Sourcing1688SearchResultController', () => {
  it('reads an organization-scoped typed snapshot without computing', async () => {
    const snapshot = { generatedAt: null, observations: [] };
    const service = { latest: vi.fn(async () => snapshot) };
    const controller = new Sourcing1688SearchResultController(service as never);

    await expect(controller.latest(
      [' 儿童雨伞 ', '儿童笔袋'],
      'product-1::',
      'org-1',
    )).resolves.toBe(snapshot);
    expect(service.latest).toHaveBeenCalledWith({
      organizationId: 'org-1',
      keywords: ['儿童雨伞', '儿童笔袋'],
      targetIds: ['product-1::'],
    });
  });

  it('rejects generic URLs and over-bounded query identities', async () => {
    const controller = new Sourcing1688SearchResultController({ latest: vi.fn() } as never);

    await expect(controller.latest(
      undefined,
      'https://owner.example/image.jpg',
      'org-1',
    )).rejects.toThrow('invalid_1688_result_query');
    await expect(controller.latest(
      Array.from({ length: 7 }, (_, index) => `k${index}`),
      undefined,
      'org-1',
    )).rejects.toThrow('invalid_1688_result_query');
  });
});
