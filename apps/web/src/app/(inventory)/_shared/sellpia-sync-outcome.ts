import type { SellpiaInventoryFreshnessWithBlockers } from '@/lib/sellpia-inventory-freshness-api';

/**
 * What a refresh request actually achieved.
 *
 * A refresh request only marks work as due; the background coordinator performs
 * the collection. Reporting "started" on a non-throwing POST hid the case where
 * an unresolved order transmission made the request a no-op, so callers classify
 * the returned state instead of trusting the HTTP result.
 */
export type SellpiaStockSyncOutcome =
  | { kind: 'blocked'; intentKeys: string[] }
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

  // Checked before status: an unresolved transmission is *why* status is pinned
  // at refresh_required, and no amount of re-requesting clears it.
  if (state.unresolvedOrderTransmissionIntents.length > 0) {
    return {
      kind: 'blocked',
      intentKeys: state.unresolvedOrderTransmissionIntents.map(
        (intent) => intent.intentKey,
      ),
    };
  }
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
    case 'blocked':
      return {
        tone: 'error',
        message:
          `셀피아 전송 결과가 확인되지 않은 건이 ${outcome.intentKeys.length}건 있어 재고 동기화가 막혀 있습니다. `
          + '재고 관리 > Sellpia 동기화에서 접수 여부를 확정해주세요.',
      };
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

/** Badge copy for a state whose staleness is caused by an unresolved transmission. */
export function sellpiaBlockedBadgeLabel(): string {
  return '전송 확인 필요';
}
