import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const collectorPath = path.resolve('extensions/kiditem-os/background/sourcing/tiktok-cc-collector.js');
const collectorSource = fs.readFileSync(collectorPath, 'utf8');
const ATTEMPT_ID = '00000000-0000-4000-8000-000000007777';
const ATTEMPT_TOKEN = 'tiktok-operation-attempt-token';

function response(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function createSessionSpy() {
  const calls = {
    attachTab: [],
    cancel: [],
    fail: [],
    remove: [],
    progress: [],
    start: [],
    succeed: [],
  };
  const stored = new Map();
  return {
    calls,
    sessions: {
      async start(input) {
        calls.start.push(structuredClone(input));
        stored.set(input.attemptId, structuredClone(input));
      },
      async attachTab(runId, input) { calls.attachTab.push({ runId, ...structuredClone(input) }); },
      async progress(runId, input) { calls.progress.push({ runId, ...structuredClone(input) }); },
      async succeed(runId) { calls.succeed.push(runId); },
      async fail(runId) { calls.fail.push(runId); },
      async cancel(runId) { calls.cancel.push(runId); },
      async remove(attemptId) {
        calls.remove.push(attemptId);
        stored.delete(attemptId);
      },
      async list(environmentId) {
        return [...stored.values()].filter((session) => session.environmentId === environmentId);
      },
      async getOwned(attemptId, environmentId) {
        const session = stored.get(attemptId);
        return session?.environmentId === environmentId ? structuredClone(session) : null;
      },
    },
  };
}

function ownerAttempt({
  targets = [],
  maxItems = 100,
  regionOverride = null,
  state = 'RUNNING',
  acceptedCount = null,
  errorCode = null,
  errorMessage = null,
} = {}) {
  return {
    attemptId: ATTEMPT_ID,
    ...(state === 'RUNNING' ? { attemptToken: ATTEMPT_TOKEN } : {}),
    state,
    expiresAt: '2026-09-04T04:00:00.000Z',
    plan: {
      source: 'tiktok.creative',
      targetSeeds: targets,
      maxItems,
      regionOverride,
    },
    ...(acceptedCount === null ? {} : { acceptedCount }),
    ...(errorCode === null ? {} : { errorCode }),
    ...(errorMessage === null ? {} : { errorMessage }),
  };
}

function createChrome({ extractionResponses, navigationUrlFor } = {}) {
  const storage = {};
  const tabs = new Map();
  const calls = { create: [], update: [], remove: [], messages: [], injections: [] };
  let nextTabId = 1;
  const nextExtraction = [...(extractionResponses || [])];
  const chrome = {
    runtime: { lastError: null },
    storage: {
      local: {
        get(key, callback) {
          callback({ [key]: storage[key] });
        },
        set(values, callback) {
          Object.assign(storage, values);
          callback?.();
        },
      },
    },
    tabs: {
      create(properties, callback) {
        const tab = {
          id: nextTabId++,
          windowId: 7,
          url: properties.url,
          status: 'complete',
        };
        tabs.set(tab.id, tab);
        calls.create.push(structuredClone(properties));
        callback({ ...tab });
      },
      get(tabId, callback) {
        callback(tabs.has(tabId) ? { ...tabs.get(tabId) } : null);
      },
      update(tabId, properties, callback) {
        const tab = tabs.get(tabId);
        if (!tab) {
          chrome.runtime.lastError = { message: 'tab missing' };
          callback(null);
          chrome.runtime.lastError = null;
          return;
        }
        const url = navigationUrlFor?.(properties.url) || properties.url;
        Object.assign(tab, properties, { url, status: 'complete' });
        calls.update.push({ tabId, ...structuredClone(properties), resolvedUrl: url });
        callback({ ...tab });
      },
      sendMessage(tabId, message, callback) {
        calls.messages.push({ tabId, ...structuredClone(message) });
        const next = nextExtraction.shift();
        assert.ok(next, `unexpected extraction for ${message.trendType}:${message.sourceKeyword}`);
        if (typeof next !== 'function') {
          callback(next);
          return;
        }
        const response = next(message, callback);
        if (response !== undefined) callback(response);
      },
      remove(tabId, callback) {
        calls.remove.push(tabId);
        tabs.delete(tabId);
        callback?.();
      },
      query: async () => [],
    },
    scripting: {
      async executeScript(input) {
        calls.injections.push(structuredClone(input));
      },
    },
  };
  return { calls, chrome, storage };
}

function loadCollector({
  targets = [],
  extractionResponses = [],
  ensureContentScripts = async () => true,
  navigationUrlFor,
  planMaxItems = 100,
  planRegionOverride = null,
  beginState = 'RUNNING',
  terminalState = 'COMPLETE',
  terminalResult = { collected: 0, businessDate: '2026-09-04' },
  requestHandler,
  existingChrome,
  existingSessionRuntime,
} = {}) {
  const sessionRuntime = existingSessionRuntime || createSessionSpy();
  const { calls: sessionCalls, sessions } = sessionRuntime;
  const chrome = existingChrome || createChrome({ extractionResponses, navigationUrlFor });
  const requests = [];
  const context = {
    URL,
    clearTimeout,
    console,
    Date,
    Math,
    Promise,
    setTimeout,
    globalThis: null,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.resolve('extensions/kiditem-os/background/sourcing/source-attempt-wire.js'), 'utf8'), context);
  vm.runInContext(collectorSource, context, { filename: collectorPath });
  const collector = context.ProductScraperTiktokCcTrend.create({
    chrome: chrome.chrome,
    sessions,
    ensureContentScripts,
    getBackendRequestConfig: async () => ({
      ok: true,
      apiBase: 'http://localhost:4000/api',
      headers: { Authorization: 'Bearer web-session' },
      request: async (url, init) => {
        requests.push({ url, init: structuredClone(init) });
        if (requestHandler) {
          return requestHandler({
            url,
            init,
            ownerAttempt: (overrides = {}) => ownerAttempt({
              targets,
              maxItems: planMaxItems,
              regionOverride: planRegionOverride,
              ...overrides,
            }),
          });
        }
        if (url === 'http://localhost:4000/api/sourcing/tiktok-creative/attempts') {
          return response(ownerAttempt({
            targets,
            maxItems: planMaxItems,
            regionOverride: planRegionOverride,
            state: beginState,
          }));
        }
        if (url === `http://localhost:4000/api/sourcing/tiktok-creative/attempts/${ATTEMPT_ID}`) {
          return response(ownerAttempt({
            targets,
            maxItems: planMaxItems,
            regionOverride: planRegionOverride,
            state: terminalState,
            acceptedCount: terminalResult.collected,
          }));
        }
        if (url === `http://localhost:4000/api/sourcing/tiktok-creative/attempts/${ATTEMPT_ID}/fail`) {
          return response(ownerAttempt({
            targets,
            maxItems: planMaxItems,
            regionOverride: planRegionOverride,
            state: 'FAILED',
          }));
        }
        throw new Error(`unexpected request: ${url}`);
      },
    }),
  });
  return {
    chrome,
    collector,
    requests,
    sessionCalls,
    sessionRuntime,
  };
}

