import { describe, expect, it } from 'vitest';
import { buildCoupangRecommendations } from './sourcing-recommendation-policy';

describe('sourcing recommendation policy', () => {
  it('scores Wing rows on the server with a stable identity', () => {
    const [item] = buildCoupangRecommendations([
      {
        evidenceObservationId: '00000000-0000-4000-8000-000000000001',
        productId: '123',
        itemId: null,
        vendorItemId: 'vendor-123',
        productName: '유아 우산',
        sourceKeyword: '우산',
        salePriceKrw: 12000,
        ratingCount: 80,
        ratingAverage: 4.7,
        viewsLast28d: 500,
        salesLast28d: 40,
        capturedAt: new Date('2026-08-10T00:00:00.000Z'),
      },
    ]);

    expect(item.itemKey).toMatch(/^[a-f0-9]{64}$/);
    expect(item.score).toBeGreaterThan(0);
    expect(item.baselineAction).not.toBe('exclude');
  });
});
