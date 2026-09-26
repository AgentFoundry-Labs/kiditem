import { describe, expect, it } from 'vitest';
import { isRuntimeError } from '../../core/errors';
import { fakeLoginScreen, fastClock } from '../login.fake';
import { siteFactoryFor } from '../registry';
import { createSiteSignIn } from '../site-login';
import { fakeTabPages } from '../tab-page.fake';
import { createLotteOnSite, LOTTE_ON_LOGIN, LOTTE_ON_ORDER_URL, LOTTE_ON_TAB_PATTERN } from './index';

const CREDENTIALS = { loginId: 'fake-mall-id', password: 'fake-mall-password' };
const LOGIN_PAGE = 'https://store.lotteon.com/cm/main/login_SO.wsp';
// 옛 `scrapeLotteonOrders` 답 그대로(soapi fileManage에서 받은 xlsx base64).
const XLSX_BASE64 = btoa('PK\u0003\u0004 fake workbook');
const OK = { ok: true, value: { success: true, xlsxBase64: XLSX_BASE64, fileName: '배송관리_신규주문.xlsx', size: 20 } };

async function failure(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  if (!isRuntimeError(error)) throw new Error(`expected RuntimeError, got ${String(error)}`);
  return error;
}

describe('sites/lotte-on — 롯데ON 판매자센터 신규주문 엑셀(soapi) 읽기', () => {
  it('몰 키 이름으로 등록되고, 로그인 입구는 옛 mall-session.js lotte-on 줄(login_SO.wsp, 두 칸)이다', () => {
    expect(siteFactoryFor('lotte-on')).not.toBeNull();
    expect(LOTTE_ON_ORDER_URL).toBe('https://store.lotteon.com/cm/main/index_SO.wsp');
    expect(LOTTE_ON_TAB_PATTERN).toBe('https://store.lotteon.com/*');
    expect(LOTTE_ON_LOGIN).toMatchObject({ loginUrl: LOGIN_PAGE, hosts: ['store.lotteon.com'], fields: ['loginId', 'password'] });
    expect(LOTTE_ON_LOGIN.isLoginUrl(new URL(LOGIN_PAGE))).toBe(true);
    expect(LOTTE_ON_LOGIN.isLoginUrl(new URL(LOTTE_ON_ORDER_URL))).toBe(false);
  });

  it('열린 판매자센터 탭을 재사용해(탭별 sessionStorage 토큰) 그 탭의 ISOLATED 처리기로 읽고, 운영자 탭은 닫지 않는다', async () => {
    // 재사용한 탭은 옮기지 않고(옛 borrowOpenTab) 어느 판매자센터 화면에 있든 읽는다 — soapi 요청만이라 화면 주소에 기대지 않는다.
    const asked: Array<Record<string, unknown>> = [];
    const fake = fakeTabPages({
      currentUrl: 'https://store.lotteon.com/po/product/list',
      existingTab: (pattern) => (pattern === LOTTE_ON_TAB_PATTERN ? 11 : null),
      answer: (message, injected) => {
        asked.push(message);
        return injected ? OK : { ok: false, error: 'content_script_missing' };
      },
    });
    await expect(createLotteOnSite(fake.tabs).readOrders()).resolves.toEqual({
      rows: [{ fileName: '배송관리_신규주문.xlsx', part: 0, parts: 1, base64: XLSX_BASE64 }],
    });
    expect(asked[0]).toEqual({ type: 'KIDITEM_PAGE_CALL', call: 'lotte-on.orders', args: { downloadReason: '배송을 위한 주문정보 다운로드' } });
    expect(fake.log).toEqual([
      `find ${LOTTE_ON_TAB_PATTERN}`,
      'ask KIDITEM_PAGE_CALL',
      'inject content/page-call/bridge.js,content/page-call/lotte-on-orders.js',
      'ask KIDITEM_PAGE_CALL',
      'keep 11',
    ]);
  });

  it('열린 탭이 없으면 새 탭을 열고, 그 탭은 로그인 화면이라 실행 자격으로 한 번 로그인한 뒤 읽고 닫는다', async () => {
    const login = fakeLoginScreen({ loginAt: LOGIN_PAGE });
    const fake = fakeTabPages({
      landAt: login.landAt,
      frames: login.frames,
      answer: (message) => login.answer(message) ?? OK,
    });
    const signIn = createSiteSignIn(LOTTE_ON_LOGIN, CREDENTIALS, fastClock());
    await expect(createLotteOnSite(fake.tabs, signIn).readOrders()).resolves.toMatchObject({ rows: [{ base64: XLSX_BASE64 }] });
    expect(login.state.filled).toEqual([{ loginId: 'fake-mall-id', password: 'fake-mall-password' }]);
    expect(fake.log.slice(0, 3)).toEqual([`find ${LOTTE_ON_TAB_PATTERN}`, 'open about:blank', `navigate ${LOTTE_ON_ORDER_URL}`]);
    expect(fake.log.at(-1)).toBe('close 7');

    const noCredentials = fakeTabPages({ landAt: () => LOGIN_PAGE, answer: () => ({ ok: true }) });
    expect(await failure(createLotteOnSite(noCredentials.tabs, createSiteSignIn(LOTTE_ON_LOGIN, null, fastClock())).readOrders()))
      .toMatchObject({ code: 'SITE_LOGIN_REQUIRED', details: { reason: 'no_credentials' } });
    expect(noCredentials.log).not.toContain('close 7');
  });

  it('토큰이 없거나 로그인·인증·세션을 말하는 실패는 옛 규칙대로 SITE_LOGIN_REQUIRED, 엑셀 생성 실패는 옛 문장 그대로 SITE_REQUEST_FAILED', async () => {
    const noToken = fakeTabPages({ answer: () => ({ ok: true, value: { success: false, error: '롯데ON 판매자센터 로그인이 필요합니다. 로그인 후 다시 시도하세요.' } }) });
    expect(await failure(createLotteOnSite(noToken.tabs).readOrders())).toMatchObject({
      code: 'SITE_LOGIN_REQUIRED',
      message: '롯데ON 판매자센터 로그인이 필요합니다. 쇼핑몰 계정의 아이디·비밀번호를 확인하거나 롯데ON 에 직접 로그인한 뒤 다시 수집해 주세요.',
    });
    expect(noToken.log).not.toContain('close 7');

    const failed = fakeTabPages({ answer: () => ({ ok: true, value: { success: false, error: '롯데ON 엑셀 생성에 실패했습니다. (FAIL)' } }) });
    expect(await failure(createLotteOnSite(failed.tabs).readOrders())).toMatchObject({ code: 'SITE_REQUEST_FAILED', message: '롯데ON 엑셀 생성에 실패했습니다. (FAIL)' });
    expect(failed.log.at(-1)).toBe('close 7');
  });
});
