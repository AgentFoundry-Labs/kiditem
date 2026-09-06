import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const runtimeUrl = new URL('../kiditem-os/background/coupang/coupang-catalog-import.js', import.meta.url);
const attemptId = '11111111-1111-4111-8111-111111111111';
const channelAccountId = '22222222-2222-4222-8222-222222222222';
const otherRunId = '33333333-3333-4333-8333-333333333333';
const stateKey = 'catalog-publication-test';
const attemptToken = '44444444-4444-4444-8444-444444444444';
const listUrl = 'https://wing.coupang.com/tenants/seller-web/vendor-inventory/list?searchKeywordType=ALL&searchKeywords=&salesMethod=ALL&productStatus=ALL&stockSearchType=ALL&shippingFeeSearchType=ALL&displayCategoryCodes=&listingStartTime=null&listingEndTime=null&saleEndDateSearchType=ALL&bundledShippingSearchType=ALL&upBundling=ALL&displayDeletedProduct=false&shippingMethod=ALL&exposureStatus=ALL&locale=ko_KR&sortMethod=SORT_BY_ITEM_LEVEL_UNIT_SOLD&countPerPage=50&page=1';
const permit = { attemptId, attemptToken, state: 'RUNNING', expiresAt: '2030-01-02T00:00:00.000Z',
  plan: { channelAccountId, collectorVersion: 'wing-inventory-v1', vendorId: 'vendor-1',
    publicationRevision: '1', listUrl,
    detailUrl: 'https://wing.coupang.com/tenants/seller-web/vendor-inventory/modify' } };

function ownerResult(state = 'RUNNING', overrides = {}) {
  return {
    attemptId, channelAccountId, state, plan: permit.plan, expiresAt: permit.expiresAt,
    phase: state === 'COMPLETE' ? 'finished' : 'ready_to_finalize',
    snapshotHash: 'a'.repeat(64), missing: { productIds: [] },
    progress: { hydratedProducts: 10, discoveredProducts: 10 },
    publication: state === 'COMPLETE' ? { sourceImportRunId: attemptId } : null,
    ...overrides,
  };
}

