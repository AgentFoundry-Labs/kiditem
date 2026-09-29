import { describe, expect, it } from 'vitest';
import { isSellpiaProviderMall, resolveMallKeyFromSellpiaProvider, sellpiaProviderMatchesMall } from './sellpia-providers.js';

describe('몰 ↔ 셀피아 판매처명 표(KID-355 wave8b, 웹·서버 공용)', () => {
  it('판매처명 부분일치·대소문자 무시로 몰을 찾고, 모르면 null', () => {
    expect(resolveMallKeyFromSellpiaProvider('테크빌교육(키즈티쳐몰)')).toBe('teacher-mall');
    expect(resolveMallKeyFromSellpiaProvider('GS샵 본점')).toBe('gs-shop');
    expect(resolveMallKeyFromSellpiaProvider('롯데ON')).toBe('lotte-on');
    expect(resolveMallKeyFromSellpiaProvider('')).toBeNull();
    expect(resolveMallKeyFromSellpiaProvider('모르는몰')).toBeNull();
  });
  it('몰 지원 여부와 행 필터 술어', () => {
    expect(isSellpiaProviderMall('onch')).toBe(true);
    expect(isSellpiaProviderMall('coupang')).toBe(false);
    expect(sellpiaProviderMatchesMall('온채널', 'onch')).toBe(true);
    expect(sellpiaProviderMatchesMall('온채널', 'kidkids')).toBe(false);
    expect(sellpiaProviderMatchesMall('키드키즈', 'coupang')).toBe(false);
  });
});
