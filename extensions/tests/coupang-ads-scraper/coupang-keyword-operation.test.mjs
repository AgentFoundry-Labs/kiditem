import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
const source = await readFile(new URL('../../kiditem-os/background/coupang/worker.js', import.meta.url), 'utf8');
const contract = await readFile(new URL('../../kiditem-os/background/coupang/wing-keyword-contract.js', import.meta.url), 'utf8');
const wire = await readFile(new URL('../../kiditem-os/background/sourcing/source-attempt-wire.js', import.meta.url), 'utf8');
const collectorSource = await readFile(new URL('../../kiditem-os/background/coupang/coupang-keyword-suggestion-collector.js', import.meta.url), 'utf8');
const ownerSource = await readFile(new URL('../../kiditem-os/background/coupang/keyword-suggestion-source-owner.js', import.meta.url), 'utf8');
const sessionsSource = await readFile(new URL('../../shared/collection-session.js', import.meta.url), 'utf8');
const runsSource = await readFile(new URL('../../kiditem-os/background/coupang/collection-runs.js', import.meta.url), 'utf8');
const attemptId = '11111111-1111-4111-8111-111111111111';
const attemptToken = '22222222-2222-4222-8222-222222222222';
function harness(options = {}) {
  const requests = [], searches = [], stored = options.stored || {};
  let state = 'RUNNING', remainingLosses = options.losses || 0;
  let uncommittedLosses = options.uncommittedLosses || 0;
  const attempt = () => ({ attemptId, attemptToken, sourceKey: 'coupang.keyword_suggestion',
    scopeKey: 'default', targetKey: 'keyword:a pencil', state,
    expiresAt: new Date(Date.now() + 900000).toISOString(),
    plan: { source: 'coupang.keyword_suggestion', keyword: 'A Pencil', maxResults: 2 } });
  const context = vm.createContext({
    console, Date, Error, JSON, Math, Promise, Response, Set, String, TypeError, URL,
    WING_CATALOG_MAX_PAGES: 5,
    chrome: { storage: { local: {
      get: async (key, cb) => { const value = { [key]: stored[key] }; cb?.(value); return value; },
      set: async (value, cb) => { Object.assign(stored, value); cb?.(); },
    } }, tabs: { remove: async () => undefined }, scripting: { executeScript: async () => [] } },
    sharedEnvironmentContext: { requireEnvironment: (id) => {
      if (!['office', 'local'].includes(id)) throw new Error('wrong environment');
    } },
    authedFetch: async (environmentId, path, init) => {
      const body = init.body ? JSON.parse(init.body) : null;
      requests.push({ environmentId, path, init, body });
      if (init.method === 'PUT' || path.endsWith('/fail')) {
        if (options.terminal) await options.terminal(path, body);
        if (options.fence) return Response.json({ message: 'ATTEMPT_FENCE_LOST' }, { status: 409 });
        if (uncommittedLosses-- > 0) throw new Error('request lost before commit');
        state = init.method === 'PUT' ? 'COMPLETE' : 'FAILED';
        if (remainingLosses-- > 0) throw new Error('lost response');
      }
      return Response.json(options.wrongSource ? { ...attempt(), sourceKey: 'other' } : attempt());
    },
    collectionSessions: null,
    searchCoupangKeywordSuggestions: async (message) => {
      searches.push(message);
      if (options.search) return options.search(message);
      return { success: true, items: [
        { keyword: '  Ａ Toy ', source: 'coupang-autocomplete' },
        { keyword: 'a toy', source: 'coupang-search-dom' },
        { keyword: '연필', source: 'coupang-search-dom' },
        { keyword: 'ignored', source: 'coupang-autocomplete' },
      ], productNameTokens: [{ keyword: ' Ａ Toy ', count: 4 }, { keyword: 'a toy', count: 8 },
        { keyword: '연필', count: 2 }], warnings: ['DOM fallback'] };
    },
  });
  context.globalThis = context;
  const input = { environmentId: 'office', idempotencyKey: 'key', input: { keyword: ' Ａ  Pencil ', maxResults: 2 } };
  const closedTabs = [];
  if (options.realCollector) {
    context.chrome.tabs = { remove: async (id) => closedTabs.push(id), query: async () => [] };
    context.chrome.scripting = { executeScript: async () => [{ result: options.extracted || ({ success: true, items: [], productNameTokens: [] }) }] };
    vm.runInContext(sessionsSource + '\n' + runsSource, context);
    context.collectionSessions = context.KidItemCollectionSession.create({
      chrome: context.chrome, storageKey: 'keyword_sessions', webUrlPatterns: [],
    });
    context.collectionRuns = context.KidItemCollectionRuns.create({
      chrome: context.chrome, sessions: context.collectionSessions,
    });
    context.createKeywordTab = async () => ({ id: 7, windowId: 8 });
    context.bindKeywordTab = async () => undefined;
    context.waitKeywordTab = async () => ({ url: 'https://www.coupang.com/np/search' });
    context.keywordAttention = async (runId, tabId, reason, message) => context.collectionRuns.requireAttention(runId, tabId, reason, message);
  } else {
    let ownerSession = null;
    context.collectionSessions = {
      start: async (value) => { ownerSession = { ...value, attention: null }; return ownerSession; },
      getOwned: async () => ownerSession,
      cancel: async (_id, cancelOptions) => {
        if (cancelOptions?.ownerFailure) assert.equal((await cancelOptions.ownerFailure()).accepted, true);
        ownerSession = null;
        return { attemptId };
      },
    };
  }
  vm.runInContext(contract + '\n' + wire + '\n' + collectorSource + '\n' + ownerSource, context);
  let capture;
  if (options.realCollector) {
    const collector = context.KidItemCoupangKeywordSuggestionCollector.create({
      chrome: context.chrome,
      sessions: context.collectionSessions,
      createTab: context.createKeywordTab,
      bindTab: context.bindKeywordTab,
      waitForTabComplete: context.waitKeywordTab,
      attention: context.keywordAttention,
      delay: async () => undefined,
    });
    capture = async (message) => {
      searches.push(message);
      return collector.collect(message);
    };
  } else {
    capture = context.searchCoupangKeywordSuggestions;
  }
  const owner = context.KidItemKeywordSuggestionSourceOwner.create({
    chrome: context.chrome,
    sessions: context.collectionSessions,
    requireEnvironment: context.sharedEnvironmentContext.requireEnvironment,
    request: context.authedFetch,
    collect: capture,
  });
  Object.assign(context, {
    runKeywordSource: (value) => owner.run(value),
    parseStart: context.KidItemKeywordSuggestionSourceOwner.parseStart,
    cancelKeywordSource: (id, environmentId) => owner.cancel({ environmentId, attemptId: id }),
  });
  return { context, input, requests, searches, stored, closedTabs };
}

