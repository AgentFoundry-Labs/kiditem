import { describe, expect, it } from 'vitest';
import { createSiteCaller, type SiteCallerDeps } from '../../core/site-caller';
import { RuntimeError } from '../../core/errors';
import { WING_SITE, createWingSite } from './index';

const SEARCH = 'https://wing.coupang.com/tenants/seller-web/v2/vendor-inventory/search';
const DETAIL = 'https://wing.coupang.com/tenants/seller-web/v2/vendor-inventory/seller-product/';

type Handler = (url: string, init: RequestInit | undefined) => Response | Promise<Response>;

/** 가짜 fetch·쿠키·시계. Wing 경계만 가짜다. */
function fakeWing(handler: Handler, cookie: string | null = 'xsrf%3Dtoken') {
  let clock = 1_000_000;
  const sent: Array<{ url: string; at: number; method: string; body: unknown; xsrf: string | null }> = [];
  const sleeps: number[] = [];
  const deps: SiteCallerDeps = {
    async fetch(input, init) {
      const url = String(input);
      sent.push({
        url,
        at: clock,
        method: init?.method ?? 'GET',
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
        xsrf: new Headers(init?.headers).get('X-XSRF-TOKEN'),
      });
      return handler(url, init);
    },
    cookies: { async get() { return cookie === null ? null : { value: cookie }; } },
    now: () => clock,
    async sleep(ms) {
      sleeps.push(ms);
      clock += ms;
    },
  };
  const site = createWingSite(createSiteCaller(WING_SITE.caller, deps), { sleep: deps.sleep });
  return { site, sent, sleeps };
}

const searchResponse = (rows: Array<Record<string, unknown>>, totalCount = rows.length) => Response.json({
  data: {
    productList: rows,
    pagination: { page: 1, countPerPage: 500, totalCount, totalPages: totalCount === 0 ? 0 : Math.ceil(totalCount / 500) },
  },
});
const listRow = (id: number, overrides: Record<string, unknown> = {}) => ({
  vendorInventoryId: id,
  vendorId: 'A1',
  productName: `상품 ${id}`,
  productStatus: 'ON_SALE',
  vendorInventoryItems: [{ vendorInventoryItemId: id * 10, vendorItemId: null }],
  ...overrides,
});

async function rejection(promise: Promise<unknown>): Promise<RuntimeError> {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  expect(error).toBeInstanceOf(RuntimeError);
  return error as RuntimeError;
}

