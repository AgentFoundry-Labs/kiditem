import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const environmentContextPath = path.join(repoRoot, 'extensions/shared/environment-context.js');
const collectionSessionPath = path.join(repoRoot, 'extensions/shared/collection-session.js');
const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const NEXT_ATTEMPT_ID = '22222222-2222-4222-8222-222222222222';

function deferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function createHarness() {
  const storage = {};
  const calls = {
    tabsQuery: [],
    executeScript: [],
  };
  const frozenTab = deferred();
  const chrome = {
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
        if (query.url === 'http://localhost:3000/*') {
          return [{ id: 10 }, { id: 20 }];
        }
        return [];
      },
    },
    scripting: {
      executeScript(details) {
        calls.executeScript.push(details);
        if (details.target.tabId === 20) return frozenTab.promise;
        return Promise.resolve([]);
      },
    },
  };
  const context = vm.createContext({
    AbortController,
    Headers,
    URL,
    clearTimeout,
    console,
    setTimeout,
    structuredClone,
    chrome,
  });
  vm.runInContext(fs.readFileSync(environmentContextPath, 'utf8'), context, {
    filename: environmentContextPath,
  });
  vm.runInContext(fs.readFileSync(collectionSessionPath, 'utf8'), context, {
    filename: collectionSessionPath,
  });
  const environmentContext = context.KidItemEnvironmentContext.create({
    chrome,
    requiresAuth: false,
  });
  const manager = context.KidItemCollectionSession.create({
    chrome,
    environmentContext,
    storageKey: 'collection-sessions',
    now: () => 100,
  });
  return { calls, frozenTab, manager, storage };
}

async function waitFor(predicate, timeoutMs = 500) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  assert.equal(predicate(), true, 'expected durable local state to be written');
}

async function settleWithin(promise, timeoutMs = 100) {
  let timer;
  return Promise.race([
    promise.then(
      (value) => ({ status: 'resolved', value }),
      (error) => ({ status: 'rejected', error }),
    ),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve({ status: 'timed_out' }), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

test('does not let a frozen web tab block durable collection-session mutations', async () => {
  const harness = createHarness();
  const startPromise = harness.manager.start({
    environmentId: 'local',
    attemptId: ATTEMPT_ID,
    producer: 'catalog.owner',
  });
  let progressPromise;
  let nextStartPromise;
  try {
    await waitFor(() => Boolean(harness.storage['collection-sessions']?.[ATTEMPT_ID]));
    progressPromise = harness.manager.progress(ATTEMPT_ID, {
      current: 1,
      total: 1,
      completed: 1,
      failed: 0,
      label: '수집 완료',
    });
    nextStartPromise = harness.manager.start({
      environmentId: 'local',
      attemptId: NEXT_ATTEMPT_ID,
      producer: 'catalog.owner',
    });

    const [startResult, progressResult, nextStartResult] = await Promise.all([
      settleWithin(startPromise),
      settleWithin(progressPromise),
      settleWithin(nextStartPromise),
    ]);
    assert.deepEqual(
      [startResult.status, progressResult.status, nextStartResult.status],
      ['resolved', 'resolved', 'resolved'],
      'durable start, progress, and the following collection start must not wait for a web hint',
    );
    assert.deepEqual(harness.storage['collection-sessions'][ATTEMPT_ID].progress, {
      current: 1,
      total: 1,
      completed: 1,
      failed: 0,
      label: '수집 완료',
    });
    assert.equal(
      harness.storage['collection-sessions'][NEXT_ATTEMPT_ID].attemptId,
      NEXT_ATTEMPT_ID,
    );
  } finally {
    harness.frozenTab.resolve([]);
    await Promise.allSettled([startPromise, progressPromise, nextStartPromise].filter(Boolean));
  }

  await waitFor(() => harness.calls.tabsQuery.length === 3);
  assert.deepEqual(harness.calls.tabsQuery, [
    { url: 'http://localhost:3000/*' },
    { url: 'http://localhost:3000/*' },
    { url: 'http://localhost:3000/*' },
  ]);
  assert.equal(harness.calls.executeScript.some((call) => call.target.tabId === 20), true);
});
