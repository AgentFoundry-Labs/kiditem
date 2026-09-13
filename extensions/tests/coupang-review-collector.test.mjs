import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const collectorSource = readFileSync(
  new URL('../kiditem-os/background/coupang/coupang-review-collector.js', import.meta.url),
  'utf8',
);

const ATTEMPT_ID = 'a1111111-1111-4111-8111-111111111111';
const ATTEMPT_TOKEN = 'b1111111-1111-4111-8111-111111111111';
const PLAN = {
  sourceType: 'coupang_reviews',
  parserVersion: 'coupang-review-v1',
  months: 1,
  pageSize: 50,
  maxPagesPerWindow: 40,
  windows: [{ index: 0, label: '2026-09', start: '2026-09-01', end: '2026-09-07' }],
};

function fixture(options = {}) {
  const storage = {};
  const calls = [];
  const removedTabs = [];
  let releaseStorageGet = null;
  let searchCalls = 0;
  const context = {
    Date,
    Intl,
    AbortSignal,
    setTimeout,
    clearTimeout,
    structuredClone,
  };
  context.globalThis = context;
  context.chrome = {
    scripting: {
      executeScript: async () => {
        searchCalls += 1;
        if (typeof options.beforeSearch === 'function') {
          await options.beforeSearch(searchCalls);
        }
        return [{
        result: {
          ok: true,
          status: 200,
          body: {
            code: 'OK',
            data: {
              content: options.searchContent || [{
                reviewId: 'review-1',
                vendorItemId: 'vendor-item-1',
                productId: 'product-1',
                itemName: 'Toy',
                rating: 5,
                reviewTitle: 'Great',
                reviewContent: 'Works well',
                memberName: 'Reviewer',
                reviewAt: Date.now(),
                attachment: JSON.stringify({
                  imageAttachments: [{}],
                  videoAttachments: [{}],
                }),
              }],
              pagination: { totalPages: options.totalPages || 1 },
            },
          },
        },
        }];
      },
    },
    storage: {
      local: {
        get: (key, callback) => {
          if (options.delayNextStorageGet) {
            options.delayNextStorageGet = false;
            releaseStorageGet = () => callback({ [key]: structuredClone(storage[key]) });
            return;
          }
          callback({ [key]: structuredClone(storage[key]) });
        },
        set: (values, callback) => {
          Object.assign(storage, structuredClone(values));
          callback?.();
        },
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(collectorSource, context);

  const dependencies = {
    stateKey: 'review-state',
    authedFetch: async (path, init = {}) => {
      calls.push({ path, init });
      return {
        ok: true,
        status: 201,
        json: async () => ({
          state: 'RUNNING',
          collected: 1,
          created: 1,
          updated: 0,
          linked: 1,
          unlinked: 0,
        }),
      };
    },
    createTab: options.createTab || (async () => ({ id: 42 })),
    waitForTabComplete: async () => true,
    removeTab: options.removeTab || (async (tabId) => { removedTabs.push(tabId); }),
  };
  return {
    collector: context.KidItemCoupangReviewCollector,
    context,
    dependencies,
    calls,
    removedTabs,
    storage,
    get searchCalls() { return searchCalls; },
    releaseStorageGet: () => releaseStorageGet?.(),
  };
}

async function waitFor(predicate, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail('timed out waiting for review collector');
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test('normalizes Wing review fields and preserves attachment counts', () => {
  const f = fixture();
  const normalized = f.collector.normalizeReview({
    reviewId: 123,
    vendorItemId: 456,
    productId: 789,
    itemName: '  Toy  ',
    rating: '4.8',
    reviewTitle: '  Title ',
    reviewContent: ' Content ',
    memberName: ' Reviewer ',
    reviewAt: 1_700_000_000_000,
    attachment: JSON.stringify({ imageAttachments: [{}, {}], videoAttachments: [{}] }),
  });
  assert.deepEqual(JSON.parse(JSON.stringify(normalized)), {
    externalReviewId: '123',
    externalOptionId: '456',
    externalProductId: '789',
    itemName: 'Toy',
    rating: 5,
    title: 'Title',
    content: 'Content',
    reviewerName: 'Reviewer',
    reviewedAt: 1_700_000_000_000,
    imageCount: 2,
    videoCount: 1,
    isDeleted: false,
    isBlinded: false,
  });
});

test('uses the server-frozen plan and only the fenced owner endpoints', async () => {
  const f = fixture();
  const started = await f.collector.start({
    attemptId: ATTEMPT_ID,
    attemptToken: ATTEMPT_TOKEN,
    plan: PLAN,
  }, f.dependencies);
  assert.equal(started.success, true);
  assert.equal(started.producer, 'orders.coupang_reviews');
  const retry = await f.collector.start({
    attemptId: ATTEMPT_ID,
    attemptToken: ATTEMPT_TOKEN,
    plan: PLAN,
  }, f.dependencies);
  assert.deepEqual(JSON.parse(JSON.stringify(retry)), {
    success: true,
    started: false,
    producer: 'orders.coupang_reviews',
    runId: ATTEMPT_ID,
    status: 'running',
    months: 1,
    total: 1,
    completed: 0,
    collected: 0,
    created: 0,
    updated: 0,
    linked: 0,
    unlinked: 0,
    current: null,
    failures: [],
    error: null,
    cancelRequested: false,
    startedAt: retry.startedAt,
    endedAt: null,
  });

  await waitFor(() => f.calls.some((call) => call.path.endsWith(`/attempts/${ATTEMPT_ID}/complete`)));
  const chunk = f.calls.find((call) => call.path.endsWith('/chunks'));
  const windowComplete = f.calls.find((call) => call.path.includes('/windows/0/complete'));
  const attemptComplete = f.calls.find((call) => call.path.endsWith('/attempts/' + ATTEMPT_ID + '/complete'));
  assert.ok(chunk);
  assert.ok(windowComplete);
  assert.ok(attemptComplete);
  assert.equal(chunk.init.headers['X-Source-Attempt-Token'], ATTEMPT_TOKEN);
  assert.equal(windowComplete.init.headers['X-Source-Attempt-Token'], ATTEMPT_TOKEN);
  assert.deepEqual(JSON.parse(chunk.init.body), {
    windowIndex: 0,
    sequence: 0,
    items: [{
      externalReviewId: 'review-1',
      externalOptionId: 'vendor-item-1',
      externalProductId: 'product-1',
      itemName: 'Toy',
      rating: 5,
      title: 'Great',
      content: 'Works well',
      reviewerName: 'Reviewer',
      reviewedAt: JSON.parse(chunk.init.body).items[0].reviewedAt,
      imageCount: 1,
      videoCount: 1,
      isDeleted: false,
      isBlinded: false,
    }],
  });
  assert.deepEqual(JSON.parse(windowComplete.init.body), {
    itemCount: 1,
    pageCount: 1,
    pageLimitReached: false,
    coverageStartDate: PLAN.windows[0].start,
    coverageEndDate: PLAN.windows[0].end,
  });
  assert.equal(attemptComplete.init.headers['X-Source-Attempt-Token'], ATTEMPT_TOKEN);
  assert.equal(f.calls.some((call) => call.path.includes('/api/reviews/ingest')), false);

  await waitFor(() => f.storage['review-state']?.status === 'done');
  assert.equal(f.storage['review-state'].runId, ATTEMPT_ID);
});

test('rejects an extension-supplied plan that changes the server parser contract', async () => {
  const f = fixture();
  await assert.rejects(
    f.collector.start({
      attemptId: ATTEMPT_ID,
      attemptToken: ATTEMPT_TOKEN,
      plan: { ...PLAN, maxPagesPerWindow: 41 },
    }, f.dependencies),
    /허가가 유효하지 않습니다/,
  );
  assert.equal(f.calls.length, 0);
});

test('persists a token-free cancel intent when owner control recovery is unavailable', async () => {
  const f = fixture();
  f.storage['review-state'] = {
    producer: 'orders.coupang_reviews',
    runId: ATTEMPT_ID,
    status: 'running',
    months: 1,
    total: 1,
    completed: 0,
    collected: 0,
    created: 0,
    updated: 0,
    linked: 0,
    unlinked: 0,
    current: '2026-09',
    failures: [],
    error: null,
    cancelRequested: false,
    startedAt: Date.now(),
    heartbeatAt: Date.now(),
    endedAt: null,
    ownedTabIds: [42],
  };
  f.dependencies.authedFetch = async (path, init = {}) => {
    f.calls.push({ path, init });
    return { ok: false, status: 401, json: async () => ({}) };
  };

  const result = await f.collector.cancel(ATTEMPT_ID, 'review-state', f.dependencies);

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    success: true,
    cancelled: false,
    pending: true,
    runId: ATTEMPT_ID,
  });
  assert.equal(f.storage['review-state'].status, 'running');
  assert.equal(f.storage['review-state'].cancelRequested, true);
  assert.deepEqual(f.storage['review-state'].ownedTabIds, [42]);
  assert.equal('attemptToken' in f.storage['review-state'], false);
  assert.deepEqual(f.removedTabs, []);
});

test('retries only the persisted cancellation and closes owned tabs after owner acknowledgement', async () => {
  const f = fixture();
  f.storage['review-state'] = {
    producer: 'orders.coupang_reviews',
    runId: ATTEMPT_ID,
    status: 'running',
    months: 1,
    total: 1,
    completed: 0,
    collected: 0,
    created: 0,
    updated: 0,
    linked: 0,
    unlinked: 0,
    current: '2026-09',
    failures: [],
    error: null,
    cancelRequested: true,
    startedAt: Date.now(),
    heartbeatAt: Date.now(),
    endedAt: null,
    ownedTabIds: [42],
  };
  f.dependencies.authedFetch = async (path, init = {}) => {
    f.calls.push({ path, init });
    if (path.endsWith('/control')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ attemptId: ATTEMPT_ID, attemptToken: ATTEMPT_TOKEN }),
      };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };

  const settled = await f.collector.retryAdditionalCollections(f.dependencies);

  assert.equal(settled, true);
  assert.equal(f.storage['review-state'].status, 'cancelled');
  assert.equal(f.storage['review-state'].cancelRequested, false);
  assert.deepEqual(f.storage['review-state'].ownedTabIds, []);
  assert.deepEqual(f.removedTabs, [42]);
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0].path, `/api/reviews/attempts/${ATTEMPT_ID}/control`);
  assert.equal(f.calls[1].path, `/api/reviews/attempts/${ATTEMPT_ID}/cancel`);
  assert.equal(f.calls[1].init.headers['X-Source-Attempt-Token'], ATTEMPT_TOKEN);
  assert.equal('attemptToken' in f.storage['review-state'], false);
});

