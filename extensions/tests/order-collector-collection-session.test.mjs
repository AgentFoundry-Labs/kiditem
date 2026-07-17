import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const backgroundRoot = path.join(repoRoot, 'extensions/order-collector/background');
const workerPath = path.join(backgroundRoot, 'service-worker.js');
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
  let externalMessageListener = null;
  const chrome = {
    runtime: {
      lastError: null,
      getManifest: () => ({ version: 'test' }),
      onInstalled: { addListener() {} },
      onStartup: { addListener() {} },
      onMessageExternal: {
        addListener(listener) {
          externalMessageListener = listener;
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
    getExternalMessageListener: () => externalMessageListener,
  };
}

function loadWorker() {
  const fake = createFakeChrome();
  let context;
  const sandbox = {
    URL,
    URLSearchParams,
    TextDecoder,
    Blob,
    FormData,
    atob,
    btoa,
    console,
    crypto: {
      randomUUID: () => uuid(999),
    },
    setTimeout,
    clearTimeout,
    structuredClone,
    chrome: fake.chrome,
    importScripts(...relativePaths) {
      for (const relativePath of relativePaths) {
        const filename = path.join(backgroundRoot, relativePath);
        vm.runInContext(readFileSync(filename, 'utf8'), context, { filename });
      }
    },
  };
  context = vm.createContext(sandbox);
  vm.runInContext(readFileSync(workerPath, 'utf8'), context, { filename: workerPath });
  return { ...fake, context, externalMessageListener: fake.getExternalMessageListener() };
}

function dispatch(listener, message) {
  return new Promise((resolve) => {
    const keepAlive = listener(message, {}, resolve);
    assert.equal(keepAlive, true);
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

test('all automatic order actions publish safe orders.mall sessions from inactive tabs', async () => {
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
    const response = await dispatch(runtime.externalMessageListener, {
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

    assert.equal(response.runId, runId, action);
    assert.equal(response.collectionSession.status, 'succeeded', action);
    assert.equal(response.collectionSession.producer, 'orders.mall', action);
    assert.deepEqual(
      JSON.parse(JSON.stringify(response.collectionSession.inputIdentity)),
      { mallKey, date: input.date ?? input.to ?? input.endDate ?? null },
      action,
    );
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
    const response = await dispatch(runtime.externalMessageListener, {
      action,
      ...input,
      runId: uuid(index + 100),
    });
    assert.equal(response.collectionSession.status, 'attention_required', action);
    assert.equal(response.collectionSession.attention.reason, 'marketplace_login', action);
    assert.equal(response.collectionSession.attention.canOpenTab, true, action);
  }

  assert.deepEqual(runtime.calls.tabsUpdate, []);
  assert.deepEqual(runtime.calls.windowsUpdate, []);
});

test('web restart keeps the run, closes the old attention tab, and increments its attempt', async () => {
  const runtime = loadWorker();
  let attempt = 0;
  installCollectorResult(runtime, 'collectKidsnoteOrders', () => {
    attempt += 1;
    return attempt === 1
      ? { success: false, pendingLogin: true, error: '로그인이 필요합니다.' }
      : { success: true, orders: [] };
  });
  const runId = uuid(777);
  const message = {
    action: 'collectKidsnoteOrders',
    from: '2026-07-15',
    to: '2026-07-15',
    runId,
  };

  const attention = await dispatch(runtime.externalMessageListener, message);
  const restarted = await dispatch(runtime.externalMessageListener, message);

  assert.equal(attention.runId, runId);
  assert.equal(attention.collectionSession.status, 'attention_required');
  assert.equal(restarted.runId, runId);
  assert.equal(restarted.collectionSession.status, 'succeeded');
  assert.equal(restarted.collectionSession.attempt, 2);
  assert.deepEqual(runtime.calls.tabsRemove, [100]);
  assert.equal(Object.keys(runtime.storage.kiditem_collection_sessions).length, 1);
});

test('web restart preserves an existing user marketplace tab while replacing its attachment', async () => {
  const runtime = loadWorker();
  let attempt = 0;
  runtime.context.collectKidsnoteOrders = async (...args) => {
    const collection = args.at(-1);
    const tab = { id: 55 + attempt, windowId: 7 };
    await collection.attachTab(tab, { owned: false });
    attempt += 1;
    return attempt === 1
      ? { success: false, pendingLogin: true, error: '로그인이 필요합니다.' }
      : { success: true, orders: [] };
  };
  const runId = uuid(779);
  const message = {
    action: 'collectKidsnoteOrders',
    from: '2026-07-15',
    to: '2026-07-15',
    runId,
  };

  await dispatch(runtime.externalMessageListener, message);
  const restarted = await dispatch(runtime.externalMessageListener, message);

  assert.equal(restarted.collectionSession.attempt, 2);
  assert.deepEqual(runtime.calls.tabsRemove, []);
});

test('cancelling a deferred order run closes its tab and fences late completion', async () => {
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
  const runId = uuid(778);
  const pending = dispatch(runtime.externalMessageListener, {
    action: 'collectKidsnoteOrders',
    from: '2026-07-15',
    to: '2026-07-15',
    runId,
  });
  await attached;

  const cancelled = await dispatch(runtime.externalMessageListener, {
    action: 'cancelCollectionSession',
    runId,
  });
  releaseOperation();
  const completed = await pending;

  assert.equal(cancelled.status, 'cancelled');
  assert.deepEqual(runtime.calls.tabsRemove, [100]);
  assert.equal(completed.success, false);
  assert.equal(completed.cancelled, true);
  assert.equal(completed.orders, undefined);
  assert.equal(completed.collectionSession.status, 'cancelled');
  assert.equal(runtime.storage.kiditem_collection_sessions[runId].status, 'cancelled');
});

test('cancelling a run on a user-owned tab preserves the tab but discards late data', async () => {
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
    await collection.attachTab({ id: 55, windowId: 7 }, { owned: false });
    signalAttached();
    await operationGate;
    return { success: true, orders: [{ orderNo: 'must-not-reach-web' }] };
  };
  const runId = uuid(780);
  const pending = dispatch(runtime.externalMessageListener, {
    action: 'collectKidsnoteOrders',
    from: '2026-07-15',
    to: '2026-07-15',
    runId,
  });
  await attached;

  await dispatch(runtime.externalMessageListener, {
    action: 'cancelCollectionSession',
    runId,
  });
  releaseOperation();
  const completed = await pending;

  assert.deepEqual(runtime.calls.tabsRemove, []);
  assert.equal(completed.success, false);
  assert.equal(completed.cancelled, true);
  assert.equal(completed.orders, undefined);
  assert.equal(completed.collectionSession.status, 'cancelled');
});

test('cancelling before an owned tab attaches closes the late orphan tab', async () => {
  const runtime = loadWorker();
  let releaseOperation;
  const operationGate = new Promise((resolve) => {
    releaseOperation = resolve;
  });
  let signalStarted;
  const started = new Promise((resolve) => {
    signalStarted = resolve;
  });
  runtime.context.collectKidsnoteOrders = async (...args) => {
    const collection = args.at(-1);
    signalStarted();
    await operationGate;
    const tab = await runtime.chrome.tabs.create({
      url: 'https://shop.kidsnote.com/_manage/',
      active: false,
    });
    await collection.attachTab(tab, { owned: true });
    return { success: true, orders: [{ orderNo: 'must-not-reach-web' }] };
  };
  const runId = uuid(781);
  const pending = dispatch(runtime.externalMessageListener, {
    action: 'collectKidsnoteOrders',
    from: '2026-07-15',
    to: '2026-07-15',
    runId,
  });
  await started;

  await dispatch(runtime.externalMessageListener, {
    action: 'cancelCollectionSession',
    runId,
  });
  releaseOperation();
  const completed = await pending;

  assert.deepEqual(runtime.calls.tabsRemove, [100]);
  assert.equal(completed.success, false);
  assert.equal(completed.cancelled, true);
  assert.equal(completed.orders, undefined);
});

test('hostile date-shaped input cannot enter persisted order identity', async () => {
  const runtime = loadWorker();
  installCollectorResult(runtime, 'collectKkomangseOrders', () => ({
    success: true,
    xlsxBase64: 'private-xlsx',
  }));
  const runId = uuid(782);

  const response = await dispatch(runtime.externalMessageListener, {
    action: 'collectKkomangseOrders',
    date: '010-password-secret',
    runId,
  });

  assert.deepEqual(
    JSON.parse(JSON.stringify(response.collectionSession.inputIdentity)),
    { mallKey: 'kkomangse', date: null },
  );
  assert.equal(
    JSON.stringify(runtime.storage.kiditem_collection_sessions).includes('010-password-secret'),
    false,
  );
});

test('web-finalized order runs stay active through conversion and then succeed', async () => {
  const runtime = loadWorker();
  installCollectorResult(runtime, 'collectCoupangDirectOrders', () => ({
    success: true,
    pos: [{ seq: 'PO-1', transport: 'SHIPMENT' }],
    centers: {},
  }));
  const runId = uuid(783);

  const collected = await dispatch(runtime.externalMessageListener, {
    action: 'collectCoupangDirectOrders',
    date: '2026-07-15',
    runId,
    deferTerminal: true,
  });

  assert.equal(collected.collectionSession.status, 'running');
  assert.equal(collected.collectionSession.progress.label, '브라우저 수집 완료 · 파일 생성 중');

  const finalized = await dispatch(runtime.externalMessageListener, {
    action: 'finalizeCollectionSession',
    runId,
    status: 'succeeded',
    message: '쿠팡직배송 파일 생성 완료',
  });

  assert.equal(finalized.status, 'succeeded');
  assert.equal(finalized.progress.label, '쿠팡직배송 파일 생성 완료');
});

test('web-finalized order failures remain personal session failures', async () => {
  const runtime = loadWorker();
  installCollectorResult(runtime, 'collectCoupangDirectOrders', () => ({
    success: true,
    pos: [{ seq: 'PO-1', transport: 'SHIPMENT' }],
    centers: {},
  }));
  const runId = uuid(784);
  await dispatch(runtime.externalMessageListener, {
    action: 'collectCoupangDirectOrders',
    runId,
    deferTerminal: true,
  });

  const finalized = await dispatch(runtime.externalMessageListener, {
    action: 'finalizeCollectionSession',
    runId,
    status: 'failed',
    message: '쿠팡직배송 엑셀 생성 실패',
  });

  assert.equal(finalized.status, 'failed');
  assert.equal(finalized.progress.failed, 1);
  assert.equal(finalized.progress.label, '쿠팡직배송 엑셀 생성 실패');
});
