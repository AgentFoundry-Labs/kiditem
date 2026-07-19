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
const extensionRoot = path.join(repoRoot, 'extensions/coupang-ads-scraper');
const worker = fs.readFileSync(
  path.join(extensionRoot, 'background/service-worker.js'),
  'utf8',
);
const catalog = fs.readFileSync(
  path.join(extensionRoot, 'background/coupang-catalog-import.js'),
  'utf8',
);
const collectionWindowSource = fs.readFileSync(
  path.join(extensionRoot, 'background/collection-window.js'),
  'utf8',
);
const collectionRunsSource = fs.readFileSync(
  path.join(extensionRoot, 'background/collection-runs.js'),
  'utf8',
);
const manifest = JSON.parse(
  fs.readFileSync(path.join(extensionRoot, 'manifest.json'), 'utf8'),
);

function functionSource(name, nextName) {
  const starts = [
    worker.indexOf(`async function ${name}`),
    worker.indexOf(`function ${name}`),
  ].filter((index) => index >= 0);
  const start = starts.length > 0 ? Math.min(...starts) : -1;
  const nextStarts = nextName
    ? [
        worker.indexOf(`async function ${nextName}`, start + 1),
        worker.indexOf(`function ${nextName}`, start + 1),
      ].filter((index) => index >= 0)
    : [];
  const end = nextStarts.length > 0 ? Math.min(...nextStarts) : -1;
  assert.ok(start >= 0, `${name} must exist`);
  return worker.slice(start, end >= 0 ? end : undefined);
}

