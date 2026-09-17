import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { CoupangCatalogBrowserStatusSchema } from '@kiditem/shared/coupang-catalog-snapshot';

const runtimeUrl = new URL('../kiditem-os/background/coupang/coupang-catalog-import.js', import.meta.url);
const attemptId = '11111111-1111-4111-8111-111111111111';
const channelAccountId = '22222222-2222-4222-8222-222222222222';
const otherRunId = '33333333-3333-4333-8333-333333333333';
const stateKey = 'catalog-publication-test';
const attemptToken = '44444444-4444-4444-8444-444444444444';
const detailsAttemptId = '55555555-5555-4555-8555-555555555555';
const detailsAttemptToken = '66666666-6666-4666-8666-666666666666';
const detailsIdempotencyKey = '77777777-7777-4777-8777-777777777777';
const listUrl = 'https://wing.coupang.com/tenants/seller-web/vendor-inventory/list?searchKeywordType=ALL&searchKeywords=&salesMethod=ALL&productStatus=ALL&stockSearchType=ALL&shippingFeeSearchType=ALL&displayCategoryCodes=&listingStartTime=null&listingEndTime=null&saleEndDateSearchType=ALL&bundledShippingSearchType=ALL&upBundling=ALL&displayDeletedProduct=false&shippingMethod=ALL&exposureStatus=ALL&locale=ko_KR&sortMethod=SORT_BY_ITEM_LEVEL_UNIT_SOLD&countPerPage=50&page=1';
const permit = { attemptId, attemptToken, state: 'RUNNING', expiresAt: '2030-01-02T00:00:00.000Z',
  plan: { channelAccountId, collectorVersion: 'wing-inventory-v1', vendorId: 'vendor-1',
    publicationRevision: '1', listUrl,
    detailUrl: 'https://wing.coupang.com/tenants/seller-web/vendor-inventory/modify' } };
const stagedListUrl = 'https://wing.coupang.com/tenants/seller-web/vendor-inventory/list?searchKeywordType=ALL&searchKeywords=&salesMethod=ALL&productStatus=ALL&stockSearchType=ALL&shippingFeeSearchType=ALL&displayCategoryCodes=&listingStartTime=null&listingEndTime=null&saleEndDateSearchType=ALL&bundledShippingSearchType=ALL&upBundling=ALL&displayDeletedProduct=false&shippingMethod=ALL&exposureStatus=ALL&locale=ko_KR&sortMethod=SORT_BY_ITEM_LEVEL_UNIT_SOLD&countPerPage=500&page=1';
const stagedDetailUrl = 'https://wing.coupang.com/tenants/seller-web/v2/vendor-inventory/seller-product';
const basicsPermit = {
  ...permit,
  plan: { ...permit.plan, listUrl: stagedListUrl, detailUrl: stagedDetailUrl, stage: 'basics' },
};
const detailsPermit = {
  ...permit,
  plan: {
    ...permit.plan,
    listUrl: stagedListUrl,
    detailUrl: stagedDetailUrl,
    stage: 'details',
    basicAttemptId: otherRunId,
    basicManifestHash: 'b'.repeat(64),
    basicPublicationSequence: '1',
    basicProductIds: ['1'],
  },
};
const chainBasicsPermit = {
  ...basicsPermit,
  plan: {
    ...basicsPermit.plan,
    rootAttemptId: attemptId,
    detailsIdempotencyKey,
  },
};
const chainDetailsPermit = {
  ...basicsPermit,
  attemptId: detailsAttemptId,
  attemptToken: detailsAttemptToken,
  plan: {
    ...basicsPermit.plan,
    stage: 'details',
    rootAttemptId: attemptId,
    basicAttemptId: attemptId,
    basicManifestHash: 'a'.repeat(64),
    basicPublicationSequence: '1',
    basicProductIds: ['1'],
  },
};

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

function ownerResultFor(selectedPermit, state = 'RUNNING', overrides = {}) {
  return {
    attemptId: selectedPermit.attemptId,
    channelAccountId: selectedPermit.plan.channelAccountId,
    state,
    plan: selectedPermit.plan,
    expiresAt: selectedPermit.expiresAt,
    phase: state === 'COMPLETE' ? 'finished' : 'ready_to_finalize',
    snapshotHash: 'a'.repeat(64),
    missing: { productIds: [] },
    progress: { hydratedProducts: 0, discoveredProducts: 0, storedChunks: 0 },
    publication: state === 'COMPLETE' ? { sourceImportRunId: selectedPermit.attemptId } : null,
    ...overrides,
  };
}

function chainOwnerResult(selectedPermit, state = 'RUNNING', overrides = {}) {
  return ownerResultFor(selectedPermit, state, {
    publication: state === 'COMPLETE' ? { sourceImportRunId: selectedPermit.attemptId } : null,
    progress: { hydratedProducts: 0, discoveredProducts: 0, storedChunks: 0 },
    ...overrides,
  });
}

function productionCloseWithoutStoredRecord() {
  const chrome = {
    runtime: { lastError: null },
    storage: { local: { async get() { return {}; } } },
  };
  const context = vm.createContext({
    URL, chrome, clearTimeout, console, queueMicrotask, setTimeout, structuredClone,
  });
  vm.runInContext(fs.readFileSync(
    new URL('../kiditem-os/background/coupang/collection-window.js', import.meta.url),
    'utf8',
  ), context);
  const resource = context.KidItemCollectionWindow.create({ chrome, storageKey: 'owned-window' });
  return resource.close.bind(resource);
}

function harness({ finalize = () => ownerResult('COMPLETE'), read = () => ownerResult(),
  fail = () => ownerResult('FAILED'), chunk = () => ownerResult(), discovery,
  extract, initial = {}, storage: savedStorage, now = () => Date.now(),
  tab: savedTab = {}, permit: selectedPermit = permit,
  closeWindow = async () => true } = {}) {
  const storage = savedStorage || { [stateKey]: {
    attemptId: selectedPermit.attemptId, channelAccountId: selectedPermit.plan.channelAccountId,
    status: 'running', phase: 'hydration', permit: selectedPermit,
    hydratedProducts: 10, discoveredProducts: 10, uploadedChunks: 3, ...initial,
  } };
  const calls = {
    requests: [], closed: [], notified: 0, navigation: [], delays: [], extraction: 0, alarms: [], discoveryMessages: [],
    keepAlive: { starts: 0, releases: 0, active: 0 },
  };
  const selectedListUrl = selectedPermit.plan.listUrl;
  let tabUrl = selectedListUrl;
  const tab = {
    exists: savedTab.exists !== false,
    id: Number.isInteger(savedTab.id) ? savedTab.id : 41,
    windowId: Number.isInteger(savedTab.windowId) ? savedTab.windowId : 7,
    status: savedTab.status || 'complete',
    url: savedTab.url || selectedListUrl,
  };
  tabUrl = tab.url;
  const chrome = {
    storage: { local: {
      async get(key, cb) { const value = key === null ? structuredClone(storage) : { [key]: structuredClone(storage[key]) }; cb?.(value); return value; },
      async set(values, cb) { Object.assign(storage, structuredClone(values)); cb?.(); },
      async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key]; },
    } },
    alarms: { create(name, options) { calls.alarms.push({ name, ...options }); }, clear(_key, cb) { cb(true); } },
    tabs: {
      async query() { return []; },
      async remove() { tab.exists = false; },
      get(_id, cb) {
        if (!tab.exists) { cb?.(undefined); return; }
        cb?.({ id: tab.id, windowId: tab.windowId, status: tab.status, url: tab.url });
      },
    },
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
        : path.includes('/chunks/') ? await chunk(init) : await read(path, init);
      return result?.httpStatus !== undefined
        ? { ok: false, status: result.httpStatus, json: async () => ({ message: result.message || 'rejected' }) }
        : { ok: true, status: 200, json: async () => result };
    },
    collectionSessions: sessions,
    keepAlive(operation) {
      calls.keepAlive.starts += 1;
      calls.keepAlive.active += 1;
      return Promise.resolve(operation).finally(() => {
        calls.keepAlive.releases += 1;
        calls.keepAlive.active -= 1;
      });
    },
    collectionWindow: {
      async close(id) { calls.closed.push(id); return closeWindow(id); },
      async getOrCreate() {
        if (!tab.exists) {
          tab.exists = true;
          tab.id += 1;
          tab.windowId += 1;
          tab.status = 'loading';
          tab.url = selectedListUrl;
          tabUrl = tab.url;
        }
        return { tabId: tab.id, windowId: tab.windowId };
      },
      async navigate(id, url) {
        calls.navigation.push({ id, url });
        tab.exists = true;
        tab.url = url;
        tab.status = 'complete';
        tabUrl = url;
        return { tabId: tab.id, windowId: tab.windowId };
      },
    },
    async getTab(id) {
      if (!tab.exists || id !== tab.id) throw new Error('tab was closed');
      return { id: tab.id, windowId: tab.windowId, status: tab.status, url: tab.url };
    },
    async waitForTabComplete(_id, options) {
      assert.equal(options.timeoutMs, 45000);
      tab.status = 'complete';
      return { id: tab.id, windowId: tab.windowId, status: tab.status, url: tabUrl };
    },
    async sendTabMessage(_id, message) {
      assert.equal(message.action, 'collectCoupangCatalogDiscoveryPage');
      calls.discoveryMessages.push(structuredClone(message));
      const response = await discovery(message);
      if (!response?.success || !Array.isArray(response.records)) return response;
      const page = Number(message.page || response.page || 1);
      const pageSize = Number(response.pageSize || 50);
      const totalItems = Number(response.totalItems);
      return {
        ...response,
        page,
        pageSize,
        totalItems,
        totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize),
      };
    },
    notifyDashboard() { calls.notified += 1; },
  };
  return { runtime: context.KidItemCoupangCatalogImport, dependencies, calls, storage, sessions, ready,
    permit: selectedPermit,
    setTab(next) { Object.assign(tab, next); tabUrl = tab.url; },
    async step() {
      await ready;
      await this.runtime.handleAlarm({ name: 'kiditem-coupang-catalog-import-step' }, dependencies);
      for (let i = 0; i < 100; i += 1) await new Promise(setImmediate);
    },
  };
}

async function settle(h) { await h.step(); }

