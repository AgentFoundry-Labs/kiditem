import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const sourcePath = path.resolve('extensions/product-scraper/live-commerce-collector.js');
const source = fs.readFileSync(sourcePath, 'utf8');

function loadCollectorModule() {
  const context = { URL, console, globalThis: null, setTimeout, clearTimeout };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: sourcePath });
  return context.ProductScraperLiveCommerce;
}

test('accepts only HTTPS 1688 and Douyin collection URLs', () => {
  const module = loadCollectorModule();
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
});

test('posts collected broadcasts through the authenticated backend request', async () => {
  const module = loadCollectorModule();
  const requestCalls = [];
  const updatedListeners = [];
  const chrome = {
    runtime: { lastError: null },
    tabs: {
      create: (_properties, cb) => cb({ id: 1, url: 'https://live.douyin.com/123' }),
      get: (_tabId, cb) => cb({ id: 1, status: 'complete', url: 'https://live.douyin.com/123' }),
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
  };
  const collector = module.create({
    chrome,
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

  const result = await collector.collect('https://live.douyin.com/123');

  assert.equal(result.success, true);
  assert.equal(requestCalls.length, 1);
  assert.equal(
    requestCalls[0].url,
    'http://localhost:4000/api/sourcing/extension/trend/live-commerce-results',
  );
});
