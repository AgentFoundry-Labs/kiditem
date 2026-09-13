import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const root = path.resolve('extensions/kiditem-os/background/sourcing');
const sessionPath = path.resolve('extensions/kiditem-os/background/collection-session.js');
const sessionSource = fs.readFileSync(sessionPath, 'utf8');
const wireSource = fs.readFileSync(path.join(root, 'source-attempt-wire.js'), 'utf8');
const API_BASE = 'http://localhost:4000/api';

const definitions = [
  {
    name: '1688',
    globalName: 'ProductScraper1688Trend',
    sourceFile: '1688-trend-collector.js',
    producer: 'sourcing.1688_trend',
    attemptId: '00000000-0000-4000-8000-000000001688',
    attemptToken: 'token-1688',
    beginPlan: {
      source: '1688.hot_product',
      keywords: ['pencil', '玩具'],
    },
    input: { idempotencyKey: 'common-session-1688' },
    extraction: [
      { ok: true, items: [{ offerId: 'offer-1', title: 'Pencil' }] },
      { ok: true, items: [{ offerId: 'offer-2', title: 'Toy' }] },
    ],
    expectedBody: {
      keywords: [
        { keyword: 'pencil', items: [{ offerId: 'offer-1', title: 'Pencil' }] },
        { keyword: '玩具', items: [{ offerId: 'offer-2', title: 'Toy' }] },
      ],
      errors: [],
    },
  },
  {
    name: 'Live Commerce',
    globalName: 'ProductScraperLiveCommerce',
    sourceFile: 'live-commerce-collector.js',
    producer: 'sourcing.live_commerce',
    attemptId: '00000000-0000-4000-8000-000000000801',
    attemptToken: 'token-live',
    pageUrl: 'https://live.douyin.com/123?room=fixture',
    beginPlan: {
      source: 'douyin',
      pageUrl: 'https://live.douyin.com/123?room=fixture',
      maxProducts: 100,
    },
    input: {
      idempotencyKey: 'common-session-live',
      url: 'https://live.douyin.com/123?room=fixture',
    },
    extraction: [{
      ok: true,
      source: 'douyin',
      pageUrl: 'https://live.douyin.com/123?room=fixture',
      broadcast: { broadcastId: 'broadcast-1', title: 'Fixture 방송' },
      products: [{ productId: 'product-1', title: 'Pencil set' }],
    }],
    expectedBody: {
      source: 'douyin',
      pageUrl: 'https://live.douyin.com/123?room=fixture',
      broadcast: { broadcastId: 'broadcast-1', title: 'Fixture 방송' },
      products: [{ productId: 'product-1', title: 'Pencil set' }],
    },
  },
  {
    name: 'TikTok Creative Center',
    globalName: 'ProductScraperTiktokCcTrend',
    sourceFile: 'tiktok-cc-collector.js',
    producer: 'sourcing.tiktok_cc_trend',
    attemptId: '00000000-0000-4000-8000-000000007777',
    attemptToken: 'token-tiktok',
    beginPlan: {
      source: 'tiktok.creative',
      targetSeeds: [{ label: 'Pencil case', keyword: 'pencil case' }],
      maxItems: 10,
      regionOverride: null,
    },
    input: { idempotencyKey: 'common-session-tiktok', maxItems: 10 },
    extraction: [
      { ok: true, region: 'kr', items: [{ trendType: 'hashtag', entityKey: 'pencil' }] },
      { ok: true, region: 'KR', items: [{ trendType: 'product', entityKey: 'pencil set' }] },
      { ok: true, region: 'KR', items: [{ trendType: 'keyword', entityKey: 'pencil case' }] },
    ],
    expectedBody: {
      region: 'KR',
      items: [
        { trendType: 'hashtag', entityKey: 'pencil' },
        { trendType: 'product', entityKey: 'pencil set' },
        { trendType: 'keyword', entityKey: 'pencil case' },
      ],
      visitedTargetIds: ['hashtag', 'product', 'keyword:pencil case'],
    },
  },
];

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function response(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: async () => clone(body),
    text: async () => JSON.stringify(body),
  };
}

function runningPlan(definition) {
  return {
    attemptId: definition.attemptId,
    attemptToken: definition.attemptToken,
    state: 'RUNNING',
    expiresAt: '2030-09-04T04:00:00.000Z',
    plan: clone(definition.beginPlan),
  };
}

