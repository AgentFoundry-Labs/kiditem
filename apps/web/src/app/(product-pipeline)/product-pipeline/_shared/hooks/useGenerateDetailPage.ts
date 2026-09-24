'use client';

import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DETAIL_PAGE_TEMPLATE_IDS, type DetailPageTemplateId } from '@kiditem/shared/ai';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { createSecureRandomUuid } from '@/lib/secure-random-uuid';

export type GenerateMode = 'draft' | 'image' | 'full';
const taskFor = (mode: GenerateMode): 'detail' | 'thumbnail' | 'all' => mode === 'draft' ? 'detail' : mode === 'image' ? 'thumbnail' : 'all';

function generatableTemplateId(templateId: string | undefined): DetailPageTemplateId | undefined {
  if (templateId === undefined) return undefined;
  const known = DETAIL_PAGE_TEMPLATE_IDS.find((id) => id === templateId);
  if (!known) throw new Error('이 템플릿은 아직 AI 생성에 쓸 수 없습니다.');
  return known;
}

/**
 * 판매상품 초안의 콘텐츠 생성 시작(`POST /api/products/sales-products/:id/generation`).
 *
 * 템플릿 화면과 에디터의 템플릿 변경이 같은 문을 쓴다. 생성은 초안의 작업공간을 만들거나 다시
 * 쓰므로 끝나면 그 초안의 작업공간 조회를 새로 읽는다.
 */
export function useGenerateDetailPage(salesProductId: string) {
  const queryClient = useQueryClient();
  const pendingRequest = useRef<{ fingerprint: string; idempotencyKey: string } | null>(null);
  return useMutation({
    mutationFn: async (params: { mode: GenerateMode; templateId?: string }) => {
      const templateId = generatableTemplateId(params.templateId);
      const body = {
        task: taskFor(params.mode),
        ...(templateId ? { templateId } : {}),
      };
      const fingerprint = JSON.stringify({ salesProductId, body });
      const idempotencyKey = pendingRequest.current?.fingerprint === fingerprint
        ? pendingRequest.current.idempotencyKey
        : createSecureRandomUuid();
      pendingRequest.current = { fingerprint, idempotencyKey };
      return apiClient.post<{ message?: string; contentWorkspaceId?: string | null }>(
        `/api/products/sales-products/${encodeURIComponent(salesProductId)}/generation`,
        body,
        { headers: { 'Idempotency-Key': idempotencyKey } },
      );
    },
    onSuccess: () => {
      pendingRequest.current = null;
      toast.success('생성 작업을 시작했습니다.');
      queryClient.invalidateQueries({
        queryKey: queryKeys.contentWorkspaces.forSalesProduct(salesProductId),
      });
    },
    onError: (error: unknown) => toast.error(isApiError(error) ? error.message : error instanceof Error ? error.message : '상세페이지 생성 실패'),
  });
}
