import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

// 주문수집 / 쿠팡 / 소싱 세 확장을 kiditem-os 하나로 합치면서 세 도메인 워커가
// 하나의 서비스워커 전역 스코프를 공유하게 됐다. 이 조합은 아래 세 가지로
// 조용히 깨질 수 있고, 셋 다 Chrome 에 올려야만 드러난다:
//
//   - 두 도메인이 같은 이름을 최상위에 선언 -> 워커 전체가 SyntaxError
//   - importScripts 순서가 어긋남 -> 최상위에서 전역을 쓰다 ReferenceError
//   - 도메인이 KidItemDomains 등록을 빠뜨림 -> ping capabilities 누락
//
// 그래서 실제 진입점을 그대로 실행해 부팅을 검증한다.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const backgroundRoot = path.join(repoRoot, 'extensions/kiditem-os/background');
const entryPath = path.join(backgroundRoot, 'service-worker.js');
const manifest = JSON.parse(
  readFileSync(path.join(repoRoot, 'extensions/kiditem-os/manifest.json'), 'utf8'),
);

function createFakeChrome() {
  const storage = {};
  const createdTabs = [];
  const externalMessageListeners = [];
  const connectExternalListeners = [];
  const noopEvent = () => ({ addListener() {}, removeListener() {} });
  return {
    storage,
    createdTabs,
    externalMessageListeners,
    connectExternalListeners,
    chrome: {
      runtime: {
        id: 'kiditem-os-test',
        lastError: null,
        getManifest: () => manifest,
        onInstalled: noopEvent(),
        onStartup: noopEvent(),
        onConnect: noopEvent(),
        onMessage: noopEvent(),
        onMessageExternal: {
          addListener: (listener) => externalMessageListeners.push(listener),
        },
        onConnectExternal: {
          addListener: (listener) => connectExternalListeners.push(listener),
        },
      },
      alarms: { create() {}, clear() {}, onAlarm: noopEvent() },
      storage: {
        local: {
          async get(key, callback) {
            const result = key == null ? { ...storage }
              : typeof key === 'string' ? { [key]: storage[key] }
              : Array.isArray(key) ? Object.fromEntries(key.map((k) => [k, storage[k]]))
              : Object.fromEntries(
              Object.entries(key).map(([k, fallback]) => [
                k,
                storage[k] === undefined ? fallback : storage[k],
              ]),
            );
            callback?.(result);
            return result;
          },
          async set(values, callback) {
            Object.assign(storage, values);
            callback?.();
          },
          async remove(keys, callback) {
            for (const key of Array.isArray(keys) ? keys : [keys]) {
              delete storage[key];
            }
            callback?.();
          },
        },
        onChanged: noopEvent(),
      },
      tabs: {
        async create(properties) {
          createdTabs.push(properties);
          return { id: 1, windowId: 1, ...properties };
        },
        async get(id) {
          return { id, windowId: 1, url: 'https://example.test/' };
        },
        async query() {
          return [];
        },
        async remove() {},
        async update(id, properties) {
          return { id, windowId: 1, ...properties };
        },
        sendMessage() {},
        onRemoved: noopEvent(),
        onUpdated: noopEvent(),
      },
      windows: {
        async create() {
          return { id: 1, tabs: [{ id: 1 }] };
        },
        async get() {
          return { id: 1 };
        },
        async remove() {},
        async update() {},
        onRemoved: noopEvent(),
      },
      scripting: { async executeScript() { return []; } },
      cookies: { async getAll() { return []; }, async remove() {} },
      sidePanel: { setPanelBehavior() {}, async open() {} },
      action: { onClicked: noopEvent() },
      debugger: { async attach() {}, async detach() {}, async sendCommand() {}, onEvent: noopEvent() },
    },
  };
}

function bootServiceWorker({ fetch: fetchFn } = {}) {
  const fake = createFakeChrome();
  let context;
  const sandbox = {
    AbortController,
    Blob,
    FormData,
    Headers,
    // Node 전역에는 없지만 쿠팡 이미지 페치 모듈이 생성자로 주입받는다.
    FileReader: class {
      readAsDataURL() {
        this.result = 'data:,';
        this.onload?.();
      }
    },
    TextDecoder,
    TextEncoder,
    URL,
    URLSearchParams,
    atob,
    btoa,
    chrome: fake.chrome,
    clearInterval,
    clearTimeout,
    console,
    crypto,
    fetch: fetchFn ?? (async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '' })),
    setInterval,
    setTimeout,
    structuredClone,
    // 실제 서비스워커의 importScripts 와 같은 기준(서비스워커 위치)으로 푼다.
    importScripts(...files) {
      for (const file of files) {
        const filename = path.join(backgroundRoot, file.split('?')[0]);
        vm.runInContext(readFileSync(filename, 'utf8'), context, { filename });
      }
    },
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  context = vm.createContext(sandbox);
  vm.runInContext(readFileSync(entryPath, 'utf8'), context, { filename: entryPath });
  return { fake, context };
}

function externalRequest(fake, message) {
  return new Promise((resolve) => {
    let responders = 0;
    for (const listener of fake.externalMessageListeners) {
      if (listener(message, { url: 'http://localhost:3000/advertising/keyword-rank' }, resolve) === true) responders += 1;
    }
    assert.equal(responders, 1);
  });
}

