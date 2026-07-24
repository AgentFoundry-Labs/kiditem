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
    tabsDuplicate: [],
    tabsRemove: [],
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
        let tab;
        if (Number.isInteger(properties.tabId)) {
          tab = tabs.get(properties.tabId);
          const previousWindow = windows.get(tab?.windowId);
          if (previousWindow) {
            previousWindow.tabs = previousWindow.tabs.filter(
              (candidate) => candidate.id !== properties.tabId,
            );
            const previousActive = previousWindow.tabs.find(
              (candidate) => candidate.id === tab?.previousActiveTabId,
            );
            if (previousActive) previousActive.active = true;
          }
          if (tab) {
            delete tab.previousActiveTabId;
            tab.windowId = windowId;
            tab.active = true;
          }
        } else {
          const tabId = nextTabId++;
          tab = {
            id: tabId,
            windowId,
            active: true,
            status: 'complete',
            url: properties.url,
          };
          tabs.set(tabId, tab);
        }
        const created = { id: windowId, type: 'normal', tabs: [tab] };
        windows.set(windowId, created);
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
      duplicate(tabId, callback) {
        calls.tabsDuplicate.push(tabId);
        const source = tabs.get(tabId);
        const sourceWindow = windows.get(source?.windowId);
        const previousActiveTabId = sourceWindow?.tabs.find(
          (candidate) => candidate.active,
        )?.id;
        for (const candidate of sourceWindow?.tabs || []) {
          candidate.active = false;
        }
        const duplicate = source
          ? {
            ...structuredClone(source),
            id: nextTabId++,
            active: true,
            previousActiveTabId,
          }
          : undefined;
        if (duplicate) {
          tabs.set(duplicate.id, duplicate);
          windows.get(duplicate.windowId)?.tabs.push(duplicate);
        }
        callbackResult(structuredClone(duplicate), callback);
      },
      query(query, callback) {
        const queriedTabs = [...tabs.values()].filter((tab) => {
          if (Number.isInteger(query.windowId) && tab.windowId !== query.windowId) {
            return false;
          }
          if (query.url) {
            const patterns = Array.isArray(query.url) ? query.url : [query.url];
            return patterns.some((pattern) => {
              const expression = new RegExp(
                `^${pattern
                  .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
                  .replaceAll('*', '.*')}$`,
              );
              return expression.test(tab.url || '');
            });
          }
          return true;
        });
        callbackResult(
          queriedTabs,
          callback,
        );
      },
      remove(tabId, callback) {
        calls.tabsRemove.push(tabId);
        const tab = tabs.get(tabId);
        const window = windows.get(tab?.windowId);
        if (window) {
          window.tabs = window.tabs.filter((candidate) => candidate.id !== tabId);
        }
        tabs.delete(tabId);
        callbackResult(undefined, callback);
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
        if (response?.runtimeError) {
          queueMicrotask(() => {
            chrome.runtime.lastError = { message: response.runtimeError };
            callback(undefined);
            chrome.runtime.lastError = null;
          });
          return;
        }
        callbackResult(structuredClone(response), callback);
      },
    },
  };

  return { calls, chrome, storage, tabs, windows };
}

