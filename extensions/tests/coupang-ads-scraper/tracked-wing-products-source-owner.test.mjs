import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const sourcePath = path.join(
  repoRoot,
  'extensions/kiditem-os/background/coupang/tracked-wing-products-source-owner.js',
);
const workerPath = path.join(
  repoRoot,
  'extensions/kiditem-os/background/coupang/worker.js',
);
const serviceWorkerPath = path.join(
  repoRoot,
  'extensions/kiditem-os/background/service-worker.js',
);
const externalDispatchPath = path.join(
  repoRoot,
  'extensions/kiditem-os/background/external-dispatch.js',
);

const attemptId = '11111111-1111-4111-8111-111111111111';
const attemptToken = '22222222-2222-4222-8222-222222222222';

function response(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

function ownerPlan() {
  return {
    attemptId,
    attemptToken,
    state: 'RUNNING',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    businessDate: '2026-09-03',
    keywords: ['first keyword', 'second keyword'],
    products: [
      { productId: 'product-a', sourceKeyword: null },
      { productId: 'product-b', sourceKeyword: 'second keyword' },
    ],
  };
}

function createSessions() {
  const stored = new Map();
  const started = [];
  const cancellations = [];
  return {
    stored,
    started,
    cancellations,
    async get(id) { return stored.get(id) || null; },
    async list(environmentId) {
      return [...stored.values()].filter((session) => session.environmentId === environmentId);
    },
    async progress(id, progress) {
      const current = stored.get(id);
      stored.set(id, { ...current, progress, attention: null });
    },
    async remove(id) { stored.delete(id); },
    async requireAttention(id, attention) {
      const current = stored.get(id);
      stored.set(id, { ...current, attention });
    },
    async start(input) {
      started.push(JSON.parse(JSON.stringify(input)));
      const session = {
        attemptId: input.attemptId,
        environmentId: input.environmentId,
        producer: input.producer,
        progress: { current: 0, total: 0, completed: 0, failed: 0, label: null },
        attention: null,
      };
      stored.set(input.attemptId, session);
      return session;
    },
    async cancel(id, options = {}) {
      const session = stored.get(id);
      if (!session) return null;
      cancellations.push({ id, closeManagedTab: options.closeManagedTab === true });
      if (typeof options.ownerFailure === 'function') {
        const accepted = await options.ownerFailure({ attemptId: id });
        assert.equal(accepted?.accepted, true);
      }
      stored.delete(id);
      return session;
    },
  };
}

function loadSourceOwner(options) {
  const context = vm.createContext({
    Date,
    Object,
    Promise,
    Set,
    String,
    Array,
    Number,
    ...options.globals,
  });
  context.globalThis = context;
  vm.runInContext(readFileSync(sourcePath, 'utf8'), context, { filename: sourcePath });
  return context.KidItemTrackedWingProductsSourceOwner.create(options);
}

function loadExternalDispatch(options) {
  const context = vm.createContext({
    Array,
    Error,
    Object,
    Promise,
    Set,
    String,
  });
  context.globalThis = context;
  vm.runInContext(readFileSync(externalDispatchPath, 'utf8'), context, {
    filename: externalDispatchPath,
  });
  return context.KidItemExternalDispatch.create(options);
}

test('publishes only the frozen server plan through the owner attempt', async () => {
  const plan = ownerPlan();
  const sessions = createSessions();
  const requests = [];
  const collections = [];
  const closedAttempts = [];
  const sourceOwner = loadSourceOwner({
    sessions,
    async closeAttempt(environmentId, ownerAttemptId, tabId) {
      closedAttempts.push([environmentId, ownerAttemptId, tabId]);
    },
    async request(_environmentId, pathName, init = {}) {
      requests.push({ pathName, init });
      if (pathName === '/api/ads/wing-tracked-products/attempts') return response(plan);
      if (pathName === `/api/ads/wing-tracked-products/attempts/${attemptId}`) {
        return response({ ready: true });
      }
      throw new Error(`unexpected owner request: ${pathName}`);
    },
    async collectKeyword(input) {
      collections.push(input);
      if (input.keyword === 'first keyword') {
        return {
          success: true,
          tabId: 7,
          items: [
            { productId: 'product-a', salePriceKrw: 1000 },
            { productId: 'not-in-frozen-plan', salePriceKrw: 999 },
          ],
        };
      }
      return {
        success: true,
        tabId: 7,
        items: [{ productId: 'product-b', salePriceKrw: 2000 }],
      };
    },
  });

  const result = await sourceOwner.run({
    environmentId: 'local',
    idempotencyKey: 'tracked-wing-start-1',
    keywords: ['first keyword', 'second keyword'],
  });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    success: true,
    attemptId,
    terminalState: 'COMPLETE',
    capturedProductCount: 2,
    failedProductCount: 0,
  });
  assert.deepEqual(
    JSON.parse(JSON.stringify(collections.map(({ keyword, plannedProducts, attemptId: ownerAttemptId }) => ({
      keyword,
      plannedProducts,
      attemptId: ownerAttemptId,
    })))),
    [
      {
        keyword: 'first keyword',
        plannedProducts: ['product-a', 'product-b'],
        attemptId,
      },
      {
        keyword: 'second keyword',
        plannedProducts: ['product-a', 'product-b'],
        attemptId,
      },
    ],
  );
  assert.deepEqual(JSON.parse(JSON.stringify(requests[0])), {
    pathName: '/api/ads/wing-tracked-products/attempts',
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'tracked-wing-start-1',
      },
      body: JSON.stringify({ keywords: ['first keyword', 'second keyword'] }),
    },
  });
  const terminal = requests[1];
  assert.equal(terminal.pathName, `/api/ads/wing-tracked-products/attempts/${attemptId}`);
  assert.equal(terminal.init.method, 'PUT');
  assert.equal(terminal.init.headers['x-source-attempt-token'], attemptToken);
  assert.deepEqual(JSON.parse(terminal.init.body), {
    items: [
      { productId: 'product-a', sourceKeyword: 'first keyword', salePriceKrw: 1000 },
      { productId: 'product-b', sourceKeyword: 'second keyword', salePriceKrw: 2000 },
    ],
  });
  assert.deepEqual(sessions.started, [{
    attemptId,
    environmentId: 'local',
    producer: 'advertising.wing_tracked_products',
  }]);
  assert.equal(JSON.stringify([...sessions.stored.values()]).includes(attemptToken), false);
  assert.deepEqual(closedAttempts, [['local', attemptId, 7]]);
  assert.equal(sessions.stored.has(attemptId), false);
});

