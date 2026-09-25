import { describe, expect, it } from 'vitest';
import { SITE_LOGIN_REQUIRED, SITE_REQUEST_FAILED } from '../../core/site-caller';
import { fakeTabPages } from '../tab-page.fake';
import { SITE_VERIFICATION_REQUIRED, build1688SearchUrl, create1688SearchSite, is1688VerificationUrl } from './index';

describe('1688 search site (KID-360)', () => {
  it('reuses one background tab across keywords, injects the extractors once, and closes it at the end', async () => {
    const fake = fakeTabPages({
      answer: (_message, injected) => injected
        ? { ok: true, items: [{ offerId: 'o-1', title: 'a' }, { offerId: '', title: 'no id' }, { title: 'missing id' }] }
        : { ok: false, error: 'content_script_missing' },
    });
    const site = create1688SearchSite(fake.tabs);
    await expect(site.offers('笔袋')).resolves.toEqual([{ offerId: 'o-1', title: 'a' }]);
    await site.offers('文具');
    await site.close();
    expect(fake.log.filter((line) => line.startsWith('open') || line.startsWith('navigate') || line.startsWith('close') || line.startsWith('inject'))).toEqual([
      'open about:blank',
      `navigate ${build1688SearchUrl('笔袋')} (continue on timeout)`,
      'inject content/sourcing/extractors/common.js,content/sourcing/extractors/alibaba.js,content/sourcing/extractors/1688.js,content/sourcing/content.js',
      `navigate ${build1688SearchUrl('文具')} (continue on timeout)`,
      'close 7',
    ]);
  });

  it('stops on a slider verification page and leaves the tab open for the operator', async () => {
    const fake = fakeTabPages({ landAt: () => 'https://s.1688.com/punish?x=1', answer: () => ({ ok: true, items: [] }) });
    const site = create1688SearchSite(fake.tabs);
    await expect(site.offers('笔袋')).rejects.toMatchObject({ code: SITE_VERIFICATION_REQUIRED, details: { url: 'https://s.1688.com/punish?x=1' } });
    await site.close();
    expect(fake.log).not.toContain('close 7');
  });

  it('turns an extractor failure into a request failure naming the keyword (no silent empty keyword)', async () => {
    const fake = fakeTabPages({ answer: () => ({ ok: false, error: '1688 검색 결과에서 상품 카드를 찾지 못했습니다' }) });
    await expect(create1688SearchSite(fake.tabs).offers('笔袋')).rejects.toMatchObject({ code: SITE_REQUEST_FAILED, details: { keyword: '笔袋' } });
  });

  it('recognises the old verification URLs', () => {
    expect(is1688VerificationUrl('https://s.1688.com/selloffer/offer_search.htm?action=captcha')).toBe(true);
    expect(is1688VerificationUrl('https://s.1688.com/selloffer/offer_search.htm?keywords=a')).toBe(false);
  });

  it('stops on a login redirect after the slider (login.taobao.com) without injecting, and leaves the tab for the operator', async () => {
    const fake = fakeTabPages({
      answer: () => ({ ok: false, error: 'content_script_missing' }),
      urlBeforeInject: 'https://login.taobao.com/?redirect_url=https%3A%2F%2Flogin.1688.com%2Fmember%2Fsignin.htm',
    });
    const site = create1688SearchSite(fake.tabs);
    await expect(site.offers('笔袋')).rejects.toMatchObject({ code: SITE_LOGIN_REQUIRED, message: '1688 로그인이 필요합니다. 열려 있는 1688 탭에서 로그인한 뒤 다시 수집해 주세요.' });
    await site.close();
    expect(fake.log.some((line) => line.startsWith('inject'))).toBe(false);
    expect(fake.log).not.toContain('close 7');
  });

  it('refuses an unexpected host as a request failure and leaves the tab', async () => {
    const fake = fakeTabPages({ landAt: () => 'https://www.taobao.com/', answer: () => ({ ok: true, items: [] }) });
    const site = create1688SearchSite(fake.tabs);
    await expect(site.offers('笔袋')).rejects.toMatchObject({ code: SITE_REQUEST_FAILED, details: { reason: 'unexpected_url', url: 'https://www.taobao.com/' } });
    await site.close();
    expect(fake.log).not.toContain('close 7');
  });
});
