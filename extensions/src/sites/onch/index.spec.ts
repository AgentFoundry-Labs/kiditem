import { describe, expect, it } from 'vitest';
import { isRuntimeError } from '../../core/errors';
import { fakeLoginScreen, fastClock } from '../login.fake';
import '../mall-orders';
import { siteFactoryFor, type SiteDeps } from '../registry';
import { fakeTabPages } from '../tab-page.fake';
import { createOnchSite, ONCH_LOGIN, ONCH_ORDER_URL } from './index';

const INPUT = { collectionDate: '2026-09-26', selectionMode: 'manual' as const, seenRowKeys: [] };
/** 페이지 스크립트가 돌려주는 주문(옛 `scrapeOnchannelOrders`의 원소 = 옛 변환 본문 `{orders}`의 원소). */
const ORDER = { orderCode: 'OC-2', date: '2026-09-26 14:00:00', productName: '색종이', qty: 2, productPrice: 12000, shippingFee: 3000 };
const LOGIN_PAGE = 'https://www.onch3.co.kr/login/login_web.php';

async function failure(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  if (!isRuntimeError(error)) throw new Error(`expected RuntimeError, got ${String(error)}`);
  return error;
}

describe('sites/onch — 몰 주문 읽기(KID-380)', () => {
  it('몰 키 이름으로 등록되고 몰 주문 라우터가 찾는다', () => {
    const deps = { tabs: fakeTabPages({ answer: () => null }).tabs, randomId: () => 'id', ...fastClock() } as unknown as SiteDeps;
    const router = siteFactoryFor('mall-orders')!.create(deps, { tabId: null, credentials: null }) as { reader(mallKey: string): unknown };
    expect(router.reader('onch')).not.toBeNull();
  });

  it('새 백그라운드 탭에서 공급사 주문 목록을 열어 그날 주문을 상세 모달까지 읽고 옛 변환 본문 원소 그대로 돌려준 뒤 닫는다', async () => {
    const asked: Array<Record<string, unknown>> = [];
    const fake = fakeTabPages({
      answer: (message, injected) => {
        asked.push(message);
        return injected ? { ok: true, value: { status: 'ok', orders: [ORDER] } } : { ok: false, error: 'content_script_missing' };
      },
    });
    await expect(createOnchSite(fake.tabs).readOrders(INPUT)).resolves.toEqual({ rows: [ORDER] });
    expect(asked[0]).toEqual({ type: 'KIDITEM_PAGE_CALL', call: 'onch.orders', args: { dateFilter: '2026-09-26' } });
    expect(fake.log).toEqual([
      'open about:blank',
      `navigate ${ONCH_ORDER_URL}`,
      'ask KIDITEM_PAGE_CALL',
      'inject content/page-call/bridge.js,content/page-call/onch-orders.js',
      'ask KIDITEM_PAGE_CALL',
      'close 7',
    ]);
  });

  it('로그인 화면으로 넘어가거나 세션이 끊기면 SITE_LOGIN_REQUIRED(탭을 남긴다), 페이지 실패는 SITE_REQUEST_FAILED', async () => {
    const redirected = fakeTabPages({ landAt: () => LOGIN_PAGE, answer: () => ({ ok: true }) });
    expect((await failure(createOnchSite(redirected.tabs).readOrders(INPUT))).code).toBe('SITE_LOGIN_REQUIRED');
    expect(redirected.log).not.toContain('close 7');

    const expired = fakeTabPages({ answer: () => ({ ok: true, value: { status: 'login_required' } }) });
    expect((await failure(createOnchSite(expired.tabs).readOrders(INPUT))).code).toBe('SITE_LOGIN_REQUIRED');

    const broken = fakeTabPages({ answer: () => ({ ok: true, value: { status: 'failed', error: '온채널 주문 목록을 찾지 못했습니다.' } }) });
    expect(await failure(createOnchSite(broken.tabs).readOrders(INPUT))).toMatchObject({ code: 'SITE_REQUEST_FAILED', details: { reason: 'page_error' } });
    expect(broken.log.at(-1)).toBe('close 7');
  });

  it('로그인 입구는 옛 mall-session.js onch 줄: 공급사 주문 목록으로 들어가 /login/login_web.php에서 두 칸', () => {
    expect(ONCH_LOGIN).toMatchObject({ loginUrl: ONCH_ORDER_URL, hosts: ['onch3.co.kr'], fields: ['loginId', 'password'] });
    expect(ONCH_LOGIN.isLoginUrl(new URL(LOGIN_PAGE))).toBe(true);
    expect(ONCH_LOGIN.isLoginUrl(new URL(ONCH_ORDER_URL))).toBe(false);
  });

  it('로그인 화면이면 실행 자격으로 한 번 로그인하고 주문 목록으로 돌아가 다시 읽는다', async () => {
    const login = fakeLoginScreen({ loginAt: LOGIN_PAGE });
    const fake = fakeTabPages({
      landAt: login.landAt,
      frames: login.frames,
      answer: (message, injected) => login.answer(message)
        ?? (injected ? { ok: true, value: { status: 'ok', orders: [ORDER] } } : { ok: false, error: 'content_script_missing' }),
    });
    const deps = { tabs: fake.tabs, randomId: () => 'id', ...fastClock() } as unknown as SiteDeps;
    const site = siteFactoryFor('onch')!.create(deps, { tabId: null, credentials: { loginId: 'fake-id', password: 'fake-password' } }) as ReturnType<typeof createOnchSite>;
    await expect(site.readOrders(INPUT)).resolves.toEqual({ rows: [ORDER] });
    expect(login.state.filled).toEqual([{ loginId: 'fake-id', password: 'fake-password' }]);
    expect(fake.log.at(-1)).toBe('close 7');
  });
});
