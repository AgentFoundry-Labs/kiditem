'use client';

import { useQuery } from '@tanstack/react-query';
import type { ThumbnailGenerationItem } from '@kiditem/shared/ai';

import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

export function useRecentGenerations(contentWorkspaceId: string | null, limit = 10) {
  return useQuery({
    queryKey: queryKeys.thumbnailAnalysis.generations(
      contentWorkspaceId
        ? { contentWorkspaceId, limit: String(limit) }
        : { contentWorkspaceId: '', limit: String(limit) },
    ),
    queryFn: async () => {
      const res = await apiClient.get<{
        items: ThumbnailGenerationItem[];
        total: number;
      }>(
        `/api/thumbnail-analysis/generations?contentWorkspaceId=${encodeURIComponent(contentWorkspaceId ?? '')}&limit=${limit}`,
      );
      return res?.items ?? [];
    },
    enabled: !!contentWorkspaceId,
  });
}
