'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type { DetailGenerationHistoryItem } from '../lib/detail-generation-history';

/**
 * 작업공간 상세페이지 이력 한 줄. 이력은 작업공간(`ContentWorkspace.history`)에서 읽는다 —
 * 원천 기록(수집상품) 연결로 읽지 않는다(KID-310).
 */
export type GenerationHistoryItem = DetailGenerationHistoryItem;

/**
 * DELETE `/api/ai/detail-page/:generationId` — content_generations 단건 삭제.
 * 이력은 작업공간 조회가 들고 있으므로 작업공간 조회를 새로 읽는다.
 */
export function useGenerationHistoryDelete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (generationId: string) =>
      apiClient.delete<{ ok: true }>(`/api/ai/detail-page/${generationId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.contentWorkspaces.all });
    },
  });
}
