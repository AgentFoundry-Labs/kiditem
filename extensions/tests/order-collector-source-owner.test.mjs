import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const backgroundRoot = path.join(repoRoot, 'extensions/kiditem-os/background');
const workerSource = readFileSync(path.join(backgroundRoot, 'orders/worker.js'), 'utf8');
const serviceWorkerSource = readFileSync(path.join(backgroundRoot, 'service-worker.js'), 'utf8');
const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const ATTEMPT_TOKEN = '22222222-2222-4222-8222-222222222222';
const SOURCE_RUN_ID = '33333333-3333-4333-8333-333333333333';
const CHANNEL_ACCOUNT_ID = '44444444-4444-4444-8444-444444444444';

test('loads the server converter before the order worker in the production service worker', () => {
  const converterAt = serviceWorkerSource.indexOf('"orders/order-collection-server-converter.js"');
  const ownerAt = serviceWorkerSource.indexOf('"orders/order-collection-source-owner.js"');
  const workerAt = serviceWorkerSource.indexOf('"orders/worker.js"');
  assert.ok(converterAt >= 0);
  assert.ok(ownerAt > converterAt);
  assert.ok(workerAt > converterAt);
});

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`${name} closing brace not found`);
}

function response(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    async json() {
      return body;
    },
  };
}

function control(overrides = {}) {
  return {
    attemptId: ATTEMPT_ID,
    sourceImportRunId: SOURCE_RUN_ID,
    attemptToken: ATTEMPT_TOKEN,
    state: 'RUNNING',
    plan: {
      sourceType: 'order_collection_mall',
      parserVersion: 'order-collection-v1',
      mallKey: 'kakao',
      mallName: '카카오',
      channelAccountId: CHANNEL_ACCOUNT_ID,
      collectionDate: '2026-09-06',
      collectionMode: 'browser',
    },
    expiresAt: '2099-01-01T00:00:00.000Z',
    artifactId: null,
    coverageStartDate: null,
    coverageEndDate: null,
    errorCode: null,
    errorMessage: null,
    ...overrides,
  };
}

function createHarness({ initialControl = control(), collectResult, failMode = 'ack', storageState = {} }) {
  let current = structuredClone(initialControl);
  let session = null;
  let cancelCount = 0;
  let storageGetFailure = false;
  let storageSetFailure = false;
  let storageSetGate = null;
  let storageSetStartedResolve = null;
  const requests = [];
  const lifecycleCalls = [];
  const failBodies = [];
  const chrome = {
    storage: {
      local: {
        async get(key) {
          if (storageGetFailure) throw new Error('pending storage get failed');
          if (typeof key === 'string') return { [key]: storageState[key] };
          return { ...storageState };
        },
        async set(value) {
          if (storageSetFailure) throw new Error('pending storage set failed');
          if (storageSetGate) {
            storageSetStartedResolve?.();
            await storageSetGate;
            storageSetGate = null;
            storageSetStartedResolve = null;
          }
          Object.assign(storageState, value);
        },
        async remove(key) {
          for (const name of (Array.isArray(key) ? key : [key])) delete storageState[name];
        },
      },
    },
  };
  const sessions = {
    async getOwned() { return session; },
    async start(input) {
      session = {
        ...input,
        progress: { current: 0, total: 0, completed: 0, failed: 0, label: null },
        attention: null,
      };
      return session;
    },
    async cancel() {
      cancelCount += 1;
      session = null;
      return null;
    },
    async requireAttention() { return session; },
  };
  const lifecycle = {
    async run(message, identity, operation) {
      lifecycleCalls.push({ message, identity });
      await sessions.start({
        attemptId: message.attemptId,
        environmentId: message.environmentId,
        producer: 'orders.mall',
      });
      const result = await operation({ attemptId: message.attemptId });
      return {
        ...result,
        attemptId: message.attemptId,
        collectionSession: session,
      };
    },
  };
  const context = vm.createContext({
    Date,
    Promise,
    TextEncoder,
    structuredClone,
    KidItemOrderCollectionLifecycle: {
      createIdentity(mallKey, date) { return { mallKey, date }; },
    },
    chrome,
  });
  vm.runInContext(
    readFileSync(path.join(backgroundRoot, 'sourcing/source-attempt-wire.js'), 'utf8'),
    context,
  );
  vm.runInContext(
    readFileSync(path.join(backgroundRoot, 'orders/order-collection-source-owner.js'), 'utf8'),
    context,
  );
  const request = async (_environmentId, requestPath, init = {}) => {
    requests.push({ path: requestPath, init });
    if (requestPath.endsWith('/control')) return response(structuredClone(current));
    if (requestPath.endsWith('/fail')) {
      const body = JSON.parse(String(init.body));
      failBodies.push(body);
      if (failMode === 'lost-ack') {
        current = {
          ...current,
          state: 'FAILED',
          errorCode: body.code,
          errorMessage: body.message,
        };
        throw new Error('terminal response lost');
      }
      if (failMode === 'unavailable') throw new Error('terminal response lost');
      current = {
        ...current,
        state: 'FAILED',
        errorCode: body.code,
        errorMessage: body.message,
      };
      const failed = structuredClone(current);
      delete failed.attemptToken;
      return response(failed);
    }
    throw new Error(`Unexpected owner request: ${requestPath}`);
  };
  const createOwner = () => context.KidItemOrderCollectionSourceOwner.create({
    chrome,
    sessions,
    lifecycle,
    request,
  });
  const owner = createOwner();
  return {
    owner,
    sessions,
    requests,
    lifecycleCalls,
    failBodies,
    current: () => current,
    cancelCount: () => cancelCount,
    setCurrent: (next) => { current = structuredClone(next); },
    setStorageGetFailure: (value) => { storageGetFailure = value; },
    setStorageSetFailure: (value) => { storageSetFailure = value; },
    delayStorageSet: () => {
      let release;
      const started = new Promise((resolve) => {
        storageSetStartedResolve = resolve;
      });
      storageSetGate = new Promise((resolve) => {
        release = resolve;
      });
      return { started, release };
    },
    restart: () => createOwner(),
    storageState,
    collectResult,
  };
}