test('direct action follows owner plan and preserves exact sanitized collector fixture and warnings', async () => {
  const h = harness();
  const result = await h.context.runKeywordSource(h.input);
  assert.equal(h.searches.length, 1);
  assert.equal(h.searches[0].keyword, 'A Pencil');
  assert.equal(h.searches[0].maxResults, 2);
  assert.equal(h.searches[0].runId, attemptId);
  const upload = h.requests.find((request) => request.init.method === 'PUT');
  assert.equal(upload.init.headers['x-source-attempt-token'], attemptToken);
  assert.deepEqual(upload.body.items, [
    { rank: 1, keyword: 'A Toy', source: 'coupang-autocomplete' },
    { rank: 2, keyword: '연필', source: 'coupang-search-dom' },
  ]);
  assert.deepEqual(upload.body.productNameTokens, [{ keyword: 'A Toy', count: 4 }, { keyword: '연필', count: 2 }]);
  assert.deepEqual(upload.body.warnings, ['DOM fallback']);
  assert.equal(result.state, 'COMPLETE');
  assert.equal(JSON.stringify(result).includes('A Toy'), false);
  assert.equal(JSON.stringify(result).includes(attemptToken), false);
  assert.equal(JSON.stringify(h.stored).includes(attemptToken), false);
});

test('strict direct start preserves input normalization and rejects defaults, oversized inputs and environment injection', () => {
  const h = harness();
  assert.deepEqual(JSON.parse(JSON.stringify(h.context.parseStart({
    action: 'collectSourcingKeywordSuggestions', idempotencyKey: 'key', keyword: '  Ａ Pencil ', maxResults: 30,
  }))), { idempotencyKey: 'key', input: { keyword: 'A Pencil', maxResults: 30 } });
  for (const extra of [{ maxResults: undefined }, { maxResults: 31 }, { environmentId: 'local' }]) {
    assert.throws(() => h.context.parseStart({ action: 'collectSourcingKeywordSuggestions',
      idempotencyKey: 'key', keyword: 'pencil', maxResults: 30, ...extra }));
  }
});