test('fences a multipage provider request before delayed storage can resume it', async () => {
  const f = fixture({ totalPages: 3, searchContent: [] });
  f.dependencies.authedFetch = async (path, init = {}) => {
    f.calls.push({ path, init });
    if (path.endsWith('/control')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ attemptId: ATTEMPT_ID, attemptToken: ATTEMPT_TOKEN }),
      };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };

  await f.collector.start({ attemptId: ATTEMPT_ID, attemptToken: ATTEMPT_TOKEN, plan: PLAN }, f.dependencies);
  await waitFor(() => f.searchCalls === 1);

  // Make the canceler's first storage read slow. The in-memory fence must stop
  // the crawler during the inter-page delay before page 2 is requested.
  f.dependencies.stateKey = 'review-state';
  const delayStorage = { value: true };
  const originalGet = f.context.chrome.storage.local.get;
  f.context.chrome.storage.local.get = (key, callback) => {
    if (delayStorage.value) {
      delayStorage.value = false;
      f.releaseStorageGet = () => callback({ [key]: structuredClone(f.storage[key]) });
      return;
    }
    originalGet(key, callback);
  };
  const cancelPromise = f.collector.cancel(ATTEMPT_ID, 'review-state', f.dependencies);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(f.searchCalls, 1);
  f.releaseStorageGet();
  await cancelPromise;
  await waitFor(() => f.storage['review-state']?.status === 'cancelled');
  assert.equal(f.searchCalls, 1);
});

