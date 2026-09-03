import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  ORDERS_WORKER_MODULES,
  dispatchExternalMessage,
  installExternalDispatch,
} from './helpers/domain-worker-modules.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const backgroundRoot = path.join(repoRoot, 'extensions/kiditem-os/background/orders');
const workerPath = path.join(backgroundRoot, 'worker.js');
const AUTOMATIC_ACTIONS = [
  ['collectSellpiaDeliTracking', 'collectSellpiaDeliTracking', 'sellpia', { startDate: '2026-07-14', endDate: '2026-07-15' }],
  ['collectIcecreamMallOrders', 'collectIcecreamMallOrders', 'icecream-mall', { date: '2026-07-15' }],
  ['collectRocketPoRows', 'collectRocketPoRows', 'coupang-rocket', { from: '2026-07-14', to: '2026-07-15' }],
  ['listRocketPos', 'listRocketPos', 'coupang-rocket', { from: '2026-07-14', to: '2026-07-15' }],
  ['collectKidsnoteOrders', 'collectKidsnoteOrders', 'kidsnote', { from: '2026-07-14', to: '2026-07-15' }],
  ['collectKkomangseOrders', 'collectKkomangseOrders', 'kkomangse', { date: '2026-07-15' }],
  ['collectOnchannelOrders', 'collectOnchannelOrders', 'onch', { date: '2026-07-15' }],
  ['collectDomeggookOrders', 'collectDomeggookOrders', 'domeggook', { date: '2026-07-15' }],
  ['collectKidkidsOrders', 'collectKidkidsOrders', 'kidkids', { date: '2026-07-15' }],
  ['collectLotteonOrders', 'collectLotteonOrders', 'lotte-on', { date: '2026-07-15' }],
  ['collectGsshopOrders', 'collectGsshopOrders', 'gs-shop', { date: '2026-07-15' }],
  ['collectAlwayzOrders', 'collectAlwayzOrders', 'always', { date: '2026-07-15' }],
  ['collectKakaoOrders', 'collectKakaoOrders', 'kakao', { date: '2026-07-15' }],
  ['collectBoriboriOrders', 'collectBoriboriOrders', 'boribori', { date: '2026-07-15' }],
  ['collectTeachervilleOrders', 'collectTeachervilleOrders', 'teacher-mall', { date: '2026-07-15' }],
  ['collectArt09Orders', 'collectArt09Orders', 'art09', { date: '2026-07-15' }],
  ['collectHaebeopOrders', 'collectHaebeopOrders', 'haebub-mall', { date: '2026-07-15' }],
  ['collectCoupangDirectOrders', 'collectCoupangDirectOrders', 'coupang-direct', { date: '2026-07-15' }],
];

function uuid(index) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function createFakeChrome() {
  const storage = {};
  const calls = {
    tabsCreate: [],
    tabsRemove: [],
    tabsUpdate: [],
    windowsUpdate: [],
  };
  let nextTabId = 100;
  const externalMessageListeners = [];
  const storageChangeListeners = [];
  const chrome = {
    runtime: {
      lastError: null,
      getManifest: () => ({ version: 'test' }),
      onInstalled: { addListener() {} },
      onStartup: { addListener() {} },
      onMessageExternal: {
        addListener(listener) {
          externalMessageListeners.push(listener);
        },
      },
    },
    alarms: {
      create() {},
      onAlarm: { addListener() {} },
    },
    storage: {
      local: {
        async get(key) {
          return { [key]: structuredClone(storage[key]) };
        },
        async set(values) {
          Object.assign(storage, structuredClone(values));
        },
      },
      onChanged: {
        addListener(listener) {
          storageChangeListeners.push(listener);
        },
        removeListener(listener) {
          const index = storageChangeListeners.indexOf(listener);
          if (index >= 0) storageChangeListeners.splice(index, 1);
        },
      },
    },
    tabs: {
      async create(properties) {
        calls.tabsCreate.push(structuredClone(properties));
        return { id: nextTabId++, windowId: 7, ...properties };
      },
      async query() {
        return [];
      },
      async remove(tabId) {
        calls.tabsRemove.push(tabId);
      },
      async update(tabId, properties) {
        calls.tabsUpdate.push({ tabId, properties: structuredClone(properties) });
        return { id: tabId, windowId: 7, ...properties };
      },
    },
    windows: {
      async update(windowId, properties) {
        calls.windowsUpdate.push({ windowId, properties: structuredClone(properties) });
      },
    },
    scripting: {
      async executeScript() {},
    },
  };
  return {
    calls,
    chrome,
    storage,
    getExternalMessageListeners: () => externalMessageListeners,
  };
}

function loadWorker(globals = {}) {
  const fake = createFakeChrome();
  fake.storage.kiditem_environment_profiles_v1 = {
    local: { accessToken: 'web-token', updatedAt: Date.now() },
  };
  let context;
  const sandbox = {
    URL,
    URLSearchParams,
    Headers,
    AbortController,
    TextDecoder,
    Blob,
    FormData,
    atob,
    btoa,
    console,
    crypto: {
      randomUUID: () => uuid(999),
    },
    fetch: async () => {
      throw new Error('Unexpected fetch in order collection session test');
    },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    structuredClone,
    chrome: fake.chrome,
    ...globals,
    importScripts(...relativePaths) {
      for (const relativePath of relativePaths) {
        const filename = path.join(backgroundRoot, relativePath);
        vm.runInContext(readFileSync(filename, 'utf8'), context, { filename });
      }
    },
  };
  context = vm.createContext(sandbox);
  // 도메인 워커는 더 이상 importScripts 를 호출하지 않는다. 통합 서비스워커와
  // 같은 순서로 의존 모듈을 먼저 싣고, 워커를 실행한 뒤 통합 dispatch 를 건다.
  context.importScripts(...ORDERS_WORKER_MODULES);
  vm.runInContext(readFileSync(workerPath, 'utf8'), context, { filename: workerPath });
  installExternalDispatch(context, fake.chrome);
  return { ...fake, context, externalMessageListeners: fake.getExternalMessageListeners() };
}