function runCollector(harness, {
  options = {},
  idempotencyKey = 'tiktok-characterization-key',
  environmentId = 'local',
} = {}) {
  return harness.collector.run({
    environmentId,
    idempotencyKey,
    ...options,
  });
}

async function waitFor(predicate) {
  const deadline = Date.now() + 1_000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail('timed out waiting for TikTok collector state');
}

function trend(trendType, entityKey) {
  return { trendType, entityKey };
}

test('begins a TikTok owner attempt and collects the returned frozen plan', async () => {
  const harness = loadCollector({
    targets: [{ label: 'Pencil case', keyword: 'pencil case' }],
    planMaxItems: 5,
    extractionResponses: [
      { ok: true, items: [] },
      { ok: true, items: [] },
      { ok: true, items: [] },
    ],
  });

  const result = await harness.collector.run({
    environmentId: 'local',
    idempotencyKey: 'tiktok-direct-owner-key',
    maxItems: 5,
  });

  assert.equal(result.success, true);
  assert.equal(result.attemptId, ATTEMPT_ID);
  assert.equal(result.terminalState, 'COMPLETE');
  assert.equal(
    harness.requests[0].url,
    'http://localhost:4000/api/sourcing/tiktok-creative/attempts',
  );
  assert.equal(harness.requests[0].init.method, 'POST');
  assert.equal(harness.requests[0].init.headers['Idempotency-Key'], 'tiktok-direct-owner-key');
  assert.deepEqual(JSON.parse(harness.requests[0].init.body), { maxItems: 5 });
  const terminal = harness.requests.at(-1);
  assert.equal(
    terminal.url,
    `http://localhost:4000/api/sourcing/tiktok-creative/attempts/${ATTEMPT_ID}`,
  );
  assert.equal(terminal.init.method, 'PUT');
  assert.equal(terminal.init.headers['x-source-attempt-token'], ATTEMPT_TOKEN);
  assert.deepEqual(JSON.parse(terminal.init.body).visitedTargetIds, [
    'hashtag',
    'product',
    'keyword:pencil case',
  ]);
});

