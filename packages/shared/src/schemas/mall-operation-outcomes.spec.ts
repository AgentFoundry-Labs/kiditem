import { describe, expect, it } from 'vitest';
import {
  MALL_OPERATION_OUTCOME_KEY_ALIASES,
  mallOperationOutcomeKey,
} from './mall-operation-outcomes';

describe('mallOperationOutcomeKey', () => {
  /**
   * 쿠팡직배송은 로켓 계정 행을 함께 쓴다(order-collection-malls.ts `sharedAccountChannel`).
   * 관찰 기록은 그 행 하나에 모여야 화면이 한 줄을 읽는다.
   */
  it('⭐ 계정 행을 함께 쓰는 몰은 그 행의 채널로 접는다', () => {
    expect(mallOperationOutcomeKey('coupang-direct')).toBe('rocket');
    expect(MALL_OPERATION_OUTCOME_KEY_ALIASES['coupang-direct']).toBe('rocket');
  });

  it('제 계정 행을 가진 몰과 모르는 키는 그대로 둔다', () => {
    expect(mallOperationOutcomeKey('rocket')).toBe('rocket');
    expect(mallOperationOutcomeKey('onch')).toBe('onch');
    expect(mallOperationOutcomeKey('unknown-mall')).toBe('unknown-mall');
  });

  /** 한 번 접은 키를 다시 접어도 같은 키다 — 쓰는 쪽과 읽는 쪽이 같은 값에 만난다. */
  it('두 번 접어도 같은 키다', () => {
    expect(mallOperationOutcomeKey(mallOperationOutcomeKey('coupang-direct'))).toBe('rocket');
  });
});
