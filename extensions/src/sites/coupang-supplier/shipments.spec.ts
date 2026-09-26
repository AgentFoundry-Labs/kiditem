import { describe, expect, it } from 'vitest';
import { SITE_LOGIN_REQUIRED, SITE_REQUEST_FAILED } from '../../core/site-caller';
import { fastClock } from '../login.fake';
import { fakeTabPages } from '../tab-page.fake';
import { createCoupangSupplierSite } from './index';
import { SITE_COOKIE_BLOAT } from './page';
import { bridgeAnswer, pageTable } from './table.fake';
import { COUPANG_SHIPMENT_URL, parcelListPath } from './shipments';

// 기록한 supplier 응답(옛 order-collector-coupang-shipment-summary 테스트의 표) — 다리가 펴 준 칸.
const PARCEL_HEAD = ['쉽먼트 번호', '쉽먼트 상태', '발주서', '송장 번호', '발송일', '입고예정일', '센터', '박스수', '총 납품 수량'];
const parcel = (body: string[][] = []) => [pageTable({ id: 'parcel-tab', head: PARCEL_HEAD, body })];
const TWO_ROWS = parcel([
  ['48835181', '발송 완료', '137710750', '576997172825', '2026-07-24 15:02', '2026-07-25', 'MINC34', '1 박스', '8 개'],
  ['48813091', '발송 가능', '136053848', '699270964102', '2026-07-27 14:34', '2026-07-28', '동탄1', '3 박스', '36 개'],
]);

function site(answer: (message: Record<string, unknown>) => unknown) {
  const fake = fakeTabPages({
    answer: (message, injected) => (injected ? answer(message) : { ok: false, error: 'content_script_missing' }),
  });
  return { fake, supplier: createCoupangSupplierSite({ tabs: fake.tabs, ...fastClock() }) };
}

describe('coupang-supplier 쉽먼트 목록(KID-359)', () => {
  it('백그라운드 탭 하나를 쉽먼트 화면으로 열고, 다리를 한 번 주입해 쪽마다 같은 출처 목록을 XHR 머리로 읽는다', async () => {
    const asked: unknown[] = [];
    const { fake, supplier } = site((message) => {
      asked.push(message);
      return bridgeAnswer(TWO_ROWS);
    });
    await expect(supplier.parcelPage(1)).resolves.toEqual([
      { seq: '48835181', outbound: '2026-07-24 15:02', boxes: '1 박스' },
      { seq: '48813091', outbound: '2026-07-27 14:34', boxes: '3 박스' },
    ]);
    await supplier.parcelPage(2);
    await supplier.close();
    expect(asked[0]).toEqual({ type: 'KIDITEM_COUPANG_SUPPLIER_FETCH', url: parcelListPath(1), headers: { 'X-Requested-With': 'XMLHttpRequest' }, tables: true });
    expect(fake.log.filter((line) => !line.startsWith('ask'))).toEqual([
      'open about:blank',
      `navigate ${COUPANG_SHIPMENT_URL} (continue on timeout)`,
      'inject content/orders/coupang-supplier-page.js',
      'close 7',
    ]);
  });

  it('머리만 있는 표는 빈 쪽이고, 한 칸짜리 안내 행은 건너뛴다', async () => {
    const { supplier } = site(() => bridgeAnswer(parcel([['조회된 데이터가 없습니다']])));
    await expect(supplier.parcelPage(1)).resolves.toEqual([]);
  });

  it('200 로그인 화면·401·403·로그인 주소로 튕김은 로그인 필요 — 탭은 운영자에게 남긴다', async () => {
    const cases = [
      bridgeAnswer([], { text: '<!doctype html><html><body><form>Supplier Hub 로그인</form></body></html>' }),
      { ...bridgeAnswer([]), status: 401 },
      { ...bridgeAnswer([]), status: 403 },
      bridgeAnswer(TWO_ROWS, { redirected: true, url: 'https://xauth.coupang.com/auth/realms/seller/login' }),
    ];
    for (const answer of cases) {
      const { fake, supplier } = site(() => answer);
      await expect(supplier.parcelPage(1)).rejects.toMatchObject({ code: SITE_LOGIN_REQUIRED });
      await supplier.close();
      expect(fake.log).not.toContain('close 7');
    }
  });

  it('400·413·431은 쿠키 과다, 표 머리가 다르면 형식 오류(빈 결과로 줄이지 않는다), 그 밖의 오류는 요청 실패', async () => {
    for (const status of [400, 413, 431]) {
      await expect(site(() => ({ ...bridgeAnswer([]), status })).supplier.parcelPage(1)).rejects.toMatchObject({ code: SITE_COOKIE_BLOAT });
    }
    await expect(site(() => bridgeAnswer([pageTable({ id: 'parcel-tab', head: ['알 수 없는 열'] })])).supplier.parcelPage(1))
      .rejects.toMatchObject({ code: SITE_REQUEST_FAILED, details: { reason: 'response_invalid' } });
    await expect(site(() => ({ ...bridgeAnswer([]), status: 500 })).supplier.parcelPage(3))
      .rejects.toMatchObject({ code: SITE_REQUEST_FAILED, details: { reason: 'http', status: 500 } });
    await expect(site(() => ({ ok: false, error: 'timeout' })).supplier.parcelPage(1))
      .rejects.toMatchObject({ code: SITE_REQUEST_FAILED, details: { reason: 'timeout' } });
  });
});