test('replays custom request options after a worker restart without storing the owner token', async () => {
  const targets = [{ label: 'Pencil case', keyword: 'pencil case' }];
  const initial = loadCollector({
    targets,
    planMaxItems: 12,
    planRegionOverride: 'KR',
    extractionResponses: [{
      ok: true,
      items: Array.from({ length: 12 }, (_, index) => trend('hashtag', `first-${index}`)),
    }],
    requestHandler: ({ url, init, ownerAttempt: plan }) => {
      if (url.endsWith('/attempts') && init.method === 'POST') return response(plan());
      return response({ message: 'temporary owner failure' }, { ok: false, status: 503 });
    },
  });

  const first = await runCollector(initial, {
    idempotencyKey: 'tiktok-custom-options-key',
    options: { maxItems: 12, region: 'KR' },
  });
  assert.equal(first.terminalState, 'RUNNING');
  assert.deepEqual(
    JSON.parse(JSON.stringify(initial.chrome.storage['kiditem_tiktok_cc_request_v1:local'])),
    { attemptId: ATTEMPT_ID, idempotencyKey: 'tiktok-custom-options-key', maxItems: 12, region: 'KR' },
  );

  const replayed = loadCollector({
    targets,
    planMaxItems: 12,
    planRegionOverride: 'KR',
    existingChrome: initial.chrome,
    existingSessionRuntime: initial.sessionRuntime,
    requestHandler: ({ url, init, ownerAttempt: plan }) => {
      if (url.endsWith('/attempts') && init.method === 'POST') {
        return response(plan({ state: 'COMPLETE' }));
      }
      throw new Error(`unexpected recovery request: ${url}`);
    },
  });

  const recovered = await replayed.collector.recover('local');

  assert.deepEqual(JSON.parse(JSON.stringify(recovered)), {
    success: true,
    attemptId: ATTEMPT_ID,
    terminalState: 'COMPLETE',
  });
  assert.equal(replayed.requests.length, 1);
  assert.equal(replayed.requests[0].init.headers['Idempotency-Key'], 'tiktok-custom-options-key');
  assert.deepEqual(JSON.parse(replayed.requests[0].init.body), { maxItems: 12, region: 'KR' });
  assert.doesNotMatch(JSON.stringify(initial.chrome.storage), new RegExp(ATTEMPT_TOKEN));
  assert.doesNotMatch(JSON.stringify(initial.sessionCalls), new RegExp(ATTEMPT_TOKEN));
});

