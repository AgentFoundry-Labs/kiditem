import { describe, expect, it } from 'vitest';
import { isRuntimeError } from '../../core/errors';
import { fakeLoginScreen, fastClock } from '../login.fake';
import { MALL_FILE_PART_CHARS } from '../mall-excel';
import { siteFactoryFor } from '../registry';
import { createSiteSignIn } from '../site-login';
import { fakeTabPages } from '../tab-page.fake';
import { createKkomangseSite, KKOMANGSE_LOGIN, KKOMANGSE_ORDER_URL } from './index';

const CREDENTIALS = { loginId: 'fake-mall-id', password: 'fake-mall-password' };
// 옛 `scrapeKkomangseExport` 답 그대로(xlsx base64 — 'PK'로 시작하는 바이트).
const XLSX_BASE64 = btoa('PK\u0003\u0004 fake workbook');

async function failure(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  if (!isRuntimeError(error)) throw new Error(`expected RuntimeError, got ${String(error)}`);
  return error;
}

describe('sites/kkomangse — 꼬망세 주문 엑셀(get_search_excel) 읽기', () => {
  it('몰 키 이름으로 등록되고, 로그인 입구는 옛 mall-session.js kkomangse 줄(전체주문 목록, 두 칸)이다', () => {
    expect(siteFactoryFor('kkomangse')).not.toBeNull();
    expect(KKOMANGSE_ORDER_URL).toBe('https://nstore.edupre.co.kr/subAdmin/_order_product.list.php?mode=search&pass_input_type=all&st=o_rdate&so=desc&listmaxcount=1000');
    expect(KKOMANGSE_LOGIN).toMatchObject({ loginUrl: KKOMANGSE_ORDER_URL, hosts: ['edupre.co.kr'], fields: ['loginId', 'password'] });
    expect(KKOMANGSE_LOGIN.isLoginUrl(new URL('https://nstore.edupre.co.kr/member/login.php'))).toBe(true);
    expect(KKOMANGSE_LOGIN.isLoginUrl(new URL(KKOMANGSE_ORDER_URL))).toBe(false);
  });

  it('새 백그라운드 탭에서 전체주문 목록을 열고 ISOLATED 처리기가 받은 엑셀을 파일 조각으로 돌려준 뒤 닫는다', async () => {
    const asked: Array<Record<string, unknown>> = [];
    const fake = fakeTabPages({
      answer: (message, injected) => {
        asked.push(message);
        return injected ? { ok: true, value: { success: true, xlsxBase64: XLSX_BASE64, size: 20 } } : { ok: false, error: 'content_script_missing' };
      },
    });
    await expect(createKkomangseSite(fake.tabs).readOrders()).resolves.toEqual({
      rows: [{ fileName: 'kkomangse.xlsx', part: 0, parts: 1, base64: XLSX_BASE64 }],
    });
    expect(asked[0]).toEqual({ type: 'KIDITEM_PAGE_CALL', call: 'kkomangse.orders', args: {} });
    expect(fake.log).toEqual([
      'open about:blank',
      `navigate ${KKOMANGSE_ORDER_URL}`,
      'ask KIDITEM_PAGE_CALL',
      'inject content/page-call/bridge.js,content/page-call/kkomangse-orders.js',
      'ask KIDITEM_PAGE_CALL',
      'close 7',
    ]);
  });

  it('큰 엑셀은 1MiB 청크에 들게 조각으로 나눈다', async () => {
    const big = 'A'.repeat(MALL_FILE_PART_CHARS + 4);
    const fake = fakeTabPages({ answer: () => ({ ok: true, value: { success: true, xlsxBase64: big } }) });
    const { rows } = await createKkomangseSite(fake.tabs).readOrders();
    expect(rows.map((row) => [(row as { part: number }).part, (row as { parts: number }).parts, (row as { base64: string }).base64.length]))
      .toEqual([[0, 2, MALL_FILE_PART_CHARS], [1, 2, 4]]);
  });

  it('로그인 화면이면 실행 자격으로 한 번 로그인하고 목록으로 돌아가 다시 읽는다, 자격이 없으면 SITE_LOGIN_REQUIRED로 탭을 남긴다', async () => {
    const loginAt = 'https://nstore.edupre.co.kr/member/login.php';
    const login = fakeLoginScreen({ loginAt });
    const fake = fakeTabPages({
      landAt: login.landAt,
      frames: login.frames,
      answer: (message) => login.answer(message) ?? { ok: true, value: { success: true, xlsxBase64: XLSX_BASE64 } },
    });
    const signIn = createSiteSignIn(KKOMANGSE_LOGIN, CREDENTIALS, fastClock());
    await expect(createKkomangseSite(fake.tabs, signIn).readOrders()).resolves.toMatchObject({ rows: [{ base64: XLSX_BASE64 }] });
    expect(login.state.filled).toEqual([{ loginId: 'fake-mall-id', password: 'fake-mall-password' }]);
    expect(fake.log.at(-1)).toBe('close 7');

    const loggedOut = fakeTabPages({ landAt: () => loginAt, answer: () => ({ ok: true }) });
    const noCredentials = createSiteSignIn(KKOMANGSE_LOGIN, null, fastClock());
    expect(await failure(createKkomangseSite(loggedOut.tabs, noCredentials).readOrders())).toMatchObject({
      code: 'SITE_LOGIN_REQUIRED',
      details: { reason: 'no_credentials' },
    });
    expect(loggedOut.log).not.toContain('close 7');
  });

  it('처리기가 로그인 화면(비밀번호 칸)을 알리면 SITE_LOGIN_REQUIRED, 엑셀이 아닌 응답은 옛 문장 그대로 SITE_REQUEST_FAILED', async () => {
    const expired = fakeTabPages({ answer: () => ({ ok: true, value: { success: false, pendingLogin: true, errorCode: 'login_required', error: '꼬망세 로그인이 필요합니다.' } }) });
    expect((await failure(createKkomangseSite(expired.tabs).readOrders())).code).toBe('SITE_LOGIN_REQUIRED');

    const notExcel = fakeTabPages({ answer: () => ({ ok: true, value: { success: false, error: '엑셀이 아닌 응답입니다. nstore.edupre.co.kr 로그인이 필요할 수 있습니다.' } }) });
    expect(await failure(createKkomangseSite(notExcel.tabs).readOrders())).toMatchObject({
      code: 'SITE_REQUEST_FAILED',
      message: '엑셀이 아닌 응답입니다. nstore.edupre.co.kr 로그인이 필요할 수 있습니다.',
      details: { reason: 'page_error' },
    });
    expect(notExcel.log.at(-1)).toBe('close 7');
  });
});
