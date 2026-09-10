import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { BrowserCollectionSessionViewSchema } from '@kiditem/shared/browser-collection-session';

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
  const createdAlarms = [];
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
    createdAlarms,
    internalMessageListeners,
    chrome: {
      runtime: {
        id: 'kiditem-os-test',
        lastError: null,
        getManifest: () => manifest,
        onInstalled: { addListener: (listener) => installedListeners.push(listener) },
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
      alarms: { create: (name) => createdAlarms.push(name), clear(_name, callback) { callback?.(true); return Promise.resolve(true); }, onAlarm: noopEvent() },
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
        const filename = path.join(backgroundRoot, file.split('?')[0]);
        vm.runInContext(readFileSync(filename, 'utf8'), context, { filename });
      }
    },
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  context = vm.createContext(sandbox);
  vm.runInContext(readFileSync(entryPath, 'utf8'), context, { filename: entryPath });
  return { fake, context, close };
}

test('internal Ads progress routes only a validated sender tab to its bound environment collector', async () => {
  const h = bootServiceWorker();
  const received = [];
  h.context.progressRecorder = input => { received.push(JSON.parse(JSON.stringify(input))); return { accepted: true }; };
  vm.runInContext('adCenterCollectors.local = { reportProgress: progressRecorder }; adCenterCollectors.office = { reportProgress: progressRecorder };', h.context);
  await vm.runInContext('coupangEnvironment.bindTab(41, "local")', h.context);
  await vm.runInContext('coupangEnvironment.bindTab(42, "office")', h.context);
  const dispatch = (message, sender) => new Promise((resolve, reject) => {
    let handled = false;
    let responded = false;
    for (const listener of h.fake.internalMessageListeners) {
      handled = listener(message, sender, value => { responded = true; resolve(value); }) === true || handled;
    }
    if (!handled && !responded) reject(new Error('No internal responder'));
  });
  const message = { action: 'reportCollectionTargetProgress', runId: 'owner-attempt', progress: { current: 1, total: 3 } };
  const sender = tabId => ({ url: 'https://advertising.coupang.com/marketing/dashboard', tab: { id: tabId } });
  try {
    for (const tabId of [41, 42]) assert.equal((await dispatch(message, sender(tabId))).accepted, true);
    assert.deepEqual(received.map(value => [value.environmentId, value.attemptId, value.tabId]), [
      ['local', 'owner-attempt', 41], ['office', 'owner-attempt', 42],
    ]);
    for (const [invalidMessage, invalidSender] of [
      [{ ...message, environmentId: 'office' }, sender(41)],
      [{ ...message, progress: [] }, sender(41)],
      [message, { ...sender(41), url: 'https://example.test/' }],
      [message, { ...sender(41), url: 'https://user@advertising.coupang.com/' }],
      [message, { url: sender(41).url }],
      [message, sender(43)],
    ]) assert.equal((await dispatch(invalidMessage, invalidSender)).success, false);
    assert.equal(received.length, 2, 'invalid progress must not reach a source collector');
  } finally { h.close(); }
});

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

const ORDER_ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const ORDER_SOURCE_RUN_ID = '33333333-3333-4333-8333-333333333333';
const ORDER_CHANNEL_ACCOUNT_ID = '44444444-4444-4444-8444-444444444444';
const ORDER_ATTEMPT_TOKEN = '22222222-2222-4222-8222-222222222222';
const ORDER_REFRESHED_ATTEMPT_TOKEN = '66666666-6666-4666-8666-666666666666';
const ORDER_ARTIFACT_ID = '55555555-5555-4555-8555-555555555555';

function orderControl(overrides = {}) {
  return {
    attemptId: ORDER_ATTEMPT_ID,
    sourceImportRunId: ORDER_SOURCE_RUN_ID,
    attemptToken: ORDER_ATTEMPT_TOKEN,
    state: 'RUNNING',
    plan: {
      sourceType: 'order_collection_mall',
      parserVersion: 'order-collection-v1',
      mallKey: 'kidsnote',
      mallName: '키즈노트',
      channelAccountId: ORDER_CHANNEL_ACCOUNT_ID,
      collectionDate: '2026-09-06',
      collectionMode: 'browser',
    },
    expiresAt: '2099-01-01T00:00:00.000Z',
    artifactId: null,
    errorCode: null,
    errorMessage: null,
    ...overrides,
  };
}

function orderJsonResponse(body, { status = 200, headers = {} } = {}) {
  const payload = structuredClone(body);
  const response = {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    async json() { return structuredClone(payload); },
    async text() { return JSON.stringify(payload); },
  };
  response.clone = () => orderJsonResponse(payload, { status, headers });
  return response;
}

function installOrderProviderSeam(fake, capture, { onProviderCall = null } = {}) {
  let tab;
  const removedTabs = [];
  const originalCreate = fake.chrome.tabs.create;
  fake.chrome.tabs.create = async (properties) => {
    tab = {
      ...(await originalCreate(properties)),
      status: 'complete',
    };
    return tab;
  };
  fake.chrome.tabs.get = async (id, callback) => {
    const current = tab && tab.id === id
      ? tab
      : { id, windowId: 1, status: 'complete', url: 'https://shop.kidsnote.com/_manage/?body=3010' };
    callback?.(current);
    return current;
  };
  fake.chrome.tabs.remove = async (id) => {
    removedTabs.push(id);
    if (tab?.id === id) tab = null;
  };
  fake.chrome.scripting.executeScript = async ({ func, args } = {}) => {
    if (func?.name !== 'scrapeKidsnoteOrders') return [];
    onProviderCall?.({ func, args, tabId: tab?.id });
    return [{ result: structuredClone(capture) }];
  };
  return {
    removedTabs,
    get tab() { return tab; },
  };
}

function createOrderInterfaceHarness({
  initialControl = orderControl(),
  storage = {},
  converter = null,
  storageAdapter = null,
} = {}) {
  let current = structuredClone(initialControl);
  const requests = [];
  let providerCalls = 0;
  let converterCalls = 0;
  const fetchFn = async (url, init = {}) => {
    const href = String(url);
    const method = init.method || 'GET';
    requests.push({ href, method, init });
    if (href.endsWith(`/api/orders/collection/attempts/${ORDER_ATTEMPT_ID}/control`)) {
      return orderJsonResponse(current);
    }
    if (href.endsWith('/api/orders/collection/kidsnote/convert')) {
      converterCalls += 1;
      const input = {
        call: converterCalls,
        body: init.body,
        headers: new Headers(init.headers),
        current: structuredClone(current),
        setControl(next) { current = structuredClone(next); },
      };
      if (converter) return converter(input);
      current = {
        ...current,
        state: 'COMPLETE',
        artifactId: ORDER_ARTIFACT_ID,
      };
      return orderJsonResponse({}, {
        headers: {
          'X-Order-Collection-Artifact-Id': ORDER_ARTIFACT_ID,
          'X-Order-Collection-Source-Rows': '1',
          'X-Order-Collection-Product-Rows': '1',
          'X-Order-Collection-Output-Rows': '1',
          'X-Order-Collection-Skipped-Rows': '0',
          'Content-Disposition': 'attachment; filename="kidsnote.xls"',
        },
      });
    }
    if (href.endsWith(`/api/orders/collection/attempts/${ORDER_ATTEMPT_ID}/fail`)) {
      const body = JSON.parse(String(init.body));
      current = {
        ...current,
        state: 'FAILED',
        errorCode: body.code,
        errorMessage: body.message,
      };
      return orderJsonResponse(current);
    }
    return orderJsonResponse({});
  };

  function boot(options = {}) {
    const h = bootServiceWorker({
      fetch: fetchFn,
      storage,
      storageAdapter,
    });
    h.fake.storage.kiditem_environment_profiles_v1 = {
      ...(h.fake.storage.kiditem_environment_profiles_v1 || {}),
      local: { accessToken: 'fixture-token' },
    };
    if (options.capture !== undefined) {
      installOrderProviderSeam(h.fake, options.capture, {
        onProviderCall(input) {
          providerCalls += 1;
          options.onProviderCall?.(input);
        },
      });
    }
    return h;
  }

  return {
    boot,
    storage,
    requests,
    get control() { return structuredClone(current); },
    setControl(next) { current = structuredClone(next); },
    get providerCalls() { return providerCalls; },
    get converterCalls() { return converterCalls; },
  };
}

function createStorageAdapter(state, { beforeSet } = {}) {
  return {
    async get(key, callback) {
      const result = key == null ? { ...state }
        : typeof key === 'string' ? { [key]: state[key] }
        : Array.isArray(key) ? Object.fromEntries(key.map((name) => [name, state[name]]))
        : Object.fromEntries(Object.entries(key).map(([name, fallback]) => [
          name,
          state[name] === undefined ? fallback : state[name],
        ]));
      callback?.(result);
      return result;
    },
    async set(values, callback) {
      await beforeSet?.(values);
      Object.assign(state, values);
      callback?.();
    },
    async remove(keys, callback) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete state[key];
      callback?.();
    },
  };
}

const orderCapture = {
  success: true,
  orders: [{
    ono: '20260906-K-1',
    orderedAt: '2026-09-06 10:20',
    productName: '실물 주문',
    ordererName: '구매자',
    totalAmount: 12000,
    paidAmount: 12000,
    payMethod: 'card',
    status: '배송준비중',
  }],
  rawProviderEvidence: { page: 1 },
};

test('real Orders entry fences a cancellation while saving the captured provider artifact', async () => {
  const storage = {};
  const storageSetStarted = Promise.withResolvers();
  const releaseStorageSet = Promise.withResolvers();
  const storageAdapter = createStorageAdapter(storage, {
    beforeSet: async (values) => {
      if (!Object.keys(values).some((key) => key.startsWith('orderCollectionPendingSubmissionV1:'))) return;
      storageSetStarted.resolve();
      await releaseStorageSet.promise;
    },
  });
  const harness = createOrderInterfaceHarness({ storage, storageAdapter });
  const first = harness.boot({ capture: orderCapture });
  const request = {
    action: 'collectKidsnoteOrders',
    attemptId: ORDER_ATTEMPT_ID,
    serverOwned: true,
  };
  try {
    const collecting = externalRequest(first.fake, request);
    await storageSetStarted.promise;
    assert.equal(harness.providerCalls, 1);
    assert.equal(harness.converterCalls, 0);

    const cancelled = await externalRequest(first.fake, {
      action: 'cancelCollectionSession',
      attemptId: ORDER_ATTEMPT_ID,
    });
    assert.equal(cancelled.success, false);
    assert.equal(cancelled.terminalState, 'FAILED');
    assert.equal(cancelled.errorCode, 'COLLECTION_CANCELLED');

    releaseStorageSet.resolve();
    const result = await collecting;
    assert.equal(result.success, false);
    assert.equal(result.terminalState, 'RUNNING');
    assert.equal(result.continuationRequired, false);
    assert.equal(result.errorCode, 'COLLECTION_CANCELLED');
    assert.equal(harness.converterCalls, 0, 'a cancellation during persistence cannot submit the capture');
    assert.equal(harness.control.state, 'FAILED');
    assert.equal(
      Object.keys(storage).some((key) => key.startsWith('orderCollectionPendingSubmissionV1:')),
      false,
    );
  } finally {
    releaseStorageSet.resolve();
    first.close();
  }
});

test('real Orders entry fences a cancellation while saving a durable replay', async () => {
  const storage = {};
  let pendingWriteCount = 0;
  const storageSetStarted = Promise.withResolvers();
  const releaseStorageSet = Promise.withResolvers();
  const storageAdapter = createStorageAdapter(storage, {
    beforeSet: async (values) => {
      if (!Object.keys(values).some((key) => key.startsWith('orderCollectionPendingSubmissionV1:'))) return;
      pendingWriteCount += 1;
      if (pendingWriteCount !== 2) return;
      storageSetStarted.resolve();
      await releaseStorageSet.promise;
    },
  });
  const harness = createOrderInterfaceHarness({
    storage,
    storageAdapter,
    converter: async (input) => {
      if (input.call === 1) throw new Error('conversion acknowledgement lost');
      input.setControl({ ...input.current, state: 'COMPLETE', artifactId: ORDER_ARTIFACT_ID });
      return orderJsonResponse({}, {
        headers: { 'X-Order-Collection-Artifact-Id': ORDER_ARTIFACT_ID },
      });
    },
  });
  const worker = harness.boot({ capture: orderCapture });
  const request = {
    action: 'collectKidsnoteOrders',
    attemptId: ORDER_ATTEMPT_ID,
    serverOwned: true,
  };
  try {
    const first = await externalRequest(worker.fake, request);
    assert.equal(first.terminalState, 'RUNNING');
    assert.equal(first.ownerReconciliation, 'required');
    assert.equal(harness.providerCalls, 1);
    assert.equal(harness.converterCalls, 1);

    const replay = externalRequest(worker.fake, request);
    await storageSetStarted.promise;
    const cancelled = await externalRequest(worker.fake, {
      action: 'cancelCollectionSession',
      attemptId: ORDER_ATTEMPT_ID,
    });
    assert.equal(cancelled.errorCode, 'COLLECTION_CANCELLED');
    releaseStorageSet.resolve();
    const result = await replay;
    assert.equal(result.errorCode, 'COLLECTION_CANCELLED');
    assert.equal(result.terminalState, 'RUNNING');
    assert.equal(result.continuationRequired, false);
    assert.equal(harness.providerCalls, 1);
    assert.equal(harness.converterCalls, 1, 'cancelled replay must not submit a second conversion');
    assert.equal(harness.control.state, 'FAILED');
  } finally {
    releaseStorageSet.resolve();
    worker.close();
  }
});