test('getStatus producer output stays within the shared browser-status wire schema', async (t) => {
  await t.test('normal RUNNING activity remains active without leaking local rate-limit state', async () => {
    const h = harness({
      initial: { phase: 'discovery', currentPage: 0, discoveryItems: [], discoveredProducts: 0 },
      discovery: () => ({ success: true, records: [], totalItems: 0, pageSize: 50 }),
    });
    const status = await h.runtime.getStatus(attemptId, h.dependencies);

    assert.equal(status.active, true);
    assert.equal(status.attention, null);
    assert.equal(Object.hasOwn(status, 'nextAllowedAt'), false);
    CoupangCatalogBrowserStatusSchema.parse(status);
  });

  await t.test('a rate-limit pause is inactive but preserves attention', async () => {
    const notBefore = new Date(Date.now() + 60_000).toISOString();
    const h = harness({ initial: { nextAllowedAt: notBefore } });
    await h.ready;
    await h.sessions.requireAttention(attemptId, {
      reason: 'rate_limited',
      message: '쿠팡 Wing 요청 한도에 도달했습니다',
    });
    const status = await h.runtime.getStatus(attemptId, h.dependencies);

    assert.equal(status.active, false);
    assert.deepEqual(JSON.parse(JSON.stringify(status.attention)), {
      reason: 'rate_limited',
      message: '쿠팡 Wing 요청 한도에 도달했습니다',
      canOpenTab: false,
    });
    assert.equal(Object.hasOwn(status, 'nextAllowedAt'), false);
    CoupangCatalogBrowserStatusSchema.parse(status);
  });

  await t.test('a completed owner attempt remains a valid inactive status', async () => {
    const h = harness({
      read: () => ownerResult('COMPLETE'),
      initial: { phase: 'finished' },
    });
    await h.runtime.start({ permit }, h.dependencies);
    const status = await h.runtime.getStatus(attemptId, h.dependencies);

    assert.equal(status.active, false);
    assert.equal(status.attention, null);
    assert.equal(status.phase, 'finished');
    assert.equal(Object.hasOwn(status, 'nextAllowedAt'), false);
    CoupangCatalogBrowserStatusSchema.parse(status);
  });
});

test('runSoon holds one finite keepalive while its deferred catalog step is pending', async () => {
  const h = harness({
    initial: { phase: 'discovery', currentPage: 0, discoveryItems: [], discoveredProducts: 0 },
    discovery: () => ({ success: true, records: [], totalItems: 0, pageSize: 50 }),
  });
  const gate = Promise.withResolvers();
  h.dependencies.waitForTabComplete = async (_id, options) => {
    assert.equal(options.timeoutMs, 45000);
    return gate.promise;
  };

  await h.ready;
  const step = h.runtime.handleAlarm({ name: 'kiditem-coupang-catalog-import-step' }, h.dependencies);
  await new Promise(setImmediate);

  assert.deepEqual(h.calls.keepAlive, { starts: 1, releases: 0, active: 1 });
  gate.resolve({ url: listUrl });
  await step;
  assert.deepEqual(h.calls.keepAlive, { starts: 1, releases: 1, active: 0 });
});

test('concurrent status and alarm triggers share one active keepalive hold', async () => {
  const h = harness({
    initial: { phase: 'discovery', currentPage: 0, discoveryItems: [], discoveredProducts: 0 },
    discovery: () => ({ success: true, records: [], totalItems: 0, pageSize: 50 }),
  });
  const gate = Promise.withResolvers();
  h.dependencies.waitForTabComplete = async (_id, options) => {
    assert.equal(options.timeoutMs, 45000);
    return gate.promise;
  };

  await h.ready;
  const alarmStep = h.runtime.handleAlarm({ name: 'kiditem-coupang-catalog-import-step' }, h.dependencies);
  await new Promise(setImmediate);
  const status = await h.runtime.getStatus(attemptId, h.dependencies);

  assert.equal(status.active, true);
  assert.deepEqual(h.calls.keepAlive, { starts: 1, releases: 0, active: 1 });
  gate.resolve({ url: listUrl });
  await alarmStep;
  assert.deepEqual(h.calls.keepAlive, { starts: 1, releases: 1, active: 0 });
});

test('keepalive releases after a completed step and after a handled step error', async (t) => {
  await t.test('completion releases before the next alarm', async () => {
    const records = [{ externalProductId: '1', registeredName: '상품' }];
    const h = harness({
      initial: { phase: 'discovery', currentPage: 0, discoveryItems: [], discoveredProducts: 0 },
      discovery: () => ({ success: true, records, totalItems: 1, pageSize: 50 }),
    });

    await h.step();
    assert.deepEqual(h.calls.keepAlive, { starts: 1, releases: 1, active: 0 });
    assert.equal(h.storage[stateKey].status, 'running');
    await h.step();
    assert.deepEqual(h.calls.keepAlive, { starts: 2, releases: 2, active: 0 });
  });

  await t.test('handled errors release the finite hold', async () => {
    const h = harness({
      initial: { phase: 'discovery', currentPage: 0, discoveryItems: [], discoveredProducts: 0 },
      discovery: () => { throw new Error('Wing discovery failed'); },
    });

    await h.step();
    assert.deepEqual(h.calls.keepAlive, { starts: 1, releases: 1, active: 0 });
    assert.equal(h.storage[stateKey].status, 'error');
  });
});

test('recovery leaves a stored import alone while a start holds the browser turn', async () => {
  const holderCheck = Promise.withResolvers();
  let reads = 0;
  const h = harness({
    permit: basicsPermit,
    async read() {
      reads += 1;
      // The start's check of the stored import is still waiting for the owner.
      if (reads === 1) await holderCheck.promise;
      return ownerResultFor(basicsPermit);
    },
  });
  await h.ready;
  const admitting = h.runtime.admit({
    producer: 'channels.coupang_catalog',
    idempotencyKey: '88888888-8888-4888-8888-888888888888',
    scope: { channelAccountId },
  }, h.dependencies);

  await h.runtime.recover(h.dependencies);

  assert.equal(reads, 1, 'recovery read nothing while the start held the turn');
  assert.deepEqual(h.calls.alarms, [], 'recovery scheduled no step');
  assert.equal(h.runtime.isContinuing(h.dependencies), false);
  holderCheck.resolve();
  assert.deepEqual({ ...await admitting }, { outcome: 'running', attemptId });
});

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

test('a failed replacement-window close keeps the old root discoverable for retry', async () => {
  const replacementPermit = {
    ...permit,
    attemptId: otherRunId,
    plan: { ...permit.plan },
  };
  let closeAttempts = 0;
  const events = [];
  const h = harness({
    closeWindow: async (id) => {
      events.push(`close:${id}`);
      closeAttempts += 1;
      return closeAttempts > 1;
    },
    initial: { permit, status: 'running' },
    read(path) {
      if (path.endsWith(`/${attemptId}`)) return ownerResult('COMPLETE');
      if (path.endsWith(`/${otherRunId}`)) return ownerResultFor(replacementPermit, 'RUNNING');
      throw new Error(`unexpected replacement retry request: ${path}`);
    },
  });
  await h.ready;
  const remove = h.dependencies.collectionSessions.remove.bind(h.dependencies.collectionSessions);
  h.dependencies.collectionSessions.remove = async (id) => {
    events.push(`remove:${id}`);
    return remove(id);
  };
  const start = h.dependencies.collectionSessions.start.bind(h.dependencies.collectionSessions);
  h.dependencies.collectionSessions.start = async (input) => {
    events.push(`start:${input.attemptId}`);
    return start(input);
  };

  await assert.rejects(
    h.runtime.start({ permit: replacementPermit }, h.dependencies),
    /기존 쿠팡 상품 수집 창을 닫지 못했습니다/,
  );
  assert.equal(h.storage[stateKey].attemptId, attemptId);
  assert.ok(await h.sessions.getOwned(attemptId, 'local'));
  assert.equal(await h.sessions.getOwned(otherRunId, 'local'), null);
  assert.deepEqual(events, [`close:${attemptId}`]);

  const resumed = await h.runtime.start({ permit: replacementPermit }, h.dependencies);
  assert.equal(resumed.started, true);
  assert.equal(h.storage[stateKey].attemptId, otherRunId);
  assert.equal(await h.sessions.getOwned(attemptId, 'local'), null);
  assert.ok(await h.sessions.getOwned(otherRunId, 'local'));
  assert.deepEqual(events, [
    `close:${attemptId}`,
    `close:${attemptId}`,
    `remove:${attemptId}`,
    `start:${otherRunId}`,
  ]);
});