// Exercise the production collector from the fully loaded worker. Only Chrome
// browser IO and time are simulated; capture, pagination and normalization run.
function bootRankCollector(pages, { loadFailureAt, redirectAt, fetch } = {}) {
  const { fake, context } = bootServiceWorker({ fetch });
  const urls = [], delays = [];
  let tab;
  fake.chrome.tabs.create = (properties, callback) => {
    urls.push(properties.url);
    tab = { id: 41, windowId: 7, status: 'complete', ...properties };
    callback?.(tab);
    return Promise.resolve(tab);
  };
  fake.chrome.tabs.get = (_id, callback) => {
    callback?.(tab);
    return Promise.resolve(tab);
  };
  fake.chrome.tabs.update = (_id, properties, callback) => {
    urls.push(properties.url);
    if (urls.length === loadFailureAt) {
      fake.chrome.runtime.lastError = { message: 'navigation failed' };
      callback?.();
      fake.chrome.runtime.lastError = null;
    } else {
      tab = { ...tab, ...properties,
        url: urls.length === redirectAt ? 'https://login.coupang.com/' : properties.url };
      callback?.(tab);
    }
    return Promise.resolve(tab);
  };
  fake.chrome.scripting.executeScript = async ({ func }) => {
    const page = pages[urls.length - 1];
    if (page instanceof Error) throw page;
    if (typeof page === 'string') {
      const dom = new JSDOM(page, { url: tab.url, runScripts: 'outside-only' });
      try {
        return [{ result: vm.runInContext(`(${func.toString()})()`, dom.getInternalVMContext()) }];
      } finally { dom.window.close(); }
    }
    return [{ result: page }];
  };
  context.setTimeout = (callback, ms) => {
    if (ms < 10_000) {
      delays.push(ms);
      queueMicrotask(callback);
    }
    return 1;
  };
  context.clearTimeout = () => {};
  vm.runInContext('Math.random = () => 0;', context);
  return {
    urls, delays, fake, context,
    capture: async (maxPages = 2) => JSON.parse(JSON.stringify(
      await context.captureCoupangKeywordSerp('연필 세트', maxPages, { environmentId: 'local' }),
    )),
  };
}

function bootWingSearch(responses) {
  const { fake, context } = bootServiceWorker();
  const requests = [], delays = [], urls = [];
  let tab;
  fake.chrome.tabs.create = (properties, callback) => {
    urls.push(properties.url);
    tab = { id: 42, windowId: 7, status: 'complete', ...properties };
    callback?.(tab);
    return Promise.resolve(tab);
  };
  fake.chrome.tabs.get = (_id, callback) => { callback?.(tab); return Promise.resolve(tab); };
  fake.chrome.scripting.executeScript = async ({ func, args }) => {
    const response = responses[requests.length];
    return [{ result: await vm.runInNewContext(`(${func.toString()})(...args)`, {
      args, document: { cookie: 'XSRF-TOKEN=fixture' }, AbortSignal,
      fetch: async (url, init) => {
        requests.push({ url, ...init, body: JSON.parse(init.body) });
        return { ok: response.status === 200, status: response.status,
          headers: new Headers({ 'content-type': response.contentType || 'application/json' }),
          text: async () => JSON.stringify(response.body) };
      },
    }) }];
  };
  context.setTimeout = (callback, ms) => {
    if ([1000, 2000, 4000, 8000, 16000, 2200].includes(ms)) { delays.push(ms); queueMicrotask(callback); }
    return 1;
  };
  context.clearTimeout = () => {};
  return { requests, delays, urls, search: async (maxPages = 5) => JSON.parse(JSON.stringify(
    await context.searchWingCatalogProducts({ keyword: '연필 세트', maxPages, environmentId: 'local',
      collectionRunId: '11111111-1111-4111-8111-111111111111' }),
  )) };
}

test('Wing search records whether the successful JSON response actually contained a result array', async () => {
  for (const [body, observed] of [[{ result: [] }, true], [{}, false], [{ result: null }, false]]) {
    const h = bootWingSearch([{ status: 200, body }]);
    const result = await h.search();
    assert.equal(result.success, true, 'observation does not rewrite the original collector result');
    assert.equal(result.stopReason, 'empty_page');
    assert.deepEqual(result.rows, []);
    assert.equal(result.pages[0].resultArrayObserved, observed);
    assert.equal(h.requests.length, 1);
  }
});

test('Wing search preserves request cursors, 429 retry delays, deduplication and normalized product fields', async () => {
  const product = { productId: 101, itemId: 201, vendorItemId: 301, productName: '연필',
    salePrice: 1000, salesLast28d: 3, pvLast28Day: 12, rating: 4.5, ratingCount: 8,
    displayCategoryInfo: [{ categoryHierarchy: '문구 > 연필' }] };
  const h = bootWingSearch([
    { status: 429, body: {} }, { status: 429, body: {} },
    { status: 200, body: { result: [product], nextSearchPage: 5 } },
    { status: 200, body: { result: [product, { ...product, productId: 102, vendorItemId: 302 }], nextSearchPage: null } },
  ]);
  const result = await h.search();
  assert.deepEqual(h.urls, ['https://wing.coupang.com/tenants/seller-web/vendor-inventory/formV2']);
  assert.deepEqual(h.requests.map(({ url, method, credentials, body }) => ({ url, method, credentials, body })),
    [0, 0, 0, 5].map((searchPage) => ({ url: '/tenants/seller-web/pre-matching/search', method: 'POST', credentials: 'include',
      body: { keyword: '연필 세트', excludedProductIds: [], searchPage, searchOrder: 'DEFAULT', sortType: 'DEFAULT' } })));
  assert.deepEqual(h.delays, [4000, 8000, 2200]);
  assert.equal(result.stopReason, 'no_next_search_page');
  assert.deepEqual(result.pages, [
    { searchPage: 0, itemCount: 1, resultArrayObserved: true, nextSearchPage: 5, total: null },
    { searchPage: 5, itemCount: 2, resultArrayObserved: true, nextSearchPage: null, total: null },
  ]);
  assert.equal(result.collectedCount, 2);
  assert.equal(result.upstreamTotal, null);
  assert.deepEqual(result.rows[0], { productId: '101', itemId: '201', vendorItemId: '301', productName: '연필',
    itemName: null, brandName: null, manufacture: null, categoryHierarchy: '문구 > 연필', imagePath: null,
    salePrice: 1000, rating: 4.5, ratingCount: 8, pvLast28Day: 12, salesLast28d: 3,
    estimatedRevenue28d: 3000, conversionRate28d: 0.25, deliveryInfo: null });
});

