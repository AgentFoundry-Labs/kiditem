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
const wingUnified = fs.readFileSync(
  path.join(extensionRoot, 'content/coupang/wing-unified.js'),
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
const sourceOwnerManifest = fs.readFileSync(
  path.join(extensionRoot, 'background/source-owner-manifest.js'),
  'utf8',
);
const manifest = JSON.parse(
  fs.readFileSync(path.join(extensionRoot, 'manifest.json'), 'utf8'),
);

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
  // KID-354: the Wing catalog runs in the TypeScript operation runtime, not as an old module.
  assert.equal(at('coupang/coupang-catalog-import.js'), -1);
  assert.ok(at('coupang/worker.js') > at('coupang/profitability-source-owner.js'));
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

  const wingContentScript = (manifest.content_scripts ?? []).find((entry) =>
    (entry.matches ?? []).includes('https://wing.coupang.com/*') &&
    (entry.js ?? []).includes('content/coupang/wing-unified.js'),
  );
  assert.ok(wingContentScript, 'Wing unified content script must be declared');
  assert.ok(
    wingContentScript.js.indexOf('content/coupang/wing-read-api.js') >= 0 &&
      wingContentScript.js.indexOf('content/coupang/wing-read-api.js') <
        wingContentScript.js.indexOf('content/coupang/wing-unified.js'),
    'Wing read API must load before the unified content script',
  );
});

