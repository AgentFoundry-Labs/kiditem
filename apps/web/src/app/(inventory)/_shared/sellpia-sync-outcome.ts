import type { SellpiaInventoryCollectionStatusWithBlockers } from '@/lib/sellpia-inventory-freshness-api';

/**
 * What a collection request actually achieved.
 *
 * A refresh request only marks work as due; the background coordinator performs
 * the collection, so callers classify the returned state instead of trusting
 * the HTTP result.
 */
export type SellpiaStockSyncOutcome =
  | { kind: 'running' }
  | { kind: 'queued'; startsInMs: number }
  | { kind: 'stalled'; errorMessage: string | null }
  | { kind: 'complete' }
  | { kind: 'request_failed' };

export function classifySellpiaStockSync(
  state: SellpiaInventoryCollectionStatusWithBlockers | null,
): SellpiaStockSyncOutcome {
  if (!state) return { kind: 'request_failed' };

  if (state.status === 'running') return { kind: 'running' };
  if (state.status === 'failed') {
    return { kind: 'stalled', errorMessage: state.lastAttempt?.errorMessage ?? null };
  }
  if (state.status === 'complete') return { kind: 'complete' };
  return { kind: 'queued', startsInMs: 0 };
}

export function describeSellpiaStockSync(
  outcome: SellpiaStockSyncOutcome,
): { tone: 'success' | 'error'; message: string } {
  switch (outcome.kind) {
    case 'running':
      return { tone: 'success', message: '셀피아 데이터를 수집하고 있습니다.' };
    case 'queued': {
      const waitSeconds = Math.ceil(outcome.startsInMs / 1000);
      return {
        tone: 'success',
        message: waitSeconds > 0
          ? `셀피아 동기화 요청을 보냈습니다. 약 ${waitSeconds}초 후 시작합니다.`
          : '셀피아 동기화 요청을 보냈습니다. 곧 시작합니다.',
      };
    }
    case 'stalled':
      return {
        tone: 'error',
        message: outcome.errorMessage
          ? `직전 수집이 실패한 상태입니다: ${outcome.errorMessage}`
          : '직전 수집이 실패한 상태라 동기화를 예약하지 못했습니다.',
      };
    case 'complete':
      return { tone: 'success', message: '셀피아 데이터 수집이 완료되었습니다.' };
    case 'request_failed':
      return { tone: 'error', message: '셀피아 동기화 요청에 실패했습니다.' };
  }
}
