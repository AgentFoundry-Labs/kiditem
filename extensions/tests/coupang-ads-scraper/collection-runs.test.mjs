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
  'extensions/coupang-ads-scraper/background/collection-runs.js',
);

function createRuntime(initialSessions = []) {
  const sessionsById = new Map(
    initialSessions.map((session) => [session.runId, { ...session }]),
  );
  const calls = [];
  const tabs = new Map([[90, { id: 90, windowId: 9 }]]);
  const sessions = {
    async start(input) {
      calls.push(['start', input.runId, input.producer]);
      sessionsById.set(input.runId, { status: 'running', attempt: 1, ...input });
      return sessionsById.get(input.runId);
    },
    async attachTab(runId, tab) {
      calls.push(['attach', runId, tab.tabId, tab.windowId]);
    },
    async cancel(runId) {
      calls.push(['cancel', runId]);
      sessionsById.get(runId).status = 'cancelled';
    },
    async get(runId) {
      return sessionsById.get(runId) || null;
    },
    async list() {
      return [...sessionsById.values()];
    },
    async requireAttention(runId, attention) {
      calls.push(['attention', runId, attention.reason]);
      sessionsById.get(runId).status = 'attention_required';
    },
    async restart(runId) {
      calls.push(['restart', runId]);
      const current = sessionsById.get(runId);
      current.status = 'running';
      current.attempt = (current.attempt || 1) + 1;
    },
  };
  const collectionWindow = {
    async reattach(runId) {
      calls.push(['reattach', runId]);
      return runId === 'scheduled' ? { tabId: 90, windowId: 9 } : null;
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
  const context = vm.createContext({
    URL,
    chrome,
    console,
    crypto: { randomUUID: () => 'new-run-id' },
  });
  vm.runInContext(fs.readFileSync(runtimePath, 'utf8'), context, {
    filename: runtimePath,
  });
  const controller = context.KidItemCollectionRuns.create({
    chrome,
    collectionWindow,
    sessions,
    now: () => 123,
    cancelScrape: async (runId) => calls.push(['cancelScrape', runId]),
    cancelWingRank: async (runId) => calls.push(['cancelWingRank', runId]),
    cancelCatalog: async (runId) => calls.push(['cancelCatalog', runId]),
    loadScheduledTargets: async () => {
      calls.push(['loadScheduledTargets']);
      return [{ id: 'a', url: 'https://wing.coupang.com/a', label: 'A' }];
    },
    startScheduledScrape: async (input) => {
      calls.push(['startScheduledScrape', input.startIndex]);
    },
    startWingRank: async (input) => calls.push(['startWingRank', input.forceRestart]),
    restartCatalog: async (runId) => calls.push(['restartCatalog', runId]),
  });
  return { calls, controller, sessionsById };
}

function session(overrides) {
  return {
    runId: 'run',
    producer: 'advertising.keyword_rank',
    status: 'running',
    restartStrategy: 'web',
    attempt: 1,
    ...overrides,
  };
}

test('allowlists producers and validates exact Coupang scrape target hosts', () => {
  const { controller } = createRuntime();

  assert.equal(
    controller.resolveScrapeTargetProducer('dashboard.wing_sales'),
    'dashboard.wing_sales',
  );
  assert.equal(
    controller.resolveScrapeTargetProducer('advertising.ad_sync'),
    'advertising.ad_sync',
  );
  assert.equal(controller.resolveScrapeTargetProducer('orders.mall'), null);
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        controller.validateScrapeTargets([
          {
            id: '1',
            url: 'https://wing.coupang.com/path#kiditemBatch=1',
            label: 'Wing',
          },
        ]),
      ),
    ),
    [{ id: '1', url: 'https://wing.coupang.com/path', label: 'Wing' }],
  );
  assert.equal(
    controller.validateScrapeTargets([
      { url: 'https://wing.coupang.com.evil.example/path' },
    ]),
    null,
  );
});

test('extension restart resets progress before reloading current targets at item zero', async () => {
  const { calls, controller } = createRuntime([
    session({
      runId: 'scheduled',
      producer: 'advertising.scrape_targets',
      restartStrategy: 'extension',
    }),
  ]);

  await controller.restart('scheduled');

  assert.deepEqual(calls, [
    ['restart', 'scheduled'],
    ['loadScheduledTargets'],
    ['startScheduledScrape', 0],
  ]);
});

test('web restart requires manual confirmation without replaying stored input', async () => {
  const { calls, controller } = createRuntime([
    session({ runId: 'web-run' }),
  ]);

  await controller.restart('web-run');

  assert.deepEqual(calls, [
    ['attention', 'web-run', 'manual_confirmation'],
  ]);
});

test('cancel dispatches to the producer owner after cancelling the generic session', async () => {
  const { calls, controller } = createRuntime([
    session({
      runId: 'catalog',
      producer: 'channels.coupang_catalog',
      restartStrategy: 'extension',
    }),
  ]);

  await controller.cancel('catalog');

  assert.deepEqual(calls, [
    ['cancel', 'catalog'],
    ['cancelCatalog', 'catalog'],
  ]);
});

test('worker reload reattaches a live tab and restarts extension work from zero', async () => {
  const { calls, controller } = createRuntime([
    session({
      runId: 'scheduled',
      producer: 'advertising.scrape_targets',
      restartStrategy: 'extension',
    }),
  ]);

  await controller.recover();

  assert.deepEqual(calls, [
    ['reattach', 'scheduled'],
    ['attach', 'scheduled', 90, 9],
    ['restart', 'scheduled'],
    ['loadScheduledTargets'],
    ['startScheduledScrape', 0],
  ]);
});
