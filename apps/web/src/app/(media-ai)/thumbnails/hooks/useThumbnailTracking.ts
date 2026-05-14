import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  ThumbnailTrackingListResponse,
  ThumbnailTrackingRecord,
  UpdateThumbnailTrackingMetrics,
} from '@kiditem/shared/ai';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

export type { ThumbnailTrackingRecord };
export type UpdateMetricsInput = UpdateThumbnailTrackingMetrics;
type TrackingStatus = ThumbnailTrackingRecord['status'];

export function useTrackingList(
  params: { page?: number; limit?: number; status?: TrackingStatus } = {},
) {
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