function harness({ finalize = () => ownerResult('COMPLETE'), read = () => ownerResult(),
  fail = () => ownerResult('FAILED'), chunk = () => ownerResult(), discovery,
  extract, initial = {}, storage: savedStorage, now = () => Date.now() } = {}) {
  const storage = savedStorage || { [stateKey]: {
    attemptId, channelAccountId, status: 'running', phase: 'hydration', permit,
    hydratedProducts: 10, discoveredProducts: 10, uploadedChunks: 3, ...initial,
  } };
  const calls = { requests: [], closed: [], notified: 0, navigation: [], delays: [], extraction: 0, alarms: [] };
  let tabUrl = listUrl;
  const chrome = {
    storage: { local: {
      async get(key, cb) { const value = key === null ? structuredClone(storage) : { [key]: structuredClone(storage[key]) }; cb?.(value); return value; },
      async set(values, cb) { Object.assign(storage, structuredClone(values)); cb?.(); },
      async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key]; },
    } },
    alarms: { create(name, options) { calls.alarms.push({ name, ...options }); }, clear(_key, cb) { cb(true); } },
    tabs: { async query() { return []; }, async remove() {} },
    scripting: { async executeScript(input) { calls.extraction += 1; return extract ? extract(input, tabUrl) : []; } },
  };
  const context = vm.createContext({ URL, console, crypto, TextEncoder, chrome, Date: class extends Date { static now() { return now(); } },
    setTimeout(fn, ms) { calls.delays.push(ms); queueMicrotask(fn); return 1; }, clearTimeout() {} });
  for (const relative of ['../shared/collection-session.js',
    '../kiditem-os/shared/coupang-catalog-collector.js',
    '../kiditem-os/background/sourcing/source-attempt-wire.js']) {
    vm.runInContext(fs.readFileSync(new URL(relative, import.meta.url), 'utf8'), context);
  }
  vm.runInContext(fs.readFileSync(runtimeUrl, 'utf8'), context);
  const sessions = context.KidItemCollectionSession.create({ chrome, storageKey: 'sessions', webUrlPatterns: [] });
  const ready = sessions.start({ attemptId, environmentId: 'local', producer: 'channels.coupang_catalog' });
  const dependencies = {
    stateKey, environmentId: 'local',
    async authedFetch(path, init) {
      calls.requests.push({ path, method: init?.method ?? 'GET', headers: init?.headers, body: init?.body });
      const result = path.endsWith('/finalize') ? await finalize(init)
        : path.endsWith('/fail') ? await fail(init)
        : path.includes('/chunks/') ? await chunk(init) : await read(path);
      return result?.httpStatus
        ? { ok: false, status: result.httpStatus, json: async () => ({ message: result.message || 'rejected' }) }
        : { ok: true, status: 200, json: async () => result };
    },
    collectionSessions: sessions,
    collectionWindow: {
      async close(id) { calls.closed.push(id); },
      async getOrCreate() { return { tabId: 41, windowId: 7 }; },
      async navigate(id, url) { calls.navigation.push({ id, url }); tabUrl = url; return { tabId: 41, windowId: 7 }; },
    },
    async waitForTabComplete(_id, options) { assert.equal(options.timeoutMs, 45000); return { url: tabUrl }; },
    async sendTabMessage(_id, message) { assert.equal(message.action, 'collectCoupangCatalogDiscoveryPage'); return discovery(); },
    notifyDashboard() { calls.notified += 1; },
  };
  return { runtime: context.KidItemCoupangCatalogImport, dependencies, calls, storage, sessions, ready,
    async step() {
      await ready;
      await this.runtime.handleAlarm({ name: 'kiditem-coupang-catalog-import-step' }, dependencies);
      for (let i = 0; i < 100; i += 1) await new Promise(setImmediate);
    },
  };
}

async function settle(h) { await h.step(); }

test('a legacy local run without an owner permit cannot block a new catalog permit', async () => {
  let reads = 0;
  const h = harness({ storage: { [stateKey]: { runId: otherRunId, status: 'running' } },
    read() { if (reads++ === 0) return ownerResult(); throw new Error('temporarily offline'); } });
  await h.ready;
  const result = await h.runtime.start({ permit }, h.dependencies);
  await h.step();
  assert.equal(result.started, true);
  assert.equal(result.attemptId, attemptId);
  assert.equal(h.storage[stateKey].attemptId, attemptId);
  assert.equal(h.storage[stateKey].runId, undefined);
  assert.equal((await h.sessions.getOwned(attemptId, 'local')).producer, 'channels.coupang_catalog');
  assert.deepEqual(h.calls.closed, []);
  assert.deepEqual(h.calls.navigation, []);
  assert.equal(h.calls.requests.some(r => r.path.includes(otherRunId)), false);
});

