import type { WingCatalogProduct } from './wing-catalog-extension';

export interface KeywordFrequency {
  keyword: string;
  count: number;
}

const stopWords = new Set([
  '무료배송',
  '로켓배송',
  '국내배송',
  '해외배송',
  '랜덤',
  '색상',
  '옵션',
  '정품',
  '신상',
  '세트상품',
]);

export function buildProductNameKeywordFrequencies(
  rows: WingCatalogProduct[],
  seedKeyword: string,
  limit = 10,
): KeywordFrequency[] {
  const counts = new Map<string, { keyword: string; count: number }>();
  const normalizedSeed = compactKeyword(seedKeyword);

  for (const row of rows.slice(0, 80)) {
    const text = `${row.productName} ${row.itemName ?? ''}`;
    const tokens = tokenizeProductName(text);
    const tokenKeys = new Set(tokens.map((token) => compactKeyword(token)));

    for (const token of tokens) {
      incrementKeyword(counts, token);
    }

    if (seedKeyword && normalizedSeed && compactKeyword(text).includes(normalizedSeed) && !tokenKeys.has(normalizedSeed)) {
      incrementKeyword(counts, seedKeyword.trim());
    }
  }

  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.keyword.localeCompare(b.keyword, 'ko'))
    .slice(0, limit);
}

export function buildRelatedKeywordCandidates(input: {
  seedKeyword: string;
  searchAdKeywords: string[];
  productNameKeywords: string[];
  limit?: number;
}): string[] {
  const seed = input.seedKeyword.trim();
  const candidates = [
    ...input.searchAdKeywords,
    ...input.productNameKeywords,
    ...generatedKeywordCandidates(seed),
  ];
  return uniqueKeywords(candidates, input.limit ?? 10);
}

export function buildAutocompleteKeywordCandidates(input: {
  seedKeyword: string;
  relatedKeywords: string[];
  limit?: number;
}): string[] {
  const seed = input.seedKeyword.trim();
  const compactSeed = compactKeyword(seed);
  const suffixes = ['슬라임', '세트', '키트', '만들기 세트', '추천', '대용량', '통', '재료', '선물세트', '보관함'];
  const generated = suffixes
    .filter((suffix) => compactKeyword(suffix) !== compactSeed)
    .map((suffix) => `${seed} ${suffix}`.trim())
    .filter((keyword) => keyword && compactKeyword(keyword) !== compactSeed);
  return uniqueKeywords([...generated, ...input.relatedKeywords], input.limit ?? 10);
}

function generatedKeywordCandidates(seed: string): string[] {
  if (!seed) return [];
  return [
    `${seed} 세트`,
    `${seed} 만들기`,
    `${seed} 키트`,
    `${seed} 재료`,
    `${seed} 추천`,
    `${seed} 대용량`,
    `${seed} 선물`,
    `${seed} 통`,
  ];
}

function tokenizeProductName(text: string): string[] {
  return text
    .replace(/[^\p{Letter}\p{Number}\s]/gu, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(isUsefulToken);
}

function isUsefulToken(token: string): boolean {
  if (!token) return false;
  if (stopWords.has(token)) return false;
  if (/^\d+$/.test(token)) return false;
  if (token.length >= 2) return true;
  return /^\d+개$/.test(token);
}

function incrementKeyword(counts: Map<string, { keyword: string; count: number }>, keyword: string) {
  const trimmed = keyword.trim();
  if (!trimmed) return;
  const key = compactKeyword(trimmed);
  const current = counts.get(key);
  if (current) {
    current.count += 1;
    return;
  }
  counts.set(key, { keyword: trimmed, count: 1 });
}

function uniqueKeywords(keywords: string[], limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const keyword of keywords) {
    const trimmed = keyword.trim();
    const key = compactKeyword(trimmed);
    if (!trimmed || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
    if (result.length >= limit) break;
  }

  return result;
}

function compactKeyword(keyword: string): string {
  return keyword.replace(/\s+/g, '').toLowerCase();
}
