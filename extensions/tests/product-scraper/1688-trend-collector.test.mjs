import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const collectorPath = path.resolve('extensions/product-scraper/1688-trend-collector.js');
const collectorSource = fs.readFileSync(collectorPath, 'utf8');
const sessionPath = path.resolve('extensions/product-scraper/collection-session.js');
const sessionSource = fs.readFileSync(sessionPath, 'utf8');

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
          id: nextTabId++,
          windowId: 7,
          url: properties.url,
          status: 'complete',
          active: properties.active,
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
    scripting: {
      executeScript: async () => [],
    },
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

async function waitForStatus(collector, runId, expected) {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const status = await collector.getStatus(runId);
    if (status.status === expected) return status;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(`timed out waiting for ${expected}`);
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

test('collects keywords sequentially in one Chrome tab and preserves backend completion data', async () => {
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
      base: 'http://localhost:4000/api/sourcing/extension',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      request: async (url, init) => {
        requestCalls.push({ url, init });
        return {
          ok: true,
          json: async () => ({ collected: 3, businessDate: '2026-07-13' }),
        };
      },
    },
    fetchImpl: async () => {
      throw new Error('KidItem ingest must use backendConfig.request');
    },
  });

  const started = await collector.start(['文具', '玩具'], 2);
  assert.equal(started.success, true);
  assert.equal(started.status, 'running');

  const completed = await waitForStatus(collector, started.runId, 'completed');
  assert.equal(completed.collected, 3);
  assert.equal(completed.businessDate, '2026-07-13');
  assert.equal(completed.tabId, undefined);
  assert.equal(fake.calls.create.length, 1);
  assert.equal(fake.calls.messages.length, 2);
  assert.equal(fake.calls.remove.length, 1);
  assert.match(fake.calls.update[0].url, /keywords=%E6%96%87%E5%85%B7&charset=utf8$/);
  assert.match(fake.calls.update[1].url, /keywords=%E7%8E%A9%E5%85%B7&charset=utf8$/);

  assert.equal(requestCalls[0].url, 'http://localhost:4000/api/sourcing/extension/trend/1688-results');
  const payload = JSON.parse(requestCalls[0].init.body);
  assert.equal(payload.runId, started.runId);
  assert.deepEqual(payload.keywords.map((entry) => entry.keyword), ['文具', '玩具']);
  assert.deepEqual(payload.keywords.map((entry) => entry.items.length), [2, 1]);

  const session = await sessions.get(started.runId);
  assert.equal(session.status, 'succeeded');
  assert.equal(session.producer, 'sourcing.1688_trend');
  assert.equal(session.restartStrategy, 'extension');
  assert.deepEqual(
    JSON.parse(JSON.stringify(session.inputIdentity)),
    { keywordCount: 2, maxResults: 2 },
  );
});

test('keeps CAPTCHA attention inactive until the generic open command and restarts from keyword zero', async () => {
  let verificationRequired = true;
  const fake = createFakeChrome(({ cb, tabs, tabId }) => {
    const tab = tabs.get(tabId);
    if (verificationRequired && /%E7%8E%A9%E5%85%B7/.test(tab.url)) {
      tab.url = 'https://s.1688.com/punish?action=captcha';
      cb({
        ok: false,
        status: 'verification_required',
        verificationUrl: tab.url,
      });
      return;
    }
    cb({ ok: true, items: [item('300000001', 1)] });
  });
  const { collector, sessions } = loadCollector({
    fakeChrome: fake.chrome,
    backendConfig: { ok: true, base: 'http://localhost:4000/api/sourcing/extension', headers: {} },
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ collected: 2, businessDate: '2026-07-13' }),
    }),
  });

  const first = await collector.start(['文具', '玩具'], 20);
  const blocked = await waitForStatus(collector, first.runId, 'attention_required');
  assert.match(blocked.verificationUrl, /action=captcha/);
  assert.equal(fake.calls.create.length, 1);
  assert.deepEqual(fake.calls.create[0], { url: 'about:blank', active: false });
  assert.equal(fake.calls.remove.length, 0);
  assert.equal(fake.calls.update.some((call) => call.active === true), false);
  assert.equal(fake.calls.focus.length, 0);

  const attention = await sessions.get(first.runId);
  assert.equal(attention.status, 'attention_required');
  assert.equal(attention.attention.reason, 'captcha');
  assert.equal(attention.attention.canOpenTab, true);

  await sessions.openAttentionTab(first.runId);
  assert.equal(fake.calls.update.at(-1).active, true);
  assert.deepEqual(fake.calls.focus, [{ windowId: 7, focused: true }]);

  verificationRequired = false;
  const resumed = await collector.restart(first.runId);
  assert.equal(resumed.runId, first.runId);
  const completed = await waitForStatus(collector, first.runId, 'completed');
  assert.equal(completed.collected, 2);
  assert.equal(fake.calls.create.length, 1);
  assert.equal(fake.calls.remove.length, 1);
  const firstKeywordNavigations = fake.calls.update.filter((call) =>
    /keywords=%E6%96%87%E5%85%B7/.test(call.url || ''),
  );
  assert.equal(firstKeywordNavigations.length, 2);
  const restartedSession = await sessions.get(first.runId);
  assert.equal(restartedSession.attempt, 2);
  assert.equal(restartedSession.status, 'succeeded');
});

test('fails before opening 1688 when the common Supabase token is unavailable', async () => {
  const fake = createFakeChrome(({ cb }) => cb({ ok: true, items: [] }));
  const { collector } = loadCollector({
    fakeChrome: fake.chrome,
    backendConfig: { ok: false, error: 'KidItem 웹 앱에서 로그인 후 다시 시도해주세요.' },
    fetchImpl: async () => assert.fail('fetch must not run'),
  });

  const started = await collector.start(['文具'], 20);

  assert.equal(started.success, false);
  assert.match(started.error, /로그인/);
  assert.equal(fake.calls.create.length, 0);
});

test('cancels an active run and exposes the cancelled status', async () => {
  const fake = createFakeChrome(({ cb }) => {
    setTimeout(() => cb({ ok: true, items: [item('400000001', 1)] }), 50);
  });
  const { collector, sessions } = loadCollector({
    fakeChrome: fake.chrome,
    backendConfig: { ok: true, base: 'http://localhost:4000/api/sourcing/extension', headers: {} },
    fetchImpl: async () => assert.fail('cancelled run must not post'),
  });

  const started = await collector.start(['文具'], 20);
  while (fake.calls.messages.length === 0) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  const cancelled = await collector.cancel(started.runId);
  const status = await collector.getStatus(started.runId);

  assert.equal(cancelled.status, 'cancelled');
  assert.equal(status.status, 'cancelled');
  assert.equal((await sessions.get(started.runId)).status, 'cancelled');
});
