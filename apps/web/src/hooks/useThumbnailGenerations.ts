'use client';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ThumbnailGenerationItem } from '@kiditem/shared';

export function useGenerationList() {
  return useQuery({
    queryKey: queryKeys.thumbnailAnalysis.generations(),
    queryFn: async () => {
      const res = await apiClient.get<{ items: ThumbnailGenerationItem[]; total: number }>('/api/thumbnail-analysis/generations');
      return res?.items ?? [];
    },
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 3000; // 첫 로드 전에는 polling
      const hasActiveJobs = data.some((g) => g.status === 'pending' || g.status === 'generating');
      return hasActiveJobs ? 3000 : false;
    },
  });
}

export function useSelectCandidate() {
  const queryClient = useQueryClient();
  const qKey = queryKeys.thumbnailAnalysis.generations();
  return useMutation({
    mutationFn: ({ id, selectedUrl }: { id: string; selectedUrl: string }) =>
      apiClient.put(`/api/thumbnail-analysis/generations/${id}/select`, { selectedUrl }),
    onMutate: async ({ id, selectedUrl }) => {
      await queryClient.cancelQueries({ queryKey: qKey });
      const previous = queryClient.getQueryData<ThumbnailGenerationItem[]>(qKey);
      queryClient.setQueryData<ThumbnailGenerationItem[]>(qKey, (old) =>
        old?.map((g) => g.id === id ? { ...g, selectedUrl: selectedUrl || null, status: 'ready' } : g) ?? [],
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(qKey, context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: qKey });
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
