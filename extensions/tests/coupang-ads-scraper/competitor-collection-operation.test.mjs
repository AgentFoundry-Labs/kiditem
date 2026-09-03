import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(
  new URL('../../kiditem-os/background/coupang/worker.js', import.meta.url),
  'utf8',
);
const keywordContractSource = await readFile(
  new URL('../../kiditem-os/background/coupang/wing-keyword-contract.js', import.meta.url),
  'utf8',
);

function operationSource() {
  const start = source.indexOf('const SOURCING_WING_CATALOG_OPERATION_KEY');
  const end = source.indexOf('async function collectAdvertisingProfitabilitySlice', start);
  assert.ok(start >= 0 && end > start);
  return source.slice(start, end);
}

const target = {
  sellerId: 'A00219251',
  sellerName: '도그블랑',
  sellerStoreUrl: 'https://shop.coupang.com/A00219251',
  keyword: '노루잡화점 크런치 슬랑이',
};

function collectedCatalog(candidate = target) {
  return {
    ...candidate,
    priorityScore: 100,
    totalProductCount: 1,
    collectedProductCount: 1,
    isTruncated: false,
    sort: 'newest',
    capturedAt: '2026-08-14T00:00:30.000Z',
    products: [{
      sourceRank: 1,
      productId: '123',
      itemId: null,
      vendorItemId: '456',
      name: '슬랑이',
      priceKrw: 12_000,
      reviewCount: 4,
      imageUrl: null,
      link: 'https://www.coupang.com/vp/products/123',
      raw: { secret: true },
    }],
  };
}

