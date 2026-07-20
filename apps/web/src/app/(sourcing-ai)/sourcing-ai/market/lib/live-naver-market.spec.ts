import { describe, expect, it } from 'vitest';
import { buildLiveNaverMarketResult } from './live-naver-market';

describe('live Naver market model', () => {
  it('combines exact monthly volume with DataLab momentum and ranks the result', () => {
    const result = buildLiveNaverMarketResult({
      related: {
        source: 'naver-searchad-keywordstool',
        generatedAt: '2026-07-13T01:00:00.000Z',
        items: [
          { keyword: '말랑이', monthlyTotalSearchCount: 184000, competitionIndex: '중간' },
          { keyword: '키링 만들기', monthlyTotalSearchCount: 32000, competitionIndex: '높음' },
          { keyword: '물총', monthlyTotalSearchCount: 50000, competitionIndex: '낮음' },
          { keyword: '터닝메카드', monthlyTotalSearchCount: 80000, competitionIndex: '중간' },
        ],
      },
      trends: {
        source: 'naver-datalab-search-trend',
        generatedAt: '2026-07-13T01:01:00.000Z',
        items: [
          {
            keyword: '말랑이', latestRatio: 90, previousAverageRatio: 45, trendDelta: 45, trendRate: 1,
            data: [{ period: '2026-07-12', ratio: 45 }, { period: '2026-07-13', ratio: 90 }],
          },
          {
            keyword: '키링 만들기', latestRatio: 60, previousAverageRatio: 50, trendDelta: 10, trendRate: 0.2,
            data: [{ period: '2026-07-13', ratio: 60 }],
          },
          {
            keyword: '물총', latestRatio: 20, previousAverageRatio: 40, trendDelta: -20, trendRate: -0.5,
            data: [{ period: '2026-07-13', ratio: 20 }],
          },
        ],
      },
    });

    expect(result.generatedAt).toBe('2026-07-13T01:01:00.000Z');
    expect(result.opportunities).toHaveLength(4);
    expect(result.opportunities[0]).toMatchObject({
      keyword: '말랑이',
      category: 'toy',
      trendRank: 1,
      monthlySearches: 184000,
      momentum: 100,
      sources: ['NAVER'],
    });
    expect(result.opportunities.find((item) => item.keyword === '키링 만들기')).toMatchObject({
      category: 'stationery',
      monthlySearches: 32000,
      competition: '높음',
    });
    expect(result.opportunities.find((item) => item.keyword === '터닝메카드')).toMatchObject({
      decision: 'licensed',
    });
  });

  it('deduplicates compact-equivalent keywords and keeps the higher-volume row', () => {
    const result = buildLiveNaverMarketResult({
      related: {
        source: 'naver-searchad-keywordstool',
        generatedAt: '2026-07-13T01:00:00.000Z',
        items: [
          { keyword: '키링 만들기', monthlyTotalSearchCount: 1000, competitionIndex: '낮음' },
          { keyword: '키링만들기', monthlyTotalSearchCount: 3000, competitionIndex: '중간' },
        ],
      },
      trends: null,
    });

    expect(result.opportunities).toHaveLength(1);
    expect(result.opportunities[0]).toMatchObject({
      keyword: '키링만들기',
      category: 'stationery',
      monthlySearches: 3000,
    });
  });

  it('removes unrelated related-keyword results before ranking', () => {
    const result = buildLiveNaverMarketResult({
      related: {
        source: 'naver-searchad-keywordstool',
        generatedAt: '2026-07-13T01:00:00.000Z',
        items: [
          { keyword: '스와들업', monthlyTotalSearchCount: 90000, competitionIndex: '높음' },
          { keyword: '라탄백', monthlyTotalSearchCount: 70000, competitionIndex: '중간' },
          { keyword: '노트북', monthlyTotalSearchCount: 500000, competitionIndex: '높음' },
          { keyword: '터닝메카드', monthlyTotalSearchCount: 80000, competitionIndex: '중간' },
          { keyword: '다꾸 스티커', monthlyTotalSearchCount: 15000, competitionIndex: '낮음' },
        ],
      },
      trends: null,
    });

    expect(result.opportunities.map((item) => item.keyword)).toEqual([
      '터닝메카드',
      '다꾸 스티커',
    ]);
  });
});
