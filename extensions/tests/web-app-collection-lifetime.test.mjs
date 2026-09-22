import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sessionPath = path.join(repoRoot, 'extensions/shared/collection-session.js');
const lifetimePath = path.join(
  repoRoot,
  'extensions/kiditem-os/background/web-app-collection-lifetime.js',
);
const ATTEMPT_LOCAL = '11111111-1111-4111-8111-111111111111';
const ATTEMPT_LOCAL_NEXT = '22222222-2222-4222-8222-222222222222';
const ATTEMPT_OFFICE = '33333333-3333-4333-8333-333333333333';

function event() {
  const listeners = new Set();
  return {
    listeners,
    addListener(listener) {
      listeners.add(listener);
    },
    removeListener(listener) {
      listeners.delete(listener);
    },
    emit(...args) {
      for (const listener of [...listeners]) listener(...args);
    },
  };
}

function createHarness({
  localTabs = [],
  officeTabs = [],
  queryErrors = {},
  authReady = true,
  /** 소유자에게 말을 걸 때마다 불린다. 동시에 몇 개가 떠 있는지 재는 데 쓴다. */
  onOwnerCancel = null,
} = {}) {
  const storage = {};
  const connectedEnvironments = new Set(
    authReady ? ['local', 'office'] : [],
  );
  const appTabs = {
    local: structuredClone(localTabs),
    office: structuredClone(officeTabs),
  };
  const calls = {
    query: [],
    removed: [],
    cancellations: [],
    additionalCancellations: [],
    additionalRetries: [],
    recoveries: [],
    order: [],
  };
  const onRemoved = event();
  const onCreated = event();
  const onUpdated = event();
  const onChanged = event();
  const chrome = {
    storage: {
      local: {
        async get(key) {
          return { [key]: structuredClone(storage[key]) };
        },
        async set(values) {
          Object.assign(storage, structuredClone(values));
        },
        async remove(key) {
          delete storage[key];
        },
      },
      onChanged,
    },
    tabs: {
      async query(query) {
        const environmentId = query?.url === 'http://kiditem-office/*' ? 'office' : 'local';
        calls.query.push({ environmentId, query: structuredClone(query) });
        if (queryErrors[environmentId]) throw queryErrors[environmentId];
        const expectedUrl = environmentId === 'office'
          ? 'http://kiditem-office/dashboard'
          : 'http://localhost:3000/dashboard';
        return structuredClone(appTabs[environmentId]).map((tab) => ({
          ...tab,
          url: tab.url || expectedUrl,
        }));
      },
      async remove(tabId) {
        calls.removed.push(tabId);
      },
      onRemoved,
      onCreated,
      onUpdated,
    },
    scripting: {
      async executeScript() {
        return [];
      },
    },
  };

  const context = vm.createContext({ console, structuredClone, URL, chrome });
  vm.runInContext(fs.readFileSync(sessionPath, 'utf8'), context, { filename: sessionPath });
  vm.runInContext(fs.readFileSync(lifetimePath, 'utf8'), context, { filename: lifetimePath });

  const manager = context.KidItemCollectionSession.create({
    chrome,
    storageKey: 'sessions',
    webUrlPatterns: ['http://localhost:3000/*', 'http://kiditem-office/*'],
    now: () => 100,
  });
  const domain = {
    cancelCollectionSession: async (attemptId, environmentId) => {
      calls.order.push(`owner:${attemptId}`);
      calls.cancellations.push({ attemptId, environmentId });
      if (onOwnerCancel) await onOwnerCancel(attemptId, environmentId);
      return manager.cancel(attemptId, {
        closeManagedTab: true,
        ownerFailure: async () => ({ accepted: true }),
      });
    },
    cancelAdditionalCollections: async (environmentId) => {
      calls.order.push(`additional:${environmentId}`);
      calls.additionalCancellations.push(environmentId);
    },
    retryAdditionalCollections: async (environmentId) => {
      calls.order.push(`additional-retry:${environmentId}`);
      calls.additionalRetries.push(environmentId);
    },
    recoverCollections: async (environmentId) => {
      calls.recoveries.push(environmentId);
    },
  };
  const environmentContext = {
    environmentIds: ['local', 'office'],
    requireEnvironment: (environmentId) => ({
      webOrigin: environmentId === 'office'
        ? 'http://kiditem-office'
        : 'http://localhost:3000',
    }),
    queryWebTabs: async (environmentId) => {
      const pattern = environmentId === 'office'
        ? 'http://kiditem-office/*'
        : 'http://localhost:3000/*';
      return chrome.tabs.query({ url: pattern });
    },
  };
  const authContext = {
    connectedEnvironmentIds: async () => [...connectedEnvironments],
  };
  const domains = {
    forProducer(producer) {
      return producer === 'inventory.sellpia' ? domain : null;
    },
    list() {
      return [domain];
    },
  };
  const lifetime = context.KidItemWebAppCollectionLifetime.create({
    chrome,
    environmentContext,
    authContext,
    sessions: manager,
    domains,
    keepAlive: { during: (operation) => Promise.resolve(operation) },
  });

  return {
    appTabs,
    calls,
    chrome,
    context,
    domain,
    lifetime,
    manager,
    onCreated,
    onChanged,
    onRemoved,
    onUpdated,
    setAuthReady(environmentId, connected) {
      if (connected) connectedEnvironments.add(environmentId);
      else connectedEnvironments.delete(environmentId);
    },
    storage,
  };
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}