test('a new catalog permit replaces local running work only after its exact previous owner is terminal', async (t) => {
  for (const outcome of ['FAILED', 'expired', 'COMPLETE', 'RUNNING', 'unavailable', 'wrong attempt']) {
    await t.test(outcome, async () => {
      const oldPermit = outcome === 'expired' ? { ...permit, expiresAt: '2020-01-02T00:00:00.000Z' } : permit;
      const pendingTerminal = { kind: 'finalize', body: { snapshotHash: 'b'.repeat(64) } };
      let newReads = 0;
      const h = harness({ initial: { permit: oldPermit, pendingTerminal }, read(path) {
        if (path.endsWith('/' + attemptId)) {
          if (outcome === 'unavailable') throw new Error('owner unavailable');
          return ownerResult(outcome === 'expired' ? 'FAILED' : outcome === 'wrong attempt' ? 'COMPLETE' : outcome,
            { expiresAt: oldPermit.expiresAt,
              ...(outcome === 'wrong attempt' ? { attemptId: otherRunId } : {}),
              ...(outcome === 'expired' ? { error: { code: 'SOURCE_ATTEMPT_EXPIRED' } } : {}) });
        }
        if (newReads++ === 0) return ownerResult('RUNNING', { attemptId: otherRunId });
        throw new Error('new attempt temporarily offline');
      } });
      await h.ready;
      const start = h.runtime.start({ permit: { ...permit, attemptId: otherRunId } }, h.dependencies);
      if (['FAILED', 'expired', 'COMPLETE'].includes(outcome)) {
        assert.equal((await start).started, true);
        await h.step();
        assert.equal(h.storage[stateKey].attemptId, otherRunId);
        assert.equal(h.storage[stateKey].pendingTerminal, undefined);
        assert.equal(await h.sessions.getOwned(attemptId, 'local'), null);
        assert.equal((await h.sessions.getOwned(otherRunId, 'local')).producer, 'channels.coupang_catalog');
        assert.deepEqual(h.calls.closed, [attemptId]);
      } else {
        await assert.rejects(start);
        assert.equal(h.storage[stateKey].attemptId, attemptId);
        assert.deepEqual(h.storage[stateKey].pendingTerminal, pendingTerminal);
        assert.ok(await h.sessions.getOwned(attemptId, 'local'));
        assert.equal(await h.sessions.getOwned(otherRunId, 'local'), null);
        assert.deepEqual(h.calls.closed, []);
      }
      assert.equal(h.calls.requests.filter(r => r.path.endsWith('/' + attemptId)).length, outcome === 'unavailable' ? 3 : 1);
      assert.equal(h.calls.requests.some(r => r.method !== 'GET'), false);
      assert.deepEqual(h.calls.navigation, []);
    });
  }
});

test('fixed expiry stops automatic offline retries while preserving an uncertain receipt for explicit owner reconciliation', async (t) => {
  for (const scenario of ['owner read', 'pending terminal', 'late RUNNING receipt']) {
    await t.test(scenario, async () => {
      const pending = scenario !== 'owner read';
      let clock = Date.parse(permit.expiresAt) - 1, available = false, reads = 0;
      const pendingTerminal = { kind: 'finalize', body: { snapshotHash: 'b'.repeat(64) } };
      const h = harness({ now: () => clock,
        initial: pending ? { pendingTerminal } : {},
        read() {
          if (available) return ownerResult('COMPLETE');
          clock = Date.parse(permit.expiresAt) + 1;
          if (scenario === 'late RUNNING receipt' && reads++ === 0) return ownerResult();
          throw new Error('owner unavailable');
        } });
      await h.step();
      assert.deepEqual(h.calls.alarms, []);
      assert.deepEqual(h.storage[stateKey].pendingTerminal, pending ? pendingTerminal : undefined);
      const requests = h.calls.requests.length;
      await h.step();
      assert.equal(h.calls.requests.length, requests);
      assert.deepEqual(h.calls.navigation, []);
      assert.equal(h.calls.extraction, 0);
      assert.deepEqual(h.calls.alarms, []);
      available = true;
      const status = await h.runtime.getStatus(attemptId, h.dependencies);
      assert.equal(status.active, false);
      assert.equal(h.storage[stateKey].status, 'done');
      assert.equal(h.storage[stateKey].pendingTerminal, null);
      assert.equal(await h.sessions.getOwned(attemptId, 'local'), null);
      assert.equal(h.calls.requests.some(r => r.method !== 'GET'), false);
    });
  }
});

