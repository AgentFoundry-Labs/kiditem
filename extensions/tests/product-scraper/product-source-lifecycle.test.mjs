import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { SOURCING_WORKER_MODULES } from '../helpers/domain-worker-modules.mjs';

const root = path.resolve('extensions/kiditem-os/background/sourcing');
const product = JSON.parse(fs.readFileSync('extensions/tests/fixtures/1688-product-detail-v1.json', 'utf8'));
const flush = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); };
const clone = (value) => JSON.parse(JSON.stringify(value));

function fixture({ pageUrl = product.source_url, loseBegin = false, loseComplete = false, holdFail = false, detailHtml = '' } = {}) {
  const values = { kiditem_environment_profiles_v1: { local: { accessToken: 'auth-token' } } };
  const listeners = [], tabRemoved = [], timers = new Map(), requests = [], triggers = [], attempts = new Map();
  let serial = 0, lostBegin = false, lostComplete = false;
  let releaseFailure;
  const failureHeld = new Promise((resolve) => { releaseFailure = resolve; });
  const storage = {
    get(keys, cb) { const result = typeof keys === 'string' ? { [keys]: values[keys] } : { ...values }; if (cb) cb(result); else return Promise.resolve(result); },
    set(next, cb) { Object.assign(values, next); if (cb) cb(); else return Promise.resolve(); },
    remove(keys, cb) { for (const key of [].concat(keys)) delete values[key]; if (cb) cb(); else return Promise.resolve(); },
  };
  const chrome = {
    runtime: { id: 'fixture', getManifest: () => ({ version: '1' }), lastError: null,
      onMessage: { addListener: (fn) => listeners.push(fn) }, onMessageExternal: { addListener() {} }, onConnect: { addListener() {} }, onInstalled: { addListener() {} } },
    storage: { local: storage, onChanged: { addListener() {} } },
    tabs: { get: async () => ({ id: 7, url: pageUrl }), query: async () => [],
      sendMessage(tabId, message, cb) { triggers.push({ tabId, ...clone(message) }); cb?.({ ok: true }); },
      onRemoved: { addListener: (fn) => tabRemoved.push(fn) },
      remove() { assert.fail('must not close operator tab'); }, update() { assert.fail('must not navigate operator tab'); } },
    scripting: { executeScript: async () => [] },
  };
  const context = vm.createContext({ chrome, crypto: { randomUUID }, URL, Headers, AbortController, console,
    setTimeout(fn, ms) { const id = ++serial; timers.set(id, { fn, ms }); return id; }, clearTimeout(id) { timers.delete(id); }, setInterval() {}, clearInterval() {},
    fetch: async (url, init = {}) => {
      requests.push({ url, ...init });
      const body = init.body ? JSON.parse(init.body) : {};
      let response = {};
      if (url.endsWith('/attempts')) {
        const key = new Headers(init.headers).get('idempotency-key');
        if (!attempts.has(key)) attempts.set(key, { attemptId: randomUUID(), attemptToken: randomUUID(), state: 'RUNNING', plan: { sourceUrl: body.sourceUrl }, expiresAt: new Date(Date.now() + 120000).toISOString() });
        response = attempts.get(key);
        if (loseBegin && !lostBegin) { lostBegin = true; throw new TypeError('begin response lost'); }
      } else if (url.endsWith('/complete')) {
        response = { state: 'COMPLETE' };
        if (loseComplete && !lostComplete) { lostComplete = true; throw new TypeError('complete response lost'); }
      } else if (url.endsWith('/fail')) { if (holdFail) await failureHeld; response = { state: 'FAILED' }; }
      return { ok: true, status: 200, json: async () => clone(response), text: async () => detailHtml };
    },
  });
  for (const name of [...SOURCING_WORKER_MODULES, 'worker.js']) vm.runInContext(fs.readFileSync(path.join(root, name), 'utf8'), context, { filename: name });
  return { requests, triggers, values, timers, async event(message, tabId = 7) {
    return new Promise((resolve) => { for (const listener of listeners) listener(message, { tab: { id: tabId, url: pageUrl } }, resolve); });
  }, collect() { return this.event({ type: 'COLLECT_CURRENT', tabId: 7, environmentId: 'local' }); },
  close() { for (const listener of tabRemoved) listener(7); },
  releaseFailure,
  timeout() { for (const [id, timer] of timers) if (timer.ms === 20000) { timers.delete(id); timer.fn(); } },
  };
}

test('begins before collector IO, awaits optional description completion and posts the unchanged payload only once', async () => {
  const env = fixture(); const result = env.collect(); await flush();
  assert.equal(env.requests[0]?.url, 'http://localhost:4000/api/sourcing/extension/product-data/attempts');
  assert.deepEqual(JSON.parse(env.requests[0].body), { sourceUrl: product.source_url });
  const attemptId = env.triggers[0].attemptId;
  assert.ok(attemptId); assert.equal('attemptToken' in env.triggers[0], false);
  await env.event({ type: 'PRODUCT_DATA', attemptId, data: clone(product) }); await flush();
  assert.equal(env.requests.filter((r) => r.url.endsWith('/complete')).length, 0);
  const description = { source_url: product.source_url, product_id: product.product_id, description_images: ['https://example.test/desc.jpg'], description_text: 'description', description_image_count: 1 };
  await env.event({ type: 'DESCRIPTION_DATA', attemptId, data: description });
  await env.event({ type: 'EXTRACTION_COMPLETE', attemptId, hadDescription: true }); await flush();
  assert.deepEqual(clone(await result), { ok: true });
  assert.deepEqual(JSON.parse(env.requests.find((r) => r.url.endsWith('/complete')).body), { product, description, hadDescription: true });
  assert.equal(JSON.stringify(env.values).includes('attemptToken'), false);
});

