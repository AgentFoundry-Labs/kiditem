import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const canonicalPath = path.join(repoRoot, 'extensions/shared/collection-session.js');
const generatedPaths = [
  'extensions/coupang-ads-scraper/background/collection-session.js',
  'extensions/product-scraper/collection-session.js',
  'extensions/order-collector/background/collection-session.js',
];
const RUN_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_RUN_ID = '22222222-2222-4222-8222-222222222222';

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

function loadAdapter(relativePath, fake = createFakeChrome()) {
  const filename = path.join(repoRoot, relativePath);
  const context = vm.createContext({
    chrome: fake.chrome,
    console,
    structuredClone,
  });
  vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  return {
    ...fake,
    create: context.KidItemCollectionSession.create,
  };
}

function startInput(runId = RUN_ID) {
  return {
    runId,
    producer: 'sourcing.1688_trend',
    classification: 'background_preferred',
    restartStrategy: 'extension',
    inputIdentity: {
      keywordCount: 2,
      password: 'must-not-persist',
      accessToken: 'must-not-persist',
      cookieJar: 'must-not-persist',
      credentialId: 'must-not-persist',
      sourceFile: 'must-not-persist',
      rawRows: 'must-not-persist',
      requestPayload: 'must-not-persist',
    },
  };
}

test('generated adapters are byte-identical to the canonical source', () => {
  const canonical = fs.readFileSync(canonicalPath);
  for (const relativePath of generatedPaths) {
    assert.deepEqual(fs.readFileSync(path.join(repoRoot, relativePath)), canonical);
  }
});