test('uncertain terminal responses replay identical upload bytes without recollection', async () => {
  const h = harness({ losses: 2 });
  assert.equal((await h.context.runKeywordSource(h.input)).state, 'COMPLETE');
  const uploads = h.requests.filter((request) => request.init.method === 'PUT');
  assert.equal(uploads.length, 3);
  assert.ok(uploads.every((request) => request.init.body === uploads[0].init.body));
  assert.equal(h.searches.length, 1);
  assert.equal((await h.context.runKeywordSource(h.input)).state, 'COMPLETE');
  assert.equal(h.searches.length, 1);
});

test('failed collection and login attention terminalize the source without publication', async () => {
  for (const search of [async () => ({ success: false }), async () => ({ attentionRequired: true })]) {
    const h = harness({ search });
    assert.equal((await h.context.runKeywordSource(h.input)).state, 'FAILED');
    assert.equal(h.requests.filter((request) => request.init.method === 'PUT').length, 0);
    assert.ok(h.requests.some((request) => request.path.endsWith('/fail')));
  }
});

test('wrong environment, wrong source and lost token fence stop safely without compensating terminal writes', async () => {
  const invalid = harness();
  assert.throws(() => invalid.context.runKeywordSource({ ...invalid.input, environmentId: 'evil' }), /environment/);
  assert.equal(invalid.searches.length, 0);
  const wrong = harness({ wrongSource: true });
  await assert.rejects(wrong.context.runKeywordSource(wrong.input), /SOURCE_PLAN_INVALID/);
  assert.equal(wrong.searches.length, 0);
  const fenced = harness({ fence: true });
  await assert.rejects(fenced.context.runKeywordSource(fenced.input), /ATTEMPT_FENCE_LOST/);
  assert.equal(fenced.requests.filter((request) => request.init.method === 'PUT').length, 1);
  assert.equal(fenced.requests.filter((request) => request.path.endsWith('/fail')).length, 0);
});

