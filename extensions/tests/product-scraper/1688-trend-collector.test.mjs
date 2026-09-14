import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const collectorPath = path.resolve('extensions/kiditem-os/background/sourcing/1688-trend-collector.js');
const collectorSource = fs.readFileSync(collectorPath, 'utf8');
const sessionPath = path.resolve('extensions/kiditem-os/background/collection-session.js');
const sessionSource = fs.readFileSync(sessionPath, 'utf8');
const ATTEMPT_ID = '00000000-0000-4000-8000-000000001688';
const ATTEMPT_TOKEN = '10000000-0000-4000-8000-000000001688';

function response(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function attemptPlan(state = 'RUNNING') {
  return {
    attemptId: ATTEMPT_ID,
    ...(state === 'RUNNING' ? { attemptToken: ATTEMPT_TOKEN } : {}),
    state,
    expiresAt: '2026-09-04T04:00:00.000Z',
    plan: {
      source: '1688.hot_product',
      keywords: ['문구', '玩具'],
    },
  };
}

function createFakeChrome(sendMessageImpl) {
  const values = {};
  const tabs = new Map();
  const calls = { create: [], update: [], remove: [], messages: [], focus: [] };
  let nextTabId = 1;

  const chrome = {
    runtime: { lastError: null },
    storage: {
      local: {
        get(key, cb) {
          const result = typeof key === 'string'
            ? { [key]: values[key] }
            : { ...values };
          if (cb) cb(result);
          else return Promise.resolve(result);
        },
        set(next, cb) {
          Object.assign(values, next);
          if (cb) cb();
          else return Promise.resolve();
        },
      },
    },
    tabs: {
      create(properties, cb) {
        const tab = {
          id: nextTabId++, windowId: 7, url: properties.url, status: 'complete', active: properties.active,
        };
        tabs.set(tab.id, tab);
        calls.create.push({ ...properties });
        cb({ ...tab });
      },
      get(tabId, cb) {
        cb(tabs.has(tabId) ? { ...tabs.get(tabId) } : null);
      },
      update(tabId, properties, cb) {
        const tab = tabs.get(tabId);
        if (!tab) {
          chrome.runtime.lastError = { message: 'No tab' };
          if (cb) cb(null);
          chrome.runtime.lastError = null;
          return cb ? undefined : Promise.resolve(null);
        }
        Object.assign(tab, properties, { status: 'complete' });
        calls.update.push({ tabId, ...properties });
        if (cb) cb({ ...tab });
        else return Promise.resolve({ ...tab });
      },
      sendMessage(tabId, message, cb) {
        calls.messages.push({ tabId, message });
        sendMessageImpl({ tabId, message, cb, tabs });
      },
      remove(tabId, cb) {
        calls.remove.push(tabId);
        tabs.delete(tabId);
        cb?.();
      },
      query: async () => [],
    },
    scripting: { executeScript: async () => [] },
    windows: {
      update(windowId, properties, cb) {
        calls.focus.push({ windowId, ...properties });
        if (cb) cb({ id: windowId });
        else return Promise.resolve({ id: windowId });
      },
    },
  };

  return { chrome, calls, tabs, values };
}

function loadCollector({ fakeChrome, fetchImpl, backendConfig }) {
  const context = {
    URL,
    clearTimeout,
    console,
    crypto: webcrypto,
    Date,
    fetch: fetchImpl,
    Math,
    Promise,
    setTimeout,
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.resolve('extensions/kiditem-os/background/sourcing/source-attempt-wire.js'), 'utf8'), context);
  vm.runInContext(sessionSource, context, { filename: sessionPath });
  vm.runInContext(collectorSource, context, { filename: collectorPath });
  const sessions = context.KidItemCollectionSession.create({
    chrome: fakeChrome,
    storageKey: 'kiditem_collection_sessions',
    webUrlPatterns: ['http://localhost:3000/*'],
  });
  const collector = context.ProductScraper1688Trend.create({
    chrome: fakeChrome,
    getBackendRequestConfig: async () => backendConfig,
    ensureContentScripts: async () => true,
    sessions,
  });
  return { collector, sessions };
}

async function waitFor(predicate) {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const result = await predicate();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail('timed out waiting for expected collection state');
}

const item = (offerId, rank) => ({
  offerId,
  monthlySales: 1000,
  rank,
  title: `상품 ${offerId}`,
  priceCny: 1.5,
  supplierName: '공급사',
  imageUrl: 'https://cbu01.alicdn.com/item.jpg',
  sourceUrl: `https://detail.1688.com/offer/${offerId}.html`,
});

