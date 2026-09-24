import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const attemptId = '11111111-1111-4111-8111-111111111111';
const attemptToken = '22222222-2222-4222-8222-222222222222';
const restartAttemptId = '99999999-9999-4999-8999-999999999999';
const restartAttemptToken = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const sourcePath = '/api/sellpia-product-sales/attempts';
const ownerSource = readFileSync(
  new URL('../kiditem-os/background/orders/sellpia-product-profitability-source-owner.js', import.meta.url),
  'utf8',
);
const wireSource = readFileSync(
  new URL('../kiditem-os/background/sourcing/source-attempt-wire.js', import.meta.url),
  'utf8',
);
const sessionSource = readFileSync(
  new URL('../kiditem-os/background/collection-session.js', import.meta.url),
  'utf8',
);

const plan = {
  from: '2025-08-02',
  to: '2026-09-06',
  coveredMonths: ['2025-08', '2025-09', '2026-09'],
};

const payload = {
  range: plan,
  parserVersion: 'sellpia-profitability-v2',
  provenance: {
    source: 'sellpia_stat_prd_profit',
    costBasis: 'ORDER_TIME_SUPPLY_COST',
    vatIncluded: true,
  },
  products: [],
};

function control(state = 'RUNNING', patch = {}) {
  return {
    attemptId,
    attemptToken,
    state,
    expiresAt: '2099-01-01T00:00:00.000Z',
    capturedAt: '2026-09-07T00:00:00.000Z',
    generation: state === 'COMPLETE' ? '8' : null,
    errorCode: null,
    errorMessage: null,
    plan,
    ...patch,
  };
}

function summary(state = 'RUNNING', patch = {}) {
  const value = control(state, patch);
  delete value.attemptToken;
  return value;
}

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 400,
    status,
    async json() {
      return structuredClone(body);
    },
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((settle) => { resolve = settle; });
  return { promise, resolve };
}