test('catalog replacement accepts an already-closed production collection window', async () => {
  const replacementPermit = {
    ...permit,
    attemptId: otherRunId,
    plan: { ...permit.plan },
  };
  const h = harness({
    closeWindow: productionCloseWithoutStoredRecord(),
    initial: { permit, status: 'running' },
    read(path) {
      if (path.endsWith(`/${attemptId}`)) return ownerResult('COMPLETE');
      if (path.endsWith(`/${otherRunId}`)) return ownerResultFor(replacementPermit, 'RUNNING');
      throw new Error(`unexpected production-close request: ${path}`);
    },
  });

  const started = await h.runtime.start({ permit: replacementPermit }, h.dependencies);

  assert.equal(started.started, true);
  assert.equal(h.storage[stateKey].attemptId, otherRunId);
  assert.deepEqual(h.calls.closed, [attemptId]);
  assert.equal(await h.sessions.getOwned(attemptId, 'local'), null);
  assert.equal((await h.sessions.getOwned(otherRunId, 'local')).producer, 'channels.coupang_catalog');
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

test('discovery forwards each API page while reusing the managed tab for later pages and confirmation', async () => {
  const pageOne = Array.from({ length: 50 }, (_, i) => ({
    externalProductId: String(i + 1),
    registeredName: `상품 ${i + 1}`,
  }));
  const pageTwo = [{ externalProductId: '51', registeredName: '상품 51' }];
  const h = harness({
    initial: { phase: 'discovery', currentPage: 0, discoveryItems: [], discoveredProducts: 0 },
    discovery(message) {
      if (message.page === 1) return { success: true, records: pageOne, totalItems: 51, pageSize: 50 };
      if (message.page === 2) return { success: true, records: pageTwo, totalItems: 51, pageSize: 50 };
      throw new Error(`unexpected page ${message.page}`);
    },
  });

  await h.step();
  await h.step();
  await h.step();

  assert.deepEqual(h.calls.discoveryMessages.map((message) => message.page), [1, 2, 1]);
  assert.ok(h.calls.discoveryMessages.every((message) => message.expectedVendorId === permit.plan.vendorId));
  assert.deepEqual(h.calls.navigation.map((entry) => entry.url), [listUrl]);
  assert.deepEqual(h.calls.delays, [500]);
});

test('resumed discovery page uses a healthy owned list tab without navigating again', async () => {
  const records = Array.from({ length: 50 }, (_, i) => ({
    ordinal: i,
    externalProductId: String(i + 1),
    registeredName: `상품 ${i + 1}`,
  }));
  const h = harness({
    initial: {
      phase: 'discovery',
      currentPage: 1,
      manifest: { totalItems: 51, pageSize: 50, expectedPages: 2, firstPageFingerprint: 'a'.repeat(64) },
      discoveryItems: records,
      discoveredProducts: 50,
    },
    discovery(message) {
      assert.equal(message.page, 2);
      return { success: true, records: [{ externalProductId: '51', registeredName: '상품 51' }], totalItems: 51, pageSize: 50 };
    },
  });

  await h.step();

  assert.deepEqual(h.calls.navigation, []);
  assert.deepEqual(h.calls.discoveryMessages.map((message) => message.page), [2]);
  assert.equal(h.storage[stateKey].currentPage, 2);
});

test('manifest confirmation waits for a recreated owned tab before the API read', async () => {
  const pageOne = Array.from({ length: 50 }, (_, i) => ({
    externalProductId: String(i + 1),
    registeredName: `상품 ${i + 1}`,
  }));
  const h = harness({
    initial: { phase: 'discovery', currentPage: 0, discoveryItems: [], discoveredProducts: 0 },
    discovery(message) {
      if (message.page === 1) return { success: true, records: pageOne, totalItems: 51, pageSize: 50 };
      if (message.page === 2) return { success: true, records: [{ externalProductId: '51', registeredName: '상품 51' }], totalItems: 51, pageSize: 50 };
      throw new Error(`unexpected page ${message.page}`);
    },
  });

  await h.step();
  await h.step();
  h.setTab({ exists: false });
  await h.step();

  assert.deepEqual(h.calls.discoveryMessages.map((message) => message.page), [1, 2, 1]);
  assert.deepEqual(h.calls.navigation.map((entry) => entry.url), [listUrl]);
  assert.deepEqual(h.calls.delays, [500, 500]);
  assert.equal(h.storage[stateKey].phase, 'hydration');
});

test('a managed tab on the Wing login URL pauses instead of issuing an API request', async () => {
  const h = harness({
    initial: { phase: 'discovery', currentPage: 1,
      manifest: { totalItems: 51, pageSize: 50, expectedPages: 2, firstPageFingerprint: 'a'.repeat(64) },
      discoveryItems: [{ ordinal: 0, externalProductId: '1' }] },
    tab: { url: 'https://wing.coupang.com/user/login', status: 'complete' },
    discovery: () => { throw new Error('provider API must not be called while login is visible'); },
  });

  await h.step();

  assert.equal(h.calls.discoveryMessages.length, 0);
  assert.equal(h.storage[stateKey].status, 'error');
  const failure = h.calls.requests.find((request) => request.path.endsWith('/fail'));
  assert.equal(JSON.parse(failure.body).code, 'MARKETPLACE_LOGIN_REQUIRED');
});

test('a resumed discovery page repairs a managed tab on another URL before the API read', async () => {
  const h = harness({
    initial: { phase: 'discovery', currentPage: 1,
      manifest: { totalItems: 51, pageSize: 50, expectedPages: 2, firstPageFingerprint: 'a'.repeat(64) },
      discoveryItems: [{ ordinal: 0, externalProductId: '1' }] },
    tab: { url: 'https://wing.coupang.com/tenants/seller-web/vendor-inventory/modify', status: 'complete' },
    discovery: (message) => {
      assert.equal(message.page, 2);
      return { success: true, records: [{ externalProductId: '51', registeredName: '상품 51' }], totalItems: 51, pageSize: 50 };
    },
  });

  await h.step();

  assert.deepEqual(h.calls.navigation.map((entry) => entry.url), [listUrl]);
  assert.deepEqual(h.calls.discoveryMessages.map((message) => message.page), [2]);
  assert.equal(h.storage[stateKey].currentPage, 2);
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

test('a finalize 503 stops the retry fence before a second owner mutation', async () => {
  let h;
  h = harness({
    finalize: async () => {
      await h.sessions.requestCancellation(attemptId, 'local');
      return { httpStatus: 503, message: 'owner temporarily unavailable' };
    },
  });

  await h.step();

  assert.equal(h.calls.requests.filter(request => request.path.endsWith('/finalize')).length, 1);
  assert.equal(h.calls.requests.some(request => request.path.endsWith('/fail')), false);
  assert.deepEqual(h.storage[stateKey].pendingTerminal, {
    kind: 'finalize',
    body: { snapshotHash: 'a'.repeat(64) },
  });
  assert.notEqual(await h.sessions.getOwned(attemptId, 'local'), null);
});

function streamResponse(html, { url, status = 200, contentLength = undefined } = {}) {
  const bytes = new TextEncoder().encode(html);
  let read = false;
  return {
    ok: status >= 200 && status < 300,
    status,
    url: url || listUrl,
    headers: {
      get(name) {
        if (name.toLowerCase() !== 'content-length') return null;
        return contentLength === null ? null : String(contentLength ?? bytes.byteLength);
      },
    },
    body: {
      getReader() {
        return {
          async read() {
            if (read) return { done: true, value: undefined };
            read = true;
            return { done: false, value: bytes };
          },
          async cancel() {},
        };
      },
    },
    async text() { return html; },
  };
}

function runSerializedDetailFunction(input, fetchImpl) {
  return vm.runInNewContext(
    `(${input.func.toString()})(...args)`,
    {
      args: input.args,
      fetch: fetchImpl,
      AbortController,
      TextDecoder,
      TextEncoder,
      URL,
      setTimeout,
      clearTimeout,
    },
  );
}

function stagedBasicProduct(id = '1') {
  return {
    externalProductId: id,
    registeredName: `상품 ${id}`,
    displayName: `상품 ${id}`,
    category: null,
    manufacturer: null,
    brand: null,
    productStatus: 'ON_SALE',
    saleStatus: '판매중',
    options: [{
      externalOptionId: `${id}-option`,
      optionName: '단품',
      skuStatus: 'APPROVED',
      salePrice: 100,
      sellerSku: null,
      modelNumber: null,
      barcode: null,
      stock: null,
      stockQuantity: null,
      vendorInventoryItemId: `${id}-item`,
      vendorItemId: null,
      skuId: null,
      externalSkuCode: null,
      soldOut: false,
      attributes: [],
      media: [],
      raw: { vendorInventoryItemId: `${id}-item`, vendorItemId: null },
    }],
    media: [],
    raw: { source: 'wing_inventory_list', vendorInventoryId: id },
  };
}

function jsonStreamResponse(value, { url, status = 200, retryAfter = null } = {}) {
  const body = JSON.stringify(value);
  const bytes = new TextEncoder().encode(body);
  let read = false;
  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    headers: {
      get(name) {
        const key = name.toLowerCase();
        if (key === 'content-length') return String(bytes.byteLength);
        if (key === 'retry-after') return retryAfter;
        return null;
      },
    },
    body: {
      getReader() {
        return {
          async read() {
            if (read) return { done: true, value: undefined };
            read = true;
            return { done: false, value: bytes };
          },
          async cancel() {},
        };
      },
    },
    async text() { return body; },
  };
}

async function runJsonTransport({
  externalProductId = '1',
  responseFor,
  configureInput,
  timeoutMs,
  maxJsonBytes,
} = {}) {
  const selectedPermit = {
    ...detailsPermit,
    plan: { ...detailsPermit.plan, basicProductIds: [externalProductId] },
  };
  let serializedResult;
  let fetchRequest;
  const read = () => ownerResultFor(selectedPermit, 'RUNNING', {
    phase: 'hydration',
    missing: { productIds: [externalProductId] },
    progress: { hydratedProducts: 0, discoveredProducts: 1, storedChunks: 0 },
  });
  const h = harness({
    permit: selectedPermit,
    initial: {
      phase: 'hydration',
      manifest: { totalItems: 1, pageSize: 500, expectedPages: 1 },
      discoveryItems: [{ ordinal: 0, externalProductId }],
      discoveredProducts: 1,
      hydratedProducts: 0,
      uploadedChunks: 0,
    },
    read,
    fail: () => ownerResultFor(selectedPermit, 'FAILED', {
      error: { code: 'browser_collection_failed', message: 'transport rejected' },
    }),
    chunk: () => ownerResultFor(selectedPermit, 'RUNNING', {
      phase: 'ready_to_finalize',
      missing: { productIds: [] },
      progress: { hydratedProducts: 1, discoveredProducts: 1, storedChunks: 1 },
    }),
    extract(input) {
      if (timeoutMs !== undefined) input.args[0].timeoutMs = timeoutMs;
      if (maxJsonBytes !== undefined) input.args[0].maxJsonBytes = maxJsonBytes;
      configureInput?.(input);
      return runSerializedDetailFunction(input, async (url, options) => {
        fetchRequest = { url, options };
        return responseFor(url, options, input);
      }).then((result) => {
        serializedResult = result;
        return [{ result }];
      });
    },
  });
  await h.step();
  return { h, result: serializedResult, fetchRequest };
}

test('staged JSON transport honors Retry-After seconds, HTTP dates, and the 60-second fallback', async (t) => {
  const cases = [
    {
      name: 'positive seconds',
      retryAfter: '7',
      assertNextAllowedAt(value, startedAt) {
        const delayMs = Date.parse(value) - startedAt;
        assert.ok(delayMs >= 6_000 && delayMs <= 8_000, `unexpected delay: ${delayMs}`);
      },
    },
    {
      name: 'HTTP date',
      retryAfter: new Date(Date.now() + 20_000).toUTCString(),
      assertNextAllowedAt(value, _startedAt, retryAfter) {
        assert.equal(value, new Date(Date.parse(retryAfter)).toISOString());
      },
    },
    {
      name: 'invalid value',
      retryAfter: 'not-a-date',
      assertNextAllowedAt(value, startedAt) {
        const delayMs = Date.parse(value) - startedAt;
        assert.ok(delayMs >= 59_000 && delayMs <= 61_000, `unexpected fallback: ${delayMs}`);
      },
    },
    {
      name: 'missing value',
      retryAfter: null,
      assertNextAllowedAt(value, startedAt) {
        const delayMs = Date.parse(value) - startedAt;
        assert.ok(delayMs >= 59_000 && delayMs <= 61_000, `unexpected fallback: ${delayMs}`);
      },
    },
  ];
  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      const startedAt = Date.now();
      const { h, result, fetchRequest } = await runJsonTransport({
        responseFor: (url) => jsonStreamResponse({}, {
          url,
          status: 429,
          retryAfter: scenario.retryAfter,
        }),
      });
      assert.equal(result.kind, 'rate_limited');
      assert.equal(fetchRequest.options.method, 'GET');
      assert.equal(fetchRequest.options.redirect, 'manual');
      scenario.assertNextAllowedAt(result.nextAllowedAt, startedAt, scenario.retryAfter);
      assert.equal(h.storage[stateKey].nextAllowedAt, result.nextAllowedAt);
      assert.equal(h.calls.requests.some((request) => request.path.endsWith('/fail')), false);
    });
  }
});

test('staged JSON transport cancels a stalled body on timeout and cancels an oversized stream before another read', async (t) => {
  await t.test('stalled body', async () => {
    let aborted = false;
    let cancelled = false;
    let rejectRead;
    const { h, result } = await runJsonTransport({
      timeoutMs: 5,
      responseFor: (_url, options) => {
        options.signal.addEventListener('abort', () => { aborted = true; }, { once: true });
        return {
          ok: true,
          status: 200,
          url: stagedDetailUrl + '/1',
          headers: { get() { return null; } },
          body: {
            getReader() {
              return {
                read() {
                  return new Promise((_resolve, reject) => { rejectRead = reject; });
                },
                async cancel() {
                  cancelled = true;
                  rejectRead?.(Object.assign(new Error('aborted'), { name: 'AbortError' }));
                },
              };
            },
          },
        };
      },
    });
    assert.equal(result.kind, 'timeout');
    assert.equal(aborted, true);
    assert.equal(cancelled, true);
    assert.ok(h.calls.requests.some((request) => request.path.endsWith('/fail')));
  });

  await t.test('oversized stream', async () => {
    let cancelled = false;
    let reads = 0;
    const { h, result } = await runJsonTransport({
      maxJsonBytes: 4,
      responseFor: (url) => {
        const bytes = new TextEncoder().encode('12345');
        return {
          ok: true,
          status: 200,
          url,
          headers: { get() { return null; } },
          body: {
            getReader() {
              return {
                async read() {
                  reads += 1;
                  return reads === 1
                    ? { done: false, value: bytes }
                    : { done: true, value: undefined };
                },
                async cancel() { cancelled = true; },
              };
            },
          },
        };
      },
    });
    assert.equal(result.kind, 'too_large');
    assert.equal(cancelled, true);
    assert.equal(reads, 1);
    assert.ok(h.calls.requests.some((request) => request.path.endsWith('/fail')));
  });
});

