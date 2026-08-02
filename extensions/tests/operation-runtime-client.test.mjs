import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const clientPath = path.join(
  repoRoot,
  'extensions/kiditem-os/background/operation-runtime-client.js',
);

function createHarness() {
  const fetchCalls = [];
  const alarmNames = [];
  const alarmListeners = [];
  const claim = {
    runId: '11111111-1111-4111-8111-111111111111',
    operationKey: 'inventory.refresh_sellpia_snapshot',
    attemptToken: '22222222-2222-4222-8222-222222222222',
    attempt: 1,
    input: {},
    leaseExpiresAt: '2026-08-01T00:01:00.000Z',
  };
  const chrome = {
    runtime: {
      id: 'kiditem-os-test',
      onInstalled: { addListener() {} },
      onStartup: { addListener() {} },
    },
    alarms: {
      create(name) { alarmNames.push(name); },
      onAlarm: { addListener(listener) { alarmListeners.push(listener); } },
    },
  };
  const environmentContext = {
    environmentIds: ['office'],
    alarmName(base, environmentId) { return `${base}:${environmentId}`; },
    parseAlarmName(base, name) { return name === `${base}:office` ? 'office' : null; },
    async authedFetch(environmentId, pathName, init) {
      fetchCalls.push({
        environmentId,
        path: pathName,
        body: init.body ? JSON.parse(init.body) : undefined,
      });
      if (pathName.endsWith('/claim')) {
        return new Response(JSON.stringify({ claim }), { status: 200 });
      }
      return new Response(null, { status: 204 });
    },
  };
  const domains = {
    runOperation(key) {
      assert.equal(key, claim.operationKey);
      return async () => ({ status: 'succeeded', result: { collected: 12 } });
    },
  };
  const context = vm.createContext({
    Headers,
    JSON,
    Response,
    clearInterval() {},
    console,
    setInterval() { return 1; },
  });
  context.globalThis = context;
  vm.runInContext(readFileSync(clientPath, 'utf8'), context, { filename: clientPath });
  const client = context.KidItemOperationRuntimeClient.create({
    chrome,
    domains,
    environmentContext,
    runtimeId: 'test-runtime',
  });
  return { alarmListeners, alarmNames, client, fetchCalls };
}

test('claims one server-owned browser operation and reports with the fenced attempt token', async () => {
  const { client, fetchCalls } = createHarness();
  await client.tick('office');

  assert.equal(fetchCalls[0].path, '/api/operation-runtime/browser/claim');
  assert.deepEqual(fetchCalls[0].body, {
    runtimeId: 'test-runtime',
    environmentId: 'office',
  });
  assert.equal(fetchCalls[1].path, '/api/operation-runtime/browser/runs/11111111-1111-4111-8111-111111111111/report');
  assert.equal(fetchCalls[1].body.attemptToken, '22222222-2222-4222-8222-222222222222');
  assert.deepEqual(fetchCalls[1].body.result, { collected: 12 });
});

test('checks queued browser operations immediately when the service worker starts', async () => {
  const { alarmNames, client, fetchCalls } = createHarness();

  client.install();
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(alarmNames, ['kiditem-operation-runtime-claim:office']);
  assert.equal(fetchCalls[0]?.path, '/api/operation-runtime/browser/claim');
});