describe('sites/wing', () => {
  it('정의: wing.coupang.com 탭, 요청 사이 2초, XSRF-TOKEN 쿠키 → X-XSRF-TOKEN 헤더, 로그인 문장은 쿠팡 윙', () => {
    expect(WING_SITE).toEqual({
      name: 'wing',
      origin: 'https://wing.coupang.com',
      caller: {
        minIntervalMs: 2_000,
        timeoutMs: 30_000,
        displayName: '쿠팡 윙',
        xsrf: { cookieUrl: 'https://wing.coupang.com', cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' },
      },
    });
  });

  it('searchInventory는 목록 검색을 POST하고(XSRF·2초 간격) 페이지를 목록 원소로 바꾼다', async () => {
    const wing = fakeWing(() => searchResponse([listRow(1)]));
    await expect(wing.site.searchInventory(1, 'A1')).resolves.toMatchObject({ totalItems: 1, totalPages: 1, products: [{ externalProductId: '1' }] });
    await wing.site.searchInventory(1, 'A1');
    expect(wing.sent.map(({ url, method, xsrf }) => [url, method, xsrf])).toEqual([[SEARCH, 'POST', 'xsrf=token'], [SEARCH, 'POST', 'xsrf=token']]);
    expect(wing.sent[0]!.body).toMatchObject({ page: 1, countPerPage: 500, displayDeletedProduct: false });
    expect(wing.sent[1]!.at - wing.sent[0]!.at).toBe(2_000);
  });

  it('목록 페이지가 pagination과 맞지 않으면 CATALOG_LIST_INCOMPLETE', async () => {
    const error = await rejection(fakeWing(() => searchResponse([listRow(1)], 2)).site.searchInventory(1, 'A1'));
    expect(error.code).toBe('CATALOG_LIST_INCOMPLETE');
  });

  it('로그인 판정은 응답으로: XSRF 쿠키가 없어도 목록은 읽고, 401이면 "쿠팡 윙 로그인이 필요합니다."로 멈춘다', async () => {
    await expect(fakeWing(() => searchResponse([]), null).site.searchInventory(1, null)).resolves.toMatchObject({ totalItems: 0 });
    const unauthorized = await rejection(fakeWing(() => new Response('', { status: 401 })).site.productDetail('7'));
    expect([unauthorized.code, unauthorized.message]).toEqual(['SITE_LOGIN_REQUIRED', '쿠팡 윙 로그인이 필요합니다.']);
  });

  it('엑셀 생성 요청은 XSRF가 없으면 보내지 않는다', async () => {
    const wing = fakeWing((url) => url === SEARCH ? searchResponse([listRow(1)]) : Response.json({ success: true, message: null }), null);
    const error = await rejection(wing.site.requestCatalogExcel('kiditem_3'));
    expect(error.code).toBe('SITE_LOGIN_REQUIRED');
    expect(wing.sent.map(({ url }) => url)).toEqual([SEARCH]);
  });

  it('productDetail은 상세 JSON을 상세 원소로 바꾸고, 없으면(404) null, 일시 오류는 2초·6초 뒤 다시 묻는다', async () => {
    const detail = { sellerProductId: 7, items: [{ sellerProductItemId: 70, vendorItemId: null }] };
    let calls = 0;
    const wing = fakeWing((url) => {
      calls += 1;
      if (url === `${DETAIL}404`) return new Response('', { status: 404 });
      return calls <= 2 ? new Response('', { status: 503 }) : Response.json(detail);
    });
    await expect(wing.site.productDetail('7')).resolves.toMatchObject({ externalProductId: '7', options: [{ externalOptionId: '70' }] });
    expect(wing.sent.map(({ url }) => url)).toEqual([`${DETAIL}7`, `${DETAIL}7`, `${DETAIL}7`]);
    expect(wing.sleeps.filter((ms) => ms === 2_000 || ms === 6_000)).toEqual([2_000, 6_000]);
    await expect(wing.site.productDetail('404')).resolves.toBeNull();
  });

  it('productDetail은 JSON이 아닌 응답(봇·레이트 페이지)을 2초 뒤 다시 묻고, 그 응답이 JSON이면 정상 진행한다', async () => {
    let calls = 0;
    const wing = fakeWing(() => {
      calls += 1;
      return calls === 1
        ? new Response('<html><body>잠시 후 다시 시도해 주세요</body></html>', { status: 200 })
        : Response.json({ sellerProductId: 7, items: [{ sellerProductItemId: 70 }] });
    });
    await expect(wing.site.productDetail('7')).resolves.toMatchObject({ externalProductId: '7' });
    expect(wing.sent).toHaveLength(2);
    expect(wing.sleeps).toEqual([2_000]);
  });

  it('productDetail은 두 번 다시 물어도(2초·6초) JSON이 아니면 status·bodyHead를 싣고 SITE_REQUEST_FAILED로 넘긴다', async () => {
    const wing = fakeWing(() => new Response('<html>  blocked  </html>', { status: 200 }));
    const error = await rejection(wing.site.productDetail('7'));
    expect(error.code).toBe('SITE_REQUEST_FAILED');
    expect(error.details).toMatchObject({ status: 200, reason: 'not_json', bodyHead: '<html> blocked </html>' });
    expect(wing.sent).toHaveLength(3);
    expect(wing.sleeps).toEqual([2_000, 6_000]);
  });

  it.each([
    ['429', () => new Response('too many', { status: 429 })],
    ['연결 오류', () => Promise.reject(new TypeError('Failed to fetch'))],
  ])('productDetail은 %s도 다시 묻는다', async (_label, failure) => {
    let calls = 0;
    const wing = fakeWing(() => {
      calls += 1;
      return calls === 1 ? failure() : Response.json({ sellerProductId: 7, items: [{ sellerProductItemId: 70 }] });
    });
    await expect(wing.site.productDetail('7')).resolves.toMatchObject({ externalProductId: '7' });
    expect(wing.sleeps).toEqual([2_000]);
  });

  it('로그인 판정(401·403)은 다시 묻지 않고 바로 SITE_LOGIN_REQUIRED', async () => {
    for (const status of [401, 403]) {
      const wing = fakeWing(() => new Response('', { status }));
      expect((await rejection(wing.site.productDetail('7'))).code).toBe('SITE_LOGIN_REQUIRED');
      expect(wing.sent).toHaveLength(1);
      expect(wing.sleeps).toEqual([]);
    }
  });

  it('searchInventory도 JSON이 아니거나 5xx면 2초·6초 뒤 다시 묻고, 그래도 안 되면 실패로 넘긴다', async () => {
    let calls = 0;
    const recovering = fakeWing(() => {
      calls += 1;
      return calls === 1 ? new Response('<html>busy</html>', { status: 200 }) : searchResponse([listRow(1)]);
    });
    await expect(recovering.site.searchInventory(1, 'A1')).resolves.toMatchObject({ totalItems: 1 });
    expect(recovering.sleeps).toEqual([2_000]);

    const failing = fakeWing(() => new Response('gateway', { status: 502 }));
    const error = await rejection(failing.site.searchInventory(1, 'A1'));
    expect(error.code).toBe('SITE_REQUEST_FAILED');
    expect(error.details).toMatchObject({ status: 502, reason: 'http', bodyHead: 'gateway' });
    expect(failing.sent).toHaveLength(3);
    expect(failing.sleeps).toEqual([2_000, 6_000]);
  });

  it('probeDeleted의 검색도 JSON이 아니면 다시 묻는다', async () => {
    let calls = 0;
    const wing = fakeWing(() => {
      calls += 1;
      return calls === 1 ? new Response('<html>busy</html>', { status: 200 }) : searchResponse([listRow(1, { productStatus: 'DELETED' })]);
    });
    await expect(wing.site.probeDeleted(['1'])).resolves.toEqual([{ externalProductId: '1', outcome: 'deleted', productStatus: 'DELETED' }]);
    expect(wing.sent).toHaveLength(2);
    expect(wing.sleeps).toEqual([2_000]);
  });

  it('productDetail은 다른 상품의 상세를 받으면 멈춘다', async () => {
    const error = await rejection(fakeWing(() => Response.json({ sellerProductId: 8, items: [{ sellerProductItemId: 80 }] })).site.productDetail('7'));
    expect(error.code).toBe('WING_CATALOG_PAYLOAD_INVALID');
  });

  it('probeDeleted: PRODUCT_ID 검색 두 번 — 삭제 상품 검색에 나오면 deleted, 일반 검색에 나오면 present, 둘 다 없으면 not_found', async () => {
    const wing = fakeWing((_url, init) => {
      const body = JSON.parse(String(init?.body));
      return body.displayDeletedProduct
        ? searchResponse([listRow(1, { productStatus: 'DELETED' })])
        : searchResponse([listRow(2)]);
    });
    await expect(wing.site.probeDeleted(['1', '2', '3'])).resolves.toEqual([
      { externalProductId: '1', outcome: 'deleted', productStatus: 'DELETED' },
      { externalProductId: '2', outcome: 'present', productStatus: null },
      { externalProductId: '3', outcome: 'not_found', productStatus: null },
    ]);
    expect(wing.sent.map(({ body }) => body)).toEqual([
      expect.objectContaining({ searchKeywordType: 'PRODUCT_ID', searchKeywords: '1,2,3', displayDeletedProduct: true }),
      expect.objectContaining({ searchKeywordType: 'PRODUCT_ID', searchKeywords: '2,3', displayDeletedProduct: false }),
    ]);
  });

  it('probeDeleted는 삭제 검색에 나와도 productStatus가 DELETED가 아니면 삭제로 보지 않는다(검색 조건이 바뀐 경우 방어)', async () => {
    const wing = fakeWing((_url, init) => {
      const body = JSON.parse(String(init?.body));
      return body.displayDeletedProduct ? searchResponse([listRow(1, { productStatus: 'ON_SALE' })]) : searchResponse([]);
    });
    await expect(wing.site.probeDeleted(['1'])).resolves.toEqual([{ externalProductId: '1', outcome: 'present', productStatus: null }]);
  });

  it('probeDeleted는 모두 삭제로 확인되면 두 번째 검색을 하지 않는다', async () => {
    const wing = fakeWing(() => searchResponse([listRow(1, { productStatus: 'DELETED' })]));
    await expect(wing.site.probeDeleted(['1'])).resolves.toEqual([{ externalProductId: '1', outcome: 'deleted', productStatus: 'DELETED' }]);
    expect(wing.sent).toHaveLength(1);
  });

  it('엑셀: 전체 수를 확인해 EDITABLE_CATALOGUE 생성을 요청하고, 다운로드 목록에서 그 요청을 찾아 파일을 받는다', async () => {
    const wing = fakeWing((url) => {
      if (url === SEARCH) return searchResponse([listRow(1)], 1260);
      if (url.endsWith('/excel/request/download/create/vendor-inventory/all')) return Response.json({ success: true, message: null });
      if (url.includes('/excel/request/download/list')) {
        return Response.json({ result: [
          { sellerRequestDownloadExcelId: 1, fileDescription: 'other', status: 'COMPLETED', executeCount: 1, totalCount: 1, isAbort: 'N' },
          { sellerRequestDownloadExcelId: 5192765, fileDescription: 'kiditem_1', status: 'CREATING', executeCount: 500, totalCount: 1260, isAbort: 'N' },
        ] });
      }
      if (url.includes('/excel/request/download/file')) return new Response(new Uint8Array([9, 8, 7]));
      return new Response('', { status: 500 });
    });
    // 전체 수 확인은 1페이지 행 수가 모자라도 된다(수만 읽는다).
    await wing.site.requestCatalogExcel('kiditem_1');
    expect(wing.sent[1]).toMatchObject({
      url: 'https://wing.coupang.com/tenants/seller-web/excel/request/download/create/vendor-inventory/all',
      method: 'POST',
      xsrf: 'xsrf=token',
      body: {
        requestType: 'EDITABLE_CATALOGUE',
        fileDescription: 'kiditem_1',
        selectedTypes: ['DISPLAY_PRODUCT_NAME', 'MANUFACTURE', 'BRAND', 'SEARCH_TAG', 'ADULT_ONLY', 'EXPOSE_ATTRIBUTE', 'NON_EXPOSE_ATTRIBUTE', 'MODEL_NO', 'BARCODE'],
        searchCondition: expect.objectContaining({ totalCount: 1260, displayDeletedProduct: false }),
      },
    });
    await expect(wing.site.catalogExcelRequest('kiditem_1')).resolves.toEqual({ id: '5192765', status: 'CREATING', executeCount: 500, totalCount: 1260 });
    await expect(wing.site.catalogExcelRequest('missing')).resolves.toBeNull();
    await expect(wing.site.downloadCatalogExcel('5192765')).resolves.toEqual(new Uint8Array([9, 8, 7]));
    expect(wing.sent.at(-1)!.url).toBe('https://wing.coupang.com/tenants/seller-web/excel/request/download/file?requestType=EDITABLE_CATALOGUE&sellerRequestDownloadExcelId=5192765&sellerRequestDownloadExcelFileId=');
  });

  it('엑셀 생성 요청을 Wing이 거절하면 CATALOG_EXCEL_FAILED', async () => {
    const wing = fakeWing((url) => url === SEARCH ? searchResponse([listRow(1)]) : Response.json({ success: false, message: '이미 요청 중입니다' }));
    const error = await rejection(wing.site.requestCatalogExcel('kiditem_2'));
    expect([error.code, error.message]).toEqual(['CATALOG_EXCEL_FAILED', '쿠팡 윙이 상품정보 엑셀 생성을 거절했습니다: 이미 요청 중입니다']);
  });
});