test('begins an owner attempt, collects only the frozen plan, and completes through the fenced direct route', async () => {
  let extractionIndex = 0;
  const fake = createFakeChrome(({ cb }) => {
    const items = extractionIndex++ === 0
      ? [item('100000001', 1), item('100000002', 2)]
      : [item('200000001', 1)];
    cb({ ok: true, items });
  });
  const requestCalls = [];
  const { collector, sessions } = loadCollector({
    fakeChrome: fake.chrome,
    backendConfig: {
      ok: true,
      apiBase: 'http://localhost:4000/api',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      request: async (url, init) => {
        requestCalls.push({ url, init });
        if (init.method === 'POST' && url.endsWith('/attempts')) return response(attemptPlan());
        return response({ ...attemptPlan('COMPLETE'), acceptedCount: 3 });
      },
    },
    fetchImpl: async () => assert.fail('owner requests must use backendConfig.request'),
  });

  const result = await collector.run({ environmentId: 'local', idempotencyKey: '1688-direct-key' });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    success: true,
    attemptId: ATTEMPT_ID,
    terminalState: 'COMPLETE',
    collected: 3,
  });
  assert.equal(fake.calls.create.length, 1);
  assert.equal(fake.calls.messages.length, 2);
  assert.equal(fake.calls.remove.length, 1);
  assert.match(fake.calls.update[0].url, /keywords=%EB%AC%B8%EA%B5%AC&charset=utf8$/);
  assert.match(fake.calls.update[1].url, /keywords=%E7%8E%A9%E5%85%B7&charset=utf8$/);

  assert.equal(requestCalls[0].url, 'http://localhost:4000/api/sourcing/1688-trends/attempts');
  assert.equal(requestCalls[0].init.headers['Idempotency-Key'], '1688-direct-key');
  assert.equal(requestCalls[0].init.body, undefined);
  assert.equal(
    requestCalls[1].url,
    `http://localhost:4000/api/sourcing/1688-trends/attempts/${ATTEMPT_ID}`,
  );
  assert.equal(requestCalls[1].init.method, 'PUT');
  assert.equal(requestCalls[1].init.headers['x-source-attempt-token'], ATTEMPT_TOKEN);
  const payload = JSON.parse(requestCalls[1].init.body);
  assert.deepEqual(payload.keywords.map((entry) => entry.keyword), ['문구', '玩具']);
  assert.deepEqual(payload.keywords.map((entry) => entry.items.length), [2, 1]);
  assert.equal(await sessions.get(ATTEMPT_ID), null);
});

test('keeps the frozen 1688 search text and order exact, including its legacy error field mapping', async () => {
  let extractionIndex = 0;
  const fake = createFakeChrome(({ cb }) => {
    extractionIndex += 1;
    cb(extractionIndex === 1
      ? { ok: false, error: 'supplier response rejected' }
      : { ok: true, items: [item('700000001', 1)] });
  });
  const requestCalls = [];
  const frozenKeywords = ['A Pencil', 'MiXeD Case'];
  const { collector } = loadCollector({
    fakeChrome: fake.chrome,
    backendConfig: {
      ok: true,
      apiBase: 'http://localhost:4000/api',
      headers: {},
      request: async (url, init) => {
        requestCalls.push({ url, init });
        if (init.method === 'POST' && url.endsWith('/attempts')) {
          return response({
            ...attemptPlan(),
            plan: { source: '1688.hot_product', keywords: frozenKeywords },
          });
        }
        return response({ ...attemptPlan('COMPLETE'), acceptedCount: 1 });
      },
    },
    fetchImpl: async () => assert.fail('owner requests must use backendConfig.request'),
  });

  await collector.run({ environmentId: 'local', idempotencyKey: '1688-legacy-text-key' });

  assert.equal(
    fake.calls.update[0].url,
    'https://s.1688.com/selloffer/offer_search.htm?keywords=A%20Pencil&charset=utf8',
  );
  assert.equal(
    fake.calls.update[1].url,
    'https://s.1688.com/selloffer/offer_search.htm?keywords=MiXeD%20Case&charset=utf8',
  );
  const terminal = requestCalls.find((call) => call.init.method === 'PUT');
  assert.ok(terminal);
  assert.deepEqual(JSON.parse(terminal.init.body), {
    keywords: [
      { keyword: 'A Pencil', items: [] },
      { keyword: 'MiXeD Case', items: [item('700000001', 1)] },
    ],
    errors: [{ keyword: 'A Pencil', message: 'supplier response rejected' }],
  });
});

