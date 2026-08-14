import {
  SourcingKeywordSuggestionSnapshotSchema,
  SourcingWingCatalogKeywordSchema,
  type SourcingKeywordSuggestionSnapshot,
} from '@kiditem/shared/sourcing';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

export function keywordSuggestionSnapshotQueryKey(keyword: string) {
  return queryKeys.sourcing.keywordSuggestions(normalizeKeyword(keyword));
}

export function fetchCoupangKeywordSuggestionSnapshot(
  keyword: string,
): Promise<SourcingKeywordSuggestionSnapshot> {
  const normalized = normalizeKeyword(keyword);
  return apiClient.getParsed(
    `/api/sourcing/workspace/keyword-suggestions?keyword=${encodeURIComponent(normalized)}`,
    SourcingKeywordSuggestionSnapshotSchema,
  );
}

function normalizeKeyword(keyword: string): string {
  return SourcingWingCatalogKeywordSchema.parse(keyword);
}
