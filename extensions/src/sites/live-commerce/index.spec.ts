import { describe, expect, it } from 'vitest';
import { SITE_LOGIN_REQUIRED, SITE_REQUEST_FAILED } from '../../core/site-caller';
import { fakeTabPages } from '../tab-page.fake';
import { SITE_VERIFICATION_REQUIRED, createLiveCommerceSite, isLiveVerificationUrl } from './index';

describe('live-commerce site (KID-360)', () => {
  it('opens the broadcast, injects the extractor when missing, caps products at 100 and closes the tab', async () => {
    const products = Array.from({ length: 120 }, (_, index) => ({ productId: `p-${index}` }));
    const fake = fakeTabPages({
      answer: (_message, injected) => injected
        ? { ok: true, source: 'douyin', pageUrl: 'https://live.douyin.com/1', broadcast: { broadcastId: 'b-1' }, products }
        : { ok: false, error: 'content_script_missing' },
    });
    const captured = await createLiveCommerceSite(fake.tabs).broadcast('https://live.douyin.com/1');
    expect(captured).toMatchObject({ source: 'douyin', broadcast: { broadcastId: 'b-1' } });
    expect(captured.products).toHaveLength(100);
    expect(fake.log.at(-1)).toBe('close 7');
  });

  it('keeps the tab open on a verification page', async () => {
    const fake = fakeTabPages({ landAt: () => 'https://live.douyin.com/verify/abc', answer: () => ({}) });
    await expect(createLiveCommerceSite(fake.tabs).broadcast('https://live.douyin.com/1')).rejects.toMatchObject({ code: SITE_VERIFICATION_REQUIRED });
    expect(fake.log).not.toContain('close 7');
    expect(isLiveVerificationUrl('https://zb.1688.com/room?x=1')).toBe(false);
  });

  it('stops on a login host without injecting and leaves the tab; an unknown host is a request failure', async () => {
    const login = fakeTabPages({ answer: () => ({ ok: false, error: 'content_script_missing' }), urlBeforeInject: 'https://login.taobao.com/?redirect_url=zb.1688.com' });
    await expect(createLiveCommerceSite(login.tabs).broadcast('https://zb.1688.com/room/1')).rejects.toMatchObject({ code: SITE_LOGIN_REQUIRED });
    expect(login.log.some((line) => line.startsWith('inject'))).toBe(false);
    expect(login.log).not.toContain('close 7');

    const other = fakeTabPages({ landAt: () => 'https://www.example.com/', answer: () => ({}) });
    await expect(createLiveCommerceSite(other.tabs).broadcast('https://live.douyin.com/1'))
      .rejects.toMatchObject({ code: SITE_REQUEST_FAILED, details: { reason: 'unexpected_url' } });
    expect(other.log).not.toContain('close 7');
  });
});
