import { describe, expect, it } from 'vitest';
import { SITE_LOGIN_REQUIRED } from '../../core/site-caller';
import { fakeTabPages } from '../tab-page.fake';
import { createTiktokCcSite, sanitizeTiktokRegion, tiktokTargetFor } from './index';

describe('TikTok Creative Center site (KID-360)', () => {
  it('maps plan target ids to the Creative Center pages', () => {
    expect(tiktokTargetFor('hashtag')).toMatchObject({ trendType: 'hashtag', sourceKeyword: null });
    expect(tiktokTargetFor('keyword:school bag')).toMatchObject({
      trendType: 'keyword', sourceKeyword: 'school bag',
      url: 'https://ads.tiktok.com/business/creativecenter/keyword-insights/pc/en?keyword=school%20bag',
    });
  });

  it('injects the extractor and MAIN-world hook when missing and reads the region back', async () => {
    const fake = fakeTabPages({
      answer: (_message, injected) => injected ? { ok: true, region: 'kr', items: [{ trendType: 'hashtag', entityKey: 'a' }] } : { ok: false, error: 'content_script_missing' },
    });
    const site = createTiktokCcSite(fake.tabs);
    await expect(site.target(tiktokTargetFor('hashtag'), null)).resolves.toEqual({ region: 'KR', items: [{ trendType: 'hashtag', entityKey: 'a' }] });
    await site.close();
    expect(fake.log).toContain('inject content/sourcing/tiktok-cc-extractor.js,content/sourcing/tiktok-cc-content.js,content/sourcing/tiktok-cc-hook.js');
    expect(fake.log.at(-1)).toBe('close 7');
    // 화면이 끝까지 안 그려져도 마지막 상태로 읽는다(옛 수집기).
    expect(fake.log).toContain(`navigate ${tiktokTargetFor('hashtag').url} (continue on timeout)`);
  });

  it('refuses a login redirect', async () => {
    const fake = fakeTabPages({ landAt: () => 'https://ads.tiktok.com/i18n/login', answer: () => ({ ok: true }) });
    await expect(createTiktokCcSite(fake.tabs).target(tiktokTargetFor('product'), null)).rejects.toMatchObject({ code: SITE_LOGIN_REQUIRED });
    expect(sanitizeTiktokRegion('u-s')).toBe('US');
  });

  it('stops on a passport login redirect without injecting, and leaves the tab', async () => {
    const fake = fakeTabPages({ answer: () => ({ ok: false, error: 'content_script_missing' }), urlBeforeInject: 'https://passport.tiktok.com/login?next=x' });
    const site = createTiktokCcSite(fake.tabs);
    await expect(site.target(tiktokTargetFor('hashtag'), null)).rejects.toMatchObject({ code: SITE_LOGIN_REQUIRED });
    await site.close();
    expect(fake.log.some((line) => line.startsWith('inject'))).toBe(false);
    expect(fake.log).not.toContain('close 7');
  });

  it('waits for the operator on a verification page and retries the same target, or fails after the limit', async () => {
    let landings = 0;
    const verify = 'https://ads.tiktok.com/business/creativecenter/verify?x=1';
    const fake = fakeTabPages({ landAt: (url) => (landings++ === 0 ? verify : url), answer: () => ({ ok: true, region: 'KR', items: [] }), verificationClears: true });
    const attentions: unknown[] = [];
    await expect(createTiktokCcSite(fake.tabs).target(tiktokTargetFor('hashtag'), null, { onAttention: (a) => { attentions.push(a); } }))
      .resolves.toEqual({ region: 'KR', items: [] });
    // 처음 알리고(기다리는 동안 다시 알릴 수 있다) 풀리면 null.
    expect(attentions[0]).toEqual({ kind: 'verification', site: 'TikTok', label: 'hashtag' });
    expect(attentions.at(-1)).toBeNull();

    const stuck = fakeTabPages({ landAt: () => verify, answer: () => ({ ok: true }) });
    await expect(createTiktokCcSite(stuck.tabs).target(tiktokTargetFor('hashtag'), null)).rejects.toMatchObject({ code: 'SITE_VERIFICATION_REQUIRED' });
  });
});