function loadHelper(fake, options = {}) {
  const context = vm.createContext({
    URL,
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

test('ad sync clones an authenticated advertising tab into the owned window without changing the original', async () => {
  const fake = createFakeChrome();
  const authenticatedTab = {
    id: 11,
    windowId: 1,
    active: true,
    status: 'complete',
    url: 'https://advertising.coupang.com/marketing/dashboard/sales',
  };
  fake.tabs.get(10).active = false;
  fake.tabs.set(authenticatedTab.id, authenticatedTab);
  fake.windows.get(1).tabs.push(authenticatedTab);
  const helper = loadHelper(fake);

  const owned = await helper.getOrCreate(
    'run-ad-sync',
    'https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1',
    'advertising.ad_sync',
  );

  assert.deepEqual(fake.calls.tabsDuplicate, [authenticatedTab.id]);
  assert.notEqual(owned.tabId, authenticatedTab.id);
  assert.deepEqual(fake.calls.windowsCreate, [
    {
      tabId: owned.tabId,
      focused: false,
      type: 'normal',
    },
  ]);
  assert.equal(fake.tabs.get(authenticatedTab.id).windowId, 1);
  assert.equal(fake.tabs.get(authenticatedTab.id).active, true);
  assert.equal(
    fake.tabs.get(authenticatedTab.id).url,
    'https://advertising.coupang.com/marketing/dashboard/sales',
  );
  assert.equal(fake.tabs.get(owned.tabId).windowId, owned.windowId);

  assert.equal(await helper.close('run-ad-sync'), true);
  assert.deepEqual(fake.calls.windowsRemove, [owned.windowId]);
  assert.equal(fake.tabs.has(owned.tabId), false);
  assert.equal(fake.tabs.has(authenticatedTab.id), true);
  assert.equal(fake.windows.has(1), true);
});

test('ad sync cancellation closes only the managed clone and preserves the authenticated user tab', async () => {
  const fake = createFakeChrome();
  const authenticatedTab = {
    id: 11,
    windowId: 1,
    active: true,
    status: 'complete',
    url: 'https://advertising.coupang.com/marketing/dashboard/sales',
  };
  fake.tabs.get(10).active = false;
  fake.tabs.set(authenticatedTab.id, authenticatedTab);
  fake.windows.get(1).tabs.push(authenticatedTab);
  const sessionCalls = [];
  const helper = loadHelper(fake, {
    cancelKey: 'collection-cancel',
    sessions: {
      async cancel(runId) {
        sessionCalls.push(['cancel', runId]);
      },
    },
    statusKey: 'collection-status',
  });
  const owned = await helper.getOrCreate(
    'run-ad-sync',
    'https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1',
    'advertising.ad_sync',
  );
  fake.storage['collection-status'] = {
    runId: 'run-ad-sync',
    status: 'running',
  };

  const result = await helper.cancelRun('run-ad-sync');

  assert.equal(result.cancelled, true);
  assert.deepEqual(sessionCalls, [['cancel', 'run-ad-sync']]);
  assert.deepEqual(fake.calls.windowsRemove, [owned.windowId]);
  assert.equal(fake.tabs.has(owned.tabId), false);
  assert.equal(fake.tabs.has(authenticatedTab.id), true);
  assert.equal(fake.tabs.get(authenticatedTab.id).windowId, 1);
  assert.equal(fake.windows.has(1), true);
});

test('ad sync falls back to a fresh owned URL window when no authenticated advertising tab exists', async () => {
  const fake = createFakeChrome();
  const loginTab = {
    id: 11,
    windowId: 1,
    active: true,
    status: 'complete',
    url:
      'https://advertising.coupang.com/user/login?callback_url=' +
      encodeURIComponent(
        'https://advertising.coupang.com/marketing/dashboard/sales',
      ),
  };
  fake.tabs.set(loginTab.id, loginTab);
  fake.windows.get(1).tabs.push(loginTab);
  const helper = loadHelper(fake);

  const owned = await helper.getOrCreate(
    'run-ad-sync',
    'https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1',
    'advertising.ad_sync',
  );

  assert.deepEqual(fake.calls.tabsDuplicate, []);
  assert.deepEqual(fake.calls.windowsCreate, [
    {
      url: 'https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1',
      focused: false,
      type: 'normal',
    },
  ]);
  assert.notEqual(owned.tabId, loginTab.id);
  assert.equal(fake.tabs.has(loginTab.id), true);
});

test('a fresh ad-sync retry replaces its old login attention window with an authenticated clone', async () => {
  const fake = createFakeChrome();
  const authenticatedTab = {
    id: 11,
    windowId: 1,
    active: true,
    status: 'complete',
    url: 'https://advertising.coupang.com/marketing/campaign/104640375/product',
  };
  fake.tabs.get(10).active = false;
  fake.tabs.set(authenticatedTab.id, authenticatedTab);
  fake.windows.get(1).tabs.push(authenticatedTab);
  const sessionCalls = [];
  const sessions = {
    async cancel(runId) {
      sessionCalls.push(['cancel', runId]);
    },
    async detachTab(runId, options) {
      sessionCalls.push(['detachTab', runId, options]);
    },
    async get(runId) {
      if (runId === 'run-attention') {
        return {
          producer: 'advertising.ad_sync',
          status: 'attention_required',
        };
      }
      if (runId === 'run-retry') {
        return {
          producer: 'advertising.ad_sync',
          status: 'running',
        };
      }
      return null;
    },
  };
  const helper = loadHelper(fake, { sessions });
  const loginOwned = await helper.getOrCreate(
    'run-attention',
    'https://advertising.coupang.com/user/login',
  );

  const retryOwned = await helper.getOrCreate(
    'run-retry',
    'https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1',
    'advertising.ad_sync',
  );

  assert.notEqual(retryOwned.windowId, loginOwned.windowId);
  assert.deepEqual(fake.calls.windowsRemove, [loginOwned.windowId]);
  assert.deepEqual(fake.calls.tabsDuplicate, [authenticatedTab.id]);
  assert.equal(fake.tabs.has(authenticatedTab.id), true);
  assert.equal(fake.tabs.get(authenticatedTab.id).windowId, 1);
  assert.equal(fake.tabs.get(loginOwned.tabId), undefined);
  assert.equal(fake.storage['owned-window'].runId, 'run-retry');
  assert.deepEqual(JSON.parse(JSON.stringify(sessionCalls)), [
    [
      'detachTab',
      'run-attention',
      { tabId: loginOwned.tabId, closeManagedTab: false },
    ],
    ['cancel', 'run-attention'],
  ]);
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
    /다른 데이터 수집 작업이 확인 대기 중/,
  );
});

test('a new run reuses an attention window only for the same producer', async () => {
  const fake = createFakeChrome();
  const sessionCalls = [];
  const sessions = {
    async cancel(runId) {
      sessionCalls.push(['cancel', runId]);
    },
    async detachTab(runId, options) {
      sessionCalls.push(['detachTab', runId, options]);
    },
    async get(runId) {
      if (runId === 'run-attention') {
        return {
          producer: 'advertising.ad_sync',
          status: 'attention_required',
        };
      }
      if (runId === 'run-retry') {
        return {
          producer: 'advertising.ad_sync',
          status: 'running',
        };
      }
      return null;
    },
  };
  const helper = loadHelper(fake, { sessions });
  const owned = await helper.getOrCreate(
    'run-attention',
    'https://advertising.coupang.com/marketing/dashboard/sales',
  );

  const adopted = await helper.getOrCreate(
    'run-retry',
    'https://advertising.coupang.com/marketing/dashboard/sales',
    'advertising.ad_sync',
  );

  assert.equal(adopted.windowId, owned.windowId);
  assert.equal(adopted.tabId, owned.tabId);
  assert.equal(adopted.runId, 'run-retry');
  assert.equal(fake.calls.windowsCreate.length, 1);
  assert.equal(fake.storage['owned-window'].runId, 'run-retry');
  assert.deepEqual(JSON.parse(JSON.stringify(sessionCalls)), [
    [
      'detachTab',
      'run-attention',
      { tabId: owned.tabId, closeManagedTab: false },
    ],
    ['cancel', 'run-attention'],
  ]);
});

test('does not take over an attention window owned by another producer', async () => {
  const fake = createFakeChrome();
  const sessions = {
    async get(runId) {
      if (runId === 'run-attention') {
        return {
          producer: 'channels.coupang_catalog',
          status: 'attention_required',
        };
      }
      if (runId === 'run-ads') {
        return {
          producer: 'advertising.ad_sync',
          status: 'running',
        };
      }
      return null;
    },
  };
  const helper = loadHelper(fake, { sessions });
  await helper.getOrCreate(
    'run-attention',
    'https://wing.coupang.com/tenants/seller-web/vendor-inventory',
  );

  await assert.rejects(
    helper.getOrCreate(
      'run-ads',
      'https://advertising.coupang.com/marketing/dashboard/sales',
      'advertising.ad_sync',
    ),
    /다른 데이터 수집 작업이 확인 대기 중/,
  );
  assert.equal(fake.storage['owned-window'].runId, 'run-attention');
  assert.equal(fake.calls.windowsCreate.length, 1);
});

test('does not take over a running window even for the same producer', async () => {
  const fake = createFakeChrome();
  const sessions = {
    async get(runId) {
      if (runId === 'run-active') {
        return {
          producer: 'advertising.ad_sync',
          status: 'running',
        };
      }
      if (runId === 'run-retry') {
        return {
          producer: 'advertising.ad_sync',
          status: 'running',
        };
      }
      return null;
    },
  };
  const helper = loadHelper(fake, { sessions });
  await helper.getOrCreate(
    'run-active',
    'https://advertising.coupang.com/marketing/dashboard/sales',
  );

  await assert.rejects(
    helper.getOrCreate(
      'run-retry',
      'https://advertising.coupang.com/marketing/dashboard/sales',
      'advertising.ad_sync',
    ),
    /다른 데이터 수집 작업이 확인 대기 중/,
  );
  assert.equal(fake.storage['owned-window'].runId, 'run-active');
  assert.equal(fake.calls.windowsCreate.length, 1);
});

test('does not transfer an attention window to an already cancelled retry', async () => {
  const fake = createFakeChrome();
  const sessionCalls = [];
  const sessions = {
    async cancel(runId) {
      sessionCalls.push(['cancel', runId]);
    },
    async detachTab(runId, options) {
      sessionCalls.push(['detachTab', runId, options]);
    },
    async get(runId) {
      if (runId === 'run-attention') {
        return {
          producer: 'advertising.ad_sync',
          status: 'attention_required',
        };
      }
      if (runId === 'run-cancelled') {
        return {
          producer: 'advertising.ad_sync',
          status: 'cancelled',
        };
      }
      return null;
    },
  };
  const helper = loadHelper(fake, { sessions });
  await helper.getOrCreate(
    'run-attention',
    'https://advertising.coupang.com/marketing/dashboard/sales',
  );

  await assert.rejects(
    helper.getOrCreate(
      'run-cancelled',
      'https://advertising.coupang.com/marketing/dashboard/sales',
      'advertising.ad_sync',
    ),
    /이미 중단되거나 종료된 데이터 수집 작업/,
  );
  assert.equal(fake.storage['owned-window'].runId, 'run-attention');
  assert.deepEqual(sessionCalls, []);
});

test('recovers a live window record left behind by a terminal owner', async () => {
  const fake = createFakeChrome();
  const sessionCalls = [];
  const sessions = {
    async detachTab(runId, options) {
      sessionCalls.push(['detachTab', runId, options]);
    },
    async get(runId) {
      if (runId === 'run-terminal') {
        return {
          producer: 'advertising.ad_sync',
          status: 'cancelled',
        };
      }
      if (runId === 'run-next') {
        return {
          producer: 'advertising.ad_sync',
          status: 'running',
        };
      }
      return null;
    },
  };
  const helper = loadHelper(fake, { sessions });
  const owned = await helper.getOrCreate(
    'run-terminal',
    'https://advertising.coupang.com/marketing/dashboard/sales',
  );

  const recovered = await helper.getOrCreate(
    'run-next',
    'https://advertising.coupang.com/marketing/dashboard/sales',
    'advertising.ad_sync',
  );

  assert.equal(recovered.windowId, owned.windowId);
  assert.equal(recovered.tabId, owned.tabId);
  assert.equal(recovered.runId, 'run-next');
  assert.equal(fake.storage['owned-window'].runId, 'run-next');
  assert.equal(fake.calls.windowsCreate.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(sessionCalls)), [
    [
      'detachTab',
      'run-terminal',
      { tabId: owned.tabId, closeManagedTab: false },
    ],
  ]);
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

test('cancels an older attention run without overwriting a newer batch status', async () => {
  const fake = createFakeChrome();
  const sessionCalls = [];
  const sessions = {
    async cancel(runId) {
      sessionCalls.push(['cancel', runId]);
    },
  };
  const helper = loadHelper(fake, {
    cancelKey: 'collection-cancel',
    sessions,
    statusKey: 'collection-status',
  });
  const owned = await helper.getOrCreate(
    'run-attention',
    'https://advertising.coupang.com/marketing/dashboard/sales',
  );
  fake.storage['collection-status'] = {
    runId: 'run-newer',
    status: 'error',
    error: 'newer run failed',
    endedAt: 2,
  };

  const result = await helper.cancelRun('run-attention');

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    success: true,
    cancelled: true,
    runId: 'run-attention',
  });
  assert.deepEqual(sessionCalls, [['cancel', 'run-attention']]);
  assert.deepEqual(fake.calls.windowsRemove, [owned.windowId]);
  assert.equal(fake.storage['owned-window'], undefined);
  assert.equal(fake.storage['collection-cancel'], undefined);
  assert.deepEqual(fake.storage['collection-status'], {
    runId: 'run-newer',
    status: 'error',
    error: 'newer run failed',
    endedAt: 2,
  });
});

test('marks the matching active batch cancelled and closes its owned window', async () => {
  const fake = createFakeChrome();
  const sessionCalls = [];
  const sessions = {
    async cancel(runId) {
      sessionCalls.push(['cancel', runId]);
    },
  };
  const helper = loadHelper(fake, {
    cancelKey: 'collection-cancel',
    sessions,
    statusKey: 'collection-status',
  });
  const owned = await helper.getOrCreate(
    'run-active',
    'https://advertising.coupang.com/marketing/dashboard/sales',
  );
  fake.storage['collection-status'] = {
    runId: 'run-active',
    status: 'running',
    startedAt: 1,
  };

  const result = await helper.cancelRun('run-active');

  assert.equal(result.cancelled, true);
  assert.deepEqual(sessionCalls, [['cancel', 'run-active']]);
  assert.deepEqual(fake.calls.windowsRemove, [owned.windowId]);
  assert.deepEqual(fake.storage['collection-cancel'], {
    cancelled: true,
    runId: 'run-active',
    requestedAt: fake.storage['collection-cancel'].requestedAt,
  });
  assert.equal(fake.storage['collection-status'].runId, 'run-active');
  assert.equal(fake.storage['collection-status'].status, 'cancelled');
  assert.equal(fake.storage['collection-status'].cancelled, true);
  assert.equal(typeof fake.storage['collection-status'].endedAt, 'number');
});

test('late login response cannot restore attention after cancellation', async () => {
  const fake = createFakeChrome({}, [
    {
      success: false,
      pendingLogin: true,
      error: '쿠팡 광고센터 로그인이 필요합니다.',
    },
  ]);
  const sessionCalls = [];
  let cancellationReads = 0;
  const sessions = {
    async attachTab() {},
    async cancel(runId) {
      sessionCalls.push(['cancel', runId]);
    },
    async fail(runId) {
      sessionCalls.push(['fail', runId]);
    },
    async get() {
      cancellationReads += 1;
      return {
        status: cancellationReads >= 2 ? 'cancelled' : 'running',
      };
    },
    async progress(runId, progress) {
      sessionCalls.push(['progress', runId, progress]);
    },
    async requireAttention(runId) {
      sessionCalls.push(['requireAttention', runId]);
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
    runId: 'run-cancel-race',
    startedAt: 1,
    targets: [
      {
        id: 'ads',
        label: '광고 동기화',
        url: 'https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1',
      },
    ],
  });

  assert.equal(result.cancelled, true);
  assert.equal(result.attentionRequired, false);
  assert.equal(result.error, null);
  assert.ok(
    sessionCalls.some(
      ([name, runId]) => name === 'cancel' && runId === 'run-cancel-race',
    ),
  );
  assert.ok(!sessionCalls.some(([name]) => name === 'requireAttention'));
  assert.ok(!sessionCalls.some(([name]) => name === 'fail'));
  assert.ok(!sessionCalls.some(([name]) => name === 'succeed'));
  assert.equal(fake.storage['collection-status'].status, 'cancelled');
  assert.equal(fake.storage['collection-status'].cancelled, true);
});

test('retries manual sync across receiver startup and campaign-page navigation', async () => {
  const missingReceiver =
    'Could not establish connection. Receiving end does not exist.';
  const navigationClosedChannel =
    'A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received';
  const fake = createFakeChrome({}, [
    { runtimeError: missingReceiver },
    { runtimeError: navigationClosedChannel },
    {
      success: true,
      type: 'ad_sync',
      count: 4,
      progress: {
        current: 4,
        total: 4,
        completed: 4,
        failed: 0,
        label: '광고 동기화 완료',
      },
    },
  ]);
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
      return { status: 'running', attempt: 4 };
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
    runId: 'run-content-ready',
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
  assert.equal(fake.calls.tabMessages.length, 3);
  assert.equal(fake.calls.tabsUpdate.length, 2);
  assert.equal(
    fake.calls.tabsUpdate[1].properties.url,
    'https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1',
  );
  assert.deepEqual(
    fake.calls.tabMessages.map(({ message }) => message),
    Array.from({ length: 3 }, () => ({
      action: 'manualSync',
      collectionRunId: 'run-content-ready',
      collectionAttempt: 4,
    })),
  );
  assert.ok(
    sessionCalls.some(
      ([name, runId]) => name === 'succeed' && runId === 'run-content-ready',
    ),
  );
  assert.ok(!sessionCalls.some(([name]) => name === 'fail'));
});

test('retries a fail-closed busy admission with the same run and attempt', async () => {
  const fake = createFakeChrome({}, [
    {
      success: false,
      retryable: true,
      error: 'ad_sync_already_running',
    },
    {
      success: false,
      retryable: true,
      error: 'ad_sync_already_running',
    },
    {
      success: true,
      type: 'ad_sync',
      progress: {
        current: 31,
        total: 31,
        completed: 1,
        failed: 0,
        label: '광고 동기화 완료',
      },
    },
  ]);
  const sessionCalls = [];
  const sessions = {
    async attachTab() {},
    async cancel() {},
    async fail(runId) {
      sessionCalls.push(['fail', runId]);
    },
    async get() {
      return { status: 'running', attempt: 3 };
    },
    async progress() {},
    async requireAttention() {},
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
    runId: 'run-busy-admission',
    startedAt: 1,
    targets: [{
      id: 'ads',
      label: '광고 동기화',
      url: 'https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1',
    }],
  });

  assert.equal(result.success, true);
  assert.equal(fake.calls.tabMessages.length, 3);
  assert.ok(
    fake.calls.tabMessages.every(
      ({ message }) =>
        message.collectionRunId === 'run-busy-admission' &&
        message.collectionAttempt === 3,
    ),
  );
  assert.ok(
    sessionCalls.some(
      ([name, runId]) =>
        name === 'succeed' && runId === 'run-busy-admission',
    ),
  );
  assert.ok(!sessionCalls.some(([name]) => name === 'fail'));
});

