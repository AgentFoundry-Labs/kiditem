import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const helperPath = path.join(
  repoRoot,
  'extensions/coupang-ads-scraper/background/collection-window.js',
);

function createFakeChrome(initialStorage = {}, messageResponses = []) {
  const storage = structuredClone(initialStorage);
  const userTab = {
    id: 10,
    windowId: 1,
    active: true,
    status: 'complete',
    url: 'http://localhost:3000/product-pipeline/registered-products',
  };
  const windows = new Map([
    [1, { id: 1, type: 'normal', focused: true, tabs: [userTab] }],
  ]);
  const tabs = new Map([[10, userTab]]);
  const calls = {
    tabMessages: [],
    tabsUpdate: [],
    windowsCreate: [],
    windowsRemove: [],
    windowsUpdate: [],
  };
  let nextWindowId = 20;
  let nextTabId = 200;
  const tabUpdatedListeners = new Set();
  const tabRemovedListeners = new Set();
  const queuedMessageResponses = [...messageResponses];

  function callbackResult(value, callback) {
    queueMicrotask(() => callback(value));
  }

  const chrome = {
    runtime: { lastError: null },
    storage: {
      local: {
        async get(key) {
          if (Array.isArray(key)) {
            return Object.fromEntries(
              key.map((entry) => [entry, structuredClone(storage[entry])]),
            );
          }
          return { [key]: structuredClone(storage[key]) };
        },
        async set(values) {
          Object.assign(storage, structuredClone(values));
        },
        async remove(keys) {
          for (const key of Array.isArray(keys) ? keys : [keys]) {
            delete storage[key];
          }
        },
      },
    },
    windows: {
      create(properties, callback) {
        calls.windowsCreate.push(structuredClone(properties));
        const windowId = nextWindowId++;
        const tabId = nextTabId++;
        const tab = {
          id: tabId,
          windowId,
          active: true,
          status: 'complete',
          url: properties.url,
        };
        const created = { id: windowId, type: 'normal', tabs: [tab] };
        windows.set(windowId, created);
        tabs.set(tabId, tab);
        callbackResult(structuredClone(created), callback);
      },
      get(windowId, options, callback) {
        const window = windows.get(windowId);
        callbackResult(window ? structuredClone(window) : undefined, callback);
      },
      remove(windowId, callback) {
        calls.windowsRemove.push(windowId);
        const window = windows.get(windowId);
        for (const tab of window?.tabs || []) tabs.delete(tab.id);
        windows.delete(windowId);
        callbackResult(undefined, callback);
      },
      update(windowId, properties, callback) {
        calls.windowsUpdate.push({ windowId, properties });
        callbackResult(windows.get(windowId), callback);
      },
    },
    tabs: {
      onRemoved: {
        addListener(listener) {
          tabRemovedListeners.add(listener);
        },
        removeListener(listener) {
          tabRemovedListeners.delete(listener);
        },
      },
      onUpdated: {
        addListener(listener) {
          tabUpdatedListeners.add(listener);
        },
        removeListener(listener) {
          tabUpdatedListeners.delete(listener);
        },
      },
      get(tabId, callback) {
        callbackResult(structuredClone(tabs.get(tabId)), callback);
      },
      query(query, callback) {
        callbackResult(
          [...tabs.values()].filter((tab) => tab.windowId === query.windowId),
          callback,
        );
      },
      update(tabId, properties, callback) {
        calls.tabsUpdate.push({ tabId, properties: structuredClone(properties) });
        const current = tabs.get(tabId);
        if (current) Object.assign(current, properties);
        callbackResult(structuredClone(current), callback);
      },
      sendMessage(tabId, message, callback) {
        calls.tabMessages.push({ tabId, message: structuredClone(message) });
        const response = queuedMessageResponses.shift();
        if (response?.stall === true) return;
        callbackResult(structuredClone(response), callback);
      },
    },
  };

  return { calls, chrome, storage, tabs, windows };
}

