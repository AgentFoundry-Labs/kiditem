import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const collectorSource = fs.readFileSync(
  new URL('../kiditem-os/shared/coupang-catalog-collector.js', import.meta.url),
  'utf8',
);
const scraperSource = fs.readFileSync(
  new URL('../kiditem-os/content/coupang/wing-inventory-scraper.js', import.meta.url),
  'utf8',
);
const endpoint = 'https://wing.coupang.com/tenants/seller-web/v2/vendor-inventory/search';

function product(id, overrides = {}) {
  return {
    vendorInventoryId: id,
    vendorId: 'A00057379',
    productName: `상품 ${id}`,
    representativeImage: `vendor_inventory/${id}.jpg`,
    productStatus: 'ON_SALE',
    ...overrides,
  };
}

function payload(productList, {
  page = 1,
  countPerPage = 500,
  totalCount = productList.length,
  totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / countPerPage),
} = {}) {
  return {
    success: true,
    message: null,
    data: {
      productList,
      pagination: { page, countPerPage, totalCount, totalPages },
    },
  };
}

class TestAbortController {
  constructor() {
    const listeners = new Set();
    this.signal = {
      aborted: false,
      addEventListener(_type, listener) { listeners.add(listener); },
      removeEventListener(_type, listener) { listeners.delete(listener); },
    };
    this.abort = () => {
      if (this.signal.aborted) return;
      this.signal.aborted = true;
      for (const listener of listeners) listener();
    };
  }
}

function loadScraper({ response, document = {}, timeoutImmediately = false } = {}) {
  let listener;
  const calls = [];
  const timers = { scheduled: 0, cleared: 0 };
  const timerHandles = new Set();
  let nextTimerId = 1;
  function scheduleTimer(callback, delay) {
    timers.scheduled += 1;
    const timerId = nextTimerId++;
    timerHandles.add(timerId);
    if (timeoutImmediately) {
      const nativeTimer = globalThis.setTimeout(() => {
        if (!timerHandles.delete(timerId)) return;
        callback();
      }, 0);
      return { timerId, nativeTimer };
    }
    const nativeTimer = globalThis.setTimeout(() => {
      timerHandles.delete(timerId);
      callback();
    }, delay);
    return { timerId, nativeTimer };
  }
  function cancelTimer(handle) {
    timers.cleared += 1;
    if (!handle) return;
    if (typeof handle === 'number') {
      timerHandles.delete(handle);
      return;
    }
    timerHandles.delete(handle.timerId);
    globalThis.clearTimeout(handle.nativeTimer);
  }
  const context = vm.createContext({
    URL,
    console,
    AbortController: TestAbortController,
    setTimeout: scheduleTimer,
    clearTimeout: cancelTimer,
    document: {
      body: { innerText: '' },
      querySelector: () => null,
      querySelectorAll: () => [],
      ...document,
    },
    location: { href: 'https://wing.coupang.com/tenants/seller-web/vendor-inventory/list?page=1' },
    chrome: {
      runtime: {
        onMessage: { addListener(next) { listener = next; } },
      },
    },
    fetch: async (url, init) => {
      calls.push({ url, init });
      return typeof response === 'function' ? response(init) : response;
    },
  });
  vm.runInContext(collectorSource, context, { filename: 'coupang-catalog-collector.js' });
  vm.runInContext(scraperSource, context, { filename: 'wing-inventory-scraper.js' });
  assert.equal(typeof listener, 'function');
  return {
    calls,
    timers,
    async send(message) {
      return new Promise((resolve) => {
        assert.equal(listener(message, {}, resolve), true);
      });
    },
  };
}

function jsonResponse(value, { status = 200, ok = true, type = 'basic', contentType = 'application/json' } = {}) {
  return {
    status,
    ok,
    type,
    headers: { get(name) { return name === 'content-type' ? contentType : null; } },
    text: async () => typeof value === 'string' ? value : JSON.stringify(value),
  };
}

test('forwards the explicit page through the exact cookie-bound Wing search request', async () => {
  const page = loadScraper({
    response: jsonResponse(payload([
      product(301, { productName: '  상품   301\n 테스트  ' }),
    ], { page: 3, totalCount: 1001 })),
  });
  const response = await page.send({
    action: 'collectCoupangCatalogDiscoveryPage',
    page: 3,
    expectedVendorId: 'A00057379',
  });
  assert.equal(response.success, true);
  assert.equal(response.page, 3);
  assert.equal(response.totalItems, 1001);
  assert.equal(response.totalPages, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(response.records)), [{
    externalProductId: '301',
    registeredName: '상품 301 테스트',
    primaryImageUrl: 'https://image1.coupangcdn.com/image/vendor_inventory/301.jpg',
    saleStatus: '판매중',
  }]);

  assert.equal(page.calls.length, 1);
  const request = page.calls[0];
  assert.equal(request.url, endpoint);
  assert.equal(request.init.method, 'POST');
  assert.equal(request.init.credentials, 'include');
  assert.equal(request.init.redirect, 'manual');
  assert.deepEqual(JSON.parse(JSON.stringify(request.init.headers)), { 'content-type': 'application/json' });
  assert.deepEqual(JSON.parse(request.init.body), {
    searchKeywordType: 'ALL',
    searchKeywords: '',
    salesMethod: 'ALL',
    productStatus: ['ALL'],
    stockSearchType: 'ALL',
    shippingFeeSearchType: 'ALL',
    displayCategoryCodes: [],
    listingStartTime: null,
    listingEndTime: null,
    saleEndDateSearchType: 'ALL',
    bundledShippingSearchType: 'ALL',
    displayDeletedProduct: false,
    shippingMethod: 'ALL',
    exposureStatus: 'ALL',
    sortMethod: 'SORT_BY_ITEM_LEVEL_UNIT_SOLD',
    countPerPage: 500,
    page: 3,
    locale: 'ko_KR',
    coupangAttributeOptimized: false,
    upBundleSearchOption: 'ALL',
    exposureStatuses: [],
    qualityEnhanceTypes: [],
  });
});

