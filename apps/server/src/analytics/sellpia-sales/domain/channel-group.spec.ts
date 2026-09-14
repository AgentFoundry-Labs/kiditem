import { describe, expect, it } from 'vitest';
import { classifySellpiaChannelGroup } from './channel-group';

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
