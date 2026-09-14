import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const attemptId = '11111111-1111-4111-8111-111111111111';
const attemptToken = '22222222-2222-4222-8222-222222222222';
const channelAccountId = '33333333-3333-4333-8333-333333333333';
const sender = {
  tab: { id: 41, url: 'https://wing.coupang.com/tenants/business-insight/sales-analysis?start_date=2026-09-05&end_date=2026-09-06' },
  url: 'https://wing.coupang.com/tenants/business-insight/sales-analysis?start_date=2026-09-05&end_date=2026-09-06',
  frameId: 0,
};

const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
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

const trafficPlan = {
  sourceType: 'coupang_wing_traffic',
  parserVersion: 'wing-traffic-v1',
  channelAccountId,
  expectedAdvertiserId: 'A0001',
  startDate: '2026-09-05',
  endDate: '2026-09-06',
  businessDate: '2026-09-05',
  periodDays: 2,
  targetUrl: null,
};

const itemwinnerPlan = {
  sourceType: 'coupang_wing_itemwinner',
  parserVersion: 'wing-itemwinner-v1',
  channelAccountId,
  expectedVendorId: 'A0001',
  businessDate: '2026-09-06',
  pageType: 'itemwinner',
  targetUrl: 'https://wing.coupang.com/tenants/seller-web/seller-price-management',
};

function trafficControl(state = 'RUNNING', receipts = []) {
  return {
    attemptId,
    channelAccountId,
    state,
    plan: trafficPlan,
    expiresAt: '2030-01-02T00:00:00.000Z',
    actualCutoffAt: state === 'COMPLETE' ? '2026-09-06T01:00:00.000Z' : null,
    manifestChecksum: checksum({ plan: trafficPlan, receipts }),
    rowCount: receipts.reduce((sum, receipt) => sum + receipt.rowCount, 0),
    matchedRowCount: receipts.reduce((sum, receipt) => sum + receipt.matchedCount, 0),
    unmatchedRowCount: receipts.reduce((sum, receipt) => sum + receipt.unmatchedCount, 0),
    receiptCount: receipts.length,
    expectedPages: receipts[0]?.expectedPages ?? null,
    terminalPageObserved: receipts.at(-1)?.terminalPageObserved ?? false,
    errorCode: state === 'FAILED' ? 'INCOMPLETE_TRAFFIC_COVERAGE' : null,
    errorMessage: state === 'FAILED' ? 'incomplete' : null,
    attemptToken,
    receipts,
  };
}

function itemwinnerControl(state = 'RUNNING', contentChecksum = null) {
  return {
    attemptId,
    channelAccountId,
    generation: '1',
    state,
    plan: itemwinnerPlan,
    expiresAt: '2030-01-02T00:00:00.000Z',
    actualCutoffAt: state === 'COMPLETE' ? '2026-09-06T01:00:00.000Z' : null,
    observedAt: state === 'COMPLETE' ? '2026-09-06T01:00:00.000Z' : null,
    contentChecksum,
    itemCount: state === 'COMPLETE' ? 1 : 0,
    errorCode: state === 'FAILED' ? 'USER_CANCELLED' : null,
    errorMessage: state === 'FAILED' ? 'cancelled' : null,
    attemptToken,
  };
}