async function waitFor(predicate, timeoutMs = 500) {
  const deadline = Date.now() + timeoutMs;
  let result = await predicate();
  while (!result && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1));
    result = await predicate();
  }
  assert.equal(result, true, 'expected lifetime operation to progress');
}

async function start(manager, attemptId, environmentId = 'local') {
  return manager.start({
    attemptId,
    environmentId,
    producer: 'inventory.sellpia',
  });
}

test('쌓인 세션을 정리할 때 소유자에게 한꺼번에 몰아 묻지 않는다', async () => {
  // 끝났는데도 지워지지 않은 세션이 쌓이면 정리 한 번이 그 수만큼 `/control` 읽기를
  // 동시에 쏜다. 실제로 40개가 몰려 API 분당 한도를 통째로 먹었고, 읽기가 429 로 실패하니
  // 세션을 지우지도 못해 같은 40개를 다시 쏘는 고리가 됐다(2026-09-21 라이브).
  let inFlight = 0;
  let peak = 0;
  const release = [];
  const harness = createHarness({
    localTabs: [{ id: 101 }],
    onOwnerCancel: async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => release.push(resolve));
      inFlight -= 1;
    },
  });
  const attempts = Array.from({ length: 12 }, (_, index) =>
    `4${String(index).padStart(7, '0')}-4444-4444-8444-444444444444`);
  for (const attemptId of attempts) await start(harness.manager, attemptId);

  harness.lifetime.install();
  harness.appTabs.local = [];
  harness.onRemoved.emit(101, { windowId: 1, isWindowClosing: true });

  // 묶음이 끝나야 다음 묶음이 뜬다. 다 풀릴 때까지 돌려 준다.
  for (let guard = 0; guard < 60; guard += 1) {
    await flush();
    for (const resolve of release.splice(0)) resolve();
    if (harness.calls.cancellations.length >= attempts.length && release.length === 0) break;
  }
  await flush();

  assert.equal(harness.calls.cancellations.length, attempts.length);
  assert.ok(peak <= 4, `동시에 ${peak} 개가 떴습니다 — 4 개 이하여야 합니다`);
});

