import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const lifecyclePath = path.join(
  repoRoot,
  'extensions/kiditem-os/background/orders/order-collection-lifecycle.js',
);
const RUN_ID = '11111111-1111-4111-8111-111111111111';

function createSessions() {
  let session = null;
  return {
    async get() { return session; },
    async start(input) { session = { ...input, status: 'running' }; return session; },
    async restart() { return session; },
    async fail() { session = { ...session, status: 'failed' }; return session; },
    async succeed() { session = { ...session, status: 'succeeded' }; return session; },
    async requireAttention(_runId, input) {
      session = { ...session, status: 'attention_required', attention: input };
      return session;
    },
    async progress() { return session; },
  };
}

function loadLifecycle() {
  const context = vm.createContext({ crypto: { randomUUID: () => RUN_ID } });
  vm.runInContext(readFileSync(lifecyclePath, 'utf8'), context);
  return context.KidItemOrderCollectionLifecycle;
}

test('attaches normalized evidence to returned collector failures', async () => {
  const lifecycleModule = loadLifecycle();
  const lifecycle = lifecycleModule.create({
    sessions: createSessions(),
    producer: 'orders.mall',
    normalizeFailure(provider, value) {
      return {
        version: 1,
        provider,
        action: 'collect_orders',
        code: value.pendingLogin ? 'login_required' : 'unknown_failure',
        retryable: value.pendingLogin === true,
        operatorAction: value.pendingLogin ? 'complete_login' : null,
      };
    },
    classifyFailure(value) {
      return value.pendingLogin ? 'marketplace_login' : null;
    },
  });

  const result = await lifecycle.run(
    { runId: RUN_ID, environmentId: 'office' },
    lifecycleModule.createIdentity('kakao', '2026-07-27'),
    async () => ({ success: false, pendingLogin: true, error: '로그인이 필요합니다.' }),
  );

  assert.equal(result.collectionSession.status, 'attention_required');
  assert.deepEqual(result.failure, {
    version: 1,
    provider: 'kakao',
    action: 'collect_orders',
    code: 'login_required',
    retryable: true,
    operatorAction: 'complete_login',
  });
});
test('keeps local session running while a throwing collector exposes failure evidence', async () => {
  const lifecycleModule = loadLifecycle();
  const lifecycle = lifecycleModule.create({
    sessions: createSessions(),
    producer: 'orders.mall',
    normalizeFailure(provider) {
      return {
        version: 1,
        provider,
        action: 'collect_orders',
        code: 'network_failed',
        retryable: true,
        operatorAction: null,
      };
    },
  });

  const result = await lifecycle.run(
    { runId: RUN_ID, environmentId: 'local' },
    lifecycleModule.createIdentity('boribori', '2026-07-27'),
    async () => { throw new Error('Failed to fetch'); },
  );

  // Terminal truth belongs to the server-owned attempt. The local browser
  // session remains resumable/running until its owner acknowledges terminal
  // state, so this compatibility lifecycle must not invent a local failure.
  assert.equal(result.collectionSession.status, 'running');
  assert.equal(result.success, false);
  assert.equal(result.failure.code, 'network_failed');
  assert.equal(result.failure.provider, 'boribori');
});

test('promotes normalized login evidence to attention before terminal failure', async () => {
  const lifecycleModule = loadLifecycle();
  const lifecycle = lifecycleModule.create({
    sessions: createSessions(),
    producer: 'orders.mall',
    normalizeFailure(provider, value) {
      return {
        version: 1,
        provider,
        action: 'collect_orders',
        code: /로그인/.test(value.error) ? 'login_required' : 'unknown_failure',
        retryable: true,
        operatorAction: 'complete_login',
      };
    },
  });

  const result = await lifecycle.run(
    { runId: RUN_ID, environmentId: 'local' },
    lifecycleModule.createIdentity('onch', '2026-08-01'),
    async () => ({ success: false, error: '온채널 로그인을 확인하세요.' }),
  );

  assert.equal(result.collectionSession.status, 'attention_required');
  assert.equal(result.collectionSession.attention.reason, 'marketplace_login');
  assert.equal(result.failure.code, 'login_required');
});

test('keeps the office environment session running after owner success', async () => {
  const lifecycleModule = loadLifecycle();
  const lifecycle = lifecycleModule.create({
    sessions: createSessions(),
    producer: 'orders.mall',
  });

  const result = await lifecycle.run(
    { runId: RUN_ID, environmentId: 'office' },
    lifecycleModule.createIdentity('sellpia', '2026-07-29'),
    async () => ({ success: true }),
  );

  assert.equal(result.collectionSession.environmentId, 'office');
  assert.equal(result.collectionSession.status, 'running');
  assert.equal(result.success, true);
});
