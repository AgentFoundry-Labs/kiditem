import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const popupSource = await readFile(
  new URL('../../kiditem-os/popup/popup.js', import.meta.url),
  'utf8',
);
const popupHtml = await readFile(
  new URL('../../kiditem-os/popup/popup.html', import.meta.url),
  'utf8',
);

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

async function completeStatusLoad(harness, environmentId, { actions = { items: [] } } = {}) {
  const extension = await harness.nextApiRequest('/api/ads/extension/status', environmentId);
  await harness.reply(extension, response({ status: 'ok' }));
  const actionsRequest = await harness.nextApiRequest(ACTIONS_PATH, environmentId);
  await harness.reply(actionsRequest, response(actions));
  await harness.flush();
}

// 광고 수집은 새 런타임의 advertising.ad_report 실행 kind라 팝업은 수집 원천 상태를 읽지 않는다(KID-373).
test('the popup reads only the server connection and the approved-action queue', async () => {
  const harness = createPopupHarness({ connected: ['local'] });
  await completeStatusLoad(harness, 'local', { actions: { items: [{ id: 'action-1' }] } });

  assert.deepEqual(
    harness.requests.map((request) => request.message.path),
    ['/api/ads/extension/status', ACTIONS_PATH],
  );
  assert.match(harness.document.getElementById('serverStatus').textContent, /연결됨/);
  assert.match(harness.document.getElementById('approvedActions').textContent, /1개 대기/);
});

test('a Run whose done report was lost warns to check the ad center instead of showing plain success', async () => {
  const warning = '승인 액션 1개는 광고센터에 이미 반영됐을 수 있지만 실행 기록을 남기지 못했습니다. 다시 승인하기 전에 광고센터에서 확인해 주세요.';
  const harness = createPopupHarness({
    connected: ['local'],
    runApprovedResponse: { success: true, executed: 0, executedUnrecorded: 1, skipped: 0, warning },
  });
  await completeStatusLoad(harness, 'local');

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
    await completeStatusLoad(harness, 'local');

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