function createFixture({
  collected = { success: true, payload },
  loseCompletionAck = false,
  failTerminalStatusRead = false,
  failProgressUpdate = false,
  failControlReadAfterCapture = false,
  controlReadResponse = null,
  statusResponses = new Map(),
  collectUntilStopped = false,
  holdFailure = false,
  parkBeforeCompletion = false,
  holdCompletion = null,
  unresolvedCompletion = false,
  lostCompletion = false,
  failReadsAfterCompletion = 0,
} = {}) {
  const context = vm.createContext({
    Date,
    Map,
    TextDecoder,
    TextEncoder,
    URL,
    setTimeout,
    clearTimeout,
    structuredClone,
  });
  vm.runInContext(wireSource, context);
  vm.runInContext(sessionSource, context);
  vm.runInContext(ownerSource, context);

  const storage = {};
  const calls = [];
  const bodies = [];
  const removedTabs = [];
  let collectionContext = null;
  let controlReads = 0;
  const chrome = {
    storage: {
      local: {
        get: async (key) => ({ [key]: structuredClone(storage[key]) }),
        set: async (values) => Object.assign(storage, structuredClone(values)),
      },
    },
    tabs: {
      query: async () => [],
      remove: async (tabId) => { removedTabs.push(tabId); },
    },
  };
  const sessions = context.KidItemCollectionSession.create({
    chrome,
    storageKey: 'sessions',
    webUrlPatterns: [],
  });
  const ownerWrites = [];
  const collectStarted = deferred();
  const failureRelease = deferred();
  const completionParked = deferred();
  const completionRelease = deferred();
  const completionHeld = deferred();
  const completionHoldRelease = deferred();
  const sessionApi = sessions;
  if (failProgressUpdate) {
    sessionApi.progress = async () => {
      throw new Error('collection progress unavailable');
    };
  }
  if (parkBeforeCompletion) {
    // The owner reports progress immediately before it submits completion.
    const reportProgress = sessions.progress;
    sessionApi.progress = async (...args) => {
      completionParked.resolve();
      await completionRelease.promise;
      return reportProgress(...args);
    };
  }
  const attempts = new Map([
    [attemptId, control()],
    [restartAttemptId, control('RUNNING', { attemptId: restartAttemptId, attemptToken: restartAttemptToken })],
  ]);
  let completeCalls = 0;
  let readsAfterCompletion = 0;

  const owner = context.KidItemSellpiaProductProfitabilitySourceOwner.create({
    chrome,
    sessions: sessionApi,
    request: async (environmentId, path, init = {}) => {
      calls.push({ environmentId, path, method: init.method || 'GET', headers: init.headers, body: init.body });
      const method = init.method || 'GET';
      const id = decodeURIComponent(path.slice(`${sourcePath}/`.length).split('/')[0]);
      const current = attempts.get(id);
      if (method === 'GET' && completeCalls > 0 && readsAfterCompletion < failReadsAfterCompletion) {
        readsAfterCompletion += 1;
        throw new Error('owner read temporarily unavailable');
      }
      if (method === 'GET' && path.endsWith('/status')) {
        const statusResponse = statusResponses.get(id);
        if (statusResponse) return statusResponse();
        if (failTerminalStatusRead && current.state !== 'RUNNING') {
          throw new Error('terminal status read lost');
        }
        return response(summary(current.state, current));
      }
      if (method === 'GET') {
        controlReads += 1;
        if (failControlReadAfterCapture && controlReads > 1) {
          throw new Error('control read lost after capture');
        }
        if (controlReadResponse) return controlReadResponse();
        return response(current);
      }
      const route = path === `${sourcePath}/${id}` ? 'complete' : path.split('/').at(-1);
      ownerWrites.push({ attemptId: id, route, afterEnd: current.state !== 'RUNNING' });
      if (route === 'complete') {
        completeCalls += 1;
        bodies.push(JSON.parse(init.body));
        if (holdCompletion && completeCalls === 1) {
          completionHeld.resolve();
          await completionHoldRelease.promise;
          if (holdCompletion === 'unavailable') {
            return response({ message: 'owner completion is unavailable' }, 503);
          }
        }
        if (unresolvedCompletion && id === attemptId) throw new Error('completion transport failed');
        attempts.set(id, control('COMPLETE', {
          attemptId: id,
          attemptToken: current.attemptToken,
          generation: '8',
        }));
        if (loseCompletionAck && completeCalls === 1) throw new Error('completion reply lost');
        if (lostCompletion && id === attemptId) throw new Error('completion reply lost');
        return response(attempts.get(id));
      }
      if (route === 'fail') {
        const failure = JSON.parse(init.body);
        if (holdFailure) await failureRelease.promise;
        attempts.set(id, control('FAILED', {
          attemptId: id,
          attemptToken: current.attemptToken,
          errorCode: failure.errorCode,
          errorMessage: failure.errorMessage,
        }));
        return response(attempts.get(id));
      }
      return response({ message: 'unexpected owner route' }, 404);
    },
    collect: async (collection) => {
      collectionContext = collection;
      if (collectUntilStopped && collection.attemptId === attemptId) {
        // Like the Sellpia collector after a stop closes its tab: it sees the fence and returns.
        collectStarted.resolve();
        while (await collection.isActive()) {
          await new Promise((resolve) => setTimeout(resolve, 1));
        }
        return { success: false, errorCode: 'sellpia_network_failed', error: 'Sellpia tab was closed.' };
      }
      return collected;
    },
  });

  return {
    owner,
    sessions: sessionApi,
    calls,
    bodies,
    removedTabs,
    ownerWrites,
    attempt: (id) => attempts.get(id),
    collectStarted: collectStarted.promise,
    releaseFailure: failureRelease.resolve,
    completionParked: completionParked.promise,
    releaseCompletion: completionRelease.resolve,
    completionHeld: completionHeld.promise,
    releaseHeldCompletion: completionHoldRelease.resolve,
    // cancelOrdersCollectionSession fences the local session, then cancels through the owner.
    operatorStop: async (target) => {
      await sessionApi.requestCancellation(target.attemptId, target.environmentId);
      return owner.cancel(target);
    },
    get collectionContext() { return collectionContext; },
    get controlReads() { return controlReads; },
    get completeCalls() { return completeCalls; },
  };
}

