import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const popupSource = await readFile(
  new URL('../../kiditem-os/popup/popup.js', import.meta.url),
  'utf8',
);
const sourceReadinessRuntime = await readFile(
  new URL('../../kiditem-os/shared/source-readiness.js', import.meta.url),
  'utf8',
);
const popupHtml = await readFile(
  new URL('../../kiditem-os/popup/popup.html', import.meta.url),
  'utf8',
);

const OWNER_PATHS = [
  '/api/ads/traffic/source',
  '/api/ads/wing-itemwinner/source',
  '/api/ads/ad-campaigns/source',
];
const ACTIONS_PATH = '/api/ads/actions?approvalStatus=approved&executeStatus=queued&limit=50';

const nextTurn = () => new Promise((resolve) => setImmediate(resolve));
async function flush() {
  await Promise.resolve();
  await nextTurn();
  await Promise.resolve();
}

function response(body, { success = true, ok = true, status = 200 } = {}) {
  return { success, ok, status, body };
}

function ownerStatus({
  ready = true,
  latestAttempt = { state: 'COMPLETE' },
  latestComplete = null,
  actualCutoffAt = null,
} = {}) {
  return {
    channelAccountId: 'account-1',
    ready,
    latestAttempt,
    latestComplete,
    actualCutoffAt,
  };
}

function createPopupHarness({ connected = ['local', 'office'], deferMonthlyAdmission = false } = {}) {
  const dom = new JSDOM(popupHtml, {
    url: 'chrome-extension://kiditem/popup.html',
  });
  const requests = [];
  const waiters = [];
  const intervals = [];
  const timeouts = [];
  const monthlyAdmissions = [];

  function publishApiRequest(message, callback) {
    const request = { message, callback, responded: false, claimed: false };
    requests.push(request);
    const waiterIndex = waiters.findIndex(({ predicate }) => predicate(message));
    if (waiterIndex >= 0) {
      const [{ resolve }] = waiters.splice(waiterIndex, 1);
      request.claimed = true;
      resolve(request);
    }
  }

  const chrome = {
    runtime: {
      lastError: null,
      sendMessage(message, callback) {
        if (message.action === 'getConnectedKidItemEnvironments') {
          callback({ success: true, environmentIds: connected });
          return;
        }
        if (message.action === 'kiditemApiRequest') {
          publishApiRequest(message, callback);
          return;
        }
        if (message.action === 'bindKidItemEnvironment') {
          callback({ success: true });
          return;
        }
        if (message.action === 'monthlyScrape') {
          if (deferMonthlyAdmission) {
            monthlyAdmissions.push({ message, callback, responded: false });
          } else {
            callback({ success: true, attemptId: 'monthly-attempt-1', terminalState: 'RUNNING' });
          }
          return;
        }
        if (message.action.startsWith('collectAdvertising')) {
          callback({ success: true, attemptId: 'manual-attempt-1', terminalState: 'COMPLETE' });
          return;
        }
        callback({ success: true });
      },
    },
    tabs: {
      async query(query) {
        if (query?.active) return [{ id: 11, url: 'https://wing.coupang.com/tenants/seller-price-management' }];
        return [];
      },
      sendMessage(_tabId, _message, callback) {
        callback({ success: true, executed: 0, skipped: 0 });
      },
      create() {},
    },
    storage: {
      local: {
        get(_key, callback) {
          callback({});
        },
      },
    },
  };

  const context = vm.createContext({
    chrome,
    console: { log() {}, warn() {}, error() {} },
    document: dom.window.document,
    window: dom.window,
    Option: dom.window.Option,
    URL,
    Date,
    Intl,
    setTimeout(callback) {
      const handle = { callback, cleared: false };
      timeouts.push(handle);
      return handle;
    },
    clearTimeout(handle) {
      if (handle) handle.cleared = true;
    },
    setInterval(callback) {
      const handle = { callback, cleared: false };
      intervals.push(handle);
      return handle;
    },
    clearInterval(handle) {
      if (handle) handle.cleared = true;
    },
  });
  vm.runInContext(sourceReadinessRuntime, context, { filename: 'source-readiness.js' });
  vm.runInContext(popupSource, context, { filename: 'popup.js' });

  async function nextApiRequest(path, environmentId) {
    const predicate = (message) =>
      message.action === 'kiditemApiRequest' &&
      message.path === path &&
      (environmentId === undefined || message.environmentId === environmentId);
    const existing = requests.find((request) => !request.claimed && !request.responded && predicate(request.message));
    if (existing) {
      existing.claimed = true;
      return existing;
    }
    return new Promise((resolve) => waiters.push({ predicate, resolve }));
  }

  async function reply(request, result) {
    assert.equal(request.responded, false);
    request.responded = true;
    request.callback(result);
    await flush();
  }

  async function runIntervals() {
    for (const interval of intervals) {
      if (!interval.cleared) interval.callback();
    }
    await flush();
  }

  async function runTimeouts() {
    for (const timeout of timeouts) {
      if (!timeout.cleared) {
        timeout.cleared = true;
        timeout.callback();
      }
    }
    await flush();
  }

  async function replyMonthlyAdmission(admission, result) {
    assert.equal(admission.responded, false);
    admission.responded = true;
    admission.callback(result);
    await flush();
  }

  return {
    dom,
    document: dom.window.document,
    requests,
    nextApiRequest,
    reply,
    runIntervals,
    runTimeouts,
    monthlyAdmissions,
    replyMonthlyAdmission,
    async flush() {
      await flush();
    },
  };
}