test('sync --check succeeds for exact copies and detects drift', () => {
  const scriptPath = path.join(
    repoRoot,
    'extensions/scripts/sync-collection-session-adapters.mjs',
  );
  const clean = spawnSync(process.execPath, [scriptPath, '--check'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(clean.status, 0, clean.stderr || clean.stdout);

  const driftPath = path.join(repoRoot, generatedPaths[0]);
  const original = fs.readFileSync(driftPath);
  try {
    fs.appendFileSync(driftPath, '\n// drift\n');
    const drifted = spawnSync(process.execPath, [scriptPath, '--check'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    assert.notEqual(drifted.status, 0);
  } finally {
    fs.writeFileSync(driftPath, original);
  }
});

for (const relativePath of generatedPaths) {
  test(`${relativePath} exposes the complete manager contract`, () => {
    const runtime = loadAdapter(relativePath);
    const manager = runtime.create({
      chrome: runtime.chrome,
      storageKey: 'sessions',
      webUrlPatterns: ['http://localhost:3000/*'],
      now: () => 100,
    });

    assert.deepEqual(
      Object.keys(manager).sort(),
      [
        'attachTab',
        'cancel',
        'fail',
        'get',
        'list',
        'openAttentionTab',
        'progress',
        'requireAttention',
        'restart',
        'start',
        'succeed',
      ].sort(),
    );
  });
}

test('start sanitizes identity and publishes only the public session view', async () => {
  const runtime = loadAdapter(generatedPaths[1]);
  const manager = runtime.create({
    chrome: runtime.chrome,
    storageKey: 'sessions',
    webUrlPatterns: ['http://localhost:3000/*'],
    now: () => 100,
  });

  const view = await manager.start(startInput());

  assert.deepEqual(JSON.parse(JSON.stringify(view.inputIdentity)), { keywordCount: 2 });
  assert.deepEqual(JSON.parse(JSON.stringify(view.progress)), {
    current: 0,
    total: 0,
    completed: 0,
    failed: 0,
    label: null,
  });
  assert.equal(view.status, 'running');
  assert.equal(view.attempt, 1);
  assert.equal(view.startedAt, 100);
  assert.equal(view.updatedAt, 100);
  assert.equal(view.finishedAt, null);
  assert.equal(runtime.calls.executeScript.length, 2);
  for (const call of runtime.calls.executeScript) {
    assert.doesNotThrow(
      () => new Function(`return (${call.func.toString()});`),
      'chrome.scripting.executeScript func must serialize as a standalone function expression',
    );
    const published = call.args[0];
    assert.equal(published.inputIdentity.password, undefined);
    assert.equal(published._managedTabId, undefined);
    assert.equal(published._managedWindowId, undefined);
    assert.deepEqual(JSON.parse(JSON.stringify(call.target)), {
      tabId: call.target.tabId,
    });
  }
});

test('start enforces the shared bounded primitive identity contract', async () => {
  const runtime = loadAdapter(generatedPaths[1]);
  const manager = runtime.create({
    chrome: runtime.chrome,
    storageKey: 'sessions',
    webUrlPatterns: ['http://localhost:3000/*'],
    now: () => 100,
  });
  const boundedFields = Object.fromEntries(
    Array.from({ length: 25 }, (_, index) => [`field${index}`, index]),
  );

  const view = await manager.start({
    ...startInput(),
    inputIdentity: {
      ...boundedFields,
      response: 'raw',
      responseBody: 'raw',
      body: 'raw',
      rawHtml: '<html />',
      accessToken: 'secret',
      nested: { raw: true },
      array: ['raw'],
      infinite: Number.POSITIVE_INFINITY,
      tooLong: 'x'.repeat(501),
      ['x'.repeat(81)]: 'long key',
      '': 'empty key',
    },
  });

  assert.deepEqual(
    JSON.parse(JSON.stringify(view.inputIdentity)),
    Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`field${index}`, index])),
  );
});

test('concurrent starts retain both sessions in the same storage map', async () => {
  const runtime = loadAdapter(generatedPaths[0]);
  const manager = runtime.create({
    chrome: runtime.chrome,
    storageKey: 'sessions',
    webUrlPatterns: ['http://localhost:3000/*'],
    now: () => 100,
  });

  await Promise.all([
    manager.start(startInput(RUN_ID)),
    manager.start(startInput(OTHER_RUN_ID)),
  ]);

  assert.deepEqual(Object.keys(runtime.storage.sessions).sort(), [
    RUN_ID,
    OTHER_RUN_ID,
  ]);
});

test('managed tab IDs stay private while transitions are stored and published', async () => {
  let time = 100;
  const runtime = loadAdapter(generatedPaths[1]);
  const manager = runtime.create({
    chrome: runtime.chrome,
    storageKey: 'sessions',
    webUrlPatterns: ['http://localhost:3000/*'],
    now: () => time,
  });

  await manager.start(startInput());
  time = 110;
  const attached = await manager.attachTab(RUN_ID, { tabId: 7, windowId: 2 });
  time = 120;
  const progressed = await manager.progress(RUN_ID, {
    current: 3,
    total: 5,
    completed: 2,
    failed: 1,
    label: '상품 수집 중',
  });

  assert.equal(attached._managedTabId, undefined);
  assert.equal(attached._managedWindowId, undefined);
  assert.equal(progressed.updatedAt, 120);
  assert.deepEqual(JSON.parse(JSON.stringify(progressed.progress)), {
    current: 3,
    total: 5,
    completed: 2,
    failed: 1,
    label: '상품 수집 중',
  });
  assert.equal(runtime.storage.sessions[RUN_ID]._managedTabId, 7);
  assert.equal(runtime.storage.sessions[RUN_ID]._managedWindowId, 2);
  assert.equal(runtime.calls.executeScript.length, 6);
  assert.deepEqual(
    runtime.calls.executeScript.map((call) => call.args[0].updatedAt),
    [100, 100, 110, 110, 120, 120],
  );
});

test('restart begins a new attempt from progress zero with sanitized restart input', async () => {
  let time = 100;
  const runtime = loadAdapter(generatedPaths[2]);
  const manager = runtime.create({
    chrome: runtime.chrome,
    storageKey: 'sessions',
    webUrlPatterns: ['http://localhost:3000/*'],
    now: () => time,
  });
  await manager.start(startInput());
  await manager.progress(RUN_ID, {
    current: 4,
    total: 5,
    completed: 3,
    failed: 1,
    label: 'almost done',
  });
  time = 200;
  await manager.fail(RUN_ID);
  time = 300;

  const restarted = await manager.restart(RUN_ID);

  assert.equal(restarted.status, 'running');
  assert.equal(restarted.attempt, 2);
  assert.equal(restarted.finishedAt, null);
  assert.equal(restarted.attention, null);
  assert.deepEqual(JSON.parse(JSON.stringify(restarted.progress)), {
    current: 0,
    total: 0,
    completed: 0,
    failed: 0,
    label: null,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(restarted.inputIdentity)), { keywordCount: 2 });
  assert.equal(restarted.restartStrategy, 'extension');
});

test('restart preserves the managed tab by default', async () => {
  const runtime = loadAdapter(generatedPaths[2]);
  const manager = runtime.create({
    chrome: runtime.chrome,
    storageKey: 'sessions',
    webUrlPatterns: ['http://localhost:3000/*'],
    now: () => 100,
  });
  await manager.start(startInput());
  await manager.attachTab(RUN_ID, { tabId: 7, windowId: 2 });

  const restarted = await manager.restart(RUN_ID);

  assert.equal(restarted.attempt, 2);
  assert.deepEqual(runtime.calls.tabsRemove, []);
  assert.equal(runtime.storage.sessions[RUN_ID]._managedTabId, 7);
  assert.equal(runtime.storage.sessions[RUN_ID]._managedWindowId, 2);
});

test('restart can close and detach the previous managed attention tab', async () => {
  const runtime = loadAdapter(generatedPaths[2]);
  const manager = runtime.create({
    chrome: runtime.chrome,
    storageKey: 'sessions',
    webUrlPatterns: ['http://localhost:3000/*'],
    now: () => 100,
  });
  await manager.start(startInput());
  await manager.attachTab(RUN_ID, { tabId: 7, windowId: 2 });
  await manager.requireAttention(RUN_ID, {
    reason: 'marketplace_login',
    message: '로그인이 필요합니다.',
  });

  const restarted = await manager.restart(RUN_ID, { closeManagedTab: true });

  assert.equal(restarted.status, 'running');
  assert.equal(restarted.attempt, 2);
  assert.equal(restarted.attention, null);
  assert.deepEqual(runtime.calls.tabsRemove, [7]);
  assert.equal(runtime.storage.sessions[RUN_ID]._managedTabId, undefined);
  assert.equal(runtime.storage.sessions[RUN_ID]._managedWindowId, undefined);
});

test('restart detaches but preserves a managed tab owned by the user', async () => {
  const runtime = loadAdapter(generatedPaths[2]);
  const manager = runtime.create({
    chrome: runtime.chrome,
    storageKey: 'sessions',
    webUrlPatterns: ['http://localhost:3000/*'],
    now: () => 100,
  });
  await manager.start(startInput());
  await manager.attachTab(RUN_ID, {
    tabId: 7,
    windowId: 2,
    closeOnRestart: false,
  });

  const restarted = await manager.restart(RUN_ID, { closeManagedTab: true });

  assert.equal(restarted.attempt, 2);
  assert.deepEqual(runtime.calls.tabsRemove, []);
  assert.equal(runtime.storage.sessions[RUN_ID]._managedTabId, undefined);
  assert.equal(runtime.storage.sessions[RUN_ID]._managedWindowId, undefined);
  assert.equal(runtime.storage.sessions[RUN_ID]._managedTabCloseOnRestart, undefined);
});

test('session publication is best effort across stale KidItem tabs', async () => {
  const fake = createFakeChrome();
  fake.chrome.scripting.executeScript = async (details) => {
    fake.calls.executeScript.push(details);
    if (details.target.tabId === 90) throw new Error('The tab was closed');
  };
  const runtime = loadAdapter(generatedPaths[1], fake);
  const manager = runtime.create({
    chrome: runtime.chrome,
    storageKey: 'sessions',
    webUrlPatterns: ['http://localhost:3000/*'],
    now: () => 100,
  });

  const started = await manager.start(startInput());

  assert.equal(started.status, 'running');
  assert.equal(runtime.storage.sessions[RUN_ID].status, 'running');
  assert.deepEqual(
    runtime.calls.executeScript.map((call) => call.target.tabId),
    [90, 91],
  );
});

test('session transition survives a failed KidItem tab query', async () => {
  const fake = createFakeChrome();
  fake.chrome.tabs.query = async () => {
    throw new Error('Tabs unavailable');
  };
  const runtime = loadAdapter(generatedPaths[1], fake);
  const manager = runtime.create({
    chrome: runtime.chrome,
    storageKey: 'sessions',
    webUrlPatterns: ['http://localhost:3000/*'],
    now: () => 100,
  });

  const started = await manager.start(startInput());

  assert.equal(started.status, 'running');
  assert.equal(runtime.storage.sessions[RUN_ID].status, 'running');
});

test('cancellation is cooperative and never changes browser focus', async () => {
  const runtime = loadAdapter(generatedPaths[0]);
  const manager = runtime.create({
    chrome: runtime.chrome,
    storageKey: 'sessions',
    webUrlPatterns: ['http://localhost:3000/*'],
    now: () => 100,
  });
  await manager.start(startInput());
  await manager.attachTab(RUN_ID, { tabId: 7, windowId: 2 });

  const cancelled = await manager.cancel(RUN_ID);

  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.finishedAt, 100);
  assert.equal(runtime.calls.tabsUpdate.length, 0);
  assert.equal(runtime.calls.windowsUpdate.length, 0);
  assert.deepEqual(runtime.calls.tabsRemove, []);
  assert.equal(runtime.storage.sessions[RUN_ID]._managedTabId, 7);
});

