import {
  canonicalizeSourcingWingCatalogKeyword,
  sourcingWingCatalogKeywordIdentity,
} from '@kiditem/shared/sourcing';

export function normalizeWingOperationKeywords(
  values: readonly (string | null | undefined)[],
  limit = 12,
): string[] {
  const keywords: string[] = [];
  const identities = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const keyword = canonicalizeSourcingWingCatalogKeyword(value);
    if (!keyword || keyword.length > 100) continue;
    const identity = sourcingWingCatalogKeywordIdentity(keyword);
    if (identities.has(identity)) continue;
    identities.add(identity);
    keywords.push(keyword);
    if (keywords.length >= limit) break;
  }
  return keywords;
}
