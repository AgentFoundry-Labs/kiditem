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
const sourcePaths = {
  environment: path.join(repoRoot, 'extensions/shared/environment-context.js'),
  session: path.join(repoRoot, 'extensions/shared/collection-session.js'),
  window: path.join(
    repoRoot,
    'extensions/kiditem-os/background/coupang/collection-window.js',
  ),
  adCenter: path.join(
    repoRoot,
    'extensions/kiditem-os/background/coupang/ad-center-collector.js',
  ),
  wingReport: path.join(
    repoRoot,
    'extensions/kiditem-os/background/coupang/wing-report-collector.js',
  ),
};

const ATTEMPT_SEED = '00000000-0000-4000-8000-000000000';

function attemptId(suffix) {
  return `${ATTEMPT_SEED}${String(suffix).padStart(3, '0')}`;
}

function deferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function createChromeHarness({
  onCreateStarted,
  onStorageSet,
  failWindowRemove = false,
} = {}) {
  const storage = {};
  const windows = new Map();
  const tabs = new Map();
  const calls = {
    executeScript: [],
    windowsCreate: [],
    windowsRemove: [],
    tabsRemove: [],
    tabsUpdate: [],
    tabsReload: [],
    messages: [],
  };
  const updatedListeners = new Set();
  const removedListeners = new Set();
  const responses = [];
  const runtime = { lastError: null };
  let nextWindowId = 20;
  let nextTabId = 200;
  let shouldFailWindowRemove = failWindowRemove;
  let handleCreateStarted = onCreateStarted;
  let handleStorageSet = onStorageSet;

  function addWindow(windowId, tab) {
    const window = {
      id: windowId,
      type: 'normal',
      focused: windowId === 1,
      tabs: tab ? [tab] : [],
    };
    windows.set(windowId, window);
    if (tab) tabs.set(tab.id, tab);
    return window;
  }

  const userTab = {
    id: 10,
    windowId: 1,
    active: true,
    status: 'complete',
    url: 'http://localhost:3000/',
  };
  addWindow(1, userTab);

  function callbackWithRuntimeError(callback, message) {
    queueMicrotask(() => {
      runtime.lastError = message ? { message } : null;
      callback?.();
      runtime.lastError = null;
    });
  }

  function removeTab(tabId) {
    const tab = tabs.get(tabId);
    if (!tab) return false;
    tabs.delete(tabId);
    const window = windows.get(tab.windowId);
    if (window) {
      window.tabs = window.tabs.filter((entry) => entry.id !== tabId);
      // Chrome closes a normal window when its final tab is removed.
      if (window.tabs.length === 0) windows.delete(tab.windowId);
    }
    for (const listener of removedListeners) listener(tabId, { windowId: tab.windowId });
    return true;
  }

  const chrome = {
    runtime,
    storage: {
      local: {
        async get(key) {
          return { [key]: clone(storage[key]) };
        },
        async set(values) {
          const next = clone(values);
          Object.assign(storage, next);
          await handleStorageSet?.({ values: next, storage });
        },
        async remove(keys) {
          for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key];
        },
      },
    },
    scripting: {
      async executeScript(details) {
        calls.executeScript.push(details);
        return [];
      },
    },
    windows: {
      create(properties, callback) {
        calls.windowsCreate.push(clone(properties));
        const windowId = nextWindowId++;
        const tab = {
          id: nextTabId++,
          windowId,
          active: true,
          status: 'complete',
          url: properties.url,
        };
        const created = addWindow(windowId, tab);
        handleCreateStarted?.({
          window: clone(created),
          tab: clone(tab),
          callback,
        });
        if (!handleCreateStarted) queueMicrotask(() => callback?.(clone(created)));
      },
      get(windowId, _options, callback) {
        queueMicrotask(() => callback?.(clone(windows.get(windowId))));
      },
      remove(windowId, callback) {
        calls.windowsRemove.push(windowId);
        if (shouldFailWindowRemove) {
          callbackWithRuntimeError(callback, 'window removal failed');
          return;
        }
        const window = windows.get(windowId);
        if (window) {
          for (const tab of window.tabs) tabs.delete(tab.id);
          windows.delete(windowId);
        }
        queueMicrotask(() => callback?.());
      },
    },
    tabs: {
      onUpdated: {
        addListener(listener) { updatedListeners.add(listener); },
        removeListener(listener) { updatedListeners.delete(listener); },
      },
      onRemoved: {
        addListener(listener) { removedListeners.add(listener); },
        removeListener(listener) { removedListeners.delete(listener); },
      },
      query(query) {
        const values = [...tabs.values()];
        if (!query || Object.keys(query).length === 0) return Promise.resolve(clone(values));
        if (query.url) {
          const origin = String(query.url).replace(/\/\*$/, '');
          return Promise.resolve(
            clone(values.filter((tab) => String(tab.url || '').startsWith(origin))),
          );
        }
        return Promise.resolve(clone(values));
      },
      get(tabId, callback) {
        queueMicrotask(() => callback?.(clone(tabs.get(tabId))));
      },
      update(tabId, properties, callback) {
        calls.tabsUpdate.push({ tabId, properties: clone(properties) });
        const tab = tabs.get(tabId);
        if (tab) Object.assign(tab, properties);
        queueMicrotask(() => {
          callback?.(clone(tab));
          if (tab) {
            for (const listener of updatedListeners) {
              listener(tabId, { status: tab.status, url: tab.url }, clone(tab));
            }
          }
        });
      },
      reload(tabId, _options, callback) {
        calls.tabsReload.push(tabId);
        queueMicrotask(() => callback?.());
      },
      remove(tabId, callback) {
        calls.tabsRemove.push(tabId);
        const removed = removeTab(tabId);
        if (typeof callback === 'function') {
          queueMicrotask(() => callback?.(removed));
          return;
        }
        return removed ? Promise.resolve() : Promise.reject(new Error(`No tab with id: ${tabId}`));
      },
      sendMessage(tabId, message, callback) {
        calls.messages.push({ tabId, message: clone(message) });
        const response = responses.shift() || { success: true };
        if (response.runtimeError) {
          callbackWithRuntimeError(callback, response.runtimeError);
          return;
        }
        queueMicrotask(() => callback?.(clone(response)));
      },
    },
  };

  return {
    chrome,
    calls,
    storage,
    windows,
    tabs,
    responses,
    setOnCreateStarted(value) { handleCreateStarted = value; },
    setOnStorageSet(value) { handleStorageSet = value; },
    setFailWindowRemove(value) { shouldFailWindowRemove = value; },
  };
}