test('cancellation can close and detach the managed order tab', async () => {
  const runtime = loadAdapter(generatedPaths[2]);
  const manager = runtime.create({
    chrome: runtime.chrome,
    storageKey: 'sessions',
    webUrlPatterns: ['http://localhost:3000/*'],
    now: () => 100,
  });
  await manager.start(startInput());
  await manager.attachTab(RUN_ID, { tabId: 7, windowId: 2 });

  const cancelled = await manager.cancel(RUN_ID, { closeManagedTab: true });

  assert.equal(cancelled.status, 'cancelled');
  assert.deepEqual(runtime.calls.tabsRemove, [7]);
  assert.equal(runtime.storage.sessions[RUN_ID]._managedTabId, undefined);
  assert.equal(runtime.storage.sessions[RUN_ID]._managedWindowId, undefined);
});

test('cancellation detaches but preserves a managed tab owned by the user', async () => {
  const runtime = loadAdapter(generatedPaths[2]);
  const manager = runtime.create({
    chrome: runtime.chrome,
    storageKey: 'sessions',
    webUrlPatterns: ['http://localhost:3000/*'],
    now: () => 100,
  });
  await manager.start(startInput());
  await manager.attachTab(RUN_ID, {
    tabId: 7,
    windowId: 2,
    closeOnRestart: false,
  });

  const cancelled = await manager.cancel(RUN_ID, { closeManagedTab: true });

  assert.equal(cancelled.status, 'cancelled');
  assert.deepEqual(runtime.calls.tabsRemove, []);
  assert.equal(runtime.storage.sessions[RUN_ID]._managedTabId, undefined);
  assert.equal(runtime.storage.sessions[RUN_ID]._managedWindowId, undefined);
  assert.equal(runtime.storage.sessions[RUN_ID]._managedTabCloseOnRestart, undefined);
});

