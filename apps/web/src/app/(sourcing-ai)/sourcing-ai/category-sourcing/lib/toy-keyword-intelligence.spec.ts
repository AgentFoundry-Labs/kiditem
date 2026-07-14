import { describe, expect, it } from 'vitest';
import {
  buildToyKeywordCsv,
  clusterToyKeywords,
  filterToyKeywords,
  mergeToyKeywordSignals,
  mobileShare,
  type ToyKeywordFilters,
} from './toy-keyword-intelligence';
import type { NaverKeywordTrendView, PopularKeywordBoardView } from './toy-trend-api';

const board: PopularKeywordBoardView = {
  boardKey: 'toys_dolls',
  boardLabel: '완구/인형',
  latest: [
    { rank: 1, keyword: '말랑이' },
    { rank: 2, keyword: '블록 장난감' },
    { rank: 3, keyword: '역할놀이' },
  ],
  risers: [
    { keyword: '말랑이', rankDelta: null },
    { keyword: '블록 장난감', rankDelta: 4 },
  ],
};

const trends: NaverKeywordTrendView[] = [
  {
    keyword: '말랑이',
    latest: {
      businessDate: '2026-07-13',
      monthlyTotalSearchCount: 1000,
      monthlyPcSearchCount: 100,
      monthlyMobileSearchCount: 900,
      competitionIndex: '낮음',
      averageAdRank: 2,
      trendRatio: 80,
      trendDelta: 20,
    },
    sparkline: [{ businessDate: '2026-07-13', trendRatio: 80, monthlyTotalSearchCount: 1000 }],
  },
  {
    keyword: '추적 전용 완구',
    latest: {
      businessDate: '2026-07-13',
      monthlyTotalSearchCount: null,
      monthlyPcSearchCount: null,
      monthlyMobileSearchCount: null,
      competitionIndex: null,
      averageAdRank: null,
      trendRatio: 30,
      trendDelta: -5,
    },
    sparkline: [],
  },
];

const baseFilters: ToyKeywordFilters = {
  scope: 'all',
  minSearches: null,
  query: '',
  quickFilters: [],
  sortBy: 'rank',
};

describe('toy keyword intelligence', () => {
  it('merges the real popular board and tracked snapshots without inventing missing metrics', () => {
    const rows = mergeToyKeywordSignals(board, trends);
    const popularAndTracked = rows.find((row) => row.keyword === '말랑이');
    const popularOnly = rows.find((row) => row.keyword === '역할놀이');
    const trackedOnly = rows.find((row) => row.keyword === '추적 전용 완구');

    expect(rows).toHaveLength(4);
    expect(popularAndTracked).toMatchObject({ boardRank: 1, monthlyTotalSearchCount: 1000, tracked: true });
    expect(popularOnly).toMatchObject({ boardRank: 3, monthlyTotalSearchCount: null, tracked: false });
    expect(trackedOnly).toMatchObject({ boardRank: null, monthlyTotalSearchCount: null, tracked: true });
  });

  it('applies only filters backed by collected values', () => {
    const rows = mergeToyKeywordSignals(board, trends);
    const filtered = filterToyKeywords(rows, {
      ...baseFilters,
      minSearches: 500,
      quickFilters: ['mobile-strong', 'trend-up'],
    });

    expect(filtered.map((row) => row.keyword)).toEqual(['말랑이']);
    expect(mobileShare(filtered[0])).toBe(90);
  });

  it('keeps popular-only and tracked-only scopes explicit', () => {
    const rows = mergeToyKeywordSignals(board, trends);
    const popular = filterToyKeywords(rows, { ...baseFilters, scope: 'popular' });
    const tracked = filterToyKeywords(rows, { ...baseFilters, scope: 'tracked' });

    expect(popular).toHaveLength(3);
    expect(tracked.map((row) => row.keyword)).toEqual(['말랑이', '추적 전용 완구']);
  });

  it('assigns each keyword to one non-empty signal cluster', () => {
    const rows = mergeToyKeywordSignals(board, trends);
    const clusters = clusterToyKeywords(rows);

    expect(clusters.every((cluster) => cluster.keywords.length > 0)).toBe(true);
    expect(clusters.flatMap((cluster) => cluster.keywords)).toHaveLength(rows.length);
    expect(clusters.find((cluster) => cluster.id === 'new-entry')?.keywords[0].keyword).toBe('말랑이');
  });

  it('exports null metrics as empty CSV cells rather than fabricated zeroes', () => {
    const rows = mergeToyKeywordSignals(board, trends);
    const csv = buildToyKeywordCsv(rows.filter((row) => row.keyword === '역할놀이'));

    expect(csv).toContain('"키워드","완구 인기순위"');
    expect(csv).toContain('"역할놀이","3","","",""');
    expect(csv).not.toContain('"역할놀이","3","0"');
  });
});
