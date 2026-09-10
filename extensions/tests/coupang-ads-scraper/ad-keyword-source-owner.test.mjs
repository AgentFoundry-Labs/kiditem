import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const attemptId = '11111111-1111-4111-8111-111111111111';
const attemptToken = '22222222-2222-4222-8222-222222222222';
const channelAccountId = '33333333-3333-4333-8333-333333333333';
const control = () => ({ attemptId, attemptToken, channelAccountId, state: 'RUNNING',
  expiresAt: '2030-01-02T00:00:00.000Z', manifestChecksum: 'a'.repeat(64),
  plan: { sourceType: 'coupang_ad_keyword', parserVersion: 'ad-keyword-v1', channelAccountId,
    expectedAdvertiserId: 'A0001', startDate: '2026-08-30', endDate: '2026-09-05', windowDays: 7 },
  roster: { campaigns: [], pages: [] }, queue: [{ sequence: 0, key: '1:2', campaignId: '1', adGroupId: '2', plan: { ads: [] }, resultComplete: false }], receipts: [], groupCount: 2, completedGroupCount: 1,
  rowCount: 0, errorCode: null, errorMessage: null });
const sender = { tab: { id: 41, url: 'https://advertising.coupang.com/marketing/dashboard/sales' },
  url: 'https://advertising.coupang.com/marketing/dashboard/sales', frameId: 0 };
