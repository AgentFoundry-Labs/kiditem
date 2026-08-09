import { describe, expect, it } from 'vitest';
import {
  hashCollectionRequest,
  map1688HotProductsToAuthorizedOutput,
  normalizeCollectionTarget,
} from '../sourcing-collection-mappers';

const permit = {
  runId: '00000000-0000-4000-8000-000000000001',
  organizationId: '00000000-0000-4000-8000-000000000002',
  sourceKey: '1688.hot_product',
  scopeKey: 'default',
  targetKey: 'children plate',
  leaseToken: '00000000-0000-4000-8000-000000000003',
  generation: 1,
  leaseExpiresAt: new Date('2026-08-08T01:02:00.000Z'),
};

describe('sourcing collection mappers', () => {
  it('normalizes collection targets without relying on presentation labels', () => {
    expect(normalizeCollectionTarget('  CHILDREN\u00a0 Plate  ')).toBe('children plate');
  });

  it('hashes equivalent request objects identically regardless of key order', () => {
    expect(hashCollectionRequest({ b: 2, a: 1 })).toBe(
      hashCollectionRequest({ a: 1, b: 2 }),
    );
  });

  it('maps 1688 rows to immutable evidence and freshness-fenced typed rows', () => {
    const capturedAt = new Date('2026-08-08T00:00:00.000Z');
    const output = map1688HotProductsToAuthorizedOutput({
      permit,
      rows: [
        {
          organizationId: permit.organizationId,
          businessDate: capturedAt,
          offerId: ' offer-1 ',
          sourceKeyword: '  儿童 餐盘 ',
          rank: 1,
          title: 'plate',
          priceCny: 1.2,
          monthlySales: 10,
          repurchaseRate: null,
          tradeScore: null,
          supplierName: null,
          imageUrl: null,
          sourceUrl: 'https://detail.1688.com/offer/1.html',
          capturedAt,
        },
      ],
    });

    expect(output).toMatchObject({
      discoveredCount: 1,
      observations: [
        {
          sourceKey: '1688.hot_product',
          sourceEntityId: 'offer-1',
          sourceUrl: 'https://detail.1688.com/offer/1.html',
        },
      ],
      typedRecords: [
        {
          kind: 'offer_1688_hot',
          row: { offerId: 'offer-1', sourceKeyword: '儿童 餐盘' },
        },
        {
          kind: 'offer_1688_keyword_observation',
          row: {
            offerId: 'offer-1',
            sourceKeyword: '儿童 餐盘',
            ingestionRunId: permit.runId,
          },
        },
      ],
    });
    expect(output.observations[0].observationKey).toHaveLength(64);
    expect(output.observations[0].observationKey).not.toContain('https');
  });
});
