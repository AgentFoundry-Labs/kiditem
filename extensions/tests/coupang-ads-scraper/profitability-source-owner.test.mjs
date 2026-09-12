import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const sourcePath = path.join(
  repoRoot,
  'extensions/kiditem-os/background/coupang/profitability-source-owner.js',
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
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    mappingGeneration: '7',
    adSourcePolicyHash: 'absolute-v1',
    accounts: [
      {
        channelAccountId: 'account-a',
        externalAccountId: 'coupang-account-a',
        expectedAdvertiserId: 'advertiser-a',
        slices: [
          {
            sliceId: 'account-a:2026-06-01_2026-06-30',
            from: '2026-06-01',
            to: '2026-06-30',
            businessDates: ['2026-06-01'],
          },
          {
            sliceId: 'account-a:2026-07-01_2026-07-31',
            from: '2026-07-01',
            to: '2026-07-31',
            businessDates: ['2026-07-01'],
          },
        ],
      },
      {
        channelAccountId: 'account-b',
        externalAccountId: 'coupang-account-b',
        expectedAdvertiserId: 'advertiser-b',
        slices: [{
          sliceId: 'account-b:2026-06-01_2026-06-30',
          from: '2026-06-01',
          to: '2026-06-30',
          businessDates: ['2026-06-01'],
        }],
      },
    ],
  };
}

function createSessions() {
  const stored = new Map();
  const started = [];
  return {
    stored,
    started,
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
  };
}

