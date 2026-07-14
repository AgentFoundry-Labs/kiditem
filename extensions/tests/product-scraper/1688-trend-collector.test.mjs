import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const collectorPath = path.resolve('extensions/product-scraper/1688-trend-collector.js');
const collectorSource = fs.readFileSync(collectorPath, 'utf8');

function createFakeChrome(sendMessageImpl) {
  const values = {};
  const tabs = new Map();
  const calls = { create: [], update: [], remove: [], messages: [] };
  let nextTabId = 1;

  const chrome = {
    runtime: { lastError: null },
    storage: {
      local: {
        get(key, cb) {
          cb({ [key]: values[key] });
        },
        set(next, cb) {
          Object.assign(values, next);
          cb?.();
        },
      },
    },
    tabs: {
      create(properties, cb) {
        const tab = { id: nextTabId++, url: properties.url, status: 'complete', active: properties.active };
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
          cb(null);
          chrome.runtime.lastError = null;
          return;
        }
        Object.assign(tab, properties, { status: 'complete' });
        calls.update.push({ tabId, ...properties });
        cb({ ...tab });
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
  vm.runInContext(collectorSource, context, { filename: collectorPath });
  return context.ProductScraper1688Trend.create({
    chrome: fakeChrome,
    getBackendRequestConfig: async () => backendConfig,
    ensureContentScripts: async () => true,
  });
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
  const fetchCalls = [];
  const collector = loadCollector({
    fakeChrome: fake.chrome,
    backendConfig: {
      ok: true,
      base: 'http://localhost:4000/api/sourcing/extension',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
    },
    fetchImpl: async (url, init) => {
      fetchCalls.push({ url, init });
      return {
        ok: true,
        json: async () => ({ collected: 3, businessDate: '2026-07-13' }),
      };
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

  assert.equal(fetchCalls[0].url, 'http://localhost:4000/api/sourcing/extension/trend/1688-results');
  const payload = JSON.parse(fetchCalls[0].init.body);
  assert.equal(payload.runId, started.runId);
  assert.deepEqual(payload.keywords.map((entry) => entry.keyword), ['文具', '玩具']);
  assert.deepEqual(payload.keywords.map((entry) => entry.items.length), [2, 1]);
});

test('keeps a verification tab open and reuses it after the user verifies', async () => {
  let verificationRequired = true;
  const fake = createFakeChrome(({ cb, tabs, tabId }) => {
    if (verificationRequired) {
      const tab = tabs.get(tabId);
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
  const collector = loadCollector({
    fakeChrome: fake.chrome,
    backendConfig: { ok: true, base: 'http://localhost:4000/api/sourcing/extension', headers: {} },
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ collected: 1, businessDate: '2026-07-13' }),
    }),
  });

  const first = await collector.start(['文具'], 20);
  const blocked = await waitForStatus(collector, first.runId, 'verification_required');
  assert.match(blocked.verificationUrl, /action=captcha/);
  assert.equal(fake.calls.create.length, 1);
  assert.equal(fake.calls.remove.length, 0);

  verificationRequired = false;
  const resumed = await collector.start(['文具'], 20);
  const completed = await waitForStatus(collector, resumed.runId, 'completed');
  assert.equal(completed.collected, 1);
  assert.equal(fake.calls.create.length, 1);
  assert.equal(fake.calls.remove.length, 1);
});

test('fails before opening 1688 when the sourcing ingest token is unavailable', async () => {
  const fake = createFakeChrome(({ cb }) => cb({ ok: true, items: [] }));
  const collector = loadCollector({
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
  const collector = loadCollector({
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
});
