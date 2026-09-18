import { describe, expect, it } from 'vitest';
import { classifySellpiaChannelGroup, isCoupangSeller } from './channel-group';

describe('classifySellpiaChannelGroup', () => {
  it('classifies only Coupang direct shipping as rocket', () => {
    expect(classifySellpiaChannelGroup('쿠팡-직배송')).toBe('rocket');
    expect(classifySellpiaChannelGroup('쿠팡 직배송')).toBe('rocket');
  });

  it('classifies marketplace and other sellers as others', () => {
    expect(classifySellpiaChannelGroup('쿠팡')).toBe('others');
    expect(classifySellpiaChannelGroup('쿠팡2')).toBe('others');
    expect(classifySellpiaChannelGroup('스마트스토어')).toBe('others');
    expect(classifySellpiaChannelGroup('아이스크림몰(외부몰)')).toBe('others');
  });
});

describe('isCoupangSeller', () => {
  it('counts rocket and the Wing marketplace sellers as Coupang', () => {
    // 대시보드의 '쿠팡 매출'은 로켓(직배송)과 윙("쿠팡", "쿠팡2")을 합친 것이다.
    expect(isCoupangSeller('쿠팡-직배송')).toBe(true);
    expect(isCoupangSeller('쿠팡')).toBe(true);
    expect(isCoupangSeller('쿠팡2')).toBe(true);
    expect(isCoupangSeller(' 쿠팡 (윙) ')).toBe(true);
  });

  it('does not pull other malls into Coupang', () => {
    for (const name of ['스마트스토어', '지마켓', '아이스크림몰(외부몰)', '메이크샵_키드아이템', '']) {
      expect(isCoupangSeller(name)).toBe(false);
    }
  });
});