test('requires only the server-issued attempt ID', () => {
  const context = vm.createContext({});
  vm.runInContext(ownerSource, context);
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.KidItemSellpiaProductProfitabilitySourceOwner.parseAction({
      action: 'collectSellpiaProductProfit',
      attemptId,
    }))),
    { attemptId },
  );
  assert.throws(
    () => context.KidItemSellpiaProductProfitabilitySourceOwner.parseAction({
      action: 'collectSellpiaProductProfit',
      attemptId,
      from: plan.from,
    }),
    /Invalid Sellpia profitability source request/,
  );
});

test('recovers from a stale same-environment profitability session whose status is 404', async () => {
  const staleAttemptId = '33333333-3333-4333-8333-333333333333';
  const fixture = createFixture({
    statusResponses: new Map([
      [staleAttemptId, () => response({ message: 'attempt not found' }, 404)],
    ]),
  });
  await fixture.sessions.start({
    environmentId: 'local',
    attemptId: staleAttemptId,
    producer: 'orders.sellpia_product_profitability',
  });
  await fixture.sessions.attachTab(staleAttemptId, {
    tabId: 77,
    windowId: 9,
  });

  const result = await fixture.owner.run({ environmentId: 'local', attemptId });

  assert.equal(result.success, true);
  assert.equal(fixture.completeCalls, 1);
  assert.deepEqual(fixture.removedTabs, [77]);
  assert.equal(await fixture.sessions.get(staleAttemptId), null);
});

for (const scenario of [
  {
    name: 'authentication failure',
    status: 401,
    response: () => response({ message: 'login required' }, 401),
    error: /login required/,
  },
  {
    name: 'server failure',
    status: 503,
    response: () => response({ message: 'upstream unavailable' }, 503),
    error: /upstream unavailable/,
  },
  {
    name: 'network failure',
    status: undefined,
    response: () => { throw new Error('network unavailable'); },
    error: /network unavailable/,
  },
]) {
  test(`preserves a prior ${scenario.name} instead of treating it as stale`, async () => {
    const staleAttemptId = '44444444-4444-4444-8444-444444444444';
    const fixture = createFixture({
      statusResponses: new Map([[staleAttemptId, scenario.response]]),
    });
    await fixture.sessions.start({
      environmentId: 'local',
      attemptId: staleAttemptId,
      producer: 'orders.sellpia_product_profitability',
    });

    const result = await fixture.owner.run({ environmentId: 'local', attemptId });

    assert.equal(result.success, false);
    assert.equal(result.attemptId, attemptId);
    assert.equal(result.terminalState, 'RUNNING');
    assert.equal(result.continuationRequired, false);
    assert.equal(result.errorCode, 'SOURCE_OWNER_UNAVAILABLE');
    assert.match(result.error, scenario.error);
    assert.equal(fixture.collectionContext, null);
    assert.ok(await fixture.sessions.get(staleAttemptId));
  });
}

test('keeps the running-session fence for a prior same-environment attempt', async () => {
  const runningAttemptId = '55555555-5555-4555-8555-555555555555';
  const fixture = createFixture({
    statusResponses: new Map([
      [runningAttemptId, () => response(summary('RUNNING', { attemptId: runningAttemptId }))],
    ]),
  });
  await fixture.sessions.start({
    environmentId: 'local',
    attemptId: runningAttemptId,
    producer: 'orders.sellpia_product_profitability',
  });

  await assert.rejects(
    fixture.owner.run({ environmentId: 'local', attemptId }),
    /이전 셀피아 상품 손익 수집이 아직 진행 중입니다/,
  );
  assert.equal(fixture.collectionContext, null);
  assert.ok(await fixture.sessions.get(runningAttemptId));
});

