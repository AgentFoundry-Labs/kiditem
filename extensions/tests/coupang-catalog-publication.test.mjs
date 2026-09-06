import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../kiditem-os/background/coupang/coupang-catalog-import.js', import.meta.url), 'utf8');
const runId = '11111111-1111-4111-8111-111111111111';
const channelAccountId = '22222222-2222-4222-8222-222222222222';
const otherRunId = '33333333-3333-4333-8333-333333333333';
const stateKey = 'catalog-publication-test';

function ownerResult(status = 'running', overrides = {}) {
  return {
    id: runId, channelAccountId, status,
    phase: status === 'completed' ? 'finished' : 'ready_to_finalize',
    snapshotHash: 'a'.repeat(64),
    missing: { productIds: [] },
    progress: { hydratedProducts: 10, discoveredProducts: 10 },
    publication: status === 'completed' ? { sourceImportRunId: otherRunId } : null,
    ...overrides,
  };
}

function harness({ finalize = () => ownerResult('completed'), read = () => ownerResult() } = {}) {
  const storage = {
    [stateKey]: { runId, channelAccountId, status: 'running', phase: 'hydration',
      hydratedProducts: 10, discoveredProducts: 10, uploadedChunks: 3 },
  };
  const calls = { requests: [], succeeded: [], failed: [], closed: [], notified: 0 };
  const context = vm.createContext({
    URL, console,
    chrome: {
      storage: { local: {
        get(key, cb) { cb({ [key]: structuredClone(storage[key]) }); },
        async set(values) { Object.assign(storage, structuredClone(values)); },
        async remove() {},
      } },
      alarms: { create() {}, clear(_key, cb) { cb(true); } },
    },
  });
  vm.runInContext(source, context);
  const dependencies = {
    stateKey,
    async authedFetch(path, init) {
      calls.requests.push({ path, method: init?.method ?? 'GET' });
      const body = path.endsWith('/finalize') ? await finalize()
        : path.endsWith('/errors') ? ownerResult() : await read();
      return { ok: true, json: async () => body };
    },
    collectionSessions: {
      async succeed(id) { calls.succeeded.push(id); },
      async fail(id) { calls.failed.push(id); },
      async progress() {},
    },
    collectionWindow: { async close(id) { calls.closed.push(id); } },
    notifyDashboard() { calls.notified += 1; },
  };
  return { runtime: context.KidItemCoupangCatalogImport, dependencies, calls, storage };
}

async function settle(h) {
  await h.runtime.getStatus(runId, h.dependencies);
  for (let i = 0; i < 100 && h.storage[stateKey].status === 'running'; i += 1) {
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.notEqual(h.storage[stateKey].status, 'running', 'collector step did not settle');
}

test('catalog completion is observed only after its exact owner publication receipt', async () => {
  const h = harness();
  await settle(h);
  assert.equal(h.storage[stateKey].status, 'done');
  assert.deepEqual(h.calls.succeeded, [runId]);
  assert.equal(h.calls.notified, 1);
  assert.equal(h.calls.requests.filter(r => r.path.endsWith('/finalize')).length, 1);
});

test('lost final acknowledgement is reconciled from the committed owner without reporting failure', async () => {
  let committed = false;
  const h = harness({
    finalize() { committed = true; throw new Error('response lost after commit'); },
    read: () => ownerResult(committed ? 'completed' : 'running'),
  });
  await settle(h);
  assert.equal(h.storage[stateKey].status, 'done');
  assert.deepEqual(h.calls.succeeded, [runId]);
  assert.deepEqual(h.calls.failed, []);
  assert.ok(h.calls.requests.every(r => !r.path.endsWith('/errors')));
});

for (const [name, response] of [
  ['nonterminal response', ownerResult()],
  ['another attempt', ownerResult('completed', { id: otherRunId })],
  ['another account', ownerResult('completed', { channelAccountId: otherRunId })],
  ['missing publication receipt', ownerResult('completed', { publication: null })],
]) {
  test(`does not announce completion from ${name}`, async () => {
    const h = harness({ finalize: () => response });
    await settle(h);
    assert.notEqual(h.storage[stateKey].status, 'done');
    assert.deepEqual(h.calls.succeeded, []);
    assert.equal(h.calls.notified, 0);
  });
}

test('a failed owner attempt cannot restart collection', async () => {
  const h = harness({ read: () => ownerResult('failed') });
  await assert.rejects(h.runtime.start({ runId, channelAccountId }, h.dependencies));
  assert.deepEqual(h.calls.succeeded, []);
  assert.equal(h.calls.requests.length, 1);
});
