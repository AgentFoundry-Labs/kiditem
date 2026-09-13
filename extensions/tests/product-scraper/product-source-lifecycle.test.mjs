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

function fixture({
  pageUrl = product.source_url,
  loseBegin = false,
  loseComplete = false,
  failureAckFailures = 0,
  holdBegin = false,
  holdAcceptedBegin = false,
  holdFail = false,
  holdFirstRead = false,
  failResponseState = 'FAILED',
  omitFailState = false,
  failureLeavesRunning = false,
  detailHtml = '',
  values: sharedValues,
  attempts: sharedAttempts,
} = {}) {
  const values = sharedValues || { kiditem_environment_profiles_v1: { local: { accessToken: 'auth-token' } } };
  const listeners = [], tabRemoved = [], timers = new Map(), requests = [], triggers = [], attempts = new Map();
  let serial = 0, lostBegin = false, lostComplete = false, readHeld = false;
  let failureAckFailuresRemaining = failureAckFailures;
  let releaseBegin;
  const beginHeld = new Promise((resolve) => { releaseBegin = resolve; });
  const ownerAttempts = sharedAttempts || attempts;
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
        if (holdBegin && !ownerAttempts.has(key)) await beginHeld;
        if (!ownerAttempts.has(key)) {
          ownerAttempts.set(key, { attemptId: randomUUID(), attemptToken: randomUUID(), state: 'RUNNING', plan: { sourceUrl: body.sourceUrl }, expiresAt: new Date(Date.now() + 120000).toISOString() });
          if (holdAcceptedBegin) await beginHeld;
        }
        response = ownerAttempts.get(key);
        if (loseBegin && !lostBegin) { lostBegin = true; throw new TypeError('begin response lost'); }
      } else if (/\/attempts\/[^/]+$/.test(url)) {
        if (holdFirstRead && !readHeld) { readHeld = true; await beginHeld; }
        response = [...ownerAttempts.values()].find((attempt) => url.endsWith(`/${attempt.attemptId}`)) || {};
      } else if (url.endsWith('/complete')) {
        const attempt = [...ownerAttempts.values()].find((candidate) => url.endsWith(`/${candidate.attemptId}/complete`));
        response = { attemptId: attempt?.attemptId, state: 'COMPLETE' };
        if (attempt) attempt.state = 'COMPLETE';
        if (loseComplete && !lostComplete) { lostComplete = true; throw new TypeError('complete response lost'); }
      } else if (url.endsWith('/fail')) {
        if (holdFail) await failureHeld;
        const attempt = [...ownerAttempts.values()].find((candidate) => url.endsWith(`/${candidate.attemptId}/fail`));
        response = { attemptId: attempt?.attemptId, ...(omitFailState ? {} : { state: failResponseState }) };
        if (failureAckFailuresRemaining > 0) {
          failureAckFailuresRemaining -= 1;
          throw new TypeError('failure acknowledgement lost');
        }
        if (attempt && !failureLeavesRunning) attempt.state = 'FAILED';
      }
      return { ok: true, status: 200, json: async () => clone(response), text: async () => detailHtml };
    },
  });
  for (const name of [...SOURCING_WORKER_MODULES, 'worker.js']) vm.runInContext(fs.readFileSync(path.join(root, name), 'utf8'), context, { filename: name });
  return { requests, triggers, values, timers, context, ownerAttempts, async event(message, tabId = 7) {
    return new Promise((resolve) => { for (const listener of listeners) listener(message, { tab: { id: tabId, url: pageUrl } }, resolve); });
  }, collect() { return this.event({ type: 'COLLECT_CURRENT', tabId: 7, environmentId: 'local' }); },
  close() { for (const listener of tabRemoved) listener(7); },
  releaseFailure,
  releaseBegin,
  releaseRead: releaseBegin,
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

test('environment cancellation fences pending product events without closing the operator tab', async () => {
  const env = fixture();
  const result = env.collect();
  await flush();
  const attemptId = env.triggers[0].attemptId;
  const sourcingDomain = env.context.KidItemDomains.forProducer('sourcing.product');

  await sourcingDomain.cancelAdditionalCollections('local');
  assert.deepEqual(JSON.parse(JSON.stringify(await env.event({ type: 'PRODUCT_DATA', attemptId, data: product }))), {
    ok: false,
    error: '수집 환경 또는 시도를 확인할 수 없습니다.',
  });
  assert.deepEqual(JSON.parse(JSON.stringify(await env.event({ type: 'EXTRACTION_COMPLETE', attemptId, hadDescription: false }))), {
    ok: false,
    error: '수집 환경 또는 시도를 확인할 수 없습니다.',
  });
  await flush();

  assert.deepEqual(clone(await result), { ok: false, error: '상품 추출이 취소되었습니다.' });
  assert.equal(env.requests.filter((request) => request.url.endsWith('/complete')).length, 0);
  assert.equal(env.requests.filter((request) => request.url.endsWith('/fail')).length, 1);
});

test('persists only a stop correlation, retries cancellation after service-worker restart, and permits a fresh execution', async () => {
  const values = { kiditem_environment_profiles_v1: { local: { accessToken: 'auth-token' } } };
  const ownerAttempts = new Map();
  const first = fixture({ values, attempts: ownerAttempts, failureAckFailures: 6, failureLeavesRunning: true });
  const firstResult = first.collect();
  await flush();
  const oldAttemptId = first.triggers[0].attemptId;
  await first.context.KidItemDomains.forProducer('sourcing.product').cancelAdditionalCollections('local');
  await flush();
  assert.deepEqual(clone(await firstResult), { ok: false, error: '상품 추출이 취소되었습니다.' });

  const correlationKey = 'sourcing_product_attempt:local:7';
  assert.deepEqual(Object.keys(values[correlationKey]).sort(), [
    'attemptId', 'environmentId', 'idempotencyKey', 'stopIntent',
  ]);
  assert.equal(values[correlationKey].attemptId, oldAttemptId);
  assert.equal(values[correlationKey].stopIntent, true);
  assert.equal('attemptToken' in values[correlationKey], false);
  assert.equal('sourceUrl' in values[correlationKey], false);

  // Auth handoff is explicit: no owner retry is attempted while disconnected.
  delete values.kiditem_environment_profiles_v1.local.accessToken;
  const restarted = fixture({ values, attempts: ownerAttempts });
  assert.equal(
    await restarted.context.KidItemDomains.forProducer('sourcing.product')
      .retryAdditionalCollections('local'),
    false,
  );
  assert.equal(values[correlationKey].stopIntent, true);

  values.kiditem_environment_profiles_v1.local.accessToken = 'auth-token-restored';
  assert.equal(
    await restarted.context.KidItemDomains.forProducer('sourcing.product')
      .retryAdditionalCollections('local'),
    true,
  );
  assert.equal(values[correlationKey], null);
  assert.equal(restarted.triggers.length, 0, 'cancellation-only retry must not resume provider extraction');
  assert.equal(restarted.requests.filter((request) => request.url.endsWith('/complete')).length, 0);
  assert.equal(ownerAttempts.get([...ownerAttempts.keys()][0]).state, 'FAILED');

  const fresh = restarted.collect();
  await flush();
  assert.equal(restarted.triggers.length, 1);
  assert.notEqual(restarted.triggers[0].attemptId, oldAttemptId);
  assert.equal(ownerAttempts.size, 2);
  assert.equal(
    await restarted.context.KidItemDomains.forProducer('sourcing.product')
      .retryAdditionalCollections('local'),
    true,
  );
  assert.equal((await restarted.event({
    type: 'PRODUCT_DATA', attemptId: oldAttemptId, data: product,
  })).ok, false, 'old provider events cannot complete the fresh execution');
  restarted.close();
  await flush();
  assert.equal((await fresh).ok, false);
});

test('late begin acknowledgement after dashboard close is fenced and failed without a completion', async () => {
  const values = { kiditem_environment_profiles_v1: { local: { accessToken: 'auth-token' } } };
  const ownerAttempts = new Map();
  const env = fixture({ values, attempts: ownerAttempts, holdBegin: true });
  const result = env.collect();
  await flush();
  assert.equal(env.requests.filter((request) => request.url.endsWith('/attempts')).length, 1);

  // Fence synchronously before releasing the begin response, as a last-tab
  // dashboard close can race the owner acknowledgement.
  env.close();
  env.releaseBegin();
  await flush();
  assert.deepEqual(clone(await result), { ok: false, error: '상품 수집 탭이 닫혔습니다.' });
  assert.equal(env.triggers.length, 0);
  assert.equal(env.requests.filter((request) => request.url.endsWith('/complete')).length, 0);
  assert.equal(env.requests.filter((request) => request.url.endsWith('/fail')).length, 1);
  assert.equal([...ownerAttempts.values()][0].state, 'FAILED');
  assert.equal(values['sourcing_product_attempt:local:7'], null);
});

test('persists the validated source URL until a begin acknowledgement is recovered after restart', async () => {
  const values = { kiditem_environment_profiles_v1: { local: { accessToken: 'auth-token' } } };
  const ownerAttempts = new Map();
  const env = fixture({ values, attempts: ownerAttempts, holdAcceptedBegin: true });
  const result = env.collect();
  await flush();
  const key = 'sourcing_product_attempt:local:7';
  assert.equal(ownerAttempts.size, 1, 'the owner accepted the idempotent begin before the response was held');
  assert.deepEqual(clone(values[key]), {
    environmentId: 'local',
    attemptId: null,
    idempotencyKey: values[key].idempotencyKey,
    stopIntent: false,
    sourceUrl: product.source_url,
  });
  env.close();
  await flush();
  assert.equal(values[key].stopIntent, true);

  const restarted = fixture({ values, attempts: ownerAttempts });
  assert.equal(
    await restarted.context.KidItemDomains.forProducer('sourcing.product')
      .retryAdditionalCollections('local'),
    true,
  );
  assert.equal(values[key], null);
  assert.equal(restarted.triggers.length, 0);
  assert.deepEqual(JSON.parse(restarted.requests.find((request) => request.url.endsWith('/attempts')).body), {
    sourceUrl: product.source_url,
  });

  env.releaseBegin();
  await flush();
  assert.deepEqual(clone(await result), { ok: false, error: '상품 수집 탭이 닫혔습니다.' });
});

test('a stale retry read cannot clear a fresh same-tab correlation after the fresh run replaces it', async () => {
  const values = { kiditem_environment_profiles_v1: { local: { accessToken: 'auth-token' } } };
  const ownerAttempts = new Map();
  const oldKey = randomUUID();
  const oldAttemptId = randomUUID();
  ownerAttempts.set(oldKey, {
    attemptId: oldAttemptId,
    attemptToken: randomUUID(),
    state: 'RUNNING',
    plan: { sourceUrl: product.source_url },
    expiresAt: new Date(Date.now() + 120000).toISOString(),
  });
  const key = 'sourcing_product_attempt:local:7';
  values[key] = { environmentId: 'local', attemptId: oldAttemptId, idempotencyKey: oldKey, stopIntent: true };
  const env = fixture({ values, attempts: ownerAttempts, holdFirstRead: true });
  const retry = env.context.KidItemDomains.forProducer('sourcing.product').retryAdditionalCollections('local');
  await flush();
  assert.equal(env.requests.filter((request) => /\/attempts\/[^/]+$/.test(request.url)).length, 1);

  const fresh = env.collect();
  await flush();
  await flush();
  const freshKey = values[key].idempotencyKey;
  assert.notEqual(freshKey, oldKey);
  assert.equal(values[key].stopIntent, false);
  const freshAttemptId = env.triggers[0].attemptId;
  assert.ok(freshAttemptId);

  env.releaseRead();
  await flush();
  assert.equal(await retry, true);
  assert.equal(values[key].idempotencyKey, freshKey);
  assert.equal(values[key].attemptId, freshAttemptId);
  assert.equal(values[key].stopIntent, false);
  env.close();
  await flush();
  assert.equal((await fresh).ok, false);
});

test('cancel includes a persisted active correlation and settles it through the owner', async () => {
  const values = { kiditem_environment_profiles_v1: { local: { accessToken: 'auth-token' } } };
  const ownerAttempts = new Map();
  const idempotencyKey = randomUUID();
  const attemptId = randomUUID();
  ownerAttempts.set(idempotencyKey, {
    attemptId,
    attemptToken: randomUUID(),
    state: 'RUNNING',
    plan: { sourceUrl: product.source_url },
    expiresAt: new Date(Date.now() + 120000).toISOString(),
  });
  const key = 'sourcing_product_attempt:local:7';
  values[key] = { environmentId: 'local', attemptId, idempotencyKey, stopIntent: false };
  const env = fixture({ values, attempts: ownerAttempts });
  assert.equal(await env.context.KidItemDomains.forProducer('sourcing.product').cancelAdditionalCollections('local'), true);
  assert.equal(values[key], null);
  assert.equal(await env.context.KidItemDomains.forProducer('sourcing.product').retryAdditionalCollections('local'), true);
});

test('auth loss leaves a fenced persisted active correlation for the later retry hook', async () => {
  const values = { kiditem_environment_profiles_v1: { local: {} } };
  const ownerAttempts = new Map();
  const idempotencyKey = randomUUID();
  const attemptId = randomUUID();
  ownerAttempts.set(idempotencyKey, {
    attemptId,
    attemptToken: randomUUID(),
    state: 'RUNNING',
    plan: { sourceUrl: product.source_url },
    expiresAt: new Date(Date.now() + 120000).toISOString(),
  });
  const key = 'sourcing_product_attempt:local:7';
  values[key] = { environmentId: 'local', attemptId, idempotencyKey, stopIntent: false };
  const env = fixture({ values, attempts: ownerAttempts });
  assert.equal(await env.context.KidItemDomains.forProducer('sourcing.product').cancelAdditionalCollections('local'), false);
  assert.equal(values[key].stopIntent, true);
  assert.equal(env.requests.some((request) => request.url.endsWith('/fail')), false);
  values.kiditem_environment_profiles_v1.local.accessToken = 'auth-restored';
  assert.equal(await env.context.KidItemDomains.forProducer('sourcing.product').retryAdditionalCollections('local'), true);
  assert.equal(values[key], null);
});

test('does not clear a stopped correlation when the owner fail response is missing or still RUNNING', async () => {
  for (const options of [{ omitFailState: true }, { failResponseState: 'RUNNING' }]) {
    const values = { kiditem_environment_profiles_v1: { local: { accessToken: 'auth-token' } } };
    const ownerAttempts = new Map();
    const idempotencyKey = randomUUID();
    const attemptId = randomUUID();
    ownerAttempts.set(idempotencyKey, {
      attemptId,
      attemptToken: randomUUID(),
      state: 'RUNNING',
      plan: { sourceUrl: product.source_url },
      expiresAt: new Date(Date.now() + 120000).toISOString(),
    });
    const key = 'sourcing_product_attempt:local:7';
    values[key] = { environmentId: 'local', attemptId, idempotencyKey, stopIntent: true };
    const env = fixture({ values, attempts: ownerAttempts, failureLeavesRunning: true, ...options });
    assert.equal(await env.context.KidItemDomains.forProducer('sourcing.product').cancelAdditionalCollections('local'), false);
    assert.equal(await env.context.KidItemDomains.forProducer('sourcing.product').retryAdditionalCollections('local'), false);
    assert.equal(values[key].idempotencyKey, idempotencyKey);
    assert.equal(values[key].stopIntent, true);
  }
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