function loadHelper(fake, options = {}) {
  const context = vm.createContext({
    chrome: fake.chrome,
    clearTimeout,
    console,
    queueMicrotask,
    setTimeout,
    structuredClone,
  });
  vm.runInContext(fs.readFileSync(helperPath, 'utf8'), context, {
    filename: helperPath,
  });
  return context.KidItemCollectionWindow.create({
    chrome: fake.chrome,
    storageKey: 'owned-window',
    ...options,
  });
}

test('creates one unfocused extension-owned window and navigates its active tab sequentially', async () => {
  const fake = createFakeChrome();
  const helper = loadHelper(fake);

  const owned = await helper.getOrCreate('run-a', 'https://example.com/first');
  await helper.navigate('run-a', 'https://example.com/second');
  await helper.navigate('run-a', 'https://example.com/third');

  assert.deepEqual(fake.calls.windowsCreate, [
    {
      url: 'https://example.com/first',
      focused: false,
      type: 'normal',
    },
  ]);
  assert.deepEqual(
    fake.calls.tabsUpdate.map(({ tabId, properties }) => ({ tabId, properties })),
    [
      {
        tabId: owned.tabId,
        properties: { url: 'https://example.com/second', active: true },
      },
      {
        tabId: owned.tabId,
        properties: { url: 'https://example.com/third', active: true },
      },
    ],
  );
  assert.equal(fake.calls.windowsUpdate.length, 0);
  assert.equal(fake.calls.windowsCreate.length, 1);
  assert.equal(fake.tabs.get(10).active, true);
  assert.equal(
    fake.tabs.get(10).url,
    'http://localhost:3000/product-pipeline/registered-products',
  );
});

test('reattaches a live owned tab after a worker reload and rejects another run', async () => {
  const fake = createFakeChrome();
  const first = loadHelper(fake);
  const owned = await first.getOrCreate('run-a', 'https://example.com/first');

  const reloaded = loadHelper(fake);
  assert.deepEqual(
    JSON.parse(JSON.stringify(await reloaded.reattach('run-a'))),
    JSON.parse(JSON.stringify(owned)),
  );
  assert.equal(fake.calls.windowsCreate.length, 1);
  await assert.rejects(
    reloaded.getOrCreate('run-b', 'https://example.com/other'),
    /another collection run requires attention/i,
  );
});

test('serializes concurrent executions and closes only the owning run window', async () => {
  const fake = createFakeChrome();
  const helper = loadHelper(fake);
  const order = [];
  let releaseFirst;
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });

  const first = helper.runExclusive(async () => {
    order.push('first:start');
    await firstGate;
    order.push('first:end');
  });
  const second = helper.runExclusive(async () => {
    order.push('second:start');
    order.push('second:end');
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(order, ['first:start']);
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(order, [
    'first:start',
    'first:end',
    'second:start',
    'second:end',
  ]);

  await helper.getOrCreate('run-a', 'https://example.com/first');
  assert.equal(await helper.close('run-b'), false);
  assert.equal(fake.calls.windowsRemove.length, 0);
  assert.equal(await helper.close('run-a'), true);
  assert.equal(fake.calls.windowsRemove.length, 1);
  assert.equal(fake.storage['owned-window'], undefined);
});

