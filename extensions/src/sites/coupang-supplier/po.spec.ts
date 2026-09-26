import { describe, expect, it } from 'vitest';
import { SITE_LOGIN_REQUIRED, SITE_REQUEST_FAILED } from '../../core/site-caller';
import { fastClock } from '../login.fake';
import { fakeTabPages } from '../tab-page.fake';
import { createCoupangSupplierSite, purchaseOrderListPath } from './index';
import { SITE_COOKIE_BLOAT } from './page';
import { PO_BOOTSTRAP_URL } from './po';
import { bridgeAnswer, pageTable } from './table.fake';

const READY = 'https://supplier.coupang.com/po-web/purchase/order/list';
const QUERY = { searchDateType: 'WAREHOUSING_PLAN_DATE' as const, from: '2026-09-01', to: '2026-09-30', status: '' };
const LEASE_TAB = 5;

function site(options: { lands: string[]; answer: (message: Record<string, unknown>) => unknown }) {
  const lands = [...options.lands];
  const fake = fakeTabPages({
    landAt: () => lands.shift() ?? READY,
    answer: (message, injected) => (injected ? options.answer(message) : { ok: false, error: 'content_script_missing' }),
  });
  return { fake, supplier: createCoupangSupplierSite({ tabs: fake.tabs, ...fastClock() }, { tabId: LEASE_TAB }) };
}
const json = (value: unknown) => bridgeAnswer([], { text: JSON.stringify(value) });

