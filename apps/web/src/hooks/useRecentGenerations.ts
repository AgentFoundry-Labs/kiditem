'use client';

import { useQuery } from '@tanstack/react-query';
import type { ThumbnailGenerationItem } from '@kiditem/shared/ai';

import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

export function useRecentGenerations(productId: string | null, limit = 10) {
  return useQuery({
    queryKey: queryKeys.thumbnailAnalysis.generations(
      productId ? { productId, limit: String(limit) } : { productId: '', limit: String(limit) },
    ),
    queryFn: async () => {
      const res = await apiClient.get<{ items: ThumbnailGenerationItem[]; total: number }>(
        `/api/thumbnail-analysis/generations?productId=${encodeURIComponent(productId ?? '')}&limit=${limit}`,
      );
      return res?.items ?? [];
    },
    enabled: !!productId,
  });
}
