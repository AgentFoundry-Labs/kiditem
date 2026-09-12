'use client';

import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import { isApiError } from '@/lib/api-error';
import {
  recalculateProductAbc,
  type ProductAbcRecalculationResponse,
} from '@/lib/product-abc-api';

/**
 * Products owns ABC publication. Two screens trigger it — Product Management,
 * where the operator goes to fix the sources, and the dashboard, where they
 * first notice the grades are stale. The trigger surface is the only intended
 * difference, so the outcome handling lives here rather than being written
 * twice and drifting: `SOURCE_NOT_READY` keeps the existing official grades,
 * a 409 means the inputs moved under the calculation, and both need the reads
 * refetched before the operator is told anything.
 */

export type ProductAbcRecalculationFeedback = {
  tone: 'success' | 'warning' | 'error';
  message: string;
};

type SourceNotReady = Extract<ProductAbcRecalculationResponse, { outcome: 'SOURCE_NOT_READY' }>;

function notReadySourceLabels(result: SourceNotReady): string {
  return Object.entries(result.sources)
    .filter(([, source]) => !source.ready)
    .map(([source]) => (source === 'sellpia' ? 'Sellpia' : '광고비'))
    .join(', ');
}

export function useProductAbcRecalculation({
  onFeedback,
  refetchReads,
}: {
  onFeedback: (feedback: ProductAbcRecalculationFeedback) => void;
  /**
   * The reads the calling screen shows, refetched before the operator is told
   * anything. Each surface owns its own: the hook decides *when* reads must be
   * fresh, never *which* ones a screen happens to render.
   */
  refetchReads: () => Promise<unknown>;
}): UseMutationResult<ProductAbcRecalculationResponse, unknown, void> {
  return useMutation<ProductAbcRecalculationResponse, unknown, void>({
    mutationFn: recalculateProductAbc,
    retry: false,
    onSuccess: async (result) => {
      if (result.outcome === 'SOURCE_NOT_READY') {
        const notReady = notReadySourceLabels(result);
        onFeedback({
          tone: 'warning',
          message: `원천이 준비되지 않아 기존 공식 등급을 유지합니다. 공식 등급 기준일 ${result.officialCutoff ?? '없음'} · 표시 데이터 기준일 ${result.actualCutoff ?? '없음'}${notReady ? ` · 준비 필요: ${notReady}` : ''}`,
        });
        return;
      }

      await refetchReads();
      onFeedback({
        tone: 'success',
        message: `ABC 등급을 발행했습니다. 공식 등급 기준일 ${result.officialCutoff}`,
      });
    },
    onError: async (error: unknown) => {
      if (isApiError(error) && error.status === 409) {
        await refetchReads();
        onFeedback({
          tone: 'error',
          message: '계산 중 입력이 변경되었습니다. 최신 상태를 확인한 뒤 다시 시도해 주세요.',
        });
        return;
      }
      onFeedback({
        tone: 'error',
        message: 'ABC 등급 새로고침에 실패했습니다. 잠시 후 다시 시도해 주세요.',
      });
    },
  });
}