test('staged JSON transport rejects a wrong seller product and a response from a different origin', async (t) => {
  await t.test('wrong product id', async () => {
    const { h, result } = await runJsonTransport({
      responseFor: (url) => jsonStreamResponse({ sellerProductId: 999, items: [] }, { url }),
    });
    assert.equal(result.kind, 'missing_model');
    assert.ok(h.calls.requests.some((request) => request.path.endsWith('/fail')));
  });

  await t.test('redirect-origin response', async () => {
    const { h, result } = await runJsonTransport({
      responseFor: () => jsonStreamResponse({ sellerProductId: 1, items: [] }, {
        url: 'https://evil.example/tenants/seller-web/v2/vendor-inventory/seller-product/1',
      }),
    });
    assert.equal(result.kind, 'error');
    assert.match(result.message, /URL/);
    assert.ok(h.calls.requests.some((request) => request.path.endsWith('/fail')));
  });
});

test('basics stage uploads listing_basics chunks from the exact 500-row response and never hydrates HTML details', async () => {
  let manifest = null;
  let completed = false;
  const chunks = [];
  const status = (state = 'RUNNING', overrides = {}) => ownerResultFor(basicsPermit, state, {
    manifest,
    phase: state === 'COMPLETE' ? 'finished' : completed ? 'ready_to_finalize' : 'hydration',
    progress: { hydratedProducts: 1, discoveredProducts: 1, storedChunks: chunks.length },
    missing: { productIds: [] },
    ...overrides,
  });
  const h = harness({
    permit: basicsPermit,
    initial: { phase: 'discovery', currentPage: 0, discoveryItems: [], discoveredProducts: 0, hydratedProducts: 0, uploadedChunks: 0 },
    read: () => status(),
    finalize: () => status('COMPLETE', { publication: { sourceImportRunId: basicsPermit.attemptId } }),
    chunk(init) {
      const body = JSON.parse(init.body);
      chunks.push(body);
      if (body.kind === 'discovery_page') manifest = body.payload.manifest;
      if (body.kind === 'manifest_confirmation') completed = true;
      return status();
    },
    discovery: () => ({
      success: true,
      page: 1,
      pageSize: 500,
      totalItems: 1,
      totalPages: 1,
      records: [{ externalProductId: '1', registeredName: '상품 1' }],
      basicProducts: [stagedBasicProduct('1')],
    }),
    extract() { throw new Error('basics stage must not fetch product details'); },
  });

  await h.step();
  await h.step();
  await h.step();

  assert.deepEqual(chunks.map((chunk) => chunk.kind), [
    'discovery_page', 'listing_basics', 'manifest_confirmation',
  ]);
  assert.equal(chunks[1].payload.products[0].product.externalProductId, '1');
  assert.equal(h.calls.extraction, 0);
  assert.equal(h.storage[stateKey].status, 'done');
});

test('details stage confirms its pinned basics basis, fetches the JSON seller-product route, and uploads full_details', async () => {
  let manifest = null;
  let confirmed = false;
  let detailed = false;
  const chunks = [];
  const status = (state = 'RUNNING', overrides = {}) => ownerResultFor(detailsPermit, state, {
    manifest,
    phase: state === 'COMPLETE' ? 'finished' : detailed ? 'ready_to_finalize' : 'hydration',
    progress: { hydratedProducts: detailed ? 1 : 0, discoveredProducts: 1, storedChunks: chunks.length },
    missing: { productIds: detailed ? [] : ['1'] },
    ...overrides,
  });
  let detailUrl = null;
  const h = harness({
    permit: detailsPermit,
    initial: { phase: 'discovery', currentPage: 0, discoveryItems: [], discoveredProducts: 0, hydratedProducts: 0, uploadedChunks: 0 },
    read: () => status(),
    finalize: () => status('COMPLETE', { publication: { sourceImportRunId: detailsPermit.attemptId } }),
    chunk(init) {
      const body = JSON.parse(init.body);
      chunks.push(body);
      if (body.kind === 'discovery_page') manifest = body.payload.manifest;
      if (body.kind === 'detail_manifest_confirmation') confirmed = true;
      if (body.kind === 'full_details') detailed = true;
      return status();
    },
    discovery: () => ({
      success: true,
      page: 1,
      pageSize: 500,
      totalItems: 1,
      totalPages: 1,
      records: [{ externalProductId: '1', registeredName: '상품 1' }],
    }),
    extract(input) {
      detailUrl = input.args[0].detailUrl;
      const product = {
        sellerProductId: 1,
        sellerProductName: '상품 1',
        items: [{
          sellerProductItemId: 11,
          vendorItemId: null,
          externalVendorSku: 'SKU-1',
          barcode: '8800000000001',
          modelNo: 'MODEL-1',
          notices: null,
          searchTags: ['완구'],
          images: [{ imageType: 'REPRESENTATION', cdnPath: 'vendor_inventory/1.jpg' }],
        }],
      };
      return runSerializedDetailFunction(input, async () => jsonStreamResponse(product, {
        url: input.args[0].detailUrl,
      })).then((result) => [{ result }]);
    },
  });

  await h.step();
  await h.step();
  await h.step();
  await h.step();

  assert.equal(confirmed, true);
  assert.equal(detailUrl, `${stagedDetailUrl}/1`);
  assert.deepEqual(chunks.map((chunk) => chunk.kind), [
    'discovery_page', 'detail_manifest_confirmation', 'full_details',
  ]);
  assert.equal(chunks[2].payload.products[0].product.options[0].externalVendorSku, 'SKU-1');
  assert.equal(chunks[2].payload.products[0].product.options[0].sellerSku, undefined);
  assert.equal(h.storage[stateKey].status, 'done');
});

test('basics completion hands off to one preallocated details owner after a lost child acknowledgement', async () => {
  let childStartRequests = 0;
  const h = harness({
    permit: chainBasicsPermit,
    initial: { rootAttemptId: attemptId, currentAttemptId: attemptId, currentStage: 'basics' },
    read(path, init) {
      if (init?.method === 'POST' && path.endsWith('/attempts')) {
        childStartRequests += 1;
        if (childStartRequests === 1) throw new Error('child acknowledgement lost');
        return chainDetailsPermit;
      }
      if (path.endsWith(`/${attemptId}`)) return chainOwnerResult(chainBasicsPermit, 'COMPLETE');
      if (path.endsWith(`/${detailsAttemptId}`)) return chainOwnerResult(chainDetailsPermit, 'RUNNING');
      throw new Error(`unexpected chain request: ${path}`);
    },
  });

  await h.step();

  assert.equal(childStartRequests, 2);
  assert.equal(h.storage[stateKey].attemptId, detailsAttemptId);
  assert.equal(h.storage[stateKey].rootAttemptId, attemptId);
  assert.equal(h.storage[stateKey].currentStage, 'details');
  const childRequests = h.calls.requests.filter((request) =>
    request.method === 'POST' && request.path.endsWith('/attempts'));
  assert.equal(childRequests.length, 2);
  assert.ok(childRequests.every((request) => request.headers['Idempotency-Key'] === detailsIdempotencyKey));
  const status = await h.runtime.getStatus(attemptId, h.dependencies);
  assert.deepEqual({
    attemptId: status.attemptId,
    rootAttemptId: status.rootAttemptId,
    currentAttemptId: status.currentAttemptId,
    currentStage: status.currentStage,
  }, {
    attemptId,
    rootAttemptId: attemptId,
    currentAttemptId: detailsAttemptId,
    currentStage: 'details',
  });
  assert.equal(JSON.stringify(status).includes(detailsAttemptToken), false);
});

test('a definitive details basis conflict settles the no-child chain without retrying forever', async () => {
  let admissionRequests = 0;
  const h = harness({
    permit: chainBasicsPermit,
    initial: { rootAttemptId: attemptId, currentAttemptId: attemptId, currentStage: 'basics' },
    read(path, init) {
      if (init?.method === 'POST' && path.endsWith('/attempts')) {
        admissionRequests += 1;
        return { httpStatus: 409, message: 'completed basics basis no longer matches' };
      }
      if (path.endsWith(`/${attemptId}`)) return chainOwnerResult(chainBasicsPermit, 'COMPLETE');
      throw new Error(`unexpected basis-conflict request: ${path}`);
    },
  });

  await h.step();

  assert.equal(admissionRequests, 1);
  assert.equal(h.storage[stateKey].status, 'done');
  assert.equal(h.storage[stateKey].chainPhase, 'handoff_rejected');
  assert.match(h.storage[stateKey].error, /completed basics basis/);
  assert.deepEqual(h.calls.closed, [attemptId]);
  assert.equal(await h.sessions.getOwned(attemptId, 'local'), null);
  assert.equal(h.calls.requests.some((request) => request.path.endsWith('/fail')), false);

  // The rejection is definitive: clearing the alarm must not turn it into a
  // repeated child-admission loop while the root row remains COMPLETE.
  await h.step();
  assert.equal(admissionRequests, 1);
});

test('a network status 0 keeps the details child key durable for retry', async () => {
  let admissionRequests = 0;
  const h = harness({
    permit: chainBasicsPermit,
    initial: { rootAttemptId: attemptId, currentAttemptId: attemptId, currentStage: 'basics' },
    read(path, init) {
      if (init?.method === 'POST' && path.endsWith('/attempts')) {
        admissionRequests += 1;
        return { httpStatus: 0, message: 'network response unavailable' };
      }
      if (path.endsWith(`/${attemptId}`)) return chainOwnerResult(chainBasicsPermit, 'COMPLETE');
      throw new Error(`unexpected status-0 request: ${path}`);
    },
  });

  await h.step();

  assert.equal(admissionRequests, 3);
  assert.equal(h.storage[stateKey].status, 'running');
  assert.equal(h.storage[stateKey].chainPhase, 'admitting_details');
  assert.deepEqual(h.storage[stateKey].pendingChildAdmission, {
    idempotencyKey: detailsIdempotencyKey,
    expectedBasicAttemptId: attemptId,
  });
  assert.deepEqual(h.calls.closed, []);
  assert.ok(await h.sessions.getOwned(attemptId, 'local'));
});