test('does not inspect or cancel sessions from another environment or producer', async () => {
  const officeAttemptId = '66666666-6666-4666-8666-666666666666';
  const otherProducerAttemptId = '77777777-7777-4777-8777-777777777777';
  const fixture = createFixture({
    statusResponses: new Map([
      [officeAttemptId, () => response({ message: 'office attempt not found' }, 404)],
      [otherProducerAttemptId, () => response({ message: 'other producer not found' }, 404)],
    ]),
  });
  await fixture.sessions.start({
    environmentId: 'office',
    attemptId: officeAttemptId,
    producer: 'orders.sellpia_product_profitability',
  });
  await fixture.sessions.start({
    environmentId: 'local',
    attemptId: otherProducerAttemptId,
    producer: 'orders.sellpia_inventory',
  });

  const result = await fixture.owner.run({ environmentId: 'local', attemptId });

  assert.equal(result.success, true);
  assert.ok(await fixture.sessions.get(officeAttemptId));
  assert.ok(await fixture.sessions.get(otherProducerAttemptId));
  assert.equal(
    fixture.calls.some((call) => call.path.includes(officeAttemptId)),
    false,
  );
  assert.equal(
    fixture.calls.some((call) => call.path.includes(otherProducerAttemptId)),
    false,
  );
});

test('reload recovery removes a same-environment stale session after a 404', async () => {
  const staleAttemptId = '88888888-8888-4888-8888-888888888888';
  const fixture = createFixture({
    statusResponses: new Map([
      [staleAttemptId, () => response({ message: 'attempt not found' }, 404)],
    ]),
  });
  await fixture.sessions.start({
    environmentId: 'office',
    attemptId: staleAttemptId,
    producer: 'orders.sellpia_product_profitability',
  });
  await fixture.sessions.attachTab(staleAttemptId, {
    tabId: 88,
    windowId: 10,
  });

  await fixture.owner.recover('office');

  assert.deepEqual(fixture.removedTabs, [88]);
  assert.equal(await fixture.sessions.get(staleAttemptId), null);
});

test('does not suppress a 404 for the current attempt control', async () => {
  const fixture = createFixture({
    controlReadResponse: () => response({ message: 'current attempt not found' }, 404),
  });

  await assert.rejects(
    fixture.owner.run({ environmentId: 'local', attemptId }),
    (error) => {
      assert.equal(error.status, 404);
      return true;
    },
  );
  assert.equal(fixture.collectionContext, null);
});

test('uploads the frozen 401-day plan with the server attempt token', async () => {
  const fixture = createFixture();
  const result = await fixture.owner.run({ environmentId: 'office', attemptId });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    success: true,
    attemptId,
    terminalState: 'COMPLETE',
    continuationRequired: false,
  });
  const complete = fixture.calls.find(
    (call) => call.method === 'POST' && call.path === `${sourcePath}/${attemptId}`,
  );
  assert.ok(complete, JSON.stringify(fixture.calls));
  assert.equal(complete.headers['x-source-attempt-token'], attemptToken);
  assert.deepEqual(fixture.bodies[0], {
    attemptToken,
    parserVersion: 'sellpia-profitability-v2',
    providerBackedEmptyProof: true,
    coveredMonths: plan.coveredMonths,
    provenance: payload.provenance,
    products: [],
  });
  assert.equal(typeof fixture.collectionContext.attachTab, 'function');
  assert.equal(typeof fixture.collectionContext.detachTab, 'function');
  assert.equal(fixture.completeCalls, 1);
  assert.equal((await fixture.sessions.list()).length, 0);
});

test('reconciles a lost terminal response through exact status', async () => {
  const fixture = createFixture({ loseCompletionAck: true });
  const result = await fixture.owner.run({ environmentId: 'local', attemptId });

  assert.equal(result.success, true);
  assert.equal(result.terminalState, 'COMPLETE');
  assert.equal(fixture.completeCalls, 2);
  assert.equal((await fixture.sessions.list()).length, 0);
});

test('publishes captured payload when the progress update fails', async () => {
  const fixture = createFixture({ failProgressUpdate: true });
  const result = await fixture.owner.run({ environmentId: 'office', attemptId });

  assert.equal(result.success, true);
  assert.equal(result.terminalState, 'COMPLETE');
  assert.equal(fixture.completeCalls, 1);
  assert.deepEqual(fixture.bodies[0].products, []);
});

test('publishes with the existing control when a post-capture control read is unavailable', async () => {
  const fixture = createFixture({ failControlReadAfterCapture: true });
  const result = await fixture.owner.run({ environmentId: 'office', attemptId });

  assert.equal(result.success, true);
  assert.equal(result.terminalState, 'COMPLETE');
  assert.equal(fixture.controlReads, 1);
  assert.equal(fixture.completeCalls, 1);
});