test('routes runId compatibility through the server owner and freezes its date before provider collection', async () => {
  const harness = createHarness({
    collectResult: { success: true, orders: [{ orderNo: 'K-1' }] },
  });
  let providerPlan;
  const result = await harness.owner.run({
    environmentId: 'local',
    message: {
      action: 'collectKakaoOrders',
      runId: ATTEMPT_ID,
      date: '1999-01-01',
    },
    mallKey: 'kakao',
    collect: async (_collection, plan) => {
      providerPlan = plan;
      return harness.collectResult;
    },
  });

  assert.equal(result.success, true);
  assert.equal(result.terminalState, 'RUNNING');
  assert.equal(result.continuationRequired, true);
  assert.equal(providerPlan.collectionDate, '2026-09-06');
  assert.equal(harness.lifecycleCalls[0].identity.date, '2026-09-06');
  assert.equal(harness.lifecycleCalls[0].message.attemptId, ATTEMPT_ID);
  assert.equal(harness.lifecycleCalls[0].message.runId, ATTEMPT_ID);
  assert.equal(harness.requests.filter((request) => request.path.endsWith('/control')).length, 2);
  assert.equal(harness.requests.some((request) => request.path.endsWith('/fail')), false);
});

test('rejects missing or conflicting owner IDs before server or provider I/O', async () => {
  const harness = createHarness({ collectResult: { success: true } });
  let providerCalls = 0;
  const collect = async () => {
    providerCalls += 1;
    return harness.collectResult;
  };

  await assert.doesNotReject(async () => {
    const result = await harness.owner.run({
      environmentId: 'local',
      message: { action: 'collectKakaoOrders' },
      mallKey: 'kakao',
      collect,
    });
    assert.equal(result.errorCode, 'OWNER_ATTEMPT_REQUIRED');
  });
  await assert.doesNotReject(async () => {
    const result = await harness.owner.run({
      environmentId: 'local',
      message: {
        action: 'collectKakaoOrders',
        attemptId: ATTEMPT_ID,
        runId: SOURCE_RUN_ID,
      },
      mallKey: 'kakao',
      collect,
    });
    assert.equal(result.errorCode, 'OWNER_ATTEMPT_REQUIRED');
  });

  assert.equal(providerCalls, 0);
  assert.equal(harness.requests.length, 0);
  assert.equal(harness.lifecycleCalls.length, 0);
});