test('retries an unchanged terminal payload with the owner-issued token', async () => {
  const plan = ownerPlan();
  plan.keywords = ['first keyword'];
  plan.products = [{ productId: 'product-a', sourceKeyword: null }];
  const sessions = createSessions();
  const terminalBodies = [];
  let terminalAttempts = 0;
  const sourceOwner = loadSourceOwner({
    sessions,
    async request(_environmentId, pathName, init = {}) {
      if (pathName === '/api/ads/wing-tracked-products/attempts') return response(plan);
      if (pathName === `/api/ads/wing-tracked-products/attempts/${attemptId}`) {
        terminalAttempts += 1;
        terminalBodies.push(init.body);
        if (terminalAttempts === 1) throw new TypeError('temporary network failure');
        return response({ ready: true });
      }
      throw new Error(`unexpected owner request: ${pathName}`);
    },
    async collectKeyword() {
      return { success: true, items: [{ productId: 'product-a', salePriceKrw: 1000 }] };
    },
  });

  const result = await sourceOwner.run({
    environmentId: 'local',
    idempotencyKey: 'tracked-wing-start-retry',
    keywords: ['first keyword'],
  });

  assert.equal(result.success, true);
  assert.equal(terminalAttempts, 2);
  assert.equal(terminalBodies[0], terminalBodies[1]);
});

test('converges a lost COMPLETE terminal reply without recollecting the owner attempt', async () => {
  const plan = { ...ownerPlan(), state: 'COMPLETE' };
  const sessions = createSessions();
  let collected = 0;
  const sourceOwner = loadSourceOwner({
    sessions,
    async request(_environmentId, pathName) {
      if (pathName === '/api/ads/wing-tracked-products/attempts') return response(plan);
      throw new Error(`unexpected owner request: ${pathName}`);
    },
    async collectKeyword() {
      collected += 1;
      return { success: true, items: [] };
    },
  });

  const result = await sourceOwner.run({
    environmentId: 'local',
    idempotencyKey: 'tracked-wing-complete-replay',
    keywords: ['first keyword', 'second keyword'],
  });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    success: true,
    attemptId,
    terminalState: 'COMPLETE',
  });
  assert.equal(collected, 0);
  assert.equal(sessions.started.length, 0);
});

