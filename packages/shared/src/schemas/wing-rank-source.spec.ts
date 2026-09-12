import { describe, expect, it } from 'vitest';
import {
  WingRankCaptureSchema,
  WingRankSourceBeginSchema,
} from './wing-rank-source';

describe('Wing per-keyword source wire contract', () => {
  it('preserves the collector default and one-through-five page clamping', () => {
    expect(WingRankSourceBeginSchema.parse({ keyword: ' 슬라임 ' })).toEqual({
      keyword: '슬라임',
      maxPages: 5,
    });
    for (const [input, expected] of [
      [0, 1],
      [9, 5],
      [2.9, 2],
      ['3', 3],
      ['invalid', 5],
      [null, 1],
    ]) {
      expect(
        WingRankSourceBeginSchema.parse({ keyword: '슬라임', maxPages: input })
          .maxPages,
      ).toBe(expected);
    }
    expect(
      WingRankSourceBeginSchema.safeParse({
        keyword: '슬라임',
        organizationId: 'injected',
      }).success,
    ).toBe(false);
  });

  it('retains explicit observation evidence and an unavailable upstream total without inventing zero', () => {
    const input = {
      keyword: '슬라임',
      capturedAt: '2026-09-06T00:00:00.000Z',
      pagesScanned: 1,
      collectedCount: 0,
      totalResults: null,
      items: [],
      proof: {
        maxPages: 5,
        stopReason: 'empty_page',
        pages: [
          {
            searchPage: 0,
            itemCount: 0,
            nextSearchPage: null,
            resultArrayObserved: false,
          },
        ],
      },
    };
    expect(WingRankCaptureSchema.parse(input)).toEqual(input);
    const { resultArrayObserved: _, ...page } = input.proof.pages[0];
    expect(
      WingRankCaptureSchema.safeParse({
        ...input,
        proof: { ...input.proof, pages: [page] },
      }).success,
    ).toBe(false);
  });
});
