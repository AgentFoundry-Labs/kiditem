import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const sourcePath = path.resolve('extensions/kiditem-os/background/sourcing/live-commerce-collector.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const sessionPath = path.resolve('extensions/kiditem-os/background/collection-session.js');
const sessionSource = fs.readFileSync(sessionPath, 'utf8');
const ATTEMPT_ID = '00000000-0000-4000-8000-000000000801';
const ATTEMPT_TOKEN = '00000000-0000-4000-8000-000000000811';
const API_BASE = 'http://localhost:4000/api';
const SOURCE_PATH = `${API_BASE}/sourcing/live-commerce/browser/attempts`;

function response(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

function sourceAttempt({
  pageUrl = 'https://live.douyin.com/123',
  state = 'RUNNING',
  errorCode = null,
  errorMessage = null,
  includeToken = state === 'RUNNING',
} = {}) {
  return {
    attemptId: ATTEMPT_ID,
    ...(includeToken ? { attemptToken: ATTEMPT_TOKEN } : {}),
    state,
    expiresAt: '2026-09-04T04:00:00.000Z',
    plan: { source: 'douyin', pageUrl, maxProducts: 100 },
    ...(errorCode ? { errorCode } : {}),
    ...(errorMessage ? { errorMessage } : {}),
  };
}

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
  vm.runInContext(fs.readFileSync(path.resolve('extensions/kiditem-os/background/sourcing/source-attempt-wire.js'), 'utf8'), context);
  vm.runInContext(sessionSource, context, { filename: sessionPath });
  vm.runInContext(source, context, { filename: sourcePath });
  return context;
}

function createHarness({
  pageUrl = 'https://live.douyin.com/123',
  navigationUrl = pageUrl,
  extractions = [{
    ok: true,
    source: 'douyin',
    pageUrl,
    broadcast: { broadcastId: 'broadcast-123', title: '방송' },
    products: [],
  }],
  ensureContentScripts = async () => true,
  requestHandler,
} = {}) {
  const context = loadCollectorModule();
  const values = {};
  const calls = { create: [], remove: [], requests: [], update: [], focus: [], injections: 0 };
  const extractionQueue = [...extractions];
  const tabs = new Map();
  const chrome = {
    runtime: { lastError: null },
    storage: {
      local: {
        get(key, callback) {
          const result = { [key]: values[key] };
          if (typeof callback === 'function') {
            callback(result);
            return;
          }
          return Promise.resolve(result);
        },
        set(next, callback) {
          Object.assign(values, next);
          callback?.();
          return Promise.resolve();
        },
      },
    },
    scripting: {
      executeScript: async () => { calls.injections += 1; },
    },
    tabs: {
      create(properties, callback) {
        const tab = { id: 1, windowId: 7, url: properties.url, status: 'complete' };
        tabs.set(tab.id, tab);
        calls.create.push(structuredClone(properties));
        callback({ ...tab });
      },
      get(tabId, callback) {
        const tab = tabs.get(tabId);
        callback(tab ? { ...tab, url: navigationUrl } : null);
      },
      query: async () => [],
      update(tabId, properties, callback) {
        calls.update.push({ tabId, ...structuredClone(properties) });
        const tab = tabs.get(tabId);
        if (tab) Object.assign(tab, properties);
        callback?.(tab ? { ...tab } : null);
      },
      onUpdated: { addListener() {}, removeListener() {} },
      sendMessage(_tabId, _message, callback) {
        const next = extractionQueue.shift();
        callback(typeof next === 'function' ? next() : next);
      },
      remove(tabId, callback) {
        calls.remove.push(tabId);
        tabs.delete(tabId);
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
    ensureContentScripts: async (tabId) => {
      calls.injections += 1;
      return ensureContentScripts(tabId);
    },
    getBackendRequestConfig: async () => ({
      ok: true,
      apiBase: API_BASE,
      headers: { Authorization: 'Bearer web-session' },
      request: async (url, init) => {
        calls.requests.push({ url, init: structuredClone(init) });
        if (requestHandler) return requestHandler({ url, init });
        if (url === SOURCE_PATH && init.method === 'POST') return response(sourceAttempt({ pageUrl }));
        if (url === `${SOURCE_PATH}/${ATTEMPT_ID}` && init.method === 'PUT') {
          return response(sourceAttempt({ pageUrl, state: 'COMPLETE', includeToken: false }));
        }
        if (url === `${SOURCE_PATH}/${ATTEMPT_ID}` && init.method === 'GET') {
          return response(sourceAttempt({ pageUrl, includeToken: false }));
        }
        if (url === `${SOURCE_PATH}/${ATTEMPT_ID}/fail`) {
          return response(sourceAttempt({
            pageUrl,
            state: 'FAILED',
            includeToken: false,
            errorCode: 'SOURCE_COLLECTION_FAILED',
            errorMessage: 'Collection failed.',
          }));
        }
        throw new Error(`unexpected request: ${url}`);
      },
    }),
  });
  return { calls, collector, sessions, values };
}

test('accepts the legacy browser Live Commerce URL set and keeps its full normalized navigation URL', () => {
  const module = loadCollectorModule().ProductScraperLiveCommerce;
  const fullUrl = 'https://user:pass@live.douyin.com:8443/123?token=keep#private';
  assert.deepEqual(
    JSON.parse(JSON.stringify(module.validateLiveUrl(fullUrl))),
    { ok: true, url: fullUrl, source: 'douyin' },
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(module.validateLiveUrl('https://zb.1688.com/live/123'))),
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

test('begins one direct source-owner attempt and terminally submits the unchanged browser payload', async () => {
  const pageUrl = 'https://live.douyin.com/123?token=keep#private';
  const { calls, collector, sessions, values } = createHarness({ pageUrl, navigationUrl: pageUrl });

  const result = await collector.run({
    environmentId: 'local',
    idempotencyKey: 'live-source-owner-1',
    url: pageUrl,
  });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    success: true,
    attemptId: ATTEMPT_ID,
    terminalState: 'COMPLETE',
  });
  assert.deepEqual(calls.create, [{ url: pageUrl, active: false }]);
  assert.equal(calls.requests.length, 2);
  assert.equal(calls.requests[0].url, SOURCE_PATH);
  assert.equal(calls.requests[0].init.headers['Idempotency-Key'], 'live-source-owner-1');
  assert.deepEqual(JSON.parse(calls.requests[0].init.body), { url: pageUrl });
  assert.equal(calls.requests[1].url, `${SOURCE_PATH}/${ATTEMPT_ID}`);
  assert.equal(calls.requests[1].init.headers['x-source-attempt-token'], ATTEMPT_TOKEN);
  assert.deepEqual(JSON.parse(calls.requests[1].init.body), {
    source: 'douyin',
    pageUrl,
    broadcast: { broadcastId: 'broadcast-123', title: '방송' },
    products: [],
  });
  assert.equal(await sessions.get(ATTEMPT_ID), null);
  assert.equal(JSON.stringify(values).includes(ATTEMPT_TOKEN), false);
  assert.equal(JSON.stringify(values).includes('token=keep'), false);
  assert.deepEqual(calls.remove, [1]);
});

test('retries a transient terminal response without changing its fenced payload', async () => {
  const pageUrl = 'https://live.douyin.com/123';
  let terminalCalls = 0;
  const { calls, collector } = createHarness({
    pageUrl,
    requestHandler: ({ url, init }) => {
      if (url === SOURCE_PATH) return response(sourceAttempt({ pageUrl }));
      if (url === `${SOURCE_PATH}/${ATTEMPT_ID}` && init.method === 'PUT') {
        terminalCalls += 1;
        return terminalCalls === 1
          ? response({ message: 'temporary' }, { ok: false, status: 503 })
          : response(sourceAttempt({ pageUrl, state: 'COMPLETE', includeToken: false }));
      }
      throw new Error(`unexpected request: ${url}`);
    },
  });

  const result = await collector.run({ environmentId: 'local', idempotencyKey: 'retry-1', url: pageUrl });

  assert.equal(result.terminalState, 'COMPLETE');
  assert.equal(terminalCalls, 2);
  const terminalPayloads = calls.requests.filter(({ url }) => url === `${SOURCE_PATH}/${ATTEMPT_ID}`);
  assert.deepEqual(
    terminalPayloads.map(({ init }) => JSON.parse(init.body)),
    [
      { source: 'douyin', pageUrl, broadcast: { broadcastId: 'broadcast-123', title: '방송' }, products: [] },
      { source: 'douyin', pageUrl, broadcast: { broadcastId: 'broadcast-123', title: '방송' }, products: [] },
    ],
  );
});

test('keeps a login or captcha attention tab open and does not terminally publish partial evidence', async () => {
  const pageUrl = 'https://live.douyin.com/123';
  const { calls, collector, sessions, values } = createHarness({
    pageUrl,
    navigationUrl: 'https://live.douyin.com/login',
  });

  const result = await collector.run({ environmentId: 'local', idempotencyKey: 'attention-1', url: pageUrl });

  assert.equal(result.success, false);
  assert.equal(result.terminalState, 'RUNNING');
  assert.equal(result.attentionRequired, true);
  assert.deepEqual(calls.requests.map(({ url }) => url), [SOURCE_PATH]);
  assert.deepEqual(calls.create, [{ url: pageUrl, active: false }]);
  assert.deepEqual(calls.remove, []);
  const attention = await sessions.get(ATTEMPT_ID);
  assert.equal(attention.attention.reason, 'marketplace_login');
  await sessions.openAttentionTab(ATTEMPT_ID);
  assert.deepEqual(calls.update, [{ tabId: 1, active: true }]);
  assert.deepEqual(calls.focus, [{ windowId: 7, focused: true }]);
  assert.equal(JSON.stringify(values).includes(ATTEMPT_TOKEN), false);
  assert.equal(JSON.stringify(values).includes('live.douyin.com/123'), false);
});

test('reinjects the existing content script once before terminally saving the same extracted payload', async () => {
  const pageUrl = 'https://live.douyin.com/123';
  const { calls, collector } = createHarness({
    pageUrl,
    extractions: [
      { ok: false, error: 'content_script_missing' },
      { ok: true, source: 'douyin', pageUrl, broadcast: { broadcastId: 'broadcast-123' }, products: [] },
    ],
  });

  const result = await collector.run({ environmentId: 'local', idempotencyKey: 'inject-1', url: pageUrl });

  assert.equal(result.terminalState, 'COMPLETE');
  assert.equal(calls.injections, 1);
  assert.equal(calls.requests.filter(({ url }) => url === `${SOURCE_PATH}/${ATTEMPT_ID}`).length, 1);
});

test('replays the original owner plan after an interrupted terminal delivery without persisting its token or URL', async () => {
  const pageUrl = 'https://live.douyin.com/123?token=keep#private';
  let beginCalls = 0;
  let terminalCalls = 0;
  let failCalls = 0;
  const { calls, collector, sessions, values } = createHarness({
    pageUrl,
    extractions: [
      { ok: true, source: 'douyin', pageUrl, broadcast: { broadcastId: 'broadcast-123', title: '방송' }, products: [] },
      { ok: true, source: 'douyin', pageUrl, broadcast: { broadcastId: 'broadcast-123', title: '방송' }, products: [] },
    ],
    requestHandler: ({ url, init }) => {
      if (url === SOURCE_PATH && init.method === 'POST') {
        beginCalls += 1;
        return response(sourceAttempt({ pageUrl }));
      }
      if (url === `${SOURCE_PATH}/${ATTEMPT_ID}` && init.method === 'GET') {
        return response(sourceAttempt({ pageUrl, includeToken: false }));
      }
      if (url === `${SOURCE_PATH}/${ATTEMPT_ID}` && init.method === 'PUT') {
        terminalCalls += 1;
        return terminalCalls <= 3
          ? response({ message: 'temporary' }, { ok: false, status: 503 })
          : response(sourceAttempt({ pageUrl, state: 'COMPLETE', includeToken: false }));
      }
      if (url === `${SOURCE_PATH}/${ATTEMPT_ID}/fail`) {
        failCalls += 1;
        return response({ message: 'temporary' }, { ok: false, status: 503 });
      }
      throw new Error(`unexpected request: ${url}`);
    },
  });

  const first = await collector.run({ environmentId: 'local', idempotencyKey: 'recover-1', url: pageUrl });
  assert.equal(first.terminalState, 'RUNNING');
  assert.notEqual(await sessions.get(ATTEMPT_ID), null);

  const second = await collector.run({ environmentId: 'local', idempotencyKey: 'recover-1', url: pageUrl });
  assert.equal(second.terminalState, 'COMPLETE');
  assert.equal(beginCalls, 2);
  assert.equal(failCalls, 3);
  assert.equal(terminalCalls, 4);
  const beginBodies = calls.requests
    .filter(({ url, init }) => url === SOURCE_PATH && init.method === 'POST')
    .map(({ init }) => JSON.parse(init.body));
  assert.deepEqual(beginBodies, [{ url: pageUrl }, { url: pageUrl }]);
  assert.equal(JSON.stringify(values).includes(ATTEMPT_TOKEN), false);
  assert.equal(JSON.stringify(values).includes('token=keep'), false);
});

test('cancels an attention session through the source-owner fail endpoint before closing its managed tab', async () => {
  const pageUrl = 'https://live.douyin.com/123';
  const { calls, collector, sessions } = createHarness({
    pageUrl,
    navigationUrl: 'https://live.douyin.com/login',
  });
  await collector.run({ environmentId: 'local', idempotencyKey: 'cancel-1', url: pageUrl });

  const cancelled = await collector.cancel(ATTEMPT_ID, 'local');

  assert.deepEqual(JSON.parse(JSON.stringify(cancelled)), {
    success: true,
    cancelled: true,
    attemptId: ATTEMPT_ID,
  });
  assert.deepEqual(calls.requests.map(({ url, init }) => `${init.method} ${url}`), [
    `POST ${SOURCE_PATH}`,
    `GET ${SOURCE_PATH}/${ATTEMPT_ID}`,
    `POST ${SOURCE_PATH}`,
    `POST ${SOURCE_PATH}/${ATTEMPT_ID}/fail`,
  ]);
  assert.equal(calls.requests.at(-1).init.headers['x-source-attempt-token'], ATTEMPT_TOKEN);
  assert.equal(await sessions.get(ATTEMPT_ID), null);
  assert.deepEqual(calls.remove, [1]);
});