test('last-tab policy keeps one-of-many tabs alive and cancels only the matching environment', async () => {
  const harness = createHarness({
    localTabs: [{ id: 101 }, { id: 102 }],
    officeTabs: [{ id: 201 }],
  });
  await start(harness.manager, ATTEMPT_LOCAL);
  await start(harness.manager, ATTEMPT_OFFICE, 'office');
  await harness.manager.attachTab(ATTEMPT_LOCAL, {
    tabId: 900,
    windowId: 90,
    closeOnCancel: true,
  });

  harness.lifetime.install();
  harness.appTabs.local = [{ id: 102, hidden: true, minimized: true }];
  harness.onRemoved.emit(101, { windowId: 1, isWindowClosing: false });
  await flush();
  assert.deepEqual(harness.calls.cancellations, []);
  assert.ok(await harness.manager.getOwned(ATTEMPT_LOCAL, 'local'));

  harness.appTabs.local = [];
  harness.onRemoved.emit(102, { windowId: 1, isWindowClosing: true });
  await flush();
  assert.deepEqual(harness.calls.cancellations, [{
    attemptId: ATTEMPT_LOCAL,
    environmentId: 'local',
  }]);
  assert.equal(await harness.manager.getOwned(ATTEMPT_LOCAL, 'local'), null);
  assert.ok(await harness.manager.getOwned(ATTEMPT_OFFICE, 'office'));
  assert.deepEqual(harness.calls.removed, [900]);
  assert.deepEqual(harness.calls.additionalCancellations, ['local']);
});

test('reload/navigation and failed tab queries do not prove an app closure', async () => {
  const harness = createHarness({
    localTabs: [{ id: 101 }],
    officeTabs: [{ id: 201 }],
    queryErrors: { local: new Error('tabs unavailable') },
  });
  await start(harness.manager, ATTEMPT_LOCAL);
  harness.lifetime.install();

  // No onRemoved event represents an internal route change or reload.
  await flush();
  assert.ok(await harness.manager.getOwned(ATTEMPT_LOCAL, 'local'));

  harness.onRemoved.emit(101, { windowId: 1, isWindowClosing: false });
  await flush();
  assert.ok(await harness.manager.getOwned(ATTEMPT_LOCAL, 'local'));
  assert.deepEqual(harness.calls.cancellations, []);
  assert.deepEqual(harness.calls.additionalCancellations, []);
});

test('a slow managed-tab close does not block fencing or cancellation of another attempt', async () => {
  const harness = createHarness();
  await start(harness.manager, ATTEMPT_LOCAL);
  await start(harness.manager, ATTEMPT_LOCAL_NEXT);
  await harness.manager.attachTab(ATTEMPT_LOCAL, { tabId: 900, windowId: 90 });
  await harness.manager.attachTab(ATTEMPT_LOCAL_NEXT, { tabId: 901, windowId: 91 });

  let releaseSlowClose;
  const slowClose = new Promise((resolve) => { releaseSlowClose = resolve; });
  harness.chrome.tabs.remove = async (tabId) => {
    if (tabId === 900) await slowClose;
    harness.calls.removed.push(tabId);
  };
  harness.lifetime.install();
  harness.appTabs.local = [];
  harness.onRemoved.emit(101, { windowId: 1, isWindowClosing: true });

  await waitFor(() => harness.calls.cancellations.some(({ attemptId }) => attemptId === ATTEMPT_LOCAL_NEXT));
  assert.equal(await harness.manager.isActive(ATTEMPT_LOCAL_NEXT, 'local', 'inventory.sellpia'), false);
  assert.ok(harness.calls.additionalCancellations.includes('local'));
  assert.ok(
    harness.calls.order.indexOf('additional:local') <
      harness.calls.order.indexOf(`owner:${ATTEMPT_LOCAL_NEXT}`),
  );

  releaseSlowClose();
  await waitFor(() => harness.calls.cancellations.some(({ attemptId }) => attemptId === ATTEMPT_LOCAL));
  await flush();
});

