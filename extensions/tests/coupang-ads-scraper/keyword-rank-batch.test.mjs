import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../../kiditem-os/background/coupang/keyword-rank-batch.js', import.meta.url), 'utf8');
const KEY = '10000000-0000-4000-8000-000000000001';
const A = '20000000-0000-4000-8000-000000000001';
const B = '20000000-0000-4000-8000-000000000002';
const C = '20000000-0000-4000-8000-000000000003';
const input = { environmentId: 'office', idempotencyKey: KEY };
const member = (attemptId, state = 'RUNNING') => ({ attemptId, state });
const plain = (value) => JSON.parse(JSON.stringify(value));
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
function harness(options = {}) {
  const context = vm.createContext({ console });
  vm.runInContext(source, context);
  const calls = [];
  const tasks = [];
  const batches = options.batches ?? [{ attempts: [member(A), member(B)] }];
  let reads = 0;
  const batch = context.KidItemKeywordRankBatch.create({
    kind: options.kind ?? 'wing',
    request: options.request ?? (async (environmentId, path, init) => {
      calls.push(['read', environmentId, path, plain(init)]);
      return { ok: true, json: async () => batches[Math.min(reads++, batches.length - 1)] };
    }),
    sourceOwner: {
      run: async (value) => {
        calls.push(['run', plain(value)]);
        return options.run ? options.run(value) : { terminalState: 'COMPLETE' };
      },
      fail: async (value) => { calls.push(['fail', plain(value)]); return { terminalState: 'FAILED' }; },
    },
    sleep: async (ms) => { calls.push(['sleep', ms]); await options.sleep?.(ms); },
    randomDelayMs: (min, max) => { calls.push(['delay', min, max]); return min; },
    keepAlive: (task) => { tasks.push(task); return task; },
    afterBatch: options.afterBatch,
  });
  return { batch, calls, tasks, parseStart: context.KidItemKeywordRankBatch.parseStart };
}

test('Wing reads an existing receipt, ACKs immediately, runs sequentially and retains its original pacing', async () => {
  const first = deferred();
  let count = 0;
  const h = harness({ run: async () => { if (count++ === 0) await first.promise; return { terminalState: 'COMPLETE' }; } });
  assert.deepEqual(plain(await h.batch.start(input)), { success: true, started: true });
  assert.deepEqual(h.calls.filter(([name]) => name === 'run').map(([, value]) => value.attemptId), [A]);
  assert.deepEqual(plain(await h.batch.start(input)), { success: true, started: true });
  assert.equal(h.calls.filter(([name]) => name === 'read').length, 1);
  first.resolve();
  await Promise.all(h.tasks);
  assert.deepEqual(h.calls[0], ['read', 'office', '/api/ads/keyword-rank/wing/batch-attempts', { method: 'GET', headers: { 'Idempotency-Key': KEY } }]);
  assert.deepEqual(h.calls.filter(([name]) => name === 'run').map(([, value]) => value.attemptId), [A, B]);
  assert.deepEqual(h.calls.filter(([name]) => name === 'delay'), [['delay', 1200, 2500]]);
  assert.equal(h.calls.some(([name]) => name === 'fail'), false);
});

test('SERP keeps ordinary failed members independent, uses4–8s pacing and then invokes direct enrichment', async () => {
  const observed = [];
  const h = harness({ kind: 'serp', run: async ({ attemptId }) => {
    observed.push(attemptId);
    return attemptId === A ? { terminalState: 'FAILED', errorCode: 'SERP_CAPTURE_FAILED' } : { terminalState: 'COMPLETE' };
  }, afterBatch: async ({ environmentId, idempotencyKey, isCancelled, setCancelActive }) => {
    assert.equal(environmentId, 'office');
    assert.equal(idempotencyKey, KEY);
    assert.equal(isCancelled(), false);
    assert.equal(typeof setCancelActive, 'function');
    observed.push('enrichment');
  } });
  assert.deepEqual(plain(await h.batch.start(input)), { success: true, started: true });
  await Promise.all(h.tasks);
  assert.deepEqual(observed, [A, B, 'enrichment']);
  assert.equal(h.calls[0][2], '/api/ads/keyword-rank/serp/batch-attempts');
  assert.deepEqual(h.calls.filter(([name]) => name === 'delay'), [['delay', 4000, 8000]]);
});

