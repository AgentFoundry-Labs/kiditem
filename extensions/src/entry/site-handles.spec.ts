import { describe, expect, it } from 'vitest';
import { entrySites, createSiteHandles, ownTabSites } from './site-handles';
import '../collectors/advertising.wing_itemwinner';
import '../collectors/advertising.wing_traffic';
import '../collectors/channels.wing_catalog_details';
import '../collectors/channels.wing_catalog_excel';
import '../collectors/channels.wing_catalog_list';
import '../collectors/orders.coupang_reviews';
import '../collectors/orders.mall_orders';
import '../collectors/orders.sellpia_shipment_tracking';
import '../collectors/sourcing.product_extension';
import '../collectors/sourcing.trend_1688';
import '../collectors/sourcing.wing_catalog';
import '../collectors/test.echo';
import '../sites/1688';
import '../sites/art09';
import '../sites/domeggook';
import '../sites/icecream-mall';
import '../sites/kidkids';
import '../sites/mall-orders';
import '../sites/product-page';
import '../sites/sellpia';
import '../sites/wing';
import '../sites/wing/itemwinner';
import '../sites/wing/pre-matching-search';
import '../sites/wing/reviews';
import '../sites/wing/traffic';
import { wingCatalogDetailsCollector, type WingCatalogDetailsSite } from '../collectors/channels.wing_catalog_details';
import { PRODUCT_TAB_REQUIRED } from '../sites/product-page';
import type { TabPages } from '../sites/tab-page';