test('presence requires the exact environment origin, including the local port', async () => {
  const harness = createHarness({
    localTabs: [{ id: 101, url: 'http://localhost:3001/dashboard' }],
    officeTabs: [{ id: 201, url: 'http://kiditem-office/dashboard' }],
  });
  await start(harness.manager, ATTEMPT_LOCAL);
  await harness.manager.start({
    attemptId: ATTEMPT_OFFICE,
    environmentId: 'office',
    producer: 'inventory.sellpia',
  });
  harness.lifetime.install();
  harness.onRemoved.emit(101, { windowId: 1, isWindowClosing: false });
  await flush();

  // The wrong-port local tab is not local KidItem; Office remains isolated.
  assert.equal(await harness.manager.getOwned(ATTEMPT_LOCAL, 'local'), null);
  assert.ok(await harness.manager.getOwned(ATTEMPT_OFFICE, 'office'));
  assert.deepEqual(harness.calls.cancellations, [{
    attemptId: ATTEMPT_LOCAL,
    environmentId: 'local',
  }]);
});

test('admission race fences and cancels a source that starts after the last tab closed', async () => {
  const harness = createHarness();
  let lifetime;
  const manager = harness.context.KidItemCollectionSession.create({
    chrome: harness.chrome,
    storageKey: 'race-sessions',
    webUrlPatterns: ['http://localhost:3000/*'],
    onStarted: (started) => lifetime.ensureSessionCanRun(started),
  });
  lifetime = harness.context.KidItemWebAppCollectionLifetime.create({
    chrome: harness.chrome,
    environmentContext: {
      environmentIds: ['local', 'office'],
      requireEnvironment: (environmentId) => ({
        webOrigin: environmentId === 'office'
          ? 'http://kiditem-office'
          : 'http://localhost:3000',
      }),
      queryWebTabs: async (environmentId) => harness.environmentContext?.queryWebTabs(environmentId) ?? [],
    },
    sessions: manager,
    domains: harness.contextDomains || {
      forProducer: () => ({
        cancelCollectionSession: (attemptId, environmentId) => manager.cancel(attemptId, {
          ownerFailure: async () => ({ accepted: true }),
          closeManagedTab: true,
          environmentId,
        }),
      }),
      list: () => [],
    },
  });

  await assert.rejects(
    start(manager, ATTEMPT_LOCAL),
    (error) => error?.code === 'COLLECTION_CANCELLED',
  );
  assert.equal(await manager.get(ATTEMPT_LOCAL), null);
});

test('admission fences a late start independently of an earlier in-flight cleanup snapshot', async () => {
  const harness = createHarness();
  await start(harness.manager, ATTEMPT_LOCAL);

  let releaseOwner;
  const ownerGate = new Promise((resolve) => { releaseOwner = resolve; });
  const originalCancel = harness.domain.cancelCollectionSession;
  harness.domain.cancelCollectionSession = async (...args) => {
    harness.calls.cancellations.push({ attemptId: args[0], environmentId: args[1] });
    await ownerGate;
    return originalCancel(...args);
  };

  harness.lifetime.install();
  harness.appTabs.local = [];
  harness.onRemoved.emit(101, { windowId: 1, isWindowClosing: true });
  await waitFor(() => harness.calls.cancellations.length === 1);

  const started = await start(harness.manager, ATTEMPT_LOCAL_NEXT);
  const admission = harness.lifetime.ensureSessionCanRun({
    ...started,
    producer: 'inventory.sellpia',
  }).then(
    () => ({ status: 'fulfilled' }),
    (error) => ({ status: 'rejected', error }),
  );
  await waitFor(() => harness.calls.cancellations.length === 2);
  assert.equal(await harness.manager.isActive(ATTEMPT_LOCAL_NEXT, 'local', 'inventory.sellpia'), false);

  releaseOwner();
  const admissionResult = await admission;
  assert.equal(admissionResult.status, 'rejected');
  assert.equal(admissionResult.error?.code, 'COLLECTION_CANCELLED');
  assert.equal(await harness.manager.get(ATTEMPT_LOCAL_NEXT), null);
});