function textResponse(text, { ok = true, status = 200, url = 'https://mallseller.genimarket.co.kr/mall/order/basket_list.php' } = {}) {
  return {
    ok,
    status,
    url,
    async arrayBuffer() {
      return new TextEncoder().encode(text).buffer;
    },
  };
}

function jsonResponse(value, options = {}) {
  return textResponse(JSON.stringify(value), {
    url: 'http://localhost:4000/api/sellpia-product-sales/attempts',
    ...options,
  });
}

function rowCheckbox(cells) {
  const row = {
    tagName: 'TR',
    cells: cells.map((textContent) => ({ textContent })),
  };
  return { tagName: 'INPUT', parentElement: row };
}

function haebeopListDocument(rows, pages = []) {
  return {
    querySelector(selector) {
      return selector === 'input[type="password"]' ? null : null;
    },
    querySelectorAll(selector) {
      if (selector === 'input[name="select_checkbox"]') {
        return rows.map(({ orderId, product = '해법 상품' }) => rowCheckbox([
          '',
          '2026-07-31 12:00:00',
          orderId,
          '주문자',
          '일반',
          product,
          '카드',
        ]));
      }
      if (selector === 'a[href]') {
        return pages.map((page) => ({
          getAttribute(name) {
            return name === 'href' ? `/mall/order/basket_list.php?page=${page}` : null;
          },
        }));
      }
      return [];
    },
  };
}

function haebeopDetailDocument(orderId) {
  const item = rowCheckbox([
    '',
    '공급사',
    '',
    `상품 ${orderId}`,
    '2',
    '5,000',
    '10,000',
    '-',
    '결제완료',
  ]);
  return {
    querySelector(selector) {
      const field = /^\[name="(.+)"\]$/.exec(selector)?.[1];
      const values = {
        total_price: '12,000',
        send_name: '주문자',
        rece_name: '수취인',
      };
      return field && field in values ? { value: values[field] } : null;
    },
    querySelectorAll(selector) {
      if (selector === 'input[name="select_basket_no"]') return [item];
      if (selector === 'tr') return [];
      return [];
    },
  };
}

function createHaebeopDomParser(documents) {
  return class {
    parseFromString(html) {
      return documents.get(html);
    }
  };
}

function dispatch(listeners, message) {
  return dispatchExternalMessage(listeners, message, {
    url: 'http://localhost:3000/order-collection',
  });
}

function installCollectorResult(runtime, functionName, resultFactory) {
  runtime.context[functionName] = async (...args) => {
    const collection = args.at(-1);
    const tab = await runtime.chrome.tabs.create({
      url: `https://${functionName}.example.test`,
      active: false,
    });
    await collection.attachTab(tab, { owned: true });
    return resultFactory();
  };
}

test('Haebeop collects every marketplace list page before expanding order details', async () => {
  const documents = new Map([
    ['list:1', haebeopListDocument([{ orderId: '1001' }], [1, 2])],
    ['list:2', haebeopListDocument([{ orderId: '1002' }], [1, 2])],
    ['detail:1001', haebeopDetailDocument('1001')],
    ['detail:1002', haebeopDetailDocument('1002')],
  ]);
  const listPages = [];
  const runtime = loadWorker({
    DOMParser: createHaebeopDomParser(documents),
    document: { querySelector: () => null },
    location: { href: 'https://mallseller.genimarket.co.kr/mall/order/basket_list.php' },
    async fetch(url, init = {}) {
      if (url === '/mall/order/basket_list.php') {
        const page = new URLSearchParams(init.body).get('page') || '1';
        listPages.push(page);
        return textResponse(`list:${page}`);
      }
      const orderId = new URL(url, 'https://mallseller.genimarket.co.kr').searchParams.get('orderid');
      return textResponse(`detail:${orderId}`);
    },
  });

  const result = await runtime.context.scrapeHaebeopOrders({
    date: '2026-07-31',
    vendor: '공급사',
  });

  assert.equal(result.success, true);
  assert.deepEqual(
    JSON.parse(JSON.stringify(result.orders.map((order) => order.orderNo))),
    ['1001', '1002'],
  );
  assert.deepEqual(listPages, ['1', '2']);
});

test('Haebeop fails collection instead of producing a zero-value order when detail loading fails', async () => {
  const documents = new Map([
    ['list:1', haebeopListDocument([{ orderId: '1001' }])],
  ]);
  const runtime = loadWorker({
    DOMParser: createHaebeopDomParser(documents),
    document: { querySelector: () => null },
    location: { href: 'https://mallseller.genimarket.co.kr/mall/order/basket_list.php' },
    async fetch(url, init = {}) {
      if (url === '/mall/order/basket_list.php') {
        return textResponse(`list:${new URLSearchParams(init.body).get('page') || '1'}`);
      }
      return textResponse('', { ok: false, status: 503 });
    },
  });

  const result = await runtime.context.scrapeHaebeopOrders({ date: '2026-07-31' });

  assert.deepEqual(
    JSON.parse(JSON.stringify(result)),
    {
      success: false,
      error: '해법몰 주문 상세 조회 실패: 1001 (HTTP 503)',
    },
  );
});

