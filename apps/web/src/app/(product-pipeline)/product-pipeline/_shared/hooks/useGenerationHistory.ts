'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import {
  toLegacyGenerationStatus,
  type DetailGenerationHistoryItem,
} from '../lib/detail-generation-history';

export type GenerationHistoryItem = DetailGenerationHistoryItem;

interface SourcingContentArchiveResponse {
  items: Array<{
    id: string;
    title: string;
    status: string;
    templateId: string | null;
    detailPageData: Record<string, unknown> | null;
    imageUrls: string[];
    processedImages: Record<string, string>;
    detailPageArtifactId: string | null;
    detailPageRevisionId: string | null;
    errorMessage: string | null;
    productId: string | null;
    createdAt: string;
  }>;
}

/**
 * 후보 상세의 생성 이력은 MasterProduct history 가 아니라
 * ContentGenerationSource(sourceCandidateId) linkage 를 source of truth 로 본다.
 */
export function useGenerationHistory(
  productId: string,
  initialHistory?: GenerationHistoryItem[],
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: [...queryKeys.sourcing.detail(productId), 'history'],
    queryFn: async () => {
      const data = await apiClient.get<SourcingContentArchiveResponse>(
        `/api/ai/content-archive/sourcing/${productId}?limit=50&contentType=detail_page`,
      );
      return data.items.map((item) => ({
        id: item.id,
        generatedTitle: item.title,
        status: toLegacyGenerationStatus(item.status),
        templateId: item.templateId,
        detailPageData: item.detailPageData,
        imageUrls: item.imageUrls,
        processedImages: item.processedImages,
        detailPageArtifactId: item.detailPageArtifactId,
        detailPageRevisionId: item.detailPageRevisionId,
        errorMessage: item.errorMessage,
        productId: item.productId,
        createdAt: item.createdAt,
      }));
    },
    initialData: initialHistory,
    enabled: !!productId && (options.enabled ?? true),
  });
}

/**
 * DELETE `/api/ai/detail-page/:generationId` — content_generations 단건 삭제.
 * onSuccess 시 history list invalidate.
 */
export function useGenerationHistoryDelete(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (generationId: string) =>
      apiClient.delete<{ ok: true }>(`/api/ai/detail-page/${generationId}`),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: [...queryKeys.sourcing.detail(productId), 'history'],
      });
      qc.invalidateQueries({
        queryKey: queryKeys.productContent.sourcingLinks(productId, { limit: '8' }),
      });
    },
  });
}
