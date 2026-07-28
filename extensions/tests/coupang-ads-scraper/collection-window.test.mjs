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
    events: [],
    tabsCreate: [],
    tabsDuplicate: [],
    tabsReload: [],
    tabsRemove: [],
    tabMessages: [],
    tabsUpdate: [],
    windowsCreate: [],
    windowsRemove: [],
    windowsUpdate: [],
  };
  function currentWindowId() {
    for (const [id, win] of windows) {
      if (win.type === 'normal' && win.focused) return id;
    }
    return [...windows.keys()][0];
  }
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
      create(properties, callback) {
        calls.tabsCreate.push(structuredClone(properties));
        const windowId = Number.isInteger(properties.windowId)
          ? properties.windowId
          : currentWindowId();
        const win = windows.get(windowId);
        const active = properties.active !== false;
        if (active && win) {
          for (const candidate of win.tabs) candidate.active = false;
        }
        const tab = {
          id: nextTabId++,
          windowId,
          active,
          status: 'complete',
          url: properties.url,
        };
        tabs.set(tab.id, tab);
        win?.tabs.push(tab);
        callbackResult(structuredClone(tab), callback);
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
      reload(tabId, _properties, callback) {
        calls.tabsReload.push(tabId);
        callbackResult(structuredClone(tabs.get(tabId)), callback);
      },
      update(tabId, properties, callback) {
        calls.tabsUpdate.push({ tabId, properties: structuredClone(properties) });
        calls.events.push({
          type: 'tabs.update',
          tabId,
          url: properties.url || null,
        });
        const current = tabs.get(tabId);
        if (current) Object.assign(current, properties);
        callbackResult(structuredClone(current), callback);
      },
      sendMessage(tabId, message, callback) {
        calls.tabMessages.push({ tabId, message: structuredClone(message) });
        calls.events.push({
          type: 'tabs.sendMessage',
          tabId,
          url: tabs.get(tabId)?.url || null,
        });
        const response = queuedMessageResponses.shift();
        if (typeof response?.navigatedUrl === 'string') {
          const current = tabs.get(tabId);
          if (current) {
            current.url = response.navigatedUrl;
            current.status = 'complete';
          }
        }
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
        if (typeof response?.handoffNavigatedUrl === 'string') {
          // Resolve the content-script response first, then emulate Coupang's
          // account-selector redirect completing in the same owned tab. The
          // double microtask makes the driver install its onUpdated listener
          // before this transition fires.
          queueMicrotask(() => {
            queueMicrotask(() => {
              const current = tabs.get(tabId);
              if (!current) return;
              current.url = response.handoffNavigatedUrl;
              current.status = 'complete';
              calls.events.push({
                type: 'login.handoff.complete',
                tabId,
                url: current.url,
              });
              for (const listener of tabUpdatedListeners) {
                listener(
                  tabId,
                  { status: 'complete', url: current.url },
                  structuredClone(current),
                );
              }
            });
          });
        }
      },
    },
  };

  return { calls, chrome, storage, tabs, windows };
}

function loadContract(fake) {
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
  return context.KidItemCollectionWindow;
}

function loadHelper(fake, options = {}) {
  return loadContract(fake).create({
    chrome: fake.chrome,
    storageKey: 'owned-window',
    ...options,
  });
}

test('creates one unfocused collection window and navigates its tab sequentially', async () => {
  const fake = createFakeChrome();
  const helper = loadHelper(fake);

  const owned = await helper.getOrCreate('run-a', 'https://example.com/first');
  await helper.navigate('run-a', 'https://example.com/second');
  await helper.navigate('run-a', 'https://example.com/third');

  // 사용자 창을 건드리지 않는 별도 focused:false 창에서 수집한다(백그라운드에서도
  // visible 로 렌더돼 그리드가 스로틀되지 않는다).
  assert.deepEqual(fake.calls.windowsCreate, [
    { url: 'https://example.com/first', focused: false, type: 'normal' },
  ]);
  assert.equal(fake.calls.windowsCreate.length, 1);
  assert.notEqual(owned.windowId, 1);
  assert.equal(fake.tabs.get(owned.tabId).windowId, owned.windowId);
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
  // 사용자가 보던 탭(10)/창(1)은 그대로 — 포커스를 뺏지 않는다.
  assert.equal(fake.tabs.get(10).active, true);
  assert.equal(
    fake.tabs.get(10).url,
    'http://localhost:3000/product-pipeline/registered-products',
  );
});

