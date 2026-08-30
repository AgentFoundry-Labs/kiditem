'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';

export type GenerateMode = 'draft' | 'image' | 'full';
const taskFor = (mode: GenerateMode): 'detail' | 'thumbnail' | 'all' => mode === 'draft' ? 'detail' : mode === 'image' ? 'thumbnail' : 'all';

/** Product generation is owned by Sourcing/AI, never by generic AgentRun. */
export function useGenerateDetailPage(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { mode: GenerateMode; templateId?: string }) => apiClient.post<{ operationId?: string; message?: string }>(`/api/sourcing/candidates/${productId}/quick-process`, { task: taskFor(params.mode), ...(params.templateId ? { templateId: params.templateId } : {}) }),
    onSuccess: () => {
      toast.success('생성 작업을 시작했습니다.');
      queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.detail(productId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.preview(productId) });
    },
    onError: (error: unknown) => toast.error(isApiError(error) ? error.detail : error instanceof Error ? error.message : '상세페이지 생성 실패'),
  });
}
