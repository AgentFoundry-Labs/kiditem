'use client';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ThumbnailGenerationItem } from '@kiditem/shared';

export function useGenerationList() {
  const query = useQuery({
    queryKey: queryKeys.thumbnailAnalysis.generations({}),
    queryFn: async () => {
      const res = await apiClient.get<{ items: ThumbnailGenerationItem[]; total: number }>('/api/thumbnail-analysis/generations');
      return res?.items ?? [];
    },
  });

  const hasActiveJobs = query.data?.some((g) => g.status === 'pending' || g.status === 'generating') ?? false;

  return {
    ...query,
    refetchInterval: hasActiveJobs ? 3000 : false,
  };
}

export function useSelectCandidate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, selectedUrl }: { id: string; selectedUrl: string }) =>
      apiClient.put(`/api/thumbnail-analysis/generations/${id}/select`, { selectedUrl }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.thumbnailAnalysis.generations() });
    },
  });
}

export function useApplyGeneration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.put(`/api/thumbnail-analysis/generations/${id}/apply`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.thumbnailAnalysis.generations() });
    },
  });
}

export function useSkipGeneration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.put(`/api/thumbnail-analysis/generations/${id}/skip`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.thumbnailAnalysis.generations() });
    },
  });
}

export function useDeleteGeneration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.delete(`/api/thumbnail-analysis/generations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.thumbnailAnalysis.generations() });
    },
  });
}

export function useCreateEditJobs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { productIds: string[]; purpose?: 'compliance' | 'quality' }) =>
      apiClient.post<ThumbnailGenerationItem[]>('/api/thumbnail-analysis/edit-jobs', params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.thumbnailAnalysis.generations() });
    },
  });
}