test('advertising collection opens a separate unfocused window without cloning', async () => {
  // 광고 동기화/광고 성과는 별도 focused:false 창에서 수집한다. 인증 탭을 복제하거나
  // 사용자 창/탭을 건드리지 않으며, 로그인은 content script 가 자동 통과한다.
  for (const [runId, url, producer] of [
    [
      'run-ad-sync',
      'https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1',
      'advertising.ad_sync',
    ],
    [
      'run-coupang-ads',
      'https://advertising.coupang.com/marketing/dashboard/sales#targetDate=2026-07-25',
      'dashboard.coupang_ads',
    ],
  ]) {
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

    const owned = await helper.getOrCreate(runId, url, producer);

    assert.deepEqual(fake.calls.tabsDuplicate, []);
    assert.deepEqual(fake.calls.windowsCreate, [
      { url, focused: false, type: 'normal' },
    ]);
    assert.notEqual(owned.windowId, 1);
    assert.notEqual(owned.tabId, authenticatedTab.id);
    // 기존 인증 탭/사용자 창은 그대로 유지된다.
    assert.equal(fake.tabs.get(authenticatedTab.id).windowId, 1);
    assert.equal(
      fake.tabs.get(authenticatedTab.id).url,
      'https://advertising.coupang.com/marketing/dashboard/sales',
    );

    assert.equal(await helper.close(runId), true);
    // 수집 전용 창만 닫고 사용자 창(1)은 유지한다.
    assert.deepEqual(fake.calls.windowsRemove, [owned.windowId]);
    assert.equal(fake.tabs.has(owned.tabId), false);
    assert.equal(fake.tabs.has(authenticatedTab.id), true);
    assert.equal(fake.windows.has(1), true);
  }
});

test('cancellation closes the collection window and preserves the user window', async () => {
  const fake = createFakeChrome();
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
  // 사용자가 보던 탭(10)/창(1)은 유지된다.
  assert.equal(fake.tabs.has(10), true);
  assert.equal(fake.windows.has(1), true);
});

test('close removes only the owned tab when a user tab was added to the collection window', async () => {
  const fake = createFakeChrome();
  const helper = loadHelper(fake);
  const owned = await helper.getOrCreate(
    'run-with-user-tab',
    'https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1',
    'advertising.ad_sync',
  );
  const userTab = await new Promise((resolve) => {
    fake.chrome.tabs.create(
      {
        windowId: owned.windowId,
        url: 'https://example.com/user-tab',
        active: true,
      },
      resolve,
    );
  });

  assert.equal(await helper.close('run-with-user-tab'), true);
  assert.deepEqual(fake.calls.windowsRemove, []);
  assert.deepEqual(fake.calls.tabsRemove, [owned.tabId]);
  assert.equal(fake.tabs.has(owned.tabId), false);
  assert.equal(fake.tabs.has(userTab.id), true);
  assert.equal(fake.windows.has(owned.windowId), true);
  assert.equal(fake.storage['owned-window'], undefined);
});

test('close follows the owned tab by id after it moves and never closes the recorded user window', async () => {
  const fake = createFakeChrome();
  const helper = loadHelper(fake);
  const owned = await helper.getOrCreate(
    'run-moved-tab',
    'https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1',
    'advertising.ad_sync',
  );
  const userTab = await new Promise((resolve) => {
    fake.chrome.tabs.create(
      {
        windowId: owned.windowId,
        url: 'https://example.com/user-tab',
        active: true,
      },
      resolve,
    );
  });
  await new Promise((resolve) => {
    fake.chrome.windows.create(
      { tabId: owned.tabId, focused: false, type: 'normal' },
      resolve,
    );
  });

  assert.equal(await helper.close('run-moved-tab'), true);
  assert.deepEqual(fake.calls.windowsRemove, []);
  assert.deepEqual(fake.calls.tabsRemove, [owned.tabId]);
  assert.equal(fake.tabs.has(owned.tabId), false);
  assert.equal(fake.tabs.has(userTab.id), true);
  assert.equal(fake.windows.has(owned.windowId), true);
  assert.equal(fake.storage['owned-window'], undefined);
});

test('failed owned-tab removal keeps the record when the collection window has a user tab', async () => {
  const fake = createFakeChrome();
  const helper = loadHelper(fake);
  const owned = await helper.getOrCreate(
    'run-tab-cleanup-failure',
    'https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1',
    'advertising.ad_sync',
  );
  const userTab = await new Promise((resolve) => {
    fake.chrome.tabs.create(
      {
        windowId: owned.windowId,
        url: 'https://example.com/user-tab',
        active: true,
      },
      resolve,
    );
  });
  fake.chrome.tabs.remove = (_tabId, callback) => {
    queueMicrotask(() => {
      fake.chrome.runtime.lastError = { message: 'tab removal denied' };
      callback();
      fake.chrome.runtime.lastError = null;
    });
  };

  assert.equal(await helper.close('run-tab-cleanup-failure'), false);
  assert.equal(fake.tabs.has(owned.tabId), true);
  assert.equal(fake.tabs.has(userTab.id), true);
  assert.equal(fake.storage['owned-window'].runId, 'run-tab-cleanup-failure');
});

test('failed owned-window removal keeps ownership and makes cancellation report failure', async () => {
  const fake = createFakeChrome();
  const sessions = {
    async cancel() {},
  };
  const helper = loadHelper(fake, {
    cancelKey: 'collection-cancel',
    sessions,
    statusKey: 'collection-status',
  });
  const owned = await helper.getOrCreate(
    'run-cleanup-failure',
    'https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1',
    'advertising.ad_sync',
  );
  fake.storage['collection-status'] = {
    runId: 'run-cleanup-failure',
    status: 'running',
  };
  fake.chrome.windows.remove = (_windowId, callback) => {
    queueMicrotask(() => {
      fake.chrome.runtime.lastError = { message: 'window removal denied' };
      callback();
      fake.chrome.runtime.lastError = null;
    });
  };

  const result = await helper.cancelRun('run-cleanup-failure');

  assert.equal(result.success, false);
  assert.equal(result.cancelled, true);
  assert.equal(result.error, 'Collection tab cleanup failed');
  assert.equal(fake.windows.has(owned.windowId), true);
  assert.deepEqual(
    JSON.parse(JSON.stringify(fake.storage['owned-window'])),
    JSON.parse(JSON.stringify(owned)),
  );
});

