import { EXTENSION_TIMEOUT_MESSAGE } from '@/lib/extension-bridge';
import type { MallOperationOutcomeInput } from '@/lib/mall-operation-outcomes-api';
import {
  OrderCollectionExtensionError,
  OrderCollectionExtensionUnavailableError,
} from './order-collection-extension';

/**
 * 몰 주문수집 한 번의 결과를 기억(몰 작업 결과) 한 줄로 접는다.
 *
 * 주문이 없는 것은 실패가 아니다(`empty`). 로그인 · 인증이 필요한 것은 사람이 이어서 할
 * 일이다(`attention`). 사람이 멈춘 것은 `cancelled`. 나머지 실패는 확장이 준 이유 코드를 그대로
 * 쓴다. 메시지에는 몰 이름과 오류 안내만 — 주문 · 받는 사람 값은 넣지 않는다.
 */
export type OrderCollectionOutcome = Pick<
  MallOperationOutcomeInput,
  'outcome' | 'reasonCode' | 'message' | 'itemCount'
>;

/**
 * 11번가 수집기는 셀피아 양식이 확정되지 않아 변환 파일을 만들지 않고 건수를 0 으로 돌려준다.
 * 그 0 을 '주문 없음'으로 읽으면 거짓 기억이 된다 — 건수는 모름으로 둔다.
 */
const COUNT_UNREPORTED_MALLS = new Set(['11st']);

export function collectedOutcome(mallKey: string, rowCount: number): OrderCollectionOutcome {
  if (COUNT_UNREPORTED_MALLS.has(mallKey)) {
    return { outcome: 'succeeded', reasonCode: 'count_unreported', message: null, itemCount: null };
  }
  return rowCount > 0
    ? { outcome: 'succeeded', reasonCode: null, message: null, itemCount: rowCount }
    : { outcome: 'empty', reasonCode: 'no_new_orders', message: null, itemCount: 0 };
}

export function failedCollectionOutcome(input: {
  error: unknown;
  message: string;
  attentionKind: 'auth' | 'login' | null;
  noNewOrders: boolean;
  aborted: boolean;
  /** 확장 run 을 받았는가. 못 받았으면 수집을 시작하지 못한 것이다. */
  hasRun: boolean;
}): OrderCollectionOutcome {
  if (input.aborted) return { outcome: 'cancelled', reasonCode: 'cancelled', message: null, itemCount: null };
  if (input.noNewOrders) return { outcome: 'empty', reasonCode: 'no_new_orders', message: null, itemCount: 0 };
  if (input.attentionKind) {
    return {
      outcome: 'attention',
      reasonCode: input.attentionKind === 'login' ? 'login_required' : 'operator_action_required',
      message: input.message,
      itemCount: null,
    };
  }
  if (!input.hasRun) {
    // 시작하지 못한 이유가 확장일 때만 확장 문제다. 서버가 시작을 거절한 것(이미 진행 중 등)을
    // 확장으로 적으면 카드가 '응답 없음'이라고 해 사람이 무엇을 할지 가려진다.
    const reasonCode = input.error instanceof OrderCollectionExtensionUnavailableError
      ? 'extension_unavailable'
      : 'start_failed';
    return { outcome: 'failed', reasonCode, message: input.message, itemCount: null };
  }
  // 확장이 제 시간에 답하지 않은 것은 몰이 실패한 게 아니다 — 물어봤는데 못 들은 것이다.
  // 따로 적어 두어야 다음 바퀴에 다시 물어볼 일인지, 우리 수집 코드를 봐야 할 일인지 갈린다.
  if (isExtensionTimeout(input.error)) {
    return { outcome: 'failed', reasonCode: 'extension_timeout', message: input.message, itemCount: null };
  }
  const reasonCode = input.error instanceof OrderCollectionExtensionError ? input.error.errorCode : 'unknown_failure';
  return { outcome: 'failed', reasonCode, message: input.message, itemCount: null };
}

function isExtensionTimeout(error: unknown): boolean {
  return error instanceof Error && error.message === EXTENSION_TIMEOUT_MESSAGE;
}
