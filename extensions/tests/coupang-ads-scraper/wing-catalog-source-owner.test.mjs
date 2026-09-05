import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
const worker = await readFile(new URL('../../kiditem-os/background/coupang/worker.js', import.meta.url), 'utf8');
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const attemptId = '11111111-1111-4111-8111-111111111111';
const attemptToken = '22222222-2222-4222-8222-222222222222';

async function harness(options = {}) {
  const stored = options.stored || {}, requests = [], searches = [];
  let state = 'RUNNING', losses = options.losses || 0;
  const plan = { source: 'coupang.wing_catalog', keywords: ['A Pencil', '클레이'], maxPages: options.maxPages || 2, purpose: 'catalog_search' };
  const attempt = () => ({ attemptId, attemptToken, plan, sourceKey: plan.source,
    scopeKey: 'default', targetKey: 'catalog', state, expiresAt: new Date(Date.now() + 900000).toISOString() });
  const context = vm.createContext({ console, AbortController, Date, Error, JSON, Math, Promise, Response, Set, String, TypeError, URL,
    WING_CATALOG_MAX_PAGES: 5,
    chrome: { storage: { local: {
      get: async (key, cb) => { const value = { [key]: stored[key] }; cb?.(value); return value; },
      set: async (value, cb) => { Object.assign(stored, value); cb?.(); },
    } }, tabs: { remove: async () => {}, query: async () => [] } },
    sharedEnvironmentContext: { requireEnvironment: (id) => { assert.equal(id, 'office'); } },
    authedFetch: async (environmentId, path, init) => {
      const body = init.body ? JSON.parse(init.body) : null;
      requests.push({ environmentId, path, init, body });
      if (path.endsWith('/chunks')) {
        if (losses-- > 0) throw new Error('ACK lost');
        return Response.json({ sequence: plan.keywords.indexOf(body.keyword), keyword: body.keyword,
          checksum: 'a'.repeat(64), count: body.items.length, duplicateCount: 0 });
      }
      if (init.method === 'PUT' || path.endsWith('/fail')) {
        if (options.terminal) await options.terminal(path, body);
        state = init.method === 'PUT' && body.keywords.every((result) => result.failed === 0) ? 'COMPLETE' : 'FAILED';
      }
      return Response.json(attempt());
    },
    searchWingCatalogProducts: async (message) => {
      searches.push(message);
      if (options.search) return options.search(message);
      return { success: true, tabId: 7, rows: Array.from({ length: 102 }, (_, index) => ({
        productId: String(index), productName: '연필', salePrice: 1000, rating: 4.5,
      })) };
    },
  });
  context.globalThis = context;
  vm.runInContext(await read('../../shared/collection-session.js'), context);
  context.collectionSessions = context.KidItemCollectionSession.create({ chrome: context.chrome, storageKey: 'wing_sessions', webUrlPatterns: [] });
  const start = worker.indexOf('const SOURCING_WING_CATALOG_MAX_KEYWORDS');
  const end = worker.indexOf('async function collectAdvertisingProfitabilitySlice', start);
  vm.runInContext(await read('../../kiditem-os/background/coupang/wing-keyword-contract.js') + '\n'
    + await read('../../kiditem-os/background/sourcing/source-attempt-wire.js') + '\n' + worker.slice(start, end) + '\n'
    + await read('../../kiditem-os/background/coupang/wing-catalog-source-owner.js'), context);
  return { context, stored, requests, searches, input: { environmentId: 'office', idempotencyKey: 'key',
    input: { keywords: [' Ａ  Pencil ', '클레이'], maxPages: options.maxPages || 2, purpose: 'catalog_search' } } };
}

test('owner plan keeps keyword order, 100-row cap, mapping and per-keyword ACK retry without recollection', async () => {
  const h = await harness({ losses: 2 });
  const result = await h.context.runSourcingWingCatalog(h.input);
  assert.equal(result.state, 'COMPLETE');
  assert.deepEqual(h.searches.map((s) => [s.keyword, s.maxPages, s.collectionRunId]),
    [['A Pencil', 2, attemptId], ['클레이', 2, attemptId]]);
  const chunks = h.requests.filter((r) => r.path.endsWith('/chunks'));
  assert.equal(chunks.length, 4);
  assert.equal(chunks[0].init.body, chunks[2].init.body);
  assert.equal(chunks[0].body.items.length, 100);
  assert.equal(chunks[0].body.items[0].salePriceKrw, 1000);
  const final = h.requests.find((r) => r.init.method === 'PUT');
  assert.equal(final.body.receipts.length, 2);
  assert.equal(JSON.stringify(final.body).includes('productId'), false);
  assert.equal(JSON.stringify(h.stored).includes(attemptToken), false);
  assert.equal(JSON.stringify(h.stored).includes('productName'), false);
  assert.equal(await h.context.collectionSessions.getOwned(attemptId, 'office'), null);
});

test('mixed keyword failure continues later keywords but receives owner FAILED without a current publication', async () => {
  const h = await harness({ search: async (message) => message.keyword === 'A Pencil'
    ? { success: false } : { success: true, rows: [] } });
  assert.equal((await h.context.runSourcingWingCatalog(h.input)).state, 'FAILED');
  assert.deepEqual(h.searches.map((message) => message.keyword), ['A Pencil', '클레이']);
  const terminal = h.requests.find((request) => request.init.method === 'PUT');
  assert.deepEqual(terminal.body.keywords.map((result) => result.outcome), ['failed', 'no_change']);
  assert.equal(terminal.body.receipts[0].count, 0);
});