test('keeps the legacy empty target plan as no browser work and completes the attempt', async () => {
  const fake = createFakeChrome(({ cb }) => cb({ ok: true, items: [] }));
  const requestCalls = [];
  const { collector } = loadCollector({
    fakeChrome: fake.chrome,
    backendConfig: {
      ok: true,
      apiBase: 'http://localhost:4000/api',
      headers: {},
      request: async (url, init) => {
        requestCalls.push({ url, init });
        if (init.method === 'POST' && url.endsWith('/attempts')) {
          return response({
            ...attemptPlan(),
            plan: { source: '1688.hot_product', keywords: [] },
          });
        }
        return response({
          ...attemptPlan('COMPLETE'),
          plan: { source: '1688.hot_product', keywords: [] },
          acceptedCount: 0,
        });
      },
    },
    fetchImpl: async () => assert.fail('fetch must not run'),
  });

  const result = await collector.run({ environmentId: 'local', idempotencyKey: 'empty-key' });

  assert.equal(result.terminalState, 'COMPLETE');
  assert.equal(fake.calls.create.length, 0);
  assert.equal(fake.calls.messages.length, 0);
  const terminal = requestCalls.find((call) => call.init.method === 'PUT');
  assert.ok(terminal);
  assert.deepEqual(JSON.parse(terminal.init.body), { keywords: [], errors: [] });
});

test('converges a replayed terminal plan without opening a browser tab', async () => {
  const fake = createFakeChrome(({ cb }) => cb({ ok: true, items: [] }));
  const requestCalls = [];
  const { collector } = loadCollector({
    fakeChrome: fake.chrome,
    backendConfig: {
      ok: true,
      apiBase: 'http://localhost:4000/api',
      headers: {},
      request: async (url, init) => {
        requestCalls.push({ url, init });
        return response(attemptPlan('COMPLETE'));
      },
    },
    fetchImpl: async () => assert.fail('fetch must not run'),
  });

  const result = await collector.run({ environmentId: 'local', idempotencyKey: 'replay-key' });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    success: true,
    attemptId: ATTEMPT_ID,
    terminalState: 'COMPLETE',
  });
  assert.equal(requestCalls.length, 1);
  assert.equal(fake.calls.create.length, 0);
});

test('requires a new user retry after a replayed failed owner attempt', async () => {
  const fake = createFakeChrome(({ cb }) => cb({ ok: true, items: [] }));
  const { collector } = loadCollector({
    fakeChrome: fake.chrome,
    backendConfig: {
      ok: true,
      apiBase: 'http://localhost:4000/api',
      headers: {},
      request: async () => response(attemptPlan('FAILED')),
    },
    fetchImpl: async () => assert.fail('fetch must not run'),
  });

  const result = await collector.run({ environmentId: 'local', idempotencyKey: 'failed-key' });

  assert.equal(result.success, false);
  assert.equal(result.attemptId, ATTEMPT_ID);
  assert.equal(result.terminalState, 'FAILED');
  assert.equal(result.retryRequired, true);
  assert.equal(fake.calls.create.length, 0);
});

test('retries a transient direct terminal failure with the same attempt and payload', async () => {
  const fake = createFakeChrome(({ cb }) => cb({ ok: true, items: [item('400000001', 1)] }));
  let terminalRequests = 0;
  const requestCalls = [];
  const { collector } = loadCollector({
    fakeChrome: fake.chrome,
    backendConfig: {
      ok: true,
      apiBase: 'http://localhost:4000/api',
      headers: {},
      request: async (url, init) => {
        requestCalls.push({ url, init });
        if (init.method === 'POST' && url.endsWith('/attempts')) return response({
          ...attemptPlan(),
          plan: { source: '1688.hot_product', keywords: ['문구'] },
        });
        terminalRequests += 1;
        return terminalRequests === 1
          ? response({ message: 'temporary owner failure' }, { ok: false, status: 503 })
          : response({ ...attemptPlan('COMPLETE'), acceptedCount: 1 });
      },
    },
    fetchImpl: async () => assert.fail('fetch must not run'),
  });

  const result = await collector.run({ environmentId: 'local', idempotencyKey: 'retry-terminal-key' });

  assert.equal(result.terminalState, 'COMPLETE');
  const terminalCalls = requestCalls.filter((call) => call.init.method === 'PUT');
  assert.equal(terminalCalls.length, 2);
  assert.equal(terminalCalls[0].url, terminalCalls[1].url);
  assert.equal(terminalCalls[0].init.body, terminalCalls[1].init.body);
  assert.equal(
    terminalCalls[0].init.headers['x-source-attempt-token'],
    terminalCalls[1].init.headers['x-source-attempt-token'],
  );
});