async function selectEnvironment(harness, environmentId) {
  await harness.flush();
  const select = harness.document.getElementById('environmentSelect');
  select.value = environmentId;
  select.dispatchEvent(new harness.dom.window.Event('change', { bubbles: true }));
  await harness.flush();
}

async function completeStatusLoad(harness, environmentId, bodies, { actions = { items: [] } } = {}) {
  const extension = await harness.nextApiRequest('/api/ads/extension/status', environmentId);
  await harness.reply(extension, response({ status: 'ok' }));
  for (const path of OWNER_PATHS) {
    const requestForPath = await harness.nextApiRequest(path, environmentId);
    await harness.reply(requestForPath, bodies[path]);
  }
  const actionsRequest = await harness.nextApiRequest(ACTIONS_PATH, environmentId);
  await harness.reply(actionsRequest, response(actions));
  await harness.flush();
}

test('owner reads render independently while the connection read is still pending', async () => {
  const harness = createPopupHarness({ connected: ['local'] });
  const connection = await harness.nextApiRequest('/api/ads/extension/status', 'local');
  const ownerRequests = await Promise.all(OWNER_PATHS.map((path) => harness.nextApiRequest(path, 'local')));
  const actions = await harness.nextApiRequest(ACTIONS_PATH, 'local');

  for (const request of ownerRequests) {
    await harness.reply(request, response(ownerStatus({
      latestComplete: { state: 'COMPLETE', rowCount: 3, itemCount: 3, campaignCount: 3 },
    })));
  }
  await harness.reply(actions, response({ items: [] }));
  assert.equal(harness.document.getElementById('serverStatus').textContent, '확인중...');
  assert.equal(harness.document.getElementById('trafficSync').textContent, '최신');
  assert.match(harness.document.getElementById('trafficSyncDetail').textContent, /3행/);

  await harness.reply(connection, response({ status: 'ok' }));
  assert.equal(harness.document.getElementById('serverStatus').textContent, '연결됨 ✅');
});