test('Wing search keeps partial rows and original 5xx exhaustion while exposing the incomplete stop reason', async () => {
  const h = bootWingSearch([
    { status: 200, body: { result: [{ productId: 101, productName: '연필' }], nextSearchPage: 1 } },
    ...Array.from({ length: 4 }, () => ({ status: 503, body: {} })),
  ]);
  const result = await h.search();
  assert.equal(result.success, true, 'the owner validates completeness; collection output remains unchanged');
  assert.equal(result.rows.length, 1);
  assert.equal(result.stopReason, 'non_json_response');
  assert.equal(result.pages.length, 1);
  assert.deepEqual(h.requests.map((request) => request.body.searchPage), [0, 1, 1, 1, 1]);
  assert.deepEqual(h.delays, [2200, 1000, 2000, 4000]);
});

test('SERP source dispatch collects the server plan and returns only its acknowledged owner result', async () => {
  const attemptId = '11111111-1111-4111-8111-111111111111';
  const attemptToken = '22222222-2222-4222-8222-222222222222';
  const control = {
    attemptId, attemptToken, state: 'RUNNING', keyword: '연필 세트', itemCount: 0,
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    plan: { sourceType: 'coupang_keyword_serp', parserVersion: 'keyword-serp-v1',
      keyword: '연필 세트', maxPages: 1, explicitVendorItemIds: [], ownItems: [] },
  };
  const uploads = [];
  const h = bootRankCollector([{ items: [{ productId: '1', vendorItemId: '10', name: '연필' }] }], { fetch: async (url, init) => {
    if (String(url).endsWith(`/serp/attempts/${attemptId}`)) {
      if (init.method === 'PUT') {
        uploads.push({ body: JSON.parse(init.body), token: new Headers(init.headers).get('x-source-attempt-token') });
        return { ok: true, status: 200, json: async () => ({ attemptId, state: 'COMPLETE', itemCount: 1 }) };
      }
      return { ok: true, status: 200, json: async () => control };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  } });
  h.fake.storage.kiditem_environment_profiles_v1 = { local: { accessToken: 'test-token' } };
  const contract = h.context.KidItemDomains.forExternalAction('collectAdvertisingKeywordSerp');
  assert.equal(typeof contract?.handle, 'function');
  for (const extra of [{ keyword: 'forged' }, { attemptToken }, { runId: attemptId }]) {
    assert.throws(() => contract.validate({ action: 'collectAdvertisingKeywordSerp', attemptId, ...extra }));
  }
  const dispatch = () => new Promise((resolve) => {
    let responders = 0;
    for (const listener of h.fake.externalMessageListeners) {
      if (listener({ action: 'collectAdvertisingKeywordSerp', attemptId },
        { url: 'http://localhost:3000/advertising/keyword-rank' }, resolve) === true) responders += 1;
    }
    assert.equal(responders, 1);
  });
  const [reply, replay] = await Promise.all([dispatch(), dispatch()]);
  assert.deepEqual(reply, replay);
  assert.deepEqual(JSON.parse(JSON.stringify(reply)), {
    success: true, attemptId, terminalState: 'COMPLETE', itemCount: 1,
  });
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].token, attemptToken);
  assert.equal(uploads[0].body.keyword, '연필 세트');
  assert.equal(uploads[0].body.items[0].vendorItemId, '10');
  assert.ok(Number.isFinite(Date.parse(uploads[0].body.capturedAt)));
  assert.deepEqual(uploads[0].body.pagination, { requestedMaxPages: 1, stoppedAtPage: 1, stopReason: 'page_limit' });
  assert.equal(h.urls.length, 1);
});

test('SERP source dispatch reconciles lost terminal replies without submitting a contradictory failure', async (t) => {
  for (const outcome of ['COMPLETE', 'FAILED', 'UNAVAILABLE']) await t.test(outcome, async () => {
    const attemptId = '11111111-1111-4111-8111-111111111111';
    const uploads = [];
    let reads = 0;
    const h = bootRankCollector([{ items: [{ productId: '1', name: '연필' }] }], {
      fetch: async (url, init) => {
        if (!String(url).includes('/serp/attempts/')) return { ok: true, status: 200, json: async () => ({}) };
        assert.equal(String(url).endsWith(`/serp/attempts/${attemptId}`), true, 'never send /fail after an uncertain upload');
        if (init.method === 'PUT') {
          uploads.push(init.body);
          throw new TypeError('response connection lost');
        }
        reads += 1;
        if (reads > 1 && outcome === 'UNAVAILABLE') throw new TypeError('server unavailable');
        return { ok: true, status: 200, json: async () => reads === 1 ? {
          attemptId, attemptToken: '22222222-2222-4222-8222-222222222222', state: 'RUNNING',
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
          plan: { sourceType: 'coupang_keyword_serp', parserVersion: 'keyword-serp-v1', keyword: '연필 세트', maxPages: 1 },
        } : { attemptId, state: outcome, itemCount: outcome === 'COMPLETE' ? 1 : 0,
          errorCode: 'INCOMPLETE_SERP_CAPTURE', errorMessage: 'Source proof rejected.' } };
      },
    });
    h.fake.storage.kiditem_environment_profiles_v1 = { local: { accessToken: 'test-token' } };
    const action = h.context.KidItemDomains.forExternalAction('collectAdvertisingKeywordSerp');
    const result = await action.handle({ attemptId }, 'local');
    assert.equal(result.success, outcome === 'COMPLETE');
    assert.equal(result.terminalState, outcome === 'UNAVAILABLE' ? 'RUNNING' : outcome);
    assert.equal(uploads.length, 3);
    assert.equal(new Set(uploads).size, 1, 'the exact capture timestamp/body is preserved across retries');
    assert.equal(h.urls.length, 1, 'a transport retry does not recollect the source');
    const session = await externalRequest(h.fake, { action: 'getCollectionSession', attemptId });
    assert.equal(Boolean(session), outcome === 'UNAVAILABLE', 'uncertainty retains only local correlation');
  });
});