test('returns a new-user-retry requirement for a replayed FAILED owner attempt', async () => {
  const plan = { ...ownerPlan(), state: 'FAILED' };
  const sessions = createSessions();
  let collected = 0;
  const sourceOwner = loadSourceOwner({
    sessions,
    async request(_environmentId, pathName) {
      if (pathName === '/api/ads/wing-tracked-products/attempts') return response(plan);
      throw new Error(`unexpected owner request: ${pathName}`);
    },
    async collectKeyword() {
      collected += 1;
      return { success: true, items: [] };
    },
  });

  const result = await sourceOwner.run({
    environmentId: 'local',
    idempotencyKey: 'tracked-wing-failed-replay',
    keywords: ['first keyword', 'second keyword'],
  });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    success: false,
    attemptId,
    terminalState: 'FAILED',
    retryRequired: true,
    errorCode: 'TRACKED_WING_RETRY_REQUIRED',
    error: 'The previous tracked Wing attempt failed. Start a new retry from KidItem.',
  });
  assert.equal(collected, 0);
  assert.equal(sessions.started.length, 0);
});

for (const [failureKind, firstFailure] of [
  ['a transient 5xx response', () => response({ message: 'temporary server failure' }, { ok: false, status: 503 })],
  ['a transient transport error', () => { throw new TypeError('temporary network failure'); }],
]) {
  test(`retries an unchanged FAILED terminal payload after ${failureKind}`, async () => {
    const plan = ownerPlan();
    const sessions = createSessions();
    const terminalBodies = [];
    const terminalHeaders = [];
    let failureAttempts = 0;
    const sourceOwner = loadSourceOwner({
      sessions,
      async request(_environmentId, pathName, init = {}) {
        if (pathName === '/api/ads/wing-tracked-products/attempts') return response(plan);
        if (pathName.endsWith('/fail')) {
          failureAttempts += 1;
          terminalBodies.push(init.body);
          terminalHeaders.push(init.headers);
          if (failureAttempts === 1) return firstFailure();
          return response({ status: 'FAILED' });
        }
        throw new Error(`unexpected owner request: ${pathName}`);
      },
      async collectKeyword() {
        return { success: false, error: 'Wing catalog request failed.' };
      },
    });

    const result = await sourceOwner.run({
      environmentId: 'local',
      idempotencyKey: `tracked-wing-fail-retry-${failureKind}`,
      keywords: ['first keyword', 'second keyword'],
    });

    assert.equal(result.success, false);
    assert.equal(failureAttempts, 2);
    assert.equal(terminalBodies[0], terminalBodies[1]);
    assert.equal(terminalHeaders[0]['x-source-attempt-token'], attemptToken);
    assert.equal(terminalHeaders[1]['x-source-attempt-token'], attemptToken);
    assert.equal(sessions.stored.has(attemptId), false);
  });
}

test('fails the exact owner attempt when every planned search fails', async () => {
  const plan = ownerPlan();
  const sessions = createSessions();
  const requests = [];
  const sourceOwner = loadSourceOwner({
    sessions,
    async request(_environmentId, pathName, init = {}) {
      requests.push({ pathName, init });
      if (pathName === '/api/ads/wing-tracked-products/attempts') return response(plan);
      if (pathName.endsWith('/fail')) return response({ status: 'FAILED' });
      throw new Error(`unexpected owner request: ${pathName}`);
    },
    async collectKeyword() {
      return { success: false, error: 'Wing catalog request failed.' };
    },
  });

  const result = await sourceOwner.run({
    environmentId: 'local',
    idempotencyKey: 'tracked-wing-all-failed',
    keywords: ['first keyword', 'second keyword'],
  });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    success: false,
    attemptId,
    terminalState: 'FAILED',
    retryRequired: true,
    errorCode: 'TRACKED_WING_ALL_KEYWORDS_FAILED',
    error: 'Tracked Wing collection failed for every planned keyword.',
  });
  const failure = requests.find(({ pathName }) => pathName.endsWith('/fail'));
  assert.ok(failure);
  assert.equal(failure.init.headers['x-source-attempt-token'], attemptToken);
  assert.deepEqual(JSON.parse(failure.init.body), {
    code: 'TRACKED_WING_ALL_KEYWORDS_FAILED',
    message: 'Tracked Wing collection failed for every planned keyword.',
  });
  assert.equal(requests.some(({ init }) => init.method === 'PUT'), false);
  assert.equal(sessions.stored.has(attemptId), false);
});