test('keeps a successful terminal response when the follow-up status read is lost', async () => {
  const fixture = createFixture({ failTerminalStatusRead: true });
  const result = await fixture.owner.run({ environmentId: 'office', attemptId });

  assert.equal(result.success, true);
  assert.equal(result.terminalState, 'COMPLETE');
  assert.equal(fixture.completeCalls, 1);
});

test('records provider login failure as FAILED and retains attention', async () => {
  const fixture = createFixture({
    collected: {
      success: false,
      pendingLogin: true,
      errorCode: 'sellpia_login_required',
      error: 'Sellpia login is required.',
    },
  });
  const result = await fixture.owner.run({ environmentId: 'office', attemptId });

  assert.equal(result.success, false);
  assert.equal(result.terminalState, 'FAILED');
  assert.equal(result.errorCode, 'sellpia_login_required');
  assert.deepEqual(JSON.parse(JSON.stringify((await fixture.sessions.get(attemptId))?.attention)), {
    reason: 'marketplace_login',
    message: 'Sellpia login is required.',
    canOpenTab: false,
  });
});

test('fails instead of publishing a payload outside the frozen plan', async () => {
  const fixture = createFixture({
    collected: {
      success: true,
      payload: { ...payload, range: { from: '2025-08-01', to: plan.to } },
    },
  });
  const result = await fixture.owner.run({ environmentId: 'office', attemptId });

  assert.equal(result.success, false);
  assert.equal(result.terminalState, 'FAILED');
  assert.equal(result.errorCode, 'SELLPIA_PROFITABILITY_PAYLOAD_INVALID');
  assert.equal(fixture.completeCalls, 0);
  assert.equal(fixture.calls.filter((call) => call.path.endsWith('/fail')).length, 1);
});

function assertStoppedThenRestarted(fixture, restart) {
  const stopped = fixture.attempt(attemptId);
  assert.equal(stopped.state, 'FAILED');
  assert.equal(stopped.errorCode, 'COLLECTION_CANCELLED');
  assert.equal(restart.attemptId, restartAttemptId);
  assert.equal(restart.terminalState, 'COMPLETE');
  const stoppedWrites = fixture.ownerWrites.filter((write) => write.attemptId === attemptId);
  assert.deepEqual(stoppedWrites.map((write) => write.route), ['fail']);
  assert.deepEqual(stoppedWrites.filter((write) => write.afterEnd), []);
}

test('an operator stop during collection releases the environment for the next attempt', async () => {
  const fixture = createFixture({ collectUntilStopped: true, holdFailure: true });
  const running = fixture.owner.run({ environmentId: 'office', attemptId });
  await fixture.collectStarted;

  const stopping = fixture.operatorStop({ environmentId: 'office', attemptId });
  // The collector sees the stop, so the run returns before the owner acknowledges it.
  await running;
  fixture.releaseFailure();
  await stopping;

  const restart = await fixture.owner.run({ environmentId: 'office', attemptId: restartAttemptId });
  assertStoppedThenRestarted(fixture, restart);
});

test('an operator stop with no run in this worker releases the environment for the next attempt', async () => {
  const fixture = createFixture();
  await fixture.sessions.start({
    environmentId: 'office',
    attemptId,
    producer: 'orders.sellpia_product_profitability',
  });

  await fixture.operatorStop({ environmentId: 'office', attemptId });

  const restart = await fixture.owner.run({ environmentId: 'office', attemptId: restartAttemptId });
  assertStoppedThenRestarted(fixture, restart);
});

test('an operator stop after the post-collect check releases the environment without completing the stopped attempt', async () => {
  const fixture = createFixture({ parkBeforeCompletion: true });
  const running = fixture.owner.run({ environmentId: 'office', attemptId });
  await fixture.completionParked;

  await fixture.operatorStop({ environmentId: 'office', attemptId });
  fixture.releaseCompletion();
  await running;

  const restart = await fixture.owner.run({ environmentId: 'office', attemptId: restartAttemptId });
  assertStoppedThenRestarted(fixture, restart);
});