test('automatic order actions publish safe domain-specific sessions from inactive tabs', async () => {
  const runtime = loadWorker();
  for (const [, functionName] of AUTOMATIC_ACTIONS) {
    installCollectorResult(runtime, functionName, () => ({
      success: true,
      rows: [{ address: '서울', phone: '010-0000-0000', orderPayload: 'private' }],
      xlsxBase64: 'private-xlsx',
      csvBase64: 'private-csv',
      fileBase64: 'private-file',
    }));
  }

  for (const [index, [action, , mallKey, input]] of AUTOMATIC_ACTIONS.entries()) {
    const runId = uuid(index + 1);
    const response = await dispatch(runtime.externalMessageListeners, {
      action,
      ...input,
      runId,
      credentials: { loginId: 'operator@example.test', password: 'top-secret' },
      password: 'top-secret',
      rows: [{ address: '서울', phone: '010-0000-0000' }],
      xlsxBase64: 'private-xlsx',
      csvBase64: 'private-csv',
      fileBase64: 'private-file',
    });

    assert.equal(response.attemptId, runId, action);
    assert.equal(response.collectionSession.progress.completed, 1, action);
    assert.equal(
      response.collectionSession.producer,
      action === 'collectRocketPoRows' || action === 'listRocketPos'
        ? 'orders.coupang_rocket_po'
        : 'orders.mall',
      action,
    );
    assert.equal('status' in response.collectionSession, false, action);
    assert.equal('inputIdentity' in response.collectionSession, false, action);
  }

  assert.equal(runtime.calls.tabsCreate.length, AUTOMATIC_ACTIONS.length);
  assert.ok(runtime.calls.tabsCreate.every((properties) => properties.active === false));
  const stored = JSON.stringify(runtime.storage.kiditem_collection_sessions);
  for (const forbidden of [
    'password',
    'loginId',
    'rows',
    'xlsxBase64',
    'csvBase64',
    'fileBase64',
    'address',
    'phone',
    'orderPayload',
    'top-secret',
    'operator@example.test',
    'private-xlsx',
  ]) {
    assert.equal(stored.includes(forbidden), false, forbidden);
  }
});

test('shipment summary publishes one deferred shipment-specific session', async () => {
  const runtime = loadWorker();
  runtime.context.collectCoupangShipmentDateSummary = async () => ({
    success: true,
    scannedPages: 1,
    totalRows: 0,
    dates: [],
  });

  const runId = uuid(90);
  const response = await dispatch(runtime.externalMessageListeners, {
    action: 'collectCoupangShipmentDateSummary',
    runId,
    deferTerminal: true,
  });

  assert.equal(response.attemptId, runId);
  assert.equal(response.collectionSession.progress.completed, 1);
  assert.equal(response.collectionSession.progress.total, 2);
  assert.equal(
    response.collectionSession.producer,
    'orders.coupang_shipment_summary',
  );
  assert.deepEqual(
    response.collectionSession.attention,
    null,
  );
});

test('every automatic mall access failure requires personal attention without focusing', async () => {
  const runtime = loadWorker();
  for (const [, functionName] of AUTOMATIC_ACTIONS) {
    installCollectorResult(runtime, functionName, () => {
      throw new Error('Cannot access contents of the page');
    });
  }

  for (const [index, [action, , , input]] of AUTOMATIC_ACTIONS.entries()) {
    const response = await dispatch(runtime.externalMessageListeners, {
      action,
      ...input,
      runId: uuid(index + 100),
    });
    assert.equal(response.collectionSession.attention.reason, 'marketplace_login', action);
    assert.equal('status' in response.collectionSession, false, action);
    assert.equal(response.collectionSession.attention.canOpenTab, true, action);
  }

  assert.deepEqual(runtime.calls.tabsUpdate, []);
  assert.deepEqual(runtime.calls.windowsUpdate, []);
});

test('structured operator authentication remains attention instead of a failed run', async () => {
  const runtime = loadWorker();
  installCollectorResult(runtime, 'collectGsshopOrders', () => ({
    success: false,
    pendingAuth: true,
    errorCode: 'operator_action_required',
    error: 'GS샵 SMS 인증이 필요합니다.',
  }));

  const response = await dispatch(runtime.externalMessageListeners, {
    action: 'collectGsshopOrders',
    date: '2026-07-15',
    runId: uuid(200),
  });

  assert.equal(response.collectionSession.attention.reason, 'marketplace_login');
  assert.equal(response.collectionSession.attention.reason, 'marketplace_login');
  assert.equal(response.failure.code, 'operator_action_required');
  assert.equal(response.failure.operatorAction, 'complete_sms_auth');
});

test('rerunning a collection resumes the owner attempt without a second lifecycle', async () => {
  const runtime = loadWorker();
  let collectionCount = 0;
  installCollectorResult(runtime, 'collectKidsnoteOrders', () => {
    collectionCount += 1;
    return collectionCount === 1
      ? { success: false, pendingLogin: true, error: '로그인이 필요합니다.' }
      : { success: true, orders: [] };
  });
  const attemptId = uuid(777);
  const message = {
    action: 'collectKidsnoteOrders',
    from: '2026-07-15',
    to: '2026-07-15',
    attemptId,
  };

  const attention = await dispatch(runtime.externalMessageListeners, message);
  const resumed = await dispatch(runtime.externalMessageListeners, message);

  assert.equal(attention.attemptId, attemptId);
  assert.equal(attention.collectionSession.attention.reason, 'marketplace_login');
  assert.equal(resumed.attemptId, attemptId);
  assert.equal(resumed.collectionSession.progress.completed, 1);
  assert.equal('status' in resumed.collectionSession, false);
  assert.deepEqual(runtime.calls.tabsRemove, []);
  assert.equal(Object.keys(runtime.storage.kiditem_collection_sessions).length, 1);
});

test('cancelling an active collection removes local control state and fences late completion', async () => {
  const runtime = loadWorker();
  let releaseOperation;
  const operationGate = new Promise((resolve) => {
    releaseOperation = resolve;
  });
  let signalAttached;
  const attached = new Promise((resolve) => {
    signalAttached = resolve;
  });
  runtime.context.collectKidsnoteOrders = async (...args) => {
    const collection = args.at(-1);
    const tab = await runtime.chrome.tabs.create({
      url: 'https://shop.kidsnote.com/_manage/',
      active: false,
    });
    await collection.attachTab(tab, { owned: true });
    signalAttached();
    await operationGate;
    return { success: true, orders: [{ orderNo: 'must-not-reach-web' }] };
  };
  const attemptId = uuid(778);
  const pending = dispatch(runtime.externalMessageListeners, {
    action: 'collectKidsnoteOrders',
    from: '2026-07-15',
    to: '2026-07-15',
    attemptId,
  });
  await attached;

  let cancelled;
  let completed;
  try {
    cancelled = await dispatch(runtime.externalMessageListeners, {
      action: 'cancelCollectionSession',
      attemptId,
    });
  } finally {
    releaseOperation();
    completed = await pending;
  }

  assert.equal(cancelled.attemptId, attemptId);
  assert.deepEqual(runtime.calls.tabsRemove, [100]);
  assert.equal(completed.success, false);
  assert.equal(completed.cancelled, true);
  assert.equal(completed.orders, undefined);
  assert.equal(completed.collectionSession, null);
  assert.equal(runtime.storage.kiditem_collection_sessions[attemptId], undefined);
});

