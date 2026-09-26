import { describe, expect, it } from 'vitest';
import { isRuntimeError } from '../../core/errors';
import { fastClock } from '../login.fake';
import { siteFactoryFor, type SiteDeps } from '../registry';
import { fakeTabPages } from '../tab-page.fake';
import { ALWAYS_ORDER_URL, ALWAYS_PAGE_GUARD, createAlwaysSite } from './index';

// 옛 `scrapeAlwayzOrders` 답 그대로(앱이 조립한 xlsx blob의 base64).
const XLSX_BASE64 = btoa('PK\u0003\u0004 fake workbook');
const CREDENTIALS = { loginId: 'fake-mall-id', password: 'fake-mall-password' };

async function failure(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  if (!isRuntimeError(error)) throw new Error(`expected RuntimeError, got ${String(error)}`);
  return error;
}

describe('sites/always — 올웨이즈 팀모집완료 주문 엑셀(blob) 읽기', () => {
  it('몰 키 이름으로 등록되고, 로그인 폼 명세 없이 로그인 화면(/login)만 가린다(JWT — KID-380 결정 #3)', () => {
    expect(siteFactoryFor('always')).not.toBeNull();
    expect(ALWAYS_ORDER_URL).toBe('https://alwayzseller.ilevit.com/shippings');
    expect(ALWAYS_PAGE_GUARD.isLogin(new URL('https://alwayzseller.ilevit.com/login'))).toBe(true);
    expect(ALWAYS_PAGE_GUARD.isLogin(new URL(ALWAYS_ORDER_URL))).toBe(false);
  });

  it('새 탭에서 배송관리를 열고 MAIN 처리기가 잡은 xlsx blob을 조각으로 돌려준 뒤 닫는다, 신규 주문 0건은 빈 수집', async () => {
    const asked: Array<Record<string, unknown>> = [];
    const fake = fakeTabPages({
      answer: (message, injected) => {
        asked.push(message);
        return injected
          ? { ok: true, value: { success: true, xlsxBase64: XLSX_BASE64, fileName: '올웨이즈.xlsx', size: 20 } }
          : { ok: false, error: 'content_script_missing' };
      },
    });
    await expect(createAlwaysSite(fake.tabs).readOrders()).resolves.toEqual({ rows: [{ fileName: '올웨이즈.xlsx', part: 0, parts: 1, base64: XLSX_BASE64 }] });
    expect(asked[0]).toEqual({ type: 'KIDITEM_PAGE_CALL', call: 'always.orders', args: {} });
    expect(fake.log).toEqual([
      'open about:blank',
      `navigate ${ALWAYS_ORDER_URL}`,
      'ask KIDITEM_PAGE_CALL',
      'inject content/page-call/bridge.js,content/page-call/runner.js,content/page-call/always-orders.js',
      'ask KIDITEM_PAGE_CALL',
      'close 7',
    ]);

    const empty = fakeTabPages({ answer: () => ({ ok: true, value: { success: true, empty: true, rowCount: 0 } }) });
    await expect(createAlwaysSite(empty.tabs).readOrders()).resolves.toEqual({ rows: [] });
  });

  it('로그인 화면이면 실행 자격이 있어도 채우지 않고 SITE_LOGIN_REQUIRED로 멈춰 탭을 남긴다(운영자가 로그인)', async () => {
    const asked: string[] = [];
    const fake = fakeTabPages({
      landAt: () => 'https://alwayzseller.ilevit.com/login',
      answer: (message) => {
        asked.push(String(message.call));
        return { ok: true };
      },
    });
    const deps = { tabs: fake.tabs, ...fastClock() } as unknown as SiteDeps;
    const site = siteFactoryFor('always')!.create(deps, { tabId: null, credentials: CREDENTIALS }) as ReturnType<typeof createAlwaysSite>;
    expect(await failure(site.readOrders())).toMatchObject({ code: 'SITE_LOGIN_REQUIRED' });
    expect(asked).toEqual([]);
    expect(fake.log).not.toContain('close 7');

    const expired = fakeTabPages({ answer: () => ({ ok: true, value: { success: false, pendingLogin: true, errorCode: 'login_required', error: '올웨이즈 로그인 세션이 만료되었습니다. 다시 로그인한 뒤 수집해주세요.' } }) });
    expect(await failure(createAlwaysSite(expired.tabs).readOrders())).toMatchObject({ code: 'SITE_LOGIN_REQUIRED', message: '올웨이즈 로그인 세션이 만료되었습니다. 다시 로그인한 뒤 수집해주세요.' });
    expect(expired.log).not.toContain('close 7');
  });
});
