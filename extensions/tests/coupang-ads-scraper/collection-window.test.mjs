import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const sourcePath = path.join(repoRoot, 'extensions/kiditem-os/background/coupang/collection-window.js');

function fakeChrome(initialStorage = {}) {
  const storage = structuredClone(initialStorage);
  const windows = new Map([[1, { id: 1, type: 'normal', focused: true, tabs: [
    { id: 10, windowId: 1, active: true, status: 'complete', url: 'http://localhost:3000/' },
  ] }]]);
  const tabs = new Map([[10, windows.get(1).tabs[0]]]);
  const calls = { windowsCreate: [], windowsRemove: [], tabsUpdate: [], tabsRemove: [], tabsReload: [], messages: [] };
  let nextWindow = 20;
  let nextTab = 200;
  const updated = new Set();
  const removed = new Set();
  const responses = [];
  const chrome = {
    runtime: { lastError: null },
    storage: { local: {
      async get(key) { return { [key]: structuredClone(storage[key]) }; },
      async set(value) { Object.assign(storage, structuredClone(value)); },
      async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key]; },
    } },
    windows: {
      create(properties, callback) {
        calls.windowsCreate.push(structuredClone(properties));
        const id = nextWindow++;
        const tab = { id: nextTab++, windowId: id, active: true, status: 'complete', url: properties.url };
        tabs.set(tab.id, tab);
        const win = { id, type: 'normal', focused: false, tabs: [tab] };
        windows.set(id, win);
        queueMicrotask(() => callback(structuredClone(win)));
      },
      get(id, _options, callback) { queueMicrotask(() => callback(structuredClone(windows.get(id)))); },
      remove(id, callback) {
        calls.windowsRemove.push(id);
        for (const tab of windows.get(id)?.tabs || []) tabs.delete(tab.id);
        windows.delete(id);
        queueMicrotask(() => callback());
      },
    },
    tabs: {
      onUpdated: { addListener(fn) { updated.add(fn); }, removeListener(fn) { updated.delete(fn); } },
      onRemoved: { addListener(fn) { removed.add(fn); }, removeListener(fn) { removed.delete(fn); } },
      get(id, callback) { queueMicrotask(() => callback(structuredClone(tabs.get(id)))); },
      update(id, properties, callback) {
        calls.tabsUpdate.push({ id, properties: structuredClone(properties) });
        const tab = tabs.get(id);
        if (tab) Object.assign(tab, properties);
        queueMicrotask(() => callback(structuredClone(tab)));
      },
      remove(id, callback) {
        calls.tabsRemove.push(id);
        const tab = tabs.get(id);
        if (tab) windows.get(tab.windowId).tabs = windows.get(tab.windowId).tabs.filter((value) => value.id !== id);
        tabs.delete(id);
        queueMicrotask(() => callback());
      },
      reload(id, _options, callback) { calls.tabsReload.push(id); queueMicrotask(() => callback()); },
      sendMessage(id, message, callback) {
        calls.messages.push({ id, message: structuredClone(message) });
        const response = responses.shift();
        if (response?.runtimeError) {
          queueMicrotask(() => {
            chrome.runtime.lastError = { message: response.runtimeError };
            callback();
            chrome.runtime.lastError = null;
          });
          return;
        }
        queueMicrotask(() => callback(structuredClone(response || { success: true })));
      },
    },
  };
  return { chrome, storage, windows, tabs, calls, responses, updated, removed };
}

function load(fake) {
  const context = vm.createContext({ URL, clearTimeout, console, queueMicrotask, setTimeout, structuredClone });
  vm.runInContext(fs.readFileSync(sourcePath, 'utf8'), context, { filename: sourcePath });
  return context.KidItemCollectionWindow.create({ chrome: fake.chrome, storageKey: 'owned-window', delay: async () => {} });
}

test('resource creates one unfocused window and navigates its owned tab', async () => {
  const fake = fakeChrome();
  const resource = load(fake);
  const owned = await resource.getOrCreate('attempt-a', 'https://example.test/one');
  const navigated = await resource.navigate('attempt-a', 'https://example.test/two');
  assert.equal(navigated.tabId, owned.tabId);
  assert.deepEqual(fake.calls.windowsCreate, [{ url: 'https://example.test/one', focused: false, type: 'normal' }]);
  assert.deepEqual(fake.calls.tabsUpdate, [{ id: owned.tabId, properties: { url: 'https://example.test/two', active: true } }]);
  assert.equal(fake.tabs.get(10).active, true);
});