test('converges terminal begin replays without recollecting browser evidence', async () => {
  const completed = loadCollector({ beginState: 'COMPLETE' });
  const failed = loadCollector({
    beginState: 'FAILED',
    terminalResult: { collected: 0, businessDate: '2026-09-04' },
  });

  const completeResult = await runCollector(completed, { idempotencyKey: 'tiktok-complete-replay-key' });
  const failedResult = await runCollector(failed, { idempotencyKey: 'tiktok-failed-replay-key' });

  assert.deepEqual(JSON.parse(JSON.stringify(completeResult)), {
    success: true,
    attemptId: ATTEMPT_ID,
    terminalState: 'COMPLETE',
  });
  assert.equal(completed.chrome.calls.create.length, 0);
  assert.equal(completed.requests.length, 1);
  assert.equal(failedResult.success, false);
  assert.equal(failedResult.terminalState, 'FAILED');
  assert.equal(failedResult.retryRequired, true);
  assert.equal(failed.chrome.calls.create.length, 0);
  assert.equal(failed.requests.length, 1);
});

test('retries a transient terminal response loss with the same attempt, token, and payload', async () => {
  let terminalRequests = 0;
  const harness = loadCollector({
    planMaxItems: 1,
    extractionResponses: [{ ok: true, items: [trend('hashtag', 'first')] }],
    terminalResult: { collected: 1, businessDate: '2026-09-04' },
    requestHandler: ({ url, init, ownerAttempt: plan }) => {
      if (url.endsWith('/attempts') && init.method === 'POST') return response(plan());
      terminalRequests += 1;
      return terminalRequests === 1
        ? response({ message: 'temporary owner failure' }, { ok: false, status: 503 })
        : response(plan({ state: 'COMPLETE', acceptedCount: 1 }));
    },
  });

  const result = await runCollector(harness, { idempotencyKey: 'tiktok-terminal-retry-key' });
  const terminalCalls = harness.requests.filter(({ init }) => init.method === 'PUT');

  assert.equal(result.terminalState, 'COMPLETE');
  assert.equal(terminalCalls.length, 2);
  assert.equal(terminalCalls[0].url, terminalCalls[1].url);
  assert.equal(terminalCalls[0].init.body, terminalCalls[1].init.body);
  assert.equal(
    terminalCalls[0].init.headers['x-source-attempt-token'],
    terminalCalls[1].init.headers['x-source-attempt-token'],
  );
});

test('cancellation fails the owner before clearing its attempt-correlated session', async () => {
  const harness = loadCollector({
    planMaxItems: 1,
    extractionResponses: [(_message, callback) => {
      setTimeout(() => callback({ ok: true, items: [trend('hashtag', 'first')] }), 50);
    }],
    requestHandler: ({ url, init, ownerAttempt: plan }) => {
      if (url.endsWith('/attempts') && init.method === 'POST') return response(plan());
      if (url.endsWith('/fail') && init.method === 'POST') return response(plan({ state: 'FAILED' }));
      throw new Error(`unexpected cancellation request: ${url}`);
    },
  });

  const pending = runCollector(harness, { idempotencyKey: 'tiktok-cancel-key' });
  await waitFor(() => harness.sessionRuntime.sessions.getOwned(ATTEMPT_ID, 'local'));
  const cancelled = await harness.collector.cancel(ATTEMPT_ID, 'local');
  const result = await pending;
  const failure = harness.requests.find(({ url, init }) => url.endsWith('/fail') && init.method === 'POST');

  assert.deepEqual(
    JSON.parse(JSON.stringify(cancelled)),
    { success: true, cancelled: true, attemptId: ATTEMPT_ID },
  );
  assert.equal(result.terminalState, 'FAILED');
  assert.ok(failure);
  assert.equal(failure.init.headers['x-source-attempt-token'], ATTEMPT_TOKEN);
  assert.deepEqual(JSON.parse(failure.init.body), {
    code: 'COLLECTION_CANCELLED',
    message: 'TikTok collection was cancelled by the user.',
  });
  assert.equal(harness.requests.some(({ init }) => init.method === 'PUT'), false);
  assert.deepEqual(harness.sessionCalls.remove, [ATTEMPT_ID]);
});

