import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { MERGED_EXTENSION_VERSION } from '../helpers/domain-worker-modules.mjs';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const extensionRoot = path.join(repoRoot, 'extensions/kiditem-os');
const worker = fs.readFileSync(
  path.join(extensionRoot, 'background/coupang/worker.js'),
  'utf8',
);
const catalog = fs.readFileSync(
  path.join(extensionRoot, 'background/coupang/coupang-catalog-import.js'),
  'utf8',
);
const collectionWindowSource = fs.readFileSync(
  path.join(extensionRoot, 'background/coupang/collection-window.js'),
  'utf8',
);
const collectionRunsSource = fs.readFileSync(
  path.join(extensionRoot, 'background/coupang/collection-runs.js'),
  'utf8',
);
const profitabilitySourceOwner = fs.readFileSync(
  path.join(extensionRoot, 'background/coupang/profitability-source-owner.js'),
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

// 확장 병합 후 의존 모듈 로드는 통합 서비스워커가, 도메인 공용 전역은
// worker-globals.js 가 소유한다.
test('loads the canonical session manager and focus owners before collector runtimes', () => {
  const entry = fs.readFileSync(
    path.join(extensionRoot, 'background/service-worker.js'),
    'utf8',
  );
  const at = (file) => entry.indexOf(`"${file}"`);

  assert.ok(at('collection-session.js') >= 0);
  assert.ok(at('interactive-tabs.js') > at('collection-session.js'));
  assert.ok(at('worker-globals.js') > at('interactive-tabs.js'));
  assert.ok(at('coupang/collection-window.js') > at('worker-globals.js'));
  assert.ok(at('coupang/profitability-source-owner.js') > at('coupang/collection-window.js'));
  assert.ok(at('coupang/coupang-catalog-import.js') > at('coupang/collection-window.js'));
  assert.ok(at('coupang/worker.js') > at('coupang/coupang-catalog-import.js'));
  assert.doesNotMatch(worker, /^importScripts\(/m);

  const globals = fs.readFileSync(
    path.join(extensionRoot, 'background/worker-globals.js'),
    'utf8',
  );
  assert.match(globals, /storageKey:\s*["']kiditem_collection_sessions["']/);
  assert.match(
    globals,
    /const KIDITEM_WEB_URL_PATTERNS = \[[\s\S]*?["']http:\/\/localhost:3000\/\*["'][\s\S]*?["']http:\/\/kiditem-office\/\*["'][\s\S]*?\]/,
  );
  // 쿠팡 도메인은 requiresAuth 가 달라 자기 환경 컨텍스트를 따로 만든다.
  assert.match(worker, /const adsEnvironmentContext = KidItemEnvironmentContext\.create\(/);
});

// 세 도메인 워커가 각자 응답하면 같은 메시지에 경쟁 응답이 된다. 공통 액션은
// external-dispatch.js 만 처리하고, 쿠팡 워커는 자기 액션만 남긴다.
test('handles generic collection controls before producer actions', () => {
  const dispatchSource = fs.readFileSync(
    path.join(extensionRoot, 'background/external-dispatch.js'),
    'utf8',
  );
  assert.ok(worker.indexOf('msg.action === "scrapeTargets"') >= 0);
  assert.match(worker, /KidItemDomains\.register\(/);
  assert.match(worker, /producerPrefixes:\s*\["advertising",\s*"channels",\s*"dashboard"\]/);
  for (const action of [
    'listCollectionSessions',
    'getCollectionSession',
    'cancelCollectionSession',
    'openCollectionAttentionTab',
  ]) {
    assert.match(dispatchSource, new RegExp(`["']${action}["']`));
    assert.doesNotMatch(worker, new RegExp(`msg\\.action === ["']${action}["']`));
  }
  assert.match(collectionRunsSource, /restartStrategy !== ["']extension["']/);
  assert.match(collectionRunsSource, /reason:\s*["']manual_confirmation["']/);
  // 취소 구현은 그대로 쿠팡 도메인이 갖고, 레지스트리를 통해 dispatch 가 부른다.
  assert.match(
    worker,
    /cancelCollectionSession:[\s\S]*collectionRuns\s*\n?\s*\.cancel\(runId, environmentId\)[\s\S]*collectionSessions\.getOwned\(runId, environmentId\)/,
  );
  assert.match(
    worker,
    /restartCollectionSession:[\s\S]*collectionRuns\.restart\(runId, environmentId\)/,
  );
});

test('acknowledges scrape target runs before asynchronous session preparation', () => {
  const handler = worker.slice(
    worker.indexOf('if (msg.action === "scrapeTargets")'),
    worker.indexOf('if (msg.action === "getBatchScrapeStatus")'),
  );
  const acknowledgement = handler.indexOf('sendResponse({');
  const preparation = handler.indexOf('prepareScrapeTargets(');
  assert.ok(acknowledgement >= 0 && acknowledgement < preparation);
  assert.match(handler, /return false;/);
});

test('persists only allowlisted Coupang producers and advertises the capability', () => {
  const producerSources = `${worker}\n${collectionRunsSource}\n${profitabilitySourceOwner}`;
  for (const producer of [
    'dashboard.wing_sales',
    'dashboard.coupang_ads',
    'dashboard.coupang_products',
    'dashboard.wing_kpi',
    'advertising.ad_sync',
    'advertising.profitability_import',
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
  assert.equal(manifest.version, MERGED_EXTENSION_VERSION);
  assert.match(worker, /wingFormPortV1:\s*true/);
  assert.match(worker, /kiditem-wing-form-v1/);
  assert.match(
    worker,
    /function handleWingFormPort[\s\S]*registerToWingForm\(message\)[\s\S]*port\.postMessage/,
  );
  assert.match(
    worker,
    /externalPorts:[\s\S]*WING_FORM_PORT_NAME[\s\S]*handleWingFormPort\(port\)/,
  );
  const dispatchSource = fs.readFileSync(
    path.join(extensionRoot, 'background/external-dispatch.js'),
    'utf8',
  );
  assert.match(dispatchSource, /onConnectExternal\?\.addListener\(handlePort\)/);
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
  assert.match(worker, /collectionWindowFor\(environmentId\)[\s\S]*?\.collectTargets/);
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
  assert.match(catalog, /clearAlarm\(dependencies\)/);
});

test('automatic collectors never reuse or navigate a user-active tab', () => {
  assert.match(worker, /before\?\.active && options\.allowActive !== true/);
  assert.match(worker, /throw new Error\(["']active user tab is collection-protected["']\)/);
  assert.doesNotMatch(worker, /\.catch\(\(\) => reusableTab\)/);
  assert.match(catalog, /dependencies\.collectionWindow\.getOrCreate\(\s*state\.attemptId/);
  assert.match(catalog, /dependencies\.collectionWindow\.navigate\(\s*state\.attemptId/);
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

test('single Wing catalog search declares stable collection mode and opaque input ownership', () => {
  const source = functionSource('searchWingCatalogProducts', 'searchCoupangKeywordSuggestions');
  assert.match(source, /collectionMode:\s*["']single_catalog["']/);
  assert.match(source, /keywordFingerprint:\s*stableInputFingerprint\(keyword\)/);
  assert.match(source, /\["collectionMode",\s*"keywordFingerprint"\]/);
});

test('scrape-target web restarts bind the run to a stable target owner', () => {
  const context = vm.createContext({
    stableInputFingerprint: (value) => `hash:${value}`,
  });
  vm.runInContext(
    `${functionSource('stableScrapeTargetFingerprint', 'stableInputFingerprint')}\n` +
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

test('competitor cancellation retains its domain owner', () => {
  assert.match(worker, /cancelCompetitorCatalog:\s*requestCoupangCompetitorCatalogCancellation/);
  assert.doesNotMatch(worker, /runCoupangCompetitorSellerCatalog/);
  assert.match(worker, /status:\s*"cancelled"/);
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
      attachTab: async () => wingCalls.push('attach'),
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
});

test('retires the web-origin competitor seller collector and routes direct collection to its source owner', () => {
  assert.doesNotMatch(worker, /runCoupangCompetitorSellerCatalog/);
  assert.doesNotMatch(worker, /startCoupangCompetitorSellerCatalogCollection/);
  assert.match(worker, /collectAdvertisingCompetitorCatalog:\s*\{/);
  assert.doesNotMatch(worker, /advertising\.collect_competitor_catalog/);
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

test('keyword source progress uses the canonical attempt identity without local terminal state', () => {
  const collection = functionSource('searchCoupangKeywordSuggestions', 'getOrCreateCoupangSearchTab');
  assert.match(collection, /collectionSessions\.start\(\{\s*attemptId:\s*runId/);
  assert.doesNotMatch(collection, /collectionSessions\.(succeed|fail)\(/);
  assert.doesNotMatch(collection, /collectionRuns\.beginWebCollection\(/);
});
