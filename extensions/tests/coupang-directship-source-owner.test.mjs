import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const attemptId = '11111111-1111-4111-8111-111111111111';
const attemptToken = '22222222-2222-4222-8222-222222222222';
const sourceImportRunId = '33333333-3333-4333-8333-333333333333';
const channelAccountId = '44444444-4444-4444-8444-444444444444';

function makeControl(state = 'RUNNING') {
  return {
    attemptId,
    sourceImportRunId,
    attemptToken,
    state,
    plan: {
      sourceType: 'coupang_direct_order_capture',
      parserVersion: 'coupang-direct-order-v1',
      channelAccountId,
      captureMode: 'browser',
      transportScope: 'ALL',
    },
    expiresAt: '2099-01-01T00:00:00.000Z',
    artifactId: state === 'COMPLETE' ? '55555555-5555-4555-8555-555555555555' : null,
    contentChecksum: state === 'COMPLETE' ? 'checksum' : null,
    errorCode: null,
    errorMessage: null,
  };
}

function fixture() {
  const context = vm.createContext({
    Date,
    Promise,
    Map,
    setTimeout,
    clearTimeout,
    structuredClone,
  });
  for (const file of [
    '../shared/collection-session.js',
    '../kiditem-os/background/sourcing/source-attempt-wire.js',
    '../kiditem-os/background/orders/coupang-directship-source-owner.js',
  ]) {
    vm.runInContext(
      readFileSync(new URL(file, import.meta.url), 'utf8'),
      context,
    );
  }

  let current = makeControl();
  let captureCount = 0;
  const calls = [];
  const storage = {};
  const chrome = {
    storage: {
      local: {
        async get(key) { return { [key]: structuredClone(storage[key]) }; },
        async set(values) { Object.assign(storage, structuredClone(values)); },
      },
    },
    tabs: {
      async query() { return []; },
      async remove() {},
    },
  };
  const sessions = context.KidItemCollectionSession.create({
    chrome,
    storageKey: 'sessions',
    webUrlPatterns: [],
  });
  const owner = context.KidItemCoupangDirectshipSourceOwner.create({
    chrome,
    sessions,
    request: async (_environmentId, path, init = {}) => {
      calls.push({ path, init });
      if (path.endsWith('/fail')) {
        const body = JSON.parse(String(init.body));
        current = { ...current, state: 'FAILED', errorCode: body.code, errorMessage: body.message };
      } else if (path.endsWith('/complete')) {
        const body = JSON.parse(String(init.body));
        assert.equal(body.channelAccountId, channelAccountId);
        assert.ok(Array.isArray(body.pos));
        assert.ok(body.centers && typeof body.centers === 'object');
        current = {
          ...current,
          state: 'COMPLETE',
          artifactId: '55555555-5555-4555-8555-555555555555',
          contentChecksum: 'checksum',
        };
      }
      return {
        ok: true,
        status: 200,
        async json() { return structuredClone(current); },
      };
    },
    collect: async (_plan, collection) => {
      captureCount += 1;
      assert.equal(collection.attemptId, attemptId);
      return {
        success: true,
        pos: [{ seq: 'PO-1', status: 'PA', center: 'C', transport: 'SHIPMENT', edd: '', reg: 'R', items: [] }],
        centers: {},
        count: 1,
      };
    },
  });
  return {
    owner,
    calls,
    sessions,
    captureCount: () => captureCount,
    setState(state) { current = makeControl(state); },
  };
}

test('Directship capture uploads the raw capture before returning and closes its local session', async () => {
  const f = fixture();
  const first = await f.owner.run({ environmentId: 'local', attemptId });

  assert.equal(first.success, true);
  assert.equal(first.terminalState, 'COMPLETE');
  assert.equal(first.pos, undefined);
  assert.equal(first.collectionSession, undefined);
  assert.equal(f.captureCount(), 1);
  assert.equal(f.calls.filter(({ path }) => path.endsWith('/complete')).length, 1);
  assert.equal(f.calls.filter(({ path }) => path.endsWith('/control')).length, 1);
  assert.equal(await f.sessions.getOwned(attemptId, 'local'), null);

  const replay = await f.owner.run({ environmentId: 'local', attemptId });
  assert.equal(replay.success, true);
  assert.equal(replay.terminalState, 'COMPLETE');
  assert.equal(f.captureCount(), 1);
});