function loadSourceOwner(options) {
  const context = vm.createContext({
    TextEncoder,
    crypto: webcrypto,
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
  return context.KidItemProfitabilitySourceOwner.create(options);
}

test('visits every server-planned account and slice before completing', async () => {
  const plan = ownerPlan();
  const sessions = createSessions();
  const requests = [];
  const visitedAccounts = [];
  const closedAttempts = [];
  const sourceOwner = loadSourceOwner({
    sessions,
    async closeAttempt(environmentId, ownerAttemptId) {
      closedAttempts.push([environmentId, ownerAttemptId]);
    },
    async request(_environmentId, pathName, init = {}) {
      requests.push({ pathName, init });
      if (pathName === '/api/ads/profitability-imports') return response(plan);
      if (pathName.endsWith('/complete')) return response({ ready: true });
      return response({ replayed: false });
    },
    async collectSlice({ account, slice }) {
      visitedAccounts.push(account.externalAccountId);
      return {
        success: true,
        receipt: {
          providerAdvertiserId: account.expectedAdvertiserId,
          reportId: `report:${slice.sliceId}`,
          campaignCount: 1,
          expectedRowCount: 1,
          collectedRowCount: 1,
          responseBytes: 100,
          rows: [{
            businessDate: slice.businessDates[0],
            externalOptionId: `option:${slice.sliceId}`,
            adSpend: 100,
            impressions: 10,
            clicks: 1,
            orders: 1,
            conversions: 1,
            adRevenue: 1000,
          }],
        },
      };
    },
  });

  const result = await sourceOwner.run({
    environmentId: 'local',
    idempotencyKey: 'profitability-owner-start-1',
  });

  assert.equal(result.success, true);
  assert.deepEqual(visitedAccounts, [
    'coupang-account-a',
    'coupang-account-a',
    'coupang-account-b',
  ]);
  const uploads = requests.filter(({ pathName }) => pathName.includes('/slices/'));
  assert.equal(uploads.length, 3);
  assert.equal(
    requests.filter(({ pathName }) => pathName.endsWith('/complete')).length,
    1,
  );
  assert.ok(
    requests.findIndex(({ pathName }) => pathName.endsWith('/complete')) >
      requests.map(({ pathName }) => pathName).lastIndexOf(uploads.at(-1).pathName),
  );
  for (const { init } of uploads) {
    assert.equal(init.headers['x-source-attempt-token'], attemptToken);
  }
  assert.equal(JSON.stringify([...sessions.stored.values()]).includes(attemptToken), false);
  assert.equal(JSON.stringify([...sessions.stored.values()]).includes('mappingGeneration'), false);
  assert.deepEqual(sessions.started, [{
    attemptId,
    environmentId: 'local',
    producer: 'advertising.profitability_import',
  }]);
  assert.deepEqual(closedAttempts, [['local', attemptId]]);
});

test('fails the owner attempt after an advertiser mismatch and does not complete', async () => {
  const plan = ownerPlan();
  const sessions = createSessions();
  const requests = [];
  const sourceOwner = loadSourceOwner({
    sessions,
    async request(_environmentId, pathName, init = {}) {
      requests.push({ pathName, init });
      if (pathName === '/api/ads/profitability-imports') return response(plan);
      if (pathName.endsWith('/fail')) return response({ status: 'FAILED' });
      return response({ replayed: false });
    },
    async collectSlice({ slice }) {
      return {
        success: true,
        receipt: {
          providerAdvertiserId: 'wrong-advertiser',
          reportId: `report:${slice.sliceId}`,
          campaignCount: 1,
          expectedRowCount: 1,
          collectedRowCount: 1,
          responseBytes: 100,
          rows: [{
            businessDate: slice.businessDates[0],
            externalOptionId: `option:${slice.sliceId}`,
            adSpend: 100,
            impressions: 10,
            clicks: 1,
            orders: 1,
            conversions: 1,
            adRevenue: 1000,
          }],
        },
      };
    },
  });

  const result = await sourceOwner.run({
    environmentId: 'local',
    idempotencyKey: 'profitability-owner-start-mismatch',
  });

  assert.equal(result.success, false);
  const failure = requests.find(({ pathName }) => pathName.endsWith('/fail'));
  assert.ok(failure);
  assert.deepEqual(JSON.parse(failure.init.body), {
    code: 'ADVERTISER_IDENTITY_MISMATCH',
    message: 'The visible Coupang advertiser does not match the server-planned account.',
  });
  assert.equal(requests.some(({ pathName }) => pathName.endsWith('/complete')), false);
  assert.equal(sessions.stored.has(attemptId), false);
});

test('retries a direct receipt upload without changing its receipt identity', async () => {
  const plan = ownerPlan();
  plan.accounts = [{ ...plan.accounts[0], slices: [plan.accounts[0].slices[0]] }];
  const sessions = createSessions();
  const uploadBodies = [];
  let uploadAttempts = 0;
  const sourceOwner = loadSourceOwner({
    sessions,
    async request(_environmentId, pathName, init = {}) {
      if (pathName === '/api/ads/profitability-imports') return response(plan);
      if (pathName.includes('/slices/')) {
        uploadAttempts += 1;
        uploadBodies.push(init.body);
        if (uploadAttempts === 1) throw new TypeError('temporary network failure');
        return response({ replayed: false });
      }
      if (pathName.endsWith('/complete')) return response({ ready: true });
      return response({ status: 'FAILED' });
    },
    async collectSlice({ account, slice }) {
      return {
        success: true,
        receipt: {
          providerAdvertiserId: account.expectedAdvertiserId,
          reportId: `report:${slice.sliceId}`,
          campaignCount: 1,
          expectedRowCount: 1,
          collectedRowCount: 1,
          responseBytes: 100,
          rows: [{
            businessDate: slice.businessDates[0],
            externalOptionId: `option:${slice.sliceId}`,
            adSpend: 100,
            impressions: 10,
            clicks: 1,
            orders: 1,
            conversions: 1,
            adRevenue: 1000,
          }],
        },
      };
    },
  });

  const result = await sourceOwner.run({
    environmentId: 'local',
    idempotencyKey: 'profitability-owner-start-retry',
  });

  assert.equal(result.success, true);
  assert.equal(uploadAttempts, 2);
  assert.equal(uploadBodies[0], uploadBodies[1]);
  assert.deepEqual(JSON.parse(uploadBodies[0]).sequence, 0);
});

test('coalesces concurrent starts into one owner execution', async () => {
  const plan = ownerPlan();
  plan.accounts = [{ ...plan.accounts[0], slices: [plan.accounts[0].slices[0]] }];
  const sessions = createSessions();
  const requests = [];
  let releaseCollection;
  let markCollectionStarted;
  const collectionStarted = new Promise((resolve) => { markCollectionStarted = resolve; });
  const collectionGate = new Promise((resolve) => { releaseCollection = resolve; });
  let collectionCount = 0;
  const sourceOwner = loadSourceOwner({
    sessions,
    async request(_environmentId, pathName, init = {}) {
      requests.push({ pathName, init });
      if (pathName === '/api/ads/profitability-imports') return response(plan);
      if (pathName === `/api/ads/profitability-imports/${attemptId}`) return response(plan);
      if (pathName.includes('/slices/')) return response({ replayed: false });
      if (pathName.endsWith('/complete')) return response({ ready: true });
      throw new Error(`unexpected owner request: ${pathName}`);
    },
    async collectSlice({ account, slice }) {
      collectionCount += 1;
      markCollectionStarted();
      await collectionGate;
      return {
        success: true,
        receipt: {
          providerAdvertiserId: account.expectedAdvertiserId,
          reportId: `report:${slice.sliceId}`,
          campaignCount: 1,
          expectedRowCount: 1,
          collectedRowCount: 1,
          responseBytes: 100,
          rows: [{
            businessDate: slice.businessDates[0],
            externalOptionId: `option:${slice.sliceId}`,
            adSpend: 100,
            impressions: 10,
            clicks: 1,
            orders: 1,
            conversions: 1,
            adRevenue: 1000,
          }],
        },
      };
    },
  });

  const first = sourceOwner.run({
    environmentId: 'local',
    idempotencyKey: 'concurrent-owner-start',
  });
  await collectionStarted;
  const second = sourceOwner.run({
    environmentId: 'local',
    idempotencyKey: 'concurrent-owner-start',
  });
  releaseCollection();

  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.deepEqual(firstResult, secondResult);
  assert.equal(collectionCount, 1);
  assert.equal(
    requests.filter(({ pathName }) => pathName.includes('/slices/')).length,
    1,
  );
  assert.equal(
    requests.filter(({ pathName }) => pathName.endsWith('/complete')).length,
    1,
  );
});

test('rehydrates a still-running exact owner attempt after a service-worker restart', async () => {
  const plan = ownerPlan();
  plan.accounts = [{ ...plan.accounts[0], slices: [plan.accounts[0].slices[0]] }];
  const sessions = createSessions();
  sessions.stored.set(attemptId, {
    attemptId,
    environmentId: 'local',
    producer: 'advertising.profitability_import',
    progress: { current: 0, total: 1, completed: 0, failed: 0, label: null },
    attention: null,
  });
  const requests = [];
  const sourceOwner = loadSourceOwner({
    sessions,
    async request(_environmentId, pathName, init = {}) {
      requests.push({ pathName, method: init.method || 'GET' });
      if (
        pathName === `/api/ads/profitability-imports/${attemptId}` &&
        (init.method || 'GET') === 'GET'
      ) {
        return response(plan);
      }
      if (pathName.includes('/slices/')) return response({ replayed: false });
      if (pathName.endsWith('/complete')) return response({ ready: true });
      throw new Error(`unexpected owner request: ${pathName}`);
    },
    async collectSlice({ account, slice }) {
      return {
        success: true,
        receipt: {
          providerAdvertiserId: account.expectedAdvertiserId,
          reportId: `report:${slice.sliceId}`,
          campaignCount: 1,
          expectedRowCount: 1,
          collectedRowCount: 1,
          responseBytes: 100,
          rows: [{
            businessDate: slice.businessDates[0],
            externalOptionId: `option:${slice.sliceId}`,
            adSpend: 100,
            impressions: 10,
            clicks: 1,
            orders: 1,
            conversions: 1,
            adRevenue: 1000,
          }],
        },
      };
    },
  });

  const result = await sourceOwner.recover('local');

  assert.equal(result.success, true);
  assert.deepEqual(requests[0], {
    pathName: `/api/ads/profitability-imports/${attemptId}`,
    method: 'GET',
  });
  assert.equal(
    requests.some(({ pathName }) => pathName === '/api/ads/profitability-imports'),
    false,
  );
  assert.equal(sessions.stored.has(attemptId), false);
});

test('keeps an attention-required attempt for an explicit user retry without failing it', async () => {
  const plan = ownerPlan();
  plan.accounts = [{ ...plan.accounts[0], slices: [plan.accounts[0].slices[0]] }];
  const sessions = createSessions();
  const requests = [];
  const sourceOwner = loadSourceOwner({
    sessions,
    async request(_environmentId, pathName, init = {}) {
      requests.push({ pathName, init });
      if (pathName === '/api/ads/profitability-imports') return response(plan);
      throw new Error(`unexpected owner request: ${pathName}`);
    },
    async collectSlice() {
      return {
        success: false,
        attentionRequired: true,
        reason: 'marketplace_login',
        error: 'Coupang advertising login is required.',
      };
    },
  });

  const result = await sourceOwner.run({
    environmentId: 'local',
    idempotencyKey: 'profitability-owner-attention',
  });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    success: false,
    attentionRequired: true,
    attemptId,
    completedSliceCount: 0,
    error: 'Coupang advertising login is required.',
  });
  assert.equal(requests.some(({ pathName }) => pathName.endsWith('/fail')), false);
  assert.equal(requests.some(({ pathName }) => pathName.endsWith('/complete')), false);
  assert.equal(sessions.stored.get(attemptId)?.attention?.reason, 'marketplace_login');
  assert.equal(await sourceOwner.recover('local'), null);
  assert.equal(
    requests.some(({ pathName }) => pathName === `/api/ads/profitability-imports/${attemptId}`),
    false,
  );
});