function harness({ kind, request, collect }) {
  const requests = [];
  const closed = [];
  const storage = {};
  const chrome = {
    storage: {
      local: {
        async get(key, callback) {
          const result = { [key]: clone(storage[key]) };
          callback?.(result);
          return result;
        },
        async set(value, callback) {
          Object.assign(storage, clone(value));
          callback?.();
        },
      },
    },
  };
  const context = vm.createContext({ chrome, console, crypto, TextEncoder, URL, setTimeout, clearTimeout, Date });
  for (const file of [
    '../../shared/collection-session.js',
    '../../kiditem-os/background/sourcing/source-attempt-wire.js',
    `../../kiditem-os/background/coupang/${kind === 'traffic' ? 'wing-traffic-source-owner' : 'wing-itemwinner-source-owner'}.js`,
  ]) vm.runInContext(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), context);
  const sessions = context.KidItemCollectionSession.create({ chrome, storageKey: 'sessions', webUrlPatterns: [] });
  const Owner = kind === 'traffic'
    ? context.KidItemWingTrafficSourceOwner
    : context.KidItemWingItemwinnerSourceOwner;
  const producer = kind === 'traffic' ? 'dashboard.wing_sales' : 'dashboard.wing_kpi';
  const owner = Owner.create({
    chrome,
    sessions,
    request: async (environmentId, path, init) => {
      requests.push({ environmentId, path, ...init });
      const response = await request(path, init);
      return { ok: !response?.httpStatus, status: response?.httpStatus || 200, json: async () => clone(response) };
    },
    collect: async input => {
      await sessions.attachTab(input.attemptId, { tabId: 41, windowId: 7 });
      return collect(input, owner);
    },
    environmentForTab: async tabId => tabId === 41 ? 'local' : 'office',
    ownedTab: async () => 41,
    closeAttempt: async (environmentId, id) => closed.push({ environmentId, id }),
  });
  return { owner, sessions, requests, closed, producer };
}

function ownerStep(owner, action, body, step = 'receipt') {
  return new Promise(resolve => owner.handleMessage({ action, attemptId, step, ...(body ? { body } : {}) }, sender, resolve));
}

function trafficBody(pageIndex, expectedPages = 2) {
  const data = [{ vendorItemId: `V${pageIndex}`, productId: `P${pageIndex}`, visitors: pageIndex }];
  return {
    key: `${attemptId}:page:${pageIndex}`,
    capturedAt: '2026-09-06T01:00:00.000Z',
    url: sender.url,
    startDate: trafficPlan.startDate,
    endDate: trafficPlan.endDate,
    period: trafficPlan.periodDays,
    pageIndex,
    proof: {
      expectedPages,
      visitedPages: Array.from({ length: pageIndex }, (_, index) => index + 1),
      terminalPageObserved: pageIndex === expectedPages,
      verified: true,
      complete: pageIndex === expectedPages,
    },
    data,
    kpis: { visitor: { numValue: 1 } },
    summary: { visitors: 1 },
    adSummary: null,
  };
}

test('Wing traffic owner stages exact page receipts and finalizes only complete coverage', async () => {
  let current = trafficControl();
  const attemptPath = `/api/ads/traffic/attempts/${attemptId}`;
  const receiptPath = sequence => `${attemptPath}/receipts/${sequence}`;
  const completePath = `${attemptPath}/complete`;
  const h = harness({
    kind: 'traffic',
    request: async (path, init) => {
      if (init?.method === 'PUT') {
        const body = JSON.parse(init.body);
        const page = body.pageIndex;
        const expectedBody = trafficBody(page, body.proof.expectedPages);
        assert.equal(path, receiptPath(page - 1));
        assert.equal(init.headers['x-source-attempt-token'], attemptToken);
        assert.deepEqual(body, expectedBody);
        assert.equal(init.body, JSON.stringify(expectedBody));
        const receipt = {
          sequence: page - 1,
          key: body.key,
          checksum: checksum(body),
          pageIndex: page,
          expectedPages: body.proof.expectedPages,
          rowCount: body.data.length,
          matchedCount: body.data.length,
          unmatchedCount: 0,
          snapshotIds: [`00000000-0000-4000-8000-00000000000${page}`],
          url: body.url,
          startDate: body.startDate,
          endDate: body.endDate,
          terminalPageObserved: body.proof.terminalPageObserved,
        };
        current = trafficControl('RUNNING', [...current.receipts, receipt]);
        return receipt;
      }
      if (init?.method === 'POST' && path === completePath) {
        assert.equal(init.headers['x-source-attempt-token'], attemptToken);
        assert.deepEqual(JSON.parse(init.body), { manifestChecksum: current.manifestChecksum });
        current = trafficControl('COMPLETE', current.receipts);
        return { ready: true };
      }
      if (init?.method === 'POST' && path.endsWith('/complete')) {
        throw new Error(`unexpected Wing traffic terminal path: ${path}`);
      }
      return current;
    },
    collect: async (_input, owner) => {
      assert.equal((await ownerStep(owner, 'wingTrafficSourceStep', trafficBody(1))).success, true);
      assert.equal((await ownerStep(owner, 'wingTrafficSourceStep', trafficBody(2))).success, true);
      return { success: true };
    },
  });
  const result = await h.owner.run({ environmentId: 'local', attemptId });
  assert.equal(result.terminalState, 'COMPLETE');
  assert.deepEqual(
    h.requests.filter(item => item.method === 'PUT').map(item => item.path),
    [receiptPath(0), receiptPath(1)],
  );
  assert.deepEqual(
    h.requests.filter(item => item.method === 'POST').map(item => item.path),
    [completePath],
  );
  assert.equal(await h.sessions.getOwned(attemptId, 'local'), null);
});