describe('entry/site-handles — 수집기가 선언한 사이트 이름으로 등록표에서 핸들을 조립한다', () => {
  const tabs: TabPages = {
    open: async () => { throw new Error('no tabs'); },
    attach: () => { throw new Error('no tabs'); },
    fetchText: async () => null,
  };
  const deps = {
    fetch: async () => Response.json({}),
    cookies: { get: async () => null },
    now: () => 0,
    sleep: async () => undefined,
    tabs,
    randomId: () => 'id',
  };
  const keys = (handle: unknown) => Object.keys(handle as Record<string, unknown>).sort();
  const WING_KEYS = ['catalogExcelRequest', 'downloadCatalogExcel', 'pause', 'probeDeleted', 'productDetail', 'requestCatalogExcel', 'searchInventory'];

  it('Wing 카탈로그 kind 셋에는 Wing 사이트(목록·상세·엑셀 API)를 준다', () => {
    const siteFor = createSiteHandles(deps);
    for (const kind of ['channels.wing_catalog_list', 'channels.wing_catalog_details', 'channels.wing_catalog_excel'] as const) {
      expect(keys(siteFor(kind, { tabId: 3 }))).toEqual(WING_KEYS);
    }
  });

  it('셀피아 송장 kind에는 송장 조회만 가진 sellpia 핸들을 주고, 셀피아는 탭을 스스로 열어 브라우저 자원 표에 없다', () => {
    expect(keys(createSiteHandles(deps)('orders.sellpia_shipment_tracking', { tabId: null }))).toEqual(['shipmentTracking']);
    expect(entrySites()).not.toHaveProperty('sellpia');
  });

  it('몰 주문 kind에는 몰 키로 그 몰 사이트를 찾는 라우터를 주고, 라우터는 탭을 스스로 여는 사이트다', () => {
    const handle = createSiteHandles(deps)('orders.mall_orders', { tabId: null }) as { reader(mallKey: string): unknown };
    expect(keys(handle)).toEqual(['reader']);
    expect(keys(handle.reader('kidkids'))).toEqual(['readOrders']);
    expect(keys(handle.reader('art09'))).toEqual(['readOrders']);
    expect(keys(handle.reader('domeggook'))).toEqual(['readOrders']);
    expect(keys(handle.reader('icecream-mall'))).toEqual(['readOrders']);
    expect(handle.reader('no-such-mall')).toBeNull();
    expect(handle.reader('mall-orders')).toBeNull();
    // 등록된 사이트라도 몰 주문 kind로 옮긴 몰이 아니면 주지 않는다(리뷰 S9).
    expect(handle.reader('sellpia')).toBeNull();
    expect(handle.reader('wing')).toBeNull();
    expect(ownTabSites().has('mall-orders')).toBe(true);
  });

  it('아이템위너 kind에는 목록 읽기만 가진 wing-itemwinner 핸들을 준다(KID-362)', () => {
    expect(keys(createSiteHandles(deps)('advertising.wing_itemwinner', { tabId: null }))).toEqual(['readItemwinnerList', 'readVendorId']);
  });

  it('트래픽 kind에는 공개 기간·상세 쪽·요약 읽기를 가진 wing-traffic 핸들을 준다(KID-362)', () => {
    expect(keys(createSiteHandles(deps)('advertising.wing_traffic', { tabId: null }))).toEqual(['readDetailPage', 'readFreshness', 'readSummary', 'readVendorId']);
  });

  it('상품평 kind에는 상품평 검색만 가진 wing-reviews 핸들을 준다', () => {
    expect(keys(createSiteHandles(deps)('orders.coupang_reviews', { tabId: null }))).toEqual(['searchReviews']);
  });

  // wave1 머지 회귀(2026-09-26): 소싱 Wing 검색 kind가 채널 카탈로그 사이트 핸들로 라우팅돼 `site.searchPage is not a function`.
  it('소싱 Wing 검색 kind는 같은 윙이라도 카탈로그가 아닌 상품등록 검색 핸들을 받는다', () => {
    expect(createSiteHandles(deps)('sourcing.wing_catalog', { tabId: 5 })).toMatchObject({
      searchPage: expect.any(Function),
      toObservation: expect.any(Function),
    });
    expect(createSiteHandles(deps)('sourcing.trend_1688', { tabId: null })).toMatchObject({ offers: expect.any(Function), close: expect.any(Function) });
  });

  it('상품 확장은 탭이 묶이면 상품 페이지 사이트를, 탭이 없으면 PRODUCT_TAB_REQUIRED로 멈추는 핸들을 준다', async () => {
    const siteFor = createSiteHandles(deps);
    expect(siteFor('sourcing.product_extension', { tabId: 9 })).toMatchObject({ extract: expect.any(Function) });
    const withoutTab = siteFor('sourcing.product_extension', { tabId: null }) as { extract(url: string): Promise<unknown> };
    await expect(withoutTab.extract('https://detail.1688.com/offer/1.html')).rejects.toMatchObject({ code: PRODUCT_TAB_REQUIRED });
  });

  it('사이트 없는 kind와 모르는 kind에는 null을 준다', () => {
    const siteFor = createSiteHandles(deps);
    expect(siteFor('test.echo', { tabId: null })).toBeNull();
    expect(siteFor('unknown.kind' as never, { tabId: null })).toBeNull();
  });

  it('브라우저 자원에 넘길 사이트 표는 origin을 둔 윙 사이트들이다', () => {
    expect(entrySites()).toEqual({
      wing: { origin: 'https://wing.coupang.com' },
      'wing-itemwinner': { origin: 'https://wing.coupang.com' },
      'wing-reviews': { origin: 'https://wing.coupang.com' },
      'wing-traffic': { origin: 'https://wing.coupang.com' },
    });
  });

  describe('Wing 상세 수집 — 가짜 fetch로 사이트와 수집기를 함께', () => {
    const DETAIL = 'https://wing.coupang.com/tenants/seller-web/v2/vendor-inventory/seller-product/';

    function run(respond: (url: string) => Response) {
      let clock = 0;
      const sent: string[] = [];
      const sleeps: number[] = [];
      const siteFor = createSiteHandles({
        ...deps,
        fetch: async (url) => { sent.push(String(url)); return respond(String(url)); },
        cookies: { get: async () => ({ value: 'token' }) },
        now: () => clock,
        sleep: async (ms) => { sleeps.push(ms); clock += ms; },
      });
      const site = siteFor('channels.wing_catalog_details', { tabId: 1 }) as WingCatalogDetailsSite;
      const plan = { channelAccountId: '11111111-1111-4111-8111-111111111111', detailTargetProductIds: ['1', '2', '3'], absentProductIds: [] };
      const collected = (async () => {
        const chunks = [];
        for await (const chunk of wingCatalogDetailsCollector.collect(plan, site, { signal: new AbortController().signal, tabId: 1 })) chunks.push(chunk);
        return chunks;
      })();
      return { collected, sent, sleeps };
    }
    const detailOf = (id: string) => Response.json({ sellerProductId: Number(id), items: [{ sellerProductItemId: Number(id) * 10 }] });

    it('상세 한 건이 2초·6초 뒤에도 HTML이면 그 상품만 건너뛰고 나머지를 보낸다', async () => {
      const { collected, sent, sleeps } = run((url) => url === `${DETAIL}2`
        ? new Response('<html>\n  <title>잠시 후 다시</title></html>', { status: 200 })
        : detailOf(url.slice(DETAIL.length)));
      const chunks = await collected;
      expect(chunks.flatMap((chunk) => chunk.payload.map((item) => (item as { externalProductId: string }).externalProductId))).toEqual(['1', '3']);
      expect(chunks.at(-1)?.progress).toMatchObject({
        detailsDone: 2,
        detailsMissing: [{ externalProductId: '2', reason: 'not_json', bodyHead: '<html> <title>잠시 후 다시</title></html>' }],
      });
      expect(sent.filter((url) => url === `${DETAIL}2`)).toHaveLength(3);
      expect(sleeps.filter((ms) => ms === 6_000)).toHaveLength(1);
    });

    it('로그인이 풀리면(401) 다시 묻지 않고 SITE_LOGIN_REQUIRED로 멈춘다', async () => {
      const { collected, sent } = run(() => new Response('', { status: 401 }));
      await expect(collected).rejects.toMatchObject({ code: 'SITE_LOGIN_REQUIRED' });
      expect(sent).toHaveLength(1);
    });
  });
});