test('close removes only the managed tab when the collection window gains a user tab', async () => {
  const fake = fakeChrome();
  const resource = load(fake);
  const owned = await resource.getOrCreate('attempt-close', 'https://example.test');
  const userTab = { id: 99, windowId: owned.windowId, active: true, status: 'complete', url: 'https://user.example' };
  fake.tabs.set(userTab.id, userTab);
  fake.windows.get(owned.windowId).tabs.push(userTab);
  assert.equal(await resource.close('attempt-close'), true);
  assert.deepEqual(fake.calls.tabsRemove, [owned.tabId]);
  assert.equal(fake.tabs.has(userTab.id), true);
  assert.equal(fake.storage['owned-window'], undefined);
});

test('close treats an absent owned record as idempotent success', async () => {
  const fake = fakeChrome();
  const resource = load(fake);

  assert.equal(await resource.close('attempt-without-record'), true);

  const owned = await resource.getOrCreate('attempt-close-once', 'https://example.test');
  assert.equal(await resource.close('attempt-close-once'), true);
  assert.equal(await resource.close('attempt-close-once'), true);
  assert.deepEqual(fake.calls.windowsRemove, [owned.windowId]);
  assert.deepEqual(fake.calls.tabsRemove, []);
  assert.equal(fake.storage['owned-window'], undefined);
});

test('runExclusive serializes shared-resource operations', async () => {
  const resource = load(fakeChrome());
  const order = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const first = resource.runExclusive(async () => { order.push('first:start'); await gate; order.push('first:end'); });
  const second = resource.runExclusive(async () => { order.push('second:start'); });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(order, ['first:start']);
  release();
  await Promise.all([first, second]);
  assert.deepEqual(order, ['first:start', 'first:end', 'second:start']);
});

test('a live owner session stays protected unless the caller grants a narrow reuse predicate', async () => {
  const fake = fakeChrome();
  const sessions = {
    async get(runId) { return { attemptId: runId, producer: 'advertising.ad_sync', attention: { reason: 'marketplace_login' } }; },
    async detachTab() {},
  };
  const context = vm.createContext({ URL, clearTimeout, console, queueMicrotask, setTimeout, structuredClone });
  vm.runInContext(fs.readFileSync(sourcePath, 'utf8'), context, { filename: sourcePath });
  const helper = context.KidItemCollectionWindow.create({ chrome: fake.chrome, storageKey: 'owned-window', sessions, delay: async () => {} });
  await helper.getOrCreate('old', 'https://example.test/old');
  await assert.rejects(helper.getOrCreate('new', 'https://example.test/new'), /다른 데이터 수집 작업/);
  const reused = await helper.getOrCreate('new', 'https://example.test/new', { reuse: () => true });
  assert.equal(reused.runId, 'new');
  assert.equal(fake.calls.windowsCreate.length, 1);
});

test('missing owned tab is recovered once and reattached to the same owner session', async () => {
  const fake = fakeChrome();
  const attached = [];
  const sessions = {
    async get() { return { attemptId: 'recover', producer: 'dashboard.wing_sales' }; },
    async attachTab(runId, value) { attached.push([runId, value]); return { attemptId: runId }; },
  };
  const context = vm.createContext({ URL, clearTimeout, console, queueMicrotask, setTimeout, structuredClone });
  vm.runInContext(fs.readFileSync(sourcePath, 'utf8'), context, { filename: sourcePath });
  const resource = context.KidItemCollectionWindow.create({ chrome: fake.chrome, storageKey: 'owned-window', sessions, delay: async () => {} });
  const original = await resource.getOrCreate('recover', 'https://example.test/one');
  fake.windows.delete(original.windowId);
  fake.tabs.delete(original.tabId);
  const recovered = await resource.navigate('recover', 'https://example.test/two');
  assert.notEqual(recovered.tabId, original.tabId);
  assert.equal(fake.calls.windowsCreate.length, 2);
  assert.equal(attached.length, 1);
});

test('content messaging keeps readiness/reload mechanics source-neutral', async () => {
  const fake = fakeChrome();
  fake.responses.push({ runtimeError: 'Could not establish connection. Receiving end does not exist.' }, { success: true, value: 1 });
  const resource = load(fake);
  const owned = await resource.getOrCreate('messages', 'https://example.test');
  const result = await resource.sendMessageWhenReady(owned.tabId, { action: 'source-owned' });
  assert.deepEqual(result, { success: true, value: 1 });
  assert.equal(fake.calls.messages.length, 2);
  assert.deepEqual(fake.calls.messages[0].message, { action: 'source-owned' });
});

test('resource source does not contain provider policy or local batch terminal authority', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');
  assert.doesNotMatch(source, /advertising\.coupang\.com|wing\.coupang\.com|manualSync|campaign|targetDate|statusKey|cancelKey/);
  assert.doesNotMatch(source, /collectTargets|function cancelRun/);
});