test('a restart during details admission reuses the same child key and does not create another child', async () => {
  let firstStartRequests = 0;
  const first = harness({
    permit: chainBasicsPermit,
    initial: { rootAttemptId: attemptId, currentAttemptId: attemptId, currentStage: 'basics' },
    read(path, init) {
      if (init?.method === 'POST' && path.endsWith('/attempts')) {
        firstStartRequests += 1;
        throw new Error('details owner response unavailable');
      }
      if (path.endsWith(`/${attemptId}`)) return chainOwnerResult(chainBasicsPermit, 'COMPLETE');
      throw new Error(`unexpected chain request: ${path}`);
    },
  });
  await first.step();
  assert.equal(firstStartRequests, 3);
  assert.equal(first.storage[stateKey].attemptId, attemptId);
  assert.equal(first.storage[stateKey].chainPhase, 'admitting_details');

  let resumedStartRequests = 0;
  const resumed = harness({
    permit: chainBasicsPermit,
    storage: first.storage,
    read(path, init) {
      if (init?.method === 'POST' && path.endsWith('/attempts')) {
        resumedStartRequests += 1;
        return chainDetailsPermit;
      }
      if (path.endsWith(`/${attemptId}`)) return chainOwnerResult(chainBasicsPermit, 'COMPLETE');
      if (path.endsWith(`/${detailsAttemptId}`)) return chainOwnerResult(chainDetailsPermit, 'RUNNING');
      throw new Error(`unexpected resumed chain request: ${path}`);
    },
  });
  await resumed.step();

  assert.equal(resumedStartRequests, 1);
  assert.equal(resumed.storage[stateKey].attemptId, detailsAttemptId);
  assert.equal(resumed.storage[stateKey].rootAttemptId, attemptId);
  assert.equal(resumed.calls.requests.filter((request) => request.method === 'POST' && request.path.endsWith('/attempts'))[0]
    .headers['Idempotency-Key'], detailsIdempotencyKey);
});

test('a malformed details admission ACK keeps the child key durable for replay', async () => {
  let admissionRequests = 0;
  const h = harness({
    permit: chainBasicsPermit,
    initial: { rootAttemptId: attemptId, currentAttemptId: attemptId, currentStage: 'basics' },
    read(path, init) {
      if (init?.method === 'POST' && path.endsWith('/attempts')) {
        admissionRequests += 1;
        return admissionRequests === 1
          ? { ...chainDetailsPermit, attemptToken: 'malformed-child-token' }
          : chainDetailsPermit;
      }
      if (path.endsWith(`/${attemptId}`)) return chainOwnerResult(chainBasicsPermit, 'COMPLETE');
      if (path.endsWith(`/${detailsAttemptId}`)) return chainOwnerResult(chainDetailsPermit, 'RUNNING');
      throw new Error(`unexpected malformed-admission request: ${path}`);
    },
  });

  await h.step();

  assert.equal(admissionRequests, 1);
  assert.equal(h.storage[stateKey].status, 'running');
  assert.equal(h.storage[stateKey].chainPhase, 'admitting_details');
  assert.deepEqual(h.storage[stateKey].pendingChildAdmission, {
    idempotencyKey: detailsIdempotencyKey,
    expectedBasicAttemptId: attemptId,
  });
  assert.ok(await h.sessions.getOwned(attemptId, 'local'));
  assert.deepEqual(h.calls.closed, []);

  await h.step();

  assert.equal(admissionRequests, 2);
  assert.equal(h.storage[stateKey].attemptId, detailsAttemptId);
  assert.equal(h.storage[stateKey].chainPhase, 'details');
  assert.equal(h.storage[stateKey].pendingChildAdmission, undefined);
});

test('a stopped lost child admission is replayed before cleanup and then waits for child cancellation ACK', async () => {
  let admissionAvailable = false;
  let childFailureRequests = 0;
  const h = harness({
    permit: chainBasicsPermit,
    initial: { rootAttemptId: attemptId, currentAttemptId: attemptId, currentStage: 'basics' },
    fail() {
      childFailureRequests += 1;
      if (childFailureRequests <= 3) return { httpStatus: 503, message: 'temporary cancellation failure' };
      return chainOwnerResult(chainDetailsPermit, 'FAILED');
    },
    read(path, init) {
      if (init?.method === 'POST' && path.endsWith('/attempts')) {
        if (!admissionAvailable) throw new Error('child acknowledgement lost');
        return chainDetailsPermit;
      }
      if (path.endsWith(`/${attemptId}`)) return chainOwnerResult(chainBasicsPermit, 'COMPLETE');
      if (path.endsWith(`/${detailsAttemptId}`)) return chainOwnerResult(chainDetailsPermit, 'RUNNING');
      throw new Error(`unexpected durable-chain request: ${path}`);
    },
  });

  await h.step();
  assert.equal(h.storage[stateKey].chainPhase, 'admitting_details');
  assert.deepEqual(
    h.calls.requests.filter((request) => request.method === 'POST' && request.path.endsWith('/attempts'))
      .map((request) => request.headers['Idempotency-Key']),
    [detailsIdempotencyKey, detailsIdempotencyKey, detailsIdempotencyKey],
  );

  await h.runtime.cancel(attemptId, h.dependencies);
  assert.equal(h.storage[stateKey].status, 'running');
  assert.equal(h.storage[stateKey].chainStopRequested, true);
  assert.equal(h.storage[stateKey].pendingChildCancellation, undefined);
  assert.deepEqual(h.calls.closed, []);

  admissionAvailable = true;
  await h.step();

  assert.equal(childFailureRequests, 3);
  assert.equal(h.storage[stateKey].chainPhase, 'cancelling_details');
  assert.equal(h.storage[stateKey].pendingChildCancellation.attemptId, detailsAttemptId);
  assert.deepEqual(h.calls.closed, []);
  assert.equal(
    h.calls.requests.filter((request) => request.method === 'POST' && request.path.endsWith('/attempts'))
      .at(-1).headers['Idempotency-Key'],
    detailsIdempotencyKey,
  );

  await h.step();

  assert.equal(childFailureRequests, 4);
  assert.equal(h.storage[stateKey].status, 'done');
  assert.equal(h.storage[stateKey].chainPhase, 'stopped');
  assert.equal(h.storage[stateKey].pendingChildCancellation, undefined);
  assert.deepEqual(h.calls.closed, [attemptId]);
  assert.equal(await h.sessions.getOwned(attemptId, 'local'), null);
});

test('a stop observed after details admission cancels the child and closes the root session window', async () => {
  let childReturned = false;
  const h = harness({
    permit: chainBasicsPermit,
    initial: { rootAttemptId: attemptId, currentAttemptId: attemptId, currentStage: 'basics' },
    fail: () => chainOwnerResult(chainDetailsPermit, 'FAILED'),
    read(path, init) {
      if (init?.method === 'POST' && path.endsWith('/attempts')) {
        childReturned = true;
        return chainDetailsPermit;
      }
      if (path.endsWith(`/${attemptId}`)) return chainOwnerResult(chainBasicsPermit, 'COMPLETE');
      if (path.endsWith(`/${detailsAttemptId}`)) return chainOwnerResult(chainDetailsPermit, 'RUNNING');
      throw new Error(`unexpected stop-chain request: ${path}`);
    },
  });
  const isActive = h.dependencies.collectionSessions.isActive.bind(h.dependencies.collectionSessions);
  h.dependencies.collectionSessions.isActive = async (...args) =>
    childReturned ? false : isActive(...args);

  await h.step();

  assert.equal(childReturned, true);
  assert.equal(h.storage[stateKey].status, 'done');
  assert.equal(h.storage[stateKey].chainPhase, 'stopped');
  assert.deepEqual(h.calls.closed, [attemptId]);
  assert.equal(await h.sessions.getOwned(attemptId, 'local'), null);
  const childFailure = h.calls.requests.find((request) =>
    request.method === 'POST' && request.path.endsWith(`/${detailsAttemptId}/fail`));
  assert.ok(childFailure);
  assert.equal(JSON.parse(childFailure.body).code, 'USER_CANCELLED');
});

test('a failed child cancellation ACK keeps the child permit durable until the next retry', async () => {
  let childReturned = false;
  let childFailureRequests = 0;
  const h = harness({
    permit: chainBasicsPermit,
    initial: { rootAttemptId: attemptId, currentAttemptId: attemptId, currentStage: 'basics' },
    fail() {
      childFailureRequests += 1;
      if (childFailureRequests <= 3) return { httpStatus: 503, message: 'temporary cancellation failure' };
      return chainOwnerResult(chainDetailsPermit, 'FAILED');
    },
    read(path, init) {
      if (init?.method === 'POST' && path.endsWith('/attempts')) {
        childReturned = true;
        return chainDetailsPermit;
      }
      if (path.endsWith(`/${attemptId}`)) return chainOwnerResult(chainBasicsPermit, 'COMPLETE');
      if (path.endsWith(`/${detailsAttemptId}`)) return chainOwnerResult(chainDetailsPermit, 'RUNNING');
      throw new Error(`unexpected retry-chain request: ${path}`);
    },
  });
  const isActive = h.dependencies.collectionSessions.isActive.bind(h.dependencies.collectionSessions);
  h.dependencies.collectionSessions.isActive = async (...args) =>
    childReturned ? false : isActive(...args);

  await h.step();

  assert.equal(childFailureRequests, 3);
  assert.equal(h.storage[stateKey].status, 'running');
  assert.equal(h.storage[stateKey].chainPhase, 'cancelling_details');
  assert.equal(h.storage[stateKey].pendingChildCancellation.attemptId, detailsAttemptId);
  assert.deepEqual(h.calls.closed, []);
  assert.ok(await h.sessions.getOwned(attemptId, 'local'));

  await h.step();

  assert.equal(childFailureRequests, 4);
  assert.equal(h.storage[stateKey].status, 'done');
  assert.equal(h.storage[stateKey].chainPhase, 'stopped');
  assert.equal(h.storage[stateKey].pendingChildCancellation, undefined);
  assert.deepEqual(h.calls.closed, [attemptId]);
  assert.equal(await h.sessions.getOwned(attemptId, 'local'), null);
});