test('invalid source identity never enters the owner-correlated session', async () => {
  const runtime = loadWorker();
  installCollectorResult(runtime, 'collectKkomangseOrders', () => ({
    success: true,
    xlsxBase64: 'private-xlsx',
  }));
  const attemptId = uuid(782);

  const response = await dispatch(runtime.externalMessageListeners, {
    action: 'collectKkomangseOrders',
    date: '010-password-secret',
    attemptId,
  });

  assert.equal(response.attemptId, attemptId);
  assert.equal('inputIdentity' in response.collectionSession, false);
  assert.equal(
    JSON.stringify(runtime.storage.kiditem_collection_sessions).includes('010-password-secret'),
    false,
  );
});

test('conversion progress stays in the owner session and updates on a later run', async () => {
  const runtime = loadWorker();
  installCollectorResult(runtime, 'collectCoupangDirectOrders', () => ({
    success: true,
    pos: [{ seq: 'PO-1', transport: 'SHIPMENT' }],
    centers: {},
  }));
  const attemptId = uuid(783);

  const collected = await dispatch(runtime.externalMessageListeners, {
    action: 'collectCoupangDirectOrders',
    date: '2026-07-15',
    attemptId,
    deferTerminal: true,
  });

  assert.equal(collected.collectionSession.progress.completed, 1);
  assert.equal(collected.collectionSession.progress.total, 2);

  const completed = await dispatch(runtime.externalMessageListeners, {
    action: 'collectCoupangDirectOrders',
    date: '2026-07-15',
    attemptId,
  });

  assert.equal(completed.collectionSession.progress.completed, 1);
  assert.equal(completed.collectionSession.progress.total, 1);
  assert.equal('status' in completed.collectionSession, false);
});

test('Sellpia inventory correlates one owner attempt and submits directly after collection', async () => {
  const ownerRequests = [];
  const attemptId = uuid(900);
  const runtime = loadWorker({
    async fetch(url, init = {}) {
      const pathName = new URL(url).pathname;
      ownerRequests.push({
        path: pathName,
        headers: Object.fromEntries(new Headers(init.headers || {}).entries()),
        body: typeof init.body === 'string' ? JSON.parse(init.body) : null,
      });
      if (pathName === '/api/sellpia-product-sales/attempts') {
        return jsonResponse({
          attemptId,
          attemptToken: 'owner-token',
          state: 'RUNNING',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          plan: { from: '2025-08-01', to: '2026-08-31' },
        });
      }
      if (pathName === `/api/sellpia-product-sales/attempts/${attemptId}`) {
        return jsonResponse({
          attemptId,
          attemptToken: 'owner-token',
          state: 'COMPLETE',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          plan: { from: '2025-08-01', to: '2026-08-31' },
        });
      }
      return textResponse('', { ok: false, status: 404 });
    },
  });
  runtime.context.collectSellpiaProductProfit = async (from, to) => ({
    success: true,
    payload: {
      range: { from, to },
      provenance: {
        source: 'sellpia_stat_prd_profit',
        costBasis: 'ORDER_TIME_SUPPLY_COST',
        vatIncluded: true,
      },
      products: [{
        productCode: 'SELLPIA-TEST-1',
        productName: 'Test product',
        quantity: 1,
        supplyCost: 100,
      }],
    },
  });

  const response = await dispatch(runtime.externalMessageListeners, {
    action: 'collectSellpiaInventory',
    idempotencyKey: 'sellpia-owner-key-1',
  });

  assert.equal(response.success, true, JSON.stringify(response));
  assert.equal(response.attemptId, attemptId);
  assert.deepEqual(
    ownerRequests.map(({ path }) => path),
    [
      '/api/sellpia-product-sales/attempts',
      `/api/sellpia-product-sales/attempts/${attemptId}`,
    ],
  );
  assert.equal(ownerRequests[0].headers['idempotency-key'], 'sellpia-owner-key-1');
  assert.equal(ownerRequests[1].body.attemptToken, 'owner-token');
  assert.equal(ownerRequests[1].body.providerBackedEmptyProof, false);
  assert.equal(ownerRequests.some(({ path }) => path.endsWith('/ingest')), false);
  assert.equal(ownerRequests.some(({ body }) => body?.runId), false);
});

