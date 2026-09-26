import { describe, expect, it } from 'vitest';
import { MALL_ADMIN_LISTING_READERS, isMallAdminListingMallKey } from '@kiditem/shared/mall-admin-listings';
import { SITE_LOGIN_REQUIRED } from '../core/site-caller';
import './11st/listings';
import './always';
import './auction/listings';
import './gmarket/listings';
import './kakao/listings';
import './kidsnote/listings';
import './kkomangse';
import './lotte-on';
import './mall-admin-listings';
import './onch/listings';
import './smartstore/listings';
import './teacher-mall';
import './thirtymall/listings';
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
  /** 세션이 탭에 묶인 몰(롯데ON)이 먼저 찾는 열린 탭 무늬. */
  reuse?: string;
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
  {
    mallKey: '11st',
    startUrl: 'https://soffice.11st.co.kr/view/8006',
    isolated: 'content/orders/11st-listings.js',
    call: '11st.listings',
    loginAt: 'https://login.11st.co.kr/auth/front/selleroffice/login.tmall',
  },
  {
    mallKey: 'gmarket',
    startUrl: 'https://item.esmplus.com/goods/list',
    isolated: 'content/orders/esm-listings.js',
    call: 'esm.listings',
    loginAt: 'https://signin.esmplus.com/login',
  },
  {
    mallKey: 'auction',
    startUrl: 'https://item.esmplus.com/goods/list',
    isolated: 'content/orders/esm-listings.js',
    call: 'esm.listings',
    loginAt: 'https://signin.esmplus.com/login',
  },
  {
    mallKey: 'kakao',
    startUrl: 'https://shopping-seller.kakao.com/product/store-seller/list',
    isolated: 'content/orders/kakao-listings.js',
    call: 'kakao.listings',
    loginAt: 'https://accounts.kakao.com/login/?continue=https%3A%2F%2Fshopping-seller.kakao.com',
  },
  {
    mallKey: 'lotte-on',
    startUrl: 'https://store.lotteon.com/cm/main/index_SO.wsp',
    main: 'content/orders/lotte-on-listings.js',
    call: 'lotte-on.listings',
    loginAt: 'https://store.lotteon.com/cm/main/login_SO.wsp',
    reuse: 'https://store.lotteon.com/*',
  },
  {
    mallKey: 'smartstore',
    startUrl: 'https://sell.smartstore.naver.com/#/products/origin-list',
    main: 'content/orders/smartstore-listings.js',
    call: 'smartstore.listings',
    loginAt: 'https://accounts.commerce.naver.com/login?url=https%3A%2F%2Fsell.smartstore.naver.com',
  },
  {
    mallKey: 'teacher-mall',
    startUrl: 'https://shop.teacherville.co.kr/selleradmin/goods/catalog',
    isolated: 'content/orders/teacher-mall-listings.js',
    call: 'teacher-mall.listings',
    loginAt: 'https://shop.teacherville.co.kr/selleradmin/login/index',
  },
  {
    mallKey: 'kkomangse',
    startUrl: 'https://nstore.edupre.co.kr/subAdmin/_product.list.php',
    isolated: 'content/orders/kkomangse-listings.js',
    call: 'kkomangse.listings',
    loginAt: 'https://nstore.edupre.co.kr/subAdmin/login.php',
  },
  {
    mallKey: 'onch',
    startUrl: 'https://www.onch3.co.kr/products_management.php',
    isolated: 'content/orders/onch-listings.js',
    call: 'onch.listings',
    loginAt: 'https://www.onch3.co.kr/login/login_web.php',
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
  it.each(MALLS)('$mallKey: 읽기기 몰이고, 새 백그라운드 탭을 목록 화면으로 열어 처리기 파일로 읽은 뒤 닫는다', async (row) => {
    expect(isMallAdminListingMallKey(row.mallKey)).toBe(true);
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
    expect(fake.log).toEqual([
      ...(row.reuse ? [`find ${row.reuse}`] : []),
      'open about:blank', `navigate ${row.startUrl}`, 'ask KIDITEM_PAGE_CALL', injected, 'ask KIDITEM_PAGE_CALL', 'close 7',
    ]);
  });

  it.each(MALLS.filter((row) => row.reuse))('$mallKey: 로그인해 둔 판매자센터 탭이 있으면 그 탭의 지금 화면에서 읽고 옮기지도 닫지도 않는다(탭마다 로그인)', async (row) => {
    const fake = fakeTabPages({
      existingTab: (pattern) => (pattern === row.reuse ? 42 : null),
      // 운영자가 판매자센터의 다른 화면(상품 조회)에 있다 — 처리기는 화면 함수·세션 토큰만 기다리므로 그 화면에서 읽는다.
      currentUrl: 'https://store.lotteon.com/pd/product/productList_SO.wsp',
      answer: (_message, injected) => (injected ? { ok: true, value: { success: true, snapshot: snapshotOf(row.mallKey) } } : { ok: false, error: 'content_script_missing' }),
    });
    await expect(routerFor(fake.tabs).reader(row.mallKey)!.readListings(planOf(row.mallKey))).resolves.toEqual(snapshotOf(row.mallKey));
    expect(fake.log[0]).toBe(`find ${row.reuse}`);
    expect(fake.log).not.toContain('open about:blank');
    expect(fake.log).not.toContain(`navigate ${row.startUrl}`);
    expect(fake.log.some((line) => line.startsWith('navigate'))).toBe(false);
    expect(fake.log.at(-1)).toBe('keep 42');
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
