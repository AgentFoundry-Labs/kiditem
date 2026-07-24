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
const WEB_RUN_ID = '11111111-1111-4111-8111-111111111111';
const DASHBOARD_RUN_ID = '22222222-2222-4222-8222-222222222222';

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
    async cancel(runId, options) {
      calls.push(['cancel', runId, options || null]);
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
      const current = sessionsById.get(runId);
      if (current.status !== 'cancelled') current.status = 'attention_required';
      return current;
    },
    async restart(runId, options) {
      calls.push(['restart', runId, options || null]);
      const current = sessionsById.get(runId);
      current.status = 'running';
      current.attempt = (current.attempt || 1) + 1;
    },
  };
  const collectionWindow = {
    async close(runId) {
      calls.push(['closeWindow', runId]);
      return true;
    },
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
    cancelScrape: async (runId) => {
      calls.push(['cancelScrape', runId]);
      return {
        success: true,
        cancelled: false,
        runId,
        staleRunId: 'newer-run',
      };
    },
    cancelWingRank: async (runId) => calls.push(['cancelWingRank', runId]),
    cancelCatalog: async (runId) => calls.push(['cancelCatalog', runId]),
    cancelKeywordRank: async (runId) => calls.push(['cancelKeywordRank', runId]),
    cancelCompetitorCatalog: async (runId) => calls.push(['cancelCompetitorCatalog', runId]),
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
    inputIdentity: { keywordCount: 1 },
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
    ['restart', 'scheduled', null],
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
    ['cancelCatalog', 'catalog'],
  ]);
});

test('same-run web restart validates ownership and increments the existing attempt', async () => {
  const runtime = createRuntime([
    session({
      runId: WEB_RUN_ID,
      producer: 'advertising.keyword_rank',
      status: 'attention_required',
      inputIdentity: { keywordCount: 1, maxPages: 2 },
    }),
  ]);

  const runId = await runtime.controller.beginWebCollection(
    'advertising.keyword_rank',
    { maxPages: 2, keywordCount: 1 },
    WEB_RUN_ID,
  );

  assert.equal(runId, WEB_RUN_ID);
  assert.equal(runtime.sessionsById.get(WEB_RUN_ID).attempt, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.calls)), [
    ['restart', WEB_RUN_ID, { closeManagedTab: true }],
  ]);
});

test('same-run web restart compares only the caller-declared stable owner keys', async () => {
  const matching = createRuntime([
    session({
      runId: WEB_RUN_ID,
      status: 'attention_required',
      inputIdentity: {
        collectionMode: 'single_serp',
        keywordFingerprint: 'keyword:a1',
        startedAt: 100,
      },
    }),
  ]);

  await matching.controller.beginWebCollection(
    'advertising.keyword_rank',
    {
      collectionMode: 'single_serp',
      keywordFingerprint: 'keyword:a1',
      startedAt: 200,
    },
    WEB_RUN_ID,
    ['collectionMode', 'keywordFingerprint'],
  );
  assert.deepEqual(JSON.parse(JSON.stringify(matching.calls)), [
    ['restart', WEB_RUN_ID, { closeManagedTab: true }],
  ]);

  for (const inputIdentity of [
    { collectionMode: 'suggestions', keywordFingerprint: 'keyword:a1' },
    { collectionMode: 'single_serp', keywordFingerprint: 'keyword:b2' },
  ]) {
    const mismatch = createRuntime([
      session({
        runId: WEB_RUN_ID,
        status: 'attention_required',
        inputIdentity: {
          collectionMode: 'single_serp',
          keywordFingerprint: 'keyword:a1',
        },
      }),
    ]);
    await assert.rejects(
      mismatch.controller.beginWebCollection(
        'advertising.keyword_rank',
        inputIdentity,
        WEB_RUN_ID,
        ['collectionMode', 'keywordFingerprint'],
      ),
      /input owner/i,
    );
    assert.deepEqual(mismatch.calls, []);
  }
});

test('same-run dashboard restart closes its dedicated owned window before restart', async () => {
  const { calls, controller } = createRuntime([
    session({
      runId: DASHBOARD_RUN_ID,
      producer: 'dashboard.wing_sales',
      status: 'attention_required',
      inputIdentity: { targetCount: 2, referenceDate: '2026-07-15' },
    }),
  ]);

  await controller.beginWebCollection(
    'dashboard.wing_sales',
    { referenceDate: '2026-07-15', targetCount: 2 },
    DASHBOARD_RUN_ID,
  );

  assert.deepEqual(calls, [
    ['closeWindow', DASHBOARD_RUN_ID],
    ['restart', DASHBOARD_RUN_ID, null],
  ]);
});

