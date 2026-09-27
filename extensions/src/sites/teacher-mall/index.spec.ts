import { describe, expect, it } from 'vitest';
import { isRuntimeError } from '../../core/errors';
import { fakeLoginScreen, fastClock } from '../login.fake';
import { siteFactoryFor } from '../registry';
import { createSiteSignIn } from '../site-login';
import { fakeTabPages } from '../tab-page.fake';
import { createTeacherMallSite, TEACHER_MALL_LOGIN, TEACHER_MALL_ORDER_URL } from './index';

const CREDENTIALS = { loginId: 'fake-mall-id', password: 'fake-mall-password' };
// 옛 `scrapeTeachervilleOrders` 답 그대로(SpreadsheetML base64).
const XLS_BASE64 = btoa('<?xml version="1.0"?><Workbook>fake</Workbook>');

async function failure(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  if (!isRuntimeError(error)) throw new Error(`expected RuntimeError, got ${String(error)}`);
  return error;
}

describe('sites/teacher-mall — 티쳐몰 출고 전 주문 엑셀(excel_down, 양식 117) 읽기', () => {
  it('몰 키 이름으로 등록되고, 로그인 입구는 옛 mall-session.js teacher-mall 줄(주문상품 목록, 두 칸)이다', () => {
    expect(siteFactoryFor('teacher-mall')).not.toBeNull();
    expect(TEACHER_MALL_ORDER_URL).toBe('https://shop.teacherville.co.kr/selleradmin/order/catalog');
    expect(TEACHER_MALL_LOGIN).toMatchObject({ loginUrl: TEACHER_MALL_ORDER_URL, hosts: ['teacherville.co.kr'], fields: ['loginId', 'password'] });
    expect(TEACHER_MALL_LOGIN.isLoginUrl(new URL('https://shop.teacherville.co.kr/selleradmin/login/index'))).toBe(true);
    expect(TEACHER_MALL_LOGIN.isLoginUrl(new URL(TEACHER_MALL_ORDER_URL))).toBe(false);
  });

  it('새 탭에서 주문상품 목록을 열고 MAIN 처리기에 옛 몰 상수(양식 117·입점사 708·다운로드 사유)를 넘겨 받은 엑셀을 조각으로 돌려준다', async () => {
    const asked: Array<Record<string, unknown>> = [];
    const fake = fakeTabPages({
      answer: (message, injected) => {
        asked.push(message);
        return injected
          ? { ok: true, value: { success: true, xlsxBase64: XLS_BASE64, fileName: '티쳐몰.xls', size: 40, orderCount: 2 } }
          : { ok: false, error: 'content_script_missing' };
      },
    });
    await expect(createTeacherMallSite(fake.tabs).readOrders()).resolves.toEqual({
      rows: [{ fileName: '티쳐몰.xls', part: 0, parts: 1, base64: XLS_BASE64 }],
    });
    expect(asked[0]).toEqual({
      type: 'KIDITEM_PAGE_CALL',
      call: 'teacher-mall.orders',
      args: { templateSeq: '117', fallbackProviderSeq: '708', downloadReason: '배송준비확인' },
    });
    expect(fake.log).toEqual([
      'open about:blank',
      `navigate ${TEACHER_MALL_ORDER_URL}`,
      'ask KIDITEM_PAGE_CALL',
      'inject content/page-call/bridge.js,content/page-call/runner.js,content/page-call/teacher-mall-orders.js',
      'ask KIDITEM_PAGE_CALL',
      'close 7',
    ]);
  });

  it('출고 전 주문이 없다는 인증된 목록이면 원소 없이 끝난다(서버가 0건 성공)', async () => {
    const fake = fakeTabPages({ answer: () => ({ ok: true, value: { success: true, empty: true, rowCount: 0 } }) });
    await expect(createTeacherMallSite(fake.tabs).readOrders()).resolves.toEqual({ rows: [] });
    expect(fake.log.at(-1)).toBe('close 7');
  });

  it('로그인 화면이면 실행 자격으로 한 번 로그인하고 다시 읽는다, 처리기의 로그인 필요는 SITE_LOGIN_REQUIRED, 화면 구조 변화는 MALL_CONTRACT_CHANGED', async () => {
    const loginAt = 'https://shop.teacherville.co.kr/selleradmin/login/index';
    const login = fakeLoginScreen({ loginAt });
    const fake = fakeTabPages({
      landAt: login.landAt,
      frames: login.frames,
      answer: (message) => login.answer(message) ?? { ok: true, value: { success: true, xlsxBase64: XLS_BASE64, fileName: '티쳐몰.xls' } },
    });
    const signIn = createSiteSignIn(TEACHER_MALL_LOGIN, CREDENTIALS, fastClock());
    await expect(createTeacherMallSite(fake.tabs, signIn).readOrders()).resolves.toMatchObject({ rows: [{ fileName: '티쳐몰.xls' }] });
    expect(login.state.filled).toEqual([{ loginId: 'fake-mall-id', password: 'fake-mall-password' }]);

    const expired = fakeTabPages({ answer: () => ({ ok: true, value: { success: false, pendingLogin: true, errorCode: 'login_required', error: '티쳐몰 로그인이 필요합니다.' } }) });
    expect((await failure(createTeacherMallSite(expired.tabs).readOrders())).code).toBe('SITE_LOGIN_REQUIRED');
    expect(expired.log).not.toContain('close 7');

    const changed = fakeTabPages({ answer: () => ({ ok: true, value: { success: false, errorCode: 'provider_contract_changed', error: '티쳐몰 주문 다운로드 폼을 찾지 못했습니다.' } }) });
    expect(await failure(createTeacherMallSite(changed.tabs).readOrders())).toMatchObject({ code: 'MALL_CONTRACT_CHANGED', message: '티쳐몰 주문 다운로드 폼을 찾지 못했습니다.' });
    expect(changed.log.at(-1)).toBe('close 7');
  });
});
