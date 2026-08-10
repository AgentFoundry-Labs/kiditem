import type { PopularKeywordBoardView } from '../market/lib/trend-collection-api';

/**
 * Preserves the server-provided board and rank order. It intentionally does not
 * score or persist a client-side keyword pool.
 */
export function popularKeywordSuggestions(
  boards: readonly PopularKeywordBoardView[],
  limit: number,
): string[] {
  const seen = new Set<string>();
  const keywords: string[] = [];

  for (const board of boards) {
    for (const entry of [...board.latest].sort((left, right) => left.rank - right.rank)) {
      const keyword = entry.keyword.trim();
      const key = keyword.normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g, '');
      if (!keyword || seen.has(key)) continue;
      seen.add(key);
      keywords.push(keyword);
      if (keywords.length === limit) return keywords;
    }
  }

  return keywords;
}
