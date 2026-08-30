import { describe, expect, it } from 'vitest';
import {
  SourcingKeywordAnalysisInputSchema,
  SourcingKeywordAnalysisSnapshotResponseSchema,
} from './keyword-analysis';

describe('SourcingKeywordAnalysis schemas', () => {
  it('rejects unknown or over-bounded analysis input fields', () => {
    expect(SourcingKeywordAnalysisInputSchema.safeParse({
      action: 'related',
      keyword: '레고',
      unexpected: true,
    }).success).toBe(false);

    expect(SourcingKeywordAnalysisInputSchema.safeParse({
      action: 'compare',
      keywords: Array.from({ length: 51 }, () => '레고'),
    }).success).toBe(false);
  });

  it('safely accepts no snapshot but rejects malformed nested provider rows', () => {
    expect(SourcingKeywordAnalysisSnapshotResponseSchema.safeParse(null).success).toBe(true);
    expect(SourcingKeywordAnalysisSnapshotResponseSchema.safeParse({
      version: 'naver-keyword-analysis/v1',
      generatedAt: '2026-08-14T00:00:00.000Z',
      input: { action: 'popular' },
      result: {
        popular: {
          source: 'naver-datalab-shopping-keyword-rank',
          timeUnit: 'date',
          startDate: '2026-08-01',
          endDate: '2026-08-14',
          device: null,
          gender: null,
          ages: [],
          generatedAt: '2026-08-14T00:00:00.000Z',
          boards: [{
            key: 'toys_dolls',
            label: '완구/인형',
            cid: 1,
            categoryPath: '완구',
            date: '',
            datetime: '',
            range: '',
            ranks: [{ rank: 1, keyword: '레고', linkId: null, categories: [], extra: true }],
          }],
        },
        related: null,
        autocomplete: [],
        trends: null,
      },
    }).success).toBe(false);
  });
});