test('rejects a foreign server-owned attempt before provider I/O', async () => {
  const harness = createHarness({
    initialControl: control({ attemptId: SOURCE_RUN_ID }),
    collectResult: { success: true },
  });
  let providerCalls = 0;
  const result = await harness.owner.run({
    environmentId: 'office',
    message: { action: 'collectKakaoOrders', runId: ATTEMPT_ID },
    mallKey: 'kakao',
    collect: async () => {
      providerCalls += 1;
      return harness.collectResult;
    },
  });

  assert.equal(providerCalls, 0);
  assert.equal(harness.lifecycleCalls.length, 0);
  assert.equal(result.errorCode, 'SOURCE_OWNER_UNAVAILABLE');
  assert.equal(harness.requests.length, 3);
});

test('keeps server-owned failure evidence on the owner request without echoing raw capture to the page', async () => {
  const captured = {
    success: true,
    orders: [{ orderNo: 'K-1', recipient: 'operator@example.test' }],
  };
  const harness = createHarness({ collectResult: captured });
  const result = await harness.owner.run({
    environmentId: 'local',
    message: { action: 'collectKidsnoteOrders', attemptId: ATTEMPT_ID },
    mallKey: 'kakao',
    collect: async () => captured,
    submit: async () => {
      const error = new Error('converter rejected the capture');
      error.code = 'CONVERSION_FAILED';
      error.status = 422;
      error.sourcePayload = captured;
      throw error;
    },
  });

  assert.equal(result.success, false);
  assert.equal(result.terminalState, 'FAILED');
  assert.equal(result.errorCode, 'CONVERSION_FAILED');
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'sourcePayload'), false);
  assert.deepEqual(harness.failBodies[0].sourcePayload, captured);
});

test('terminalizes known local converter validation errors instead of waiting for reconciliation', async () => {
  for (const code of ['UNSUPPORTED_CONVERSION', 'CAPTURE_INVALID', 'NO_NEW_ORDERS']) {
    const captured = { success: true, orders: [{ orderNo: 'K-1' }] };
    const harness = createHarness({ collectResult: captured });
    const result = await harness.owner.run({
      environmentId: 'local',
      message: { action: 'collectKidsnoteOrders', attemptId: ATTEMPT_ID },
      mallKey: 'kakao',
      collect: async () => captured,
      submit: async () => {
        const error = new Error(`local converter error: ${code}`);
        error.code = code;
        throw error;
      },
    });

    assert.equal(result.success, false, code);
    assert.equal(result.terminalState, 'FAILED', code);
    assert.equal(result.errorCode, code, code);
    assert.equal(result.ownerReconciliation, undefined, code);
    assert.equal(harness.failBodies.length, 1, code);
    assert.equal(harness.current().state, 'FAILED', code);
  }
});

test('keeps a nullable legacy browser owner running without provider date injection', async () => {
  const base = control();
  const harness = createHarness({
    initialControl: {
      ...base,
      plan: { ...base.plan, collectionDate: null },
    },
    collectResult: { success: true, orders: [{ orderNo: 'K-1' }] },
  });
  let providerCalls = 0;
  const result = await harness.owner.run({
    environmentId: 'local',
    message: {
      action: 'collectKidsnoteOrders',
      attemptId: ATTEMPT_ID,
      serverOwned: true,
      date: '2026-09-10',
    },
    mallKey: 'kakao',
    collect: async () => {
      providerCalls += 1;
      return harness.collectResult;
    },
    submit: async () => ({ success: true }),
  });

  assert.equal(providerCalls, 0);
  assert.equal(harness.lifecycleCalls.length, 0);
  assert.equal(result.success, false);
  assert.equal(result.terminalState, 'FAILED');
  assert.equal(result.errorCode, 'ORDER_COLLECTION_DATE_NOT_ADMITTED');
  assert.equal(harness.failBodies.length, 1);
});

test('holds reconciliation when pending storage cannot be read after a worker restart', async () => {
  const captured = { success: true, orders: [{ orderNo: 'K-1' }] };
  const harness = createHarness({ collectResult: captured });
  let collectCalls = 0;
  let submitCalls = 0;
  const input = {
    environmentId: 'local',
    message: { action: 'collectKidsnoteOrders', attemptId: ATTEMPT_ID },
    mallKey: 'kakao',
    collect: async () => {
      collectCalls += 1;
      return captured;
    },
    submit: async () => {
      submitCalls += 1;
      const error = new Error('converter transport timed out');
      error.code = 'ETIMEDOUT';
      throw error;
    },
  };

  const first = await harness.owner.run(input);
  assert.equal(first.ownerReconciliation, 'required');
  assert.equal(collectCalls, 1);
  assert.equal(submitCalls, 1);

  harness.setStorageGetFailure(true);
  const resumed = await harness.restart().run(input);
  assert.equal(resumed.success, false);
  assert.equal(resumed.terminalState, 'RUNNING');
  assert.equal(resumed.continuationRequired, true);
  assert.equal(resumed.errorCode, 'SOURCE_OWNER_UNAVAILABLE');
  assert.equal(resumed.ownerReconciliation, 'required');
  assert.equal(collectCalls, 1);
  assert.equal(submitCalls, 1);
  assert.equal(harness.failBodies.length, 0);
});