function loadRuntime(harness, binding) {
  const context = vm.createContext({
    AbortController,
    Headers,
    URL,
    clearTimeout,
    console,
    Date,
    Math,
    Promise,
    queueMicrotask,
    setTimeout,
    structuredClone,
    chrome: harness.chrome,
    globalThis: null,
  });
  context.globalThis = context;
  for (const sourcePath of [
    sourcePaths.environment,
    sourcePaths.session,
    sourcePaths.window,
    sourcePaths.adCenter,
    sourcePaths.wingReport,
  ]) {
    vm.runInContext(fs.readFileSync(sourcePath, 'utf8'), context, {
      filename: sourcePath,
    });
  }

  const environment = context.KidItemEnvironmentContext.create({
    chrome: harness.chrome,
    requiresAuth: false,
  });
  const sessions = context.KidItemCollectionSession.create({
    chrome: harness.chrome,
    environmentContext: environment,
    storageKey: 'collection-sessions',
    now: () => Date.now(),
  });
  const window = context.KidItemCollectionWindow.create({
    chrome: harness.chrome,
    environmentContext: environment,
    sessions,
    storageKey: 'owned-window',
    bindTab: binding.bindTab,
    delay: async () => {},
  });
  return {
    context,
    environment,
    sessions,
    window,
  };
}

