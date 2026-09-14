import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const sourceUrl = new URL('../kiditem-os/background/external-dispatch.js', import.meta.url);
const attemptId = '11111111-1111-4111-8111-111111111111';
const sender = { url: 'http://localhost:3000/dashboard' };
const plain = (value) => JSON.parse(JSON.stringify(value));

function dispatchWith(handle) {
  const context = vm.createContext({ Array, Error, Object, Promise, Set, String });
  context.globalThis = context;
  vm.runInContext(fs.readFileSync(sourceUrl, 'utf8'), context, { filename: sourceUrl.pathname });
  return context.KidItemExternalDispatch.create({
    chrome: { runtime: { getManifest: () => ({ version: 'test' }) } },
    environmentContext: { resolveSender: () => ({ environmentId: 'local' }) },
    sessions: {},
    domains: {
      capabilities: () => ({}),
      forExternalAction: (action) => action === 'collectAdvertisingWingTraffic'
        ? { validate: (message) => ({ attemptId: message.attemptId }), handle }
        : null,
    },
  });
}

// Resolves with the response the web app receives. A dispatcher that throws or
// closes the channel leaves the web app without any answer.
function request(dispatch, message) {
  return new Promise((resolve, reject) => {
    let keptOpen;
    try {
      keptOpen = dispatch.handleMessage(message, sender, resolve);
    } catch (error) {
      reject(new Error(`dispatch threw instead of responding: ${error.message}`));
      return;
    }
    if (keptOpen !== true) reject(new Error('dispatch closed the response channel'));
  });
}

test('a source action that throws before returning a promise still answers with an error response', async () => {
  const dispatch = dispatchWith(() => {
    throw new Error('다른 Wing 트래픽 수집이 진행 중입니다.');
  });

  const response = await request(dispatch, { action: 'collectAdvertisingWingTraffic', attemptId });

  assert.deepEqual(plain(response), {
    success: false,
    errorCode: 'SOURCE_COLLECTION_REQUEST_FAILED',
    error: '다른 Wing 트래픽 수집이 진행 중입니다.',
  });
});

test('a failed source action answers with its own error code', async () => {
  const dispatch = dispatchWith(async () => {
    throw Object.assign(new Error('Wing 트래픽 owner 요청 실패'), { code: 'SOURCE_OWNER_UNAVAILABLE' });
  });

  const response = await request(dispatch, { action: 'collectAdvertisingWingTraffic', attemptId });

  assert.deepEqual(plain(response), {
    success: false,
    errorCode: 'SOURCE_OWNER_UNAVAILABLE',
    error: 'Wing 트래픽 owner 요청 실패',
  });
});

test('a source action still answers with its result once the run finishes', async () => {
  const dispatch = dispatchWith(async (input) => ({ success: true, attemptId: input.attemptId, terminalState: 'COMPLETE' }));

  const response = await request(dispatch, { action: 'collectAdvertisingWingTraffic', attemptId });

  assert.deepEqual(plain(response), { success: true, attemptId, terminalState: 'COMPLETE' });
});

test('a source action that fails without a message answers with a Korean reason', async () => {
  const dispatch = dispatchWith(() => {
    throw new Error();
  });

  const response = await request(dispatch, { action: 'collectAdvertisingWingTraffic', attemptId });

  assert.deepEqual(plain(response), {
    success: false,
    errorCode: 'SOURCE_COLLECTION_REQUEST_FAILED',
    error: '수집 요청을 처리하지 못했습니다.',
  });
});
