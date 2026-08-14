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

  it('registers exact trend source lanes with isolated resource classes', () => {
    expect(SOURCING_OPERATIONS.filter((operation) =>
      operation.key.startsWith('sourcing.collect_')
      && operation.key.endsWith('_trends'))).toEqual([
      expect.objectContaining({
        key: 'sourcing.collect_daily_trends',
        engineType: 'composite',
        resourceClass: 'default',
      }),
      expect.objectContaining({
        key: 'sourcing.collect_naver_trends',
        engineType: 'domain',
        resourceClass: 'naver_api',
        executionTimeoutMs: 15 * 60_000,
      }),
      expect.objectContaining({
        key: 'sourcing.collect_1688_trends',
        engineType: 'browser',
        resourceClass: 'playwright_1688',
        executionTimeoutMs: 15 * 60_000,
      }),
      expect.objectContaining({
        key: 'sourcing.collect_shorts_trends',
        engineType: 'domain',
        resourceClass: 'default',
        executionTimeoutMs: 15 * 60_000,
      }),
      expect.objectContaining({
        key: 'sourcing.collect_tiktok_cc_trends',
        engineType: 'browser',
        resourceClass: 'default',
        executionTimeoutMs: 15 * 60_000,
      }),
    ]);
  });

  it('registers exact browser and domain live-source collection operations', () => {
    const tiktok = SOURCING_OPERATIONS.find(
      (operation) => operation.key === 'sourcing.collect_tiktok_cc_trends',
    );
    const browserLive = SOURCING_OPERATIONS.find(
      (operation) => operation.key === 'sourcing.collect_live_commerce_url',
    );
    const taobao = SOURCING_OPERATIONS.find(
      (operation) => operation.key === 'sourcing.collect_taobao_live',
    );

    expect(tiktok).toMatchObject({
      engineType: 'browser',
      ownerDomain: 'sourcing',
      scheduleSupported: false,
    });
    expect(browserLive).toMatchObject({
      engineType: 'browser',
      ownerDomain: 'sourcing',
      scheduleSupported: false,
    });
    expect(taobao).toMatchObject({
      engineType: 'domain',
      ownerDomain: 'sourcing',
      scheduleSupported: false,
    });
    expect(tiktok?.inputSchema.parse({ maxItems: 100, region: 'KR' }))
      .toEqual({ maxItems: 100, region: 'KR' });
    expect(browserLive?.inputSchema.safeParse({ url: 'https://live.douyin.com/123' }).success)
      .toBe(true);
    expect(browserLive?.inputSchema.safeParse({ url: 'http://live.douyin.com/123' }).success)
      .toBe(false);
    expect(browserLive?.inputSchema.safeParse({ url: 'https://example.com/123' }).success)
      .toBe(false);
    expect(taobao?.inputSchema.parse({ liveIds: ['123', '456'] }))
      .toEqual({ liveIds: ['123', '456'] });
    expect(taobao?.inputSchema.parse({ queryDate: '2026-08-14' }))
      .toEqual({ queryDate: '20260814' });
  });

  it('requires an immutable 1688 keyword snapshot for every browser run', () => {
    const trend1688 = SOURCING_OPERATIONS.find(
      (operation) => operation.key === 'sourcing.collect_1688_trends',
    );

    expect(trend1688?.inputSchema.parse({ keywords: [] })).toEqual({ keywords: [] });
    expect(trend1688?.inputSchema.safeParse({}).success).toBe(false);
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

  it('registers deterministic rising detection on the snapshot compute lane', () => {
    const definition = SOURCING_OPERATIONS.find(
      (operation) => operation.key === 'sourcing.detect_rising_products',
    );
    expect(definition).toMatchObject({
      engineType: 'domain',
      ownerDomain: 'sourcing',
      resourceClass: 'snapshot_compute',
      maxAttempts: 3,
      executionTimeoutMs: 15 * 60_000,
      allowedTriggers: ['dashboard', 'domain_screen', 'agent'],
      scheduleSupported: false,
    });
    expect(definition?.inputSchema.parse({ windowDays: 14, limit: 100 }))
      .toEqual({ windowDays: 14, limit: 100 });
    expect(definition?.inputSchema.safeParse({ windowDays: 1 }).success).toBe(false);
    expect(definition?.inputSchema.safeParse({ limit: 201 }).success).toBe(false);
  });

  it('registers shadow signal collection as an exact fenced snapshot-compute operation', () => {
    const definition = SOURCING_OPERATIONS.find(
      (operation) => operation.key === 'sourcing.collect_shadow_signals',
    );

    expect(definition).toMatchObject({
      engineType: 'domain',
      ownerDomain: 'sourcing',
      resourceClass: 'snapshot_compute',
      allowedTriggers: ['dashboard', 'domain_screen', 'agent'],
      scheduleSupported: false,
    });
    expect(definition?.inputSchema.parse({})).toEqual({});
  });
});
