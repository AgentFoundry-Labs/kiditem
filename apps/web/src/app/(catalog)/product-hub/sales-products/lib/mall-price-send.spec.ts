import { describe, expect, it } from 'vitest';
import { canSendMallPrice, MALL_PRICE_SEND_NOTE, mallPriceResendAllowed } from './mall-price-send';

describe('몰 가격 보내기의 몰별 사실', () => {
  it('가격 sender가 있는 몰만 버튼을 세운다', () => {
    expect(canSendMallPrice('kakao')).toBe(true);
    expect(canSendMallPrice('kidsnote')).toBe(true);
    expect(canSendMallPrice('art09')).toBe(false);
  });

  it('보내는 것만으로 판매가 멈추는 몰(키즈노트)은 같은 가격을 다시 보내지 않고, 보내기 전에 그 말을 보인다', () => {
    expect(mallPriceResendAllowed('kidsnote')).toBe(false);
    expect(MALL_PRICE_SEND_NOTE.kidsnote).toContain('본사 승인');
    expect(mallPriceResendAllowed('kakao')).toBe(true);
  });
});
