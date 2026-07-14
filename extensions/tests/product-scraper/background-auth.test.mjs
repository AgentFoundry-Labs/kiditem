import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const backgroundPath = path.resolve('extensions/product-scraper/background.js');
const backgroundSource = fs.readFileSync(backgroundPath, 'utf8');
const trendCollectorPath = path.resolve('extensions/product-scraper/1688-trend-collector.js');
const trendCollectorSource = fs.readFileSync(trendCollectorPath, 'utf8');
const liveCommerceCollectorPath = path.resolve('extensions/product-scraper/live-commerce-collector.js');
const liveCommerceCollectorSource = fs.readFileSync(liveCommerceCollectorPath, 'utf8');

function createStorage(initial = {}, notify = () => {}) {
  const values = { ...initial };
  return {
    values,
    get(keys, cb) {
      if (keys == null) {
        cb({ ...values });
        return;
      }
      if (typeof keys === 'string') {
        cb({ [keys]: values[keys] });
        return;
      }
      if (Array.isArray(keys)) {
        cb(Object.fromEntries(keys.map((key) => [key, values[key]])));
        return;
      }
      cb(
        Object.fromEntries(
          Object.entries(keys).map(([key, fallback]) => [
            key,
            values[key] === undefined ? fallback : values[key],
          ]),
        ),
      );
    },
    set(next, cb) {
      const changes = Object.fromEntries(
        Object.entries(next).map(([key, value]) => [
          key,
          { oldValue: values[key], newValue: value },
        ]),
      );
      Object.assign(values, next);
      notify(changes, 'local');
      cb?.();
    },
    remove(keys, cb) {
      const changes = {};
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        changes[key] = { oldValue: values[key], newValue: undefined };
        delete values[key];
      }
      notify(changes, 'local');
      cb?.();
    },
  };
}

function loadBackground(initialStorage = {}, plannedResponses = []) {
  const storageChangeListeners = [];
  const storage = createStorage(initialStorage, (changes, areaName) => {
    for (const listener of storageChangeListeners) listener(changes, areaName);
  });
  const externalListeners = [];
  const runtimeListeners = [];
  const connectListeners = [];
  const installListeners = [];
  const fetchCalls = [];
  const dispatchedEvents = [];

  const context = {
    chrome: {
      runtime: {
        id: 'product-scraper-extension',
        getManifest: () => ({ version: '2.0.0' }),
        onInstalled: { addListener: (listener) => installListeners.push(listener) },
        onConnect: { addListener: (listener) => connectListeners.push(listener) },
        onMessage: { addListener: (listener) => runtimeListeners.push(listener) },
        onMessageExternal: { addListener: (listener) => externalListeners.push(listener) },
        lastError: null,
      },
      scripting: {
        executeScript: async ({ args }) => {
          if (Array.isArray(args) && typeof args[0] === 'string') {
            dispatchedEvents.push(args[0]);
          }
          return [];
        },
      },
      storage: {
        local: storage,
        onChanged: {
          addListener: (listener) => storageChangeListeners.push(listener),
          removeListener: (listener) => {
            const index = storageChangeListeners.indexOf(listener);
            if (index >= 0) storageChangeListeners.splice(index, 1);
          },
        },
      },
      tabs: {
        get: async () => ({ url: 'https://detail.1688.com/offer/607635921546.html' }),
        query: async () => [{ id: 3000, url: 'http://localhost:3000/dashboard' }],
        sendMessage: () => {},
      },
    },
    console,
    clearTimeout,
    fetch: async (url, init) => {
      fetchCalls.push({ url, init });
      const planned = plannedResponses.shift() ?? { status: 200 };
      const status = planned.status ?? 200;
      return {
        ok: status >= 200 && status < 300,
        status,
        text: async () => planned.body ?? '',
        json: async () => planned.json ?? {},
      };
    },
    Headers,
    setTimeout,
    URL,
  };

  vm.createContext(context);
  context.importScripts = (file) => {
    if (file === '1688-trend-collector.js') {
      vm.runInContext(trendCollectorSource, context, { filename: trendCollectorPath });
      return;
    }
    if (file === 'live-commerce-collector.js') {
      vm.runInContext(liveCommerceCollectorSource, context, {
        filename: liveCommerceCollectorPath,
      });
      return;
    }
    assert.fail(`Unexpected background import: ${file}`);
  };
  vm.runInContext(backgroundSource, context, { filename: backgroundPath });

  return {
    context,
    connectListeners,
    externalListeners,
    dispatchedEvents,
    fetchCalls,
    installListeners,
    storage: storage.values,
    storageApi: storage,
  };
}