describe('coupang-supplier 발주 화면(KID-359)', () => {
  it('잠금이 준 탭을 부트스트랩 주소로 옮겨 PO 화면에 닿으면 같은 출처 목록을 JSON으로 읽고, 그 탭은 닫지 않는다', async () => {
    const asked: Array<Record<string, unknown>> = [];
    const { fake, supplier } = site({
      lands: [READY],
      answer: (message) => {
        asked.push(message);
        return json({ body: { body: [{ purchaseOrderSeq: 1 }], lastPageNumber: 3 } });
      },
    });
    await expect(supplier.purchaseOrderListPage(QUERY, 1)).resolves.toEqual({ rows: [{ purchaseOrderSeq: 1 }], lastPageNumber: 3 });
    await supplier.close();
    expect(asked[0]).toEqual({ type: 'KIDITEM_COUPANG_SUPPLIER_FETCH', url: purchaseOrderListPath(QUERY, 1), headers: { accept: 'application/json' }, tables: false });
    expect(purchaseOrderListPath(QUERY, 1)).toBe('/po-web/app/purchase-order/list?page=1&searchDateType=WAREHOUSING_PLAN_DATE&searchStartDate=2026-09-01&searchEndDate=2026-09-30&centerCode=&purchaseOrderIdArray=&vendorPaymentInfoSeq=&purchaseOrderStatus=&purchaseOrderType=&skuIdArray=&crossdock=&transportType=');
    expect(fake.log.filter((line) => !line.startsWith('ask'))).toEqual([`navigate ${PO_BOOTSTRAP_URL}`, 'inject content/orders/coupang-supplier-page.js', `keep ${LEASE_TAB}`]);
  });

  it('PO 화면에 닿지 않으면 한 번 더 옮겨 보고, 그래도 아니면 로그인 필요', async () => {
    const recovered = site({ lands: ['https://supplier.coupang.com/dashboard', READY], answer: () => json({ body: { body: [], lastPageNumber: 1 } }) });
    await recovered.supplier.purchaseOrderListPage(QUERY, 1);
    expect(recovered.fake.log.filter((line) => line.startsWith('navigate'))).toHaveLength(2);

    const login = site({ lands: ['https://xauth.coupang.com/auth/realms/seller/login', 'https://xauth.coupang.com/auth/realms/seller/login'], answer: () => ({ ok: true, text: '' }) });
    await expect(login.supplier.purchaseOrderListPage(QUERY, 1)).rejects.toMatchObject({ code: SITE_LOGIN_REQUIRED });
  });

  it('PO 화면 대신 400 화면이면 쿠키 과다 — 다시 옮기지 않는다', async () => {
    const bloated = site({
      lands: ['https://supplier.coupang.com/scm/purchase/order/list'],
      answer: (message) => (message.type === 'KIDITEM_COUPANG_SUPPLIER_BODY_TEXT' ? { ok: true, text: 'HTTP Status 400 – Bad Request' } : json({})),
    });
    await expect(bloated.supplier.purchaseOrderListPage(QUERY, 1)).rejects.toMatchObject({ code: SITE_COOKIE_BLOAT });
    expect(bloated.fake.log.filter((line) => line.startsWith('navigate'))).toHaveLength(1);
  });

  it('첫 쪽이 HTML이면 로그인 필요, 그 뒤 쪽은 요청 실패, 행 배열이 없으면 형식 오류, 페이지 fetch 실패는 로그인 필요', async () => {
    const html = bridgeAnswer([], { text: '<html>로그인</html>' });
    await expect(site({ lands: [READY], answer: () => html }).supplier.purchaseOrderListPage(QUERY, 1)).rejects.toMatchObject({ code: SITE_LOGIN_REQUIRED });
    await expect(site({ lands: [READY], answer: () => html }).supplier.purchaseOrderListPage(QUERY, 2)).rejects.toMatchObject({ code: SITE_REQUEST_FAILED });
    await expect(site({ lands: [READY], answer: () => json({ body: { lastPageNumber: 1 } }) }).supplier.purchaseOrderListPage(QUERY, 1))
      .rejects.toMatchObject({ code: SITE_REQUEST_FAILED, details: { reason: 'response_invalid' } });
    await expect(site({ lands: [READY], answer: () => ({ ok: false, error: 'TypeError: Failed to fetch' }) }).supplier.purchaseOrderListPage(QUERY, 1))
      .rejects.toMatchObject({ code: SITE_LOGIN_REQUIRED });
  });

  it('상세는 표를 그대로 돌려주고, 표 없는 로그인 화면은 로그인 필요, 2xx 아님은 요청 실패', async () => {
    const tables = [pageTable({ body: [['1', 'P-1']] })];
    await expect(site({ lands: [READY], answer: () => bridgeAnswer(tables) }).supplier.purchaseOrderDetail('123')).resolves.toEqual(tables);
    await expect(site({ lands: [READY], answer: () => bridgeAnswer([], { text: '<html>세션 만료</html>' }) }).supplier.purchaseOrderDetail('123'))
      .rejects.toMatchObject({ code: SITE_LOGIN_REQUIRED });
    await expect(site({ lands: [READY], answer: () => ({ ...bridgeAnswer(tables), status: 500 }) }).supplier.purchaseOrderDetail('123'))
      .rejects.toMatchObject({ code: SITE_REQUEST_FAILED });
  });

  it('직배송: 센터 목록은 JSON으로 읽고, 품목 전에 탭을 첫 발주서 상세(/scm)로 옮긴다', async () => {
    const { fake, supplier } = site({ lands: [READY, 'https://supplier.coupang.com/scm/purchase/order/get/101'], answer: () => json({ body: [{ centerName: 'Seoul FC' }] }) });
    await expect(supplier.purchasableCenters()).resolves.toEqual({ body: [{ centerName: 'Seoul FC' }] });
    await supplier.enterScmContext('101');
    expect(fake.log.filter((line) => line.startsWith('navigate'))).toEqual([
      `navigate ${PO_BOOTSTRAP_URL}`,
      'navigate https://supplier.coupang.com/scm/purchase/order/get/101',
    ]);
    await expect(site({ lands: [READY], answer: () => bridgeAnswer([], { text: '<html></html>' }) }).supplier.purchasableCenters())
      .rejects.toMatchObject({ code: SITE_REQUEST_FAILED });
  });
});
