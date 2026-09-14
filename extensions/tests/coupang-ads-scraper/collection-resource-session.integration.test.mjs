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
  attemptWire: path.join(
    repoRoot,
    'extensions/kiditem-os/background/sourcing/source-attempt-wire.js',
  ),
  adCampaignOwner: path.join(
    repoRoot,
    'extensions/kiditem-os/background/coupang/ad-campaign-source-owner.js',
  ),
  wingTrafficOwner: path.join(
    repoRoot,
    'extensions/kiditem-os/background/coupang/wing-traffic-source-owner.js',
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

function loadRuntime(harness, binding, windowOptions = {}) {
  const context = vm.createContext({
    AbortController,
    Headers,
    TextEncoder,
    URL,
    clearTimeout,
    console,
    crypto,
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
  for (const sourcePath of Object.values(sourcePaths)) {
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
    ...windowOptions,
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

const OWNER_ATTEMPT_TOKEN = '99999999-9999-4999-8999-999999999999';
const OWNER_CHANNEL_ACCOUNT = '88888888-8888-4888-8888-888888888888';

function adCampaignControl(id) {
  const businessDates = Array.from({ length: 31 }, (_, index) =>
    new Date(Date.parse('2026-09-05T00:00:00Z') - index * 86_400_000).toISOString().slice(0, 10));
  return {
    attemptId: id,
    attemptToken: OWNER_ATTEMPT_TOKEN,
    channelAccountId: OWNER_CHANNEL_ACCOUNT,
    state: 'RUNNING',
    expiresAt: '2030-01-02T00:00:00.000Z',
    manifestChecksum: 'a'.repeat(64),
    errorCode: null,
    errorMessage: null,
    plan: {
      sourceType: 'coupang_ad_campaign',
      parserVersion: 'ad-campaign-v1',
      channelAccountId: OWNER_CHANNEL_ACCOUNT,
      expectedAdvertiserId: 'A0001',
      captureMode: 'campaign_sweep',
      startDate: '2026-08-06',
      endDate: '2026-09-05',
      businessDates,
    },
    pages: [],
    campaigns: [],
    receipts: [],
  };
}

function wingTrafficControl(id) {
  return {
    attemptId: id,
    attemptToken: OWNER_ATTEMPT_TOKEN,
    channelAccountId: OWNER_CHANNEL_ACCOUNT,
    state: 'RUNNING',
    expiresAt: '2030-01-02T00:00:00.000Z',
    manifestChecksum: 'b'.repeat(64),
    errorCode: null,
    errorMessage: null,
    plan: {
      sourceType: 'coupang_wing_traffic',
      parserVersion: 'wing-traffic-daily-v2',
      channelAccountId: OWNER_CHANNEL_ACCOUNT,
      expectedAdvertiserId: 'A0001',
      providerVendorId: 'A0001',
      startDate: '2026-09-05',
      endDate: '2026-09-06',
      businessDate: '2026-09-06',
      periodDays: 2,
      expectedDates: ['2026-09-05', '2026-09-06'],
      filterScope: 'ALL_NORMAL_RFM',
      targetUrl: 'https://wing.coupang.com/tenants/business-insight/sales-analysis?start_date=2026-09-05&end_date=2026-09-06',
    },
    receipts: [],
  };
}

// A minimal source-owner server: attempt control reads and failure reports.
function createOwnerServer() {
  const controls = new Map();
  const gates = new Map();
  const reply = (value, status = 200) => ({ ok: status < 400, status, json: async () => clone(value) });
  return {
    put(control) { controls.set(control.attemptId, control); },
    gate(pathname) {
      const entered = deferred();
      const released = deferred();
      gates.set(pathname, { entered, released });
      return { entered: entered.promise, release: () => released.resolve() };
    },
    async request(_environmentId, pathname, init = {}) {
      const gate = gates.get(pathname);
      if (gate) {
        gates.delete(pathname);
        gate.entered.resolve();
        await gate.released.promise;
      }
      const match = /^\/api\/ads\/(?:ad-campaigns|traffic)\/attempts\/([^/]+)\/(control|fail)$/.exec(pathname);
      const control = match ? controls.get(decodeURIComponent(match[1])) : null;
      if (!control) return reply({ message: 'not found' }, 404);
      if (match[2] === 'fail' && init.method === 'POST') {
        const body = JSON.parse(init.body);
        Object.assign(control, { state: 'FAILED', errorCode: body.code, errorMessage: body.message });
      }
      return reply(control);
    },
  };
}

async function settle(turns = 25) {
  for (let turn = 0; turn < turns; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

// Wires two Coupang source owners onto one shared collection window, the way
// the Coupang worker does: each owner takes the window's turn for its whole
// run and reports whether an earlier attempt has ended.
function createOwnerRuntime(harness) {
  const owners = {};
  const binding = {
    environment: null,
    async bindTab(_tabId, environmentId) {
      binding.environment?.requireEnvironment(environmentId);
    },
  };
  const runtime = loadRuntime(harness, binding, {
    attemptEnded: async (session) => {
      if (session.producer === 'advertising.ad_sync') {
        return owners.adCampaign.attemptEnded('local', session.attemptId);
      }
      if (session.producer === 'dashboard.wing_sales') {
        return owners.wingTraffic.attemptEnded('local', session.attemptId);
      }
      return false;
    },
    collectionName: (session) => ({
      'advertising.ad_sync': '쿠팡 광고 캠페인',
      'dashboard.wing_sales': '쿠팡 Wing 트래픽',
    })[session.producer] || null,
  });
  binding.environment = runtime.environment;
  const { context, sessions, window } = runtime;
  const server = createOwnerServer();
  const collectorOptions = { window, chrome: harness.chrome, sessions, bindTab: binding.bindTab, delay: async () => {} };
  const adCenter = context.KidItemAdCenterCollector.create({ ...collectorOptions, statusKey: 'ad-status', cancelKey: 'ad-cancel' });
  const wingReport = context.KidItemWingReportCollector.create({ ...collectorOptions, statusKey: 'wing-status', cancelKey: 'wing-cancel' });
  const ownerOptions = {
    chrome: harness.chrome,
    sessions,
    request: server.request,
    environmentForTab: async () => 'local',
    ownedTab: async (_environmentId, id) => (await window.reattach(id))?.tabId,
    closeAttempt: (_environmentId, id) => window.close(id),
    takeWindowTurn: (_environmentId, operation) => window.runExclusive(operation),
  };
  owners.adCampaign = context.KidItemAdCampaignSourceOwner.create({
    ...ownerOptions,
    collect: (input) => adCenter.collectCampaigns(input),
  });
  owners.wingTraffic = context.KidItemWingTrafficSourceOwnerV2.create({
    ...ownerOptions,
    collect: (input) => wingReport.collectTraffic(input),
  });
  return { ...runtime, server, owners };
}

test('a collection started while another is finishing waits for its outcome and cleanup, then takes the window', async () => {
  const harness = createChromeHarness();
  const runtime = createOwnerRuntime(harness);
  const adId = attemptId(31);
  const wingId = attemptId(32);
  runtime.server.put(adCampaignControl(adId));
  runtime.server.put(wingTrafficControl(wingId));
  harness.responses.push(
    { success: false, error: '광고 캠페인 상세 페이지를 열지 못했습니다.' },
    { success: false, error: 'Wing 매출분석 표를 읽지 못했습니다.' },
  );
  const adReporting = runtime.server.gate(`/api/ads/ad-campaigns/attempts/${adId}/fail`);

  const adRun = runtime.owners.adCampaign.run({ environmentId: 'local', attemptId: adId });
  await adReporting.entered;
  // Incident 2026-09-14: Wing traffic started while the ad sweep was still
  // reporting its failure, and was refused the window.
  const wingRun = runtime.owners.wingTraffic.run({ environmentId: 'local', attemptId: wingId });
  await settle();
  assert.equal(harness.calls.messages.length, 1, 'the Wing collection waits while the ad collection reports');
  assert.equal(harness.calls.windowsCreate.length, 1);

  adReporting.release();
  const [adOutcome, wingOutcome] = await Promise.all([adRun, wingRun]);

  assert.equal(adOutcome.terminalState, 'FAILED');
  assert.equal(adOutcome.error, '광고 캠페인 상세 페이지를 열지 못했습니다.');
  assert.equal(wingOutcome.terminalState, 'FAILED');
  assert.equal(wingOutcome.errorCode, 'WING_TRAFFIC_COLLECTION_FAILED', 'the Wing collection ran instead of being refused');
  assert.equal(wingOutcome.error, 'Wing 매출분석 표를 읽지 못했습니다.');
  assert.deepEqual(harness.calls.messages.map(({ message }) => message.syncMode), ['campaign_sweep', 'wing_traffic']);
  assert.deepEqual(harness.calls.windowsRemove, [20, 21], 'the ad window closed before the Wing window opened');
  assert.equal(await runtime.sessions.get(adId), null);
  assert.equal(await runtime.sessions.get(wingId), null);
});

test('another collection clears the attention leftover of an ended ad attempt through its owner read', async () => {
  const harness = createChromeHarness();
  const runtime = createOwnerRuntime(harness);
  const adId = attemptId(41);
  const wingId = attemptId(42);
  runtime.server.put(adCampaignControl(adId));
  runtime.server.put(wingTrafficControl(wingId));
  harness.responses.push(
    { success: false, pendingLogin: true, error: '쿠팡 광고센터 로그인이 필요합니다.' },
    { success: false, error: 'Wing 매출분석 표를 읽지 못했습니다.' },
  );

  const adOutcome = await runtime.owners.adCampaign.run({ environmentId: 'local', attemptId: adId });
  assert.equal(adOutcome.terminalState, 'FAILED');
  assert.equal((await runtime.sessions.get(adId))?.attention?.reason, 'marketplace_login',
    'finish keeps the attention session of the failed attempt');
  assert.equal(harness.storage['owned-window']?.runId, adId, 'and leaves its window open');

  const wingOutcome = await runtime.owners.wingTraffic.run({ environmentId: 'local', attemptId: wingId });

  assert.equal(wingOutcome.terminalState, 'FAILED');
  assert.equal(wingOutcome.errorCode, 'WING_TRAFFIC_COLLECTION_FAILED', 'the leftover did not refuse the Wing collection');
  assert.equal(await runtime.sessions.get(adId), null, 'the leftover session is cleared');
  assert.deepEqual(harness.calls.windowsRemove, [20, 21]);
  assert.deepEqual(harness.calls.messages.map(({ message }) => message.syncMode), ['campaign_sweep', 'wing_traffic']);
});