test('Wing traffic owner runs the next attempt after a run settles without its terminal acknowledgement', async () => {
  const secondAttemptId = '44444444-4444-4444-8444-444444444444';
  const attempts = new Map([
    [attemptId, trafficControl()],
    [secondAttemptId, { ...trafficControl(), attemptId: secondAttemptId }],
  ]);
  const collected = [];
  const h = harness({
    kind: 'traffic',
    request: async (path, init) => {
      const [, id, action] = /\/attempts\/([^/]+)\/(control|fail)$/.exec(path) || [];
      const attempt = attempts.get(decodeURIComponent(id || ''));
      if (!attempt) return { httpStatus: 404, message: 'not found' };
      if (action === 'fail' && init?.method === 'POST') {
        // The owner expired the attempt before the failure report landed, so
        // the acknowledgement does not match the requested body.
        Object.assign(attempt, { state: 'FAILED', errorCode: 'ATTEMPT_EXPIRED', errorMessage: 'attempt expired' });
      }
      return attempt;
    },
    collect: async (input) => {
      collected.push(input.attemptId);
      return { success: false, error: 'Wing 매출분석 표를 읽지 못했습니다.' };
    },
  });

  const first = await h.owner.run({ environmentId: 'local', attemptId });
  assert.equal(first.errorCode, 'SOURCE_OWNER_UNAVAILABLE');

  let second;
  assert.doesNotThrow(() => {
    second = h.owner.run({ environmentId: 'local', attemptId: secondAttemptId });
  }, 'a settled run must not keep refusing every later attempt');
  assert.equal((await second).attemptId, secondAttemptId);
  assert.deepEqual(collected, [attemptId, secondAttemptId]);
});

test('Wing traffic owner never reconciles a receipt with a different body', async () => {
  const expectedBody = trafficBody(1);
  const altered = trafficBody(1);
  altered.data[0].visitors = 999;
  const receipt = {
    sequence: 0,
    key: altered.key,
    checksum: checksum(altered),
    pageIndex: 1,
    expectedPages: 2,
    rowCount: 1,
    matchedCount: 1,
    unmatchedCount: 0,
    snapshotIds: ['00000000-0000-4000-8000-000000000001'],
    url: altered.url,
    startDate: altered.startDate,
    endDate: altered.endDate,
    terminalPageObserved: false,
  };
  const current = trafficControl('RUNNING', [receipt]);
  const h = harness({
    kind: 'traffic',
    request: async (path, init) => {
      if (init?.method === 'PUT') throw new Error('receipt must not be retried');
      return current;
    },
    collect: async (_input, owner) => {
      const result = await ownerStep(owner, 'wingTrafficSourceStep', expectedBody);
      assert.equal(result.success, false);
      assert.equal(result.errorCode, 'SOURCE_OWNER_UNAVAILABLE');
      return { success: false, errorCode: result.errorCode };
    },
  });
  const result = await h.owner.run({ environmentId: 'local', attemptId });
  assert.equal(result.terminalState, 'RUNNING');
  assert.equal(h.requests.some(item => item.method === 'PUT' || item.method === 'POST'), false);
  assert.equal(await h.sessions.getOwned(attemptId, 'local') !== null, true);
});

