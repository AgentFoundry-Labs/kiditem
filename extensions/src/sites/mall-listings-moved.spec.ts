import { describe, expect, it } from 'vitest';
import { MALL_ADMIN_LISTING_READERS } from '@kiditem/shared/mall-admin-listings';
import { isMallAdminListingOperationMall } from '@kiditem/shared/channels-operations';
import { SITE_LOGIN_REQUIRED } from '../core/site-caller';
import '../entry/index';
import { siteFactoryFor, type SiteDeps, type SiteLease } from './registry';
import { fakeLoginScreen, fastClock } from './login.fake';
import { fakeTabPages } from './tab-page.fake';

// 몰 관리자 목록 나머지 몰(KID-381 L′)을 몰 관리자 목록 라우터(`mall-admin-listings`)로 읽는다 — 몰마다 시작 화면, 처리기
// 파일(ISOLATED·MAIN)과 호출 이름, 로그인 화면이면 탭을 남기는지. 로그인 명세가 없는 몰은 자격이 있어도 채우지 않는다(결정 #3).
const CREDENTIALS = { loginId: 'fake-mall-id', password: 'fake-mall-password' };
type Reader = { readListings(plan: Record<string, unknown>): Promise<unknown> };
type Row = {
  mallKey: string;
  startUrl: string;
  isolated?: string;
  main?: string;
  call: string;
  /** 로그아웃이면 닿는 화면. */
  loginAt: string;
};

const MALLS: Row[] = [
  {
    mallKey: 'always',
    startUrl: 'https://alwayzseller.ilevit.com/items/management',
    isolated: 'content/orders/always-listings.js',
    call: 'always.listings',
    loginAt: 'https://alwayzseller.ilevit.com/login',
  },
  {
    mallKey: 'thirtymall',
    startUrl: 'https://partner.shopby.co.kr/product/list',
    isolated: 'content/orders/thirtymall-listings.js',
    call: 'thirtymall.listings',
    loginAt: 'https://partner.shopby.co.kr/login',
  },
  {
    mallKey: 'kidsnote',
    startUrl: 'https://shop.kidsnote.com/_manage/?body=2010',
    isolated: 'content/orders/kidsnote-listings.js',
    call: 'kidsnote.listings',
    loginAt: 'https://shop.kidsnote.com/member/login.php',
  },
];

/** 로그인 폼 명세가 없는 몰(결정 #3). */
const NO_LOGIN_SPEC = ['always', 'thirtymall', '11st', 'gmarket', 'auction', 'kakao', 'smartstore'];

function snapshotOf(mallKey: string) {
  return {
    collection: { totalRecords: 0, recordsRead: 0, pagesRead: 1, totalPages: 1, detailsRead: 0, detailsMissing: 0 },
    rows: [],
    proof: { mallKey, pageSize: MALL_ADMIN_LISTING_READERS[mallKey as 'always'].pageSize, validatedList: true },
  };
}

function planOf(mallKey: string) {
  const reader = MALL_ADMIN_LISTING_READERS[mallKey as 'always'];
  return { mallKey, sourceOrigin: reader.origin, pageSize: reader.pageSize };
}

function routerFor(tabs: SiteDeps['tabs'], credentials: SiteLease['credentials'] = CREDENTIALS) {
  const deps: SiteDeps = {
    tabs,
    randomId: () => 'id',
    ...fastClock(),
    cookies: { async get() { return null; } },
    async fetch() { return new Response('', { status: 404 }); },
  };
  return siteFactoryFor('mall-admin-listings')!.create(deps, { tabId: null, credentials }) as { reader(mallKey: string): Reader | null };
}

