import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const canonicalPath = path.join(repoRoot, 'extensions/shared/collection-session.js');
const generatedPath = path.join(
  repoRoot,
  'extensions/kiditem-os/background/collection-session.js',
);
const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ATTEMPT_ID = '22222222-2222-4222-8222-222222222222';

function createFakeChrome(initialStorage = {}) {
  const storage = structuredClone(initialStorage);
  const calls = {
    executeScript: [],
    tabsQuery: [],
    tabsRemove: [],
    tabsUpdate: [],
    windowsUpdate: [],
  };

  return {
    calls,
    storage,
    chrome: {
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
      },
      tabs: {
        async query(query) {
          calls.tabsQuery.push(structuredClone(query));
          return [{ id: 90 }, { id: 91 }];
        },
        async remove(tabId) {
          calls.tabsRemove.push(tabId);
        },
        async update(tabId, properties) {
          calls.tabsUpdate.push({ tabId, properties: structuredClone(properties) });
        },
      },
      windows: {
        async update(windowId, properties) {
          calls.windowsUpdate.push({ windowId, properties: structuredClone(properties) });
        },
      },
      scripting: {
        async executeScript(details) {
          calls.executeScript.push(details);
        },
      },
    },
  };
}

function loadAdapter(fake = createFakeChrome()) {
  const context = vm.createContext({
    chrome: fake.chrome,
    console,
    structuredClone,
  });
  vm.runInContext(fs.readFileSync(generatedPath, 'utf8'), context, {
    filename: generatedPath,
  });
  return {
    ...fake,
    create: context.KidItemCollectionSession.create,
  };
}

function startInput(attemptId = ATTEMPT_ID) {
  return {
    environmentId: 'local',
    attemptId,
    producer: 'inventory.sellpia',
    attemptToken: 'owner-token',
    plan: { from: '2025-08-01', to: '2026-08-31' },
  };
}

function createManager(fake = createFakeChrome(), now = () => 100) {
  const runtime = loadAdapter(fake);
  const manager = runtime.create({
    chrome: runtime.chrome,
    storageKey: 'sessions',
    webUrlPatterns: ['http://localhost:3000/*'],
    now,
  });
  return { ...runtime, manager };
}

test('generated adapter is byte-identical to the canonical source', () => {
  assert.deepEqual(fs.readFileSync(generatedPath), fs.readFileSync(canonicalPath));
});

