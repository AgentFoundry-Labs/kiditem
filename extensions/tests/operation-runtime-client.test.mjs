import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const clientPath = path.join(
  repoRoot,
  'extensions/kiditem-os/background/operation-runtime-client.js',
);

function createHarness(options = {}) {
  const fetchCalls = [];
  const alarmNames = [];
  const alarmOptions = [];
  const alarmListeners = [];
  const claim = Object.hasOwn(options, 'claim') ? options.claim : {
    runId: '11111111-1111-4111-8111-111111111111',
    operationKey: 'inventory.refresh_sellpia_snapshot',
    attemptToken: '22222222-2222-4222-8222-222222222222',
    attempt: 1,
    input: {},
    leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    deadlineAt: new Date(Date.now() + 15 * 60_000).toISOString(),
  };
  const storage = { ...(options.initialStorage || {}) };
  const sessionCancellations = [];
  const chrome = {
    runtime: {
      id: 'kiditem-os-test',
      onInstalled: { addListener() {} },
      onStartup: { addListener() {} },
    },
    alarms: {
      create(name, options) {
        alarmNames.push(name);
        alarmOptions.push(options);
      },
      onAlarm: { addListener(listener) { alarmListeners.push(listener); } },
    },
    storage: {
      local: {
        async get(key) {
          if (typeof key === 'string') return { [key]: storage[key] };
          return { ...storage };
        },
        async set(values) {
          Object.assign(storage, values);
        },
        async remove(key) {
          delete storage[key];
        },
      },
    },
  };
  const environmentContext = {
    environmentIds: ['office'],
    alarmName(base, environmentId) { return `${base}:${environmentId}`; },
    parseAlarmName(base, name) { return name === `${base}:office` ? 'office' : null; },
    async authedFetch(environmentId, pathName, init) {
      fetchCalls.push({
        environmentId,
        path: pathName,
        body: init.body ? JSON.parse(init.body) : undefined,
      });
      if (pathName.endsWith('/claim')) {
        return new Response(JSON.stringify({ claim }), { status: 200 });
      }
      if (typeof options.fetchResponse === 'function') {
        return options.fetchResponse({ environmentId, pathName, init });
      }
      return new Response(null, { status: 204 });
    },
  };
  const domains = {
    runOperation(key) {
      assert.equal(key, claim.operationKey);
      return options.handler || (async () => ({ status: 'succeeded', result: { collected: 12 } }));
    },
  };
  const context = vm.createContext({
    AbortController,
    DOMException,
    Headers,
    JSON,
    Response,
    clearInterval() {},
    clearTimeout,
    console,
    setInterval() { return 1; },
    setTimeout,
  });
  context.globalThis = context;
  vm.runInContext(readFileSync(clientPath, 'utf8'), context, { filename: clientPath });
  const client = context.KidItemOperationRuntimeClient.create({
    chrome,
    domains,
    environmentContext,
    runtimeId: 'test-runtime',
    sessions: {
      async getOwned(runId, environmentId) {
        return options.managedSession === false
          ? null
          : { runId, environmentId, status: 'running' };
      },
      async cancel(runId, cancelOptions) {
        sessionCancellations.push({ runId, cancelOptions });
      },
    },
  });
  return {
    alarmListeners,
    alarmNames,
    alarmOptions,
    client,
    fetchCalls,
    sessionCancellations,
    storage,
  };
}

test('claims one server-owned browser operation and reports with the fenced attempt token', async () => {
  const { client, fetchCalls } = createHarness();
  await client.tick('office');

  assert.equal(fetchCalls[0].path, '/api/operation-runtime/browser/claim');
  assert.deepEqual(fetchCalls[0].body, {
    runtimeId: 'test-runtime',
    environmentId: 'office',
  });
  assert.equal(fetchCalls[1].path, '/api/operation-runtime/browser/runs/11111111-1111-4111-8111-111111111111/report');
  assert.equal(fetchCalls[1].body.attemptToken, '22222222-2222-4222-8222-222222222222');
  assert.deepEqual(fetchCalls[1].body.result, { collected: 12 });
});

test('checks queued browser operations immediately when the service worker starts', async () => {
  const { alarmNames, alarmOptions, client, fetchCalls } = createHarness();

  client.install();
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(alarmNames, ['kiditem-operation-runtime-claim:office']);
  assert.equal(alarmOptions.length, 1);
  assert.equal(alarmOptions[0].delayInMinutes, 0.5);
  assert.equal(alarmOptions[0].periodInMinutes, 0.5);
  assert.equal(fetchCalls[0]?.path, '/api/operation-runtime/browser/claim');
});

test('resumes a non-expired stored claim after the service worker restarts', async () => {
  const persistedClaim = {
    runId: '11111111-1111-4111-8111-111111111111',
    operationKey: 'inventory.refresh_sellpia_snapshot',
    attemptToken: '22222222-2222-4222-8222-222222222222',
    attempt: 1,
    input: {},
    leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    deadlineAt: new Date(Date.now() + 15 * 60_000).toISOString(),
  };
  const { client, fetchCalls } = createHarness({
    initialStorage: {
      kiditem_operation_runtime_active_v1: {
        office: { claim: persistedClaim, progress: 0.4 },
      },
    },
  });

  client.install();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(
    fetchCalls[0]?.path,
    '/api/operation-runtime/browser/runs/11111111-1111-4111-8111-111111111111/heartbeat',
  );
  assert.equal(
    fetchCalls.some((call) => call.path.endsWith('/report')),
    true,
  );
  assert.equal(
    fetchCalls.some((call) => call.path.endsWith('/claim')),
    false,
  );
});

