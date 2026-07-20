import { describe, expect, it } from 'vitest';
import type {
  NaverKeywordTrendView,
  PopularKeywordBoardView,
} from '../../../market/lib/trend-collection-api';
import {
  aggregateTrendKeywords,
  buildTrendKeywords,
  normalizeKeyword,
} from '../rising-keywords';

function board(
  boardLabel: string,
  opts: {
    risers?: Array<[string, number | null]>;
    latest?: Array<[number, string]>;
  },
): PopularKeywordBoardView {
  return {
    boardKey: boardLabel,
    boardLabel,
    latest: (opts.latest ?? []).map(([rank, keyword]) => ({ rank, keyword })),
    risers: (opts.risers ?? []).map(([keyword, rankDelta]) => ({ keyword, rankDelta })),
  };
}

function naver(keyword: string, trendDelta: number | null, volume: number | null): NaverKeywordTrendView {
  return {
    keyword,
    latest: {
      businessDate: '2026-07-17',
      monthlyTotalSearchCount: volume,
      monthlyPcSearchCount: null,
      monthlyMobileSearchCount: null,
      competitionIndex: null,
      averageAdRank: null,
      trendRatio: null,
      trendDelta,
    },
    sparkline: [],
  };
}

describe('buildTrendKeywords', () => {
  it('prefers Naver search keywords, ordered rising(trendDelta) → search volume', () => {
    const result = buildTrendKeywords({
      naverKeywords: [
        naver('버터슬라임', 30, 5000),
        naver('클리어슬라임', null, 20000),
        naver('슬라임파츠', 10, 3000),
      ],
      boards: [board('완구', { risers: [['액체괴물', 9]] })],
      tracked: ['슬라임파츠'],
    });

    expect(result.map((r) => r.keyword)).toEqual(['버터슬라임', '슬라임파츠', '클리어슬라임']);
    expect(result.every((r) => r.kind === 'search')).toBe(true);
    expect(result[0].monthlySearchVolume).toBe(5000);
    expect(result.find((r) => r.keyword === '슬라임파츠')!.tracked).toBe(true);
    // 보드 급상승(액체괴물)은 검색 키워드가 있을 때 노출되지 않는다.
    expect(result.some((r) => r.keyword === '액체괴물')).toBe(false);
  });

  it('falls back to popular boards when there are no Naver keywords', () => {
    const result = buildTrendKeywords({
      naverKeywords: [],
      boards: [board('완구', { risers: [['액체괴물', null]], latest: [[1, '슬라임']] })],
      tracked: [],
    });
    expect(result.map((r) => r.keyword)).toEqual(['액체괴물', '슬라임']);
    expect(result[0].kind).toBe('rising');
    expect(result[1].kind).toBe('popular');
  });
});

describe('aggregateTrendKeywords (board fallback)', () => {
  it('flattens risers across boards, dedupes, and orders NEW → rankDelta → board count', () => {
    const boards = [
      board('완구', { risers: [['슬라임', 3], ['액체괴물', null]] }),
      board('문구', { risers: [['슬라임', 5], ['포토카드', 8]] }),
    ];
    const result = aggregateTrendKeywords(boards, []);
    expect(result.map((r) => r.keyword)).toEqual(['액체괴물', '포토카드', '슬라임']);
    expect(result.find((r) => r.keyword === '슬라임')!.rankDelta).toBe(5);
    expect(result.find((r) => r.keyword === '슬라임')!.boards).toEqual(['완구', '문구']);
  });

  it('falls back to latest popular keywords when a board has no risers', () => {
    const result = aggregateTrendKeywords(
      [board('완구', { risers: [], latest: [[1, '슬라임'], [2, '포토카드']] })],
      [],
    );
    expect(result.map((r) => r.keyword)).toEqual(['슬라임', '포토카드']);
    expect(result.every((r) => r.kind === 'popular')).toBe(true);
  });

  it('marks tracked keywords (normalized) and respects the limit', () => {
    const boards = [board('완구', { risers: [['포토 카드', 4], ['스퀴시', 2], ['슬라임', 1]] })];
    const result = aggregateTrendKeywords(boards, ['포토카드'], 2);
    expect(result).toHaveLength(2);
    expect(result.find((r) => r.keyword === '포토 카드')!.tracked).toBe(true);
  });
});

describe('normalizeKeyword', () => {
  it('strips case and spaces', () => {
    expect(normalizeKeyword('  포토 카드 ')).toBe('포토카드');
  });
});
