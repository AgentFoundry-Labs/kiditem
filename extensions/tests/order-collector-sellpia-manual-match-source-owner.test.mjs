import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const attemptId = '11111111-1111-4111-8111-111111111111';
const attemptToken = '22222222-2222-4222-8222-222222222222';
const restartAttemptId = '44444444-4444-4444-8444-444444444444';
const restartAttemptToken = '55555555-5555-4555-8555-555555555555';
const sourcePath = '/api/channels/product-mappings/sellpia-manual-match/attempts';
const ownerSource = readFileSync(
  new URL('../kiditem-os/background/orders/sellpia-manual-match-source-owner.js', import.meta.url),
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
  sourceType: 'sellpia_product_manual_match',
  parserVersion: 'sellpia-manual-match-v1',
  sourceOrigin: 'https://kiditem.sellpia.com',
  sourcePath: '/product_manual_match.html',
  targetCodes: ['634-1'],
  targetCount: 1,
};

const snapshot = {
  source: 'sellpia_product_manual_match',
  version: 1,
  targetCount: 1,
  targetCodes: ['634-1'],
  rowCount: 1,
  rows: [{
    productCode: '634-1',
    aliasTitle: '샤이니무지개칼라링(12개입)',
    itemCount: 12,
    matchedType: 'M',
    evidenceCount: 1,
  }],
};

function control(state = 'RUNNING', patch = {}) {
  return {
    attemptId,
    attemptToken,
    state,
    expiresAt: '2099-01-01T00:00:00.000Z',
    plan,
    errorCode: null,
    errorMessage: null,
    ...patch,
  };
}

function terminalControl(state, patch = {}) {
  return control(state, patch);
}

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 400,
    status,
    async json() { return structuredClone(body); },
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((settle) => { resolve = settle; });
  return { promise, resolve };
}

