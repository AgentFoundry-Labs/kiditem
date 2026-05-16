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

export function useSourcingThumbnailGenerations(params: {
  sourceCandidateId?: string | null;
  registrationWorkspaceId?: string | null;
}) {
  const sourceCandidateId = params.sourceCandidateId ?? null;
  const registrationWorkspaceId = params.registrationWorkspaceId ?? null;
  const filterParams: Record<string, string> = registrationWorkspaceId
    ? { registrationWorkspaceId }
    : sourceCandidateId
      ? { sourceCandidateId }
      : { sourceCandidateId: '' };
  return useQuery({
    queryKey: queryKeys.thumbnailAnalysis.generations(filterParams),
    enabled: !!sourceCandidateId || !!registrationWorkspaceId,
    queryFn: async (): Promise<ThumbnailGenerationItem[]> => {
      if (!sourceCandidateId && !registrationWorkspaceId) return [];
      const searchParams = new URLSearchParams({ limit: '20' });
      if (registrationWorkspaceId) {
        searchParams.set('registrationWorkspaceId', registrationWorkspaceId);
      } else if (sourceCandidateId) {
        searchParams.set('sourceCandidateId', sourceCandidateId);
      }
      const result = await apiClient.get<ThumbnailGenerationListResponse>(
        `/api/thumbnail-analysis/generations?${searchParams}`,
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