test('Sellpia empty provider response fails the owner without uploading an unproven completion', async () => {
  const ownerRequests = [];
  const attemptId = uuid(902);
  const runtime = loadWorker({
    async fetch(url, init = {}) {
      const pathName = new URL(url).pathname;
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
      ownerRequests.push({ path: pathName, body });
      if (pathName === '/api/sellpia-product-sales/attempts') {
        return jsonResponse({
          attemptId,
          attemptToken: 'owner-token',
          state: 'RUNNING',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          plan: { from: '2025-08-01', to: '2026-08-31' },
        });
      }
      if (pathName.endsWith('/fail')) {
        assert.equal(body.attemptToken, 'owner-token');
        assert.equal(body.errorCode, 'EMPTY_COVERAGE_NOT_PROVEN');
        assert.match(body.errorMessage, /empty coverage|proof/i);
        return jsonResponse({
          attemptId,
          attemptToken: 'owner-token',
          state: 'FAILED',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          plan: { from: '2025-08-01', to: '2026-08-31' },
        });
      }
      if (pathName === `/api/sellpia-product-sales/attempts/${attemptId}`) {
        return jsonResponse({
          attemptId,
          attemptToken: 'owner-token',
          state: 'COMPLETE',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          plan: { from: '2025-08-01', to: '2026-08-31' },
        });
      }
      return textResponse('', { ok: false, status: 404 });
    },
  });
  runtime.context.collectSellpiaProductProfit = async (from, to) => ({
    success: true,
    payload: {
      range: { from, to },
      provenance: {
        source: 'sellpia_stat_prd_profit',
        costBasis: 'ORDER_TIME_SUPPLY_COST',
        vatIncluded: true,
      },
      products: [],
    },
  });

  const response = await dispatch(runtime.externalMessageListeners, {
    action: 'collectSellpiaInventory',
    idempotencyKey: 'sellpia-owner-key-empty',
  });

  assert.equal(response.success, false, JSON.stringify(response));
  assert.equal(response.attemptId, attemptId);
  assert.match(response.error, /empty coverage|proof/i);
  assert.deepEqual(ownerRequests.map(({ path }) => path), [
    '/api/sellpia-product-sales/attempts',
    `/api/sellpia-product-sales/attempts/${attemptId}/fail`,
  ]);
  assert.equal(runtime.storage.kiditem_collection_sessions[attemptId], undefined);
});

test('Sellpia restart rehydrates a persisted session from the exact owner control route', async () => {
  const ownerRequests = [];
  const attemptId = uuid(903);
  const runtime = loadWorker({
    async fetch(url, init = {}) {
      const pathName = new URL(url).pathname;
      const method = init.method || 'GET';
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
      ownerRequests.push({ path: pathName, method, body });
      if (
        pathName === `/api/sellpia-product-sales/attempts/${attemptId}` &&
        method === 'GET'
      ) {
        return jsonResponse({
          attemptId,
          attemptToken: 'rehydrated-token',
          state: 'RUNNING',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          plan: {
            from: '2025-08-01',
            to: '2026-08-31',
            coveredMonths: ['2025-08', '2025-09'],
          },
        });
      }
      if (
        pathName === `/api/sellpia-product-sales/attempts/${attemptId}` &&
        method === 'POST'
      ) {
        assert.equal(body.attemptToken, 'rehydrated-token');
        return jsonResponse({
          attemptId,
          attemptToken: 'rehydrated-token',
          state: 'COMPLETE',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          plan: { from: '2025-08-01', to: '2026-08-31' },
        });
      }
      return textResponse('', { ok: false, status: 404 });
    },
  });
  runtime.storage.kiditem_collection_sessions = {
    [attemptId]: {
      environmentId: 'local',
      attemptId,
      producer: 'inventory.sellpia',
      progress: { current: 0, total: 0, completed: 0, failed: 0, label: null },
      attention: null,
      updatedAt: Date.now(),
    },
  };
  runtime.context.collectSellpiaProductProfit = async (from, to) => ({
    success: true,
    payload: {
      range: { from, to },
      provenance: {
        source: 'sellpia_stat_prd_profit',
        costBasis: 'ORDER_TIME_SUPPLY_COST',
        vatIncluded: true,
      },
      products: [{ productCode: 'SELLPIA-REHYDRATED-1', quantity: 1 }],
    },
  });

  const response = await dispatch(runtime.externalMessageListeners, {
    action: 'collectSellpiaInventory',
    idempotencyKey: 'sellpia-owner-key-rehydrated',
  });

  assert.equal(response.success, true, JSON.stringify(response));
  assert.equal(response.attemptId, attemptId);
  assert.deepEqual(ownerRequests, [
    {
      path: `/api/sellpia-product-sales/attempts/${attemptId}`,
      method: 'GET',
      body: null,
    },
    {
      path: `/api/sellpia-product-sales/attempts/${attemptId}`,
      method: 'POST',
      body: {
        attemptToken: 'rehydrated-token',
        parserVersion: 'sellpia-profitability-v1',
        providerBackedEmptyProof: false,
        coveredMonths: ['2025-08', '2025-09'],
        provenance: {
          source: 'sellpia_stat_prd_profit',
          costBasis: 'ORDER_TIME_SUPPLY_COST',
          vatIncluded: true,
        },
        products: [{ productCode: 'SELLPIA-REHYDRATED-1', quantity: 1 }],
      },
    },
  ]);
  assert.equal(runtime.storage.kiditem_collection_sessions[attemptId], undefined);
});

