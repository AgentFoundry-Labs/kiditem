import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
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
  ['collectIcecreamMallOrders', 'collectIcecreamMallOrders', 'icecream-mall', { date: '2026-07-15' }],
  ['collectKidsnoteOrders', 'collectKidsnoteOrders', 'kidsnote', { from: '2026-07-14', to: '2026-07-15' }],
  ['collectKkomangseOrders', 'collectKkomangseOrders', 'kkomangse', { date: '2026-07-15' }],
  ['collectOnchannelOrders', 'collectOnchannelOrders', 'onch', { date: '2026-07-15' }],
  ['collectDomeggookOrders', 'collectDomeggookOrders', 'domeggook', { date: '2026-07-15' }],
  ['collectLotteonOrders', 'collectLotteonOrders', 'lotte-on', { date: '2026-07-15' }],
  ['collectGsshopOrders', 'collectGsshopOrders', 'gs-shop', { date: '2026-07-15' }],
  ['collectAlwayzOrders', 'collectAlwayzOrders', 'always', { date: '2026-07-15' }],
  ['collectKakaoOrders', 'collectKakaoOrders', 'kakao', { date: '2026-07-15' }],
  ['collectBoriboriOrders', 'collectBoriboriOrders', 'boribori', { date: '2026-07-15' }],
  ['collectTeachervilleOrders', 'collectTeachervilleOrders', 'teacher-mall', { date: '2026-07-15' }],
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
        return { id: nextTabId++, windowId: 7, status: 'complete', ...properties };
      },
      get(tabId, callback) {
        const tab = { id: tabId, windowId: 7, status: 'complete' };
        if (typeof callback === 'function') callback(tab);
        return Promise.resolve(tab);
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
      onUpdated: {
        addListener() {},
        removeListener() {},
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
  const sourceAttempts = new Map();
  const sourceMallByAttempt = new Map([
    [uuid(777), 'kidsnote'],
    [uuid(778), 'kidsnote'],
    [uuid(782), 'kkomangse'],
    [uuid(783), 'coupang-direct'],
  ]);
  fake.storage.kiditem_environment_profiles_v1 = {
    local: { accessToken: 'web-token', updatedAt: Date.now() },
  };
  function sourceControl(attemptId) {
    const current = sourceAttempts.get(attemptId) || {
      state: 'RUNNING',
      errorCode: null,
      errorMessage: null,
    };
    return {
      attemptId,
      sourceImportRunId: uuid(990),
      attemptToken: uuid(991),
      state: current.state,
      plan: {
        sourceType: 'order_collection_mall',
        parserVersion: 'order-collection-v1',
        mallKey: sourceMallByAttempt.get(attemptId) || 'kidsnote',
        mallName: '테스트 몰',
        channelAccountId: uuid(992),
        collectionDate: null,
        collectionMode: 'browser',
      },
      expiresAt: '2099-01-01T00:00:00.000Z',
      artifactId: null,
      coverageStartDate: null,
      coverageEndDate: null,
      errorCode: current.errorCode,
      errorMessage: current.errorMessage,
    };
  }
  function directSourceControl(attemptId) {
    const current = sourceAttempts.get(attemptId) || {
      state: 'RUNNING',
      errorCode: null,
      errorMessage: null,
    };
    return {
      attemptId,
      sourceImportRunId: uuid(991),
      attemptToken: uuid(992),
      state: current.state,
      plan: {
        sourceType: 'coupang_direct_order_capture',
        parserVersion: 'coupang-direct-order-v1',
        channelAccountId: uuid(993),
        captureMode: 'browser',
        transportScope: 'ALL',
      },
      expiresAt: '2099-01-01T00:00:00.000Z',
      artifactId: null,
      contentChecksum: null,
      errorCode: current.errorCode,
      errorMessage: current.errorMessage,
    };
  }
  async function sourceFetch(url, init = {}) {
    const parsed = new URL(url);
    const directMatch = parsed.pathname.match(
      /\/api\/orders\/collection\/coupang-directship\/attempts\/([^/]+)(?:\/(?:control|complete|fail))?$/,
    );
    if (directMatch) {
      const attemptId = decodeURIComponent(directMatch[1]);
      if (parsed.pathname.endsWith('/fail')) {
        const body = JSON.parse(String(init.body || '{}'));
        sourceAttempts.set(attemptId, {
          state: 'FAILED',
          errorCode: body.code,
          errorMessage: body.message,
        });
      } else if (parsed.pathname.endsWith('/complete')) {
        const body = JSON.parse(String(init.body || '{}'));
        assert.ok(Array.isArray(body.pos));
        assert.ok(body.centers && typeof body.centers === 'object');
        sourceAttempts.set(attemptId, {
          state: 'COMPLETE',
          errorCode: null,
          errorMessage: null,
        });
      }
      return {
        ok: true,
        status: 200,
        async json() {
          return directSourceControl(attemptId);
        },
      };
    }
    const match = parsed.pathname.match(
      /\/api\/orders\/collection\/attempts\/([^/]+)(?:\/control|\/fail)?$/,
    );
    if (!match) throw new Error('Unexpected fetch in order collection session test');
    const attemptId = decodeURIComponent(match[1]);
    if (parsed.pathname.endsWith('/fail')) {
      const body = JSON.parse(String(init.body || '{}'));
      sourceAttempts.set(attemptId, {
        state: 'FAILED',
        errorCode: body.code,
        errorMessage: body.message,
      });
    }
    return {
      ok: true,
      status: 200,
      async json() {
        return sourceControl(attemptId);
      },
    };
  }
  let context;
  const sandbox = {
    URL,
    URLSearchParams,
    Headers,
    AbortController,
    DataView,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    Blob,
    FormData,
    atob,
    btoa,
    console,
    crypto: {
      randomUUID: () => uuid(999),
      subtle: webcrypto.subtle,
    },
    fetch: sourceFetch,
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
  return {
    ...fake,
    context,
    setSourceMallForAttempt(attemptId, mallKey) {
      sourceMallByAttempt.set(attemptId, mallKey);
    },
    externalMessageListeners: fake.getExternalMessageListeners(),
  };
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
  const postedWindows = [];
  const runtime = loadWorker({
    DOMParser: createHaebeopDomParser(documents),
    document: { querySelector: () => null },
    location: { href: 'https://mallseller.genimarket.co.kr/mall/order/basket_list.php' },
    async fetch(url, init = {}) {
      if (url === '/mall/order/basket_list.php') {
        const page = new URLSearchParams(init.body).get('page') || '1';
        const body = new URLSearchParams(init.body);
        listPages.push(page);
        postedWindows.push([body.get('str_date'), body.get('end_date')]);
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
  assert.deepEqual(postedWindows, [
    ['2026-07-31', '2026-07-31'],
    ['2026-07-31', '2026-07-31'],
  ]);
  assert.deepEqual(
    JSON.parse(JSON.stringify(result.confirmedCoverage)),
    { startDate: '2026-07-31', endDate: '2026-07-31' },
  );
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

test('Haebeop confirms the queried day when every discovered page is valid and empty', async () => {
  const runtime = loadWorker({
    DOMParser: createHaebeopDomParser(new Map([
      ['list:1', haebeopListDocument([])],
    ])),
    document: { querySelector: () => null },
    location: { href: 'https://mallseller.genimarket.co.kr/mall/order/basket_list.php' },
    async fetch() {
      return textResponse('list:1');
    },
  });

  const result = await runtime.context.scrapeHaebeopOrders({ date: '2026-07-31' });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    success: true,
    orders: [],
    count: 0,
    confirmedCoverage: { startDate: '2026-07-31', endDate: '2026-07-31' },
  });
});

test('Haebeop does not confirm coverage when discovered pagination exceeds its safe bound', async () => {
  const pages = Array.from({ length: 101 }, (_, index) => index + 1);
  const documents = new Map([
    ['list:1', haebeopListDocument([], pages)],
    ...pages.slice(1, 100).map((page) => [`list:${page}`, haebeopListDocument([])]),
  ]);
  const runtime = loadWorker({
    DOMParser: createHaebeopDomParser(documents),
    document: { querySelector: () => null },
    location: { href: 'https://mallseller.genimarket.co.kr/mall/order/basket_list.php' },
    async fetch(_url, init = {}) {
      return textResponse(`list:${new URLSearchParams(init.body).get('page') || '1'}`);
    },
  });

  const result = await runtime.context.scrapeHaebeopOrders({ date: '2026-07-31' });

  assert.equal(result.success, false);
  assert.match(result.error, /100페이지를 초과/);
  assert.equal(result.confirmedCoverage, undefined);
});

test('automatic order actions publish safe domain-specific sessions from inactive tabs', async () => {
  const runtime = loadWorker();
  for (const [, functionName] of AUTOMATIC_ACTIONS) {
    installCollectorResult(runtime, functionName, () => functionName === 'collectCoupangDirectOrders'
      ? {
        success: true,
        pos: [{ seq: 'PO-1', status: 'PA', center: 'C', transport: 'SHIPMENT', edd: '', reg: 'R', items: [] }],
        centers: {},
      }
      : {
        success: true,
        rows: [{ address: '서울', phone: '010-0000-0000', orderPayload: 'private' }],
        xlsxBase64: 'private-xlsx',
        csvBase64: 'private-csv',
        fileBase64: 'private-file',
      });
  }

  for (const [index, [action, , mallKey, input]] of AUTOMATIC_ACTIONS.entries()) {
    const runId = uuid(index + 1);
    const correlation = action === 'collectCoupangDirectOrders'
      ? { attemptId: runId }
      : { runId };
    const message = {
      action,
      ...input,
      ...correlation,
      ...(action === 'collectCoupangDirectOrders'
        ? {}
        : {
          credentials: { loginId: 'operator@example.test', password: 'top-secret' },
          password: 'top-secret',
          rows: [{ address: '서울', phone: '010-0000-0000' }],
          xlsxBase64: 'private-xlsx',
          csvBase64: 'private-csv',
          fileBase64: 'private-file',
        }),
    };
    runtime.setSourceMallForAttempt(runId, mallKey);
    const response = await dispatch(runtime.externalMessageListeners, message);

    assert.equal(response.attemptId, runId, action);
    if (action === 'collectCoupangDirectOrders') {
      assert.equal(response.terminalState, 'COMPLETE', action);
      assert.equal(response.collectionSession, undefined, action);
    } else {
      assert.equal(response.collectionSession.progress.completed, 1, action);
      assert.equal(response.collectionSession.producer, 'orders.mall', action);
      assert.equal('status' in response.collectionSession, false, action);
    }
    if (response.collectionSession) {
      assert.equal('inputIdentity' in response.collectionSession, false, action);
    }
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

test('every automatic mall access failure requires personal attention without focusing', async () => {
  const runtime = loadWorker();
  for (const [, functionName] of AUTOMATIC_ACTIONS) {
    installCollectorResult(runtime, functionName, () => {
      throw new Error('Cannot access contents of the page');
    });
  }

  for (const [index, [action, , , input]] of AUTOMATIC_ACTIONS.entries()) {
    if (action === 'collectCoupangDirectOrders') continue;
    const attemptId = uuid(index + 100);
    runtime.setSourceMallForAttempt(attemptId, AUTOMATIC_ACTIONS[index][2]);
    const response = await dispatch(runtime.externalMessageListeners, {
      action,
      ...input,
      runId: attemptId,
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

  const attemptId = uuid(200);
  runtime.setSourceMallForAttempt(attemptId, 'gs-shop');
  const response = await dispatch(runtime.externalMessageListeners, {
    action: 'collectGsshopOrders',
    date: '2026-07-15',
    runId: attemptId,
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

test('named mall reads create a fresh inactive tab even when a provider tab exists', async () => {
  const runtime = loadWorker();
  const existing = {
    id: 41,
    windowId: 7,
    active: true,
    status: 'complete',
    url: 'https://provider.example.test/already-open',
  };
  const queried = [];
  const created = [];
  runtime.chrome.tabs.query = async (query) => {
    queried.push(query);
    return [existing];
  };
  runtime.chrome.tabs.create = async (properties) => {
    const tab = {
      id: 100 + created.length,
      windowId: 7,
      status: 'complete',
      ...properties,
    };
    created.push(tab);
    return tab;
  };
  const collection = { assertActive: async () => true };
  const cases = [
    ['findOrCreateIcecreamMallTab', 'https://po.i-screammall.co.kr/main.do'],
    ['findOrCreateKidsnoteTab', 'https://shop.kidsnote.com/_manage/?body=3010'],
    ['findOrCreateKkomangseTab', 'https://nstore.edupre.co.kr/subAdmin/_order_product.list.php?mode=search&pass_input_type=all&st=o_rdate&so=desc&listmaxcount=1000'],
    ['findOrCreateOnchannelTab', 'https://www.onch3.co.kr/supplier/orders.php?state=all'],
    ['findOrCreateDomeggookTab', 'https://domeggook.com/sc/order/lstAll'],
    ['findOrCreateKidkidsTab', 'https://partner.kidkids.net/new/pages/logis/management.htm'],
    ['findOrCreateLotteonTab', 'https://store.lotteon.com/cm/main/index_SO.wsp'],
    ['findOrCreateGsshopTab', 'https://partners.gsshop.com/logistics/partner-logistics-mng'],
    ['findOrCreateAlwayzTab', 'https://alwayzseller.ilevit.com/shippings'],
    ['findOrCreateKakaoTab', 'https://shopping-seller.kakao.com/order/seller/store-order/integrate/list'],
    ['findOrCreateBoriboriTab', 'https://seller-club.co.kr/order/orderDeliList'],
    ['findOrCreateTeachervilleTab', 'https://shop.teacherville.co.kr/selleradmin/order/catalog'],
    ['findOrCreateHaebeopTab', 'https://mallseller.genimarket.co.kr/mall/order/basket_list.php'],
  ];

  for (const [functionName, url] of cases) {
    const located = functionName === 'findOrCreateDomeggookTab'
      ? await runtime.context[functionName](url, collection)
      : await runtime.context[functionName](collection);
    assert.equal(located.created, true, functionName);
    assert.equal(located.tab.active, false, functionName);
    assert.equal(located.tab.url, url, functionName);
  }

  assert.equal(queried.length, 0);
  assert.equal(created.length, cases.length);
});

test('every named mall collector uses the production attach-before-readiness path', async () => {
  const runtime = loadWorker();
  const events = [];
  let nextTabId = 450;
  runtime.chrome.tabs.query = async () => {
    throw new Error('managed mall reads must not query for an existing provider tab');
  };
  runtime.chrome.tabs.create = async (properties) => {
    const tab = {
      id: nextTabId++,
      windowId: 7,
      status: 'complete',
      ...properties,
    };
    events.push(['create', tab.id, properties.active]);
    return tab;
  };
  runtime.chrome.tabs.remove = async (tabId) => events.push(['remove', tabId]);
  runtime.chrome.tabs.update = async (tabId, properties) => {
    events.push(['update', tabId, properties]);
    return { id: tabId, windowId: 7, status: 'complete', ...properties };
  };
  runtime.context.waitForTabReady = async (tabId) => events.push(['ready', tabId]);
  runtime.context.delay = async () => {};
  runtime.context.ensureIcecreamMallLogin = async () => ({ success: true });
  runtime.context.openIcecreamMallDeliveryInquiry = async () => ({ success: true });
  runtime.context.findIcecreamMallDeliveryFrameId = async () => null;
  runtime.context.domeggookOrderList = async () => ({ dat: [] });
  runtime.chrome.scripting.executeScript = async (options) => {
    events.push(['execute', options.target?.tabId, options.func?.name]);
    if (options.func?.name === 'scrapeIcecreamMallDeliveryGrid') {
      return [{ result: { success: true, rows: [] } }];
    }
    if (options.func?.name === 'triggerDomeggookExcelGen') {
      return [{ result: { success: true, empty: true } }];
    }
    return [{ result: { success: true } }];
  };

  const cases = [
    ['collectIcecreamMallOrders', [null, null]],
    ['collectKidsnoteOrders', [{ from: '2026-07-15', to: '2026-07-15' }]],
    ['collectKkomangseOrders', []],
    ['collectOnchannelOrders', ['2026-07-15']],
    ['collectDomeggookOrders', ['2026-07-15']],
    ['collectLotteonOrders', []],
    ['collectGsshopOrders', []],
    ['collectAlwayzOrders', []],
    ['collectKakaoOrders', ['2026-07-15']],
    ['collectBoriboriOrders', [{}]],
    ['collectTeachervilleOrders', []],
    ['collectHaebeopOrders', [{}]],
  ];

  for (const [functionName, args] of cases) {
    const caseEvents = [];
    const start = events.length;
    const collection = {
      assertActive: async () => {
        events.push(['assert', functionName]);
        caseEvents.push('assert');
        return true;
      },
      attachTab: async (tab) => {
        events.push(['attach', functionName, tab.id]);
        caseEvents.push('attach');
        return { attemptId: uuid(450) };
      },
      detachTab: async () => {
        events.push(['detach', functionName]);
        caseEvents.push('detach');
      },
    };
    const result = await runtime.context[functionName](...args, collection);
    const trace = events.slice(start);
    const attachIndex = trace.findIndex((event) => event[0] === 'attach');
    const firstReadyIndex = trace.findIndex((event) => event[0] === 'ready');
    const createEvent = trace.find((event) => event[0] === 'create');
    const executeIndex = trace.findIndex((event) => event[0] === 'execute');

    assert.equal(result.success, true, functionName);
    if (functionName === 'collectDomeggookOrders') {
      assert.deepEqual(
        JSON.parse(JSON.stringify(result.confirmedCoverage)),
        { startDate: '2026-07-15', endDate: '2026-07-15' },
      );
    }
    assert.ok(createEvent, functionName);
    assert.equal(createEvent[2], false, functionName);
    assert.ok(attachIndex >= 0, functionName);
    assert.ok(firstReadyIndex > attachIndex, functionName);
    assert.ok(executeIndex > firstReadyIndex, functionName);
    const removeIndex = trace.findIndex((event) => event[0] === 'remove');
    assert.ok(removeIndex > executeIndex, functionName);
  }
});

test('managed order capture acknowledges attachment before readiness and fences execution', async () => {
  const runtime = loadWorker();
  const events = [];
  runtime.chrome.tabs.create = async (properties) => {
    events.push(['create', properties.active]);
    return { id: 401, windowId: 7, status: 'complete', ...properties };
  };
  runtime.chrome.tabs.remove = async (tabId) => events.push(['remove', tabId]);
  runtime.context.waitForTabReady = async () => events.push('ready');
  runtime.chrome.scripting.executeScript = async () => {
    events.push('execute');
    return [{ result: { success: true, xlsxBase64: 'safe' } }];
  };
  let checks = 0;
  const collection = {
    assertActive: async () => {
      checks += 1;
      events.push('assert');
      return checks < 2;
    },
    attachTab: async () => {
      events.push('attach');
      return { attemptId: '00000000-0000-4000-8000-000000000401' };
    },
  };

  const result = await runtime.context.collectKkomangseOrders(collection);

  assert.equal(result.success, false);
  assert.equal(result.errorCode, 'COLLECTION_CANCELLED');
  assert.deepEqual(events, [
    'assert',
    ['create', false],
    'attach',
    'ready',
    'assert',
    ['remove', 401],
  ]);
});

test('a refused managed attachment closes the fresh tab and never executes capture', async () => {
  const runtime = loadWorker();
  const events = [];
  runtime.chrome.tabs.create = async (properties) => {
    events.push('create');
    return { id: 402, windowId: 7, status: 'complete', ...properties };
  };
  runtime.chrome.tabs.remove = async (tabId) => events.push(['remove', tabId]);
  runtime.chrome.scripting.executeScript = async () => {
    events.push('execute');
    return [{ result: { success: true } }];
  };
  const result = await runtime.context.collectKkomangseOrders({
    assertActive: async () => true,
    attachTab: async () => null,
  });

  assert.equal(result.errorCode, 'COLLECTION_CANCELLED');
  assert.deepEqual(events, ['create', ['remove', 402]]);
});

/**
 * 수집 전 자동 로그인은 몰 세션 모듈이 하고(KID-254), 탭 소유권은 worker.js 의 드라이버가
 * 진다. 순서가 중요하다 — 소유권을 먼저 확인하고 탭을 열어 시도에 매달고, 로그인 화면이
 * 안정된 뒤 스크립트를 넣기 직전에 한 번 더 확인한다. 취소된 시도가 로그인 화면을 남기지
 * 않게 하는 것이 이 순서다.
 */
test('managed login attaches before readiness and fences scripting after the login delay', async () => {
  const runtime = loadWorker();
  const events = [];
  runtime.chrome.tabs.create = async (properties) => {
    events.push(['create', properties.active]);
    return { id: 403, windowId: 7, status: 'complete', ...properties };
  };
  runtime.chrome.tabs.remove = async (tabId) => events.push(['remove', tabId]);
  runtime.context.waitForTabReady = async () => events.push('ready');
  runtime.context.delay = async (milliseconds) => events.push(['delay', milliseconds]);
  // 프레임에 스크립트를 넣는 것과 알림 창을 삼키는 것은 따로 본다 — 여기서는 탭의 생애만 본다.
  runtime.context.recordMallLoginDialogs = async () => undefined;
  runtime.context.takeMallLoginDialog = async () => null;
  runtime.context.loginFormRemainsAfterSubmit = async () => false;
  runtime.chrome.scripting.executeScript = async () => {
    events.push('login');
    return [{ result: { state: 'submitted', method: 'exact-text' } }];
  };
  const collection = {
    assertActive: async () => {
      events.push('assert');
      return true;
    },
    attachTab: async () => {
      events.push('attach');
      return { attemptId: uuid(403) };
    },
    detachTab: async () => events.push('detach'),
  };

  const result = await runtime.context.mallSession().ensureLoggedIn(
    'kidsnote',
    { loginId: 'operator@example.test', password: 'top-secret' },
    { collection },
  );

  assert.equal(result.verdict, 'ok');
  assert.equal(result.submitted, true);
  assert.equal(result.verified, true);
  assert.deepEqual(events, [
    'assert',
    ['create', false],
    'attach',
    'ready',
    ['delay', 1000],
    'assert',
    'login',
    ['delay', 1500],
    'ready',
    ['delay', 1200],
    'detach',
    ['remove', 403],
  ]);
});

test('managed login closes only a fresh tab when attachment is refused', async () => {
  const runtime = loadWorker();
  const events = [];
  runtime.chrome.tabs.create = async (properties) => {
    events.push(['create', properties.active]);
    return { id: 404, windowId: 7, status: 'complete', ...properties };
  };
  runtime.chrome.tabs.remove = async (tabId) => events.push(['remove', tabId]);
  runtime.chrome.scripting.executeScript = async () => {
    events.push('login');
    return [{ result: { state: 'submitted' } }];
  };

  const result = await runtime.context.mallSession().ensureLoggedIn(
    'kidsnote',
    { loginId: 'operator@example.test', password: 'top-secret' },
    {
      collection: {
        assertActive: async () => true,
        attachTab: async () => null,
      },
    },
  );

  assert.equal(result.errorCode, 'COLLECTION_CANCELLED');
  assert.equal(result.reason, 'collection_cancelled');
  assert.deepEqual(events, [['create', false], ['remove', 404]]);
});

test('Directship uploads raw capture and becomes terminal before the page can close', async () => {
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
  });

  assert.equal(collected.success, true);
  assert.equal(collected.terminalState, 'COMPLETE');
  assert.equal(collected.pos, undefined);
  assert.equal(collected.collectionSession, undefined);

  const completed = await dispatch(runtime.externalMessageListeners, {
    action: 'collectCoupangDirectOrders',
    date: '2026-07-15',
    attemptId,
  });

  assert.equal(completed.success, true);
  assert.equal(completed.terminalState, 'COMPLETE');
  assert.equal(completed.collectionSession, undefined);
});

test('Sellpia inventory accepts only a server-issued attempt ID and never begins a legacy owner flow', async () => {
  const runtime = loadWorker();
  const response = await dispatch(runtime.externalMessageListeners, {
    action: 'collectSellpiaInventory',
    idempotencyKey: 'legacy-owner-key',
  });

  assert.equal(response.success, false);
  assert.match(response.error, /Invalid Sellpia inventory source request/);
  assert.deepEqual(runtime.storage.kiditem_collection_sessions || {}, {});
});