test('SERP source dispatch records provider login failure and retains the owned attention tab', async () => {
  const attemptId = '11111111-1111-4111-8111-111111111111';
  const failures = [];
  const h = bootRankCollector([{ items: [], wall: 'login' }], { fetch: async (url, init) => {
    if (!String(url).includes('/serp/attempts/')) return { ok: true, status: 200, json: async () => ({}) };
    if (init.method === 'POST') {
      assert.equal(String(url).endsWith(`/${attemptId}/fail`), true);
      failures.push(JSON.parse(init.body));
      return { ok: true, status: 201, json: async () => ({ attemptId, state: 'FAILED', itemCount: 0,
        errorCode: 'SERP_PROVIDER_WALL', errorMessage: 'Login required.' }) };
    }
    assert.equal(init.method, 'GET');
    return { ok: true, status: 200, json: async () => ({
      attemptId, attemptToken: '22222222-2222-4222-8222-222222222222', state: 'RUNNING',
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      plan: { sourceType: 'coupang_keyword_serp', parserVersion: 'keyword-serp-v1', keyword: '연필 세트', maxPages: 1 },
    }) };
  } });
  h.fake.storage.kiditem_environment_profiles_v1 = { local: { accessToken: 'test-token' } };
  const result = await h.context.KidItemDomains.forExternalAction('collectAdvertisingKeywordSerp')
    .handle({ attemptId }, 'local');
  assert.equal(result.success, false);
  assert.equal(result.terminalState, 'FAILED');
  assert.equal(failures.length, 1);
  const session = await externalRequest(h.fake, { action: 'getCollectionSession', attemptId });
  assert.equal(session?.attention?.reason, 'marketplace_login');
  const focused = [];
  h.fake.chrome.tabs.update = async (tabId, options) => { focused.push({ tabId, ...options }); };
  await externalRequest(h.fake, { action: 'openCollectionAttentionTab', attemptId });
  assert.deepEqual(focused, [{ tabId: 41, active: true }]);
});

test('SERP source cancellation is owner-confirmed before closing the tab and stops further pagination', async () => {
  const attemptId = '11111111-1111-4111-8111-111111111111';
  const writes = [];
  let state = 'RUNNING';
  const h = bootRankCollector([{ items: [{ productId: '1' }] }, { items: [{ productId: '2' }] }], {
    fetch: async (url, init) => {
      if (!String(url).includes('/serp/attempts/')) return { ok: true, status: 200, json: async () => ({}) };
      if (init.method !== 'GET') {
        writes.push({ url: String(url), body: JSON.parse(init.body) });
        state = 'FAILED';
      }
      return { ok: true, status: 200, json: async () => ({
        attemptId, attemptToken: '22222222-2222-4222-8222-222222222222', state,
        errorCode: state === 'FAILED' ? 'COLLECTION_CANCELLED' : null, itemCount: 0,
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
        plan: { sourceType: 'coupang_keyword_serp', parserVersion: 'keyword-serp-v1', keyword: '연필 세트', maxPages: 2 },
      }) };
    },
  });
  h.fake.storage.kiditem_environment_profiles_v1 = { local: { accessToken: 'test-token' } };
  let entered, release;
  const extracting = new Promise((resolve) => { entered = resolve; });
  const resume = new Promise((resolve) => { release = resolve; });
  const extract = h.fake.chrome.scripting.executeScript;
  h.fake.chrome.scripting.executeScript = async (...args) => { entered(); await resume; return extract(...args); };
  const closed = [];
  h.fake.chrome.tabs.remove = async (tabId) => { assert.equal(state, 'FAILED'); closed.push(tabId); };
  const collecting = h.context.KidItemDomains.forExternalAction('collectAdvertisingKeywordSerp').handle({ attemptId }, 'local');
  await extracting;
  let cancellation;
  try { cancellation = await externalRequest(h.fake, { action: 'cancelCollectionSession', attemptId }); }
  finally { release(); }
  const result = await collecting;
  assert.equal(cancellation?.terminalState, 'FAILED');
  assert.equal(result.terminalState, 'FAILED');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].url.endsWith(`/${attemptId}/fail`), true);
  assert.equal(writes[0].body.code, 'COLLECTION_CANCELLED');
  assert.equal(h.urls.length, 1);
  assert.deepEqual(closed, [41]);
});

test('SERP source records a definitive payload rejection as FAILED rather than leaving an unconfirmed RUNNING source', async () => {
  const attemptId = '11111111-1111-4111-8111-111111111111';
  const writes = [];
  const h = bootRankCollector([{ items: [{ productId: '1' }] }], { fetch: async (url, init) => {
    if (!String(url).includes('/serp/attempts/')) return { ok: true, status: 200, json: async () => ({}) };
    if (init.method === 'PUT') {
      writes.push('PUT');
      return { ok: false, status: 400, json: async () => ({ message: 'INVALID_SERP_CAPTURE' }) };
    }
    if (init.method === 'POST') {
      writes.push('FAIL');
      return { ok: true, status: 201, json: async () => ({ attemptId, state: 'FAILED', itemCount: 0,
        errorCode: 'SERP_RESPONSE_INVALID', errorMessage: 'Invalid capture.' }) };
    }
    return { ok: true, status: 200, json: async () => ({
      attemptId, attemptToken: '22222222-2222-4222-8222-222222222222', state: 'RUNNING',
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      plan: { sourceType: 'coupang_keyword_serp', parserVersion: 'keyword-serp-v1', keyword: '연필 세트', maxPages: 1 },
    }) };
  } });
  h.fake.storage.kiditem_environment_profiles_v1 = { local: { accessToken: 'test-token' } };
  const result = await h.context.KidItemDomains.forExternalAction('collectAdvertisingKeywordSerp').handle({ attemptId }, 'local');
  assert.equal(result.terminalState, 'FAILED');
  assert.deepEqual(writes, ['PUT', 'FAIL']);
  assert.equal(h.urls.length, 1);
});