test('aborts the exact handler on heartbeat fence loss and suppresses its stale terminal report', async () => {
  let handlerSignal;
  let abortReason;
  let cleanupCount = 0;
  const { client, fetchCalls, sessionCancellations } = createHarness({
    fetchResponse: ({ pathName }) => pathName.endsWith('/heartbeat')
      ? new Response(null, { status: 409 })
      : new Response(null, { status: 204 }),
    handler: async ({ signal, heartbeat }) => {
      handlerSignal = signal;
      signal.addEventListener('abort', () => {
        abortReason = signal.reason;
        cleanupCount += 1;
      }, { once: true });
      await heartbeat({
        progress: 0.5,
        stage: 'collecting_keyword',
        progressCurrent: 1,
        progressTotal: 2,
      }).catch(() => undefined);
      return { status: 'succeeded', result: { collected: 2 } };
    },
  });

  await client.tick('office');

  assert.equal(handlerSignal.aborted, true);
  assert.equal(abortReason?.message, 'operation_runtime_fence_lost');
  assert.equal(abortReason?.status, 409);
  assert.equal(cleanupCount, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(sessionCancellations)), [{
    runId: '11111111-1111-4111-8111-111111111111',
    cancelOptions: { closeManagedTab: true },
  }]);
  const heartbeatCall = fetchCalls.find((call) => call.path.endsWith('/heartbeat'));
  assert.deepEqual(heartbeatCall.body, {
    attemptToken: '22222222-2222-4222-8222-222222222222',
    progress: 0.5,
    stage: 'collecting_keyword',
    progressCurrent: 1,
    progressTotal: 2,
  });
  assert.equal(fetchCalls.some((call) => call.path.endsWith('/report')), false);
});

test('uses the claimed absolute deadline to abort pending heartbeat work before returning', async () => {
  let heartbeatSettled = false;
  let abortReason;
  const claim = {
    runId: '11111111-1111-4111-8111-111111111111',
    operationKey: 'inventory.refresh_sellpia_snapshot',
    attemptToken: '22222222-2222-4222-8222-222222222222',
    attempt: 1,
    input: {},
    leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    deadlineAt: new Date(Date.now() + 15).toISOString(),
  };
  const { client, fetchCalls, sessionCancellations } = createHarness({
    claim,
    fetchResponse: ({ pathName, init }) => {
      if (!pathName.endsWith('/heartbeat')) return new Response(null, { status: 204 });
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
      });
    },
    handler: async ({ signal, heartbeat }) => {
      signal.addEventListener('abort', () => { abortReason = signal.reason; }, { once: true });
      await heartbeat(0.25).catch(() => undefined).finally(() => {
        heartbeatSettled = true;
      });
      return { status: 'succeeded', result: { collected: 1 } };
    },
  });

  await client.tick('office');

  assert.equal(abortReason?.message, 'operation_deadline_exceeded');
  assert.equal(heartbeatSettled, true);
  assert.equal(sessionCancellations.length, 1);
  assert.equal(fetchCalls.some((call) => call.path.endsWith('/report')), false);
});

test('does not extend an offline checkpoint beyond the claimed server lease or deadline', async () => {
  const leaseExpiresAt = new Date(Date.now() + 30_000).toISOString();
  const deadlineAt = new Date(Date.now() + 120_000).toISOString();
  let handlerSignal;
  const { client, storage } = createHarness({
    claim: {
      runId: '11111111-1111-4111-8111-111111111111',
      operationKey: 'inventory.refresh_sellpia_snapshot',
      attemptToken: '22222222-2222-4222-8222-222222222222',
      attempt: 1,
      input: {},
      leaseExpiresAt,
      deadlineAt,
    },
    fetchResponse: () => {
      throw new TypeError('offline');
    },
    handler: async ({ signal, heartbeat }) => {
      handlerSignal = signal;
      await heartbeat(0.1).catch(() => undefined);
      return { status: 'succeeded', result: { collected: 1 } };
    },
  });

  await client.tick('office');

  assert.equal(handlerSignal.aborted, false);
  const checkpoint = storage.kiditem_operation_runtime_active_v1.office;
  assert.ok(Date.parse(checkpoint.resumeLeaseExpiresAt) <= Date.parse(leaseExpiresAt));
  assert.ok(Date.parse(checkpoint.resumeLeaseExpiresAt) <= Date.parse(deadlineAt));
});

test('never resumes an expired server lease from a newer local recovery marker', async () => {
  let handlerCalls = 0;
  const expiredClaim = {
    runId: '11111111-1111-4111-8111-111111111111',
    operationKey: 'inventory.refresh_sellpia_snapshot',
    attemptToken: '22222222-2222-4222-8222-222222222222',
    attempt: 1,
    input: {},
    leaseExpiresAt: new Date(Date.now() - 1_000).toISOString(),
    deadlineAt: new Date(Date.now() + 60_000).toISOString(),
  };
  const { client, fetchCalls } = createHarness({
    claim: null,
    initialStorage: {
      kiditem_operation_runtime_active_v1: {
        office: {
          claim: expiredClaim,
          progress: 0.4,
          resumeLeaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      },
    },
    handler: async () => {
      handlerCalls += 1;
      return { status: 'succeeded', result: {} };
    },
  });

  await client.wake('office');

  assert.equal(handlerCalls, 0);
  assert.equal(fetchCalls.some((call) => call.path.endsWith('/heartbeat')), false);
  assert.equal(fetchCalls.filter((call) => call.path.endsWith('/claim')).length, 1);
});
