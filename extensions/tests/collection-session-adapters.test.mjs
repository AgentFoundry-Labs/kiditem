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
    'list',
    'listAll',
    'openAttentionTab',
    'progress',
    'remove',
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