test('discovery uses product counts in the actual session and token-fences its unchanged page payload', async () => {
  const records = Array.from({ length: 50 }, (_, i) => ({ externalProductId: String(i + 1), registeredName: '상품' }));
  const h = harness({ initial: { phase: 'discovery', currentPage: 0, discoveryItems: [], discoveredProducts: 0 },
    discovery: () => ({ success: true, records, totalItems: 51, pageSize: 50 }) });
  await h.step();
  const session = await h.sessions.getOwned(attemptId, 'local');
  assert.deepEqual(JSON.parse(JSON.stringify(session.progress)), {
    current: 50, total: 51, completed: 50, failed: 0, label: 'Wing 상품 목록 1페이지',
  });
  const upload = h.calls.requests.find(r => r.method === 'PUT');
  assert.equal(upload.headers['x-source-attempt-token'], attemptToken);
  const body = JSON.parse(upload.body);
  assert.equal(body.kind, 'discovery_page');
  assert.equal(body.itemCount, 50);
  assert.equal(body.payload.manifest.expectedPages, 2);
  assert.equal(body.payload.items[49].externalProductId, '50');
  assert.equal(h.calls.navigation[0].url, listUrl);
});

test('catalog completion is observed only after its exact owner publication receipt', async () => {
  const h = harness();
  await settle(h);
  assert.equal(h.storage[stateKey].status, 'done');
  assert.equal(await h.sessions.getOwned(attemptId, 'local'), null);
  assert.equal(h.calls.notified, 1);
  assert.equal(h.calls.requests.filter(r => r.path.endsWith('/finalize')).length, 1);
  assert.equal(h.calls.requests.find(r => r.path.endsWith('/finalize')).headers['x-source-attempt-token'], attemptToken);
});

test('lost final acknowledgement is reconciled from the committed owner without reporting failure', async () => {
  let committed = false;
  const h = harness({
    finalize() { committed = true; throw new Error('response lost after commit'); },
    read: () => ownerResult(committed ? 'COMPLETE' : 'RUNNING'),
  });
  await settle(h);
  assert.equal(h.storage[stateKey].status, 'done');
  assert.equal(await h.sessions.getOwned(attemptId, 'local'), null);
  assert.ok(h.calls.requests.every(r => !r.path.endsWith('/errors')));
});

for (const [name, response] of [
  ['nonterminal response', ownerResult()],
  ['another attempt', ownerResult('COMPLETE', { attemptId: otherRunId })],
  ['another account', ownerResult('COMPLETE', { channelAccountId: otherRunId })],
  ['missing publication receipt', ownerResult('COMPLETE', { publication: null })],
]) {
  test(`does not announce completion from ${name}`, async () => {
    const h = harness({ finalize: () => response });
    await settle(h);
    assert.notEqual(h.storage[stateKey].status, 'done');
    assert.notEqual(await h.sessions.getOwned(attemptId, 'local'), null);
    assert.equal(h.calls.notified, 0);
  });
}

test('a failed owner attempt cannot restart collection', async () => {
  const h = harness({ read: () => ownerResult('FAILED') });
  await assert.rejects(h.runtime.start({ permit }, h.dependencies));
  assert.notEqual(await h.sessions.getOwned(attemptId, 'local'), null);
  assert.equal(h.calls.requests.length, 1);
});

test('unknown final ACK durably replays the identical terminal body after reload without provider IO or failure', async () => {
  let unavailable = false;
  const h = harness({
    finalize() {
      assert.deepEqual(h.storage[stateKey].pendingTerminal, { kind: 'finalize', body: { snapshotHash: 'a'.repeat(64) } });
      unavailable = true; throw new Error('lost ACK');
    },
    read() { if (unavailable) throw new Error('DB unavailable'); return ownerResult(); },
  });
  await h.step();
  const terminal = h.storage[stateKey].pendingTerminal;
  assert.deepEqual(terminal, { kind: 'finalize', body: { snapshotHash: 'a'.repeat(64) } });
  assert.equal(h.calls.requests.filter(r => r.path.endsWith('/fail')).length, 0);
  assert.notEqual(await h.sessions.getOwned(attemptId, 'local'), null);
  const resumed = harness({ storage: h.storage });
  await resumed.step();
  const request = resumed.calls.requests.find(r => r.path.endsWith('/finalize'));
  assert.equal(request.body, h.calls.requests.find(r => r.path.endsWith('/finalize')).body);
  assert.equal(request.headers['x-source-attempt-token'], attemptToken);
  assert.deepEqual(resumed.calls.navigation, []);
  assert.equal(await resumed.sessions.getOwned(attemptId, 'local'), null);
});

