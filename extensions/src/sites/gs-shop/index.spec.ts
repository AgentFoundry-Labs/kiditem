import { describe, expect, it } from 'vitest';
import { isRuntimeError } from '../../core/errors';
import { siteFactoryFor } from '../registry';
import { fakeTabPages } from '../tab-page.fake';
import { createGsShopSite, GS_SHOP_LOGIN, GS_SHOP_ORDER_URL } from './index';

// 옛 `scrapeGsshopOrders` 답 그대로(클라이언트가 조립한 xlsx blob의 base64).
const XLSX_BASE64 = btoa('PK\u0003\u0004 fake workbook');
const SIGN_IN = 'https://partners.gsshop.com/sign-in';
const OK = { ok: true, value: { success: true, xlsxBase64: XLSX_BASE64, fileName: 'GS샵.xlsx', size: 20 } };
const SMS = { ok: true, value: { success: false, pendingAuth: true, errorCode: 'operator_action_required', error: 'GS샵 SMS 인증이 필요합니다.' } };

async function failure(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  if (!isRuntimeError(error)) throw new Error(`expected RuntimeError, got ${String(error)}`);
  return error;
}

function attentionLog() {
  const seen: unknown[] = [];
  return { seen, onAttention: (attention: unknown) => { seen.push(attention); } };
}

describe('sites/gs-shop — GS샵 협력사 배송관리 엑셀(blob) 읽기', () => {
  it('몰 키 이름으로 등록되고, 로그인 입구는 옛 mall-session.js gs-shop 줄(배송관리 → /sign-in, 두 칸)이다', () => {
    expect(siteFactoryFor('gs-shop')).not.toBeNull();
    expect(GS_SHOP_ORDER_URL).toBe('https://partners.gsshop.com/logistics/partner-logistics-mng');
    expect(GS_SHOP_LOGIN).toMatchObject({ loginUrl: GS_SHOP_ORDER_URL, hosts: ['partners.gsshop.com'], fields: ['loginId', 'password'] });
    expect(GS_SHOP_LOGIN.isLoginUrl(new URL(SIGN_IN))).toBe(true);
    expect(GS_SHOP_LOGIN.isLoginUrl(new URL(GS_SHOP_ORDER_URL))).toBe(false);
  });

  it('새 탭에서 배송관리를 열고 MAIN 처리기가 잡은 xlsx blob을 조각으로 돌려준 뒤 닫는다, 조회 0건은 빈 수집', async () => {
    const asked: Array<Record<string, unknown>> = [];
    const fake = fakeTabPages({
      answer: (message, injected) => {
        asked.push(message);
        return injected ? OK : { ok: false, error: 'content_script_missing' };
      },
    });
    await expect(createGsShopSite(fake.tabs).readOrders({})).resolves.toEqual({ rows: [{ fileName: 'GS샵.xlsx', part: 0, parts: 1, base64: XLSX_BASE64 }] });
    expect(asked[0]).toEqual({ type: 'KIDITEM_PAGE_CALL', call: 'gs-shop.orders', args: {} });
    expect(fake.log).toEqual([
      'open about:blank',
      `navigate ${GS_SHOP_ORDER_URL}`,
      'ask KIDITEM_PAGE_CALL',
      'inject content/page-call/bridge.js,content/page-call/runner.js,content/page-call/gs-shop-orders.js',
      'ask KIDITEM_PAGE_CALL',
      'close 7',
    ]);

    const empty = fakeTabPages({ answer: () => ({ ok: true, value: { success: true, empty: true, rowCount: 0 } }) });
    await expect(createGsShopSite(empty.tabs).readOrders({})).resolves.toEqual({ rows: [] });
  });

  it('배송관리 화면이 SMS 인증을 요구하면 실패하지 않고 운영자를 기다렸다가(attention) 배송관리로 돌아가 다시 읽는다', async () => {
    let calls = 0;
    const fake = fakeTabPages({ verificationClears: true, answer: () => (calls++ === 0 ? SMS : OK) });
    const attention = attentionLog();
    await expect(createGsShopSite(fake.tabs).readOrders({ onAttention: attention.onAttention })).resolves.toMatchObject({ rows: [{ fileName: 'GS샵.xlsx' }] });
    expect(attention.seen).toEqual([{ kind: 'verification', site: 'gs-shop', label: 'SMS 인증' }, { kind: 'verification', site: 'gs-shop', label: 'SMS 인증' }, null]);
    expect(fake.log).toEqual([
      'open about:blank',
      `navigate ${GS_SHOP_ORDER_URL}`,
      'ask KIDITEM_PAGE_CALL',
      'wait for operator',
      `navigate ${GS_SHOP_ORDER_URL}`,
      'ask KIDITEM_PAGE_CALL',
      'close 7',
    ]);
  });

  it('로그인 화면(/sign-in)이 SMS 인증번호를 받는 화면이면 로그인하지 않고 운영자를 기다린다, 아니면 SITE_LOGIN_REQUIRED로 탭을 남긴다', async () => {
    let verified = false;
    const asked: string[] = [];
    const fake = fakeTabPages({
      verificationClears: true,
      landAt: (url) => (verified ? url : SIGN_IN),
      answer: (message) => {
        asked.push(String(message.call));
        return message.call === 'gs-shop.smsWall' ? { ok: true, value: { sms: true } } : OK;
      },
    });
    const operator = { onAttention: (attention: unknown) => { if (attention) verified = true; } };
    await expect(createGsShopSite(fake.tabs).readOrders(operator)).resolves.toMatchObject({ rows: [{ fileName: 'GS샵.xlsx' }] });
    expect(asked).toEqual(['gs-shop.smsWall', 'gs-shop.orders']);

    const plainLogin = fakeTabPages({ landAt: () => SIGN_IN, answer: () => ({ ok: true, value: { sms: false } }) });
    expect(await failure(createGsShopSite(plainLogin.tabs).readOrders({}))).toMatchObject({ code: 'SITE_LOGIN_REQUIRED' });
    expect(plainLogin.log).not.toContain('close 7');
  });

  it('운영자가 10분 안에 SMS 인증을 마치지 않으면 옛 문장으로 OPERATOR_ACTION_REQUIRED', async () => {
    const fake = fakeTabPages({ verificationClears: false, answer: () => SMS });
    expect(await failure(createGsShopSite(fake.tabs).readOrders({}))).toMatchObject({ code: 'OPERATOR_ACTION_REQUIRED', message: 'GS샵 SMS 인증이 필요합니다.' });
  });
});
