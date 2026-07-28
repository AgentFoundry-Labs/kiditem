import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const helperPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../extensions/coupang-ads-scraper/background/collection-window.js',
);

function createControlledTimers() {
  let nextId = 1;
  const pending = new Map();
  return {
    clearTimeout(id) {
      pending.delete(id);
    },
    fireDelay(delay) {
      const matches = [...pending.entries()].filter(
        ([, timer]) => timer.delay === delay,
      );
      for (const [id, timer] of matches) {
        pending.delete(id);
        timer.callback();
      }
    },
    setTimeout(callback, delay) {
      const id = nextId++;
      pending.set(id, { callback, delay });
      return id;
    },
  };
}

function createChromeHarness() {
  const storage = {};
  const windows = new Map();
  const tabs = new Map();
  const calls = { attached: [], windowsCreate: [] };
  const timers = createControlledTimers();
  let nextWindowId = 20;
  let nextTabId = 200;
  let firstCommand = true;

  const chrome = {
    runtime: { lastError: null },
    storage: {
      local: {
        async get(key) {
          return { [key]: structuredClone(storage[key]) };
        },
        async remove(key) {
          delete storage[key];
        },
        async set(values) {
          Object.assign(storage, structuredClone(values));
        },
      },
    },
    tabs: {
      get(tabId, callback) {
        queueMicrotask(() => {
          const tab = tabs.get(tabId);
          if (!tab) chrome.runtime.lastError = { message: `No tab with id: ${tabId}.` };
          callback(tab ? structuredClone(tab) : undefined);
          chrome.runtime.lastError = null;
        });
      },
      onRemoved: {
        addListener() {},
        removeListener() {},
      },
      onUpdated: {
        addListener() {},
        removeListener() {},
      },
      reload(_tabId, _properties, callback) {
        queueMicrotask(() => callback());
      },
      remove(tabId, callback) {
        const tab = tabs.get(tabId);
        tabs.delete(tabId);
        if (tab) windows.delete(tab.windowId);
        queueMicrotask(() => callback());
      },
      sendMessage(tabId, _message, callback) {
        if (firstCommand) {
          firstCommand = false;
          const tab = tabs.get(tabId);
          tabs.delete(tabId);
          if (tab) windows.delete(tab.windowId);
          queueMicrotask(() => {
            chrome.runtime.lastError = {
              message:
                'A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received',
            };
            callback(undefined);
            chrome.runtime.lastError = null;
          });
          return;
        }
        queueMicrotask(() =>
          callback({
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
          }),
        );
      },
      update(tabId, properties, callback) {
        queueMicrotask(() => {
          const tab = tabs.get(tabId);
          if (!tab) {
            chrome.runtime.lastError = { message: `No tab with id: ${tabId}.` };
            callback(undefined);
            chrome.runtime.lastError = null;
            return;
          }
          Object.assign(tab, properties, { status: 'complete' });
          callback(structuredClone(tab));
        });
      },
    },
    windows: {
      create(properties, callback) {
        calls.windowsCreate.push(structuredClone(properties));
        const windowId = nextWindowId++;
        const tab = {
          id: nextTabId++,
          windowId,
          active: true,
          status: 'complete',
          url: properties.url,
        };
        const win = { id: windowId, type: 'normal', tabs: [tab] };
        tabs.set(tab.id, tab);
        windows.set(windowId, win);
        queueMicrotask(() => callback(structuredClone(win)));
      },
      get(windowId, _options, callback) {
        queueMicrotask(() => {
          const win = windows.get(windowId);
          if (!win) chrome.runtime.lastError = { message: `No window with id: ${windowId}.` };
          callback(win ? structuredClone(win) : undefined);
          chrome.runtime.lastError = null;
        });
      },
      remove(windowId, callback) {
        const win = windows.get(windowId);
        for (const tab of win?.tabs || []) tabs.delete(tab.id);
        windows.delete(windowId);
        queueMicrotask(() => callback());
      },
    },
  };

  const sessions = {
    async attachTab(runId, tab) {
      calls.attached.push([runId, structuredClone(tab)]);
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

  const context = vm.createContext({
    URL,
    chrome,
    clearTimeout: timers.clearTimeout,
    console,
    queueMicrotask,
    setTimeout: timers.setTimeout,
    structuredClone,
  });
  vm.runInContext(fs.readFileSync(helperPath, 'utf8'), context, {
    filename: helperPath,
  });
  const helper = context.KidItemCollectionWindow.create({
    cancelKey: 'collection-cancel',
    chrome,
    delay: async () => {},
    sessions,
    statusKey: 'collection-status',
    storageKey: 'owned-window',
  });

  return { calls, helper, timers };
}

// Regression: ISSUE-002 — a tab closed after manualSync starts waited 180s
// instead of entering the existing one-shot replacement path.
// Found by /qa on 2026-07-28
// Report: .gstack/qa-reports/qa-report-localhost-2026-07-28.md
test('ad sync immediately replaces a tab closed after its message channel opens', async () => {
  const { calls, helper, timers } = createChromeHarness();
  const collection = helper.collectTargets({
    environmentId: 'local',
    producer: 'advertising.ad_sync',
    runId: 'run-channel-close-recovery',
    startedAt: 1,
    targets: [
      {
        id: 'ads',
        label: '광고 동기화',
        url: 'https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1',
      },
    ],
  });
  const outcome = await Promise.race([
    collection.then(() => 'completed'),
    new Promise((resolve) => setTimeout(() => resolve('hung'), 30)),
  ]);

  if (outcome === 'hung') {
    timers.fireDelay(180000);
    await collection;
  }

  assert.equal(outcome, 'completed');
  assert.equal(calls.windowsCreate.length, 2);
  assert.equal(calls.attached.length, 2);
  assert.notEqual(calls.attached[0][1].tabId, calls.attached[1][1].tabId);
});