test('loads the canonical session manager and focus owners before collector runtimes', () => {
  const collectionSession = worker.indexOf('"collection-session.js"');
  const collectionWindow = worker.indexOf('"collection-window.js"');
  const interactiveTabs = worker.indexOf('"interactive-tabs.js"');
  const catalogRuntime = worker.indexOf('"coupang-catalog-import.js"');

  assert.ok(collectionSession >= 0);
  assert.ok(collectionWindow > collectionSession);
  assert.ok(interactiveTabs > collectionWindow);
  assert.ok(catalogRuntime > interactiveTabs);
  assert.match(worker, /storageKey:\s*["']kiditem_collection_sessions["']/);
  assert.match(worker, /webUrlPatterns:\s*\[["']http:\/\/localhost:3000\/\*["']\]/);
});

test('handles generic collection controls before producer actions', () => {
  const genericControl = worker.indexOf('msg.action === "listCollectionSessions"');
  const scrapeTargets = worker.indexOf('msg.action === "scrapeTargets"');
  assert.ok(genericControl >= 0 && genericControl < scrapeTargets);
  for (const action of [
    'listCollectionSessions',
    'getCollectionSession',
    'cancelCollectionSession',
    'openCollectionAttentionTab',
    'restartCollectionSession',
  ]) {
    assert.match(worker, new RegExp(`msg\\.action === ["']${action}["']`));
  }
  assert.match(collectionRunsSource, /restartStrategy !== ["']extension["']/);
  assert.match(collectionRunsSource, /reason:\s*["']manual_confirmation["']/);
  assert.match(collectionRunsSource, /forceRestart:\s*true/);
  assert.match(collectionRunsSource, /options\.restartCatalog/);
  assert.match(
    worker,
    /collectionRuns\s*\.\s*cancel\(msg\.runId\)[\s\S]*collectionSessions\.get\(msg\.runId\)/,
  );
});

test('persists only allowlisted Coupang producers and advertises the capability', () => {
  const producerSources = `${worker}\n${collectionRunsSource}`;
  for (const producer of [
    'dashboard.wing_sales',
    'dashboard.rocket_sales',
    'dashboard.coupang_ads',
    'dashboard.coupang_products',
    'dashboard.wing_kpi',
    'advertising.ad_sync',
    'advertising.scrape_targets',
    'advertising.wing_rank',
    'advertising.keyword_rank',
    'advertising.competitor_catalog',
    'channels.coupang_catalog',
    'sourcing.wing_catalog',
  ]) {
    assert.match(producerSources, new RegExp(producer.replace('.', '\\.')));
  }
  assert.match(worker, /browserCollectionSessions:\s*true/);
  assert.match(worker, /unsupported collection producer/i);
  assert.equal(manifest.version, '1.2.65');
});

test('keeps single Wing catalog analysis separate from batch sales-rank collection', () => {
  const source = functionSource(
    'searchWingCatalogProducts',
    'searchCoupangKeywordSuggestions',
  );
  assert.match(
    source,
    /beginWebCollection\(\s*["']sourcing\.wing_catalog["']/,
  );
  assert.doesNotMatch(source, /advertising\.wing_rank/);
});

test('the scrape-target producer owns one serialized silent window lifecycle', () => {
  assert.match(worker, /collectionWindow\.collectTargets/);
  assert.match(collectionWindowSource, /runExclusive\(async \(\) =>/);
  assert.match(collectionWindowSource, /getOrCreate\(runId/);
  assert.match(collectionWindowSource, /navigate\(runId/);
  assert.match(collectionWindowSource, /sessions\.attachTab\(runId/);
  assert.match(collectionWindowSource, /sessions\.progress\(runId/);
  assert.match(collectionWindowSource, /sessions\.succeed\(runId\)/);
  assert.match(collectionWindowSource, /sessions\.cancel\(runId\)/);
  assert.match(collectionWindowSource, /close\(runId\)/);
  assert.match(
    collectionWindowSource,
    /for \(let index = 0; index < targets\.length; index \+= 1\)/,
  );
  assert.doesNotMatch(collectionWindowSource, /Promise\.all\(\s*targets/);
  assert.match(worker, /msg\.action === "reportCollectionTargetProgress"/);
  assert.match(worker, /\["succeeded", "failed", "cancelled"\]\.includes\(session\.status\)/);
  assert.match(worker, /KidItemCollectionWindow\.normalizeProgress/);
  assert.match(collectionWindowSource, /preservesContentProgress/);
});

test('automatic collectors contain no direct focus primitives', () => {
  for (const [name, source] of [
    ['service worker', worker],
    ['catalog import', catalog],
  ]) {
    assert.doesNotMatch(source, /active:\s*true/, `${name} activates a tab directly`);
    assert.doesNotMatch(source, /focused:\s*true/, `${name} focuses a window directly`);
    assert.doesNotMatch(source, /\bactivateTab\s*\(/, `${name} uses legacy activateTab`);
  }
  assert.match(catalog, /requireAttention/);
  assert.match(catalog, /clearAlarm\(\)/);
  assert.match(catalog, /attention_required/);
});

test('automatic collectors never reuse or navigate a user-active tab', () => {
  assert.match(worker, /before\?\.active && options\.allowActive !== true/);
  assert.match(worker, /throw new Error\(["']active user tab is collection-protected["']\)/);
  assert.doesNotMatch(worker, /\.catch\(\(\) => reusableTab\)/);
  assert.match(catalog, /dependencies\.collectionWindow\.getOrCreate\(\s*state\.runId/);
  assert.match(catalog, /dependencies\.collectionWindow\.navigate\(\s*state\.runId/);
  assert.doesNotMatch(catalog, /chrome\.tabs\.create\(/);
  assert.doesNotMatch(catalog, /chrome\.tabs\.update\(/);
  assert.doesNotMatch(catalog, /chrome\.tabs\.remove\(/);
});

test('automatic rank and keyword helpers create extension-owned inactive tabs', () => {
  for (const [name, nextName] of [
    ['getOrCreateCoupangSearchTab', 'executeCoupangKeywordSuggestionSearch'],
    ['getOrCreateCoupangRankSearchTab', 'executeCoupangSerpExtraction'],
    ['getOrCreateWingCatalogTab', 'executeWingCatalogSearchWithRetry'],
  ]) {
    const helper = functionSource(name, nextName);
    assert.match(helper, /createTab\(\{\s*url[^}]*active:\s*false/s);
    assert.doesNotMatch(helper, /queryTabs\(/);
    assert.doesNotMatch(helper, /reusableTab|reusable/);
  }
});

test('web restart handlers preserve the requested run id and use the shared begin contract', () => {
  assert.match(
    worker,
    /msg\.action === "runCoupangKeywordRankCheck"[\s\S]*?startCoupangKeywordRankCheck\(\{\s*runId:\s*msg\.runId/s,
  );
  assert.match(
    worker,
    /msg\.action === "runWingSalesRankCheck"[\s\S]*?startWingSalesRankCheck\(\{\s*runId:\s*msg\.runId/s,
  );
  for (const [name, nextName] of [
    ['startCoupangKeywordRankCheck', 'startCoupangCompetitorSellerCatalogCollection'],
    ['startCoupangCompetitorSellerCatalogCollection', 'runCoupangCompetitorSellerCatalogCollection'],
    ['startWingSalesRankCheck', 'runWingSalesRankBatch'],
  ]) {
    const source = functionSource(name, nextName);
    assert.match(source, /collectionRuns\.beginWebCollection\(/);
    if (name === 'startWingSalesRankCheck') {
      assert.match(
        source,
        /options\.restartStrategy === "extension"[\s\S]*?collectionSessions\.start\([\s\S]*?restartStrategy:\s*"extension"/,
      );
    } else {
      assert.doesNotMatch(source, /collectionSessions\.start\(/);
    }
  }
  const resume = functionSource(
    'resumeInterruptedWingSalesRankCheck',
    'checkCoupangKeywordRank',
  );
  assert.match(resume, /collectionRuns\.restart\(status\.runId\)/);
  assert.doesNotMatch(resume, /startWingSalesRankCheck\(/);
});

test('shared producers declare stable collection modes and opaque input owners', () => {
  assert.match(worker, /function stableInputFingerprint\(/);
  for (const [name, nextName, mode] of [
    ['searchWingCatalogProducts', 'searchCoupangKeywordSuggestions', 'single_catalog'],
    ['searchCoupangKeywordSuggestions', 'getOrCreateCoupangSearchTab', 'suggestions'],
    ['startWingSalesRankCheck', 'runWingSalesRankBatch', 'batch'],
    ['checkCoupangKeywordRank', 'startCoupangKeywordRankCheck', 'single_serp'],
    ['startCoupangKeywordRankCheck', 'startCoupangCompetitorSellerCatalogCollection', 'all_trackers'],
  ]) {
    assert.match(functionSource(name, nextName), new RegExp(`collectionMode:\\s*["']${mode}["']`));
  }
  for (const [name, nextName] of [
    ['searchWingCatalogProducts', 'searchCoupangKeywordSuggestions'],
    ['searchCoupangKeywordSuggestions', 'getOrCreateCoupangSearchTab'],
    ['checkCoupangKeywordRank', 'startCoupangKeywordRankCheck'],
  ]) {
    const source = functionSource(name, nextName);
    assert.match(source, /keywordFingerprint:\s*stableInputFingerprint\(keyword\)/);
    assert.match(source, /\["collectionMode",\s*"keywordFingerprint"\]/);
  }
});

test('stale domain state only yields to a restartable generic same-run session', () => {
  const context = vm.createContext({});
  vm.runInContext(
    `${functionSource('canRestartStoredDomainRun', 'stableInputFingerprint')}\n` +
      'globalThis.canRestart = canRestartStoredDomainRun;',
    context,
  );
  const stored = { runId: 'run-a', status: 'running' };

  for (const status of ['attention_required', 'failed', 'cancelled', 'succeeded']) {
    assert.equal(
      context.canRestart(stored, 'run-a', { runId: 'run-a', status }),
      true,
      status,
    );
  }
  for (const status of ['pending', 'running']) {
    assert.equal(
      context.canRestart(stored, 'run-a', { runId: 'run-a', status }),
      false,
      status,
    );
  }
  assert.equal(context.canRestart(stored, 'run-b', { runId: 'run-b', status: 'failed' }), false);
  assert.equal(context.canRestart(stored, 'run-a', null), false);

  for (const [name, nextName] of [
    ['startWingSalesRankCheck', 'runWingSalesRankBatch'],
    ['startCoupangKeywordRankCheck', 'startCoupangCompetitorSellerCatalogCollection'],
    ['startCoupangCompetitorSellerCatalogCollection', 'runCoupangCompetitorSellerCatalogCollection'],
  ]) {
    assert.match(functionSource(name, nextName), /canRestartStoredDomainRun\(/);
  }
});

test('scrape-target web restarts bind the run to a stable target owner', () => {
  const context = vm.createContext({
    stableInputFingerprint: (value) => `hash:${value}`,
  });
  vm.runInContext(
    `${functionSource('stableScrapeTargetFingerprint', 'canRestartStoredDomainRun')}\n` +
      'globalThis.fingerprint = stableScrapeTargetFingerprint;',
    context,
  );
  const first = [
    { url: 'https://wing.coupang.com/b?day=2' },
    { url: 'https://wing.coupang.com/a?day=1' },
  ];
  const reordered = [...first].reverse();

  assert.equal(
    context.fingerprint('dashboard.wing_sales', first),
    context.fingerprint('dashboard.wing_sales', reordered),
  );
  assert.notEqual(
    context.fingerprint('dashboard.wing_sales', first),
    context.fingerprint('advertising.scrape_targets', first),
  );
  assert.notEqual(
    context.fingerprint('dashboard.wing_sales', first),
    context.fingerprint('dashboard.wing_sales', [first[0]]),
  );

  const scrape = functionSource('prepareScrapeTargets', 'handleScrapeTargets');
  assert.match(scrape, /collectionMode:\s*["']scrape_targets["']/);
  assert.match(scrape, /targetFingerprint:\s*stableScrapeTargetFingerprint\(/);
  assert.match(scrape, /\[\s*["']collectionMode["'],\s*["']targetFingerprint["']\s*\]/);
});

test('rejected scrape-target preparation preserves the existing domain state', async () => {
  const calls = [];
  const context = vm.createContext({
    BATCH_SCRAPE_CANCEL_KEY: 'cancel-key',
    BATCH_SCRAPE_STATUS_KEY: 'status-key',
    Date,
    stableScrapeTargetFingerprint: () => 'fp64:targets',
    collectionRuns: {
      resolveScrapeTargetProducer: () => 'advertising.scrape_targets',
      beginWebCollection: async () => {
        calls.push('begin');
        throw new Error('Collection session is already active');
      },
    },
    collectionSessions: { start: async () => calls.push('session-start') },
    chrome: {
      storage: {
        local: {
          remove: async () => calls.push('remove-cancel'),
          set: async () => calls.push('write-starting'),
        },
      },
    },
  });
  vm.runInContext(
    `${functionSource('prepareScrapeTargets', 'handleScrapeTargets')}\n` +
      'globalThis.prepare = prepareScrapeTargets;',
    context,
  );

  await assert.rejects(
    context.prepare(
      [{ url: 'https://wing.coupang.com/a' }],
      '11111111-1111-4111-8111-111111111111',
      1,
      { producer: 'advertising.scrape_targets', restartStrategy: 'web' },
    ),
    /already active/i,
  );
  assert.deepEqual(calls, ['begin']);

  const handler = worker.slice(
    worker.indexOf('if (msg.action === "scrapeTargets")'),
    worker.indexOf('if (msg.action === "startCoupangCatalogImport")'),
  );
  assert.doesNotMatch(handler, /storage\.local\.remove\(BATCH_SCRAPE_CANCEL_KEY\)/);
  assert.ok(
    handler.indexOf('prepareScrapeTargets') < handler.indexOf('collectTargets'),
  );
});

test('ordinary tab cancellation dispatches domain owners and fences late terminal writes', () => {
  assert.match(worker, /cancelKeywordRank:\s*requestCoupangKeywordRankCancellation/);
  assert.match(worker, /cancelCompetitorCatalog:\s*requestCoupangCompetitorCatalogCancellation/);
  assert.match(
    functionSource('runCoupangKeywordRankBatch'),
    /if \(await collectionRuns\.isCancelled\(runId\)\)/,
  );
  assert.match(
    functionSource('runCoupangCompetitorSellerCatalogCollection'),
    /if \(await collectionRuns\.isCancelled\(runId\)\)/,
  );
  assert.match(worker, /status:\s*"cancelled"/);
});

test('cancelled keyword batch skips seller phases, sync, terminal writes, and success', async () => {
  const calls = [];
  const context = vm.createContext({
    console,
    setInterval: () => 1,
    clearInterval: () => undefined,
    chrome: {
      runtime: { lastError: null, getPlatformInfo: () => undefined },
      storage: { local: { set: async () => calls.push('status') } },
    },
    collectionRuns: { isCancelled: async () => true },
    collectionSessions: {
      progress: async () => calls.push('progress'),
      succeed: async () => calls.push('succeed'),
    },
    fetchCoupangCompetitorSellerTargets: async () => calls.push('seller-targets'),
    postKeywordRankSync: async () => calls.push('rank-sync'),
    notifyDashboard: () => calls.push('notify'),
  });
  vm.runInContext(
    `${functionSource('runCoupangKeywordRankBatch', 'runScheduledKeywordRankCheck')}\n` +
      'globalThis.runBatch = runCoupangKeywordRankBatch;',
    context,
  );

  const result = await context.runBatch(
    [{ keyword: '문구세트', maxPages: 1 }],
    'cancelled-run',
    123,
  );

  assert.deepEqual(calls, []);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    success: false,
    cancelled: true,
    runId: 'cancelled-run',
  });
});

test('seller cancellation after tab creation attaches ownership but skips all late work', async () => {
  const calls = [];
  const context = vm.createContext({
    console,
    Date,
    COMPETITOR_SELLER_CATALOG_STATUS_KEY: 'seller-status',
    chrome: { storage: { local: { set: async () => calls.push('status') } } },
    createTab: async () => ({ id: 41, windowId: 7 }),
    collectionRuns: {
      attachTab: async () => calls.push('attach'),
      isCancelled: async () => true,
      requireAttention: async () => calls.push('attention'),
    },
    collectionSessions: {
      progress: async () => calls.push('progress'),
      succeed: async () => calls.push('succeed'),
      fail: async () => calls.push('fail'),
    },
    collectCoupangSellerCatalogs: async () => calls.push('collect'),
    postCompetitorSellerCatalogSync: async () => calls.push('sync'),
    requestCoupangCompetitorCatalogCancellation: async () =>
      calls.push('cancel-owner'),
    notifyDashboard: () => calls.push('notify'),
    removeTab: async () => calls.push('remove'),
  });
  vm.runInContext(
    `${functionSource('runCoupangCompetitorSellerCatalogCollection', 'runCoupangKeywordRankBatch')}\n` +
      'globalThis.runSeller = runCoupangCompetitorSellerCatalogCollection;',
    context,
  );

  await context.runSeller(
    {
      sellerId: 'seller-a',
      sellerName: '판매자 A',
      sellerStoreUrl: 'https://www.coupang.com/np/products/brand-shop',
    },
    'cancelled-run',
    123,
  );

  assert.deepEqual(calls, ['attach', 'cancel-owner']);
});

test('keyword terminal cancellation reasserts domain cancelled instead of succeeding', async () => {
  const calls = [];
  const cancellationStates = [false, true];
  const context = vm.createContext({
    console,
    setInterval: () => 1,
    clearInterval: () => undefined,
    KEYWORD_RANK_STATUS_KEY: 'keyword-status',
    chrome: {
      runtime: { lastError: null, getPlatformInfo: () => undefined },
      storage: { local: { set: async () => calls.push('status') } },
    },
    collectionRuns: {
      isCancelled: async () => cancellationStates.shift() ?? true,
    },
    collectionSessions: { succeed: async () => calls.push('succeed') },
    requestCoupangKeywordRankCancellation: async () => calls.push('cancel-owner'),
    notifyDashboard: () => calls.push('notify'),
  });
  vm.runInContext(
    `${functionSource('runCoupangKeywordRankBatch', 'runScheduledKeywordRankCheck')}\n` +
      'globalThis.runBatch = runCoupangKeywordRankBatch;',
    context,
  );

  const result = await context.runBatch([], 'cancelled-run', 123);

  assert.deepEqual(calls, ['status', 'cancel-owner']);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    success: false,
    cancelled: true,
    runId: 'cancelled-run',
  });
});

test('seller terminal cancellation reasserts domain cancelled after a racing done write', async () => {
  const calls = [];
  const cancellationStates = [false, false, false, false, false, true, true];
  const context = vm.createContext({
    console,
    Date,
    COMPETITOR_SELLER_CATALOG_STATUS_KEY: 'seller-status',
    chrome: { storage: { local: { set: async () => calls.push('status') } } },
    createTab: async () => ({ id: 41, windowId: 7 }),
    collectionRuns: {
      attachTab: async () => calls.push('attach'),
      isCancelled: async () => cancellationStates.shift() ?? true,
      requireAttention: async () => calls.push('attention'),
    },
    collectionSessions: {
      progress: async () => calls.push('progress'),
      succeed: async () => calls.push('succeed'),
      fail: async () => calls.push('fail'),
    },
    collectCoupangSellerCatalogs: async () => [{
      sellerId: 'seller-a',
      sellerName: '판매자 A',
      collectedProductCount: 3,
    }],
    postCompetitorSellerCatalogSync: async () => ({ success: true }),
    requestCoupangCompetitorCatalogCancellation: async () => calls.push('cancel-owner'),
    notifyDashboard: () => calls.push('notify'),
    removeTab: async () => calls.push('remove'),
  });
  vm.runInContext(
    `${functionSource('runCoupangCompetitorSellerCatalogCollection', 'runCoupangKeywordRankBatch')}\n` +
      'globalThis.runSeller = runCoupangCompetitorSellerCatalogCollection;',
    context,
  );

  await context.runSeller(
    {
      sellerId: 'seller-a',
      sellerName: '판매자 A',
      sellerStoreUrl: 'https://www.coupang.com/np/products/brand-shop',
    },
    'cancelled-run',
    123,
  );

  assert.deepEqual(calls, [
    'attach',
    'progress',
    'status',
    'status',
    'cancel-owner',
  ]);
});

test('cancellation during initial target fetch cannot be overwritten by pre-batch status writes', async () => {
  for (const fetchResult of ['error', 'empty']) {
    let cancelled = false;
    let status = null;
    const calls = [];
    const keywordContext = vm.createContext({
      console,
      Date,
      KEYWORD_RANK_STATUS_KEY: 'keyword-status',
      getStorage: async () => ({
        'keyword-status': status,
      }),
      collectionRuns: {
        createRunId: () => 'keyword-run',
        beginWebCollection: async () => {
          cancelled = false;
          return 'keyword-run';
        },
        isCancelled: async () => cancelled,
      },
      authedFetch: async () => {
        cancelled = true;
        if (fetchResult === 'error') throw new Error('tracker fetch failed');
        return { ok: true, json: async () => [] };
      },
      requestCoupangKeywordRankCancellation: async () => {
        calls.push('cancel-owner');
        status = { runId: 'keyword-run', status: 'cancelled', cancelled: true };
      },
      chrome: {
        storage: {
          local: {
            set: async (next) => {
              status = next['keyword-status'];
              calls.push(`status:${status.status}`);
            },
          },
        },
      },
      collectionSessions: {
        fail: async () => calls.push('fail'),
        succeed: async () => calls.push('succeed'),
        progress: async () => calls.push('progress'),
      },
      runCoupangKeywordRankBatch: () => {
        calls.push('batch');
        return Promise.resolve();
      },
    });
    vm.runInContext(
      `${functionSource('canRestartStoredDomainRun', 'stableInputFingerprint')}\n` +
      `${functionSource('startCoupangKeywordRankCheck', 'startCoupangCompetitorSellerCatalogCollection')}\n` +
        'globalThis.startKeyword = startCoupangKeywordRankCheck;',
      keywordContext,
    );

    const result = await keywordContext.startKeyword();
    assert.equal(result.cancelled, true);
    assert.equal(cancelled, true);
    assert.equal(status.status, 'cancelled');
    assert.deepEqual(calls, ['cancel-owner']);
  }

  for (const fetchResult of ['error', 'empty']) {
    let cancelled = false;
    let status = null;
    const calls = [];
    const wingContext = vm.createContext({
      console,
      Date,
      WING_RANK_STALE_AFTER_MS: 60_000,
      RANK_CHECK_STATUS_KEY: 'wing-status',
      RANK_CHECK_CANCEL_KEY: 'wing-cancel',
      getStorage: async () => ({ 'wing-status': status }),
      collectionRuns: {
        createRunId: () => 'wing-run',
        beginWebCollection: async () => {
          cancelled = false;
          return 'wing-run';
        },
      },
      isWingSalesRankCancelled: async () => cancelled,
      authedFetch: async () => {
        cancelled = true;
        if (fetchResult === 'error') throw new Error('target fetch failed');
        return { ok: true, json: async () => ({ targets: [] }) };
      },
      markStoredCollectionCancelled: async () => {
        calls.push('cancel-owner');
        status = { runId: 'wing-run', status: 'cancelled', cancelled: true };
      },
      chrome: {
        storage: {
          local: {
            remove: async () => undefined,
            set: async (next) => {
              status = next['wing-status'];
              calls.push(`status:${status.status}`);
            },
          },
        },
      },
      collectionSessions: {
        start: async () => undefined,
        fail: async () => calls.push('fail'),
        succeed: async () => calls.push('succeed'),
        progress: async () => calls.push('progress'),
      },
      runWingSalesRankBatch: () => {
        calls.push('batch');
        return Promise.resolve();
      },
    });
    vm.runInContext(
      `${functionSource('canRestartStoredDomainRun', 'stableInputFingerprint')}\n` +
      `${functionSource('startWingSalesRankCheck', 'runWingSalesRankBatch')}\n` +
        'globalThis.startWingBatch = startWingSalesRankCheck;',
      wingContext,
    );

    const result = await wingContext.startWingBatch();
    assert.equal(result.cancelled, true);
    assert.equal(cancelled, true);
    assert.equal(status.status, 'cancelled');
    assert.deepEqual(calls, ['cancel-owner']);
  }

  let sellerCancelled = false;
  let sellerStatus = null;
  const sellerCalls = [];
  const sellerContext = vm.createContext({
    console,
    Date,
    COMPETITOR_SELLER_CATALOG_STATUS_KEY: 'seller-status',
    getStorage: async () => ({ 'seller-status': sellerStatus }),
    fetchCoupangCompetitorSellerTargets: async () => {
      sellerCancelled = true;
      return [{
        sellerId: 'seller-a',
        sellerName: '판매자 A',
        sellerStoreUrl: 'https://shop.coupang.com/vid/seller-a',
      }];
    },
    isCoupangSellerStoreUrl: () => true,
    collectionSessions: {
      get: async () => ({
        producer: 'advertising.competitor_catalog',
        restartStrategy: 'web',
        inputIdentity: { sellerId: 'seller-a' },
      }),
    },
    collectionRuns: {
      createRunId: () => 'seller-run',
      beginWebCollection: async () => {
        sellerCancelled = false;
        return 'seller-run';
      },
      isCancelled: async () => sellerCancelled,
    },
    requestCoupangCompetitorCatalogCancellation: async () => {
      sellerCalls.push('cancel-owner');
      sellerStatus = {
        runId: 'seller-run',
        status: 'cancelled',
        cancelled: true,
      };
    },
    chrome: {
      storage: {
        local: {
          set: async (next) => {
            sellerStatus = next['seller-status'];
            sellerCalls.push(`status:${sellerStatus.status}`);
          },
        },
      },
    },
    runCoupangCompetitorSellerCatalogCollection: () => {
      sellerCalls.push('runner');
      return Promise.resolve();
    },
  });
  vm.runInContext(
    `${functionSource('canRestartStoredDomainRun', 'stableInputFingerprint')}\n` +
    `${functionSource('startCoupangCompetitorSellerCatalogCollection', 'runCoupangCompetitorSellerCatalogCollection')}\n` +
      'globalThis.startSeller = startCoupangCompetitorSellerCatalogCollection;',
    sellerContext,
  );

  const sellerResult = await sellerContext.startSeller({
    sellerId: 'seller-a',
    runId: '11111111-1111-4111-8111-111111111111',
  });
  assert.equal(sellerResult.cancelled, true);
  assert.equal(sellerCancelled, true);
  assert.equal(sellerStatus.status, 'cancelled');
  assert.deepEqual(sellerCalls, ['cancel-owner']);
});

test('Wing cancellation skips rank sync and wins the terminal status race', async () => {
  let cancelled = false;
  const calls = [];
  const context = vm.createContext({
    console,
    setInterval: () => 1,
    clearInterval: () => undefined,
    RANK_CHECK_STATUS_KEY: 'wing-status',
    RANK_CHECK_CANCEL_KEY: 'wing-cancel',
    chrome: {
      runtime: { lastError: null, getPlatformInfo: () => undefined },
      storage: {
        local: {
          remove: async () => calls.push('remove-cancel-key'),
          set: async (next) => calls.push(`status:${next['wing-status'].status}`),
        },
      },
    },
    isWingSalesRankCancelled: async () => cancelled,
    searchWingCatalogProducts: async () => {
      calls.push('search');
      cancelled = true;
      return { success: true, tabId: 41, rows: [], pages: [] };
    },
    sortWingCatalogRowsBySales: () => [],
    postWingSalesRankSync: async () => {
      calls.push('sync');
      return { success: true };
    },
    clampNumber: () => 1,
    randomDelayMs: () => 0,
    sleep: async () => undefined,
    removeTab: async () => calls.push('remove-tab'),
    markStoredCollectionCancelled: async () => calls.push('cancel-owner'),
    collectionSessions: {
      progress: async () => calls.push('progress'),
      cancel: async () => calls.push('cancel-session'),
      succeed: async () => calls.push('succeed'),
    },
    notifyDashboard: () => calls.push('notify'),
    WING_CATALOG_MAX_PAGES: 5,
  });
  vm.runInContext(
    `${functionSource('runWingSalesRankBatch', 'isWingSalesRankCancelled')}\n` +
      'globalThis.runWingBatch = runWingSalesRankBatch;',
    context,
  );

  const result = await context.runWingBatch(
    [{ keyword: '문구', productCount: 1, vendorItemIds: [] }],
    1,
    'wing-run',
    123,
  );
  assert.equal(result.cancelled, true);
  assert.equal(calls.includes('sync'), false);
  assert.equal(calls.includes('succeed'), false);
  assert.ok(calls.includes('cancel-session'));

  cancelled = false;
  calls.length = 0;
  context.chrome.storage.local.remove = async () => {
    calls.push('remove-cancel-key');
    cancelled = true;
  };
  const terminalResult = await context.runWingBatch([], 0, 'wing-run', 123);
  assert.equal(terminalResult.cancelled, true);
  assert.ok(calls.includes('status:done'));
  assert.ok(calls.includes('cancel-owner'));
  assert.equal(calls.includes('succeed'), false);
});

test('automatic collectors clean up owned tabs and replace a missing shared Wing tab', async () => {
  const wingCalls = [];
  let wingCancelled = false;
  const wingContext = vm.createContext({
    console,
    Date,
    Set,
    WING_CATALOG_MAX_PAGES: 5,
    WING_CATALOG_FORM_URL: 'https://wing.coupang.com/form',
    WING_CATALOG_SEARCH_ENDPOINT: '/search',
    WING_CATALOG_PAGE_DELAY_MS: 0,
    clampNumber: () => 1,
    collectionRuns: {
      beginWebCollection: async () => 'wing-run',
      attachTab: async () => wingCalls.push('attach'),
      requireAttention: async () => wingCalls.push('attention'),
      isCancelled: async () => wingCancelled,
    },
    stableInputFingerprint: () => 'fp64:keyword',
    getOrCreateWingCatalogTab: async () => ({ id: 41, windowId: 7 }),
    getTab: async () => null,
    waitForTabComplete: async () => ({ url: 'https://wing.coupang.com/form' }),
    isWingCatalogFormUrl: () => true,
    executeWingCatalogSearchWithRetry: async () => ({
      ok: true,
      contentType: 'application/json',
      body: { result: [] },
    }),
    resolveWingCatalogTotal: () => 0,
    normalizeWingCatalogProduct: () => null,
    sleep: async () => undefined,
    collectionSessions: {
      fail: async () => wingCalls.push('fail'),
      succeed: async () => wingCalls.push('succeed'),
    },
    removeTab: async () => wingCalls.push('remove'),
  });
  vm.runInContext(
    `${functionSource('searchWingCatalogProducts', 'searchCoupangKeywordSuggestions')}\n` +
      'globalThis.searchWing = searchWingCatalogProducts;',
    wingContext,
  );

  await wingContext.searchWing({ keyword: '문구', maxPages: 1 });
  assert.deepEqual(wingCalls, ['attach', 'succeed', 'remove']);
  wingCalls.length = 0;
  wingContext.executeWingCatalogSearchWithRetry = async () => {
    throw new Error('Wing request failed');
  };
  await assert.rejects(
    wingContext.searchWing({ keyword: '문구', maxPages: 1 }),
    /Wing request failed/,
  );
  assert.deepEqual(wingCalls, ['attach', 'fail', 'remove']);
  wingCalls.length = 0;
  await assert.rejects(
    wingContext.searchWing({
      keyword: '문구',
      maxPages: 1,
      collectionRunId: 'wing-batch',
    }),
    /Wing request failed/,
  );
  assert.deepEqual(wingCalls, ['attach', 'remove']);
  wingCalls.length = 0;
  wingContext.getOrCreateWingCatalogTab = async () => {
    wingCalls.push('create');
    return { id: 44, windowId: 7 };
  };
  wingContext.executeWingCatalogSearchWithRetry = async () => ({
    ok: true,
    contentType: 'application/json',
    body: { result: [] },
  });
  const replacement = await wingContext.searchWing({
    keyword: '문구',
    maxPages: 1,
    collectionRunId: 'wing-batch',
    collectionTabId: 41,
  });
  assert.equal(replacement.success, true);
  assert.equal(replacement.tabId, 44);
  assert.deepEqual(wingCalls, ['create', 'attach']);
  wingCalls.length = 0;
  wingCancelled = false;
  wingContext.executeWingCatalogSearchWithRetry = async () => {
    wingCancelled = true;
    return {
      ok: true,
      contentType: 'application/json',
      body: { result: [] },
    };
  };
  const cancelledWing = await wingContext.searchWing({
    keyword: '문구',
    maxPages: 1,
  });
  assert.equal(cancelledWing.cancelled, true);
  assert.deepEqual(wingCalls, ['create', 'attach']);

  const suggestionCalls = [];
  let suggestionCancelled = false;
  const suggestionContext = vm.createContext({
    console,
    Date,
    clampNumber: () => 20,
    collectionRuns: {
      beginWebCollection: async () => 'keyword-run',
      attachTab: async () => suggestionCalls.push('attach'),
      requireAttention: async () => suggestionCalls.push('attention'),
      isCancelled: async () => suggestionCancelled,
    },
    stableInputFingerprint: () => 'fp64:keyword',
    getOrCreateCoupangSearchTab: async () => ({ id: 42, windowId: 7 }),
    waitForTabComplete: async () => ({ url: 'https://www.coupang.com/np/search' }),
    buildCoupangSearchUrl: () => 'https://www.coupang.com/np/search',
    isCoupangSearchUrl: () => true,
    sleep: async () => undefined,
    COUPANG_KEYWORD_SEARCH_DELAY_MS: 0,
    executeCoupangKeywordSuggestionSearch: async () => ({
      success: true,
      items: [],
      productNameTokens: [],
    }),
    collectionSessions: {
      fail: async () => suggestionCalls.push('fail'),
      succeed: async () => suggestionCalls.push('succeed'),
    },
    removeTab: async () => suggestionCalls.push('remove'),
  });
  vm.runInContext(
    `${functionSource('searchCoupangKeywordSuggestions', 'getOrCreateCoupangSearchTab')}\n` +
      'globalThis.searchSuggestions = searchCoupangKeywordSuggestions;',
    suggestionContext,
  );

  await suggestionContext.searchSuggestions({ keyword: '문구' });
  assert.deepEqual(suggestionCalls, ['attach', 'succeed', 'remove']);
  suggestionCalls.length = 0;
  suggestionContext.executeCoupangKeywordSuggestionSearch = async () => {
    throw new Error('Coupang request failed');
  };
  await assert.rejects(
    suggestionContext.searchSuggestions({ keyword: '문구' }),
    /Coupang request failed/,
  );
  assert.deepEqual(suggestionCalls, ['attach', 'fail', 'remove']);
  suggestionCalls.length = 0;
  suggestionCancelled = false;
  suggestionContext.executeCoupangKeywordSuggestionSearch = async () => {
    suggestionCancelled = true;
    return { success: true, items: [], productNameTokens: [] };
  };
  const cancelledSuggestion = await suggestionContext.searchSuggestions({
    keyword: '문구',
  });
  assert.equal(cancelledSuggestion.cancelled, true);
  assert.deepEqual(suggestionCalls, ['attach']);

  const rankCalls = [];
  let rankCancelled = false;
  let cancelRankOnSucceed = false;
  const rankContext = vm.createContext({
    console,
    clampNumber: () => 1,
    COUPANG_RANK_MAX_PAGES: 3,
    collectionRuns: {
      beginWebCollection: async () => 'rank-run',
      isCancelled: async () => rankCancelled,
      requireAttention: async () => rankCalls.push('attention'),
    },
    stableInputFingerprint: () => 'fp64:keyword',
    captureCoupangKeywordSerp: async () => ({
      success: true,
      tabId: 43,
      pagesScanned: 1,
      items: [],
    }),
    collectionSessions: {
      fail: async () => rankCalls.push('fail'),
      succeed: async () => {
        rankCalls.push('succeed');
        if (cancelRankOnSucceed) {
          rankCancelled = true;
          return { status: 'cancelled' };
        }
        return { status: 'succeeded' };
      },
    },
    removeTab: async () => rankCalls.push('remove'),
    getAuthToken: async () => null,
  });
  vm.runInContext(
    `${functionSource('checkCoupangKeywordRank', 'startCoupangKeywordRankCheck')}\n` +
      'globalThis.checkRank = checkCoupangKeywordRank;',
    rankContext,
  );

  await rankContext.checkRank({ keyword: '문구', post: false });
  assert.deepEqual(rankCalls, ['succeed', 'remove']);
  rankCalls.length = 0;
  rankCancelled = false;
  cancelRankOnSucceed = true;
  const terminalCancelledRank = await rankContext.checkRank({
    keyword: '문구',
    post: false,
  });
  assert.equal(terminalCancelledRank.cancelled, true);
  assert.deepEqual(rankCalls, ['succeed']);
  rankCalls.length = 0;
  cancelRankOnSucceed = false;
  rankCancelled = true;
  rankContext.captureCoupangKeywordSerp = async () => ({
    success: false,
    tabId: 43,
    wall: 'captcha',
    error: 'captcha',
  });
  const cancelledRank = await rankContext.checkRank({ keyword: '문구' });
  assert.equal(cancelledRank.cancelled, true);
  assert.deepEqual(rankCalls, []);
});

test('seller same-run restart requires the exact persisted stable seller owner', async () => {
  const calls = [];
  const context = vm.createContext({
    console,
    Date,
    COMPETITOR_SELLER_CATALOG_STATUS_KEY: 'seller-status',
    getStorage: async () => ({}),
    fetchCoupangCompetitorSellerTargets: async () => [
      {
        sellerId: 'seller-b',
        sellerName: '판매자 B',
        sellerStoreUrl: 'https://www.coupang.com/np/products/brand-shop',
      },
    ],
    isCoupangSellerStoreUrl: () => true,
    collectionSessions: {
      get: async () => ({
        producer: 'advertising.competitor_catalog',
        restartStrategy: 'web',
        inputIdentity: { sellerId: 'seller-a' },
      }),
    },
    collectionRuns: {
      createRunId: () => 'fresh-run',
      beginWebCollection: async () => calls.push('begin'),
    },
    chrome: { storage: { local: { set: async () => calls.push('status') } } },
    runCoupangCompetitorSellerCatalogCollection: () => Promise.resolve(),
  });
  vm.runInContext(
    `${functionSource('canRestartStoredDomainRun', 'stableInputFingerprint')}\n` +
    `${functionSource('startCoupangCompetitorSellerCatalogCollection', 'runCoupangCompetitorSellerCatalogCollection')}\n` +
      'globalThis.startSeller = startCoupangCompetitorSellerCatalogCollection;',
    context,
  );

  await assert.rejects(
    context.startSeller({
      sellerId: 'seller-b',
      runId: '11111111-1111-4111-8111-111111111111',
    }),
    /seller owner/i,
  );
  assert.deepEqual(calls, []);

  context.collectionSessions.get = async () => ({
    producer: 'advertising.competitor_catalog',
    restartStrategy: 'web',
    inputIdentity: {},
  });
  await assert.rejects(
    context.startSeller({
      sellerId: 'seller-b',
      runId: '11111111-1111-4111-8111-111111111111',
    }),
    /seller owner/i,
  );
  assert.deepEqual(calls, []);
});

test('seller target lookup failures terminate the newly prepared generic session', async () => {
  for (const lookup of ['missing', 'error']) {
    const calls = [];
    const context = vm.createContext({
      console,
      Date,
      COMPETITOR_SELLER_CATALOG_STATUS_KEY: 'seller-status',
      getStorage: async () => ({}),
      fetchCoupangCompetitorSellerTargets: async () => {
        if (lookup === 'error') throw new Error('target lookup failed');
        return [];
      },
      isCoupangSellerStoreUrl: () => true,
      collectionSessions: {
        fail: async () => calls.push('fail'),
      },
      collectionRuns: {
        createRunId: () => 'seller-run',
        beginWebCollection: async () => 'seller-run',
        isCancelled: async () => false,
      },
      requestCoupangCompetitorCatalogCancellation: async () =>
        calls.push('cancel-owner'),
      chrome: { storage: { local: { set: async () => calls.push('status') } } },
      runCoupangCompetitorSellerCatalogCollection: () => {
        calls.push('runner');
        return Promise.resolve();
      },
    });
    vm.runInContext(
      `${functionSource('canRestartStoredDomainRun', 'stableInputFingerprint')}\n` +
      `${functionSource('startCoupangCompetitorSellerCatalogCollection', 'runCoupangCompetitorSellerCatalogCollection')}\n` +
        'globalThis.startSeller = startCoupangCompetitorSellerCatalogCollection;',
      context,
    );

    if (lookup === 'error') {
      await assert.rejects(
        context.startSeller({ sellerId: 'seller-a' }),
        /target lookup failed/,
      );
    } else {
      const result = await context.startSeller({ sellerId: 'seller-a' });
      assert.equal(result.success, false);
    }
    assert.deepEqual(calls, ['fail']);
  }
});

test('interactive focus helper requires a deliberate user-action reason', async () => {
  const helperPath = path.join(extensionRoot, 'background/interactive-tabs.js');
  const calls = { create: [], update: [], focus: [] };
  const chrome = {
    runtime: { lastError: null },
    tabs: {
      create(properties, callback) {
        calls.create.push(properties);
        callback({ id: 41, windowId: 7 });
      },
      update(tabId, properties, callback) {
        calls.update.push({ tabId, properties });
        callback({ id: tabId, windowId: 7 });
      },
    },
    windows: {
      update(windowId, properties, callback) {
        calls.focus.push({ windowId, properties });
        callback({ id: windowId });
      },
    },
  };
  const context = vm.createContext({ chrome, console });
  vm.runInContext(fs.readFileSync(helperPath, 'utf8'), context, {
    filename: helperPath,
  });
  const interactive = context.KidItemInteractiveTabs.create({ chrome });
  const reason = context.KidItemInteractiveTabs.reasons.PRODUCT_EDIT;

  await assert.rejects(
    interactive.createTab({ url: 'https://wing.coupang.com', reason: 'batch' }),
    /interactive reason/i,
  );
  const tab = await interactive.createTab({
    url: 'https://wing.coupang.com',
    reason,
  });
  await interactive.focusTab(tab.id, reason);

  assert.deepEqual(JSON.parse(JSON.stringify(calls.create)), [
    { url: 'https://wing.coupang.com', active: true },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.update)), [
    { tabId: 41, properties: { active: true } },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.focus)), [
    { windowId: 7, properties: { focused: true } },
  ]);
  assert.match(worker, /interactiveTabs\.createTab/);
  assert.match(worker, /interactiveTabs\.focusTab/);
});