test('cancellation waits for owner failure ACK, fences in-flight extraction, and cannot restore cancelled state', async () => {
  const extraction = Promise.withResolvers(), acknowledgement = Promise.withResolvers();
  let extracting = false;
  const h = harness({
    initial: { manifest: { totalItems: 1, pageSize: 50, expectedPages: 1 },
      discoveryItems: [{ ordinal: 0, externalProductId: '1' }] },
    read: () => ownerResult('RUNNING', { missing: { productIds: ['1'] } }),
    extract: async () => { extracting = true; return extraction.promise; },
    fail: async () => acknowledgement.promise,
  });
  const collecting = h.step();
  for (let i = 0; i < 100 && !extracting; i += 1) await new Promise(setImmediate);
  assert.equal(extracting, true);
  const cancelling = h.runtime.cancel(attemptId, h.dependencies);
  for (let i = 0; i < 50; i += 1) await new Promise(setImmediate);
  assert.equal(h.calls.requests.filter(r => r.path.endsWith('/fail')).length, 1);
  assert.notEqual(await h.sessions.getOwned(attemptId, 'local'), null);
  extraction.resolve([{ result: { sellerProductId: 1, sellerProductName: '상품', items: [] } }]);
  await collecting;
  assert.equal(h.calls.requests.filter(r => r.method === 'PUT').length, 0);
  acknowledgement.resolve(ownerResult('FAILED', { error: { code: 'USER_CANCELLED', message: '취소' } }));
  await cancelling;
  assert.equal(await h.sessions.getOwned(attemptId, 'local'), null);
  assert.equal((await h.runtime.getStatus(attemptId, h.dependencies)).active, false);
  const failure = h.calls.requests.find(r => r.path.endsWith('/fail'));
  assert.equal(failure.headers['x-source-attempt-token'], attemptToken);
  assert.equal(JSON.parse(failure.body).code, 'USER_CANCELLED');
});

test('a failed or expired owner stops before any catalog navigation', async (t) => {
  for (const reason of ['failed', 'expired', 'plan drift']) await t.test(reason, async () => {
    const h = harness({
      initial: { phase: 'discovery', currentPage: 0, discoveryItems: [],
        permit: reason === 'expired' ? { ...permit, expiresAt: '2020-01-01T00:00:00.000Z' } : permit },
      read: () => ownerResult(reason === 'failed' ? 'FAILED' : 'RUNNING',
        reason === 'plan drift' ? { plan: { ...permit.plan, vendorId: 'different' } } : {}),
      discovery: () => ({ success: true, records: [], totalItems: 0, pageSize: 50 }),
    });
    await h.step();
    assert.deepEqual(h.calls.navigation, []);
    if (reason === 'plan drift') assert.equal(h.calls.requests.some(r => r.method !== 'GET'), false);
  });
});

test('login failure uses the immutable owner fail endpoint and preserves an owned attention tab', async () => {
  const h = harness({
    initial: { phase: 'discovery', currentPage: 0, discoveryItems: [], discoveredProducts: 0 },
    discovery: () => ({ success: false, pendingLogin: true, error: '로그인 필요' }),
  });
  await h.step();
  const status = await h.runtime.getStatus(attemptId, h.dependencies);
  assert.equal(status.active, false);
  assert.equal(status.attention.reason, 'marketplace_login');
  assert.equal(status.attention.canOpenTab, true);
  assert.deepEqual(h.calls.closed, []);
  const failure = h.calls.requests.find(r => r.path.endsWith('/fail'));
  assert.equal(JSON.parse(failure.body).code, 'MARKETPLACE_LOGIN_REQUIRED');
  assert.equal(failure.headers['x-source-attempt-token'], attemptToken);
  assert.equal(h.calls.requests.some(r => r.path.endsWith('/errors')), false);
});

