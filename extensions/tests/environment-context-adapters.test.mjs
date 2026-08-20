import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const canonicalPath = path.join(repoRoot, 'extensions/shared/environment-context.js');
const generatedPaths = [
  'extensions/kiditem-os/background/environment-context.js',
  'extensions/kiditem-os/background/environment-context.js',
  'extensions/kiditem-os/background/environment-context.js',
];

function createHarness({
  initialStorage = {},
  responses = [200],
  requiresAuth = true,
  fetchImpl,
  requestTimeoutMs = 15_000,
} = {}) {
  const storage = structuredClone(initialStorage);
  const storageListeners = [];
  const fetchCalls = [];
  const tabQueries = [];
  const scriptCalls = [];
  const responseQueue = [...responses];
  const chrome = {
    storage: {
      local: {
        async get(key) {
          if (key == null) return structuredClone(storage);
          if (typeof key === 'string') return { [key]: structuredClone(storage[key]) };
          return Object.fromEntries(key.map((item) => [item, structuredClone(storage[item])]));
        },
        async set(values) {
          const changes = Object.fromEntries(
            Object.entries(values).map(([key, value]) => [
              key,
              { oldValue: storage[key], newValue: structuredClone(value) },
            ]),
          );
          Object.assign(storage, structuredClone(values));
          for (const listener of storageListeners) listener(changes, 'local');
        },
        async remove(keys) {
          const changes = {};
          for (const key of Array.isArray(keys) ? keys : [keys]) {
            changes[key] = { oldValue: storage[key], newValue: undefined };
            delete storage[key];
          }
          for (const listener of storageListeners) listener(changes, 'local');
        },
      },
      onChanged: {
        addListener(listener) {
          storageListeners.push(listener);
        },
        removeListener(listener) {
          const index = storageListeners.indexOf(listener);
          if (index >= 0) storageListeners.splice(index, 1);
        },
      },
    },
    tabs: {
      async query(query) {
        tabQueries.push(structuredClone(query));
        return [{ id: query.url.includes('localhost') ? 10 : 20 }];
      },
    },
    scripting: {
      async executeScript(details) {
        scriptCalls.push(details);
        return [];
      },
    },
  };
  const fetchFn = async (url, init) => {
    fetchCalls.push({ url, init });
    if (fetchImpl) return fetchImpl(url, init);
    const status = responseQueue.shift() ?? 200;
    return { ok: status >= 200 && status < 300, status };
  };
  const context = vm.createContext({
    AbortController,
    Headers,
    URL,
    clearTimeout,
    console,
    setTimeout,
    structuredClone,
  });
  vm.runInContext(fs.readFileSync(canonicalPath, 'utf8'), context, {
    filename: canonicalPath,
  });
  const environmentContext = context.KidItemEnvironmentContext.create({
    chrome,
    fetchFn,
    requiresAuth,
    authResyncTimeoutMs: 30,
    requestTimeoutMs,
    now: () => 1234,
    legacyStorageKeys: ['kiditem_auth_token', 'apiBase'],
  });
  return {
    chrome,
    environmentContext,
    fetchCalls,
    scriptCalls,
    storage,
    tabQueries,
  };
}