test('Sellpia restart removes a terminal owner session before beginning a replacement attempt', async () => {
  const ownerRequests = [];
  const staleAttemptId = uuid(904);
  const replacementAttemptId = uuid(905);
  const runtime = loadWorker({
    async fetch(url, init = {}) {
      const pathName = new URL(url).pathname;
      const method = init.method || 'GET';
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
      ownerRequests.push({ path: pathName, method, body });
      if (
        pathName === `/api/sellpia-product-sales/attempts/${staleAttemptId}` &&
        method === 'GET'
      ) {
        return jsonResponse({ message: 'ATTEMPT_TERMINAL' }, { ok: false, status: 409 });
      }
      if (pathName === '/api/sellpia-product-sales/attempts' && method === 'POST') {
        assert.equal(
          new Headers(init.headers || {}).get('Idempotency-Key'),
          'sellpia-owner-key-replacement',
        );
        assert.equal(runtime.storage.kiditem_collection_sessions[staleAttemptId], undefined);
        return jsonResponse({
          attemptId: replacementAttemptId,
          attemptToken: 'replacement-token',
          state: 'RUNNING',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          plan: { from: '2025-08-01', to: '2026-08-31' },
        });
      }
      if (
        pathName === `/api/sellpia-product-sales/attempts/${replacementAttemptId}` &&
        method === 'POST'
      ) {
        assert.equal(body.attemptToken, 'replacement-token');
        return jsonResponse({
          attemptId: replacementAttemptId,
          attemptToken: 'replacement-token',
          state: 'COMPLETE',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          plan: { from: '2025-08-01', to: '2026-08-31' },
        });
      }
      return textResponse('', { ok: false, status: 404 });
    },
  });
  runtime.storage.kiditem_collection_sessions = {
    [staleAttemptId]: {
      environmentId: 'local',
      attemptId: staleAttemptId,
      producer: 'inventory.sellpia',
      progress: { current: 0, total: 0, completed: 0, failed: 0, label: null },
      attention: null,
      updatedAt: Date.now(),
    },
  };
  runtime.context.collectSellpiaProductProfit = async (from, to) => ({
    success: true,
    payload: {
      range: { from, to },
      provenance: {
        source: 'sellpia_stat_prd_profit',
        costBasis: 'ORDER_TIME_SUPPLY_COST',
        vatIncluded: true,
      },
      products: [{ productCode: 'SELLPIA-REPLACEMENT-1', quantity: 1 }],
    },
  });

  const response = await dispatch(runtime.externalMessageListeners, {
    action: 'collectSellpiaInventory',
    idempotencyKey: 'sellpia-owner-key-replacement',
  });

  assert.equal(response.success, true, JSON.stringify(response));
  assert.equal(response.attemptId, replacementAttemptId);
  assert.deepEqual(ownerRequests.map(({ path, method }) => ({ path, method })), [
    {
      path: `/api/sellpia-product-sales/attempts/${staleAttemptId}`,
      method: 'GET',
    },
    { path: '/api/sellpia-product-sales/attempts', method: 'POST' },
    {
      path: `/api/sellpia-product-sales/attempts/${replacementAttemptId}`,
      method: 'POST',
    },
  ]);
  assert.equal(runtime.storage.kiditem_collection_sessions[staleAttemptId], undefined);
  assert.equal(runtime.storage.kiditem_collection_sessions[replacementAttemptId], undefined);
});

test('Sellpia restart treats a missing owner attempt as stale before beginning with the caller key', async () => {
  const ownerRequests = [];
  const staleAttemptId = uuid(909);
  const replacementAttemptId = uuid(910);
  const replacementKey = 'sellpia-owner-key-missing-replacement';
  const runtime = loadWorker({
    async fetch(url, init = {}) {
      const pathName = new URL(url).pathname;
      const method = init.method || 'GET';
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
      ownerRequests.push({ path: pathName, method, body });
      if (
        pathName === `/api/sellpia-product-sales/attempts/${staleAttemptId}` &&
        method === 'GET'
      ) {
        return textResponse('', { ok: false, status: 404 });
      }
      if (pathName === '/api/sellpia-product-sales/attempts' && method === 'POST') {
        assert.equal(new Headers(init.headers || {}).get('Idempotency-Key'), replacementKey);
        assert.equal(runtime.storage.kiditem_collection_sessions[staleAttemptId], undefined);
        return jsonResponse({
          attemptId: replacementAttemptId,
          attemptToken: 'missing-replacement-token',
          state: 'RUNNING',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          plan: { from: '2025-08-01', to: '2026-08-31' },
        });
      }
      if (
        pathName === `/api/sellpia-product-sales/attempts/${replacementAttemptId}` &&
        method === 'POST'
      ) {
        assert.equal(body.attemptToken, 'missing-replacement-token');
        return jsonResponse({
          attemptId: replacementAttemptId,
          attemptToken: 'missing-replacement-token',
          state: 'COMPLETE',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          plan: { from: '2025-08-01', to: '2026-08-31' },
        });
      }
      return textResponse('', { ok: false, status: 404 });
    },
  });
  runtime.storage.kiditem_collection_sessions = {
    [staleAttemptId]: {
      environmentId: 'local',
      attemptId: staleAttemptId,
      producer: 'inventory.sellpia',
      progress: { current: 0, total: 0, completed: 0, failed: 0, label: null },
      attention: null,
      updatedAt: Date.now(),
    },
  };
  runtime.context.collectSellpiaProductProfit = async (from, to) => ({
    success: true,
    payload: {
      range: { from, to },
      provenance: {
        source: 'sellpia_stat_prd_profit',
        costBasis: 'ORDER_TIME_SUPPLY_COST',
        vatIncluded: true,
      },
      products: [{ productCode: 'SELLPIA-MISSING-REPLACEMENT-1', quantity: 1 }],
    },
  });

  const response = await dispatch(runtime.externalMessageListeners, {
    action: 'collectSellpiaInventory',
    idempotencyKey: replacementKey,
  });

  assert.equal(response.success, true, JSON.stringify(response));
  assert.equal(response.attemptId, replacementAttemptId);
  assert.deepEqual(ownerRequests.map(({ path, method }) => ({ path, method })), [
    {
      path: `/api/sellpia-product-sales/attempts/${staleAttemptId}`,
      method: 'GET',
    },
    { path: '/api/sellpia-product-sales/attempts', method: 'POST' },
    {
      path: `/api/sellpia-product-sales/attempts/${replacementAttemptId}`,
      method: 'POST',
    },
  ]);
});

test('Sellpia direct start reports a terminal owner attempt instead of silently creating another identity', async () => {
  const ownerRequests = [];
  const attemptId = uuid(911);
  let collectionCalled = false;
  const runtime = loadWorker({
    async fetch(url, init = {}) {
      const pathName = new URL(url).pathname;
      const method = init.method || 'GET';
      ownerRequests.push({ path: pathName, method });
      if (pathName === '/api/sellpia-product-sales/attempts' && method === 'POST') {
        return jsonResponse({
          attemptId,
          attemptToken: 'terminal-token',
          state: 'COMPLETE',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          plan: { from: '2025-08-01', to: '2026-08-31' },
        });
      }
      return textResponse('', { ok: false, status: 404 });
    },
  });
  runtime.context.collectSellpiaProductProfit = async () => {
    collectionCalled = true;
    return {
      success: true,
      payload: {
        provenance: {
          source: 'sellpia_stat_prd_profit',
          costBasis: 'ORDER_TIME_SUPPLY_COST',
          vatIncluded: true,
        },
        products: [{ productCode: 'SELLPIA-TERMINAL-1', quantity: 1 }],
      },
    };
  };

  const response = await dispatch(runtime.externalMessageListeners, {
    action: 'collectSellpiaInventory',
    idempotencyKey: 'sellpia-owner-key-terminal',
  });

  assert.equal(response.success, false, JSON.stringify(response));
  assert.equal(response.errorCode, 'new-start-key-required');
  assert.match(response.error, /terminal|new-start-key-required/i);
  assert.equal(collectionCalled, false);
  assert.deepEqual(ownerRequests, [
    { path: '/api/sellpia-product-sales/attempts', method: 'POST' },
  ]);
  assert.equal((runtime.storage.kiditem_collection_sessions || {})[attemptId], undefined);
});