test('a newer same-environment refresh fences callbacks from the older refresh', async () => {
  const harness = createPopupHarness({ connected: ['local'] });
  const oldConnection = await harness.nextApiRequest('/api/ads/extension/status', 'local');
  const oldOwnerRequests = await Promise.all(OWNER_PATHS.map((path) => harness.nextApiRequest(path, 'local')));
  const oldActions = await harness.nextApiRequest(ACTIONS_PATH, 'local');
  await harness.reply(oldConnection, response({ status: 'ok' }));

  harness.document.getElementById('btnSync').click();
  await harness.flush();
  await harness.runTimeouts();
  const newConnection = await harness.nextApiRequest('/api/ads/extension/status', 'local');
  const newOwnerRequests = await Promise.all(OWNER_PATHS.map((path) => harness.nextApiRequest(path, 'local')));
  const newActions = await harness.nextApiRequest(ACTIONS_PATH, 'local');

  await harness.reply(newConnection, response({ status: 'ok' }));
  for (const request of newOwnerRequests) {
    await harness.reply(request, response(ownerStatus({
      latestComplete: { state: 'COMPLETE', rowCount: 22, itemCount: 22, campaignCount: 22 },
    })));
  }
  await harness.reply(newActions, response({ items: [] }));
  assert.match(harness.document.getElementById('trafficSyncDetail').textContent, /22행/);

  for (const request of oldOwnerRequests) {
    await harness.reply(request, response(ownerStatus({
      latestAttempt: { state: 'FAILED', errorCode: 'OLD_REFRESH', errorMessage: 'stale result' },
      latestComplete: { state: 'COMPLETE', rowCount: 1, itemCount: 1, campaignCount: 1 },
    })));
  }
  await harness.reply(oldActions, response({ items: [{ id: 'old' }] }));
  await harness.flush();
  assert.match(harness.document.getElementById('trafficSyncDetail').textContent, /22행/);
  assert.doesNotMatch(harness.document.getElementById('trafficSyncDetail').textContent, /OLD_REFRESH|1행/);
});

test('renders each owner status independently and preserves failed-attempt details beside prior complete evidence', async () => {
  const harness = createPopupHarness({ connected: ['local'] });
  const failureMessage = '<img src=x onerror=alert(1)>';
  await completeStatusLoad(harness, 'local', {
    '/api/ads/traffic/source': response(ownerStatus({ ready: false, latestAttempt: null })),
    '/api/ads/wing-itemwinner/source': response(ownerStatus({
      ready: false,
      latestAttempt: { state: 'FAILED', errorCode: 'WING_TIMEOUT', errorMessage: failureMessage },
      latestComplete: { state: 'COMPLETE', itemCount: 747, actualCutoffAt: '2026-09-06T08:30:00.000Z' },
    })),
    '/api/ads/ad-campaigns/source': response(ownerStatus({
      latestComplete: { state: 'COMPLETE', campaignCount: 12, actualCutoffAt: '2026-09-06T09:00:00.000Z' },
    })),
  });

  assert.equal(harness.document.getElementById('trafficSync').textContent, '미수집');
  assert.equal(harness.document.getElementById('trafficSyncDetail').textContent, '최근 완료: 없음');
  assert.doesNotMatch(harness.document.getElementById('trafficSyncDetail').textContent, /0/);

  const winnerValue = harness.document.getElementById('winnerSync');
  const winnerDetail = harness.document.getElementById('winnerSyncDetail');
  assert.equal(winnerValue.textContent, '갱신 필요');
  assert.match(winnerDetail.textContent, /현재 실패: WING_TIMEOUT/);
  assert.match(winnerDetail.textContent, /747개/);
  assert.match(winnerDetail.textContent, /2026-09-06 17:30 KST/);
  assert.match(winnerDetail.textContent, /<img src=x onerror=alert\(1\)>/);
  assert.equal(winnerDetail.querySelector('img'), null);

  assert.equal(harness.document.getElementById('adsSync').textContent, '최신');
  assert.match(harness.document.getElementById('adsSyncDetail').textContent, /12캠페인/);

  const requestedPaths = harness.requests
    .filter((request) => request.message.action === 'kiditemApiRequest')
    .map((request) => request.message.path);
  for (const path of OWNER_PATHS) assert.ok(requestedPaths.includes(path), `missing ${path}`);
  assert.ok(requestedPaths.every((path) => !path.includes('attemptToken')));
  assert.ok(requestedPaths.every((path) => !path.includes('account-daily-kpis')));
  assert.equal(harness.document.getElementById('accountDailySync'), null);
});