test('resumes an interrupted campaign sweep in the same owned tab', async () => {
  const fake = createFakeChrome({}, [
    {
      success: false,
      resumeRequired: true,
      resumeUrl: 'https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1',
      error: 'dashboard resume required',
    },
    {
      success: true,
      type: 'ad_sync',
      count: 4,
      progress: {
        current: 11,
        total: 10,
        completed: 10,
        failed: 1,
        label: '광고 동기화 완료',
      },
    },
  ]);
  const sessionCalls = [];
  const scrapedIds = [];
  const sessions = {
    async attachTab(runId, tab) {
      sessionCalls.push(['attachTab', runId, tab]);
    },
    async cancel(runId) {
      sessionCalls.push(['cancel', runId]);
    },
    async fail(runId) {
      sessionCalls.push(['fail', runId]);
    },
    async get() {
      return { status: 'running' };
    },
    async progress(runId, progress) {
      sessionCalls.push(['progress', runId, progress]);
    },
    async requireAttention(runId, attention) {
      sessionCalls.push(['requireAttention', runId, attention]);
    },
    async succeed(runId) {
      sessionCalls.push(['succeed', runId]);
    },
  };
  const helper = loadHelper(fake, {
    cancelKey: 'collection-cancel',
    delay: async () => {},
    markScraped: async (id) => scrapedIds.push(id),
    sessions,
    statusKey: 'collection-status',
  });

  const result = await helper.collectTargets({
    producer: 'advertising.ad_sync',
    runId: 'run-resume',
    startedAt: 1,
    targets: [
      {
        id: 'ads',
        label: '광고 동기화',
        url: 'https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1',
      },
    ],
  });

  assert.equal(result.success, true);
  assert.equal(result.completed, 1);
  assert.equal(result.failed, 0);
  assert.deepEqual(scrapedIds, ['ads']);
  assert.equal(fake.calls.tabMessages.length, 2);
  assert.deepEqual(
    fake.calls.tabMessages.map(({ message }) => message),
    [
      { action: 'manualSync', collectionRunId: 'run-resume' },
      { action: 'manualSync', collectionRunId: 'run-resume' },
    ],
  );
  assert.equal(fake.calls.tabsUpdate.length, 2);
  assert.ok(sessionCalls.some(([name, runId]) => name === 'succeed' && runId === 'run-resume'));
  assert.ok(!sessionCalls.some(([name]) => name === 'fail'));
  const reportedProgress = sessionCalls
    .filter(([name]) => name === 'progress')
    .map(([, , progress]) => progress);
  assert.deepEqual(JSON.parse(JSON.stringify(reportedProgress)), [
    {
      current: 11,
      total: 11,
      completed: 10,
      failed: 1,
      label: '광고 동기화 완료',
    },
  ]);
  assert.ok(
    reportedProgress.every((progress) => !(progress.current === 1 && progress.total === 1)),
    'outer URL-target progress must not overwrite campaign progress with 1/1',
  );
});

test('content-script timeout matches the 30 minute web collection budget', () => {
  const helperSource = fs.readFileSync(helperPath, 'utf8');

  assert.match(helperSource, /CONTENT_SCRIPT_TIMEOUT_MS\s*=\s*30\s*\*\s*60\s*\*\s*1000/);
  assert.match(
    helperSource,
    /contentScriptTimeoutMs[\s\S]*?:\s*CONTENT_SCRIPT_TIMEOUT_MS/,
  );
  assert.match(helperSource, /sendTabMessage\(tabId, message, timeoutMs\s*=\s*contentScriptTimeoutMs\)/);
  assert.match(helperSource, /let tab\s*=\s*await navigate/);
});

test('campaign progress clamps invalid values and never decreases', () => {
  const fake = createFakeChrome();
  const helper = loadHelper(fake);
  const normalized = helper.normalizeProgress(
    {
      current: 3,
      total: 2,
      completed: Number.POSITIVE_INFINITY,
      failed: -4,
      label: 'next',
    },
    {
      current: 5,
      total: 11,
      completed: 4,
      failed: 1,
      label: 'previous',
    },
  );

  assert.deepEqual(JSON.parse(JSON.stringify(normalized)), {
    current: 5,
    total: 11,
    completed: 4,
    failed: 1,
    label: 'next',
  });
  assert.ok(normalized.current <= normalized.total);
});

