import { describe, expect, it } from 'vitest';
import { SOURCING_OPERATIONS } from '../sourcing.operations';

describe('Sourcing Operations', () => {
  it('allows the existing collection operation to be started by Agent OS', () => {
    expect(
      SOURCING_OPERATIONS.find(
        (operation) => operation.key === 'sourcing.collect_daily_trends',
      )?.allowedTriggers,
    ).toContain('agent');
  });

  it('registers the exact keyword suggestion browser operation', () => {
    const definition = SOURCING_OPERATIONS.find(
      (operation) => operation.key === 'sourcing.collect_keyword_suggestions',
    );
    expect(definition).toMatchObject({
      engineType: 'browser',
      ownerDomain: 'sourcing',
      resourceClass: 'extension_coupang',
      maxAttempts: 3,
      executionTimeoutMs: 15 * 60_000,
      allowedTriggers: ['dashboard', 'domain_screen'],
      scheduleSupported: false,
    });
    expect(definition?.inputSchema.parse({
      keyword: '  Ａ   Pencil ',
      maxResults: 30,
    })).toEqual({ keyword: 'A Pencil', maxResults: 30 });
  });

  it('registers exact bounded 1688 Playwright batch operations', () => {
    const keyword = SOURCING_OPERATIONS.find(
      (operation) => operation.key === 'sourcing.search_1688_keyword_batch',
    );
    const image = SOURCING_OPERATIONS.find(
      (operation) => operation.key === 'sourcing.match_wholesale_images',
    );

    for (const definition of [keyword, image]) {
      expect(definition).toMatchObject({
        engineType: 'domain',
        ownerDomain: 'sourcing',
        resourceClass: 'playwright_1688',
        maxAttempts: 3,
        executionTimeoutMs: 15 * 60_000,
        allowedTriggers: ['dashboard', 'domain_screen'],
        scheduleSupported: false,
      });
    }

    expect(keyword?.inputSchema.parse({
      keywords: ['  Ａ   Pencil ', '儿童笔袋'],
    })).toEqual({ keywords: ['A Pencil', '儿童笔袋'] });
    expect(image?.inputSchema.parse({
      targetIds: ['product-1::'],
    })).toEqual({ targetIds: ['product-1::'] });
    expect(image?.inputSchema.safeParse({
      targetIds: ['product-1::'],
      imageUrl: 'https://owner.example/image.jpg',
    }).success).toBe(false);
  });
});
