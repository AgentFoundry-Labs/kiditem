'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

export interface GenerationHistoryItem {
  id: string;
  generatedTitle: string | null;
  status: string;
  detailPageData: Record<string, unknown> | null;
  errorMessage: string | null;
  createdAt: string;
}

/**
 * `/api/products/:id/history` — 시간순 (최신 첫) N rows.
 * Python ContentAgent 가 매 generation 호출마다 INSERT 하므로 자연스러운 history.
 */
export function useGenerationHistory(productId: string) {
  return useQuery({
    queryKey: [...queryKeys.sourcing.detail(productId), 'history'],
    queryFn: () => apiClient.get<GenerationHistoryItem[]>(`/api/products/${productId}/history`),
    enabled: !!productId,
  });
}

/**
 * DELETE `/api/products/:productId/history/:generationId` — content_generations 단건 삭제.
 * onSuccess 시 history list invalidate.
 */
export function useGenerationHistoryDelete(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (generationId: string) =>
      apiClient.delete<{ ok: true }>(`/api/products/${productId}/history/${generationId}`),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: [...queryKeys.sourcing.detail(productId), 'history'],
      });
    },
  });
}
