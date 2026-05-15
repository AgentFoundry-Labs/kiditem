'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ThumbnailGenerationItem, ThumbnailGenerationListResponse } from '@kiditem/shared/ai';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

interface GenerateSourcingThumbnailRequest {
  sourceCandidateId: string;
  productImage: string;
  productName?: string;
  productDescription?: string;
}

interface GenerateSourcingThumbnailResponse {
  candidates: Array<{ url: string; filename: string }>;
  generationId: string | null;
  status?: 'pending';
}

export function useGenerateSourcingThumbnail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: GenerateSourcingThumbnailRequest) =>
      apiClient.post<GenerateSourcingThumbnailResponse>('/api/thumbnail-editor/generate', {
        sourceCandidateId: data.sourceCandidateId,
        productImage: data.productImage,
        productName: data.productName,
        productDescription: data.productDescription,
        purpose: 'compliance',
        mode: 'edit',
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.thumbnailAnalysis.generations({
          sourceCandidateId: variables.sourceCandidateId,
        }),
      });
    },
  });
}

export function useSourcingThumbnailGenerations(sourceCandidateId: string | null) {
  return useQuery({
    queryKey: sourceCandidateId
      ? queryKeys.thumbnailAnalysis.generations({ sourceCandidateId })
      : queryKeys.thumbnailAnalysis.generations({ sourceCandidateId: '' }),
    enabled: !!sourceCandidateId,
    queryFn: async (): Promise<ThumbnailGenerationItem[]> => {
      if (!sourceCandidateId) return [];
      const params = new URLSearchParams({
        sourceCandidateId,
        limit: '20',
      });
      const result = await apiClient.get<ThumbnailGenerationListResponse>(
        `/api/thumbnail-analysis/generations?${params}`,
      );
      return result.items;
    },
    refetchInterval: (query) => {
      const items = query.state.data ?? [];
      return items.some((item) => item.status === 'pending' || item.status === 'running')
        ? 2500
        : false;
    },
  });
}