const plain = value => JSON.parse(JSON.stringify(value));

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
    '../../kiditem-os/background/coupang/ad-keyword-source-owner.js']) {
    vm.runInContext(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), context);
  }
  const sessions = context.KidItemCollectionSession.create({ chrome, storageKey: 'sessions', webUrlPatterns: [] });
  let owner;
  owner = context.KidItemAdKeywordSourceOwner.create({ chrome, sessions,
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

test('budget pause remains owner RUNNING and only another explicit action continues with refreshed control', async () => {
  const h = harness();
  const result = await h.owner.run({ environmentId: 'local', attemptId });
  assert.equal(h.captures.length, 1);
  assert.deepEqual(plain(result), { success: false, attemptId, terminalState: 'RUNNING', continuationRequired: true });
  assert.ok(await h.sessions.getOwned(attemptId, 'local'));
  assert.equal(JSON.stringify(h.captures).includes(attemptToken), false);
  assert.equal(JSON.stringify(h.storage).includes(attemptToken), false);
  assert.equal(h.requests.some(item => item.method && item.method !== 'GET'), false);
  await h.owner.recover('local');
  assert.equal(h.captures.length, 1, 'restart must not resume provider IO');
  await h.owner.run({ environmentId: 'local', attemptId });
  assert.equal(h.captures.length, 2);
});

test('owned content receipts retry identical payloads and a lost complete ACK is resolved from the exact owner', async () => {
  let ownerState = 'RUNNING', receipt = false, puts = 0;
  const h = harness({ request(path, init) {
    if (init?.method === 'PUT') {
      receipt = true;
      if (++puts < 3) throw new Error('receipt ACK lost');
    }
    if (path.endsWith('/complete')) { ownerState = 'COMPLETE'; throw new Error('terminal ACK lost'); }
    return { ...control(), state: ownerState, completedGroupCount: receipt ? 2 : 1 };
  }, collect: async (_input, owner) => {
    const response = await new Promise(resolve => owner.handleMessage({ action: 'advertisingKeywordSourceStep', attemptId,
      step: 'group_result', sequence: 0, body: { advertiserId: 'A0001', capturedAt: '2026-09-06T01:00:00.000Z', ads: [], rows: [] } }, sender, resolve));
    assert.equal(response.success, true, response.error);
    assert.equal(JSON.stringify(response).includes(attemptToken), false);
    return { success: true, receipt: { complete: true } };
  } });
  const result = await h.owner.run({ environmentId: 'local', attemptId });
  assert.equal(result.terminalState, 'COMPLETE');
  assert.equal(await h.sessions.getOwned(attemptId, 'local'), null);
  const writes = h.requests.filter(item => item.method === 'PUT');
  assert.equal(writes.length, 3);
  assert.ok(writes.every(item => item.headers['x-source-attempt-token'] === attemptToken && item.body === writes[0].body));
  assert.ok(writes.every(item => item.path.endsWith(`/attempts/${attemptId}/groups/0/result`)));
  const completes = h.requests.filter(item => item.path.endsWith('/complete'));
  assert.equal(completes.length, 3);
  assert.ok(completes.every(item => item.body === JSON.stringify({ manifestChecksum: 'a'.repeat(64) })));
  assert.equal(h.requests.some(item => item.path.endsWith('/fail')), false);
});

test('cancellation fences late content and keeps the session until the owner failure acknowledgement', async () => {
  const capture = Promise.withResolvers(), failure = Promise.withResolvers(), started = Promise.withResolvers();
  let state = 'RUNNING';
  const h = harness({ request: async (path) => {
    if (path.endsWith('/fail')) { await failure.promise; state = 'FAILED'; }
    return { ...control(), state, errorCode: state === 'FAILED' ? 'USER_CANCELLED' : null };
  }, collect: async () => { started.resolve(); await capture.promise; return { success: true, receipt: { complete: true } }; } });
  const running = h.owner.run({ environmentId: 'local', attemptId });
  await started.promise;
  const cancel = h.owner.cancel({ environmentId: 'local', attemptId });
  await new Promise(setImmediate);
  const late = await new Promise(resolve => h.owner.handleMessage({ action: 'advertisingKeywordSourceStep', attemptId, step: 'checkpoint' }, sender, resolve));
  assert.equal(late.success, false);
  assert.ok(await h.sessions.getOwned(attemptId, 'local'));
  assert.deepEqual(h.closed, []);
  capture.resolve();
  failure.resolve();
  assert.equal((await cancel).terminalState, 'FAILED');
  assert.equal((await running).terminalState, 'FAILED');
  assert.equal(await h.sessions.getOwned(attemptId, 'local'), null);
  assert.equal(h.requests.filter(item => item.path.endsWith('/fail')).length, 1);
  assert.equal(h.requests.some(item => item.path.endsWith('/complete')), false);
});

test('provider failure is terminal but uncertain transport never submits a contradictory failure', async () => {
  let state = 'RUNNING';
  const h = harness({ collect: async () => ({ success: false, errorCode: 'ADVERTISER_IDENTITY_MISMATCH', error: '계정 불일치' }),
    request(path) { if (path.endsWith('/fail')) state = 'FAILED'; return { ...control(), state }; } });
  assert.equal((await h.owner.run({ environmentId: 'local', attemptId })).terminalState, 'FAILED');
  assert.equal(JSON.parse(h.requests.find(item => item.path.endsWith('/fail')).body).code, 'ADVERTISER_IDENTITY_MISMATCH');
  const uncertain = harness({ collect: async () => ({ success: false, errorCode: 'SOURCE_OWNER_UNAVAILABLE', error: '연결 끊김' }) });
  assert.equal((await uncertain.owner.run({ environmentId: 'local', attemptId })).terminalState, 'RUNNING');
  assert.equal(uncertain.requests.some(item => item.path.endsWith('/fail')), false);
  assert.ok(await uncertain.sessions.getOwned(attemptId, 'local'));
});

test('content cannot route another tab, environment, origin, attempt or arbitrary write fields', async () => {
  const h = harness({ collect: async (_input, owner) => {
    const base = { action: 'advertisingKeywordSourceStep', attemptId, step: 'checkpoint' };
    for (const [message, from] of [
      [base, { ...sender, tab: { ...sender.tab, id: 42 } }],
      [base, { ...sender, url: 'https://wing.coupang.com/' }],
      [base, { ...sender, frameId: 1 }],
      [{ ...base, attemptId: channelAccountId }, sender],
      [{ ...base, environmentId: 'office' }, sender],
      [{ ...base, step: 'group_result', sequence: 0, body: { advertiserId: 'OTHER', ads: [], rows: [] } }, sender],
      [{ ...base, step: 'group_result', sequence: 0, body: { advertiserId: 'A0001', capturedAt: '2026-09-06T01:00:00.000Z', ads: [], rows: [], path: '/api/other' } }, sender],
    ]) {
      const response = await new Promise(resolve => owner.handleMessage(message, from, resolve));
      assert.equal(response.success, false, JSON.stringify(message));
    }
    return { success: true, receipt: { complete: false } };
  } });
  await h.owner.run({ environmentId: 'local', attemptId });
  assert.equal(h.requests.some(item => item.method === 'PUT'), false);
});

test('login failure acknowledgement preserves the attention tab and session', async () => {
  let state = 'RUNNING';
  const h = harness({ collect: async () => ({ success: false, attentionRequired: true, error: '로그인 필요' }),
    request(path) { if (path.endsWith('/fail')) state = 'FAILED'; return { ...control(), state }; } });
  assert.equal((await h.owner.run({ environmentId: 'local', attemptId })).terminalState, 'FAILED');
  assert.equal((await h.sessions.getOwned(attemptId, 'local')).attention.reason, 'marketplace_login');
  assert.deepEqual(h.closed, []);
});

test('expired or mutated owner permits never authorize more provider or receipt IO', async () => {
  const expired = harness({ request: () => ({ ...control(), expiresAt: '2020-01-01T00:00:00.000Z' }) });
  await assert.rejects(expired.owner.run({ environmentId: 'local', attemptId }), /만료/);
  assert.equal(expired.captures.length, 0);
  for (const mutation of [
    { attemptToken: channelAccountId },
    { expiresAt: '2031-01-02T00:00:00.000Z' },
    { plan: { ...control().plan, endDate: '2026-09-06' } },
  ]) {
    let reads = 0, response;
    const h = harness({ request: () => ({ ...control(), ...(++reads > 1 ? mutation : {}) }),
      collect: async (_input, owner) => {
        response = await new Promise(resolve => owner.handleMessage({ action: 'advertisingKeywordSourceStep', attemptId, step: 'group_result', sequence: 0,
          body: { advertiserId: 'A0001', capturedAt: '2026-09-06T01:00:00.000Z', ads: [], rows: [] } }, sender, resolve));
        return { success: false, errorCode: 'SOURCE_OWNER_UNAVAILABLE' };
      } });
    await h.owner.run({ environmentId: 'local', attemptId });
    assert.equal(response.success, false);
    assert.equal(h.requests.some(item => item.method === 'PUT' || item.method === 'POST'), false);
  }
});

test('local checkpoints retain fixed expiry without an owner query or full control reply', async () => {
  let now = Date.parse('2029-01-01T00:00:00.000Z');
  class Clock extends Date { static now() { return now; } }
  const h = harness({ clock: Clock, collect: async (_input, owner) => {
    const checkpoint = () => new Promise(resolve => owner.handleMessage({ action: 'advertisingKeywordSourceStep',
      attemptId, step: 'checkpoint' }, sender, resolve));
    const before = h.requests.length;
    assert.deepEqual(plain(await checkpoint()), { success: true });
    now = Date.parse('2030-01-02T00:00:00.000Z');
    assert.equal((await checkpoint()).success, false);
    assert.equal(h.requests.length, before);
    return { success: false, errorCode: 'SOURCE_OWNER_UNAVAILABLE' };
  } });
  await h.owner.run({ environmentId: 'local', attemptId });
});

test('an explicit new attempt retires a prior acknowledged FAILED attention correlation', async () => {
  const oldId = '44444444-4444-4444-8444-444444444444';
  const h = harness({ request: path => path.includes(oldId)
    ? { ...control(), attemptId: oldId, state: 'FAILED', errorCode: 'LOGIN_REQUIRED' } : control() });
  await h.sessions.start({ attemptId: oldId, environmentId: 'local', producer: 'advertising.ad_keyword' });
  await h.sessions.requireAttention(oldId, { reason: 'marketplace_login', message: '로그인 필요' });
  await h.owner.run({ environmentId: 'local', attemptId });
  assert.equal(await h.sessions.getOwned(oldId, 'local'), null);
  assert.equal(h.captures.length, 1);
});

test('lost cancellation ACK preserves correlation, and explicit retry reconciles without recollecting', async () => {
  let unavailable = true;
  const h = harness({ request: () => { if (unavailable) throw new Error('offline'); return { ...control(), state: 'FAILED', errorCode: 'USER_CANCELLED' }; } });
  await h.sessions.start({ attemptId, environmentId: 'local', producer: 'advertising.ad_keyword' });
  assert.equal((await h.owner.cancel({ environmentId: 'local', attemptId })).errorCode, 'SOURCE_OWNER_UNAVAILABLE');
  assert.ok(await h.sessions.getOwned(attemptId, 'local'));
  unavailable = false;
  assert.equal((await h.owner.run({ environmentId: 'local', attemptId })).terminalState, 'FAILED');
  assert.equal(h.captures.length, 0);
  assert.equal(await h.sessions.getOwned(attemptId, 'local'), null);
});