function sendExternal(listener, message, sender = { url: 'http://localhost:3000/product-pipeline/collected-products' }) {
  return new Promise((resolve) => {
    listener(message, sender, resolve);
  });
}

async function waitForCallCount(calls, count) {
  const deadline = Date.now() + 1000;
  while (calls.length < count && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  assert.equal(calls.length, count);
}

test('stores the common KidItem Supabase token sent by the logged-in web app', async () => {
  const env = loadBackground({
    kiditem_sourcing_ingest_token: 'legacy-token',
    kiditem_sourcing_ingest_token_expires_at: '2026-05-21T12:30:00.000Z',
  });

  assert.equal(env.externalListeners.length, 1);
  const response = await sendExternal(env.externalListeners[0], {
    action: 'setAuthToken',
    token: 'token-from-web',
  });

  assert.equal(response?.success, true);
  assert.equal(env.storage.kiditem_auth_token, 'token-from-web');
  assert.equal(env.storage.kiditem_sourcing_ingest_token, undefined);
  assert.equal(env.storage.kiditem_sourcing_ingest_token_expires_at, undefined);
});

test('clears common and legacy KidItem tokens on sign-out', async () => {
  const env = loadBackground({
    kiditem_auth_token: 'current-token',
    kiditem_sourcing_ingest_token: 'legacy-token',
  });

  const response = await sendExternal(env.externalListeners[0], {
    action: 'clearAuthToken',
  });

  assert.equal(response?.success, true);
  assert.equal(env.storage.kiditem_auth_token, undefined);
  assert.equal(env.storage.kiditem_sourcing_ingest_token, undefined);
});

test('advertises the logged-in Chrome trend and live-commerce collector capabilities', async () => {
  const env = loadBackground();

  const response = await sendExternal(env.externalListeners[0], { action: 'ping' });

  assert.equal(response?.success, true);
  assert.equal(response?.capabilities?.sourcing1688TrendCollector, true);
  assert.equal(response?.capabilities?.sourcingLiveCommerceCollector, true);
});

test('accepts a heartbeat port that keeps long 1688 trend runs alive', () => {
  const env = loadBackground();
  const messageListeners = [];

  assert.equal(env.connectListeners.length, 1);
  env.connectListeners[0]({
    name: 'kiditem-1688-trend-keepalive',
    onMessage: { addListener: (listener) => messageListeners.push(listener) },
  });

  assert.equal(messageListeners.length, 1);
});

test('rejects invalid 1688 trend collection inputs before opening a tab', async () => {
  const env = loadBackground();

  const empty = await sendExternal(env.externalListeners[0], {
    action: 'start1688TrendCollection',
    keywords: [],
    maxResultsPerKeyword: 20,
  });
  const oversized = await sendExternal(env.externalListeners[0], {
    action: 'start1688TrendCollection',
    keywords: ['문구'],
    maxResultsPerKeyword: 21,
  });

  assert.equal(empty?.success, false);
  assert.equal(oversized?.success, false);
});

test('stores staging API base and auth token from the staging web app', async () => {
  const env = loadBackground();

  const response = await sendExternal(
    env.externalListeners[0],
    {
      action: 'setAuthToken',
      apiBase: 'https://staging.merchon.org/api/sourcing/extension',
      token: 'token-from-web',
    },
    { url: 'https://staging.merchon.org/product-pipeline/collected-products' },
  );

  assert.equal(response?.success, true);
  assert.equal(env.storage.apiBase, 'https://staging.merchon.org/api/sourcing/extension');
  assert.equal(env.storage.kiditem_auth_token, 'token-from-web');
});

test('rejects auth tokens sent from non-KidItem web origins', async () => {
  const env = loadBackground();

  const response = await sendExternal(
    env.externalListeners[0],
    { action: 'setAuthToken', token: 'token-from-web' },
    { url: 'http://evil.localhost:3000/product-pipeline/collected-products' },
  );

  assert.equal(response?.success, false);
  assert.equal(env.storage.kiditem_auth_token, undefined);
});

test('sends the stored token as Bearer auth to the sourcing ingest API', async () => {
  const env = loadBackground({ kiditem_auth_token: 'stored-token' });

  await env.context.sendToBackend({ source_url: 'https://detail.1688.com/offer/607635921546.html' });

  assert.equal(env.fetchCalls.length, 1);
  const headers = new Headers(env.fetchCalls[0].init.headers);
  assert.equal(headers.get('content-type'), 'application/json');
  assert.equal(headers.get('authorization'), 'Bearer stored-token');
});

test('sends stored tokens to the approved staging API base', async () => {
  const env = loadBackground({
    apiBase: 'https://staging.merchon.org/api/sourcing/extension',
    kiditem_auth_token: 'stored-token',
  });
  env.installListeners[0]();

  await env.context.sendToBackend({
    source_url: 'https://detail.1688.com/offer/607635921546.html',
  });

  assert.equal(env.fetchCalls.length, 1);
  assert.equal(
    env.fetchCalls[0].url,
    'https://staging.merchon.org/api/sourcing/extension/product-data',
  );
  const headers = new Headers(env.fetchCalls[0].init.headers);
  assert.equal(headers.get('authorization'), 'Bearer stored-token');
});

test('does not send stored tokens to unapproved API bases', async () => {
  const env = loadBackground({
    apiBase: 'https://evil.example/api/sourcing/extension',
    kiditem_auth_token: 'stored-token',
  });
  env.installListeners[0]();

  const result = await env.context.sendToBackend({
    source_url: 'https://detail.1688.com/offer/607635921546.html',
  });

  assert.equal(result.ok, false);
  assert.equal(env.fetchCalls.length, 0);
});

test('requests web refresh and retries once after 401 with a changed token', async () => {
  const env = loadBackground(
    { kiditem_auth_token: 'expired-token' },
    [{ status: 401 }, { status: 200 }],
  );

  const pending = env.context.sendToBackend({
    source_url: 'https://detail.1688.com/offer/607635921546.html',
  });
  await waitForCallCount(env.fetchCalls, 1);
  env.storageApi.set({ kiditem_auth_token: 'rotated-token' });
  const result = await pending;

  assert.equal(result.ok, true);
  assert.equal(env.fetchCalls.length, 2);
  assert.equal(
    new Headers(env.fetchCalls[1].init.headers).get('authorization'),
    'Bearer rotated-token',
  );
  assert.deepEqual(env.dispatchedEvents, ['kiditem:extension-auth-required']);
});

test('coalesces concurrent 401 refresh signals and retries each request once', async () => {
  const env = loadBackground(
    { kiditem_auth_token: 'expired-token' },
    [{ status: 401 }, { status: 401 }, { status: 200 }, { status: 200 }],
  );

  const first = env.context.sendToBackend({ source_url: 'https://detail.1688.com/offer/1.html' });
  const second = env.context.sendToBackend({ source_url: 'https://detail.1688.com/offer/2.html' });
  await waitForCallCount(env.fetchCalls, 2);
  env.storageApi.set({ kiditem_auth_token: 'rotated-token' });
  const results = await Promise.all([first, second]);

  assert.deepEqual(results.map((result) => result.ok), [true, true]);
  assert.equal(env.fetchCalls.length, 4);
  assert.deepEqual(env.dispatchedEvents, ['kiditem:extension-auth-required']);
});