test('real Orders entry replays the durable capture after a lost conversion acknowledgement', async () => {
  const storage = {};
  const converterAttempts = [];
  const harness = createOrderInterfaceHarness({
    storage,
    converter: async (input) => {
      converterAttempts.push(input);
      if (input.call === 1) throw new Error('conversion acknowledgement lost');
      input.setControl({
        ...input.current,
        state: 'COMPLETE',
        artifactId: ORDER_ARTIFACT_ID,
      });
      return orderJsonResponse({}, {
        headers: { 'X-Order-Collection-Artifact-Id': ORDER_ARTIFACT_ID },
      });
    },
  });
  const first = harness.boot({ capture: orderCapture });
  const request = {
    action: 'collectKidsnoteOrders',
    attemptId: ORDER_ATTEMPT_ID,
    serverOwned: true,
  };
  try {
    const uncertain = await externalRequest(first.fake, request);
    assert.equal(uncertain.success, false);
    assert.equal(uncertain.terminalState, 'RUNNING');
    assert.equal(uncertain.errorCode, 'SOURCE_OWNER_UNAVAILABLE');
    assert.equal(uncertain.ownerReconciliation, 'required');
    assert.equal(JSON.stringify(uncertain).includes('rawProviderEvidence'), false);
    assert.equal(harness.providerCalls, 1);
    assert.equal(harness.converterCalls, 1);
    assert.equal(JSON.stringify(storage).includes(ORDER_ATTEMPT_TOKEN), false);
    assert.equal(harness.control.state, 'RUNNING');

    const complete = await externalRequest(first.fake, request);
    assert.equal(complete.success, true);
    assert.equal(complete.terminalState, 'COMPLETE');
    assert.equal(complete.conversion, undefined, 'the owner projection is the terminal receipt boundary');
    assert.equal(harness.providerCalls, 1, 'replay must not revisit the provider');
    assert.equal(harness.converterCalls, 2);
    assert.equal(harness.requests.some(({ href }) => href.endsWith('/fail')), false);
    assert.equal(JSON.stringify(storage).includes(ORDER_ATTEMPT_TOKEN), false);
    assert.equal(JSON.stringify(storage).includes(ORDER_REFRESHED_ATTEMPT_TOKEN), false);
    assert.equal(converterAttempts[1].headers.get('x-source-attempt-token'), ORDER_ATTEMPT_TOKEN);
    assert.deepEqual(JSON.parse(String(converterAttempts[1].body)).orders, orderCapture.orders.map((order) => ({
      ono: order.ono,
      orderedAt: order.orderedAt,
      paidAt: '',
      buyer: order.ordererName,
      total: order.totalAmount,
      paid: order.paidAmount,
      payMethod: order.payMethod,
      status: order.status,
      receiver: order.ordererName,
      mobile: '',
      tel: '',
      zip: '',
      address: '',
      request: '',
      items: [{ productName: order.productName, qty: 1, option: '', shipFee: 0 }],
    })));
    assert.equal(harness.control.artifactId, ORDER_ARTIFACT_ID);
  } finally {
    first.close();
  }
});

test('real Orders entry reconciles a conversion committed before its acknowledgement was lost', async () => {
  const storage = {};
  const harness = createOrderInterfaceHarness({
    storage,
    converter: async (input) => {
      input.setControl({
        ...input.current,
        state: 'COMPLETE',
        artifactId: ORDER_ARTIFACT_ID,
      });
      throw new Error('conversion acknowledgement lost after commit');
    },
  });
  const worker = harness.boot({ capture: orderCapture });
  const request = {
    action: 'collectKidsnoteOrders',
    attemptId: ORDER_ATTEMPT_ID,
    serverOwned: true,
  };
  try {
    const result = await externalRequest(worker.fake, request);
    assert.equal(result.success, true);
    assert.equal(result.terminalState, 'COMPLETE');
    assert.equal(result.errorCode, undefined);
    assert.equal(result.error, undefined);
    assert.equal(Object.prototype.hasOwnProperty.call(result, 'sourcePayload'), false);
    assert.equal(JSON.stringify(result).includes('rawProviderEvidence'), false);
    assert.equal(harness.providerCalls, 1);
    assert.equal(harness.converterCalls, 1);
    assert.equal(harness.requests.some(({ href }) => href.endsWith('/fail')), false);
    assert.equal(
      Object.keys(storage).some((key) => key.startsWith('orderCollectionPendingSubmissionV1:')),
      false,
    );
    assert.equal(harness.control.artifactId, ORDER_ARTIFACT_ID);
  } finally {
    worker.close();
  }
});

test('real Orders entry survives a worker restart and rereads the refreshed attempt token', async () => {
  const storage = {};
  const converterAttempts = [];
  const harness = createOrderInterfaceHarness({
    storage,
    converter: async (input) => {
      converterAttempts.push(input);
      if (input.call === 1) throw new Error('conversion acknowledgement lost');
      input.setControl({
        ...input.current,
        state: 'COMPLETE',
        artifactId: ORDER_ARTIFACT_ID,
      });
      return orderJsonResponse({}, {
        headers: { 'X-Order-Collection-Artifact-Id': ORDER_ARTIFACT_ID },
      });
    },
  });
  const request = {
    action: 'collectKidsnoteOrders',
    attemptId: ORDER_ATTEMPT_ID,
    serverOwned: true,
  };
  const first = harness.boot({ capture: orderCapture });
  let second;
  try {
    const uncertain = await externalRequest(first.fake, request);
    assert.equal(uncertain.terminalState, 'RUNNING');
    assert.equal(uncertain.ownerReconciliation, 'required');
    assert.equal(harness.providerCalls, 1);
    assert.equal(JSON.stringify(storage).includes(ORDER_ATTEMPT_TOKEN), false);
    assert.equal(JSON.stringify(storage).includes(ORDER_REFRESHED_ATTEMPT_TOKEN), false);
    first.close();

    harness.setControl({
      ...harness.control,
      attemptToken: ORDER_REFRESHED_ATTEMPT_TOKEN,
    });
    assert.equal(JSON.stringify(storage).includes(ORDER_ATTEMPT_TOKEN), false);
    assert.equal(JSON.stringify(storage).includes(ORDER_REFRESHED_ATTEMPT_TOKEN), false);
    second = harness.boot({ capture: orderCapture });
    const complete = await externalRequest(second.fake, request);
    assert.equal(complete.success, true);
    assert.equal(complete.terminalState, 'COMPLETE');
    assert.equal(harness.providerCalls, 1, 'a fresh worker must replay the durable capture');
    assert.equal(second.fake.createdTabs.length, 0, 'restart replay must not open a provider tab');
    assert.equal(harness.converterCalls, 2);
    assert.equal(harness.requests.some(({ href }) => href.endsWith('/fail')), false);
    assert.equal(JSON.stringify(storage).includes(ORDER_ATTEMPT_TOKEN), false);
    assert.equal(JSON.stringify(storage).includes(ORDER_REFRESHED_ATTEMPT_TOKEN), false);
    assert.equal(
      converterAttempts[1].headers.get('x-source-attempt-token'),
      ORDER_REFRESHED_ATTEMPT_TOKEN,
    );
  } finally {
    first.close();
    second?.close();
  }
});

test('real Orders entry returns an existing artifact without duplicate provider capture', async () => {
  const storage = {};
  const pendingKey = `orderCollectionPendingSubmissionV1:local%3A${encodeURIComponent(ORDER_ATTEMPT_ID)}`;
  storage[pendingKey] = {
    version: 1,
    capture: orderCapture,
    plan: orderControl().plan,
    attempt: { attemptId: ORDER_ATTEMPT_ID, environmentId: 'local' },
    updatedAt: Date.now(),
  };
  const harness = createOrderInterfaceHarness({
    storage,
    initialControl: orderControl({
      state: 'COMPLETE',
      artifactId: ORDER_ARTIFACT_ID,
    }),
  });
  const worker = harness.boot({ capture: orderCapture });
  try {
    const result = await externalRequest(worker.fake, {
      action: 'collectKidsnoteOrders',
      runId: ORDER_ATTEMPT_ID,
      serverOwned: true,
    });
    assert.equal(result.success, true);
    assert.equal(result.terminalState, 'COMPLETE');
    assert.equal(result.attemptId, ORDER_ATTEMPT_ID);
    assert.equal(harness.providerCalls, 0);
    assert.equal(harness.converterCalls, 0);
    assert.equal(worker.fake.createdTabs.length, 0);
    assert.equal(storage[pendingKey], undefined, 'terminal owner reconciliation clears stale capture state');
  } finally {
    worker.close();
  }
});

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

const popupItemwinnerAttemptId = '11111111-1111-4111-8111-111111111111';
const popupItemwinnerSecondAttemptId = '44444444-4444-4444-8444-444444444444';
const popupItemwinnerAttemptToken = '22222222-2222-4222-8222-222222222222';
const popupItemwinnerAccountId = '33333333-3333-4333-8333-333333333333';
const popupItemwinnerVendorId = 'A00000000';
const popupItemwinnerUrl = 'https://wing.coupang.com/tenants/seller-price-management?scope=one';

function popupItemwinnerAttempt(state, targetUrl = popupItemwinnerUrl, attemptId = popupItemwinnerAttemptId) {
  return {
    attemptId,
    attemptToken: popupItemwinnerAttemptToken,
    state,
    channelAccountId: popupItemwinnerAccountId,
    expiresAt: '2030-01-02T00:00:00.000Z',
    errorCode: state === 'FAILED' ? 'SOURCE_COLLECTION_FAILED' : null,
    errorMessage: state === 'FAILED' ? 'fixture failure' : null,
    plan: {
      sourceType: 'coupang_wing_itemwinner',
      parserVersion: 'wing-itemwinner-v1',
      pageType: 'itemwinner',
      channelAccountId: popupItemwinnerAccountId,
      expectedVendorId: popupItemwinnerVendorId,
      businessDate: '2026-09-06',
      targetUrl,
    },
  };
}

test('standalone advertising keyword action observes its complete owner without recollection or leaking control', async () => {
  const attemptId = '11111111-1111-4111-8111-111111111111';
  const requests = [];
  const { fake, context } = bootServiceWorker({ fetch: async (url, init) => {
    if (!String(url).includes('/ad-keywords/')) return { ok: true, json: async () => ({}) };
    requests.push({ url: String(url), method: init?.method || 'GET' });
    return { ok: true, json: async () => ({ attemptId, attemptToken: '22222222-2222-4222-8222-222222222222',
      state: 'COMPLETE', channelAccountId: '33333333-3333-4333-8333-333333333333',
      expiresAt: '2030-01-02T00:00:00.000Z', plan: { sourceType: 'coupang_ad_keyword', parserVersion: 'ad-keyword-v1',
        channelAccountId: '33333333-3333-4333-8333-333333333333', expectedAdvertiserId: 'A0001',
        startDate: '2026-08-30', endDate: '2026-09-05', windowDays: 7 }, roster: null, queue: [], receipts: [],
      groupCount: 0, completedGroupCount: 0, manifestChecksum: 'a'.repeat(64), errorCode: null, errorMessage: null }) };
  } });
  fake.storage.kiditem_environment_profiles_v1 = { local: { accessToken: 'fixture' } };
  const result = await externalRequest(fake, { action: 'collectAdvertisingKeywords', attemptId });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { success: true, attemptId, terminalState: 'COMPLETE', continuationRequired: false });
  assert.equal(context.KidItemDomains.capabilities().advertisingKeywordSourceOwnerV1, true);
  assert.equal(requests.length, 1);
  assert.ok(requests[0].url.endsWith(`/attempts/${attemptId}/control`));
  assert.equal(requests[0].method, 'GET');
  assert.deepEqual(fake.createdTabs, []);
});

