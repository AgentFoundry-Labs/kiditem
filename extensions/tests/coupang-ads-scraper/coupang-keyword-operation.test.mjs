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
  const end = source.indexOf('async function runAdvertisingProfitabilityOperation', start);
  assert.ok(start >= 0 && end > start);
  return source.slice(start, end);
}

function createHarness(options = {}) {
  const requests = [];
  const searches = [];
  const heartbeats = [];
  const controller = options.controller || new AbortController();
  const searchCoupangKeywordSuggestions = async (message) => {
    searches.push(message);
    if (options.search) return options.search(message, controller);
    return {
      success: true,
      keyword: message.keyword,
      source: 'coupang-autocomplete',
      items: [{ rank: 1, keyword: '아동 연필', source: 'coupang-autocomplete' }],
      productNameTokens: [{ keyword: '연필', count: 4 }],
    };
  };
  const authedFetch = async (environmentId, path, init) => {
    requests.push({ environmentId, path, init, body: JSON.parse(init.body) });
    if (options.status) {
      return new Response(JSON.stringify({ message: 'lost' }), {
        status: options.status,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({
      published: true,
      acceptedCount: options.acceptedCount ?? 1,
      duplicate: false,
    }), { status: 200, headers: { 'content-type': 'application/json' } });
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
    raceWingCatalogOperationAbort,
    searchCoupangKeywordSuggestions,
  });
  context.globalThis = context;
  vm.runInContext(
    `${keywordContractSource}\n${operationSource()}\n` +
      'globalThis.runKeywordOperation = runSourcingKeywordSuggestionOperation;',
    context,
  );
  const operation = {
    environmentId: 'office',
    runId: '11111111-1111-4111-8111-111111111111',
    attemptToken: '22222222-2222-4222-8222-222222222222',
    input: { keyword: '  Ａ   Pencil ', maxResults: 30 },
    signal: controller.signal,
    async heartbeat(update) { heartbeats.push(update); },
  };
  return { context, controller, heartbeats, operation, requests, searches };
}

test('registers only the exact keyword suggestion operation key', () => {
  assert.match(
    source,
    /"sourcing\.collect_keyword_suggestions": runSourcingKeywordSuggestionOperation/,
  );
  assert.doesNotMatch(
    source,
    /sourcing\.(?:generic|url|action).*runSourcingKeywordSuggestionOperation/,
  );
});

test('runs one existing suggestion primitive and posts a bounded token-fenced owner batch', async () => {
  const harness = createHarness();
  const result = await harness.context.runKeywordOperation(harness.operation);

  assert.equal(harness.searches.length, 1);
  assert.equal(harness.searches[0].keyword, 'A Pencil');
  assert.equal(harness.searches[0].maxResults, 30);
  assert.equal(harness.requests.length, 1);
  assert.match(
    harness.requests[0].path,
    /\/api\/sourcing\/workspace\/browser-operations\/.+\/keyword-suggestions$/,
  );
  assert.equal(
    harness.requests[0].init.headers['x-operation-attempt-token'],
    harness.operation.attemptToken,
  );
  assert.deepEqual(harness.requests[0].body.items, [
    { rank: 1, keyword: '아동 연필', source: 'coupang-autocomplete' },
  ]);
  assert.equal(result.status, 'succeeded');
  assert.equal(result.result.outcome, 'complete');
  assert.equal(JSON.stringify(result).includes('아동 연필'), false);
  assert.ok(harness.heartbeats.some((value) => value.stage === 'persisting'));
});

test('persists an empty snapshot as no-change and reports a single-unit failure truthfully', async () => {
  const empty = createHarness({
    acceptedCount: 0,
    search: async (message) => ({
      success: true,
      keyword: message.keyword,
      items: [],
      productNameTokens: [],
    }),
  });
  const noChange = await empty.context.runKeywordOperation(empty.operation);
  assert.equal(noChange.status, 'succeeded');
  assert.equal(noChange.result.outcome, 'no_change');
  assert.deepEqual(empty.requests[0].body.items, []);

  const failed = createHarness({
    search: async () => ({ success: false, error: 'provider failed' }),
  });
  const outcome = await failed.context.runKeywordOperation(failed.operation);
  assert.equal(outcome.status, 'failed');
  assert.equal(failed.requests.length, 0);
});

test('returns attention without publication and abort/fence loss suppress stale writes', async () => {
  const attention = createHarness({
    search: async () => ({ attentionRequired: true }),
  });
  const attentionResult = await attention.context.runKeywordOperation(attention.operation);
  assert.equal(attentionResult.status, 'attention_required');
  assert.equal(attention.requests.length, 0);

  const aborted = createHarness({
    search: async (_message, controller) => {
      controller.abort(new Error('cancelled'));
      return { success: true, items: [], productNameTokens: [] };
    },
  });
  await assert.rejects(
    aborted.context.runKeywordOperation(aborted.operation),
    /cancelled/,
  );
  assert.equal(aborted.requests.length, 0);

  const fenced = createHarness({ status: 409 });
  await assert.rejects(
    fenced.context.runKeywordOperation(fenced.operation),
    /operation_runtime_fence_lost/,
  );
});
