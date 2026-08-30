import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dispatchPath = path.join(
  repoRoot,
  'extensions/kiditem-os/background/external-dispatch.js',
);

function createHarness() {
  const wakeCalls = [];
  const listeners = [];
  const chrome = {
    runtime: {
      getManifest: () => ({ version: '0.1.0' }),
      onMessageExternal: { addListener: (listener) => listeners.push(listener) },
      onConnectExternal: { addListener() {} },
    },
  };
  const operationRuntime = {
    async wake(environmentId) {
      wakeCalls.push(environmentId);
    },
  };
  const environmentContext = {
    resolveSender(sender) {
      if (sender?.url?.startsWith('http://localhost:3000/')) {
        return { environmentId: 'local' };
      }
      return null;
    },
  };
  const context = vm.createContext({ console, queueMicrotask });
  context.globalThis = context;
  vm.runInContext(readFileSync(dispatchPath, 'utf8'), context, { filename: dispatchPath });
  const dispatch = context.KidItemExternalDispatch.create({
    chrome,
    domains: {
      capabilities: () => ({}),
      forExternalPort: () => null,
      forProducer: () => null,
    },
    environmentContext,
    operationRuntime,
    sessions: {},
  });
  return { dispatch, listeners, wakeCalls };
}

test('acknowledges an exact wake request synchronously and claims on the next microtask', async () => {
  const { dispatch, wakeCalls } = createHarness();
  const responses = [];

  const keepAlive = dispatch.handleMessage(
    { action: 'wakeOperationRuntime' },
    { url: 'http://localhost:3000/sourcing-ai/wing-catalog' },
    (response) => responses.push(response),
  );

  assert.equal(keepAlive, false);
  assert.deepEqual(JSON.parse(JSON.stringify(responses)), [
    { success: true, accepted: true },
  ]);
  assert.deepEqual(wakeCalls, []);
  await Promise.resolve();
  assert.deepEqual(wakeCalls, ['local']);
});

test('rejects wake requests from a wrong sender or with caller-controlled work payload', async () => {
  const { dispatch, wakeCalls } = createHarness();
  const responses = [];

  assert.equal(dispatch.handleMessage(
    { action: 'wakeOperationRuntime' },
    { url: 'https://evil.example/' },
    (response) => responses.push(response),
  ), false);
  for (const extra of [
    { operationKey: 'sourcing.collect_wing_catalog_batch' },
    { runId: '11111111-1111-4111-8111-111111111111' },
    { actionUrl: 'https://wing.coupang.com/' },
    { organizationId: '22222222-2222-4222-8222-222222222222' },
    { payload: { keywords: ['레고'] } },
  ]) {
    assert.equal(dispatch.handleMessage(
      { action: 'wakeOperationRuntime', ...extra },
      { url: 'http://localhost:3000/sourcing-ai/wing-catalog' },
      (response) => responses.push(response),
    ), false);
  }

  await Promise.resolve();
  assert.deepEqual(wakeCalls, []);
  assert.deepEqual(JSON.parse(JSON.stringify(responses)), Array.from({ length: 5 }, () => ({
    success: false,
    error: 'Invalid operation runtime wake request',
  })));
});