test('an explicit retry resumes the attention attempt instead of beginning another', async () => {
  const plan = ownerPlan();
  plan.accounts = [{ ...plan.accounts[0], slices: [plan.accounts[0].slices[0]] }];
  const sessions = createSessions();
  sessions.stored.set(attemptId, {
    attemptId,
    environmentId: 'local',
    producer: 'advertising.profitability_import',
    progress: { current: 0, total: 1, completed: 0, failed: 0, label: null },
    attention: {
      reason: 'marketplace_login',
      message: 'Coupang advertising login is required.',
    },
  });
  const requests = [];
  const sourceOwner = loadSourceOwner({
    sessions,
    async request(_environmentId, pathName, init = {}) {
      requests.push({ pathName, init });
      if (pathName === `/api/ads/profitability-imports/${attemptId}`) {
        return response(plan);
      }
      if (pathName.includes('/slices/')) return response({ replayed: false });
      if (pathName.endsWith('/complete')) return response({ ready: true });
      throw new Error(`unexpected owner request: ${pathName}`);
    },
    async collectSlice({ account, slice }) {
      return {
        success: true,
        receipt: {
          providerAdvertiserId: account.expectedAdvertiserId,
          reportId: `report:${slice.sliceId}`,
          campaignCount: 1,
          expectedRowCount: 1,
          collectedRowCount: 1,
          responseBytes: 100,
          rows: [{
            businessDate: slice.businessDates[0],
            externalOptionId: `option:${slice.sliceId}`,
            adSpend: 100,
            impressions: 10,
            clicks: 1,
            orders: 1,
            conversions: 1,
            adRevenue: 1000,
          }],
        },
      };
    },
  });

  const result = await sourceOwner.run({
    environmentId: 'local',
    idempotencyKey: 'new-key-must-not-begin',
  });

  assert.equal(result.success, true);
  assert.equal(requests[0].pathName, `/api/ads/profitability-imports/${attemptId}`);
  assert.equal(
    requests.some(({ pathName }) => pathName === '/api/ads/profitability-imports'),
    false,
  );
});