describe('몰 관리자 목록 나머지 몰(KID-381)', () => {
  it.each(MALLS)('$mallKey: 실행 몰이고, 새 백그라운드 탭을 목록 화면으로 열어 처리기 파일로 읽은 뒤 닫는다', async (row) => {
    expect(isMallAdminListingOperationMall(row.mallKey)).toBe(true);
    const asked: Array<Record<string, unknown>> = [];
    const fake = fakeTabPages({
      answer: (message, injected) => {
        asked.push(message);
        return injected ? { ok: true, value: { success: true, snapshot: snapshotOf(row.mallKey) } } : { ok: false, error: 'content_script_missing' };
      },
    });
    const plan = planOf(row.mallKey);
    await expect(routerFor(fake.tabs).reader(row.mallKey)!.readListings(plan)).resolves.toEqual(snapshotOf(row.mallKey));
    expect(asked.at(-1)).toEqual({ type: 'KIDITEM_PAGE_CALL', call: row.call, args: { plan } });
    const injected = row.main
      ? `inject content/page-call/bridge.js,content/page-call/runner.js,${row.main}`
      : `inject content/page-call/bridge.js,${row.isolated}`;
    expect(fake.log).toEqual(['open about:blank', `navigate ${row.startUrl}`, 'ask KIDITEM_PAGE_CALL', injected, 'ask KIDITEM_PAGE_CALL', 'close 7']);
  });

  it.each(MALLS)('$mallKey: 로그아웃이면 SITE_LOGIN_REQUIRED로 멈추고 로그인할 탭을 남긴다', async (row) => {
    const fake = fakeTabPages({ landAt: () => row.loginAt, answer: () => ({ ok: false, error: 'content_script_missing' }) });
    await expect(routerFor(fake.tabs, null).reader(row.mallKey)!.readListings(planOf(row.mallKey))).rejects.toMatchObject({ code: SITE_LOGIN_REQUIRED });
    expect(fake.log).not.toContain('close 7');
  });

  it.each(MALLS.filter((row) => NO_LOGIN_SPEC.includes(row.mallKey)))(
    '$mallKey: 로그인 명세가 없어 자격이 있어도 폼을 채우지 않고 운영자에게 탭을 남긴다(결정 #3)',
    async (row) => {
      const fake = fakeTabPages({ landAt: () => row.loginAt, answer: () => ({ ok: false, error: 'content_script_missing' }) });
      await expect(routerFor(fake.tabs).reader(row.mallKey)!.readListings(planOf(row.mallKey))).rejects.toMatchObject({ code: SITE_LOGIN_REQUIRED });
      expect(fake.log.filter((line) => line.startsWith('navigate'))).toEqual([`navigate ${row.startUrl}`]);
      expect(fake.log.some((line) => line.startsWith('frames'))).toBe(false);
      expect(fake.log).not.toContain('close 7');
    },
  );

  it.each(MALLS.filter((row) => !NO_LOGIN_SPEC.includes(row.mallKey)))(
    '$mallKey: 로그인 화면이면 실행 자격으로 같은 탭에서 한 번 로그인하고 목록 화면으로 돌아가 다시 읽은 뒤 탭을 닫는다',
    async (row) => {
      const login = fakeLoginScreen({ loginAt: row.loginAt });
      const fake = fakeTabPages({
        landAt: login.landAt,
        frames: (files, call, url) => login.frames(files, call, url),
        answer: (message, injected) => login.answer(message)
          ?? (injected
            ? (message.call === row.call ? { ok: true, value: { success: true, snapshot: snapshotOf(row.mallKey) } } : { ok: false, error: 'unexpected' })
            : { ok: false, error: 'content_script_missing' }),
      });
      await expect(routerFor(fake.tabs).reader(row.mallKey)!.readListings(planOf(row.mallKey))).resolves.toEqual(snapshotOf(row.mallKey));
      expect(login.state.filled).toEqual([CREDENTIALS]);
      expect(fake.log.filter((line) => line.startsWith('navigate') || line.startsWith('close'))).toEqual([
        `navigate ${row.startUrl}`,
        `navigate ${row.startUrl}`,
        'close 7',
      ]);
    },
  );
});