test('sync --check succeeds for the canonical and generated adapters', () => {
  const scriptPath = path.join(
    repoRoot,
    'extensions/scripts/sync-collection-session-adapters.mjs',
  );
  const result = spawnSync(process.execPath, [scriptPath, '--check'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('manager exposes only owner-correlated session controls', () => {
  const { manager } = createManager();

  assert.deepEqual(Object.keys(manager).sort(), [
    'attachTab',
    'cancel',
    'detachTab',
    'get',
    'getOwned',
    'isActive',
    'list',
    'listAll',
    'listCancellationRequests',
    'openAttentionTab',
    'ownsTab',
    'progress',
    'remove',
    'retryPendingManagedTabs',
    'requestCancellation',
    'requireAttention',
    'start',
  ].sort());
  assert.equal('restart' in manager, false);
  assert.equal('finalize' in manager, false);
  assert.equal('succeed' in manager, false);
  assert.equal('fail' in manager, false);
});

test('start stores only local session state and publishes no terminal lifecycle fields', async () => {
  const { manager, storage, calls } = createManager();

  const view = await manager.start(startInput());

  assert.deepEqual(JSON.parse(JSON.stringify(view)), {
    environmentId: 'local',
    attemptId: ATTEMPT_ID,
    producer: 'inventory.sellpia',
    progress: {
      current: 0,
      total: 0,
      completed: 0,
      failed: 0,
      label: null,
    },
    attention: null,
  });
  for (const key of [
    'runId',
    'status',
    'restartStrategy',
    'attempt',
    'finishedAt',
    'inputIdentity',
  ]) {
    assert.equal(key in view, false, key);
  }
  assert.equal(storage.sessions[ATTEMPT_ID]._ownerAttemptToken, undefined);
  assert.equal(storage.sessions[ATTEMPT_ID]._ownerPlan, undefined);
  assert.equal(calls.executeScript[0].args[0]._ownerAttemptToken, undefined);
});

test('progress and attention remain bounded local control state', async () => {
  let time = 100;
  const { manager } = createManager(createFakeChrome(), () => time);
  await manager.start(startInput());

  time = 110;
  const progressed = await manager.progress(ATTEMPT_ID, {
    current: 3,
    total: 5,
    completed: 2,
    failed: 1,
    label: '상품 수집 중',
  });
  assert.equal(progressed.attemptId, ATTEMPT_ID);
  assert.deepEqual(JSON.parse(JSON.stringify(progressed.progress)), {
    current: 3,
    total: 5,
    completed: 2,
    failed: 1,
    label: '상품 수집 중',
  });

  const attention = await manager.requireAttention(ATTEMPT_ID, {
    reason: 'marketplace_login',
    message: 'Sellpia 로그인이 필요합니다.',
  });
  assert.deepEqual(JSON.parse(JSON.stringify(attention.attention)), {
    reason: 'marketplace_login',
    message: 'Sellpia 로그인이 필요합니다.',
    canOpenTab: false,
  });
  assert.equal('status' in attention, false);
});

test('managed tab identity is private but survives for explicit attention resume', async () => {
  const { manager, storage, calls } = createManager();
  await manager.start(startInput());
  await manager.attachTab(ATTEMPT_ID, { tabId: 7, windowId: 2 });

  const attention = await manager.requireAttention(ATTEMPT_ID, {
    reason: 'captcha',
    message: '보안 확인이 필요합니다.',
  });
  assert.equal(attention.attention.canOpenTab, true);
  assert.equal(attention._managedTabId, undefined);
  assert.equal(storage.sessions[ATTEMPT_ID]._managedTabId, 7);
  assert.equal(storage.sessions[ATTEMPT_ID]._managedWindowId, 2);

  await manager.openAttentionTab(ATTEMPT_ID);
  assert.deepEqual(calls.tabsUpdate, [
    { tabId: 7, properties: { active: true } },
  ]);
  assert.deepEqual(calls.windowsUpdate, [
    { windowId: 2, properties: { focused: true } },
  ]);
});

test('ownsTab verifies the private managed tab against the exact environment and producer', async () => {
  const { manager } = createManager();
  await manager.start(startInput());
  await manager.attachTab(ATTEMPT_ID, { tabId: 7, windowId: 2 });

  assert.equal(await manager.ownsTab(ATTEMPT_ID, 'local', 'inventory.sellpia', 7), true);
  assert.equal(await manager.ownsTab(ATTEMPT_ID, 'local', 'orders.mall', 7), false);
  assert.equal(await manager.ownsTab(ATTEMPT_ID, 'office', 'inventory.sellpia', 7), false);
  assert.equal(await manager.ownsTab(ATTEMPT_ID, 'local', 'inventory.sellpia', 8), false);
  assert.equal(await manager.ownsTab(ATTEMPT_ID, 'local', 'inventory.sellpia', '7'), false);
  assert.throws(
    () => manager.ownsTab(ATTEMPT_ID, 'unknown', 'inventory.sellpia', 7),
    /Collection environment is required/,
  );

  const publicView = await manager.get(ATTEMPT_ID);
  assert.equal('tabs' in publicView, false);
  assert.equal('_managedTabId' in publicView, false);
});

test('ownsTab stops authorizing a tab after detach and cancel', async () => {
  const { manager } = createManager();
  await manager.start(startInput());
  await manager.attachTab(ATTEMPT_ID, { tabId: 7, windowId: 2 });
  assert.equal(await manager.ownsTab(ATTEMPT_ID, 'local', 'inventory.sellpia', 7), true);

  await manager.detachTab(ATTEMPT_ID, { tabId: 7 });
  assert.equal(await manager.ownsTab(ATTEMPT_ID, 'local', 'inventory.sellpia', 7), false);

  await manager.attachTab(ATTEMPT_ID, { tabId: 7, windowId: 2 });
  await manager.cancel(ATTEMPT_ID, {
    async ownerFailure() { return { accepted: true }; },
  });
  assert.equal(await manager.ownsTab(ATTEMPT_ID, 'local', 'inventory.sellpia', 7), false);
});

test('cancel submits owner failure before clearing local state', async () => {
  const { manager, storage } = createManager();
  await manager.start(startInput());
  await manager.attachTab(ATTEMPT_ID, { tabId: 7, windowId: 2 });
  const order = [];

  const cancelled = await manager.cancel(ATTEMPT_ID, {
    closeManagedTab: true,
    async ownerFailure(metadata) {
      order.push({ ...metadata });
      assert.ok(storage.sessions[ATTEMPT_ID]);
      return { accepted: true };
    },
  });

  assert.deepEqual(JSON.parse(JSON.stringify(order)), [{ attemptId: ATTEMPT_ID }]);
  assert.equal(cancelled.attemptId, ATTEMPT_ID);
  assert.equal(storage.sessions[ATTEMPT_ID], undefined);
});

test('cancel keeps local state when owner rejects the failure', async () => {
  const { manager, storage, calls } = createManager();
  await manager.start(startInput());
  await manager.attachTab(ATTEMPT_ID, { tabId: 7, windowId: 2 });

  await assert.rejects(
    manager.cancel(ATTEMPT_ID, {
      closeManagedTab: true,
      async ownerFailure() {
        return { accepted: false };
      },
    }),
    /owner/i,
  );
  assert.ok(storage.sessions[ATTEMPT_ID]);
  assert.deepEqual(calls.tabsRemove, []);
});

test('get/list are environment-scoped and duplicate starts resume the same owner attempt', async () => {
  const { manager } = createManager();
  const first = await manager.start(startInput());
  const resumed = await manager.start({
    ...startInput(),
    plan: { from: '2025-08-01', to: '2026-08-31' },
  });
  await manager.start({ ...startInput(OTHER_ATTEMPT_ID), environmentId: 'office' });

  assert.deepEqual(JSON.parse(JSON.stringify(resumed)), JSON.parse(JSON.stringify(first)));
  assert.equal((await manager.get(ATTEMPT_ID)).attemptId, ATTEMPT_ID);
  assert.equal(await manager.getOwned(ATTEMPT_ID, 'office'), null);
  assert.deepEqual(JSON.parse(JSON.stringify((await manager.list('local')).map(({ attemptId }) => attemptId))), [ATTEMPT_ID]);
  assert.deepEqual(JSON.parse(JSON.stringify((await manager.list('office')).map(({ attemptId }) => attemptId))), [OTHER_ATTEMPT_ID]);
});

test('requestCancellation fences a session before tab teardown and preserves owner correlation', async () => {
  const { manager, storage, calls } = createManager();
  await manager.start(startInput());
  await manager.attachTab(ATTEMPT_ID, { tabId: 7, windowId: 2 });

  const stopped = await manager.requestCancellation(ATTEMPT_ID, 'local');
  assert.equal(stopped.attemptId, ATTEMPT_ID);
  assert.equal(typeof storage.sessions[ATTEMPT_ID]._cancellationRequestedAt, 'number');
  assert.deepEqual(calls.tabsRemove, [7]);
  assert.equal(await manager.isActive(ATTEMPT_ID, 'local', 'inventory.sellpia'), false);
  assert.deepEqual(JSON.parse(JSON.stringify(await manager.listCancellationRequests('local'))), [{
    attemptId: ATTEMPT_ID,
    environmentId: 'local',
    producer: 'inventory.sellpia',
    requestedAt: storage.sessions[ATTEMPT_ID]._cancellationRequestedAt,
  }]);

  await assert.rejects(
    manager.start(startInput()),
    /cancellation was already requested/i,
  );

  let ownerSawCorrelation = false;
  await manager.cancel(ATTEMPT_ID, {
    ownerFailure: async ({ attemptId }) => {
      ownerSawCorrelation = Boolean(storage.sessions[attemptId]);
      return { accepted: true };
    },
  });
  assert.equal(ownerSawCorrelation, true);
  assert.equal(storage.sessions[ATTEMPT_ID], undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(await manager.listCancellationRequests('local'))), []);
});

test('requestCancellation writes the stop fence before a delayed owned-tab close resolves', async () => {
  const fake = createFakeChrome();
  let closeStarted;
  const closeStartedPromise = new Promise((resolve) => {
    closeStarted = resolve;
  });
  let releaseClose;
  const closeGate = new Promise((resolve) => {
    releaseClose = resolve;
  });
  fake.chrome.tabs.remove = async (tabId) => {
    fake.calls.tabsRemove.push(tabId);
    closeStarted();
    await closeGate;
  };
  const { manager, storage } = createManager(fake);
  await manager.start(startInput());
  await manager.attachTab(ATTEMPT_ID, { tabId: 7, windowId: 2 });

  const requesting = manager.requestCancellation(ATTEMPT_ID, 'local');
  await closeStartedPromise;
  assert.equal(typeof storage.sessions[ATTEMPT_ID]._cancellationRequestedAt, 'number');
  assert.equal(await manager.isActive(ATTEMPT_ID, 'local', 'inventory.sellpia'), false);
  releaseClose();
  await requesting;
});

test('late owned-tab attachment after a stop fence closes only that tab', async () => {
  const { manager, calls } = createManager();
  await manager.start(startInput());
  await manager.requestCancellation(ATTEMPT_ID, 'local');

  const attached = await manager.attachTab(ATTEMPT_ID, {
    tabId: 42,
    windowId: 9,
    closeOnCancel: true,
  });
  assert.equal(attached, null);
  assert.deepEqual(calls.tabsRemove, [42]);
  assert.equal(await manager.isActive(ATTEMPT_ID, 'local', 'inventory.sellpia'), false);
});

test('late managed-tab close failures stay durable across worker restart and retry', async () => {
  const fake = createFakeChrome();
  const liveTabIds = new Set();
  fake.chrome.tabs.query = async (query) => query?.url
    ? []
    : [...liveTabIds].map((id) => ({ id }));
  let closeAttempts = 0;
  fake.chrome.tabs.remove = async (tabId) => {
    closeAttempts += 1;
    fake.calls.tabsRemove.push(tabId);
    liveTabIds.add(tabId);
    throw new Error('tab is temporarily unavailable');
  };
  const { manager, storage } = createManager(fake);
  await manager.start(startInput());
  await manager.requestCancellation(ATTEMPT_ID, 'local');

  const incomingTabIds = Array.from({ length: 20 }, (_, index) => 400 + index);
  for (const tabId of incomingTabIds) {
    await assert.rejects(
      manager.attachTab(ATTEMPT_ID, { tabId, windowId: 9, closeOnCancel: true }),
      /Managed collection tab could not be removed/i,
    );
  }
  assert.equal(closeAttempts, incomingTabIds.length);
  assert.deepEqual(
    storage.sessions[ATTEMPT_ID]._pendingManagedTabIds,
    incomingTabIds,
  );
  assert.equal(await manager.isActive(ATTEMPT_ID, 'local', 'inventory.sellpia'), false);

  fake.chrome.tabs.remove = async (tabId) => {
    fake.calls.tabsRemove.push(tabId);
  };
  // A service-worker restart creates a new adapter instance over the same
  // durable chrome.storage record; the first four IDs must survive the retry.
  const restarted = createManager(fake).manager;
  assert.equal(await restarted.retryPendingManagedTabs(ATTEMPT_ID, 'local'), true);
  assert.equal(storage.sessions[ATTEMPT_ID]._pendingManagedTabIds, undefined);
  assert.deepEqual(fake.calls.tabsRemove.slice(-incomingTabIds.length), incomingTabIds);

  await restarted.cancel(ATTEMPT_ID, {
    async ownerFailure() { return { accepted: true }; },
  });
  assert.equal(storage.sessions[ATTEMPT_ID], undefined);
});

test('remove retains a fenced session when a pending late tab still cannot close', async () => {
  const fake = createFakeChrome();
  const liveTabIds = new Set();
  fake.chrome.tabs.query = async (query) => query?.url
    ? []
    : [...liveTabIds].map((id) => ({ id }));
  fake.chrome.tabs.remove = async () => {
    liveTabIds.add(42);
    throw new Error('tab is temporarily unavailable');
  };
  const { manager, storage } = createManager(fake);
  await manager.start(startInput());
  await manager.requestCancellation(ATTEMPT_ID, 'local');
  await assert.rejects(
    manager.attachTab(ATTEMPT_ID, { tabId: 42, windowId: 9, closeOnCancel: true }),
    /Managed collection tab could not be removed/i,
  );

  await assert.rejects(
    manager.remove(ATTEMPT_ID),
    /pending managed collection tabs/i,
  );
  assert.deepEqual(storage.sessions[ATTEMPT_ID]._pendingManagedTabIds, [42]);
});

test('cancel does not ACK or delete a session while a pending late tab remains open', async () => {
  const fake = createFakeChrome();
  const liveTabIds = new Set();
  fake.chrome.tabs.query = async (query) => query?.url
    ? []
    : [...liveTabIds].map((id) => ({ id }));
  fake.chrome.tabs.remove = async (tabId) => {
    liveTabIds.add(tabId);
    throw new Error('tab is temporarily unavailable');
  };
  const { manager, storage } = createManager(fake);
  await manager.start(startInput());
  await manager.requestCancellation(ATTEMPT_ID, 'local');
  await assert.rejects(
    manager.attachTab(ATTEMPT_ID, { tabId: 42, windowId: 9, closeOnCancel: true }),
    /Managed collection tab could not be removed/i,
  );

  let ownerCalls = 0;
  await assert.rejects(
    manager.cancel(ATTEMPT_ID, {
      async ownerFailure() {
        ownerCalls += 1;
        return { accepted: true };
      },
    }),
    /pending managed collection tabs/i,
  );
  assert.equal(ownerCalls, 0);
  assert.deepEqual(storage.sessions[ATTEMPT_ID]._pendingManagedTabIds, [42]);

  fake.chrome.tabs.remove = async (tabId) => {
    liveTabIds.delete(tabId);
  };
  await manager.cancel(ATTEMPT_ID, {
    async ownerFailure() {
      ownerCalls += 1;
      return { accepted: true };
    },
  });
  assert.equal(ownerCalls, 1);
  assert.equal(storage.sessions[ATTEMPT_ID], undefined);
});

test('remove rechecks pending late attachments before deleting the fenced session', async () => {
  const fake = createFakeChrome();
  const liveTabIds = new Set();
  fake.chrome.tabs.query = async (query) => query?.url
    ? []
    : [...liveTabIds].map((id) => ({ id }));
  let releaseFirstRetry;
  const firstRetryGate = new Promise((resolve) => {
    releaseFirstRetry = resolve;
  });
  let firstRetryStarted;
  const firstRetryStartedPromise = new Promise((resolve) => {
    firstRetryStarted = resolve;
  });
  let initial42Failure = true;
  let retry42Started = false;
  let tab43Attempts = 0;
  fake.chrome.tabs.remove = async (tabId) => {
    if (initial42Failure && tabId === 42) {
      initial42Failure = false;
      liveTabIds.add(tabId);
      throw new Error('tab is temporarily unavailable');
    }
    if (tabId === 42) {
      retry42Started = true;
      firstRetryStarted();
      await firstRetryGate;
      liveTabIds.delete(tabId);
      return;
    }
    if (tabId === 43) {
      tab43Attempts += 1;
      if (tab43Attempts === 1) {
        liveTabIds.add(tabId);
        throw new Error('tab is temporarily unavailable');
      }
      liveTabIds.delete(tabId);
    }
  };
  const { manager, storage } = createManager(fake);
  await manager.start(startInput());
  await manager.requestCancellation(ATTEMPT_ID, 'local');
  await assert.rejects(
    manager.attachTab(ATTEMPT_ID, { tabId: 42, windowId: 9, closeOnCancel: true }),
    /Managed collection tab could not be removed/i,
  );

  // Switch to the retry behavior, then let remove() begin its out-of-queue
  // close. A second late attachment lands while that close is in flight.
  const removing = manager.remove(ATTEMPT_ID);
  await firstRetryStartedPromise;
  await assert.rejects(
    manager.attachTab(ATTEMPT_ID, { tabId: 43, windowId: 9, closeOnCancel: true }),
    /Managed collection tab could not be removed/i,
  );
  assert.deepEqual(storage.sessions[ATTEMPT_ID]._pendingManagedTabIds, [42, 43]);
  releaseFirstRetry();
  await removing;

  assert.equal(tab43Attempts, 2);
  assert.equal(storage.sessions[ATTEMPT_ID], undefined);
});

test('a pending or rejected owner cancellation keeps the local stop fence and correlation', async () => {
  const { manager, storage } = createManager();
  await manager.start(startInput());
  await manager.requestCancellation(ATTEMPT_ID, 'local');

  let ownerStarted;
  const ownerStartedPromise = new Promise((resolve) => {
    ownerStarted = resolve;
  });
  let releaseOwner;
  const ownerGate = new Promise((resolve) => {
    releaseOwner = resolve;
  });
  const cancelling = manager.cancel(ATTEMPT_ID, {
    ownerFailure: async ({ attemptId }) => {
      ownerStarted({ attemptId, present: Boolean(storage.sessions[attemptId]) });
      await ownerGate;
      return { accepted: false };
    },
  });

  assert.deepEqual(await ownerStartedPromise, {
    attemptId: ATTEMPT_ID,
    present: true,
  });
  assert.equal(await manager.isActive(ATTEMPT_ID, 'local', 'inventory.sellpia'), false);
  assert.equal(typeof storage.sessions[ATTEMPT_ID]._cancellationRequestedAt, 'number');
  releaseOwner();
  await assert.rejects(cancelling, /owner/i);
  assert.equal(Boolean(storage.sessions[ATTEMPT_ID]), true);
});

test('onStarted runs after the storage mutation queue releases', async () => {
  const fake = createFakeChrome();
  const runtime = loadAdapter(fake);
  const callbacks = [];
  let manager;
  manager = runtime.create({
    chrome: runtime.chrome,
    storageKey: 'sessions',
    webUrlPatterns: ['http://localhost:3000/*'],
    onStarted: async (started) => {
      callbacks.push(started);
      assert.equal((await manager.get(started.attemptId)).attemptId, ATTEMPT_ID);
    },
  });

  await manager.start(startInput());
  assert.deepEqual(callbacks.map(({ attemptId, environmentId, producer }) => ({
    attemptId,
    environmentId,
    producer,
  })), [{
    attemptId: ATTEMPT_ID,
    environmentId: 'local',
    producer: 'inventory.sellpia',
  }]);
});
