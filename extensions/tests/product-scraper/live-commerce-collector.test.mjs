import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const sourcePath = path.resolve('extensions/kiditem-os/background/sourcing/live-commerce-collector.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const sessionPath = path.resolve('extensions/kiditem-os/background/collection-session.js');
const sessionSource = fs.readFileSync(sessionPath, 'utf8');
const OPERATION_RUN_ID = '00000000-0000-4000-8000-000000000801';
const OPERATION_ATTEMPT_TOKEN = 'operation-attempt-live-commerce';

function loadCollectorModule() {
  const context = {
    URL,
    console,
    crypto: globalThis.crypto,
    globalThis: null,
    setTimeout,
    clearTimeout,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(sessionSource, context, { filename: sessionPath });
  vm.runInContext(source, context, { filename: sourcePath });
  return context;
}

function createHarness({
  pageUrl = 'https://live.douyin.com/123',
  navigationUrl = pageUrl,
  extraction = {
    ok: true,
    source: 'douyin',
    pageUrl,
    broadcast: { broadcastId: 'broadcast-123', title: '방송' },
    products: [],
  },
  request = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      source: 'douyin',
      broadcastCount: 1,
      productCount: 0,
      businessDate: '2026-08-14',
    }),
  }),
} = {}) {
  const context = loadCollectorModule();
  const values = {};
  const calls = { create: [], remove: [], requests: [], update: [], focus: [] };
  const chrome = {
    runtime: { lastError: null },
    storage: {
      local: {
        get: async (key) => ({ [key]: values[key] }),
        set: async (next) => Object.assign(values, next),
      },
    },
    scripting: { executeScript: async () => [] },
    tabs: {
      create(properties, callback) {
        calls.create.push(properties);
        callback({ id: 1, windowId: 7, url: properties.url, status: 'complete' });
      },
      get(_tabId, callback) {
        callback({ id: 1, windowId: 7, url: navigationUrl, status: 'complete' });
      },
      query: async () => [],
      update(tabId, properties, callback) {
        calls.update.push({ tabId, ...properties });
        callback?.({ id: tabId, windowId: 7, ...properties });
      },
      onUpdated: { addListener() {}, removeListener() {} },
      sendMessage(_tabId, _message, callback) {
        callback(typeof extraction === 'function' ? extraction() : extraction);
      },
      remove(tabId, callback) {
        calls.remove.push(tabId);
        callback?.();
      },
    },
    windows: {
      update(windowId, properties, callback) {
        calls.focus.push({ windowId, ...properties });
        callback?.({ id: windowId });
      },
    },
  };
  const sessions = context.KidItemCollectionSession.create({
    chrome,
    storageKey: 'kiditem_collection_sessions',
    webUrlPatterns: ['http://localhost:3000/*'],
  });
  const collector = context.ProductScraperLiveCommerce.create({
    chrome,
    sessions,
    ensureContentScripts: async () => true,
    getBackendRequestConfig: async () => ({
      ok: true,
      apiBase: 'http://localhost:4000/api',
      headers: { Authorization: 'Bearer token' },
      request: async (url, init) => {
        calls.requests.push({ url, init });
        return request(url, init);
      },
    }),
  });
  return { calls, collector, sessions };
}

test('accepts only the exact browser live-operation hosts', () => {
  const module = loadCollectorModule().ProductScraperLiveCommerce;
  assert.deepEqual(
    { ...module.validateLiveUrl('https://live.douyin.com/123') },
    { ok: true, url: 'https://live.douyin.com/123', source: 'douyin' },
  );
  assert.deepEqual(
    { ...module.validateLiveUrl('https://zb.1688.com/live/123') },
    { ok: true, url: 'https://zb.1688.com/live/123', source: '1688' },
  );
  for (const url of [
    'http://live.douyin.com/123',
    'https://detail.1688.com/offer/123',
    'https://www.douyin.com/123',
    'https://evil.example/live/123',
  ]) {
    assert.equal(module.validateLiveUrl(url).ok, false, url);
  }
});

