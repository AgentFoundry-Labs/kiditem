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

const PREPARED_PATH = '/api/operations?kinds=advertising.ad_action&status=prepared&limit=200';

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
  runPreparedResponse = { ok: true, ran: 0, created: 0, uncertain: 0, failed: 0, messages: [] },
} = {}) {
  const dom = new JSDOM(popupHtml, {
    url: 'chrome-extension://kiditem/popup.html',
  });
  const requests = [];
  const waiters = [];
  const runtimeMessages = [];
  const tabMessages = [];

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
        runtimeMessages.push(message);
        if (message.type === 'runPreparedOperations') {
          callback(runPreparedResponse);
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
      sendMessage(tabId, message, callback) {
        tabMessages.push({ tabId, message });
        callback({ success: true });
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
    runtimeMessages,
    tabMessages,
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

async function completeStatusLoad(harness, environmentId, { operations = [] } = {}) {
  const extension = await harness.nextApiRequest('/api/ads/extension/status', environmentId);
  await harness.reply(extension, response({ status: 'ok' }));
  const prepared = await harness.nextApiRequest(PREPARED_PATH, environmentId);
  await harness.reply(prepared, response({ operations }));
  await harness.flush();
}

// 광고 수집은 새 런타임의 advertising.ad_report 실행 kind라 팝업은 수집 원천 상태를 읽지 않는다(KID-373).
// 승인된 광고 액션은 서버가 준비해 둔 실행(advertising.ad_action, prepared)이다(KID-386).
test('the popup reads the server connection and the count of prepared ad-action operations', async () => {
  const harness = createPopupHarness({ connected: ['local'] });
  await completeStatusLoad(harness, 'local', { operations: [{ id: 'op-1' }, { id: 'op-2' }] });

  assert.deepEqual(
    harness.requests.map((request) => request.message.path),
    ['/api/ads/extension/status', PREPARED_PATH],
  );
  assert.match(harness.document.getElementById('serverStatus').textContent, /연결됨/);
  assert.match(harness.document.getElementById('approvedActions').textContent, /2개 대기/);
});

test('Run asks the runtime to claim prepared ad actions for the selected environment, never a page tab', async () => {
  const harness = createPopupHarness({
    connected: ['local', 'office'],
    runPreparedResponse: { ok: true, ran: 2, created: 2, uncertain: 0, failed: 0, messages: [] },
  });
  await selectEnvironment(harness, 'office');
  await completeStatusLoad(harness, 'office', { operations: [{ id: 'op-1' }, { id: 'op-2' }] });

  harness.document.getElementById('btnRunApproved').click();
  await harness.flush();

  assert.deepEqual(JSON.parse(JSON.stringify(harness.runtimeMessages)), [
    { type: 'runPreparedOperations', environmentId: 'office', kinds: ['advertising.ad_action'] },
  ]);
  assert.deepEqual(harness.tabMessages, []);
  const result = harness.document.getElementById('syncResult');
  assert.equal(result.textContent, '✅ 광고 액션 2개를 광고센터에 등록했습니다.');
  assert.equal(result.className, 'sync-result success');
  // 돌고 나면 대기 수를 다시 읽는다.
  const refreshed = await harness.nextApiRequest(PREPARED_PATH, 'office');
  assert.ok(refreshed);
});

test('a Run with an unconfirmed registration or a failure shows the counts and the reasons', async () => {
  const harness = createPopupHarness({
    connected: ['local'],
    runPreparedResponse: {
      ok: true, ran: 3, created: 1, uncertain: 1, failed: 1,
      messages: ['완료를 누른 뒤 광고센터 화면을 읽지 못했습니다.', '쿠팡 광고센터 캠페인 등록 화면이 바뀌어 채우지 못했습니다.'],
    },
  });
  await completeStatusLoad(harness, 'local', { operations: [{ id: 'op-1' }] });

  harness.document.getElementById('btnRunApproved').click();
  await harness.flush();

  const result = harness.document.getElementById('syncResult');
  assert.equal(
    result.textContent,
    '⚠️ 1개 등록, 1개는 광고센터에서 등록 여부 확인 필요, 1개 실패. 완료를 누른 뒤 광고센터 화면을 읽지 못했습니다. / 쿠팡 광고센터 캠페인 등록 화면이 바뀌어 채우지 못했습니다.',
  );
  assert.equal(result.className, 'sync-result error');
});

test('a Run with nothing prepared or a refused claim says so', async () => {
  const empty = createPopupHarness({ connected: ['local'] });
  await completeStatusLoad(empty, 'local');
  empty.document.getElementById('btnRunApproved').click();
  await empty.flush();
  assert.equal(empty.document.getElementById('syncResult').textContent, '❌ 실행할 승인 광고 액션이 없습니다.');

  const refused = createPopupHarness({
    connected: ['local'],
    runPreparedResponse: { ok: false, error: 'KidItem 서버에 연결하지 못했습니다.', ran: 0 },
  });
  await completeStatusLoad(refused, 'local');
  refused.document.getElementById('btnRunApproved').click();
  await refused.flush();
  assert.equal(refused.document.getElementById('syncResult').textContent, '❌ KidItem 서버에 연결하지 못했습니다.');
});