test('moved keyword action and suggestions session are registered to the Sourcing owner', async () => {
  assert.match(source, /collectSourcingKeywordSuggestions:\s*\{/);
  assert.doesNotMatch(source, /"sourcing\.collect_keyword_suggestions":/);
  assert.match(ownerSource, /"sourcing\.keyword_suggestion"/);
  assert.match(collectorSource, /return Object\.freeze\(\{ collect \}\)/);
  const { SOURCE_OWNER_BY_PRODUCER } = await import('../../kiditem-os/background/source-owner-manifest.js');
  assert.equal(SOURCE_OWNER_BY_PRODUCER['sourcing.keyword_suggestion'], 'sourcing');
});

test('retry after exhausted transport uses the retained terminal payload and never recollects', async () => {
  const h = harness({ uncommittedLosses: 3 });
  await assert.rejects(h.context.runKeywordSource(h.input), /request lost before commit/);
  assert.equal((await h.context.runKeywordSource(h.input)).state, 'COMPLETE');
  const uploads = h.requests.filter((request) => request.init.method === 'PUT');
  assert.equal(uploads.length, 4);
  assert.ok(uploads.every((request) => request.init.body === uploads[0].init.body));
  assert.equal(h.searches.length, 1);
});

test('worker suspension leaves an interrupted running attempt stopped without publishing a guessed failure', async () => {
  const stored = { ['kiditem_keyword_suggestion_attempt_v1:office:' + attemptId]: { attemptId, idempotencyKey: 'key' } };
  const h = harness({ stored });
  const result = await h.context.runKeywordSource(h.input);
  assert.equal(result.state, 'RUNNING');
  assert.equal(result.cancellationPending, true);
  assert.equal(h.searches.length, 0);
  assert.equal(h.requests.filter((request) => request.init.method === 'PUT').length, 0);
  assert.equal(h.requests.filter((request) => request.path.endsWith('/fail')).length, 0);
});

test('cancellation waits for one owner acknowledgement when extraction resolves or rejects first', async () => {
  for (const extractionFails of [false, true]) {
    let releaseExtraction, extractionStarted, releaseAck, failureStarted;
    const extractionGate = new Promise((resolve) => { releaseExtraction = resolve; });
    const started = new Promise((resolve) => { extractionStarted = resolve; });
    const ackGate = new Promise((resolve) => { releaseAck = resolve; });
    const requested = new Promise((resolve) => { failureStarted = resolve; });
    const h = harness({
      search: async () => {
        extractionStarted();
        await extractionGate;
        if (extractionFails) throw new Error('tab closed');
        return { success: true, items: [], productNameTokens: [] };
      },
      terminal: async (path) => {
        if (path.endsWith('/fail')) { failureStarted(); await ackGate; }
      },
    });
    let settled = false;
    const running = h.context.runKeywordSource(h.input).then((value) => { settled = true; return value; });
    await started;
    const cancellation = h.context.cancelKeywordSource(attemptId, 'office');
    await requested;
    releaseExtraction();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(settled, false, 'collection must await the delayed owner failure acknowledgement');
    assert.equal(h.requests.filter((request) => request.init.method === 'PUT').length, 0);
    releaseAck();
    assert.equal((await running).state, 'FAILED');
    await cancellation;
    assert.equal(h.requests.filter((request) => request.path.endsWith('/fail')).length, 1);
    assert.equal(JSON.stringify(h.stored).includes(attemptToken), false);
  }
});

test('one environment admits only one active keyword suggestion producer', async () => {
  let entered, release;
  const started = new Promise((resolve) => { entered = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  const h = harness({ search: async () => {
    entered(); await gate; return { success: true, items: [], productNameTokens: [] };
  } });
  const running = h.context.runKeywordSource(h.input);
  await started;
  try {
    assert.throws(() => h.context.runKeywordSource({ ...h.input, idempotencyKey: 'other' }),
      /SOURCE_ATTEMPT_ALREADY_RUNNING/);
  } finally { release(); await running; }
});

test('real collector and canonical progress session finish only after the owner acknowledges COMPLETE', async () => {
  let releaseAck, entered;
  const gate = new Promise((resolve) => { releaseAck = resolve; });
  const requested = new Promise((resolve) => { entered = resolve; });
  const h = harness({ realCollector: true, terminal: async () => { entered(); await gate; } });
  const running = h.context.runKeywordSource(h.input);
  await requested;
  try {
    assert.ok(h.requests.some((request) => request.init.method === 'PUT'), 'successful extraction must submit COMPLETE');
    const session = await h.context.collectionSessions.getOwned(attemptId, 'office');
    assert.ok(session, 'progress must remain until owner ACK');
    assert.equal(session.progress.completed, 0);
    assert.deepEqual(h.closedTabs, []);
  } finally { releaseAck(); }
  assert.equal((await running).state, 'COMPLETE');
  assert.equal(await h.context.collectionSessions.getOwned(attemptId, 'office'), null);
  assert.deepEqual(h.closedTabs, [7]);
});

test('real collector retains progress on lost or rejected COMPLETE and finishes once after replay ACK', async () => {
  for (const options of [{ losses: 3 }, { fence: true }]) {
    const h = harness({ realCollector: true, ...options });
    await assert.rejects(h.context.runKeywordSource(h.input));
    const session = await h.context.collectionSessions.getOwned(attemptId, 'office');
    assert.ok(session);
    assert.equal(session.progress.completed, 0);
    assert.deepEqual(h.closedTabs, []);
    if (options.losses) {
      assert.equal((await h.context.runKeywordSource(h.input)).state, 'COMPLETE');
      assert.equal(await h.context.collectionSessions.getOwned(attemptId, 'office'), null);
      assert.deepEqual(h.closedTabs, [7]);
    }
  }
});

test('acknowledged source attention failure preserves its operator attention tab', async () => {
  const h = harness({ realCollector: true, extracted: { success: false, status: 429, error: 'Rate limited' } });
  assert.equal((await h.context.runKeywordSource(h.input)).state, 'FAILED');
  assert.equal((await h.context.collectionSessions.getOwned(attemptId, 'office')).attention.reason, 'rate_limited');
  assert.deepEqual(h.closedTabs, []);
});
