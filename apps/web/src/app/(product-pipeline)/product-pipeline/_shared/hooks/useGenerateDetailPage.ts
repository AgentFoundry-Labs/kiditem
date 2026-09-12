'use client';

import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { createSecureRandomUuid } from '@/lib/secure-random-uuid';

export type GenerateMode = 'draft' | 'image' | 'full';
const taskFor = (mode: GenerateMode): 'detail' | 'thumbnail' | 'all' => mode === 'draft' ? 'detail' : mode === 'image' ? 'thumbnail' : 'all';

/** Product generation is owned by Sourcing/AI, never by generic AgentRun. */
export function useGenerateDetailPage(productId: string) {
  const queryClient = useQueryClient();
  const pendingRequest = useRef<{ fingerprint: string; idempotencyKey: string } | null>(null);
  return useMutation({
    mutationFn: async (params: { mode: GenerateMode; templateId?: string }) => {
      const body = {
        task: taskFor(params.mode),
        ...(params.templateId ? { templateId: params.templateId } : {}),
      };
      const fingerprint = JSON.stringify({ productId, body });
      const idempotencyKey = pendingRequest.current?.fingerprint === fingerprint
        ? pendingRequest.current.idempotencyKey
        : createSecureRandomUuid();
      pendingRequest.current = { fingerprint, idempotencyKey };
      return apiClient.post<{ message?: string }>(
        `/api/sourcing/candidates/${productId}/quick-process`,
        body,
        { headers: { 'Idempotency-Key': idempotencyKey } },
      );
    },
    onSuccess: () => {
      pendingRequest.current = null;
      toast.success('생성 작업을 시작했습니다.');
      queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.detail(productId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.preview(productId) });
    },
    onError: (error: unknown) => toast.error(isApiError(error) ? error.detail : error instanceof Error ? error.message : '상세페이지 생성 실패'),
  });
}