test('late operation transitions cannot overwrite a cancelled session', async () => {
  const runtime = loadAdapter(generatedPaths[2]);
  const manager = runtime.create({
    chrome: runtime.chrome,
    storageKey: 'sessions',
    webUrlPatterns: ['http://localhost:3000/*'],
    now: () => 100,
  });
  await manager.start(startInput());
  await manager.cancel(RUN_ID);

  const lateViews = [
    await manager.attachTab(RUN_ID, { tabId: 8, windowId: 3 }),
    await manager.progress(RUN_ID, {
      current: 1,
      total: 1,
      completed: 1,
      failed: 0,
      label: 'late progress',
    }),
    await manager.requireAttention(RUN_ID, {
      reason: 'marketplace_login',
      message: '늦은 로그인 요청',
    }),
    await manager.fail(RUN_ID),
    await manager.succeed(RUN_ID),
  ];

  assert.ok(lateViews.every((view) => view.status === 'cancelled'));
  assert.equal(runtime.storage.sessions[RUN_ID].status, 'cancelled');
  assert.deepEqual(runtime.calls.tabsRemove, [8]);
});

test('a user-owned tab attached after cancellation is preserved', async () => {
  const runtime = loadAdapter(generatedPaths[2]);
  const manager = runtime.create({
    chrome: runtime.chrome,
    storageKey: 'sessions',
    webUrlPatterns: ['http://localhost:3000/*'],
    now: () => 100,
  });
  await manager.start(startInput());
  await manager.cancel(RUN_ID);

  const view = await manager.attachTab(RUN_ID, {
    tabId: 9,
    windowId: 3,
    closeOnRestart: false,
  });

  assert.equal(view.status, 'cancelled');
  assert.deepEqual(runtime.calls.tabsRemove, []);
});