test('fails the exact owner attempt before clearing a user-cancelled collection', async () => {
  const plan = ownerPlan();
  const sessions = createSessions();
  sessions.stored.set(attemptId, {
    attemptId,
    environmentId: 'local',
    producer: 'advertising.profitability_import',
    progress: { current: 0, total: 1, completed: 0, failed: 0, label: null },
    attention: null,
  });
  const requests = [];
  const closedAttempts = [];
  const sourceOwner = loadSourceOwner({
    sessions,
    async closeAttempt(environmentId, ownerAttemptId) {
      closedAttempts.push([environmentId, ownerAttemptId]);
    },
    async request(_environmentId, pathName, init = {}) {
      requests.push({ pathName, init });
      if (pathName === `/api/ads/profitability-imports/${attemptId}`) {
        return response(plan);
      }
      if (pathName.endsWith('/fail')) return response({ status: 'FAILED' });
      throw new Error(`unexpected owner request: ${pathName}`);
    },
    async collectSlice() {
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
    message: 'Advertising profitability collection was cancelled by the user.',
  });
  assert.deepEqual(closedAttempts, [['local', attemptId]]);
  assert.equal(sessions.stored.has(attemptId), false);
});

test('exposes the direct owner start only through the shared external dispatch', () => {
  const serviceWorker = readFileSync(
    path.join(repoRoot, 'extensions/kiditem-os/background/service-worker.js'),
    'utf8',
  );
  const worker = readFileSync(
    path.join(repoRoot, 'extensions/kiditem-os/background/coupang/worker.js'),
    'utf8',
  );
  const registry = readFileSync(
    path.join(repoRoot, 'extensions/kiditem-os/background/domain-registry.js'),
    'utf8',
  );
  const dispatch = readFileSync(
    path.join(repoRoot, 'extensions/kiditem-os/background/external-dispatch.js'),
    'utf8',
  );

  assert.match(serviceWorker, /"coupang\/profitability-source-owner\.js"/);
  assert.match(worker, /collectAdvertisingProfitability/);
  assert.match(worker, /externalActions:/);
  assert.match(
    worker,
    /handle:\s*\([^)]*\)\s*=>\s*KidItemWorkerKeepAlive\.during\(/,
  );
  assert.doesNotMatch(worker, /profitability-refresh\/runs/);
  assert.match(registry, /forExternalAction/);
  assert.match(dispatch, /forExternalAction/);
});
