import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(
  new URL('../../kiditem-os/background/coupang/worker.js', import.meta.url),
  'utf8',
);

function operationSource() {
  const start = source.indexOf('const SOURCING_WING_CATALOG_OPERATION_KEY');
  const end = source.indexOf('async function runAdvertisingProfitabilityOperation', start);
  assert.ok(start >= 0, 'exact Wing catalog operation block must exist');
  assert.ok(end > start, 'Wing operation block must precede profitability operation');
  return source.slice(start, end);
}

function row(keyword, id) {
  return {
    productId: id,
    itemId: null,
    vendorItemId: `${id}-vendor`,
    productName: `${keyword} 상품`,
    itemName: null,
    brandName: null,
    manufacture: null,
    categoryHierarchy: '장난감',
    imagePath: null,
    salePrice: 12_000,
    rating: 4.5,
    ratingCount: 10,
    pvLast28Day: 100,
    salesLast28d: 20,
    estimatedRevenue28d: 240_000,
    conversionRate28d: 0.2,
    deliveryInfo: '로켓배송',
  };
}

function createHarness(options = {}) {
  const requests = [];
  const searches = [];
  const heartbeats = [];
  const sessionCalls = [];
  let existing = null;
  const collectionSessions = {
    async getOwned(runId, environmentId) {
      sessionCalls.push(['getOwned', runId, environmentId]);
      return existing;
    },
    async start(input) {
      sessionCalls.push(['start', input]);
      existing = { runId: input.runId, environmentId: input.environmentId, producer: input.producer, status: 'running' };
      return existing;
    },
    async progress(runId, progress) {
      sessionCalls.push(['progress', runId, progress]);
    },
    async detachTab(runId, detachOptions) {
      sessionCalls.push(['detachTab', runId, detachOptions]);
    },
    async succeed(runId) {
      sessionCalls.push(['succeed', runId]);
    },
    async fail(runId) {
      sessionCalls.push(['fail', runId]);
    },
  };
  let searchIndex = 0;
  const searchWingCatalogProducts = async (message) => {
    searches.push(message);
    if (typeof options.search === 'function') {
      return options.search(message, searchIndex++);
    }
    const keyword = message.keyword;
    searchIndex += 1;
    return {
      success: true,
      tabId: 77,
      rows: [row(keyword, String(searchIndex))],
    };
  };
  const authedFetch = async (environmentId, path, init) => {
    const body = init.body ? JSON.parse(init.body) : null;
    requests.push({ environmentId, path, init, body });
    if (typeof options.fetchResponse === 'function') {
      return options.fetchResponse({ environmentId, path, init, body });
    }
    if (path.endsWith('/finalize')) {
      return new Response(JSON.stringify({ finalized: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({
      kind: 'committed',
      acceptedCount: body.items.length,
      duplicateCount: 0,
      staleDiscardedCount: 0,
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
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
    WING_CATALOG_MAX_PAGES: 5,
    authedFetch,
    collectionSessions,
    searchWingCatalogProducts,
  });
  context.globalThis = context;
  vm.runInContext(
    `${operationSource()}\nglobalThis.runWingCatalogOperation = runSourcingWingCatalogOperation;`,
    context,
  );
  const operation = {
    environmentId: 'office',
    runId: '11111111-1111-4111-8111-111111111111',
    attemptToken: '22222222-2222-4222-8222-222222222222',
    input: {
      keywords: [' 슬라임 ', '클레이'],
      maxPages: 2,
      purpose: 'catalog_search',
    },
    signal: new AbortController().signal,
    async heartbeat(update) {
      heartbeats.push(update);
    },
  };
  return { context, heartbeats, operation, requests, searches, sessionCalls };
}

test('registers only the exact Wing catalog browser operation key', () => {
  assert.match(
    source,
    /"sourcing\.collect_wing_catalog_batch": runSourcingWingCatalogOperation/,
  );
  assert.doesNotMatch(source, /sourcing\.(?:generic|url|action).*runSourcingWingCatalogOperation/);
});

test('reuses one run session and Wing tab, uploads each keyword, heartbeats counts, and finalizes once', async () => {
  const harness = createHarness();
  const outcome = await harness.context.runWingCatalogOperation(harness.operation);

  assert.equal(harness.sessionCalls.filter(([name]) => name === 'start').length, 1);
  assert.equal(harness.searches.length, 2);
  assert.equal(harness.searches[0].collectionRunId, harness.operation.runId);
  assert.equal(harness.searches[0].collectionTabId, undefined);
  assert.equal(harness.searches[1].collectionTabId, 77);
  assert.equal(harness.searches[0].signal, harness.operation.signal);
  assert.deepEqual(
    harness.heartbeats.map(({ stage, progressCurrent, progressTotal }) => ({ stage, progressCurrent, progressTotal })),
    [
      { stage: 'collecting_keyword', progressCurrent: 0, progressTotal: 2 },
      { stage: 'collecting_keyword', progressCurrent: 1, progressTotal: 2 },
      { stage: 'collecting_keyword', progressCurrent: 1, progressTotal: 2 },
      { stage: 'collecting_keyword', progressCurrent: 2, progressTotal: 2 },
      { stage: 'finalizing', progressCurrent: 2, progressTotal: 2 },
    ],
  );
  assert.equal(harness.requests.filter(({ path }) => path.endsWith('/coupang-observations')).length, 2);
  assert.equal(harness.requests.filter(({ path }) => path.endsWith('/finalize')).length, 1);
  for (const request of harness.requests) {
    assert.equal(
      request.init.headers['x-operation-attempt-token'],
      harness.operation.attemptToken,
    );
    assert.equal('organizationId' in (request.body || {}), false);
  }
  const ingestRequests = harness.requests.filter(({ path }) =>
    path.endsWith('/coupang-observations'));
  assert.deepEqual(
    ingestRequests.map(({ body }) => body.purpose),
    ['catalog_search', 'catalog_search'],
  );
  assert.equal(outcome.status, 'succeeded');
  assert.equal(outcome.result.outcome, 'complete');
  assert.equal(outcome.result.summary.accepted, 2);
  assert.equal(JSON.stringify(outcome).includes('슬라임 상품'), false);
  assert.equal(harness.sessionCalls.filter(([name]) => name === 'detachTab').length, 1);
  assert.equal(harness.sessionCalls.filter(([name]) => name === 'succeed').length, 1);
});

test('returns attention without finalize and preserves the managed login tab', async () => {
  const harness = createHarness({
    search: async () => ({
      success: false,
      attentionRequired: true,
      tabId: 88,
      error: '로그인 필요',
    }),
  });

  const outcome = await harness.context.runWingCatalogOperation(harness.operation);

  assert.deepEqual(JSON.parse(JSON.stringify(outcome)), {
    status: 'attention_required',
    attentionReason: 'marketplace_login',
  });
  assert.equal(harness.requests.length, 0);
  assert.equal(harness.sessionCalls.some(([name]) => name === 'detachTab'), false);
  assert.equal(harness.sessionCalls.some(([name]) => name === 'fail'), false);
});

test('reports a failed outcome when every keyword fails and a partial safe summary when mixed', async () => {
  const allFailed = createHarness({
    search: async () => { throw new Error('provider secret response'); },
  });
  const failedOutcome = await allFailed.context.runWingCatalogOperation(allFailed.operation);
  assert.equal(failedOutcome.status, 'failed');
  assert.equal(failedOutcome.errorCode, 'wing_catalog_all_keywords_failed');
  assert.equal(JSON.stringify(failedOutcome).includes('provider secret response'), false);
  assert.equal(allFailed.requests.filter(({ path }) => path.endsWith('/finalize')).length, 1);

  const mixed = createHarness({
    search: async (message, index) => {
      if (index === 0) return { success: true, tabId: 77, rows: [row(message.keyword, '1')] };
      throw new Error('second failed');
    },
  });
  const partialOutcome = await mixed.context.runWingCatalogOperation(mixed.operation);
  assert.equal(partialOutcome.status, 'succeeded');
  assert.equal(partialOutcome.result.outcome, 'partial');
  assert.equal(partialOutcome.result.summary.accepted, 1);
  assert.equal(partialOutcome.result.summary.failed, 1);
});

test('propagates abort and never uploads, finalizes, or marks a stale terminal session', async () => {
  const controller = new AbortController();
  const harness = createHarness({
    search: (message) => new Promise((_resolve, reject) => {
      message.signal.addEventListener('abort', () => reject(message.signal.reason), { once: true });
    }),
  });
  harness.operation.signal = controller.signal;

  const pending = harness.context.runWingCatalogOperation(harness.operation);
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort(new Error('operation_runtime_fence_lost'));
  await assert.rejects(pending, /operation_runtime_fence_lost/);

  assert.equal(harness.requests.length, 0);
  assert.equal(harness.sessionCalls.some(([name]) => name === 'succeed'), false);
  assert.equal(harness.sessionCalls.some(([name]) => name === 'fail'), false);
});

test('fails and closes the local session when a non-fence ingest request fails', async () => {
  const harness = createHarness({
    fetchResponse: async () => new Response(null, { status: 503 }),
  });

  await assert.rejects(
    harness.context.runWingCatalogOperation(harness.operation),
    /wing_catalog_ingest_http_503/,
  );

  assert.equal(harness.sessionCalls.filter(([name]) => name === 'fail').length, 1);
  assert.equal(harness.sessionCalls.filter(([name]) => name === 'detachTab').length, 1);
  assert.equal(harness.sessionCalls.some(([name]) => name === 'succeed'), false);
});

test('does not write a local terminal state when ingest reports fence loss', async () => {
  const harness = createHarness({
    fetchResponse: async () => new Response(null, { status: 409 }),
  });

  await assert.rejects(
    harness.context.runWingCatalogOperation(harness.operation),
    /operation_runtime_fence_lost/,
  );

  assert.equal(harness.sessionCalls.some(([name]) => name === 'fail'), false);
  assert.equal(harness.sessionCalls.some(([name]) => name === 'succeed'), false);
});
