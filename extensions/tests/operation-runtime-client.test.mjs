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
  const defaultClaim = {
    runId: '11111111-1111-4111-8111-111111111111',
    operationKey: 'inventory.refresh_sellpia_snapshot',
    attemptToken: '22222222-2222-4222-8222-222222222222',
    attempt: 1,
    input: {},
    leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    deadlineAt: new Date(Date.now() + 15 * 60_000).toISOString(),
  };
  const claimOption = Object.hasOwn(options, 'claim') ? options.claim : defaultClaim;
  const claimFor = (environmentId) => typeof claimOption === 'function'
    ? claimOption(environmentId)
    : claimOption;
  const environmentIds = options.environmentIds || ['office'];
  const storage = { ...(options.initialStorage || {}) };
  let storageGetIndex = 0;
  let storageSetIndex = 0;
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
          const getIndex = storageGetIndex;
          storageGetIndex += 1;
          if (typeof options.beforeStorageGet === 'function') {
            await options.beforeStorageGet({ getIndex, key });
          }
          if (typeof key === 'string') return { [key]: storage[key] };
          return { ...storage };
        },
        async set(values) {
          const setIndex = storageSetIndex;
          storageSetIndex += 1;
          if (typeof options.beforeStorageSet === 'function') {
            await options.beforeStorageSet({ setIndex, values });
          }
          Object.assign(storage, values);
        },
        async remove(key) {
          delete storage[key];
        },
      },
    },
  };
  const environmentContext = {
    environmentIds,
    alarmName(base, environmentId) { return `${base}:${environmentId}`; },
    parseAlarmName(base, name) {
      return environmentIds.find((environmentId) =>
        name === `${base}:${environmentId}`) || null;
    },
    async authedFetch(environmentId, pathName, init) {
      fetchCalls.push({
        environmentId,
        path: pathName,
        body: init.body ? JSON.parse(init.body) : undefined,
      });
      if (pathName.endsWith('/claim')) {
        return new Response(JSON.stringify({ claim: claimFor(environmentId) }), { status: 200 });
      }
      if (typeof options.fetchResponse === 'function') {
        return options.fetchResponse({ environmentId, pathName, init });
      }
      return new Response(null, { status: 204 });
    },
  };
  const domains = {
    runOperation(key) {
      const knownClaim = environmentIds
        .map(claimFor)
        .find((candidate) => candidate?.operationKey === key);
      assert.ok(knownClaim);
      if (typeof options.runOperation === 'function') {
        return options.runOperation(key);
      }
      return Object.hasOwn(options, 'handler')
        ? typeof options.handler === 'function'
          ? options.handler
          : options.handler?.[key]
        : (async () => ({ status: 'succeeded', result: { collected: 12 } }));
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

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function claimForEnvironment(environmentId) {
  return {
    runId: environmentId === 'local'
      ? '11111111-1111-4111-8111-111111111111'
      : '33333333-3333-4333-8333-333333333333',
    operationKey: `inventory.refresh_${environmentId}_snapshot`,
    attemptToken: environmentId === 'local'
      ? '22222222-2222-4222-8222-222222222222'
      : '44444444-4444-4444-8444-444444444444',
    attempt: 1,
    input: {},
    leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    deadlineAt: new Date(Date.now() + 15 * 60_000).toISOString(),
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

test('coalesces concurrent install, alarm, and wake recovery for one stored attempt', async () => {
  const claim = claimForEnvironment('office');
  const heartbeatStarted = deferred();
  const releaseHeartbeat = deferred();
  const reportFinished = deferred();
  let heartbeatCalls = 0;
  let handlerCalls = 0;
  let reportCalls = 0;
  const harness = createHarness({
    claim,
    initialStorage: {
      kiditem_operation_runtime_active_v1: {
        office: {
          claim,
          progress: 0.25,
          stage: 'collecting',
          progressCurrent: 1,
          progressTotal: 4,
          leaseDurationMs: 60_000,
          lastHeartbeatSucceededAt: new Date().toISOString(),
          resumeLeaseExpiresAt: claim.leaseExpiresAt,
        },
      },
    },
    beforeStorageGet: async ({ key }) => {
      if (key === 'kiditem_operation_runtime_terminated_v1') {
        await new Promise((resolve) => setTimeout(resolve, 15));
      }
    },
    fetchResponse: ({ pathName }) => {
      if (pathName.endsWith('/heartbeat')) {
        heartbeatCalls += 1;
        heartbeatStarted.resolve();
        return releaseHeartbeat.promise.then(
          () => new Response(null, { status: 204 }),
        );
      }
      if (pathName.endsWith('/report')) {
        reportCalls += 1;
        reportFinished.resolve();
      }
      return new Response(null, { status: 204 });
    },
    handler: async () => {
      handlerCalls += 1;
      return { status: 'succeeded', result: { collected: 1 } };
    },
  });

  harness.client.install();
  harness.alarmListeners[0]({ name: 'kiditem-operation-runtime-claim:office' });
  const wake = harness.client.wake('office');
  await heartbeatStarted.promise;
  await new Promise((resolve) => setImmediate(resolve));
  releaseHeartbeat.resolve();
  await Promise.all([wake, reportFinished.promise]);
  await new Promise((resolve) => setTimeout(resolve, 25));

  assert.equal(heartbeatCalls, 1);
  assert.equal(handlerCalls, 1);
  assert.equal(reportCalls, 1);
  assert.equal(
    harness.fetchCalls.filter((call) => call.path.endsWith('/claim')).length,
    0,
  );
});

test('releases a recovery reservation after transport rejection', async () => {
  const claim = claimForEnvironment('office');
  let heartbeatCalls = 0;
  let handlerCalls = 0;
  const harness = createHarness({
    claim,
    initialStorage: {
      kiditem_operation_runtime_active_v1: {
        office: {
          claim,
          progress: null,
          leaseDurationMs: 60_000,
          lastHeartbeatSucceededAt: new Date().toISOString(),
          resumeLeaseExpiresAt: claim.leaseExpiresAt,
        },
      },
    },
    fetchResponse: ({ pathName }) => {
      if (pathName.endsWith('/heartbeat')) {
        heartbeatCalls += 1;
        if (heartbeatCalls === 1) throw new TypeError('offline');
      }
      return new Response(null, { status: 204 });
    },
    handler: async () => {
      handlerCalls += 1;
      return { status: 'succeeded', result: { collected: 1 } };
    },
  });

  await harness.client.wake('office');
  await harness.client.wake('office');

  assert.equal(heartbeatCalls, 2);
  assert.equal(handlerCalls, 1);
  assert.equal(
    harness.fetchCalls.filter((call) => call.path.endsWith('/heartbeat')).length,
    2,
  );
  assert.equal(
    harness.fetchCalls.filter((call) => call.path.endsWith('/report')).length,
    1,
  );
  assert.equal(harness.storage.kiditem_operation_runtime_active_v1?.office, undefined);
});

test('releases an exact-attempt execution reservation after registry rejection', async () => {
  let handlerLookups = 0;
  let handlerCalls = 0;
  const harness = createHarness({
    runOperation: () => {
      handlerLookups += 1;
      if (handlerLookups === 1) throw new Error('registry temporarily unavailable');
      return async () => {
        handlerCalls += 1;
        return { status: 'succeeded', result: { collected: 1 } };
      };
    },
  });

  await harness.client.tick('office');
  await harness.client.tick('office');

  assert.equal(handlerLookups, 2);
  assert.equal(handlerCalls, 1);
  assert.equal(
    harness.fetchCalls.filter((call) => call.path.endsWith('/report')).length,
    1,
  );
});

test('recovers local and office attempts independently', async () => {
  const local = claimForEnvironment('local');
  const office = claimForEnvironment('office');
  const officeHeartbeatStarted = deferred();
  const releaseOfficeHeartbeat = deferred();
  const handled = [];
  const harness = createHarness({
    environmentIds: ['local', 'office'],
    claim: claimForEnvironment,
    initialStorage: {
      kiditem_operation_runtime_active_v1: {
        local: {
          claim: local,
          progress: null,
          leaseDurationMs: 60_000,
          lastHeartbeatSucceededAt: new Date().toISOString(),
          resumeLeaseExpiresAt: local.leaseExpiresAt,
        },
        office: {
          claim: office,
          progress: null,
          leaseDurationMs: 60_000,
          lastHeartbeatSucceededAt: new Date().toISOString(),
          resumeLeaseExpiresAt: office.leaseExpiresAt,
        },
      },
    },
    fetchResponse: ({ environmentId, pathName }) => {
      if (environmentId === 'office' && pathName.endsWith('/heartbeat')) {
        officeHeartbeatStarted.resolve();
        return releaseOfficeHeartbeat.promise.then(
          () => new Response(null, { status: 204 }),
        );
      }
      return new Response(null, { status: 204 });
    },
    handler: async ({ environmentId }) => {
      handled.push(environmentId);
      return { status: 'succeeded', result: { collected: 1 } };
    },
  });

  const officeRecovery = harness.client.wake('office');
  await officeHeartbeatStarted.promise;
  await harness.client.wake('local');

  assert.deepEqual(handled, ['local']);
  assert.equal(
    harness.fetchCalls.some(
      (call) => call.environmentId === 'local' && call.path.endsWith('/report'),
    ),
    true,
  );
  releaseOfficeHeartbeat.resolve();
  await officeRecovery;
  assert.deepEqual(handled.sort(), ['local', 'office']);
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

test('aborts cleanup and suppresses reporting when a fenced handler request returns 409', async () => {
  let handlerSignal;
  const { client, fetchCalls, sessionCancellations } = createHarness({
    handler: async ({ signal }) => {
      handlerSignal = signal;
      const error = new Error('operation_runtime_fence_lost');
      error.status = 409;
      throw error;
    },
  });

  await client.tick('office');

  assert.equal(handlerSignal.aborted, true);
  assert.equal(handlerSignal.reason?.message, 'operation_runtime_fence_lost');
  assert.deepEqual(JSON.parse(JSON.stringify(sessionCancellations)), [{
    runId: '11111111-1111-4111-8111-111111111111',
    cancelOptions: { closeManagedTab: true },
  }]);
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

test('never resumes an expired server lease and terminates its managed session', async () => {
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
  const { client, fetchCalls, sessionCancellations } = createHarness({
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
  assert.deepEqual(JSON.parse(JSON.stringify(sessionCancellations)), [{
    runId: expiredClaim.runId,
    cancelOptions: { closeManagedTab: true },
  }]);
});

test('terminates deterministic terminal-report HTTP failures without replaying the handler', async () => {
  for (const status of [400, 401, 403, 409, 422, 500]) {
    let handlerCalls = 0;
    const harness = createHarness({
      fetchResponse: ({ pathName }) => pathName.endsWith('/report')
        ? new Response(null, { status })
        : new Response(null, { status: 204 }),
      handler: async () => {
        handlerCalls += 1;
        return { status: 'succeeded', result: { collected: 1 } };
      },
    });

    await harness.client.tick('office');
    await harness.client.wake('office');

    assert.equal(handlerCalls, 1, `HTTP ${status} must not replay provider work`);
    assert.equal(
      harness.storage.kiditem_operation_runtime_active_v1?.office,
      undefined,
      `HTTP ${status} must clear the runnable checkpoint`,
    );
    assert.deepEqual(
      JSON.parse(JSON.stringify(harness.sessionCancellations)),
      [{
        runId: '11111111-1111-4111-8111-111111111111',
        cancelOptions: { closeManagedTab: true },
      }],
      `HTTP ${status} must close the managed session once`,
    );
  }
});

test('persists deterministic report termination across a service-worker restart', async () => {
  let handlerCalls = 0;
  const handler = async () => {
    handlerCalls += 1;
    return { status: 'succeeded', result: {} };
  };
  const first = createHarness({
    handler,
    fetchResponse: ({ pathName }) => pathName.endsWith('/report')
      ? new Response(null, { status: 400 })
      : new Response(null, { status: 204 }),
  });
  await first.client.tick('office');

  const restarted = createHarness({
    handler,
    initialStorage: first.storage,
  });
  await restarted.client.wake('office');

  assert.equal(handlerCalls, 1);
  assert.equal(
    restarted.fetchCalls.filter((call) => call.path.endsWith('/report')).length,
    0,
  );
});

test('bounds a deterministic tombstone by the renewed lease rather than the original claim lease', async () => {
  let handlerCalls = 0;
  const claim = {
    runId: '11111111-1111-4111-8111-111111111111',
    operationKey: 'inventory.refresh_sellpia_snapshot',
    attemptToken: '22222222-2222-4222-8222-222222222222',
    attempt: 1,
    input: {},
    leaseExpiresAt: new Date(Date.now() + 40).toISOString(),
    deadlineAt: new Date(Date.now() + 60_000).toISOString(),
  };
  const harness = createHarness({
    claim,
    fetchResponse: ({ pathName }) => pathName.endsWith('/report')
      ? new Response(null, { status: 400 })
      : new Response(null, { status: 204 }),
    handler: async ({ heartbeat }) => {
      handlerCalls += 1;
      await heartbeat(0.5);
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { status: 'succeeded', result: {} };
    },
  });

  await harness.client.tick('office');
  await harness.client.wake('office');

  assert.equal(handlerCalls, 1);
  assert.ok(
    Date.parse(
      harness.storage.kiditem_operation_runtime_terminated_v1.office.expiresAt,
    ) > Date.parse(claim.leaseExpiresAt),
  );
});

test('does not loop a missing-handler attention report after deterministic rejection', async () => {
  const harness = createHarness({
    handler: undefined,
    fetchResponse: ({ pathName }) => pathName.endsWith('/report')
      ? new Response(null, { status: 422 })
      : new Response(null, { status: 204 }),
  });

  await harness.client.tick('office');
  await harness.client.wake('office');

  assert.equal(
    harness.fetchCalls.filter((call) => call.path.endsWith('/report')).length,
    1,
  );
  assert.equal(harness.storage.kiditem_operation_runtime_active_v1?.office, undefined);
  assert.equal(harness.sessionCancellations.length, 1);
});

test('cleans the exact owned session after reporting a missing handler', async () => {
  const harness = createHarness({ handler: undefined });

  await harness.client.tick('office');

  const reports = harness.fetchCalls.filter((call) => call.path.endsWith('/report'));
  assert.equal(reports.length, 1);
  assert.deepEqual(reports[0].body, {
    attemptToken: '22222222-2222-4222-8222-222222222222',
    status: 'attention_required',
    attentionReason: 'browser_operation_handler_missing',
    progress: null,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(harness.sessionCancellations)), [{
    runId: '11111111-1111-4111-8111-111111111111',
    cancelOptions: { closeManagedTab: true },
  }]);
  assert.equal(harness.storage.kiditem_operation_runtime_active_v1?.office, undefined);
});

test('immediately drops an expired missing-handler checkpoint after transport failure', async () => {
  const claim = {
    runId: '11111111-1111-4111-8111-111111111111',
    operationKey: 'inventory.refresh_sellpia_snapshot',
    attemptToken: '22222222-2222-4222-8222-222222222222',
    attempt: 1,
    input: {},
    leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    deadlineAt: new Date(Date.now() + 15 * 60_000).toISOString(),
  };
  let harness;
  harness = createHarness({
    claim,
    initialStorage: {
      kiditem_operation_runtime_active_v1: {
        office: {
          claim,
          progress: null,
          leaseDurationMs: 60_000,
          lastHeartbeatSucceededAt: null,
          resumeLeaseExpiresAt: claim.leaseExpiresAt,
        },
      },
    },
    handler: undefined,
    fetchResponse: ({ pathName }) => {
      if (!pathName.endsWith('/report')) return new Response(null, { status: 204 });
      harness.storage.kiditem_operation_runtime_active_v1.office.resumeLeaseExpiresAt =
        new Date(Date.now() - 1).toISOString();
      throw new TypeError('offline');
    },
  });

  await harness.client.wake('office');

  assert.equal(
    harness.fetchCalls.filter((call) => call.path.endsWith('/report')).length,
    1,
  );
  assert.equal(harness.storage.kiditem_operation_runtime_active_v1?.office, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(harness.sessionCancellations)), [{
    runId: claim.runId,
    cancelOptions: { closeManagedTab: true },
  }]);
});

test('retains a live missing-handler checkpoint for heartbeat recovery', async () => {
  const claim = {
    runId: '11111111-1111-4111-8111-111111111111',
    operationKey: 'inventory.refresh_sellpia_snapshot',
    attemptToken: '22222222-2222-4222-8222-222222222222',
    attempt: 1,
    input: {},
    leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    deadlineAt: new Date(Date.now() + 15 * 60_000).toISOString(),
  };
  let reportAttempts = 0;
  const harness = createHarness({
    claim,
    initialStorage: {
      kiditem_operation_runtime_active_v1: {
        office: {
          claim,
          progress: null,
          leaseDurationMs: 60_000,
          lastHeartbeatSucceededAt: null,
          resumeLeaseExpiresAt: claim.leaseExpiresAt,
        },
      },
    },
    handler: undefined,
    fetchResponse: ({ pathName }) => {
      if (!pathName.endsWith('/report')) return new Response(null, { status: 204 });
      reportAttempts += 1;
      if (reportAttempts === 1) throw new TypeError('offline');
      return new Response(null, { status: 204 });
    },
  });

  await harness.client.wake('office');

  assert.ok(harness.storage.kiditem_operation_runtime_active_v1?.office);
  assert.equal(harness.sessionCancellations.length, 0);

  const beforeRecovery = harness.fetchCalls.length;
  await harness.client.wake('office');
  const recoveryCalls = harness.fetchCalls.slice(beforeRecovery);

  assert.equal(recoveryCalls[0]?.path.endsWith('/heartbeat'), true);
  assert.equal(recoveryCalls[1]?.path.endsWith('/report'), true);
  assert.equal(reportAttempts, 2);
  assert.equal(harness.storage.kiditem_operation_runtime_active_v1?.office, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(harness.sessionCancellations)), [{
    runId: claim.runId,
    cancelOptions: { closeManagedTab: true },
  }]);
});

test('terminates a malformed successful report response and structured auth failure', async () => {
  for (const failure of ['malformed_response', 'structured_auth']) {
    let handlerCalls = 0;
    const harness = createHarness({
      fetchResponse: ({ pathName }) => {
        if (!pathName.endsWith('/report')) return new Response(null, { status: 204 });
        if (failure === 'malformed_response') {
          return new Response('{not-json', { status: 200 });
        }
        const error = new Error('login is required');
        error.code = 'environment_auth_required';
        throw error;
      },
      handler: async () => {
        handlerCalls += 1;
        return { status: 'succeeded', result: {} };
      },
    });

    await harness.client.tick('office');
    await harness.client.wake('office');

    assert.equal(handlerCalls, 1, `${failure} must not replay provider work`);
    assert.equal(harness.storage.kiditem_operation_runtime_active_v1?.office, undefined);
    assert.equal(harness.sessionCancellations.length, 1);
  }
});

test('persists terminal reports across transport loss and retries without replaying provider work', async () => {
  for (const transportFailure of [
    new TypeError('offline'),
    Object.assign(new Error('request timed out'), { code: 'request_timeout' }),
    new DOMException('request timed out', 'AbortError'),
  ]) {
    let handlerCalls = 0;
    let reportCalls = 0;
    const harness = createHarness({
      fetchResponse: ({ pathName }) => {
        if (!pathName.endsWith('/report')) return new Response(null, { status: 204 });
        reportCalls += 1;
        if (reportCalls === 1) throw transportFailure;
        return new Response(null, { status: 204 });
      },
      handler: async () => {
        handlerCalls += 1;
        return { status: 'succeeded', result: { collected: 1 } };
      },
    });

    await harness.client.tick('office');
    assert.equal(handlerCalls, 1);
    assert.ok(harness.storage.kiditem_operation_runtime_active_v1?.office);

    const beforeResume = harness.fetchCalls.length;
    await harness.client.wake('office');
    const resumeCalls = harness.fetchCalls.slice(beforeResume);

    assert.equal(handlerCalls, 1);
    assert.equal(resumeCalls[0]?.path.endsWith('/heartbeat'), true);
    assert.equal(resumeCalls[1]?.path.endsWith('/report'), true);
    assert.deepEqual(resumeCalls[1]?.body, {
      attemptToken: '22222222-2222-4222-8222-222222222222',
      status: 'succeeded',
      progress: null,
      result: { collected: 1 },
    });
    assert.equal(harness.storage.kiditem_operation_runtime_active_v1?.office, undefined);
    assert.equal(harness.sessionCancellations.length, 1);
  }
});

test('resumes a persisted terminal report after an MV3 worker restart without rerunning the handler', async () => {
  let handlerCalls = 0;
  let reportCalls = 0;
  const handler = async () => {
    handlerCalls += 1;
    return { status: 'succeeded', result: { collected: 1 } };
  };
  const first = createHarness({
    handler,
    fetchResponse: ({ pathName }) => {
      if (!pathName.endsWith('/report')) return new Response(null, { status: 204 });
      reportCalls += 1;
      throw new TypeError('offline');
    },
  });

  await first.client.tick('office');
  const checkpoint = first.storage.kiditem_operation_runtime_active_v1?.office;
  assert.equal(checkpoint?.reportPending?.payload?.status, 'succeeded');
  assert.equal(checkpoint?.reportPending?.payload?.result?.collected, 1);

  const restarted = createHarness({
    handler,
    initialStorage: first.storage,
  });
  await restarted.client.wake('office');

  assert.equal(handlerCalls, 1);
  assert.equal(reportCalls, 1);
  assert.equal(
    restarted.fetchCalls.filter((call) => call.path.endsWith('/heartbeat')).length,
    1,
  );
  assert.equal(
    restarted.fetchCalls.filter((call) => call.path.endsWith('/report')).length,
    1,
  );
  assert.equal(restarted.storage.kiditem_operation_runtime_active_v1?.office, undefined);
});

test('retries bounded failed and attention reports without rerunning their completed handlers', async () => {
  for (const outcome of [
    {
      status: 'failed',
      errorCode: 'wing_catalog_all_keywords_failed',
      errorMessage: 'All keywords failed.',
    },
    {
      status: 'attention_required',
      attentionReason: 'marketplace_login',
    },
  ]) {
    let handlerCalls = 0;
    let failFirstReport = true;
    const harness = createHarness({
      handler: async () => {
        handlerCalls += 1;
        return outcome;
      },
      fetchResponse: ({ pathName }) => {
        if (pathName.endsWith('/report') && failFirstReport) {
          failFirstReport = false;
          throw new TypeError('offline');
        }
        return new Response(null, { status: 204 });
      },
    });

    await harness.client.tick('office');
    await harness.client.wake('office');

    assert.equal(handlerCalls, 1);
    assert.equal(
      harness.fetchCalls.filter((call) => call.path.endsWith('/report')).length,
      2,
    );
    assert.equal(harness.storage.kiditem_operation_runtime_active_v1?.office, undefined);
  }
});

test('clears malformed persisted terminal data without replaying marketplace work', async () => {
  const claim = claimForEnvironment('office');
  let handlerCalls = 0;
  const harness = createHarness({
    claim,
    handler: async () => {
      handlerCalls += 1;
      return { status: 'succeeded', result: { collected: 1 } };
    },
    initialStorage: {
      kiditem_operation_runtime_active_v1: {
        office: {
          claim,
          progress: null,
          leaseDurationMs: 60_000,
          lastHeartbeatSucceededAt: new Date().toISOString(),
          resumeLeaseExpiresAt: claim.leaseExpiresAt,
          reportPending: {
            runId: claim.runId,
            attemptToken: claim.attemptToken,
            leaseExpiresAt: claim.leaseExpiresAt,
            deadlineAt: claim.deadlineAt,
            payload: {
              status: 'succeeded',
              result: { rawRows: [{ secret: true }] },
              progress: null,
            },
          },
        },
      },
    },
  });

  await harness.client.wake('office');

  assert.equal(handlerCalls, 0);
  assert.equal(
    harness.fetchCalls.filter((call) => call.path.endsWith('/report')).length,
    0,
  );
  assert.equal(harness.storage.kiditem_operation_runtime_active_v1?.office, undefined);
  assert.equal(harness.sessionCancellations.length, 1);
});

test('never sends a terminal report that could not first be persisted', async () => {
  let handlerCalls = 0;
  const harness = createHarness({
    handler: async () => {
      handlerCalls += 1;
      return { status: 'succeeded', result: { collected: 1 } };
    },
    beforeStorageSet: async ({ values }) => {
      if (values.kiditem_operation_runtime_active_v1?.office?.reportPending) {
        throw new Error('storage unavailable');
      }
    },
  });

  await harness.client.tick('office');

  assert.equal(handlerCalls, 1);
  assert.equal(
    harness.fetchCalls.filter((call) => call.path.endsWith('/report')).length,
    0,
  );
  assert.equal(harness.storage.kiditem_operation_runtime_active_v1?.office, undefined);
  assert.equal(harness.sessionCancellations.length, 1);
});

test('drops a transport checkpoint that expires before report recovery', async () => {
  let handlerCalls = 0;
  const claim = {
    runId: '11111111-1111-4111-8111-111111111111',
    operationKey: 'inventory.refresh_sellpia_snapshot',
    attemptToken: '22222222-2222-4222-8222-222222222222',
    attempt: 1,
    input: {},
    leaseExpiresAt: new Date(Date.now() + 5).toISOString(),
    deadlineAt: new Date(Date.now() + 60_000).toISOString(),
  };
  const harness = createHarness({
    claim,
    fetchResponse: ({ pathName }) => {
      if (!pathName.endsWith('/report')) return new Response(null, { status: 204 });
      return new Promise((_resolve, reject) => {
        setTimeout(() => reject(new TypeError('offline')), 10);
      });
    },
    handler: async () => {
      handlerCalls += 1;
      return { status: 'succeeded', result: {} };
    },
  });

  await harness.client.tick('office');

  assert.equal(handlerCalls, 1);
  assert.equal(harness.storage.kiditem_operation_runtime_active_v1?.office, undefined);
  assert.equal(harness.sessionCancellations.length, 1);
});

test('serializes concurrent environment stores and pending reports without losing either checkpoint', async () => {
  const harness = createHarness({
    environmentIds: ['local', 'office'],
    claim: claimForEnvironment,
    beforeStorageSet: async ({ setIndex }) => {
      if (setIndex === 0) await new Promise((resolve) => setTimeout(resolve, 15));
    },
    fetchResponse: ({ pathName }) => {
      if (pathName.endsWith('/report')) throw new TypeError('offline');
      return new Response(null, { status: 204 });
    },
  });

  await Promise.all([harness.client.tick('local'), harness.client.tick('office')]);

  const active = harness.storage.kiditem_operation_runtime_active_v1;
  assert.deepEqual(Object.keys(active).sort(), ['local', 'office']);
  assert.equal(active.local.reportPending.payload.status, 'succeeded');
  assert.equal(active.office.reportPending.payload.status, 'succeeded');
  assert.equal(
    harness.fetchCalls.filter((call) => call.path.endsWith('/report')).length,
    2,
  );
});

test('serializes concurrent pending-report clears without resurrecting another environment', async () => {
  const local = claimForEnvironment('local');
  const office = claimForEnvironment('office');
  const checkpoint = (claim) => ({
    claim,
    progress: null,
    stage: null,
    progressCurrent: null,
    progressTotal: null,
    leaseDurationMs: 60_000,
    lastHeartbeatSucceededAt: new Date().toISOString(),
    resumeLeaseExpiresAt: claim.leaseExpiresAt,
    reportPending: {
      runId: claim.runId,
      attemptToken: claim.attemptToken,
      leaseExpiresAt: claim.leaseExpiresAt,
      deadlineAt: claim.deadlineAt,
      payload: { status: 'succeeded', result: { collected: 1 }, progress: null },
    },
  });
  const harness = createHarness({
    environmentIds: ['local', 'office'],
    claim: claimForEnvironment,
    initialStorage: {
      kiditem_operation_runtime_active_v1: {
        local: checkpoint(local),
        office: checkpoint(office),
      },
    },
    beforeStorageSet: async ({ setIndex }) => {
      if (setIndex === 0) await new Promise((resolve) => setTimeout(resolve, 15));
    },
  });

  await Promise.all([harness.client.wake('local'), harness.client.wake('office')]);

  assert.deepEqual(harness.storage.kiditem_operation_runtime_active_v1, {});
  assert.equal(
    harness.fetchCalls.filter((call) => call.path.endsWith('/report')).length,
    2,
  );
});

test('serializes concurrent tombstones and active clears after deterministic checkpoint rejection', async () => {
  const local = claimForEnvironment('local');
  const office = claimForEnvironment('office');
  const checkpoint = (claim) => ({
    claim,
    progress: null,
    leaseDurationMs: 60_000,
    lastHeartbeatSucceededAt: new Date().toISOString(),
    resumeLeaseExpiresAt: claim.leaseExpiresAt,
  });
  const harness = createHarness({
    environmentIds: ['local', 'office'],
    claim: claimForEnvironment,
    initialStorage: {
      kiditem_operation_runtime_active_v1: {
        local: checkpoint(local),
        office: checkpoint(office),
      },
    },
    beforeStorageSet: async ({ setIndex }) => {
      if (setIndex === 0) await new Promise((resolve) => setTimeout(resolve, 15));
    },
    fetchResponse: ({ pathName }) => pathName.endsWith('/heartbeat')
      ? new Response(null, { status: 401 })
      : new Response(null, { status: 204 }),
  });

  await Promise.all([harness.client.wake('local'), harness.client.wake('office')]);

  assert.deepEqual(
    Object.keys(harness.storage.kiditem_operation_runtime_terminated_v1).sort(),
    ['local', 'office'],
  );
  assert.deepEqual(harness.storage.kiditem_operation_runtime_active_v1, {});
  assert.equal(harness.sessionCancellations.length, 2);
});
