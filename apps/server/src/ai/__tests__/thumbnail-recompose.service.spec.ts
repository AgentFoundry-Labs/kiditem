import { describe, expect, it, vi } from 'vitest';
import { ThumbnailRecomposeService } from '../application/service/thumbnail-recompose.service';

const ORGANIZATION_ID = 'organization-1';
const PRODUCT_ID = '7d000000-0000-4000-8000-000000000001';

describe('ThumbnailRecomposeService', () => {
  it('passes product context into the classifier prompt', async () => {
    const repository = {
      findRecomposeWorkspace: vi.fn(async () => ({
        name: '크리스마스 LED 무드등 3개 세트',
        category: '조명/무드등',
        imageUrl: 'https://example.com/light.jpg',
        id: PRODUCT_ID,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      })),
    };
    const vision = {
      classifyImageJson: vi.fn(async () =>
        JSON.stringify({
          kind: 'lighting-lifestyle',
          requiresChoice: false,
          reasoning: 'LED 조명 상품',
        }),
      ),
    };
    const service = new ThumbnailRecomposeService(repository as never, vision as never);

    const result = await service.classify(PRODUCT_ID, ORGANIZATION_ID);

    expect(result.kind).toBe('lighting-lifestyle');
    expect(repository.findRecomposeWorkspace).toHaveBeenCalledWith(PRODUCT_ID, ORGANIZATION_ID);
    expect(vision.classifyImageJson).toHaveBeenCalledTimes(1);
    const [imageUrl, prompt] = vision.classifyImageJson.mock.calls[0];
    expect(imageUrl).toBe('https://example.com/light.jpg');
    expect(prompt).toContain('Product name: "크리스마스 LED 무드등 3개 세트"');
    expect(prompt).toContain('Category: 조명/무드등');
    expect(prompt).toContain('PRODUCT QUANTITY: 3');
    expect(prompt).toContain('"lighting-lifestyle"');
  });
});