async function waitForCount(values, count) {
  const deadline = Date.now() + 1_000;
  while (values.length < count && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  assert.equal(values.length, count);
}

test('generated environment adapters are byte-identical to the canonical source', () => {
  const canonical = fs.readFileSync(canonicalPath);
  for (const relativePath of generatedPaths) {
    assert.deepEqual(fs.readFileSync(path.join(repoRoot, relativePath)), canonical);
  }
});

test('resolves only the closed KidItem sender origins', () => {
  const { environmentContext } = createHarness();
  assert.equal(
    environmentContext.resolveSender({ url: 'http://localhost:3000/orders' }).environmentId,
    'local',
  );
  assert.equal(
    environmentContext.resolveSender({ url: 'http://kiditem-office/orders' }).environmentId,
    'office',
  );
  assert.equal(
    environmentContext.resolveSender({ url: 'https://retired.example.com/dashboard' }),
    null,
  );
  assert.equal(environmentContext.resolveSender({ url: 'https://merchon.org/' }), null);
  assert.equal(environmentContext.resolveSender({ url: 'not-a-url' }), null);
});

test('stores and clears authenticated profiles independently', async () => {
  const { environmentContext, storage } = createHarness();
  await environmentContext.setAccessToken('local', 'local-token');
  await environmentContext.setAccessToken('office', 'office-token');

  assert.equal(await environmentContext.getAccessToken('local'), 'local-token');
  assert.equal(await environmentContext.getAccessToken('office'), 'office-token');
  assert.deepEqual(
    Array.from(await environmentContext.connectedEnvironmentIds()),
    ['local', 'office'],
  );

  await environmentContext.clearAccessToken('local');
  assert.equal(await environmentContext.getAccessToken('local'), null);
  assert.equal(await environmentContext.getAccessToken('office'), 'office-token');
  assert.deepEqual(Object.keys(storage.kiditem_environment_profiles_v1), ['office']);
});

test('routes concurrent requests to fixed environment API origins', async () => {
  const { environmentContext, fetchCalls } = createHarness();
  await environmentContext.setAccessToken('local', 'local-token');
  await environmentContext.setAccessToken('office', 'office-token');

  await Promise.all([
    environmentContext.authedFetch('local', '/api/health'),
    environmentContext.authedFetch('office', '/api/health'),
  ]);

  assert.deepEqual(fetchCalls.map((call) => call.url), [
    'http://localhost:4000/api/health',
    'http://kiditem-office/api/health',
  ]);
  assert.equal(new Headers(fetchCalls[0].init.headers).get('authorization'), 'Bearer local-token');
  assert.equal(new Headers(fetchCalls[1].init.headers).get('authorization'), 'Bearer office-token');
});

test('composes a caller abort with the request timeout and removes its listener after rejection', async () => {
  const caller = new AbortController();
  const callerReason = new Error('operation_runtime_fence_lost');
  const originalAdd = caller.signal.addEventListener.bind(caller.signal);
  const originalRemove = caller.signal.removeEventListener.bind(caller.signal);
  let added = 0;
  let removed = 0;
  caller.signal.addEventListener = (...args) => {
    added += 1;
    return originalAdd(...args);
  };
  caller.signal.removeEventListener = (...args) => {
    removed += 1;
    return originalRemove(...args);
  };
  const harness = createHarness({
    requestTimeoutMs: 1_000,
    fetchImpl: (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason), {
        once: true,
      });
    }),
  });
  await harness.environmentContext.setAccessToken('local', 'local-token');

  const pending = harness.environmentContext.authedFetch(
    'local',
    '/api/heartbeat',
    { signal: caller.signal },
  );
  await waitForCount(harness.fetchCalls, 1);
  caller.abort(callerReason);

  await assert.rejects(pending, (error) => error === callerReason);
  assert.equal(added, 1);
  assert.equal(removed, 1);
});

test('rejects an already-aborted caller before starting a network request', async () => {
  const caller = new AbortController();
  const callerReason = new Error('operation_deadline_exceeded');
  caller.abort(callerReason);
  const harness = createHarness();
  await harness.environmentContext.setAccessToken('office', 'office-token');

  await assert.rejects(
    harness.environmentContext.authedFetch('office', '/api/heartbeat', {
      signal: caller.signal,
    }),
    (error) => error === callerReason,
  );
  assert.equal(harness.fetchCalls.length, 0);
});

test('caller abort interrupts a 401 token-resync wait with the original reason', async () => {
  const caller = new AbortController();
  const callerReason = new Error('operation_deadline_exceeded');
  const harness = createHarness({ responses: [401], requestTimeoutMs: 1_000 });
  await harness.environmentContext.setAccessToken('local', 'local-token');

  const pending = harness.environmentContext.authedFetch(
    'local',
    '/api/heartbeat',
    { signal: caller.signal },
  );
  await waitForCount(harness.fetchCalls, 1);
  caller.abort(callerReason);

  await assert.rejects(pending, (error) => error === callerReason);
});

test('caller abort interrupts an initial missing-token resync wait', async () => {
  const caller = new AbortController();
  const callerReason = new Error('operation_deadline_exceeded');
  const harness = createHarness();

  const pending = harness.environmentContext.authedFetch(
    'office',
    '/api/heartbeat',
    { signal: caller.signal },
  );
  await waitForCount(harness.scriptCalls, 1);
  caller.abort(callerReason);

  await assert.rejects(pending, (error) => error === callerReason);
  assert.equal(harness.fetchCalls.length, 0);
});