function createRuntime({ phase, collectorKind, harness }) {
  const bindGate = phase === 'bind' ? deferred() : null;
  const createGate = phase === 'getOrCreate' ? deferred() : null;
  const attachGate = phase === 'attach' ? deferred() : null;
  const entered = {
    create: deferred(),
    bind: deferred(),
    attach: deferred(),
  };
  const binding = {
    calls: [],
    environment: null,
    async bindTab(tabId, environmentId) {
      binding.environment?.requireEnvironment(environmentId);
      entered.bind.resolve();
      binding.calls.push({ tabId, environmentId });
      if (bindGate) await bindGate.promise;
    },
  };
  async function releaseCreatedWindow(gate, callback, window) {
    await gate.promise;
    callback?.(clone(window));
  }
  harness.setOnCreateStarted(({ window, tab, callback }) => {
    entered.create.resolve({ window, tab });
    if (createGate) {
      void releaseCreatedWindow(createGate, callback, window);
    } else {
      queueMicrotask(() => callback?.(clone(window)));
    }
  });
  const runtime = loadRuntime(harness, binding);
  binding.environment = runtime.environment;
  const collector = collectorKind === 'ad'
    ? runtime.context.KidItemAdCenterCollector.create({
      window: runtime.window,
      chrome: harness.chrome,
      sessions: runtime.sessions,
      statusKey: 'ad-status',
      cancelKey: 'ad-cancel',
      bindTab: binding.bindTab,
      delay: async () => {},
    })
    : runtime.context.KidItemWingReportCollector.create({
      window: runtime.window,
      chrome: harness.chrome,
      sessions: runtime.sessions,
      statusKey: 'wing-status',
      cancelKey: 'wing-cancel',
      bindTab: binding.bindTab,
      delay: async () => {},
    });
  return {
    ...runtime,
    collector,
    binding,
    gates: { create: createGate, bind: bindGate, attach: attachGate },
    entered,
  };
}

function collectorInvocation(collectorKind, collector, attemptId) {
  if (collectorKind === 'ad') {
    return collector.collectKeywords({
      environmentId: 'local',
      attemptId,
      control: {},
    });
  }
  return collector.collectTraffic({
    environmentId: 'local',
    attemptId,
    control: {
      plan: {
        startDate: '2026-09-01',
        endDate: '2026-09-02',
        targetUrl: 'https://wing.coupang.com/tenants/business-insight/sales-analysis?start_date=2026-09-01&end_date=2026-09-02',
      },
    },
  });
}

async function startSession(runtime, id, producer) {
  await runtime.sessions.start({
    environmentId: 'local',
    attemptId: id,
    producer,
  });
}

const collectorCases = [
  {
    name: 'ad keyword',
    kind: 'ad',
    producer: 'advertising.ad_keyword',
  },
  {
    name: 'Wing traffic',
    kind: 'wing',
    producer: 'dashboard.wing_sales',
  },
];