test('a late detail response cannot overwrite a new explicitly started attempt after cancellation', async () => {
  const extraction = Promise.withResolvers();
  let extracting = false, next = false;
  const h = harness({
    initial: { manifest: { totalItems: 1, pageSize: 50, expectedPages: 1 },
      discoveryItems: [{ ordinal: 0, externalProductId: '1' }] },
    read: () => ownerResult('RUNNING', { attemptId: next ? otherRunId : attemptId,
      missing: { productIds: ['1'] } }),
    extract: async () => { extracting = true; return extraction.promise; },
  });
  const oldStep = h.step();
  for (let i = 0; i < 100 && !extracting; i += 1) await new Promise(setImmediate);
  assert.equal(extracting, true);
  await h.runtime.cancel(attemptId, h.dependencies);
  next = true;
  await h.runtime.start({ permit: { ...permit, attemptId: otherRunId } }, h.dependencies);
  assert.equal(h.storage[stateKey].attemptId, otherRunId);
  extraction.resolve([{ result: { sellerProductId: 1, sellerProductName: '상품', items: [] } }]);
  await oldStep;
  assert.equal(h.storage[stateKey].attemptId, otherRunId);
  assert.equal(h.storage[stateKey].status, 'running');
  assert.equal(h.calls.requests.filter(r => r.method === 'PUT').length, 0);
});

test('definitive finalize validation rejection becomes one token-fenced failure instead of recollection', async () => {
  const h = harness({ finalize: () => ({ httpStatus: 422, message: 'snapshot rejected' }) });
  await h.step();
  assert.equal(h.calls.requests.filter(r => r.path.endsWith('/finalize')).length, 1);
  const failed = h.calls.requests.find(r => r.path.endsWith('/fail'));
  assert.equal(failed.headers['x-source-attempt-token'], attemptToken);
  assert.equal(JSON.parse(failed.body).message, 'snapshot rejected');
  assert.equal(await h.sessions.getOwned(attemptId, 'local'), null);
  assert.deepEqual(h.calls.navigation, []);
});

