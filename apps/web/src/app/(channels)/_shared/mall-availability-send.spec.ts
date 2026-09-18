import { describe, expect, it } from 'vitest';
import {
  availabilityOutcome,
  canSendMallAvailability,
  type MallAvailabilitySendResult,
} from './mall-availability-send';

const result = (overrides: Partial<MallAvailabilitySendResult> = {}): MallAvailabilitySendResult => ({
  sent: 3,
  failed: 0,
  requestOnly: false,
  confirmed: null,
  warnings: [],
  ...overrides,
});

/**
 * 품절 송신 결과 → 관찰 기록. 보냈다(`sent`)는 것은 성공이 아니다. 몰을 다시 읽어 보낸 것이 전부 원하는 상태로
 * 확인된 것만 성공이다(도매꾹은 보낸 뒤 목록을 다시 읽는다).
 */
describe('품절 송신 결과', () => {
  it('⭐ 몰을 다시 읽어 전부 확인됐을 때만 성공이다', () => {
    expect(availabilityOutcome(result({ confirmed: 3 }))).toEqual({ outcome: 'succeeded', reasonCode: 'mall_rechecked' });
    expect(availabilityOutcome(result({ confirmed: 2 }))).toEqual({ outcome: 'attention', reasonCode: 'awaiting_mall_recheck' });
  });

  it('다시 읽지 않는 몰은 보냈어도 확인 대기다', () => {
    expect(availabilityOutcome(result())).toEqual({ outcome: 'attention', reasonCode: 'awaiting_mall_recheck' });
  });

  it('승인이 붙는 몰(온채널)은 확인이 있어도 승인 대기다', () => {
    expect(availabilityOutcome(result({ requestOnly: true, confirmed: 3 })))
      .toEqual({ outcome: 'attention', reasonCode: 'awaiting_mall_approval' });
  });

  it('하나라도 못 보냈으면 실패다', () => {
    expect(availabilityOutcome(result({ failed: 1, confirmed: 3 })))
      .toEqual({ outcome: 'failed', reasonCode: 'awaiting_mall_recheck' });
  });

  it('보낸 것이 없으면 확인 수로 성공을 만들지 않는다', () => {
    expect(availabilityOutcome(result({ sent: 0, confirmed: 0 }))).toEqual({ outcome: 'attention', reasonCode: 'awaiting_mall_recheck' });
  });

  it('도매꾹 · 쿠팡 윙은 품절을 보낼 수 있는 몰이다', () => {
    expect(canSendMallAvailability('domeggook')).toBe(true);
    expect(canSendMallAvailability('coupang')).toBe(true);
    expect(canSendMallAvailability('icecream-mall')).toBe(false);
  });
});