// A stop must leave exactly one owner /fail on the stopped attempt and release
// the environment, even when it overlaps a terminal request already in flight.
function assertOneCancelThenRestarted(fixture, restart) {
  const stopped = fixture.attempt(attemptId);
  assert.equal(stopped.state, 'FAILED');
  assert.equal(stopped.errorCode, 'COLLECTION_CANCELLED');
  assert.equal(restart.attemptId, restartAttemptId);
  assert.equal(restart.terminalState, 'COMPLETE');
  const stoppedWrites = fixture.ownerWrites.filter((write) => write.attemptId === attemptId);
  assert.equal(stoppedWrites.filter((write) => write.route === 'fail').length, 1);
  assert.deepEqual(stoppedWrites.filter((write) => write.afterEnd), []);
}

test('an operator stop during the completion retry loop still ends the attempt with one /fail', async () => {
  const fixture = createFixture({ holdCompletion: 'unavailable' });
  const running = fixture.owner.run({ environmentId: 'office', attemptId });
  await fixture.completionHeld;

  // Fence first, exactly as the web stop does, then join the in-flight completion.
  await fixture.sessions.requestCancellation(attemptId, 'office');
  const stopping = fixture.owner.cancel({ environmentId: 'office', attemptId });
  fixture.releaseHeldCompletion();
  await running;
  await stopping;

  const restart = await fixture.owner.run({ environmentId: 'office', attemptId: restartAttemptId });
  assertOneCancelThenRestarted(fixture, restart);
});

test('an operator stop that joins a completion the owner accepts leaves the attempt COMPLETE and releases the environment', async () => {
  const fixture = createFixture({ holdCompletion: 'accept' });
  const running = fixture.owner.run({ environmentId: 'office', attemptId });
  await fixture.completionHeld;

  await fixture.sessions.requestCancellation(attemptId, 'office');
  const stopping = fixture.owner.cancel({ environmentId: 'office', attemptId });
  fixture.releaseHeldCompletion();
  await running;
  const stopped = await stopping;

  assert.equal(stopped.terminalState, 'COMPLETE');
  assert.equal(fixture.attempt(attemptId).state, 'COMPLETE');
  const restart = await fixture.owner.run({ environmentId: 'office', attemptId: restartAttemptId });
  assert.equal(restart.attemptId, restartAttemptId);
  assert.equal(restart.terminalState, 'COMPLETE');
  // The completion won the race, so the stop sends no /fail.
  assert.deepEqual(
    fixture.ownerWrites.filter((write) => write.attemptId === attemptId && write.route === 'fail'),
    [],
  );
});

test('an operator stop after an unresolved completion ends the still-RUNNING attempt', async () => {
  const fixture = createFixture({ unresolvedCompletion: true });
  const unresolved = await fixture.owner.run({ environmentId: 'office', attemptId });
  assert.equal(unresolved.errorCode, 'SOURCE_OWNER_UNAVAILABLE');
  assert.equal(fixture.attempt(attemptId).state, 'RUNNING');

  await fixture.operatorStop({ environmentId: 'office', attemptId });

  const restart = await fixture.owner.run({ environmentId: 'office', attemptId: restartAttemptId });
  assertOneCancelThenRestarted(fixture, restart);
});

test('an operator stop after an unresolved completion releases a COMPLETE attempt for the next collection', async () => {
  const fixture = createFixture({ lostCompletion: true, failReadsAfterCompletion: 3 });
  const unresolved = await fixture.owner.run({ environmentId: 'office', attemptId });
  assert.equal(unresolved.errorCode, 'SOURCE_OWNER_UNAVAILABLE');
  assert.equal(fixture.attempt(attemptId).state, 'COMPLETE');

  const stopped = await fixture.operatorStop({ environmentId: 'office', attemptId });
  assert.equal(stopped.terminalState, 'COMPLETE');

  const restart = await fixture.owner.run({ environmentId: 'office', attemptId: restartAttemptId });
  assert.equal(restart.attemptId, restartAttemptId);
  assert.equal(restart.terminalState, 'COMPLETE');
  // The stop must not turn an owner completion into a failure.
  assert.deepEqual(
    fixture.ownerWrites.filter((write) => write.attemptId === attemptId && write.route === 'fail'),
    [],
  );
});