test('retired generic scrape ingress has no external responder', async () => {
  const { fake } = bootServiceWorker();
  const responders = externalResponderCount(fake, { action: 'scrapeTargets', producer: 'advertising.ad_keyword',
    urls: [{ url: 'https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdKeyword=1', label: 'keywords' }] });
  assert.equal(responders, 0);
  assert.deepEqual(fake.createdTabs, []);
});

test('popup Wing traffic owner requires the displayed date range and never guesses it', async () => {
  const requests = [];
  const { fake } = bootServiceWorker({ fetch: async (url) => {
    requests.push(String(url));
    return { ok: true, status: 200, json: async () => ({}) };
  } });
  fake.storage.kiditem_environment_profiles_v1 = { local: { accessToken: 'fixture' } };
  const result = await internalRequest(fake, {
    action: 'collectAdvertisingWingTrafficFromPopup',
    environmentId: 'local',
    url: 'https://wing.coupang.com/tenants/business-insight/sales-analysis',
  });
  assert.equal(result.success, false);
  assert.match(result.error, /displayed 날짜 범위/);
  assert.deepEqual(requests, []);
  assert.deepEqual(fake.createdTabs, []);
});

test('popup Wing traffic owner rejects a different running displayed range before provider IO', async () => {
  const attemptId = '11111111-1111-4111-8111-111111111111';
  const account = '33333333-3333-4333-8333-333333333333';
  const requests = [];
  const { fake } = bootServiceWorker({ fetch: async (url) => {
    requests.push(String(url));
    return {
      ok: true,
      status: 200,
      json: async () => ({ latestAttempt: {
        attemptId,
        state: 'RUNNING',
        channelAccountId: account,
        plan: {
          sourceType: 'coupang_wing_traffic',
          parserVersion: 'wing-traffic-v1',
          channelAccountId: account,
          expectedAdvertiserId: 'A0001',
          startDate: '2026-09-01',
          endDate: '2026-09-02',
          businessDate: '2026-09-02',
          periodDays: 2,
          targetUrl: 'https://wing.coupang.com/tenants/business-insight/sales-analysis?start_date=2026-09-01&end_date=2026-09-02',
        },
      } }),
    };
  } });
  fake.storage.kiditem_environment_profiles_v1 = { local: { accessToken: 'fixture' } };
  const result = await internalRequest(fake, {
    action: 'collectAdvertisingWingTrafficFromPopup',
    environmentId: 'local',
    url: 'https://wing.coupang.com/tenants/business-insight/sales-analysis?start_date=2026-09-05&end_date=2026-09-06',
  });
  assert.equal(result.success, false);
  assert.match(result.error, /다른 displayed 범위/);
  assert.equal(requests.length, 1);
  assert.ok(requests[0].endsWith('/api/ads/traffic/source'));
  assert.deepEqual(fake.createdTabs, []);
});