test('uncertain chunk exhaustion resumes retained bytes, and worker suspension fails without recollection', async () => {
  const h = await harness({ losses: 3 });
  await assert.rejects(h.context.runSourcingWingCatalog(h.input), /ACK lost/);
  assert.equal((await h.context.runSourcingWingCatalog(h.input)).state, 'COMPLETE');
  assert.equal(h.searches.length, 2);
  const uploads = h.requests.filter((request) => request.path.endsWith('/chunks'));
  assert.equal(uploads[0].init.body, uploads[3].init.body);
  const suspended = await harness({ stored: { ['kiditem_wing_catalog_attempt_v1:office:' + attemptId]: { attemptId, idempotencyKey: 'key' } } });
  assert.equal((await suspended.context.runSourcingWingCatalog(suspended.input)).state, 'FAILED');
  assert.equal(suspended.searches.length, 0);
});

test('strict input preserves normalized display and rejects duplicate identities, omitted bounds and forged environment', async () => {
  const h = await harness();
  assert.deepEqual(JSON.parse(JSON.stringify(h.context.parseSourcingWingCatalogStart({ action: 'collectSourcingWingCatalog',
    idempotencyKey: 'key', keywords: [' Ａ  Pencil ', '클레이'], maxPages: 2, purpose: 'catalog_search' }))),
  { idempotencyKey: 'key', input: { keywords: ['A Pencil', '클레이'], maxPages: 2, purpose: 'catalog_search' } });
  for (const extra of [{ keywords: ['Ａ Pencil', 'a pencil'] }, { keywords: [123] }, { maxPages: undefined }, { environmentId: 'local' }]) {
    assert.throws(() => h.context.parseSourcingWingCatalogStart({ action: 'collectSourcingWingCatalog', idempotencyKey: 'key',
      keywords: ['A Pencil'], maxPages: 2, purpose: 'catalog_search', ...extra }));
  }
});

test('interrupted pagination stages rows but cannot publish; a stationary cursor after all requested pages is complete', async () => {
  for (const [stopReason, pageCount, expected] of [
    ['authentication_token_missing', 1, 'FAILED'], ['non_json_response', 1, 'FAILED'],
    ['next_page_not_advancing', 1, 'FAILED'], ['next_page_not_advancing', 2, 'COMPLETE'],
    ['max_pages_reached', 2, 'COMPLETE'], ['empty_page', 1, 'COMPLETE'], ['no_next_search_page', 1, 'COMPLETE'],
  ]) {
    const h = await harness({ search: async () => ({ success: true, stopReason,
      pages: Array(pageCount).fill({}), rows: [{ productId: '1', productName: 'kept' }] }) });
    assert.equal((await h.context.runSourcingWingCatalog(h.input)).state, expected, stopReason + pageCount);
    assert.equal(h.requests.filter((request) => request.path.endsWith('/chunks')).length, 2);
  }
  const onePage = await harness({ maxPages: 1, search: async () => ({ success: true,
    stopReason: 'next_page_not_advancing', pages: [{}], rows: [] }) });
  assert.equal((await onePage.context.runSourcingWingCatalog(onePage.input)).state, 'COMPLETE');
});

test('login attention keeps its operator session visible and can be dismissed after owner FAILED acknowledgement', async () => {
  let h;
  h = await harness({ search: async () => {
    await h.context.collectionSessions.requireAttention(attemptId, { reason: 'marketplace_login', message: 'login' });
    return { attentionRequired: true, tabId: 7 };
  } });
  assert.equal((await h.context.runSourcingWingCatalog(h.input)).state, 'FAILED');
  assert.ok((await h.context.collectionSessions.getOwned(attemptId, 'office')).attention);
  await h.context.cancelSourcingWingCatalog(attemptId, 'office');
  assert.equal(await h.context.collectionSessions.getOwned(attemptId, 'office'), null);
});

test('cancel waits for owner FAILED acknowledgement and clears the real session before late extraction can publish', { timeout: 1000 }, async () => {
  let resolveSearch, entered;
  const started = new Promise((resolve) => { entered = resolve; });
  let acknowledge;
  const ack = new Promise((resolve) => { acknowledge = resolve; });
  const h = await harness({ search: async () => { entered(); return new Promise((resolve) => { resolveSearch = resolve; }); },
    terminal: async (path) => { if (path.endsWith('/fail')) await ack; } });
  const collection = h.context.runSourcingWingCatalog(h.input);
  await started;
  const cancelled = h.context.cancelSourcingWingCatalog(attemptId, 'office');
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(await h.context.collectionSessions.getOwned(attemptId, 'office'));
  acknowledge();
  await cancelled;
  resolveSearch({ success: true, rows: [{ productId: 'late', productName: 'late' }] });
  assert.equal((await collection).state, 'FAILED');
  assert.equal(h.requests.some((request) => request.init.method === 'PUT' || request.path.endsWith('/chunks')), false);
  assert.equal(await h.context.collectionSessions.getOwned(attemptId, 'office'), null);
});
