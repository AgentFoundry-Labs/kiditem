import { describe, expect, it } from 'vitest';
import { isRuntimeError } from '../../core/errors';
import { fakeLoginScreen, fastClock } from '../login.fake';
import { siteFactoryFor, type SiteDeps } from '../registry';
import { createSiteSignIn } from '../site-login';
import { fakeTabPages } from '../tab-page.fake';
import { BORIBORI_LOGIN, BORIBORI_ORDER_URL, createBoriboriSite } from './index';

const CREDENTIALS = { loginId: 'fake-mall-id', password: 'fake-mall-password' };
// 옛 `scrapeBoriboriOrders` 답 그대로(언마스킹 xlsx base64).
const XLSX_BASE64 = btoa('PK\u0003\u0004 fake workbook');

async function failure(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  if (!isRuntimeError(error)) throw new Error(`expected RuntimeError, got ${String(error)}`);
  return error;
}

describe('sites/boribori — 보리보리 결제완료 주문 언마스킹 엑셀 읽기', () => {
  it('몰 키 이름으로 등록되고, 로그인 입구는 옛 mall-session.js boribori 줄(주문/배송관리 → /login, 두 칸)이다', () => {
    expect(siteFactoryFor('boribori')).not.toBeNull();
    expect(BORIBORI_ORDER_URL).toBe('https://seller-club.co.kr/order/orderDeliList');
    expect(BORIBORI_LOGIN).toMatchObject({ loginUrl: BORIBORI_ORDER_URL, hosts: ['seller-club.co.kr'], fields: ['loginId', 'password'] });
    expect(BORIBORI_LOGIN.isLoginUrl(new URL('https://seller-club.co.kr/login'))).toBe(true);
    expect(BORIBORI_LOGIN.isLoginUrl(new URL(BORIBORI_ORDER_URL))).toBe(false);
  });

  it('실행 자격의 비밀번호를 다운로드 암호로 페이지 호출 인자로만 넘기고(옛 웹 BMC 규칙), 받은 엑셀을 조각으로 돌려준다', async () => {
    const asked: Array<Record<string, unknown>> = [];
    const fake = fakeTabPages({
      answer: (message, injected) => {
        asked.push(message);
        return injected
          ? { ok: true, value: { success: true, xlsxBase64: XLSX_BASE64, fileName: '보리보리.xlsx', size: 20 } }
          : { ok: false, error: 'content_script_missing' };
      },
    });
    const deps = { tabs: fake.tabs, ...fastClock() } as unknown as SiteDeps;
    const site = siteFactoryFor('boribori')!.create(deps, { tabId: null, credentials: CREDENTIALS }) as ReturnType<typeof createBoriboriSite>;
    await expect(site.readOrders()).resolves.toEqual({ rows: [{ fileName: '보리보리.xlsx', part: 0, parts: 1, base64: XLSX_BASE64 }] });
    expect(asked[0]).toEqual({
      type: 'KIDITEM_PAGE_CALL',
      call: 'boribori.orders',
      args: { downloadReason: '배송확인합니다', downloadPassword: 'fake-mall-password' },
    });
    expect(fake.log).toEqual([
      'open about:blank',
      `navigate ${BORIBORI_ORDER_URL}`,
      'ask KIDITEM_PAGE_CALL',
      'inject content/page-call/bridge.js,content/page-call/runner.js,content/page-call/boribori-orders.js',
      'ask KIDITEM_PAGE_CALL',
      'close 7',
    ]);
  });

  it('자격이 없으면 빈 암호(사유만 — 옛 웹이 보내던 빈 문자열), 비밀번호가 필요하다는 답은 OPERATOR_ACTION_REQUIRED이고 오류에 암호를 싣지 않는다', async () => {
    const asked: Array<Record<string, unknown>> = [];
    const needsPassword = fakeTabPages({
      answer: (message) => {
        asked.push(message);
        return { ok: true, value: { success: false, errorCode: 'operator_action_required', error: '보리보리 언마스킹 다운로드에 비밀번호가 필요합니다. 몰 계정 관리에서 보리보리 비밀번호를 저장한 뒤 다시 수집해주세요.' } };
      },
    });
    const error = await failure(createBoriboriSite(needsPassword.tabs, '').readOrders());
    expect(asked[0]?.args).toEqual({ downloadReason: '배송확인합니다', downloadPassword: '' });
    expect(error).toMatchObject({ code: 'OPERATOR_ACTION_REQUIRED' });
    expect(JSON.stringify(error.details)).not.toContain('fake-mall-password');

    const empty = fakeTabPages({ answer: () => ({ ok: true, value: { success: true, empty: true, rowCount: 0 } }) });
    await expect(createBoriboriSite(empty.tabs, 'fake-mall-password').readOrders()).resolves.toEqual({ rows: [] });
  });

  it('로그인 화면(/login)이면 실행 자격으로 한 번 로그인하고 주문/배송관리로 돌아가 다시 읽는다', async () => {
    const login = fakeLoginScreen({ loginAt: 'https://seller-club.co.kr/login' });
    const fake = fakeTabPages({
      landAt: login.landAt,
      frames: login.frames,
      answer: (message) => login.answer(message) ?? { ok: true, value: { success: true, xlsxBase64: XLSX_BASE64, fileName: '보리보리.xlsx' } },
    });
    const signIn = createSiteSignIn(BORIBORI_LOGIN, CREDENTIALS, fastClock());
    await expect(createBoriboriSite(fake.tabs, CREDENTIALS.password, signIn).readOrders()).resolves.toMatchObject({ rows: [{ fileName: '보리보리.xlsx' }] });
    expect(login.state.filled).toEqual([{ loginId: 'fake-mall-id', password: 'fake-mall-password' }]);
    expect(fake.log.at(-1)).toBe('close 7');
  });
});
