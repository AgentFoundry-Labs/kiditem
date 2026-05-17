'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CancelOperationResponseSchema,
  CancelOperationTargetSchema,
  type CancelOperationResponse,
  type CancelOperationTarget,
} from '@kiditem/shared/operation-cancellation';
import { apiClient } from './api-client';
import { isApiError } from './api-error';
import { queryKeys } from './query-keys';

export type { CancelOperationResponse, CancelOperationTarget };

export function buildCancelOperationBody(target: CancelOperationTarget): CancelOperationTarget {
  return CancelOperationTargetSchema.parse(target);
}

export async function cancelOperation(
  target: CancelOperationTarget,
): Promise<CancelOperationResponse> {
  const response = await apiClient.post<unknown>(
    '/api/operations/cancel',
    buildCancelOperationBody(target),
  );
  return CancelOperationResponseSchema.parse(response);
}

export function getCancelOperationToastMessage(response: CancelOperationResponse): string {
  if (response.message) return response.message;
  if (response.status === 'already_terminal') {
    return '이미 종료된 작업이라 기존 결과를 유지했습니다.';
  }
  if (response.status === 'not_cancellable') {
    return '중단할 수 없는 작업입니다.';
  }
  return '중단 요청을 보냈습니다.';
}

export interface UseCancelOperationOptions {
  showToast?: boolean;
  onSuccess?: (response: CancelOperationResponse, target: CancelOperationTarget) => void;
  onError?: (error: unknown, target: CancelOperationTarget) => void;
}

export function useCancelOperation(options: UseCancelOperationOptions = {}) {
  const queryClient = useQueryClient();
  const showToast = options.showToast ?? true;

  return useMutation({
    mutationFn: cancelOperation,
    onSuccess: async (response, target) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.workflows.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.agents.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.productContent.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.thumbnails.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.thumbnailAnalysis.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.coupangImageSync.all }),
      ]);
      if (showToast) {
        toast.success(getCancelOperationToastMessage(response));
      }
      options.onSuccess?.(response, target);
    },
    onError: (error, target) => {
      if (showToast) {
        toast.error(isApiError(error) ? error.detail : '작업 중단 요청에 실패했습니다.');
      }
      options.onError?.(error, target);
    },
  });
}