test('SERP capture preserves URLs, DOM order and normalized fields while proving the page limit', async () => {
  const h = bootRankCollector([
    { items: [{ productId: '1', vendorItemId: '10', name: '연필', isAd: true,
      priceKrw: 1200, reviewCount: 0, ratingScore: 4.5, link: 'https://www.coupang.com/vp/products/1' }] },
    { items: [{ productId: '1', itemId: '2', vendorItemId: '10', name: '연필' }], usedFallback: true },
  ]);
  const capture = await h.capture();
  assert.deepEqual(capture, {
    success: true, tabId: 41, keyword: '연필 세트', pagesScanned: 2,
    items: [
      { rank: 1, page: 1, positionInPage: 1, isAd: true, productId: '1', itemId: null,
        vendorItemId: '10', name: '연필', priceKrw: 1200, reviewCount: 0,
        ratingScore: 4.5, link: 'https://www.coupang.com/vp/products/1' },
      { rank: 2, page: 2, positionInPage: 1, isAd: false, productId: '1', itemId: '2',
        vendorItemId: '10', name: '연필', priceKrw: null, reviewCount: null,
        ratingScore: null, link: null },
    ],
    usedFallback: true, wall: null,
    pagination: { requestedMaxPages: 2, stoppedAtPage: 2, stopReason: 'page_limit' },
  });
  assert.deepEqual(h.urls, [
    'https://www.coupang.com/np/search?q=%EC%97%B0%ED%95%84%20%EC%84%B8%ED%8A%B8&channel=user&page=1&listSize=36',
    'https://www.coupang.com/np/search?q=%EC%97%B0%ED%95%84%20%EC%84%B8%ED%8A%B8&channel=user&page=2&listSize=36',
  ]);
  assert.deepEqual(h.delays, [1200, 1500, 1200]);
});

test('SERP capture distinguishes an observed last empty page without changing first-page-empty failure', async () => {
  const later = bootRankCollector([{ items: [{ productId: '1' }] }, { items: [], resultListObserved: true }]);
  const capture = await later.capture(3);
  assert.equal(capture.success, true);
  assert.equal(capture.items.length, 1);
  assert.equal(capture.pagesScanned, 1);
  assert.deepEqual(capture.pagination, {
    requestedMaxPages: 3, stoppedAtPage: 2, stopReason: 'empty_page',
  });
  assert.equal(later.urls.length, 2);
  const first = bootRankCollector([{ items: [] }]);
  const missing = await first.capture(3);
  assert.equal(missing.success, false);
  assert.match(missing.error, /검색 결과가 비어/);
  assert.equal(first.urls.length, 1);
});

test('SERP capture reports interrupted pagination without changing the previously collected rows or retries', async () => {
  const first = { items: [{ productId: '1' }] };
  const scenarios = [
    { pages: [first, null], reason: 'extraction_failed' },
    { pages: [first, new Error('script failed')], reason: 'extraction_failed' },
    { pages: [first, {}], reason: 'invalid_result' },
    { pages: [first, { items: 'not an array' }], reason: 'invalid_result' },
    { pages: [first, { items: [], wall: 'captcha' }], reason: 'provider_wall' },
    { pages: [first, { items: [], wall: 'login' }], reason: 'provider_wall' },
    { pages: [first], loadFailureAt: 2, reason: 'load_failed' },
    { pages: [first], redirectAt: 2, reason: 'redirect' },
  ];
  for (const scenario of scenarios) {
    const h = bootRankCollector(scenario.pages, scenario);
    const capture = await h.capture(3);
    assert.equal(capture.success, true, 'capture retains its original artifact result');
    assert.equal(capture.items.length, 1);
    assert.equal(capture.items[0].productId, '1');
    assert.equal(capture.pagesScanned, 1);
    assert.deepEqual(capture.pagination, {
      requestedMaxPages: 3, stoppedAtPage: 2, stopReason: scenario.reason,
    });
    assert.equal(h.urls.length, 2, 'proof must not add navigation or retries');
  }
});

test('SERP capture cannot prove completion from product rows rendered with an access wall', async () => {
  for (const pages of [
    [{ items: [{ productId: '1' }], wall: 'captcha' }],
    [{ items: [{ productId: '1' }], wall: 'login' }, { items: [{ productId: '2' }] }],
  ]) {
    const h = bootRankCollector(pages);
    const capture = await h.capture(pages.length);
    assert.equal(capture.success, true);
    assert.equal(capture.items.length, pages.length);
    assert.deepEqual(capture.pagination, {
      requestedMaxPages: pages.length, stoppedAtPage: pages.length, stopReason: 'provider_wall',
    });
    assert.equal(h.urls.length, pages.length);
  }
});

test('SERP capture does not certify the live Access Denied page as an empty result', async () => {
  // Observed in isolated Chrome/CDP on 2026-09-06; edge reference IDs redacted.
  const denied = `<html><head><title>Access Denied</title></head><body>
    <h1>Access Denied</h1>
    You don't have permission to access "http://www.coupang.com/np/search?" on this server.
    <p>Reference [redacted]</p><p>https://errors.edgesuite.net/[redacted]</p>
    </body></html>`;
  for (const [html, expectedReason] of [
    [denied, 'invalid_result'],
    ['<html><body><main>Unrecognized page</main></body></html>', 'invalid_result'],
    ['<html><body><ul id="productList"></ul></body></html>', 'empty_page'],
  ]) {
    const h = bootRankCollector([{ items: [{ productId: '1' }] }, html]);
    const capture = await h.capture(3);
    assert.equal(capture.success, true, 'source proof does not rewrite collector success');
    assert.equal(capture.items.length, 1);
    assert.equal(capture.pagesScanned, 1);
    assert.equal(capture.usedFallback, true);
    assert.deepEqual(capture.pagination, {
      requestedMaxPages: 3, stoppedAtPage: 2, stopReason: expectedReason,
    });
    assert.equal(h.urls.length, 2);
  }
});