test('cancellation sends a bounded FAILED terminal before removing its local session', async () => {
  const fake = createFakeChrome(({ cb }) => {
    setTimeout(() => cb({ ok: true, items: [item('500000001', 1)] }), 50);
  });
  const requestCalls = [];
  const { collector, sessions } = loadCollector({
    fakeChrome: fake.chrome,
    backendConfig: {
      ok: true,
      apiBase: 'http://localhost:4000/api',
      headers: {},
      request: async (url, init) => {
        requestCalls.push({ url, init });
        if (init.method === 'POST' && url.endsWith('/attempts')) return response({
          ...attemptPlan(),
          plan: { source: '1688.hot_product', keywords: ['문구'] },
        });
        return response(attemptPlan('FAILED'));
      },
    },
    fetchImpl: async () => assert.fail('fetch must not run'),
  });

  const pending = collector.run({ environmentId: 'local', idempotencyKey: 'cancel-key' });
  await waitFor(async () => (await sessions.get(ATTEMPT_ID)) !== null);

  const cancelled = await collector.cancel(ATTEMPT_ID, 'local');
  const result = await pending;

  assert.equal(cancelled.cancelled, true);
  assert.equal(result.terminalState, 'FAILED');
  const failure = requestCalls.find((call) => call.init.method === 'POST' && call.url.endsWith('/fail'));
  assert.ok(failure);
  assert.equal(failure.init.headers['x-source-attempt-token'], ATTEMPT_TOKEN);
  assert.match(failure.init.body, /COLLECTION_CANCELLED/);
  assert.equal(await sessions.get(ATTEMPT_ID), null);
});

test('cancels an in-flight extraction without replaying begin or submitting COMPLETE afterwards', async () => {
  let releaseExtraction;
  let releaseFailure;
  const fake = createFakeChrome(({ cb }) => { releaseExtraction = cb; });
  const requestCalls = [];
  const { collector, sessions } = loadCollector({
    fakeChrome: fake.chrome,
    backendConfig: {
      ok: true,
      apiBase: 'http://localhost:4000/api',
      headers: {},
      request: async (url, init) => {
        requestCalls.push({ url, init });
        if (url.endsWith('/attempts')) return response({
          ...attemptPlan(),
          plan: { source: '1688.hot_product', keywords: ['문구'] },
        });
        if (url.endsWith('/fail')) return new Promise((resolve) => { releaseFailure = resolve; });
        return response({ message: 'SOURCE_ATTEMPT_TERMINAL' }, { ok: false, status: 409 });
      },
    },
    fetchImpl: async () => assert.fail('fetch must not run'),
  });

  let settled = false;
  const pending = collector.run({ environmentId: 'local', idempotencyKey: 'in-flight-cancel' })
    .then((result) => { settled = true; return result; });
  await waitFor(() => releaseExtraction);
  const cancelling = collector.cancel(ATTEMPT_ID, 'local');
  await waitFor(() => releaseFailure);
  releaseExtraction({ ok: true, items: [item('500000002', 1)] });
  await new Promise((resolve) => setImmediate(resolve));
  const settledBeforeOwnerTerminal = settled;
  releaseFailure(response(attemptPlan('FAILED')));
  const cancelled = await cancelling;
  const result = await pending;

  assert.equal(settledBeforeOwnerTerminal, false);
  assert.equal(cancelled.cancelled, true);
  assert.equal(result.terminalState, 'FAILED');
  assert.equal(requestCalls.filter(({ init }) => init.method === 'PUT').length, 0);
  assert.equal(requestCalls.filter(({ url }) => url.endsWith('/attempts')).length, 1);
  assert.equal(requestCalls.filter(({ url }) => url.endsWith('/fail')).length, 1);
  assert.equal(fake.tabs.size, 0);
  assert.equal(await sessions.get(ATTEMPT_ID), null);
});

test('does not begin a source attempt when the common KidItem session token is unavailable', async () => {
  const fake = createFakeChrome(({ cb }) => cb({ ok: true, items: [] }));
  const { collector } = loadCollector({
    fakeChrome: fake.chrome,
    backendConfig: { ok: false, error: 'KidItem 웹 앱에서 로그인 후 다시 시도해주세요.' },
    fetchImpl: async () => assert.fail('fetch must not run'),
  });

  const result = await collector.run({ environmentId: 'local', idempotencyKey: 'no-auth-key' });

  assert.equal(result.success, false);
  assert.match(result.error, /로그인/);
  assert.equal(fake.calls.create.length, 0);
});

