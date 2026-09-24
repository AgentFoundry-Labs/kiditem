'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ImageSpec } from '@kiditem/shared/ai';
import type {
  ListingThumbnailEvaluation,
  ListingThumbnailEvaluationSummary,
} from '@kiditem/shared/product-content';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

/**
 * 몰이 보여 주는 리스팅 대표이미지의 평가(Content, KID-313 W3a). 리스팅 id 와 이미지 URL 은 Channels 리스팅
 * 조회에서 읽어 보낸다 — Content 는 리스팅 표를 읽지 않는다. 이미지가 바뀌면 새 평가가 필요하다.
 */
export interface ListingImage {
  channelListingId: string;
  imageUrl: string | null;
}

export interface CurrentListingEvaluations {
  evaluations: ListingThumbnailEvaluation[];
  summary: ListingThumbnailEvaluationSummary;
}

export function useCurrentListingEvaluations(listings: readonly ListingImage[]) {
  return useQuery({
    queryKey: queryKeys.listingThumbnailEvaluations.current(listings),
    enabled: listings.length > 0,
    queryFn: () =>
      apiClient.post<CurrentListingEvaluations>('/api/ai/listing-thumbnails/current', {
        listings: listings.map((listing) => ({ channelListingId: listing.channelListingId, imageUrl: listing.imageUrl })),
      }),
  });
}

/**
 * 평가는 모델을 명시해야 한다 — 서버는 모델 없는 요청을 400 으로 거절한다. 현재 평가는 다시 읽지 않는다 — 여러 장을
 * 차례로 평가하는 호출자가 끝에 한 번 `useRefreshListingEvaluations` 로 읽는다.
 */
export function useEvaluateListingThumbnail() {
  return useMutation({
    mutationFn: (input: { channelListingId: string; imageUrl: string; modelId: string }) =>
      apiClient.post<{ evaluation: ListingThumbnailEvaluation; imageSpec: ImageSpec | null }>(
        `/api/ai/listing-thumbnails/${encodeURIComponent(input.channelListingId)}/evaluate`,
        { imageUrl: input.imageUrl, modelId: input.modelId },
      ),
  });
}

export function useRefreshListingEvaluations() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.listingThumbnailEvaluations.all });
}
