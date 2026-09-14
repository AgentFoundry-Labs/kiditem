import { describe, expect, it } from 'vitest';
import {
  buildKeywordJudgementPrompt,
  buildKeywordProductBatches,
  parseKeywordRelevanceVerdicts,
  toKeywordPauseCandidates,
  type KeywordJudgementSource,
} from '../ad-keyword-relevance';

function source(
  overrides: Partial<KeywordJudgementSource> = {},
): KeywordJudgementSource {
  return {
    adTargetDailyId: 'target-1',
    keyword: '콩순이 비눗방울',
    productName: '캐릭터 문어발 비눗방울 1p',
    campaignName: '쿠팡윙 집중광고',
    externalOptionId: '95514044205',
    listingId: 'listing-1',
    origin: 'smart_targeting',
    impressions: 10,
    clicks: 1,
    spend: 500,
    revenue: 0,
    conversions: 0,
    ...overrides,
  };
}

describe('buildKeywordProductBatches', () => {
  it('groups keywords by the product they advertise', () => {
    const { batches } = buildKeywordProductBatches([
      source({ keyword: 'a' }),
      source({ keyword: 'b' }),
      source({
        keyword: 'c',
        externalOptionId: '90083778090',
        productName: '펌프 롱스틱 물총 3종 세트',
        spend: 0,
      }),
    ]);

    expect(batches).toHaveLength(2);
    expect(batches[0].productKey).toBe('95514044205');
    expect(batches[0].items.map((item) => item.keyword).sort()).toEqual(['a', 'b']);
    expect(batches[1].productKey).toBe('90083778090');
    expect(batches[1].productName).toBe('펌프 롱스틱 물총 3종 세트');
  });

  it('gives every keyword a ref unique across products', () => {
    const { batches, sourceByRef } = buildKeywordProductBatches([
      source({ keyword: 'a' }),
      source({ keyword: 'b', externalOptionId: 'other', productName: '다른 상품', spend: 0 }),
    ]);

    const refs = batches.flatMap((batch) => batch.items.map((item) => item.ref));
    expect(refs).toEqual(['p1k1', 'p2k1']);
    expect(new Set(refs).size).toBe(refs.length);
    expect(sourceByRef.get('p1k1')?.keyword).toBe('a');
    expect(sourceByRef.get('p2k1')?.keyword).toBe('b');
  });

  it('skips keywords that cannot be judged against a product', () => {
    const { batches } = buildKeywordProductBatches([
      // No product name — nothing to compare the keyword against.
      source({ keyword: '이름 없음', productName: null }),
      // Serves several products, so ingest cleared the option link.
      source({ keyword: '공유 키워드', externalOptionId: null }),
      // Already converted; it has proven itself however it reads.
      source({ keyword: '전환됨', conversions: 2 }),
      // The conversion column was not observed, so it may have converted.
      source({ keyword: '전환 미관측', conversions: null }),
      source({ keyword: '판정 대상' }),
    ]);

    expect(batches).toHaveLength(1);
    expect(batches[0].items.map((item) => item.keyword)).toEqual(['판정 대상']);
  });

  it('judges the highest-spending products first when the pass is capped', () => {
    const { batches, skippedProductCount } = buildKeywordProductBatches(
      [
        source({ keyword: 'cheap', externalOptionId: 'low', productName: 'A', spend: 10 }),
        source({ keyword: 'rich', externalOptionId: 'high', productName: 'B', spend: 9000 }),
      ],
      { maxProducts: 1 },
    );

    expect(batches.map((batch) => batch.productKey)).toEqual(['high']);
    expect(skippedProductCount).toBe(1);
  });

  it('caps a single product and reports what it dropped', () => {
    const rows = Array.from({ length: 5 }, (_, index) =>
      source({ keyword: `k${index}`, spend: index }),
    );
    const { batches } = buildKeywordProductBatches(rows, {
      maxKeywordsPerProduct: 2,
    });

    // Highest spend survives the cap; the tail is reported, not silently lost.
    expect(batches[0].items.map((item) => item.keyword)).toEqual(['k4', 'k3']);
    expect(batches[0].truncatedCount).toBe(3);
  });
});