test('a failed owner read does not make independent owner cards fail or invent a zero count', async () => {
  const harness = createPopupHarness({ connected: ['local'] });
  await completeStatusLoad(harness, 'local', {
    '/api/ads/traffic/source': response({ error: '<b>server down</b>' }, { ok: false, status: 503 }),
    '/api/ads/wing-itemwinner/source': response(ownerStatus({
      latestComplete: { state: 'COMPLETE', itemCount: 8, actualCutoffAt: '2026-09-07T01:00:00.000Z' },
    })),
    '/api/ads/ad-campaigns/source': { success: false, error: 'campaign read failed' },
  });

  assert.equal(harness.document.getElementById('trafficSync').textContent, '조회 실패');
  assert.equal(harness.document.getElementById('winnerSync').textContent, '최신');
  assert.match(harness.document.getElementById('winnerSyncDetail').textContent, /8개/);
  assert.equal(harness.document.getElementById('adsSync').textContent, '조회 실패');
});

test('clearing the selector fences older owner callbacks and clears the cards', async () => {
  const harness = createPopupHarness({ connected: ['local', 'office'] });
  await selectEnvironment(harness, 'local');
  const localExtension = await harness.nextApiRequest('/api/ads/extension/status', 'local');
  await harness.reply(localExtension, response({ status: 'ok' }));
  const localRequests = await Promise.all([
    ...OWNER_PATHS.map((path) => harness.nextApiRequest(path, 'local')),
    harness.nextApiRequest(ACTIONS_PATH, 'local'),
  ]);

  const select = harness.document.getElementById('environmentSelect');
  select.value = '';
  select.dispatchEvent(new harness.dom.window.Event('change', { bubbles: true }));
  await harness.flush();
  assert.equal(harness.document.getElementById('serverStatus').textContent, '환경을 선택해주세요.');
  assert.equal(harness.document.getElementById('winnerSync').textContent, '-');

  for (const request of localRequests) {
    await harness.reply(request, response(ownerStatus({
      latestComplete: { state: 'COMPLETE', itemCount: 999, rowCount: 999, campaignCount: 999 },
    })));
  }
  await harness.flush();
  assert.equal(harness.document.getElementById('serverStatus').textContent, '환경을 선택해주세요.');
  assert.equal(harness.document.getElementById('trafficSync').textContent, '-');
  assert.equal(harness.document.getElementById('winnerSyncDetail').textContent, '');
});

test('out-of-order environment owner responses cannot overwrite the newer environment', async () => {
  const harness = createPopupHarness({ connected: ['local', 'office'] });
  await selectEnvironment(harness, 'local');
  const localExtension = await harness.nextApiRequest('/api/ads/extension/status', 'local');
  await harness.reply(localExtension, response({ status: 'ok' }));
  const localRequests = await Promise.all([
    ...OWNER_PATHS.map((path) => harness.nextApiRequest(path, 'local')),
    harness.nextApiRequest(ACTIONS_PATH, 'local'),
  ]);

  await selectEnvironment(harness, 'office');
  await completeStatusLoad(harness, 'office', {
    '/api/ads/traffic/source': response(ownerStatus({
      latestComplete: { state: 'COMPLETE', rowCount: 2, actualCutoffAt: '2026-09-08T01:00:00.000Z' },
    })),
    '/api/ads/wing-itemwinner/source': response(ownerStatus({
      latestComplete: { state: 'COMPLETE', itemCount: 5, actualCutoffAt: '2026-09-08T01:00:00.000Z' },
    })),
    '/api/ads/ad-campaigns/source': response(ownerStatus({
      latestComplete: { state: 'COMPLETE', campaignCount: 7, actualCutoffAt: '2026-09-08T01:00:00.000Z' },
    })),
  });

  for (const request of localRequests) {
    await harness.reply(request, response(ownerStatus({
      latestAttempt: { state: 'FAILED', errorCode: 'OLD_ENVIRONMENT', errorMessage: 'old callback' },
      latestComplete: { state: 'COMPLETE', itemCount: 999, rowCount: 999, campaignCount: 999 },
    })));
  }
  await harness.flush();

  assert.equal(harness.document.getElementById('trafficSync').textContent, '최신');
  assert.match(harness.document.getElementById('trafficSyncDetail').textContent, /2행/);
  assert.equal(harness.document.getElementById('winnerSync').textContent, '최신');
  assert.match(harness.document.getElementById('winnerSyncDetail').textContent, /5개/);
  assert.equal(harness.document.getElementById('adsSync').textContent, '최신');
  assert.match(harness.document.getElementById('adsSyncDetail').textContent, /7캠페인/);
  assert.equal(harness.requests.filter((request) => request.message.environmentId === 'office').length, 5);
});

