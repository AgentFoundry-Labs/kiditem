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

/**
 * 이 작업공간의 썸네일 생성 이력. 작업공간이 없으면(첫 생성 전) 읽지 않는다 — 원천 기록 id 로
 * 묻지 않는다(서버는 그 필터를 400 으로 거절한다).
 */
export function useSourcingThumbnailGenerations(contentWorkspaceId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.thumbnailAnalysis.generations({ contentWorkspaceId: contentWorkspaceId ?? '' }),
    enabled: !!contentWorkspaceId,
    queryFn: async (): Promise<ThumbnailGenerationItem[]> => {
      const searchParams = new URLSearchParams({ limit: '20', contentWorkspaceId: contentWorkspaceId! });
      const result = await apiClient.get<ThumbnailGenerationListResponse>(
        `/api/thumbnail-analysis/generations?${searchParams}`,
      );
      return result.items;
    },
    refetchInterval: (query) => {
      const items = query.state.data ?? [];
      return items.some((item) => item.status === 'pending' || item.status === 'running') ? 2500 : false;
    },
  });
}
