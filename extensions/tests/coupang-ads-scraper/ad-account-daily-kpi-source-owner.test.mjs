import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { AdAccountDailyKpiSourceControlSchema } from '@kiditem/shared/advertising';

const attemptId = '11111111-1111-4111-8111-111111111111';
const attemptToken = '22222222-2222-4222-8222-222222222222';
const channelAccountId = '33333333-3333-4333-8333-333333333333';
const dates = ['2026-09-04', '2026-09-05'];
const LEGACY_PARSER_VERSION = 'ad-account-daily-kpi-v1';
const PARSER_VERSION = 'ad-account-daily-kpi-v2';
const sender = {
  tab: { id: 41, url: 'https://advertising.coupang.com/marketing/dashboard/sales#targetDate=2026-09-05' },
  url: 'https://advertising.coupang.com/marketing/dashboard/sales#targetDate=2026-09-05',
  frameId: 0,
};

const plain = value => JSON.parse(JSON.stringify(value));
const canonicalize = value => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  return Object.fromEntries(Object.entries(value)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, nested]) => [key, canonicalize(nested)]));
};
const checksum = value => createHash('sha256')
  .update(JSON.stringify(canonicalize(JSON.parse(JSON.stringify(value)))))
  .digest('hex');

const normalized = date => ({
  date,
  adSpend: 123,
  adRevenue: 456,
  impressions: 1000,
  clicks: 10,
  conversions: 7,
  orders: 6,
  roas: 3.7,
  ctr: 1,
  conversionRate: 60,
  observedMetrics: {
    adSpend: true,
    adRevenue: true,
    impressions: true,
    clicks: true,
    conversions: true,
    orders: true,
  },
  rowCount: 1,
});

const bodyFor = date => ({
  businessDate: date,
  observedAt: '2026-09-06T01:00:00.000+00:00',
  providerAdvertiserId: 'A0001',
  rawJson: {
    type: 'coupang_ads_daily',
    data: [{ date, adSpend: 123 }],
    // Numeric keys exercise the server's Object.fromEntries ordering semantics.
    '10': 'ten',
    '2': 'two',
  },
  normalized: normalized(date),
});

function control(state = 'RUNNING', receipts = [], parserVersion = PARSER_VERSION) {
  const plan = {
    sourceType: 'coupang_ads_daily',
    parserVersion,
    channelAccountId,
    expectedAdvertiserId: 'A0001',
    coverageRangeStartDate: dates[0],
    coverageRangeEndDate: dates[1],
    expectedDates: dates,
    businessDates: dates,
  };
  return AdAccountDailyKpiSourceControlSchema.parse({
    attemptId,
    sourceImportRunId: attemptId,
    channelAccountId,
    state,
    plan,
    expiresAt: '2030-01-02T00:00:00.000Z',
    actualCutoffAt: state === 'COMPLETE' ? `${plan.coverageRangeEndDate}T00:00:00.000Z` : null,
    receiptCount: receipts.length,
    rowCount: receipts.reduce((sum, receipt) => sum + receipt.rowCount, 0),
    manifestChecksum: checksum({ plan, receipts }),
    errorCode: state === 'FAILED' ? 'USER_CANCELLED' : null,
    errorMessage: state === 'FAILED' ? 'cancelled' : null,
    attemptToken,
    receipts,
  });
}

function harness({ collect = async () => ({ success: true }), request = async () => control() } = {}) {
  const requests = [];
  const captures = [];
  const closed = [];
  const storage = {};
  const chrome = {
    storage: {
      local: {
        async get(key, callback) {
          const result = { [key]: structuredClone(storage[key]) };
          callback?.(result);
          return result;
        },
        async set(value, callback) {
          Object.assign(storage, structuredClone(value));
          callback?.();
        },
      },
    },
    tabs: { async query() { return []; }, async remove() {} },
  };
  const context = vm.createContext({ chrome, console, crypto, TextEncoder, URL, setTimeout, clearTimeout, Date });
  for (const file of [
    '../../shared/collection-session.js',
    '../../kiditem-os/background/sourcing/source-attempt-wire.js',
    '../../kiditem-os/background/coupang/ad-account-daily-kpi-source-owner.js',
  ]) {
    vm.runInContext(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), context);
  }
  const sessions = context.KidItemCollectionSession.create({ chrome, storageKey: 'sessions', webUrlPatterns: [] });
  let owner;
  owner = context.KidItemAdAccountDailyKpiSourceOwner.create({
    chrome,
    sessions,
    request: async (environmentId, path, init) => {
      requests.push({ environmentId, path, ...init });
      const response = await request(path, init);
      return {
        ok: !response?.httpStatus,
        status: response?.httpStatus || 200,
        json: async () => structuredClone(response),
      };
    },
    collect: async input => {
      captures.push(input);
      await sessions.attachTab(attemptId, { tabId: 41, windowId: 7 });
      return collect(input, owner);
    },
    environmentForTab: async tabId => tabId === 41 ? 'local' : 'office',
    ownedTab: async () => 41,
    closeAttempt: async (environmentId, id) => closed.push({ environmentId, id }),
  });
  return { owner, sessions, requests, captures, closed, storage };
}

