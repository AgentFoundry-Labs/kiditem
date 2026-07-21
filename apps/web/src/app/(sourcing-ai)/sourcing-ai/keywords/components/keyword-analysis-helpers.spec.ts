import { describe, expect, it } from 'vitest';
import type {
  NaverDatalabPopularKeywordBoard,
  NaverDatalabPopularKeywordRank,
} from '../../recommendations/lib/naver-keyword-api';
import { normalizeExcludeKeyword, projectVisibleBoard } from './keyword-analysis-helpers';

function board(keywords: string[], overrides: Partial<NaverDatalabPopularKeywordBoard> = {}): NaverDatalabPopularKeywordBoard {
  const ranks: NaverDatalabPopularKeywordRank[] = keywords.map((keyword, index) => ({
    rank: index + 1,
    keyword,
    linkId: null,
    categories: [],
  }));
  return {
    key: 'toys_dolls',
    label: '완구/인형',
    cid: 50000142,
    categoryPath: '출산/육아 > 완구/인형',
    date: '2026-07-21',
    datetime: '',
    range: '',
    ranks,
    error: null,
    ...overrides,
  };
}

const excludeSetOf = (...keywords: string[]) => new Set(keywords.map(normalizeExcludeKeyword));

describe('projectVisibleBoard', () => {
  it('honours the requested display count (버튼이 실제로 반영된다)', () => {
    const source = board(Array.from({ length: 20 }, (_, index) => `키워드${index + 1}`));

    expect(projectVisibleBoard(source, 10, excludeSetOf()).ranks).toHaveLength(10);
    expect(projectVisibleBoard(source, 20, excludeSetOf()).ranks).toHaveLength(20);
    expect(projectVisibleBoard(source, 5, excludeSetOf()).ranks).toHaveLength(5);
  });

  it('fills the excluded slot with the next-ranked keyword (제외 후 다음 순위로 채운다)', () => {
    const source = board(['레고', '포켓몬카드', '캐릭터인형', '역할놀이', '유아블록', '자동차장난감']);

    const result = projectVisibleBoard(source, 5, excludeSetOf('포켓몬카드'));

    // 5개를 요청했고 원천은 6개이므로 제외 후에도 5개가 유지되어야 한다.
    expect(result.ranks).toHaveLength(5);
    expect(result.ranks.map((rank) => rank.keyword)).toEqual([
      '레고',
      '캐릭터인형',
      '역할놀이',
      '유아블록',
      '자동차장난감',
    ]);
    expect(result.sourceExhausted).toBe(false);
  });

  it('renumbers ranks 1..N with no gaps after exclusion (빈 번호가 없다)', () => {
    const source = board(['레고', '포켓몬카드', '캐릭터인형', '역할놀이', '유아블록', '자동차장난감']);

    const result = projectVisibleBoard(source, 5, excludeSetOf('포켓몬카드'));

    expect(result.ranks.map((rank) => rank.rank)).toEqual([1, 2, 3, 4, 5]);
  });

  it('normalizes whitespace/case when matching excludes', () => {
    const source = board(['포켓몬 카드', '레고']);

    const result = projectVisibleBoard(source, 5, excludeSetOf('포켓몬카드'));

    expect(result.ranks.map((rank) => rank.keyword)).toEqual(['레고']);
  });

  it('marks source exhausted instead of silently shrinking (조용히 줄이지 않는다)', () => {
    // 원천 20개 중 2개를 제외하면 18개만 남는데 20개를 요청했으므로 부족을 표기한다.
    const source = board(Array.from({ length: 20 }, (_, index) => `키워드${index + 1}`));

    const result = projectVisibleBoard(source, 20, excludeSetOf('키워드1', '키워드2'));

    expect(result.ranks).toHaveLength(18);
    expect(result.requestedLimit).toBe(20);
    expect(result.sourceExhausted).toBe(true);
    // 남은 것은 그대로 1..18 로 다시 매겨진다.
    expect(result.ranks.map((rank) => rank.rank)).toEqual(
      Array.from({ length: 18 }, (_, index) => index + 1),
    );
  });

  it('does not flag exhaustion when the pool comfortably covers the request', () => {
    const source = board(Array.from({ length: 20 }, (_, index) => `키워드${index + 1}`));

    const result = projectVisibleBoard(source, 10, excludeSetOf('키워드1'));

    expect(result.ranks).toHaveLength(10);
    expect(result.sourceExhausted).toBe(false);
  });

  it('never reports exhaustion for a failed board (호출 실패는 부족이 아니다)', () => {
    const failed = board([], { error: 'DataLab 호출 제한' });

    const result = projectVisibleBoard(failed, 20, excludeSetOf());

    expect(result.ranks).toHaveLength(0);
    expect(result.sourceExhausted).toBe(false);
  });
});
