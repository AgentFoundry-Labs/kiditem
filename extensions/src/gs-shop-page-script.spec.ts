import { describe, expect, it } from 'vitest';
import source from '../kiditem-os/content/page-call/gs-shop-orders.js?raw';

// GS샵 주문 엑셀 페이지 스크립트(MAIN world 처리기, 옛 worker.js `scrapeGsshopOrders` 이식)를 실제 파일 그대로 돌린다.
// 가짜는 페이지 경계(배송관리 DOM·createObjectURL·시계)뿐이다. 옛 order-collector-empty-vs-login 테스트의 GS 화면을 옮겼다.
type Handler = () => Promise<Record<string, unknown>>;

function advancingDate() {
  let now = 0;
  return class AdvancingDate extends Date {
    static override now() {
      now += 1_000;
      return now;
    }
  };
}

function gsDocument(countText: string | null = null, bodyText = 'GS샵 배송관리', includeSearch = true) {
  const searchButton = { textContent: '조회', offsetParent: {}, closest: () => null, click() {} };
  const countElement = countText ? { textContent: countText, children: [], click() {} } : null;
  return {
    body: { innerText: bodyText },
    querySelector: () => null,
    querySelectorAll(selector: string) {
      if (selector === 'button') return includeSearch ? [searchButton] : [];
      if (selector === '*') return countElement ? [countElement] : [];
      return [];
    },
  };
}

function load(document: unknown) {
  const window: Record<string, unknown> = { __kiditemPageCalls: {} };
  const immediate = (callback: () => void) => callback();
  const url = { createObjectURL: () => 'blob:x' };
  const location = { href: 'https://partners.gsshop.com/logistics/partner-logistics-mng' };
  new Function('window', 'document', 'URL', 'Date', 'setTimeout', 'location', source)(window, document, url, advancingDate(), immediate, location);
  const calls = window.__kiditemPageCalls as Record<string, Handler>;
  return { orders: calls['gs-shop.orders']!, smsWall: calls['gs-shop.smsWall']! };
}

describe('gs-shop orders page script', () => {
  it('조회 결과 "총주문(0)"은 빈 수집, 건수가 안 보이면 provider_contract_changed(옛 테스트)', async () => {
    await expect(load(gsDocument('총주문(0)')).orders()).resolves.toEqual({ success: true, empty: true, rowCount: 0 });
    const missing = await load(gsDocument()).orders();
    expect(missing).toMatchObject({ success: false, errorCode: 'provider_contract_changed' });
    expect(missing.empty).toBeUndefined();
  });

  it('조회 버튼이 없는 것만으로 로그인이라 하지 않는다, 로그인·SMS 화면은 각각 login_required·pendingAuth(옛 테스트)', async () => {
    const changed = await load(gsDocument(null, 'GS샵 배송관리', false)).orders();
    expect(changed).toMatchObject({ errorCode: 'provider_contract_changed' });
    expect(changed.pendingLogin).toBeUndefined();
    await expect(load(gsDocument(null, 'GS샵 로그인', false)).orders()).resolves.toMatchObject({ errorCode: 'login_required', pendingLogin: true });
    await expect(load(gsDocument(null, '인증번호 받기', false)).orders()).resolves.toMatchObject({ pendingAuth: true, errorCode: 'operator_action_required' });
  });

  it('smsWall은 로그인 화면이 SMS 인증번호를 받는 화면인지 본다', async () => {
    await expect(load(gsDocument(null, '협력사 로그인 인증번호 받기', false)).smsWall()).resolves.toEqual({ sms: true });
    await expect(load(gsDocument(null, '협력사 로그인', false)).smsWall()).resolves.toEqual({ sms: false });
  });
});