test('Wing traffic receipt retry uses the controller route and exact fenced body', async () => {
  let current = trafficControl();
  const body = trafficBody(1);
  const receiptPath = `/api/ads/traffic/attempts/${attemptId}/receipts/0`;
  let attempts = 0;
  const h = harness({
    kind: 'traffic',
    request: async (path, init) => {
      if (init?.method === 'PUT') {
        attempts += 1;
        assert.equal(path, receiptPath);
        assert.equal(init.headers['x-source-attempt-token'], attemptToken);
        assert.equal(init.body, JSON.stringify(body));
        if (attempts < 3) throw new Error('receipt ACK lost');
        const receipt = {
          sequence: 0,
          key: body.key,
          checksum: checksum(body),
          pageIndex: 1,
          expectedPages: 2,
          rowCount: body.data.length,
          matchedCount: body.data.length,
          unmatchedCount: 0,
          snapshotIds: ['00000000-0000-4000-8000-000000000002'],
          url: body.url,
          startDate: body.startDate,
          endDate: body.endDate,
          terminalPageObserved: false,
        };
        current = trafficControl('RUNNING', [receipt]);
        return receipt;
      }
      return current;
    },
    collect: async (_input, owner) => {
      const result = await ownerStep(owner, 'wingTrafficSourceStep', body);
      assert.equal(result.success, true);
      return { success: false, errorCode: 'SOURCE_OWNER_UNAVAILABLE' };
    },
  });
  const result = await h.owner.run({ environmentId: 'local', attemptId });
  assert.equal(result.terminalState, 'RUNNING');
  assert.equal(attempts, 3);
  assert.deepEqual(
    h.requests.filter(item => item.method === 'PUT').map(item => item.path),
    [receiptPath, receiptPath, receiptPath],
  );
  assert.equal(h.requests.some(item => item.method === 'POST'), false);
  assert.equal(await h.sessions.getOwned(attemptId, 'local') !== null, true);
});

test('Wing traffic incomplete pagination is failed by the owner', async () => {
  let current = trafficControl();
  const failPath = `/api/ads/traffic/attempts/${attemptId}/fail`;
  const failure = { code: 'INCOMPLETE_TRAFFIC_COVERAGE', message: 'page navigation stopped' };
  const h = harness({
    kind: 'traffic',
    request: async (path, init) => {
      if (init?.method === 'POST' && path === failPath) {
        assert.equal(init.headers['x-source-attempt-token'], attemptToken);
        assert.deepEqual(JSON.parse(init.body), failure);
        current = {
          ...trafficControl('FAILED'),
          errorCode: failure.code,
          errorMessage: failure.message,
        };
        return current;
      }
      if (init?.method === 'POST' && path.endsWith('/fail')) {
        throw new Error(`unexpected Wing traffic terminal path: ${path}`);
      }
      return current;
    },
    collect: async () => ({ success: false, errorCode: failure.code, error: failure.message }),
  });
  const result = await h.owner.run({ environmentId: 'local', attemptId });
  assert.equal(result.terminalState, 'FAILED');
  assert.deepEqual(
    h.requests.filter(item => item.method === 'POST').map(item => item.path),
    [failPath],
  );
});

test('Wing itemwinner owner submits one current-page capture and reconciles exact completion', async () => {
  let current = itemwinnerControl();
  const completePath = `/api/ads/wing-itemwinner/attempts/${attemptId}/complete`;
  const capture = {
    providerVendorId: 'A0001',
    observedAt: '2026-09-06T01:00:00.000Z',
    data: [{ vendorItemId: 'V1', productName: 'One', isWinner: true, myPrice: 100, winnerPrice: 100, salesQty: 1 }],
    kpis: { total: '1' },
    url: 'https://wing.coupang.com/tenants/seller-web/seller-price-management',
    title: 'Item Winner',
    timestamp: '2026-09-06T01:00:00.000Z',
  };
  const h = harness({
    kind: 'itemwinner',
    request: async (path, init) => {
      if (init?.method === 'POST' && path === completePath) {
        assert.equal(init.headers['x-source-attempt-token'], attemptToken);
        current = itemwinnerControl('COMPLETE', checksum(JSON.parse(init.body)));
        return current;
      }
      if (init?.method === 'POST' && path.endsWith('/complete')) {
        throw new Error(`unexpected itemwinner terminal path: ${path}`);
      }
      return current;
    },
    collect: async (_input, owner) => {
      const wrongUrl = { ...capture, url: `${capture.url}?page=2` };
      const rejected = await ownerStep(owner, 'wingItemwinnerSourceStep', wrongUrl, 'capture');
      assert.equal(rejected.success, false);
      assert.equal(rejected.errorCode, 'SOURCE_RECEIPT_REJECTED');
      const result = await ownerStep(owner, 'wingItemwinnerSourceStep', capture, 'capture');
      assert.equal(result.success, true);
      return { success: true };
    },
  });
  const result = await h.owner.run({ environmentId: 'local', attemptId });
  assert.equal(result.terminalState, 'COMPLETE');
  assert.deepEqual(
    h.requests.filter(item => item.method === 'POST').map(item => item.path),
    [completePath],
  );
  assert.equal(await h.sessions.getOwned(attemptId, 'local'), null);
});