test('keeps resuming hard dashboard returns while persisted campaign progress advances', async () => {
  const navigationClosedChannel =
    'A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received';
  const fake = createFakeChrome({}, [
    ...Array.from({ length: 5 }, () => ({
      runtimeError: navigationClosedChannel,
    })),
    {
      success: true,
      type: 'ad_sync',
      count: 6,
      progress: {
        current: 6,
        total: 6,
        completed: 6,
        failed: 0,
        label: '광고 동기화 완료',
      },
    },
  ]);
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
      const completed = Math.min(fake.calls.tabMessages.length, 5);
      return {
        status: 'running',
        progress: {
          current: completed,
          total: 6,
          completed,
          failed: 0,
          label: `캠페인 ${completed} 저장 완료`,
        },
      };
    },
    async progress(runId, progress) {
      sessionCalls.push(['progress', runId, progress]);
    },
    async requireAttention() {},
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
  const targetUrl =
    'https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1';

  const result = await helper.collectTargets({
    producer: 'advertising.ad_sync',
    runId: 'run-hard-dashboard-returns',
    startedAt: 1,
    targets: [{ id: 'ads', label: '광고 동기화', url: targetUrl }],
  });

  assert.equal(result.success, true);
  assert.equal(fake.calls.tabMessages.length, 6);
  assert.equal(fake.calls.tabsUpdate.length, 6);
  assert.ok(
    fake.calls.tabsUpdate.every(({ properties }) => properties.url === targetUrl),
  );
  assert.ok(
    sessionCalls.some(
      ([name, runId]) =>
        name === 'succeed' && runId === 'run-hard-dashboard-returns',
    ),
  );
  assert.ok(!sessionCalls.some(([name]) => name === 'fail'));
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
        label: '광고 동기화 완료 · 1개는 식별자 없어 원본만 보존',
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
      {
        action: 'manualSync',
        collectionRunId: 'run-resume',
        collectionAttempt: 1,
      },
      {
        action: 'manualSync',
        collectionRunId: 'run-resume',
        collectionAttempt: 1,
      },
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
      label: '광고 동기화 완료 · 1개는 식별자 없어 원본만 보존',
    },
  ]);
  assert.ok(
    reportedProgress.every((progress) => !(progress.current === 1 && progress.total === 1)),
    'outer URL-target progress must not overwrite campaign progress with 1/1',
  );
});