function step(owner, body) {
  return new Promise(resolve => owner.handleMessage({
    action: 'advertisingAccountDailyKpiSourceStep',
    attemptId,
    step: 'receipt',
    body,
  }, sender, resolve));
}

test('daily receipts use the server owner control and complete only from owner coverage', async () => {
  let current = control();
  const h = harness({
    request: async (path, init) => {
      if (init?.method === 'PUT') {
        const body = JSON.parse(init.body);
        const sequence = Number(path.split('/').at(-1));
        const receipt = {
          sequence,
          businessDate: body.businessDate,
          observedAt: body.observedAt,
          checksum: checksum(body),
          rowCount: body.normalized.rowCount,
          snapshotId: `00000000-0000-4000-8000-00000000000${sequence + 1}`,
        };
        current = control('RUNNING', [...current.receipts, receipt]);
        return receipt;
      }
      if (path.endsWith('/complete')) {
        current = control('COMPLETE', current.receipts);
        return { channelAccountId, status: 'READY' };
      }
      return current;
    },
    collect: async (_input, owner) => {
      assert.equal((await step(owner, bodyFor(dates[0]))).success, true);
      assert.equal((await step(owner, bodyFor(dates[1]))).success, true);
      return { success: true };
    },
  });
  const result = await h.owner.run({ environmentId: 'local', attemptId });
  assert.equal(result.terminalState, 'COMPLETE');
  assert.equal(h.captures.length, 1);
  assert.equal(JSON.stringify(h.captures).includes(attemptToken), false);
  assert.equal(await h.sessions.getOwned(attemptId, 'local'), null);
  const puts = h.requests.filter(item => item.method === 'PUT');
  assert.equal(puts.length, 2);
  assert.equal(JSON.parse(puts[0].body).businessDate, dates[0]);
  assert.equal(JSON.parse(puts[1].body).businessDate, dates[1]);
  assert.ok(puts.every(item => item.headers['x-source-attempt-token'] === attemptToken));
  assert.ok(h.requests.some(item => item.path.endsWith('/complete')));
});

test('legacy v1 receipt bodies remain resumable without inventing additive evidence', async () => {
  let current = control('RUNNING', [], LEGACY_PARSER_VERSION);
  const legacyBody = bodyFor(dates[0]);
  delete legacyBody.normalized.observedMetrics;
  const h = harness({
    request: async (path, init) => {
      if (init?.method === 'PUT') {
        const body = JSON.parse(init.body);
        current = control('RUNNING', [{
          sequence: 0,
          businessDate: body.businessDate,
          observedAt: body.observedAt,
          checksum: checksum(body),
          rowCount: body.normalized.rowCount,
          snapshotId: '00000000-0000-4000-8000-000000000001',
        }], LEGACY_PARSER_VERSION);
      }
      return current;
    },
    collect: async (_input, owner) => {
      assert.equal((await step(owner, legacyBody)).success, true);
      return { success: true };
    },
  });
  const result = await h.owner.run({ environmentId: 'local', attemptId });
  assert.equal(result.terminalState, 'RUNNING');
  assert.equal(h.requests.filter(item => item.method === 'PUT').length, 1);
  assert.equal(JSON.parse(h.requests.find(item => item.method === 'PUT').body)
    .normalized.observedMetrics, undefined);
});

