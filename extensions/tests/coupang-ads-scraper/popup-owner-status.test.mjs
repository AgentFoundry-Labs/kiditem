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

// Wing 트래픽·아이템위너는 실행 kind다(KID-362) — 팝업은 옛 source 상태를 읽지 않는다.
const OWNER_PATHS = [
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

function createPopupHarness({
  connected = ['local', 'office'],
  runApprovedResponse = { success: true, executed: 0, skipped: 0 },
} = {}) {
  const dom = new JSDOM(popupHtml, {
    url: 'chrome-extension://kiditem/popup.html',
  });
  const requests = [];
  const waiters = [];

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
        callback({ success: true });
      },
    },
    tabs: {
      async query(query) {
        if (query?.active) return [{ id: 11, url: 'https://wing.coupang.com/tenants/seller-price-management' }];
        return [];
      },
      sendMessage(_tabId, _message, callback) {
        callback(runApprovedResponse);
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
    setTimeout() { return 0; },
    clearTimeout() {},
    setInterval() { return 0; },
    clearInterval() {},
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

  return {
    dom,
    document: dom.window.document,
    requests,
    nextApiRequest,
    reply,
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
  assert.equal(harness.document.getElementById('adsSync').textContent, '최신');
  assert.match(harness.document.getElementById('adsSyncDetail').textContent, /3캠페인/);

  await harness.reply(connection, response({ status: 'ok' }));
  assert.equal(harness.document.getElementById('serverStatus').textContent, '연결됨 ✅');
});

test('renders the campaign owner status with failed-attempt details beside prior complete evidence and reads no retired Wing source', async () => {
  const harness = createPopupHarness({ connected: ['local'] });
  const failureMessage = '<img src=x onerror=alert(1)>';
  await completeStatusLoad(harness, 'local', {
    '/api/ads/ad-campaigns/source': response(ownerStatus({
      ready: false,
      latestAttempt: { state: 'FAILED', errorCode: 'AD_TIMEOUT', errorMessage: failureMessage },
      latestComplete: { state: 'COMPLETE', campaignCount: 12, actualCutoffAt: '2026-09-06T08:30:00.000Z' },
    })),
  });

  const value = harness.document.getElementById('adsSync');
  const detail = harness.document.getElementById('adsSyncDetail');
  assert.equal(value.textContent, '갱신 필요');
  assert.match(detail.textContent, /현재 실패: AD_TIMEOUT/);
  assert.match(detail.textContent, /12캠페인/);
  assert.match(detail.textContent, /2026-09-06 17:30 KST/);
  assert.match(detail.textContent, /<img src=x onerror=alert\(1\)>/);
  assert.equal(detail.querySelector('img'), null);

  const requestedPaths = harness.requests
    .filter((request) => request.message.action === 'kiditemApiRequest')
    .map((request) => request.message.path);
  assert.ok(requestedPaths.includes('/api/ads/ad-campaigns/source'));
  assert.ok(requestedPaths.every((path) => !path.includes('/api/ads/traffic') && !path.includes('wing-itemwinner')));
  assert.equal(harness.document.getElementById('trafficSync'), null);
  assert.equal(harness.document.getElementById('winnerSync'), null);
});

test('a failed owner read shows 조회 실패 and invents no zero count', async () => {
  const harness = createPopupHarness({ connected: ['local'] });
  await completeStatusLoad(harness, 'local', {
    '/api/ads/ad-campaigns/source': response({ error: '<b>server down</b>' }, { ok: false, status: 503 }),
  });
  assert.equal(harness.document.getElementById('adsSync').textContent, '조회 실패');
  assert.doesNotMatch(harness.document.getElementById('adsSyncDetail').textContent, /0캠페인/);
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
  assert.equal(harness.document.getElementById('adsSync').textContent, '-');

  for (const request of localRequests) {
    await harness.reply(request, response(ownerStatus({
      latestComplete: { state: 'COMPLETE', itemCount: 999, rowCount: 999, campaignCount: 999 },
    })));
  }
  await harness.flush();
  assert.equal(harness.document.getElementById('serverStatus').textContent, '환경을 선택해주세요.');
  assert.equal(harness.document.getElementById('adsSync').textContent, '-');
  assert.equal(harness.document.getElementById('adsSyncDetail').textContent, '');
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

  assert.equal(harness.document.getElementById('adsSync').textContent, '최신');
  assert.match(harness.document.getElementById('adsSyncDetail').textContent, /7캠페인/);
  assert.equal(harness.requests.filter((request) => request.message.environmentId === 'office').length, 3);
});

test('a Run whose done report was lost warns to check the ad center instead of showing plain success', async () => {
  const warning = '승인 액션 1개는 광고센터에 이미 반영됐을 수 있지만 실행 기록을 남기지 못했습니다. 다시 승인하기 전에 광고센터에서 확인해 주세요.';
  const harness = createPopupHarness({
    connected: ['local'],
    runApprovedResponse: { success: true, executed: 0, executedUnrecorded: 1, skipped: 0, warning },
  });
  await completeStatusLoad(harness, 'local', {
    '/api/ads/traffic/source': response(ownerStatus()),
    '/api/ads/wing-itemwinner/source': response(ownerStatus()),
    '/api/ads/ad-campaigns/source': response(ownerStatus()),
  });

  harness.document.getElementById('btnRunApproved').click();
  const queued = await harness.nextApiRequest('/api/ads/actions?approvalStatus=approved&executeStatus=queued&limit=20', 'local');
  await harness.reply(queued, response({ items: [{ id: 'action-1' }] }));
  await harness.flush();

  const result = harness.document.getElementById('syncResult');
  assert.equal(result.textContent, `⚠️ 0개 실행, 1개는 실행됐지만 기록되지 않음, 0개 보류. ${warning}`);
  // Executed but not recorded is never shown as a failure.
  assert.equal(result.className, 'sync-result success');
});

test('a Run with an action refused at its claim or stopped at a confirmation shows the warning instead of a plain 보류 count', async () => {
  const runs = [
    {
      runApprovedResponse: {
        success: true,
        executed: 1,
        skipped: 1,
        warning: '실행 보고가 거절된 승인 액션 1개는 광고센터에 쓰지 않고 건너뛰었습니다. 다른 실행이 맡았거나 이미 닫힌 실행 시도입니다.',
      },
      shown: '⚠️ 1개 실행, 1개 보류. 실행 보고가 거절된 승인 액션 1개는 광고센터에 쓰지 않고 건너뛰었습니다. 다른 실행이 맡았거나 이미 닫힌 실행 시도입니다.',
    },
    {
      // Stopped at a confirmation click, after which Coupang may already have changed.
      runApprovedResponse: {
        success: true,
        executed: 0,
        skipped: 1,
        warning: '승인 액션 1개는 확인 단계에서 실행 기한(10분)이 지나 멈췄습니다. 광고센터에 반영됐을 수 있으니 다시 승인하기 전에 광고센터에서 확인해 주세요.',
      },
      shown: '⚠️ 0개 실행, 1개 보류. 승인 액션 1개는 확인 단계에서 실행 기한(10분)이 지나 멈췄습니다. 광고센터에 반영됐을 수 있으니 다시 승인하기 전에 광고센터에서 확인해 주세요.',
    },
  ];
  for (const { runApprovedResponse, shown } of runs) {
    const harness = createPopupHarness({ connected: ['local'], runApprovedResponse });
    await completeStatusLoad(harness, 'local', {
      '/api/ads/traffic/source': response(ownerStatus()),
      '/api/ads/wing-itemwinner/source': response(ownerStatus()),
      '/api/ads/ad-campaigns/source': response(ownerStatus()),
    });

    harness.document.getElementById('btnRunApproved').click();
    const queued = await harness.nextApiRequest('/api/ads/actions?approvalStatus=approved&executeStatus=queued&limit=20', 'local');
    await harness.reply(queued, response({
      items: [
        { id: 'action-1', executionTaskId: 'task-1' },
        { id: 'action-2', executionTaskId: 'task-2' },
      ],
    }));
    await harness.flush();

    const result = harness.document.getElementById('syncResult');
    assert.equal(result.textContent, shown);
    assert.equal(result.className, 'sync-result success');
  }
});