test('keeps TikTok timeout budgets and login/passport/signup block recognition', () => {
  const { collector } = loadCollector();

  assert.match(collectorSource, /const NAVIGATION_TIMEOUT_MS = 35_000;/);
  assert.match(collectorSource, /const EXTRACTION_TIMEOUT_MS = 25_000;/);
  for (const pathname of ['/login', '/passport/sign-in', '/signup']) {
    assert.equal(collector.isBlockedUrl(`https://ads.tiktok.com${pathname}`), true, pathname);
  }
  assert.equal(collector.isBlockedUrl('https://ads.tiktok.com/business/creativecenter/inspiration'), false);
});

test('uses the frozen owner target plan in hashtag-product-keyword order', async () => {
  const harness = loadCollector({
    targets: [
      { label: 'Pencil cases', keyword: 'pencil case' },
      { label: 'slime & putty', keyword: 'slime & putty' },
    ],
    extractionResponses: [
      { ok: true, items: [] },
      { ok: true, items: [] },
      { ok: true, items: [] },
      { ok: true, items: [] },
    ],
  });

  const result = await runCollector(harness, { options: { maxItems: 5 } });

  assert.equal(result.terminalState, 'COMPLETE');
  assert.equal(harness.requests[0].url, 'http://localhost:4000/api/sourcing/tiktok-creative/attempts');
  assert.equal(harness.requests[0].init.method, 'POST');
  assert.deepEqual(
    harness.chrome.calls.update.map(({ url }) => url),
    [
      'https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en',
      'https://ads.tiktok.com/business/creativecenter/inspiration/popular/pc/en',
      'https://ads.tiktok.com/business/creativecenter/keyword-insights/pc/en?keyword=pencil%20case',
      'https://ads.tiktok.com/business/creativecenter/keyword-insights/pc/en?keyword=slime%20%26%20putty',
    ],
  );
  assert.deepEqual(
    harness.chrome.calls.messages.map(({ trendType, sourceKeyword, defaultRegion }) => ({ trendType, sourceKeyword, defaultRegion })),
    [
      { trendType: 'hashtag', sourceKeyword: null, defaultRegion: null },
      { trendType: 'product', sourceKeyword: null, defaultRegion: null },
      { trendType: 'keyword', sourceKeyword: 'pencil case', defaultRegion: null },
      { trendType: 'keyword', sourceKeyword: 'slime & putty', defaultRegion: null },
    ],
  );
  const terminal = harness.requests.at(-1);
  assert.equal(
    terminal.url,
    `http://localhost:4000/api/sourcing/tiktok-creative/attempts/${ATTEMPT_ID}`,
  );
  assert.equal(terminal.init.headers['x-source-attempt-token'], ATTEMPT_TOKEN);
  assert.deepEqual(JSON.parse(terminal.init.body), {
    region: 'US',
    items: [],
    visitedTargetIds: ['hashtag', 'product', 'keyword:pencil case', 'keyword:slime & putty'],
  });
  assert.equal(harness.requests.some(({ url }) => url.includes('/tiktok-cc-targets')), false);
});

test('uses the server-frozen twenty-seed universe and stops at the frozen maxItems', async () => {
  const targets = Array.from({ length: 20 }, (_, index) => ({
    label: `target-${index}`,
    keyword: `keyword-${index}`,
  }));
  const harness = loadCollector({
    targets,
    planMaxItems: 1,
    extractionResponses: [{ ok: true, items: [trend('hashtag', 'first')] }],
    terminalResult: { collected: 1, businessDate: '2026-09-04' },
  });

  const result = await runCollector(harness, { options: { maxItems: 1 } });
  const terminal = JSON.parse(harness.requests.at(-1).init.body);

  assert.equal(result.collected, 1);
  assert.deepEqual(harness.sessionCalls.start[0], {
    attemptId: ATTEMPT_ID,
    environmentId: 'local',
    producer: 'sourcing.tiktok_cc_trend',
  });
  assert.equal(harness.chrome.calls.messages.length, 1);
  assert.deepEqual(terminal.visitedTargetIds, ['hashtag']);
});

