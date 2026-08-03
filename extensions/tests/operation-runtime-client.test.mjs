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

function createHarness(options = {}) {
  const fetchCalls = [];
  const alarmNames = [];
  const alarmOptions = [];
  const alarmListeners = [];
  const claim = options.claim || {
    runId: '11111111-1111-4111-8111-111111111111',
    operationKey: 'inventory.refresh_sellpia_snapshot',
    attemptToken: '22222222-2222-4222-8222-222222222222',
    attempt: 1,
    input: {},
    leaseExpiresAt: '2099-08-01T00:01:00.000Z',
  };
  const storage = { ...(options.initialStorage || {}) };
  const chrome = {
    runtime: {
      id: 'kiditem-os-test',
      onInstalled: { addListener() {} },
      onStartup: { addListener() {} },
    },
    alarms: {
      create(name, options) {
        alarmNames.push(name);
        alarmOptions.push(options);
      },
      onAlarm: { addListener(listener) { alarmListeners.push(listener); } },
    },
    storage: {
      local: {
        async get(key) {
          if (typeof key === 'string') return { [key]: storage[key] };
          return { ...storage };
        },
        async set(values) {
          Object.assign(storage, values);
        },
        async remove(key) {
          delete storage[key];
        },
      },
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
      return options.handler || (async () => ({ status: 'succeeded', result: { collected: 12 } }));
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
  return { alarmListeners, alarmNames, alarmOptions, client, fetchCalls, storage };
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
  const { alarmNames, alarmOptions, client, fetchCalls } = createHarness();

  client.install();
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(alarmNames, ['kiditem-operation-runtime-claim:office']);
  assert.equal(alarmOptions.length, 1);
  assert.equal(alarmOptions[0].delayInMinutes, 0.5);
  assert.equal(alarmOptions[0].periodInMinutes, 0.5);
  assert.equal(fetchCalls[0]?.path, '/api/operation-runtime/browser/claim');
});

test('resumes a non-expired stored claim after the service worker restarts', async () => {
  const persistedClaim = {
    runId: '11111111-1111-4111-8111-111111111111',
    operationKey: 'inventory.refresh_sellpia_snapshot',
    attemptToken: '22222222-2222-4222-8222-222222222222',
    attempt: 1,
    input: {},
    leaseExpiresAt: '2099-08-01T00:01:00.000Z',
  };
  const { client, fetchCalls } = createHarness({
    initialStorage: {
      kiditem_operation_runtime_active_v1: {
        office: { claim: persistedClaim, progress: 0.4 },
      },
    },
  });

  client.install();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(
    fetchCalls[0]?.path,
    '/api/operation-runtime/browser/runs/11111111-1111-4111-8111-111111111111/heartbeat',
  );
  assert.equal(
    fetchCalls.some((call) => call.path.endsWith('/report')),
    true,
  );
  assert.equal(
    fetchCalls.some((call) => call.path.endsWith('/claim')),
    false,
  );
});
