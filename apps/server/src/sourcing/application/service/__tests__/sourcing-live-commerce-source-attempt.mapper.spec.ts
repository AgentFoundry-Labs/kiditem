import { describe, expect, it } from 'vitest';
import {
  buildBrowserLiveCommercePlan,
  normalizeBrowserLiveCommerceBatch,
  normalizeBrowserLiveCommerceUrl,
  parseBrowserLiveCommercePlan,
} from '../sourcing-live-commerce-source-attempt.mapper';

const FULL_PAGE_URL = 'https://user:pass@live.douyin.com:8443/room/123?token=keep#private';

describe('browser live-commerce source-attempt mapper', () => {
  it('freezes the legacy full navigation URL without changing credentials, port, query, or fragment', () => {
    const plan = buildBrowserLiveCommercePlan(`  ${FULL_PAGE_URL}  `);

    expect(plan).toEqual({
      source: 'douyin',
      pageUrl: FULL_PAGE_URL,
      maxProducts: 100,
    });
    expect(parseBrowserLiveCommercePlan(plan)).toEqual(plan);
    expect(normalizeBrowserLiveCommerceUrl(FULL_PAGE_URL)).toBe(FULL_PAGE_URL);
  });

  it('keeps the legacy terminal mapping: malformed product identities are skipped and duplicate identities keep their first row', () => {
    const plan = buildBrowserLiveCommercePlan(FULL_PAGE_URL);
    const legacyDate = `${'2026-09-04T00:00:00.000Z'}${' '.repeat(40)}x`;

    const batch = normalizeBrowserLiveCommerceBatch({
      organizationId: 'org-1',
      ingestionRunId: 'run-1',
      plan,
      batch: {
        source: 'douyin',
        pageUrl: FULL_PAGE_URL,
        broadcast: {
          broadcastId: ' broadcast-1 ',
          startedAt: legacyDate,
          endedAt: ' 2026-09-04T01:00:00.000Z ',
        },
        products: [
          { productId: ' ', title: 'skipped' },
          { productId: ' product-1 ', title: 'first row', rank: 1 },
          { productId: 'product-1', title: 'second row', rank: 2 },
        ],
      },
    });

    expect(batch.pageUrl).toBe(FULL_PAGE_URL);
    expect(batch.broadcast).toMatchObject({
      broadcastId: 'broadcast-1',
      sourceUrl: FULL_PAGE_URL,
      // The old mapper trims/slices to 64 before parsing; an extra trailing
      // non-date character past that bound remains an invalid date.
      startedAt: null,
      endedAt: new Date('2026-09-04T01:00:00.000Z'),
    });
    expect(batch.products).toEqual([
      expect.objectContaining({ productId: 'product-1', title: 'first row', rank: 1 }),
    ]);
  });

  it('keeps the existing 500-character URL boundary', () => {
    expect(() => normalizeBrowserLiveCommerceUrl(`https://live.douyin.com/${'a'.repeat(501)}`))
      .toThrow('SOURCE_BATCH_INVALID');
  });
});
