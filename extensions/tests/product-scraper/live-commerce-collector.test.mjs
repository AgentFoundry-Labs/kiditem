import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const sourcePath = path.resolve('extensions/product-scraper/live-commerce-collector.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const sessionPath = path.resolve('extensions/product-scraper/collection-session.js');
const sessionSource = fs.readFileSync(sessionPath, 'utf8');

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

test('accepts only HTTPS 1688 and Douyin collection URLs', () => {
  const module = loadCollectorModule().ProductScraperLiveCommerce;
  assert.deepEqual(
    { ...module.validateLiveUrl('https://live.douyin.com/123') },
    { ok: true, url: 'https://live.douyin.com/123', source: 'douyin' },
  );
  assert.deepEqual(
    { ...module.validateLiveUrl('https://zb.1688.com/live/123') },
    { ok: true, url: 'https://zb.1688.com/live/123', source: '1688' },
  );
  assert.equal(module.validateLiveUrl('http://live.douyin.com/123').ok, false);
  assert.equal(module.validateLiveUrl('https://evil.example/live/123').ok, false);
  assert.equal(
    module.validateLiveUrl(`https://live.douyin.com/${'a'.repeat(500)}`).ok,
    false,
  );
});

test('posts collected broadcasts through the authenticated backend request', async () => {
  const context = loadCollectorModule();
  const module = context.ProductScraperLiveCommerce;
  const requestCalls = [];
  const updatedListeners = [];
  const values = {};
  const createCalls = [];
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
      create: (properties, cb) => {
        createCalls.push(properties);
        cb({ id: 1, windowId: 7, url: 'https://live.douyin.com/123' });
      },
      get: (_tabId, cb) => cb({
        id: 1,
        windowId: 7,
        status: 'complete',
        url: 'https://live.douyin.com/123',
      }),
      query: async () => [],
      onUpdated: {
        addListener: (listener) => updatedListeners.push(listener),
        removeListener: (listener) => {
          const index = updatedListeners.indexOf(listener);
          if (index >= 0) updatedListeners.splice(index, 1);
        },
      },
      sendMessage: (_tabId, _message, cb) => cb({
        ok: true,
        source: 'douyin',
        pageUrl: 'https://live.douyin.com/123',
        broadcast: { title: '방송' },
        products: [],
      }),
      remove: (_tabId, cb) => cb(),
    },
    windows: { update: (_windowId, _properties, cb) => cb?.() },
  };
  const sessions = context.KidItemCollectionSession.create({
    chrome,
    storageKey: 'kiditem_collection_sessions',
    webUrlPatterns: ['http://localhost:3000/*'],
  });
  const collector = module.create({
    chrome,
    sessions,
    ensureContentScripts: async () => true,
    getBackendRequestConfig: async () => ({
      ok: true,
      base: 'http://localhost:4000/api/sourcing/extension',
      headers: { Authorization: 'Bearer token' },
      request: async (url, init) => {
        requestCalls.push({ url, init });
        return {
          ok: true,
          status: 200,
          json: async () => ({
            source: 'douyin',
            broadcastCount: 1,
            productCount: 0,
            businessDate: '2026-07-14',
          }),
        };
      },
    }),
  });

  const result = await collector.collect(
    'https://live.douyin.com/123?token=must-not-persist#private',
  );

  assert.equal(result.success, true);
  assert.equal(typeof result.runId, 'string');
  assert.deepEqual(JSON.parse(JSON.stringify(createCalls)), [
    {
      url: 'https://live.douyin.com/123?token=must-not-persist#private',
      active: false,
    },
  ]);
  assert.equal(requestCalls.length, 1);
  assert.equal(
    requestCalls[0].url,
    'http://localhost:4000/api/sourcing/extension/trend/live-commerce-results',
  );
  const session = await sessions.get(result.runId);
  assert.equal(session.status, 'succeeded');
  assert.equal(session.producer, 'sourcing.live_commerce');
  assert.equal(session.restartStrategy, 'web');
  assert.deepEqual(
    JSON.parse(JSON.stringify(session.inputIdentity)),
    { source: 'douyin', pageUrl: 'https://live.douyin.com/123' },
  );
  assert.equal(JSON.stringify(session).includes('must-not-persist'), false);
  assert.equal('broadcast' in session.inputIdentity, false);
  assert.equal('products' in session.inputIdentity, false);
});