function terminalPlan(definition, state) {
  return {
    ...runningPlan(definition),
    state,
    ...(state === 'COMPLETE' ? { attemptToken: undefined } : {}),
    ...(state === 'FAILED'
      ? { errorCode: 'COLLECTION_CANCELLED', errorMessage: 'Collection cancelled.' }
      : {}),
  };
}

function loadCollector(definition) {
  const context = {
    URL,
    clearTimeout,
    console,
    crypto: webcrypto,
    Date,
    Math,
    Promise,
    setTimeout,
    structuredClone,
    globalThis: null,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(wireSource, context, { filename: 'source-attempt-wire.js' });
  vm.runInContext(sessionSource, context, { filename: sessionPath });
  vm.runInContext(
    fs.readFileSync(path.join(root, definition.sourceFile), 'utf8'),
    context,
    { filename: definition.sourceFile },
  );
  return context;
}

function createChrome(definition, values, options) {
  const tabs = new Map();
  const calls = {
    create: [],
    update: [],
    remove: [],
    messages: [],
    requests: [],
    providerAwaiting: false,
  };
  const listeners = new Set();
  const extractionQueue = [...definition.extraction];
  let nextTabId = 1;
  let releaseProvider = null;

  function providerResponse(message) {
    const next = extractionQueue.length > 0
      ? extractionQueue.shift()
      : definition.extraction.at(-1);
    return typeof next === 'function' ? next(message) : clone(next);
  }

  const chrome = {
    runtime: { lastError: null },
    storage: {
      local: {
        get(key, callback) {
          const result = { [key]: clone(values[key]) };
          if (typeof callback === 'function') {
            callback(result);
            return;
          }
          return Promise.resolve(result);
        },
        set(next, callback) {
          Object.assign(values, clone(next));
          callback?.();
          return Promise.resolve();
        },
        remove(key, callback) {
          delete values[key];
          callback?.();
          return Promise.resolve();
        },
      },
    },
    scripting: { executeScript: async () => [] },
    tabs: {
      create(properties, callback) {
        const tab = {
          id: nextTabId++,
          windowId: 7,
          url: properties.url,
          status: 'complete',
        };
        tabs.set(tab.id, tab);
        calls.create.push(clone(properties));
        callback({ ...tab });
      },
      get(tabId, callback) {
        const tab = tabs.get(tabId);
        callback(tab ? { ...tab } : null);
      },
      update(tabId, properties, callback) {
        const tab = tabs.get(tabId);
        if (!tab) {
          chrome.runtime.lastError = { message: 'tab missing' };
          callback(null);
          chrome.runtime.lastError = null;
          return;
        }
        Object.assign(tab, properties, { status: 'complete' });
        calls.update.push({ tabId, ...clone(properties) });
        callback({ ...tab });
        for (const listener of listeners) {
          listener(tabId, { status: 'complete' }, { ...tab });
        }
      },
      sendMessage(tabId, message, callback) {
        calls.messages.push({ tabId, ...clone(message) });
        if (options.holdProvider && !calls.providerAwaiting) {
          calls.providerAwaiting = true;
          const release = (value = providerResponse(message)) => {
            releaseProvider = null;
            calls.providerAwaiting = false;
            callback(value);
          };
          releaseProvider = release;
          return;
        }
        callback(providerResponse(message));
      },
      remove(tabId, callback) {
        calls.remove.push(tabId);
        tabs.delete(tabId);
        callback?.();
        return Promise.resolve();
      },
      query: async () => [],
      onUpdated: {
        addListener(listener) { listeners.add(listener); },
        removeListener(listener) { listeners.delete(listener); },
      },
    },
    windows: {
      update: async () => undefined,
    },
  };

  return {
    chrome,
    calls,
    releaseProvider(value) {
      releaseProvider?.(value);
    },
  };
}

function createHarness(definition, {
  values = {},
  holdProvider = false,
  failAckFailures = 0,
  appOpen = true,
} = {}) {
  const context = loadCollector(definition);
  const chromeRuntime = createChrome(definition, values, { holdProvider });
  let collector;
  let sessions;
  let failAckFailuresRemaining = failAckFailures;
  const requests = chromeRuntime.calls.requests;

  const request = async (url, init = {}) => {
    const captured = { url, init: { ...init, headers: clone(init.headers) } };
    requests.push(captured);
    if (url.endsWith('/attempts') && init.method === 'POST') {
      return response(runningPlan(definition));
    }
    if (url.endsWith('/fail') && init.method === 'POST') {
      if (failAckFailuresRemaining > 0) {
        failAckFailuresRemaining -= 1;
        return response({ message: 'temporary owner cancellation failure' }, { ok: false, status: 503 });
      }
      return response(terminalPlan(definition, 'FAILED'));
    }
    if (init.method === 'PUT') {
      return response(terminalPlan(definition, 'COMPLETE'));
    }
    if (init.method === 'GET') {
      return response(runningPlan(definition));
    }
    throw new Error(`unexpected owner request: ${init.method} ${url}`);
  };

  sessions = context.KidItemCollectionSession.create({
    chrome: chromeRuntime.chrome,
    storageKey: 'kiditem_collection_sessions',
    webUrlPatterns: [],
    onStarted: async (started) => {
      if (appOpen) return;
      await sessions.requestCancellation(started.attemptId, started.environmentId);
      await collector.cancel(started.attemptId, started.environmentId, {
        cancellationRequested: true,
      });
      throw new Error('KidItem web app is not open for this environment');
    },
  });
  collector = context[definition.globalName].create({
    chrome: chromeRuntime.chrome,
    sessions,
    ensureContentScripts: async () => true,
    getBackendRequestConfig: async () => ({
      ok: true,
      apiBase: API_BASE,
      headers: { Authorization: 'Bearer fixture' },
      request,
    }),
  });

  return {
    ...chromeRuntime,
    collector,
    context,
    sessions,
    values,
    requests,
    releaseProvider() {
      chromeRuntime.releaseProvider();
    },
  };
}

async function waitFor(predicate) {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail('timed out waiting for provider/session state');
}

function runInput(definition) {
  return {
    environmentId: 'local',
    ...definition.input,
  };
}

for (const definition of definitions) {
  test(`${definition.name} keeps normalized terminal payload parity through the common session API`, async () => {
    const harness = createHarness(definition);
    const result = await harness.collector.run(runInput(definition));
    const terminal = harness.requests.find(({ init }) => init.method === 'PUT');

    assert.equal(result.success, true);
    assert.ok(terminal, 'collector must submit one terminal PUT');
    assert.deepEqual(JSON.parse(terminal.init.body), definition.expectedBody);
    assert.equal(await harness.sessions.get(definition.attemptId), null);
  });

  test(`${definition.name} fences a provider that resolves after cancellation and never submits PUT`, async () => {
    const harness = createHarness(definition, { holdProvider: true });
    const pending = harness.collector.run(runInput(definition));
    await waitFor(() => harness.calls.providerAwaiting);

    const cancelled = await harness.collector.cancel(definition.attemptId, 'local');
    harness.releaseProvider();
    const result = await pending;

    assert.equal(cancelled.success, true);
    assert.equal(cancelled.cancelled, true);
    assert.equal(result.terminalState, 'FAILED');
    assert.equal(harness.requests.filter(({ init }) => init.method === 'PUT').length, 0);
    assert.equal(await harness.sessions.get(definition.attemptId), null);
  });

  test(`${definition.name} retains a failed owner cancellation intent across restart and converges on retry`, async () => {
    const initial = createHarness(definition, { holdProvider: true, failAckFailures: 3 });
    const pending = initial.collector.run(runInput(definition));
    await waitFor(() => initial.calls.providerAwaiting);

    await assert.rejects(initial.collector.cancel(definition.attemptId, 'local'), /temporary owner cancellation failure|source owner request failed/i);
    assert.equal((await initial.sessions.listCancellationRequests('local')).length, 1);

    initial.releaseProvider();
    const firstResult = await pending;
    assert.equal(firstResult.terminalState, 'RUNNING');

    const restarted = createHarness(definition, { values: initial.values });
    const retried = await restarted.collector.cancel(definition.attemptId, 'local');

    assert.equal(retried.success, true);
    assert.equal(await restarted.sessions.get(definition.attemptId), null);
    assert.equal((await restarted.sessions.listCancellationRequests('local')).length, 0);
    assert.equal(restarted.requests.filter(({ url, init }) => url.endsWith('/fail') && init.method === 'POST').length, 1);
  });

  test(`${definition.name} late admission after app closure is owner-cancelled before provider work`, async () => {
    const harness = createHarness(definition, { appOpen: false });
    const result = await harness.collector.run(runInput(definition));

    assert.equal(result.success, false);
    assert.equal(result.terminalState, 'FAILED');
    assert.equal(harness.calls.create.length, 0);
    assert.equal(harness.requests.filter(({ init }) => init.method === 'PUT').length, 0);
    assert.ok(harness.requests.some(({ url, init }) => url.endsWith('/fail') && init.method === 'POST'));
    assert.equal(await harness.sessions.get(definition.attemptId), null);
  });
}
