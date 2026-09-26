import { describe, expect, it } from 'vitest';
import { SITE_LOGIN_REQUIRED } from '../../core/site-caller';
import { fakeLoginScreen, fastClock } from '../login.fake';
import { fakeTabPages } from '../tab-page.fake';
import { createCoupangSupplierSite } from './index';
import { COUPANG_SUPPLIER_LOGIN } from './page';
import { PO_BOOTSTRAP_URL } from './po';
import { COUPANG_SHIPMENT_URL } from './shipments';
import { bridgeAnswer, pageTable } from './table.fake';

const XAUTH = 'https://xauth.coupang.com/auth/realms/seller/protocol/openid-connect/auth?client_id=supplier';
const CREDENTIALS = { loginId: 'fake-rocket-id', password: 'fake-rocket-password' };
const PARCEL_HEAD = ['쉽먼트 번호', '쉽먼트 상태', '발주서', '송장 번호', '발송일', '입고예정일', '센터', '박스수', '총 납품 수량'];
const ROWS = [pageTable({ id: 'parcel-tab', head: PARCEL_HEAD, body: [['48835181', '발송 완료', '1', '2', '2026-07-24 15:02', '2026-07-25', 'MINC34', '1 박스', '8 개']] })];
const READY = 'https://supplier.coupang.com/po-web/purchase/order/list';

function supplierWith(login: ReturnType<typeof fakeLoginScreen>, options: { credentials?: typeof CREDENTIALS | null; leaseTab?: number; ready?: string } = {}) {
  const fake = fakeTabPages({
    landAt: (url) => (login.state.signedIn ? (url === PO_BOOTSTRAP_URL ? options.ready ?? READY : url) : login.landAt(url)),
    frames: login.frames,
    answer: (message, injected) => login.answer(message)
      ?? (injected ? (message.url === '/po-web/app/purchase-order/list?page=1&searchDateType=WAREHOUSING_PLAN_DATE&searchStartDate=2026-09-01&searchEndDate=2026-09-30&centerCode=&purchaseOrderIdArray=&vendorPaymentInfoSeq=&purchaseOrderStatus=&purchaseOrderType=&skuIdArray=&crossdock=&transportType='
        ? bridgeAnswer([], { text: JSON.stringify({ body: { body: [{ purchaseOrderSeq: 1 }], lastPageNumber: 1 } }) })
        : bridgeAnswer(ROWS))
        : { ok: false, error: 'content_script_missing' }),
  });
  const supplier = createCoupangSupplierSite(
    { tabs: fake.tabs, ...fastClock() },
    { tabId: options.leaseTab ?? null, credentials: options.credentials === undefined ? CREDENTIALS : options.credentials },
  );
  return { fake, supplier };
}

const QUERY = { searchDateType: 'WAREHOUSING_PLAN_DATE' as const, from: '2026-09-01', to: '2026-09-30', status: '' };

describe('coupang-supplier 자동 로그인(KID-377)', () => {
  it('로그인 입구는 로켓 계정의 아이디·비밀번호로 쿠팡 통합 로그인(xauth)에 들어간다(옛 coupang-direct 스펙)', () => {
    expect(COUPANG_SUPPLIER_LOGIN).toMatchObject({
      loginUrl: 'https://supplier.coupang.com/po-web/app/purchase-order/list',
      hosts: ['supplier.coupang.com', 'xauth.coupang.com'],
      fields: ['loginId', 'password'],
    });
    expect(COUPANG_SUPPLIER_LOGIN.isLoginUrl(new URL(XAUTH))).toBe(true);
    expect(COUPANG_SUPPLIER_LOGIN.isLoginUrl(new URL(READY))).toBe(false);
  });

  it('쉽먼트: 로그인 화면이면 같은 탭에서 로그인하고 쉽먼트 화면으로 다시 가서 읽은 뒤 탭을 닫는다', async () => {
    const login = fakeLoginScreen({ loginAt: XAUTH });
    const { fake, supplier } = supplierWith(login);
    await expect(supplier.parcelPage(1)).resolves.toEqual([{ seq: '48835181', outbound: '2026-07-24 15:02', boxes: '1 박스' }]);
    await supplier.close();
    expect(login.state.filled).toEqual([{ loginId: 'fake-rocket-id', password: 'fake-rocket-password' }]);
    expect(fake.log.filter((line) => line.startsWith('navigate') || line.startsWith('open') || line.startsWith('close'))).toEqual([
      'open about:blank',
      `navigate ${COUPANG_SHIPMENT_URL} (continue on timeout)`,
      `navigate ${COUPANG_SHIPMENT_URL} (continue on timeout)`,
      'close 7',
    ]);
  });

  it('쉽먼트: 자격이 없으면 로그인하지 않고 SITE_LOGIN_REQUIRED{no_credentials}, 탭은 운영자에게 남긴다', async () => {
    const login = fakeLoginScreen({ loginAt: XAUTH });
    const { fake, supplier } = supplierWith(login, { credentials: null });
    await expect(supplier.parcelPage(1)).rejects.toMatchObject({ code: SITE_LOGIN_REQUIRED, details: { reason: 'no_credentials' } });
    await supplier.close();
    expect(login.state.filled).toEqual([]);
    expect(fake.log).not.toContain('close 7');
  });

  it('발주: 잠금이 준 탭에서 로그인하고 PO 화면을 다시 준비한다', async () => {
    const login = fakeLoginScreen({ loginAt: XAUTH });
    const { fake, supplier } = supplierWith(login, { leaseTab: 5 });
    await expect(supplier.purchaseOrderListPage(QUERY, 1)).resolves.toEqual({ rows: [{ purchaseOrderSeq: 1 }], lastPageNumber: 1 });
    expect(login.state.filled).toHaveLength(1);
    expect(fake.log.filter((line) => line === `navigate ${PO_BOOTSTRAP_URL}`).length).toBeGreaterThanOrEqual(3);
    expect(fake.log.some((line) => line.startsWith('open'))).toBe(false);
  });

  it('발주: 눌렀는데 로그인 폼이 남으면 credentials_rejected와 몰의 말 — 한 실행에서 다시 두드리지 않는다', async () => {
    const login = fakeLoginScreen({ loginAt: XAUTH, accept: false, dialog: '아이디 또는 비밀번호가 일치하지 않습니다.' });
    const { supplier } = supplierWith(login, { leaseTab: 5 });
    await expect(supplier.purchaseOrderListPage(QUERY, 1)).rejects.toMatchObject({
      code: SITE_LOGIN_REQUIRED,
      details: { reason: 'credentials_rejected', mallMessage: '아이디 또는 비밀번호가 일치하지 않습니다.' },
    });
    await expect(supplier.purchaseOrderListPage(QUERY, 2)).rejects.toMatchObject({ code: SITE_LOGIN_REQUIRED });
    expect(login.state.filled).toHaveLength(1);
  });
});
