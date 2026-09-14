import { describe, expect, it } from 'vitest';
import {
  OrderCollectionExtensionError,
  OrderCollectionExtensionUnavailableError,
} from './order-collection-extension';
import { collectedOutcome, failedCollectionOutcome } from './order-collection-outcome';

const base = {
  error: new Error('boom'),
  message: '온채널 파일 생성 실패',
  attentionKind: null,
  noNewOrders: false,
  aborted: false,
  hasRun: true,
} as const;

describe('collectedOutcome', () => {
  it('rows collected are a success with the count; zero rows are empty, not a failure', () => {
    expect(collectedOutcome('onch', 12)).toEqual({ outcome: 'succeeded', reasonCode: null, message: null, itemCount: 12 });
    expect(collectedOutcome('onch', 0)).toEqual({ outcome: 'empty', reasonCode: 'no_new_orders', message: null, itemCount: 0 });
  });

  /** 11번가는 건수를 돌려주지 않는다 — 0 을 '주문 없음'으로 적지 않는다. */
  it('⭐ does not read 11st zero as "no orders"', () => {
    expect(collectedOutcome('11st', 0)).toEqual({
      outcome: 'succeeded',
      reasonCode: 'count_unreported',
      message: null,
      itemCount: null,
    });
  });
});

describe('failedCollectionOutcome', () => {
  it('login and auth stops are attention, not failures', () => {
    expect(failedCollectionOutcome({ ...base, attentionKind: 'login' })).toMatchObject({
      outcome: 'attention',
      reasonCode: 'login_required',
    });
    expect(failedCollectionOutcome({ ...base, attentionKind: 'auth' })).toMatchObject({
      outcome: 'attention',
      reasonCode: 'operator_action_required',
    });
  });

  it('keeps the extension failure code, and marks a missing extension', () => {
    const error = new OrderCollectionExtensionError('changed', {
      pendingLogin: false,
      errorCode: 'provider_contract_changed',
      failure: null,
    });
    expect(failedCollectionOutcome({ ...base, error })).toMatchObject({
      outcome: 'failed',
      reasonCode: 'provider_contract_changed',
    });
    expect(failedCollectionOutcome({
      ...base,
      error: new OrderCollectionExtensionUnavailableError('확장을 찾지 못했습니다.'),
      hasRun: false,
    })).toMatchObject({
      outcome: 'failed',
      reasonCode: 'extension_unavailable',
    });
    expect(failedCollectionOutcome(base)).toMatchObject({ outcome: 'failed', reasonCode: 'unknown_failure' });
  });

  /** 서버가 시작을 거절한 것(앞선 수집이 아직 진행 중)은 확장이 답을 안 한 것이 아니다. */
  it('⭐ a start the owner refused is a failed start, not a missing extension', () => {
    expect(failedCollectionOutcome({
      ...base,
      error: new Error('이 몰의 앞선 수집이 아직 끝나지 않았습니다.'),
      hasRun: false,
    })).toMatchObject({ outcome: 'failed', reasonCode: 'start_failed' });
  });

  it('cancel and no-new-orders win over the error', () => {
    expect(failedCollectionOutcome({ ...base, aborted: true })).toMatchObject({ outcome: 'cancelled' });
    expect(failedCollectionOutcome({ ...base, noNewOrders: true })).toMatchObject({ outcome: 'empty', itemCount: 0 });
  });
});