test('keeps resuming beyond three returns while campaign progress advances', async () => {
  const resumeUrl =
    'https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1';
  const fake = createFakeChrome({}, [
    ...Array.from({ length: 5 }, (_, index) => ({
      success: false,
      resumeRequired: true,
      resumeUrl,
      synced: index + 1,
      failed: 0,
      totalRows: (index + 1) * 10,
      progress: {
        current: index + 1,
        total: 9,
        completed: index + 1,
        failed: 0,
        label: `캠페인 ${index + 1}`,
      },
    })),
    {
      success: true,
      type: 'ad_sync',
      count: 60,
      progress: {
        current: 6,
        total: 6,
        completed: 6,
        failed: 0,
        label: '광고 동기화 완료',
      },
    },
  ]);
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
    async progress(runId, progress) {
      sessionCalls.push(['progress', runId, progress]);
    },
    async requireAttention() {},
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
    runId: 'run-many-resumes',
    startedAt: 1,
    targets: [
      {
        id: 'ads',
        label: '광고 동기화',
        url: resumeUrl,
      },
    ],
  });

  assert.equal(result.success, true);
  assert.equal(fake.calls.tabMessages.length, 6);
  assert.equal(fake.calls.tabsUpdate.length, 6);
  assert.ok(
    sessionCalls.some(
      ([name, runId]) => name === 'succeed' && runId === 'run-many-resumes',
    ),
  );
});