test('keeps optional region null during extraction, adopts captured country, and honors the frozen maxItems', async () => {
  const firstHundredAndOne = Array.from({ length: 101 }, (_, index) =>
    trend('hashtag', `entity-${index}`),
  );
  const defaultHarness = loadCollector({
    extractionResponses: [{ ok: true, region: 'ca', items: firstHundredAndOne }],
    terminalResult: { collected: 100, businessDate: '2026-09-04' },
  });

  const defaultResult = await runCollector(defaultHarness);
  const defaultTerminal = JSON.parse(defaultHarness.requests.at(-1).init.body);
  assert.equal(defaultHarness.chrome.calls.messages[0].defaultRegion, null);
  assert.equal(defaultResult.collected, 100);
  assert.equal(defaultTerminal.region, 'CA');
  assert.equal(defaultTerminal.items.length, 100);
  assert.deepEqual(JSON.parse(defaultHarness.requests[0].init.body), {});
});

test('uses US only as the terminal fallback when no captured region exists', async () => {
  const harness = loadCollector({
    extractionResponses: [{ ok: true, items: [] }, { ok: true, items: [] }],
  });

  const result = await runCollector(harness, { idempotencyKey: 'tiktok-region-fallback-key' });
  const terminal = JSON.parse(harness.requests.at(-1).init.body);

  assert.equal(result.terminalState, 'COMPLETE');
  assert.equal(terminal.region, 'US');
  assert.deepEqual(
    harness.chrome.calls.messages.map(({ defaultRegion }) => defaultRegion),
    [null, null],
  );
});

test('reinserts missing content once, preserves per-target failures, dedupes across targets, and keeps only session-safe progress', async () => {
  let reinjections = 0;
  const harness = loadCollector({
    targets: [
      { label: 'one', keyword: 'one' },
      { label: 'two', keyword: 'two' },
    ],
    ensureContentScripts: async () => {
      reinjections += 1;
      return true;
    },
    extractionResponses: [
      { ok: false, error: 'content_script_unavailable' },
      { ok: true, region: 'kr', items: [trend('hashtag', 'duplicate'), trend('product', 'shared')] },
      { ok: false, error: 'product parse failed' },
      { ok: true, items: [trend('hashtag', 'duplicate'), trend('keyword', 'unique')] },
    ],
    planMaxItems: 3,
    terminalResult: { collected: 3, businessDate: '2026-09-04' },
    terminalState: 'FAILED',
  });

  const result = await runCollector(harness, { options: { maxItems: 3 } });
  const terminal = JSON.parse(harness.requests.at(-1).init.body);

  assert.equal(reinjections, 1);
  assert.equal(harness.chrome.calls.messages.length, 4);
  assert.deepEqual(
    harness.chrome.calls.update.map(({ url }) => url),
    [
      'https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en',
      'https://ads.tiktok.com/business/creativecenter/inspiration/popular/pc/en',
      'https://ads.tiktok.com/business/creativecenter/keyword-insights/pc/en?keyword=one',
    ],
  );
  assert.deepEqual(terminal.items, [
    trend('hashtag', 'duplicate'),
    trend('product', 'shared'),
    trend('keyword', 'unique'),
  ]);
  assert.deepEqual(terminal.errors, [{ target: 'product', message: 'product parse failed' }]);
  assert.deepEqual(terminal.visitedTargetIds, ['hashtag', 'product', 'keyword:one']);
  assert.equal(result.terminalState, 'FAILED');
  assert.deepEqual(harness.sessionCalls.attachTab, [
    { runId: ATTEMPT_ID, tabId: 1, windowId: 7, closeOnCancel: true },
  ]);
  assert.equal(harness.sessionCalls.progress.at(0).total, 4);
  assert.equal(harness.sessionCalls.progress.at(-1).current, 4);
  assert.deepEqual(harness.sessionCalls.remove, [ATTEMPT_ID]);
  assert.deepEqual(harness.chrome.calls.remove, [1]);
  assert.doesNotMatch(JSON.stringify(harness.chrome.storage), new RegExp(ATTEMPT_TOKEN));
  assert.doesNotMatch(JSON.stringify(harness.sessionCalls), new RegExp(ATTEMPT_TOKEN));
  assert.doesNotMatch(JSON.stringify(result), new RegExp(ATTEMPT_TOKEN));
});
