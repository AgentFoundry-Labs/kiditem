import { describe, expect, it } from 'vitest';
import { SITE_LOGIN_REQUIRED } from '../core/site-caller';
import { ART09_LISTINGS_URL } from './art09/listings';
import { DOMEGGOOK_LISTINGS_URL } from './domeggook/listings';
import { ICECREAM_LISTINGS_URL } from './icecream-mall/listings';
import { KIDKIDS_LISTINGS_URL } from './kidkids/listings';
import { fakeLoginScreen, fastClock } from './login.fake';
import './art09';
import './mall-admin-listings';
import { siteFactoryFor, type SiteDeps, type SiteLease } from './registry';
import { fakeTabPages } from './tab-page.fake';

// 몰 관리자 목록 1차 몰 넷의 자동 로그인(KID-363 × KID-377). 목록 읽기가 로그인 화면에서 멈추면 실행 자격으로 그 탭에서
// 한 번 로그인하고 목록 시작 화면으로 돌아가 다시 읽는지를 몰 관리자 목록 라우터(`mall-admin-listings`)로 본다.
const CREDENTIALS = { loginId: 'fake-mall-id', password: 'fake-mall-password', supplierLoginId: 'fake-supplier-id' };
const SNAPSHOT = {
  collection: { totalRecords: 0, recordsRead: 0, pagesRead: 1, totalPages: 1, detailsRead: 0, detailsMissing: 0 },
  rows: [],
  proof: { mallKey: 'kidkids', pageSize: 20000, validatedList: true },
};
type Reader = { readListings(plan: Record<string, unknown>): Promise<unknown> };

function mall(mallKey: string, loginAt: string, credentials: typeof CREDENTIALS | null = CREDENTIALS) {
  const login = fakeLoginScreen({ loginAt });
  const fake = fakeTabPages({
    landAt: login.landAt,
    frames: (files, call, url) => login.frames(files, call, url),
    answer: (message, injected) => login.answer(message)
      ?? (injected
        ? (message.call === `${mallKey}.listings` ? { ok: true, value: { success: true, snapshot: SNAPSHOT } } : { ok: false, error: 'unexpected' })
        : { ok: false, error: 'content_script_missing' }),
  });
  const deps: SiteDeps = {
    tabs: fake.tabs,
    randomId: () => 'id',
    ...fastClock(),
    cookies: { async get() { return null; } },
    async fetch() { return new Response('', { status: 404 }); },
  };
  const lease: SiteLease = { tabId: null, credentials };
  const router = siteFactoryFor('mall-admin-listings')!.create(deps, lease) as { reader(mallKey: string): Reader | null };
  return { login, fake, reader: router.reader(mallKey)! };
}

describe('몰 관리자 목록 읽기의 자동 로그인(KID-363 × KID-377)', () => {
  it.each([
    ['kidkids', 'https://www.kidkids.net/join/partner_login.htm', KIDKIDS_LISTINGS_URL, { loginId: 'fake-mall-id', password: 'fake-mall-password' }],
    ['art09', 'https://zzogzzog1.cafe24.com/admin/php/login.php', ART09_LISTINGS_URL, { supplierLoginId: 'fake-supplier-id', loginId: 'fake-mall-id', password: 'fake-mall-password' }],
    ['domeggook', 'https://domeggook.com/ssl/member/mem_loginForm.php', DOMEGGOOK_LISTINGS_URL, { loginId: 'fake-mall-id', password: 'fake-mall-password' }],
    ['icecream-mall', 'https://po.i-screammall.co.kr/loginForm.do', ICECREAM_LISTINGS_URL, { loginId: 'fake-mall-id', password: 'fake-mall-password' }],
  ])('%s: 로그인 화면이면 같은 탭에서 한 번 로그인하고 목록 화면으로 돌아가 다시 읽은 뒤 탭을 닫는다', async (mallKey, loginAt, startUrl, filled) => {
    const { login, fake, reader } = mall(mallKey, loginAt);
    await expect(reader.readListings({ mallKey })).resolves.toEqual(SNAPSHOT);
    expect(login.state.filled).toEqual([filled]);
    expect(fake.log.filter((line) => line.startsWith('navigate') || line.startsWith('close'))).toEqual([
      `navigate ${startUrl}`,
      `navigate ${startUrl}`,
      'close 7',
    ]);
  });

  it('자격이 없으면 채우지 않고 no_credentials로 멈추고 탭을 남긴다', async () => {
    const { login, fake, reader } = mall('kidkids', 'https://www.kidkids.net/join/partner_login.htm', null);
    await expect(reader.readListings({ mallKey: 'kidkids' })).rejects.toMatchObject({ code: SITE_LOGIN_REQUIRED, details: { reason: 'no_credentials' } });
    expect(login.state.filled).toEqual([]);
    expect(fake.log).not.toContain('close 7');
  });
});