test('does not dispatch conversion until pending storage write succeeds and replays the same-worker capture', async () => {
  const captured = {
    success: true,
    orders: [{ orderNo: 'K-1' }],
    confirmedCoverage: { startDate: '2026-09-06', endDate: '2026-09-06' },
  };
  const harness = createHarness({ collectResult: captured });
  let collectCalls = 0;
  let submitCalls = 0;
  const submittedCaptures = [];
  const input = {
    environmentId: 'local',
    message: { action: 'collectKidsnoteOrders', attemptId: ATTEMPT_ID },
    mallKey: 'kakao',
    collect: async () => {
      collectCalls += 1;
      return captured;
    },
    submit: async (capture) => {
      submitCalls += 1;
      submittedCaptures.push(capture);
      harness.setCurrent(control({
        state: 'COMPLETE',
        artifactId: '55555555-5555-4555-8555-555555555555',
      }));
      return { success: true, sourceRows: 1 };
    },
  };

  harness.setStorageSetFailure(true);
  const blocked = await harness.owner.run(input);
  assert.equal(blocked.success, false);
  assert.equal(blocked.terminalState, 'RUNNING');
  assert.equal(blocked.continuationRequired, true);
  assert.equal(blocked.ownerReconciliation, 'required');
  assert.equal(collectCalls, 1);
  assert.equal(submitCalls, 0);

  harness.setStorageSetFailure(false);
  const retried = await harness.owner.run(input);
  assert.equal(retried.success, true);
  assert.equal(retried.terminalState, 'COMPLETE');
  assert.equal(collectCalls, 1);
  assert.equal(submitCalls, 1);
  assert.equal(submittedCaptures[0].attemptId, ATTEMPT_ID);
  assert.deepEqual(submittedCaptures[0].orders, captured.orders);
  assert.deepEqual(submittedCaptures[0].confirmedCoverage, captured.confirmedCoverage);
  assert.equal(harness.failBodies.length, 0);
});

test('recollects after an unpersisted pending capture is lost across a worker restart', async () => {
  const captured = { success: true, orders: [{ orderNo: 'K-1' }] };
  const harness = createHarness({ collectResult: captured });
  let collectCalls = 0;
  let submitCalls = 0;
  const input = {
    environmentId: 'local',
    message: { action: 'collectKidsnoteOrders', attemptId: ATTEMPT_ID },
    mallKey: 'kakao',
    collect: async () => {
      collectCalls += 1;
      return captured;
    },
    submit: async () => {
      submitCalls += 1;
      harness.setCurrent(control({
        state: 'COMPLETE',
        artifactId: '55555555-5555-4555-8555-555555555555',
      }));
      return { success: true, sourceRows: 1 };
    },
  };

  harness.setStorageSetFailure(true);
  const blocked = await harness.owner.run(input);
  assert.equal(blocked.ownerReconciliation, 'required');
  assert.equal(collectCalls, 1);
  assert.equal(submitCalls, 0);

  // The capture was never durable, so a fresh worker cannot replay it. Once
  // storage is healthy, that fresh owner must recollect before submitting.
  harness.setStorageSetFailure(false);
  const retried = await harness.restart().run(input);
  assert.equal(retried.success, true);
  assert.equal(retried.terminalState, 'COMPLETE');
  assert.equal(collectCalls, 2);
  assert.equal(submitCalls, 1);
  assert.equal(harness.failBodies.length, 0);
});