test('a fresh ad-sync retry replaces its old login attention window with a new collection window', async () => {
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
  const loginOwned = await helper.getOrCreate(
    'run-attention',
    'https://advertising.coupang.com/user/login',
    'advertising.ad_sync',
  );

  const retryOwned = await helper.getOrCreate(
    'run-retry',
    'https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1',
    'advertising.ad_sync',
  );

  // 로그인 화면에서 멈춘 이전 수집 창은 닫고 새 수집 창을 연다.
  assert.notEqual(retryOwned.windowId, loginOwned.windowId);
  assert.deepEqual(fake.calls.windowsRemove, [loginOwned.windowId]);
  assert.deepEqual(fake.calls.tabsDuplicate, []);
  assert.equal(fake.tabs.get(loginOwned.tabId), undefined);
  assert.equal(fake.tabs.has(retryOwned.tabId), true);
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

test('navigate recreates one owned window when the active run loses its record', async () => {
  const fake = createFakeChrome();
  const sessions = {
    async get(runId) {
      return runId === 'run-recover' ? { status: 'running' } : null;
    },
  };
  const helper = loadHelper(fake, { sessions });
  const original = await helper.getOrCreate(
    'run-recover',
    'https://example.com/first',
  );
  delete fake.storage['owned-window'];
  fake.windows.delete(original.windowId);
  fake.tabs.delete(original.tabId);

  const recovered = await helper.navigate(
    'run-recover',
    'https://example.com/recovered',
  );

  assert.equal(fake.calls.windowsCreate.length, 2);
  assert.notEqual(recovered.windowId, original.windowId);
  assert.equal(recovered.runId, 'run-recover');
  assert.equal(fake.storage['owned-window'].tabId, recovered.tabId);
  assert.equal(fake.tabs.get(recovered.tabId).url, 'https://example.com/recovered');
});

test('navigate recovers when the reattached tab disappears between validation and update', async () => {
  // 실측된 실패: 첫 target 을 성공한 뒤 다음 target 으로 navigate 하는 순간 소유 탭이
  // 사라져 있고, reattach 는 직전 검증을 통과했으므로 recovered=false 였다. 그 경로에는
  // 복구가 없어서 run 전체가 "No tab with id: N" 이라는 크롬 원문으로 끝났다.
  const fake = createFakeChrome();
  const attachedTabs = [];
  const sessions = {
    async attachTab(runId, tab) {
      attachedTabs.push([runId, structuredClone(tab)]);
      return { status: 'running' };
    },
    async get() {
      return { status: 'running' };
    },
  };
  const helper = loadHelper(fake, { sessions });
  const original = await helper.getOrCreate(
    'run-vanish',
    'https://example.com/first',
  );

  // 기록(owned-window)과 창은 그대로 두고 탭만 사라뜨려 reattach 는 통과시킨다.
  const realUpdate = fake.chrome.tabs.update;
  let firstUpdate = true;
  fake.chrome.tabs.update = (tabId, properties, callback) => {
    if (firstUpdate) {
      firstUpdate = false;
      fake.tabs.delete(tabId);
      queueMicrotask(() => {
        fake.chrome.runtime.lastError = { message: `No tab with id: ${tabId}.` };
        callback(undefined);
        fake.chrome.runtime.lastError = null;
      });
      return;
    }
    realUpdate(tabId, properties, callback);
  };

  const recovered = await helper.navigate(
    'run-vanish',
    'https://example.com/second',
  );

  assert.equal(recovered.runId, 'run-vanish');
  assert.notEqual(recovered.tabId, original.tabId);
  assert.equal(
    fake.tabs.get(recovered.tabId).url,
    'https://example.com/second',
  );
  assert.deepEqual(attachedTabs, [
    [
      'run-vanish',
      { tabId: recovered.tabId, windowId: recovered.windowId },
    ],
  ]);
});

test('recovery removes its replacement when cancellation wins the attach race', async () => {
  const fake = createFakeChrome();
  const sessions = {
    async attachTab() {
      return { status: 'cancelled' };
    },
    async get() {
      return { status: 'running' };
    },
  };
  const helper = loadHelper(fake, { sessions });
  const original = await helper.getOrCreate(
    'run-cancelled-recovery',
    'https://example.com/first',
  );
  delete fake.storage['owned-window'];
  fake.windows.delete(original.windowId);
  fake.tabs.delete(original.tabId);

  await assert.rejects(
    helper.navigate(
      'run-cancelled-recovery',
      'https://example.com/recovered',
    ),
    (error) => {
      assert.equal(error.code, 'collection_window_inactive_run');
      assert.equal(error.stage, 'attach_replacement');
      return true;
    },
  );

  assert.equal(fake.calls.windowsCreate.length, 2);
  assert.equal(fake.calls.windowsRemove.length, 1);
  assert.equal(fake.storage['owned-window'], undefined);
});

test('navigate makes one replacement attempt and returns typed recovery failure evidence', async () => {
  const fake = createFakeChrome();
  const sessions = { async get() { return { status: 'running' }; } };
  const helper = loadHelper(fake, { sessions });
  const original = await helper.getOrCreate('run-recover-fail', 'https://example.com/first');
  delete fake.storage['owned-window'];
  fake.windows.delete(original.windowId);
  fake.tabs.delete(original.tabId);
  let replacementAttempts = 0;
  fake.chrome.windows.create = (_properties, callback) => {
    replacementAttempts += 1;
    queueMicrotask(() => {
      fake.chrome.runtime.lastError = { message: 'window denied' };
      callback(undefined);
      fake.chrome.runtime.lastError = null;
    });
  };

  await assert.rejects(
    helper.navigate('run-recover-fail', 'https://example.com/recovered'),
    (error) => {
      assert.equal(error.code, 'collection_window_recovery_failed');
      assert.equal(error.runId, 'run-recover-fail');
      assert.equal(error.stage, 'create_replacement');
      return true;
    },
  );
  assert.equal(replacementAttempts, 1);
});

test('navigate never recreates an inactive run or adopts another active run window', async () => {
  const inactiveFake = createFakeChrome();
  const inactive = loadHelper(inactiveFake, {
    sessions: { async get() { return { status: 'failed' }; } },
  });
  await assert.rejects(
    inactive.navigate('run-terminal', 'https://example.com/recovered'),
    (error) => error.code === 'collection_window_inactive_run',
  );
  assert.equal(inactiveFake.calls.windowsCreate.length, 0);

  const conflictFake = createFakeChrome();
  const conflict = loadHelper(conflictFake, {
    sessions: { async get() { return { status: 'running' }; } },
  });
  await conflict.getOrCreate('run-owner', 'https://example.com/owner');
  await assert.rejects(
    conflict.navigate('run-incoming', 'https://example.com/incoming'),
    (error) => error.code === 'collection_window_owner_conflict',
  );
  assert.equal(conflictFake.calls.windowsCreate.length, 1);
  assert.equal(conflictFake.storage['owned-window'].runId, 'run-owner');
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

test('attention status follows a replacement tab after navigation recovery', async () => {
  const fake = createFakeChrome({}, [
    {
      success: false,
      pendingLogin: true,
      error: '쿠팡 광고센터 로그인이 필요합니다.',
    },
  ]);
  const attachedTabs = [];
  const sessions = {
    async attachTab(runId, tab) {
      attachedTabs.push([runId, structuredClone(tab)]);
      return { status: 'running' };
    },
    async cancel() {},
    async fail() {},
    async get() {
      return { status: 'running', attempt: 1 };
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
  const realUpdate = fake.chrome.tabs.update;
  let firstUpdate = true;
  fake.chrome.tabs.update = (tabId, properties, callback) => {
    if (firstUpdate) {
      firstUpdate = false;
      fake.tabs.delete(tabId);
      queueMicrotask(() => {
        fake.chrome.runtime.lastError = { message: `No tab with id: ${tabId}.` };
        callback(undefined);
        fake.chrome.runtime.lastError = null;
      });
      return;
    }
    realUpdate(tabId, properties, callback);
  };

  const result = await helper.collectTargets({
    environmentId: 'local',
    producer: 'dashboard.coupang_ads',
    runId: 'run-attention-recovery',
    startedAt: 1,
    targets: [
      {
        id: 'ads-day',
        label: '쿠팡 광고 데이터 수집',
        url: 'https://advertising.coupang.com/marketing/dashboard/sales#targetDate=2026-07-28',
      },
    ],
  });

  assert.equal(result.attentionRequired, true);
  assert.equal(attachedTabs.length, 2);
  assert.notEqual(attachedTabs[1][1].tabId, attachedTabs[0][1].tabId);
  assert.equal(
    fake.storage['collection-status'].currentTabId,
    attachedTabs[1][1].tabId,
  );
});

test('ad sync replaces its owned tab when it disappears before the content command', async () => {
  const missingTab = 'No tab with id: 200.';
  const fake = createFakeChrome({}, [
    { runtimeError: missingTab },
    {
      success: true,
      type: 'ad_sync',
      count: 1,
      progress: {
        current: 1,
        total: 1,
        completed: 1,
        failed: 0,
        label: '광고 동기화 완료',
      },
    },
  ]);
  const attachedTabs = [];
  const sessionCalls = [];
  const sessions = {
    async attachTab(runId, tab) {
      attachedTabs.push([runId, structuredClone(tab)]);
      return { status: 'running' };
    },
    async cancel(runId) {
      sessionCalls.push(['cancel', runId]);
    },
    async fail(runId) {
      sessionCalls.push(['fail', runId]);
    },
    async get() {
      return { status: 'running', attempt: 1 };
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
  const realSendMessage = fake.chrome.tabs.sendMessage;
  let closeBeforeFirstCommand = true;
  fake.chrome.tabs.sendMessage = (tabId, message, callback) => {
    if (closeBeforeFirstCommand) {
      closeBeforeFirstCommand = false;
      const closedTab = fake.tabs.get(tabId);
      fake.tabs.delete(tabId);
      if (closedTab) fake.windows.delete(closedTab.windowId);
    }
    realSendMessage(tabId, message, callback);
  };

  const result = await helper.collectTargets({
    environmentId: 'local',
    producer: 'advertising.ad_sync',
    runId: 'run-command-tab-recovery',
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
  assert.equal(fake.calls.windowsCreate.length, 2);
  assert.equal(attachedTabs.length, 2);
  assert.notEqual(attachedTabs[1][1].tabId, attachedTabs[0][1].tabId);
  assert.deepEqual(
    fake.calls.tabMessages.map(({ tabId }) => tabId),
    [attachedTabs[0][1].tabId, attachedTabs[1][1].tabId],
  );
  assert.ok(
    sessionCalls.some(
      ([name, runId]) =>
        name === 'succeed' && runId === 'run-command-tab-recovery',
    ),
  );
  assert.ok(!sessionCalls.some(([name]) => name === 'fail'));
});

for (const scenario of [
  {
    producer: 'advertising.ad_sync',
    runId: 'run-ad-sync-login-handoff',
    label: '광고 동기화',
    targetUrl:
      'https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1',
    handoffUrl:
      'https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1',
    expectedTabUpdates: 1,
    resultType: 'ad_sync',
  },
  {
    producer: 'dashboard.coupang_ads',
    runId: 'run-ads-daily-login-handoff',
    label: '광고 성과',
    targetUrl:
      'https://advertising.coupang.com/marketing/dashboard/sales#targetDate=2026-07-25',
    // Some Coupang login callbacks drop the fragment. The driver may restore
    // targetDate only after this authenticated dashboard transition completes.
    handoffUrl: 'https://advertising.coupang.com/marketing/dashboard/sales',
    expectedTabUpdates: 2,
    resultType: 'coupang_ads_daily',
  },
]) {
  test(`${scenario.producer} waits for the account-selector login handoff before resuming`, async () => {
    const loginUrl =
      'https://advertising.coupang.com/user/login?callback_url=' +
      encodeURIComponent(scenario.targetUrl);
    const fake = createFakeChrome({}, [
      {
        success: false,
        resumeRequired: true,
        loginHandoff: true,
        error: '쿠팡 광고센터 자동 로그인 중',
        navigatedUrl: loginUrl,
        handoffNavigatedUrl: scenario.handoffUrl,
      },
      {
        success: true,
        type: scenario.resultType,
        count: 1,
        progress: {
          current: 1,
          total: 1,
          completed: 1,
          failed: 0,
          label: `${scenario.label} 완료`,
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
        return { status: 'running', attempt: 1 };
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
      environmentId: 'local',
      producer: scenario.producer,
      runId: scenario.runId,
      startedAt: 1,
      targets: [
        {
          id: scenario.producer,
          label: scenario.label,
          url: scenario.targetUrl,
        },
      ],
    });

    assert.equal(result.success, true);
    assert.equal(result.completed, 1);
    assert.equal(result.failed, 0);
    assert.equal(fake.calls.tabMessages.length, 2);
    assert.equal(fake.calls.tabsUpdate.length, scenario.expectedTabUpdates);

    const handoffIndex = fake.calls.events.findIndex(
      (event) => event.type === 'login.handoff.complete',
    );
    const messageIndexes = fake.calls.events
      .map((event, index) => ({ event, index }))
      .filter(({ event }) => event.type === 'tabs.sendMessage')
      .map(({ index }) => index);
    const updateIndexes = fake.calls.events
      .map((event, index) => ({ event, index }))
      .filter(({ event }) => event.type === 'tabs.update')
      .map(({ index }) => index);
    assert.equal(messageIndexes.length, 2);
    assert.ok(handoffIndex > messageIndexes[0]);
    assert.ok(
      updateIndexes.every(
        (index) => index < messageIndexes[0] || index > handoffIndex,
      ),
      'the driver must not overwrite the in-flight login redirect',
    );
    assert.ok(
      handoffIndex < messageIndexes[1],
      'manualSync must resume only after the allowlisted dashboard is complete',
    );
    assert.equal(fake.calls.events[messageIndexes[1]].url, scenario.targetUrl);
    assert.equal(fake.calls.windowsUpdate.length, 0);
    assert.equal(fake.tabs.get(10).active, true);
    assert.ok(
      sessionCalls.some(
        ([name, runId]) => name === 'succeed' && runId === scenario.runId,
      ),
    );
    assert.ok(!sessionCalls.some(([name]) => name === 'requireAttention'));
    assert.ok(!sessionCalls.some(([name]) => name === 'fail'));
  });
}

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
    environmentId: 'local',
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
      environmentId: 'local',
    })),
  );
  assert.ok(
    sessionCalls.some(
      ([name, runId]) => name === 'succeed' && runId === 'run-content-ready',
    ),
  );
  assert.ok(!sessionCalls.some(([name]) => name === 'fail'));
});

test('reloads the owned advertising tab once when an extension reload left no content receiver', async () => {
  const missingReceiver =
    'Could not establish connection. Receiving end does not exist.';
  const fake = createFakeChrome(
    {},
    [
      ...Array.from({ length: 20 }, () => ({ runtimeError: missingReceiver })),
      {
        success: true,
        type: 'coupang_ads',
        count: 1,
        progress: {
          current: 1,
          total: 1,
          completed: 1,
          failed: 0,
          label: '쿠팡 광고 데이터 수집 완료',
        },
      },
    ],
  );
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
      return { status: 'running', attempt: 1 };
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
    environmentId: 'local',
    producer: 'dashboard.coupang_ads',
    runId: 'run-content-reload',
    startedAt: 1,
    targets: [
      {
        id: 'ads-day',
        label: '쿠팡 광고 데이터 수집',
        url: 'https://advertising.coupang.com/marketing/dashboard/sales#targetDate=2026-07-27',
      },
    ],
  });

  assert.equal(result.success, true);
  assert.equal(fake.calls.tabsReload.length, 1);
  assert.equal(fake.calls.tabMessages.length, 21);
  assert.ok(
    sessionCalls.some(
      ([name, runId]) => name === 'succeed' && runId === 'run-content-reload',
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
    environmentId: 'local',
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
        environmentId: 'local',
      },
      {
        action: 'manualSync',
        collectionRunId: 'run-resume',
        collectionAttempt: 1,
        environmentId: 'local',
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

test('rejects an advertising resume URL outside the dashboard and campaign-detail allowlist before navigation', async (t) => {
  const targetUrl =
    'https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1';
  for (const [name, unsafeResumeUrl] of [
    ['different origin', 'https://example.com/collect'],
    ['same-host login page', 'https://advertising.coupang.com/user/login'],
    [
      'same-host unrelated marketing page',
      'https://advertising.coupang.com/marketing/campaign/registration',
    ],
  ]) {
    await t.test(name, async () => {
      const fake = createFakeChrome({}, [
        {
          success: false,
          resumeRequired: true,
          resumeUrl: unsafeResumeUrl,
          progress: {
            current: 31,
            total: 279,
            completed: 1,
            failed: 0,
            label: 'resume requested',
          },
        },
      ]);
      const sessions = {
        async attachTab() {},
        async cancel() {},
        async fail() {},
        async get() {
          return { status: 'running', attempt: 1 };
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
        runId: `run-rejected-resume-${name}`,
        startedAt: 1,
        targets: [{ id: 'ads', label: '광고 동기화', url: targetUrl }],
      });

      assert.equal(result.success, false);
      assert.equal(
        result.error,
        'Collection resume URL is outside the allowed target family',
      );
      assert.deepEqual(
        fake.calls.tabsUpdate.map(({ properties }) => properties.url),
        [targetUrl],
      );
      assert.ok(
        fake.calls.tabsUpdate.every(
          ({ properties }) => properties.url !== unsafeResumeUrl,
        ),
      );
    });
  }
});

test('non-advertising resumes stay within the original HTTPS target path family', () => {
  const fake = createFakeChrome();
  const contract = loadContract(fake);
  const targetUrl =
    'https://wing.coupang.com/tenants/seller-web/vendor-inventory/stock';

  assert.equal(
    contract.resolveCollectionResumeUrl(
      `${targetUrl}/page/2?cursor=next`,
      targetUrl,
      'dashboard.wing_sales',
    ),
    `${targetUrl}/page/2?cursor=next`,
  );
  assert.throws(
    () =>
      contract.resolveCollectionResumeUrl(
        'https://wing.coupang.com/tenants/seller-web/orders',
        targetUrl,
        'dashboard.wing_sales',
      ),
    /outside the allowed target family/,
  );
  assert.throws(
    () =>
      contract.resolveCollectionResumeUrl(
        'http://wing.coupang.com/tenants/seller-web/vendor-inventory/stock',
        targetUrl,
        'dashboard.wing_sales',
      ),
    /outside the allowed target family/,
  );
});

test('resumes a linkless campaign from the full-document detail URL', async () => {
  const dashboardUrl =
    'https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1';
  const detailUrl =
    'https://advertising.coupang.com/marketing/dashboard/sales/' +
    'campaign/102284299/group/202471278/product?internalChannel=click_campaign_name';
  const fake = createFakeChrome({}, [
    {
      runtimeError:
        'The message port closed before a response was received.',
      navigatedUrl: detailUrl,
    },
    {
      success: true,
      type: 'ad_sync',
      count: 31,
      progress: {
        current: 31,
        total: 279,
        completed: 1,
        failed: 0,
        label: '첫 캠페인 31일 완료',
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
      return { status: 'running', progress: null };
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
    runId: 'run-full-document-detail',
    startedAt: 1,
    targets: [
      {
        id: 'ads',
        label: '광고 동기화',
        url: dashboardUrl,
      },
    ],
  });

  assert.equal(result.success, true);
  assert.deepEqual(
    fake.calls.tabsUpdate.map(({ properties }) => properties.url),
    [dashboardUrl, detailUrl],
  );
  assert.equal(fake.calls.tabMessages.length, 2);
  assert.ok(
    sessionCalls.some(
      ([name, runId]) =>
        name === 'succeed' && runId === 'run-full-document-detail',
    ),
  );
  assert.ok(!sessionCalls.some(([name]) => name === 'fail'));
});

test('does not collapse shared dashboard returns from four distinct campaign details into one stalled position', async () => {
  const dashboardUrl =
    'https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1';
  const campaignUrls = [
    ['102284299', '202471278'],
    ['102284300', '202471279'],
    ['102284301', '202471280'],
    ['102284302', '202471281'],
  ].map(
    ([campaignId, groupId]) =>
      'https://advertising.coupang.com/marketing/dashboard/sales/' +
      `campaign/${campaignId}/group/${groupId}/product` +
      '?internalChannel=click_campaign_name',
  );
  const navigationClosedChannel =
    'A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received';
  const fake = createFakeChrome({}, [
    { runtimeError: navigationClosedChannel, navigatedUrl: dashboardUrl },
    ...campaignUrls.flatMap((campaignUrl) => [
      { runtimeError: navigationClosedChannel, navigatedUrl: campaignUrl },
      { runtimeError: navigationClosedChannel, navigatedUrl: dashboardUrl },
    ]),
    {
      success: true,
      type: 'ad_sync',
      count: 43,
      progress: {
        current: 43,
        total: 279,
        completed: 2,
        failed: 0,
        label: '두 번째 캠페인 12일 저장',
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
      return {
        status: 'running',
        attempt: 1,
        progress: {
          current: 31,
          total: 279,
          completed: 1,
          failed: 0,
          label: '첫 캠페인 31일 완료',
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

  const result = await helper.collectTargets({
    producer: 'advertising.ad_sync',
    runId: 'run-distinct-navigation-positions',
    startedAt: 1,
    targets: [{ id: 'ads', label: '광고 동기화', url: dashboardUrl }],
  });

  assert.equal(result.success, true);
  assert.equal(fake.calls.tabMessages.length, 10);
  assert.deepEqual(
    fake.calls.tabsUpdate.map(({ properties }) => properties.url),
    [
      dashboardUrl,
      dashboardUrl,
      ...campaignUrls.flatMap((campaignUrl) => [
        campaignUrl,
        dashboardUrl,
      ]),
    ],
  );
  assert.ok(
    sessionCalls.some(
      ([name, runId]) =>
        name === 'succeed' && runId === 'run-distinct-navigation-positions',
    ),
  );
  assert.ok(!sessionCalls.some(([name]) => name === 'fail'));
});

test('does not stop linkless campaign probes that share the dashboard URL when each row reports a new label', async () => {
  const dashboardUrl =
    'https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1';
  const navigationClosedChannel =
    'A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received';
  const fake = createFakeChrome({}, [
    ...Array.from({ length: 5 }, () => ({
      runtimeError: navigationClosedChannel,
      navigatedUrl: dashboardUrl,
    })),
    {
      success: true,
      type: 'ad_sync',
      count: 43,
      progress: {
        current: 43,
        total: 279,
        completed: 2,
        failed: 0,
        label: '두 번째 캠페인 일별 수집 진행',
      },
    },
  ]);
  const sessionCalls = [];
  let getCalls = 0;
  const sessions = {
    async attachTab() {},
    async cancel() {},
    async fail(runId) {
      sessionCalls.push(['fail', runId]);
    },
    async get() {
      const rowNumber = Math.floor(getCalls / 2) + 1;
      getCalls += 1;
      return {
        status: 'running',
        attempt: 1,
        progress: {
          current: 31,
          total: 279,
          completed: 1,
          failed: 0,
          label:
            `동일 캠페인명 · 상세 식별 이동 ` +
            `(1페이지 ${rowNumber}행)`,
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

  const result = await helper.collectTargets({
    producer: 'advertising.ad_sync',
    runId: 'run-linkless-dashboard-labels',
    startedAt: 1,
    targets: [{ id: 'ads', label: '광고 동기화', url: dashboardUrl }],
  });

  assert.equal(result.success, true);
  assert.equal(fake.calls.tabMessages.length, 6);
  assert.equal(
    fake.calls.tabsUpdate.filter(
      ({ properties }) => properties.url === dashboardUrl,
    ).length,
    6,
  );
  assert.ok(
    sessionCalls.some(
      ([name, runId]) =>
        name === 'succeed' && runId === 'run-linkless-dashboard-labels',
    ),
  );
  assert.ok(!sessionCalls.some(([name]) => name === 'fail'));
});

test('allows three same-campaign detail visits for the 12 + 12 + 7 day slices', async () => {
  const dashboardUrl =
    'https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1';
  const campaignUrl =
    'https://advertising.coupang.com/marketing/dashboard/sales/' +
    'campaign/102284299/group/202471278/product?internalChannel=click_campaign_name';
  const navigationClosedChannel =
    'A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received';
  const fake = createFakeChrome({}, [
    { runtimeError: navigationClosedChannel, navigatedUrl: dashboardUrl },
    { runtimeError: navigationClosedChannel, navigatedUrl: campaignUrl },
    { runtimeError: navigationClosedChannel, navigatedUrl: dashboardUrl },
    { runtimeError: navigationClosedChannel, navigatedUrl: campaignUrl },
    { runtimeError: navigationClosedChannel, navigatedUrl: dashboardUrl },
    { runtimeError: navigationClosedChannel, navigatedUrl: campaignUrl },
    {
      success: true,
      type: 'ad_sync',
      count: 43,
      progress: {
        current: 43,
        total: 279,
        completed: 1,
        failed: 0,
        label: '첫 캠페인 31일 완료',
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
      return {
        status: 'running',
        attempt: 1,
        progress: {
          current: 31,
          total: 279,
          completed: 0,
          failed: 0,
          label: '첫 캠페인 남은 날짜 수집 준비',
        },
      };
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
    runId: 'run-three-daily-slices',
    startedAt: 1,
    targets: [{ id: 'ads', label: '광고 동기화', url: dashboardUrl }],
  });

  assert.equal(result.success, true);
  assert.equal(fake.calls.tabMessages.length, 7);
  assert.ok(
    sessionCalls.some(
      ([name, runId]) =>
        name === 'succeed' && runId === 'run-three-daily-slices',
    ),
  );
  assert.ok(!sessionCalls.some(([name]) => name === 'fail'));
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

test('keeps a progressing large-account sweep alive beyond the former 500-handoff cutoff', async () => {
  const resumeUrl =
    'https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1';
  const fake = createFakeChrome({}, [
    ...Array.from({ length: 501 }, (_, index) => ({
      success: false,
      resumeRequired: true,
      resumeUrl,
      synced: index + 1,
      failed: 0,
      totalRows: (index + 1) * 10,
      progress: {
        current: index + 1,
        total: 15_500,
        completed: index + 1,
        failed: 0,
        label: `대형 계정 캠페인 ${index + 1}`,
      },
    })),
    {
      success: true,
      type: 'ad_sync',
      count: 5_010,
      progress: {
        current: 502,
        total: 15_500,
        completed: 502,
        failed: 0,
        label: '대형 계정 다음 구간 저장',
      },
    },
  ]);
  const sessions = {
    async attachTab() {},
    async cancel() {},
    async fail() {},
    async get() {
      return { status: 'running', attempt: 1 };
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
    runId: 'run-large-account-resume',
    startedAt: 1,
    targets: [{ id: 'ads', label: '광고 동기화', url: resumeUrl }],
  });

  assert.equal(result.success, true);
  assert.equal(fake.calls.tabMessages.length, 502);
  assert.equal(fake.calls.tabsUpdate.length, 502);
});

test('large-account resume lease scales from work total and remains absolutely bounded', () => {
  const contract = loadContract(createFakeChrome());

  assert.equal(
    contract.campaignSweepResumeAttemptLimit({ dateWorkTotal: 0 }),
    2_000,
  );
  assert.equal(
    contract.campaignSweepResumeAttemptLimit({ dateWorkTotal: 15_500 }),
    31_000,
  );
  assert.equal(
    contract.campaignSweepResumeAttemptLimit({ dateWorkTotal: 1_000_000 }),
    50_000,
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

test('stops a fourth traversal of the same detail and dashboard cycle without campaign progress', async () => {
  const dashboardUrl =
    'https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1';
  const campaignUrl =
    'https://advertising.coupang.com/marketing/dashboard/sales/' +
    'campaign/102284299/group/202471278/product?internalChannel=click_campaign_name';
  const navigationClosedChannel =
    'A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received';
  const fake = createFakeChrome({}, [
    { runtimeError: navigationClosedChannel, navigatedUrl: dashboardUrl },
    ...Array.from({ length: 3 }, () => [
      { runtimeError: navigationClosedChannel, navigatedUrl: campaignUrl },
      { runtimeError: navigationClosedChannel, navigatedUrl: dashboardUrl },
    ]).flat(),
    { runtimeError: navigationClosedChannel, navigatedUrl: campaignUrl },
  ]);
  const sessions = {
    async attachTab() {},
    async cancel() {},
    async fail() {},
    async get() {
      return {
        status: 'running',
        attempt: 1,
        progress: {
          current: 31,
          total: 279,
          completed: 1,
          failed: 0,
          label: '같은 캠페인에서 반복',
        },
      };
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
        url: dashboardUrl,
      },
    ],
  });

  assert.equal(result.success, false);
  assert.equal(result.failed, 1);
  assert.equal(fake.calls.tabMessages.length, 8);
  assert.equal(fake.calls.tabsUpdate.length, 8);
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
    /MIN_PROGRESSING_RESUME_ATTEMPTS\s*=\s*2_000/,
  );
  assert.match(
    helperSource,
    /MAX_PROGRESSING_RESUME_ATTEMPTS\s*=\s*50_000/,
  );
  assert.match(
    helperSource,
    /campaignSweepResumeAttemptLimit\(resumeProgress\)/,
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