test('recovers a lost terminal response with the original request key and terminal replay', async () => {
  const fake = createFakeChrome(({ cb }) => cb({ ok: true, items: [item('600000001', 1)] }));
  const requestCalls = [];
  let beginRequests = 0;
  const { collector, sessions } = loadCollector({
    fakeChrome: fake.chrome,
    backendConfig: {
      ok: true,
      apiBase: 'http://localhost:4000/api',
      headers: {},
      request: async (url, init) => {
        requestCalls.push({ url, init });
        if (init.method === 'POST' && url.endsWith('/attempts')) {
          beginRequests += 1;
          return response(attemptPlan(beginRequests === 1 ? 'RUNNING' : 'COMPLETE'));
        }
        return response({ message: 'owner temporarily unavailable' }, { ok: false, status: 503 });
      },
    },
    fetchImpl: async () => assert.fail('fetch must not run'),
  });

  const first = await collector.run({
    environmentId: 'local',
    idempotencyKey: 'original-response-loss-key',
  });

  assert.equal(first.terminalState, 'RUNNING');
  assert.ok(await sessions.get(ATTEMPT_ID));
  const correlation = fake.values['kiditem_1688_trend_request_v1:local'];
  assert.deepEqual(JSON.parse(JSON.stringify(correlation)), {
    attemptId: ATTEMPT_ID,
    idempotencyKey: 'original-response-loss-key',
  });
  assert.equal(correlation.attemptToken, undefined);

  const recovered = await collector.run({
    environmentId: 'local',
    idempotencyKey: 'new-user-key-must-not-replace-pending-request',
  });

  assert.deepEqual(JSON.parse(JSON.stringify(recovered)), {
    success: true,
    attemptId: ATTEMPT_ID,
    terminalState: 'COMPLETE',
  });
  const begins = requestCalls.filter((call) => call.init.method === 'POST' && call.url.endsWith('/attempts'));
  assert.deepEqual(begins.map((call) => call.init.headers['Idempotency-Key']), [
    'original-response-loss-key',
    'original-response-loss-key',
  ]);
  assert.equal(fake.calls.create.length, 1);
  assert.equal(await sessions.get(ATTEMPT_ID), null);
});

// KID-147: a restarted worker continues a collection only for the same attempt
// whose lease has not passed; a replay that differs leaves it for its lease or
// an operator stop.
test('a replayed attempt continues only while it is the same attempt with a live lease', async () => {
  const otherAttemptId = '00000000-0000-4000-8000-000000001689';
  const liveLease = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  for (const scenario of ['expired lease', 'another attempt', 'live lease']) {
    const fake = createFakeChrome(({ cb }) => cb({ ok: true, items: [item('900000001', 1)] }));
    let phase = 'first';
    const recoveryMethods = [];
    const { collector, sessions } = loadCollector({
      fakeChrome: fake.chrome,
      backendConfig: {
        ok: true,
        apiBase: 'http://localhost:4000/api',
        headers: {},
        request: async (url, init) => {
          if (phase === 'recovery') recoveryMethods.push(init.method);
          if (init.method === 'POST' && url.endsWith('/attempts')) {
            const replay = { ...attemptPlan('RUNNING'), expiresAt: liveLease };
            if (phase === 'first') return response(replay);
            if (scenario === 'expired lease') return response({ ...replay, expiresAt: '2026-01-01T00:00:00.000Z' });
            if (scenario === 'another attempt') return response({ ...replay, attemptId: otherAttemptId });
            return response(replay);
          }
          if (phase === 'recovery' && init.method === 'PUT') return response(attemptPlan('COMPLETE'));
          return response({ message: 'owner temporarily unavailable' }, { ok: false, status: 503 });
        },
      },
      fetchImpl: async () => assert.fail('fetch must not run'),
    });

    const first = await collector.run({ environmentId: 'local', idempotencyKey: `1688-replay-${scenario}` });
    assert.equal(first.terminalState, 'RUNNING', scenario);
    const tabsBefore = fake.calls.create.length;
    phase = 'recovery';

    const recovered = await collector.recover('local');

    if (scenario === 'live lease') {
      assert.equal(recovered.terminalState, 'COMPLETE', scenario);
      assert.equal(fake.calls.create.length, tabsBefore + 1, 'the same live attempt continues');
    } else {
      assert.equal(recovered.errorCode, 'SOURCE_ATTEMPT_NOT_CONTINUED', scenario);
      assert.equal(recovered.terminalState, 'RUNNING', scenario);
      assert.equal(fake.calls.create.length, tabsBefore, `${scenario}: nothing is collected`);
      assert.deepEqual(recoveryMethods, ['POST'], `${scenario}: only the begin was replayed`);
      assert.ok(await sessions.get(ATTEMPT_ID), `${scenario}: the running attempt keeps its session`);
    }
  }
});
