import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { BrowserCollectionSessionViewSchema } from '@kiditem/shared/browser-collection-session';
import {
  CollectionStartRequestSchema,
  CollectionStartResultSchema,
} from '@kiditem/shared/collection-start';

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
    coverageStartDate: null,
    coverageEndDate: null,
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

test('retired generic scrape ingress has no external responder', async () => {
  const { fake } = bootServiceWorker();
  const responders = externalResponderCount(fake, { action: 'scrapeTargets', producer: 'advertising.ad_keyword',
    urls: [{ url: 'https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdKeyword=1', label: 'keywords' }] });
  assert.equal(responders, 0);
  assert.deepEqual(fake.createdTabs, []);
});

test('a started advertising keyword collection keeps HTTP and full queue replies constant as ad count grows', async () => {
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
    if (init?.method === 'POST' && String(url).endsWith('/ad-keywords/attempts')) {
      return { ok: true, status: 200, json: async () => ({ attemptId, state, channelAccountId: account,
        expiresAt: '2030-01-02T00:00:00.000Z' }) };
    }
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
  const reply = startResult(await externalRequest(fake, startCollectionMessage('advertising.ad_keyword')));
  assert.deepEqual(reply, { success: true, outcome: 'started', producer: 'advertising.ad_keyword', attemptId });
  await eventually(() => closed.includes('COMPLETE'), JSON.stringify({ writes, messages }));
  await settleCollections({ context });
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

test('a started campaign sweep runs the actual empty dashboard collector and waits for owner COMPLETE', async () => {
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
    if (init?.method === 'POST' && String(url).endsWith('/ad-campaigns/attempts')) {
      return { ok: true, status: 200, json: async () => ({ attemptId, state: control.state, channelAccountId: account,
        expiresAt: control.expiresAt }) };
    }
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
    const reply = startResult(await externalRequest(fake, startCollectionMessage('advertising.ad_sync')));
    assert.deepEqual(reply, { success: true, outcome: 'started', producer: 'advertising.ad_sync', attemptId });
    await completing.promise;
    assert.deepEqual(closed, []);
    assert.ok((await externalRequest(fake, { action: 'listCollectionSessions' })).some(s => s.attemptId === attemptId));
    completeAck.resolve();
    await eventually(() => closed.includes('COMPLETE'), 'the sweep never reported COMPLETE');
    await settleCollections({ context });
    assert.deepEqual(closed, ['COMPLETE']);
    assert.equal(context.KidItemDomains.capabilities().advertisingCampaignSourceOwnerV1, true);
    assert.equal(JSON.stringify(messages).includes(token), false);
    assert.equal(messages.filter(m => m.action === 'manualSync').length, 1);
    assert.deepEqual(requests.filter(r => r.method).map(r => r.method), ['PUT', 'POST']);
    const replay = startResult(await externalRequest(fake, startCollectionMessage('advertising.ad_sync')));
    assert.deepEqual(replay, { success: true, outcome: 'started', producer: 'advertising.ad_sync', attemptId });
    await settleCollections({ context });
    assert.equal(messages.filter(m => m.action === 'manualSync').length, 1, 'a COMPLETE replay runs nothing');
  } finally { completeAck.resolve(); dom?.window.close(); }
});

const coupangWindowAttemptToken = '22222222-2222-4222-8222-222222222222';
const coupangWindowAccount = '33333333-3333-4333-8333-333333333333';
const coupangWindowJson = (value, status = 200) => ({ ok: status < 400, status, json: async () => structuredClone(value) });

function coupangCampaignAttempt(attemptId, state = 'RUNNING', expiresAt = '2030-01-02T00:00:00.000Z') {
  return {
    attemptId, attemptToken: coupangWindowAttemptToken, channelAccountId: coupangWindowAccount, state, expiresAt,
    manifestChecksum: 'a'.repeat(64),
    errorCode: state === 'FAILED' ? 'AD_CAMPAIGN_COLLECTION_FAILED' : null,
    errorMessage: state === 'FAILED' ? 'fixture failure' : null,
    plan: {
      sourceType: 'coupang_ad_campaign', parserVersion: 'ad-campaign-v1', channelAccountId: coupangWindowAccount,
      expectedAdvertiserId: 'A0001', captureMode: 'campaign_sweep', startDate: '2026-08-06', endDate: '2026-09-05',
      businessDates: Array.from({ length: 31 }, (_, i) => new Date(Date.parse('2026-09-05') - i * 86400000).toISOString().slice(0, 10)),
    },
    receipts: [], pages: [], campaigns: [],
  };
}

function coupangKeywordAttempt(attemptId, state = 'RUNNING') {
  return {
    attemptId, attemptToken: coupangWindowAttemptToken, state, channelAccountId: coupangWindowAccount,
    expiresAt: '2030-01-02T00:00:00.000Z',
    plan: {
      sourceType: 'coupang_ad_keyword', parserVersion: 'ad-keyword-v1', channelAccountId: coupangWindowAccount,
      expectedAdvertiserId: 'A0001', startDate: '2026-08-30', endDate: '2026-09-05', windowDays: 7,
    },
    roster: null, queue: [], receipts: [], groupCount: 0, completedGroupCount: 0, manifestChecksum: 'a'.repeat(64),
    errorCode: state === 'FAILED' ? 'AD_KEYWORD_COLLECTION_FAILED' : null,
    errorMessage: state === 'FAILED' ? 'fixture failure' : null,
  };
}

function coupangTrafficAttempt(attemptId, state = 'RUNNING', parserVersion = 'wing-traffic-daily-v2') {
  const dates = ['2026-09-05', '2026-09-06'];
  return {
    attemptId, attemptToken: coupangWindowAttemptToken, state, channelAccountId: coupangWindowAccount,
    expiresAt: '2030-01-02T00:00:00.000Z', manifestChecksum: 'b'.repeat(64),
    errorCode: state === 'FAILED' ? 'WING_TRAFFIC_COLLECTION_FAILED' : null,
    errorMessage: state === 'FAILED' ? 'fixture failure' : null,
    plan: {
      sourceType: 'coupang_wing_traffic', parserVersion, channelAccountId: coupangWindowAccount,
      expectedAdvertiserId: 'A0001', startDate: dates[0], endDate: dates[1], businessDate: dates[1], periodDays: 2,
      targetUrl: `https://wing.coupang.com/tenants/business-insight/sales-analysis?start_date=${dates[0]}&end_date=${dates[1]}`,
      ...(parserVersion === 'wing-traffic-daily-v2'
        ? { providerVendorId: 'A0001', expectedDates: dates, filterScope: 'ALL_NORMAL_RFM' }
        : {}),
    },
    receipts: [],
  };
}

function coupangProfitabilityPlan(attemptId) {
  return {
    attemptId, attemptToken: coupangWindowAttemptToken, expiresAt: '2030-01-02T00:00:00.000Z',
    accounts: [{
      externalAccountId: 'acct-1', expectedAdvertiserId: 'A0001',
      slices: [{ sliceId: 'slice-1', from: '2026-08-01', to: '2026-08-31', businessDates: ['2026-08-01'] }],
    }],
  };
}

// ── Collection start (KID-147) ──────────────────────────────────────────────
// A web page starts a Coupang window collection with one `startCollection`
// request. The extension answers once the start is decided and runs the
// collection afterwards, so every reply is checked against the shared contract.

function startCollectionMessage(producer, scope = {}, idempotencyKey = randomUUID()) {
  return { action: 'startCollection', producer, idempotencyKey, scope };
}

function startResult(reply) {
  return CollectionStartResultSchema.parse(JSON.parse(JSON.stringify(reply)));
}

function within(promise, milliseconds, message) {
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function eventually(predicate, message, turns = 500) {
  for (let turn = 0; turn < turns; turn += 1) {
    if (await predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail(message);
}

// A begin answers with the attempt view, which carries no attempt token.
function coupangAttemptView(attemptId, state = 'RUNNING') {
  return {
    attemptId, state, channelAccountId: coupangWindowAccount, expiresAt: '2030-01-02T00:00:00.000Z',
    errorCode: state === 'FAILED' ? 'SOURCE_COLLECTION_FAILED' : null,
    errorMessage: state === 'FAILED' ? 'fixture failure' : null,
  };
}

function requestHeader(init, name) {
  return new Headers(init?.headers || {}).get(name);
}

// Lets a started collection finish before the harness closes.
async function settleCollections(h) {
  await eventually(
    () => vm.runInContext('KidItemWorkerKeepAlive.holders', h.context) === 0,
    'a started collection kept the service worker alive',
  );
}

test('a collection start on a free window answers started before its run ends and runs the owner', async () => {
  const attemptId = '91111111-1111-4111-8111-111111111111';
  const idempotencyKey = randomUUID();
  const begins = [];
  const collected = [];
  const collecting = Promise.withResolvers();
  const releaseCollect = Promise.withResolvers();
  const h = bootServiceWorker({ fetch: async (url, init = {}) => {
    const href = String(url);
    if (href.endsWith('/api/ads/ad-keywords/attempts') && init.method === 'POST') {
      begins.push({ key: requestHeader(init, 'Idempotency-Key'), body: JSON.parse(init.body) });
      return coupangWindowJson(coupangAttemptView(attemptId));
    }
    if (href.endsWith(`/api/ads/ad-keywords/attempts/${attemptId}/control`)) {
      return coupangWindowJson(coupangKeywordAttempt(attemptId));
    }
    return coupangWindowJson({});
  } });
  h.fake.storage.kiditem_environment_profiles_v1 = { local: { accessToken: 'fixture' } };
  h.context.startCollector = {
    collectKeywords: async (input) => {
      collected.push(input.attemptId);
      collecting.resolve();
      await releaseCollect.promise;
      return { success: false, errorCode: 'SOURCE_OWNER_UNAVAILABLE', error: 'fixture stop' };
    },
  };
  vm.runInContext('adCenterCollectors.local = { collectKeywords: (input) => startCollector.collectKeywords(input) };', h.context);
  try {
    const reply = await within(
      externalRequest(h.fake, startCollectionMessage(
        'advertising.ad_keyword', { channelAccountId: coupangWindowAccount }, idempotencyKey,
      )),
      2000,
      'the start reply waited for the collection to end',
    );

    assert.deepEqual(startResult(reply), {
      success: true, outcome: 'started', producer: 'advertising.ad_keyword', attemptId,
    });
    assert.deepEqual(begins, [{ key: idempotencyKey, body: { channelAccountId: coupangWindowAccount } }]);
    await within(collecting.promise, 2000, 'the started collection never ran');
    assert.deepEqual(collected, [attemptId]);
    releaseCollect.resolve();
    await settleCollections(h);
  } finally {
    releaseCollect.resolve();
    h.close();
  }
});

// Boots a worker whose keyword owner begins and reads attempts from the given
// ids, and whose keyword capture waits until the test releases it.
function bootKeywordStartHarness(attemptIds) {
  const begins = [];
  const collecting = Promise.withResolvers();
  const releaseCollect = Promise.withResolvers();
  let nextAttempt = 0;
  const h = bootServiceWorker({ fetch: async (url, init = {}) => {
    const href = String(url);
    if (init.method === 'POST' && href.endsWith('/attempts')) {
      begins.push({ href, key: requestHeader(init, 'Idempotency-Key'), body: JSON.parse(init.body) });
      return coupangWindowJson(coupangAttemptView(attemptIds[nextAttempt++]));
    }
    for (const id of attemptIds) {
      if (href.endsWith(`/api/ads/ad-keywords/attempts/${id}/control`)) {
        return coupangWindowJson(coupangKeywordAttempt(id));
      }
    }
    return coupangWindowJson({});
  } });
  h.fake.storage.kiditem_environment_profiles_v1 = { local: { accessToken: 'fixture' } };
  h.context.startCollector = {
    collectKeywords: async () => {
      collecting.resolve();
      await releaseCollect.promise;
      return { success: false, errorCode: 'SOURCE_OWNER_UNAVAILABLE', error: 'fixture stop' };
    },
  };
  vm.runInContext('adCenterCollectors.local = { collectKeywords: (input) => startCollector.collectKeywords(input) };', h.context);
  return { h, begins, collecting, releaseCollect };
}

const KEYWORD_HOLDER_REFUSAL = '쿠팡 광고 키워드 수집이 수집 창을 쓰고 있습니다. 끝난 뒤 다시 시작해 주세요.';

test('starts that arrive together admit one collection and answer the others without opening an attempt', async () => {
  const attemptId = '92111111-1111-4111-8111-111111111111';
  const { h, begins, releaseCollect } = bootKeywordStartHarness([attemptId, randomUUID()]);
  try {
    const replies = await within(Promise.all([
      externalRequest(h.fake, startCollectionMessage('advertising.ad_keyword')),
      externalRequest(h.fake, startCollectionMessage('dashboard.wing_sales', { startDate: '2026-09-05', endDate: '2026-09-06' })),
      externalRequest(h.fake, startCollectionMessage('advertising.ad_keyword')),
    ]), 2000, 'a start waited for another start');

    assert.deepEqual(replies.map(startResult), [
      { success: true, outcome: 'started', producer: 'advertising.ad_keyword', attemptId },
      {
        success: true, outcome: 'refused', producer: 'dashboard.wing_sales',
        holder: { producer: 'advertising.ad_keyword', name: '쿠팡 광고 키워드', attemptId: null },
        message: KEYWORD_HOLDER_REFUSAL,
      },
      { success: true, outcome: 'running', producer: 'advertising.ad_keyword', attemptId: null },
    ]);
    assert.equal(begins.length, 1, 'only the admitted start opened an attempt');
    releaseCollect.resolve();
    await settleCollections(h);
  } finally {
    releaseCollect.resolve();
    h.close();
  }
});

test('a running collection keeps the window: another collection is refused and the same one answers running', async () => {
  const attemptId = '93111111-1111-4111-8111-111111111111';
  const { h, begins, collecting, releaseCollect } = bootKeywordStartHarness([attemptId, randomUUID()]);
  try {
    startResult(await externalRequest(h.fake, startCollectionMessage('advertising.ad_keyword')));
    await within(collecting.promise, 2000, 'the admitted collection never ran');

    const refused = startResult(await externalRequest(h.fake, startCollectionMessage(
      'dashboard.wing_sales', { startDate: '2026-09-05', endDate: '2026-09-06' },
    )));
    const running = startResult(await externalRequest(h.fake, startCollectionMessage('advertising.ad_keyword')));

    assert.deepEqual(refused, {
      success: true, outcome: 'refused', producer: 'dashboard.wing_sales',
      holder: { producer: 'advertising.ad_keyword', name: '쿠팡 광고 키워드', attemptId },
      message: KEYWORD_HOLDER_REFUSAL,
    });
    assert.deepEqual(running, { success: true, outcome: 'running', producer: 'advertising.ad_keyword', attemptId });
    assert.equal(begins.length, 1, 'neither answer opened an attempt');
    releaseCollect.resolve();
    await settleCollections(h);
  } finally {
    releaseCollect.resolve();
    h.close();
  }
});

// A collection window and its tab left behind by a collection in an earlier
// worker life: window 7 with tab 41, recorded for `runId`.
function installLeftoverWindow(h, runId, windowStorageKey = 'COLLECTION_WINDOW_STORAGE_KEY') {
  const windows = new Map([[7, { id: 7, type: 'normal', tabs: [
    { id: 41, windowId: 7, status: 'complete', url: 'https://advertising.coupang.com/marketing/dashboard/sales' },
  ] }]]);
  const removedWindows = [];
  h.fake.chrome.windows.get = (id, _options, callback) => {
    const win = windows.get(id);
    callback?.(win ? structuredClone(win) : undefined);
  };
  h.fake.chrome.windows.remove = (id, callback) => { removedWindows.push(id); windows.delete(id); callback?.(); };
  h.fake.chrome.windows.create = (properties, callback) => {
    const win = { id: 8, type: 'normal', tabs: [{ id: 42, windowId: 8, status: 'complete', url: properties.url }] };
    windows.set(win.id, win);
    callback?.(structuredClone(win));
  };
  h.fake.chrome.tabs.get = (id, callback) => {
    const tab = [...windows.values()].flatMap((win) => win.tabs).find((entry) => entry.id === id);
    callback?.(tab ? structuredClone(tab) : undefined);
  };
  const windowKey = vm.runInContext(`coupangEnvironment.stateKey(${windowStorageKey}, "local")`, h.context);
  h.fake.storage[windowKey] = { runId, windowId: 7, tabId: 41 };
  return { removedWindows, windowKey };
}

test('after a restart a session whose attempt still runs protects the window and nothing is opened', async () => {
  const trafficId = '94111111-1111-4111-8111-111111111111';
  const begins = [];
  const h = bootServiceWorker({ fetch: async (url, init = {}) => {
    const href = String(url);
    if (init.method === 'POST' && href.endsWith('/attempts')) {
      begins.push(href);
      return coupangWindowJson(coupangAttemptView(randomUUID()));
    }
    if (href.endsWith(`/api/ads/traffic/attempts/${trafficId}/control`)) {
      return coupangWindowJson(coupangTrafficAttempt(trafficId, 'RUNNING'));
    }
    return coupangWindowJson({});
  } });
  h.fake.storage.kiditem_environment_profiles_v1 = { local: { accessToken: 'fixture' } };
  const { removedWindows } = installLeftoverWindow(h, trafficId);
  try {
    const sessions = vm.runInContext('collectionSessions', h.context);
    await sessions.start({ attemptId: trafficId, environmentId: 'local', producer: 'dashboard.wing_sales' });

    const refused = startResult(await externalRequest(h.fake, startCollectionMessage('advertising.ad_sync')));
    const running = startResult(await externalRequest(h.fake, startCollectionMessage(
      'dashboard.wing_sales', { startDate: '2026-09-05', endDate: '2026-09-06' },
    )));

    assert.deepEqual(refused, {
      success: true, outcome: 'refused', producer: 'advertising.ad_sync',
      holder: { producer: 'dashboard.wing_sales', name: '쿠팡 Wing 트래픽', attemptId: trafficId },
      message: '쿠팡 Wing 트래픽 수집이 수집 창을 쓰고 있습니다. 끝난 뒤 다시 시작해 주세요.',
    });
    assert.deepEqual(running, { success: true, outcome: 'running', producer: 'dashboard.wing_sales', attemptId: trafficId });
    assert.deepEqual(begins, []);
    assert.deepEqual(removedWindows, []);
    assert.ok(await sessions.get(trafficId), 'the running collection keeps its session');
  } finally {
    h.close();
  }
});

test('a leftover whose attempt an operator stopped on the server frees the window at the next start', async () => {
  const leftoverId = '95111111-1111-4111-8111-111111111111';
  const trafficId = '95222222-2222-4222-8222-222222222222';
  const cancelled = { ...coupangCampaignAttempt(leftoverId, 'FAILED'), errorCode: 'USER_CANCELLED', errorMessage: '운영자가 수집을 중단했습니다.' };
  const h = bootServiceWorker({ fetch: async (url, init = {}) => {
    const href = String(url);
    if (href.endsWith(`/api/ads/ad-campaigns/attempts/${leftoverId}/control`)) return coupangWindowJson(cancelled);
    if (init.method === 'POST' && href.endsWith('/api/ads/traffic/attempts')) {
      return coupangWindowJson(coupangAttemptView(trafficId));
    }
    if (href.endsWith(`/api/ads/traffic/attempts/${trafficId}/control`)) {
      return coupangWindowJson(coupangTrafficAttempt(trafficId));
    }
    return coupangWindowJson({});
  } });
  h.fake.storage.kiditem_environment_profiles_v1 = { local: { accessToken: 'fixture' } };
  const { removedWindows } = installLeftoverWindow(h, leftoverId);
  h.context.trafficCollector = {
    collectTraffic: async () => ({ success: false, errorCode: 'SOURCE_OWNER_UNAVAILABLE', error: 'fixture stop' }),
  };
  vm.runInContext('wingReportCollectors.local = { collectTraffic: (input) => trafficCollector.collectTraffic(input) };', h.context);
  try {
    const sessions = vm.runInContext('collectionSessions', h.context);
    await sessions.start({ attemptId: leftoverId, environmentId: 'local', producer: 'advertising.ad_sync' });
    await sessions.requireAttention(leftoverId, { reason: 'marketplace_login', message: '로그인이 필요합니다.' });

    const reply = startResult(await externalRequest(h.fake, startCollectionMessage(
      'dashboard.wing_sales', { startDate: '2026-09-05', endDate: '2026-09-06' },
    )));

    assert.deepEqual(reply, { success: true, outcome: 'started', producer: 'dashboard.wing_sales', attemptId: trafficId });
    assert.deepEqual(removedWindows, [7], 'the stopped collection window is closed');
    assert.equal(await sessions.get(leftoverId), null, 'and its session is cleared');
    await settleCollections(h);
  } finally {
    h.close();
  }
});

test('a begin the owner answers with ATTEMPT_IN_PROGRESS answers running with that attempt and runs nothing', async () => {
  const runningId = '96111111-1111-4111-8111-111111111111';
  for (const conflict of [
    { code: 'ATTEMPT_IN_PROGRESS', attemptId: runningId },
    { statusCode: 409, error: 'ATTEMPT_IN_PROGRESS', message: 'Conflict Exception', attemptId: runningId },
  ]) {
    const collected = [];
    const h = bootServiceWorker({ fetch: async (url, init = {}) => {
      if (init.method === 'POST' && String(url).endsWith('/api/ads/wing-itemwinner/attempts')) {
        return coupangWindowJson(conflict, 409);
      }
      return coupangWindowJson({});
    } });
    h.fake.storage.kiditem_environment_profiles_v1 = { local: { accessToken: 'fixture' } };
    h.context.itemwinnerCollector = { collectItemwinner: async (input) => { collected.push(input.attemptId); return { success: false }; } };
    vm.runInContext('wingReportCollectors.local = { collectItemwinner: (input) => itemwinnerCollector.collectItemwinner(input) };', h.context);
    try {
      const reply = startResult(await externalRequest(h.fake, startCollectionMessage('dashboard.wing_kpi')));
      assert.deepEqual(reply, { success: true, outcome: 'running', producer: 'dashboard.wing_kpi', attemptId: runningId });
      await settleCollections(h);
      assert.deepEqual(collected, []);

      const next = startResult(await externalRequest(h.fake, startCollectionMessage('dashboard.wing_kpi')));
      assert.equal(next.outcome, 'running', 'the answered start left the window free');
    } finally {
      h.close();
    }
  }
});

test('a begin conflict that names no running attempt fails the start instead of guessing', async () => {
  const h = bootServiceWorker({ fetch: async (url, init = {}) =>
    init.method === 'POST' && String(url).endsWith('/api/ads/ad-keywords/attempts')
      ? coupangWindowJson({ statusCode: 409, error: 'HTTP_409', message: 'SOURCE_IDEMPOTENCY_KEY_REUSED' }, 409)
      : coupangWindowJson({}) });
  h.fake.storage.kiditem_environment_profiles_v1 = { local: { accessToken: 'fixture' } };
  try {
    const reply = JSON.parse(JSON.stringify(await externalRequest(h.fake, startCollectionMessage('advertising.ad_keyword'))));
    assert.equal(reply.success, false);
    assert.equal(CollectionStartResultSchema.safeParse(reply).success, false);
    assert.equal(reply.error, 'SOURCE_IDEMPOTENCY_KEY_REUSED');
  } finally {
    h.close();
  }
});

test('a start whose begin replays a finished attempt answers started and runs nothing', async () => {
  for (const state of ['COMPLETE', 'FAILED']) {
    const attemptId = randomUUID();
    const ownerRequests = [];
    const h = bootServiceWorker({ fetch: async (url, init = {}) => {
      const href = String(url);
      if (!href.includes('/api/ads/ad-keywords/')) return coupangWindowJson({});
      ownerRequests.push(`${init.method || 'GET'} ${new URL(href).pathname}`);
      return href.endsWith('/api/ads/ad-keywords/attempts')
        ? coupangWindowJson(coupangAttemptView(attemptId, state))
        : coupangWindowJson(coupangKeywordAttempt(attemptId, state));
    } });
    h.fake.storage.kiditem_environment_profiles_v1 = { local: { accessToken: 'fixture' } };
    try {
      const reply = startResult(await externalRequest(h.fake, startCollectionMessage('advertising.ad_keyword')));
      await settleCollections(h);

      assert.deepEqual(reply, { success: true, outcome: 'started', producer: 'advertising.ad_keyword', attemptId }, state);
      assert.deepEqual(ownerRequests, ['POST /api/ads/ad-keywords/attempts'], `${state}: the web app reads the ended attempt itself`);
      assert.deepEqual(h.fake.createdTabs, [], state);
    } finally {
      h.close();
    }
  }
});

test('each window collection opens its attempt with its own owner and scope, then runs that owner', async () => {
  const account = coupangWindowAccount;
  const cases = [
    {
      producer: 'advertising.ad_sync', scope: { channelAccountId: account }, path: '/api/ads/ad-campaigns/attempts',
      controlPath: (id) => `/api/ads/ad-campaigns/attempts/${id}/control`, control: (id) => coupangCampaignAttempt(id),
      collector: 'adCenterCollectors', method: 'collectCampaigns',
    },
    {
      producer: 'advertising.ad_keyword', scope: {}, path: '/api/ads/ad-keywords/attempts',
      controlPath: (id) => `/api/ads/ad-keywords/attempts/${id}/control`, control: (id) => coupangKeywordAttempt(id),
      collector: 'adCenterCollectors', method: 'collectKeywords',
    },
    {
      producer: 'dashboard.wing_sales', scope: { channelAccountId: account, startDate: '2026-09-05', endDate: '2026-09-06' },
      path: '/api/ads/traffic/attempts',
      controlPath: (id) => `/api/ads/traffic/attempts/${id}/control`, control: (id) => coupangTrafficAttempt(id),
      collector: 'wingReportCollectors', method: 'collectTraffic',
    },
    {
      producer: 'dashboard.wing_kpi', scope: { channelAccountId: account }, path: '/api/ads/wing-itemwinner/attempts',
      controlPath: (id) => `/api/ads/wing-itemwinner/attempts/${id}`,
      control: (id) => popupItemwinnerAttempt('RUNNING', popupItemwinnerUrl, id),
      collector: 'wingReportCollectors', method: 'collectItemwinner',
    },
    {
      producer: 'advertising.profitability_import', scope: {}, path: '/api/ads/profitability-imports',
      begin: (id) => coupangProfitabilityPlan(id),
      collector: 'adCenterCollectors', method: 'collectProfitabilitySlice',
    },
  ];
  for (const scenario of cases) {
    const attemptId = randomUUID();
    const idempotencyKey = randomUUID();
    const begins = [];
    const collected = [];
    const h = bootServiceWorker({ fetch: async (url, init = {}) => {
      const pathname = new URL(String(url)).pathname;
      if (init.method === 'POST' && pathname === scenario.path) {
        begins.push({ key: requestHeader(init, 'Idempotency-Key'), body: JSON.parse(init.body) });
        return coupangWindowJson(scenario.begin ? scenario.begin(attemptId) : coupangAttemptView(attemptId));
      }
      if (scenario.controlPath && pathname === scenario.controlPath(attemptId)) {
        return coupangWindowJson(scenario.control(attemptId));
      }
      return coupangWindowJson({});
    } });
    h.fake.storage.kiditem_environment_profiles_v1 = { local: { accessToken: 'fixture' } };
    h.context.startCollector = {
      collect: async (input) => {
        collected.push(input.attemptId);
        return { success: false, errorCode: 'SOURCE_OWNER_UNAVAILABLE', error: 'fixture stop' };
      },
    };
    vm.runInContext(`${scenario.collector}.local = { ${scenario.method}: (input) => startCollector.collect(input) };`, h.context);
    try {
      const reply = startResult(await externalRequest(
        h.fake, startCollectionMessage(scenario.producer, scenario.scope, idempotencyKey),
      ));
      await eventually(() => collected.length > 0, `${scenario.producer} never ran its owner`);
      await settleCollections(h);

      assert.deepEqual(reply, { success: true, outcome: 'started', producer: scenario.producer, attemptId });
      assert.deepEqual(begins[0], { key: idempotencyKey, body: scenario.scope }, scenario.producer);
      assert.ok(begins.every((begin) => begin.key === idempotencyKey), `${scenario.producer} replays only its own key`);
      assert.deepEqual([...new Set(collected)], [attemptId], scenario.producer);
    } finally {
      h.close();
    }
  }
});

test('the start request is validated exactly like the shared contract', () => {
  const h = bootServiceWorker();
  const key = '11111111-1111-4111-8111-111111111111';
  const account = coupangWindowAccount;
  const start = (producer, scope, extra = {}) => ({ action: 'startCollection', producer, idempotencyKey: key, scope, ...extra });
  const manual = (fields) => start('advertising.ad_sync', { captureMode: 'manual_report', ...fields });
  const messages = [
    start('advertising.ad_sync', {}),
    start('advertising.ad_sync', { channelAccountId: account }),
    start('advertising.ad_sync', { channelAccountId: 'not-a-uuid' }),
    start('advertising.ad_sync', { captureMode: 'campaign_sweep' }),
    manual({ period: '1d', startDate: '2026-09-13', endDate: '2026-09-13' }),
    manual({ channelAccountId: account, period: '7d', startDate: '2026-08-28', endDate: '2026-09-03' }),
    manual({ period: '7d', startDate: '2026-12-29', endDate: '2027-01-04' }),
    manual({ period: '7d', startDate: '2026-09-07', endDate: '2026-09-12' }),
    manual({ period: '1d', startDate: '2026-09-13', endDate: '2026-09-14' }),
    manual({ period: '14d', startDate: '2026-09-01', endDate: '2026-09-14' }),
    manual({ period: '1d', startDate: '2026-09-13', endDate: '2026-09-13', targetUrl: 'https://advertising.coupang.com/marketing/dashboard/sales' }),
    start('advertising.ad_keyword', {}),
    start('advertising.ad_keyword', { startDate: '2026-09-01' }),
    start('advertising.profitability_import', {}),
    start('advertising.profitability_import', { channelAccountId: account }),
    start('dashboard.wing_sales', { startDate: '2026-09-05', endDate: '2026-09-06' }),
    start('dashboard.wing_sales', { channelAccountId: account, startDate: '2024-02-29', endDate: '2024-03-01' }),
    start('dashboard.wing_sales', { startDate: '2026-02-29', endDate: '2026-03-01' }),
    start('dashboard.wing_sales', { startDate: '2026-09-06', endDate: '2026-09-05' }),
    start('dashboard.wing_sales', { startDate: '2026-09-05' }),
    start('dashboard.wing_kpi', { channelAccountId: account }),
    start('dashboard.wing_kpi', { channelAccountId: account }, { environmentId: 'office' }),
    start('dashboard.wing_kpi', undefined),
    start('dashboard.wing_kpi', []),
    start('channels.coupang_catalog', { channelAccountId: account }),
    start('channels.coupang_catalog', {}),
    start('channels.coupang_catalog', { channelAccountId: 'not-a-uuid' }),
    start('channels.coupang_catalog', { channelAccountId: account, stage: 'basics' }),
    start('advertising.wing_rank', {}),
    { ...start('dashboard.wing_kpi', {}), idempotencyKey: 'not-a-uuid' },
    { ...start('dashboard.wing_kpi', {}), idempotencyKey: 'AAAAAAAA-AAAA-0AAA-0AAA-AAAAAAAAAAAA' },
    { ...start('dashboard.wing_kpi', {}), action: 'collectAdvertisingWingItemwinner' },
    { action: 'startCollection', producer: 'dashboard.wing_kpi', scope: {} },
    null,
    [],
  ];
  try {
    const parse = (message) => {
      try {
        h.context.KidItemCoupangCollectionStart.parseRequest(message);
        return true;
      } catch {
        return false;
      }
    };
    for (const message of messages) {
      assert.equal(parse(message), CollectionStartRequestSchema.safeParse(message).success, JSON.stringify(message));
    }
    assert.ok(messages.some((message) => CollectionStartRequestSchema.safeParse(message).success));
    assert.ok(messages.some((message) => !CollectionStartRequestSchema.safeParse(message).success));
  } finally {
    h.close();
  }
});

// ── Manual campaign report through the collection start ───────────────────────
// The server freezes the begin into a manual-report plan; the fixture does the same.
function manualReportControl(attemptId, begin, state = 'RUNNING') {
  return {
    attemptId, attemptToken: coupangWindowAttemptToken, channelAccountId: coupangWindowAccount, state,
    expiresAt: '2030-01-02T00:00:00.000Z', manifestChecksum: 'c'.repeat(64),
    errorCode: null, errorMessage: null,
    plan: {
      sourceType: 'coupang_ad_campaign', parserVersion: 'ad-campaign-v1', channelAccountId: coupangWindowAccount,
      expectedAdvertiserId: 'A0001', captureMode: 'manual_report', period: begin.period,
      startDate: begin.startDate, endDate: begin.endDate, targetUrl: begin.targetUrl, businessDates: [begin.endDate],
    },
    receipts: [], pages: [], campaigns: [],
  };
}

// Runs the real Ads collector against a fake collection window. The report tab
// answers the manual sync with `reportReply`.
async function runManualReportStart(scope, reportReply) {
  const attemptId = randomUUID();
  const begins = [];
  const failures = [];
  const reports = [];
  let control = null;
  const h = bootServiceWorker({ fetch: async (url, init = {}) => {
    const pathname = new URL(String(url)).pathname;
    if (init.method === 'POST' && pathname === '/api/ads/ad-campaigns/attempts') {
      const body = JSON.parse(init.body);
      begins.push(body);
      control = manualReportControl(attemptId, body);
      return coupangWindowJson(coupangAttemptView(attemptId));
    }
    if (pathname === `/api/ads/ad-campaigns/attempts/${attemptId}/control`) return coupangWindowJson(control);
    if (init.method === 'POST' && pathname === `/api/ads/ad-campaigns/attempts/${attemptId}/fail`) {
      const body = JSON.parse(init.body);
      failures.push(body);
      Object.assign(control, { state: 'FAILED', errorCode: body.code, errorMessage: body.message });
      return coupangWindowJson(control);
    }
    return coupangWindowJson({});
  } });
  h.fake.storage.kiditem_environment_profiles_v1 = { local: { accessToken: 'fixture' } };
  let tab = null;
  h.fake.chrome.windows.create = (properties, callback) => {
    tab = { id: 41, windowId: 7, status: 'complete', url: properties.url };
    callback({ id: 7, type: 'normal', tabs: [tab] });
  };
  h.fake.chrome.windows.get = (_id, _options, callback) => {
    const win = tab ? { id: 7, type: 'normal', tabs: [tab] } : undefined;
    callback?.(win);
  };
  h.fake.chrome.windows.remove = (_id, callback) => { tab = null; callback?.(); };
  h.fake.chrome.tabs.get = (_id, callback) => { callback?.(tab ? { ...tab } : undefined); };
  h.fake.chrome.tabs.update = (_id, properties, callback) => { Object.assign(tab, properties); callback?.({ ...tab }); };
  h.fake.chrome.tabs.sendMessage = (_id, message, callback) => {
    if (message.action !== 'manualSync') return callback?.({ success: true });
    reports.push({ tabUrl: tab?.url, message: structuredClone(message) });
    callback(reportReply);
  };
  // The collector lets a report page settle for seconds; the fixture page is ready.
  h.context.setTimeout = (callback, milliseconds) => {
    if (milliseconds < 10_000) {
      queueMicrotask(callback);
      return 1;
    }
    return setTimeout(callback, milliseconds);
  };
  try {
    const reply = startResult(await externalRequest(h.fake, startCollectionMessage('advertising.ad_sync', scope)));
    await eventually(() => failures.length > 0, 'the manual report attempt never settled');
    await settleCollections(h);
    return { attemptId, reply, begins, failures, reports };
  } finally {
    h.close();
  }
}

test('a 1-day manual report start opens that day\'s report page in the collection window', async () => {
  const mismatch = {
    success: false, errorCode: 'MANUAL_REPORT_SCOPE_MISMATCH',
    error: '광고 보고서 기간을 2026-09-13 ~ 2026-09-13로 맞추지 못했습니다.',
  };
  const scope = { captureMode: 'manual_report', channelAccountId: coupangWindowAccount, period: '1d', startDate: '2026-09-13', endDate: '2026-09-13' };
  const targetUrl = 'https://advertising.coupang.com/marketing/dashboard/sales#targetDate=2026-09-13';

  const { attemptId, reply, begins, failures, reports } = await runManualReportStart(scope, mismatch);

  assert.deepEqual(reply, { success: true, outcome: 'started', producer: 'advertising.ad_sync', attemptId });
  assert.deepEqual(begins, [{ ...scope, targetUrl }]);
  assert.equal(reports.length, 1);
  assert.equal(reports[0].tabUrl, targetUrl, 'the collection window shows the report page it began');
  assert.equal(reports[0].message.syncMode, 'campaign_manual_report');
  assert.equal(reports[0].message.campaignControl.plan.targetUrl, targetUrl);
  assert.equal(JSON.stringify(reports[0].message).includes(coupangWindowAttemptToken), false);
  assert.deepEqual(failures, [{ code: mismatch.errorCode, message: mismatch.error }], 'an unconfirmed range fails the attempt');
});

test('a 7-day manual report start opens the report page without a single-day marker', async () => {
  const scope = { captureMode: 'manual_report', period: '7d', startDate: '2026-09-07', endDate: '2026-09-13' };
  const targetUrl = 'https://advertising.coupang.com/marketing/dashboard/sales#kiditemManualReport=2026-09-07_2026-09-13';

  const { reply, begins, reports } = await runManualReportStart(scope, {
    success: false, errorCode: 'MANUAL_REPORT_SCOPE_MISMATCH', error: '광고 보고서 기간을 맞추지 못했습니다.',
  });

  assert.equal(reply.outcome, 'started');
  assert.deepEqual(begins, [{ ...scope, targetUrl }]);
  assert.doesNotMatch(begins[0].targetUrl, /targetDate=/, 'the owner refuses a 7-day plan that names one day');
  assert.equal(reports[0].tabUrl, targetUrl);
  assert.equal(reports[0].message.campaignControl.plan.period, '7d');
});

test('a manual report is refused while another producer\'s sweep holds the window and runs with its own sweep', async () => {
  const keywordId = '97111111-1111-4111-8111-111111111111';
  const manualScope = { captureMode: 'manual_report', period: '1d', startDate: '2026-09-13', endDate: '2026-09-13' };
  const { h, begins, collecting, releaseCollect } = bootKeywordStartHarness([keywordId]);
  try {
    startResult(await externalRequest(h.fake, startCollectionMessage('advertising.ad_keyword')));
    await within(collecting.promise, 2000, 'the keyword sweep never ran');

    const refused = startResult(await externalRequest(h.fake, startCollectionMessage('advertising.ad_sync', manualScope)));

    assert.deepEqual(refused, {
      success: true, outcome: 'refused', producer: 'advertising.ad_sync',
      holder: { producer: 'advertising.ad_keyword', name: '쿠팡 광고 키워드', attemptId: keywordId },
      message: KEYWORD_HOLDER_REFUSAL,
    });
    assert.equal(begins.length, 1, 'the refused report opened nothing');
    releaseCollect.resolve();
    await settleCollections(h);
  } finally {
    releaseCollect.resolve();
    h.close();
  }

  const sweepId = '97222222-2222-4222-8222-222222222222';
  const collecting2 = Promise.withResolvers();
  const releaseSweep = Promise.withResolvers();
  const sweepBegins = [];
  const h2 = bootServiceWorker({ fetch: async (url, init = {}) => {
    const pathname = new URL(String(url)).pathname;
    if (init.method === 'POST' && pathname === '/api/ads/ad-campaigns/attempts') {
      sweepBegins.push(JSON.parse(init.body));
      return coupangWindowJson(coupangAttemptView(sweepId));
    }
    if (pathname === `/api/ads/ad-campaigns/attempts/${sweepId}/control`) return coupangWindowJson(coupangCampaignAttempt(sweepId));
    return coupangWindowJson({});
  } });
  h2.fake.storage.kiditem_environment_profiles_v1 = { local: { accessToken: 'fixture' } };
  h2.context.sweepCollector = {
    collectCampaigns: async () => {
      collecting2.resolve();
      await releaseSweep.promise;
      return { success: false, errorCode: 'SOURCE_OWNER_UNAVAILABLE', error: 'fixture stop' };
    },
  };
  vm.runInContext('adCenterCollectors.local = { collectCampaigns: (input) => sweepCollector.collectCampaigns(input) };', h2.context);
  try {
    startResult(await externalRequest(h2.fake, startCollectionMessage('advertising.ad_sync')));
    await within(collecting2.promise, 2000, 'the campaign sweep never ran');

    const running = startResult(await externalRequest(h2.fake, startCollectionMessage('advertising.ad_sync', manualScope)));

    assert.deepEqual(running, { success: true, outcome: 'running', producer: 'advertising.ad_sync', attemptId: sweepId });
    assert.equal(sweepBegins.length, 1);
    releaseSweep.resolve();
    await settleCollections(h2);
  } finally {
    releaseSweep.resolve();
    h2.close();
  }
});

test('a manual report whose account already runs a campaign attempt answers running from the owner conflict', async () => {
  const runningId = '98111111-1111-4111-8111-111111111111';
  const begins = [];
  const h = bootServiceWorker({ fetch: async (url, init = {}) => {
    if (init.method === 'POST' && String(url).endsWith('/api/ads/ad-campaigns/attempts')) {
      begins.push(JSON.parse(init.body));
      return coupangWindowJson({ code: 'ATTEMPT_IN_PROGRESS', attemptId: runningId }, 409);
    }
    return coupangWindowJson({});
  } });
  h.fake.storage.kiditem_environment_profiles_v1 = { local: { accessToken: 'fixture' } };
  try {
    const reply = startResult(await externalRequest(h.fake, startCollectionMessage('advertising.ad_sync', {
      captureMode: 'manual_report', period: '7d', startDate: '2026-09-07', endDate: '2026-09-13',
    })));

    assert.deepEqual(reply, { success: true, outcome: 'running', producer: 'advertising.ad_sync', attemptId: runningId });
    assert.equal(begins.length, 1);
    assert.equal(begins[0].captureMode, 'manual_report');
  } finally {
    h.close();
  }
});

// ── Restart recovery (KID-147) ────────────────────────────────────────────────
// A restarted worker continues a collection only for the same live attempt, in
// the window turn a new start would take, and only with a connected KidItem tab.

function storedSession(attemptId, producer) {
  return {
    attemptId, environmentId: 'local', producer, attention: null,
    progress: { current: 0, total: 1, completed: 0, failed: 0, label: null }, updatedAt: Date.now(),
  };
}

test('a restarted worker continues its collections only while a connected KidItem tab is confirmed', async () => {
  const ids = {
    profitability: '9a111111-1111-4111-8111-111111111111',
  };
  for (const presence of ['confirmed', 'unknown']) {
    const reads = [];
    const collected = [];
    const h = bootServiceWorker({
      storage: {
        kiditem_environment_profiles_v1: { local: { accessToken: 'fixture' } },
        kiditem_collection_sessions: {
          [ids.profitability]: storedSession(ids.profitability, 'advertising.profitability_import'),
        },
      },
      fetch: async (url, init = {}) => {
        const pathname = new URL(String(url)).pathname;
        if ((init.method || 'GET') === 'GET') reads.push(pathname);
        if (pathname === `/api/ads/profitability-imports/${ids.profitability}`) {
          return coupangWindowJson(coupangProfitabilityPlan(ids.profitability));
        }
        return coupangWindowJson({});
      },
    });
    // A failed tab query is no evidence that a KidItem tab is open.
    if (presence === 'unknown') h.fake.chrome.tabs.query = async () => { throw new Error('tab query failed'); };
    h.context.recoveryCollector = {
      collectProfitabilitySlice: async (input) => {
        collected.push(input.attemptId);
        return { success: false, errorCode: 'SOURCE_OWNER_UNAVAILABLE', error: 'fixture stop' };
      },
    };
    vm.runInContext('adCenterCollectors.local = { collectProfitabilitySlice: (input) => recoveryCollector.collectProfitabilitySlice(input) };', h.context);
    try {
      await settleCollections(h);
      const recoveryReads = [
        `/api/ads/profitability-imports/${ids.profitability}`,
      ];
      if (presence === 'confirmed') {
        assert.deepEqual(collected, [ids.profitability], 'the running import continues in the window');
        for (const read of recoveryReads) assert.ok(reads.includes(read), `${read} was read to continue`);
      } else {
        assert.deepEqual(collected, [], 'nothing continues without a confirmed KidItem tab');
        assert.deepEqual(reads.filter((read) => recoveryReads.includes(read)), []);
      }
    } finally {
      h.close();
    }
  }
});

test('a restarted profitability import is not continued while another collection protects the window', async () => {
  const profitabilityId = '9b111111-1111-4111-8111-111111111111';
  const trafficId = '9b222222-2222-4222-8222-222222222222';
  const collected = [];
  const terminals = [];
  const h = bootServiceWorker({
    storage: {
      kiditem_environment_profiles_v1: { local: { accessToken: 'fixture' } },
      kiditem_collection_sessions: {
        [trafficId]: storedSession(trafficId, 'dashboard.wing_sales'),
        [profitabilityId]: storedSession(profitabilityId, 'advertising.profitability_import'),
      },
    },
    fetch: async (url, init = {}) => {
      const pathname = new URL(String(url)).pathname;
      if (init.method === 'POST') terminals.push(pathname);
      if (pathname === `/api/ads/profitability-imports/${profitabilityId}`) {
        return coupangWindowJson(coupangProfitabilityPlan(profitabilityId));
      }
      if (pathname === `/api/ads/traffic/attempts/${trafficId}/control`) {
        return coupangWindowJson(coupangTrafficAttempt(trafficId, 'RUNNING'));
      }
      return coupangWindowJson({});
    },
  });
  h.context.recoveryCollector = {
    collectProfitabilitySlice: async (input) => {
      collected.push(input.attemptId);
      return { success: false, errorCode: 'SOURCE_OWNER_UNAVAILABLE', error: 'fixture stop' };
    },
  };
  vm.runInContext('adCenterCollectors.local = { collectProfitabilitySlice: (input) => recoveryCollector.collectProfitabilitySlice(input) };', h.context);
  try {
    await settleCollections(h);
    const sessions = vm.runInContext('collectionSessions', h.context);

    assert.deepEqual(collected, [], 'the import does not take a window another collection protects');
    assert.deepEqual(terminals, [], 'it stays RUNNING for an operator stop or its lease');
    assert.ok(await sessions.get(profitabilityId));
    assert.ok(await sessions.get(trafficId));
  } finally {
    h.close();
  }
});

test('right after a restart with nothing to continue, a start is admitted', async () => {
  const attemptId = '9c111111-1111-4111-8111-111111111111';
  const h = bootServiceWorker({
    storage: { kiditem_environment_profiles_v1: { local: { accessToken: 'fixture' } } },
    fetch: async (url, init = {}) => {
      const pathname = new URL(String(url)).pathname;
      if (init.method === 'POST' && pathname === '/api/ads/ad-keywords/attempts') {
        return coupangWindowJson(coupangAttemptView(attemptId));
      }
      if (pathname === `/api/ads/ad-keywords/attempts/${attemptId}/control`) {
        return coupangWindowJson(coupangKeywordAttempt(attemptId));
      }
      return coupangWindowJson({});
    },
  });
  h.context.startCollector = {
    collectKeywords: async () => ({ success: false, errorCode: 'SOURCE_OWNER_UNAVAILABLE', error: 'fixture stop' }),
  };
  vm.runInContext('adCenterCollectors.local = { collectKeywords: (input) => startCollector.collectKeywords(input) };', h.context);
  try {
    const reply = startResult(await externalRequest(h.fake, startCollectionMessage('advertising.ad_keyword')));
    assert.deepEqual(reply, { success: true, outcome: 'started', producer: 'advertising.ad_keyword', attemptId });
    await settleCollections(h);
  } finally {
    h.close();
  }
});

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

test('a start clears ended sessions that hold no window and is refused by the one that still runs', async () => {
  const ids = {
    campaign: '81111111-1111-4111-8111-111111111111',
    keyword: '82222222-2222-4222-8222-222222222222',
    traffic: '83333333-3333-4333-8333-333333333333',
    unreadable: '84444444-4444-4444-8444-444444444444',
    itemwinner: '85555555-5555-4555-8555-555555555555',
  };
  const begins = [];
  const h = bootServiceWorker({ fetch: async (url, init = {}) => {
    const href = String(url);
    if (init.method === 'POST' && href.endsWith('/attempts')) {
      begins.push(href);
      return coupangWindowJson(coupangAttemptView(ids.itemwinner));
    }
    if (href.endsWith(`/api/ads/ad-campaigns/attempts/${ids.campaign}/control`)) {
      return coupangWindowJson(coupangCampaignAttempt(ids.campaign, 'FAILED'));
    }
    if (href.endsWith(`/api/ads/ad-keywords/attempts/${ids.keyword}/control`)) {
      return coupangWindowJson({ message: 'not found' }, 404);
    }
    if (href.endsWith(`/api/ads/traffic/attempts/${ids.traffic}/control`)) {
      return coupangWindowJson(coupangTrafficAttempt(ids.traffic, 'RUNNING'));
    }
    if (href.endsWith(`/api/ads/ad-campaigns/attempts/${ids.unreadable}/control`)) {
      return coupangWindowJson({ message: 'forbidden' }, 403);
    }
    if (href.endsWith(`/api/ads/wing-itemwinner/attempts/${ids.itemwinner}`)) {
      return coupangWindowJson(popupItemwinnerAttempt('RUNNING', popupItemwinnerUrl, ids.itemwinner));
    }
    return coupangWindowJson({});
  } });
  h.fake.storage.kiditem_environment_profiles_v1 = { local: { accessToken: 'fixture' } };
  const sessions = vm.runInContext('collectionSessions', h.context);
  // None of these sessions holds the collection window.
  await sessions.start({ attemptId: ids.campaign, environmentId: 'local', producer: 'advertising.ad_sync' });
  await sessions.requireAttention(ids.campaign, { reason: 'marketplace_login', message: '로그인이 필요합니다.' });
  await sessions.start({ attemptId: ids.keyword, environmentId: 'local', producer: 'advertising.ad_keyword' });
  await sessions.start({ attemptId: ids.traffic, environmentId: 'local', producer: 'dashboard.wing_sales' });
  await sessions.start({ attemptId: ids.unreadable, environmentId: 'local', producer: 'advertising.ad_sync' });
  try {
    const reply = startResult(await externalRequest(h.fake, startCollectionMessage('dashboard.wing_kpi')));

    assert.deepEqual(
      [...(await sessions.list('local'))].map((session) => session.attemptId).sort(),
      [ids.traffic, ids.unreadable].sort(),
      'the failed attention session and the unknown attempt are cleared; running and unreadable ones stay',
    );
    assert.deepEqual(reply, {
      success: true, outcome: 'refused', producer: 'dashboard.wing_kpi',
      holder: { producer: 'dashboard.wing_sales', name: '쿠팡 Wing 트래픽', attemptId: ids.traffic },
      message: '쿠팡 Wing 트래픽 수집이 수집 창을 쓰고 있습니다. 끝난 뒤 다시 시작해 주세요.',
    });
    assert.deepEqual(begins, [], 'a kept session protects the window, so nothing is opened');
  } finally {
    h.close();
  }
});

test('the shared Coupang window clears a leftover whose attempt ended and names a collection that still runs', async (t) => {
  const leftoverId = '61111111-1111-4111-8111-111111111111';
  const incomingId = '62222222-2222-4222-8222-222222222222';
  const campaignPath = `/api/ads/ad-campaigns/attempts/${leftoverId}/control`;
  const trafficPath = `/api/ads/traffic/attempts/${leftoverId}/control`;
  const scenarios = [
    {
      label: 'ad campaign', producer: 'advertising.ad_sync', name: '쿠팡 광고 캠페인', path: campaignPath,
      reply: (ended) => coupangWindowJson(coupangCampaignAttempt(leftoverId, ended ? 'FAILED' : 'RUNNING')),
    },
    {
      label: 'expired ad campaign', producer: 'advertising.ad_sync', name: '쿠팡 광고 캠페인', path: campaignPath, endedOnly: true,
      reply: () => coupangWindowJson(coupangCampaignAttempt(leftoverId, 'RUNNING', '2026-01-01T00:00:00.000Z')),
    },
    {
      label: 'ad keyword', producer: 'advertising.ad_keyword', name: '쿠팡 광고 키워드',
      path: `/api/ads/ad-keywords/attempts/${leftoverId}/control`,
      reply: (ended) => coupangWindowJson(coupangKeywordAttempt(leftoverId, ended ? 'FAILED' : 'RUNNING')),
    },
    {
      label: 'Wing traffic', producer: 'dashboard.wing_sales', name: '쿠팡 Wing 트래픽', path: trafficPath,
      reply: (ended) => coupangWindowJson(coupangTrafficAttempt(leftoverId, ended ? 'COMPLETE' : 'RUNNING')),
    },
    {
      label: 'legacy Wing traffic', producer: 'dashboard.wing_sales', name: '쿠팡 Wing 트래픽', path: trafficPath,
      reply: (ended) => coupangWindowJson(coupangTrafficAttempt(leftoverId, ended ? 'FAILED' : 'RUNNING', 'wing-traffic-v1')),
    },
    {
      label: 'Wing itemwinner', producer: 'dashboard.wing_kpi', name: '쿠팡 Wing 아이템위너',
      path: `/api/ads/wing-itemwinner/attempts/${leftoverId}`,
      reply: (ended) => coupangWindowJson(popupItemwinnerAttempt(ended ? 'FAILED' : 'RUNNING', popupItemwinnerUrl, leftoverId)),
    },
    {
      label: 'ad profitability', producer: 'advertising.profitability_import', name: '쿠팡 상품별 광고 보고서',
      path: `/api/ads/profitability-imports/${leftoverId}`,
      reply: (ended) => ended
        ? coupangWindowJson({ message: 'ATTEMPT_TERMINAL' }, 409)
        : coupangWindowJson(coupangProfitabilityPlan(leftoverId)),
    },
    // An owner that answers 404 no longer knows the attempt, so it has ended.
    ...[
      ['ad campaign', 'advertising.ad_sync', '쿠팡 광고 캠페인', campaignPath],
      ['ad keyword', 'advertising.ad_keyword', '쿠팡 광고 키워드', `/api/ads/ad-keywords/attempts/${leftoverId}/control`],
      ['Wing traffic', 'dashboard.wing_sales', '쿠팡 Wing 트래픽', trafficPath],
      ['Wing itemwinner', 'dashboard.wing_kpi', '쿠팡 Wing 아이템위너', `/api/ads/wing-itemwinner/attempts/${leftoverId}`],
    ].map(([label, producer, name, path]) => ({
      label: `${label} the owner no longer knows`, producer, name, path, endedOnly: true,
      reply: () => coupangWindowJson({ message: 'not found' }, 404),
    })),
    {
      // Any other read failure leaves the attempt unknown, so the window stays refused.
      label: 'ad campaign the owner forbids reading', producer: 'advertising.ad_sync', name: '쿠팡 광고 캠페인',
      path: campaignPath, runningOnly: true,
      reply: () => coupangWindowJson({ message: 'forbidden' }, 403),
    },
  ];
  for (const scenario of scenarios) {
    for (const ended of scenario.endedOnly ? [true] : scenario.runningOnly ? [false] : [true, false]) {
      await t.test(`${scenario.label} ${ended ? 'ended' : 'still running'}`, async () => {
        const h = bootServiceWorker({
          fetch: async (url) => String(url).endsWith(scenario.path) ? scenario.reply(ended) : coupangWindowJson({}),
        });
        h.fake.storage.kiditem_environment_profiles_v1 = { local: { accessToken: 'fixture' } };
        const windows = new Map([[7, { id: 7, type: 'normal', tabs: [
          { id: 41, windowId: 7, status: 'complete', url: 'https://advertising.coupang.com/marketing/dashboard/sales' },
        ] }]]);
        const removedWindows = [];
        h.fake.chrome.windows.get = (id, _options, callback) => {
          const win = windows.get(id);
          callback?.(win ? structuredClone(win) : undefined);
        };
        h.fake.chrome.windows.remove = (id, callback) => { removedWindows.push(id); windows.delete(id); callback?.(); };
        h.fake.chrome.windows.create = (properties, callback) => {
          const win = { id: 8, type: 'normal', tabs: [{ id: 42, windowId: 8, status: 'complete', url: properties.url }] };
          windows.set(win.id, win);
          callback?.(structuredClone(win));
        };
        h.fake.chrome.tabs.get = (id, callback) => {
          const tab = [...windows.values()].flatMap((win) => win.tabs).find((entry) => entry.id === id);
          callback?.(tab ? structuredClone(tab) : undefined);
        };
        try {
          const sessions = vm.runInContext('collectionSessions', h.context);
          await sessions.start({ attemptId: leftoverId, environmentId: 'local', producer: scenario.producer });
          await sessions.requireAttention(leftoverId, { reason: 'marketplace_login', message: '로그인이 필요합니다.' });
          const windowKey = vm.runInContext('coupangEnvironment.stateKey(COLLECTION_WINDOW_STORAGE_KEY, "local")', h.context);
          h.fake.storage[windowKey] = { runId: leftoverId, windowId: 7, tabId: 41 };
          const collectionWindow = vm.runInContext('collectionWindowFor("local")', h.context);
          const targetUrl = 'https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1';

          if (ended) {
            const owned = await collectionWindow.getOrCreate(incomingId, targetUrl);
            assert.deepEqual(removedWindows, [7]);
            assert.equal(await sessions.get(leftoverId), null);
            assert.equal(owned.windowId, 8);
          } else {
            await assert.rejects(collectionWindow.getOrCreate(incomingId, targetUrl), (error) => {
              assert.equal(error.code, 'collection_window_owner_conflict');
              assert.equal(error.message, `${scenario.name} 수집이 이 창을 사용하고 있습니다. 끝난 뒤 다시 시도해 주세요.`);
              return true;
            });
            assert.deepEqual(removedWindows, []);
            assert.ok(await sessions.get(leftoverId));
          }
        } finally {
          h.close();
        }
      });
    }
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

  // 도메인 워커 2개(쿠팡·주문) + 통합 dispatch = 외부 리스너 3개. 소싱 수집은 새 런타임의 실행 kind라(KID-360)
  // 외부 리스너를 따로 두지 않고 KidItemDomains에 operation.start를 건다.
  assert.equal(fake.externalMessageListeners.length, 3);
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
  for (const capability of [
    // 주문수집
    'orderCollectionIcecreamMall',
    'collectSellpiaInventoryJsonV1',
    'orderCollectionFailureEvidenceV1',
    'orderCollectionConfirmedCoverageV1',
    'mallSessionProbeV1',
    // 쿠팡
    'collectionStartV1',
    'profitabilityAdvertisingSourceOwnerV1',
    'coupangCatalogSnapshot',
    'wingFormPortV1',
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
    'kiditemEnvironmentProfilesV1',
  ]) {
    assert.equal(response.capabilities[capability], true, capability);
  }
});

test('도메인이 서로 겹치지 않는 producer 접두사를 등록한다', () => {
  const { context } = bootServiceWorker();
  const domains = context.KidItemDomains;

  const expected = {
    'orders.mall': 'cancelCollectionSession',
    'orders.sellpia_manual_match': 'cancelCollectionSession',
    'inventory.sellpia': 'cancelCollectionSession',
    'advertising.ad_sync': 'cancelCollectionSession',
    'channels.coupang_catalog': 'cancelCollectionSession',
    'dashboard.wing_sales': 'cancelCollectionSession',
  };
  for (const [producer, operation] of Object.entries(expected)) {
    const domain = domains.forProducer(producer);
    assert.ok(domain, producer);
    assert.equal(typeof domain[operation], 'function', `${producer}.${operation}`);
  }
  assert.equal(domains.forProducer('unknown.thing'), null);
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
  assert.equal(typeof context.KidItemDomains.forExternalAction('operation.start')?.handle, 'function');
});

test('수익성 광고비 수집은 공용 dispatch의 수집 시작 계약으로만 등록된다', () => {
  const { context } = bootServiceWorker();
  assert.equal(typeof context.KidItemDomains.forExternalAction('startCollection')?.handle, 'function');
  assert.equal(context.KidItemDomains.forExternalAction('collectAdvertisingProfitability'), null);
  assert.equal(context.KidItemDomains.forExternalAction('advertising.refresh_profitability_spend'), null);
});

test('retired advertising account-day KPI actions, content step and capability are not registered', () => {
  const { fake, context } = bootServiceWorker();
  for (const action of ['collectAdvertisingAccountDailyKpis', 'cancelAdvertisingAccountDailyKpis']) {
    assert.equal(context.KidItemDomains.forExternalAction(action), null, action);
  }
  const capabilities = context.KidItemDomains.capabilities();
  assert.equal(capabilities.advertisingAccountDailyKpiSourceOwnerV1, undefined);
  assert.equal(capabilities.advertisingCampaignSourceOwnerV1, true);
  assert.equal(typeof context.KidItemDomains.forExternalAction('startCollection')?.handle, 'function');

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

  // 셀피아 수동매칭 포트(kiditem-sellpia-manual-match-v1)는 실행 계약 kind로 옮겨 없다(KID-363).
  for (const name of ['kiditem-wing-form-v1']) {
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
  assert.equal(typeof context.KidItemDomains.forExternalAction('operation.start')?.handle, 'function');
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