test('통합 서비스워커가 세 도메인을 모두 싣고 부팅한다', () => {
  const { fake, context } = bootServiceWorker();

  // 도메인 워커 3개 + 통합 dispatch = 외부 리스너 4개.
  assert.equal(fake.externalMessageListeners.length, 4);
  assert.ok(context.KidItemDomains);
});

test('브라우저 Operation runtime 인스턴스를 하나만 만들고 공용 dispatch에 보관한다', () => {
  const source = readFileSync(entryPath, 'utf8');
  assert.equal(
    source.match(/KidItemOperationRuntimeClient\.create\(/g)?.length,
    1,
  );
  assert.match(source, /const browserOperationRuntime\s*=\s*KidItemOperationRuntimeClient\.create/);
  assert.match(source, /operationRuntime:\s*browserOperationRuntime/);
  assert.match(source, /browserOperationRuntime\.install\(\)/);
});

test('wakeOperationRuntime에는 공용 dispatch만 즉시 응답한다', async () => {
  const { fake } = bootServiceWorker();
  const responses = [];
  let keptAlive = 0;

  for (const listener of fake.externalMessageListeners) {
    const result = listener(
      { action: 'wakeOperationRuntime' },
      { url: 'http://localhost:3000/sourcing-ai/wing-catalog' },
      (response) => responses.push(response),
    );
    if (result === true) keptAlive += 1;
  }

  assert.equal(keptAlive, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(responses)), [
    { success: true, accepted: true },
  ]);
  await Promise.resolve();
});

test('ping 이 세 도메인의 capabilities 를 합쳐 한 번만 응답한다', async () => {
  const { fake } = bootServiceWorker();

  const responses = [];
  for (const listener of fake.externalMessageListeners) {
    listener(
      { action: 'ping' },
      { url: 'http://localhost:3000/order-collection' },
      (response) => responses.push(response),
    );
  }

  assert.equal(responses.length, 1, 'ping 에 두 곳 이상이 응답하면 안 된다');
  const [response] = responses;
  assert.equal(response.success, true);
  assert.equal(response.version, manifest.version);
  for (const capability of [
    // 주문수집
    'orderCollectionIcecreamMall',
    'coupangShipmentSummarySourceOwnerV1',
    'collectSellpiaInventoryJsonV1',
    'collectSellpiaManualMatchV1',
    'collectSellpiaManualMatchPortV1',
    'orderCollectionFailureEvidenceV1',
    // 쿠팡
    'profitabilityAdvertisingSourceOwnerV1',
    'coupangCatalogSnapshot',
    'wingFormPortV1',
    'coupangKeywordRank',
    // 소싱
    'sourcingProductScraper',
    'sourcing1688TrendCollector',
    // 공통
    'browserCollectionSessions',
    'kiditemEnvironmentProfilesV1',
  ]) {
    assert.equal(response.capabilities[capability], true, capability);
  }
});

test('세 도메인이 서로 겹치지 않는 producer 접두사를 등록한다', () => {
  const { context } = bootServiceWorker();
  const domains = context.KidItemDomains;

  const expected = {
    'orders.mall': 'cancelCollectionSession',
    'orders.sellpia_manual_match': 'cancelCollectionSession',
    'inventory.sellpia': 'cancelCollectionSession',
    'advertising.ad_sync': 'cancelCollectionSession',
    'channels.coupang_catalog': 'cancelCollectionSession',
    'dashboard.wing_sales': 'cancelCollectionSession',
    'sourcing.1688_trend': 'cancelCollectionSession',
  };
  for (const [producer, operation] of Object.entries(expected)) {
    const domain = domains.forProducer(producer);
    assert.ok(domain, producer);
    assert.equal(typeof domain[operation], 'function', `${producer}.${operation}`);
  }
  assert.equal(domains.forProducer('unknown.thing'), null);
});

test('승인된 KidItem web origin도 retired Coupang source bridge를 직접 시작할 수 없다', () => {
  const { fake, context } = bootServiceWorker();

  for (const action of [
    'searchWingCatalogProducts',
    'searchCoupangKeywordSuggestions',
  ]) {
    let keptAlive = 0;
    for (const listener of fake.externalMessageListeners) {
      const result = listener(
        { action, keyword: '문구', maxPages: 1 },
        { url: 'http://localhost:3000/sourcing-ai/wing-catalog' },
        () => {},
      );
      if (result === true) keptAlive += 1;
    }
    assert.equal(keptAlive, 0, `${action}: direct source-owner action만 source work를 시작한다`);
  }

  assert.deepEqual(fake.createdTabs, []);
  assert.equal(
    context.KidItemDomains.runOperation('sourcing.collect_wing_catalog_batch'),
    null,
  );
  assert.equal(
    context.KidItemDomains.runOperation('sourcing.collect_keyword_suggestions'),
    null,
  );
  assert.equal(
    typeof context.KidItemDomains.forExternalAction('collectSourcingKeywordSuggestions')?.handle,
    'function',
  );
  assert.equal(
    context.KidItemDomains.capabilities().sourcingKeywordSuggestionSourceOwnerV1,
    true,
  );
});

test('수익성 광고비 수집은 공용 dispatch의 직접 source-owner action으로만 등록된다', () => {
  const { context } = bootServiceWorker();
  assert.equal(
    typeof context.KidItemDomains.forExternalAction('collectAdvertisingProfitability')?.handle,
    'function',
  );
  assert.equal(context.KidItemDomains.forExternalAction('advertising.refresh_profitability_spend'), null);
});