test('a restarted child cancellation re-admits the exact child without persisting its token', async () => {
  let first;
  let firstAdmissionRequests = 0;
  let firstFailureRequests = 0;
  first = harness({
    permit: chainBasicsPermit,
    initial: { rootAttemptId: attemptId, currentAttemptId: attemptId, currentStage: 'basics' },
    fail() {
      firstFailureRequests += 1;
      return firstFailureRequests <= 3
        ? { httpStatus: 503, message: 'temporary cancellation failure' }
        : chainOwnerResult(chainDetailsPermit, 'FAILED');
    },
    read(path, init) {
      if (init?.method === 'POST' && path.endsWith('/attempts')) {
        firstAdmissionRequests += 1;
        first.storage[stateKey].chainStopRequested = true;
        return chainDetailsPermit;
      }
      if (path.endsWith(`/${attemptId}`)) return chainOwnerResult(chainBasicsPermit, 'COMPLETE');
      if (path.endsWith(`/${detailsAttemptId}`)) return chainOwnerResult(chainDetailsPermit, 'RUNNING');
      throw new Error(`unexpected restarted-cancellation request: ${path}`);
    },
  });

  await first.step();

  assert.equal(firstAdmissionRequests, 1);
  assert.equal(firstFailureRequests, 3);
  assert.deepEqual(first.storage[stateKey].pendingChildCancellation, {
    attemptId: detailsAttemptId,
    rootAttemptId: attemptId,
    idempotencyKey: detailsIdempotencyKey,
    expectedBasicAttemptId: attemptId,
  });
  assert.equal(
    JSON.stringify(first.storage[stateKey].pendingChildCancellation).includes(detailsAttemptToken),
    false,
  );

  let resumedAdmissionRequests = 0;
  let resumedFailureRequests = 0;
  const resumed = harness({
    permit: chainBasicsPermit,
    storage: first.storage,
    fail() {
      resumedFailureRequests += 1;
      return chainOwnerResult(chainDetailsPermit, 'FAILED');
    },
    read(path, init) {
      if (init?.method === 'POST' && path.endsWith('/attempts')) {
        resumedAdmissionRequests += 1;
        return chainDetailsPermit;
      }
      if (path.endsWith(`/${attemptId}`)) return chainOwnerResult(chainBasicsPermit, 'COMPLETE');
      if (path.endsWith(`/${detailsAttemptId}`)) return chainOwnerResult(chainDetailsPermit, 'RUNNING');
      throw new Error(`unexpected resumed-cancellation request: ${path}`);
    },
  });

  await resumed.step();

  assert.equal(resumedAdmissionRequests, 1);
  assert.equal(resumedFailureRequests, 1);
  assert.equal(resumed.storage[stateKey].pendingChildCancellation, undefined);
  assert.equal(resumed.storage[stateKey].chainPhase, 'stopped');
  assert.deepEqual(resumed.calls.closed, [attemptId]);
  assert.equal(await resumed.sessions.getOwned(attemptId, 'local'), null);
  assert.equal(
    resumed.calls.requests.some((request) =>
      request.method === 'POST' && request.path.endsWith('/attempts') &&
      request.headers['Idempotency-Key'] === detailsIdempotencyKey),
    true,
  );
  assert.deepEqual(resumed.calls.navigation, []);
});

test('a rejected pending-child replay retains the cancellation fence until the child is proven terminal', async () => {
  let first;
  let firstFailureRequests = 0;
  first = harness({
    permit: chainBasicsPermit,
    initial: { rootAttemptId: attemptId, currentAttemptId: attemptId, currentStage: 'basics' },
    fail() {
      firstFailureRequests += 1;
      return { httpStatus: 503, message: 'temporary cancellation failure' };
    },
    read(path, init) {
      if (init?.method === 'POST' && path.endsWith('/attempts')) {
        first.storage[stateKey].chainStopRequested = true;
        return chainDetailsPermit;
      }
      if (path.endsWith(`/${attemptId}`)) return chainOwnerResult(chainBasicsPermit, 'COMPLETE');
      if (path.endsWith(`/${detailsAttemptId}`)) return chainOwnerResult(chainDetailsPermit, 'RUNNING');
      throw new Error(`unexpected rejected-replay request: ${path}`);
    },
  });

  await first.step();

  assert.equal(firstFailureRequests, 3);
  const pending = structuredClone(first.storage[stateKey].pendingChildCancellation);
  assert.equal(pending.attemptId, detailsAttemptId);

  const resumed = harness({
    permit: chainBasicsPermit,
    storage: first.storage,
    fail() {
      throw new Error('known child must not be cancelled without a reconstructed permit');
    },
    read(path, init) {
      if (init?.method === 'POST' && path.endsWith('/attempts')) {
        return { httpStatus: 409, message: 'child admission temporarily unavailable' };
      }
      if (path.endsWith(`/${attemptId}`)) return chainOwnerResult(chainBasicsPermit, 'COMPLETE');
      if (path.endsWith(`/${detailsAttemptId}`)) return chainOwnerResult(chainDetailsPermit, 'RUNNING');
      throw new Error(`unexpected rejected-replay request: ${path}`);
    },
  });

  await resumed.step();

  assert.equal(resumed.storage[stateKey].status, 'running');
  assert.equal(resumed.storage[stateKey].chainPhase, 'cancelling_details');
  assert.deepEqual(resumed.storage[stateKey].pendingChildCancellation, pending);
  assert.equal(resumed.storage[stateKey].pendingTerminal, undefined);
  assert.ok(await resumed.sessions.getOwned(attemptId, 'local'));
  assert.equal(resumed.calls.requests.some((request) => request.path.endsWith('/fail')), false);
  assert.deepEqual(resumed.calls.navigation, []);
});

test('a child COMPLETE conflict is reconciled before the stopped root is cleaned up', async () => {
  let childReturned = false;
  let childFailureRequests = 0;
  const h = harness({
    permit: chainBasicsPermit,
    initial: { rootAttemptId: attemptId, currentAttemptId: attemptId, currentStage: 'basics' },
    fail() {
      childFailureRequests += 1;
      return { httpStatus: 409, message: 'details owner is already complete' };
    },
    read(path, init) {
      if (init?.method === 'POST' && path.endsWith('/attempts')) {
        childReturned = true;
        return chainDetailsPermit;
      }
      if (path.endsWith(`/${attemptId}`)) return chainOwnerResult(chainBasicsPermit, 'COMPLETE');
      if (path.endsWith(`/${detailsAttemptId}`)) return chainOwnerResult(chainDetailsPermit, 'COMPLETE');
      throw new Error(`unexpected complete-child request: ${path}`);
    },
  });
  const isActive = h.dependencies.collectionSessions.isActive.bind(h.dependencies.collectionSessions);
  h.dependencies.collectionSessions.isActive = async (...args) =>
    childReturned ? false : isActive(...args);

  await h.step();

  assert.equal(childFailureRequests, 1);
  assert.equal(h.storage[stateKey].status, 'done');
  assert.equal(h.storage[stateKey].chainPhase, 'stopped');
  assert.equal(h.storage[stateKey].pendingChildCancellation, undefined);
  assert.deepEqual(h.calls.closed, [attemptId]);
  assert.equal(await h.sessions.getOwned(attemptId, 'local'), null);
  assert.ok(h.calls.requests.some((request) =>
    request.method === 'GET' && request.path.endsWith(`/${detailsAttemptId}`)));
});

test('a malformed child cancellation ACK remains durable until a valid retry', async () => {
  let childReturned = false;
  let childFailureRequests = 0;
  const h = harness({
    permit: chainBasicsPermit,
    initial: { rootAttemptId: attemptId, currentAttemptId: attemptId, currentStage: 'basics' },
    fail() {
      childFailureRequests += 1;
      if (childFailureRequests === 1) return { attemptId: detailsAttemptId, state: 'FAILED' };
      return chainOwnerResult(chainDetailsPermit, 'FAILED');
    },
    read(path, init) {
      if (init?.method === 'POST' && path.endsWith('/attempts')) {
        childReturned = true;
        return chainDetailsPermit;
      }
      if (path.endsWith(`/${attemptId}`)) return chainOwnerResult(chainBasicsPermit, 'COMPLETE');
      if (path.endsWith(`/${detailsAttemptId}`)) return chainOwnerResult(chainDetailsPermit, 'RUNNING');
      throw new Error(`unexpected malformed-ACK request: ${path}`);
    },
  });
  const isActive = h.dependencies.collectionSessions.isActive.bind(h.dependencies.collectionSessions);
  h.dependencies.collectionSessions.isActive = async (...args) =>
    childReturned ? false : isActive(...args);

  await h.step();

  assert.equal(childFailureRequests, 1);
  assert.equal(h.storage[stateKey].status, 'running');
  assert.equal(h.storage[stateKey].chainPhase, 'cancelling_details');
  assert.equal(h.storage[stateKey].pendingChildCancellation.attemptId, detailsAttemptId);
  assert.deepEqual(h.calls.closed, []);

  await h.step();

  assert.equal(childFailureRequests, 2);
  assert.equal(h.storage[stateKey].status, 'done');
  assert.equal(h.storage[stateKey].chainPhase, 'stopped');
  assert.equal(h.storage[stateKey].pendingChildCancellation, undefined);
  assert.deepEqual(h.calls.closed, [attemptId]);
  assert.equal(await h.sessions.getOwned(attemptId, 'local'), null);
});

test('a stopped chain retains its owner session when managed-window close fails', async () => {
  let childReturned = false;
  let closeAttempts = 0;
  const h = harness({
    permit: chainBasicsPermit,
    closeWindow: async () => {
      closeAttempts += 1;
      return closeAttempts > 1;
    },
    initial: { rootAttemptId: attemptId, currentAttemptId: attemptId, currentStage: 'basics' },
    fail: () => chainOwnerResult(chainDetailsPermit, 'FAILED'),
    read(path, init) {
      if (init?.method === 'POST' && path.endsWith('/attempts')) {
        childReturned = true;
        return chainDetailsPermit;
      }
      if (path.endsWith(`/${attemptId}`)) return chainOwnerResult(chainBasicsPermit, 'COMPLETE');
      if (path.endsWith(`/${detailsAttemptId}`)) return chainOwnerResult(chainDetailsPermit, 'RUNNING');
      throw new Error(`unexpected close-failure request: ${path}`);
    },
  });
  const isActive = h.dependencies.collectionSessions.isActive.bind(h.dependencies.collectionSessions);
  h.dependencies.collectionSessions.isActive = async (...args) =>
    childReturned ? false : isActive(...args);

  await h.step();

  assert.equal(closeAttempts, 1);
  assert.equal(h.storage[stateKey].status, 'done');
  assert.equal(h.storage[stateKey].chainPhase, 'stopped');
  assert.deepEqual(h.calls.closed, [attemptId]);
  assert.ok(await h.sessions.getOwned(attemptId, 'local'));

  await h.runtime.cancel(attemptId, h.dependencies);

  assert.equal(closeAttempts, 2);
  assert.deepEqual(h.calls.closed, [attemptId, attemptId]);
  assert.equal(await h.sessions.getOwned(attemptId, 'local'), null);
});

test('a rate-limit pause truncates a long provider diagnostic to the owner pause wire limit', async () => {
  const longMessage = `provider diagnostic ${'x'.repeat(1_500)}`;
  let manifest = null;
  const status = (state = 'RUNNING', overrides = {}) => ownerResultFor(detailsPermit, state, {
    manifest,
    phase: 'hydration',
    progress: { hydratedProducts: 0, discoveredProducts: 1, storedChunks: 0 },
    missing: { productIds: ['1'] },
    ...overrides,
  });
  const h = harness({
    permit: detailsPermit,
    initial: { phase: 'discovery', currentPage: 0, discoveryItems: [], discoveredProducts: 0, hydratedProducts: 0, uploadedChunks: 0 },
    read: () => status(),
    chunk(init) {
      const body = JSON.parse(init.body);
      if (body.kind === 'discovery_page') manifest = body.payload.manifest;
      return status();
    },
    discovery: () => ({
      success: true, page: 1, pageSize: 500, totalItems: 1, totalPages: 1,
      records: [{ externalProductId: '1', registeredName: '상품 1' }],
    }),
    extract() {
      return Promise.resolve([{
        result: {
          kind: 'rate_limited',
          nextAllowedAt: '2030-01-02T00:00:00.000Z',
          message: longMessage,
        },
      }]);
    },
  });

  await h.step();
  await h.step();
  await h.step();

  const pauseRequest = h.calls.requests.find((request) => request.path.endsWith('/pause'));
  assert.ok(pauseRequest);
  const body = JSON.parse(pauseRequest.body);
  assert.equal(body.message, longMessage.slice(0, 1_000));
  assert.equal(body.message.length, 1_000);
  assert.equal(body.code, 'WING_PROVIDER_RATE_LIMITED');
  assert.equal(body.phase, 'hydration');
  assert.equal(body.recoverable, true);
  assert.equal(body.notBefore, '2030-01-02T00:00:00.000Z');
});

