import {
  Sourcing1688ImageMatchInputSchema,
  Sourcing1688KeywordBatchInputSchema,
  Sourcing1688SearchSnapshotSchema,
  type Sourcing1688SearchSnapshot,
} from '@kiditem/shared/sourcing';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

export interface Wholesale1688ResultQuery {
  keywords?: readonly string[];
  targetIds?: readonly string[];
}

export function fetchWholesale1688Results(
  input: Wholesale1688ResultQuery,
): Promise<Sourcing1688SearchSnapshot> {
  const normalized = normalizeWholesale1688ResultQuery(input);
  const params = new URLSearchParams();
  for (const keyword of normalized.keywords) params.append('keyword', keyword);
  for (const targetId of normalized.targetIds) params.append('targetId', targetId);
  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  return apiClient.getParsed(
    `/api/sourcing/wholesale/1688-results${suffix}`,
    Sourcing1688SearchSnapshotSchema,
  );
}

export function wholesale1688ResultsQueryKey(input: Wholesale1688ResultQuery) {
  const normalized = normalizeWholesale1688ResultQuery(input);
  return queryKeys.sourcing.wholesale1688Results(
    normalized.keywords,
    normalized.targetIds,
  );
}

export function normalizeWholesale1688ResultQuery(
  input: Wholesale1688ResultQuery,
): { keywords: string[]; targetIds: string[] } {
  return {
    keywords: input.keywords && input.keywords.length > 0
      ? Sourcing1688KeywordBatchInputSchema.parse({
          keywords: [...input.keywords],
        }).keywords
      : [],
    targetIds: input.targetIds && input.targetIds.length > 0
      ? Sourcing1688ImageMatchInputSchema.parse({
          targetIds: [...input.targetIds],
        }).targetIds
      : [],
  };
}
