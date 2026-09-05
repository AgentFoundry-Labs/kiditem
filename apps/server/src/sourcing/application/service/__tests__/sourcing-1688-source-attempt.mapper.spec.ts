import { ConflictException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  build1688SourcePlan,
  normalize1688SourceBatch,
  parse1688SourcePlan,
  sameFrozenKeywordSet,
} from '../sourcing-1688-source-attempt.mapper';
import { map1688HotProductsToAuthorizedOutput } from '../sourcing-collection-mappers';

describe('1688 source-attempt plan mapper', () => {
  it('freezes the same normalized, first-wins target list used by the legacy collector', () => {
    const plan = build1688SourcePlan([
      '  Ａ  Pencil  ',
      'A Pencil',
      'MiXeD   Case',
    ]);

    expect(plan).toEqual({
      source: '1688.hot_product',
      keywords: ['A Pencil', 'MiXeD Case'],
    });
    expect(parse1688SourcePlan(plan)).toEqual(plan);
  });

  it('keeps the frozen collector keyword in terminal rows', () => {
    const plan = build1688SourcePlan(['  Ａ  Pencil  ', 'MiXeD   Case']);
    const batch = normalize1688SourceBatch('org-1', {
      keywords: [
        {
          keyword: 'A Pencil',
          items: [{ offerId: 'offer-1', rank: 1 }],
        },
        { keyword: 'MiXeD Case', items: [] },
      ],
    });

    expect(batch.keywords).toEqual(['A Pencil', 'MiXeD Case']);
    expect(batch.rows).toEqual([
      expect.objectContaining({ sourceKeyword: 'A Pencil', offerId: 'offer-1' }),
    ]);
    expect(sameFrozenKeywordSet(plan.keywords, batch.keywords)).toBe(true);

    const output = map1688HotProductsToAuthorizedOutput({
      permit: {
        runId: 'run-1',
        organizationId: 'org-1',
        sourceKey: '1688.hot_product',
        scopeKey: 'default',
        targetKey: 'all',
        leaseToken: 'lease-token',
        generation: 1,
        leaseExpiresAt: new Date('2026-09-04T00:00:00.000Z'),
      },
      rows: batch.rows,
    });
    expect(output.typedRecords[0]).toMatchObject({
      kind: 'offer_1688_keyword_observation',
      row: { sourceKeyword: 'A Pencil' },
    });
    expect(output.observations[0]).toMatchObject({
      rawPayload: { sourceKeyword: 'A Pencil' },
    });
  });

  it('rejects malformed plans instead of reinterpreting them', () => {
    expect(build1688SourcePlan(['  '])).toEqual({
      source: '1688.hot_product',
      keywords: [],
    });
    expect(() => parse1688SourcePlan({
      source: '1688.hot_product',
      keywords: ['  Ａ  Pencil  '],
    })).toThrow(ConflictException);
    expect(() => build1688SourcePlan(Array.from({ length: 21 }, (_, index) => `keyword-${index}`)))
      .toThrow(ConflictException);
  });

  it('keeps the legacy empty target snapshot valid', () => {
    expect(build1688SourcePlan([])).toEqual({
      source: '1688.hot_product',
      keywords: [],
    });
    expect(normalize1688SourceBatch('org-1', { keywords: [], errors: [] })).toMatchObject({
      keywords: [],
      rows: [],
      errorCount: 0,
    });
  });
});