test('a Wing detail 429 records a not-before attention boundary and only an explicit same-attempt start resumes provider IO', async () => {
  let manifest = null;
  let detailed = false;
  let detailCalls = 0;
  const status = (state = 'RUNNING', overrides = {}) => ownerResultFor(detailsPermit, state, {
    manifest,
    phase: detailed ? 'ready_to_finalize' : 'hydration',
    progress: { hydratedProducts: detailed ? 1 : 0, discoveredProducts: 1, storedChunks: 0 },
    missing: { productIds: detailed ? [] : ['1'] },
    ...overrides,
  });
  const h = harness({
    permit: detailsPermit,
    initial: { phase: 'discovery', currentPage: 0, discoveryItems: [], discoveredProducts: 0, hydratedProducts: 0, uploadedChunks: 0 },
    read: () => status(),
    chunk(init) {
      const body = JSON.parse(init.body);
      if (body.kind === 'discovery_page') manifest = body.payload.manifest;
      if (body.kind === 'full_details') detailed = true;
      return status();
    },
    discovery: () => ({
      success: true, page: 1, pageSize: 500, totalItems: 1, totalPages: 1,
      records: [{ externalProductId: '1', registeredName: '상품 1' }],
    }),
    extract(input) {
      detailCalls += 1;
      if (detailCalls === 1) {
        return runSerializedDetailFunction(input, async () => jsonStreamResponse({}, {
          url: input.args[0].detailUrl, status: 429, retryAfter: '0',
        })).then((result) => [{ result }]);
      }
      const product = { sellerProductId: 1, items: [{ sellerProductItemId: 11, vendorItemId: null }] };
      return runSerializedDetailFunction(input, async () => jsonStreamResponse(product, {
        url: input.args[0].detailUrl,
      })).then((result) => [{ result }]);
    },
  });

  await h.step();
  await h.step();
  await h.step();
  assert.equal(detailCalls, 1);
  assert.equal(h.storage[stateKey].nextAllowedAt !== null, true);
  assert.equal((await h.sessions.getOwned(attemptId, 'local')).attention.reason, 'rate_limited');
  const pauseRequest = h.calls.requests.find((request) => request.path.endsWith('/pause'));
  assert.ok(pauseRequest);
  assert.deepEqual(JSON.parse(pauseRequest.body), {
    code: 'WING_PROVIDER_RATE_LIMITED',
    message: '쿠팡 Wing 상품 상세 API가 요청 한도를 초과했습니다',
    phase: 'hydration',
    recoverable: true,
    notBefore: h.storage[stateKey].nextAllowedAt,
  });
  assert.equal(h.calls.requests.some((request) => request.path.endsWith('/fail')), false);

  await h.step();
  assert.equal(detailCalls, 1);
  const resumed = await h.runtime.start({ permit: detailsPermit }, h.dependencies);
  assert.equal(resumed.started, true);
  await new Promise(setImmediate);
  assert.equal(detailCalls, 2);
});

test('an owner rate-limit pause fences provider IO after local state loss until explicit resume', async () => {
  let ownerPaused = true;
  const ownerStatus = () => ownerResultFor(detailsPermit, 'RUNNING', {
    error: ownerPaused ? {
      code: 'WING_PROVIDER_RATE_LIMITED',
      message: 'owner pause',
      phase: 'hydration',
      recoverable: true,
      notBefore: '2020-01-01T00:00:00.000Z',
    } : null,
    missing: { productIds: ['1'] },
    progress: { hydratedProducts: 0, discoveredProducts: 1, storedChunks: 0 },
  });
  let detailCalls = 0;
  const h = harness({
    permit: detailsPermit,
    initial: { phase: 'hydration', nextAllowedAt: null, discoveryItems: [{ ordinal: 0, externalProductId: '1' }], discoveredProducts: 1 },
    read: () => ownerStatus(),
    extract() { detailCalls += 1; throw new Error('owner pause must fence provider IO'); },
  });

  // Simulate an extension reload that lost only its local not-before marker.
  delete h.storage[stateKey].nextAllowedAt;
  await h.step();
  assert.equal(detailCalls, 0);
  assert.equal(h.calls.requests.some((request) => request.path.endsWith('/pause')), false);
  assert.equal(h.storage[stateKey].nextAllowedAt, '2020-01-01T00:00:00.000Z');

  ownerPaused = false;
  const resumed = await h.runtime.start({ permit: detailsPermit }, h.dependencies);
  assert.equal(resumed.started, true);
  assert.equal(detailCalls, 0);
});

test('an owner-accepted future not-before fences same-attempt resume after local state loss', async () => {
  const nowMs = Date.parse('2030-01-01T00:00:00.000Z');
  const notBefore = new Date(nowMs + 60_000).toISOString();
  const ownerStatus = () => ownerResultFor(detailsPermit, 'RUNNING', {
    error: {
      code: 'WING_PROVIDER_RATE_LIMITED',
      message: 'owner pause',
      phase: 'hydration',
      recoverable: true,
      notBefore,
    },
    missing: { productIds: ['1'] },
    progress: { hydratedProducts: 0, discoveredProducts: 1, storedChunks: 0 },
  });
  let detailCalls = 0;
  const h = harness({
    now: () => nowMs,
    permit: detailsPermit,
    initial: {
      phase: 'hydration',
      manifest: { totalItems: 1, pageSize: 500, expectedPages: 1 },
      nextAllowedAt: null,
      discoveryItems: [{ ordinal: 0, externalProductId: '1' }],
      discoveredProducts: 1,
    },
    read: () => ownerStatus(),
    extract() { detailCalls += 1; throw new Error('future owner pause must fence provider IO'); },
  });

  // Simulate a reload that lost the local marker while the owner still holds
  // its accepted future not-before boundary.
  delete h.storage[stateKey].nextAllowedAt;
  await h.step();
  assert.equal(h.storage[stateKey].nextAllowedAt, notBefore);

  const resumed = await h.runtime.start({ permit: detailsPermit }, h.dependencies);
  assert.equal(resumed.started, false);
  assert.equal(detailCalls, 0);
  assert.equal(h.storage[stateKey].nextAllowedAt, notBefore);
});

test('details stage sends each successful product chunk before a later product failure', async () => {
  const records = [
    { externalProductId: '1', registeredName: '상품 1' },
    { externalProductId: '2', registeredName: '상품 2' },
  ];
  const hydrated = new Set();
  const chunks = [];
  let manifest = null;
  const selectedPermit = { ...detailsPermit, plan: { ...detailsPermit.plan, basicProductIds: ['1', '2'] } };
  const status = (state = 'RUNNING', overrides = {}) => ownerResultFor(selectedPermit, state, {
    manifest,
    phase: state === 'COMPLETE' ? 'finished' : 'hydration',
    progress: { hydratedProducts: hydrated.size, discoveredProducts: manifest ? 2 : 0, storedChunks: chunks.length },
    missing: { productIds: records.map((record) => record.externalProductId)
      .filter((id) => !hydrated.has(id)) },
    ...overrides,
  });
  const h = harness({
    permit: selectedPermit,
    initial: { phase: 'discovery', currentPage: 0, discoveryItems: [], discoveredProducts: 0, hydratedProducts: 0, uploadedChunks: 0 },
    read: () => status(),
    fail: () => status('FAILED', { error: { code: 'browser_collection_failed', message: '상품 2 상세 실패' } }),
    chunk(init) {
      const body = JSON.parse(init.body);
      chunks.push(body);
      if (body.kind === 'discovery_page') manifest = body.payload.manifest;
      if (body.kind === 'full_details') {
        for (const row of body.payload.products) hydrated.add(row.product.externalProductId);
      }
      return status();
    },
    discovery: () => ({
      success: true, page: 1, pageSize: 500, totalItems: 2, totalPages: 1, records,
    }),
    extract(input) {
      const id = input.args[0].externalProductId;
      if (id === '2') {
        return runSerializedDetailFunction(input, async () => jsonStreamResponse({}, {
          url: input.args[0].detailUrl, status: 500,
        })).then((result) => [{ result }]);
      }
      const product = { sellerProductId: 1, items: [{ sellerProductItemId: 11, vendorItemId: null }] };
      return runSerializedDetailFunction(input, async () => jsonStreamResponse(product, {
        url: input.args[0].detailUrl,
      })).then((result) => [{ result }]);
    },
  });

  await h.step();
  await h.step();
  await h.step();

  assert.deepEqual(chunks.map((chunk) => chunk.kind), [
    'discovery_page', 'detail_manifest_confirmation', 'full_details',
  ]);
  assert.equal(chunks[2].sequence, 1);
  assert.equal(chunks[2].itemCount, 1);
  assert.equal(chunks[2].payload.products[0].product.externalProductId, '1');
  // 상품 1 은 한 번에 오고, 500 을 주는 상품 2 는 일시적 실패라 세 번까지 다시 묻는다.
  assert.equal(h.calls.extraction, 4);
  assert.equal(h.calls.requests.some((request) => request.path.endsWith('/fail')), true);
  assert.equal(h.calls.requests.some((request) => request.path.endsWith('/finalize')), false);
  assert.equal(h.storage[stateKey].status, 'error');
});

test('catalog keeps 20-product chunks while fetching fixed detail HTML without per-product navigation', async () => {
  const records = Array.from({ length: 21 }, (_, i) => ({ externalProductId: String(i + 1), registeredName: '상품' }));
  const hydrated = new Set(), chunks = [], detailCalls = new Map(), detailUrls = [];
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
      const id = input.args[0].externalProductId;
      const count = (detailCalls.get(id) || 0) + 1;
      detailCalls.set(id, count);
      detailUrls.push(input.args[0].detailUrl);
      const product = { sellerProductId: Number(id), sellerProductName: '상품 ' + id,
        items: [{ vendorItemId: Number(id) + 100, itemName: '단품', salePrice: 660, externalVendorSku: 'sku-' + id }] };
      const html = '<script>const appData = {"oSellerProduct":' + JSON.stringify(product) + '};</script>';
      return runSerializedDetailFunction(input, async () => streamResponse(html, {
        url: input.args[0].detailUrl,
      })).then((result) => [{ result }]);
    },
  });
  for (let i = 0; i < 5; i += 1) await h.step();
  assert.deepEqual(chunks.map(c => [c.kind, c.sequence, c.itemCount]), [
    ['discovery_page', 1, 21], ['manifest_confirmation', 1, 1],
    ['product_details', 1, 20], ['product_details', 21, 1],
  ]);
  assert.equal(detailCalls.get('1'), 1);
  assert.equal(detailCalls.get('21'), 1);
  assert.deepEqual(h.calls.delays, [500]);
  assert.deepEqual(h.calls.navigation.map(n => n.url), [listUrl]);
  assert.deepEqual(detailUrls, records.map((r) => permit.plan.detailUrl + '?vendorInventoryId=' + r.externalProductId));
  assert.equal(chunks[2].payload.products[0].product.externalProductId, '1');
  assert.equal(chunks[2].payload.products[0].product.options[0].externalOptionId, '101');
  assert.equal(chunks[2].payload.products[0].product.options[0].sellerSku, 'sku-1');
  assert.equal(chunks[2].payload.products[0].product.options[0].salePrice, 660);
  assert.ok(h.calls.requests.filter(r => r.method !== 'GET')
    .every(r => r.headers['x-source-attempt-token'] === attemptToken));
  assert.equal(await h.sessions.getOwned(attemptId, 'local'), null);
});