test('an uncertain receipt ACK reconciles only the exact body hash', async () => {
  const altered = bodyFor(dates[0]);
  altered.rawJson.data[0].adSpend = 999;
  const current = control('RUNNING', [{
    sequence: 0,
    businessDate: dates[0],
    observedAt: altered.observedAt,
    checksum: checksum(altered),
    rowCount: 1,
    snapshotId: '00000000-0000-4000-8000-000000000001',
  }]);
  const h = harness({
    request: async (_path, init) => {
      if (init?.method === 'PUT') throw new Error('receipt ACK lost');
      return current;
    },
    collect: async (_input, owner) => {
      const response = await step(owner, bodyFor(dates[0]));
      assert.equal(response.success, false);
      assert.equal(response.errorCode, 'SOURCE_OWNER_UNAVAILABLE');
      return { success: false, errorCode: response.errorCode };
    },
  });
  const result = await h.owner.run({ environmentId: 'local', attemptId });
  assert.equal(result.terminalState, 'RUNNING');
  assert.equal(h.requests.some(item => item.path.endsWith('/complete') || item.path.endsWith('/fail')), false);
  assert.ok(await h.sessions.getOwned(attemptId, 'local'));
});

test('receipt retry keeps the exact serialized body and no guessed terminal follows owner unavailability', async () => {
  let current = control();
  const h = harness({
    request: async (path, init) => {
      if (init?.method === 'PUT') throw new Error('offline');
      return current;
    },
    collect: async (_input, owner) => {
      const response = await step(owner, bodyFor(dates[0]));
      assert.equal(response.errorCode, 'SOURCE_OWNER_UNAVAILABLE');
      return { success: false, errorCode: response.errorCode };
    },
  });
  const result = await h.owner.run({ environmentId: 'local', attemptId });
  assert.equal(result.terminalState, 'RUNNING');
  const puts = h.requests.filter(item => item.method === 'PUT');
  assert.equal(puts.length, 3);
  assert.ok(puts.every(item => item.body === puts[0].body));
  assert.ok(puts.every(item => item.headers['x-source-attempt-token'] === attemptToken));
});

test('a receipt 503 stops the retry fence before a second owner mutation', async () => {
  let h;
  h = harness({
    request: async (_path, init) => {
      if (init?.method === 'PUT') {
        await h.sessions.requestCancellation(attemptId, 'local');
        return { httpStatus: 503, message: 'owner temporarily unavailable' };
      }
      return control();
    },
    collect: async (_input, owner) => {
      const response = await step(owner, bodyFor(dates[0]));
      assert.equal(response.success, false);
      assert.equal(response.errorCode, 'SOURCE_OWNER_UNAVAILABLE');
      return { success: false, errorCode: response.errorCode };
    },
  });

  const result = await h.owner.run({ environmentId: 'local', attemptId });

  assert.equal(result.terminalState, 'RUNNING');
  assert.equal(result.cancellationPending, true);
  assert.equal(h.requests.filter(item => item.method === 'PUT').length, 1);
  assert.equal(h.requests.some(item => item.path.endsWith('/complete') || item.path.endsWith('/fail')), false);
});

test('definitive provider failure is owner terminal and cancellation waits for failure acknowledgement', async () => {
  let current = control();
  const h = harness({
    request: async (path, init) => {
      if (path.endsWith('/fail')) {
        current = control('FAILED');
        return current;
      }
      return current;
    },
    collect: async () => ({ success: false, errorCode: 'ADVERTISER_IDENTITY_MISMATCH', error: 'wrong account' }),
  });
  const result = await h.owner.run({ environmentId: 'local', attemptId });
  assert.equal(result.terminalState, 'FAILED');
  assert.equal(JSON.parse(h.requests.find(item => item.path.endsWith('/fail')).body).code, 'ADVERTISER_IDENTITY_MISMATCH');

  let cancelledCurrent = control();
  const cancelled = harness({
    request: async path => {
      if (path.endsWith('/fail')) {
        cancelledCurrent = control('FAILED');
        return cancelledCurrent;
      }
      return cancelledCurrent;
    },
    collect: async () => ({ success: true }),
  });
  const cancelledResult = await cancelled.owner.cancel({ environmentId: 'local', attemptId });
  assert.equal(cancelledResult.terminalState, 'FAILED');
  assert.equal(cancelled.requests.filter(item => item.path.endsWith('/fail')).length, 1);
});

test('external actions remain attemptId-only', () => {
  const source = fs.readFileSync(new URL('../../kiditem-os/background/coupang/ad-account-daily-kpi-source-owner.js', import.meta.url), 'utf8');
  const context = vm.createContext({});
  vm.runInContext(source, context);
  const owner = context.KidItemAdAccountDailyKpiSourceOwner;
  assert.deepEqual(plain(owner.parseAction({ action: 'collectAdvertisingAccountDailyKpis', attemptId }, 'collectAdvertisingAccountDailyKpis')), { attemptId });
  assert.throws(() => owner.parseAction({ action: 'collectAdvertisingAccountDailyKpis', attemptId, plan: {} }, 'collectAdvertisingAccountDailyKpis'));
});