test('catalog keeps the original 20-product chunks, detail URLs, five extraction tries and normalized output', async () => {
  const records = Array.from({ length: 21 }, (_, i) => ({ externalProductId: String(i + 1), registeredName: '상품' }));
  const hydrated = new Set(), chunks = [], detailCalls = new Map();
  let manifest = null;
  const read = () => ownerResult('RUNNING', { manifest,
    progress: { hydratedProducts: hydrated.size, discoveredProducts: manifest ? 21 : 0 },
    missing: { productIds: records.map(r => r.externalProductId).filter(id => !hydrated.has(id)) } });
  const h = harness({
    initial: { phase: 'discovery', currentPage: 0, discoveredProducts: 0, hydratedProducts: 0, uploadedChunks: 0, discoveryItems: [] },
    discovery: () => ({ success: true, records, totalItems: 21, pageSize: 50 }),
    read,
    chunk(init) {
      const body = JSON.parse(init.body);
      chunks.push(body);
      if (body.kind === 'discovery_page') manifest = body.payload.manifest;
      for (const row of body.payload.products || []) hydrated.add(row.product.externalProductId);
      return read();
    },
    extract(input, url) {
      const id = new URL(url).searchParams.get('vendorInventoryId');
      const count = (detailCalls.get(id) || 0) + 1;
      detailCalls.set(id, count);
      const product = { sellerProductId: Number(id), sellerProductName: '상품 ' + id,
        items: [{ vendorItemId: Number(id) + 100, itemName: '단품', salePrice: 660, externalVendorSku: 'sku-' + id }] };
      const document = { scripts: [{ textContent: id === '1' && count < 5 ? '' :
        'const appData = {"oSellerProduct":' + JSON.stringify(product) + '};' }] };
      return [{ result: vm.runInNewContext('(' + input.func.toString() + ')()', { document }) }];
    },
  });
  for (let i = 0; i < 5; i += 1) await h.step();
  assert.deepEqual(chunks.map(c => [c.kind, c.sequence, c.itemCount]), [
    ['discovery_page', 1, 21], ['manifest_confirmation', 1, 1],
    ['product_details', 1, 20], ['product_details', 21, 1],
  ]);
  assert.equal(detailCalls.get('1'), 5);
  assert.equal(detailCalls.get('21'), 1);
  assert.deepEqual(h.calls.delays, [500, 500, 500, 500, 500, 500]);
  assert.deepEqual(h.calls.navigation.map(n => n.url), [
    listUrl, listUrl, ...records.map(r => permit.plan.detailUrl + '?vendorInventoryId=' + r.externalProductId),
  ]);
  assert.equal(chunks[2].payload.products[0].product.externalProductId, '1');
  assert.equal(chunks[2].payload.products[0].product.options[0].externalOptionId, '101');
  assert.equal(chunks[2].payload.products[0].product.options[0].sellerSku, 'sku-1');
  assert.equal(chunks[2].payload.products[0].product.options[0].salePrice, 660);
  assert.ok(h.calls.requests.filter(r => r.method !== 'GET')
    .every(r => r.headers['x-source-attempt-token'] === attemptToken));
  assert.equal(await h.sessions.getOwned(attemptId, 'local'), null);
});

test('temporary owner read unavailability preserves progress without inventing a collection failure', async () => {
  const h = harness({ read: () => { throw new Error('DB unavailable'); } });
  await h.step();
  assert.equal(h.storage[stateKey].pendingTerminal, undefined);
  assert.equal(h.storage[stateKey].phase, 'hydration');
  assert.deepEqual(h.calls.navigation, []);
  assert.equal(h.calls.requests.some(r => r.method !== 'GET'), false);
});

test('a chunk acknowledgement from another attempt cannot advance the local catalog', async () => {
  const h = harness({
    initial: { phase: 'discovery', currentPage: 0, discoveredProducts: 0, discoveryItems: [] },
    discovery: () => ({ success: true, records: [{ externalProductId: '1', registeredName: '상품' }], totalItems: 1, pageSize: 50 }),
    chunk: () => ownerResult('RUNNING', { attemptId: otherRunId }),
  });
  await h.step();
  assert.equal(h.storage[stateKey].currentPage, 0);
  assert.deepEqual(h.storage[stateKey].discoveryItems, []);
});

test('an uncertain failure receipt is replayed unchanged and public progress never exposes its token', async () => {
  const h = harness({ fail: () => { throw new Error('lost failure ACK'); } });
  const first = await h.runtime.cancel(attemptId, h.dependencies);
  assert.equal(first.cancelled, false);
  const pending = structuredClone(h.storage[stateKey].pendingTerminal);
  assert.equal(pending.kind, 'fail');
  const resumed = harness({ storage: h.storage });
  await resumed.step();
  const replay = resumed.calls.requests.find(r => r.path.endsWith('/fail'));
  assert.deepEqual(JSON.parse(replay.body), pending.body);
  assert.equal(replay.headers['x-source-attempt-token'], attemptToken);
  const status = await resumed.runtime.getStatus(attemptId, resumed.dependencies);
  assert.equal(status.active, false);
  assert.equal(JSON.stringify(status).includes(attemptToken), false);
  assert.equal(Object.hasOwn(status, 'state'), false);
  assert.equal(Object.hasOwn(status, 'status'), false);
  assert.deepEqual(resumed.calls.navigation, []);
});
