import { describe, expect, it } from 'vitest';
import {
  buildSourcing1688TargetId,
  deriveSourcing1688SearchQuery,
  Sourcing1688ImageMatchInputSchema,
  Sourcing1688KeywordBatchInputSchema,
  Sourcing1688SearchSnapshotSchema,
  Sourcing1688BatchResultSchema,
} from './wholesale-operations.js';

describe('1688 wholesale source contracts', () => {
  it('shares the existing target identity and match searchQuery policy across server and web', () => {
    expect(buildSourcing1688TargetId({
      productId: 'product-1',
      itemId: null,
      vendorItemId: null,
    })).toBe('product-1::');
    expect(deriveSourcing1688SearchQuery({
      productName: '초등학생 대용량 필통',
      primaryKeyword: '초등 필통',
      keywords: ['문구'],
    })).toBe('儿童笔袋文具盒');
  });

  it('accepts at most six canonical unique keywords without provider controls', () => {
    expect(Sourcing1688KeywordBatchInputSchema.parse({
      keywords: ['  Ａ\u00a0  Pencil  ', '儿童笔袋'],
    })).toEqual({ keywords: ['A Pencil', '儿童笔袋'] });

    for (const invalid of [
      { keywords: [] },
      { keywords: Array.from({ length: 7 }, (_, index) => `k${index}`) },
      { keywords: ['A', 'ａ'] },
      { keywords: ['x'], url: 'https://s.1688.com' },
      { keywords: ['x'], page: 2 },
      { keywords: ['x'], maxResults: 100 },
    ]) {
      expect(Sourcing1688KeywordBatchInputSchema.safeParse(invalid).success)
        .toBe(false);
    }
  });

  it('accepts only a bounded unique owner-target identity batch for image work', () => {
    expect(Sourcing1688ImageMatchInputSchema.parse({
      targetIds: [' product-1:: ', 'product-2:item-2:vendor-2'],
    })).toEqual({
      targetIds: ['product-1::', 'product-2:item-2:vendor-2'],
    });

    for (const invalid of [
      { targetIds: [] },
      { targetIds: Array.from({ length: 25 }, (_, index) => `target-${index}`) },
      { targetIds: ['target-1', 'target-1'] },
      { targetIds: ['target-1'], imageUrl: 'https://owner.example/image.jpg' },
      { targetIds: ['target-1'], providerUrl: 'https://s.1688.com' },
      { targetIds: ['target-1'], searchQuery: 'arbitrary' },
    ]) {
      expect(Sourcing1688ImageMatchInputSchema.safeParse(invalid).success)
        .toBe(false);
    }
  });

  it('exposes only typed completed observations with persisted capture time', () => {
    expect(Sourcing1688SearchSnapshotSchema.parse({
      generatedAt: '2026-08-14T00:00:01.000Z',
      sourceStatuses: [],
      observations: [{
        keyword: '儿童笔袋',
        targetId: 'product-1::',
        capturedAt: '2026-08-14T00:00:00.000Z',
        items: [{
          offerId: '1688-offer-1',
          title: '儿童笔袋',
          priceCny: 12.5,
          sourceUrl: 'https://detail.1688.com/offer/1688-offer-1.html',
          imageUrl: 'https://cbu01.alicdn.com/example.jpg',
          score: 88,
          monthlySales: 120,
          tradeScore: 4.8,
          repurchaseRate: '30%',
          supplierName: '示例工厂',
          salesText: '120件',
          supplierFactoryUrl: null,
          supplierTags: ['源头工厂'],
          purchaseTags: [],
          minOrderQuantity: 2,
          shippingFulfillmentRate: '98%',
          shippingPickupRate: '96%',
          shipFrom: '义乌',
          serviceScore: 4.8,
        }],
      }],
    }).observations[0]).toMatchObject({
      keyword: '儿童笔袋',
      targetId: 'product-1::',
      items: [{ offerId: '1688-offer-1', score: 88 }],
    });

    expect(Sourcing1688SearchSnapshotSchema.safeParse({
      generatedAt: null,
      observations: [{
        keyword: '儿童笔袋',
        targetId: null,
        capturedAt: '2026-08-14T00:00:00.000Z',
        items: [],
        rawSnapshot: { cookie: 'secret' },
      }],
    }).success).toBe(false);
  });

  it('retains the bounded per-unit receipt independently of the retired Operation contract', () => {
    const receipt = { outcome: 'complete', summary: { discovered: 1, accepted: 1, duplicate: 0, unchanged: 0, failed: 0 },
      sources: [{ source: '1688_keyword_search', outcome: 'complete', accepted: 1, failed: 0 }],
      units: [{ keyword: '儿童笔袋', targetId: null, outcome: 'complete', discovered: 1, accepted: 1, duplicate: 0, failed: 0 }],
      snapshotGeneratedAt: '2026-08-14T00:00:01.000Z' };
    expect(Sourcing1688BatchResultSchema.parse(receipt)).toEqual(receipt);
    expect(Sourcing1688BatchResultSchema.safeParse({ ...receipt, operationRunId: 'retired' }).success).toBe(false);
    expect(Sourcing1688BatchResultSchema.safeParse({ ...receipt, units: [] }).success).toBe(false);
  });
});
