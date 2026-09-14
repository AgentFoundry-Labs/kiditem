import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const attemptId = '11111111-1111-4111-8111-111111111111';
const attemptToken = '22222222-2222-4222-8222-222222222222';
const channelAccountId = '33333333-3333-4333-8333-333333333333';
const control = () => ({ attemptId, attemptToken, channelAccountId, state: 'RUNNING',
  expiresAt: '2030-01-02T00:00:00.000Z', manifestChecksum: 'a'.repeat(64),
  plan: { sourceType: 'coupang_ad_campaign', parserVersion: 'ad-campaign-v1', channelAccountId,
    expectedAdvertiserId: 'A0001', captureMode: 'campaign_sweep', startDate: '2026-08-06', endDate: '2026-09-05', businessDates: Array.from({length:31}, (_,i) => new Date(Date.parse('2026-09-05') - i * 86400000).toISOString().slice(0,10)) },
  pages: [], campaigns: [], receipts: [],
  rowCount: 0, errorCode: null, errorMessage: null });
const sender = { tab: { id: 41, url: 'https://advertising.coupang.com/marketing/dashboard/sales' },
  url: 'https://advertising.coupang.com/marketing/dashboard/sales', frameId: 0 };
const plain = value => JSON.parse(JSON.stringify(value));
const canonicalize = value => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  return Object.fromEntries(Object.entries(value)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, nested]) => [key, canonicalize(nested)]));
};
const stableStringify = value => JSON.stringify(canonicalize(JSON.parse(JSON.stringify(value))));
const checksum = value => createHash('sha256').update(stableStringify(value)).digest('hex');

function harness({ collect = async () => ({ success: true, receipt: { complete: false } }),
  request = async () => control(), storage = {}, clock = Date } = {}) {
  const requests = [], captures = [], closed = [];
  const chrome = { storage: { local: {
    async get(key, cb) { const result = { [key]: structuredClone(storage[key]) }; cb?.(result); return result; },
    async set(value, cb) { Object.assign(storage, structuredClone(value)); cb?.(); },
  } }, tabs: { async query() { return []; }, async remove() {} } };
  const context = vm.createContext({ chrome, console, crypto, TextEncoder, URL, setTimeout, clearTimeout, Date: clock });
  for (const file of ['../../shared/collection-session.js',
    '../../kiditem-os/background/sourcing/source-attempt-wire.js',
    '../../kiditem-os/background/coupang/ad-campaign-source-owner.js']) {
    vm.runInContext(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), context);
  }
  const sessions = context.KidItemCollectionSession.create({ chrome, storageKey: 'sessions', webUrlPatterns: [] });
  let owner;
  owner = context.KidItemAdCampaignSourceOwner.create({ chrome, sessions,
    request: async (env, path, init) => {
      requests.push({ env, path, ...init });
      const body = await request(path, init);
      return { ok: !body.httpStatus, status: body.httpStatus || 200, json: async () => structuredClone(body) };
    },
    collect: async input => { captures.push(input); await sessions.attachTab(attemptId, { tabId: 41, windowId: 7 }); return collect(input, owner); },
    environmentForTab: async tabId => tabId === 41 ? 'local' : 'office',
    ownedTab: async () => 41,
    closeAttempt: async (env, id) => closed.push({ env, id }),
  });
  return { owner, sessions, requests, captures, closed, storage };
}

const step = (owner, kind, body, from = sender) => new Promise(resolve => owner.handleMessage({
  action: 'advertisingCampaignSourceStep', attemptId, step: kind, ...(body ? { body } : {}),
}, from, resolve));
const page = { kind: 'dashboard_page', key: 'dashboard:1', advertiserId: 'A0001',
  capturedAt: '2026-09-06T00:00:00Z', pageIndex: 1, totalPages: 0, verified: false, explicitEmpty: true, campaigns: [] };

test('receipt and COMPLETE ACK loss reconcile from exact owner; no session closes before acknowledgement', async () => {
  const value = control();
  const h = harness({ request(path, init) {
    if (init?.method === 'PUT') {
      const body = JSON.parse(init.body);
      value.receipts = [{ sequence: 0, key: page.key, kind: page.kind, checksum: checksum(body) }];
      value.pages = [page];
      throw new Error('receipt ACK lost');
    }
    if (path.endsWith('/complete')) {
      assert.deepEqual(h.closed, []);
      value.state = 'COMPLETE'; throw new Error('complete ACK lost');
    }
    return value;
  }, collect: async (_input, owner) => {
    const before = h.requests.length;
    for (let i = 0; i < 62; i++) assert.deepEqual(plain(await step(owner, 'checkpoint')), { success: true });
    assert.equal(h.requests.length, before);
    assert.equal((await step(owner, 'receipt', page)).success, true);
    assert.ok(await h.sessions.getOwned(attemptId, 'local'));
    return { success: true, receipt: { complete: true } };
  } });
  assert.equal((await h.owner.run({ environmentId: 'local', attemptId })).terminalState, 'COMPLETE');
  const writes = h.requests.filter(r => r.method === 'PUT');
  assert.equal(writes.length, 3);
  assert.ok(writes.every(r => r.body === writes[0].body && r.headers['x-source-attempt-token'] === attemptToken));
  assert.equal(h.requests.some(r => r.path.endsWith('/fail')), false);
  assert.equal(await h.sessions.getOwned(attemptId, 'local'), null);
  assert.equal(JSON.stringify(h.captures).includes(attemptToken), false);
  assert.equal(JSON.stringify(h.storage).includes(attemptToken), false);
});

