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
  });

  it('refuses a login redirect', async () => {
    const fake = fakeTabPages({ landAt: () => 'https://ads.tiktok.com/i18n/login', answer: () => ({ ok: true }) });
    await expect(createTiktokCcSite(fake.tabs).target(tiktokTargetFor('product'), null)).rejects.toMatchObject({ code: SITE_LOGIN_REQUIRED });
    expect(sanitizeTiktokRegion('u-s')).toBe('US');
  });
});
