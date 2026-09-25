import { describe, expect, it } from 'vitest';
import { liveCommerceScope } from './sourcing-live-commerce-collection';

describe('live commerce room URL (KID-360, same rule as the server)', () => {
  it('accepts only https 1688 live (zb.1688.com) and Douyin live (live.douyin.com) rooms', () => {
    expect(liveCommerceScope('https://zb.1688.com/room/1')).toEqual({ platform: '1688', url: 'https://zb.1688.com/room/1' });
    expect(liveCommerceScope(' https://live.douyin.com/123?x=1 ')).toEqual({ platform: 'douyin', url: 'https://live.douyin.com/123?x=1' });
    for (const url of ['https://detail.1688.com/offer/1.html', 'https://www.douyin.com/video/1', 'http://live.douyin.com/1', 'not a url']) {
      expect(() => liveCommerceScope(url), url).toThrow('1688 라이브(zb.1688.com) 또는 도우인 라이브(live.douyin.com) 방송 URL을 넣어 주세요.');
    }
  });
});