function dailyAttempt(state, overrides = {}) {
  return {
    attemptId: 'monthly-attempt-1',
    state,
    plan: { expectedDates: ['2026-09-01', '2026-09-02'] },
    errorCode: null,
    errorMessage: null,
    ...overrides,
  };
}

test('monthly owner polling uses the admitted attempt, preserves the prior complete card, and stops on exact failure', async () => {
  const harness = createPopupHarness({ connected: ['local'] });
  await completeStatusLoad(harness, 'local', {
    '/api/ads/traffic/source': response(ownerStatus({
      latestComplete: { state: 'COMPLETE', rowCount: 44, actualCutoffAt: '2026-09-05T00:00:00.000Z' },
    })),
    '/api/ads/wing-itemwinner/source': response(ownerStatus()),
    '/api/ads/ad-campaigns/source': response(ownerStatus()),
  });
  const monthButton = harness.document.getElementById('btnMonthlySync');
  monthButton.click();
  await harness.flush();
  const admitted = await harness.nextApiRequest('/api/ads/traffic/attempts/monthly-attempt-1', 'local');
  await harness.reply(admitted, response(dailyAttempt('RUNNING')));
  await harness.flush();

  assert.match(harness.document.getElementById('monthlySyncProgress').textContent, /2일 범위 owner 수집 중/);
  assert.match(harness.document.getElementById('trafficSyncDetail').textContent, /44행/);
  assert.equal(
    harness.requests.filter((request) => request.message.path.startsWith('/api/ads/traffic/attempts/')).length,
    1,
  );

  // The timer is intentionally not waited on: the exact attempt is failed by
  // the next poll, and the callback must stop without reading local storage.
  await harness.runIntervals();
  const failedPoll = await harness.nextApiRequest('/api/ads/traffic/attempts/monthly-attempt-1', 'local');
  await harness.reply(failedPoll, response(dailyAttempt('FAILED', {
    errorCode: 'PROVIDER_TIMEOUT',
    errorMessage: '<b>provider failed</b>',
  })));
  await completeStatusLoad(harness, 'local', {
    '/api/ads/traffic/source': response(ownerStatus({
      ready: false,
      latestAttempt: { state: 'FAILED', errorCode: 'PROVIDER_TIMEOUT', errorMessage: 'provider failed' },
      latestComplete: { state: 'COMPLETE', rowCount: 44, actualCutoffAt: '2026-09-05T00:00:00.000Z' },
    })),
    '/api/ads/wing-itemwinner/source': response(ownerStatus()),
    '/api/ads/ad-campaigns/source': response(ownerStatus()),
  });
  await harness.flush();
  assert.match(harness.document.getElementById('monthlySyncProgress').textContent, /provider failed/);
  assert.equal(harness.document.getElementById('monthlySyncProgress').className, 'sync-progress error');
  assert.equal(harness.document.getElementById('trafficSync').textContent, '갱신 필요');
  assert.match(harness.document.getElementById('trafficSyncDetail').textContent, /44행/);
});

