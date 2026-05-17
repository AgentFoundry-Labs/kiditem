'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient } from './api-client';
import { isApiError } from './api-error';
import { queryKeys } from './query-keys';

export type CancelOperationTarget =
  | { targetType: 'operation_key'; operationKey: string; reason?: string }
  | { targetType: 'workflow_run'; runId: string; reason?: string }
  | { targetType: 'agent_run_request'; requestId: string; reason?: string }
  | { targetType: 'agent_run'; runId: string; reason?: string }
  | { targetType: 'content_generation'; generationId: string; reason?: string }
  | { targetType: 'thumbnail_generation'; generationId: string; reason?: string };

export type CancelOperationStatus =
  | 'cancelled'
  | 'already_terminal'
  | 'not_cancellable';

export interface CancelOperationAffected {
  workflowRunIds: string[];
  agentRunRequestIds: string[];
  agentRunIds: string[];
  contentGenerationIds: string[];
  thumbnailGenerationIds: string[];
}

export interface CancelOperationPreserved {
  contentGenerationIds: string[];
  thumbnailGenerationIds: string[];
}

export interface CancelOperationResponse {
  ok: true;
  status: CancelOperationStatus;
  message: string;
  operationKey: string | null;
  affected: CancelOperationAffected;
  preserved: CancelOperationPreserved;
  warnings: string[];
}

export function buildCancelOperationBody(target: CancelOperationTarget): CancelOperationTarget {
  return target;
}

export function cancelOperation(target: CancelOperationTarget): Promise<CancelOperationResponse> {
  return apiClient.post<CancelOperationResponse>(
    '/api/operations/cancel',
    buildCancelOperationBody(target),
  );
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