test('resyncs a 401 through only the owning environment and retries once when the token changed', async () => {
  const harness = createHarness({ responses: [401, 200] });
  await harness.environmentContext.setAccessToken('local', 'local-token');
  await harness.environmentContext.setAccessToken('office', 'office-token');

  const pending = harness.environmentContext.authedFetch('local', '/api/orders');
  await waitForCount(harness.fetchCalls, 1);
  await harness.environmentContext.setAccessToken('local', 'rotated-local-token');
  const response = await pending;

  assert.equal(response.status, 200);
  assert.deepEqual(harness.tabQueries, [{ url: 'http://localhost:3000/*' }]);
  assert.equal(harness.scriptCalls.length, 1);
  assert.equal(
    new Headers(harness.fetchCalls[1].init.headers).get('authorization'),
    'Bearer rotated-local-token',
  );
  assert.equal(await harness.environmentContext.getAccessToken('office'), 'office-token');
});

test('recovers a missing local token through only the local environment', async () => {
  const harness = createHarness({ responses: [200] });

  const pending = harness.environmentContext.authedFetch('local', '/api/orders');
  await waitForCount(harness.scriptCalls, 1);

  assert.equal(harness.fetchCalls.length, 0);
  assert.deepEqual(harness.tabQueries, [{ url: 'http://localhost:3000/*' }]);
  assert.deepEqual(
    harness.scriptCalls.map((call) => Number(call.target.tabId)),
    [10],
  );

  await harness.environmentContext.setAccessToken('local', 'recovered-local-token');
  const response = await pending;

  assert.equal(response.status, 200);
  assert.equal(harness.fetchCalls.length, 1);
  assert.equal(harness.fetchCalls[0].url, 'http://localhost:4000/api/orders');
  assert.equal(
    new Headers(harness.fetchCalls[0].init.headers).get('authorization'),
    'Bearer recovered-local-token',
  );
  assert.equal(await harness.environmentContext.getAccessToken('office'), null);
});

test('keeps the exact environment auth error when missing-profile recovery times out', async () => {
  const harness = createHarness();

  await assert.rejects(
    harness.environmentContext.authedFetch('office', '/api/orders'),
    (error) => {
      assert.equal(error.code, 'environment_auth_required');
      assert.equal(error.environmentId, 'office');
      assert.equal(error.message, 'KidItem login is required for this environment');
      return true;
    },
  );

  assert.equal(harness.fetchCalls.length, 0);
  assert.deepEqual(harness.tabQueries, [
    { url: 'http://kiditem-office/*' },
  ]);
  assert.deepEqual(
    harness.scriptCalls.map((call) => Number(call.target.tabId)),
    [20],
  );
});

test('removes ambiguous legacy auth and API values without migration', async () => {
  const harness = createHarness({
    initialStorage: {
      kiditem_auth_token: 'ambiguous-token',
      apiBase: 'https://untrusted.example/api',
    },
  });
  await harness.environmentContext.migrateLegacyStorage();
  assert.equal(harness.storage.kiditem_auth_token, undefined);
  assert.equal(harness.storage.apiBase, undefined);
  assert.equal(harness.storage.kiditem_environment_profiles_v1, undefined);
});

test('tracks connected environments without tokens for order collector', async () => {
  const { environmentContext } = createHarness({ requiresAuth: false });
  await environmentContext.connect('office');
  assert.deepEqual(
    Array.from(await environmentContext.connectedEnvironmentIds()),
    ['office'],
  );
  await assert.rejects(
    environmentContext.authedFetch('office', '/api/orders'),
    /Authenticated fetch is unavailable/,
  );
});

test('namespaces storage and alarms by an explicit environment', () => {
  const { environmentContext } = createHarness();
  assert.equal(environmentContext.storageKey('status', 'local'), 'status:local');
  assert.equal(environmentContext.alarmName('auto-scrape', 'office'), 'auto-scrape:office');
  assert.equal(
    environmentContext.parseAlarmName('auto-scrape', 'auto-scrape:office'),
    'office',
  );
  assert.equal(environmentContext.parseAlarmName('auto-scrape', 'auto-scrape'), null);
});