test('posts one typed snapshot through the fixed owner route with its operation fence', async () => {
  const pageUrl = 'https://live.douyin.com/123?token=must-not-persist#private';
  const { calls, collector, sessions } = createHarness({
    pageUrl,
    navigationUrl: pageUrl,
    extraction: {
      ok: true,
      source: 'douyin',
      pageUrl,
      broadcast: { broadcastId: 'broadcast-123', title: '방송' },
      products: [],
    },
  });

  const result = await collector.collect(
    pageUrl,
    OPERATION_RUN_ID,
    'local',
    { attemptToken: OPERATION_ATTEMPT_TOKEN },
  );

  assert.equal(result.success, true);
  assert.equal(result.runId, OPERATION_RUN_ID);
  assert.equal(calls.requests.length, 1);
  assert.equal(
    calls.requests[0].url,
    `http://localhost:4000/api/sourcing/operations/live-commerce/${OPERATION_RUN_ID}/results`,
  );
  assert.equal(
    calls.requests[0].init.headers['x-operation-attempt-token'],
    OPERATION_ATTEMPT_TOKEN,
  );
  assert.deepEqual(JSON.parse(calls.requests[0].init.body), {
    source: 'douyin',
    pageUrl,
    broadcast: { broadcastId: 'broadcast-123', title: '방송' },
    products: [],
  });
  const session = await sessions.get(OPERATION_RUN_ID);
  assert.equal(session.status, 'succeeded');
  assert.equal(session.producer, 'sourcing.live_commerce');
  assert.equal(session.restartStrategy, 'extension');
  assert.deepEqual(
    JSON.parse(JSON.stringify(session.inputIdentity)),
    { source: 'douyin', pageUrl: 'https://live.douyin.com/123' },
  );
  assert.equal(JSON.stringify(session).includes('must-not-persist'), false);
  assert.deepEqual(calls.remove, [1]);
});

test('does not open a browser tab without the exact Operation run and attempt token', async () => {
  const { calls, collector } = createHarness();

  const missingToken = await collector.collect(
    'https://live.douyin.com/123',
    OPERATION_RUN_ID,
    'local',
  );
  const missingRun = await collector.collect(
    'https://live.douyin.com/123',
    undefined,
    'local',
    { attemptToken: OPERATION_ATTEMPT_TOKEN },
  );

  assert.equal(missingToken.success, false);
  assert.equal(missingToken.error, 'operation_attempt_token_required');
  assert.equal(missingRun.success, false);
  assert.equal(missingRun.error, 'operation_run_id_required');
  assert.deepEqual(calls.create, []);
});

test('keeps marketplace login attention inactive and exposes no local restart bridge', async () => {
  const { calls, collector, sessions } = createHarness({
    navigationUrl: 'https://live.douyin.com/login',
  });

  const result = await collector.collect(
    'https://live.douyin.com/123',
    OPERATION_RUN_ID,
    'local',
    { attemptToken: OPERATION_ATTEMPT_TOKEN },
  );

  assert.equal(result.success, false);
  assert.equal(result.status, 'attention_required');
  assert.equal(typeof collector.restart, 'undefined');
  assert.deepEqual(JSON.parse(JSON.stringify(calls.create)), [
    { url: 'https://live.douyin.com/123', active: false },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.update)), []);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.focus)), []);
  const attention = await sessions.get(OPERATION_RUN_ID);
  assert.equal(attention.status, 'attention_required');
  await sessions.openAttentionTab(OPERATION_RUN_ID);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.update)), [{ tabId: 1, active: true }]);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.focus)), [{ windowId: 7, focused: true }]);
});

test('cancels a claimed browser session while the owner request is pending', async () => {
  let resolveRequest;
  let requestStarted;
  const requestPending = new Promise((resolve) => { resolveRequest = resolve; });
  const requestObserved = new Promise((resolve) => { requestStarted = resolve; });
  const { calls, collector, sessions } = createHarness({
    request: async () => {
      requestStarted();
      return requestPending;
    },
  });

  const collection = collector.collect(
    'https://live.douyin.com/123',
    OPERATION_RUN_ID,
    'local',
    { attemptToken: OPERATION_ATTEMPT_TOKEN },
  );
  await requestObserved;
  await collector.cancel(OPERATION_RUN_ID);
  resolveRequest({
    ok: true,
    status: 200,
    json: async () => ({ source: 'douyin', broadcastCount: 1, productCount: 0 }),
  });

  const result = await collection;
  assert.equal(result.success, false);
  assert.equal(result.cancelled, true);
  assert.equal(result.status, 'cancelled');
  assert.equal((await sessions.get(OPERATION_RUN_ID)).status, 'cancelled');
  assert.deepEqual(calls.remove, [1]);
});

test('surfaces an owner fence loss and closes its managed browser tab', async () => {
  const { calls, collector, sessions } = createHarness({
    request: async () => ({
      ok: false,
      status: 409,
      json: async () => ({ message: 'attempt fence lost' }),
    }),
  });

  const result = await collector.collect(
    'https://live.douyin.com/123',
    OPERATION_RUN_ID,
    'local',
    { attemptToken: OPERATION_ATTEMPT_TOKEN },
  );

  assert.equal(result.success, false);
  assert.equal(result.errorCode, 'operation_runtime_fence_lost');
  assert.equal((await sessions.get(OPERATION_RUN_ID)).status, 'failed');
  assert.deepEqual(calls.remove, [1]);
});
