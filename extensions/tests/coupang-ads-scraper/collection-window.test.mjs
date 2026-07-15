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

function createFakeChrome(initialStorage = {}) {
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
    tabsUpdate: [],
    windowsCreate: [],
    windowsRemove: [],
    windowsUpdate: [],
  };
  let nextWindowId = 20;
  let nextTabId = 200;

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
    },
  };

  return { calls, chrome, storage, tabs, windows };
}

function loadHelper(fake) {
  const context = vm.createContext({
    chrome: fake.chrome,
    console,
    queueMicrotask,
    structuredClone,
  });
  vm.runInContext(fs.readFileSync(helperPath, 'utf8'), context, {
    filename: helperPath,
  });
  return context.KidItemCollectionWindow.create({
    chrome: fake.chrome,
    storageKey: 'owned-window',
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