test('Sellpia direct start rejects an expired owner attempt before collection', async () => {
  const ownerRequests = [];
  const attemptId = uuid(912);
  let collectionCalled = false;
  const runtime = loadWorker({
    async fetch(url, init = {}) {
      const pathName = new URL(url).pathname;
      const method = init.method || 'GET';
      ownerRequests.push({ path: pathName, method });
      if (pathName === '/api/sellpia-product-sales/attempts' && method === 'POST') {
        return jsonResponse({
          attemptId,
          attemptToken: 'expired-token',
          state: 'RUNNING',
          expiresAt: new Date(Date.now() - 1_000).toISOString(),
          plan: { from: '2025-08-01', to: '2026-08-31' },
        });
      }
      return textResponse('', { ok: false, status: 404 });
    },
  });
  runtime.context.collectSellpiaProductProfit = async () => {
    collectionCalled = true;
    return { success: true, payload: { products: [{ productCode: 'SELLPIA-EXPIRED-1' }] } };
  };

  const response = await dispatch(runtime.externalMessageListeners, {
    action: 'collectSellpiaInventory',
    idempotencyKey: 'sellpia-owner-key-expired',
  });

  assert.equal(response.success, false, JSON.stringify(response));
  assert.equal(response.errorCode, 'new-start-key-required');
  assert.match(response.error, /expired|new-start-key-required|running/i);
  assert.equal(collectionCalled, false);
  assert.deepEqual(ownerRequests, [
    { path: '/api/sellpia-product-sales/attempts', method: 'POST' },
  ]);
  assert.equal((runtime.storage.kiditem_collection_sessions || {})[attemptId], undefined);
});

test('Sellpia direct start requires an explicit idempotency key', async () => {
  const ownerRequests = [];
  let collectionCalled = false;
  const runtime = loadWorker({
    async fetch(url, init = {}) {
      ownerRequests.push({ path: new URL(url).pathname, method: init.method || 'GET' });
      return textResponse('', { ok: false, status: 500 });
    },
  });
  runtime.context.collectSellpiaProductProfit = async () => {
    collectionCalled = true;
    return { success: true, payload: { products: [{ productCode: 'SELLPIA-NO-KEY-1' }] } };
  };

  const response = await dispatch(runtime.externalMessageListeners, {
    action: 'collectSellpiaInventory',
  });

  assert.equal(response.success, false, JSON.stringify(response));
  assert.match(response.error, /idempotency key|required|new-start-key-required/i);
  assert.equal(collectionCalled, false);
  assert.deepEqual(ownerRequests, []);
});

test('Sellpia restart keeps its local session when the owner control read is unavailable', async () => {
  const ownerRequests = [];
  const attemptId = uuid(907);
  const replacementAttemptId = uuid(908);
  const runtime = loadWorker({
    async fetch(url, init = {}) {
      const pathName = new URL(url).pathname;
      const method = init.method || 'GET';
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
      ownerRequests.push({ path: pathName, method, body });
      if (
        pathName === `/api/sellpia-product-sales/attempts/${attemptId}` &&
        method === 'GET'
      ) {
        return jsonResponse({ message: 'temporary owner control outage' }, { ok: false, status: 503 });
      }
      if (pathName === '/api/sellpia-product-sales/attempts' && method === 'POST') {
        return jsonResponse({
          attemptId: replacementAttemptId,
          attemptToken: 'replacement-token',
          state: 'RUNNING',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          plan: { from: '2025-08-01', to: '2026-08-31' },
        });
      }
      if (
        pathName === `/api/sellpia-product-sales/attempts/${replacementAttemptId}` &&
        method === 'POST'
      ) {
        assert.equal(body.attemptToken, 'replacement-token');
        return jsonResponse({
          attemptId: replacementAttemptId,
          attemptToken: 'replacement-token',
          state: 'COMPLETE',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          plan: { from: '2025-08-01', to: '2026-08-31' },
        });
      }
      return textResponse('', { ok: false, status: 404 });
    },
  });
  runtime.storage.kiditem_collection_sessions = {
    [attemptId]: {
      environmentId: 'local',
      attemptId,
      producer: 'inventory.sellpia',
      progress: { current: 0, total: 0, completed: 0, failed: 0, label: null },
      attention: null,
      updatedAt: Date.now(),
    },
  };
  let collectionCalled = false;
  runtime.context.collectSellpiaProductProfit = async () => {
    collectionCalled = true;
    return {
      success: true,
      payload: {
        provenance: {
          source: 'sellpia_stat_prd_profit',
          costBasis: 'ORDER_TIME_SUPPLY_COST',
          vatIncluded: true,
        },
        products: [{ productCode: 'SELLPIA-UNAVAILABLE-1', quantity: 1 }],
      },
    };
  };

  const response = await dispatch(runtime.externalMessageListeners, {
    action: 'collectSellpiaInventory',
    idempotencyKey: 'sellpia-owner-key-unavailable',
  });

  assert.equal(response.success, false, JSON.stringify(response));
  assert.match(response.error, /owner control/i);
  assert.equal(collectionCalled, false);
  assert.deepEqual(ownerRequests.map(({ path, method }) => ({ path, method })), [
    {
      path: `/api/sellpia-product-sales/attempts/${attemptId}`,
      method: 'GET',
    },
  ]);
  assert.ok(runtime.storage.kiditem_collection_sessions[attemptId]);
});

