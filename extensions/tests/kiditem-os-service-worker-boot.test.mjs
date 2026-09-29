import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { BrowserCollectionSessionViewSchema } from '@kiditem/shared/browser-collection-session';

// 주문수집 / 쿠팡 / 소싱 세 확장을 kiditem-os 하나로 합치면서 도메인 워커가
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
const canonicalize = value => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  return Object.fromEntries(Object.entries(value)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, nested]) => [key, canonicalize(nested)]));
};
const stableStringify = value => JSON.stringify(canonicalize(JSON.parse(JSON.stringify(value))));
const checksum = value => createHash('sha256').update(stableStringify(value)).digest('hex');

function createFakeChrome({ storageState = {}, storageAdapter = null } = {}) {
  const storage = storageState;
  const createdTabs = [];
  const externalMessageListeners = [];
  const connectExternalListeners = [];
  const installedListeners = [];
  // Every worker shares one global scope, so the script that registered a
  // listener is the only way a test can tell which domain owns it.
  const installedListenerScripts = [];
  let loadingScript = null;
  const createdAlarms = [];
  // A test fires a stored alarm through these, as Chrome does after a restart.
  const alarmListeners = [];
  const internalMessageListeners = [];
  const noopEvent = () => ({ addListener() {}, removeListener() {} });
  const defaultStorage = {
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
      for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key];
      callback?.();
    },
  };
  return {
    storage,
    createdTabs,
    externalMessageListeners,
    connectExternalListeners,
    installedListeners,
    installedListenerScripts,
    setLoadingScript: (script) => { loadingScript = script; },
    createdAlarms,
    alarmListeners,
    internalMessageListeners,
    chrome: {
      runtime: {
        id: 'kiditem-os-test',
        lastError: null,
        getManifest: () => manifest,
        onInstalled: {
          addListener: (listener) => {
            installedListeners.push(listener);
            installedListenerScripts.push({ script: loadingScript, listener });
          },
        },
        onStartup: noopEvent(),
        onConnect: noopEvent(),
        onMessage: { addListener: listener => internalMessageListeners.push(listener) },
        onMessageExternal: {
          addListener: (listener) => externalMessageListeners.push(listener),
        },
        onConnectExternal: {
          addListener: (listener) => connectExternalListeners.push(listener),
        },
      },
      alarms: {
        create: (name) => createdAlarms.push(name),
        clear(_name, callback) { callback?.(true); return Promise.resolve(true); },
        onAlarm: { addListener: (listener) => alarmListeners.push(listener), removeListener() {} },
      },
      storage: {
        local: storageAdapter || defaultStorage,
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
        async query(query) {
          if (query?.url === 'http://localhost:3000/*') {
            return [{ id: 1001, windowId: 1001, url: 'http://localhost:3000/dashboard' }];
          }
          if (query?.url === 'http://kiditem-office/*') {
            return [{ id: 1002, windowId: 1002, url: 'http://kiditem-office/dashboard' }];
          }
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

function bootServiceWorker({ fetch: fetchFn, storage, storageAdapter } = {}) {
  const fake = createFakeChrome({ storageState: storage, storageAdapter });
  const intervalHandles = new Set();
  const scheduleInterval = (...args) => {
    const handle = setInterval(...args);
    intervalHandles.add(handle);
    return handle;
  };
  const cancelInterval = (handle) => {
    clearInterval(handle);
    intervalHandles.delete(handle);
  };
  const close = () => {
    for (const handle of intervalHandles) cancelInterval(handle);
  };
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
    clearInterval: cancelInterval,
    clearTimeout,
    console,
    crypto,
    fetch: fetchFn ?? (async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '' })),
    setInterval: scheduleInterval,
    setTimeout,
    structuredClone,
    // 실제 서비스워커의 importScripts 와 같은 기준(서비스워커 위치)으로 푼다.
    importScripts(...files) {
      for (const file of files) {
        const script = file.split('?')[0];
        const filename = path.join(backgroundRoot, script);
        fake.setLoadingScript(script);
        try {
          vm.runInContext(readFileSync(filename, 'utf8'), context, { filename });
        } finally {
          fake.setLoadingScript(null);
        }
      }
    },
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  context = vm.createContext(sandbox);
  vm.runInContext(readFileSync(entryPath, 'utf8'), context, { filename: entryPath });
  return { fake, context, close };
}

function installTabEventHarness(fake) {
  const updatedListeners = new Set();
  const removedListeners = new Set();
  fake.chrome.tabs.onUpdated = {
    addListener(listener) { updatedListeners.add(listener); },
    removeListener(listener) { updatedListeners.delete(listener); },
  };
  fake.chrome.tabs.onRemoved = {
    addListener(listener) { removedListeners.add(listener); },
    removeListener(listener) { removedListeners.delete(listener); },
  };
  return {
    updatedListeners,
    removedListeners,
    emitUpdated(...args) {
      for (const listener of [...updatedListeners]) listener(...args);
    },
  };
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

function externalResponderCount(fake, message) {
  let responders = 0;
  for (const listener of fake.externalMessageListeners) {
    if (listener(message, { url: 'http://localhost:3000/advertising/keyword-rank' }, () => {}) === true) {
      responders += 1;
    }
  }
  return responders;
}

function internalRequest(fake, message, sender = {}) {
  return new Promise((resolve) => {
    let responders = 0;
    for (const listener of fake.internalMessageListeners) {
      if (listener(message, sender, resolve) === true) responders += 1;
    }
    assert.ok(responders >= 1);
  });
}

const catalogPermit = {
  attemptId: '11111111-1111-4111-8111-111111111111',
  attemptToken: '22222222-2222-4222-8222-222222222222',
  state: 'RUNNING',
  expiresAt: '2030-01-02T00:00:00.000Z',
  plan: {
    collectorVersion: 'wing-inventory-v1',
    listUrl: 'https://wing.coupang.com/tenants/seller-web/vendor-inventory/list?searchKeywordType=ALL&searchKeywords=&salesMethod=ALL&productStatus=ALL&stockSearchType=ALL&shippingFeeSearchType=ALL&displayCategoryCodes=&listingStartTime=null&listingEndTime=null&saleEndDateSearchType=ALL&bundledShippingSearchType=ALL&upBundling=ALL&displayDeletedProduct=false&shippingMethod=ALL&exposureStatus=ALL&locale=ko_KR&sortMethod=SORT_BY_ITEM_LEVEL_UNIT_SOLD&countPerPage=50&page=1',
    detailUrl: 'https://wing.coupang.com/tenants/seller-web/vendor-inventory/modify',
    channelAccountId: '33333333-3333-4333-8333-333333333333',
    vendorId: 'A00000000', publicationRevision: '0',
  },
};

test('retired generic scrape ingress has no external responder', async () => {
  const { fake } = bootServiceWorker();
  const responders = externalResponderCount(fake, { action: 'scrapeTargets', producer: 'channels.coupang_catalog',
    urls: [{ url: 'https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdKeyword=1', label: 'keywords' }] });
  assert.equal(responders, 0);
  assert.deepEqual(fake.createdTabs, []);
});

const coupangWindowJson = (value, status = 200) => ({ ok: status < 400, status, json: async () => structuredClone(value) });
test('the retired web and popup starts of window collections and the catalog import start nothing', async () => {
  const attemptId = '99111111-1111-4111-8111-111111111111';
  const requests = [];
  const h = bootServiceWorker({ fetch: async (url) => {
    requests.push(String(url));
    return coupangWindowJson({});
  } });
  h.fake.storage.kiditem_environment_profiles_v1 = { local: { accessToken: 'fixture' } };
  const windowsCreated = [];
  h.fake.chrome.windows.create = (properties, callback) => {
    windowsCreated.push(properties);
    callback?.({ id: 7, tabs: [{ id: 41, windowId: 7 }] });
  };
  try {
    for (const message of [
      { action: 'startCollection', idempotencyKey: randomUUID() },
      { action: 'collectAdvertisingCampaigns', attemptId },
      { action: 'collectAdvertisingKeywords', attemptId },
      { action: 'collectAdvertisingWingTraffic', attemptId },
      { action: 'collectAdvertisingWingItemwinner', attemptId },
      { action: 'collectAdvertisingProfitability', idempotencyKey: randomUUID() },
      { action: 'cancelAdvertisingCampaigns', attemptId },
      { action: 'cancelAdvertisingKeywords', attemptId },
      { action: 'cancelAdvertisingWingTraffic', attemptId },
      { action: 'cancelAdvertisingWingItemwinner', attemptId },
      { action: 'startCoupangCatalogImport', permit: catalogPermit },
      { action: 'getCoupangCatalogImportStatus', attemptId },
      { action: 'cancelCoupangCatalogImport', attemptId },
    ]) {
      assert.equal(externalResponderCount(h.fake, message), 0, message.action);
      assert.equal(vm.runInContext(`KidItemDomains.forExternalAction(${JSON.stringify(message.action)})`, h.context), null);
    }

    // The sourcing worker keeps every internal channel open, so a retired popup
    // action must look exactly like an action nobody owns.
    const openChannels = (message) => h.fake.internalMessageListeners
      .filter((listener) => listener(message, {}, () => {}) === true).length;
    const unowned = openChannels({ action: 'kiditemActionNobodyOwnsForTest' });
    for (const message of [
      { action: 'collectAdvertisingWingTrafficFromPopup', environmentId: 'local', url: 'https://wing.coupang.com/tenants/business-insight/sales-analysis?start_date=2026-09-05&end_date=2026-09-06' },
      { action: 'collectAdvertisingWingItemwinnerFromPopup', environmentId: 'local', url: 'https://wing.coupang.com/tenants/seller-price-management' },
      { action: 'collectAdvertisingCampaignsFromPopup', environmentId: 'local', url: 'https://advertising.coupang.com/marketing/dashboard/sales' },
      { action: 'monthlyScrape', year: 2026, month: 8, environmentId: 'local' },
    ]) {
      assert.equal(openChannels(message), unowned, message.action);
    }
    for (let turn = 0; turn < 25; turn += 1) await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(requests.filter((url) => url.includes('/api/ads/') || url.includes('/catalog-imports/')), []);
    assert.deepEqual(windowsCreated, []);
  } finally {
    h.close();
  }
});

test('retired Wing and SERP rank shells have no public worker responder', async () => {
  const requests = [];
  const { fake } = bootServiceWorker({ fetch: async (url) => {
    requests.push(String(url));
    return { ok: true, status: 200, json: async () => ({ targets: [] }) };
  } });
  for (const action of ['runWingSalesRankCheck', 'cancelWingSalesRankCheck', 'getWingSalesRankCheckStatus',
    'checkCoupangKeywordRank', 'runCoupangKeywordRankCheck', 'getCoupangRankCheckStatus']) {
    const responses = [];
    const responders = fake.externalMessageListeners.filter((listener) =>
      listener({ action, runId: 'retired-wing-run' },
        { url: 'http://localhost:3000/advertising/keyword-rank' },
        (response) => responses.push(response)) === true);
    assert.equal(responders.length, 0, action);
    await new Promise(setImmediate);
    assert.deepEqual(responses, [], action);
  }
  assert.deepEqual(requests, []);
  assert.deepEqual(fake.createdTabs, []);
});

test('retired Wing rank shell schedules are not installed', async () => {
  const { fake } = bootServiceWorker();
  for (const listener of fake.installedListeners) await listener({ reason: 'update' });
  assert.equal(fake.createdAlarms.some((name) =>
    name.includes('keyword-rank-check') || name.includes('wing-sales-rank-resume') || name.includes('coupang-keyword-serp-rank')), false);
});

test('an update removes the retired write-only local copies and keeps every other key', async (t) => {
  const retired = [
    'kiditem_last_sync_traffic',
    'kiditem_last_sync_itemwinner',
    'kiditem_last_sync_ads',
  ];
  const storage = {
    ...Object.fromEntries(retired.map((key) => [key, { time: 1, count: 1 }])),
    kiditem_unrelated_domain_state: { kept: true },
  };
  const { fake, close } = bootServiceWorker({ storage });
  t.after(close);

  for (const listener of fake.installedListeners) await listener({ reason: 'update' });
  await new Promise(setImmediate);

  for (const key of retired) assert.equal(key in fake.storage, false, key);
  assert.deepEqual(fake.storage.kiditem_unrelated_domain_state, { kept: true });
});

test('each domain worker removes only its own retired local copies on update', async (t) => {
  // Storage names are domain-unique, so the domain that wrote a key is the one
  // that retires it: Coupang its Wing/Ads sync stamps.
  const retiredByWorker = {
    'coupang/worker.js': [
      'kiditem_last_sync_traffic',
      'kiditem_last_sync_itemwinner',
      'kiditem_last_sync_ads',
    ],
  };
  const everyRetired = Object.values(retiredByWorker).flat();

  for (const [script, own] of Object.entries(retiredByWorker)) {
    const storage = {
      ...Object.fromEntries(everyRetired.map((key) => [key, { time: 1, count: 1 }])),
      kiditem_unrelated_domain_state: { kept: true },
    };
    const { fake, close } = bootServiceWorker({ storage });
    t.after(close);
    const listeners = fake.installedListenerScripts.filter((entry) => entry.script === script);
    assert.ok(listeners.length > 0, `${script} registers an install listener`);

    for (const { listener } of listeners) await listener({ reason: 'update' });
    await new Promise(setImmediate);

    for (const key of own) assert.equal(key in fake.storage, false, `${script} removes ${key}`);
    for (const key of everyRetired.filter((name) => !own.includes(name))) {
      assert.equal(key in fake.storage, true, `${script} keeps ${key}`);
    }
    assert.deepEqual(fake.storage.kiditem_unrelated_domain_state, { kept: true });
  }
});

test('Wing tab timeout keeps bounded target diagnostics and ignores unrelated tabs', async (t) => {
  const { fake, context, close } = bootServiceWorker();
  t.after(close);
  const events = installTabEventHarness(fake);
  const expectedUrl =
    'https://wing.coupang.com/tenants/seller-web/vendor-inventory/modify' +
    '?vendorInventoryId=220&token=expected-secret&redirect=https%3A%2F%2Fevil.test%2F';
  const unrelatedUrl =
    'https://login.coupang.com/login' +
    '?vendorInventoryId=999&page=99&token=unrelated-secret';
  const observedUrl =
    'https://wing.coupang.com/tenants/seller-web/vendor-inventory/modify' +
    '?vendorInventoryId=221&page=2&token=last-secret&redirect=https%3A%2F%2Fevil.test%2Flast';
  let getCalls = 0;
  fake.chrome.tabs.get = (id, callback) => {
    getCalls += 1;
    const tab = { id, status: 'loading', url: expectedUrl };
    callback?.(tab);
    return Promise.resolve(tab);
  };

  const pending = context.waitForTabComplete(41, { expectedUrl, timeoutMs: 20 });
  events.emitUpdated(99, { status: 'complete', url: unrelatedUrl }, {
    id: 99,
    status: 'complete',
    url: unrelatedUrl,
  });
  events.emitUpdated(41, { status: 'loading', url: observedUrl }, {
    id: 41,
    status: 'loading',
    url: observedUrl,
  });

  await assert.rejects(pending, (error) => {
    assert.match(error.message, /^Wing 탭 로딩 타임아웃;/);
    assert.match(error.message, /expectedPage=type=wing-inventory-modify,vendorInventoryId=220/);
    assert.match(error.message, /lastObservedStatus=loading/);
    assert.match(error.message, /lastObservedPage=type=wing-inventory-modify,vendorInventoryId=221,page=2/);
    assert.match(error.message, /navigationObserved=true/);
    assert.doesNotMatch(error.message, /token|redirect|expected-secret|unrelated-secret|last-secret|evil\.test/);
    assert.doesNotMatch(error.message, /vendorInventoryId=999|page=99/);
    assert.ok(error.message.length < 400);
    return true;
  });
  assert.equal(getCalls, 1, 'timeout diagnostics must not perform a second tabs.get');
  assert.equal(events.updatedListeners.size, 0, 'timeout cleanup removes onUpdated listener');
  assert.equal(events.removedListeners.size, 0, 'timeout cleanup removes onRemoved listener');
});

test('Wing timeout labels an observed login page without leaking numeric query values', async (t) => {
  const { fake, context, close } = bootServiceWorker();
  t.after(close);
  const events = installTabEventHarness(fake);
  const expectedUrl =
    'https://wing.coupang.com/tenants/seller-web/vendor-inventory/list';
  const loginUrl =
    'https://login.coupang.com/login' +
    '?vendorInventoryId=998&page=99&token=login-secret&redirect=https%3A%2F%2Fevil.test%2Flogin';
  let getCalls = 0;
  fake.chrome.tabs.get = (id, callback) => {
    getCalls += 1;
    const tab = { id, status: 'loading', url: loginUrl };
    callback?.(tab);
    return Promise.resolve(tab);
  };

  const pending = context.waitForTabComplete(43, { expectedUrl, timeoutMs: 20 });
  await assert.rejects(pending, (error) => {
    assert.match(error.message, /^Wing 탭 로딩 타임아웃;/);
    assert.match(error.message, /expectedPage=type=wing-inventory-list/);
    assert.match(error.message, /lastObservedStatus=loading/);
    assert.match(error.message, /lastObservedPage=type=coupang-login/);
    assert.match(error.message, /navigationObserved=false/);
    assert.doesNotMatch(error.message, /998|99|login-secret|redirect|evil\.test/);
    assert.ok(error.message.length < 300);
    return true;
  });
  assert.equal(getCalls, 1, 'login timeout diagnostics must not re-read the tab');
  assert.equal(events.updatedListeners.size, 0, 'timeout cleanup removes onUpdated listener');
  assert.equal(events.removedListeners.size, 0, 'timeout cleanup removes onRemoved listener');
});

test('Wing tab completion still resolves and cleans up listeners before timeout', async (t) => {
  const { fake, context, close } = bootServiceWorker();
  t.after(close);
  const events = installTabEventHarness(fake);
  const expectedUrl =
    'https://wing.coupang.com/tenants/seller-web/vendor-inventory/list?page=2';
  const tab = { id: 42, status: 'complete', url: expectedUrl };
  fake.chrome.tabs.get = (id, callback) => {
    const current = { ...tab, id };
    callback?.(current);
    return Promise.resolve(current);
  };

  const result = await context.waitForTabComplete(42, {
    expectedUrl,
    timeoutMs: 100,
  });
  assert.deepEqual(result, tab);
  assert.equal(events.updatedListeners.size, 0, 'success cleanup removes onUpdated listener');
  assert.equal(events.removedListeners.size, 0, 'success cleanup removes onRemoved listener');
  events.emitUpdated(42, { status: 'loading', url: expectedUrl }, {
    ...tab,
    status: 'loading',
  });
  assert.equal(events.updatedListeners.size, 0);
});


test('통합 서비스워커가 두 도메인 워커를 싣고 부팅한다', () => {
  const { fake, context } = bootServiceWorker();

  // 웹앱 메시지는 새 런타임 dispatch 하나가 받는다(KID-366) — 옛 워커는 KidItemDomains 표에만 올리고, 새 dispatch가
  // 모르는 액션을 그 표로 넘긴다.
  assert.equal(fake.externalMessageListeners.length, 1);
  assert.ok(context.KidItemDomains);
});

test('브라우저 Operation runtime과 공용 dispatch 연결은 등록되지 않는다', () => {
  const source = readFileSync(entryPath, 'utf8');
  const { context } = bootServiceWorker();
  assert.doesNotMatch(source, /operation-runtime-client\.js/);
  assert.doesNotMatch(source, /KidItemOperationRuntimeClient|browserOperationRuntime|operationRuntime/);
  assert.equal(typeof context.KidItemDomains.runOperation, 'undefined');
});

test('wakeOperationRuntime은 더 이상 어떤 외부 리스너에도 등록·응답되지 않는다', () => {
  const { fake } = bootServiceWorker();
  let responses = 0;
  let keptAlive = 0;

  for (const listener of fake.externalMessageListeners) {
    const result = listener(
      { action: 'wakeOperationRuntime' },
      { url: 'http://localhost:3000/sourcing-ai/wing-catalog' },
      () => { responses += 1; },
    );
    if (result === true) keptAlive += 1;
  }

  assert.equal(keptAlive, 0);
  assert.equal(responses, 0);
});

test('ping 이 도메인과 새 런타임의 capabilities 를 합쳐 한 번만 응답한다', async () => {
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
  // shared PingResponseSchema: capability 값은 boolean뿐이다.
  for (const [name, value] of Object.entries(response.capabilities)) assert.equal(typeof value, 'boolean', name);
  for (const capability of [
    // 주문수집
    'orderCollectionFailureEvidenceV1',
    'orderCollectionConfirmedCoverageV1',
    // 새 런타임 entry 액션 묶음(KID-366)
    'mallLoginActionsV1',
    'coupangShipmentActionsV1',
    'mallImageHostV1',
    'mallCategoryReadV1',
    'wingInventoryExportV1',
    // 쿠팡
    'coupangCatalogSnapshot',
    // 몰 쓰기 실행 kind(등록·품절·재개·가격·대표이미지, KID-256)
    'channelsRegistrationOperationKindV1',
    // Orders 작업 kind 6종(셀피아 전송·후처리·자동송장·스냅샷, 쿠팡 배송 목록, 몰 송장 업로드 — KID-366 wave8b)
    'orderActionOperationKindsV1',
    // 새 런타임(소싱 실행 kind KID-360, 광고 키워드·경쟁사 kind KID-362)
    'operationRuntime',
    'sourcingOperationKindsV1',
    'advertisingKeywordOperationKindsV1',
    // Channels 기타 kind(사방넷·몰 관리자·셀피아 수동매칭, KID-363)
    'channelsOperationKindsV1',
    // 새 런타임이 operation.start의 사이트 로그인 자격을 받는다(KID-377)
    'operationLoginV1',
    // 공통
    'browserCollectionSessions',
  ]) {
    assert.equal(response.capabilities[capability], true, capability);
  }
  // 옛 광고 수집(캠페인·키워드·수익성)은 새 런타임의 advertising.ad_report 실행 kind다(KID-373).
  // 옛 entry 액션 capability는 별칭 없이 사라졌다(KID-366) — 프로필 지원은 operationRuntime으로 판단한다.
  for (const retired of [
    'kiditemEnvironmentProfilesV1',
    'mallLoginTestV1',
    'mallLoginCheckV2',
    'publicImageHostV1',
    'mallCategoryLookup',
    'coupangShipmentDownloads',
    'clearCoupangCookies',
    'collectionStartV1',
    'profitabilityAdvertisingSourceOwnerV1',
    'advertisingCampaignSourceOwnerV1',
    'advertisingKeywordSourceOwnerV1',
  ]) {
    assert.equal(response.capabilities[retired], undefined, retired);
  }
});

test('도메인이 서로 겹치지 않는 producer 접두사를 등록한다', () => {
  const { context } = bootServiceWorker();
  const domains = context.KidItemDomains;

  const expected = {
    'orders.mall': 'cancelCollectionSession',
    'orders.sellpia_manual_match': 'cancelCollectionSession',
  };
  for (const [producer, operation] of Object.entries(expected)) {
    const domain = domains.forProducer(producer);
    assert.ok(domain, producer);
    assert.equal(typeof domain[operation], 'function', `${producer}.${operation}`);
  }
  assert.equal(domains.forProducer('unknown.thing'), null);
  // 쿠팡 도메인에는 수집 세션 producer가 없다 — 윙 카탈로그·상품은 실행 kind다(KID-365).
  assert.equal(domains.forProducer('channels.coupang_catalog'), null);
  assert.equal(domains.forProducer('dashboard.coupang_products'), null);
  // 광고 수집은 수집 세션 producer가 아니라 실행 kind다(KID-373).
  assert.equal(domains.forProducer('advertising.ad_report'), null);
  // 셀피아 재고는 수집 세션 producer가 아니라 실행 kind다(KID-361).
  assert.equal(domains.forProducer('inventory.sellpia'), null);
  // 소싱 수집은 수집 세션 producer가 아니라 실행 kind다(KID-360).
  assert.equal(domains.forProducer('sourcing.1688_trend'), null);
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
  // 추천 키워드 수집은 operation.start{kind: sourcing.coupang_keyword_suggestion}로만 시작한다(KID-360).
  assert.equal(context.KidItemDomains.forExternalAction('collectSourcingKeywordSuggestions'), null);
  assert.equal(context.KidItemDomains.capabilities().sourcingKeywordSuggestionSourceOwnerV1, undefined);
  // operation.start·cancel은 새 런타임 dispatch 자신의 액션이다(KID-366) — 옛 표에 없다.
  assert.equal(context.KidItemDomains.forExternalAction('operation.start'), null);
});

test('retired advertising account-day KPI actions, content step and capability are not registered', () => {
  const { fake, context } = bootServiceWorker();
  for (const action of ['collectAdvertisingAccountDailyKpis', 'cancelAdvertisingAccountDailyKpis']) {
    assert.equal(context.KidItemDomains.forExternalAction(action), null, action);
  }
  const capabilities = context.KidItemDomains.capabilities();
  assert.equal(capabilities.advertisingAccountDailyKpiSourceOwnerV1, undefined);
  assert.equal(context.KidItemDomains.forExternalAction('startCollection'), null);

  // The sourcing worker's catch-all listener keeps every channel open, so the
  // retired content step must be treated exactly like an action nobody owns:
  // the same listeners stay open and none answers it.
  const dispatch = (action) => {
    let keptAlive = 0;
    const responses = [];
    for (const listener of fake.internalMessageListeners) {
      const result = listener(
        { action, attemptId: '11111111-1111-4111-8111-111111111111', step: 'resume' },
        { tab: { id: 41 }, url: 'https://advertising.coupang.com/marketing/dashboard/sales', frameId: 0 },
        (value) => responses.push(value),
      );
      if (result === true) keptAlive += 1;
    }
    return { keptAlive, responses };
  };
  const retired = dispatch('advertisingAccountDailyKpiSourceStep');
  const unknown = dispatch('kiditemActionNobodyOwnsForTest');
  assert.equal(retired.keptAlive, unknown.keptAlive, 'the retired step must not gain an owner listener');
  assert.deepEqual(retired.responses, unknown.responses);
});

test('외부 장기 실행 포트를 공용 dispatch 하나가 소유 도메인으로 전달한다', () => {
  const { fake } = bootServiceWorker();
  assert.equal(fake.connectExternalListeners.length, 1);
  const [dispatch] = fake.connectExternalListeners;

  // 셀피아 수동매칭 포트(kiditem-sellpia-manual-match-v1)는 실행 계약 kind로 옮겨 없다(KID-363). 윙 상품등록 포트
  // (kiditem-wing-form-v1)도 실행 kind `channels.registration`으로 옮겨 없다(KID-256) — 소유 도메인이 없으면 끊는다.
  for (const name of ['kiditem-wing-form-v1']) {
    let disconnected = 0;
    dispatch({
      name,
      sender: { url: 'http://kiditem-office/product-hub/matching' },
      onMessage: { addListener: () => assert.fail(`${name} must not be owned`) },
      postMessage() {},
      disconnect() { disconnected += 1; },
    });
    assert.equal(disconnected, 1, name);
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
  // 소싱 확장 수집 6종은 옛 직접 액션 없이 operation.start 하나로 시작한다(KID-360).
  for (const retired of [
    // 쿠팡 쉽먼트 발송일 조회는 실행 kind orders.coupang_shipment_summary다(KID-359).
    'collectCoupangShipmentDateSummary',
    // 쿠팡 로켓 PO 수집은 실행 kind orders.coupang_rocket_po다(KID-359).
    'collectRocketPoRows',
    // 쿠팡 직배송 발주 수집은 실행 kind orders.coupang_directship다(KID-359).
    'collectCoupangDirectOrders',
    'collectSourcing1688Trends',
    'collectSourcingTiktokCcTrends',
    'collectSourcingLiveCommerce',
    'collectSourcingWingCatalog',
    'collectSourcingKeywordSuggestions',
  ]) {
    assert.equal(context.KidItemDomains.forExternalAction(retired), null, retired);
  }
  assert.equal(context.KidItemDomains.forExternalAction('operation.start'), null);
});

test('operation.start·cancel은 새 런타임 dispatch가 shared 스키마로 검증해 답한다', async () => {
  const { fake } = bootServiceWorker();
  const response = await externalRequest(fake, { action: 'operation.cancel', operationId: 'not-a-uuid' });
  assert.equal(response.success, false);
  assert.equal(response.errorCode, 'VALIDATION_FAILED');
});

// 옛 소싱 워커가 받던 인증 전달(KID-360 이후 쿠팡 워커 하나가 받는다): 보낸 KidItem 환경의 프로필에만 쓴다.
async function sendExternalOnce(fake, message, url) {
  return new Promise((resolve) => {
    let answered = false;
    for (const listener of fake.externalMessageListeners) {
      listener(message, { url }, (response) => {
        if (!answered) { answered = true; resolve(response); }
      });
    }
  });
}

test('setAuthToken from a KidItem origin stores the token in that environment profile, and clearAuthToken removes only it', async (t) => {
  const { fake, close } = bootServiceWorker({
    storage: { kiditem_environment_profiles_v1: { office: { accessToken: 'office-token', updatedAt: 2 } } },
  });
  t.after(close);

  const stored = await sendExternalOnce(fake, { action: 'setAuthToken', token: 'token-from-web' }, 'http://localhost:3000/sourcing-ai');
  assert.equal(stored?.success, true);
  assert.equal(fake.storage.kiditem_environment_profiles_v1.local.accessToken, 'token-from-web');
  assert.equal(fake.storage.kiditem_environment_profiles_v1.office.accessToken, 'office-token');

  const cleared = await sendExternalOnce(fake, { action: 'clearAuthToken' }, 'http://localhost:3000/sourcing-ai');
  assert.equal(cleared?.success, true);
  assert.equal(fake.storage.kiditem_environment_profiles_v1.local, undefined);
  assert.equal(fake.storage.kiditem_environment_profiles_v1.office.accessToken, 'office-token');
});