test('same-run web restart rejects a generic session that is still active', async () => {
  for (const status of ['pending', 'running']) {
    const runtime = createRuntime([
      session({
        runId: WEB_RUN_ID,
        status,
        inputIdentity: { collectionMode: 'all_trackers' },
      }),
    ]);

    await assert.rejects(
      runtime.controller.beginWebCollection(
        'advertising.keyword_rank',
        { collectionMode: 'all_trackers' },
        WEB_RUN_ID,
        ['collectionMode'],
      ),
      /already active/i,
    );
    assert.deepEqual(runtime.calls, []);
  }
});

test('same-run web restart rejects a different producer, strategy, or invalid run id', async () => {
  const runtime = createRuntime([
    session({
      runId: WEB_RUN_ID,
      producer: 'advertising.competitor_catalog',
      inputIdentity: { sellerId: 'seller-a', sellerCount: 1 },
    }),
  ]);

  await assert.rejects(
    runtime.controller.beginWebCollection(
      'advertising.keyword_rank',
      { keywordCount: 1 },
      WEB_RUN_ID,
    ),
    /owner/i,
  );
  runtime.sessionsById.get(WEB_RUN_ID).restartStrategy = 'extension';
  await assert.rejects(
    runtime.controller.beginWebCollection(
      'advertising.competitor_catalog',
      { sellerId: 'seller-b', sellerCount: 1 },
      WEB_RUN_ID,
    ),
    /restart strategy/i,
  );
  await assert.rejects(
    runtime.controller.beginWebCollection(
      'advertising.competitor_catalog',
      { sellerId: 'seller-a', sellerCount: 1 },
      'not-a-uuid',
    ),
    /run id/i,
  );
  assert.deepEqual(runtime.calls, []);
});

test('cancel uses dedicated window ownership and ordinary tab owner cancellation', async () => {
  const dashboard = createRuntime([
    session({ runId: 'dashboard', producer: 'dashboard.wing_sales' }),
  ]);
  const dashboardResult = await dashboard.controller.cancel('dashboard');
  assert.deepEqual(dashboard.calls, [['cancelScrape', 'dashboard']]);
  assert.deepEqual(JSON.parse(JSON.stringify(dashboardResult)), {
    success: true,
    cancelled: false,
    runId: 'dashboard',
    staleRunId: 'newer-run',
  });

  const keyword = createRuntime([
    session({ runId: 'keyword', producer: 'advertising.keyword_rank' }),
  ]);
  await keyword.controller.cancel('keyword');
  assert.deepEqual(JSON.parse(JSON.stringify(keyword.calls)), [
    ['cancel', 'keyword', { closeManagedTab: true }],
    ['cancelKeywordRank', 'keyword'],
  ]);

  const competitor = createRuntime([
    session({ runId: 'competitor', producer: 'advertising.competitor_catalog' }),
  ]);
  await competitor.controller.cancel('competitor');
  assert.deepEqual(JSON.parse(JSON.stringify(competitor.calls)), [
    ['cancel', 'competitor', { closeManagedTab: true }],
    ['cancelCompetitorCatalog', 'competitor'],
  ]);
});

test('attention preserves the ownership recorded by the original tab attach', async () => {
  const { calls, controller } = createRuntime([
    session({ runId: 'web-run' }),
  ]);

  await controller.requireAttention(
    'web-run',
    90,
    'marketplace_login',
    'login required',
  );

  assert.deepEqual(calls, [
    ['attention', 'web-run', 'marketplace_login'],
  ]);
});

test('attention reports cancellation when the terminal session wins the race', async () => {
  const { calls, controller } = createRuntime([
    session({ runId: 'cancelled-run', status: 'cancelled' }),
  ]);

  const result = await controller.requireAttention(
    'cancelled-run',
    90,
    'marketplace_login',
    'login required',
  );

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    success: false,
    cancelled: true,
    runId: 'cancelled-run',
    tabId: 90,
  });
  assert.deepEqual(calls, [
    ['attention', 'cancelled-run', 'marketplace_login'],
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
    ['restart', 'scheduled', null],
    ['loadScheduledTargets'],
    ['startScheduledScrape', 0],
  ]);
});