test('late admission fences and closes its own tab while earlier cleanup is still closing another tab', async () => {
  const harness = createHarness();
  await start(harness.manager, ATTEMPT_LOCAL);
  await harness.manager.attachTab(ATTEMPT_LOCAL, { tabId: 900, windowId: 90 });

  let releaseSlowClose;
  const slowClose = new Promise((resolve) => { releaseSlowClose = resolve; });
  harness.chrome.tabs.remove = async (tabId) => {
    if (tabId === 900) await slowClose;
    harness.calls.removed.push(tabId);
  };

  harness.lifetime.install();
  harness.appTabs.local = [];
  harness.onRemoved.emit(101, { windowId: 1, isWindowClosing: true });

  const started = await start(harness.manager, ATTEMPT_LOCAL_NEXT);
  await harness.manager.attachTab(ATTEMPT_LOCAL_NEXT, { tabId: 901, windowId: 91 });
  const admission = harness.lifetime.ensureSessionCanRun({
    ...started,
    producer: 'inventory.sellpia',
  }).then(
    () => ({ status: 'fulfilled' }),
    (error) => ({ status: 'rejected', error }),
  );

  await waitFor(() =>
    harness.manager.isActive(ATTEMPT_LOCAL_NEXT, 'local', 'inventory.sellpia')
      .then((active) => active === false),
  );
  assert.ok(harness.calls.removed.includes(901));

  releaseSlowClose();
  const admissionResult = await admission;
  assert.equal(admissionResult.status, 'rejected');
  assert.equal(admissionResult.error?.code, 'COLLECTION_CANCELLED');
  await waitFor(() => harness.manager.getOwned(ATTEMPT_LOCAL_NEXT, 'local').then((value) => value === null));
});

test('startup reconciles persisted stop intents before recovery and never resumes them', async () => {
  const harness = createHarness({ localTabs: [{ id: 101 }], officeTabs: [] });
  await start(harness.manager, ATTEMPT_LOCAL);
  await harness.manager.requestCancellation(ATTEMPT_LOCAL, 'local');
  await start(harness.manager, ATTEMPT_LOCAL_NEXT);

  const recoveryOrder = [];
  harness.domain.recoverCollections = async (environmentId) => {
    recoveryOrder.push({
      environmentId,
      stoppedAttempt: await harness.manager.get(ATTEMPT_LOCAL),
    });
  };

  await harness.lifetime.initialize();
  assert.equal(await harness.manager.get(ATTEMPT_LOCAL), null);
  assert.ok(await harness.manager.getOwned(ATTEMPT_LOCAL_NEXT, 'local'));
  assert.deepEqual(recoveryOrder, [{ environmentId: 'local', stoppedAttempt: null }]);
  assert.deepEqual(harness.calls.cancellations, [{
    attemptId: ATTEMPT_LOCAL,
    environmentId: 'local',
  }]);
  assert.deepEqual(harness.calls.additionalCancellations, ['office']);
});

test('startup with no web app cancels active sessions without recovering them', async () => {
  const harness = createHarness();
  await start(harness.manager, ATTEMPT_LOCAL);
  await harness.lifetime.initialize();

  assert.equal(await harness.manager.get(ATTEMPT_LOCAL), null);
  assert.deepEqual(harness.calls.recoveries, []);
  assert.deepEqual(harness.calls.cancellations, [{
    attemptId: ATTEMPT_LOCAL,
    environmentId: 'local',
  }]);
});

test('a domain cancellation result of false remains unsettled', async () => {
  const harness = createHarness({ localTabs: [], officeTabs: [{ id: 201 }] });
  harness.domain.cancelAdditionalCollections = async (environmentId) =>
    environmentId === 'local' ? false : undefined;

  const result = await harness.lifetime.initialize();
  assert.equal(result.cleanupSettled.get('local'), false);
  assert.equal(result.cleanupSettled.get('office'), true);
});