test('외부 장기 실행 포트를 공용 dispatch 하나가 소유 도메인으로 전달한다', () => {
  const { fake } = bootServiceWorker();
  assert.equal(fake.connectExternalListeners.length, 1);
  const [dispatch] = fake.connectExternalListeners;

  for (const name of ['kiditem-wing-form-v1', 'kiditem-sellpia-manual-match-v1']) {
    const messageListeners = [];
    let disconnected = 0;
    dispatch({
      name,
      sender: { url: 'http://kiditem-office/product-hub/matching' },
      onMessage: { addListener: (listener) => messageListeners.push(listener) },
      postMessage() {},
      disconnect() { disconnected += 1; },
    });
    assert.equal(messageListeners.length, 1, name);
    assert.equal(disconnected, 0, name);
  }

  let unknownDisconnected = 0;
  dispatch({
    name: 'unknown-port',
    sender: { url: 'http://kiditem-office/product-hub/matching' },
    disconnect() { unknownDisconnected += 1; },
  });
  assert.equal(unknownDisconnected, 1);
});

test('수집 세션 공통 액션에 도메인 워커가 경쟁 응답하지 않는다', async () => {
  const { fake } = bootServiceWorker();

  for (const action of [
    'listCollectionSessions',
    'getCollectionSession',
    'cancelCollectionSession',
    'openCollectionAttentionTab',
  ]) {
    const responses = [];
    let keptAlive = 0;
    for (const listener of fake.externalMessageListeners) {
      const result = listener(
        { action, runId: '11111111-1111-4111-8111-111111111111' },
        { url: 'http://localhost:3000/order-collection' },
        (response) => responses.push(response),
      );
      if (result === true) keptAlive += 1;
    }
    assert.equal(keptAlive, 1, `${action}: 응답을 여는 리스너는 하나여야 한다`);
    assert.equal(responses.length, 0, `${action}: 동기 응답이 있으면 안 된다`);
  }
});

test('도메인 고유 액션은 소유 워커만 받고 retired sourcing bridge는 받지 않는다', () => {
  const { fake, context } = bootServiceWorker();

  let orderKeptAlive = 0;
  for (const listener of fake.externalMessageListeners) {
    const result = listener(
      { action: 'collectKakaoOrders', date: '2026-07-15' },
      { url: 'http://localhost:3000/order-collection' },
      () => {},
    );
    if (result === true) orderKeptAlive += 1;
  }
  assert.equal(orderKeptAlive, 1, 'collectKakaoOrders: 소유 워커 하나만 처리해야 한다');

  let sourcingBridgeKeptAlive = 0;
  for (const listener of fake.externalMessageListeners) {
    const result = listener(
      {
        action: 'start1688TrendCollection',
        runId: '11111111-1111-4111-8111-111111111111',
        keywords: ['테스트'],
      },
      { url: 'http://localhost:3000/sourcing-ai/decision-center' },
      () => {},
    );
    if (result === true) sourcingBridgeKeptAlive += 1;
  }
  assert.equal(sourcingBridgeKeptAlive, 0, 'retired sourcing bridge는 외부 액션을 열면 안 된다');
  assert.equal(
    typeof context.KidItemDomains.forExternalAction('collectSourcing1688Trends')?.handle,
    'function',
    '1688 source collection is owned by one explicit external action',
  );
  assert.equal(
    context.KidItemDomains.runOperation('sourcing.collect_1688_trends'),
    null,
    'retired 1688 Operation must not claim browser work',
  );
  const tiktokAction = context.KidItemDomains.forExternalAction('collectSourcingTiktokCcTrends');
  assert.equal(
    typeof tiktokAction?.handle,
    'function',
    'TikTok source collection is owned by one explicit external action',
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(tiktokAction.validate({
      action: 'collectSourcingTiktokCcTrends',
      idempotencyKey: 'tiktok-direct-dispatch-key',
      maxItems: 12,
      region: 'KR',
    }))),
    { idempotencyKey: 'tiktok-direct-dispatch-key', maxItems: 12, region: 'KR' },
  );
  for (const invalid of [
    { action: 'collectSourcingTiktokCcTrends', idempotencyKey: 'key', maxItems: 101 },
    { action: 'collectSourcingTiktokCcTrends', idempotencyKey: 'key', region: 'K1' },
    { action: 'collectSourcingTiktokCcTrends', idempotencyKey: 'key', unexpected: true },
  ]) {
    assert.throws(() => tiktokAction.validate(invalid), /Invalid TikTok source collection request/);
  }
  assert.equal(
    context.KidItemDomains.runOperation('sourcing.collect_tiktok_cc_trends'),
    null,
    'retired TikTok Operation must not claim browser work',
  );
  const liveCommerceAction = context.KidItemDomains.forExternalAction('collectSourcingLiveCommerce');
  assert.equal(
    typeof liveCommerceAction?.handle,
    'function',
    'Live Commerce collection is owned by one explicit external action',
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(liveCommerceAction.validate({
      action: 'collectSourcingLiveCommerce',
      idempotencyKey: 'live-commerce-direct-dispatch-key',
      url: 'https://live.douyin.com/123?token=keep#private',
    }))),
    {
      idempotencyKey: 'live-commerce-direct-dispatch-key',
      url: 'https://live.douyin.com/123?token=keep#private',
    },
  );
  for (const invalid of [
    { action: 'collectSourcingLiveCommerce', idempotencyKey: 'key' },
    { action: 'collectSourcingLiveCommerce', idempotencyKey: 'key', url: 'http://live.douyin.com/123' },
    { action: 'collectSourcingLiveCommerce', idempotencyKey: 'key', url: 'https://live.douyin.com/123', unexpected: true },
  ]) {
    assert.throws(() => liveCommerceAction.validate(invalid), /Invalid Live Commerce source collection request/);
  }
  assert.equal(
    context.KidItemDomains.runOperation('sourcing.collect_live_commerce_url'),
    null,
    'retired Live Commerce Operation must not claim browser work',
  );
});