test('explicit cancellation stops dispatch and fails only fresh RUNNING members, including the active owner', async () => {
  const running = deferred();
  const h = harness({ batches: [
    { attempts: [member(A), member(B), member(C, 'COMPLETE')] },
    { attempts: [member(A), member(B), member(C, 'COMPLETE')] },
  ], run: async () => { await running.promise; return { terminalState: 'FAILED', errorCode: 'COLLECTION_CANCELLED' }; } });
  await h.batch.start(input);
  assert.deepEqual(plain(await h.batch.cancel(input)), { success: true });
  running.resolve();
  await Promise.all(h.tasks);
  assert.deepEqual(h.calls.filter(([name]) => name === 'run').map(([, value]) => value.attemptId), [A]);
  assert.deepEqual(h.calls.filter(([name]) => name === 'fail').map(([, value]) => [value.attemptId, value.code]), [[A, 'COLLECTION_CANCELLED'], [B, 'COLLECTION_CANCELLED']]);
});

test('empty receipts and Wing never enrich; nonempty COMPLETE SERP replay still dispatches enrichment', async () => {
  for (const [kind, attempts, expectedStarted, expectedEnrichment] of [
    ['wing', [], false, 0], ['serp', [], false, 0],
    ['wing', [member(A, 'COMPLETE')], false, 0],
    ['wing', [member(A)], true, 0],
    ['serp', [member(A, 'COMPLETE')], true, 1],
  ]) {
    let enriched = 0;
    const h = harness({ kind, batches: [{ attempts }], afterBatch: async () => { enriched += 1; } });
    assert.deepEqual(plain(await h.batch.start(input)), { success: true, started: expectedStarted });
    await Promise.all(h.tasks);
    assert.equal(enriched, expectedEnrichment);
    assert.equal(h.calls.filter(([name]) => name === 'run').length, attempts.filter((attempt) => attempt.state === 'RUNNING').length);
  }
});

test('unconfirmed and provider-wall results stop, fail only unstarted members and never enrich', async () => {
  for (const [kind, outcome] of [
    ['wing', { terminalState: 'RUNNING', errorCode: 'SOURCE_RESULT_UNCONFIRMED' }],
    ['wing', { terminalState: 'FAILED', errorCode: 'WING_RANK_PROVIDER_WALL' }],
    ['serp', { terminalState: 'FAILED', errorCode: 'SERP_PROVIDER_WALL' }],
    ['serp', { terminalState: 'FAILED', errorCode: 'COLLECTION_CANCELLED' }],
  ]) {
    let enriched = 0;
    const h = harness({ kind, batches: [{ attempts: [member(A), member(B), member(C)] }],
      run: async () => outcome, afterBatch: async () => { enriched += 1; } });
    await h.batch.start(input);
    await Promise.all(h.tasks);
    assert.deepEqual(h.calls.filter(([name]) => name === 'run').map(([, value]) => value.attemptId), [A]);
    assert.deepEqual(h.calls.filter(([name]) => name === 'fail').map(([, value]) => [value.attemptId, value.code]), [[B, 'COLLECTION_INTERRUPTED'], [C, 'COLLECTION_INTERRUPTED']]);
    assert.equal(h.calls.some(([name]) => name === 'sleep'), false);
    assert.equal(enriched, 0);
  }
});

test('an explicit later cancel may cancel the exact still-RUNNING owner after an unconfirmed dispatch cleaned up', async () => {
  const h = harness({ batches: [
    { attempts: [member(A), member(B)] },
    { attempts: [member(A), member(B, 'FAILED')] },
  ], run: async () => ({ terminalState: 'RUNNING', errorCode: 'SOURCE_RESULT_UNCONFIRMED' }) });
  await h.batch.start(input);
  await Promise.all(h.tasks);
  await new Promise(setImmediate);
  await h.batch.cancel(input);
  assert.deepEqual(h.calls.filter(([name]) => name === 'fail').map(([, value]) => [value.attemptId, value.code]), [[B, 'COLLECTION_INTERRUPTED'], [A, 'COLLECTION_CANCELLED']]);
});

test('cancel marks the batch before cancelling active enrichment and skips terminal keyword members', async () => {
  const entered = deferred();
  const completed = deferred();
  let cancellationFlag;
  let cancellations = 0;
  const h = harness({ kind: 'serp', batches: [{ attempts: [member(A, 'COMPLETE'), member(B, 'FAILED')] }],
    afterBatch: async ({ isCancelled, setCancelActive }) => {
      setCancelActive(async () => { cancellationFlag = isCancelled(); cancellations += 1; completed.resolve(); });
      entered.resolve();
      await completed.promise;
      setCancelActive(null);
    } });
  await h.batch.start(input);
  await entered.promise;
  await h.batch.cancel(input);
  await Promise.all(h.tasks);
  assert.equal(cancellationFlag, true);
  assert.equal(cancellations, 1);
  assert.equal(h.calls.some(([name]) => name === 'fail' || name === 'run'), false);
});

