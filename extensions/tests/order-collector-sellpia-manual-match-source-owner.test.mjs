import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const attemptId = '11111111-1111-4111-8111-111111111111';
const attemptToken = '22222222-2222-4222-8222-222222222222';
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

function createFixture({
  collected = { success: true, snapshot },
  loseCompletionAck = false,
  failFirstPostCollectionRead = false,
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
  const sessionApi = sessions;
  let current = control();
  let completeCalls = 0;
  let collectCalls = 0;
  let collectionDone = false;
  let postCollectionReadFailures = 0;

  const owner = context.KidItemSellpiaManualMatchSourceOwner.create({
    chrome,
    sessions: sessionApi,
    request: async (environmentId, path, init = {}) => {
      calls.push({ environmentId, path, method: init.method || 'GET', headers: init.headers, body: init.body });
      const method = init.method || 'GET';
      if (
        method === 'GET'
        && failFirstPostCollectionRead
        && collectionDone
        && postCollectionReadFailures < 6
      ) {
        postCollectionReadFailures += 1;
        throw new Error('owner read temporarily unavailable');
      }
      if (method === 'GET') return response(current);
      if (path.endsWith('/complete')) {
        completeCalls += 1;
        bodies.push(JSON.parse(init.body));
        current = terminalControl('COMPLETE');
        if (loseCompletionAck && completeCalls === 1) throw new Error('completion reply lost');
        return response(current);
      }
      if (path.endsWith('/fail')) {
        const failure = JSON.parse(init.body);
        current = terminalControl('FAILED', {
          errorCode: failure.errorCode,
          errorMessage: failure.errorMessage,
        });
        return response(current);
      }
      return response({ message: 'unexpected owner route' }, 404);
    },
    collect: async ({ plan: receivedPlan }) => {
      collectCalls += 1;
      assert.deepEqual(JSON.parse(JSON.stringify(receivedPlan)), plan);
      collectionDone = true;
      return collected;
    },
  });

  return {
    owner,
    sessions: sessionApi,
    calls,
    bodies,
    get completeCalls() { return completeCalls; },
    get collectCalls() { return collectCalls; },
  };
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
