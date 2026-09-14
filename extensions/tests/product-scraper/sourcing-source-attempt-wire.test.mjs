import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const sourcePath = path.resolve('extensions/kiditem-os/background/sourcing/source-attempt-wire.js');
const source = fs.readFileSync(sourcePath, 'utf8');

function loadWire() {
  const context = { console, globalThis: null, Promise };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: sourcePath });
  return context.KidItemSourcingAttemptWire;
}

function response(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

function chromeStorage() {
  const values = {};
  return {
    values,
    chrome: {
      storage: {
        local: {
          get(key, callback) { callback({ [key]: values[key] }); },
          set(next, callback) { Object.assign(values, next); callback?.(); },
        },
      },
    },
  };
}

test('stores only the correlation value chosen by the collector', async () => {
  const { chrome, values } = chromeStorage();
  const wire = loadWire().create({
    chrome,
    sourcePath: '/sourcing/example/attempts',
    requestFailureMessage: 'Example owner request failed',
  });

  await wire.setCorrelation('request-key', { attemptId: 'attempt-1', idempotencyKey: 'key-1' });
  assert.deepEqual(await wire.getCorrelation('request-key'), {
    attemptId: 'attempt-1',
    idempotencyKey: 'key-1',
  });
  assert.equal(values['request-key'].attemptToken, undefined);

  await wire.clearCorrelation('request-key');
  assert.equal(await wire.getCorrelation('request-key'), null);
});

test('retries only retryable terminal delivery with the same fenced payload', async () => {
  const { chrome } = chromeStorage();
  const calls = [];
  const replies = [
    response({ message: 'temporary' }, { ok: false, status: 503 }),
    response({ message: 'temporary' }, { ok: false, status: 503 }),
    response({ attemptId: 'attempt-1', state: 'COMPLETE' }),
  ];
  const wire = loadWire().create({
    chrome,
    sourcePath: '/sourcing/example/attempts',
    requestFailureMessage: 'Example owner request failed',
  });
  const config = {
    apiBase: 'http://kiditem.test/api',
    headers: { authorization: 'session' },
    request: async (url, init) => {
      calls.push({ url, init });
      return replies.shift();
    },
  };

  const result = await wire.terminal(config, {
    attemptId: 'attempt-1',
    attemptToken: 'attempt-token-1',
  }, {
    method: 'PUT',
    suffix: '',
    body: { rows: [1] },
  });

  assert.equal(result.state, 'COMPLETE');
  assert.equal(calls.length, 3);
  for (const call of calls) {
    assert.equal(call.url, 'http://kiditem.test/api/sourcing/example/attempts/attempt-1');
    assert.equal(call.init.headers['x-source-attempt-token'], 'attempt-token-1');
    assert.equal(call.init.body, JSON.stringify({ rows: [1] }));
  }
});

test('does not retry a rejected terminal request and bounds the failure envelope', async () => {
  const { chrome } = chromeStorage();
  let requests = 0;
  const wire = loadWire().create({
    chrome,
    sourcePath: '/sourcing/example/attempts',
    requestFailureMessage: 'Example owner request failed',
  });
  const config = {
    apiBase: 'http://kiditem.test/api',
    headers: {},
    request: async () => {
      requests += 1;
      return response({ message: 'rejected' }, { ok: false, status: 409 });
    },
  };

  await assert.rejects(
    wire.terminal(config, { attemptId: 'attempt-1', attemptToken: 'token' }, {
      method: 'POST',
      suffix: '/fail',
      body: { code: 'FAILED', message: 'failed' },
    }),
    (error) => error.code === 'SOURCE_OWNER_REQUEST_FAILED' && error.status === 409,
  );
  assert.equal(requests, 1);

  const failure = wire.failure(
    Object.assign(new Error('m'.repeat(400)), { code: 'c'.repeat(120) }),
    'FALLBACK',
    'fallback',
  );
  assert.equal(failure.code.length, 100);
  assert.equal(failure.message.length, 300);
});

test('reuses the exact begin key/body through network and server failures without changing single-request semantics', async () => {
  const { chrome } = chromeStorage();
  const wire = loadWire().create({ chrome, sourcePath: '/sourcing/product/attempts', requestFailureMessage: 'failed' });
  const calls = [];
  const init = { method: 'POST', headers: { 'idempotency-key': 'original-key' }, body: '{"sourceUrl":"https://detail.1688.com/offer/1.html?spm=original"}' };
  const config = { apiBase: 'http://kiditem.test/api', request: async (url, requestInit) => {
    calls.push({ url, init: requestInit });
    if (calls.length === 1) throw new TypeError('lost response');
    if (calls.length === 2) return response({ message: 'temporary' }, { ok: false, status: 503 });
    return response({ attemptId: 'attempt-1' });
  } };
  assert.deepEqual(await wire.requestJsonWithRetry(config, '/sourcing/product/attempts', init), { attemptId: 'attempt-1' });
  assert.equal(calls.length, 3);
  for (const call of calls) {
    assert.equal(call.init, init);
    assert.equal(call.url, 'http://kiditem.test/api/sourcing/product/attempts');
  }
  calls.length = 0;
  await assert.rejects(wire.requestJson(config, '/sourcing/product/attempts', init), /lost response/);
  assert.equal(calls.length, 1);
});

test('shared HTTP retry remains bounded at three and never retries owner 4xx refusals', async () => {
  const { chrome } = chromeStorage();
  const wire = loadWire().create({ chrome, sourcePath: '/sourcing/product/attempts', requestFailureMessage: 'failed' });
  for (const [status, expected] of [[503, 3], [409, 1]]) {
    let requests = 0;
    const config = { apiBase: 'http://kiditem.test/api', request: async () => {
      requests += 1;
      return response({ message: 'refused' }, { ok: false, status });
    } };
    await assert.rejects(wire.requestJsonWithRetry(config, '/sourcing/product/attempts', { method: 'POST', body: '{}' }),
      (error) => error.status === status);
    assert.equal(requests, expected);
  }
});

test('continues a replayed begin only for the same attempt while its lease holds', () => {
  const { chrome } = chromeStorage();
  const wire = loadWire().create({ chrome, sourcePath: '/sourcing/example/attempts', requestFailureMessage: 'failed' });
  const now = Date.parse('2026-09-14T00:00:00.000Z');
  const plan = { attemptId: 'attempt-1', expiresAt: '2026-09-14T00:10:00.000Z' };

  assert.equal(wire.continuesAttempt(plan, 'attempt-1', now), true);
  assert.equal(wire.continuesAttempt(plan, 'attempt-2', now), false);
  assert.equal(wire.continuesAttempt(plan, 'attempt-1', Date.parse(plan.expiresAt)), false);
  assert.equal(wire.continuesAttempt({ ...plan, expiresAt: 'not-a-date' }, 'attempt-1', now), false);
});