test('does not let a late old cancel ACK overwrite a newer run', async () => {
  const f = fixture({ searchContent: [] });
  const controlGate = deferred();
  f.storage['review-state'] = {
    producer: 'orders.coupang_reviews',
    runId: ATTEMPT_ID,
    status: 'running',
    months: 1,
    total: 1,
    completed: 0,
    collected: 0,
    created: 0,
    updated: 0,
    linked: 0,
    unlinked: 0,
    current: null,
    failures: [],
    error: null,
    cancelRequested: false,
    startedAt: Date.now() - 10 * 60 * 1000,
    heartbeatAt: Date.now() - 10 * 60 * 1000,
    endedAt: null,
    ownedTabIds: [42],
  };
  f.dependencies.authedFetch = async (path, init = {}) => {
    f.calls.push({ path, init });
    if (path.endsWith('/control')) {
      return { ok: true, status: 200, json: () => controlGate.promise };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };

  const oldCancel = f.collector.cancel(ATTEMPT_ID, 'review-state', f.dependencies);
  await waitFor(() => f.calls.some((call) => call.path.endsWith('/control')));
  const newId = 'a2222222-2222-4222-8222-222222222222';
  f.storage['review-state'] = {
    ...f.storage['review-state'],
    runId: newId,
    status: 'running',
    cancelRequested: false,
    startedAt: Date.now(),
    heartbeatAt: Date.now(),
    ownedTabIds: [],
  };
  controlGate.resolve({ attemptId: ATTEMPT_ID, attemptToken: ATTEMPT_TOKEN });
  await oldCancel;
  assert.equal(f.storage['review-state'].runId, newId);
  assert.equal(f.storage['review-state'].status, 'running');
  assert.equal(f.storage['review-state'].cancelRequested, false);
});

test('closes a tab created after cancellation ACK without restarting the run', async () => {
  const createGate = deferred();
  let creationStarted = false;
  const f = fixture({
    searchContent: [],
    createTab: () => {
      creationStarted = true;
      return createGate.promise;
    },
  });
  f.dependencies.authedFetch = async (path, init = {}) => {
    f.calls.push({ path, init });
    if (path.endsWith('/control')) {
      return { ok: true, status: 200, json: async () => ({ attemptId: ATTEMPT_ID, attemptToken: ATTEMPT_TOKEN }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };

  await f.collector.start({ attemptId: ATTEMPT_ID, attemptToken: ATTEMPT_TOKEN, plan: PLAN }, f.dependencies);
  await waitFor(() => creationStarted);
  const cancelPromise = f.collector.cancel(ATTEMPT_ID, 'review-state', f.dependencies);
  await waitFor(() => f.storage['review-state']?.cancelRequested === true);
  createGate.resolve({ id: 77 });
  await cancelPromise;
  await waitFor(() => f.removedTabs.includes(77));
  await waitFor(() => f.storage['review-state']?.status === 'cancelled');
  assert.deepEqual(f.removedTabs, [77]);
  assert.equal(f.storage['review-state'].status, 'cancelled');
  assert.equal(f.searchCalls, 0);
});

test('keeps a failed close pending until the cleanup retry is acknowledged', async () => {
  let shouldFail = true;
  const f = fixture({
    removeTab: async (tabId) => {
      if (shouldFail) {
        shouldFail = false;
        throw new Error(`cannot close ${tabId}`);
      }
      f.removedTabs.push(tabId);
    },
  });
  f.storage['review-state'] = {
    producer: 'orders.coupang_reviews',
    runId: ATTEMPT_ID,
    status: 'running',
    months: 1,
    total: 1,
    completed: 0,
    collected: 0,
    created: 0,
    updated: 0,
    linked: 0,
    unlinked: 0,
    current: null,
    failures: [],
    error: null,
    cancelRequested: true,
    startedAt: Date.now(),
    heartbeatAt: Date.now(),
    endedAt: null,
    ownedTabIds: [42],
  };
  f.dependencies.authedFetch = async (path, init = {}) => {
    f.calls.push({ path, init });
    if (path.endsWith('/control')) {
      return { ok: true, status: 200, json: async () => ({ attemptId: ATTEMPT_ID, attemptToken: ATTEMPT_TOKEN }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };

  assert.equal(await f.collector.retryAdditionalCollections(f.dependencies), false);
  assert.deepEqual(f.storage['review-state'].ownedTabIds, [42]);
  assert.equal(await f.collector.retryAdditionalCollections(f.dependencies), true);
  assert.equal(f.storage['review-state'].status, 'cancelled');
  assert.deepEqual(f.storage['review-state'].ownedTabIds, []);
  assert.deepEqual(f.removedTabs, [42]);
});

test('keeps cancellation pending when a terminal conflict has no authoritative owner state', async () => {
  const f = fixture();
  f.storage['review-state'] = {
    producer: 'orders.coupang_reviews',
    runId: ATTEMPT_ID,
    status: 'running',
    months: 1,
    total: 1,
    completed: 0,
    collected: 0,
    created: 0,
    updated: 0,
    linked: 0,
    unlinked: 0,
    current: null,
    failures: [],
    error: null,
    cancelRequested: true,
    startedAt: Date.now(),
    heartbeatAt: Date.now(),
    endedAt: null,
    ownedTabIds: [42],
  };
  f.dependencies.authedFetch = async (path, init = {}) => {
    f.calls.push({ path, init });
    if (path.endsWith('/control')) {
      return { ok: true, status: 200, json: async () => ({ attemptId: ATTEMPT_ID, attemptToken: ATTEMPT_TOKEN }) };
    }
    if (path.endsWith('/cancel')) {
      return { ok: false, status: 409, json: async () => ({ message: 'conflict' }) };
    }
    return { ok: true, status: 200, json: async () => ({ attemptId: ATTEMPT_ID, state: 'RUNNING' }) };
  };

  assert.equal(await f.collector.retryAdditionalCollections(f.dependencies), false);
  assert.equal(f.storage['review-state'].status, 'running');
  assert.equal(f.storage['review-state'].cancelRequested, true);
  assert.deepEqual(f.removedTabs, []);
  assert.equal(f.calls.at(-1).path, `/api/reviews/attempts/${ATTEMPT_ID}`);
});

test('keeps a terminal COMPLETE owner terminal instead of synthesizing cancelled', async () => {
  const f = fixture();
  f.storage['review-state'] = {
    producer: 'orders.coupang_reviews',
    runId: ATTEMPT_ID,
    status: 'running',
    months: 1,
    total: 1,
    completed: 0,
    collected: 0,
    created: 0,
    updated: 0,
    linked: 0,
    unlinked: 0,
    current: null,
    failures: [],
    error: null,
    cancelRequested: true,
    startedAt: Date.now(),
    heartbeatAt: Date.now(),
    endedAt: null,
    ownedTabIds: [42],
  };
  f.dependencies.authedFetch = async (path, init = {}) => {
    f.calls.push({ path, init });
    if (path.endsWith('/control')) {
      return { ok: true, status: 200, json: async () => ({ attemptId: ATTEMPT_ID, attemptToken: ATTEMPT_TOKEN }) };
    }
    if (path.endsWith('/cancel')) {
      return { ok: false, status: 409, json: async () => ({ message: 'terminal replay' }) };
    }
    return { ok: true, status: 200, json: async () => ({ attemptId: ATTEMPT_ID, state: 'COMPLETE' }) };
  };

  assert.equal(await f.collector.retryAdditionalCollections(f.dependencies), true);
  assert.equal(f.storage['review-state'].status, 'done');
  assert.notEqual(f.storage['review-state'].status, 'cancelled');
  assert.deepEqual(f.removedTabs, [42]);
});

test('reserves an attempt before delayed admission storage so duplicate starts do not open two tabs', async () => {
  const f = fixture({ searchContent: [], delayNextStorageGet: true });
  let creates = 0;
  f.dependencies.createTab = async () => {
    creates += 1;
    return { id: 42 };
  };
  const first = f.collector.start({ attemptId: ATTEMPT_ID, attemptToken: ATTEMPT_TOKEN, plan: PLAN }, f.dependencies);
  const duplicate = await f.collector.start({ attemptId: ATTEMPT_ID, attemptToken: ATTEMPT_TOKEN, plan: PLAN }, f.dependencies);
  assert.equal(duplicate.started, false);
  f.releaseStorageGet();
  await first;
  await waitFor(() => f.storage['review-state']?.status === 'done');
  assert.equal(creates, 1);
});

test('reports persistence failure as pending and does not close an unledgered owned tab', async () => {
  const f = fixture();
  f.storage['review-state'] = {
    producer: 'orders.coupang_reviews',
    runId: ATTEMPT_ID,
    status: 'running',
    months: 1,
    total: 1,
    completed: 0,
    collected: 0,
    created: 0,
    updated: 0,
    linked: 0,
    unlinked: 0,
    current: null,
    failures: [],
    error: null,
    cancelRequested: false,
    startedAt: Date.now(),
    heartbeatAt: Date.now(),
    endedAt: null,
    ownedTabIds: [42],
  };
  f.context.chrome.runtime = { lastError: null };
  const originalSet = f.context.chrome.storage.local.set;
  let failWrites = true;
  f.context.chrome.storage.local.set = (values, callback) => {
    if (failWrites) {
      f.context.chrome.runtime.lastError = { message: 'disk unavailable' };
      callback?.();
      f.context.chrome.runtime.lastError = null;
      return;
    }
    originalSet(values, callback);
  };
  f.dependencies.authedFetch = async (path, init = {}) => {
    f.calls.push({ path, init });
    if (path.endsWith('/control')) {
      return { ok: true, status: 200, json: async () => ({ attemptId: ATTEMPT_ID, attemptToken: ATTEMPT_TOKEN }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };

  const result = await f.collector.cancel(ATTEMPT_ID, 'review-state', f.dependencies);
  assert.equal(result.cancelled, false);
  assert.equal(result.pending, true);
  assert.deepEqual(f.removedTabs, []);
  failWrites = false;
});

test('closes the exact tab when its first ownership ledger write fails', async () => {
  const createGate = deferred();
  let creationStarted = false;
  const f = fixture({
    createTab: () => {
      creationStarted = true;
      return createGate.promise;
    },
  });
  f.context.chrome.runtime = { lastError: null };
  const originalSet = f.context.chrome.storage.local.set;
  let failWrites = false;
  f.context.chrome.storage.local.set = (values, callback) => {
    if (failWrites) {
      f.context.chrome.runtime.lastError = { message: 'ledger unavailable' };
      callback?.();
      f.context.chrome.runtime.lastError = null;
      return;
    }
    originalSet(values, callback);
  };

  await f.collector.start({ attemptId: ATTEMPT_ID, attemptToken: ATTEMPT_TOKEN, plan: PLAN }, f.dependencies);
  await waitFor(() => creationStarted);
  failWrites = true;
  createGate.resolve({ id: 88 });
  await waitFor(() => f.removedTabs.includes(88));
  assert.deepEqual(f.removedTabs, [88]);
  assert.equal(f.searchCalls, 0);
  failWrites = false;
});

test('does not let a failed late-tab close manufacture owner cancellation ACK', async () => {
  const createGate = deferred();
  let creationStarted = false;
  let removeAttempts = 0;
  const f = fixture({
    createTab: () => {
      creationStarted = true;
      return createGate.promise;
    },
    removeTab: async (tabId) => {
      removeAttempts += 1;
      if (removeAttempts === 1) throw new Error(`cannot close ${tabId}`);
      f.removedTabs.push(tabId);
    },
  });
  let controlReads = 0;
  f.dependencies.authedFetch = async (path, init = {}) => {
    f.calls.push({ path, init });
    if (path.endsWith('/control')) {
      controlReads += 1;
      if (controlReads < 3) return { ok: false, status: 401, json: async () => ({}) };
      return {
        ok: true,
        status: 200,
        json: async () => ({ attemptId: ATTEMPT_ID, attemptToken: ATTEMPT_TOKEN }),
      };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };

  await f.collector.start({ attemptId: ATTEMPT_ID, attemptToken: ATTEMPT_TOKEN, plan: PLAN }, f.dependencies);
  await waitFor(() => creationStarted);
  const firstCancel = await f.collector.cancel(ATTEMPT_ID, 'review-state', f.dependencies);
  assert.equal(firstCancel.cancelled, false);
  assert.equal(controlReads, 1);

  createGate.resolve({ id: 77 });
  await waitFor(() => controlReads >= 2 && f.storage['review-state']?.ownedTabIds?.includes(77));
  assert.equal(f.storage['review-state'].ownerCancelAcknowledged, false);

  const retried = await f.collector.retryAdditionalCollections(f.dependencies);
  assert.equal(retried, true);
  assert.ok(controlReads >= 3);
  assert.equal(f.calls.filter((call) => call.path.endsWith('/cancel')).length, 1);
  assert.equal(f.storage['review-state'].status, 'cancelled');
  assert.deepEqual(f.removedTabs, [77]);
});

test('keeps terminal tab ownership until close ACK and fences a new generation', async () => {
  let shouldFail = true;
  const f = fixture({
    removeTab: async (tabId) => {
      if (shouldFail) {
        shouldFail = false;
        throw new Error(`cannot close ${tabId}`);
      }
      f.removedTabs.push(tabId);
    },
  });

  await f.collector.start({ attemptId: ATTEMPT_ID, attemptToken: ATTEMPT_TOKEN, plan: PLAN }, f.dependencies);
  await waitFor(() => f.storage['review-state']?.status === 'done');
  assert.deepEqual(f.storage['review-state'].ownedTabIds, [42]);

  const newerId = 'a2222222-2222-4222-8222-222222222222';
  const blocked = await f.collector.start({
    attemptId: newerId,
    attemptToken: ATTEMPT_TOKEN,
    plan: PLAN,
  }, f.dependencies);
  assert.equal(blocked.success, false);
  assert.equal(blocked.runId, ATTEMPT_ID);
  assert.deepEqual(f.storage['review-state'].ownedTabIds, [42]);

  assert.equal(await f.collector.retryAdditionalCollections(f.dependencies), true);
  assert.deepEqual(f.storage['review-state'].ownedTabIds, []);
  const started = await f.collector.start({
    attemptId: newerId,
    attemptToken: ATTEMPT_TOKEN,
    plan: PLAN,
  }, f.dependencies);
  assert.equal(started.success, true);
  assert.equal(started.started, true);
});

test('does not close a healthy running checkpoint during lifecycle retry', async () => {
  const f = fixture();
  f.storage['review-state'] = {
    producer: 'orders.coupang_reviews',
    runId: ATTEMPT_ID,
    status: 'running',
    months: 1,
    total: 1,
    completed: 0,
    collected: 0,
    created: 0,
    updated: 0,
    linked: 0,
    unlinked: 0,
    current: '2026-09',
    failures: [],
    error: null,
    cancelRequested: false,
    startedAt: Date.now(),
    heartbeatAt: Date.now(),
    endedAt: null,
    ownedTabIds: [42],
  };

  assert.equal(await f.collector.retryAdditionalCollections(f.dependencies), true);
  assert.deepEqual(f.removedTabs, []);
  assert.equal(f.storage['review-state'].status, 'running');
  assert.deepEqual(f.storage['review-state'].ownedTabIds, [42]);
});
