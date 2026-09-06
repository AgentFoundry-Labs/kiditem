import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(
  new URL('../../kiditem-os/background/coupang/competitor-catalog-source-owner.js', import.meta.url),
  'utf8',
);
const wireSource = await readFile(
  new URL('../../kiditem-os/background/sourcing/source-attempt-wire.js', import.meta.url), 'utf8',
);
const worker = await readFile(
  new URL('../../kiditem-os/background/coupang/worker.js', import.meta.url),
  'utf8',
);

const ATTEMPT_ID = '10000000-0000-4000-8000-000000000001';
const ATTEMPT_TOKEN = '20000000-0000-4000-8000-000000000001';
const target = {
  sellerId: 'seller-a',
  sellerName: '판매자 A',
  sellerStoreUrl: 'https://shop.coupang.com/seller-a',
  keyword: '연필',
};

function catalogFor(value = target) {
  return {
    keyword: value.keyword,
    sellerId: value.sellerId,
    sellerName: value.sellerName,
    sellerStoreUrl: value.sellerStoreUrl,
    totalProductCount: 1,
    collectedProductCount: 1,
    isTruncated: false,
    sort: 'newest',
    capturedAt: '2026-09-04T00:00:30.000Z',
    products: [{
      sourceRank: 1,
      productId: 'product-1',
      itemId: null,
      vendorItemId: 'vendor-1',
      name: '연필',
      priceKrw: 1_000,
      reviewCount: 1,
      imageUrl: null,
      link: null,
    }],
  };
}

function plan(state = 'RUNNING') {
  return {
    attemptId: ATTEMPT_ID,
    attemptToken: ATTEMPT_TOKEN,
    state,
    expiresAt: '2099-09-04T01:00:00.000Z',
    input: { target: 'all' },
    targets: [target],
  };
}