describe('buildKeywordJudgementPrompt', () => {
  it('asks about one product and lists every keyword with its evidence', () => {
    const { batches } = buildKeywordProductBatches([
      source({ keyword: '콩순이 비눗방울', impressions: 4, clicks: 1, spend: 500 }),
    ]);
    const prompt = buildKeywordJudgementPrompt(batches[0]);

    expect(prompt).toContain('상품명: 캐릭터 문어발 비눗방울 1p');
    expect(prompt).toContain('캠페인: 쿠팡윙 집중광고');
    expect(prompt).toContain('p1k1\t콩순이 비눗방울\t노출4\t클릭1\t광고비500원');
  });
});

describe('toKeywordPauseCandidates', () => {
  it('proposes a pause with the model rationale attached', () => {
    const { batches, sourceByRef } = buildKeywordProductBatches([source()]);
    const { candidates, rejected } = toKeywordPauseCandidates(
      [
        {
          ref: batches[0].items[0].ref,
          verdict: 'irrelevant',
          reason: '콩순이는 다른 완구 브랜드명이라 이 상품 검색과 무관',
        },
      ],
      sourceByRef,
    );

    expect(rejected).toEqual([]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      actionType: 'pause_keyword',
      targetType: 'keyword',
      targetLabel: '콩순이 비눗방울',
      priority: 'high',
      adTargetDailyId: 'target-1',
    });
    expect(candidates[0].reason).toContain('콩순이는 다른 완구 브랜드명');
    expect(candidates[0].payload).toMatchObject({
      relevance: 'irrelevant',
      externalOptionId: '95514044205',
    });
  });

  it('proposes nothing for relevant or loose verdicts', () => {
    const { batches, sourceByRef } = buildKeywordProductBatches([source()]);
    const ref = batches[0].items[0].ref;
    const { candidates } = toKeywordPauseCandidates(
      [
        { ref, verdict: 'relevant', reason: '같은 상품군' },
        { ref, verdict: 'loose', reason: '느슨함' },
      ],
      sourceByRef,
    );

    expect(candidates).toEqual([]);
  });

  it('refuses a verdict for a keyword it was never asked about', () => {
    const { sourceByRef } = buildKeywordProductBatches([source()]);
    const { candidates, rejected } = toKeywordPauseCandidates(
      [{ ref: 'p9k9', verdict: 'irrelevant', reason: '지어낸 근거' }],
      sourceByRef,
    );

    expect(candidates).toEqual([]);
    expect(rejected).toEqual([{ ref: 'p9k9', reason: 'unknown_ref' }]);
  });

  it('refuses a verdict with no rationale', () => {
    const { batches, sourceByRef } = buildKeywordProductBatches([source()]);
    const ref = batches[0].items[0].ref;
    const { candidates, rejected } = toKeywordPauseCandidates(
      [{ ref, verdict: 'irrelevant', reason: '   ' }],
      sourceByRef,
    );

    expect(candidates).toEqual([]);
    expect(rejected).toEqual([{ ref, reason: 'missing_reason' }]);
  });

  it('refuses to pause a keyword that converted after the batch was built', () => {
    const { batches, sourceByRef } = buildKeywordProductBatches([source()]);
    const ref = batches[0].items[0].ref;
    sourceByRef.get(ref)!.conversions = 3;

    const { candidates, rejected } = toKeywordPauseCandidates(
      [{ ref, verdict: 'irrelevant', reason: '무관해 보임' }],
      sourceByRef,
    );

    expect(candidates).toEqual([]);
    expect(rejected).toEqual([{ ref, reason: 'converted_keyword' }]);
  });

  it('refuses to pause a keyword whose conversion column was not observed', () => {
    const { batches, sourceByRef } = buildKeywordProductBatches([source()]);
    const ref = batches[0].items[0].ref;
    sourceByRef.get(ref)!.conversions = null;

    const { candidates, rejected } = toKeywordPauseCandidates(
      [{ ref, verdict: 'irrelevant', reason: '무관해 보임' }],
      sourceByRef,
    );

    expect(candidates).toEqual([]);
    expect(rejected).toEqual([{ ref, reason: 'conversions_unobserved' }]);
  });

  it('keeps the first verdict when the model repeats a ref', () => {
    const { batches, sourceByRef } = buildKeywordProductBatches([source()]);
    const ref = batches[0].items[0].ref;
    const { candidates, rejected } = toKeywordPauseCandidates(
      [
        { ref, verdict: 'irrelevant', reason: '첫 판정' },
        { ref, verdict: 'irrelevant', reason: '중복 판정' },
      ],
      sourceByRef,
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0].reason).toContain('첫 판정');
    expect(rejected).toEqual([{ ref, reason: 'duplicate_ref' }]);
  });

  it('refuses a verdict whose echoed keyword no longer matches the ref', () => {
    const { batches, sourceByRef } = buildKeywordProductBatches([source()]);
    const ref = batches[0].items[0].ref;
    const { candidates, rejected } = toKeywordPauseCandidates(
      [{ ref, verdict: 'irrelevant', reason: '무관', keyword: '다른 키워드' }],
      sourceByRef,
    );

    expect(candidates).toEqual([]);
    expect(rejected).toEqual([{ ref, reason: 'keyword_mismatch' }]);
  });

  it('accepts a verdict whose echoed keyword still matches', () => {
    const { batches, sourceByRef } = buildKeywordProductBatches([source()]);
    const { candidates } = toKeywordPauseCandidates(
      [
        {
          ref: batches[0].items[0].ref,
          verdict: 'irrelevant',
          reason: '다른 브랜드명',
          keyword: '콩순이 비눗방울',
        },
      ],
      sourceByRef,
    );

    expect(candidates).toHaveLength(1);
  });

  it('ranks an impression-only keyword below one that is spending', () => {
    const { batches, sourceByRef } = buildKeywordProductBatches([
      source({ keyword: '돈 쓰는 키워드', spend: 900 }),
      source({ keyword: '노출만 하는 키워드', spend: 0, adTargetDailyId: 'target-2' }),
    ]);
    const { candidates } = toKeywordPauseCandidates(
      batches[0].items.map((item) => ({
        ref: item.ref,
        verdict: 'irrelevant' as const,
        reason: '무관',
      })),
      sourceByRef,
    );

    const byLabel = new Map(candidates.map((c) => [c.targetLabel, c.priority]));
    expect(byLabel.get('돈 쓰는 키워드')).toBe('high');
    expect(byLabel.get('노출만 하는 키워드')).toBe('medium');
  });
});

