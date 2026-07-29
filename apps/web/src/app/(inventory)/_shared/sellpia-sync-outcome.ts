import type { SellpiaInventoryFreshnessWithBlockers } from '@/lib/sellpia-inventory-freshness-api';

/**
 * What a refresh request actually achieved.
 *
 * A refresh request only marks work as due; the background coordinator performs
 * the collection, so callers classify the returned state instead of trusting
 * the HTTP result.
 */
export type SellpiaStockSyncOutcome =
  | { kind: 'running' }
  | { kind: 'queued'; startsInMs: number }
  | { kind: 'stalled'; errorMessage: string | null }
  | { kind: 'fresh' }
  | { kind: 'request_failed' };

export function classifySellpiaStockSync(
  state: SellpiaInventoryFreshnessWithBlockers | null,
  now: number = Date.now(),
): SellpiaStockSyncOutcome {
  if (!state) return { kind: 'request_failed' };

  if (state.status === 'syncing') return { kind: 'running' };
  if (state.status === 'failed') {
    return { kind: 'stalled', errorMessage: state.lastAttempt?.errorMessage ?? null };
  }
  if (state.status === 'fresh') return { kind: 'fresh' };

  const notBefore = state.syncNotBefore ? Date.parse(state.syncNotBefore) : now;
  return {
    kind: 'queued',
    startsInMs: Number.isNaN(notBefore) ? 0 : Math.max(0, notBefore - now),
  };
}

export function describeSellpiaStockSync(
  outcome: SellpiaStockSyncOutcome,
): { tone: 'success' | 'error'; message: string } {
  switch (outcome.kind) {
    case 'running':
      return { tone: 'success', message: '셀피아 재고를 수집하고 있습니다.' };
    case 'queued': {
      const waitSeconds = Math.ceil(outcome.startsInMs / 1000);
      return {
        tone: 'success',
        message: waitSeconds > 0
          ? `셀피아 재고 동기화를 예약했습니다. 약 ${waitSeconds}초 후 시작합니다.`
          : '셀피아 재고 동기화를 예약했습니다.',
      };
    }
    case 'stalled':
      return {
        tone: 'error',
        message: outcome.errorMessage
          ? `직전 수집이 실패한 상태입니다: ${outcome.errorMessage}`
          : '직전 수집이 실패한 상태라 동기화를 예약하지 못했습니다.',
      };
    case 'fresh':
      return { tone: 'success', message: '셀피아 재고가 이미 최신입니다.' };
    case 'request_failed':
      return { tone: 'error', message: '셀피아 재고 동기화 요청에 실패했습니다.' };
  }
}

/** Badge copy for a transmission that still needs operator reconciliation. */
export function sellpiaTransmissionReviewBadgeLabel(): string {
  return '전송 확인 필요';
}
