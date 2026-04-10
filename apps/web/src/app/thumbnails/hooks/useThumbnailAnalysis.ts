'use client';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ThumbnailAnalysisResult, ThumbnailAnalysisSummary } from '@kiditem/shared';

export type AnalysisScope = 'all' | 'quality' | 'compliance';

export interface AnalysisListResponse {
  total: number;
  analyzed: number;
  partialCount: number;
  unclassifiedCount: number;
  gradeDistribution: Record<string, number>;
  complianceDistribution: Record<string, number>;
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
    mutationFn: (data: { productId?: string; imageUrl?: string; productName?: string; scope?: AnalysisScope }) =>
      apiClient.post<ThumbnailAnalysisResult>('/api/thumbnail-analysis/analyze', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.thumbnailAnalysis.all });
    },
  });
}

export function useAnalyzeBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { productIds: string[]; scope?: AnalysisScope }) =>
      apiClient.post<ThumbnailAnalysisResult[]>('/api/thumbnail-analysis/analyze-batch', params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.thumbnailAnalysis.all });
    },
  });
}