for (const phase of ['getOrCreate', 'bind', 'attach']) {
  for (const collectorCase of collectorCases) {
    test(`${collectorCase.name} cancellation during ${phase} closes the real owned resource exactly once`, async () => {
      const harness = createChromeHarness();
      const runtime = createRuntime({
        phase,
        collectorKind: collectorCase.kind,
        harness,
      });
      const id = attemptId(`${phase === 'getOrCreate' ? 1 : phase === 'bind' ? 2 : 3}${collectorCase.kind === 'ad' ? 1 : 2}`);
      if (phase === 'attach') {
        let paused = false;
        harness.setOnStorageSet(async ({ values }) => {
          const session = values['collection-sessions']?.[id];
          if (paused || !Number.isInteger(session?._managedTabId)) return;
          paused = true;
          runtime.entered.attach.resolve({
            attemptId: id,
            tabId: session._managedTabId,
          });
          await runtime.gates.attach.promise;
        });
      }
      await startSession(runtime, id, collectorCase.producer);

      const collecting = collectorInvocation(collectorCase.kind, runtime.collector, id);
      const phaseEntered = runtime.entered[phase === 'getOrCreate' ? 'create' : phase];
      const enteredValue = await phaseEntered.promise;
      if (phase === 'attach') {
        assert.equal(enteredValue?.attemptId, id, 'attach completed before cancellation');
      }
      const sourceCancellation = await runtime.collector.cancelRun({ attemptId: id });
      assert.equal(sourceCancellation.success, true);
      assert.equal(sourceCancellation.cancelled, true);
      assert.equal(sourceCancellation.runId, id);
      runtime.gates[phase === 'getOrCreate' ? 'create' : phase]?.resolve();

      const result = await collecting;
      assert.equal(result.cancelled, true);
      assert.equal(result.runId, id);
      // The owner-side session cleanup is a separate public operation. It is
      // intentionally close=false here because the real collector already
      // closed its newly-owned resource after observing the source fence.
      await runtime.sessions.cancel(id);
      assert.equal(await runtime.sessions.get(id), null);
      assert.equal(harness.storage['owned-window'], undefined);
      assert.equal(harness.tabs.size, 1, 'the operator tab remains');
      assert.equal(harness.calls.windowsCreate.length, 1);
      assert.deepEqual(harness.calls.windowsRemove, [20]);
      assert.deepEqual(harness.calls.tabsRemove, []);
      assert.equal(runtime.binding.calls.length, phase === 'getOrCreate' ? 0 : 1);
    });
  }
}

test('a late tab attach is refused by the real session manager and the resource record is cleaned once', async (t) => {
  for (const collectorCase of collectorCases) {
    await t.test(collectorCase.name, async () => {
      const harness = createChromeHarness();
      const runtime = createRuntime({
        phase: 'none',
        collectorKind: collectorCase.kind,
        harness,
      });
      const id = attemptId(collectorCase.kind === 'ad' ? 11 : 12);
      await startSession(runtime, id, collectorCase.producer);

      const owned = await runtime.window.getOrCreate(id, collectorCase.kind === 'ad'
        ? 'https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdKeyword=1'
        : 'https://wing.coupang.com/tenants/business-insight/sales-analysis?start_date=2026-09-01&end_date=2026-09-02');
      // Cancellation is a real session-manager public operation. The late
      // attach is then a second real public operation against that exact tab.
      await runtime.sessions.cancel(id);
      assert.equal(await runtime.sessions.attachTab(id, {
        tabId: owned.tabId,
        windowId: owned.windowId,
      }), null);
      assert.equal(await runtime.sessions.get(id), null);
      assert.equal(await runtime.window.close(id), true);
      assert.equal(harness.storage['owned-window'], undefined);
      assert.deepEqual(harness.calls.tabsRemove, [owned.tabId]);
      assert.deepEqual(harness.calls.windowsRemove, []);
    });
  }
});

test('the real resource retains its durable record after close failure and clears it on retry', async () => {
  const harness = createChromeHarness({ failWindowRemove: true });
  const runtime = createRuntime({
    phase: 'none',
    collectorKind: 'ad',
    harness,
  });
  const id = attemptId(21);
  await startSession(runtime, id, 'advertising.ad_keyword');
  const owned = await runtime.window.getOrCreate(id, 'https://example.test/managed');
  assert.ok(await runtime.sessions.attachTab(id, {
    tabId: owned.tabId,
    windowId: owned.windowId,
  }));

  assert.equal(await runtime.window.close(id), false);
  assert.deepEqual(harness.calls.windowsRemove, [owned.windowId]);
  assert.deepEqual(harness.storage['owned-window'], {
    runId: owned.runId,
    windowId: owned.windowId,
    tabId: owned.tabId,
  });
  assert.equal(harness.tabs.has(owned.tabId), true);

  harness.setFailWindowRemove(false);
  assert.equal(await runtime.window.close(id), true);
  assert.deepEqual(harness.calls.windowsRemove, [owned.windowId, owned.windowId]);
  assert.equal(harness.storage['owned-window'], undefined);
  await runtime.sessions.cancel(id);
  assert.equal(await runtime.sessions.get(id), null);
});