test('content-script timeout actually fails a stalled target', async () => {
  const fake = createFakeChrome({}, [{ stall: true }]);
  const sessionCalls = [];
  const sessions = {
    async attachTab() {},
    async cancel(runId) {
      sessionCalls.push(['cancel', runId]);
    },
    async fail(runId) {
      sessionCalls.push(['fail', runId]);
    },
    async get() {
      return { status: 'running' };
    },
    async progress() {},
    async requireAttention() {},
    async succeed(runId) {
      sessionCalls.push(['succeed', runId]);
    },
  };
  const helper = loadHelper(fake, {
    cancelKey: 'collection-cancel',
    contentScriptTimeoutMs: 5,
    delay: async () => {},
    sessions,
    statusKey: 'collection-status',
  });

  const result = await helper.collectTargets({
    producer: 'advertising.scrape_targets',
    runId: 'run-timeout',
    startedAt: 1,
    targets: [
      {
        id: 'stalled-ads',
        label: 'stalled ad report',
        url: 'https://advertising.coupang.com/marketing/dashboard/sales#targetDate=2026-07-17',
      },
    ],
  });

  assert.equal(result.success, false);
  assert.equal(result.failed, 1);
  assert.match(result.error, /timed out after 0s/i);
  assert.ok(sessionCalls.some(([name, runId]) => name === 'fail' && runId === 'run-timeout'));
  assert.ok(!sessionCalls.some(([name]) => name === 'succeed'));
});

// Regression: 백그라운드 수집 실패가 조용히 성공처럼 보이던 경로.
//
// advertising.ad_sync 는 preservesContentProgress 라서 content script 가 준
// progress 만 세션에 썼다. content script 가 사라지거나 sendTabMessage 가
// 타임아웃하면 progress 가 없어 두 분기 모두 건너뛰었고, sessions.fail() 은
// status 만 바꾸므로 label 에는 직전 성공 문구가 그대로 남았다. 웹 UI 는 그
// label 을 toast.error 로 띄우기 때문에 사용자는 실패 사유 대신 "광고 동기화
// 완료" 같은 문구를 봤다. 실제 사유는 chrome.storage.local 의 batch status 에만
// 적혔고 웹은 그 키를 읽지 않는다.
test('a background collection failure reports its real reason instead of a stale success label', async () => {
  const fake = createFakeChrome({}, [
    // content script 가 응답하지 않는다(=백그라운드 창에서 흔한 실패 모양).
    { success: false, error: 'Collection content script timed out after 1800s' },
  ]);
  const sessionCalls = [];
  const sessions = {
    async attachTab(runId, tab) {
      sessionCalls.push(['attachTab', runId, tab]);
    },
    async cancel(runId) {
      sessionCalls.push(['cancel', runId]);
    },
    async fail(runId) {
      sessionCalls.push(['fail', runId]);
    },
    async get() {
      return { status: 'running' };
    },
    async progress(runId, progress) {
      sessionCalls.push(['progress', runId, progress]);
    },
    async requireAttention(runId, attention) {
      sessionCalls.push(['requireAttention', runId, attention]);
    },
    async succeed(runId) {
      sessionCalls.push(['succeed', runId]);
    },
  };
  const helper = loadHelper(fake, {
    cancelKey: 'collection-cancel',
    delay: async () => {},
    sessions,
    statusKey: 'collection-status',
  });

  const result = await helper.collectTargets({
    producer: 'advertising.ad_sync',
    runId: 'run-bg-fail',
    startedAt: 1,
    targets: [
      {
        id: 'ads',
        label: '광고 동기화',
        url: 'https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1',
      },
    ],
  });

  // 실패는 실패로 보고된다.
  assert.equal(result.success, false);
  assert.equal(result.failed, 1);
  assert.equal(result.completed, 0);
  assert.ok(sessionCalls.some(([name]) => name === 'fail'));
  assert.ok(!sessionCalls.some(([name]) => name === 'succeed'));

  // 그리고 사유가 세션 progress 의 label 로 올라간다.
  const labels = sessionCalls
    .filter(([name]) => name === 'progress')
    .map(([, , progress]) => progress?.label);
  assert.ok(
    labels.includes('Collection content script timed out after 1800s'),
    `실패 사유가 progress label 에 없다: ${JSON.stringify(labels)}`,
  );
  // 성공 문구가 마지막 label 로 남아서는 안 된다.
  assert.notEqual(labels.at(-1), '광고 동기화 완료');
});
