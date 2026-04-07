'use client';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ThumbnailAnalysisResult, ThumbnailAnalysisSummary } from '@kiditem/shared';

export interface AnalysisListResponse {
  total: number;
  analyzed: number;
  unclassifiedCount: number;
  gradeDistribution: Record<string, number>;
  allResults: ThumbnailAnalysisResult[];
  unclassified: ThumbnailAnalysisResult[];
}

export function useAnalysisList() {
  return useQuery({
    queryKey: queryKeys.thumbnailAnalysis.list({}),
    queryFn: () => apiClient.get<AnalysisListResponse>('/api/thumbnail-analysis'),
  });
}

export function useAnalysisSummary() {
  return useQuery({
    queryKey: queryKeys.thumbnailAnalysis.summary(),
    queryFn: () => apiClient.get<ThumbnailAnalysisSummary>('/api/thumbnail-analysis/summary'),
  });
}

export function useAnalyze() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { productId?: string; imageUrl?: string; productName?: string }) =>
      apiClient.post<ThumbnailAnalysisResult>('/api/thumbnail-analysis/analyze', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.thumbnailAnalysis.all });
    },
  });
}

export function useAnalyzeBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (productIds: string[]) =>
      apiClient.post<ThumbnailAnalysisResult[]>('/api/thumbnail-analysis/analyze-batch', { productIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.thumbnailAnalysis.all });
    },
  });
}
