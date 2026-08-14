import { describe, expect, it } from 'vitest';
import { deriveTrendKeywordAgent } from './trend-keyword-agent';

describe('deriveTrendKeywordAgent', () => {
  it('derives candidates only from the persisted operation snapshot', () => {
    const result = deriveTrendKeywordAgent({
      version: 'naver-keyword-analysis/v1',
      generatedAt: '2026-08-14T00:00:00.000Z',
      input: {
        action: 'trend_agent',
        timeUnit: 'date',
        gender: 'all',
        age: 'all',
        device: 'all',
        selectedBoardKey: 'all',
        rankLimit: 20,
        focusMode: 'all',
        finalLimit: 30,
      },
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
            ranks: [{ rank: 1, keyword: '레고', linkId: null, categories: [] }],
          }],
        },
        related: {
          source: 'naver-searchad-keywordstool',
          seedKeywords: ['레고'],
          generatedAt: '2026-08-14T00:00:00.000Z',
          items: [{
            keyword: '레고 블록',
            monthlyPcSearchCount: null,
            monthlyMobileSearchCount: null,
            monthlyTotalSearchCount: 1200,
            monthlyPcClickCount: null,
            monthlyMobileClickCount: null,
            monthlyTotalClickCount: null,
            monthlyPcClickRate: null,
            monthlyMobileClickRate: null,
            averageAdRank: null,
            competitionIndex: null,
          }],
        },
        autocomplete: [],
        trends: null,
      },
    });

    expect(result.candidates.map((candidate) => candidate.keyword)).toEqual(['레고', '레고 블록']);
    expect(result.candidates[0]).toMatchObject({ sourceLabels: ['DataLab 순위'] });
  });
});
