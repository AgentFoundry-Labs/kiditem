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

/**
 * Without a source pair the late source is the one to collect again. Advertising
 * that ends on its own required cutoff held yesterday: its last complete
 * collection saw no spend yesterday for an account that spent the day before.
 * That is a late Coupang report or ads paused yesterday, and the server cannot
 * tell which, so the message gives the step that confirms the day for each: a
 * collection after the report sees the spend, and tomorrow's collection confirms
 * a paused day because only a collection's closed day is ever held.
 */
function sourceNotReadyMessage(result: SourceNotReady): string {
  const officialCutoff = `공식 등급 기준일 ${result.officialCutoff ?? '없음'}`;
  const { pairing } = result;
  if (pairing?.lateSource === 'advertising') {
    return pairing.advertisingEndDate === result.sources.advertising.requiredCutoff
      ? `마지막으로 완료된 광고 손익 수집은 어제 광고비를 확정하지 못해 그제까지만 반영했습니다. 기존 공식 등급을 유지합니다. 쿠팡 보고가 늦었다면 보고 뒤 다시 수집해 주세요. 어제 광고를 멈춘 계정이면 내일 수집에서 반영됩니다. ${officialCutoff}`
      : `광고 손익 기준일(${pairing.advertisingEndDate})이 셀피아(${pairing.sellpiaEndDate})보다 이릅니다. 광고 손익을 다시 수집해 주세요. ${officialCutoff}`;
  }
  if (pairing?.lateSource === 'sellpia') {
    return `셀피아 상품 손익 기준일(${pairing.sellpiaEndDate})이 광고 손익(${pairing.advertisingEndDate})보다 이릅니다. 셀피아 상품 손익을 다시 수집해 주세요. ${officialCutoff}`;
  }
  const notReady = notReadySourceLabels(result);
  return `원천이 준비되지 않아 기존 공식 등급을 유지합니다. ${officialCutoff} · 표시 데이터 기준일 ${result.actualCutoff ?? '없음'}${notReady ? ` · 준비 필요: ${notReady}` : ''}`;
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
        onFeedback({ tone: 'warning', message: sourceNotReadyMessage(result) });
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