test('a receipt with the same key but a different body never advances after an uncertain ACK', async () => {
  const value = control();
  const h = harness({ request(path, init) {
    if (init?.method === 'PUT') {
      value.receipts = [{ sequence: 0, key: page.key, kind: page.kind, checksum: checksum(page) }];
      value.pages = [page];
      throw new Error('receipt ACK lost');
    }
    return value;
  }, collect: async (_input, owner) => {
    const altered = { ...page, campaigns: [{ key: 'different', name: 'other', campaignId: null,
      identity: null, href: null, hasDetailHref: false, onOff: null, status: null, rowIndex: 0 }] };
    const response = await step(owner, 'receipt', altered);
    assert.equal(response.success, false);
    assert.equal(response.errorCode, 'SOURCE_OWNER_UNAVAILABLE');
    return { success: false, errorCode: response.errorCode };
  } });
  assert.equal((await h.owner.run({ environmentId: 'local', attemptId })).terminalState, 'RUNNING');
  assert.equal(h.requests.some(r => r.path.endsWith('/fail') || r.path.endsWith('/complete')), false);
  assert.ok(await h.sessions.getOwned(attemptId, 'local'));
});

test('unavailable receipt remains RUNNING without a contradictory failure or invented receipt', async () => {
  const h = harness({ request(path, init) { if (init?.method === 'PUT') throw new Error('offline'); return control(); },
    collect: async (_input, owner) => {
      const response = await step(owner, 'receipt', page);
      assert.equal(response.errorCode, 'SOURCE_OWNER_UNAVAILABLE');
      return { success: false, errorCode: response.errorCode };
    } });
  assert.equal((await h.owner.run({ environmentId: 'local', attemptId })).terminalState, 'RUNNING');
  assert.equal(h.requests.some(r => r.path.endsWith('/fail') || r.path.endsWith('/complete')), false);
  assert.ok(await h.sessions.getOwned(attemptId, 'local'));
  const captured = h.captures.length;
  await h.owner.recover('local');
  assert.equal(h.captures.length, captured, 'worker recovery is read-only');
});

test('cancellation fences late content and waits for owner ACK before local cleanup', async () => {
  const started = Promise.withResolvers(), collected = Promise.withResolvers(), acknowledged = Promise.withResolvers();
  let state = 'RUNNING';
  const h = harness({ request: async path => {
    if (path.endsWith('/fail')) { await acknowledged.promise; state = 'FAILED'; }
    return { ...control(), state, errorCode: state === 'FAILED' ? 'USER_CANCELLED' : null };
  }, collect: async () => { started.resolve(); await collected.promise; return { success: true, receipt: { complete: true } }; } });
  const running = h.owner.run({ environmentId: 'local', attemptId });
  await started.promise;
  const cancel = h.owner.cancel({ environmentId: 'local', attemptId });
  assert.equal((await step(h.owner, 'checkpoint')).success, false);
  assert.deepEqual(h.closed, []);
  assert.ok(await h.sessions.getOwned(attemptId, 'local'));
  collected.resolve(); acknowledged.resolve();
  assert.equal((await cancel).terminalState, 'FAILED');
  assert.equal((await running).terminalState, 'FAILED');
  assert.equal(h.requests.filter(r => r.path.endsWith('/fail')).length, 1);
  assert.equal(h.requests.some(r => r.path.endsWith('/complete')), false);
});

test('local checkpoint validates owned tab, actual identity, fixed expiry and never reads full control', async () => {
  let now = Date.parse('2029-01-01');
  class Clock extends Date { static now() { return now; } }
  const h = harness({ clock: Clock, collect: async (_input, owner) => {
    const before = h.requests.length;
    assert.equal((await step(owner, 'checkpoint', null, { ...sender, frameId: 1 })).success, false);
    assert.equal((await step(owner, 'checkpoint', null, { ...sender, tab: { ...sender.tab, id: 42 } })).success, false);
    assert.equal((await step(owner, 'receipt', { ...page, advertiserId: 'OTHER' })).success, false);
    assert.deepEqual(plain(await step(owner, 'checkpoint')), { success: true });
    now = Date.parse('2030-01-02');
    assert.equal((await step(owner, 'checkpoint')).success, false);
    assert.equal(h.requests.length, before);
    return { success: false, errorCode: 'SOURCE_OWNER_UNAVAILABLE' };
  } });
  await h.owner.run({ environmentId: 'local', attemptId });
});

test('a failed sweep reports the collector reason and code in the owner failure', async () => {
  const dashboardReason = '쿠팡 광고센터 대시보드를 불러오지 못했습니다. 로그인 상태를 확인한 뒤 다시 시도해 주세요.';
  const campaignReason = '쿠팡 광고 캠페인 2개를 불러오지 못했습니다: A, B.';
  for (const [collected, body] of [
    [{ success: false, error: campaignReason }, { code: 'AD_CAMPAIGN_COLLECTION_FAILED', message: campaignReason }],
    [{ success: false, errorCode: 'AD_DASHBOARD_NOT_LOADED', error: dashboardReason }, { code: 'AD_DASHBOARD_NOT_LOADED', message: dashboardReason }],
  ]) {
    const value = control();
    const h = harness({
      request(path, init) {
        if (path.endsWith('/fail')) {
          const failure = JSON.parse(init.body);
          Object.assign(value, { state: 'FAILED', errorCode: failure.code, errorMessage: failure.message });
        }
        return value;
      },
      collect: async () => collected,
    });
    const outcome = await h.owner.run({ environmentId: 'local', attemptId });
    assert.deepEqual(JSON.parse(h.requests.find(r => r.path.endsWith('/fail')).body), body);
    assert.equal(outcome.terminalState, 'FAILED');
    assert.equal(outcome.error, body.message);
  }
});