test('monthly owner polling ignores a stale environment response', async () => {
  const harness = createPopupHarness({ connected: ['local', 'office'] });
  await selectEnvironment(harness, 'local');
  const localExtension = await harness.nextApiRequest('/api/ads/extension/status', 'local');
  await harness.reply(localExtension, response({ status: 'ok' }));
  const localStatusRequests = await Promise.all([
    ...OWNER_PATHS.map((path) => harness.nextApiRequest(path, 'local')),
    harness.nextApiRequest(ACTIONS_PATH, 'local'),
  ]);
  for (const request of localStatusRequests) {
    await harness.reply(request, response(ownerStatus({
      latestComplete: { state: 'COMPLETE', rowCount: 4, itemCount: 4, campaignCount: 4 },
    })));
  }
  await harness.flush();

  harness.document.getElementById('btnMonthlySync').click();
  await harness.flush();
  const localAttempt = await harness.nextApiRequest('/api/ads/traffic/attempts/monthly-attempt-1', 'local');

  await selectEnvironment(harness, 'office');
  await completeStatusLoad(harness, 'office', {
    '/api/ads/traffic/source': response(ownerStatus({
      latestComplete: { state: 'COMPLETE', rowCount: 8, actualCutoffAt: '2026-09-08T00:00:00.000Z' },
    })),
    '/api/ads/wing-itemwinner/source': response(ownerStatus()),
    '/api/ads/ad-campaigns/source': response(ownerStatus()),
  });
  await harness.reply(localAttempt, response(dailyAttempt('FAILED', {
    errorCode: 'OLD_ENVIRONMENT',
    errorMessage: 'old monthly response',
  })));
  await harness.flush();

  assert.equal(harness.document.getElementById('trafficSync').textContent, '최신');
  assert.match(harness.document.getElementById('trafficSyncDetail').textContent, /8행/);
  assert.doesNotMatch(harness.document.getElementById('monthlySyncProgress').textContent, /old monthly response/);
  assert.equal(
    harness.requests.filter((request) => request.message.path === '/api/ads/traffic/attempts/monthly-attempt-1')
      .every((request) => request.message.environmentId === 'local'),
    true,
  );
});

test('monthly polling rejects an exact-attempt response with a different attempt id', async () => {
  const harness = createPopupHarness({ connected: ['local'] });
  await completeStatusLoad(harness, 'local', {
    '/api/ads/traffic/source': response(ownerStatus()),
    '/api/ads/wing-itemwinner/source': response(ownerStatus()),
    '/api/ads/ad-campaigns/source': response(ownerStatus()),
  });
  harness.document.getElementById('btnMonthlySync').click();
  await harness.flush();
  const attempt = await harness.nextApiRequest('/api/ads/traffic/attempts/monthly-attempt-1', 'local');
  await harness.reply(attempt, response(dailyAttempt('COMPLETE', { attemptId: 'wrong-attempt' })));
  await harness.flush();
  assert.match(harness.document.getElementById('monthlySyncProgress').textContent, /일치하지 않습니다/);
  assert.equal(harness.document.getElementById('monthlySyncProgress').className, 'sync-progress error');
});

test('monthly admission is single-flight so a second same-environment click cannot revive a late first ACK', async () => {
  const harness = createPopupHarness({ connected: ['local'], deferMonthlyAdmission: true });
  await completeStatusLoad(harness, 'local', {
    '/api/ads/traffic/source': response(ownerStatus()),
    '/api/ads/wing-itemwinner/source': response(ownerStatus()),
    '/api/ads/ad-campaigns/source': response(ownerStatus()),
  });
  const button = harness.document.getElementById('btnMonthlySync');
  button.click();
  await harness.flush();
  assert.equal(harness.monthlyAdmissions.length, 1);
  assert.equal(button.disabled, true);

  button.dispatchEvent(new harness.dom.window.Event('click', { bubbles: true }));
  await harness.flush();
  assert.equal(harness.monthlyAdmissions.length, 1);

  await harness.replyMonthlyAdmission(harness.monthlyAdmissions[0], {
    success: true,
    attemptId: 'monthly-attempt-1',
    terminalState: 'RUNNING',
  });
  const attempt = await harness.nextApiRequest('/api/ads/traffic/attempts/monthly-attempt-1', 'local');
  await harness.reply(attempt, response(dailyAttempt('RUNNING')));
  await harness.flush();
  assert.equal(button.disabled, false);
  assert.equal(
    harness.requests.filter((request) => request.message.path === '/api/ads/traffic/attempts/monthly-attempt-1').length,
    1,
  );
});
