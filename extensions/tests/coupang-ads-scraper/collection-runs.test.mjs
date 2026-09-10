import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const runtimePath = path.join(
  repoRoot,
  'extensions/kiditem-os/background/coupang/collection-runs.js',
);
const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';

function createRuntime(initialSessions = []) {
  const sessionsById = new Map(
    initialSessions.map((session) => [session.attemptId, { ...session }]),
  );
  const calls = [];
  const tabs = new Map([[90, { id: 90, windowId: 9 }]]);
  const sessions = {
    async attachTab(attemptId, tab) {
      calls.push(['attach', attemptId, tab.tabId, tab.windowId]);
    },
    async requireAttention(attemptId, attention) {
      calls.push(['attention', attemptId, attention.reason]);
      const current = sessionsById.get(attemptId);
      if (!current) return null;
      current.attention = attention;
      return current;
    },
  };
  const chrome = {
    runtime: { lastError: null },
    tabs: {
      get(tabId, callback) {
        callback(tabs.get(tabId));
      },
    },
  };
  const context = vm.createContext({ chrome, console });
  vm.runInContext(fs.readFileSync(runtimePath, 'utf8'), context, {
    filename: runtimePath,
  });
  const controller = context.KidItemCollectionRuns.create({ chrome, sessions });
  return { calls, controller };
}

function session(attemptId = ATTEMPT_ID, overrides = {}) {
  return {
    attemptId,
    producer: 'advertising.wing_rank',
    environmentId: 'local',
    ...overrides,
  };
}

test('collection controller retains only tab ownership and attention helpers', () => {
  const { controller } = createRuntime();

  assert.deepEqual(Object.keys(controller).sort(), ['attachTab', 'requireAttention']);
  assert.equal('beginWebCollection' in controller, false);
  assert.equal('isCancelled' in controller, false);
  assert.equal('recover' in controller, false);
});

test('attachTab resolves a numeric tab and forwards the owner attempt identity', async () => {
  const { calls, controller } = createRuntime([session()]);

  const attached = await controller.attachTab(ATTEMPT_ID, 90);

  assert.deepEqual(attached, { id: 90, windowId: 9 });
  assert.deepEqual(calls, [['attach', ATTEMPT_ID, 90, 9]]);
});

test('attention returns a typed cancellation only when the owner session is missing', async () => {
  const runtime = createRuntime();

  assert.deepEqual(
    JSON.parse(JSON.stringify(await runtime.controller.requireAttention(
      'missing-attempt',
      90,
      'marketplace_login',
      'login required',
    ))),
    {
      success: false,
      cancelled: true,
      runId: 'missing-attempt',
      tabId: 90,
    },
  );
  assert.deepEqual(runtime.calls, [['attention', 'missing-attempt', 'marketplace_login']]);
});

test('attention does not treat a legacy cancelled status field as local terminality', async () => {
  const runtime = createRuntime([session(ATTEMPT_ID, { status: 'cancelled' })]);

  const result = await runtime.controller.requireAttention(
    ATTEMPT_ID,
    90,
    'marketplace_login',
    'login required',
  );

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    success: false,
    attentionRequired: true,
    runId: ATTEMPT_ID,
    tabId: 90,
    error: 'login required',
  });
});