function createHarness(options = {}) {
  const requests = [];
  const sessionCalls = [];
  const sessionsById = new Map();
  const sessions = {
    async start(input) {
      sessionsById.set(input.attemptId, { ...input, producer: 'advertising.competitor_catalog' });
      sessionCalls.push(['start', input]);
    },
    async get(attemptId) {
      return sessionsById.get(attemptId) ?? null;
    },
    async list() {
      return [...sessionsById.values()];
    },
    async progress(attemptId, value) {
      sessionCalls.push(['progress', attemptId, value]);
    },
    async requireAttention(attemptId, value) {
      sessionCalls.push(['attention', attemptId, value]);
    },
    async remove(attemptId) {
      sessionCalls.push(['remove', attemptId]);
      sessionsById.delete(attemptId);
    },
    async cancel(attemptId, optionsForCancel) {
      await optionsForCancel.ownerFailure();
      sessionsById.delete(attemptId);
      return true;
    },
  };
  let terminalFailures = 0;
  const request = async (environmentId, path, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : null;
    requests.push({ environmentId, path, init, body });
    if (path === '/api/ads/competitor-catalogs/attempts') {
      return new Response(JSON.stringify(options.plan ?? plan()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (path.endsWith('/fail')) {
      terminalFailures += 1;
      if (terminalFailures <= (options.failTerminalTimes ?? 0)) {
        return new Response(JSON.stringify({ message: 'temporary failure' }), { status: 503 });
      }
      return new Response(JSON.stringify({ latestAttempt: { attemptId: ATTEMPT_ID, state: 'FAILED', errorCode: body.code, errorMessage: body.message } }), { status: 200 });
    }
    return new Response(JSON.stringify({ latestAttempt: { attemptId: ATTEMPT_ID, state: 'COMPLETE' } }), { status: 200 });
  };
  const context = vm.createContext({ Date, Error, JSON, Map, Promise, Response, Set, String, URL });
  context.globalThis = context;
  vm.runInContext(wireSource, context);
  vm.runInContext(source, context);
  const owner = context.KidItemCompetitorCatalogSourceOwner.create({
    sessions,
    request,
    collectTarget: options.collectTarget ?? (async ({ target: selectedTarget }) => ({
      success: true,
      catalog: catalogFor(selectedTarget),
      tabId: 77,
    })),
    closeAttempt: async () => {},
  });
  return { owner, requests, sessionCalls };
}

test('begins a server-frozen plan, collects every target, and publishes one fenced terminal batch', async () => {
  const harness = createHarness();

  const result = await harness.owner.run({
    environmentId: 'office',
    idempotencyKey: 'retry-key',
    input: { target: 'all' },
  });

  assert.equal(result.success, true);
  assert.equal(result.attemptId, ATTEMPT_ID);
  assert.equal(result.terminalState, 'COMPLETE');
  assert.equal(result.capturedTargetCount, 1);
  assert.equal(harness.requests.length, 2);
  assert.equal(harness.requests[0].path, '/api/ads/competitor-catalogs/attempts');
  assert.equal(harness.requests[0].init.headers['Idempotency-Key'], 'retry-key');
  assert.deepEqual(harness.requests[0].body, { target: 'all' });
  assert.equal(harness.requests[1].path, `/api/ads/competitor-catalogs/attempts/${ATTEMPT_ID}`);
  assert.equal(harness.requests[1].init.headers['x-source-attempt-token'], ATTEMPT_TOKEN);
  assert.deepEqual(harness.requests[1].body, { catalogs: [catalogFor()] });
  assert.equal(harness.sessionCalls.filter(([name]) => name === 'start').length, 1);
  assert.equal(harness.sessionCalls.filter(([name]) => name === 'remove').length, 1);
});

test('fails the frozen generation instead of publishing a partial target set, with bounded terminal retry', async () => {
  const harness = createHarness({
    failTerminalTimes: 2,
    collectTarget: async () => {
      throw new Error('seller catalog failed');
    },
  });

  const result = await harness.owner.run({
    environmentId: 'office',
    idempotencyKey: 'retry-key',
    input: { target: 'all' },
  });

  assert.equal(result.success, false);
  assert.equal(result.terminalState, 'FAILED');
  assert.equal(result.errorCode, 'COMPETITOR_CATALOG_TARGET_COLLECTION_FAILED');
  const failures = harness.requests.filter(({ path }) => path.endsWith('/fail'));
  assert.equal(failures.length, 3);
  assert.deepEqual(failures[0].body, {
    code: 'COMPETITOR_CATALOG_TARGET_COLLECTION_FAILED',
    message: 'Competitor catalog collection did not prove every frozen seller target.',
  });
  assert.equal(harness.requests.some(({ path }) => path === `/api/ads/competitor-catalogs/attempts/${ATTEMPT_ID}`), false);
});

test('treats an incomplete seller catalog response as a failed generation, not an attention-only success', async () => {
  const harness = createHarness({
    collectTarget: async () => ({
      success: false,
      error: 'seller catalog did not load',
      tabId: 77,
    }),
  });

  const result = await harness.owner.run({
    environmentId: 'office',
    idempotencyKey: 'retry-key',
    input: { target: 'all' },
  });

  assert.equal(result.terminalState, 'FAILED');
  assert.equal(result.errorCode, 'COMPETITOR_CATALOG_TARGET_COLLECTION_FAILED');
  assert.equal(
    harness.requests.filter(({ path }) => path.endsWith('/fail')).length,
    1,
  );
  assert.equal(harness.sessionCalls.some(([name]) => name === 'attention'), false);
});

test('returns a replayed terminal plan without recollecting a completed or failed attempt', async () => {
  for (const state of ['COMPLETE', 'FAILED']) {
    const harness = createHarness({ plan: plan(state) });
    const result = await harness.owner.run({
      environmentId: 'office',
      idempotencyKey: 'retry-key',
      input: { target: 'all' },
    });

    assert.equal(harness.requests.length, 1);
    assert.equal(result.terminalState, state);
    assert.equal(result.success, state === 'COMPLETE');
    if (state === 'FAILED') assert.equal(result.retryRequired, true);
  }
});

test('registers only the direct allowlisted action and routes cancellation to the owner', () => {
  assert.match(worker, /collectAdvertisingCompetitorCatalog:\s*\{/);
  assert.equal(/validate:\s*KidItemCompetitorCatalogSourceOwner\.parseStart/.test(worker), true);
  assert.match(worker, /competitorCatalogSourceOwner\.run\(\{/);
  assert.match(worker, /competitorCatalogSourceOwner\.cancel\(\{/);
  assert.doesNotMatch(worker, /advertising\.collect_competitor_catalog/);
  assert.doesNotMatch(worker, /browser-operations\/.+catalogs/);
});