test('keeps a login challenge inactive and publishes attention until the generic open command', async () => {
  const context = loadCollectorModule();
  const calls = { create: [], update: [], focus: [], remove: [] };
  const values = {};
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
      create(properties, cb) {
        calls.create.push(properties);
        cb({ id: 11, windowId: 9, url: properties.url, active: properties.active });
      },
      get(_tabId, cb) {
        cb({
          id: 11,
          windowId: 9,
          status: 'complete',
          url: 'https://live.douyin.com/login',
        });
      },
      query: async () => [],
      update(tabId, properties, cb) {
        calls.update.push({ tabId, ...properties });
        const tab = { id: tabId, windowId: 9, ...properties };
        if (cb) cb(tab);
        else return Promise.resolve(tab);
      },
      remove(tabId, cb) {
        calls.remove.push(tabId);
        cb?.();
      },
      onUpdated: { addListener() {}, removeListener() {} },
      sendMessage: () => assert.fail('login challenge must pause before extraction'),
    },
    windows: {
      update(windowId, properties, cb) {
        calls.focus.push({ windowId, ...properties });
        if (cb) cb({ id: windowId });
        else return Promise.resolve({ id: windowId });
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
      base: 'http://localhost:4000/api/sourcing/extension',
      headers: {},
    }),
  });

  const result = await collector.collect('https://live.douyin.com/123');

  assert.equal(result.success, false);
  assert.equal(result.status, 'attention_required');
  assert.equal(typeof result.runId, 'string');
  assert.deepEqual(JSON.parse(JSON.stringify(calls.create)), [
    { url: 'https://live.douyin.com/123', active: false },
  ]);
  assert.equal(calls.update.length, 0);
  assert.equal(calls.focus.length, 0);
  assert.equal(calls.remove.length, 0);
  const attention = await sessions.get(result.runId);
  assert.equal(attention.status, 'attention_required');
  assert.equal(attention.attention.reason, 'marketplace_login');
  assert.equal(attention.attention.canOpenTab, true);

  await sessions.openAttentionTab(result.runId);
  assert.deepEqual(calls.update, [{ tabId: 11, active: true }]);
  assert.deepEqual(calls.focus, [{ windowId: 9, focused: true }]);
});

test('restarts a login-blocked URL under the same run and closes the previous tab', async () => {
  const context = loadCollectorModule();
  const calls = { create: [], remove: [] };
  const values = {};
  let nextTabId = 20;
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
      create(properties, cb) {
        const tab = {
          id: nextTabId++,
          windowId: 9,
          url: properties.url,
          active: properties.active,
        };
        calls.create.push({ ...tab });
        cb(tab);
      },
      get(tabId, cb) {
        cb({
          id: tabId,
          windowId: 9,
          status: 'complete',
          url: 'https://live.douyin.com/login',
        });
      },
      query: async () => [],
      update(_tabId, _properties, cb) { cb?.(); },
      remove(tabId, cb) {
        calls.remove.push(tabId);
        cb?.();
      },
      onUpdated: { addListener() {}, removeListener() {} },
      sendMessage: () => assert.fail('login challenge must pause before extraction'),
    },
    windows: { update(_windowId, _properties, cb) { cb?.(); } },
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
    getBackendRequestConfig: async () => ({ ok: true, base: '', headers: {} }),
  });

  const first = await collector.collect('https://live.douyin.com/123');
  const restarted = await collector.collect(
    'https://live.douyin.com/123',
    first.runId,
  );

  assert.equal(restarted.runId, first.runId);
  assert.deepEqual(calls.remove, [20]);
  assert.deepEqual(calls.create.map(({ active }) => active), [false, false]);
  const session = await sessions.get(first.runId);
  assert.equal(session.status, 'attention_required');
  assert.equal(session.attempt, 2);
});