test('shipment summary uses one authenticated owner responder without accepting a page-owned plan', async () => {
  const { fake, context } = bootServiceWorker();
  const action = 'collectCoupangShipmentDateSummary';
  const attemptId = '11111111-1111-4111-8111-111111111111';
  const contract = context.KidItemDomains.forExternalAction(action);
  assert.equal(typeof contract?.handle, 'function');
  for (const invalid of [
    { action, runId: attemptId },
    { action, attemptId, maxPages: 60 },
    { action, attemptId, attemptToken: 'caller-token' },
  ]) assert.throws(() => contract.validate(invalid), /Invalid shipment summary attempt/);

  let keptAlive = 0;
  const responses = [];
  await new Promise((resolve) => {
    for (const listener of fake.externalMessageListeners) {
      if (listener({ action, attemptId },
        { url: 'http://localhost:3000/coupang-shipments' },
        (response) => { responses.push(response); resolve(); }) === true) keptAlive += 1;
    }
  });
  assert.equal(keptAlive, 1);
  assert.equal(responses.length, 1);
  assert.equal(responses[0].success, false);
  assert.match(responses[0].error, /login is required/);
  assert.deepEqual(fake.createdTabs, []);
});

test('Rocket PO source dispatch rejects caller-owned plans and authenticates before provider IO', async () => {
  const { fake, context } = bootServiceWorker();
  const action = 'collectRocketPoRows';
  const attemptId = '11111111-1111-4111-8111-111111111111';
  const contract = context.KidItemDomains.forExternalAction(action);
  assert.equal(typeof contract?.handle, 'function');
  for (const invalid of [
    { action, runId: attemptId }, { action, attemptId: [attemptId] },
    { action, attemptId, from: '2026-07-01' },
    { action, attemptId, attemptToken: 'caller-token' },
  ]) assert.throws(() => contract.validate(invalid), /Invalid Rocket PO attempt/);
  let keptAlive = 0;
  const responses = [];
  await new Promise((resolve) => {
    for (const listener of fake.externalMessageListeners) {
      if (listener({ action, attemptId }, { url: 'http://localhost:3000/rocket-orders' },
        (response) => { responses.push(response); resolve(); }) === true) keptAlive += 1;
    }
  });
  assert.equal(keptAlive, 1);
  assert.equal(responses.length, 1);
  assert.match(responses[0].error, /login is required/);
  assert.deepEqual(fake.createdTabs, []);
  assert.equal(context.KidItemDomains.capabilities().coupangRocketPoSourceOwnerV1, true);
  assert.equal(context.KidItemDomains.capabilities().coupangRocketPoCollectionSessionV1, undefined);
});

test('unreferenced Rocket list-only action is retired without removing the live source owner', () => {
  const { context } = bootServiceWorker();
  assert.equal(context.KidItemDomains.capabilities().listRocketPos, undefined);
  assert.equal(typeof context.KidItemDomains.forExternalAction('collectRocketPoRows')?.handle, 'function');
  const worker = readFileSync(path.join(backgroundRoot, 'orders/worker.js'), 'utf8');
  assert.equal(worker.includes('listRocketPos'), false);
  assert.equal(worker.includes('coupangRocketPoLifecycle'), false);
});

test('1688 direct source action reaches its owner through the external dispatcher', async () => {
  const { fake } = bootServiceWorker();
  const responses = [];
  let keptAlive = 0;

  for (const listener of fake.externalMessageListeners) {
    const result = listener(
      { action: 'collectSourcing1688Trends', idempotencyKey: '1688-direct-dispatch-key' },
      { url: 'http://localhost:3000/sourcing-ai/decision-center' },
      (response) => responses.push(response),
    );
    if (result === true) keptAlive += 1;
  }

  assert.equal(keptAlive, 1, 'direct source action must have one async owner');
  for (let index = 0; index < 10 && responses.length === 0; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.equal(responses.length, 1);
  assert.equal(responses[0].success, false);
  assert.equal(responses[0].terminalState, 'RUNNING');
  assert.match(responses[0].error, /로그인/);
  assert.deepEqual(fake.createdTabs, []);
});

test('TikTok direct source action reaches its owner through the external dispatcher', async () => {
  const { fake } = bootServiceWorker();
  const responses = [];
  let keptAlive = 0;

  for (const listener of fake.externalMessageListeners) {
    const result = listener(
      {
        action: 'collectSourcingTiktokCcTrends',
        idempotencyKey: 'tiktok-direct-dispatch-key',
        maxItems: 12,
        region: 'KR',
      },
      { url: 'http://localhost:3000/sourcing-ai/decision-center' },
      (response) => responses.push(response),
    );
    if (result === true) keptAlive += 1;
  }

  assert.equal(keptAlive, 1, 'direct source action must have one async owner');
  for (let index = 0; index < 10 && responses.length === 0; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.equal(responses.length, 1);
  assert.equal(responses[0].success, false);
  assert.equal(responses[0].terminalState, 'RUNNING');
  assert.match(responses[0].error, /로그인/);
  assert.deepEqual(fake.createdTabs, []);
});

test('Live Commerce direct source action reaches its owner through the external dispatcher', async () => {
  const { fake } = bootServiceWorker();
  const responses = [];
  let keptAlive = 0;

  for (const listener of fake.externalMessageListeners) {
    const result = listener(
      {
        action: 'collectSourcingLiveCommerce',
        idempotencyKey: 'live-commerce-direct-dispatch-key',
        url: 'https://live.douyin.com/123',
      },
      { url: 'http://localhost:3000/sourcing-ai/market' },
      (response) => responses.push(response),
    );
    if (result === true) keptAlive += 1;
  }

  assert.equal(keptAlive, 1, 'direct source action must have one async owner');
  for (let index = 0; index < 10 && responses.length === 0; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.equal(responses.length, 1);
  assert.equal(responses[0].success, false);
  assert.equal(responses[0].terminalState, 'RUNNING');
  assert.match(responses[0].error, /로그인/);
  assert.deepEqual(fake.createdTabs, []);
});