test('fails the owner when one planned keyword fails even if another keyword finds every product', async () => {
  const plan = ownerPlan();
  plan.products = [{ productId: 'product-a', sourceKeyword: null }];
  const sessions = createSessions();
  const requests = [];
  const sourceOwner = loadSourceOwner({
    sessions,
    async request(_environmentId, pathName, init = {}) {
      requests.push({ pathName, init });
      if (pathName === '/api/ads/wing-tracked-products/attempts') return response(plan);
      if (pathName.endsWith('/fail')) return response({ status: 'FAILED' });
      throw new Error(`unexpected owner request: ${pathName}`);
    },
    async collectKeyword({ keyword }) {
      if (keyword === 'first keyword') {
        return { success: true, items: [{ productId: 'product-a', salePriceKrw: 1000 }] };
      }
      return { success: false, error: 'Wing catalog request failed.' };
    },
  });

  const result = await sourceOwner.run({
    environmentId: 'local',
    idempotencyKey: 'tracked-wing-partial-keyword-failure',
    keywords: ['first keyword', 'second keyword'],
  });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    success: false,
    attemptId,
    terminalState: 'FAILED',
    retryRequired: true,
    errorCode: 'TRACKED_WING_KEYWORD_COLLECTION_FAILED',
    error: 'Tracked Wing collection did not prove every planned keyword.',
  });
  assert.equal(requests.some(({ init }) => init.method === 'PUT'), false);
  const failure = requests.find(({ pathName }) => pathName.endsWith('/fail'));
  assert.deepEqual(JSON.parse(failure.init.body), {
    code: 'TRACKED_WING_KEYWORD_COLLECTION_FAILED',
    message: 'Tracked Wing collection did not prove every planned keyword.',
  });
});

test('fails the owner when a frozen tracked product is not observed', async () => {
  const plan = ownerPlan();
  const sessions = createSessions();
  const requests = [];
  const sourceOwner = loadSourceOwner({
    sessions,
    async request(_environmentId, pathName, init = {}) {
      requests.push({ pathName, init });
      if (pathName === '/api/ads/wing-tracked-products/attempts') return response(plan);
      if (pathName.endsWith('/fail')) return response({ status: 'FAILED' });
      throw new Error(`unexpected owner request: ${pathName}`);
    },
    async collectKeyword() {
      return { success: true, items: [{ productId: 'product-a', salePriceKrw: 1000 }] };
    },
  });

  const result = await sourceOwner.run({
    environmentId: 'local',
    idempotencyKey: 'tracked-wing-missing-product',
    keywords: ['first keyword', 'second keyword'],
  });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    success: false,
    attemptId,
    terminalState: 'FAILED',
    retryRequired: true,
    errorCode: 'TRACKED_PRODUCT_NOT_FOUND',
    error: 'Tracked Wing collection did not prove every frozen tracked product.',
  });
  assert.equal(requests.some(({ init }) => init.method === 'PUT'), false);
});

test('keeps a human-attention attempt open without terminalizing it', async () => {
  const plan = ownerPlan();
  const sessions = createSessions();
  const requests = [];
  const sourceOwner = loadSourceOwner({
    sessions,
    async request(_environmentId, pathName, init = {}) {
      requests.push({ pathName, init });
      if (pathName === '/api/ads/wing-tracked-products/attempts') return response(plan);
      throw new Error(`unexpected owner request: ${pathName}`);
    },
    async collectKeyword() {
      return {
        success: false,
        attentionRequired: true,
        reason: 'marketplace_login',
        error: 'Coupang Wing login is required.',
      };
    },
  });

  const result = await sourceOwner.run({
    environmentId: 'local',
    idempotencyKey: 'tracked-wing-attention',
    keywords: ['first keyword', 'second keyword'],
  });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    success: false,
    terminalState: 'RUNNING',
    attentionRequired: true,
    attemptId,
    completedKeywordCount: 0,
    error: 'Coupang Wing login is required.',
  });
  assert.deepEqual(JSON.parse(JSON.stringify(sessions.stored.get(attemptId)?.attention)), {
    reason: 'marketplace_login',
    message: 'Coupang Wing login is required.',
  });
  assert.equal(requests.some(({ pathName }) => pathName.endsWith('/fail')), false);
  assert.equal(requests.some(({ init }) => init.method === 'PUT'), false);
  assert.equal(await sourceOwner.recover('local'), null);
});

test('fails the owner before clearing a cancelled local session', async () => {
  const plan = ownerPlan();
  const sessions = createSessions();
  sessions.stored.set(attemptId, {
    attemptId,
    environmentId: 'local',
    producer: 'advertising.wing_tracked_products',
    progress: { current: 0, total: 2, completed: 0, failed: 0, label: null },
    attention: null,
  });
  const requests = [];
  const sourceOwner = loadSourceOwner({
    sessions,
    async request(_environmentId, pathName, init = {}) {
      requests.push({ pathName, init });
      if (pathName === `/api/ads/wing-tracked-products/attempts/${attemptId}`) return response(plan);
      if (pathName.endsWith('/fail')) return response({ status: 'FAILED' });
      throw new Error(`unexpected owner request: ${pathName}`);
    },
    async collectKeyword() {
      throw new Error('must not collect after cancellation');
    },
  });

  const result = await sourceOwner.cancel({ environmentId: 'local', attemptId });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    success: true,
    cancelled: true,
    attemptId,
  });
  const failure = requests.find(({ pathName }) => pathName.endsWith('/fail'));
  assert.deepEqual(JSON.parse(failure.init.body), {
    code: 'COLLECTION_CANCELLED',
    message: 'Tracked Wing collection was cancelled by the user.',
  });
  assert.deepEqual(sessions.cancellations, [{ id: attemptId, closeManagedTab: true }]);
  assert.equal(sessions.stored.has(attemptId), false);
});