describe('parseKeywordRelevanceVerdicts', () => {
  it('accepts a bare array, a wrapped object, and a raw JSON string', () => {
    const rows = [{ ref: 'p1k1', verdict: 'irrelevant', reason: 'x' }];
    expect(parseKeywordRelevanceVerdicts(rows)).toHaveLength(1);
    expect(parseKeywordRelevanceVerdicts({ verdicts: rows })).toHaveLength(1);
    expect(
      parseKeywordRelevanceVerdicts(JSON.stringify({ verdicts: rows })),
    ).toHaveLength(1);
  });

  it('recovers JSON a model wrapped in prose or a code fence', () => {
    const wrapped =
      '판정 결과입니다:\n```json\n{"verdicts":[{"ref":"p1k1","verdict":"irrelevant","reason":"다른 브랜드"}]}\n```\n이상입니다.';
    const verdicts = parseKeywordRelevanceVerdicts(wrapped);
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0].ref).toBe('p1k1');
  });

  it('drops entries that are not well-formed verdicts', () => {
    expect(
      parseKeywordRelevanceVerdicts([
        { ref: 'p1k1', verdict: 'maybe', reason: 'x' },
        { ref: '', verdict: 'irrelevant', reason: 'x' },
        { verdict: 'irrelevant', reason: 'x' },
        'not-an-object',
        null,
      ]),
    ).toEqual([]);
  });

  it('returns nothing for a shape it does not recognise', () => {
    expect(parseKeywordRelevanceVerdicts(null)).toEqual([]);
    expect(parseKeywordRelevanceVerdicts('done')).toEqual([]);
  });
});