test('routes runId-only worker compatibility through the source owner', async () => {
  const ownerCalls = [];
  let lifecycleCalls = 0;
  const runOwnedOrderCollection = vm.runInNewContext(
    `(${extractFunction(workerSource, 'runOwnedOrderCollection')})`,
    {
      orderCollectionSourceOwner: {
        run: async (input) => {
          ownerCalls.push(input);
          return { success: true };
        },
      },
      orderCollectionLifecycle: {
        run: async () => {
          lifecycleCalls += 1;
          return { success: false };
        },
      },
      KidItemOrderCollectionLifecycle: {
        createIdentity() {
          return { mallKey: 'unexpected', date: 'unexpected' };
        },
      },
    },
  );
  const message = {
    action: 'collectKakaoOrders',
    environmentId: 'office',
    runId: ATTEMPT_ID,
    date: '1999-01-01',
  };
  const collect = async () => ({ success: true });

  await assert.doesNotReject(async () => {
    const result = await runOwnedOrderCollection(message, 'kakao', collect);
    assert.equal(result.success, true);
  });
  assert.equal(ownerCalls.length, 1);
  assert.equal(ownerCalls[0].environmentId, 'office');
  assert.equal(ownerCalls[0].message, message);
  assert.equal(ownerCalls[0].mallKey, 'kakao');
  assert.equal(ownerCalls[0].collect, collect);
  assert.equal(lifecycleCalls, 0);
});

test('does not inject a page dispatch date into a nullable legacy plan', async () => {
  const ownerCalls = [];
  let providerPlan;
  const runOwnedOrderCollection = vm.runInNewContext(
    `(${extractFunction(workerSource, 'runOwnedOrderCollection')})`,
    {
      orderCollectionSourceOwner: {
        run: async (input) => {
          ownerCalls.push(input);
          return input.collect({}, {
            mallKey: 'onch',
            collectionDate: null,
            legacy: true,
          });
        },
      },
    },
  );
  const message = {
    action: 'collectOnchannelOrders',
    environmentId: 'office',
    attemptId: ATTEMPT_ID,
    serverOwned: true,
    date: '2026-09-10',
  };
  const collect = async (_collection, plan) => {
    providerPlan = plan;
    return { success: true, orders: [] };
  };

  await runOwnedOrderCollection(message, 'onch', collect);

  assert.equal(ownerCalls.length, 1);
  assert.equal(providerPlan.collectionDate, null);
});

test('rejects a nested or malformed control before provider I/O', async () => {
  const harness = createHarness({
    initialControl: { attemptId: ATTEMPT_ID, attempt: control() },
    collectResult: { success: true },
  });
  let providerCalls = 0;
  const result = await harness.owner.run({
    environmentId: 'office',
    message: { action: 'collectKakaoOrders', attemptId: ATTEMPT_ID },
    mallKey: 'kakao',
    collect: async () => {
      providerCalls += 1;
      return harness.collectResult;
    },
  });

  assert.equal(providerCalls, 0);
  assert.equal(harness.lifecycleCalls.length, 0);
  assert.equal(result.errorCode, 'SOURCE_OWNER_UNAVAILABLE');
  assert.equal(harness.requests.length, 3);
});

test('reconciles a lost failure ACK with the exact bounded body', async () => {
  const harness = createHarness({
    collectResult: {
      success: false,
      errorCode: 'provider_contract_changed',
      error: '카카오 주문 응답 형식이 바뀌었습니다.',
    },
    failMode: 'lost-ack',
  });
  const result = await harness.owner.run({
    environmentId: 'local',
    message: { action: 'collectKakaoOrders', attemptId: ATTEMPT_ID },
    mallKey: 'kakao',
    collect: async () => harness.collectResult,
  });

  assert.equal(result.success, false);
  assert.equal(result.terminalState, 'FAILED');
  assert.equal(result.errorCode, 'provider_contract_changed');
  assert.equal(harness.cancelCount(), 1);
  assert.equal(harness.failBodies.length, 3);
  assert.deepEqual(harness.failBodies[0], harness.failBodies[1]);
  assert.deepEqual(harness.failBodies[1], harness.failBodies[2]);
});

test('leaves the owner running when a failure ACK cannot be reconciled', async () => {
  const harness = createHarness({
    collectResult: { success: false, error: 'provider unavailable' },
    failMode: 'unavailable',
  });
  const result = await harness.owner.run({
    environmentId: 'local',
    message: { action: 'collectKakaoOrders', attemptId: ATTEMPT_ID },
    mallKey: 'kakao',
    collect: async () => harness.collectResult,
  });

  assert.equal(result.success, false);
  assert.equal(result.terminalState, 'RUNNING');
  assert.equal(result.errorCode, 'SOURCE_OWNER_UNAVAILABLE');
  assert.equal(harness.cancelCount(), 0);
  assert.equal(harness.current().state, 'RUNNING');
  assert.equal(harness.failBodies.length, 3);
});