function createHarness(options = {}) {
  const requests = [];
  const collectionCalls = [];
  const sessionCalls = [];
  const heartbeats = [];
  const controller = options.controller || new AbortController();
  const collectionSessions = {
    async getOwned() { return null; },
    async start(input) { sessionCalls.push(['start', input]); return { ...input, status: 'running' }; },
    async attachTab(runId, tab) { sessionCalls.push(['attachTab', runId, tab]); },
    async progress(runId, progress) { sessionCalls.push(['progress', runId, progress]); },
    async detachTab(runId, detach) { sessionCalls.push(['detachTab', runId, detach]); },
    async succeed(runId) { sessionCalls.push(['succeed', runId]); },
    async fail(runId) { sessionCalls.push(['fail', runId]); },
  };
  const targets = options.targets || [target];
  const fetchCoupangCompetitorSellerTargets = async () => targets;
  const createTab = async (input) => ({ id: 77, ...input });
  const collectCoupangSellerCatalogs = async (tabId, candidates) => {
    collectionCalls.push({ tabId, candidates });
    if (options.collect) return options.collect(candidates[0], controller);
    return [collectedCatalog(candidates[0])];
  };
  const authedFetch = async (environmentId, path, init) => {
    requests.push({ environmentId, path, init, body: JSON.parse(init.body) });
    if (options.status) {
      return new Response(JSON.stringify({ message: 'lost' }), {
        status: options.status,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify(options.persisted || {
      captured: 1,
      ignored: 0,
      ignoredReasons: { missingSerpSnapshot: 0, newerCatalogPreserved: 0 },
      replayed: false,
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const raceWingCatalogOperationAbort = async (pending, signal) => {
    signal?.throwIfAborted?.();
    const value = await pending;
    signal?.throwIfAborted?.();
    return value;
  };
  const context = vm.createContext({
    AbortController,
    Date,
    Error,
    JSON,
    Math,
    Promise,
    Response,
    Set,
    String,
    TypeError,
    URL,
    WING_CATALOG_MAX_PAGES: 5,
    authedFetch,
    collectCoupangSellerCatalogs,
    collectionSessions,
    createTab,
    fetchCoupangCompetitorSellerTargets,
    raceWingCatalogOperationAbort,
  });
  context.globalThis = context;
  vm.runInContext(
    `${keywordContractSource}\n${operationSource()}\n` +
      'globalThis.runCompetitorOperation = runAdvertisingCompetitorCatalogOperation;',
    context,
  );
  const operation = {
    environmentId: 'office',
    runId: '11111111-1111-4111-8111-111111111111',
    attemptToken: '22222222-2222-4222-8222-222222222222',
    input: { target: 'seller_id', sellerId: target.sellerId },
    signal: controller.signal,
    async heartbeat(update) { heartbeats.push(update); },
  };
  return {
    collectionCalls,
    context,
    controller,
    heartbeats,
    operation,
    requests,
    sessionCalls,
  };
}

test('registers only the exact competitor catalog operation key', () => {
  assert.match(
    source,
    /"advertising\.collect_competitor_catalog": runAdvertisingCompetitorCatalogOperation/,
  );
  assert.doesNotMatch(
    source,
    /advertising\.(?:generic|url|action).*runAdvertisingCompetitorCatalogOperation/,
  );
});

test('resolves the exact server target, reuses one tab, and posts sanitized rows to Ads', async () => {
  const harness = createHarness();
  const outcome = await harness.context.runCompetitorOperation(harness.operation);

  assert.equal(harness.collectionCalls.length, 1);
  assert.equal(harness.collectionCalls[0].tabId, 77);
  assert.equal(harness.sessionCalls.filter(([name]) => name === 'start').length, 1);
  assert.equal(harness.requests.length, 1);
  assert.match(
    harness.requests[0].path,
    /\/api\/ads\/competitors\/browser-operations\/.+\/catalogs$/,
  );
  assert.equal(
    harness.requests[0].init.headers['x-operation-attempt-token'],
    harness.operation.attemptToken,
  );
  assert.equal(harness.requests[0].body.catalogs[0].priorityScore, undefined);
  assert.equal(harness.requests[0].body.catalogs[0].products[0].raw, undefined);
  assert.equal(outcome.status, 'succeeded');
  assert.equal(outcome.result.outcome, 'complete');
  assert.equal(JSON.stringify(outcome).includes('슬랑이'), false);
});

test('configured collection is serial with mixed outcome, while all failed is failed', async () => {
  const second = { ...target, sellerId: 'littlei', sellerName: '리틀아이', sellerStoreUrl: 'https://shop.coupang.com/littlei' };
  const mixed = createHarness({
    targets: [target, second],
    collect: async (candidate) => {
      if (candidate.sellerId === second.sellerId) throw new Error('provider failed');
      return [collectedCatalog(candidate)];
    },
  });
  mixed.operation.input = { target: 'configured_watchlist' };
  const partial = await mixed.context.runCompetitorOperation(mixed.operation);
  assert.equal(partial.status, 'succeeded');
  assert.equal(partial.result.outcome, 'partial');
  assert.deepEqual(mixed.collectionCalls.map(({ tabId }) => tabId), [77, 77]);
  assert.equal(mixed.requests.length, 1);

  const failed = createHarness({ collect: async () => { throw new Error('provider failed'); } });
  const failure = await failed.context.runCompetitorOperation(failed.operation);
  assert.equal(failure.status, 'failed');
  assert.equal(failed.requests.length, 0);
});

test('a collected seller with no SERP baseline is partial and never mislabeled as provider failure', async () => {
  const harness = createHarness({
    persisted: {
      captured: 0,
      ignored: 1,
      ignoredReasons: { missingSerpSnapshot: 1, newerCatalogPreserved: 0 },
      replayed: false,
    },
  });

  const outcome = await harness.context.runCompetitorOperation(harness.operation);

  assert.equal(outcome.status, 'succeeded');
  assert.equal(outcome.result.outcome, 'partial');
  assert.equal(outcome.result.summary.failed, 0);
  assert.equal(outcome.result.summary.unchanged, 1);
  assert.equal(outcome.result.sources[0].errorCode, 'competitor_catalog_serp_snapshot_missing');
  assert.equal(harness.sessionCalls.some(([name]) => name === 'fail'), false);
});

test('requires attention for an empty primitive and rejects unconfigured seller input', async () => {
  const attention = createHarness({ collect: async () => [] });
  const outcome = await attention.context.runCompetitorOperation(attention.operation);
  assert.equal(outcome.status, 'attention_required');
  assert.equal(attention.requests.length, 0);

  const missing = createHarness();
  missing.operation.input = { target: 'seller_id', sellerId: 'outside-seller' };
  const missingResult = await missing.context.runCompetitorOperation(missing.operation);
  assert.equal(missingResult.status, 'failed');
  assert.equal(missing.collectionCalls.length, 0);
});

test('abort and fence loss suppress stale publication and terminal session writes', async () => {
  const aborted = createHarness({
    collect: async (_candidate, controller) => {
      controller.abort(new Error('cancelled'));
      return [collectedCatalog()];
    },
  });
  await assert.rejects(
    aborted.context.runCompetitorOperation(aborted.operation),
    /cancelled/,
  );
  assert.equal(aborted.requests.length, 0);
  assert.equal(
    aborted.sessionCalls.some(([name]) => name === 'succeed' || name === 'fail'),
    false,
  );

  const fenced = createHarness({ status: 409 });
  await assert.rejects(
    fenced.context.runCompetitorOperation(fenced.operation),
    /operation_runtime_fence_lost/,
  );
  assert.equal(
    fenced.sessionCalls.some(([name]) => name === 'succeed' || name === 'fail'),
    false,
  );
});