test('fixed detail fetch parses nested escaped JSON and matches the discovered product id', async () => {
  const records = [{ externalProductId: '3395429', registeredName: '상품' }];
  const h = harness({
    initial: { phase: 'discovery', currentPage: 0, discoveryItems: [], discoveredProducts: 0, hydratedProducts: 0 },
    discovery: () => ({ success: true, records, totalItems: 1, pageSize: 50 }),
    read: () => ownerResult('RUNNING', {
      missing: { productIds: ['3395429'] },
      progress: { hydratedProducts: 0, discoveredProducts: 1 },
    }),
    chunk: () => ownerResult('RUNNING', {
      missing: { productIds: [] },
      progress: { hydratedProducts: 1, discoveredProducts: 1 },
    }),
    extract(input) {
      const product = {
        sellerProductId: 3395429,
        sellerProductName: '브레이스 } "quoted"',
        items: [{ vendorItemId: 81000000001, itemName: '중첩 {옵션}', salePrice: 660 }],
      };
      const html = '<script>const appData = {"outer":{"nested":true},"oSellerProduct":' +
        JSON.stringify(product) + '};</script>';
      return runSerializedDetailFunction(input, async () => streamResponse(html, {
        url: input.args[0].detailUrl,
      })).then((result) => [{ result }]);
    },
  });
  await h.step();
  await h.step();
  await h.step();
  assert.equal(h.calls.requests.some((request) => request.path.endsWith('/fail')), false);
  assert.equal(h.calls.navigation.length, 1);
});

test('fixed detail fetch turns login redirects, HTTP failures, missing models, and timeouts into owner failures', async (t) => {
  const scenarios = [
    ['login redirect', () => streamResponse('', { url: 'https://xauth.coupang.com/login', status: 200 }), 'MARKETPLACE_LOGIN_REQUIRED'],
    ['HTTP failure', () => streamResponse('', { url: permit.plan.detailUrl + '?vendorInventoryId=1', status: 503 }), 'browser_collection_failed'],
    ['missing model', (input) => streamResponse('<html>no seller data</html>', { url: input.args[0].detailUrl }), 'browser_collection_failed'],
    ['timeout', () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }); }, 'WING_DETAIL_FETCH_TIMEOUT'],
  ];
  for (const [name, responseFor, expectedCode] of scenarios) {
    await t.test(name, async () => {
      const h = harness({
        initial: { phase: 'discovery', currentPage: 0, discoveryItems: [], discoveredProducts: 0, hydratedProducts: 0 },
        discovery: () => ({ success: true, records: [{ externalProductId: '1', registeredName: '상품' }], totalItems: 1, pageSize: 50 }),
        read: () => ownerResult('RUNNING', { missing: { productIds: ['1'] }, progress: { hydratedProducts: 0, discoveredProducts: 1 } }),
        extract(input) {
          return Promise.resolve().then(() => runSerializedDetailFunction(input, async () => responseFor(input)))
            .then((result) => [{ result }]);
        },
      });
      await h.step();
      await h.step();
      await h.step();
      const failure = h.calls.requests.find((request) => request.path.endsWith('/fail'));
      assert.ok(failure, `expected owner failure for ${name}`);
      const body = JSON.parse(failure.body);
      if (expectedCode === 'MARKETPLACE_LOGIN_REQUIRED') assert.equal(body.code, expectedCode);
      else assert.match(body.message, /Wing 상품 상세|aborted|HTML|요청/);
      assert.equal(h.calls.navigation.length, 1);
    });
  }
});

test('fixed detail fetch validates canonical input and final URLs before accepting a model', async (t) => {
  const cases = [
    {
      name: 'userinfo before fetch',
      configure(input) {
        input.args[0].detailUrl = input.args[0].detailUrl.replace(
          'https://wing.coupang.com',
          'https://user:password@wing.coupang.com',
        );
      },
      expectedFetches: 0,
    },
    {
      name: 'non-default port before fetch',
      configure(input) {
        input.args[0].detailUrl = input.args[0].detailUrl.replace(
          'https://wing.coupang.com',
          'https://wing.coupang.com:8443',
        );
      },
      expectedFetches: 0,
    },
    {
      name: 'wrong product id after redirect',
      finalUrl: permit.plan.detailUrl + '?vendorInventoryId=999',
      expectedFetches: 1,
    },
    {
      name: 'wrong detail path after redirect',
      finalUrl: listUrl,
      expectedFetches: 1,
    },
  ];
  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      let fetches = 0;
      const h = harness({
        initial: { phase: 'discovery', currentPage: 0, discoveryItems: [], discoveredProducts: 0, hydratedProducts: 0 },
        discovery: () => ({ success: true, records: [{ externalProductId: '1', registeredName: '상품' }], totalItems: 1, pageSize: 50 }),
        read: () => ownerResult('RUNNING', { missing: { productIds: ['1'] }, progress: { hydratedProducts: 0, discoveredProducts: 1 } }),
        extract(input) {
          scenario.configure?.(input);
          const product = { sellerProductId: 1, sellerProductName: '상품', items: [{ vendorItemId: 101 }] };
          const html = '<script>{"oSellerProduct":' + JSON.stringify(product) + '}</script>';
          return runSerializedDetailFunction(input, async (_url) => {
            fetches += 1;
            return streamResponse(html, { url: scenario.finalUrl || input.args[0].detailUrl });
          }).then((result) => [{ result }]);
        },
      });
      await h.step();
      await h.step();
      await h.step();
      assert.equal(fetches, scenario.expectedFetches);
      assert.ok(h.calls.requests.some((request) => request.path.endsWith('/fail')));
      assert.equal(h.calls.extraction, 1);
      assert.equal(h.calls.navigation.length, 1);
    });
  }
});

test('fixed detail fetch aborts a stalled response body and cancels an oversized stream', async (t) => {
  await t.test('stalled body is cancelled by the bounded timeout', async () => {
    let aborted = false;
    let cancelled = false;
    const h = harness({
      initial: { phase: 'discovery', currentPage: 0, discoveryItems: [], discoveredProducts: 0, hydratedProducts: 0 },
      discovery: () => ({ success: true, records: [{ externalProductId: '1', registeredName: '상품' }], totalItems: 1, pageSize: 50 }),
      read: () => ownerResult('RUNNING', { missing: { productIds: ['1'] }, progress: { hydratedProducts: 0, discoveredProducts: 1 } }),
      extract(input) {
        input.args[0].timeoutMs = 5;
        return runSerializedDetailFunction(input, async (_url, options) => {
          options.signal.addEventListener('abort', () => { aborted = true; }, { once: true });
          let rejectRead;
          const reader = {
            read() {
              return new Promise((_resolve, reject) => { rejectRead = reject; });
            },
            async cancel() {
              cancelled = true;
              rejectRead?.(Object.assign(new Error('aborted'), { name: 'AbortError' }));
            },
          };
          return {
            ok: true,
            status: 200,
            url: input.args[0].detailUrl,
            headers: { get() { return null; } },
            body: { getReader() { return reader; } },
          };
        }).then((result) => [{ result }]);
      },
    });
    await h.step();
    await h.step();
    await h.step();
    assert.equal(aborted, true);
    assert.equal(cancelled, true);
    assert.ok(h.calls.requests.some((request) => request.path.endsWith('/fail')));
  });

  await t.test('oversized stream is cancelled before more bytes are read', async () => {
    let cancelled = false;
    const h = harness({
      initial: { phase: 'discovery', currentPage: 0, discoveryItems: [], discoveredProducts: 0, hydratedProducts: 0 },
      discovery: () => ({ success: true, records: [{ externalProductId: '1', registeredName: '상품' }], totalItems: 1, pageSize: 50 }),
      read: () => ownerResult('RUNNING', { missing: { productIds: ['1'] }, progress: { hydratedProducts: 0, discoveredProducts: 1 } }),
      extract(input) {
        input.args[0].maxHtmlBytes = 4;
        return runSerializedDetailFunction(input, async () => {
          const bytes = new TextEncoder().encode('12345');
          let read = false;
          const reader = {
            async read() {
              if (read) return { done: true, value: undefined };
              read = true;
              return { done: false, value: bytes };
            },
            async cancel() { cancelled = true; },
          };
          return {
            ok: true,
            status: 200,
            url: input.args[0].detailUrl,
            headers: { get() { return null; } },
            body: { getReader() { return reader; } },
          };
        }).then((result) => [{ result }]);
      },
    });
    await h.step();
    await h.step();
    await h.step();
    assert.equal(cancelled, true);
    const failure = h.calls.requests.find((request) => request.path.endsWith('/fail'));
    assert.match(JSON.parse(failure.body).message, /허용 크기/);
  });
});

test('a refused managed-tab attachment closes only the current attempt and never executes detail capture', async () => {
  const h = harness({
    initial: {
      phase: 'hydration',
      manifest: { totalItems: 1, pageSize: 50, expectedPages: 1, firstPageFingerprint: 'a'.repeat(64) },
      discoveryItems: [{ ordinal: 0, externalProductId: '1' }],
      hydratedProducts: 0,
      uploadedChunks: 3,
    },
    read: () => ownerResult('RUNNING', {
      missing: { productIds: ['1'] },
      progress: { hydratedProducts: 0, discoveredProducts: 1 },
    }),
    fail: () => ownerResult('FAILED', {
      progress: { hydratedProducts: 0, discoveredProducts: 1 },
    }),
  });
  const getOrCreate = h.dependencies.collectionWindow.getOrCreate;
  h.dependencies.collectionWindow.getOrCreate = async (...args) => {
    const owned = await getOrCreate(...args);
    await h.sessions.remove(attemptId);
    return owned;
  };

  await h.step();

  assert.equal(h.calls.extraction, 0);
  assert.equal(h.calls.requests.some((request) => request.path.includes('/chunks/product_details/')), false);
  assert.equal(h.storage[stateKey].uploadedChunks, 3);
  assert.ok(h.calls.closed.length >= 1);
  assert.ok(h.calls.closed.every((closedAttemptId) => closedAttemptId === attemptId));
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
