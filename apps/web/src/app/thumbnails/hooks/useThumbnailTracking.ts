import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

export interface ThumbnailTrackingRecord {
  id: string;
  productId: string;
  productName: string;
  generationId: string;
  originalGrade: string;
  originalScore: number;
  appliedAt: string;
  daysElapsed: number;
  status: string;
  ctrBefore: number | null;
  ctrAfter: number | null;
  ctrChange: number | null;
  reviewsBefore: number | null;
  reviewsAfter: number | null;
  salesBefore: number | null;
  salesAfter: number | null;
}

export interface UpdateMetricsInput {
  ctrBefore?: number;
  ctrAfter?: number;
  reviewsBefore?: number;
  reviewsAfter?: number;
  salesBefore?: number;
  salesAfter?: number;
  status?: string;
}

export function useTrackingList() {
  return useQuery({
    queryKey: queryKeys.thumbnailAnalysis.tracking(),
    queryFn: () => apiClient.get<ThumbnailTrackingRecord[]>('/api/thumbnail-tracking'),
  });
}

export function useUpdateMetrics() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateMetricsInput }) =>
      apiClient.patch<ThumbnailTrackingRecord>(`/api/thumbnail-tracking/${id}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.thumbnailAnalysis.tracking() });
    },
  });
}