test('date-work progress keeps a bounded 31-day sweep resumable before a campaign completes', async () => {
  const resumeUrl =
    'https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1';
  const fake = createFakeChrome({}, [
    ...[12, 24, 36, 48].map((current) => ({
      success: false,
      resumeRequired: true,
      resumeUrl,
      synced: 0,
      failed: 0,
      totalRows: 0,
      progress: {
        current,
        total: 62,
        completed: 0,
        failed: 0,
        label: `첫 캠페인 ${current}개 날짜 작업`,
      },
    })),
    {
      success: true,
      type: 'ad_sync',
      progress: {
        current: 62,
        total: 62,
        completed: 2,
        failed: 0,
        label: '광고 동기화 완료',
      },
    },
  ]);
  const sessionCalls = [];
  const sessions = {
    async attachTab() {},
    async cancel() {},
    async fail(runId) {
      sessionCalls.push(['fail', runId]);
    },
    async get() {
      return { status: 'running' };
    },
    async progress(runId, progress) {
      sessionCalls.push(['progress', runId, progress]);
    },
    async requireAttention() {},
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
    runId: 'run-date-work-resume',
    startedAt: 1,
    targets: [{ id: 'ads', label: '광고 동기화', url: resumeUrl }],
  });

  assert.equal(result.success, true);
  assert.equal(fake.calls.tabMessages.length, 5);
  assert.ok(
    sessionCalls.some(
      ([name, runId]) =>
        name === 'succeed' && runId === 'run-date-work-resume',
    ),
  );
  assert.ok(!sessionCalls.some(([name]) => name === 'fail'));
});

