import {
  SourcingWingCatalogKeywordSchema,
  SourcingWingCatalogSnapshotSchema,
  type SourcingWingCatalogSnapshot,
} from '@kiditem/shared/sourcing';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

export function wingCatalogSnapshotQueryKey(keyword: string) {
  return queryKeys.sourcing.wingCatalog(normalizeWingCatalogKeyword(keyword));
}

export function fetchWingCatalogSnapshot(
  keyword: string,
): Promise<SourcingWingCatalogSnapshot> {
  const normalized = normalizeWingCatalogKeyword(keyword);
  return apiClient.getParsed(
    `/api/sourcing/workspace/wing-catalog?keyword=${encodeURIComponent(normalized)}`,
    SourcingWingCatalogSnapshotSchema,
  );
}

function normalizeWingCatalogKeyword(keyword: string): string {
  return SourcingWingCatalogKeywordSchema.parse(keyword).normalize('NFKC');
}
