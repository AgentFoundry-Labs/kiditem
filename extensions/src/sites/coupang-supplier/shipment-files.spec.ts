import { describe, expect, it } from 'vitest';
import { fastClock } from '../login.fake';
import { fakeTabPages } from '../tab-page.fake';
import { createCoupangSupplierSite } from './index';
import { SITE_COOKIE_BLOAT } from './page';
import { openShipmentPage, shipmentPdfPath } from './shipment-files';
import { COUPANG_SHIPMENT_URL } from './shipments';

function site(answer: (message: Record<string, unknown>) => unknown) {
  const fake = fakeTabPages({ answer: (message, injected) => (injected ? answer(message) : { ok: false, error: 'content_script_missing' }) });
  return { fake, supplier: createCoupangSupplierSite({ tabs: fake.tabs, ...fastClock() }) };
}

describe('쉽먼트 Label·내역서 PDF(KID-366 fetchCoupangShipmentPdfBatch)', () => {
  it('쉽먼트 탭 하나에서 같은 출처 PDF를 차례로 받아 base64로 돌려주고, 끝나면 연 탭을 닫는다', async () => {
    const asked: unknown[] = [];
    const { fake, supplier } = site((message) => {
      asked.push(message);
      return String(message.url).includes('404')
        ? { ok: true, status: 404, pdf: false, bytes: 0, b64: null }
        : String(message.url).includes('html')
          ? { ok: true, status: 200, pdf: false, bytes: 10, b64: null }
          : { ok: true, status: 200, pdf: true, bytes: 5, b64: 'JVBERi0=' };
    });
    await expect(supplier.shipmentPdf('48835181', 'label')).resolves.toEqual({ seq: '48835181', kind: 'label', ok: true, b64: 'JVBERi0=', bytes: 5, error: null });
    await expect(supplier.shipmentPdf('404', 'manifest')).resolves.toEqual({ seq: '404', kind: 'manifest', ok: false, b64: null, bytes: null, error: 'HTTP 404' });
    await expect(supplier.shipmentPdf('html', 'label')).resolves.toMatchObject({ ok: false, error: 'not_pdf' });
    await supplier.close();
    expect(asked[0]).toEqual({ type: 'KIDITEM_COUPANG_SUPPLIER_FETCH_PDF', url: '/ibs/shipment/parcel/pdf-label/generate?parcelShipmentSeq=48835181' });
    expect(shipmentPdfPath('9', 'manifest')).toBe('/ibs/shipment/parcel/pdf-manifest/generate?parcelShipmentSeq=9');
    expect(fake.log.filter((line) => !line.startsWith('ask'))).toEqual([
      'open about:blank',
      `navigate ${COUPANG_SHIPMENT_URL} (continue on timeout)`,
      'inject content/orders/coupang-supplier-page.js',
      'close 7',
    ]);
  });

  it('쿠키 과다(400·413·431)는 한 장 실패가 아니라 SITE_COOKIE_BLOAT로 멈춘다', async () => {
    for (const status of [400, 413, 431]) {
      const { supplier } = site(() => ({ ok: true, status, pdf: false, bytes: 0, b64: null }));
      await expect(supplier.shipmentPdf('1', 'label')).rejects.toMatchObject({ code: SITE_COOKIE_BLOAT });
    }
  });

  it('탭이 로그인 화면으로 가 있으면 SITE_LOGIN_REQUIRED로 멈추고 탭을 앞으로 가져와 운영자에게 넘긴다(닫지 않는다)', async () => {
    const fake = fakeTabPages({ landAt: () => 'https://xauth.coupang.com/auth/realms/seller/login', answer: () => ({ ok: true }), logBookkeeping: true });
    const supplier = createCoupangSupplierSite({ tabs: fake.tabs, ...fastClock() });
    await expect(supplier.shipmentPdf('1', 'label')).rejects.toMatchObject({ code: 'SITE_LOGIN_REQUIRED' });
    await supplier.close();
    expect(fake.log.some((line) => line.startsWith('close'))).toBe(false);
    expect(fake.log.slice(-2)).toEqual(['keep for https://supplier.coupang.com 7', 'focus 7']);
  });

  it('다음 호출은 운영자에게 남긴 공급사 탭을 다시 쓴다(숨은 탭이 쌓이지 않게)', async () => {
    let signedIn = false;
    const fake = fakeTabPages({
      landAt: (url) => (signedIn ? url : 'https://xauth.coupang.com/auth/realms/seller/login'),
      answer: (_message, injected) => (injected ? { ok: true, status: 200, pdf: true, bytes: 5, b64: 'JVBERi0=' } : { ok: false, error: 'content_script_missing' }),
      logBookkeeping: true,
    });
    const first = createCoupangSupplierSite({ tabs: fake.tabs, ...fastClock() });
    await expect(first.shipmentPdf('1', 'label')).rejects.toMatchObject({ code: 'SITE_LOGIN_REQUIRED' });
    await first.close();
    signedIn = true;
    const second = createCoupangSupplierSite({ tabs: fake.tabs, ...fastClock() });
    await expect(second.shipmentPdf('1', 'label')).resolves.toMatchObject({ ok: true });
    await second.close();
    expect(fake.log.filter((line) => line.startsWith('open'))).toEqual(['open about:blank']);
    expect(fake.log).toContain('reclaim https://supplier.coupang.com 7');
  });
});

describe('쉽먼트 화면 열기(KID-366 openCoupangShipmentPage) — 운영자에게 넘기는 탭은 앞으로', () => {
  it('열린 쉽먼트 탭이 있으면 옮기지 않고 앞으로 가져온다', async () => {
    const fake = fakeTabPages({ answer: () => ({}), existingTab: (pattern) => (pattern.startsWith(COUPANG_SHIPMENT_URL) ? 41 : null), currentUrl: COUPANG_SHIPMENT_URL });
    await expect(openShipmentPage(fake.tabs, COUPANG_SHIPMENT_URL)).resolves.toEqual({ tabId: 41, url: COUPANG_SHIPMENT_URL });
    expect(fake.log).toEqual([`find ${COUPANG_SHIPMENT_URL}*`, 'focus 41']);
  });

  it('다른 공급사 탭이 있으면 그 탭을 쉽먼트 화면으로 옮기고, 없으면 새 탭을 연다', async () => {
    const other = fakeTabPages({ answer: () => ({}), existingTab: (pattern) => (pattern === 'https://supplier.coupang.com/*' ? 42 : null) });
    await expect(openShipmentPage(other.tabs, COUPANG_SHIPMENT_URL)).resolves.toMatchObject({ tabId: 42 });
    expect(other.log).toEqual([`find ${COUPANG_SHIPMENT_URL}*`, 'find https://supplier.coupang.com/*', `navigate ${COUPANG_SHIPMENT_URL} (continue on timeout)`, 'focus 42']);
    const none = fakeTabPages({ answer: () => ({}) });
    await expect(openShipmentPage(none.tabs, COUPANG_SHIPMENT_URL)).resolves.toMatchObject({ tabId: 7 });
    expect(none.log.slice(2)).toEqual(['open about:blank', `navigate ${COUPANG_SHIPMENT_URL} (continue on timeout)`, 'focus 7']);
  });

  it('공급사 밖 주소는 열지 않는다', async () => {
    const fake = fakeTabPages({ answer: () => ({}) });
    await expect(openShipmentPage(fake.tabs, 'https://evil.test/ibs/asn/active')).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(fake.log).toEqual([]);
  });
});