test('stops a repeated resume after three attempts without campaign progress', async () => {
  const resumeUrl =
    'https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1';
  const stuckResponse = {
    success: false,
    resumeRequired: true,
    resumeUrl,
    synced: 0,
    failed: 1,
    totalRows: 0,
    progress: {
      current: 1,
      total: 9,
      completed: 0,
      failed: 1,
      label: '같은 캠페인 실패',
    },
  };
  const fake = createFakeChrome({}, Array.from(
    { length: 4 },
    () => structuredClone(stuckResponse),
  ));
  const sessions = {
    async attachTab() {},
    async cancel() {},
    async fail() {},
    async get() {
      return { status: 'running' };
    },
    async progress() {},
    async requireAttention() {},
    async succeed() {},
  };
  const helper = loadHelper(fake, {
    cancelKey: 'collection-cancel',
    delay: async () => {},
    sessions,
    statusKey: 'collection-status',
  });

  const result = await helper.collectTargets({
    producer: 'advertising.ad_sync',
    runId: 'run-stalled-resume',
    startedAt: 1,
    targets: [
      {
        id: 'ads',
        label: '광고 동기화',
        url: resumeUrl,
      },
    ],
  });

  assert.equal(result.success, false);
  assert.equal(result.failed, 1);
  assert.equal(fake.calls.tabMessages.length, 4);
  assert.equal(fake.calls.tabsUpdate.length, 4);
  assert.equal(
    result.error,
    '광고 캠페인 수집이 같은 위치에서 반복되어 중단했습니다.',
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
  assert.match(
    helperSource,
    /MAX_PROGRESSING_RESUME_ATTEMPTS\s*=\s*500/,
  );
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

test('an infrastructure exception is preserved in the failed session label', async () => {
  const fake = createFakeChrome();
  const sessionCalls = [];
  const sessions = {
    async attachTab() {},
    async cancel(runId) {
      sessionCalls.push(['cancel', runId]);
    },
    async fail(runId) {
      sessionCalls.push(['fail', runId]);
    },
    async get(runId) {
      if (runId === 'run-blocking') {
        return {
          producer: 'channels.coupang_catalog',
          status: 'attention_required',
        };
      }
      return {
        producer: 'advertising.ad_sync',
        status: 'running',
        progress: {
          current: 5,
          total: 11,
          completed: 4,
          failed: 1,
          label: null,
        },
      };
    },
    async progress(runId, progress) {
      sessionCalls.push(['progress', runId, progress]);
    },
    async requireAttention() {},
    async succeed() {},
  };
  const helper = loadHelper(fake, {
    cancelKey: 'collection-cancel',
    delay: async () => {},
    sessions,
    statusKey: 'collection-status',
  });
  await helper.getOrCreate(
    'run-blocking',
    'https://wing.coupang.com/tenants/seller-web/vendor-inventory',
  );

  await assert.rejects(
    helper.collectTargets({
      producer: 'advertising.ad_sync',
      runId: 'run-infra-fail',
      startedAt: 1,
      targets: [
        {
          id: 'ads',
          label: '광고 동기화',
          url: 'https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1',
        },
      ],
    }),
    /다른 데이터 수집 작업이 확인 대기 중/,
  );

  const failureProgress = sessionCalls.find(
    ([name, runId]) => name === 'progress' && runId === 'run-infra-fail',
  )?.[2];
  assert.equal(
    failureProgress?.label,
    '다른 데이터 수집 작업이 확인 대기 중입니다. 기존 작업을 완료하거나 중단한 뒤 다시 시도해주세요.',
  );
  assert.equal(failureProgress?.failed, 1);
  assert.equal(failureProgress?.current, 5);
  assert.equal(failureProgress?.total, 11);
  assert.equal(failureProgress?.completed, 4);
  assert.ok(
    sessionCalls.some(
      ([name, runId]) => name === 'fail' && runId === 'run-infra-fail',
    ),
  );
  assert.equal(
    fake.storage['collection-status']?.error,
    '다른 데이터 수집 작업이 확인 대기 중입니다. 기존 작업을 완료하거나 중단한 뒤 다시 시도해주세요.',
  );
  assert.equal(fake.storage['collection-status']?.current, 5);
  assert.equal(fake.storage['collection-status']?.total, 11);
  assert.equal(fake.storage['collection-status']?.completed, 4);
  assert.equal(fake.storage['collection-status']?.failed, 1);
});