function createFixture({
  collected = { success: true, snapshot },
  loseCompletionAck = false,
  failFirstPostCollectionRead = false,
  collectUntilStopped = false,
  holdFailure = false,
  parkBeforeCompletion = false,
  holdCompletion = false,
  unresolvedCompletion = false,
  failReadsAfterCompletion = 0,
} = {}) {
  const context = vm.createContext({
    Date,
    Map,
    Set,
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
  const chrome = {
    storage: {
      local: {
        get: async (key) => ({ [key]: structuredClone(storage[key]) }),
        set: async (values) => Object.assign(storage, structuredClone(values)),
      },
    },
    tabs: { query: async () => [], remove: async () => undefined },
  };
  const sessions = context.KidItemCollectionSession.create({
    chrome,
    storageKey: 'sessions',
    webUrlPatterns: [],
  });
  const collectStarted = deferred();
  const failureRelease = deferred();
  const completionParked = deferred();
  const completionRelease = deferred();
  const completionHeld = deferred();
  const completionHoldRelease = deferred();
  // The owner reports progress immediately before it submits completion.
  const sessionApi = parkBeforeCompletion
    ? {
        ...sessions,
        progress: async (...args) => {
          completionParked.resolve();
          await completionRelease.promise;
          return sessions.progress(...args);
        },
      }
    : sessions;
  const attempts = new Map([
    [attemptId, control()],
    [restartAttemptId, control('RUNNING', { attemptId: restartAttemptId, attemptToken: restartAttemptToken })],
  ]);
  const ownerWrites = [];
  let completeCalls = 0;
  let collectCalls = 0;
  let collectionDone = false;
  let postCollectionReadFailures = 0;
  let readsAfterCompletion = 0;

  const owner = context.KidItemSellpiaManualMatchSourceOwner.create({
    chrome,
    sessions: sessionApi,
    request: async (environmentId, path, init = {}) => {
      calls.push({ environmentId, path, method: init.method || 'GET', headers: init.headers, body: init.body });
      const method = init.method || 'GET';
      const id = decodeURIComponent(path.slice(`${sourcePath}/`.length).split('/')[0]);
      const current = attempts.get(id);
      if (
        method === 'GET'
        && failFirstPostCollectionRead
        && collectionDone
        && postCollectionReadFailures < 6
      ) {
        postCollectionReadFailures += 1;
        throw new Error('owner read temporarily unavailable');
      }
      if (method === 'GET') {
        if (completeCalls > 0 && readsAfterCompletion < failReadsAfterCompletion) {
          readsAfterCompletion += 1;
          throw new Error('owner read temporarily unavailable');
        }
        return response(current);
      }
      ownerWrites.push({ attemptId: id, route: path.split('/').at(-1), afterEnd: current.state !== 'RUNNING' });
      if (path.endsWith('/complete')) {
        completeCalls += 1;
        bodies.push(JSON.parse(init.body));
        if (holdCompletion && completeCalls === 1) {
          completionHeld.resolve();
          await completionHoldRelease.promise;
          return response({ message: 'owner completion is unavailable' }, 503);
        }
        if (unresolvedCompletion && id === attemptId) throw new Error('completion transport failed');
        attempts.set(id, terminalControl('COMPLETE', { attemptId: id, attemptToken: current.attemptToken }));
        if (loseCompletionAck && completeCalls === 1) throw new Error('completion reply lost');
        return response(attempts.get(id));
      }
      if (path.endsWith('/fail')) {
        const failure = JSON.parse(init.body);
        if (holdFailure) await failureRelease.promise;
        attempts.set(id, terminalControl('FAILED', {
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
      collectCalls += 1;
      assert.deepEqual(JSON.parse(JSON.stringify(collection.plan)), plan);
      collectionDone = true;
      if (!collectUntilStopped || collection.attemptId !== attemptId) return collected;
      // Like the Sellpia collector after a stop closes its tab: it sees the fence and returns.
      collectStarted.resolve();
      while (await collection.isActive()) {
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
      return { success: false, errorCode: 'sellpia_manual_match_tab_closed', error: 'Sellpia tab was closed.' };
    },
  });

  return {
    owner,
    sessions: sessionApi,
    calls,
    bodies,
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
    get completeCalls() { return completeCalls; },
    get collectCalls() { return collectCalls; },
  };
}

// An operator stop must leave exactly one owner /fail on the stopped attempt and
// must release the environment so the next collection is admitted.
function assertStoppedThenRestarted(fixture, restart) {
  const stopped = fixture.attempt(attemptId);
  assert.equal(stopped.state, 'FAILED');
  assert.equal(stopped.errorCode, 'COLLECTION_CANCELLED');
  assert.equal(restart.attemptId, restartAttemptId);
  assert.equal(restart.terminalState, 'COMPLETE');
  const stoppedWrites = fixture.ownerWrites.filter((write) => write.attemptId === attemptId);
  assert.equal(stoppedWrites.filter((write) => write.route === 'fail').length, 1);
  assert.deepEqual(stoppedWrites.filter((write) => write.afterEnd), []);
}

test('requires only the server-issued attempt ID and rejects caller-owned targets', () => {
  const context = vm.createContext({});
  vm.runInContext(ownerSource, context);
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.KidItemSellpiaManualMatchSourceOwner.parseAction({
      action: 'collectSellpiaManualMatch',
      attemptId,
    }))),
    { attemptId },
  );
  assert.throws(
    () => context.KidItemSellpiaManualMatchSourceOwner.parseAction({
      action: 'collectSellpiaManualMatch',
      attemptId,
      targetCodes: plan.targetCodes,
    }),
    /Invalid Sellpia manual-match source request/,
  );
});

test('uploads the unchanged frozen-plan snapshot and clears local progress after COMPLETE', async () => {
  const fixture = createFixture();
  const result = await fixture.owner.run({ environmentId: 'office', attemptId });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    success: true,
    attemptId,
    terminalState: 'COMPLETE',
    continuationRequired: false,
  });
  const complete = fixture.calls.find((call) => call.path.endsWith('/complete'));
  assert.equal(complete.headers['x-source-attempt-token'], attemptToken);
  assert.deepEqual(fixture.bodies, [snapshot]);
  assert.equal(fixture.collectCalls, 1);
  assert.equal(fixture.completeCalls, 1);
  assert.equal((await fixture.sessions.list()).length, 0);
});

test('reconciles a lost terminal response without collecting Sellpia again', async () => {
  const fixture = createFixture({ loseCompletionAck: true });
  const result = await fixture.owner.run({ environmentId: 'local', attemptId });

  assert.equal(result.success, true);
  assert.equal(result.terminalState, 'COMPLETE');
  assert.equal(fixture.collectCalls, 1);
  assert.equal(fixture.completeCalls, 2);
  assert.deepEqual(fixture.bodies, [snapshot, snapshot]);
  assert.equal((await fixture.sessions.list()).length, 0);
});

test('reuses the collected body after a post-collection owner read outage', async () => {
  const fixture = createFixture({ failFirstPostCollectionRead: true });
  const first = await fixture.owner.run({ environmentId: 'office', attemptId });

  assert.equal(first.success, false);
  assert.equal(first.errorCode, 'SOURCE_OWNER_UNAVAILABLE');
  assert.equal(fixture.collectCalls, 1);

  const second = await fixture.owner.run({ environmentId: 'office', attemptId });
  assert.equal(second.success, true);
  assert.equal(second.terminalState, 'COMPLETE');
  assert.equal(fixture.collectCalls, 1);
  assert.equal(fixture.completeCalls, 1);
  assert.deepEqual(fixture.bodies, [snapshot]);
});

test('publishes FAILED when the collector cannot produce a plan-matching snapshot', async () => {
  const fixture = createFixture({
    collected: {
      success: true,
      snapshot: { ...snapshot, targetCodes: ['635-1'] },
    },
  });
  const result = await fixture.owner.run({ environmentId: 'office', attemptId });

  assert.equal(result.success, false);
  assert.equal(result.terminalState, 'FAILED');
  assert.equal(fixture.calls.filter((call) => call.path.endsWith('/fail')).length, 1);
  assert.equal(fixture.completeCalls, 0);
  assert.equal((await fixture.sessions.list()).length, 0);
});

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

test("an operator stop that overlaps the completion's first fence check releases the environment", async () => {
  const fixture = createFixture({ parkBeforeCompletion: true });
  const running = fixture.owner.run({ environmentId: 'office', attemptId });
  await fixture.completionParked;

  await fixture.operatorStop({ environmentId: 'office', attemptId });
  fixture.releaseCompletion();
  await running;

  const restart = await fixture.owner.run({ environmentId: 'office', attemptId: restartAttemptId });
  assertStoppedThenRestarted(fixture, restart);
  // The stop reached the owner before the parked completion resumed, so the
  // stopped attempt never received a completion body.
  assert.deepEqual(
    fixture.ownerWrites.filter((write) => write.attemptId === attemptId).map((write) => write.route),
    ['fail'],
  );
});

test('an operator stop during the completion retry loop still ends the attempt with one /fail', async () => {
  const fixture = createFixture({ holdCompletion: true });
  const running = fixture.owner.run({ environmentId: 'office', attemptId });
  await fixture.completionHeld;

  // Fence first, exactly as the web stop does, then join the in-flight completion.
  await fixture.sessions.requestCancellation(attemptId, 'office');
  const stopping = fixture.owner.cancel({ environmentId: 'office', attemptId });
  fixture.releaseHeldCompletion();
  await running;
  await stopping;

  const restart = await fixture.owner.run({ environmentId: 'office', attemptId: restartAttemptId });
  assertStoppedThenRestarted(fixture, restart);
});

test('an operator stop after an unresolved completion ends the still-RUNNING attempt', async () => {
  const fixture = createFixture({ unresolvedCompletion: true });
  const unresolved = await fixture.owner.run({ environmentId: 'office', attemptId });
  assert.equal(unresolved.errorCode, 'SOURCE_OWNER_UNAVAILABLE');
  assert.equal(fixture.attempt(attemptId).state, 'RUNNING');

  await fixture.operatorStop({ environmentId: 'office', attemptId });

  const restart = await fixture.owner.run({ environmentId: 'office', attemptId: restartAttemptId });
  assertStoppedThenRestarted(fixture, restart);
});

test('an operator stop after an unresolved completion releases a COMPLETE attempt for the next collection', async () => {
  const fixture = createFixture({ loseCompletionAck: true, failReadsAfterCompletion: 3 });
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