test('attention never focuses until the explicit open command', async () => {
  const runtime = loadAdapter(generatedPaths[1]);
  const manager = runtime.create({
    chrome: runtime.chrome,
    storageKey: 'sessions',
    webUrlPatterns: ['http://localhost:3000/*'],
    now: () => 100,
  });
  await manager.start(startInput());
  await manager.attachTab(RUN_ID, { tabId: 7, windowId: 2 });
  const view = await manager.requireAttention(RUN_ID, {
    reason: 'captcha',
    message: '1688 보안 확인이 필요합니다.',
  });

  assert.equal(runtime.calls.tabsUpdate.length, 0);
  assert.equal(runtime.calls.windowsUpdate.length, 0);
  assert.equal(view.attention.canOpenTab, true);
  assert.equal(view.inputIdentity.password, undefined);

  await manager.openAttentionTab(RUN_ID);
  assert.deepEqual(runtime.calls.tabsUpdate, [
    { tabId: 7, properties: { active: true } },
  ]);
  assert.deepEqual(runtime.calls.windowsUpdate, [
    { windowId: 2, properties: { focused: true } },
  ]);
});

test('openAttentionTab rejects sessions that do not require attention', async () => {
  const runtime = loadAdapter(generatedPaths[1]);
  const manager = runtime.create({
    chrome: runtime.chrome,
    storageKey: 'sessions',
    webUrlPatterns: ['http://localhost:3000/*'],
    now: () => 100,
  });
  await manager.start(startInput());
  await manager.attachTab(RUN_ID, { tabId: 7, windowId: 2 });

  await assert.rejects(() => manager.openAttentionTab(RUN_ID), /attention/i);
  assert.equal(runtime.calls.tabsUpdate.length, 0);
  assert.equal(runtime.calls.windowsUpdate.length, 0);
});

test('get and list prune terminal sessions older than seven days', async () => {
  const eightDays = 8 * 24 * 60 * 60 * 1000;
  const now = eightDays + 1_000;
  const stale = {
    ...startInput(OTHER_RUN_ID),
    status: 'succeeded',
    attempt: 1,
    progress: { current: 1, total: 1, completed: 1, failed: 0, label: null },
    attention: null,
    startedAt: 1,
    updatedAt: 1,
    finishedAt: 1,
  };
  const runtime = loadAdapter(generatedPaths[0], createFakeChrome({ sessions: {
    [OTHER_RUN_ID]: stale,
  } }));
  const manager = runtime.create({
    chrome: runtime.chrome,
    storageKey: 'sessions',
    webUrlPatterns: ['http://localhost:3000/*'],
    now: () => now,
  });

  assert.equal(await manager.get(OTHER_RUN_ID), null);
  assert.deepEqual(JSON.parse(JSON.stringify(await manager.list())), []);
  assert.deepEqual(runtime.storage.sessions, {});
});