// 세 도메인 워커가 각자 응답하면 같은 메시지에 경쟁 응답이 된다. 공통 액션은
// external-dispatch.js 만 처리하고, 쿠팡 워커는 source-owner 액션만 남긴다.
test('retires the generic scrape ingress before producer actions', () => {
  const dispatchSource = fs.readFileSync(
    path.join(extensionRoot, 'background/external-dispatch.js'),
    'utf8',
  );
  assert.equal(worker.indexOf('msg.action === "scrapeTargets"'), -1);
  assert.equal(worker.indexOf('msg.action === "getBatchScrapeStatus"'), -1);
  assert.equal(worker.indexOf('msg.action === "cancelBatchScrape"'), -1);
  assert.equal(worker.indexOf('msg.action === "triggerAutoScrape"'), -1);
  assert.doesNotMatch(worker, /function autoScrape\(/);
  assert.doesNotMatch(worker, /alarmName\(["']auto-scrape["']/);
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
  assert.doesNotMatch(collectionRunsSource, /restartStrategy/);
  assert.doesNotMatch(collectionRunsSource, /manual_confirmation/);
  // 취소는 producer별 source owner가 server FAILED를 커밋한 뒤 local control을 정리한다.
  assert.doesNotMatch(worker, /collectionRuns\s*\n?\s*\.cancel\(/);
  assert.doesNotMatch(collectionRunsSource, /abortOperationSession/);
  assert.match(worker, /session\?\.producer === "advertising\.ad_sync"[\s\S]*adCampaignSourceOwner\.cancel/);
  assert.match(worker, /session\?\.producer === "advertising\.ad_keyword"[\s\S]*adKeywordSourceOwner\.cancel/);
  assert.match(worker, /session\?\.producer === WING_TRAFFIC_PRODUCER[\s\S]*wingTrafficSourceOwner\.cancel/);
  assert.match(worker, /session\?\.producer === WING_ITEMWINNER_PRODUCER[\s\S]*wingItemwinnerSourceOwner\.cancel/);
  assert.match(worker, /Collection producer source owner does not support cancellation/);
  assert.doesNotMatch(worker, /restartCollectionSession/);
  assert.doesNotMatch(worker, /function handleScrapeTargets\(/);
  assert.doesNotMatch(worker, /function prepareScrapeTargets\(/);
  assert.doesNotMatch(worker, /FromPopup|monthlyScrape|beginSourceOwnerAttempt/);
  assert.doesNotMatch(wingUnified, /syncToServer/);
});

test('starts window collections only through the collection start contract', () => {
  assert.match(worker, /startCollection:\s*\{/);
  for (const retired of [
    'collectAdvertisingWingTraffic',
    'collectAdvertisingWingItemwinner',
    'collectAdvertisingCampaigns',
    'collectAdvertisingKeywords',
    'collectAdvertisingProfitability',
    'cancelAdvertisingCampaigns',
    'cancelAdvertisingKeywords',
    'cancelAdvertisingWingTraffic',
    'cancelAdvertisingWingItemwinner',
  ]) {
    assert.doesNotMatch(worker, new RegExp(`\\b${retired}:`), retired);
  }
});

test('retires the advertising account-day KPI owner from every extension surface', () => {
  const retired = /ad-account-daily-kpi|ad_account_daily_kpi|accountDailyKpi|account_daily_kpi|account-daily-kpis|coupang_ads_daily|dashboard\.coupang_ads|accountDailySync|계정 일별/i;
  const read = (file) => fs.readFileSync(path.join(extensionRoot, file), 'utf8');
  const surfaces = {
    'background/service-worker.js': read('background/service-worker.js'),
    'background/source-owner-manifest.js': sourceOwnerManifest,
    'background/coupang/worker.js': worker,
    'background/coupang/ad-center-collector.js': read('background/coupang/ad-center-collector.js'),
    'content/coupang/ads-report.js': read('content/coupang/ads-report.js'),
    'popup/popup.js': read('popup/popup.js'),
    'popup/popup.html': read('popup/popup.html'),
    'manifest.json': JSON.stringify(manifest),
  };
  for (const [name, text] of Object.entries(surfaces)) {
    assert.doesNotMatch(text, retired, name);
  }
  assert.equal(
    fs.existsSync(path.join(extensionRoot, 'background/coupang/ad-account-daily-kpi-source-owner.js')),
    false,
  );
});

test('persists only allowlisted Coupang producers and advertises the capability', () => {
  const producerSources = `${sourceOwnerManifest}\n${worker}\n${collectionRunsSource}\n${profitabilitySourceOwner}`;
  for (const producer of [
    'dashboard.wing_sales',
    'dashboard.coupang_products',
    'dashboard.wing_kpi',
    'advertising.ad_sync',
    'advertising.profitability_import',
    'channels.coupang_catalog',
  ]) {
    assert.match(producerSources, new RegExp(producer.replace('.', '\\.')));
  }
  assert.match(worker, /browserCollectionSessions:\s*true/);
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

test('source capture policies share the environment-owned resource without a universal target loop', () => {
  // Runtime serialization, teardown, retry and progress behavior are covered
  // through the production resource and named collector interfaces.
  assert.match(worker, /KidItemAdCenterCollector\.create\(\{\s*window: collectionWindows\[environmentId\]/);
  assert.match(worker, /KidItemWingReportCollector\.create\(\{\s*window: collectionWindows\[environmentId\]/);
  for (const method of ['collectCampaigns', 'collectKeywords', 'collectProfitabilitySlice', 'collectTraffic', 'collectItemwinner']) {
    assert.match(worker, new RegExp(`\\.${method}\\(`));
  }
  assert.doesNotMatch(worker, /\.collectTargets\(/);
  assert.doesNotMatch(collectionWindowSource, /sessions\.(progress|succeed|fail|cancel)\(/);
  assert.doesNotMatch(collectionWindowSource, /manualSync|targetDate|statusKey|cancelKey/);
  assert.match(worker, /\.reportProgress\(\{/);
  assert.doesNotMatch(worker, /session\.status/);
  assert.doesNotMatch(worker, /reportBatchScrapeDone/);
});

test('automatic collectors contain no direct focus primitives', () => {
  for (const [name, source] of [
    ['service worker', worker],
  ]) {
    assert.doesNotMatch(source, /active:\s*true/, `${name} activates a tab directly`);
    assert.doesNotMatch(source, /focused:\s*true/, `${name} focuses a window directly`);
    assert.doesNotMatch(source, /\bactivateTab\s*\(/, `${name} uses legacy activateTab`);
  }
});

test('automatic collectors never reuse or navigate a user-active tab', () => {
  assert.match(worker, /before\?\.active && options\.allowActive !== true/);
  assert.match(worker, /throw new Error\(["']active user tab is collection-protected["']\)/);
  assert.doesNotMatch(worker, /\.catch\(\(\) => reusableTab\)/);
});

test('legacy batch controls are no longer exposed beside source-owner cancellation', () => {
  assert.doesNotMatch(worker, /function cancelBatchScrape\(/);
  assert.doesNotMatch(worker, /function autoScrape\(/);
  assert.match(worker, /cancelCollectionSession\(runId, environmentId\)/);
  assert.doesNotMatch(worker, /collectionWindowFor\(environmentId\)\.cancelRun/);
  assert.doesNotMatch(worker, /collectionSessions\.remove/);
});

test('keyword and competitor collection run only as runtime operation kinds (KID-362)', () => {
  assert.doesNotMatch(worker, /runCoupangCompetitorSellerCatalog/);
  assert.doesNotMatch(worker, /startCoupangCompetitorSellerCatalogCollection/);
  for (const action of ['collectAdvertisingCompetitorCatalog', 'collectAdvertisingSellerIdentities', 'collectAdvertisingWingRankBatch', 'collectAdvertisingKeywordSerpBatch', 'collectAdvertisingTrackedWingProducts']) {
    assert.doesNotMatch(worker, new RegExp(`${action}:\\s*\\{`), action);
  }
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