test('clears a stored session whose attempt an operator stopped on the owner, so it neither resumes nor blocks the next start', async () => {
  const sessions = createSessions();
  sessions.stored.set(attemptId, {
    attemptId,
    environmentId: 'local',
    producer: 'advertising.wing_tracked_products',
    progress: { current: 0, total: 2, completed: 0, failed: 0, label: null },
    attention: null,
  });
  const nextAttemptId = '33333333-3333-4333-8333-333333333333';
  const requests = [];
  const sourceOwner = loadSourceOwner({
    sessions,
    async request(_environmentId, pathName, init = {}) {
      requests.push({ pathName, init });
      if (pathName === `/api/ads/wing-tracked-products/attempts/${attemptId}`) {
        return response({ ...ownerPlan(), state: 'FAILED', errorCode: 'USER_CANCELLED' });
      }
      if (pathName === '/api/ads/wing-tracked-products/attempts') {
        return response({ ...ownerPlan(), attemptId: nextAttemptId });
      }
      throw new Error(`unexpected owner request: ${pathName}`);
    },
    async collectKeyword() {
      return { success: false, attentionRequired: true, reason: 'marketplace_login', error: 'login' };
    },
  });

  assert.equal(await sourceOwner.recover('local'), null);
  assert.equal(sessions.stored.has(attemptId), false);

  const result = await sourceOwner.run({
    environmentId: 'local',
    idempotencyKey: 'tracked-wing-after-stop',
    keywords: ['first keyword', 'second keyword'],
  });
  assert.equal(result.attemptId, nextAttemptId);
  assert.equal(requests.filter(({ pathName }) => pathName === '/api/ads/wing-tracked-products/attempts').length, 1);
});

test('registers the tracked-Wing owner as a direct extension action', () => {
  const worker = readFileSync(workerPath, 'utf8');
  const serviceWorker = readFileSync(serviceWorkerPath, 'utf8');

  assert.match(serviceWorker, /"coupang\/tracked-wing-products-source-owner\.js"/);
  assert.match(worker, /collectAdvertisingTrackedWingProducts/);
  assert.match(worker, /trackedWingProductsSourceOwner\.run/);
  assert.doesNotMatch(worker, /advertising\.refresh_tracked_wing_products/);
  assert.doesNotMatch(worker, /wing-tracked-products\/browser-operations/);
});

test('shared external dispatch delivers the exact tracked-Wing action to its owner', async () => {
  const validated = [];
  const handled = [];
  const action = 'collectAdvertisingTrackedWingProducts';
  const dispatch = loadExternalDispatch({
    chrome: { runtime: { getManifest: () => ({ version: '1.0.0' }) } },
    environmentContext: {
      resolveSender: () => ({ environmentId: 'local' }),
    },
    sessions: {},
    domains: {
      forExternalAction(requestedAction) {
        if (requestedAction !== action) return null;
        return {
          validate(message) {
            validated.push(message);
            return {
              idempotencyKey: message.idempotencyKey,
              keywords: message.keywords,
            };
          },
          async handle(input, environmentId) {
            handled.push({ input, environmentId });
            return { success: true, attemptId };
          },
        };
      },
    },
  });
  let receiveResponse;
  const received = new Promise((resolve) => { receiveResponse = resolve; });
  const message = {
    action,
    idempotencyKey: 'tracked-wing-external-dispatch',
    keywords: ['first keyword'],
  };

  assert.equal(
    dispatch.handleMessage(message, { url: 'http://localhost:3000/sourcing-ai/product-tracking' }, receiveResponse),
    true,
  );
  await received;

  assert.deepEqual(JSON.parse(JSON.stringify(validated)), [message]);
  assert.deepEqual(JSON.parse(JSON.stringify(handled)), [{
    input: { idempotencyKey: 'tracked-wing-external-dispatch', keywords: ['first keyword'] },
    environmentId: 'local',
  }]);
});