test('maps all observed Wing status values and preserves the DOM image host', async () => {
  const page = loadScraper({
    response: jsonResponse(payload([
      product(1, { productStatus: 'ON_SALE' }),
      product(2, { productStatus: 'PARTIAL_ON_SALE' }),
      product(3, { productStatus: 'SUSPENDED' }),
      product(4, { productStatus: 'REJECTED', representativeImage: null }),
    ])),
  });
  const response = await page.send({
    action: 'collectCoupangCatalogDiscoveryPage', page: 1, expectedVendorId: 'A00057379',
  });
  assert.deepEqual(JSON.parse(JSON.stringify(response.records.map((record) => [record.saleStatus, record.primaryImageUrl]))), [
    ['판매중', 'https://image1.coupangcdn.com/image/vendor_inventory/1.jpg'],
    ['판매중', 'https://image1.coupangcdn.com/image/vendor_inventory/2.jpg'],
    ['판매중지', 'https://image1.coupangcdn.com/image/vendor_inventory/3.jpg'],
    [null, null],
  ]);
});

test('returns a true empty page but pauses for redirects and HTML login responses', async () => {
  const empty = loadScraper({ response: jsonResponse(payload([])) });
  assert.deepEqual(JSON.parse(JSON.stringify(await empty.send({
    action: 'collectCoupangCatalogDiscoveryPage', page: 1, expectedVendorId: 'A00057379',
  }))), {
    success: true, page: 1, pageSize: 500, totalItems: 0, totalPages: 0, records: [],
  });

  const redirect = loadScraper({
    response: jsonResponse('', { status: 0, ok: false, type: 'opaqueredirect', contentType: '' }),
  });
  const redirectResult = await redirect.send({
    action: 'collectCoupangCatalogDiscoveryPage', page: 1, expectedVendorId: 'A00057379',
  });
  assert.equal(redirectResult.success, false);
  assert.equal(redirectResult.pendingLogin, true);

  const html = loadScraper({
    response: jsonResponse('<!doctype html><html><body>로그인</body></html>', {
      status: 200, ok: true, contentType: 'text/html',
    }),
  });
  const htmlResult = await html.send({
    action: 'collectCoupangCatalogDiscoveryPage', page: 1, expectedVendorId: 'A00057379',
  });
  assert.equal(htmlResult.success, false);
  assert.equal(htmlResult.pendingLogin, true);
});

test('classifies an HTML provider error as a fetch failure instead of a login pause', async () => {
  const page = loadScraper({
    response: jsonResponse('<!doctype html><html><body>temporarily unavailable</body></html>', {
      status: 503, ok: false, contentType: 'text/html',
    }),
  });
  const result = await page.send({
    action: 'collectCoupangCatalogDiscoveryPage', page: 1, expectedVendorId: 'A00057379',
  });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    success: false,
    error: 'Wing 상품 목록 API 요청 실패 (503)',
  });
  assert.deepEqual(page.timers, { scheduled: 1, cleared: 1 });
});

test('keeps the discovery timeout active while the response body is stalled', async () => {
  const page = loadScraper({
    timeoutImmediately: true,
    response: (init) => ({
      status: 200,
      ok: true,
      type: 'basic',
      headers: { get() { return 'application/json'; } },
      text: () => new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      }),
    }),
  });
  const result = await page.send({
    action: 'collectCoupangCatalogDiscoveryPage', page: 1, expectedVendorId: 'A00057379',
  });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    success: false,
    error: 'Wing 상품 목록 API 요청 시간이 초과되었습니다',
  });
  assert.deepEqual(page.timers, { scheduled: 1, cleared: 1 });
});

test('does not fall back to incomplete DOM rows after a malformed API response', async () => {
  const page = loadScraper({
    response: jsonResponse('{"success":true,', { status: 200, ok: true }),
    document: {
      querySelectorAll: () => [{ getAttribute: () => '999', innerText: 'DOM fallback' }],
    },
  });
  const response = await page.send({
    action: 'collectCoupangCatalogDiscoveryPage', page: 1, expectedVendorId: 'A00057379',
  });
  assert.equal(response.success, false);
  assert.equal(response.pendingLogin, undefined);
  assert.match(response.error, /JSON/);
});