test('startup retries pending non-session cleanup before recovery and blocks recovery when it remains unsettled', async () => {
  const harness = createHarness({ localTabs: [{ id: 101 }], officeTabs: [] });
  harness.domain.retryAdditionalCollections = async (environmentId) => {
    harness.calls.additionalRetries.push(environmentId);
    return environmentId === 'local' ? false : true;
  };

  const result = await harness.lifetime.initialize();
  assert.deepEqual(harness.calls.additionalRetries, ['local']);
  assert.equal(result.cleanupSettled.get('local'), false);
  assert.deepEqual(harness.calls.recoveries, []);
  assert.deepEqual(harness.calls.additionalCancellations, ['office']);
});

test('auth handoff retries only fenced non-session cleanup when no session request remains', async () => {
  const harness = createHarness({ localTabs: [{ id: 101 }], authReady: false });
  let fenced = false;
  let activeAdditionalWork = false;
  let activeWorkCancelled = 0;
  harness.domain.cancelAdditionalCollections = async (environmentId) => {
    if (environmentId !== 'local') return undefined;
    harness.calls.additionalCancellations.push(environmentId);
    if (activeAdditionalWork) activeWorkCancelled += 1;
    fenced = true;
    return false;
  };
  harness.domain.retryAdditionalCollections = async (environmentId) => {
    harness.calls.additionalRetries.push(environmentId);
    assert.equal(fenced, true);
    // A new non-session run may have started after the original fence. This
    // retry seam must not call the broad cancellation hook or touch that run.
    return true;
  };

  harness.lifetime.install();
  harness.appTabs.local = [];
  harness.onRemoved.emit(101, { windowId: 1, isWindowClosing: true });
  await flush();
  activeAdditionalWork = true;

  harness.appTabs.local = [{ id: 102 }];
  harness.setAuthReady('local', true);
  harness.onCreated.emit({ id: 102, url: 'http://localhost:3000/dashboard' });
  await flush();

  assert.deepEqual(harness.calls.additionalCancellations, ['local']);
  assert.deepEqual(harness.calls.additionalRetries, ['local']);
  assert.equal(activeWorkCancelled, 0);
  assert.deepEqual(harness.calls.cancellations, []);
});

test('reopening an app retries a fenced owner cancellation without auto-recovery', async () => {
  const harness = createHarness({ authReady: false });
  let failuresRemaining = 1;
  const originalCancel = harness.domain.cancelCollectionSession;
  harness.domain.cancelCollectionSession = async (...args) => {
    if (failuresRemaining > 0) {
      failuresRemaining -= 1;
      harness.calls.cancellations.push({ attemptId: args[0], environmentId: args[1] });
      throw new Error('owner unavailable');
    }
    return originalCancel(...args);
  };
  await start(harness.manager, ATTEMPT_LOCAL);
  harness.lifetime.install();
  harness.onRemoved.emit(900, { windowId: 1, isWindowClosing: true });
  await flush();
  assert.ok(await harness.manager.getOwned(ATTEMPT_LOCAL, 'local'));
  assert.equal(await harness.manager.isActive(ATTEMPT_LOCAL, 'local', 'inventory.sellpia'), false);

  harness.appTabs.local = [{ id: 901 }];
  harness.onCreated.emit({ id: 901, url: 'http://localhost:3000/dashboard' });
  await flush();
  assert.ok(await harness.manager.getOwned(ATTEMPT_LOCAL, 'local'));
  assert.equal(harness.calls.cancellations.length, 1);
  harness.setAuthReady('local', true);
  harness.onChanged.emit({
    kiditem_environment_profiles_v1: { newValue: { local: { accessToken: 'auth-token' } } },
  }, 'local');
  await flush();
  assert.equal(await harness.manager.getOwned(ATTEMPT_LOCAL, 'local'), null);
  assert.deepEqual(harness.calls.cancellations, [
    { attemptId: ATTEMPT_LOCAL, environmentId: 'local' },
    { attemptId: ATTEMPT_LOCAL, environmentId: 'local' },
  ]);
  assert.deepEqual(harness.calls.recoveries, []);
});
