import { describe, expect, it } from 'vitest';
import { isRuntimeError } from '../../core/errors';
import { fakeLoginScreen, fastClock } from '../login.fake';
import '../mall-orders';
import { siteFactoryFor, type SiteDeps } from '../registry';
import { fakeTabPages } from '../tab-page.fake';
import { createHaebubMallSite, HAEBUB_MALL_LOGIN, HAEBUB_MALL_ORDER_URL, HAEBUB_MALL_VENDOR } from './index';

const INPUT = { collectionDate: '2026-09-26', selectionMode: 'manual' as const, seenRowKeys: [] };
/** 페이지 스크립트가 돌려주는 상품행(옛 `scrapeHaebeopOrders`의 원소 = 옛 변환 본문 `{orders}`의 원소). */
const ROW = { orderNo: '1001', regNo: 'B-1', productName: '색종이', qty: 2, sellPrice: 5000, sellAmount: 10000, shipFee: 2000 };
const LOGIN_PAGE = 'https://mallseller.genimarket.co.kr/mall/login.php';

async function failure(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  if (!isRuntimeError(error)) throw new Error(`expected RuntimeError, got ${String(error)}`);
  return error;
}

describe('sites/haebub-mall — 몰 주문 읽기(KID-380)', () => {
  it('몰 키 이름으로 등록되고 몰 주문 라우터가 찾는다', () => {
    const deps = { tabs: fakeTabPages({ answer: () => null }).tabs, randomId: () => 'id', ...fastClock() } as unknown as SiteDeps;
    const router = siteFactoryFor('mall-orders')!.create(deps, { tabId: null, credentials: null }) as { reader(mallKey: string): unknown };
    expect(router.reader('haebub-mall')).not.toBeNull();
  });

  it('새 백그라운드 탭에서 주문건수목록을 열어 수집일·협력사(옛 상수)로 결제완료 주문을 읽고 옛 변환 본문 원소 그대로 돌려준 뒤 닫는다', async () => {
    expect(HAEBUB_MALL_VENDOR).toBe('거영아이앤디');
    const asked: Array<Record<string, unknown>> = [];
    const fake = fakeTabPages({
      answer: (message, injected) => {
        asked.push(message);
        return injected ? { ok: true, value: { status: 'ok', orders: [ROW] } } : { ok: false, error: 'content_script_missing' };
      },
    });
    await expect(createHaebubMallSite(fake.tabs).readOrders(INPUT)).resolves.toEqual({ rows: [ROW] });
    expect(asked[0]).toEqual({ type: 'KIDITEM_PAGE_CALL', call: 'haebub-mall.orders', args: { date: '2026-09-26', vendor: '거영아이앤디' } });
    expect(fake.log).toEqual([
      'open about:blank',
      `navigate ${HAEBUB_MALL_ORDER_URL}`,
      'ask KIDITEM_PAGE_CALL',
      'inject content/page-call/bridge.js,content/page-call/haebub-mall-orders.js',
      'ask KIDITEM_PAGE_CALL',
      'close 7',
    ]);
  });

  it('로그인 화면이거나 세션이 끊기면 SITE_LOGIN_REQUIRED(탭을 남긴다), 상세 실패·쪽 상한은 SITE_REQUEST_FAILED', async () => {
    const redirected = fakeTabPages({ landAt: () => LOGIN_PAGE, answer: () => ({ ok: true }) });
    expect((await failure(createHaebubMallSite(redirected.tabs).readOrders(INPUT))).code).toBe('SITE_LOGIN_REQUIRED');
    expect(redirected.log).not.toContain('close 7');

    const expired = fakeTabPages({ answer: () => ({ ok: true, value: { status: 'login_required' } }) });
    expect((await failure(createHaebubMallSite(expired.tabs).readOrders(INPUT))).code).toBe('SITE_LOGIN_REQUIRED');

    const broken = fakeTabPages({ answer: () => ({ ok: true, value: { status: 'failed', error: '해법몰 주문 상세 조회 실패: 1001 (HTTP 503)' } }) });
    const error = await failure(createHaebubMallSite(broken.tabs).readOrders(INPUT));
    expect(error).toMatchObject({ code: 'SITE_REQUEST_FAILED', details: { reason: 'page_error' } });
    expect(error.message).toContain('1001 (HTTP 503)');
    expect(broken.log.at(-1)).toBe('close 7');
  });

  it('로그인 입구는 옛 mall-session.js haebub-mall 줄: 주문건수목록으로 들어가 로그인 화면에서 두 칸', () => {
    expect(HAEBUB_MALL_LOGIN).toMatchObject({ loginUrl: HAEBUB_MALL_ORDER_URL, hosts: ['genimarket.co.kr'], fields: ['loginId', 'password'] });
    expect(HAEBUB_MALL_LOGIN.isLoginUrl(new URL(LOGIN_PAGE))).toBe(true);
    expect(HAEBUB_MALL_LOGIN.isLoginUrl(new URL(HAEBUB_MALL_ORDER_URL))).toBe(false);
  });

  it('로그인 화면이면 실행 자격으로 한 번 로그인하고 주문건수목록으로 돌아가 다시 읽는다', async () => {
    const login = fakeLoginScreen({ loginAt: LOGIN_PAGE });
    const fake = fakeTabPages({
      landAt: login.landAt,
      frames: login.frames,
      answer: (message, injected) => login.answer(message)
        ?? (injected ? { ok: true, value: { status: 'ok', orders: [ROW] } } : { ok: false, error: 'content_script_missing' }),
    });
    const deps = { tabs: fake.tabs, randomId: () => 'id', ...fastClock() } as unknown as SiteDeps;
    const site = siteFactoryFor('haebub-mall')!.create(deps, { tabId: null, credentials: { loginId: 'fake-id', password: 'fake-password' } }) as ReturnType<typeof createHaebubMallSite>;
    await expect(site.readOrders(INPUT)).resolves.toEqual({ rows: [ROW] });
    expect(login.state.filled).toEqual([{ loginId: 'fake-id', password: 'fake-password' }]);
    expect(fake.log.at(-1)).toBe('close 7');
  });
});