test('cancellation during pacing prevents the next owner and enrichment', async () => {
  const pacing = deferred();
  const released = deferred();
  let enriched = false;
  const h = harness({ kind: 'serp', batches: [
    { attempts: [member(A), member(B)] }, { attempts: [member(A, 'COMPLETE'), member(B)] },
  ], sleep: async () => { pacing.resolve(); await released.promise; }, afterBatch: async () => { enriched = true; } });
  await h.batch.start(input);
  await pacing.promise;
  await h.batch.cancel(input);
  released.resolve();
  await Promise.all(h.tasks);
  assert.deepEqual(h.calls.filter(([name]) => name === 'run').map(([, value]) => value.attemptId), [A]);
  assert.deepEqual(h.calls.filter(([name]) => name === 'fail').map(([, value]) => value.attemptId), [B]);
  assert.equal(enriched, false);
});

test('validates exact external action/receipt and all UUID/state/unique members before any owner dispatch', async () => {
  const h = harness();
  assert.deepEqual(plain(h.parseStart({ action: 'collectAdvertisingWingRankBatch', idempotencyKey: KEY }, 'collectAdvertisingWingRankBatch')), { idempotencyKey: KEY });
  for (const message of [null, {}, { action: 'other', idempotencyKey: KEY },
    { action: 'collectAdvertisingWingRankBatch', idempotencyKey: 'bad' },
    { action: 'collectAdvertisingWingRankBatch', idempotencyKey: KEY, environmentId: 'office' }]) {
    assert.throws(() => h.parseStart(message, 'collectAdvertisingWingRankBatch'));
  }
  for (const invalid of [{}, { attempts: null }, { attempts: [member('bad')] },
    { attempts: [member(A, 'DONE')] }, { attempts: [member(A), member(A)] }]) {
    const malformed = harness({ batches: [invalid, { attempts: [] }] });
    await assert.rejects(malformed.batch.start(input));
    assert.equal(malformed.calls.some(([name]) => name === 'run' || name === 'fail'), false);
    assert.deepEqual(plain(await malformed.batch.start(input)), { success: true, started: false });
  }
});

test('same receipt dispatches independently per environment and GET404 never admits hidden work', async () => {
  const pending = deferred();
  const h = harness({ run: async () => { await pending.promise; return { terminalState: 'COMPLETE' }; } });
  await h.batch.start(input);
  await h.batch.start({ ...input, environmentId: 'local' });
  assert.deepEqual(h.calls.filter(([name]) => name === 'run').map(([, value]) => value.environmentId), ['office', 'local']);
  pending.resolve();
  await Promise.all(h.tasks);
  let requests = 0;
  const missing = harness({ request: async (_environmentId, _path, init) => {
    requests += 1;
    assert.equal(init.method, 'GET');
    return { ok: false, status: 404 };
  } });
  await assert.rejects(missing.batch.start(input), /404/);
  assert.equal(requests, 1);
  assert.equal(missing.tasks.length, 0);
});

test('SERP replay does not pass a persisted provider-wall or cancellation, while ordinary FAILED remains independent', async () => {
  for (const code of ['SERP_PROVIDER_WALL', 'COLLECTION_CANCELLED', 'SERP_CAPTURE_FAILED']) {
    let enriched = 0;
    const h = harness({ kind: 'serp', batches: [{ attempts: [
      { ...member(A, 'FAILED'), errorCode: code }, member(B),
    ] }], afterBatch: async () => { enriched += 1; } });
    await h.batch.start(input);
    await Promise.all(h.tasks);
    const interrupted = code !== 'SERP_CAPTURE_FAILED';
    assert.equal(enriched, interrupted ? 0 : 1);
    assert.deepEqual(h.calls.filter(([name]) => name === 'run').map(([, value]) => value.attemptId), interrupted ? [] : [B]);
    assert.deepEqual(h.calls.filter(([name]) => name === 'fail').map(([, value]) => [value.attemptId, value.code]), interrupted ? [[B, 'COLLECTION_INTERRUPTED']] : []);
  }
  let enriched = false;
  const terminal = harness({ kind: 'serp', batches: [{ attempts: [{ ...member(A, 'FAILED'), errorCode: 'SERP_PROVIDER_WALL' }] }],
    afterBatch: async () => { enriched = true; } });
  assert.deepEqual(plain(await terminal.batch.start(input)), { success: true, started: false });
  assert.equal(enriched, false);
});