test('Sellpia duplicate collection messages share the existing in-memory execution', async () => {
  const ownerRequests = [];
  const attemptId = uuid(906);
  let collectionCalls = 0;
  let releaseCollection;
  const collectionGate = new Promise((resolve) => {
    releaseCollection = resolve;
  });
  const runtime = loadWorker({
    async fetch(url, init = {}) {
      const pathName = new URL(url).pathname;
      const method = init.method || 'GET';
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
      ownerRequests.push({ path: pathName, method, body });
      if (pathName === '/api/sellpia-product-sales/attempts' && method === 'POST') {
        return jsonResponse({
          attemptId,
          attemptToken: 'owner-token',
          state: 'RUNNING',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          plan: { from: '2025-08-01', to: '2026-08-31' },
        });
      }
      if (
        pathName === `/api/sellpia-product-sales/attempts/${attemptId}` &&
        method === 'POST'
      ) {
        assert.equal(body.attemptToken, 'owner-token');
        return jsonResponse({
          attemptId,
          attemptToken: 'owner-token',
          state: 'COMPLETE',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          plan: { from: '2025-08-01', to: '2026-08-31' },
        });
      }
      return textResponse('', { ok: false, status: 404 });
    },
  });
  runtime.context.collectSellpiaProductProfit = async (from, to) => {
    collectionCalls += 1;
    await collectionGate;
    return {
      success: true,
      payload: {
        range: { from, to },
        provenance: {
          source: 'sellpia_stat_prd_profit',
          costBasis: 'ORDER_TIME_SUPPLY_COST',
          vatIncluded: true,
        },
        products: [{ productCode: 'SELLPIA-DUPLICATE-1', quantity: 1 }],
      },
    };
  };

  const first = dispatch(runtime.externalMessageListeners, {
    action: 'collectSellpiaInventory',
    idempotencyKey: 'sellpia-owner-key-duplicate-1',
  });
  const second = dispatch(runtime.externalMessageListeners, {
    action: 'collectSellpiaInventory',
    idempotencyKey: 'sellpia-owner-key-duplicate-2',
  });
  try {
    while (!(runtime.storage.kiditem_collection_sessions || {})[attemptId]) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    releaseCollection();
    const responses = await Promise.all([first, second]);
    assert.deepEqual(responses.map(({ success, attemptId: responseAttemptId }) => ({
      success,
      attemptId: responseAttemptId,
    })), [
      { success: true, attemptId },
      { success: true, attemptId },
    ]);
  } finally {
    releaseCollection();
    await Promise.allSettled([first, second]);
  }

  assert.equal(collectionCalls, 1);
  assert.deepEqual(ownerRequests.map(({ path, method }) => ({ path, method })), [
    { path: '/api/sellpia-product-sales/attempts', method: 'POST' },
    {
      path: `/api/sellpia-product-sales/attempts/${attemptId}`,
      method: 'POST',
    },
  ]);
});

test('Sellpia cancellation fails the owner before clearing its local session', async () => {
  const ownerRequests = [];
  const attemptId = uuid(901);
  let releaseCollection;
  const collectionGate = new Promise((resolve) => {
    releaseCollection = resolve;
  });
  const runtime = loadWorker({
    async fetch(url, init = {}) {
      const pathName = new URL(url).pathname;
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
      ownerRequests.push({ path: pathName, body });
      if (pathName === '/api/sellpia-product-sales/attempts') {
        return jsonResponse({
          attemptId,
          attemptToken: 'owner-token',
          state: 'RUNNING',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          plan: { from: '2025-08-01', to: '2026-08-31' },
        });
      }
      if (
        pathName === `/api/sellpia-product-sales/attempts/${attemptId}` &&
        init.method === 'GET'
      ) {
        assert.ok(runtime.storage.kiditem_collection_sessions[attemptId]);
        return jsonResponse({
          attemptId,
          attemptToken: 'fence-token',
          state: 'RUNNING',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          plan: {
            from: '2025-08-01',
            to: '2026-08-31',
            coveredMonths: ['2025-08', '2025-09'],
          },
        });
      }
      if (pathName.endsWith('/fail')) {
        assert.ok(runtime.storage.kiditem_collection_sessions[attemptId]);
        assert.equal(body.attemptToken, 'fence-token');
        assert.equal(body.errorCode, 'COLLECTION_CANCELLED');
        return jsonResponse({
          attemptId,
          attemptToken: 'owner-token',
          state: 'FAILED',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          plan: { from: '2025-08-01', to: '2026-08-31' },
        });
      }
      return jsonResponse({});
    },
  });
  runtime.context.collectSellpiaProductProfit = async () => {
    await collectionGate;
    return {
      success: true,
      payload: {
        range: { from: '2025-08-01', to: '2026-08-31' },
        provenance: {
          source: 'sellpia_stat_prd_profit',
          costBasis: 'ORDER_TIME_SUPPLY_COST',
          vatIncluded: true,
        },
        products: [],
      },
    };
  };

  const pending = dispatch(runtime.externalMessageListeners, {
    action: 'collectSellpiaInventory',
    idempotencyKey: 'sellpia-owner-key-cancel',
  });
  while (!(runtime.storage.kiditem_collection_sessions || {})[attemptId]) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  let cancelled;
  try {
    cancelled = await dispatch(runtime.externalMessageListeners, {
      action: 'cancelCollectionSession',
      attemptId,
    });
  } finally {
    releaseCollection();
    await pending;
  }

  assert.equal(cancelled.attemptId, attemptId);
  assert.equal(runtime.storage.kiditem_collection_sessions[attemptId], undefined);
  assert.deepEqual(ownerRequests.map(({ path }) => path), [
    '/api/sellpia-product-sales/attempts',
    `/api/sellpia-product-sales/attempts/${attemptId}`,
    `/api/sellpia-product-sales/attempts/${attemptId}/fail`,
  ]);
  assert.equal(ownerRequests[2].body.attemptToken, 'fence-token');
});
