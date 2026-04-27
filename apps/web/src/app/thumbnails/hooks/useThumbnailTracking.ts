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

export interface ThumbnailTrackingListResponse {
  items: ThumbnailTrackingRecord[];
  total: number;
  page: number;
  limit: number;
}

export function useTrackingList(params: { page?: number; limit?: number; status?: string } = {}) {
  const { page = 1, limit = 50, status } = params;
  const search = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (status) search.set('status', status);
  return useQuery({
    queryKey: [...queryKeys.thumbnailAnalysis.tracking(), page, limit, status ?? 'all'],
    queryFn: () =>
      apiClient
        .get<ThumbnailTrackingListResponse>(`/api/thumbnail-tracking?${search.toString()}`)
        .catch(() => ({ items: [], total: 0, page, limit })),
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