test('popup Wing itemwinner retries a lost begin acknowledgement with the same idempotency key', async () => {
  const beginKeys = [];
  let latestAttempt = null;
  let loseFirstBegin = true;
  const { fake } = bootServiceWorker({ fetch: async (url, init = {}) => {
    const href = String(url);
    if (href.endsWith('/api/ads/wing-itemwinner/source')) {
      return { ok: true, status: 200, json: async () => ({ latestAttempt }) };
    }
    if (href.endsWith('/api/ads/wing-itemwinner/attempts')) {
      beginKeys.push(typeof init.headers?.get === 'function'
        ? init.headers.get('Idempotency-Key')
        : init.headers?.['Idempotency-Key'] || init.headers?.['idempotency-key']);
      latestAttempt = popupItemwinnerAttempt('RUNNING');
      if (loseFirstBegin) {
        loseFirstBegin = false;
        throw new Error('begin acknowledgement lost');
      }
      return { ok: true, status: 200, json: async () => latestAttempt };
    }
    if (href.includes(`/api/ads/wing-itemwinner/attempts/${popupItemwinnerAttemptId}`)) {
      latestAttempt = popupItemwinnerAttempt('COMPLETE');
      return { ok: true, status: 200, json: async () => latestAttempt };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  } });
  fake.storage.kiditem_environment_profiles_v1 = { local: { accessToken: 'fixture' } };
  const request = {
    action: 'collectAdvertisingWingItemwinnerFromPopup',
    environmentId: 'local',
    url: popupItemwinnerUrl,
  };

  const first = await internalRequest(fake, request);
  assert.equal(first.success, false);
  assert.match(first.error, /begin acknowledgement lost/);

  const retry = await internalRequest(fake, request);
  assert.equal(retry.success, true);
  assert.equal(retry.terminalState, 'COMPLETE');
  assert.equal(beginKeys.length, 2);
  assert.ok(beginKeys[0]);
  assert.equal(beginKeys[0], beginKeys[1]);
});

test('popup Wing itemwinner rejects the retired seller-web route before provider IO', async () => {
  const requests = [];
  const { fake } = bootServiceWorker({ fetch: async (url) => {
    requests.push(String(url));
    return { ok: true, status: 200, json: async () => ({}) };
  } });
  fake.storage.kiditem_environment_profiles_v1 = { local: { accessToken: 'fixture' } };
  const result = await internalRequest(fake, {
    action: 'collectAdvertisingWingItemwinnerFromPopup',
    environmentId: 'local',
    url: 'https://wing.coupang.com/tenants/seller-web/seller-price-management?scope=retired',
  });
  assert.equal(result.success, false);
  assert.match(result.error, /아이템위너 페이지가 아닙니다/);
  assert.deepEqual(requests, []);
  assert.deepEqual(fake.createdTabs, []);
});

test('popup Wing itemwinner does not reuse a running attempt for a different displayed URL', async () => {
  const activeUrl = 'https://wing.coupang.com/tenants/seller-price-management?scope=active';
  const requests = [];
  const { fake } = bootServiceWorker({ fetch: async (url) => {
    const href = String(url);
    requests.push(href);
    if (href.endsWith('/api/ads/wing-itemwinner/source')) {
      return { ok: true, status: 200, json: async () => ({
        latestAttempt: popupItemwinnerAttempt('RUNNING', activeUrl),
      }) };
    }
    if (href.includes(`/api/ads/wing-itemwinner/attempts/${popupItemwinnerAttemptId}`)) {
      return { ok: true, status: 200, json: async () => popupItemwinnerAttempt('FAILED', activeUrl) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  } });
  fake.storage.kiditem_environment_profiles_v1 = { local: { accessToken: 'fixture' } };
  const result = await internalRequest(fake, {
    action: 'collectAdvertisingWingItemwinnerFromPopup',
    environmentId: 'local',
    url: popupItemwinnerUrl,
  });

  assert.equal(result.success, false);
  assert.match(result.error, /다른 displayed 범위/);
  assert.equal(requests.length, 1);
  assert.ok(requests[0].endsWith('/api/ads/wing-itemwinner/source'));
});

test('popup Wing itemwinner starts a fresh keyed attempt after a terminal attempt', async () => {
  for (const terminalState of ['COMPLETE', 'FAILED']) {
    const beginKeys = [];
    const beginAttemptIds = [];
    let latestAttempt = null;
    let nextAttempt = 0;
    const { fake } = bootServiceWorker({ fetch: async (url, init = {}) => {
      const href = String(url);
      if (href.endsWith('/api/ads/wing-itemwinner/source')) {
        return { ok: true, status: 200, json: async () => ({ latestAttempt }) };
      }
      if (href.endsWith('/api/ads/wing-itemwinner/attempts')) {
        const key = typeof init.headers?.get === 'function'
          ? init.headers.get('Idempotency-Key')
          : init.headers?.['Idempotency-Key'] || init.headers?.['idempotency-key'];
        const attemptId = nextAttempt++ === 0
          ? popupItemwinnerAttemptId
          : popupItemwinnerSecondAttemptId;
        beginKeys.push(key);
        beginAttemptIds.push(attemptId);
        latestAttempt = popupItemwinnerAttempt(terminalState, popupItemwinnerUrl, attemptId);
        return { ok: true, status: 200, json: async () => latestAttempt };
      }
      if (href.includes('/api/ads/wing-itemwinner/attempts/')) {
        return { ok: true, status: 200, json: async () => latestAttempt };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    } });
    fake.storage.kiditem_environment_profiles_v1 = { local: { accessToken: 'fixture' } };
    const request = {
      action: 'collectAdvertisingWingItemwinnerFromPopup',
      environmentId: 'local',
      url: popupItemwinnerUrl,
    };

    const first = await internalRequest(fake, request);
    const second = await internalRequest(fake, request);
    assert.equal(first.terminalState, terminalState);
    assert.equal(second.terminalState, terminalState);
    assert.equal(beginKeys.length, 2);
    assert.ok(beginKeys[0]);
    assert.ok(beginKeys[1]);
    assert.notEqual(beginKeys[0], beginKeys[1], `${terminalState} must not replay a terminal attempt key`);
    assert.deepEqual(beginAttemptIds, [popupItemwinnerAttemptId, popupItemwinnerSecondAttemptId]);
  }
});

test('standalone advertising keyword worker keeps HTTP and full queue replies constant as ad count grows', async () => {
  const volumes = [];
  for (const adCount of [1, 60]) {
  const attemptId = '11111111-1111-4111-8111-111111111111';
  const token = '22222222-2222-4222-8222-222222222222';
  const account = '33333333-3333-4333-8333-333333333333';
  const writes = [], messages = [], closed = [];
  const contentReplies = [];
  let controlReads = 0, providerReads = 0, resultComplete = false;
  let state = 'RUNNING';
  const { fake, context } = bootServiceWorker({ fetch: async (url, init) => {
    if (!String(url).includes('/ad-keywords/')) return { ok: true, json: async () => ({}) };
    if (String(url).endsWith('/control')) controlReads++;
    if (init?.method === 'PUT' || init?.method === 'POST') {
      writes.push({ url: String(url), ...init });
      if (String(url).endsWith('/result')) resultComplete = true;
      if (String(url).endsWith('/complete')) {
        assert.deepEqual(closed, []);
        const sessions = await externalRequest(fake, { action: 'listCollectionSessions' });
        assert.ok(sessions.some(s => s.attemptId === attemptId));
        state = 'COMPLETE';
      }
    }
    return { ok: true, json: async () => ({ attemptId, attemptToken: token, channelAccountId: account, state,
      expiresAt: '2030-01-02T00:00:00.000Z', manifestChecksum: 'a'.repeat(64),
      plan: { sourceType: 'coupang_ad_keyword', parserVersion: 'ad-keyword-v1', channelAccountId: account,
        expectedAdvertiserId: 'A0001', startDate: '2026-08-30', endDate: '2026-09-05', windowDays: 7 },
      roster: { campaigns: [], pages: [] }, queue: [{ sequence: 0, campaignId: '1', campaignName: 'campaign',
        campaignIdentity: 'campaign:1', adGroupId: '2', resultComplete,
        plan: { adGroupName: 'group', ads: Array.from({ length: adCount }, (_, i) => ({ adId: String(i + 1),
          vendorItemId: String(i + 1), itemName: '상품', isActive: true })) } }],
      receipts: [], errorCode: null, errorMessage: null }) };
  } });
  fake.storage.kiditem_environment_profiles_v1 = { local: { accessToken: 'fixture' } };
  let tab;
  fake.chrome.windows.create = (properties, callback) => {
    tab = { id: 41, windowId: 7, status: 'complete', url: properties.url };
    callback({ id: 7, tabs: [tab] });
  };
  fake.chrome.windows.get = (_id, _options, callback) => { const win = tab ? { id: 7, type: 'normal', tabs: [tab] } : undefined; callback?.(win); return Promise.resolve(win); };
  fake.chrome.windows.remove = (_id, callback) => { closed.push(state); tab = null; callback?.(); return Promise.resolve(); };
  fake.chrome.tabs.get = (_id, callback) => { callback?.(tab); return Promise.resolve(tab); };
  fake.chrome.tabs.update = (_id, properties, callback) => { Object.assign(tab, properties); callback?.(tab); return Promise.resolve(tab); };
  fake.chrome.tabs.sendMessage = (_id, message, callback) => {
    messages.push(message);
    if (message.action !== 'manualSync') return callback?.({ success: true });
    const listeners = [];
    const content = vm.createContext({
      chrome: { runtime: { lastError: null, onMessage: { addListener: listener => listeners.push(listener) },
        sendMessage(msg, reply) {
          if (msg.action !== 'advertisingKeywordSourceStep') return reply?.({ success: true });
          for (const listener of fake.internalMessageListeners) listener(msg, { tab, url: tab.url, frameId: 0 }, response => {
            contentReplies.push(response);
            reply(response);
          });
        } }, storage: { local: { set() {} } } },
      document: { title: '광고센터', querySelector: () => null,
        querySelectorAll: selector => selector === 'dt' ? [{ textContent: '업체코드', nextElementSibling: { textContent: 'A0001' } }] : [] },
      location: new URL(tab.url), console: { log() {}, warn() {}, error() {} },
      sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
      setTimeout: fn => { fn(); return 0; }, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
      showBadge() {}, URL, URLSearchParams,
      AbortController: class { signal = {}; abort() {} },
      fetch: async url => {
        providerReads++;
        assert.ok(url.includes('/tableMetric') || url.includes('/ad/keywords/'), 'frozen group must not be enumerated again');
        return { ok: true, text: async () => JSON.stringify(url.includes('/tableMetric') ? {} : []) };
      },
    });
    content.window = content;
    vm.runInContext(readFileSync(path.join(repoRoot, 'extensions/kiditem-os/content/coupang/ads-report.js'), 'utf8'), content);
    for (const listener of listeners) listener(message, {}, callback);
  };
  context.setTimeout = (callback, ms) => { if (ms < 10_000) queueMicrotask(callback); return 1; };
  context.clearTimeout = () => {};
  const result = await externalRequest(fake, { action: 'collectAdvertisingKeywords', attemptId });
  assert.equal(result.terminalState, 'COMPLETE', JSON.stringify({ result, writes, messages }));
  assert.equal(messages.filter(m => m.action === 'manualSync').length, 1);
  assert.equal(messages.find(m => m.action === 'manualSync').keywordControl.attemptId, attemptId);
  assert.equal(JSON.stringify(messages).includes(token), false);
  assert.equal(JSON.stringify(contentReplies).includes(token), false);
  assert.equal(providerReads, adCount * 2);
  assert.deepEqual(writes.map(write => write.method), ['PUT', 'POST']);
  assert.deepEqual(closed, ['COMPLETE']);
  assert.equal((await externalRequest(fake, { action: 'listCollectionSessions' })).some(s => s.attemptId === attemptId), false);
  volumes.push({ controlReads, fullQueueReplies: contentReplies.filter(reply => reply.control?.queue).length });
  }
  assert.deepEqual(volumes[1], volumes[0], 'provider ad count must not amplify full-control reads or Chrome queue replies');
  assert.equal(volumes[0].controlReads, 6);
  assert.equal(volumes[0].fullQueueReplies, 1, 'only the group receipt returns refreshed frozen control');
});

test('campaign public worker runs the actual empty dashboard collector and waits for owner COMPLETE', async () => {
  const attemptId = '11111111-1111-4111-8111-111111111111';
  const token = '22222222-2222-4222-8222-222222222222';
  const account = '33333333-3333-4333-8333-333333333333';
  const requests = [], messages = [], closed = [];
  const completeAck = Promise.withResolvers(), completing = Promise.withResolvers();
  const control = { attemptId, attemptToken: token, channelAccountId: account, state: 'RUNNING',
    expiresAt: '2030-01-02T00:00:00Z', manifestChecksum: 'a'.repeat(64),
    plan: { sourceType: 'coupang_ad_campaign', parserVersion: 'ad-campaign-v1', channelAccountId: account,
    expectedAdvertiserId: 'A0001', captureMode: 'campaign_sweep',
    startDate: '2026-08-06', endDate: '2026-09-05',
      businessDates: Array.from({length:31}, (_,i) => new Date(Date.parse('2026-09-05') - i * 86400000).toISOString().slice(0,10)) },
    receipts: [], pages: [], campaigns: [] };
  const { fake, context } = bootServiceWorker({ fetch: async (url, init) => {
    if (!String(url).includes('/ad-campaigns/')) return { ok: true, json: async () => ({}) };
    requests.push({ url: String(url), ...init });
    let receipt;
    if (init?.method === 'PUT') {
      const body = JSON.parse(init.body);
      assert.equal(body.kind, 'dashboard_page');
      assert.equal(body.explicitEmpty, true);
      assert.deepEqual(body.campaigns, []);
      assert.equal(body.verified, false, 'empty dashboard does not invent pagination');
      receipt = { sequence: 0, key: body.key, kind: body.kind, checksum: checksum(body) };
      control.receipts.push(receipt); control.pages.push(body);
    }
    if (String(url).endsWith('/complete')) {
      completing.resolve(); await completeAck.promise; control.state = 'COMPLETE';
    }
    return { ok: true, json: async () => structuredClone({ ...control, ...(receipt ? { receipt } : {}) }) };
  } });
  fake.storage.kiditem_environment_profiles_v1 = { local: { accessToken: 'fixture' } };
  let tab;
  fake.chrome.windows.create = (properties, callback) => {
    tab = { id: 41, windowId: 7, status: 'complete', url: properties.url }; callback({ id: 7, tabs: [tab] });
  };
  fake.chrome.windows.get = (_id, _options, callback) => { const win = tab ? { id: 7, type: 'normal', tabs: [tab] } : undefined; callback?.(win); return Promise.resolve(win); };
  fake.chrome.windows.remove = (_id, callback) => { closed.push(control.state); tab = null; callback?.(); return Promise.resolve(); };
  fake.chrome.tabs.get = (_id, callback) => { callback?.(tab); return Promise.resolve(tab); };
  fake.chrome.tabs.update = (_id, properties, callback) => { Object.assign(tab, properties); callback?.(tab); return Promise.resolve(tab); };
  let dom;
  fake.chrome.tabs.sendMessage = (_id, message, callback) => {
    messages.push(message);
    if (message.action !== 'manualSync') return callback?.({ success: true });
    dom = new JSDOM('<dl><dt>업체코드</dt><dd>A0001</dd></dl><div class="rt-table"><div class="rt-thead"><span class="rt-th">캠페인</span><span class="rt-th">노출수</span><span class="rt-th">클릭수</span></div><div class="rt-tbody"></div><div class="ant-empty">데이터가 없습니다.</div></div>', { url: tab.url });
    Object.defineProperty(dom.window.HTMLElement.prototype, 'innerText', { get() { return this.textContent; } });
    dom.window.HTMLElement.prototype.getClientRects = () => [{ width: 10, height: 10 }];
    const listeners = [];
    const content = vm.createContext({ document: dom.window.document, location: dom.window.location,
      sessionStorage: dom.window.sessionStorage, history: dom.window.history,
      chrome: { runtime: { lastError: null, onMessage: { addListener: listener => listeners.push(listener) },
        sendMessage(msg, reply) {
          if (msg.action !== 'advertisingCampaignSourceStep') return reply?.({ success: true });
          for (const listener of fake.internalMessageListeners) listener(msg, { tab, url: tab.url, frameId: 0 }, reply);
        } }, storage: { local: { set() {} } } },
      console: { log() {}, warn() {}, error() {} }, showBadge() {}, URL, URLSearchParams,
      setTimeout: fn => { fn(); return 0; }, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
      fetch: () => { throw new Error('empty DOM requires no provider API'); },
    });
    content.window = content;
    vm.runInContext(readFileSync(path.join(repoRoot, 'extensions/kiditem-os/content/coupang/ads-report.js'), 'utf8'), content);
    for (const listener of listeners) listener(message, {}, callback);
  };
  try {
    const result = externalRequest(fake, { action: 'collectAdvertisingCampaigns', attemptId });
    await completing.promise;
    assert.deepEqual(closed, []);
    assert.ok((await externalRequest(fake, { action: 'listCollectionSessions' })).some(s => s.attemptId === attemptId));
    completeAck.resolve();
    assert.deepEqual(JSON.parse(JSON.stringify(await result)), { success: true, attemptId, terminalState: 'COMPLETE', continuationRequired: false });
    assert.deepEqual(closed, ['COMPLETE']);
    assert.equal(context.KidItemDomains.capabilities().advertisingCampaignSourceOwnerV1, true);
    assert.equal(JSON.stringify(messages).includes(token), false);
    assert.equal(messages.filter(m => m.action === 'manualSync').length, 1);
    assert.deepEqual(requests.filter(r => r.method).map(r => r.method), ['PUT', 'POST']);
    await externalRequest(fake, { action: 'collectAdvertisingCampaigns', attemptId });
    assert.equal(messages.filter(m => m.action === 'manualSync').length, 1, 'COMPLETE replay is owner-only');
  } finally { completeAck.resolve(); dom?.window.close(); }
});

test('catalog owner permit reaches the real worker/session and a committed receipt does not recollect', async () => {
  const requests = [];
  const { fake } = bootServiceWorker({ fetch: async (url, init) => {
    // The unrelated legacy bootstrap poll is removed by the aggregate cutover.
    if (!String(url).includes('/catalog-imports/')) return { ok: true, status: 200, json: async () => ({}) };
    requests.push({ url: String(url), method: init?.method ?? 'GET' });
    return { ok: true, status: 200, json: async () => ({
      attemptId: catalogPermit.attemptId, state: 'COMPLETE',
      channelAccountId: catalogPermit.plan.channelAccountId,
      expiresAt: catalogPermit.expiresAt, plan: catalogPermit.plan,
      phase: 'finished', progress: { hydratedProducts: 0, discoveredProducts: 0 },
      publication: { sourceImportRunId: catalogPermit.attemptId },
    }) };
  } });
  fake.storage.kiditem_environment_profiles_v1 = { local: { accessToken: 'test-token' } };
  const result = await externalRequest(fake, { action: 'startCoupangCatalogImport', permit: catalogPermit });
  assert.equal(result.success, true, result.error);
  assert.equal(result.attemptId, catalogPermit.attemptId);
  assert.equal(result.active, false);
  assert.equal(requests.length, 1, JSON.stringify(requests));
  assert.ok(requests[0].url.endsWith(`/attempts/${catalogPermit.attemptId}`));
  assert.equal(requests[0].method, 'GET');
  assert.deepEqual(fake.createdTabs, []);
  const sessions = await externalRequest(fake, { action: 'listCollectionSessions' });
  assert.ok(!JSON.stringify(sessions).includes(catalogPermit.attemptId));
});

test('catalog generic cancellation reconciles the exact web-failed owner without a legacy session restart', async () => {
  const requests = [];
  const { fake, context } = bootServiceWorker({ fetch: async (url, init) => {
    if (!String(url).includes('/catalog-imports/')) return { ok: true, json: async () => ({}) };
    requests.push({ url: String(url), method: init?.method || 'GET' });
    return { ok: true, json: async () => ({
      attemptId: catalogPermit.attemptId, channelAccountId: catalogPermit.plan.channelAccountId,
      state: 'FAILED', plan: catalogPermit.plan, expiresAt: catalogPermit.expiresAt,
      error: { code: 'USER_CANCELLED', message: '취소' },
    }) };
  } });
  fake.storage.kiditem_environment_profiles_v1 = { local: { accessToken: 'test-token' } };
  fake.storage['kiditem_coupang_catalog_import:local'] = {
    attemptId: catalogPermit.attemptId, channelAccountId: catalogPermit.plan.channelAccountId,
    permit: catalogPermit, status: 'running', phase: 'discovery',
  };
  await vm.runInContext('collectionSessions.start(' + JSON.stringify({
    attemptId: catalogPermit.attemptId, environmentId: 'local', producer: 'channels.coupang_catalog',
  }) + ')', context);
  const result = await externalRequest(fake, { action: 'cancelCollectionSession', attemptId: catalogPermit.attemptId });
  assert.equal(result.success, true, result.error);
  assert.equal(result.active, false);
  assert.equal(result.cancelled, true);
  assert.ok(requests.length > 0);
  assert.ok(requests.every(r => r.method === 'GET' && r.url.endsWith('/attempts/' + catalogPermit.attemptId)));
  assert.deepEqual(fake.createdTabs, []);
  const sessions = await externalRequest(fake, { action: 'listCollectionSessions' });
  assert.ok(!JSON.stringify(sessions).includes(catalogPermit.attemptId));
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

// Exercise the production collector from the fully loaded worker. Only Chrome
// browser IO and time are simulated; capture, pagination and normalization run.
function bootRankCollector(pages, { loadFailureAt, redirectAt, fetch } = {}) {
  const { fake, context } = bootServiceWorker({ fetch });
  // Public collectors now create an inactive about:blank owner tab and then
  // navigate it. Keep the provider fixture aligned with the navigation trace:
  // a leading null is the blank-tab slot when a scenario did not provide one.
  const providerPages = pages[0] === null ? pages : [null, ...pages];
  const urls = [], delays = [];
  const updatedListeners = new Set();
  let navigationCount = 0;
  fake.chrome.tabs.onUpdated = {
    addListener: (listener) => updatedListeners.add(listener),
    removeListener: (listener) => updatedListeners.delete(listener),
  };
  let tab;
  fake.chrome.tabs.create = (properties, callback) => {
    urls.push(properties.url);
    navigationCount = 0;
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
    navigationCount += 1;
    if (navigationCount === loadFailureAt) {
      fake.chrome.runtime.lastError = { message: 'navigation failed' };
      callback?.();
      fake.chrome.runtime.lastError = null;
    } else {
      tab = { ...tab, ...properties,
        url: navigationCount === redirectAt ? 'https://login.coupang.com/' : properties.url };
      callback?.(tab);
      queueMicrotask(() => {
        for (const listener of updatedListeners) listener(tab.id, { status: 'loading' }, tab);
        for (const listener of updatedListeners) listener(tab.id, { status: 'complete' }, tab);
      });
    }
    return Promise.resolve(tab);
  };
  fake.chrome.scripting.executeScript = async ({ func, args = [] }) => {
    // Session/lifetime notifications are best-effort UI hints and are not
    // provider page executions. Keep them out of the provider page queue so
    // this harness can model both streams on the same Chrome API.
    const source = String(func);
    if (source.includes('publishKidItemExtensionEvent') || source.includes('requestKidItemExtensionAuth')) {
      return [{ result: undefined }];
    }
    const page = providerPages[navigationCount];
    if (page instanceof Error) throw page;
    if (page && typeof page === 'object' && Array.isArray(page.products) &&
      String(func).includes('selectNewestInPage')) {
      return [{ result: true }];
    }
    if (typeof page === 'string') {
      const dom = new JSDOM(page, { url: tab.url, runScripts: 'outside-only' });
      try {
        dom.window.collectorArgs = args;
        dom.window.scrollTo = () => {};
        dom.window.setTimeout = (callback, ms) => { delays.push(ms); queueMicrotask(callback); return 1; };
        return [{ result: await vm.runInContext(`(${func.toString()})(...collectorArgs)`, dom.getInternalVMContext()) }];
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
      await (async () => {
        const attemptId = '11111111-1111-4111-8111-111111111111';
        await vm.runInContext(`collectionSessions.start({
          environmentId: 'local',
          attemptId: '${attemptId}',
          producer: 'advertising.keyword_rank',
        })`, context);
        return context.captureCoupangKeywordSerp('연필 세트', maxPages, {
          environmentId: 'local',
          attemptId,
        });
      })(),
    )),
  };
}

function bootWingSearch(
  responses,
  { fetch, producer = 'advertising.wing_rank', environmentId = 'local' } = {},
) {
  const { fake, context, close } = bootServiceWorker({ fetch });
  const requests = [], delays = [], urls = [];
  let injections = 0;
  let tab;
  fake.chrome.tabs.create = (properties, callback) => {
    urls.push(properties.url);
    tab = { id: 42, windowId: 7, status: 'complete', ...properties };
    callback?.(tab);
    return Promise.resolve(tab);
  };
  fake.chrome.tabs.get = (_id, callback) => { callback?.(tab); return Promise.resolve(tab); };
  fake.chrome.tabs.remove = async (_id, callback) => { tab = null; callback?.(); };
  const pageAbortSignal = { timeout: () => new AbortController().signal };
  fake.chrome.scripting.executeScript = async ({ func, args }) => {
    const source = String(func);
    if (source.includes('publishKidItemExtensionEvent') || source.includes('requestKidItemExtensionAuth')) {
      return [{ result: undefined }];
    }
    const response = responses[injections++];
    if (response instanceof Error) throw response;
    return [{ result: await vm.runInNewContext(`(${func.toString()})(...args)`, {
      args, document: { cookie: 'XSRF-TOKEN=fixture' }, AbortSignal: pageAbortSignal,
      fetch: async (url, init) => {
        requests.push({ url, ...init, body: JSON.parse(init.body) });
        return { ok: response.status === 200, status: response.status,
          headers: new Headers({ 'content-type': response.contentType || 'application/json' }),
          text: async () => JSON.stringify(response.body) };
      },
    }) }];
  };
  context.setTimeout = (callback, ms) => {
    if ([1000, 1850, 2000, 4000, 7000, 8000, 16000, 2200].includes(ms)) { delays.push(ms); queueMicrotask(callback); }
    return 1;
  };
  context.clearTimeout = () => {};
  vm.runInContext('Math.random = () => 0.5;', context);
  return { requests, delays, urls, fake, context, close, search: async (maxPages = 5) => {
    // The collector receives an already-started progress session from its caller.
    await vm.runInContext(`collectionSessions.start({environmentId: '${environmentId}',
      attemptId: '11111111-1111-4111-8111-111111111111', producer: '${producer}'})`, context);
    return JSON.parse(JSON.stringify(await vm.runInContext(`wingSearchCollector.collect(${JSON.stringify({
      keyword: '연필 세트', maxPages, environmentId,
      attemptId: '11111111-1111-4111-8111-111111111111',
    })})`, context)));
  } };
}

test('SERP batch publishes original keyword captures before admitting sequential seller enrichment owners', { timeout: 3000 }, async (t) => {
  for (const catalogState of ['COMPLETE', 'FAILED']) await t.test(catalogState, async () => {
    const key = '99999999-9999-4999-8999-999999999999';
    const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
    const catalogId = '33333333-3333-4333-8333-333333333333';
    const identityId = '44444444-4444-4444-8444-444444444444';
    const token = '55555555-5555-4555-8555-555555555555';
    const phases = [];
    const h = bootRankCollector(ids.map((id, i) => ({ items: [{ productId: String(i + 1), name: '연필' }] })), {
      fetch: async (url, init) => {
        const path = new URL(url).pathname;
        if (path.endsWith('/serp/batch-attempts')) {
          assert.equal(init.method, 'GET');
          return { ok: true, json: async () => ({ attempts: ids.map((attemptId) => ({ attemptId, state: 'RUNNING' })) }) };
        }
        const serpId = ids.find((id) => path.endsWith(`/serp/attempts/${id}`));
        if (serpId) {
          if (init.method === 'PUT') {
            phases.push(`serp:${serpId}`);
            return { ok: true, json: async () => ({ attemptId: serpId, state: 'COMPLETE' }) };
          }
          return { ok: true, json: async () => ({ attemptId: serpId, attemptToken: token, state: 'RUNNING',
            expiresAt: new Date(Date.now() + 600_000).toISOString(),
            plan: { sourceType: 'coupang_keyword_serp', parserVersion: 'keyword-serp-v1', keyword: `연필${ids.indexOf(serpId)}`, maxPages: 1 },
          }) };
        }
        if (path.endsWith('/competitor-catalogs/attempts')) {
          const input = JSON.parse(init.body);
          assert.equal(phases.filter((phase) => phase.startsWith('serp:')).length, 2);
          assert.equal(input.target, 'rank_enrichment');
          if (input.excludeCompletedAttemptId) {
            assert.equal(input.excludeCompletedAttemptId, catalogId);
            assert.equal(phases.at(-1), 'identity');
            phases.push('catalog:new');
          } else phases.push('catalog:initial');
          return { ok: true, json: async () => ({ attemptId: catalogId, attemptToken: token, state: catalogState,
            expiresAt: new Date(Date.now() + 600_000).toISOString(), input, targets: [],
          }) };
        }
        if (path.includes('/competitor-seller-identities/attempts')) {
          assert.equal(catalogState, 'COMPLETE');
          if (init.method === 'POST') {
            assert.deepEqual(JSON.parse(init.body), {});
            assert.equal(phases.at(-1), 'catalog:initial');
            phases.push('identity');
          }
          return { ok: true, json: async () => ({ attemptId: identityId, attemptToken: token, state: 'COMPLETE',
            expiresAt: new Date(Date.now() + 600_000).toISOString(),
            plan: { sourceType: 'coupang_competitor_seller_identity', parserVersion: 'seller-identity-v1', days: 30, limit: 200, targets: [] },
          }) };
        }
        assert.equal(path.includes('/extension/sync'), false, 'unfenced rank/enrichment ingress is retired');
        return { ok: true, json: async () => ({}) };
      },
    });
    h.fake.storage.kiditem_environment_profiles_v1 = { local: { accessToken: 'test-token' } };
    h.fake.chrome.tabs.remove = async (_id, callback) => callback?.();
    const ack = await externalRequest(h.fake, { action: 'collectAdvertisingKeywordSerpBatch', idempotencyKey: key });
    assert.deepEqual(JSON.parse(JSON.stringify(ack)), { success: true, started: true });
    for (let spin = 0; spin < 100; spin += 1) await new Promise(setImmediate);
    assert.deepEqual(phases, [`serp:${ids[0]}`, `serp:${ids[1]}`, 'catalog:initial',
      ...(catalogState === 'COMPLETE' ? ['identity', 'catalog:new'] : [])]);
    assert.deepEqual(h.delays, [1200, 4000, 1200]);
    assert.deepEqual(h.urls, ['about:blank',
      'https://www.coupang.com/np/search?q=%EC%97%B0%ED%95%840&channel=user&page=1&listSize=36',
      'about:blank',
      'https://www.coupang.com/np/search?q=%EC%97%B0%ED%95%841&channel=user&page=1&listSize=36']);
  });
});

test('SERP batch cancellation during enrichment admission settles its exact owner before provider IO', async () => {
  const key = '99999999-9999-4999-8999-999999999999';
  const attemptId = '11111111-1111-4111-8111-111111111111';
  const target = { keyword: '문구', sellerId: 'A123', sellerName: '문구마켓', sellerStoreUrl: 'https://shop.coupang.com/A123' };
  let state = 'RUNNING';
  let failures = 0;
  const control = () => ({ attemptId, state, attemptToken: '22222222-2222-4222-8222-222222222222',
    expiresAt: new Date(Date.now() + 600_000).toISOString(), input: { target: 'rank_enrichment' }, targets: [target] });
  const h = bootRankCollector([], { fetch: async (url, init) => {
    const path = new URL(url).pathname;
    assert.equal(path.includes('/competitor-seller-identities/'), false);
    if (path.endsWith('/serp/batch-attempts')) return { ok: true, json: async () => ({ attempts: [
      { attemptId: '33333333-3333-4333-8333-333333333333', state: 'COMPLETE' },
    ] }) };
    if (path.endsWith('/serp/batch-attempts/cancel')) {
      assert.equal(init.method, 'POST');
      return { ok: true, json: async () => ({ attempts: [
        { attemptId: '33333333-3333-4333-8333-333333333333', state: 'COMPLETE' },
      ] }) };
    }
    if (path.endsWith('/competitor-catalogs/attempts')) {
      await externalRequest(h.fake, { action: 'cancelAdvertisingKeywordSerpBatch', idempotencyKey: key });
      return { ok: true, json: async () => control() };
    }
    if (path.includes('/competitor-catalogs/attempts/')) {
      if (path.endsWith('/fail')) {
        failures += 1;
        state = 'FAILED';
        return { ok: true, json: async () => ({ latestAttempt: { attemptId, state } }) };
      }
      assert.equal(init.method, 'GET');
      return { ok: true, json: async () => control() };
    }
    return { ok: true, json: async () => ({}) };
  } });
  h.fake.storage.kiditem_environment_profiles_v1 = { local: { accessToken: 'test-token' } };
  await externalRequest(h.fake, { action: 'collectAdvertisingKeywordSerpBatch', idempotencyKey: key });
  for (let spin = 0; spin < 100; spin += 1) await new Promise(setImmediate);
  assert.equal(state, 'FAILED');
  assert.equal(failures, 1, 'cancellation is one owner transition, not a later capture failure');
  assert.deepEqual(h.urls, []);
});

test('competitor catalog source preserves standalone100 and SERP enrichment500 through the real DOM collector', { timeout: 3000 }, async (t) => {
  for (const targetMode of ['all', 'rank_enrichment']) await t.test(targetMode, async () => {
    const attemptId = '11111111-1111-4111-8111-111111111111';
    const target = { keyword: '문구', sellerId: 'A123', sellerName: '문구마켓', sellerStoreUrl: 'https://shop.coupang.com/A123' };
    const reviewCount = targetMode === 'all' ? '<span class="rating-total-count">0</span>' : '';
    const html = '<button>최신순</button>' + Array.from({ length: 500 }, (_, i) =>
      `<a href="https://www.coupang.com/vp/products/${i + 1}?vendorItemId=${i + 1000}"><span class="name">연필 ${i + 1}</span><span class="price-value">1,200</span>${reviewCount}</a>`).join('');
    const uploads = [];
    const closes = [];
    const h = bootRankCollector([html, html], { fetch: async (url, init) => {
      if (!String(url).includes('/competitor-catalogs/')) return { ok: true, json: async () => ({}) };
      if (init.method === 'PUT') {
        uploads.push(JSON.parse(init.body));
        return { ok: true, json: async () => ({ latestAttempt: { attemptId, state: 'COMPLETE' } }) };
      }
      assert.equal(init.method, 'POST');
      assert.deepEqual(JSON.parse(init.body), { target: targetMode });
      return { ok: true, json: async () => ({ attemptId, state: 'RUNNING',
        attemptToken: '22222222-2222-4222-8222-222222222222', expiresAt: new Date(Date.now() + 600_000).toISOString(),
        input: { target: targetMode }, targets: [target],
      }) };
    } });
    h.fake.storage.kiditem_environment_profiles_v1 = { local: { accessToken: 'test-token' } };
    h.fake.chrome.tabs.remove = async (id, callback) => { closes.push(id); callback?.(); };
    const result = await externalRequest(h.fake, { action: 'collectAdvertisingCompetitorCatalog', idempotencyKey: 'catalog-key', target: targetMode });
    assert.equal(result.terminalState, 'COMPLETE', result.error);
    const count = targetMode === 'all' ? 100 : 500;
    assert.equal(uploads.length, 1);
    assert.equal(uploads[0].catalogs[0].products.length, count);
    assert.equal(uploads[0].catalogs[0].collectedProductCount, count);
    assert.deepEqual(uploads[0].catalogs[0].products.at(-1), { sourceRank: count,
      productId: String(count), itemId: null, vendorItemId: String(count + 999),
      name: `연필 ${count}`, priceKrw: 1200, reviewCount: targetMode === 'all' ? 0 : null, imageUrl: null,
      link: `https://www.coupang.com/vp/products/${count}?vendorItemId=${count + 999}`,
    });
    assert.deepEqual(h.urls, ['about:blank', target.sellerStoreUrl]);
    assert.deepEqual(h.delays, [1200, 1200]);
    assert.deepEqual(closes, [41], 'source completion closes its owned tab');
  });
});

test('competitor catalog reconciles terminal acknowledgements with the exact owner, never a contradictory failure', async (t) => {
  for (const scenario of ['lost complete ACK', 'unconfirmed ACK', 'server failed', 'newer attempt response']) await t.test(scenario, async () => {
    const attemptId = '11111111-1111-4111-8111-111111111111';
    const target = { keyword: '문구', sellerId: 'A123', sellerName: '문구마켓', sellerStoreUrl: 'https://shop.coupang.com/A123' };
    const capture = { products: [{ sourceRank: 1, productId: '11', itemId: null, vendorItemId: '101',
      name: '연필', priceKrw: null, reviewCount: null, imageUrl: null, link: 'https://www.coupang.com/vp/products/11' }], totalProductCount: 1 };
    const calls = [];
    const h = bootRankCollector([null, capture], { fetch: async (url, init) => {
      if (!String(url).includes('/competitor-catalogs/')) return { ok: true, json: async () => ({}) };
      calls.push({ method: init.method, url: String(url), body: init.body });
      if (String(url).endsWith('/fail')) return { ok: true, json: async () => ({ latestAttempt: { attemptId, state: 'FAILED' } }) };
      if (init.method === 'PUT') {
        if (scenario.includes('ACK')) throw new Error('network response lost');
        return { ok: true, json: async () => ({ latestAttempt: {
          attemptId: scenario === 'newer attempt response' ? '33333333-3333-4333-8333-333333333333' : attemptId,
          state: 'FAILED',
        } }) };
      }
      return { ok: true, json: async () => ({ attemptId,
        state: init.method === 'GET' && scenario !== 'unconfirmed ACK' ? 'COMPLETE' : 'RUNNING',
        attemptToken: '22222222-2222-4222-8222-222222222222', expiresAt: new Date(Date.now() + 600_000).toISOString(),
        input: { target: 'rank_enrichment' }, targets: [target],
      }) };
    } });
    h.fake.storage.kiditem_environment_profiles_v1 = { local: { accessToken: 'test-token' } };
    h.fake.chrome.tabs.remove = async (_id, callback) => callback?.();
    const result = await externalRequest(h.fake, { action: 'collectAdvertisingCompetitorCatalog', target: 'rank_enrichment', idempotencyKey: 'ack-key' });
    assert.equal(calls.some((call) => call.url.endsWith('/fail')), false);
    const state = scenario === 'server failed' ? 'FAILED' : scenario === 'unconfirmed ACK' ? 'RUNNING' : 'COMPLETE';
    assert.equal(result.terminalState, state);
    assert.equal(result.success, state === 'COMPLETE');
    if (scenario !== 'server failed') assert.equal(calls.filter((call) => call.method === 'GET').length, 1);
    if (state === 'RUNNING') assert.equal(result.errorCode, 'SOURCE_RESULT_UNCONFIRMED');
    const puts = calls.filter((call) => call.method === 'PUT');
    assert.ok(puts.length >= 1 && puts.length <= 3);
    assert.equal(new Set(puts.map((call) => call.body)).size, 1, 'retries preserve the exact captured artifact');
    assert.equal(h.urls.length, 2, 'terminal retries do not recollect');
  });
});

test('seller identity source dispatch preserves frozen targets, DOM extraction, dedupe and field mapping', async () => {
  const attemptId = '11111111-1111-4111-8111-111111111111';
  const targets = [
    { keyword: '연필', productKey: '101', productId: '11', vendorItemId: '101', link: 'https://www.coupang.com/vp/products/11?itemId=7' },
    { keyword: '문구', productKey: '101', productId: '11', vendorItemId: '101', link: 'https://www.coupang.com/vp/products/11?itemId=8' },
    { keyword: '지우개', productKey: '22', productId: '22', vendorItemId: null, link: 'https://www.coupang.com/vp/products/22' },
  ];
  const uploads = [];
  const h = bootRankCollector([null,
    '<a href="https://shop.coupang.com/vid/A123?source=detail">문구마켓 판매자 상품 보러가기</a>',
    '<a href="https://shop.coupang.com/B456">완구마켓 판매자 상품 보러가기</a>',
  ], { fetch: async (url, init) => {
    if (!String(url).includes('/competitor-seller-identities/')) return { ok: true, status: 200, json: async () => ({}) };
    if (String(url).endsWith('/fail')) {
      const failure = JSON.parse(init.body);
      return { ok: true, status: 200, json: async () => ({ attemptId, state: 'FAILED', errorCode: failure.code, errorMessage: failure.message }) };
    }
    assert.equal(String(url).endsWith(`/attempts/${attemptId}`), true);
    if (init.method === 'PUT') {
      uploads.push(JSON.parse(init.body));
      assert.equal(new Headers(init.headers).get('x-source-attempt-token'), '22222222-2222-4222-8222-222222222222');
      return { ok: true, status: 200, json: async () => ({ attemptId, state: 'COMPLETE', itemCount: 3 }) };
    }
    assert.equal(init.method, 'GET');
    return { ok: true, status: 200, json: async () => ({ attemptId,
      attemptToken: '22222222-2222-4222-8222-222222222222', state: 'RUNNING',
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      plan: { sourceType: 'coupang_competitor_seller_identity', parserVersion: 'seller-identity-v1', days: 30, limit: 200, targets },
    }) };
  } });
  h.fake.storage.kiditem_environment_profiles_v1 = { local: { accessToken: 'test-token' } };
  h.fake.chrome.tabs.remove = async (_id, callback) => callback?.();
  const result = await externalRequest(h.fake, { action: 'collectAdvertisingSellerIdentities', attemptId });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { success: true, attemptId, terminalState: 'COMPLETE', itemCount: 3 });
  assert.equal(uploads.length, 1);
  assert.deepEqual(uploads[0].identities.map(({ capturedAt, ...identity }) => identity), [
    { keyword: '연필', productKey: '101', productId: '11', vendorItemId: '101', link: 'https://www.coupang.com/vp/products/11?itemId=7', sellerName: '문구마켓', sellerId: 'A123', sellerStoreUrl: 'https://shop.coupang.com/vid/A123' },
    { keyword: '문구', productKey: '101', productId: '11', vendorItemId: '101', link: 'https://www.coupang.com/vp/products/11?itemId=8', sellerName: '문구마켓', sellerId: 'A123', sellerStoreUrl: 'https://shop.coupang.com/vid/A123' },
    { keyword: '지우개', productKey: '22', productId: '22', vendorItemId: null, link: 'https://www.coupang.com/vp/products/22', sellerName: '완구마켓', sellerId: 'B456', sellerStoreUrl: 'https://shop.coupang.com/B456' },
  ]);
  assert.ok(Number.isFinite(Date.parse(uploads[0].capturedAt)));
  assert.ok(uploads[0].identities.every((row) => Number.isFinite(Date.parse(row.capturedAt))));
  assert.deepEqual(h.urls, ['about:blank', targets[0].link, targets[2].link]);
  assert.deepEqual(h.delays, [1200, 900, 1200]);
  const rejected = await externalRequest(h.fake, { action: 'collectAdvertisingSellerIdentities', attemptId, targets: [] });
  assert.equal(rejected.success, false);
  assert.equal(uploads.length, 1, 'client-supplied targets are rejected before IO');
});

test('seller identity source retains two null reads and later successful rows without claiming an empty result', async () => {
  const attemptId = '11111111-1111-4111-8111-111111111111';
  const targets = [1, 2].map((id) => ({ keyword: '연필', productKey: String(id), productId: String(id),
    vendorItemId: null, link: `https://www.coupang.com/vp/products/${id}` }));
  const uploads = [];
  const h = bootRankCollector([null, '<p>판매자 확인 불가</p>',
    '<a href="https://shop.coupang.com/A123">문구마켓</a>',
  ], { fetch: async (url, init) => {
    if (!String(url).includes('/competitor-seller-identities/')) return { ok: true, json: async () => ({}) };
    assert.equal(String(url).endsWith(`/attempts/${attemptId}`), true);
    if (init.method === 'PUT') {
      uploads.push(JSON.parse(init.body));
      return { ok: true, json: async () => ({ attemptId, state: 'FAILED', itemCount: 0,
        errorCode: 'IDENTITY_EVIDENCE_INCOMPLETE', errorMessage: 'Missing product evidence.' }) };
    }
    return { ok: true, json: async () => ({ attemptId, state: 'RUNNING',
      attemptToken: '22222222-2222-4222-8222-222222222222', expiresAt: new Date(Date.now() + 600_000).toISOString(),
      plan: { sourceType: 'coupang_competitor_seller_identity', parserVersion: 'seller-identity-v1', days: 30, limit: 200, targets },
    }) };
  } });
  h.fake.storage.kiditem_environment_profiles_v1 = { local: { accessToken: 'test-token' } };
  h.fake.chrome.tabs.remove = async (_id, callback) => callback?.();
  const result = await externalRequest(h.fake, { action: 'collectAdvertisingSellerIdentities', attemptId });
  assert.equal(result.terminalState, 'FAILED');
  assert.equal(result.errorCode, 'IDENTITY_EVIDENCE_INCOMPLETE');
  assert.deepEqual(h.urls, ['about:blank', ...targets.map((target) => target.link)]);
  assert.deepEqual(h.delays, [1200, 1200, 900, 1200]);
  assert.equal(uploads.length, 1);
  assert.deepEqual(uploads[0].identities.map(({ productKey }) => productKey), ['2']);
});

test('seller identity source publishes a server-confirmed empty plan without opening a provider tab', async () => {
  const attemptId = '11111111-1111-4111-8111-111111111111';
  const uploads = [];
  const h = bootRankCollector([], { fetch: async (url, init) => {
    if (!String(url).includes('/competitor-seller-identities/')) return { ok: true, json: async () => ({}) };
    if (init.method === 'PUT') {
      uploads.push(JSON.parse(init.body));
      return { ok: true, json: async () => ({ attemptId, state: 'COMPLETE', itemCount: 0 }) };
    }
    assert.equal(init.method, 'GET');
    return { ok: true, json: async () => ({ attemptId, state: 'RUNNING',
      attemptToken: '22222222-2222-4222-8222-222222222222', expiresAt: new Date(Date.now() + 300_000).toISOString(),
      plan: { sourceType: 'coupang_competitor_seller_identity', parserVersion: 'seller-identity-v1', days: 30, limit: 200, targets: [] },
    }) };
  } });
  h.fake.storage.kiditem_environment_profiles_v1 = { local: { accessToken: 'test-token' } };
  const result = await externalRequest(h.fake, { action: 'collectAdvertisingSellerIdentities', attemptId });
  assert.equal(result.terminalState, 'COMPLETE');
  assert.equal(result.itemCount, 0);
  assert.deepEqual(h.urls, []);
  assert.equal(uploads.length, 1);
  assert.deepEqual(uploads[0].identities, []);
});

test('seller identity source stops provider IO and publication after confirmed cancellation or fixed expiry', async (t) => {
  for (const stop of ['cancel', 'expire']) await t.test(stop, async () => {
    const attemptId = '11111111-1111-4111-8111-111111111111';
    const targets = [1, 2].map((id) => ({ keyword: '연필', productKey: String(id), productId: String(id),
      vendorItemId: null, link: `https://www.coupang.com/vp/products/${id}` }));
    let state = 'RUNNING';
    const writes = [];
    const expires = Date.now() + 600_000;
    const h = bootRankCollector([null, '<a href="https://shop.coupang.com/A123">문구마켓</a>',
      '<a href="https://shop.coupang.com/B456">완구마켓</a>',
    ], { fetch: async (url, init) => {
      if (!String(url).includes('/competitor-seller-identities/')) return { ok: true, json: async () => ({}) };
      if (init.method !== 'GET') {
        writes.push({ method: init.method, body: JSON.parse(init.body) });
        state = 'FAILED';
      }
      return { ok: true, json: async () => ({ attemptId, state,
        errorCode: state === 'FAILED' ? (stop === 'cancel' ? 'COLLECTION_CANCELLED' : 'SOURCE_ATTEMPT_EXPIRED') : null,
        attemptToken: '22222222-2222-4222-8222-222222222222', expiresAt: new Date(expires).toISOString(),
        plan: { sourceType: 'coupang_competitor_seller_identity', parserVersion: 'seller-identity-v1', days: 30, limit: 200, targets },
      }) };
    } });
    h.fake.storage.kiditem_environment_profiles_v1 = { local: { accessToken: 'test-token' } };
    let entered, release;
    const extracting = new Promise((resolve) => { entered = resolve; });
    const resume = new Promise((resolve) => { release = resolve; });
    const extract = h.fake.chrome.scripting.executeScript;
    let injections = 0;
    h.fake.chrome.scripting.executeScript = async (...args) => {
      if (!String(args[0]?.func).includes('extractSellerLinkInPage')) return extract(...args);
      injections++;
      entered();
      await resume;
      return extract(...args);
    };
    h.fake.chrome.tabs.remove = async (_id, callback) => { assert.equal(state, 'FAILED'); callback?.(); };
    const collecting = externalRequest(h.fake, { action: 'collectAdvertisingSellerIdentities', attemptId });
    await extracting;
    try {
      if (stop === 'cancel') {
        const cancelled = await externalRequest(h.fake, { action: 'cancelCollectionSession', attemptId });
        assert.equal(cancelled.terminalState, 'FAILED');
      } else {
        vm.runInContext(`Date.now = () => ${expires + 1}`, h.context);
      }
    } finally { release(); }
    const result = await collecting;
    assert.equal(result.terminalState, 'FAILED');
    assert.equal(injections, 1, 'no extraction after cancellation or expiry');
    assert.deepEqual(h.urls, ['about:blank', targets[0].link], 'no next product IO');
    assert.equal(writes.length, 1);
    assert.equal(writes[0].method, 'POST', 'no partial success submission after cancellation or expiry');
    if (stop === 'cancel') assert.equal(writes[0].body.code, 'COLLECTION_CANCELLED');
  });
});

test('Wing rank source dispatch transports the frozen plan with original sales sorting and observed page proof', async () => {
  const attemptId = '11111111-1111-4111-8111-111111111111';
  const attemptToken = '22222222-2222-4222-8222-222222222222';
  const uploads = [];
  const h = bootWingSearch([{ status: 200, body: { result: [
    { productId: 101, vendorItemId: 301, productName: '연필', salesLast28d: 3, salePrice: 1000 },
    { productId: 102, vendorItemId: 302, productName: '색연필', salesLast28d: 5, salePrice: 2000 },
  ], nextSearchPage: null } }], { fetch: async (url, init) => {
    assert.ok(String(url).endsWith(`/wing/attempts/${attemptId}`));
    if (init.method === 'PUT') {
      uploads.push({ body: JSON.parse(init.body), token: new Headers(init.headers).get('x-source-attempt-token') });
      return { ok: true, status: 200, json: async () => ({ attemptId, state: 'COMPLETE', itemCount: 2 }) };
    }
    return { ok: true, status: 200, json: async () => ({
      attemptId, attemptToken, state: 'RUNNING', keyword: '연필 세트',
      expiresAt: new Date(Date.now() + 1_500_000).toISOString(),
      plan: { sourceType: 'coupang_wing_rank', parserVersion: 'wing-rank-v1',
        keyword: '연필 세트', maxPages: 2, targets: [{ vendorItemId: '301' }] },
    }) };
  } });
  h.fake.storage.kiditem_environment_profiles_v1 = { local: { accessToken: 'fixture' } };
  const action = h.context.KidItemDomains.forExternalAction('collectAdvertisingWingRank');
  assert.equal(typeof action?.handle, 'function');
  for (const extra of [{ keyword: 'forged' }, { maxPages: 5 }, { attemptToken }, { runId: attemptId }]) {
    assert.throws(() => action.validate({ action: 'collectAdvertisingWingRank', attemptId, ...extra }));
  }
  const [reply, duplicate] = await Promise.all([0, 1].map(() => externalRequest(h.fake, {
    action: 'collectAdvertisingWingRank', attemptId,
  })));
  assert.deepEqual(reply, duplicate);
  assert.deepEqual(JSON.parse(JSON.stringify(reply)), { success: true, attemptId, terminalState: 'COMPLETE', itemCount: 2 });
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].token, attemptToken);
  assert.deepEqual(uploads[0].body.items.map(({ vendorItemId, salesRank }) => ({ vendorItemId, salesRank })), [
    { vendorItemId: '302', salesRank: 1 }, { vendorItemId: '301', salesRank: 2 },
  ]);
  assert.deepEqual(uploads[0].body.proof, { maxPages: 2, stopReason: 'no_next_search_page',
    pages: [{ searchPage: 0, itemCount: 2, nextSearchPage: null, resultArrayObserved: true }] });
  assert.equal(uploads[0].body.keyword, '연필 세트');
  assert.equal(uploads[0].body.pagesScanned, 1);
  assert.equal(uploads[0].body.collectedCount, 2);
  assert.equal(uploads[0].body.totalResults, null);
  assert.ok(Number.isFinite(Date.parse(uploads[0].body.capturedAt)));
  assert.equal(h.requests.length, 1);
  assert.deepEqual(h.urls, ['https://wing.coupang.com/tenants/seller-web/vendor-inventory/formV2']);
});

test('Wing rank source retains the existing two keyword tries on a failed browser request', async () => {
  const attemptId = '11111111-1111-4111-8111-111111111111';
  const writes = [];
  const h = bootWingSearch([new Error('injected frame unavailable'), { status: 200, body: { result: [] } }], {
    fetch: async (url, init) => {
      // The not-yet-retired startup poll is outside this source seam.
      if (!String(url).includes('/wing/attempts/')) return { ok: true, status: 200, json: async () => ({}) };
      if (init.method !== 'GET') writes.push({ url: String(url), method: init.method });
      return { ok: true, status: 200, json: async () => ({
        attemptId, attemptToken: '22222222-2222-4222-8222-222222222222',
        state: init.method === 'GET' ? 'RUNNING' : init.method === 'PUT' ? 'COMPLETE' : 'FAILED', itemCount: 0,
        expiresAt: new Date(Date.now() + 1_500_000).toISOString(),
        plan: { sourceType: 'coupang_wing_rank', parserVersion: 'wing-rank-v1', keyword: '연필 세트', maxPages: 5 },
      }) };
    },
  });
  h.fake.storage.kiditem_environment_profiles_v1 = { local: { accessToken: 'fixture' } };
  const result = await externalRequest(h.fake, { action: 'collectAdvertisingWingRank', attemptId });
  assert.equal(result.terminalState, 'COMPLETE');
  assert.deepEqual(writes, [{ url: `http://localhost:4000/api/ads/keyword-rank/wing/attempts/${attemptId}`, method: 'PUT' }]);
  assert.deepEqual(h.delays, [7000]);
  assert.equal(h.urls.length, 2);
  assert.equal(h.requests.length, 1);
});

test('Wing rank batch dispatch reads frozen owner membership and continues after page acknowledgement', async () => {
  const idempotencyKey = '33333333-3333-4333-8333-333333333333';
  const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
  const states = ['RUNNING', 'RUNNING'];
  const uploads = [];
  let releaseFirst;
  const firstUpload = new Promise((resolve) => { releaseFirst = resolve; });
  const h = bootWingSearch([
    { status: 200, body: { result: [], nextSearchPage: null } },
    { status: 200, body: { result: [], nextSearchPage: null } },
  ], { fetch: async (url, init) => {
    if (!String(url).includes('/keyword-rank/')) return { ok: true, status: 200, json: async () => ({}) };
    if (String(url).endsWith('/wing/batch-attempts')) {
      assert.equal(new Headers(init.headers).get('Idempotency-Key'), idempotencyKey);
      return { ok: true, status: 200, json: async () => ({ attempts: ids.map((attemptId, i) => ({ attemptId, state: states[i] })) }) };
    }
    const index = ids.findIndex((id) => String(url).endsWith(`/attempts/${id}`));
    assert.notEqual(index, -1);
    if (init.method === 'PUT') {
      uploads.push(JSON.parse(init.body));
      if (index === 0) await firstUpload;
      states[index] = 'COMPLETE';
    }
    return { ok: true, status: 200, json: async () => ({
      attemptId: ids[index], attemptToken: '44444444-4444-4444-8444-444444444444',
      state: states[index], itemCount: 0, expiresAt: new Date(Date.now() + 3_000_000).toISOString(),
      plan: { sourceType: 'coupang_wing_rank', parserVersion: 'wing-rank-v1',
        keyword: ['연필 세트', '색연필'][index], maxPages: 5 },
    }) };
  } });
  h.fake.storage.kiditem_environment_profiles_v1 = { local: { accessToken: 'fixture' } };
  const action = h.context.KidItemDomains.forExternalAction('collectAdvertisingWingRankBatch');
  assert.equal(typeof action?.handle, 'function');
  for (const extra of [{ targets: [] }, { runId: ids[0] }, { environmentId: 'office' }]) {
    assert.throws(() => action.validate({ action: 'collectAdvertisingWingRankBatch', idempotencyKey, ...extra }));
  }
  const reply = await externalRequest(h.fake, { action: 'collectAdvertisingWingRankBatch', idempotencyKey });
  assert.deepEqual(JSON.parse(JSON.stringify(reply)), { success: true, started: true });
  const duplicate = await externalRequest(h.fake, { action: 'collectAdvertisingWingRankBatch', idempotencyKey });
  assert.deepEqual(duplicate, reply);
  assert.equal(states[0], 'RUNNING', 'dispatch ACK is not a source result');
  releaseFirst();
  for (let tick = 0; tick < 100 && states[1] !== 'COMPLETE'; tick++) await new Promise(setImmediate);
  assert.deepEqual(states, ['COMPLETE', 'COMPLETE']);
  assert.deepEqual(uploads.map((body) => body.keyword), ['연필 세트', '색연필']);
  assert.deepEqual(h.requests.map(({ body }) => body.keyword), ['연필 세트', '색연필']);
  assert.ok(h.delays.includes(1850), 'original1.2–2.5s between-keyword pacing');
});

test('Wing rank batch cancellation fails queued owners before returning and prevents their provider IO', async () => {
  const idempotencyKey = '33333333-3333-4333-8333-333333333333';
  const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
  const states = ['RUNNING', 'RUNNING'];
  const failures = [];
  let cancellations = 0;
  let releaseUpload, uploadStarted;
  const uploaded = new Promise((resolve) => { uploadStarted = resolve; });
  const release = new Promise((resolve) => { releaseUpload = resolve; });
  const h = bootWingSearch([{ status: 200, body: { result: [], nextSearchPage: null } }], { fetch: async (url, init) => {
    if (!String(url).includes('/keyword-rank/')) return { ok: true, status: 200, json: async () => ({}) };
    if (String(url).endsWith('/batch-attempts')) return {
      ok: true, status: 200, json: async () => ({ attempts: ids.map((attemptId, i) => ({ attemptId, state: states[i] })) }),
    };
    if (String(url).endsWith('/batch-attempts/cancel')) {
      assert.equal(init.method, 'POST');
      cancellations += 1;
      for (let i = 0; i < states.length; i += 1) states[i] = 'FAILED';
      return { ok: true, status: 200, json: async () => ({
        attempts: ids.map((attemptId, i) => ({ attemptId, state: states[i] })),
      }) };
    }
    const index = ids.findIndex((id) => String(url).includes(`/attempts/${id}`));
    assert.notEqual(index, -1);
    if (init.method === 'PUT') { uploadStarted(); await release; }
    if (String(url).endsWith('/fail')) {
      assert.equal(new Headers(init.headers).get('x-source-attempt-token'), '44444444-4444-4444-8444-444444444444');
      failures.push({ attemptId: ids[index], ...JSON.parse(init.body) });
      states[index] = 'FAILED';
    }
    return { ok: true, status: 200, json: async () => ({
      attemptId: ids[index], attemptToken: '44444444-4444-4444-8444-444444444444', state: states[index],
      errorCode: states[index] === 'FAILED' ? 'COLLECTION_CANCELLED' : null,
      expiresAt: new Date(Date.now() + 3_000_000).toISOString(),
      plan: { sourceType: 'coupang_wing_rank', parserVersion: 'wing-rank-v1', keyword: ['연필', '색연필'][index], maxPages: 5 },
    }) };
  } });
  h.fake.storage.kiditem_environment_profiles_v1 = { local: { accessToken: 'fixture' } };
  const cancelAction = h.context.KidItemDomains.forExternalAction('cancelAdvertisingWingRankBatch');
  assert.equal(typeof cancelAction?.handle, 'function');
  await externalRequest(h.fake, { action: 'collectAdvertisingWingRankBatch', idempotencyKey });
  await uploaded;
  const cancelled = await externalRequest(h.fake, { action: 'cancelAdvertisingWingRankBatch', idempotencyKey });
  assert.equal(cancelled.success, true);
  assert.deepEqual(states, ['FAILED', 'FAILED']);
  assert.equal(cancellations, 1);
  assert.deepEqual(failures, []);
  releaseUpload();
  for (let tick = 0; tick < 10; tick++) await new Promise(setImmediate);
  assert.equal(h.requests.length, 1);
  assert.equal(await vm.runInContext(`collectionSessions.get('${ids[0]}')`, h.context), null);
});

for (const reason of ['provider wall', 'missing terminal ACK']) test(`Wing rank batch stops on ${reason} and explicitly fails only unstarted members`, async () => {
  const idempotencyKey = '33333333-3333-4333-8333-333333333333';
  const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
  const states = ['RUNNING', 'RUNNING'];
  const failures = [];
  const h = bootWingSearch([{ status: reason === 'provider wall' ? 401 : 200, body: { result: [], nextSearchPage: null } }], { fetch: async (url, init) => {
    if (!String(url).includes('/keyword-rank/')) return { ok: true, status: 200, json: async () => ({}) };
    if (String(url).endsWith('/batch-attempts')) return {
      ok: true, status: 200, json: async () => ({ attempts: ids.map((attemptId, i) => ({ attemptId, state: states[i] })) }),
    };
    const index = ids.findIndex((id) => String(url).includes(`/attempts/${id}`));
    assert.notEqual(index, -1);
    if (init.method === 'PUT') throw new Error('connection lost before ACK');
    if (String(url).endsWith('/fail')) {
      failures.push({ attemptId: ids[index], ...JSON.parse(init.body) });
      states[index] = 'FAILED';
    }
    return { ok: true, status: 200, json: async () => ({
      attemptId: ids[index], attemptToken: '44444444-4444-4444-8444-444444444444', state: states[index],
      errorCode: failures.find((failure) => failure.attemptId === ids[index])?.code,
      expiresAt: new Date(Date.now() + 3_000_000).toISOString(),
      plan: { sourceType: 'coupang_wing_rank', parserVersion: 'wing-rank-v1', keyword: ['연필', '색연필'][index], maxPages: 5 },
    }) };
  } });
  h.fake.storage.kiditem_environment_profiles_v1 = { local: { accessToken: 'fixture' } };
  await externalRequest(h.fake, { action: 'collectAdvertisingWingRankBatch', idempotencyKey });
  for (let tick = 0; tick < 100 && states[1] !== 'FAILED'; tick++) await new Promise(setImmediate);
  assert.deepEqual(states, [reason === 'provider wall' ? 'FAILED' : 'RUNNING', 'FAILED']);
  assert.equal(failures.find((failure) => failure.attemptId === ids[1])?.code, 'COLLECTION_INTERRUPTED');
  assert.equal(h.requests.length, 1, 'no next keyword after blocked or unconfirmed result');
  if (reason === 'missing terminal ACK') assert.equal(failures.length, 1, 'never contradict the uncertain current submission');
  else {
    const session = await externalRequest(h.fake, { action: 'getCollectionSession', attemptId: ids[0] });
    assert.equal(session.attention.reason, 'marketplace_login');
    assert.equal(BrowserCollectionSessionViewSchema.safeParse(session).success, true,
      'owner attention must remain readable through the shared page contract');
  }
});

test('Wing rank source cancellation is owner-confirmed and stops the next page or HTTP retry', async (t) => {
  for (const phase of ['page', 'HTTP retry']) await t.test(phase, async () => {
  const attemptId = '11111111-1111-4111-8111-111111111111';
  const writes = [];
  let state = 'RUNNING';
  const h = bootWingSearch(phase === 'page' ? [
    { status: 200, body: { result: [{ productId: 101 }], nextSearchPage: 5 } },
    { status: 200, body: { result: [] } },
  ] : [{ status: 429, body: {} }, { status: 200, body: { result: [] } }], { fetch: async (url, init) => {
    if (!String(url).includes('/wing/attempts/')) return { ok: true, status: 200, json: async () => ({}) };
    if (init.method !== 'GET') {
      writes.push({ url: String(url), body: JSON.parse(init.body) });
      state = 'FAILED';
    }
    return { ok: true, status: 200, json: async () => ({
      attemptId, attemptToken: '22222222-2222-4222-8222-222222222222', state, itemCount: 0,
      expiresAt: new Date(Date.now() + 1_500_000).toISOString(),
      plan: { sourceType: 'coupang_wing_rank', parserVersion: 'wing-rank-v1', keyword: '연필 세트', maxPages: 2 },
    }) };
  } });
  h.fake.storage.kiditem_environment_profiles_v1 = { local: { accessToken: 'fixture' } };
  let entered, release;
  const extracting = new Promise((resolve) => { entered = resolve; });
  const resume = new Promise((resolve) => { release = resolve; });
  if (phase === 'page') {
    const extract = h.fake.chrome.scripting.executeScript;
    h.fake.chrome.scripting.executeScript = async (...args) => {
      if (!String(args[0]?.func).includes('executeWingCatalogSearchInPage')) return extract(...args);
      entered();
      await resume;
      return extract(...args);
    };
  } else {
    const timer = h.context.setTimeout;
    h.context.setTimeout = (callback, ms) => {
      if (ms !== 4000) return timer(callback, ms);
      entered(); resume.then(callback); return 1;
    };
  }
  const closed = [];
  h.fake.chrome.tabs.remove = async (tabId, callback) => {
    assert.equal(state, 'FAILED'); closed.push(tabId); callback?.();
  };
  const collecting = externalRequest(h.fake, { action: 'collectAdvertisingWingRank', attemptId });
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
  assert.equal(h.requests.length, 1, 'the cancelled attempt must not request the next page');
  assert.deepEqual(closed, [42]);
  });
});

test('Wing rank source preserves rate-limit and login attention after the owner records failure', async (t) => {
  for (const reason of ['rate_limited', 'marketplace_login']) await t.test(reason, async () => {
    const attemptId = '11111111-1111-4111-8111-111111111111';
    const failures = [];
    const h = bootWingSearch(reason === 'rate_limited'
      ? Array.from({ length: 4 }, () => ({ status: 429, body: {} }))
      : [{ status: 403, contentType: 'text/html', body: 'login required' }], {
      fetch: async (url, init) => {
        if (!String(url).includes('/wing/attempts/')) return { ok: true, status: 200, json: async () => ({}) };
        if (init.method === 'POST') {
          assert.ok(String(url).endsWith(`/${attemptId}/fail`));
          failures.push(JSON.parse(init.body));
          return { ok: true, status: 200, json: async () => ({ attemptId, state: 'FAILED', itemCount: 0,
            errorCode: 'WING_RANK_PROVIDER_WALL', errorMessage: 'Provider attention required.' }) };
        }
        assert.equal(init.method, 'GET');
        return { ok: true, status: 200, json: async () => ({
          attemptId, attemptToken: '22222222-2222-4222-8222-222222222222', state: 'RUNNING',
          expiresAt: new Date(Date.now() + 1_500_000).toISOString(),
          plan: { sourceType: 'coupang_wing_rank', parserVersion: 'wing-rank-v1', keyword: '연필 세트', maxPages: 5 },
        }) };
      },
    });
    h.fake.storage.kiditem_environment_profiles_v1 = { local: { accessToken: 'fixture' } };
    const result = await externalRequest(h.fake, { action: 'collectAdvertisingWingRank', attemptId });
    assert.equal(result.terminalState, 'FAILED');
    assert.equal(failures.length, 1);
    assert.equal(failures[0].code, 'WING_RANK_PROVIDER_WALL');
    assert.equal(h.requests.length, reason === 'rate_limited' ? 4 : 1);
    assert.deepEqual(h.delays, reason === 'rate_limited' ? [4000, 8000, 16000] : []);
    const session = await externalRequest(h.fake, { action: 'getCollectionSession', attemptId });
    assert.equal(session?.attention?.reason, reason);
    const focused = [];
    h.fake.chrome.tabs.update = async (tabId, options) => { focused.push({ tabId, ...options }); };
    await externalRequest(h.fake, { action: 'openCollectionAttentionTab', attemptId });
    assert.deepEqual(focused, [{ tabId: 42, active: true }]);
  });
});

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

test('Wing catalog search reuses the existing session for both owners and rejects missing or foreign environments', async () => {
  for (const producer of [
    'sourcing.wing_catalog',
    'advertising.wing_rank',
    'advertising.wing_tracked_products',
  ]) {
    const h = bootWingSearch([{ status: 200, body: { result: [] } }], { producer });
    try {
      const result = await h.search(1);
      assert.equal(result.success, true, producer);
      assert.equal(result.stopReason, 'empty_page', producer);
    } finally {
      h.close();
    }
  }

  const missing = bootWingSearch([]);
  try {
    await assert.rejects(
      vm.runInContext(`wingSearchCollector.collect(${JSON.stringify({
        keyword: '연필 세트', maxPages: 1, environmentId: 'local',
      })})`, missing.context),
      /source_owner_attempt_required/,
    );
  } finally {
    missing.close();
  }

  const foreign = bootWingSearch([], { producer: 'advertising.wing_tracked_products' });
  try {
    await vm.runInContext(`collectionSessions.start({
      attemptId: '11111111-1111-4111-8111-111111111111',
      producer: 'advertising.wing_tracked_products',
      environmentId: 'local',
    })`, foreign.context);
    await assert.rejects(
      vm.runInContext(`wingSearchCollector.collect(${JSON.stringify({
        keyword: '연필 세트', maxPages: 1,
        attemptId: '11111111-1111-4111-8111-111111111111', environmentId: 'office',
      })})`, foreign.context),
      /source_owner_session_invalid/,
    );
  } finally {
    foreign.close();
  }
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
    assert.equal(h.urls.length, 2);
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
    assert.equal(h.urls.length, 2, 'a transport retry does not recollect the source');
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
  h.fake.chrome.scripting.executeScript = async (...args) => {
    if (!String(args[0]?.func).includes('extractCoupangSerpInPage')) return extract(...args);
    entered();
    await resume;
    return extract(...args);
  };
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
  assert.equal(h.urls.length, 2);
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
  assert.equal(h.urls.length, 2);
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
    'about:blank',
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
  assert.equal(later.urls.length, 3);
  const first = bootRankCollector([{ items: [] }]);
  const missing = await first.capture(3);
  assert.equal(missing.success, false);
  assert.match(missing.error, /검색 결과가 비어/);
  assert.equal(first.urls.length, 2);
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
    assert.equal(h.urls.length, 3, 'proof must not add navigation or retries');
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
    assert.equal(h.urls.length, pages.length + 1);
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
    assert.equal(h.urls.length, 3);
  }
});

test('통합 서비스워커가 세 도메인을 모두 싣고 부팅한다', () => {
  const { fake, context } = bootServiceWorker();

  // 도메인 워커 3개 + 통합 dispatch = 외부 리스너 4개.
  assert.equal(fake.externalMessageListeners.length, 4);
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