test('Wing itemwinner owner posts failure to the controller route with the exact fenced body', async () => {
  let current = itemwinnerControl();
  const failPath = `/api/ads/wing-itemwinner/attempts/${attemptId}/fail`;
  const failure = { code: 'WING_ITEMWINNER_CAPTURE_FAILED', message: 'capture failed' };
  const h = harness({
    kind: 'itemwinner',
    request: async (path, init) => {
      if (init?.method === 'POST' && path === failPath) {
        assert.equal(init.headers['x-source-attempt-token'], attemptToken);
        assert.deepEqual(JSON.parse(init.body), failure);
        current = {
          ...itemwinnerControl('FAILED'),
          errorCode: failure.code,
          errorMessage: failure.message,
        };
        return current;
      }
      if (init?.method === 'POST' && path.endsWith('/fail')) {
        throw new Error(`unexpected itemwinner terminal path: ${path}`);
      }
      return current;
    },
    collect: async () => ({ success: false, errorCode: failure.code, error: failure.message }),
  });
  const result = await h.owner.run({ environmentId: 'local', attemptId });
  assert.equal(result.success, false);
  assert.equal(result.terminalState, 'FAILED');
  assert.deepEqual(
    h.requests.filter(item => item.method === 'POST').map(item => item.path),
    [failPath],
  );
  assert.equal(await h.sessions.getOwned(attemptId, 'local'), null);
});

test('Wing itemwinner uncertain completion with another body stays unresolved', async () => {
  const capture = {
    providerVendorId: 'A0001',
    observedAt: '2026-09-06T01:00:00.000Z',
    data: [{ vendorItemId: 'V1' }],
    kpis: {},
    url: 'https://wing.coupang.com/tenants/seller-web/seller-price-management',
  };
  let firstRead = true;
  const completePath = `/api/ads/wing-itemwinner/attempts/${attemptId}/complete`;
  const h = harness({
    kind: 'itemwinner',
    request: async (path, init) => {
      if (init?.method === 'POST' && path === completePath) throw new Error('completion ACK lost');
      if (init?.method === 'POST' && path.endsWith('/complete')) {
        throw new Error(`unexpected itemwinner terminal path: ${path}`);
      }
      if (firstRead) {
        firstRead = false;
        return itemwinnerControl('RUNNING');
      }
      return itemwinnerControl('COMPLETE', checksum({ ...capture, data: [{ vendorItemId: 'OTHER' }] }));
    },
    collect: async (_input, owner) => {
      const result = await ownerStep(owner, 'wingItemwinnerSourceStep', capture, 'capture');
      assert.equal(result.success, false);
      assert.equal(result.errorCode, 'SOURCE_OWNER_UNAVAILABLE');
      return { success: false, errorCode: result.errorCode };
    },
  });
  const result = await h.owner.run({ environmentId: 'local', attemptId });
  assert.equal(result.terminalState, 'COMPLETE');
  assert.equal(result.success, false);
  assert.ok(h.requests.filter(item => item.method === 'POST').every(item => item.path === completePath));
  assert.ok(h.requests.filter(item => item.method === 'POST').every(
    item => item.headers['x-source-attempt-token'] === attemptToken && item.body === JSON.stringify(capture),
  ));
  assert.equal(await h.sessions.getOwned(attemptId, 'local') !== null, true);
});