test('an immediate retry waits for the old failure acknowledgement before storing its new correlation', async () => {
  const env = fixture({ holdFail: true }); const first = env.collect(); await flush();
  const oldId = env.triggers[0].attemptId;
  env.timeout(); await flush();
  const retry = env.collect(); await flush();
  assert.equal(env.triggers.length, 1);
  env.releaseFailure(); await flush();
  assert.equal((await first).ok, false);
  assert.equal(env.triggers.length, 2);
  assert.notEqual(env.triggers[1].attemptId, oldId);
  env.close(); await flush(); assert.equal((await retry).ok, false);
});

test('replays lost begin/terminal responses identically and does not rerun the collector', async () => {
  const env = fixture({ loseBegin: true, loseComplete: true }); const result = env.collect(); await flush();
  assert.equal(env.triggers.length, 1); const attemptId = env.triggers[0].attemptId;
  await env.event({ type: 'PRODUCT_DATA', attemptId, data: product });
  await env.event({ type: 'EXTRACTION_COMPLETE', attemptId, hadDescription: false }); await flush();
  assert.deepEqual(clone(await result), { ok: true });
  const begins = env.requests.filter((r) => r.url.endsWith('/attempts'));
  assert.equal(begins.length, 2); assert.equal(begins[0].body, begins[1].body);
  assert.equal(new Headers(begins[0].headers).get('idempotency-key'), new Headers(begins[1].headers).get('idempotency-key'));
  const terminals = env.requests.filter((r) => r.url.endsWith('/complete'));
  assert.equal(terminals.length, 2); assert.equal(terminals[0].body, terminals[1].body);
});

test('20-second timeout and page close fail the owner; old or wrong-tab events cannot complete a new retry', async () => {
  const env = fixture(); const first = env.collect(); await flush(); const oldId = env.triggers[0].attemptId;
  env.timeout(); await flush(); assert.equal((await first).ok, false);
  assert.ok(env.requests.some((r) => r.url.endsWith(`/${oldId}/fail`)));
  const retry = env.collect(); await flush(); const currentId = env.triggers[1].attemptId;
  assert.notEqual(currentId, oldId);
  assert.equal((await env.event({ type: 'PRODUCT_DATA', attemptId: oldId, data: product })).ok, false);
  assert.equal((await env.event({ type: 'PRODUCT_DATA', attemptId: currentId, data: product }, 8)).ok, false);
  env.close(); await flush(); assert.equal((await retry).ok, false);
  assert.equal(env.requests.filter((r) => r.url.endsWith('/complete')).length, 0);
  assert.equal(env.requests.filter((r) => r.url.endsWith('/fail')).length, 2);
});

test('search preserves the current query/fragment and finishes on its only product event without candidate enrichment', async () => {
  const pageUrl = 'https://s.1688.com/selloffer/offer_search.htm?keywords=pencil#offers';
  const env = fixture({ pageUrl }); const result = env.collect(); await flush();
  assert.deepEqual(JSON.parse(env.requests[0].body), { sourceUrl: pageUrl });
  const data = { source_url: pageUrl, source_platform: '1688', page_type: 'search', total_found: 2, products: [{ title: 'fixture' }] };
  await env.event({ type: 'PRODUCT_DATA', attemptId: env.triggers[0].attemptId, data }); await flush();
  assert.equal((await result).ok, true);
  assert.deepEqual(JSON.parse(env.requests.find((r) => r.url.endsWith('/complete')).body), { product: data, hadDescription: false });
});

test('retains allowed 1688 description fetch options, image/text dedupe and raw commercial output', async () => {
  const html = '<div>상품 설명 본문</div><div>상품 설명 본문</div><img src="//cbu01.alicdn.com/detail.jpg"><img src="//cbu01.alicdn.com/detail.jpg"><img src="data:image/png;base64,x"><img src="https://cbu01.alicdn.com/logo.jpg">';
  const env = fixture({ detailHtml: `var offer_details=${JSON.stringify({ content: html })};` });
  const result = env.collect(); await flush();
  const data = { ...product, _detail_url: 'https://detail.1688.com/description/fixture' };
  const attemptId = env.triggers[0].attemptId;
  await env.event({ type: 'PRODUCT_DATA', attemptId, data });
  await env.event({ type: 'EXTRACTION_COMPLETE', attemptId, hadDescription: false }); await flush();
  assert.equal((await result).ok, true);
  const provider = env.requests.find((r) => r.url === data._detail_url);
  assert.equal(provider.redirect, 'error'); assert.equal(provider.credentials, 'include');
  assert.equal(provider.headers, undefined);
  assert.deepEqual(JSON.parse(env.requests.find((r) => r.url.endsWith('/complete')).body).product, {
    ...product, _detail_url: data._detail_url, description_images: ['https://cbu01.alicdn.com/detail.jpg'],
    description_text: '상품 설명 본문', description_image_count: 1,
  });
});

test('an untrusted description URL is never fetched and leaves the unchanged detail payload collectable', async () => {
  const env = fixture(); const result = env.collect(); await flush();
  const data = { ...product, _detail_url: 'http://localhost/private' };
  const attemptId = env.triggers[0].attemptId;
  await env.event({ type: 'PRODUCT_DATA', attemptId, data });
  await env.event({ type: 'EXTRACTION_COMPLETE', attemptId, hadDescription: false }); await flush();
  assert.equal((await result).ok, true);
  assert.equal(env.requests.some((r) => r.url === data._detail_url), false);
  assert.deepEqual(JSON.parse(env.requests.find((r) => r.url.endsWith('/complete')).body).product, data);
});
